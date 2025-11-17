//! # Cashu Broker
//!
//! A broker service that facilitates atomic swaps of ecash between different
//! Cashu mints using Schnorr adaptor signatures.
//!
//! ## Overview
//!
//! This broker provides liquidity across multiple Cashu mints, enabling users to
//! atomically swap ecash without Lightning transactions. The broker earns fees
//! for providing this liquidity.
//!
//! ## Example
//!
//! ```no_run
//! use cashu_broker::{Broker, BrokerConfig, MintConfig};
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     let config = BrokerConfig {
//!         mints: vec![
//!             MintConfig {
//!                 mint_url: "http://localhost:3338".to_string(),
//!                 name: "Mint A".to_string(),
//!                 unit: "sat".to_string(),
//!             },
//!             MintConfig {
//!                 mint_url: "http://localhost:3339".to_string(),
//!                 name: "Mint B".to_string(),
//!                 unit: "sat".to_string(),
//!             },
//!         ],
//!         fee_rate: 0.005,        // 0.5%
//!         min_swap_amount: 1,
//!         max_swap_amount: 10_000,
//!         quote_expiry_seconds: 300,
//!     };
//!
//!     let broker = Broker::new(config).await?;
//!     broker.initialize(100).await?; // 100 sats on each mint
//!
//!     // Start accepting swap requests
//!     broker.run().await?;
//!
//!     Ok(())
//! }
//! ```

pub mod adaptor;
pub mod api;
pub mod broker;
pub mod config;
pub mod db;
pub mod error;
pub mod liquidity;
pub mod swap;
pub mod types;

pub use api::AppState;
pub use broker::Broker;
pub use config::Config;
pub use db::Database;
pub use error::{BrokerError, Result};
pub use types::{BrokerConfig, MintConfig, SwapQuote, SwapRequest};
