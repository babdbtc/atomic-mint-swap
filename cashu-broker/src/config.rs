use crate::error::BrokerError;
use serde::{Deserialize, Serialize};
use std::env;

/// Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// HTTP server host (default: 0.0.0.0)
    pub host: String,

    /// HTTP server port (default: 3000)
    pub port: u16,

    /// Database URL (default: sqlite://broker.db)
    pub database_url: String,

    /// Log level (default: info)
    pub log_level: String,

    /// CORS allowed origins (comma-separated)
    pub cors_origins: Vec<String>,

    /// Broker fee rate (default: 0.005 = 0.5%)
    pub fee_rate: f64,

    /// Minimum swap amount in sats (default: 1)
    pub min_swap_amount: u64,

    /// Maximum swap amount in sats (default: 10000)
    pub max_swap_amount: u64,

    /// Quote expiry in seconds (default: 300 = 5 minutes)
    pub quote_expiry_seconds: u64,

    /// Mints configuration (JSON array)
    pub mints: Vec<MintConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintConfig {
    pub mint_url: String,
    pub name: String,
    pub unit: String,
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, BrokerError> {
        dotenvy::dotenv().ok();

        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse()
            .map_err(|e| BrokerError::Other(anyhow::anyhow!("Invalid PORT: {}", e)))?;

        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite://broker.db".to_string());

        let log_level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());

        let cors_origins = env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();

        let fee_rate = env::var("FEE_RATE")
            .unwrap_or_else(|_| "0.005".to_string())
            .parse()
            .map_err(|e| BrokerError::Other(anyhow::anyhow!("Invalid FEE_RATE: {}", e)))?;

        let min_swap_amount = env::var("MIN_SWAP_AMOUNT")
            .unwrap_or_else(|_| "1".to_string())
            .parse()
            .map_err(|e| BrokerError::Other(anyhow::anyhow!("Invalid MIN_SWAP_AMOUNT: {}", e)))?;

        let max_swap_amount = env::var("MAX_SWAP_AMOUNT")
            .unwrap_or_else(|_| "10000".to_string())
            .parse()
            .map_err(|e| BrokerError::Other(anyhow::anyhow!("Invalid MAX_SWAP_AMOUNT: {}", e)))?;

        let quote_expiry_seconds = env::var("QUOTE_EXPIRY_SECONDS")
            .unwrap_or_else(|_| "300".to_string())
            .parse()
            .map_err(|e| {
                BrokerError::Other(anyhow::anyhow!("Invalid QUOTE_EXPIRY_SECONDS: {}", e))
            })?;

        // Parse mints from JSON array
        let mints_json = env::var("MINTS")
            .map_err(|_| BrokerError::Other(anyhow::anyhow!("MINTS environment variable is required")))?;

        let mints: Vec<MintConfig> = serde_json::from_str(&mints_json)
            .map_err(|e| BrokerError::Other(anyhow::anyhow!("Invalid MINTS JSON: {}", e)))?;

        if mints.is_empty() {
            return Err(BrokerError::Other(anyhow::anyhow!(
                "At least one mint must be configured"
            )));
        }

        Ok(Config {
            host,
            port,
            database_url,
            log_level,
            cors_origins,
            fee_rate,
            min_swap_amount,
            max_swap_amount,
            quote_expiry_seconds,
            mints,
        })
    }

    /// Get server address
    pub fn server_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
