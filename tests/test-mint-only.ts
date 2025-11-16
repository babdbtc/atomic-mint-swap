/**
 * Test just minting (no swap) to verify BDHKE still works
 */

import { MintClient } from './src/cashu/mint-client';
import { mintTokens } from './src/cashu/wallet';

const MINT_A_URL = 'http://localhost:3338';

async function main() {
  console.log('\n Testing minting only (no swap)...\n');

  const mintA = new MintClient(MINT_A_URL);

  try {
    const tokens = await mintTokens(mintA, 1);
    console.log(`✅ Minted ${tokens.length} token(s) successfully`);
    console.log(`   Total amount: ${tokens.reduce((sum, t) => sum + t.amount, 0)} sats`);
    console.log(`   C length: ${tokens[0].C.length} chars (${tokens[0].C.length/2} bytes)`);
    console.log(`   First C: ${tokens[0].C}\n`);
  } catch (error) {
    console.log(`❌ Minting failed: ${error}\n`);
    process.exit(1);
  }
}

main().catch(console.error);
