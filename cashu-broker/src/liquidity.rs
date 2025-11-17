//! Liquidity Management for Charlie
//!
//! Tracks and manages Charlie's ecash balances across multiple mints

use crate::error::{BrokerError, Result};
use crate::types::MintConfig;
use cdk::amount::SplitTarget;
use cdk::nuts::{CurrencyUnit, MintQuoteState, Proof, Proofs, State};
use cdk::wallet::Wallet;
use cdk::Amount;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Liquidity information for a single mint
#[derive(Debug, Clone)]
pub struct MintLiquidity {
    pub mint_url: String,
    pub balance: u64,
    pub proofs: Proofs,
    pub last_updated: SystemTime,
}

/// Manages liquidity across multiple mints
pub struct LiquidityManager {
    liquidity: Arc<RwLock<HashMap<String, MintLiquidity>>>,
    wallets: HashMap<String, Arc<Wallet>>,
}

impl LiquidityManager {
    /// Create a new liquidity manager
    pub async fn new(mints: Vec<MintConfig>) -> Result<Self> {
        let mut wallets = HashMap::new();
        let mut liquidity = HashMap::new();

        for mint in mints {
            // Create a wallet for each mint
            // TODO: In production, use persistent storage instead of memory
            let localstore = cdk::wallet::localstore::memory::MemoryLocalStore::default();

            let seed = cdk::wallet::mnemonic::Mnemonic::generate(12)
                .map_err(|e| BrokerError::Cdk(format!("Failed to generate mnemonic: {:?}", e)))?;

            let mint_url = mint.mint_url.parse()
                .map_err(|e| BrokerError::Cdk(format!("Invalid mint URL {}: {:?}", mint.mint_url, e)))?;

            let wallet = Wallet::new(
                &mint.mint_url,
                CurrencyUnit::Sat,
                Arc::new(localstore),
                &seed.to_seed_normalized(""),
                None,
            )
            .map_err(|e| BrokerError::Cdk(format!("Failed to create wallet: {:?}", e)))?;

            liquidity.insert(
                mint.mint_url.clone(),
                MintLiquidity {
                    mint_url: mint.mint_url.clone(),
                    balance: 0,
                    proofs: Proofs::empty(),
                    last_updated: SystemTime::now(),
                },
            );

            wallets.insert(mint.mint_url.clone(), Arc::new(wallet));
        }

        Ok(Self {
            liquidity: Arc::new(RwLock::new(liquidity)),
            wallets,
        })
    }

    /// Get current balance on a mint
    pub async fn get_balance(&self, mint_url: &str) -> u64 {
        let liq = self.liquidity.read().await;
        liq.get(mint_url).map(|l| l.balance).unwrap_or(0)
    }

    /// Get available proofs on a mint
    pub async fn get_proofs(&self, mint_url: &str) -> Proofs {
        let liq = self.liquidity.read().await;
        liq.get(mint_url)
            .map(|l| l.proofs.clone())
            .unwrap_or_else(Proofs::empty)
    }

    /// Add proofs to liquidity (e.g., after minting or receiving)
    pub async fn add_proofs(&self, mint_url: &str, proofs: Proofs) -> Result<()> {
        let mut liq = self.liquidity.write().await;
        let mint_liq = liq
            .get_mut(mint_url)
            .ok_or_else(|| BrokerError::UnsupportedMint(mint_url.to_string()))?;

        let amount: u64 = proofs.iter().map(|p| p.amount.into()).sum();
        mint_liq.proofs.extend(proofs);
        mint_liq.balance += amount;
        mint_liq.last_updated = SystemTime::now();

        info!(
            "💰 Added {} sats to {} (new balance: {})",
            amount, mint_url, mint_liq.balance
        );

        Ok(())
    }

    /// Remove proofs from liquidity (e.g., after spending)
    pub async fn remove_proofs(&self, mint_url: &str, proofs_to_remove: &Proofs) -> Result<()> {
        let mut liq = self.liquidity.write().await;
        let mint_liq = liq
            .get_mut(mint_url)
            .ok_or_else(|| BrokerError::UnsupportedMint(mint_url.to_string()))?;

        let amount: u64 = proofs_to_remove.iter().map(|p| p.amount.into()).sum();

        // Remove proofs by secret (unique identifier)
        let secrets_to_remove: Vec<_> = proofs_to_remove.iter().map(|p| &p.secret).collect();
        mint_liq
            .proofs
            .retain(|p| !secrets_to_remove.contains(&&p.secret));

        mint_liq.balance = mint_liq.balance.saturating_sub(amount);
        mint_liq.last_updated = SystemTime::now();

        info!(
            "💸 Removed {} sats from {} (new balance: {})",
            amount, mint_url, mint_liq.balance
        );

        Ok(())
    }

