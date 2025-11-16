/**
 * Debug P2PK signature creation and verification
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { SigFlag } from './src/cashu/types';
import { verifySchnorrSignature } from './src/crypto/adaptor';

console.log('\n🔍 Debugging P2PK Signature\n');

// Create keypair
const privkey = utils.generatePrivateKey();
const pubkey = utils.getPublicKey(privkey);

console.log(`Private key: ${utils.bytesToHex(privkey).slice(0, 16)}...`);
console.log(`Public key (x-only, 32 bytes): ${utils.bytesToHex(pubkey)}`);
console.log(`Public key length: ${pubkey.length} bytes\n`);

// Create P2PK secret
const secret = p2pk.createP2PKSecret(pubkey, SigFlag.SIG_INPUTS);
console.log('P2PK Secret:');
console.log(JSON.stringify(secret, null, 2));
console.log(`\nP2PK data field (should be compressed, 33 bytes): ${secret.data}`);
console.log(`P2PK data length: ${secret.data.length / 2} bytes\n`);

// Sign the secret
const serialized = p2pk.serializeP2PKSecret(secret);
console.log(`Serialized P2PK secret:\n${serialized}\n`);

const signature = p2pk.signP2PKSecret(privkey, secret);
console.log('Signature:');
console.log(`  R: ${utils.bytesToHex(signature.R)}`);
console.log(`  s: ${utils.bytesToHex(signature.s)}`);
console.log(`  R length: ${signature.R.length} bytes`);
console.log(`  s length: ${signature.s.length} bytes\n`);

// Verify the signature
const message = utils.hash(new TextEncoder().encode(serialized));
console.log(`Message hash: ${utils.bytesToHex(message).slice(0, 32)}...\n`);

// Verify with the public key we used
console.log('Verifying signature...');
const result = verifySchnorrSignature(pubkey, message, signature);
console.log(`Verification result: ${result.valid ? '✅' : '❌'}`);
if (!result.valid && result.error) {
  console.log(`Error: ${result.error}`);
}

// Also try verifying with the compressed pubkey from the P2PK data
console.log('\nTrying with compressed pubkey from P2PK data...');
const compressedPubkey = utils.hexToBytes(secret.data);
console.log(`Compressed pubkey length: ${compressedPubkey.length} bytes`);

// Extract x-only from compressed
const xOnlyFromCompressed = compressedPubkey.slice(1);
console.log(`X-only from compressed: ${utils.bytesToHex(xOnlyFromCompressed)}`);
console.log(`Original x-only:        ${utils.bytesToHex(pubkey)}`);
console.log(`Match: ${utils.equalBytes(xOnlyFromCompressed, pubkey) ? '✅' : '❌'}\n`);

const result2 = verifySchnorrSignature(xOnlyFromCompressed, message, signature);
console.log(`Verification with x-only from compressed: ${result2.valid ? '✅' : '❌'}`);
if (!result2.valid && result2.error) {
  console.log(`Error: ${result2.error}`);
}
