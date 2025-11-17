//! Schnorr adaptor signature primitives
//!
//! Wrapper around schnorr_fun for atomic swap functionality

use crate::error::{BrokerError, Result};
use schnorr_fun::{
    adaptor::{Adaptor, EncryptedSignature, EncryptedSign},
    fun::{Scalar, Point, KeyPair, g, G},
    Message, Schnorr,
};
use secp256kfun::{nonce, marker::*};
use sha2::Sha256;

/// Adaptor signature context for atomic swaps
pub struct AdaptorContext {
    schnorr: Schnorr<Sha256, nonce::Deterministic<Sha256>>,
}

impl AdaptorContext {
    /// Create a new adaptor context
    pub fn new() -> Self {
        Self {
            schnorr: Schnorr::<Sha256, _>::default(),
        }
    }

    /// Generate a random adaptor secret
    pub fn generate_adaptor_secret(&self) -> Scalar {
        Scalar::random(&mut rand::thread_rng())
    }

    /// Derive adaptor point from secret: T = t * G
    pub fn adaptor_point_from_secret(&self, secret: &Scalar) -> Point {
        g!(secret * G).normalize()
    }

    /// Create an encrypted signature (adaptor signature)
    ///
    /// This locks the signature to require knowledge of the adaptor secret
    pub fn create_encrypted_signature(
        &self,
        signing_key: &Scalar,
        encryption_point: &Point,
        message: &[u8],
    ) -> Result<EncryptedSignature> {
        // Convert scalar to KeyPair for EvenY
        let keypair = KeyPair::<EvenY>::new_xonly(*signing_key);

        let msg = Message::<Public>::plain("cashu-swap", message);

        Ok(self.schnorr.encrypted_sign(&keypair, encryption_point, msg))
    }

    /// Verify an encrypted signature without decrypting
    pub fn verify_encrypted_signature(
        &self,
        public_key: &Point,
        encryption_point: &Point,
        message: &[u8],
        encrypted_sig: &EncryptedSignature,
    ) -> Result<()> {
        let msg = Message::<Public>::plain("cashu-swap", message);

        // Convert public key to EvenY by converting to xonly bytes and back
        // This will fail if the point doesn't have an even Y coordinate
        let xonly_bytes = public_key.to_xonly_bytes();
        let public_key_eveny = Point::<EvenY>::from_xonly_bytes(xonly_bytes)
            .ok_or_else(|| BrokerError::AdaptorSignature(
                "Failed to convert public key to EvenY".to_string(),
            ))?;

        if self.schnorr.verify_encrypted_signature(
            &public_key_eveny,
            encryption_point,
            msg,
            encrypted_sig,
        ) {
            Ok(())
        } else {
            Err(BrokerError::AdaptorSignature(
                "Encrypted signature verification failed".to_string(),
            ))
        }
    }

    /// Decrypt an encrypted signature using the adaptor secret
    pub fn decrypt_signature(
        &self,
        decryption_secret: &Scalar,
        encrypted_sig: EncryptedSignature,
    ) -> Result<schnorr_fun::Signature> {
        Ok(self.schnorr.decrypt_signature(*decryption_secret, encrypted_sig))
    }

    /// Recover the adaptor secret from an encrypted and decrypted signature pair
    ///
    /// This is the key insight: when someone decrypts and reveals a signature,
    /// we can extract the adaptor secret they used
    pub fn recover_adaptor_secret(
        &self,
        encryption_point: &Point,
        encrypted_sig: &EncryptedSignature,
        revealed_sig: &schnorr_fun::Signature,
    ) -> Result<Scalar> {
        self.schnorr
            .recover_decryption_key(encryption_point, encrypted_sig, revealed_sig)
            .ok_or_else(|| BrokerError::AdaptorSignature("Failed to recover adaptor secret".to_string()))
    }

    /// Combine two scalars (for tweaking keys): result = a + b
    pub fn add_scalars(&self, a: &Scalar, b: &Scalar) -> Scalar {
        secp256kfun::op::scalar_add(a, b)
            .non_zero()
            .expect("scalar addition should not result in zero")
    }

    /// Compute tweaked public key: P' = P + T
    pub fn tweak_public_key(&self, pubkey: &Point, tweak: &Point) -> Point {
        g!(pubkey + tweak).normalize().non_zero()
            .expect("tweaked public key should not be zero")
    }
}

impl Default for AdaptorContext {
    fn default() -> Self {
        Self::new()
    }
}
