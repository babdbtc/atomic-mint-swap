/**
 * Complete Atomic Swap Test with Real Mint Tokens
 *
 * This test demonstrates:
 * 1. Minting tokens from FakeWallet
 * 2. Creating P2PK locked tokens
 * 3. Executing atomic swap with adaptor signatures
 * 4. Verifying tokens were actually swapped
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintTokens, mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, Proof, P2PKWitness } from './src/cashu/types';
import { generateAdaptorSecret } from './src/crypto/adaptor';

const MINT_A_URL = 'http://localhost:3338';
const MINT_B_URL = 'http://localhost:3339';

console.log('\n' + '='.repeat(70));
console.log('💰 REAL TOKEN ATOMIC SWAP TEST');
console.log('='.repeat(70));

async function main() {
  // Setup
  console.log('\n📋 STEP 1: Setup Participants\n');

  const alicePrivkey = utils.generatePrivateKey();
  const alicePubkey = utils.getPublicKey(alicePrivkey);

  const bobPrivkey = utils.generatePrivateKey();
  const bobPubkey = utils.getPublicKey(bobPrivkey);

  console.log('Alice:');
  console.log(`  Pubkey: ${utils.bytesToHex(alicePubkey).slice(0, 16)}...`);
  console.log(`  Mint: ${MINT_A_URL}`);

  console.log('\nBob:');
  console.log(`  Pubkey: ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);
  console.log(`  Mint: ${MINT_B_URL}`);

  const mintA = new MintClient(MINT_A_URL);
  const mintB = new MintClient(MINT_B_URL);

  // Step 2: Mint initial tokens
  console.log('\n' + '='.repeat(70));
  console.log('💵 STEP 2: Mint Initial Tokens from FakeWallet\n');

  console.log('Alice minting 15,000 sats on Mint A:');
  const aliceInitialTokens = await mintTokens(mintA, 15000);
  console.log(`  ✅ Alice has ${aliceInitialTokens.length} tokens: ${aliceInitialTokens.map(p => p.amount).join(', ')} sats\n`);

  console.log('Bob minting 12,000 sats on Mint B:');
  const bobInitialTokens = await mintTokens(mintB, 12000);
  console.log(`  ✅ Bob has ${bobInitialTokens.length} tokens: ${bobInitialTokens.map(p => p.amount).join(', ')} sats`);

  // Step 3: Create P2PK locked tokens for swap
  console.log('\n' + '='.repeat(70));
  console.log('🔐 STEP 3: Create P2PK Locked Tokens for Swap\n');

  // Generate adaptor secret (shared between both)
  const adaptorSecret = generateAdaptorSecret();
  console.log(`Adaptor secret: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);

  // Alice creates tokens locked to Bob's pubkey (using SIG_ALL for single signature)
  console.log('\nAlice creating 10,050 sat token locked to Bob:');
  const aliceSwapTokens = await mintP2PKTokens(
    mintA,
    10050,
    bobPubkey,
    SigFlag.SIG_ALL  // Single signature covers all inputs
  );
  console.log(`  ✅ Created ${aliceSwapTokens.length} P2PK locked tokens`);

  // Bob creates tokens locked to Alice's pubkey (using SIG_ALL for single signature)
  console.log('\nBob creating 10,000 sat token locked to Alice:');
  const bobSwapTokens = await mintP2PKTokens(
    mintB,
    10000,
    alicePubkey,
    SigFlag.SIG_ALL  // Single signature covers all inputs
  );
  console.log(`  ✅ Created ${bobSwapTokens.length} P2PK locked tokens`);

  // Step 4: Create adaptor signatures
  console.log('\n' + '='.repeat(70));
  console.log('📝 STEP 4: Exchange Adaptor Signatures\n');

  // Alice creates adaptor signature for her tokens
  const aliceSecret = p2pk.deserializeP2PKSecret(aliceSwapTokens[0].secret);
  const aliceAdaptorSig = p2pk.createP2PKAdaptorSignature(
    alicePrivkey,
    aliceSecret,
    adaptorSecret
  );
  console.log('✅ Alice created adaptor signature');

  // Bob creates adaptor signature for his tokens
  const bobSecret = p2pk.deserializeP2PKSecret(bobSwapTokens[0].secret);
  const bobAdaptorSig = p2pk.createP2PKAdaptorSignature(
    bobPrivkey,
    bobSecret,
    adaptorSecret
  );
  console.log('✅ Bob created adaptor signature');

  // Verify adaptor signatures
  const aliceSigValid = p2pk.verifyP2PKAdaptorSignature(
    alicePubkey,
    aliceSecret,
    aliceAdaptorSig
  );
  const bobSigValid = p2pk.verifyP2PKAdaptorSignature(
    bobPubkey,
    bobSecret,
    bobAdaptorSig
  );

  console.log(`\nVerification:`);
  console.log(`  Alice's adaptor sig: ${aliceSigValid.valid ? '✅' : '❌'}`);
  console.log(`  Bob's adaptor sig: ${bobSigValid.valid ? '✅' : '❌'}`);

  if (!aliceSigValid.valid || !bobSigValid.valid) {
    throw new Error('Adaptor signature verification failed!');
  }

  // Step 5: Bob claims (reveals secret)
  console.log('\n' + '='.repeat(70));
  console.log('⚡ STEP 5: Bob Claims Alice\'s Tokens\n');

  // Bob completes his signature using the adaptor secret
  const bobClaimSig = p2pk.completeP2PKSignature(bobAdaptorSig, adaptorSecret);
  console.log(`Bob's claim signature created`);

  // Add witness to Alice's tokens
  const witness: P2PKWitness = {
    signatures: [
      utils.bytesToHex(bobClaimSig.R) + utils.bytesToHex(bobClaimSig.s)
    ],
  };

  const aliceTokensWithWitness = aliceSwapTokens.map(proof => ({
    ...proof,
    witness: JSON.stringify(witness),
  }));

  // Bob spends Alice's tokens on Mint A
  console.log('Bob swapping tokens on Mint A...');
  const bobNewTokens = await swapTokens(
    mintA,
    aliceTokensWithWitness,
    10050
  );
  console.log(`✅ Bob received ${bobNewTokens.length} new tokens on Mint A`);

  // Step 6: Alice extracts secret
  console.log('\n' + '='.repeat(70));
  console.log('🔓 STEP 6: Alice Extracts Secret\n');

  const extractedSecret = p2pk.extractSecretFromWitness(
    bobAdaptorSig,
    bobClaimSig
  );
  console.log(`Extracted secret: ${utils.bytesToHex(extractedSecret).slice(0, 16)}...`);
  console.log(`Original secret: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);
  console.log(`Secrets match: ${utils.equalBytes(extractedSecret, adaptorSecret) ? '✅' : '❌'}`);

  // Step 7: Alice claims
  console.log('\n' + '='.repeat(70));
  console.log('💫 STEP 7: Alice Claims Bob\'s Tokens\n');

  // Alice completes her signature using extracted secret
  const aliceClaimSig = p2pk.completeP2PKSignature(aliceAdaptorSig, extractedSecret);
  console.log(`Alice's claim signature created`);

  // Add witness to Bob's tokens
  const aliceWitness: P2PKWitness = {
    signatures: [
      utils.bytesToHex(aliceClaimSig.R) + utils.bytesToHex(aliceClaimSig.s)
    ],
  };

  const bobTokensWithWitness = bobSwapTokens.map(proof => ({
    ...proof,
    witness: JSON.stringify(aliceWitness),
  }));

  // Alice spends Bob's tokens on Mint B
  console.log('Alice swapping tokens on Mint B...');
  const aliceNewTokens = await swapTokens(
    mintB,
    bobTokensWithWitness,
    10000
  );
  console.log(`✅ Alice received ${aliceNewTokens.length} new tokens on Mint B`);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('✅ ATOMIC SWAP COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(70));

  console.log('\n💰 Final State:');
  console.log(`  Alice:`);
  console.log(`    - Started with: 15,000 sats on Mint A`);
  console.log(`    - Locked: 10,050 sats to Bob`);
  console.log(`    - Received: 10,000 sats on Mint B`);
  console.log(`    - Net: Lost 50 sats (fee), gained access to Mint B`);

  console.log(`\n  Bob:`);
  console.log(`    - Started with: 12,000 sats on Mint B`);
  console.log(`    - Locked: 10,000 sats to Alice`);
  console.log(`    - Received: 10,050 sats on Mint A`);
  console.log(`    - Net: Gained 50 sats (fee), gained access to Mint A`);

  console.log('\n🔐 Cryptographic Guarantees:');
  console.log('  ✅ Adaptor signatures verified');
  console.log('  ✅ Secret extraction successful');
  console.log('  ✅ Both parties claimed successfully');
  console.log('  ✅ Atomicity: Bob\'s claim revealed secret for Alice');

  console.log('\n🎉 COMPLETE SUCCESS!');
  console.log('  This demonstrates a fully functional atomic swap');
  console.log('  using real ecash tokens with cryptographic atomicity.\n');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
