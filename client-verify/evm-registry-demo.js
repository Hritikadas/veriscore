/*
 * Phase 4 - Solidity/EVM experiments: ProofRegistry (Deployer.sol) that maps
 * a verification-key digest to a deployed Halo2Verifier and forwards
 * verification calls. Both contracts compiled with solc 0.8.20 (viaIR=false,
 * runs=1), deployed into the in-memory EVM, proof verified THROUGH the
 * registry.
 *
 * Inputs (from the pipeline / Phase 3):
 *   - blockchain-verifier/Verifier.sol        (ezkl.create_evm_verifier)
 *   - blockchain-verifier/Deployer.sol        (ProofRegistry, this demo)
 *   - client-verify/calldata.hex               (ezkl.encode_evm_calldata)
 *   - client-verify/verifying.key              (VK source for the digest)
 */
const fs = require('fs');
const path = require('path');

// ---- polyfill @ethereumjs/util@9 missing keccak256 BEFORE loading vm/evm ----
const utilMod = require('@ethereumjs/util');
const { keccak_256 } = require('@noble/hashes/sha3');
utilMod.keccak256 = (data) => keccak_256(typeof data === 'string' ? Buffer.from(data) : data);

const solc = require('solc');
const { VM } = require('@ethereumjs/vm');
const { EVM } = require('@ethereumjs/evm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { LegacyTransaction } = require('@ethereumjs/tx');
const { Address, hexToBytes, Account } = require('@ethereumjs/util');
const { ethers } = require('ethers');

const ROOT = path.join(__dirname, '..');
const SOL_DIR = path.join(ROOT, 'blockchain-verifier');
const CACHE_DIR = __dirname;

function compileSources(sources) {
  const input = { language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 1 }, viaIR: false,
                outputSelection: { '*': { '*': ['evm.bytecode.object'] } } } };
  const t0 = Date.now();
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  console.log('compile_ms', Date.now() - t0);
  const result = {};
  for (const file of Object.keys(out.contracts)) {
    for (const name of Object.keys(out.contracts[file])) {
      if (!out.contracts[file][name].evm || !out.contracts[file][name].evm.bytecode || !out.contracts[file][name].evm.bytecode.object) continue;
      result[name] = out.contracts[file][name].evm.bytecode.object;
    }
  }
  return result;
}

function verifierBytecode() {
  const cache = path.join(CACHE_DIR, 'verifier.bytecode.hex');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8').trim();
  const sources = { 'Verifier.sol': { content: fs.readFileSync(path.join(SOL_DIR, 'Verifier.sol'), 'utf8') } };
  const codes = compileSources(sources);
  fs.writeFileSync(cache, codes.Halo2Verifier);
  return codes.Halo2Verifier;
}

async function deploy(vm, common, from, data, nonce) {
  const tx = LegacyTransaction.fromTxData(
    { data: hexToBytes(data), nonce, gasLimit: BigInt(0xfffffffff), gasPrice: BigInt(10) },
    { common, allowUnlimitedInitCodeSize: true }).sign(from.pk);
  const res = await vm.runTx({ tx, skipBlockGasLimitValidation: true, skipNonce: true });
  if (res.execResult.exceptionError) throw new Error('deploy revert: ' + (res.execResult.exceptionError.error || JSON.stringify(res.execResult.exceptionError)));
  const acct = await vm.stateManager.getAccount(from.addr);
  acct.nonce += 1n;
  await vm.stateManager.putAccount(from.addr, acct);
  return res.createdAddress;
}

async function call(vm, to, from, data, gasLimit) {
  const res = await vm.evm.runCall({ to, caller: from.addr, origin: from.addr, data, gasLimit });
  if (res.execResult.exceptionError) throw new Error('call failed: ' + (res.execResult.exceptionError.error || JSON.stringify(res.execResult.exceptionError)));
  return Buffer.from(res.execResult.returnValue);
}

async function main() {
  const abi = new ethers.AbiCoder();

  const rawCalldata = new Uint8Array(fs.readFileSync(path.join(__dirname, 'calldata.hex')));
  const [proof, instances] = abi.decode(['bytes', 'uint256[]'], '0x' + Buffer.from(rawCalldata.slice(4)).toString('hex'));
  console.log('proof_bytes', proof.length, 'instances', instances.length, instances.map(i => i.toString()).join());

  const vk = fs.readFileSync(path.join(ROOT, 'artifacts', 'verifying.key'));
  const vkDigest = ethers.keccak256(vk);
  console.log('vk_digest', vkDigest);

  const verifierBc = verifierBytecode();
  console.log('verifier_bytecode_len', verifierBc.length / 2);

  const regSources = { 'Deployer.sol': { content: fs.readFileSync(path.join(SOL_DIR, 'Deployer.sol'), 'utf8') } };
  const regCodes = compileSources(regSources);
  const registryBc = regCodes.ProofRegistry;
  console.log('registry_bytecode_len', registryBc.length / 2);

  const pk = hexToBytes('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const from = { pk, addr: Address.fromPrivateKey(pk) };

  const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai,
                              customCrypto: { keccak256: keccak_256 } });
  const evm = new EVM({ allowUnlimitedContractSize: true, allowUnlimitedInitCodeSize: true });
  const vm = await VM.create({ common, evm });
  const account = new Account();
  account.balance = 0xfffffffffffffffffn;
  await vm.stateManager.putAccount(from.addr, account);

  const verifierAddr = await deploy(vm, common, from, '0x' + verifierBc, 0);
  const registryAddr = await deploy(vm, common, from, '0x' + registryBc, 1);
  console.log('verifier_deployed', verifierAddr.toString());
  console.log('registry_deployed', registryAddr.toString());

  const regAbi = ['function register(bytes32,address) returns (bool)'];
  const regIface = new ethers.Interface(regAbi);
  const regData = regIface.encodeFunctionData('register', [vkDigest, verifierAddr.toString()]);
  let ret = await call(vm, registryAddr, from, hexToBytes(regData), BigInt(0xfffffffff));
  console.log('register_ok', (BigInt('0x' + Buffer.from(ret.slice(-32)).toString('hex')) === 1n));

  const verifyAbi = ['function verify(bytes32,bytes,uint256[]) returns (bool)'];
  const verifyIface = new ethers.Interface(verifyAbi);
  const verifyData = verifyIface.encodeFunctionData('verify', [vkDigest, proof, instances]);
  const t0 = Date.now();
  ret = await call(vm, registryAddr, from, hexToBytes(verifyData), BigInt(0xfffffffff));
  const ok = BigInt('0x' + Buffer.from(ret.slice(-32)).toString('hex')) === 1n;
  console.log('REGISTRY_VERIFY', ok, 'verify_ms', Date.now() - t0);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e.stack); console.error('REGISTRY_VERIFY_ERROR', e && e.message ? e.message : String(e)); process.exit(1); });