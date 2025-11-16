#!/usr/bin/env python3
"""
Generate a Schnorr signature using Python secp256k1 (same as Nutshell)
This will help us understand the exact format expected.
"""

import hashlib
import json

try:
    from secp256k1 import PrivateKey, PublicKey
except ImportError:
    print("ERROR: secp256k1 library not installed")
    print("Install with: pip install secp256k1")
    exit(1)

# Generate a new keypair
private_key = PrivateKey()
print("Private Key:", private_key.private_key.hex())

# Get public key in raw format (33 bytes compressed)
pubkey_bytes = private_key.pubkey.serialize(compressed=True)
print(f"Public Key (compressed, 33 bytes): {pubkey_bytes.hex()}")
print(f"Public Key length: {len(pubkey_bytes)} bytes\n")

# Extract x-only (32 bytes) - remove the prefix
x_only = pubkey_bytes[1:]
print(f"Public Key (x-only, 32 bytes): {x_only.hex()}\n")

# Create a P2PK secret (mimicking our TypeScript implementation)
nonce = b"test_nonce_32bytes_long_exactly!"[:32].hex()
p2pk_secret = {
    "nonce": nonce,
    "data": pubkey_bytes.hex(),  # 33 bytes compressed
    "tags": [["sigflag", "SIG_INPUTS"]]
}

# Serialize the secret
serialized = json.dumps(["P2PK", p2pk_secret], separators=(',', ':'))
print(f"Serialized P2PK secret:\n{serialized}\n")

# Hash the serialized secret (this is the message)
message_bytes = serialized.encode("utf-8")
message_hash = hashlib.sha256(message_bytes).digest()
print(f"Message hash: {message_hash.hex()}\n")

# Sign using raw Schnorr (same as Nutshell)
signature = private_key.schnorr_sign(message_hash, None, raw=True)
print(f"Signature (64 bytes): {signature.hex()}")
print(f"Signature length: {len(signature)} bytes\n")

# Verify the signature
pubkey_obj = PublicKey(pubkey_bytes, raw=True)
is_valid = pubkey_obj.schnorr_verify(message_hash, signature, None, raw=True)
print(f"Signature verification: {'✅ VALID' if is_valid else '❌ INVALID'}\n")

# Output for use in TypeScript test
print("=" * 70)
print("COPY THESE VALUES TO TYPESCRIPT TEST:")
print("=" * 70)
print(f"privkey: '{private_key.private_key.hex()}'")
print(f"pubkey_compressed: '{pubkey_bytes.hex()}'")
print(f"pubkey_xonly: '{x_only.hex()}'")
print(f"message_hash: '{message_hash.hex()}'")
print(f"signature: '{signature.hex()}'")
print()
