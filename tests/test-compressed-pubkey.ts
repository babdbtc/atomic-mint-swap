/**
 * Test using compressed public key directly (no x-only conversion)
 */

import * as secp from '@noble/curves/secp256k1.js';
import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n🧪 Test with Compressed Public Key (no x-only)\n');

async function main() {
  const mintA = new MintClient(MINT_A_URL);

  // Create keypair
  const privkey = utils.generatePrivateKey();
  const compressedPubkey = utils.getCompressedPublicKey(privkey); // Get compressed directly!
  const xOnlyPubkey = utils.getPublicKey(privkey);

  console.log(`Privkey: ${utils.bytesToHex(privkey).slice(0, 16)}...`);
  console.log(`Compressed pubkey (33 bytes): ${utils.bytesToHex(compressedPubkey)}`);
  console.log(`X-only pubkey (32 bytes): ${utils.bytesToHex(xOnlyPubkey)}\n`);

  // Mint P2PK locked token - pass x-only as usual
  console.log('Minting 1 sat P2PK token (locked to x-only pubkey)...');
  const tokens = await mintP2PKTokens(
    mintA,
    1,
    xOnlyPubkey,  // Still pass x-only, but P2PK will convert it
    SigFlag.SIG_INPUTS
  );
  console.log(`✅ Minted token\n`);

  // Check what pubkey was stored in the P2PK secret
  const secret = p2pk.deserializeP2PKSecret(tokens[0].secret);
  console.log('P2PK secret data (pubkey):');
  console.log(`  ${secret.data}`);
  console.log(`  Length: ${secret.data.length / 2} bytes\n`);

  // Compare with our compressed pubkey
  console.log('Checking if P2PK pubkey matches our compressed pubkey...');
  const p2pkPubkey = utils.hexToBytes(secret.data);
  console.log(`  P2PK pubkey matches compressed: ${utils.equalBytes(p2pkPubkey, compressedPubkey) ? '✅' : '❌'}\n`);

  if (!utils.equalBytes(p2pkPubkey, compressedPubkey)) {
    console.log('⚠️  WARNING: P2PK pubkey does not match our compressed pubkey!');
    console.log(`  Expected: ${utils.bytesToHex(compressedPubkey)}`);
    console.log(`  Got:      ${secret.data}\n`);
  }

  // Extract x-only from P2PK pubkey for signing
  const p2pkXOnly = p2pkPubkey.slice(1); // Remove prefix
  console.log(`P2PK x-only (extracted): ${utils.bytesToHex(p2pkXOnly)}`);
  console.log(`Our x-only:              ${utils.bytesToHex(xOnlyPubkey)}`);
  console.log(`Match: ${utils.equalBytes(p2pkXOnly, xOnlyPubkey) ? '✅' : '❌'}\n`);

  // Sign with BIP-340
  const serialized = p2pk.serializeP2PKSecret(secret);
  const messageBytes = new TextEncoder().encode(serialized);
  const messageHash = utils.hash(messageBytes);

  console.log('Signing with BIP-340...');
  const signatureBytes = secp.schnorr.sign(messageHash, privkey);
  console.log(`Signature: ${utils.bytesToHex(signatureBytes).slice(0, 32)}...\n`);

  // Verify with x-only pubkey
  const verifyResult = secp.schnorr.verify(signatureBytes, messageHash, xOnlyPubkey);
  console.log(`Verification with x-only: ${verifyResult ? '✅' : '❌'}\n`);

  // Create witness
  const witness: P2PKWitness = {
    signatures: [utils.bytesToHex(signatureBytes)],
  };

  const tokenWithWitness = {
    ...tokens[0],
    witness: JSON.stringify(witness),
  };

  console.log('Attempting to swap...\n');

  try {
    const newTokens = await swapTokens(
      mintA,
      [tokenWithWitness],
      1
    );

    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`Received ${newTokens.length} new token(s)\n`);
    console.log('🎉 P2PK spending is working!\n');

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
