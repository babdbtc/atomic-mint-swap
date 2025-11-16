#!/usr/bin/env python3
"""
Test ONLY P2PK signature verification
"""
import hashlib
import json
import sys

# Import from Nutshell
from cashu.core.p2pk import verify_schnorr_signature
from cashu.core.crypto.secp import PublicKey

# Test data
proof_data = {
    "secret": "[\"P2PK\",{\"nonce\":\"3db7accc3ad1fb77cf58b77f00366add0804ff405cb5350a979db30734ea95c6\",\"data\":\"028a4acbe44dc982f54951bed505844491e857c0cfde0e3bfdf8506bd82b6667e1\",\"tags\":[[\"sigflag\",\"SIG_INPUTS\"]]}]",
    "witness": "{\"signatures\":[\"e7184dad6928e4bd5671a0ba2d5a6e96e5fdbb6f69313629adc42e2af4b84f1471d6ca1a47542093058c5cd2bb8ad7a29b3cd11313751cc2a8f30ba356e6e03c\"]}"
}

print("=" * 70)
print("P2PK SIGNATURE VERIFICATION")
print("=" * 70)

secret_str = proof_data["secret"]
witness = json.loads(proof_data["witness"])
signature_hex = witness["signatures"][0]

# Parse P2PK secret
secret_array = json.loads(secret_str)
p2pk_data = secret_array[1]
pubkey_hex = p2pk_data["data"]

print(f"\nSecret: {secret_str[:80]}...")
print(f"Pubkey: {pubkey_hex}")
print(f"Signature: {signature_hex}")

# Hash message
message_bytes = secret_str.encode("utf-8")
message_hash = hashlib.sha256(message_bytes).digest()
print(f"\nMessage hash: {message_hash.hex()}")

# Verify
pubkey_bytes = bytes.fromhex(pubkey_hex)
pubkey = PublicKey(pubkey_bytes, raw=True)
signature_bytes = bytes.fromhex(signature_hex)

is_valid = verify_schnorr_signature(
    message=secret_str.encode("utf-8"),
    pubkey=pubkey,
    signature=signature_bytes
)

print(f"\n✅ Signature valid: {is_valid}")

if not is_valid:
    print("\n❌ FAILED: Signature verification returned False")
    sys.exit(1)

print("\n" + "=" * 70)
print("SUCCESS: P2PK signature is VALID")
print("=" * 70)
print("\nThis confirms:")
print("  1. Our signature format is correct")
print("  2. Our signing process is correct")
print("  3. The issue must be elsewhere in the swap validation")
