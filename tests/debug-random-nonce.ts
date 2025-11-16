/**
 * Debug with random nonce like the actual implementation
 */

import * as adaptor from './src/crypto/adaptor';
import * as utils from './src/crypto/utils';

console.log('🔍 Testing with random nonce\n');

// Use same simple inputs but let function generate nonce
const privkey = utils.hexToBytes('0'.repeat(63) + '1');
const message = utils.hexToBytes('0'.repeat(64));
const secret = utils.hexToBytes('0'.repeat(63) + '2');
const pubkey = utils.getPublicKey(privkey);

console.log('Test 1: With explicit nonce');
const nonce1 = utils.hexToBytes('0'.repeat(63) + '3');
const sig1 = adaptor.generateAdaptorSignature(privkey, message, secret, nonce1);
const verify1 = adaptor.verifyAdaptorSignature(pubkey, message, sig1);
console.log(`  Generated: s'=${utils.bytesToHex(sig1.s_prime).slice(0, 16)}...`);
console.log(`  Valid: ${verify1.valid}`);
if (!verify1.valid) console.log(`  Error: ${verify1.error}`);

console.log('\nTest 2: With random nonce (attempt 1)');
const sig2 = adaptor.generateAdaptorSignature(privkey, message, secret);
const verify2 = adaptor.verifyAdaptorSignature(pubkey, message, sig2);
console.log(`  Generated: s'=${utils.bytesToHex(sig2.s_prime).slice(0, 16)}...`);
console.log(`  Valid: ${verify2.valid}`);
if (!verify2.valid) console.log(`  Error: ${verify2.error}`);

console.log('\nTest 3: With random nonce (attempt 2)');
const sig3 = adaptor.generateAdaptorSignature(privkey, message, secret);
const verify3 = adaptor.verifyAdaptorSignature(pubkey, message, sig3);
console.log(`  Generated: s'=${utils.bytesToHex(sig3.s_prime).slice(0, 16)}...`);
console.log(`  Valid: ${verify3.valid}`);
if (!verify3.valid) console.log(`  Error: ${verify3.error}`);

// Let's also check if random nonce generation itself is valid
console.log('\nChecking random nonce generation:');
for (let i = 0; i < 5; i++) {
  const randomNonce = utils.generatePrivateKey();
  const isValid = utils.isValidScalar(randomNonce);
  console.log(`  Nonce ${i+1}: ${isValid ? '✅' : '❌'} ${utils.bytesToHex(randomNonce).slice(0, 16)}...`);
}
