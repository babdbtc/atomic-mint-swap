//! Main broker service
//!
//! TODO: Port from TypeScript implementation at ../src/broker/

use crate::error::Result;
use crate::liquidity::LiquidityManager;
use crate::swap::SwapCoordinator;
use crate::types::{BrokerConfig, SwapQuote, SwapRequest};
use tracing::{info, warn};

/// The main broker service
///
/// Coordinates liquidity management and swap execution
pub struct Broker {
    config: BrokerConfig,
    liquidity: LiquidityManager,
    swap_coordinator: SwapCoordinator,
}

impl Broker {
    /// Create a new broker instance
    pub async fn new(config: BrokerConfig) -> Result<Self> {
        info!("Initializing Cashu broker");
        info!("Fee rate: {:.2}%", config.fee_rate * 100.0);
        info!("Min swap: {} sats", config.min_swap_amount);
        info!("Max swap: {} sats", config.max_swap_amount);
        info!("Supported mints: {}", config.mints.len());

        for mint in &config.mints {
            info!("  - {} ({})", mint.name, mint.mint_url);
        }

        let liquidity = LiquidityManager::new(config.mints.clone());
        let swap_coordinator = SwapCoordinator::new(config.clone());

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
    pub async fn initialize(&mut self, amount_per_mint: u64) -> Result<()> {
        info!("Initializing liquidity: {} sats per mint", amount_per_mint);
        self.liquidity.initialize_liquidity(amount_per_mint).await?;
        Ok(())
    }

    /// Request a swap quote from the broker
    pub async fn request_quote(&mut self, request: SwapRequest) -> Result<SwapQuote> {
        info!("Swap request from {}: {} → {}, amount: {} sats",
            request.client_id,
            request.from_mint,
            request.to_mint,
            request.amount
        );

        self.swap_coordinator.create_quote(request, &self.liquidity).await
    }

    /// Accept a quote and prepare the broker's side of the swap
    pub async fn accept_quote(&mut self, quote_id: &str, client_pubkey: &[u8]) -> Result<Vec<u8>> {
        info!("Client accepted quote {}", quote_id);
        self.swap_coordinator.prepare_swap(quote_id, client_pubkey).await
    }

    /// Complete a swap after client provides their tokens
    pub async fn complete_swap(&mut self, quote_id: &str, client_tokens: Vec<u8>) -> Result<()> {
        info!("Completing swap {}", quote_id);
        self.swap_coordinator.complete_swap(quote_id, client_tokens).await
    }

    /// Get current liquidity status
    pub fn liquidity_status(&self) -> LiquidityStatus {
        let mint_balances: Vec<MintBalance> = self.config.mints
            .iter()
            .map(|mint| MintBalance {
                mint_url: mint.mint_url.clone(),
                name: mint.name.clone(),
                balance: self.liquidity.get_balance(&mint.mint_url),
            })
            .collect();

        let total_balance: u64 = mint_balances.iter().map(|mb| mb.balance).sum();

        LiquidityStatus {
            mints: mint_balances,
            total_balance,
        }
    }

    /// Print broker status to logs
    pub fn print_status(&self) {
        info!("=".repeat(70));
        info!("BROKER STATUS");
        info!("=".repeat(70));

        let status = self.liquidity_status();
        info!("Broker Liquidity:");
        for mint in &status.mints {
            info!("  {}: {} sats", mint.mint_url, mint.balance);
        }
        info!("Total: {} sats", status.total_balance);

        info!("=".repeat(70));
    }

    /// Run the broker service
    ///
    /// TODO: Implement HTTP/gRPC API server
    /// TODO: Integrate with Nostr for service announcements
    pub async fn run(&self) -> Result<()> {
        info!("Broker service is running...");

        // TODO: Start HTTP/gRPC server
        // TODO: Announce on Nostr
        // TODO: Handle incoming swap requests
        // TODO: Monitor liquidity and rebalance

        todo!("Implement broker service runtime")
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
        let status = broker.liquidity_status();
        assert_eq!(status.mints.len(), 2);
    }
}
