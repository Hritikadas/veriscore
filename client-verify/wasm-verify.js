/*
 * Client-side (non-server) verification of an EZKL proof using EZKL's own
 * WASM engine (@ezkljs/engine).
 *
 * Runs completely outside the proving pipeline: proof, verifying key,
 * settings and SRS are loaded and verified locally. In a browser, the
 * engine's `web/` build runs the identical Wasm via Vite/browser bundlers.
 */
const fs = require('fs');
const path = require('path');
const engine = require('@ezkljs/engine');

const proofPath = process.argv[2] || path.join(__dirname, 'proof.json');

const proof = new Uint8ClampedArray(fs.readFileSync(proofPath));
const vk = new Uint8ClampedArray(fs.readFileSync(path.join(__dirname, 'verifying.key')));
const settings = new Uint8ClampedArray(fs.readFileSync(path.join(__dirname, 'settings.json')));
const srs = new Uint8ClampedArray(fs.readFileSync(path.join(__dirname, 'kzg.srs')));

console.log('engine_verify_exists', typeof engine.verify);
const t0 = Date.now();
const result = engine.verify ? engine.verify(proof, vk, settings, srs) : false;
console.log('WASM_CLIENT_SIDE_VERIFY', result);
console.log('verify_ms', Date.now() - t0);
process.exit(result ? 0 : 1);