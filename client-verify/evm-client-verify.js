/*
 * Client-side verification using the ON-CHAIN (Solidity EVM) verifier,
 * executed in an ephemeral in-memory EVM (@ethereumjs/vm) - exactly the same
 * mechanism @ezkljs/verify uses, but with calldata produced by the OFFICIAL
 * ezkl 23.0.5 encoder (encode_evm_calldata), so the proof/verifier are
 * version-matched to the pipeline that generated the proof.
 *
 * This is genuinely runnable in a browser (via Vite/browser bundlers);
 * here it runs under Node for a deterministic, testable result.
 *
 * Inputs (produced by the pipeline):
 *   - blockchain-verifier/Verifier.sol  (ezkl.create_evm_verifier)
 *   - client-verify/calldata.hex        (ezkl.encode_evm_calldata)
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');

// @ethereumjs/util@9 CJS build does not re-export keccak256; polyfill it from
// @noble/hashes (same algorithm the package's ESM build uses) BEFORE loading
// @ethereumjs/vm/tx so their destructured import sees it.
const utilMod = require('@ethereumjs/util');
const { keccak_256 } = require('@noble/hashes/sha3');
utilMod.keccak256 = (data) =>
  keccak_256(typeof data === 'string' ? Buffer.from(data) : data);

const { VM } = require('@ethereumjs/vm');
const { EVM } = require('@ethereumjs/evm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { LegacyTransaction } = require('@ethereumjs/tx');
const { Address, hexToBytes, Account } = require('@ethereumjs/util');

const ROOT = path.join(__dirname, '..');
const SOL_PATH = path.join(ROOT, 'blockchain-verifier', 'Verifier.sol');
const CALDATA_PATH = path.join(__dirname, 'calldata.hex');
const BYTECODE_CACHE = path.join(__dirname, 'verifier.bytecode.hex');

function compileVerifier() {
  const source = fs.readFileSync(SOL_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'Verifier.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 1 }, viaIR: false,
                outputSelection: { '*': { '*': ['evm.bytecode.object'] } } },
  };
  const t0 = Date.now();
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  console.log('compile_ms', Date.now() - t0);
  return out.contracts['Verifier.sol']['Halo2Verifier'].evm.bytecode.object;
}

async function main() {
  let bytecode;
  if (fs.existsSync(BYTECODE_CACHE)) {
    bytecode = fs.readFileSync(BYTECODE_CACHE, 'utf8').trim();
  } else {
    bytecode = compileVerifier();
    fs.writeFileSync(BYTECODE_CACHE, bytecode);
  }
  console.log('verifier_bytecode_len', bytecode.length / 2);

  const calldata = new Uint8Array(fs.readFileSync(CALDATA_PATH));
  console.log('calldata_bytes', calldata.length, 'selector',
              Buffer.from(calldata.slice(0, 4)).toString('hex'));

  const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai,
                              customCrypto: { keccak256: keccak_256 } });
  const evm = new EVM({ allowUnlimitedContractSize: true, allowUnlimitedInitCodeSize: true });
  const vm = await VM.create({ common, evm });

  const pk = hexToBytes('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const address = Address.fromPrivateKey(pk);
  const account = new Account();
  account.balance = 0xfffffffffffffffffn;
  await vm.stateManager.putAccount(address, account);

  const deployData = hexToBytes('0x' + bytecode);
  const txData = { data: deployData, nonce: 0, gasLimit: BigInt(0xfffffffff), gasPrice: BigInt(10) };
  const tx = LegacyTransaction.fromTxData(txData, { common, allowUnlimitedInitCodeSize: true }).sign(pk);
  const t0 = Date.now();
  const dep = await vm.runTx({ tx, skipBlockGasLimitValidation: true, skipNonce: true });
  if (dep.execResult.exceptionError) throw new Error('deploy revert: ' + (dep.execResult.exceptionError.error || JSON.stringify(dep.execResult.exceptionError)));
  const verifierAddress = dep.createdAddress;
  console.log('verifier_deployed', verifierAddress.toString(), 'ms', Date.now() - t0);

  const gasLimit = BigInt(0x3d0900);
  const t1 = Date.now();
  const call = await vm.evm.runCall({
    to: verifierAddress, caller: address, origin: address,
    data: calldata, gasLimit,
  });
  if (call.execResult.exceptionError) throw new Error('verify call failed: ' + call.execResult.exceptionError.error);
  const ret = call.execResult.returnValue;
  const tail = ret.length >= 32 ? Buffer.from(ret.slice(ret.length - 32)) : Buffer.alloc(0);
  const ok = ret.length >= 32 && BigInt('0x' + tail.toString('hex')) === 1n;
  console.log('CLIENT_SIDE_EVM_VERIFY', ok);
  console.log('verify_ms', Date.now() - t1, 'gas_used', (call.execResult.gasUsed ?? call.gasUsed ?? 0n).toString());
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e.stack); console.error('CLIENT_SIDE_EVM_VERIFY_ERROR', e && e.message ? e.message : String(e)); process.exit(1); });