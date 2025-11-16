/**
 * Test BDHKE implementation
 */

import * as secp from '@noble/secp256k1';
import * as utils from './src/crypto/utils';
import * as bdhke from './src/crypto/bdhke';

console.log('Testing BDHKE operations\n');

// Test 1: hash_to_curve determinism
console.log('Test 1: hash_to_curve determinism');
const secret1 = 'test_secret_123';
const Y1 = bdhke.hashToCurve(secret1);
const Y2 = bdhke.hashToCurve(secret1);
console.log(`  Y1: ${utils.bytesToHex(Y1).slice(0, 32)}...`);
console.log(`  Y2: ${utils.bytesToHex(Y2).slice(0, 32)}...`);
console.log(`  Deterministic: ${utils.equalBytes(Y1, Y2) ? '✅' : '❌'}`);

// Test 2: Blinding and unblinding
console.log('\nTest 2: Blinding and unblinding');
const secret = 'my_secret_token';
const mintPrivkey = utils.generatePrivateKey();
const mintPubkey = utils.getPublicKey(mintPrivkey);

console.log(`  Mint pubkey: ${utils.bytesToHex(mintPubkey).slice(0, 16)}...`);

// User creates blinded message
const blinded = bdhke.createBlindedMessage(secret);
console.log(`  B_: ${utils.bytesToHex(blinded.B_).slice(0, 16)}...`);
console.log(`  Y: ${utils.bytesToHex(blinded.Y).slice(0, 16)}...`);

// Mint signs: C_ = k * B_
// B_ is already in compressed format (33 bytes), parse it directly
const B_point = blinded.B_.length === 33
  ? secp.Point.fromHex(blinded.B_)
  : utils.liftX(blinded.B_);
const C_point = B_point.multiply(utils.bytesToBigInt(mintPrivkey));
const C_ = C_point.toHex(true); // compressed format

console.log(`  C_ (from mint): ${C_.slice(0, 20)}...`);

// User unblinds
const C = bdhke.unblindSignature(C_, blinded.r, mintPubkey);
console.log(`  C (unblinded): ${utils.bytesToHex(C).slice(0, 16)}...`);

// Verify: C should equal k * Y
const Y_point = utils.liftX(blinded.Y);
const expected_C_point = Y_point.multiply(utils.bytesToBigInt(mintPrivkey));
const expected_C = utils.bigIntToBytes(expected_C_point.toAffine().x);

console.log(`  Expected C: ${utils.bytesToHex(expected_C).slice(0, 16)}...`);
console.log(`  Matches: ${utils.equalBytes(C, expected_C) ? '✅' : '❌'}`);

// Test 3: Verification
console.log('\nTest 3: Signature verification');
const valid = bdhke.verifyUnblindedSignature(C, secret, mintPubkey);
console.log(`  Valid: ${valid ? '✅' : '❌'}`);

console.log('\n✅ BDHKE tests complete!');
