/**
 * Test to understand point prefix behavior
 */

import * as secp from '@noble/secp256k1';
import * as utils from './src/crypto/utils';

// Test with a specific x-coordinate
const testHash = utils.hexToBytes('542a2d15918f42799cdc72a6d8bae7600e13c8f16ae0f0c5fd32cfd1340a5094');

// Create compressed point with 02 prefix (even y)
const compressed = new Uint8Array(33);
compressed[0] = 0x02;
compressed.set(testHash, 1);

console.log('Input (02 prefix):  ', utils.bytesToHex(compressed));

// Parse as point
const point = secp.Point.fromHex(compressed);

// Serialize back
const serialized = utils.hexToBytes(point.toHex(true));

console.log('Output (toHex true):', utils.bytesToHex(serialized));
console.log('Match:', utils.bytesToHex(compressed) === utils.bytesToHex(serialized) ? 'YES' : 'NO');

// Check the point's y-coordinate
const affine = point.toAffine();
const yIsEven = affine.y % 2n === 0n;
console.log('Y is even:', yIsEven);
console.log('Expected prefix:', yIsEven ? '02' : '03');
