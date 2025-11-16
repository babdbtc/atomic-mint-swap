//! Error types for Cashu broker

use thiserror::Error;

pub type Result<T> = std::result::Result<T, BrokerError>;

#[derive(Error, Debug)]
pub enum BrokerError {
    #[error("Insufficient liquidity on mint {mint_url}: need {needed}, have {available}")]
    InsufficientLiquidity {
        mint_url: String,
        needed: u64,
        available: u64,
    },

    #[error("Invalid swap request: {0}")]
    InvalidSwapRequest(String),

    #[error("Quote not found: {0}")]
    QuoteNotFound(String),

    #[error("Quote expired: {0}")]
    QuoteExpired(String),

    #[error("Swap amount {amount} below minimum {min}")]
    AmountTooLow { amount: u64, min: u64 },

    #[error("Swap amount {amount} above maximum {max}")]
    AmountTooHigh { amount: u64, max: u64 },

    #[error("Unsupported mint: {0}")]
    UnsupportedMint(String),

    #[error("Cannot swap to same mint")]
    SameMintSwap,

    #[error("Adaptor signature error: {0}")]
    AdaptorSignature(String),

    #[error("CDK error: {0}")]
    Cdk(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
