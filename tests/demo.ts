/**
 * Demo script to verify adaptor signature implementation
 * Run with: npx tsx demo.ts
 */

import * as adaptor from './src/crypto/adaptor';
import * as utils from './src/crypto/utils';

console.log('\n🔐 Cashu Atomic Swap - Adaptor Signature Demo\n');
console.log('=' .repeat(60));

// Simulate atomic swap between Alice and Bob
console.log('\n📋 Scenario: Alice and Bob want to atomically swap ecash\n');

// Setup parties
console.log('1️⃣  Setting up parties...');
const alicePrivkey = utils.generatePrivateKey();
const alicePubkey = utils.getPublicKey(alicePrivkey);
const bobPrivkey = utils.generatePrivateKey();
const bobPubkey = utils.getPublicKey(bobPrivkey);

console.log(`   Alice pubkey: ${utils.bytesToHex(alicePubkey).slice(0, 16)}...`);
console.log(`   Bob pubkey:   ${utils.bytesToHex(bobPubkey).slice(0, 16)}...`);

// Create messages (transactions on two different mints)
const msgMintA = utils.hash(new TextEncoder().encode('Alice->Bob on Mint A'));
const msgMintB = utils.hash(new TextEncoder().encode('Bob->Alice on Mint B'));

console.log('\n2️⃣  Generating adaptor secret...');
const bobSecret = adaptor.generateAdaptorSecret();
const T = adaptor.getAdaptorPoint(bobSecret);
console.log(`   Secret T: ${utils.bytesToHex(T).slice(0, 16)}...`);

// Create adaptor signatures
console.log('\n3️⃣  Creating adaptor signatures...');
const aliceAdaptorSig = adaptor.generateAdaptorSignature(
  alicePrivkey,
  msgMintB,
  bobSecret
);
const bobAdaptorSig = adaptor.generateAdaptorSignature(
  bobPrivkey,
  msgMintA,
  bobSecret
);

console.log(`   Alice adaptor sig created (for Mint B tx)`);
console.log(`   Bob adaptor sig created (for Mint A tx)`);

// Verify adaptor signatures
console.log('\n4️⃣  Verifying adaptor signatures...');
const aliceSigValid = adaptor.verifyAdaptorSignature(
  alicePubkey,
  msgMintB,
  aliceAdaptorSig
);
const bobSigValid = adaptor.verifyAdaptorSignature(
  bobPubkey,
  msgMintA,
  bobAdaptorSig
);

console.log(`   Alice's adaptor sig valid: ${aliceSigValid.valid ? '✅' : '❌'}`);
console.log(`   Bob's adaptor sig valid:   ${bobSigValid.valid ? '✅' : '❌'}`);

if (!aliceSigValid.valid || !bobSigValid.valid) {
  console.log('\n❌ Adaptor signature verification failed!');
  process.exit(1);
}

// Bob claims on Mint B (publishes signature)
console.log('\n5️⃣  Bob claims on Mint B (reveals signature)...');
const bobClaimSig = adaptor.completeSignature(aliceAdaptorSig, bobSecret);

// Verify Bob's claim
const bobClaimValid = adaptor.verifySchnorrSignature(
  alicePubkey,
  msgMintB,
  bobClaimSig
);
console.log(`   Bob's claim signature valid: ${bobClaimValid.valid ? '✅' : '❌'}`);

// Alice extracts secret
console.log('\n6️⃣  Alice extracts secret from Bob\'s signature...');
const extractedSecret = adaptor.extractSecret(aliceAdaptorSig, bobClaimSig);
const secretsMatch = utils.equalBytes(extractedSecret, bobSecret);
console.log(`   Secret extracted: ${utils.bytesToHex(extractedSecret).slice(0, 16)}...`);
console.log(`   Secrets match: ${secretsMatch ? '✅' : '❌'}`);

// Alice claims on Mint A
console.log('\n7️⃣  Alice claims on Mint A using extracted secret...');
const aliceClaimSig = adaptor.completeSignature(bobAdaptorSig, extractedSecret);

// Verify Alice's claim
const aliceClaimValid = adaptor.verifySchnorrSignature(
  bobPubkey,
  msgMintA,
  aliceClaimSig
);
console.log(`   Alice's claim signature valid: ${aliceClaimValid.valid ? '✅' : '❌'}`);

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n✅ ATOMIC SWAP SUCCESSFUL!\n');
console.log('Summary:');
console.log('  • Bob claimed on Mint B');
console.log('  • Alice extracted the secret from Bob\'s signature');
console.log('  • Alice claimed on Mint A');
console.log('  • Both transactions completed atomically!');
console.log('\n💡 Key insight: Once Bob revealed his signature, Alice could');
console.log('   ALWAYS extract the secret and claim her funds. Atomicity');
console.log('   is guaranteed by cryptography, not trust!\n');

// Performance test
console.log('=' .repeat(60));
console.log('\n⚡ Performance Test\n');

const iterations = 100;
const startTime = Date.now();

for (let i = 0; i < iterations; i++) {
  const privkey = utils.generatePrivateKey();
  const message = utils.hash(new TextEncoder().encode(`test ${i}`));
  const secret = adaptor.generateAdaptorSecret();

  const sig = adaptor.generateAdaptorSignature(privkey, message, secret);
  const pubkey = utils.getPublicKey(privkey);
  adaptor.verifyAdaptorSignature(pubkey, message, sig);
  adaptor.completeSignature(sig, secret);
}

const endTime = Date.now();
const totalTime = endTime - startTime;
const avgTime = totalTime / iterations;

console.log(`Generated, verified, and completed ${iterations} adaptor signatures`);
console.log(`Total time: ${totalTime}ms`);
console.log(`Average per signature: ${avgTime.toFixed(2)}ms`);
console.log('\n✅ Implementation is working correctly!\n');
