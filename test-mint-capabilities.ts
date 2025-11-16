/**
 * Test mint capabilities for NUT-11 P2PK support
 */

import { MintClient } from './src/cashu/mint-client';

const TESTNET_MINTS = [
  'https://testnut.cashu.space',
  'https://nofees.testnut.cashu.space',
];

async function checkMintCapabilities(mintUrl: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Checking mint: ${mintUrl}`);
  console.log('='.repeat(70));

  const client = new MintClient(mintUrl);

  try {
    // Get mint info
    const info = await client.getInfo();
    console.log(`\n✅ Mint Info:`);
    console.log(`  Name: ${info.name || 'N/A'}`);
    console.log(`  Version: ${info.version || 'N/A'}`);
    console.log(`  Description: ${info.description || 'N/A'}`);

    // Check supported NUTs
    console.log(`\n📋 Supported NUTs:`);
    if (info.nuts) {
      for (const [nutNum, config] of Object.entries(info.nuts)) {
        const nutName = getNutName(parseInt(nutNum));
        console.log(`  NUT-${nutNum.padStart(2, '0')}: ${nutName}`);
        if (Object.keys(config).length > 0) {
          console.log(`    Config: ${JSON.stringify(config)}`);
        }
      }
    }

    // Check P2PK support specifically
    const supportsP2PK = await client.supportsP2PK();
    console.log(`\n🔐 NUT-11 (P2PK) Support: ${supportsP2PK ? '✅ YES' : '❌ NO'}`);

    // Check HTLC support
    const supportsHTLC = await client.supportsHTLC();
    console.log(`🔒 NUT-14 (HTLC) Support: ${supportsHTLC ? '✅ YES' : '❌ NO'}`);

    // Get keysets
    const keysets = await client.getKeysets();
    console.log(`\n🔑 Available Keysets: ${keysets.keysets.length}`);
    for (const keyset of keysets.keysets.slice(0, 3)) {
      const keysetId = typeof keyset === 'string' ? keyset : (keyset as any).id;
      console.log(`  - ${keysetId}`);
    }
    if (keysets.keysets.length > 3) {
      console.log(`  ... and ${keysets.keysets.length - 3} more`);
    }

    // Get keys to find active keyset
    try {
      const allKeys = await client.getKeys();
      const activeKeyset = allKeys.keysets.find((k) => k.active);

      if (activeKeyset) {
        console.log(`\n⭐ Active Keyset: ${activeKeyset.id}`);
        console.log(`  Unit: ${activeKeyset.unit}`);
        console.log(`  Denominations: ${Object.keys(activeKeyset.keys).length} keys`);
        const amounts = Object.keys(activeKeyset.keys)
          .map(k => parseInt(k))
          .sort((a, b) => a - b);
        console.log(`  Amounts: ${amounts.join(', ')}`);
      } else {
        // If no active keyset found in response, just show first keyset
        const firstKeyset = allKeys.keysets[0];
        if (firstKeyset) {
          console.log(`\n⭐ First Available Keyset: ${firstKeyset.id}`);
          console.log(`  Unit: ${firstKeyset.unit}`);
          console.log(`  Denominations: ${Object.keys(firstKeyset.keys).length} keys`);
        }
      }
    } catch (keyError) {
      console.log(`\n⚠️  Could not fetch keyset details: ${keyError instanceof Error ? keyError.message : String(keyError)}`);
    }

    return { success: true, supportsP2PK, supportsHTLC };
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, supportsP2PK: false, supportsHTLC: false };
  }
}

function getNutName(nutNum: number): string {
  const nutNames: Record<number, string> = {
    0: 'Notation, Utilization and Terminology',
    1: 'Mint public key exchange',
    2: 'Keysets and fees',
    3: 'Swap tokens',
    4: 'Mint tokens via payment request',
    5: 'Melting tokens',
    6: 'Mint info',
    7: 'Token state check',
    8: 'Overpaid Lightning fees',
    9: 'Signature restore',
    10: 'Spending conditions',
    11: 'Pay-To-Pubkey (P2PK)',
    12: 'DLEQ proofs',
    13: 'Deterministic secrets',
    14: 'HTLCs',
    15: 'Partial multi-path payments (MPP)',
  };
  return nutNames[nutNum] || 'Unknown';
}

async function main() {
  console.log('\n🧪 Cashu Mint Capabilities Test\n');

  const results = [];

  for (const mintUrl of TESTNET_MINTS) {
    const result = await checkMintCapabilities(mintUrl);
    results.push({ mintUrl, ...result });
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('\n📊 Summary\n');

  for (const result of results) {
    console.log(`${result.mintUrl}`);
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  P2PK: ${result.supportsP2PK ? '✅' : '❌'}`);
    console.log(`  HTLC: ${result.supportsHTLC ? '✅' : '❌'}`);
  }

  const p2pkMints = results.filter(r => r.supportsP2PK);
  console.log(`\n✅ Found ${p2pkMints.length}/${results.length} mints with NUT-11 P2PK support`);

  if (p2pkMints.length > 0) {
    console.log('\n💡 These mints can be used for atomic swap testing!');
  }
}

main().catch(console.error);
