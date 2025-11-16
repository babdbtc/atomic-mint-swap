/**
 * Test basic P2PK spending without adaptor signatures
 * This isolates P2PK witness creation/verification from adaptor signature complexity
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { mintP2PKTokens, swapTokens } from './src/cashu/wallet';
import { MintClient } from './src/cashu/mint-client';
import { SigFlag, P2PKWitness } from './src/cashu/types';

const MINT_A_URL = 'http://localhost:3338';

console.log('\n🔬 Simple P2PK Test (No Adaptor Signatures)\n');

async function main() {
  const mintA = new MintClient(MINT_A_URL);

  // Create keypair
  const privkey = utils.generatePrivateKey();
  const pubkey = utils.getPublicKey(privkey);

  console.log(`Pubkey: ${utils.bytesToHex(pubkey).slice(0, 16)}...\n`);

  // Mint P2PK locked token
  console.log('Minting 1 sat P2PK token locked to our pubkey...');
  const tokens = await mintP2PKTokens(
    mintA,
    1,
    pubkey,
    SigFlag.SIG_INPUTS
  );
  console.log(`✅ Minted ${tokens.length} P2PK locked token\n`);

  // Create signature for the token
  const secret = p2pk.deserializeP2PKSecret(tokens[0].secret);
  console.log('P2PK secret:');
  console.log(JSON.stringify(secret, null, 2));

  // Sign with our private key
  console.log('\nCreating signature...');
  const signature = p2pk.signP2PKSecret(privkey, secret);
  console.log(`Signature created:`);
  console.log(`  R: ${utils.bytesToHex(signature.R).slice(0, 16)}...`);
  console.log(`  s: ${utils.bytesToHex(signature.s).slice(0, 16)}...`);

  // Create witness
  const witness: P2PKWitness = {
    signatures: [
      utils.bytesToHex(signature.R) + utils.bytesToHex(signature.s)
    ],
  };

  console.log(`\nWitness:`);
  console.log(JSON.stringify(witness, null, 2));

  // Attach witness to token
  const tokenWithWitness = {
    ...tokens[0],
    witness: JSON.stringify(witness),
  };

  console.log(`\nAttempting to swap P2PK token...\n`);

  try {
    const newTokens = await swapTokens(
      mintA,
      [tokenWithWitness],
      1
    );

    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`Received ${newTokens.length} new token(s)\n`);
    console.log('🎉 Basic P2PK spending is working!\n');

  } catch (error) {
    console.log(`❌ SWAP FAILED`);
    console.error(`Error: ${error}\n`);

    if (error instanceof Error && error.message.includes('could not be verified')) {
      console.log('💡 Diagnosis: The P2PK witness signature is not being verified correctly.');
      console.log('   This could be due to:');
      console.log('   1. Incorrect message being signed');
      console.log('   2. Incorrect signature format');
      console.log('   3. Mismatch between pubkey in secret and signing key\n');
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
