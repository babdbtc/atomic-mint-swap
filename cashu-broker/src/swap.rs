//! Swap coordination for atomic ecash exchanges
//!
//! Handles atomic swap execution between Charlie (broker) and clients

use crate::adaptor::AdaptorContext;
use crate::error::{BrokerError, Result};
use crate::liquidity::LiquidityManager;
use crate::types::{BrokerConfig, SwapExecution, SwapQuote, SwapRequest, SwapStatus};
use cdk::amount::SplitTarget;
use cdk::nuts::{Conditions, Proof, Proofs, SecretKey, SigningKey, SpendingConditions};
use cdk::Amount;
use schnorr_fun::fun::{marker::*, Point, Scalar};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::sync::RwLock;
use tracing::{debug, info};

/// Coordinates atomic swap execution between broker and clients
pub struct SwapCoordinator {
    config: BrokerConfig,
    adaptor_ctx: AdaptorContext,
    quotes: Arc<RwLock<HashMap<String, QuoteData>>>,
    executions: Arc<RwLock<HashMap<String, SwapExecution>>>,
}

/// Internal quote data with private keys
struct QuoteData {
    pub quote: SwapQuote,
    pub broker_swap_key: Scalar,
    pub adaptor_secret: Scalar,
}

impl SwapCoordinator {
    /// Create a new swap coordinator
    pub fn new(config: BrokerConfig) -> Self {
        Self {
            config,
            adaptor_ctx: AdaptorContext::new(),
            quotes: Arc::new(RwLock::new(HashMap::new())),
            executions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generate a swap quote for a client request
    pub async fn create_quote(
        &self,
        request: SwapRequest,
        liquidity: &LiquidityManager,
    ) -> Result<SwapQuote> {
        // Validate request
        self.validate_swap_request(&request).await?;

        // Calculate fee and output amount
        let fee = ((request.amount as f64) * self.config.fee_rate).ceil() as u64;
        let output_amount = request.amount.saturating_sub(fee);

        // Check liquidity
        if !liquidity.can_swap(&request.to_mint, output_amount).await {
            return Err(BrokerError::InsufficientLiquidity {
                mint_url: request.to_mint.clone(),
                needed: output_amount,
                available: liquidity.get_balance(&request.to_mint).await,
            });
        }

        // Generate adaptor secret and point
        let adaptor_secret = self.adaptor_ctx.generate_adaptor_secret();
        let adaptor_point = self.adaptor_ctx.adaptor_point_from_secret(&adaptor_secret);

        // Generate broker's swap key
        let broker_swap_key = Scalar::random(&mut rand::thread_rng());
        let broker_pubkey_point = secp256kfun::G.clone() * &broker_swap_key;

        // Serialize points to compressed format (33 bytes)
        let adaptor_point_bytes = point_to_compressed_bytes(&adaptor_point);
        let broker_pubkey_bytes = point_to_compressed_bytes(&broker_pubkey_point);

        // Calculate tweaked pubkey: P' = P + T (broker_pubkey + adaptor_point)
        let tweaked_pubkey_point = &broker_pubkey_point + &adaptor_point;
        let tweaked_pubkey_bytes = point_to_compressed_bytes(&tweaked_pubkey_point);

        let expires_at = SystemTime::now() + Duration::from_secs(self.config.quote_expiry_seconds);

        let quote = SwapQuote {
            quote_id: Self::generate_quote_id(),
            from_mint: request.from_mint,
            to_mint: request.to_mint,
            input_amount: request.amount,
            output_amount,
            fee,
            fee_rate: self.config.fee_rate,
            broker_public_key: broker_pubkey_bytes,
            adaptor_point: adaptor_point_bytes,
            tweaked_pubkey: Some(tweaked_pubkey_bytes),
            adaptor_secret: scalar_to_bytes(&adaptor_secret),
            expires_in: self.config.quote_expiry_seconds,
            expires_at,
            status: SwapStatus::Pending,
        };

        info!(
            "Quote {}: {} → {} sats (fee: {})",
            quote.quote_id, request.amount, output_amount, fee
        );

        // Store quote with private keys
        let quote_data = QuoteData {
            quote: quote.clone(),
            broker_swap_key,
            adaptor_secret,
        };

        let mut quotes = self.quotes.write().await;
        quotes.insert(quote.quote_id.clone(), quote_data);

        Ok(quote)
    }

    /// Prepare broker's side of the swap (mint locked tokens)
    pub async fn prepare_swap(
        &self,
        quote_id: &str,
        client_pubkey: &[u8],
        liquidity: &LiquidityManager,
    ) -> Result<Proofs> {
        let mut quotes = self.quotes.write().await;
        let quote_data = quotes
            .get_mut(quote_id)
            .ok_or_else(|| BrokerError::QuoteNotFound(quote_id.to_string()))?;

        if quote_data.quote.status != SwapStatus::Pending {
            return Err(BrokerError::InvalidSwapRequest(format!(
                "Quote {} is not pending",
                quote_id
            )));
        }

        // Parse client pubkey and compute tweaked key: client + T
        let client_point = compressed_bytes_to_point(client_pubkey)?;
        let adaptor_point =
            self.adaptor_ctx
                .adaptor_point_from_secret(&quote_data.adaptor_secret);
        let client_tweaked = self.adaptor_ctx.tweak_public_key(&client_point, &adaptor_point);
        let client_tweaked_bytes = point_to_compressed_bytes(&client_tweaked);

        info!(
            "Charlie locking {} sats to client on {}",
            quote_data.quote.output_amount, quote_data.quote.to_mint
        );

        // Get wallet and mint P2PK tokens locked to client+T
        let wallet = liquidity.get_wallet(&quote_data.quote.to_mint)?;

        // Create spending conditions with P2PK lock
        let spending_conditions = SpendingConditions {
            pubkeys: Some(vec![client_tweaked_bytes.to_vec()]),
            locktime: None,
            refund_keys: None,
            num_sigs: Some(1),
            sig_flag: cdk::nuts::SigFlag::SigInputs,
        };

        // Mint tokens with P2PK conditions
        let proofs = wallet
            .mint_with_conditions(
                Amount::from(quote_data.quote.output_amount),
                SplitTarget::default(),
                spending_conditions,
                None,
            )
            .await
            .map_err(|e| BrokerError::Cdk(format!("Failed to mint P2PK tokens: {:?}", e)))?;

        // Update quote status
        quote_data.quote.status = SwapStatus::Accepted;

        // Store execution details
        let execution = SwapExecution {
            quote_id: quote_id.to_string(),
            client_tokens: vec![],
            broker_tokens: serialize_proofs(&proofs),
            client_swap_complete: false,
            broker_swap_complete: false,
            completed_at: None,
        };

        let mut executions = self.executions.write().await;
        executions.insert(quote_id.to_string(), execution);

        info!("Broker locked {} sats for swap {}", quote_data.quote.output_amount, quote_id);

        Ok(proofs)
    }

    /// Complete swap after client provides their tokens with witness
    pub async fn complete_swap(
        &self,
        quote_id: &str,
        client_proofs_with_witness: Proofs,
        liquidity: &LiquidityManager,
    ) -> Result<()> {
        let quotes = self.quotes.read().await;
        let quote_data = quotes
            .get(quote_id)
            .ok_or_else(|| BrokerError::QuoteNotFound(quote_id.to_string()))?;

        let broker_swap_key = &quote_data.broker_swap_key;
        let adaptor_secret = &quote_data.adaptor_secret;

        // Compute broker's tweaked key: broker_key + adaptor_secret
        let broker_with_adaptor = self.adaptor_ctx.add_scalars(broker_swap_key, adaptor_secret);

        info!("Charlie completing swap {}...", quote_id);

        // Create proofs with broker's signature
        let wallet = liquidity.get_wallet(&quote_data.quote.from_mint)?;

        // For each client proof, we need to sign with broker's tweaked key
        // In practice, the client has already added their witness
        // Charlie just needs to swap these tokens at the mint
        let total_amount: u64 = client_proofs_with_witness
            .iter()
            .map(|p| u64::from(p.amount))
            .sum();

        // Swap the client's tokens for new tokens
        let new_proofs = wallet
            .swap(
                Some(Amount::from(total_amount)),
                SplitTarget::default(),
                client_proofs_with_witness,
                None,
                false,
            )
            .await
            .map_err(|e| BrokerError::Cdk(format!("Failed to swap client tokens: {:?}", e)))?;

        // Add to broker's liquidity
        liquidity
            .add_proofs(&quote_data.quote.from_mint, new_proofs)
            .await?;

        // Update execution status
        let mut executions = self.executions.write().await;
        if let Some(execution) = executions.get_mut(quote_id) {
            execution.client_swap_complete = true;
            execution.broker_swap_complete = true;
            execution.completed_at = Some(SystemTime::now());
        }

        // Update quote status
        drop(quotes); // Release read lock
        let mut quotes = self.quotes.write().await;
        if let Some(quote_data) = quotes.get_mut(quote_id) {
            quote_data.quote.status = SwapStatus::Completed;
        }

        info!(
            "Charlie swap complete! Received {} sats from {}",
            total_amount, quote_data.quote.from_mint
        );

        Ok(())
    }

    /// Get a quote by ID
    pub async fn get_quote(&self, quote_id: &str) -> Option<SwapQuote> {
        let quotes = self.quotes.read().await;
        quotes.get(quote_id).map(|qd| qd.quote.clone())
    }

    /// Validate a swap request
    async fn validate_swap_request(&self, request: &SwapRequest) -> Result<()> {
        // Check amount bounds
        if request.amount < self.config.min_swap_amount {
            return Err(BrokerError::AmountTooLow {
                amount: request.amount,
                min: self.config.min_swap_amount,
            });
        }

        if request.amount > self.config.max_swap_amount {
            return Err(BrokerError::AmountTooHigh {
                amount: request.amount,
                max: self.config.max_swap_amount,
            });
        }

        // Check mint support
        let supported_mints: Vec<String> =
            self.config.mints.iter().map(|m| m.mint_url.clone()).collect();

        if !supported_mints.contains(&request.from_mint) {
            return Err(BrokerError::UnsupportedMint(request.from_mint.clone()));
        }

        if !supported_mints.contains(&request.to_mint) {
            return Err(BrokerError::UnsupportedMint(request.to_mint.clone()));
        }

        // Check not same mint
        if request.from_mint == request.to_mint {
            return Err(BrokerError::SameMintSwap);
        }

        Ok(())
    }

    /// Generate a unique quote ID
    fn generate_quote_id() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: [u8; 16] = rng.gen();
        hex::encode(bytes)
    }
}

// Helper functions for point/scalar serialization

fn point_to_compressed_bytes(point: &Point) -> Vec<u8> {
    // Convert point to compressed SEC format (33 bytes)
    let point_bytes = point.to_bytes();
    point_bytes.to_vec()
}

fn compressed_bytes_to_point(bytes: &[u8]) -> Result<Point> {
    Point::from_bytes(bytes.try_into().map_err(|_| {
        BrokerError::AdaptorSignature("Invalid point bytes length".to_string())
    })?)
    .ok_or_else(|| BrokerError::AdaptorSignature("Invalid point bytes".to_string()))
}

fn scalar_to_bytes(scalar: &Scalar) -> Vec<u8> {
    scalar.to_bytes().to_vec()
}

fn serialize_proofs(proofs: &Proofs) -> Vec<u8> {
    // Serialize proofs to JSON bytes
    serde_json::to_vec(proofs).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MintConfig;

    #[tokio::test]
    async fn test_swap_coordinator_creation() {
        let config = BrokerConfig {
            mints: vec![MintConfig {
                mint_url: "http://localhost:3338".to_string(),
                name: "Mint A".to_string(),
                unit: "sat".to_string(),
            }],
            ..Default::default()
        };

        let coordinator = SwapCoordinator::new(config);
        let quotes = coordinator.quotes.read().await;
        assert!(quotes.is_empty());
    }
}
