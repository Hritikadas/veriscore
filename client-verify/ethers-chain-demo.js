/*
 * Phase 5 - Ethers.js integration on a LOCAL chain node.
 *
 * Starts a real JSON-RPC chain node (ganache) on 127.0.0.1:8545, then through
 * ethers.js v6:
 *   1. deploys Halo2Verifier  (Verifier.sol - ezkl.create_evm_verifier)
 *   2. deploys ProofRegistry  (Deployer.sol, this demo)
 *   3. register() the vk digest -> verifier address (a real mined tx)
 *   4. verify(bytes32,bytes,uint256[]) THROUGH the registry (a real mined tx)
 *      using calldata produced by the official ezkl 23.0.5 encoder; result
 *      cross-checked via eth_call and the Verified event.
 *
 * Override the node with RPC_URL=http://host:port for any standard JSON-RPC
 * EVM chain (e.g. a public testnet) - everything else is chain-agnostic.
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const ganache = require('ganache');

const ROOT = path.join(__dirname, '..');
const SOL_DIR = path.join(ROOT, 'blockchain-verifier');

function compileSources(sources) {
  const solc = require('solc');
  const input = { language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 1 }, viaIR: false,
                outputSelection: { '*': { '*': ['evm.bytecode.object'] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const codes = {};
  for (const file of Object.keys(out.contracts))
    for (const name of Object.keys(out.contracts[file]))
      if (out.contracts[file][name].evm && out.contracts[file][name].evm.bytecode && out.contracts[file][name].evm.bytecode.object)
        codes[name] = out.contracts[file][name].evm.bytecode.object;
  return codes;
}

function verifierBytecode() {
  const cache = path.join(__dirname, 'verifier.bytecode.hex');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8').trim();
  return verifierBytecodeSlow();
}
function verifierBytecodeSlow() {
  const codes = compileSources({ 'Verifier.sol': { content: fs.readFileSync(path.join(SOL_DIR, 'Verifier.sol'), 'utf8') } });
  fs.writeFileSync(path.join(__dirname, 'verifier.bytecode.hex'), codes.Halo2Verifier);
  return codes.Halo2Verifier;
}
function registryBytecode() {
  const cache = path.join(__dirname, 'registry.bytecode.hex');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8').trim();
  const codes = compileSources({ 'Deployer.sol': { content: fs.readFileSync(path.join(SOL_DIR, 'Deployer.sol'), 'utf8') } });
  fs.writeFileSync(cache, codes.ProofRegistry);
  return codes.ProofRegistry;
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  let server = null;
  const GAS = 0x3b9aca00n; // 1,000,000,000 gas (>= verifier deploy needs; ganache default 30M is too small)
  if (!rpcUrl) {
    server = ganache.server({ logging: { quiet: true },
      chain: { chainId: 1337 }, wallet: { totalAccounts: 1 },
      miner: { blockGasLimit: 1_000_000_000 } });
    await server.listen(8545);
    console.log('local_chain ganache 127.0.0.1:8545 chain_id 1337');
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl || 'http://127.0.0.1:8545');
  const signer = await provider.getSigner(0);
  const from = await signer.getAddress();
  console.log('signer', from, 'nonce', (await provider.getTransactionCount(from)).toString());

  const abi = new ethers.AbiCoder();

  const rawCalldata = new Uint8Array(fs.readFileSync(path.join(__dirname, 'calldata.hex')));
  const [proof, instances] = abi.decode(['bytes', 'uint256[]'], '0x' + Buffer.from(rawCalldata.slice(4)).toString('hex'));
  const vkDigest = ethers.keccak256(fs.readFileSync(path.join(ROOT, 'artifacts', 'verifying.key')));
  console.log('proof_bytes', proof.length, 'instances', instances.length, instances[0].toString(), 'vk_digest', vkDigest);

  // 1 + 2. deploy both contracts
  const verifierBc = '0x' + verifierBytecode();
  const registryBc = '0x' + registryBytecode();
  const verifierTx = await signer.sendTransaction({ data: verifierBc, gasLimit: GAS });
  const verifierReceipt = await verifierTx.wait();
  const verifierAddr = verifierReceipt.contractAddress;
  console.log('verifier_deployed', verifierAddr, 'block', verifierReceipt.blockNumber.toString(), 'gas', verifierReceipt.gasUsed.toString());

  const registryTx = await signer.sendTransaction({ data: registryBc, gasLimit: GAS });
  const registryReceipt = await registryTx.wait();
  const registryAddr = registryReceipt.contractAddress;
  console.log('registry_deployed', registryAddr, 'block', registryReceipt.blockNumber.toString(), 'gas', registryReceipt.gasUsed.toString());

  const topic0 = (sig) => ethers.id(sig);
  const listenLogs = (receipt, sig) => (receipt.logs || []).filter(l => l.topics[0] === topic0(sig));

  // 3. register() - a real mined transaction
  const sel = (sig) => ethers.id(sig).slice(0, 10);
  const registerData = sel('register(bytes32,address)') + abi.encode(['bytes32', 'address'], [vkDigest, verifierAddr]).slice(2);
  const registerRes = await signer.sendTransaction({ to: registryAddr, data: registerData, gasLimit: GAS });
  const registerReceipt = await registerRes.wait();
  const registeredLogs = listenLogs(registerReceipt, 'Registered(bytes32,address)');
  console.log('register_ok', registeredLogs.length === 1, 'tx', registerRes.hash, 'block', registerReceipt.blockNumber.toString(), 'gas', registerReceipt.gasUsed.toString());

  // sanity: unknown digest must revert, known must return true
  const badData = sel('verify(bytes32,bytes,uint256[])') + abi.encode(['bytes32', 'bytes', 'uint256[]'], [ethers.ZeroHash, proof, instances]).slice(2);
  try { await provider.call({ to: registryAddr, data: badData }); console.log('unknown_digest_call_should_revert false'); }
  catch (e) { console.log('unknown_digest_call_should_revert true'); }

  // 4. verify() through the registry - cross-check eth_call first
  const verifyData = sel('verify(bytes32,bytes,uint256[])') + abi.encode(['bytes32', 'bytes', 'uint256[]'], [vkDigest, proof, instances]).slice(2);
  const callRet = await provider.call({ to: registryAddr, data: verifyData });
  const staticOk = BigInt(callRet) === 1n;
  console.log('REGISTRY_VERIFY_ETH_CALL', staticOk);

  if (staticOk) {
    const t0 = Date.now();
    const verifyTx = await signer.sendTransaction({ to: registryAddr, data: verifyData, gasLimit: GAS });
    const receipt = await verifyTx.wait();
    const verifiedLogs = listenLogs(receipt, 'Verified(bytes32,bool)');
    const verifiedResult = verifiedLogs.length === 1 && BigInt('0x' + verifiedLogs[0].data.slice(-64)) === 1n;
    console.log('REGISTRY_VERIFY_TX', verifiedResult);
    console.log('verify_tx', verifyTx.hash, 'block', receipt.blockNumber.toString(), 'gas', receipt.gasUsed.toString(), 'ms_to_mine', Date.now() - t0);
    console.log('verified_event', JSON.stringify(verifiedLogs.map(l => ({ digest: l.topics[1], result: BigInt('0x' + l.data.slice(-64)) === 1n }))));
  }

  if (server) await server.close();
  provider.destroy();
  process.exit(staticOk ? 0 : 1);
}

main().catch(e => { console.error(e.stack); console.error('CHAIN_VERIFY_ERROR', e && e.message ? e.message : String(e)); process.exit(1); });
