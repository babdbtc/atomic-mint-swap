//! Type definitions for Cashu broker

use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// Mint configuration that the broker supports
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintConfig {
    pub mint_url: String,
    pub name: String,
    pub unit: String, // 'sat', 'usd', etc.
}

/// Broker configuration
#[derive(Debug, Clone)]
pub struct BrokerConfig {
    pub mints: Vec<MintConfig>,
    pub fee_rate: f64,              // Default 0.005 (0.5%)
    pub min_swap_amount: u64,       // Minimum swap in sats
    pub max_swap_amount: u64,       // Maximum swap in sats
    pub quote_expiry_seconds: u64,  // How long quotes are valid
}

impl Default for BrokerConfig {
    fn default() -> Self {
        Self {
            mints: Vec::new(),
            fee_rate: 0.005,
            min_swap_amount: 1,
            max_swap_amount: 10_000,
            quote_expiry_seconds: 300,
        }
    }
}

/// Swap request from a client (Bob)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapRequest {
    pub client_id: String,
    pub from_mint: String,       // Mint URL Bob has tokens on
    pub to_mint: String,          // Mint URL Bob wants tokens on
    pub amount: u64,              // Amount Bob wants to swap
    pub client_public_key: Vec<u8>, // Bob's signing key (compressed)
}

/// Swap quote from the broker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapQuote {
    pub quote_id: String,
    pub from_mint: String,
    pub to_mint: String,
    pub input_amount: u64,        // What Bob pays
    pub output_amount: u64,       // What Bob receives (after fee)
    pub fee: u64,                 // Broker fee
    pub fee_rate: f64,            // Fee percentage
    pub broker_public_key: Vec<u8>, // Broker's signing key (compressed)
    pub adaptor_point: Vec<u8>,   // Adaptor point for atomic swap (compressed)
    pub adaptor_secret: Vec<u8>,  // Adaptor secret (shared with client)
    #[serde(with = "system_time_serde")]
    pub expires_at: SystemTime,
    pub status: SwapStatus,
}

/// Status of a swap
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SwapStatus {
    Pending,
    Accepted,
    Completed,
    Expired,
    Failed,
}

/// Swap execution details (internal)
#[derive(Debug, Clone)]
pub struct SwapExecution {
    pub quote_id: String,
    pub client_tokens: Vec<u8>,     // Serialized client tokens
    pub broker_tokens: Vec<u8>,    // Serialized broker's tokens
    pub client_swap_complete: bool,
    pub broker_swap_complete: bool,
    pub completed_at: Option<SystemTime>,
}

// Helper for SystemTime serialization
mod system_time_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn serialize<S>(time: &SystemTime, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let duration = time.duration_since(UNIX_EPOCH)
            .map_err(serde::ser::Error::custom)?;
        duration.as_secs().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<SystemTime, D::Error>
    where
        D: Deserializer<'de>,
    {
        let secs = u64::deserialize(deserializer)?;
        Ok(UNIX_EPOCH + std::time::Duration::from_secs(secs))
    }
}
