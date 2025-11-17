//! Main broker service - Charlie
//!
//! Facilitates atomic swaps between different Cashu mints for a fee

use crate::error::Result;
use crate::liquidity::LiquidityManager;
use crate::swap::SwapCoordinator;
use crate::types::{BrokerConfig, SwapQuote, SwapRequest};
use cdk::nuts::Proofs;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// The main broker service ("Charlie")
///
/// Coordinates liquidity management and swap execution across multiple Cashu mints
pub struct Broker {
    config: BrokerConfig,
    liquidity: Arc<LiquidityManager>,
    swap_coordinator: Arc<SwapCoordinator>,
}

impl Broker {
    /// Create a new broker instance
    pub async fn new(config: BrokerConfig) -> Result<Self> {
        println!("\n{}", "=".repeat(70));
        println!("🤖 CHARLIE BROKER SERVICE");
        println!("{}", "=".repeat(70));
        println!("Fee Rate: {:.2}%", config.fee_rate * 100.0);
        println!("Min Swap: {} sats", config.min_swap_amount);
        println!("Max Swap: {} sats", config.max_swap_amount);
        println!("Supported Mints: {}", config.mints.len());

        for mint in &config.mints {
            println!("  - {} ({})", mint.name, mint.mint_url);
        }

        println!("{}\n", "=".repeat(70));

        let liquidity = Arc::new(LiquidityManager::new(config.mints.clone()).await?);
        let swap_coordinator = Arc::new(SwapCoordinator::new(config.clone()));

        Ok(Self {
            config,
            liquidity,
            swap_coordinator,
        })
    }

    /// Initialize broker liquidity on all mints
    ///
    /// In production, the broker would:
    /// - Receive liquidity from users depositing ecash
    /// - Mint via Lightning deposits
    /// - Bootstrap with initial capital
    pub async fn initialize(&self, amount_per_mint: u64) -> Result<()> {
        self.liquidity.initialize_liquidity(amount_per_mint).await
    }

    /// Request a swap quote from the broker
    pub async fn request_quote(&self, request: SwapRequest) -> Result<SwapQuote> {
        let client_id = request.client_id.as_deref().unwrap_or("anonymous");
        println!("\n📨 Swap request from {}", client_id);
        println!("   {} → {}", request.from_mint, request.to_mint);
        println!("   Amount: {} sats\n", request.amount);

        self.swap_coordinator
            .create_quote(request, &self.liquidity)
            .await
    }

    /// Accept a quote and prepare the broker's side of the swap
    ///
    /// Returns the P2PK locked tokens that the broker creates for the client
    pub async fn accept_quote(&self, quote_id: &str, client_pubkey: &[u8]) -> Result<Proofs> {
        println!("\n✅ Client accepted quote {}", quote_id);

        self.swap_coordinator
            .prepare_swap(quote_id, client_pubkey, &self.liquidity)
            .await
    }

    /// Complete a swap after client provides their tokens with witness
    pub async fn complete_swap(&self, quote_id: &str, client_tokens: Proofs) -> Result<()> {
        self.swap_coordinator
            .complete_swap(quote_id, client_tokens, &self.liquidity)
            .await
    }

    /// Get current liquidity status
    pub async fn get_liquidity_status(&self) -> LiquidityStatus {
        let mut mint_balances = Vec::new();

        for mint in &self.config.mints {
            let balance = self.liquidity.get_balance(&mint.mint_url).await;
            mint_balances.push(MintBalance {
                mint_url: mint.mint_url.clone(),
                name: mint.name.clone(),
                balance,
            });
        }

        let total_balance: u64 = mint_balances.iter().map(|mb| mb.balance).sum();

        LiquidityStatus {
            mints: mint_balances,
            total_balance,
        }
    }

    /// Get broker configuration
    pub fn get_config(&self) -> &BrokerConfig {
        &self.config
    }

    /// Print broker status
    pub async fn print_status(&self) {
        println!("\n{}", "=".repeat(70));
        println!("📊 CHARLIE STATUS");
        println!("{}", "=".repeat(70));

        self.liquidity.print_liquidity().await;

        println!("{}\n", "=".repeat(70));
    }

    /// Run the broker service
    ///
    /// TODO: Implement HTTP/gRPC API server
    /// TODO: Integrate with Nostr for service announcements
    pub async fn run(&self) -> Result<()> {
        info!("Broker service is running...");

        // TODO: Phase 4 - Nostr Integration
        // - Announce broker service on Nostr
        // - Listen for encrypted swap requests
        // - Respond with quotes

        // TODO: Phase 5 - Production API
        // - HTTP/REST or gRPC endpoints
        // - Database persistence
        // - Metrics and monitoring

        // For now, just keep running
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
            self.print_status().await;
        }
    }
}

/// Liquidity status summary
#[derive(Debug, Clone)]
pub struct LiquidityStatus {
    pub mints: Vec<MintBalance>,
    pub total_balance: u64,
}

/// Balance on a specific mint
#[derive(Debug, Clone)]
pub struct MintBalance {
    pub mint_url: String,
    pub name: String,
    pub balance: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MintConfig;

    #[tokio::test]
    async fn test_broker_creation() {
        let config = BrokerConfig {
            mints: vec![
                MintConfig {
                    mint_url: "http://localhost:3338".to_string(),
                    name: "Mint A".to_string(),
                    unit: "sat".to_string(),
                },
                MintConfig {
                    mint_url: "http://localhost:3339".to_string(),
                    name: "Mint B".to_string(),
                    unit: "sat".to_string(),
                },
            ],
            ..Default::default()
        };

        let broker = Broker::new(config).await.unwrap();
        let status = broker.get_liquidity_status().await;
        assert_eq!(status.mints.len(), 2);
        assert_eq!(status.total_balance, 0);
    }
}
