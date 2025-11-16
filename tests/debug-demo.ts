/**
 * Debug version to trace the issue
 */

import * as adaptor from './src/crypto/adaptor';
import * as utils from './src/crypto/utils';

console.log('🔍 Debugging adaptor signatures\n');

// Simple test
const privkey = utils.hexToBytes('0'.repeat(63) + '1');
const pubkey = utils.getPublicKey(privkey);
const message = utils.hexToBytes('0'.repeat(64));
const secret = utils.hexToBytes('0'.repeat(63) + '2');

console.log('Inputs:');
console.log(`  privkey: ${utils.bytesToHex(privkey)}`);
console.log(`  pubkey:  ${utils.bytesToHex(pubkey)}`);
console.log(`  message: ${utils.bytesToHex(message)}`);
console.log(`  secret:  ${utils.bytesToHex(secret)}`);

const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);

console.log('\nAdaptor signature:');
console.log(`  s_prime: ${utils.bytesToHex(adaptorSig.s_prime)}`);
console.log(`  R:       ${utils.bytesToHex(adaptorSig.R)}`);
console.log(`  T:       ${utils.bytesToHex(adaptorSig.T)}`);

// Manual verification
console.log('\nManual verification:');

// Compute T from secret
const T_check = utils.scalarMultiplyG(secret);
console.log(`  tG:      ${utils.bytesToHex(T_check)}`);
console.log(`  T match: ${utils.equalBytes(T_check, adaptorSig.T)}`);

// Try verification
const result = adaptor.verifyAdaptorSignature(pubkey, message, adaptorSig);
console.log(`\nVerification result: ${result.valid}`);
if (!result.valid) {
  console.log(`Error: ${result.error}`);
}
