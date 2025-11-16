/**
 * Test using @noble/secp256k1's built-in Schnorr signatures
 */

import * as secp from '@noble/secp256k1';
import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n🧪 Testing with @noble/secp256k1 Schnorr\n');

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

  // Get the secret
  const secret = p2pk.deserializeP2PKSecret(tokens[0].secret);
  const serialized = p2pk.serializeP2PKSecret(secret);
  const messageBytes = new TextEncoder().encode(serialized);
  const messageHash = utils.hash(messageBytes);

  console.log('Message to sign:');
  console.log(`  Serialized secret: ${serialized.slice(0, 50)}...`);
  console.log(`  SHA256 hash: ${utils.bytesToHex(messageHash)}\n`);

  // Sign using @noble/secp256k1's built-in Schnorr
  console.log('Signing with @noble/secp256k1.schnorr.sign()...');
  const signatureBytes = await secp.schnorr.sign(messageHash, privkey);
  console.log(`Signature (64 bytes): ${utils.bytesToHex(signatureBytes)}`);
  console.log(`Signature length: ${signatureBytes.length} bytes\n`);

  // Verify locally
  const verifyResult = await secp.schnorr.verify(signatureBytes, messageHash, pubkey);
  console.log(`Local verification: ${verifyResult ? '✅' : '❌'}\n`);

  if (!verifyResult) {
    console.log('❌ Signature verification failed locally!');
    process.exit(1);
  }

  // Create witness with this signature
  const witness: P2PKWitness = {
    signatures: [utils.bytesToHex(signatureBytes)],
  };

  const tokenWithWitness = {
    ...tokens[0],
    witness: JSON.stringify(witness),
  };

  console.log('Attempting to swap with Nutshell mint...\n');

  try {
    const newTokens = await swapTokens(
      mintA,
      [tokenWithWitness],
      1
    );

    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`Received ${newTokens.length} new token(s)\n`);
    console.log('🎉 @noble/secp256k1 Schnorr signatures work with Nutshell!\n');

  } catch (error) {
    console.log(`❌ SWAP FAILED`);
    console.error(`Error: ${error}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
