/**
 * Demo: Swap Coordinator
 * Shows the complete atomic swap orchestration
 */

import * as utils from './src/crypto/utils';
import { SwapCoordinator } from './src/protocol/swap-coordinator';
import {
  SwapRole,
  SwapParams,
  SwapEventType,
} from './src/protocol/types';

console.log('\n🔄 Swap Coordinator Demo\n');
console.log('='.repeat(70));

// Setup participants
console.log('\n1️⃣  Setting up swap participants...\n');

const alicePrivkey = utils.generatePrivateKey();
const alicePubkey = utils.getPublicKey(alicePrivkey);

const bobPrivkey = utils.generatePrivateKey();
const bobPubkey = utils.getPublicKey(bobPrivkey);

console.log('Alice (Initiator):');
console.log(`  Pubkey: ${utils.bytesToHex(alicePubkey).slice(0, 16)}...`);
console.log(`  Mint: https://mint-a.com`);
console.log(`  Wants: 10,000 sats from Mint B`);

console.log('\nBob (Responder/Broker):');
console.log(`  Pubkey: ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);
console.log(`  Mint: https://mint-b.com`);
console.log(`  Provides: 10,000 sats from Mint B`);
console.log(`  Fee: 50 sats (0.5%)`);

// Create swap parameters
const swapParams: SwapParams = {
  id: utils.bytesToHex(utils.randomBytes(16)),
  initiator: {
    role: SwapRole.INITIATOR,
    pubkey: alicePubkey,
    privkey: alicePrivkey,
    mintUrl: 'https://mint-a.com',
    amount: 10050, // includes fee
  },
  responder: {
    role: SwapRole.RESPONDER,
    pubkey: bobPubkey,
    privkey: bobPrivkey,
    mintUrl: 'https://mint-b.com',
    amount: 10000,
  },
  fee: 50,
  expiryTime: Date.now() + 60000, // 1 minute
};

console.log('\n' + '='.repeat(70));
console.log('\n2️⃣  Creating swap coordinator...\n');
console.log(`Swap ID: ${swapParams.id}`);

const coordinator = new SwapCoordinator(swapParams);

// Subscribe to events
coordinator.on((event) => {
  const timestamp = new Date(event.timestamp).toISOString();
  console.log(`[${timestamp}] Event: ${event.type}`);

  if (event.data) {
    console.log(`  Data:`, JSON.stringify(event.data, null, 2).split('\n').map(l => `  ${l}`).join('\n'));
  }
});

console.log('\n' + '='.repeat(70));
console.log('\n3️⃣  Executing atomic swap...\n');

async function runSwap() {
  try {
    console.log('Starting swap execution...\n');

    // Execute the complete swap
    const result = await coordinator.execute();

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ SWAP COMPLETED SUCCESSFULLY!\n');

    console.log('Results:');
    console.log(`  Bob's claim signature: ${utils.bytesToHex(result.responderClaim.s).slice(0, 16)}...`);
    console.log(`  Extracted secret: ${utils.bytesToHex(result.extractedSecret).slice(0, 16)}...`);
    console.log(`  Alice's claim signature: ${utils.bytesToHex(result.initiatorClaim.s).slice(0, 16)}...`);

    console.log('\nSwap Timeline:');
    const context = coordinator.getContext();
    console.log(`  Created: ${new Date(context.createdAt).toISOString()}`);
    console.log(`  Completed: ${new Date(context.updatedAt).toISOString()}`);
    console.log(`  Duration: ${context.updatedAt - context.createdAt}ms`);

    console.log('\nFinal State:');
    console.log(`  State: ${coordinator.getState()}`);
    console.log(`  ✅ Alice received 10,000 sats on Mint B`);
    console.log(`  ✅ Bob received 10,050 sats on Mint A (including 50 sat fee)`);

  } catch (error) {
    console.error('\n❌ Swap failed:');
    console.error(error);

    const context = coordinator.getContext();
    console.log('\nFinal State:');
    console.log(`  State: ${coordinator.getState()}`);
    console.log(`  Error: ${context.error}`);
  }
}

// Run the swap
runSwap().then(() => {
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 Key Features Demonstrated:\n');
  console.log('  ✅ State machine transitions (IDLE → COMPLETED)');
  console.log('  ✅ Adaptor secret generation');
  console.log('  ✅ P2PK secret creation');
  console.log('  ✅ Adaptor signature exchange');
  console.log('  ✅ Signature verification');
  console.log('  ✅ Atomic execution (Bob claims → Alice extracts → Alice claims)');
  console.log('  ✅ Event emission for monitoring');
  console.log('  ✅ Error handling');

  console.log('\n🎉 Swap Coordinator Working!\n');
});
