/**
 * Simple test: mint then immediately swap
 */ import { MintClient } from "./src/cashu/mint-client";
import { mintTokens, swapTokens } from "./src/cashu/wallet";

const MINT_A_URL = "http://localhost:3338";

async function main() {
  console.log("\n Simple Mint + Swap Test\n");
  const mintA = new MintClient(MINT_A_URL);
  console.log("Step 1: Minting 1 sat token...");
  const tokens = await mintTokens(mintA, 1);
  console.log("Minted 1 token");
  console.log("Step 2: Swapping token...");
  try {
    const swapped = await swapTokens(mintA, tokens, 1);
    console.log("SUCCESS! Swapped 1 token\n");
  } catch (error) {
    console.log("FAILED:", error);
    process.exit(1);
  }
}
main().catch(console.error);
