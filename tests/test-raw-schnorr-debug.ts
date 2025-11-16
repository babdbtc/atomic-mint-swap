/**
 * Debug raw Schnorr signature step-by-step
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { SigFlag } from './src/cashu/types';

console.log('\n🔍 Raw Schnorr Signature Debugging\n');

// Create keypair
const privkey = utils.generatePrivateKey();
const pubkey = utils.getPublicKey(privkey);
const compressedPubkey = utils.getCompressedPublicKey(privkey);

console.log(`Private key: ${utils.bytesToHex(privkey)}`);
console.log(`Public key (x-only): ${utils.bytesToHex(pubkey)}`);
console.log(`Public key (compressed): ${utils.bytesToHex(compressedPubkey)}\n`);

// Create P2PK secret
const secret = p2pk.createP2PKSecret(pubkey, SigFlag.SIG_INPUTS);
const serialized = p2pk.serializeP2PKSecret(secret);
const messageBytes = new TextEncoder().encode(serialized);
const messageHash = utils.hash(messageBytes);

console.log(`Message (serialized secret): ${serialized.slice(0, 80)}...`);
console.log(`Message hash (m): ${utils.bytesToHex(messageHash)}\n`);

// Sign using our implementation
console.log('='.repeat(70));
console.log('SIGNING PROCESS');
console.log('='.repeat(70));

const signature = p2pk.signP2PKSecret(privkey, secret);

console.log(`\nSignature R: ${utils.bytesToHex(signature.R)}`);
console.log(`Signature s: ${utils.bytesToHex(signature.s)}\n`);

// Manual verification
console.log('='.repeat(70));
console.log('VERIFICATION PROCESS');
console.log('='.repeat(70));

// Step 1: Compute challenge e = H(P || R || m)
const P = pubkey;
const R = signature.R;
const e = utils.hashConcat(P, R, messageHash);

console.log(`\nStep 1: Compute challenge`);
console.log(`  P (pubkey): ${utils.bytesToHex(P)}`);
console.log(`  R: ${utils.bytesToHex(R)}`);
console.log(`  m (message hash): ${utils.bytesToHex(messageHash)}`);
console.log(`  e = H(P || R || m): ${utils.bytesToHex(e)}\n`);

// Step 2: Compute sG
const sG = utils.scalarMultiplyG(signature.s);
console.log(`Step 2: Compute sG`);
console.log(`  s: ${utils.bytesToHex(signature.s)}`);
console.log(`  sG: ${utils.bytesToHex(sG)}\n`);

// Step 3: Compute R + eP
const P_point = utils.liftX(P);
const eP_point = P_point.multiply(utils.bytesToBigInt(e));
const R_point = utils.liftX(R);
const rhs_point = R_point.add(eP_point);
const rhs = utils.bigIntToBytes(rhs_point.toAffine().x);

console.log(`Step 3: Compute R + eP`);
console.log(`  R (as point): lifted from x-only`);
console.log(`  P (as point): lifted from x-only`);
console.log(`  eP: P * e`);
console.log(`  R + eP: ${utils.bytesToHex(rhs)}\n`);

// Step 4: Check if sG == R + eP
console.log(`Step 4: Verify equation sG == R + eP`);
console.log(`  sG:    ${utils.bytesToHex(sG)}`);
console.log(`  R+eP:  ${utils.bytesToHex(rhs)}`);
console.log(`  Match: ${utils.equalBytes(sG, rhs) ? '✅' : '❌'}\n`);

if (!utils.equalBytes(sG, rhs)) {
  console.log('❌ Signature verification FAILED!');
  console.log('   This indicates a bug in our signing or verification logic.\n');
} else {
  console.log('✅ Signature verification PASSED!');
  console.log('   Our implementation is mathematically correct.\n');
}

console.log('='.repeat(70));
console.log('ANALYSIS');
console.log('='.repeat(70));
console.log('\nOur implementation uses:');
console.log('  1. Challenge: e = H(P || R || m) where P and R are x-only');
console.log('  2. Signature: (R, s) where s = r + e*x');
console.log('  3. Verification: sG == R + eP');
console.log('\nThis is standard Schnorr without BIP-340 tagged hashing.');
console.log('It should be compatible with Python secp256k1 raw=True mode.\n');
