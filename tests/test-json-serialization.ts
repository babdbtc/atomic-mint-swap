/**
 * Test JSON serialization format
 */

import * as p2pk from './src/cashu/p2pk';
import { SigFlag } from './src/cashu/types';

console.log('\n🔍 JSON Serialization Test\n');

// Create a P2PK secret with known values
const secret: any = {
  nonce: "test_nonce_32bytes_long_exactly!".split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').slice(0, 64),
  data: "02" + "a".repeat(64), // Compressed pubkey
  tags: [["sigflag", "SIG_INPUTS"]]
};

console.log('P2PK Secret object:');
console.log(JSON.stringify(secret, null, 2));

console.log('\nSerialized with different formatting:');

// Default JSON.stringify
const default_json = JSON.stringify(["P2PK", secret]);
console.log(`\nDefault:\n${default_json}`);

// Compact (no spaces, like Python json.dumps with separators=(',', ':'))
const compact_json = JSON.stringify(["P2PK", secret], null, 0);
console.log(`\nCompact:\n${compact_json}`);

// Python-style compact (separators=(',', ':'))
const python_style = JSON.stringify(["P2PK", secret]).replace(/\s+/g, '');
console.log(`\nPython-style:\n${python_style}`);

console.log('\nAre they equal?');
console.log(`default == compact: ${default_json === compact_json}`);
console.log(`default == python_style: ${default_json === python_style}`);

console.log('\n📊 Our current serialization function:');
const our_serialization = p2pk.serializeP2PKSecret(secret);
console.log(our_serialization);

console.log('\n⚠️  Key observation:');
console.log('JavaScript JSON.stringify() produces compact JSON by default');
console.log('Python json.dumps() with separators=(\',\', \':\') also produces compact JSON');
console.log('They should be identical for the same object structure.\n');
