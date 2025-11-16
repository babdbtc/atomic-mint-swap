/**
 * Test hash_to_curve to compare with Python output
 */

import { hashToCurve } from './src/crypto/bdhke';
import * as utils from './src/crypto/utils';

const testSecrets = [
  "1780e5d1a282122fbcc19e0cfdc4d9a73c1b1a2f0b7f833510ee6c26af2bf38e",
  "test_secret_123",
  '["P2PK",{"nonce":"3db7accc3ad1fb77cf58b77f00366add0804ff405cb5350a979db30734ea95c6","data":"028a4acbe44dc982f54951bed505844491e857c0cfde0e3bfdf8506bd82b6667e1","tags":[["sigflag","SIG_INPUTS"]]}]'
];

console.log("=".repeat(70));
console.log("HASH_TO_CURVE TEST (TypeScript)");
console.log("=".repeat(70));

for (const secret of testSecrets) {
  const Y = hashToCurve(secret);

  console.log(`\nSecret: ${secret.slice(0, 60)}${secret.length > 60 ? '...' : ''}`);
  console.log(`Y = hash_to_curve(secret): ${utils.bytesToHex(Y)}`);
  console.log(`Length: ${Y.length} bytes`);
}

console.log("\n" + "=".repeat(70));
console.log("Compare with Python output!");
console.log("=".repeat(70));
