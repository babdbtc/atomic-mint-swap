#!/usr/bin/env python3
"""
Test hash_to_curve to ensure it matches between TypeScript and Python
"""
import sys

# Import from Nutshell
from cashu.core.crypto.b_dhke import hash_to_curve

# Test with a simple secret
test_secrets = [
    "1780e5d1a282122fbcc19e0cfdc4d9a73c1b1a2f0b7f833510ee6c26af2bf38e",
    "test_secret_123",
    '["P2PK",{"nonce":"3db7accc3ad1fb77cf58b77f00366add0804ff405cb5350a979db30734ea95c6","data":"028a4acbe44dc982f54951bed505844491e857c0cfde0e3bfdf8506bd82b6667e1","tags":[["sigflag","SIG_INPUTS"]]}]'
]

print("=" * 70)
print("HASH_TO_CURVE TEST")
print("=" * 70)

for secret in test_secrets:
    secret_bytes = secret.encode('utf-8')
    Y = hash_to_curve(secret_bytes)

    # Y is a PublicKey object, serialize it
    Y_bytes = Y.serialize()

    print(f"\nSecret: {secret[:60]}{'...' if len(secret) > 60 else ''}")
    print(f"Y = hash_to_curve(secret): {Y_bytes.hex()}")
    print(f"Length: {len(Y_bytes)} bytes")

print("\n" + "=" * 70)
print("Run this in TypeScript and compare the Y values!")
print("=" * 70)
