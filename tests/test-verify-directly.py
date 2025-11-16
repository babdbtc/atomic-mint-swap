#!/usr/bin/env python3
"""
Test verification directly using Nutshell's code
This will be run inside the Docker container
"""
import hashlib
import json
import sys

# Import from Nutshell
try:
    from cashu.core.p2pk import verify_schnorr_signature
    from cashu.core.crypto.secp import PublicKey
    from cashu.core.bdhke import hash_to_curve
    print("✅ Nutshell imports successful\n")
except Exception as e:
    print(f"❌ Import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test data from our TypeScript test
proof_data = {
    "amount": 1,
    "secret": "[\"P2PK\",{\"nonce\":\"3db7accc3ad1fb77cf58b77f00366add0804ff405cb5350a979db30734ea95c6\",\"data\":\"028a4acbe44dc982f54951bed505844491e857c0cfde0e3bfdf8506bd82b6667e1\",\"tags\":[[\"sigflag\",\"SIG_INPUTS\"]]}]",
    "C": "0281f8d2c9bdb517681647362f150f1ee07a0926fc558fd884e76f08d664731f85",
    "id": "0079c0327c8cecc6",
    "witness": "{\"signatures\":[\"e7184dad6928e4bd5671a0ba2d5a6e96e5fdbb6f69313629adc42e2af4b84f1471d6ca1a47542093058c5cd2bb8ad7a29b3cd11313751cc2a8f30ba356e6e03c\"]}"
}

print("=" * 70)
print("VERIFICATION TEST")
print("=" * 70)

# Step 1: Test P2PK signature verification
print("\nStep 1: P2PK Signature Verification")
print("-" * 70)

secret_str = proof_data["secret"]
witness_str = proof_data["witness"]

# Parse witness
witness = json.loads(witness_str)
signature_hex = witness["signatures"][0]

# Parse P2PK secret
secret_array = json.loads(secret_str)
if secret_array[0] == "P2PK":
    p2pk_data = secret_array[1]
    pubkey_hex = p2pk_data["data"]
    print(f"Pubkey: {pubkey_hex}")
    print(f"Signature: {signature_hex}")

    # Hash the message
    message_bytes = secret_str.encode("utf-8")
    message_hash = hashlib.sha256(message_bytes).digest()
    print(f"Message hash: {message_hash.hex()}")

    # Verify
    try:
        pubkey_bytes = bytes.fromhex(pubkey_hex)
        pubkey = PublicKey(pubkey_bytes, raw=True)

        signature_bytes = bytes.fromhex(signature_hex)

        is_valid = verify_schnorr_signature(
            message=secret_str.encode("utf-8"),
            pubkey=pubkey,
            signature=signature_bytes
        )

        print(f"\nP2PK signature valid: {is_valid}")

        if not is_valid:
            print("❌ P2PK signature verification FAILED!")
            sys.exit(1)
        else:
            print("✅ P2PK signature verification PASSED!")

    except Exception as e:
        print(f"❌ Error verifying P2PK: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

# Step 2: Test BDHKE verification
print("\n\nStep 2: BDHKE (C signature) Verification")
print("-" * 70)

try:
    # Hash to curve
    Y = hash_to_curve(secret_str.encode("utf-8"))
    print(f"Y = hash_to_curve(secret): {Y.hex()}")

    # We would need the mint's private key to fully verify C
    # But let's at least check if C is a valid point
    C_hex = proof_data["C"]
    C_bytes = bytes.fromhex(C_hex)
    print(f"C (compressed): {C_hex} ({len(C_bytes)} bytes)")

    try:
        C_point = PublicKey(C_bytes, raw=True)
        print("✅ C is a valid point")
    except Exception as e:
        print(f"❌ C is not a valid point: {e}")
        sys.exit(1)

except Exception as e:
    print(f"❌ BDHKE verification error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("CONCLUSION")
print("=" * 70)
print("\nIf P2PK signature passed but swap fails, the issue is likely:")
print("1. BDHKE verification (C signature) failing")
print("2. Some other validation in the swap endpoint")
print("3. Request format/structure issue")
