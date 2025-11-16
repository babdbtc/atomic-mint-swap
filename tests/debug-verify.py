#!/usr/bin/env python3
"""
Debug script to test P2PK signature verification
Run this inside the Nutshell Docker container
"""
import hashlib
import json
from secp256k1 import PublicKey

# Test data from our TypeScript test
secret_string = '["P2PK",{"nonce":"126b8826f32b6168803befcb98a2e2e09183b1428848f5e4355df1b7cf4d8f96","data":"02b121e24e10b42d036307fb3ac5cefb22a5e2ce00471a9926408fbdacd7d0c4de","tags":[["sigflag","SIG_INPUTS"]]}]'

signature_hex = "cf5873abe2cb08df3fcd6d5e886625ea7d2255ae1c815ed04244d2a5382896b179862340eed2228927011a40cb7916fe4c9c1416e4175189ee2e1babfef33192"

pubkey_hex = "02b121e24e10b42d036307fb3ac5cefb22a5e2ce00471a9926408fbdacd7d0c4de"

print("=" * 70)
print("P2PK SIGNATURE VERIFICATION DEBUG")
print("=" * 70)

print(f"\nSecret string:\n{secret_string}\n")
print(f"Signature: {signature_hex}")
print(f"Pubkey: {pubkey_hex}\n")

# Hash the message (same as Nutshell does)
message_bytes = secret_string.encode("utf-8")
message_hash = hashlib.sha256(message_bytes).digest()
print(f"Message hash: {message_hash.hex()}\n")

# Create public key object
try:
    pubkey_bytes = bytes.fromhex(pubkey_hex)
    pubkey = PublicKey(pubkey_bytes, raw=True)
    print(f"✅ Public key created: {len(pubkey_bytes)} bytes\n")
except Exception as e:
    print(f"❌ Failed to create public key: {e}\n")
    exit(1)

# Try to verify the signature
try:
    signature_bytes = bytes.fromhex(signature_hex)
    print(f"Signature bytes: {len(signature_bytes)} bytes")

    # Verify with raw=True (same as Nutshell)
    is_valid = pubkey.schnorr_verify(
        message_hash,
        signature_bytes,
        None,
        raw=True
    )

    print(f"\n{'✅' if is_valid else '❌'} Signature verification: {is_valid}\n")

    if not is_valid:
        print("🔍 Debugging info:")
        print(f"  - Message hash length: {len(message_hash)} bytes")
        print(f"  - Signature length: {len(signature_bytes)} bytes")
        print(f"  - Pubkey length: {len(pubkey_bytes)} bytes")
        print("\n💡 Possible issues:")
        print("  1. Wrong signature format (BIP-340 vs raw Schnorr)")
        print("  2. Message hashing mismatch")
        print("  3. Public key format incompatibility")

except Exception as e:
    print(f"❌ Verification failed with error: {e}\n")
    import traceback
    traceback.print_exc()
