/*
 * Client-side verification demonstration: compile the EZKL Solidity verifier
 * (Verifier.sol) with solc 0.8.20 and verify an EZKL KZG proof entirely
 * client-side by executing the verifier bytecode in an in-memory EVM
 * (@ethereumjs/evm via @ezkljs/verify).
 *
 * Usage: node verify-in-browser.js [proof.json]
 * The proof was produced by the EZKL 23.0.5 prover (this repo's pipeline).
 */
const solc = require('solc');
const fs = require('fs');
const path = require('path');
const localEVMVerify = require('@ezkljs/verify').default;

const proofPath = process.argv[2] || path.join(__dirname, 'proof.json');
const solPath = path.join(__dirname, '..', 'blockchain-verifier', 'Verifier.sol');
const abiPath = path.join(__dirname, '..', 'blockchain-verifier', 'Verifier.abi');

const source = fs.readFileSync(solPath, 'utf8');
const runs = Number(process.env.RUNS || 200);
const viaIR = process.env.VIAIR !== '0';
const input = {
  language: 'Solidity',
  sources: { 'Verifier.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: runs },
    viaIR: viaIR,
    outputSelection: { '*': { '*': ['evm.bytecode.object'] } },
  },
};

const t0 = Date.now();
const out = JSON.parse(solc.compile(JSON.stringify(input)));
console.log('compile_ms', Date.now() - t0);
const errors = (out.errors || []).filter(e => e.severity === 'error');
if (errors.length > 0) {
  console.error('compile errors:\n' + errors.map(e => e.formattedMessage).join('\n'));
  process.exit(1);
}
const contract = out.contracts['Verifier.sol']['Halo2Verifier'];
const bytecode = '0x' + contract.evm.bytecode.object;
console.log('verifier_bytecode_len', bytecode.length);

const proofJson = fs.readFileSync(proofPath, 'utf8');
(async () => {
  const t1 = Date.now();
  const result = await localEVMVerify(proofJson, bytecode);
  console.log('CLIENT_SIDE_VERIFY_RESULT', result);
  console.log('verify_ms', Date.now() - t1);
  process.exit(result ? 0 : 1);
})().catch(e => {
  console.error('CLIENT_SIDE_VERIFY_ERROR', e && e.message ? e.message : String(e));
  process.exit(1);
});