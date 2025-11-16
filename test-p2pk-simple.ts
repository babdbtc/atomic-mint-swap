/**
 * Simple P2PK test to debug issues
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { generateAdaptorSecret } from './src/crypto/adaptor';
import { SigFlag } from './src/cashu/types';

console.log('🧪 Simple P2PK Test\n');

// Test 1: Standard P2PK
console.log('Test 1: Standard P2PK signature');
const privkey1 = utils.hexToBytes('0'.repeat(63) + '1');
const pubkey1 = utils.getPublicKey(privkey1);
const secret1 = p2pk.createP2PKSecret(pubkey1, SigFlag.SIG_INPUTS);

const sig1 = p2pk.signP2PKSecret(privkey1, secret1);
const witness1 = p2pk.createP2PKWitness(sig1);
const verify1 = p2pk.verifyP2PKWitness(pubkey1, secret1, witness1);

console.log(`  Valid: ${verify1.valid ? '✅' : '❌'}`);
if (!verify1.valid) console.log(`  Error: ${verify1.error}`);

// Test 2: P2PK with adaptor signature
console.log('\nTest 2: P2PK with adaptor signature');
const privkey2 = utils.hexToBytes('0'.repeat(63) + '2');
const pubkey2 = utils.getPublicKey(privkey2);
const secret2 = p2pk.createP2PKSecret(pubkey2, SigFlag.SIG_INPUTS);
const adaptorSecret = generateAdaptorSecret();

const adaptorSig2 = p2pk.createP2PKAdaptorSignature(privkey2, secret2, adaptorSecret);
const verifyAdaptor2 = p2pk.verifyP2PKAdaptorSignature(pubkey2, secret2, adaptorSig2);

console.log(`  Adaptor sig valid: ${verifyAdaptor2.valid ? '✅' : '❌'}`);
if (!verifyAdaptor2.valid) console.log(`  Error: ${verifyAdaptor2.error}`);

// Complete and verify
const completed2 = p2pk.completeP2PKSignature(adaptorSig2, adaptorSecret);
const witness2 = p2pk.createP2PKWitness(completed2);
const verifyCompleted2 = p2pk.verifyP2PKWitness(pubkey2, secret2, witness2);

console.log(`  Completed sig valid: ${verifyCompleted2.valid ? '✅' : '❌'}`);
if (!verifyCompleted2.valid) console.log(`  Error: ${verifyCompleted2.error}`);

console.log('\n✅ Tests complete');
