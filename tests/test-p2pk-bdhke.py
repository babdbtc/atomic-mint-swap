#!/usr/bin/env python3
"""
Test BDHKE verification for P2PK proof
"""
import sys

from cashu.core.crypto.b_dhke import hash_to_curve
from cashu.core.crypto.secp import PrivateKey

# Exact P2PK proof that failed
proof_data = {
    "secret": "[\"P2PK\",{\"nonce\":\"80182c3304c8e684a274e182dff326f0df24d77b219a646e935f4d4c95e4906d\",\"data\":\"0291497f00241ae6b2db9321a2b457a12da6696f603ce6e442183c9c3996e59f09\",\"tags\":[[\"sigflag\",\"SIG_INPUTS\"]]}]",
    "C": "021e90d87d847fcb5d4ea2414e4b7c5ab653e2dd9e3d3085d0ee2bec7f59b75387",
}

# Mint's private key (derive from MINT_PRIVATE_KEY env var)
# The mint uses BIP32 derivation, but for testing we can try to get the actual key
# Actually, we can't easily get the derived key without knowing the exact derivation

print("=" * 70)
print("P2PK BDHKE VERIFICATION")
print("=" * 70)

secret_str = proof_data["secret"]
C_hex = proof_data["C"]

# Compute Y = hash_to_curve(secret)
secret_bytes = secret_str.encode('utf-8')
Y = hash_to_curve(secret_bytes)
Y_hex = Y.serialize().hex()

print(f"\nSecret: {secret_str[:80]}...")
print(f"C: {C_hex}")
print(f"Y = hash_to_curve(secret): {Y_hex}")
print(f"\nFor verification, mint computes k*Y and compares with C")
print("We can't verify without mint's private key k")
print("\nBut we can check if Y was computed correctly:")

# Test if our TypeScript hash_to_curve matches
print(f"\nY should match TypeScript output:")
print(f"Expected: {Y_hex}")

print("\n" + "=" * 70)
print("Next step: Verify Y matches TypeScript implementation")
print("=" * 70)
