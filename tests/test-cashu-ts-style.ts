/**
 * Test P2PK signing EXACTLY like cashu-ts does it
 * Using BIP-340 Schnorr from @noble/curves/secp256k1
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha256';
import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n🎯 Testing P2PK EXACTLY like cashu-ts\n');

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

  // Get the serialized secret STRING (exactly like cashu-ts)
  const secretString = tokens[0].secret;
  console.log(`Secret string (to sign):\n${secretString}\n`);

  // Hash the secret string (exactly like cashu-ts)
  const secretBytes = new TextEncoder().encode(secretString);
  const messageHash = sha256(secretBytes);
  console.log(`Message hash: ${utils.bytesToHex(messageHash)}\n`);

  // Sign with BIP-340 Schnorr (exactly like cashu-ts)
  console.log('Signing with BIP-340 (@noble/curves/secp256k1)...');
  const signatureBytes = schnorr.sign(messageHash, privkey);
  console.log(`Signature: ${utils.bytesToHex(signatureBytes)}`);
  console.log(`Length: ${signatureBytes.length} bytes\n`);

  // Verify locally
  const verifyResult = schnorr.verify(signatureBytes, messageHash, pubkey);
  console.log(`Local verification: ${verifyResult ? '✅' : '❌'}\n`);

  // Create witness
  const witness: P2PKWitness = {
    signatures: [utils.bytesToHex(signatureBytes)],
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
    console.log(`🎉 cashu-ts style P2PK signatures work!\n`);

  } catch (error) {
    console.log(`❌ SWAP FAILED`);
    console.error(`Error: ${error}\n`);

    console.log('🤔 Analysis:');
    console.log('   - We signed SHA256(secret_string) with BIP-340');
    console.log('   - This matches cashu-ts implementation');
    console.log('   - But Nutshell uses raw=True Schnorr (not BIP-340)');
    console.log('   - There may be an incompatibility between:');
    console.log('     * cashu-ts (BIP-340 Schnorr)');
    console.log('     * Nutshell (raw Schnorr with Python secp256k1)\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
