# Quick Start: Testing Atomic Swaps with Local Mints

## Prerequisites

1. **Docker Desktop** - Download and install from https://www.docker.com/products/docker-desktop/
   - Start Docker Desktop application
   - Wait for it to fully start (green icon in menu bar/system tray)

## Step 1: Start Local Mints

```bash
./setup-local-mints.sh
```

This will:
- Pull the Nutshell mint image
- Start two local mints (Mint A on port 3338, Mint B on port 3339)
- Both mints use `FakeWallet` backend (no Lightning needed)
- Wait for health checks to pass

Expected output:
```
✅ Mint A is running!
✅ Mint B is running!
🎉 Local mints are ready!
```

## Step 2: Verify Mints

```bash
npx tsx test-local-mints.ts
```

This checks:
- Mint info endpoints
- NUT-11 (P2PK) support
- Available keysets and denominations

Expected output:
```
✅ All mints are ready!
🎯 You can now run the end-to-end atomic swap test
```

## Step 3: Run End-to-End Atomic Swap Test

```bash
npx tsx test-atomic-swap-e2e.ts
```

This will demonstrate a complete atomic swap:
1. Alice creates P2PK locked tokens on Mint A
2. Bob creates P2PK locked tokens on Mint B
3. Exchange adaptor signatures
4. Bob claims Alice's tokens (reveals secret)
5. Alice extracts secret and claims Bob's tokens
6. **Verify atomicity**: Both succeed or both fail

## Troubleshooting

### Docker not running
```bash
# Error: Cannot connect to the Docker daemon
# Solution: Start Docker Desktop app
```

### Ports already in use
```bash
# Error: port 3338 is already allocated
# Solution: Stop existing containers
docker-compose down
docker ps  # Check what's using the ports
```

### Mints won't start
```bash
# View logs
docker-compose logs mint-a
docker-compose logs mint-b

# Restart
docker-compose down
docker-compose up -d
```

### Reset everything
```bash
# Stop and remove containers
docker-compose down

# Remove volumes
docker-compose down -v

# Restart
./setup-local-mints.sh
```

## Manual Testing

You can also interact with the mints directly:

```bash
# Check Mint A info
curl http://localhost:3338/v1/info | jq

# Check Mint B info
curl http://localhost:3339/v1/info | jq

# Get Mint A keysets
curl http://localhost:3338/v1/keys | jq

# Get Mint B keysets
curl http://localhost:3339/v1/keys | jq
```

## What Gets Tested

The end-to-end test validates:
- ✅ BDHKE blinding/unblinding with real mint
- ✅ Token creation with P2PK locks
- ✅ Adaptor signature generation
- ✅ Cross-mint atomic swap execution
- ✅ Secret extraction
- ✅ Atomicity guarantees

## Stopping the Mints

```bash
# Stop (keeps data)
docker-compose stop

# Stop and remove (deletes data)
docker-compose down

# Stop, remove, and delete volumes
docker-compose down -v
```

## Next Steps

Once local testing works:
1. Test with public testnet mint (https://testnut.cashu.space)
2. Build Nostr discovery protocol
3. Create broker service
4. Deploy production broker

## Architecture

```
┌─────────────┐                    ┌─────────────┐
│   Alice     │                    │     Bob     │
│  (Client)   │                    │  (Client)   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. Lock to Bob's pubkey         │
       │  (with adaptor secret)           │
       ├──────────────────────────────────┤
       │                                  │
       │  2. Lock to Alice's pubkey       │
       │  (same adaptor secret)           │
       │◄─────────────────────────────────┤
       │                                  │
       │  3. Exchange adaptor sigs        │
       │◄────────────────────────────────►│
       │                                  │
       │  4. Bob claims (reveals secret)  │
       │──────────────────────────────────►
       │                                  │
       │  5. Alice extracts & claims      │
       │◄──────────────────────────────────
       │                                  │
       ▼                                  ▼
┌─────────────┐                    ┌─────────────┐
│   Mint A    │                    │   Mint B    │
│  localhost  │                    │  localhost  │
│   :3338     │                    │   :3339     │
└─────────────┘                    └─────────────┘
```

## FAQ

**Q: Why two mints?**
A: To test cross-mint atomic swaps (Alice on Mint A, Bob on Mint B)

**Q: Why FakeWallet?**
A: No Lightning setup needed for testing. Tokens are free.

**Q: Can I use real Lightning?**
A: Yes, but requires running a Lightning node. FakeWallet is easier for testing.

**Q: Is this production-ready?**
A: The crypto is production-ready. You still need Nostr integration and broker service for production.

**Q: How do I get tokens with FakeWallet?**
A: Request a mint quote - it auto-approves. No payment needed.
