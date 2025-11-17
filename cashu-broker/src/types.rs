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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(alias = "source_mint")]
    pub from_mint: String,       // Mint URL Bob has tokens on
    #[serde(alias = "target_mint")]
    pub to_mint: String,          // Mint URL Bob wants tokens on
    pub amount: u64,              // Amount Bob wants to swap
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "user_pubkey")]
    pub client_public_key: Option<Vec<u8>>, // Bob's signing key (compressed, optional)
}

/// Swap quote from the broker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapQuote {
    #[serde(rename = "id", alias = "quote_id")]
    pub quote_id: String,
    #[serde(rename = "source_mint", alias = "from_mint")]
    pub from_mint: String,
    #[serde(rename = "target_mint", alias = "to_mint")]
    pub to_mint: String,
    #[serde(rename = "amount_in", alias = "input_amount")]
    pub input_amount: u64,        // What Bob pays
    #[serde(rename = "amount_out", alias = "output_amount")]
    pub output_amount: u64,       // What Bob receives (after fee)
    pub fee: u64,                 // Broker fee
    pub fee_rate: f64,            // Fee percentage
    #[serde(rename = "broker_pubkey", alias = "broker_public_key", with = "hex_serde")]
    pub broker_public_key: Vec<u8>, // Broker's signing key (compressed)
    #[serde(with = "hex_serde")]
    pub adaptor_point: Vec<u8>,   // Adaptor point for atomic swap (compressed)
    #[serde(skip_serializing_if = "Option::is_none", with = "hex_serde_opt")]
    pub tweaked_pubkey: Option<Vec<u8>>,  // Tweaked pubkey P' = P + T (compressed, optional)
    #[serde(skip_serializing)]
    pub adaptor_secret: Vec<u8>,  // Adaptor secret (NOT shared with client in API)
    #[serde(rename = "expires_in")]
    pub expires_in: u64,          // Seconds until expiry (for API)
    #[serde(skip)]
    pub expires_at: SystemTime,   // Internal expiry time
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

impl std::fmt::Display for SwapStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SwapStatus::Pending => write!(f, "pending"),
            SwapStatus::Accepted => write!(f, "accepted"),
            SwapStatus::Completed => write!(f, "completed"),
            SwapStatus::Expired => write!(f, "expired"),
            SwapStatus::Failed => write!(f, "failed"),
        }
    }
}

impl std::str::FromStr for SwapStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pending" => Ok(SwapStatus::Pending),
            "accepted" => Ok(SwapStatus::Accepted),
            "completed" => Ok(SwapStatus::Completed),
            "expired" => Ok(SwapStatus::Expired),
            "failed" => Ok(SwapStatus::Failed),
            _ => Err(format!("Invalid swap status: {}", s)),
        }
    }
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

// Helper for hex serialization of Vec<u8>
mod hex_serde {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(bytes))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let hex_str = String::deserialize(deserializer)?;
        hex::decode(&hex_str).map_err(serde::de::Error::custom)
    }
}

// Helper for hex serialization of Option<Vec<u8>>
mod hex_serde_opt {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &Option<Vec<u8>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match bytes {
            Some(b) => serializer.serialize_str(&hex::encode(b)),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Vec<u8>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt_str: Option<String> = Option::deserialize(deserializer)?;
        opt_str
            .map(|s| hex::decode(&s).map_err(serde::de::Error::custom))
            .transpose()
    }
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
