/**
 * Debug P2PK adaptor signature issue
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { generateAdaptorSecret, generateAdaptorSignature, verifyAdaptorSignature } from './src/crypto/adaptor';
import { SigFlag } from './src/cashu/types';

console.log('Debugging P2PK adaptor signature\n');

const privkey = utils.hexToBytes('0'.repeat(63) + '1');
const pubkey = utils.getPublicKey(privkey);

console.log(`Privkey: ${utils.bytesToHex(privkey)}`);
console.log(`Pubkey: ${utils.bytesToHex(pubkey)}\n`);

// Create secret
const secret = p2pk.createP2PKSecret(pubkey, SigFlag.SIG_INPUTS);
console.log('P2PK Secret:');
console.log(`  Nonce: ${secret.nonce}`);
console.log(`  Data: ${secret.data}`);
console.log(`  Tags: ${JSON.stringify(secret.tags)}`);

// Serialize
const serialized = p2pk.serializeP2PKSecret(secret);
console.log(`\nSerialized: ${serialized.slice(0, 100)}...`);

// Hash
const message = utils.hash(new TextEncoder().encode(serialized));
console.log(`Message (hash): ${utils.bytesToHex(message)}`);

// Generate adaptor secret
const adaptorSecret = generateAdaptorSecret();
console.log(`\nAdaptor secret: ${utils.bytesToHex(adaptorSecret).slice(0, 32)}...`);

const T = utils.scalarMultiplyG_Point(adaptorSecret);
console.log(`T (point): ${utils.bytesToHex(utils.bigIntToBytes(T.toAffine().x)).slice(0, 32)}...`);
console.log(`T y-coord: ${T.toAffine().y & 1n ? 'odd' : 'even'}`);

// Create adaptor signature DIRECTLY (not through P2PK wrapper)
console.log('\n--- Direct adaptor signature ---');
const directSig = generateAdaptorSignature(privkey, message, adaptorSecret);
console.log(`s': ${utils.bytesToHex(directSig.s_prime).slice(0, 32)}...`);
console.log(`R: ${utils.bytesToHex(directSig.R).slice(0, 32)}...`);
console.log(`T: ${utils.bytesToHex(directSig.T).slice(0, 32)}...`);

const directVerify = verifyAdaptorSignature(pubkey, message, directSig);
console.log(`Valid: ${directVerify.valid ? '✅' : '❌'}`);
if (!directVerify.valid) console.log(`Error: ${directVerify.error}`);

// Now through P2PK wrapper
console.log('\n--- Through P2PK wrapper ---');
const p2pkSig = p2pk.createP2PKAdaptorSignature(privkey, secret, adaptorSecret);
console.log(`s': ${utils.bytesToHex(p2pkSig.s_prime).slice(0, 32)}...`);
console.log(`R: ${utils.bytesToHex(p2pkSig.R).slice(0, 32)}...`);
console.log(`T: ${utils.bytesToHex(p2pkSig.T).slice(0, 32)}...`);

const p2pkVerify = p2pk.verifyP2PKAdaptorSignature(pubkey, secret, p2pkSig);
console.log(`Valid: ${p2pkVerify.valid ? '✅' : '❌'}`);
if (!p2pkVerify.valid) console.log(`Error: ${p2pkVerify.error}`);
