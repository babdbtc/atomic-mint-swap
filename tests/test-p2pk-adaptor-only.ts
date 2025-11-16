/**
 * Test P2PK adaptor signature specifically
 */

import * as utils from './src/crypto/utils';
import * as p2pk from './src/cashu/p2pk';
import { generateAdaptorSecret } from './src/crypto/adaptor';
import { SigFlag } from './src/cashu/types';

console.log('Testing P2PK adaptor signatures\n');

// Test multiple runs
let successes = 0;
let failures = 0;

for (let i = 0; i < 20; i++) {
  // Generate NEW privkey each time
  const privkey = utils.generatePrivateKey();
  const pubkey = utils.getPublicKey(privkey);

  const secret = p2pk.createP2PKSecret(pubkey, SigFlag.SIG_INPUTS);
  const adaptorSecret = generateAdaptorSecret();

  const sig = p2pk.createP2PKAdaptorSignature(privkey, secret, adaptorSecret);
  const verify = p2pk.verifyP2PKAdaptorSignature(pubkey, secret, sig);

  if (verify.valid) {
    successes++;
  } else {
    failures++;
    if (failures <= 3) {
      console.log(`Run ${i+1}: ❌ ${verify.error}`);
      console.log(`  Pubkey: ${utils.bytesToHex(pubkey).slice(0, 16)}...`);
    }
  }
}

console.log(`\nResults: ${successes} successes, ${failures} failures out of 20`);

if (successes === 20) {
  console.log('✅ All tests passed!');
} else {
  console.log(`❌ ${failures} failures detected`);
}
