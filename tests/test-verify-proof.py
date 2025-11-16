#!/usr/bin/env python3
"""
Test if Nutshell can verify a proof we created
"""
import sys

# Import from Nutshell
from cashu.core.crypto.b_dhke import hash_to_curve, step3_alice
from cashu.core.crypto.secp import PublicKey, PrivateKey

# Our proof from TypeScript test
proof_data = {
    "amount": 1,
    "secret": "e67cce5fdda4ca9fc53d06578b0a1aebbe0bef9afb6ba2d6c9cd6cfd234a75a2",
    "C": "02fcb5bf889a564f4b5ddeb59f706027cc56a54dec1959c2280f72a139c702cb50",
    "id": "0079c0327c8cecc6"
}

# Mint's private key (from docker-compose.yml)
mint_privkey_str = "secret_key_mint_a_12345678901234567890123456789012"
mint_privkey_bytes = mint_privkey_str.encode('utf-8')[:32]  # Take first 32 bytes
mint_privkey = PrivateKey(mint_privkey_bytes, raw=True)
mint_pubkey = mint_privkey.pubkey

print("=" * 70)
print("PROOF VERIFICATION TEST")
print("=" * 70)

print(f"\nProof secret: {proof_data['secret']}")
print(f"Proof C: {proof_data['C']}")

# Step 1: Compute Y = hash_to_curve(secret)
secret_bytes = proof_data['secret'].encode('utf-8')
Y = hash_to_curve(secret_bytes)
Y_hex = Y.serialize().hex()
print(f"\nY = hash_to_curve(secret): {Y_hex}")

# Step 2: Compute k*Y (what C should equal)
k_Y = Y.mult(mint_privkey)
k_Y_hex = k_Y.serialize().hex()
print(f"k*Y (expected C): {k_Y_hex}")

# Step 3: Compare with our C
C_hex = proof_data['C']
print(f"Our C:            {C_hex}")

if k_Y_hex == C_hex:
    print("\n✅ VERIFICATION PASSED: C == k*Y")
else:
    print("\n❌ VERIFICATION FAILED: C != k*Y")
    print(f"\nDifference:")
    print(f"  Expected: {k_Y_hex}")
    print(f"  Got:      {C_hex}")
    sys.exit(1)

print("\n" + "=" * 70)
print("SUCCESS: Proof is valid!")
print("=" * 70)