    /// Select proofs totaling at least the specified amount
    pub async fn select_proofs(&self, mint_url: &str, amount: u64) -> Result<Proofs> {
        let liq = self.liquidity.read().await;
        let mint_liq = liq
            .get(mint_url)
            .ok_or_else(|| BrokerError::UnsupportedMint(mint_url.to_string()))?;

        let mut available = mint_liq.proofs.clone();
        let mut selected = Proofs::empty();
        let mut total: u64 = 0;

        // Simple greedy selection (largest first)
        available.sort_by(|a, b| b.amount.cmp(&a.amount));

        for proof in available.iter() {
            if total >= amount {
                break;
            }
            selected.push(proof.clone());
            total += u64::from(proof.amount);
        }

        if total < amount {
            return Err(BrokerError::InsufficientLiquidity {
                mint_url: mint_url.to_string(),
                needed: amount,
                available: total,
            });
        }

        Ok(selected)
    }

    /// Check if we have enough liquidity for a swap
    pub async fn can_swap(&self, mint_url: &str, amount: u64) -> bool {
        self.get_balance(mint_url).await >= amount
    }

    /// Get wallet for a mint
    pub fn get_wallet(&self, mint_url: &str) -> Result<Arc<Wallet>> {
        self.wallets
            .get(mint_url)
            .cloned()
            .ok_or_else(|| BrokerError::UnsupportedMint(mint_url.to_string()))
    }

    /// Get all liquidity info
    pub async fn get_all_liquidity(&self) -> Vec<MintLiquidity> {
        let liq = self.liquidity.read().await;
        liq.values().cloned().collect()
    }

    /// Initialize liquidity by minting tokens on each mint
    /// In production, Charlie would receive tokens from users or mint via Lightning
    pub async fn initialize_liquidity(&self, amount_per_mint: u64) -> Result<()> {
        info!(
            "\n🏦 Initializing Charlie's liquidity ({} sats per mint)...\n",
            amount_per_mint
        );

        for (mint_url, wallet) in &self.wallets {
            match self.mint_tokens(mint_url, wallet, amount_per_mint).await {
                Ok(proofs) => {
                    self.add_proofs(mint_url, proofs).await?;
                }
                Err(e) => {
                    warn!("Failed to mint on {}: {:?}", mint_url, e);
                }
            }
        }

        info!("\n✅ Liquidity initialization complete!\n");
        self.print_liquidity().await;

        Ok(())
    }

    /// Mint new tokens via Lightning quote
    async fn mint_tokens(
        &self,
        mint_url: &str,
        wallet: &Arc<Wallet>,
        amount: u64,
    ) -> Result<Proofs> {
        info!("Minting {} sats on {}...", amount, mint_url);

        // Create a mint quote
        let quote = wallet
            .mint_quote(Amount::from(amount), None)
            .await
            .map_err(|e| BrokerError::Cdk(format!("Failed to create mint quote: {:?}", e)))?;

        debug!("Mint quote created: {:?}", quote);

        // In test environment with FakeWallet, the quote is automatically paid
        // In production, you would pay the Lightning invoice: quote.request

        // Wait for quote to be paid and mint the tokens
        let proofs = wallet
            .mint(&quote.id, SplitTarget::default(), None)
            .await
            .map_err(|e| BrokerError::Cdk(format!("Failed to mint: {:?}", e)))?;

        info!("✅ Minted {} sats", amount);

        Ok(proofs)
    }

    /// Print current liquidity status
    pub async fn print_liquidity(&self) {
        let all_liq = self.get_all_liquidity().await;
        println!("💰 Charlie's Liquidity:");
        for liq in &all_liq {
            println!(
                "  {}: {} sats ({} proofs)",
                liq.mint_url,
                liq.balance,
                liq.proofs.len()
            );
        }
        println!();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_liquidity_manager() {
        let mints = vec![
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
        ];

        let manager = LiquidityManager::new(mints).await.unwrap();

        // Check initial balance is 0
        assert_eq!(manager.get_balance("http://localhost:3338").await, 0);
        assert_eq!(manager.get_balance("http://localhost:3339").await, 0);
    }
}
