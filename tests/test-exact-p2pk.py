#!/usr/bin/env python3
"""
Test the EXACT P2PK proof that failed in our swap
"""
import hashlib
import json
import sys

from cashu.core.p2pk import verify_schnorr_signature
from cashu.core.crypto.secp import PublicKey

# Exact data from our failed swap
proof_data = {
    "secret": "[\"P2PK\",{\"nonce\":\"80182c3304c8e684a274e182dff326f0df24d77b219a646e935f4d4c95e4906d\",\"data\":\"0291497f00241ae6b2db9321a2b457a12da6696f603ce6e442183c9c3996e59f09\",\"tags\":[[\"sigflag\",\"SIG_INPUTS\"]]}]",
    "witness": "{\"signatures\":[\"bcf3cc0142043dda090042614dbbcf02037a138cd615da81b3a544c77e4e35ecb6cc34fbd3c84223e9bcbf1999176ab780068cc0eafcc5cfeaf90b42e0660e54\"]}"
}

print("=" * 70)
print("EXACT P2PK VERIFICATION TEST")
print("=" * 70)

secret_str = proof_data["secret"]
witness = json.loads(proof_data["witness"])
signature_hex = witness["signatures"][0]

# Parse P2PK secret
secret_array = json.loads(secret_str)
p2pk_data = secret_array[1]
pubkey_hex = p2pk_data["data"]

print(f"\nPubkey: {pubkey_hex}")
print(f"Signature: {signature_hex}")

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
print("SUCCESS: Signature IS VALID")
print("=" * 70)
print("\nThis means:")
print("  1. Our signature is correct")
print("  2. Nutshell is rejecting it for some OTHER reason")
print("  3. Need to investigate Nutshell's P2PK verification logic")
