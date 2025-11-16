/**
 * Test using actual @cashu/cashu-ts library for P2PK signing
 */

import { getEncodedToken, deriveKeysetId } from '@cashu/cashu-ts';
import { signP2PKSecret } from '@cashu/cashu-ts/src/crypto/NUT11';
import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n📚 Testing with actual @cashu/cashu-ts library\n');

async function main() {
  const mintA = new MintClient(MINT_A_URL);

  // Create keypair
  const privkey = utils.generatePrivateKey();
  const pubkey = utils.getPublicKey(privkey);

  console.log(`Privkey: ${utils.bytesToHex(privkey).slice(0, 16)}...`);
  console.log(`Pubkey (x-only): ${utils.bytesToHex(pubkey)}\n`);

  // Mint P2PK locked token
  console.log('Minting 1 sat P2PK token...');
  const tokens = await mintP2PKTokens(
    mintA,
    1,
    pubkey,
    SigFlag.SIG_INPUTS
  );
  console.log(`✅ Minted token\n`);

  // Get the secret string
  const secretString = tokens[0].secret;
  console.log(`Secret: ${secretString.slice(0, 80)}...\n`);

  // Sign using cashu-ts library function
  console.log('Signing with @cashu/cashu-ts signP2PKSecret()...');
  const signatureHex = signP2PKSecret(secretString, utils.bytesToHex(privkey));
  console.log(`Signature: ${signatureHex}`);
  console.log(`Length: ${signatureHex.length / 2} bytes\n`);

  // Create witness
  const witness: P2PKWitness = {
    signatures: [signatureHex],
  };

  const tokenWithWitness = {
    ...tokens[0],
    witness: JSON.stringify(witness),
  };

  console.log('Attempting to swap with Nutshell...\n');

  try {
    const newTokens = await swapTokens(
      mintA,
      [tokenWithWitness],
      1
    );

    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`🎉 @cashu/cashu-ts library signatures work with Nutshell!\n`);
    console.log(`This confirms cashu-ts and Nutshell are compatible.\n`);

  } catch (error) {
    console.log(`❌ SWAP FAILED`);
    console.error(`Error: ${error}\n`);

    console.log('🤔 This would mean even the official cashu-ts library');
    console.log('   doesn\'t work with Nutshell, which would be a major issue!\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
