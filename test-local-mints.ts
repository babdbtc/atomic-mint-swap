/**
 * Test local mint setup and capabilities
 */

import { MintClient } from './src/cashu/mint-client';

const LOCAL_MINTS = [
  { name: 'Mint A', url: 'http://localhost:3338' },
  { name: 'Mint B', url: 'http://localhost:3339' },
];

async function testMint(name: string, url: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing ${name}: ${url}`);
  console.log('='.repeat(70));

  const client = new MintClient(url);

  try {
    // Get mint info
    const info = await client.getInfo();
    console.log(`\n✅ Mint Info:`);
    console.log(`  Name: ${info.name || 'N/A'}`);
    console.log(`  Version: ${info.version || 'N/A'}`);
    console.log(`  Description: ${info.description || 'N/A'}`);

    // Check P2PK support
    const supportsP2PK = await client.supportsP2PK();
    console.log(`\n🔐 NUT-11 (P2PK) Support: ${supportsP2PK ? '✅ YES' : '❌ NO'}`);

    if (!supportsP2PK) {
      console.log('⚠️  WARNING: This mint does not support P2PK!');
      console.log('   Atomic swaps require NUT-11 support.');
      return false;
    }

    // Get keysets
    const allKeys = await client.getKeys();
    let activeKeyset = allKeys.keysets.find((k) => k.active);

    // If no explicit active field, use the first keyset
    if (!activeKeyset && allKeys.keysets.length > 0) {
      activeKeyset = allKeys.keysets[0];
    }

    if (!activeKeyset) {
      console.log('❌ No keysets found');
      return false;
    }

    console.log(`\n⭐ Keyset: ${activeKeyset.id}`);
    console.log(`  Unit: ${activeKeyset.unit}`);
    console.log(`  Denominations: ${Object.keys(activeKeyset.keys).length} keys`);

    const amounts = Object.keys(activeKeyset.keys)
      .map(k => parseInt(k))
      .sort((a, b) => a - b);
    console.log(`  Available amounts: ${amounts.slice(0, 10).join(', ')}${amounts.length > 10 ? '...' : ''}`);

    // Show a sample public key
    const firstAmount = amounts[0];
    const pubkey = activeKeyset.keys[firstAmount];
    console.log(`\n  Sample key (amount ${firstAmount}): ${pubkey.slice(0, 32)}...`);

    console.log(`\n✅ ${name} is ready for atomic swaps!`);
    return true;

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`\n💡 Make sure the mint is running:`);
    console.log(`   docker-compose up -d`);
    return false;
  }
}

async function main() {
  console.log('\n🧪 Local Mint Test\n');
  console.log('Testing local Cashu mints for atomic swap compatibility...\n');

  let allReady = true;

  for (const mint of LOCAL_MINTS) {
    const ready = await testMint(mint.name, mint.url);
    if (!ready) allReady = false;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('\n📊 Summary\n');

  if (allReady) {
    console.log('✅ All mints are ready!');
    console.log('\n🎯 You can now run the end-to-end atomic swap test:');
    console.log('   npx tsx test-atomic-swap-e2e.ts');
  } else {
    console.log('❌ Some mints are not ready');
    console.log('\n💡 Try running:');
    console.log('   ./setup-local-mints.sh');
  }

  console.log('');
}

main().catch(console.error);
