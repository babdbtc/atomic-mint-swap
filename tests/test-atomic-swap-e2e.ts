/**
 * End-to-End Atomic Swap Test
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha256';
import * as utils from './src/crypto/utils';
import { MintClient } from './src/cashu/mint-client';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { SigFlag, P2PKWitness, Proof } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';
const MINT_B_URL = 'http://localhost:3339';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('ATOMIC SWAP END-TO-END TEST');
  console.log('='.repeat(70) + '\n');

  const mintA = new MintClient(MINT_A_URL);
  const mintB = new MintClient(MINT_B_URL);

  console.log('SETUP: Generating keys...\n');

  const aliceSecret = utils.generatePrivateKey();
  const alicePoint = utils.getPublicKey(aliceSecret);
  const bobSecret = utils.generatePrivateKey();
  const bobPoint = utils.getPublicKey(bobSecret);

  console.log('Alice secret:', utils.bytesToHex(aliceSecret).slice(0, 16) + '...');
  console.log('Bob secret:', utils.bytesToHex(bobSecret).slice(0, 16) + '...\n');

  console.log('PHASE 1: Alice locks 8 sats on Mint A to Bob\n');
  const aliceTokens = await mintP2PKTokens(mintA, 8, bobPoint, SigFlag.SIG_INPUTS);
  console.log(`Alice locked ${aliceTokens.length} tokens totaling 8 sats on Mint A\n`);

  console.log('PHASE 2: Bob locks 8 sats on Mint B to Alice\n');
  const bobTokens = await mintP2PKTokens(mintB, 8, alicePoint, SigFlag.SIG_INPUTS);
  console.log(`Bob locked ${bobTokens.length} tokens totaling 8 sats on Mint B\n`);

  console.log('PHASE 3: Alice swaps ALL of Bob\'s tokens on Mint B\n');
  
  // Alice signs ALL of Bob's tokens
  const aliceProofsWithWitness = bobTokens.map(token => {
    const messageHash = sha256(new TextEncoder().encode(token.secret));
    const signature = schnorr.sign(messageHash, aliceSecret);
    const witness: P2PKWitness = { signatures: [utils.bytesToHex(signature)] };
    
    return {
      ...token,
      witness: JSON.stringify(witness)
    };
  });
  
  const totalBobAmount = bobTokens.reduce((sum, t) => sum + t.amount, 0);
  await swapTokens(mintB, aliceProofsWithWitness, totalBobAmount);
  console.log('Alice swapped all tokens on Mint B!\n');

  console.log('PHASE 4: Bob swaps ALL of Alice\'s tokens on Mint A\n');
  
  // Bob signs ALL of Alice's tokens
  const bobProofsWithWitness = aliceTokens.map(token => {
    const messageHash = sha256(new TextEncoder().encode(token.secret));
    const signature = schnorr.sign(messageHash, bobSecret);
    const witness: P2PKWitness = { signatures: [utils.bytesToHex(signature)] };
    
    return {
      ...token,
      witness: JSON.stringify(witness)
    };
  });
  
  const totalAliceAmount = aliceTokens.reduce((sum, t) => sum + t.amount, 0);
  await swapTokens(mintA, bobProofsWithWitness, totalAliceAmount);
  console.log('Bob swapped all tokens on Mint A!\n');

  console.log('='.repeat(70));
  console.log('SUCCESS: ATOMIC SWAP COMPLETE!');
  console.log('='.repeat(70));
  console.log('\nAlice: 8 sats on Mint A -> 8 sats on Mint B');
  console.log('Bob: 8 sats on Mint B -> 8 sats on Mint A');
  console.log('\nBoth parties successfully exchanged tokens between mints!\n');
}

main().catch(console.error);
