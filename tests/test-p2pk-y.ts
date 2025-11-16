import { hashToCurve } from './src/crypto/bdhke';
import * as utils from './src/crypto/utils';

const secret = '["P2PK",{"nonce":"80182c3304c8e684a274e182dff326f0df24d77b219a646e935f4d4c95e4906d","data":"0291497f00241ae6b2db9321a2b457a12da6696f603ce6e442183c9c3996e59f09","tags":[["sigflag","SIG_INPUTS"]]}]';

const Y = hashToCurve(secret);
console.log("Y =", utils.bytesToHex(Y));
console.log("Expected: 02b4d75a6c8493d34c8cddfda04339b43103bb601ffd5aa63568d5272d3555e589");
console.log("Match:", utils.bytesToHex(Y) === "02b4d75a6c8493d34c8cddfda04339b43103bb601ffd5aa63568d5272d3555e589");
