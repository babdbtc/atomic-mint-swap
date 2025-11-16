/**
 * Test adaptor signature generation directly
 */

import * as utils from './src/crypto/utils';
import { generateAdaptorSignature, verifyAdaptorSignature, generateAdaptorSecret } from './src/crypto/adaptor';

console.log('Testing adaptor signature generation\n');

const privkey = utils.hexToBytes('0'.repeat(63) + '1');
const pubkey = utils.getPublicKey(privkey);
const message = utils.hexToBytes('0'.repeat(64));

// Test 1: With explicit secret
console.log('Test 1: Explicit secret');
const secret1 = utils.hexToBytes('0'.repeat(63) + '2');
const sig1 = generateAdaptorSignature(privkey, message, secret1);
const verify1 = verifyAdaptorSignature(pubkey, message, sig1);
console.log(`  Valid: ${verify1.valid ? '✅' : '❌'}`);
if (!verify1.valid) console.log(`  Error: ${verify1.error}`);

// Test 2: With generateAdaptorSecret
console.log('\nTest 2: Generated secret (canonical)');
const secret2 = generateAdaptorSecret();
console.log(`  Secret: ${utils.bytesToHex(secret2).slice(0, 16)}...`);

const T2 = utils.scalarMultiplyG_Point(secret2);
console.log(`  T y-coord: ${T2.toAffine().y & 1n ? 'odd' : 'even'}`);

const sig2 = generateAdaptorSignature(privkey, message, secret2);
const verify2 = verifyAdaptorSignature(pubkey, message, sig2);
console.log(`  Valid: ${verify2.valid ? '✅' : '❌'}`);
if (!verify2.valid) console.log(`  Error: ${verify2.error}`);

// Test 3: Multiple runs
console.log('\nTest 3: Multiple runs with generated secrets');
let successes = 0;
let failures = 0;

for (let i = 0; i < 20; i++) {
  const secret = generateAdaptorSecret();
  const sig = generateAdaptorSignature(privkey, message, secret);
  const verify = verifyAdaptorSignature(pubkey, message, sig);

  if (verify.valid) {
    successes++;
  } else {
    failures++;
    if (failures <= 3) {
      console.log(`  Run ${i+1}: ❌ ${verify.error}`);
    }
  }
}

console.log(`\nResults: ${successes} successes, ${failures} failures out of 20`);
