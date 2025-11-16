/**
 * Minimal P2PK test for detailed logging
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha256';
import * as utils from './src/crypto/utils';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

async function main() {
  console.log('\n🧪 Minimal P2PK Test (check Docker logs)\n');

  const mintA = new MintClient(MINT_A_URL);

  // Create keypair
  const privkey = utils.generatePrivateKey();
  const pubkey = utils.getPublicKey(privkey);

  console.log(`Pubkey: ${utils.bytesToHex(pubkey)}\n`);

  // Mint P2PK token
  console.log('Step 1: Minting P2PK token...');
  const tokens = await mintP2PKTokens(mintA, 1, pubkey, SigFlag.SIG_INPUTS);
  console.log(`✅ Minted\n`);

  // Sign
  console.log('Step 2: Creating signature...');
  const secretString = tokens[0].secret;
  const messageHash = sha256(new TextEncoder().encode(secretString));
  const signature = schnorr.sign(messageHash, privkey);
  console.log(`✅ Signed\n`);

  // Create witness
  const witness: P2PKWitness = {
    signatures: [utils.bytesToHex(signature)],
  };

  const tokenWithWitness = {
    ...tokens[0],
    witness: JSON.stringify(witness),
  };

  // Swap
  console.log('Step 3: Attempting swap...');
  console.log('(Check Docker logs: docker logs cashu-mint-a --tail 100)\n');

  try {
    await swapTokens(mintA, [tokenWithWitness], 1);
    console.log(`✅ SUCCESS!\n`);
  } catch (error) {
    console.log(`❌ FAILED: ${error}\n`);
    console.log('Check logs with: docker logs cashu-mint-a --tail 100\n');
    process.exit(1);
  }
}

main().catch(console.error);
