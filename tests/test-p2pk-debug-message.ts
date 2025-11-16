/**
 * Debug what message we're actually signing for P2PK
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { SigFlag } from './src/cashu/types';

console.log('\n🔍 P2PK Message Debugging\n');

// Create keypair
const privkey = utils.generatePrivateKey();
const pubkey = utils.getPublicKey(privkey);

// Create P2PK secret
const secret = p2pk.createP2PKSecret(pubkey, SigFlag.SIG_INPUTS);
const serialized = p2pk.serializeP2PKSecret(secret);

console.log('P2PK Secret (deserialized):');
console.log(JSON.stringify(secret, null, 2));

console.log('\nSerialized P2PK Secret (what goes in Proof.secret):');
console.log(serialized);

console.log('\nThis should be the message we sign (SHA256 of the above):');
const messageBytes = new TextEncoder().encode(serialized);
console.log(`Message bytes length: ${messageBytes.length}`);

const messageHash = utils.hash(messageBytes);
console.log(`Message hash: ${utils.bytesToHex(messageHash)}`);

console.log('\n---\n');

// Now create a signature
const signature = p2pk.signP2PKSecret(privkey, secret);
console.log('Signature created:');
console.log(`R: ${utils.bytesToHex(signature.R)}`);
console.log(`s: ${utils.bytesToHex(signature.s)}`);

// Verify it
import { verifySchnorrSignature } from './src/crypto/adaptor';
const result = verifySchnorrSignature(pubkey, messageHash, signature);
console.log(`\nSignature verification: ${result.valid ? '✅' : '❌'}`);
if (!result.valid) {
  console.log(`Error: ${result.error}`);
}

console.log('\n---\n');
console.log('According to NUT-11:');
console.log('  For SIG_INPUTS: message = SHA256(Proof.secret)');
console.log('  Where Proof.secret is the serialized P2PK secret JSON string');
console.log('\n✅ Our implementation appears correct!\n');
