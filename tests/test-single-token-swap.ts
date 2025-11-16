/**
 * Simplified Single Token Swap Test
 *
 * This test uses the simplest possible case:
 * - Single token (1 sat) on each side
 * - SIG_INPUTS flag (simpler than SIG_ALL)
 * - Isolates the core P2PK spending mechanism
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
console.log('🔬 SIMPLIFIED SINGLE TOKEN SWAP TEST');
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

  // Step 2: Create single P2PK locked tokens
  console.log('\n' + '='.repeat(70));
  console.log('🔐 STEP 2: Create Single P2PK Locked Tokens\n');

  // Generate adaptor secret
  const adaptorSecret = generateAdaptorSecret();
  console.log(`Adaptor secret: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);

  // Alice creates 1 sat token locked to Bob (using SIG_INPUTS)
  console.log('\nAlice creating 1 sat token locked to Bob:');
  const aliceSwapTokens = await mintP2PKTokens(
    mintA,
    1,  // Just 1 sat - single token
    bobPubkey,
    SigFlag.SIG_INPUTS  // Each token has its own signature
  );
  console.log(`  ✅ Created ${aliceSwapTokens.length} P2PK locked token`);
  console.log(`  Token amount: ${aliceSwapTokens[0].amount} sat`);

  // Bob creates 1 sat token locked to Alice (using SIG_INPUTS)
  console.log('\nBob creating 1 sat token locked to Alice:');
  const bobSwapTokens = await mintP2PKTokens(
    mintB,
    1,  // Just 1 sat - single token
    alicePubkey,
    SigFlag.SIG_INPUTS  // Each token has its own signature
  );
  console.log(`  ✅ Created ${bobSwapTokens.length} P2PK locked token`);
  console.log(`  Token amount: ${bobSwapTokens[0].amount} sat`);

  // Step 3: Create adaptor signatures
  console.log('\n' + '='.repeat(70));
  console.log('📝 STEP 3: Exchange Adaptor Signatures\n');

  // IMPORTANT: Each party signs the tokens locked to THEM
  // Alice's tokens are locked to Bob → Bob signs them
  // Bob's tokens are locked to Alice → Alice signs them

  // Bob creates adaptor signature for Alice's tokens (locked to Bob)
  const aliceSecret = p2pk.deserializeP2PKSecret(aliceSwapTokens[0].secret);
  const bobAdaptorSig = p2pk.createP2PKAdaptorSignature(
    bobPrivkey,  // Bob signs because tokens are locked to Bob
    aliceSecret,
    adaptorSecret
  );
  console.log('✅ Bob created adaptor signature for Alice\'s tokens');

  // Alice creates adaptor signature for Bob's tokens (locked to Alice)
  const bobSecret = p2pk.deserializeP2PKSecret(bobSwapTokens[0].secret);
  const aliceAdaptorSig = p2pk.createP2PKAdaptorSignature(
    alicePrivkey,  // Alice signs because tokens are locked to Alice
    bobSecret,
    adaptorSecret
  );
  console.log('✅ Alice created adaptor signature for Bob\'s tokens');

  // Verify adaptor signatures
  const bobSigValid = p2pk.verifyP2PKAdaptorSignature(
    bobPubkey,  // Verify Bob's signature
    aliceSecret,  // On Alice's tokens (locked to Bob)
    bobAdaptorSig
  );
  const aliceSigValid = p2pk.verifyP2PKAdaptorSignature(
    alicePubkey,  // Verify Alice's signature
    bobSecret,  // On Bob's tokens (locked to Alice)
    aliceAdaptorSig
  );

  console.log(`\nVerification:`);
  console.log(`  Alice's adaptor sig: ${aliceSigValid.valid ? '✅' : '❌'}`);
  console.log(`  Bob's adaptor sig: ${bobSigValid.valid ? '✅' : '❌'}`);

  if (!aliceSigValid.valid || !bobSigValid.valid) {
    throw new Error('Adaptor signature verification failed!');
  }

  // Step 4: Bob claims (reveals secret)
  console.log('\n' + '='.repeat(70));
  console.log('⚡ STEP 4: Bob Claims Alice\'s Token\n');

  // Bob completes his signature using the adaptor secret
  const bobClaimSig = p2pk.completeP2PKSignature(bobAdaptorSig, adaptorSecret);
  console.log(`Bob's claim signature created`);
  console.log(`  R: ${utils.bytesToHex(bobClaimSig.R).slice(0, 16)}...`);
  console.log(`  s: ${utils.bytesToHex(bobClaimSig.s).slice(0, 16)}...`);

  // Add witness to Alice's token
  const witness: P2PKWitness = {
    signatures: [
      utils.bytesToHex(bobClaimSig.R) + utils.bytesToHex(bobClaimSig.s)
    ],
  };

  const aliceTokenWithWitness = {
    ...aliceSwapTokens[0],
    witness: JSON.stringify(witness),
  };

  console.log(`\nToken with witness:`);
  console.log(`  Amount: ${aliceTokenWithWitness.amount}`);
  console.log(`  Secret (P2PK): ${JSON.parse(aliceTokenWithWitness.secret)[1].data.slice(0, 16)}...`);
  console.log(`  Witness sig length: ${witness.signatures[0].length} chars (${witness.signatures[0].length / 2} bytes)`);

  // Bob spends Alice's token on Mint A
  console.log('\nBob swapping token on Mint A...');
  try {
    const bobNewTokens = await swapTokens(
      mintA,
      [aliceTokenWithWitness],
      1  // 1 sat output
    );
    console.log(`✅ Bob received ${bobNewTokens.length} new token on Mint A`);

    // Step 5: Alice extracts secret
    console.log('\n' + '='.repeat(70));
    console.log('🔓 STEP 5: Alice Extracts Secret\n');

    const extractedSecret = p2pk.extractSecretFromWitness(
      bobAdaptorSig,
      bobClaimSig
    );
    console.log(`Extracted secret: ${utils.bytesToHex(extractedSecret).slice(0, 16)}...`);
    console.log(`Original secret: ${utils.bytesToHex(adaptorSecret).slice(0, 16)}...`);
    console.log(`Secrets match: ${utils.equalBytes(extractedSecret, adaptorSecret) ? '✅' : '❌'}`);

    // Step 6: Alice claims
    console.log('\n' + '='.repeat(70));
    console.log('💫 STEP 6: Alice Claims Bob\'s Token\n');

    // Alice completes her signature using extracted secret
    const aliceClaimSig = p2pk.completeP2PKSignature(aliceAdaptorSig, extractedSecret);
    console.log(`Alice's claim signature created`);

    // Add witness to Bob's token
    const aliceWitness: P2PKWitness = {
      signatures: [
        utils.bytesToHex(aliceClaimSig.R) + utils.bytesToHex(aliceClaimSig.s)
      ],
    };

    const bobTokenWithWitness = {
      ...bobSwapTokens[0],
      witness: JSON.stringify(aliceWitness),
    };

    // Alice spends Bob's token on Mint B
    console.log('Alice swapping token on Mint B...');
    const aliceNewTokens = await swapTokens(
      mintB,
      [bobTokenWithWitness],
      1  // 1 sat output
    );
    console.log(`✅ Alice received ${aliceNewTokens.length} new token on Mint B`);

    // Success!
    console.log('\n' + '='.repeat(70));
    console.log('✅ ATOMIC SWAP COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));

    console.log('\n💰 Final State:');
    console.log(`  Alice: Swapped 1 sat from Mint A → 1 sat on Mint B`);
    console.log(`  Bob: Swapped 1 sat from Mint B → 1 sat on Mint A`);

    console.log('\n🔐 Cryptographic Guarantees:');
    console.log('  ✅ Adaptor signatures verified');
    console.log('  ✅ Secret extraction successful');
    console.log('  ✅ Both parties claimed successfully');
    console.log('  ✅ Atomicity: Bob\'s claim revealed secret for Alice');

    console.log('\n🎉 COMPLETE SUCCESS!');
    console.log('  Single token P2PK spending is working!\n');

  } catch (error) {
    console.log('\n❌ Bob\'s claim FAILED');
    console.error('Error:', error);

    if (error instanceof Error && error.message.includes('public key size')) {
      console.log('\n🔍 DIAGNOSIS:');
      console.log('  The "unknown public key size" error persists even with:');
      console.log('  - Single token (no denomination complexity)');
      console.log('  - SIG_INPUTS flag (no SIG_ALL complexity)');
      console.log('  - Correct witness format (128 char / 64 byte signature)');
      console.log('  - Correct P2PK data (66 char / 33 byte compressed pubkey)');
      console.log('\n💡 This suggests the issue may be in how the mint validates');
      console.log('   P2PK witnesses or how we\'re constructing the swap request.');
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
