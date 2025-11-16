/**
 * Detailed debugging of adaptor signature math
 */

import * as utils from './src/crypto/utils';

console.log('🔍 Detailed adaptor signature debugging\n');

// Fixed inputs
const x = utils.hexToBytes('0'.repeat(63) + '1'); // privkey
const t = utils.hexToBytes('0'.repeat(63) + '2'); // secret
const r = utils.hexToBytes('0'.repeat(63) + '3'); // nonce
const m = utils.hexToBytes('0'.repeat(64)); // message

console.log('Step 1: Generate points');
const P = utils.scalarMultiplyG(x);
const R = utils.scalarMultiplyG(r);
const T = utils.scalarMultiplyG(t);

console.log(`P (pubkey):  ${utils.bytesToHex(P)}`);
console.log(`R (nonce):   ${utils.bytesToHex(R)}`);
console.log(`T (adaptor): ${utils.bytesToHex(T)}`);

console.log('\nStep 2: Compute challenge');
const e = utils.hashConcat(P, R, m);
console.log(`e (challenge): ${utils.bytesToHex(e)}`);

console.log('\nStep 3: Compute s\' = r + t + e*x');
const ex = utils.multiplyScalars(e, x);
console.log(`  e*x: ${utils.bytesToHex(ex)}`);

const r_plus_t = utils.addScalars(r, t);
console.log(`  r+t: ${utils.bytesToHex(r_plus_t)}`);

const s_prime = utils.addScalars(r_plus_t, ex);
console.log(`  s': ${utils.bytesToHex(s_prime)}`);

console.log('\nStep 4: Verify equation s\'G = T + R + eP');

const lhs = utils.scalarMultiplyG(s_prime);
console.log(`  LHS (s\'G): ${utils.bytesToHex(lhs)}`);

// Compute RHS manually
const P_point = utils.liftX(P);
const R_point = utils.liftX(R);
const T_point = utils.liftX(T);

console.log('\n  Computing RHS...');
const eP_point = P_point.multiply(utils.bytesToBigInt(e));
console.log(`  eP computed`);

const R_plus_T = R_point.add(T_point);
console.log(`  R+T computed`);

const rhs_point = R_plus_T.add(eP_point);
console.log(`  (R+T)+eP computed`);

const rhs = utils.bigIntToBytes(rhs_point.toAffine().x);
console.log(`  RHS: ${utils.bytesToHex(rhs)}`);

console.log(`\nEquation holds: ${utils.equalBytes(lhs, rhs)}`);

// If they don't match, let's check each component
if (!utils.equalBytes(lhs, rhs)) {
  console.log('\n❌ Equation does not hold! Debugging...\n');

  // Check if (r+t+ex)G = rG + tG + (ex)G
  const rG = utils.scalarMultiplyG(r);
  const tG = utils.scalarMultiplyG(t);
  const exG = utils.scalarMultiplyG(ex);

  console.log('Checking component additions:');
  console.log(`  rG:  ${utils.bytesToHex(rG)}`);
  console.log(`  tG:  ${utils.bytesToHex(tG)}`);
  console.log(`  exG: ${utils.bytesToHex(exG)}`);

  const rG_point = utils.liftX(rG);
  const tG_point = utils.liftX(tG);
  const exG_point = utils.liftX(exG);

  const rG_plus_tG = rG_point.add(tG_point);
  const sum = rG_plus_tG.add(exG_point);
  const sumX = utils.bigIntToBytes(sum.toAffine().x);

  console.log(`  rG+tG+exG: ${utils.bytesToHex(sumX)}`);
  console.log(`  Matches s'G: ${utils.equalBytes(lhs, sumX)}`);
}
