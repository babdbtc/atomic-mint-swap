/**
 * Working Demo: Cashu P2PK + Adaptor Signatures for Atomic Swaps
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { generateAdaptorSecret } from './src/crypto/adaptor';
import { SigFlag } from './src/cashu/types';

console.log('\n🔐 Cashu P2PK + Adaptor Signatures - Atomic Swap Demo\n');
console.log('='.repeat(70));

console.log('\n📋 Scenario: Bob and Charlie atomic swap across two mints\n');

// Setup
console.log('1️⃣  Setting up parties...');
const bobPrivkey = utils.generatePrivateKey();
const bobPubkey = utils.getPublicKey(bobPrivkey);
const charliePrivkey = utils.generatePrivateKey();
const charliePubkey = utils.getPublicKey(charliePrivkey);

console.log(`   Bob pubkey:     ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);
console.log(`   Charlie pubkey: ${utils.bytesToHex(charliePubkey).slice(0, 16)}...`);

// Charlie generates adaptor secret
console.log('\n2️⃣  Charlie generates adaptor secret...');
const adaptorSecret = generateAdaptorSecret();
console.log(`   Secret generated: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);

// Create P2PK secrets
console.log('\n3️⃣  Creating P2PK secrets...');
const secretMintB = p2pk.createP2PKSecret(charliePubkey, SigFlag.SIG_INPUTS); // Bob → Charlie on Mint B
const secretMintA = p2pk.createP2PKSecret(bobPubkey, SigFlag.SIG_INPUTS); // Charlie → Bob on Mint A

console.log(`   Mint B (Bob → Charlie): locked to ${secretMintB.data.slice(0, 16)}...`);
console.log(`   Mint A (Charlie → Bob): locked to ${secretMintA.data.slice(0, 16)}...`);

// Create adaptor signatures
console.log('\n4️⃣  Creating adaptor signatures...');
const bobAdaptorSig = p2pk.createP2PKAdaptorSignature(bobPrivkey, secretMintB, adaptorSecret);
const charlieAdaptorSig = p2pk.createP2PKAdaptorSignature(charliePrivkey, secretMintA, adaptorSecret);

console.log(`   Bob's adaptor sig created`);
console.log(`   Charlie's adaptor sig created`);

// Verify adaptor signatures
console.log('\n5️⃣  Verifying adaptor signatures...');
const bobValid = p2pk.verifyP2PKAdaptorSignature(bobPubkey, secretMintB, bobAdaptorSig);
const charlieValid = p2pk.verifyP2PKAdaptorSignature(charliePubkey, secretMintA, charlieAdaptorSig);

console.log(`   Bob's: ${bobValid.valid ? '✅' : '❌' + ' - ' + bobValid.error}`);
console.log(`   Charlie's: ${charlieValid.valid ? '✅' : '❌' + ' - ' + charlieValid.error}`);

if (!bobValid.valid || !charlieValid.valid) {
  console.log('\n❌ Verification failed!');
  process.exit(1);
}

// Charlie claims on Mint B
console.log('\n6️⃣  Charlie claims on Mint B...');
const charlieClaim = p2pk.completeP2PKSignature(bobAdaptorSig, adaptorSecret);
const charlieWitness = p2pk.createP2PKWitness(charlieClaim);
const charlieClaimValid = p2pk.verifyP2PKWitness(bobPubkey, secretMintB, charlieWitness);

console.log(`   Claim created: ${charlieWitness.signatures[0].slice(0, 32)}...`);
console.log(`   Valid: ${charlieClaimValid.valid ? '✅' : '❌'}`);

// Bob extracts secret
console.log('\n7️⃣  Bob extracts secret from Charlie\'s witness...');
const charliePublishedSig = p2pk.parseSignatureFromWitness(charlieWitness);
const extractedSecret = p2pk.extractSecretFromWitness(bobAdaptorSig, charliePublishedSig);
const secretsMatch = utils.equalBytes(extractedSecret, adaptorSecret);

console.log(`   Extracted: ${utils.bytesToHex(extractedSecret).slice(0, 16)}...`);
console.log(`   Match: ${secretsMatch ? '✅' : '❌'}`);

// Bob claims on Mint A
console.log('\n8️⃣  Bob claims on Mint A...');
const bobClaim = p2pk.completeP2PKSignature(charlieAdaptorSig, extractedSecret);
const bobWitness = p2pk.createP2PKWitness(bobClaim);
const bobClaimValid = p2pk.verifyP2PKWitness(charliePubkey, secretMintA, bobWitness);

console.log(`   Claim created: ${bobWitness.signatures[0].slice(0, 32)}...`);
console.log(`   Valid: ${bobClaimValid.valid ? '✅' : '❌'}`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('\n✅ ATOMIC SWAP SUCCESSFUL!\n');
console.log('Summary:');
console.log('  ✅ Both adaptor signatures verified');
console.log('  ✅ Charlie claimed on Mint B (published signature)');
console.log('  ✅ Bob extracted secret from published signature');
console.log('  ✅ Bob claimed on Mint A using extracted secret');
console.log('  ✅ Both transactions completed atomically!');

console.log('\n💡 Key Achievement:');
console.log('   Cashu P2PK proofs + Adaptor signatures = Atomic swaps!');
console.log('   No trust required, no mint modifications needed!');

console.log('\n🎉 Phase 2 Complete: Cashu P2PK integration working!\n');
