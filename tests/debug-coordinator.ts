/**
 * Debug coordinator issue
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { generateAdaptorSecret } from './src/crypto/adaptor';
import { SigFlag } from './src/cashu/types';

console.log('🐛 Debugging coordinator issue\n');

// Simple test with same setup as coordinator
const alicePrivkey = utils.generatePrivateKey();
const alicePubkey = utils.getPublicKey(alicePrivkey);
const bobPrivkey = utils.generatePrivateKey();
const bobPubkey = utils.getPublicKey(bobPrivkey);

console.log('Setup:');
console.log(`  Alice pubkey: ${utils.bytesToHex(alicePubkey).slice(0, 16)}...`);
console.log(`  Bob pubkey: ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);

// Bob generates adaptor secret (responder)
const adaptorSecret = generateAdaptorSecret();
console.log(`\nAdaptor secret: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);

// Create secrets
const secretForBob = p2pk.createP2PKSecret(bobPubkey, SigFlag.SIG_INPUTS);
const secretForAlice = p2pk.createP2PKSecret(alicePubkey, SigFlag.SIG_INPUTS);

console.log('\nSecrets created');

// Create adaptor signatures (THIS IS WHERE IT MIGHT FAIL)
console.log('\nCreating Alice\'s adaptor signature...');
const aliceSig = p2pk.createP2PKAdaptorSignature(
  alicePrivkey,
  secretForBob,
  adaptorSecret
);
console.log('  Created');

console.log('\nCreating Bob\'s adaptor signature...');
const bobSig = p2pk.createP2PKAdaptorSignature(
  bobPrivkey,
  secretForAlice,
  adaptorSecret
);
console.log('  Created');

// Verify
console.log('\nVerifying Alice\'s signature...');
const aliceValid = p2pk.verifyP2PKAdaptorSignature(
  alicePubkey,
  secretForBob,
  aliceSig
);
console.log(`  Valid: ${aliceValid.valid ? '✅' : '❌'}`);
if (!aliceValid.valid) console.log(`  Error: ${aliceValid.error}`);

console.log('\nVerifying Bob\'s signature...');
const bobValid = p2pk.verifyP2PKAdaptorSignature(
  bobPubkey,
  secretForAlice,
  bobSig
);
console.log(`  Valid: ${bobValid.valid ? '✅' : '❌'}`);
if (!bobValid.valid) console.log(`  Error: ${bobValid.error}`);

console.log('\n' + (aliceValid.valid && bobValid.valid ? '✅ Both valid!' : '❌ At least one invalid'));
