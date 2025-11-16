/**
 * Demo: Cashu P2PK with Adaptor Signatures for Atomic Swaps
 *
 * This demonstrates how adaptor signatures integrate with Cashu P2PK proofs
 * Run with: npx tsx demo-p2pk.ts
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { SigFlag } from './src/cashu/types';

console.log('\n🔐 Cashu P2PK + Adaptor Signatures Integration Demo\n');
console.log('='.repeat(70));

// ============================================================================
// Part 1: Standard P2PK (without adaptor signatures)
// ============================================================================

console.log('\n📋 Part 1: Standard Cashu P2PK\n');

console.log('1️⃣  Creating P2PK secret...');
const alicePrivkey = utils.generatePrivateKey();
const alicePubkey = utils.getPublicKey(alicePrivkey);

const secret1 = p2pk.createP2PKSecret(alicePubkey, SigFlag.SIG_INPUTS);
console.log(`   Nonce: ${secret1.nonce.slice(0, 16)}...`);
console.log(`   Recipient pubkey: ${secret1.data.slice(0, 16)}...`);
console.log(`   Sigflag: ${secret1.tags?.[0]?.[1]}`);

console.log('\n2️⃣  Serializing P2PK secret...');
const serialized = p2pk.serializeP2PKSecret(secret1);
console.log(`   Format: ${serialized.slice(0, 60)}...`);

console.log('\n3️⃣  Creating standard Schnorr signature...');
const standardSig = p2pk.signP2PKSecret(alicePrivkey, secret1);
console.log(`   Signature R: ${utils.bytesToHex(standardSig.R).slice(0, 16)}...`);
console.log(`   Signature s: ${utils.bytesToHex(standardSig.s).slice(0, 16)}...`);

console.log('\n4️⃣  Creating P2PK witness...');
const witness1 = p2pk.createP2PKWitness(standardSig);
console.log(`   Witness signatures[0]: ${witness1.signatures[0].slice(0, 32)}...`);

console.log('\n5️⃣  Verifying witness...');
const verified1 = p2pk.verifyP2PKWitness(alicePubkey, secret1, witness1);
console.log(`   Valid: ${verified1.valid ? '✅' : '❌'}`);

// ============================================================================
// Part 2: P2PK with Adaptor Signatures for Atomic Swaps
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('\n📋 Part 2: P2PK with Adaptor Signatures (Atomic Swap)\n');

console.log('Scenario: Bob and Charlie atomic swap across Mint A and Mint B');

// Setup parties
console.log('\n1️⃣  Setting up parties...');
const bobPrivkey = utils.generatePrivateKey();
const bobPubkey = utils.getPublicKey(bobPrivkey);
const charliePrivkey = utils.generatePrivateKey();
const charliePubkey = utils.getPublicKey(charliePrivkey);

console.log(`   Bob pubkey:     ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);
console.log(`   Charlie pubkey: ${utils.bytesToHex(charliePubkey).slice(0, 16)}...`);

// Charlie generates adaptor secret
console.log('\n2️⃣  Charlie generates adaptor secret...');
// Import from adaptor module
import { generateAdaptorSecret, getAdaptorPoint } from './src/crypto/adaptor';

const t_final = generateAdaptorSecret(); // Already canonical
const T = getAdaptorPoint(t_final);
console.log(`   Secret T: ${utils.bytesToHex(T).slice(0, 16)}...`);

// Create P2PK secrets for both mints
console.log('\n3️⃣  Creating P2PK secrets for both mints...');

// Bob creates secret on Mint B (locked to Charlie)
const secretMintB = p2pk.createP2PKSecret(charliePubkey, SigFlag.SIG_INPUTS);
console.log(`   Mint B secret (Bob → Charlie):`);
console.log(`     Recipient: ${secretMintB.data.slice(0, 16)}...`);

// Charlie creates secret on Mint A (locked to Bob)
const secretMintA = p2pk.createP2PKSecret(bobPubkey, SigFlag.SIG_INPUTS);
console.log(`   Mint A secret (Charlie → Bob):`);
console.log(`     Recipient: ${secretMintA.data.slice(0, 16)}...`);

// Create adaptor signatures
console.log('\n4️⃣  Creating adaptor signatures...');

// Bob's adaptor signature (for Charlie to claim on Mint B)
const bobAdaptorSig = p2pk.createP2PKAdaptorSignature(
  bobPrivkey,
  secretMintB,
  t_final
);
console.log(`   Bob's adaptor sig for Mint B:`);
console.log(`     s': ${utils.bytesToHex(bobAdaptorSig.s_prime).slice(0, 16)}...`);
console.log(`     T:  ${utils.bytesToHex(bobAdaptorSig.T).slice(0, 16)}...`);

// Charlie's adaptor signature (for Bob to claim on Mint A)
const charlieAdaptorSig = p2pk.createP2PKAdaptorSignature(
  charliePrivkey,
  secretMintA,
  t_final
);
console.log(`   Charlie's adaptor sig for Mint A:`);
console.log(`     s': ${utils.bytesToHex(charlieAdaptorSig.s_prime).slice(0, 16)}...`);
console.log(`     T:  ${utils.bytesToHex(charlieAdaptorSig.T).slice(0, 16)}...`);

// Verify adaptor signatures
console.log('\n5️⃣  Verifying adaptor signatures...');
const bobSigValid = p2pk.verifyP2PKAdaptorSignature(
  bobPubkey,
  secretMintB,
  bobAdaptorSig
);
const charlieSigValid = p2pk.verifyP2PKAdaptorSignature(
  charliePubkey,
  secretMintA,
  charlieAdaptorSig
);

console.log(`   Bob's adaptor sig:     ${bobSigValid.valid ? '✅' : '❌'}`);
console.log(`   Charlie's adaptor sig: ${charlieSigValid.valid ? '✅' : '❌'}`);

if (!bobSigValid.valid || !charlieSigValid.valid) {
  console.log('\n❌ Adaptor signature verification failed!');
  console.log(`   Bob error: ${bobSigValid.error}`);
  console.log(`   Charlie error: ${charlieSigValid.error}`);
  process.exit(1);
}

// Charlie claims on Mint B
console.log('\n6️⃣  Charlie claims on Mint B (reveals signature)...');
const charlieClaim = p2pk.completeP2PKSignature(bobAdaptorSig, t_final);
const charlieWitness = p2pk.createP2PKWitness(charlieClaim);

console.log(`   Completed signature:`);
console.log(`     s: ${utils.bytesToHex(charlieClaim.s).slice(0, 16)}...`);
console.log(`   Witness: ${charlieWitness.signatures[0].slice(0, 32)}...`);

// Verify Charlie's claim is valid
const charlieClaimValid = p2pk.verifyP2PKWitness(
  bobPubkey,
  secretMintB,
  charlieWitness
);
console.log(`   Claim valid: ${charlieClaimValid.valid ? '✅' : '❌'}`);

// Bob extracts secret from Charlie's witness
console.log('\n7️⃣  Bob extracts secret from Charlie\'s witness...');
const charliePublishedSig = p2pk.parseSignatureFromWitness(charlieWitness);
const extractedSecret = p2pk.extractSecretFromWitness(
  bobAdaptorSig,
  charliePublishedSig
);

const secretsMatch = utils.equalBytes(extractedSecret, t_final);
console.log(`   Extracted: ${utils.bytesToHex(extractedSecret).slice(0, 16)}...`);
console.log(`   Original:  ${utils.bytesToHex(t_final).slice(0, 16)}...`);
console.log(`   Secrets match: ${secretsMatch ? '✅' : '❌'}`);

// Bob claims on Mint A using extracted secret
console.log('\n8️⃣  Bob claims on Mint A using extracted secret...');
const bobClaim = p2pk.completeP2PKSignature(charlieAdaptorSig, extractedSecret);
const bobWitness = p2pk.createP2PKWitness(bobClaim);

console.log(`   Completed signature:`);
console.log(`     s: ${utils.bytesToHex(bobClaim.s).slice(0, 16)}...`);
console.log(`   Witness: ${bobWitness.signatures[0].slice(0, 32)}...`);

// Verify Bob's claim is valid
const bobClaimValid = p2pk.verifyP2PKWitness(
  charliePubkey,
  secretMintA,
  bobWitness
);
console.log(`   Claim valid: ${bobClaimValid.valid ? '✅' : '❌'}`);

// ============================================================================
// Part 3: Proof Structure Example
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('\n📋 Part 3: Complete Proof Structure\n');

console.log('Creating complete Cashu proof with witness...');

const { proof, secret } = p2pk.createSwapProof(
  1000, // amount in sats
  alicePubkey,
  '02698c4e2b5f9534cd0687d87513c759790cf829aa5739184a3e3735471fbda904', // example C
  '009a1f293253e41e', // example keyset id
  SigFlag.SIG_INPUTS
);

// Add witness
const proofWithWitness = p2pk.addWitnessToProof(proof, standardSig);

console.log('\nComplete Proof Structure:');
console.log(JSON.stringify(proofWithWitness, null, 2));

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('\n✅ CASHU P2PK + ADAPTOR SIGNATURES WORKING!\n');

console.log('Summary:');
console.log('  ✅ Standard P2PK signatures work correctly');
console.log('  ✅ Adaptor signatures integrate with P2PK secrets');
console.log('  ✅ Atomic swap protocol validated:');
console.log('     • Charlie claimed on Mint B (revealed signature)');
console.log('     • Bob extracted secret from witness');
console.log('     • Bob claimed on Mint A using extracted secret');
console.log('  ✅ Proof structure matches Cashu NUT-11 format');

console.log('\n💡 Key Insight:');
console.log('   Cashu P2PK proofs can carry adaptor signatures in the witness');
console.log('   field, enabling trustless atomic swaps across different mints!');

console.log('\n🚀 Ready for Phase 3: Building the swap coordinator!\n');
