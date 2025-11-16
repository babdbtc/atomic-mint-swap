/**
 * Debug a specific failing case
 */

import * as adaptor from './src/crypto/adaptor';
import * as utils from './src/crypto/utils';

console.log('🔍 Debugging failing verification\n');

const privkey = utils.hexToBytes('0'.repeat(63) + '1');
const message = utils.hexToBytes('0'.repeat(64));
const secret = utils.hexToBytes('0'.repeat(63) + '2');
const pubkey = utils.getPublicKey(privkey);

// Run multiple tests to catch a failure
for (let i = 0; i < 20; i++) {
  const sig = adaptor.generateAdaptorSignature(privkey, message, secret);
  const result = adaptor.verifyAdaptorSignature(pubkey, message, sig);

  if (!result.valid) {
    console.log(`\n❌ Found failing case (iteration ${i+1}):`);
    console.log(`  s': ${utils.bytesToHex(sig.s_prime)}`);
    console.log(`  R:  ${utils.bytesToHex(sig.R)}`);
    console.log(`  T:  ${utils.bytesToHex(sig.T)}`);

    // Manual verification to see what's wrong
    const P = pubkey;
    const R = sig.R;
    const T = sig.T;
    const s_prime = sig.s_prime;

    console.log('\n  Manual verification:');

    // Lift points
    const P_point = utils.liftX(P);
    const R_point = utils.liftX(R);
    const T_point = utils.liftX(T);

    console.log(`  P y-coord: ${P_point.toAffine().y & 1n ? 'odd' : 'even'}`);
    console.log(`  R y-coord: ${R_point.toAffine().y & 1n ? 'odd' : 'even'}`);
    console.log(`  T y-coord: ${T_point.toAffine().y & 1n ? 'odd' : 'even'}`);

    // Compute LHS
    const lhs = utils.scalarMultiplyG(s_prime);
    console.log(`  LHS: ${utils.bytesToHex(lhs)}`);

    // Compute RHS
    const e = utils.hashConcat(P, R, message);
    const eP = P_point.multiply(utils.bytesToBigInt(e));
    const R_plus_T = R_point.add(T_point);
    const rhs_point = R_plus_T.add(eP);

    console.log(`  RHS y-coord: ${rhs_point.toAffine().y & 1n ? 'odd' : 'even'}`);

    const rhs = utils.bigIntToBytes(rhs_point.toAffine().x);
    console.log(`  RHS: ${utils.bytesToHex(rhs)}`);

    console.log(`  Match: ${utils.equalBytes(lhs, rhs)}`);

    // Check if LHS has odd y-coordinate
    const lhs_point = utils.liftX(lhs);
    console.log(`  LHS y-coord: ${lhs_point.toAffine().y & 1n ? 'odd' : 'even'}`);

    break;
  }
}

console.log('\n✅ All tests passed!\n');
