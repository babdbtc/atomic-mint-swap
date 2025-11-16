//! Schnorr adaptor signature primitives
//!
//! Wrapper around schnorr_fun for atomic swap functionality

use crate::error::{BrokerError, Result};
use schnorr_fun::{
    adaptor::{Adaptor, EncryptedSignature},
    fun::{marker::*, Scalar, Point},
    Message, Schnorr,
};
use secp256kfun::nonce;
use sha2::Sha256;

/// Adaptor signature context for atomic swaps
pub struct AdaptorContext {
    schnorr: Schnorr<Sha256, nonce::Deterministic<Sha256>>,
}

impl AdaptorContext {
    /// Create a new adaptor signature context
    pub fn new() -> Self {
        Self {
            schnorr: Schnorr::<Sha256, nonce::Deterministic<Sha256>>::default(),
        }
    }

    /// Generate a random adaptor secret (scalar)
    pub fn generate_adaptor_secret(&self) -> Scalar {
        Scalar::random(&mut rand::thread_rng())
    }

    /// Derive adaptor point from secret: T = t * G
    pub fn adaptor_point_from_secret(&self, secret: &Scalar) -> Point {
        secp256kfun::G.clone() * secret
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
        let keypair = signing_key;
        let msg = Message::plain("cashu-swap", message);

        self.schnorr
            .encrypted_sign(keypair, encryption_point, msg)
            .map_err(|e| BrokerError::AdaptorSignature(format!("Failed to create encrypted signature: {:?}", e)))
    }

    /// Verify an encrypted signature without decrypting
    pub fn verify_encrypted_signature(
        &self,
        public_key: &Point,
        encryption_point: &Point,
        message: &[u8],
        encrypted_sig: &EncryptedSignature,
    ) -> Result<()> {
        let msg = Message::plain("cashu-swap", message);

        if self.schnorr.verify_encrypted_signature(
            public_key,
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
        self.schnorr
            .decrypt_signature(decryption_secret.clone(), encrypted_sig)
            .map_err(|e| BrokerError::AdaptorSignature(format!("Failed to decrypt signature: {:?}", e)))
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
            .map_err(|e| BrokerError::AdaptorSignature(format!("Failed to recover adaptor secret: {:?}", e)))
    }

    /// Combine two scalars (for tweaking keys): result = a + b
    pub fn add_scalars(&self, a: &Scalar, b: &Scalar) -> Scalar {
        secp256kfun::op::scalar_add(a, b)
    }

    /// Compute tweaked public key: P' = P + T
    pub fn tweak_public_key(&self, pubkey: &Point, tweak: &Point) -> Point {
        pubkey.clone() + tweak.clone()
    }
}

impl Default for AdaptorContext {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptor_signature_flow() {
        let ctx = AdaptorContext::new();

        // Generate keys
        let alice_secret = Scalar::random(&mut rand::thread_rng());
        let alice_pubkey = secp256kfun::G.clone() * &alice_secret;

        let bob_secret = Scalar::random(&mut rand::thread_rng());
        let bob_pubkey = secp256kfun::G.clone() * &bob_secret;

        // Generate adaptor secret
        let adaptor_secret = ctx.generate_adaptor_secret();
        let adaptor_point = ctx.adaptor_point_from_secret(&adaptor_secret);

        // Alice creates encrypted signature
        let message = b"test swap";
        let encrypted_sig = ctx
            .create_encrypted_signature(&alice_secret, &adaptor_point, message)
            .unwrap();

        // Bob verifies encrypted signature
        ctx.verify_encrypted_signature(&alice_pubkey, &adaptor_point, message, &encrypted_sig)
            .unwrap();

        // Bob decrypts with adaptor secret
        let revealed_sig = ctx.decrypt_signature(&adaptor_secret, encrypted_sig.clone()).unwrap();

        // Alice recovers adaptor secret from revealed signature
        let recovered_secret = ctx
            .recover_adaptor_secret(&adaptor_point, &encrypted_sig, &revealed_sig)
            .unwrap();

        assert_eq!(adaptor_secret, recovered_secret);
    }
}
