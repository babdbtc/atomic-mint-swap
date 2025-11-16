const secp = require('@noble/curves/secp256k1.js');

console.log('schnorr methods:', Object.keys(secp.schnorr));
console.log('\nsecp256k1 exports:', Object.keys(secp).filter(k => !k.startsWith('_')));
