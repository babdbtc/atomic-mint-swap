/**
 * Final comprehensive debug test
 * Our signatures ARE valid (Python confirmed), so what's wrong?
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha256';
import * as utils from './src/crypto/utils';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, Proof, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n🔍 FINAL COMPREHENSIVE DEBUG\n');

async function main() {
  const mintA = new MintClient(MINT_A_URL);

  // Use a fixed private key for reproducibility
  const privkey = utils.hexToBytes('0000000000000000000000000000000000000000000000000000000000000001');
  const pubkey = utils.getPublicKey(privkey);
  const compressedPubkey = utils.getCompressedPublicKey(privkey);

  console.log(`Fixed privkey: ${'0'.repeat(16)}...`);
  console.log(`Pubkey (compressed): ${utils.bytesToHex(compressedPubkey)}`);
  console.log(`Pubkey (x-only): ${utils.bytesToHex(pubkey)}\n`);

  // First, test non-P2PK swap (we know this works)
  console.log('='.repeat(70));
  console.log('TEST 1: Non-P2PK Swap (Should Work)');
  console.log('='.repeat(70));

  const { mintTokens, swapTokens } = await import('./src/cashu/wallet');

  const regularTokens = await mintTokens(mintA, 1);
  console.log(`✅ Minted 1 sat regular token\n`);

  try {
    const swapped = await swapTokens(mintA, regularTokens, 1);
    console.log(`✅ Regular swap SUCCESSFUL\n`);
  } catch (e) {
    console.log(`❌ Regular swap FAILED: ${e}\n`);
    return;
  }

  // Now test P2PK
  console.log('='.repeat(70));
  console.log('TEST 2: P2PK Swap (Currently Failing)');
  console.log('='.repeat(70));

  const { mintP2PKTokens } = await import('./src/cashu/wallet');

  const p2pkTokens = await mintP2PKTokens(mintA, 1, pubkey, SigFlag.SIG_INPUTS);
  console.log(`✅ Minted 1 sat P2PK token\n`);

  // Extract and display the proof details
  const proof = p2pkTokens[0];
  console.log('Proof details:');
  console.log(`  amount: ${proof.amount}`);
  console.log(`  id: ${proof.id}`);
  console.log(`  C: ${proof.C}`);
  console.log(`  secret: ${proof.secret.slice(0, 100)}...\n`);

  // Sign the secret
  const secretBytes = new TextEncoder().encode(proof.secret);
  const messageHash = sha256(secretBytes);
  const signature = schnorr.sign(messageHash, privkey);

  console.log(`Message hash: ${utils.bytesToHex(messageHash)}`);
  console.log(`Signature: ${utils.bytesToHex(signature)}\n`);

  // Verify locally
  const localVerify = schnorr.verify(signature, messageHash, pubkey);
  console.log(`Local BIP-340 verification: ${localVerify ? '✅' : '❌'}\n`);

  // Create proof with witness
  const witness: P2PKWitness = { signatures: [utils.bytesToHex(signature)] };
  const proofWithWitness: Proof = {
    ...proof,
    witness: JSON.stringify(witness)
  };

  console.log('Swap request will contain:');
  console.log(JSON.stringify({
    inputs: [proofWithWitness],
    outputs: [{ amount: 1, B_: '(blinded)', id: proof.id }]
  }, null, 2));
  console.log();

  try {
    console.log('Attempting swap...\n');
    const newTokens = await swapTokens(mintA, [proofWithWitness], 1);
    console.log(`✅ P2PK SWAP SUCCESSFUL!`);
    console.log(`🎉 PROBLEM SOLVED!\n`);
  } catch (error) {
    console.log(`❌ P2PK swap FAILED`);
    console.error(`Error: ${error}\n`);

    console.log('💡 ANALYSIS:');
    console.log('  - Regular (non-P2PK) swaps: ✅ WORK');
    console.log('  - P2PK signature verification in Python: ✅ WORKS');
    console.log('  - Local BIP-340 verification: ✅ WORKS');
    console.log('  - But Nutshell rejects P2PK swap: ❌ FAILS');
    console.log();
    console.log('  This suggests the issue is NOT:');
    console.log('    - Signature format (it\'s valid!)');
    console.log('    - BDHKE/C verification (regular swaps work!)');
    console.log();
    console.log('  Possible remaining issues:');
    console.log('    1. Swap request format specific to P2PK');
    console.log('    2. Witness JSON serialization format');
    console.log('    3. Some other validation beyond signature\n');
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
