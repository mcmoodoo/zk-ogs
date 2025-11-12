# Deploying DegenRPS to Local Anvil

This guide will help you deploy the DegenRPS contracts to a local Anvil instance for frontend testing.

## Quick Start

```bash
# Terminal 1: Start Anvil
anvil

# Terminal 2: Deploy contracts (automatically updates deployments.json)
cd degen-rps
just deploy
```

That's it! The `just deploy` command will:
- Check if Anvil is running
- Build contracts
- Deploy all contracts
- Automatically extract addresses from broadcast files
- Update `frontend/deployments.json` with addresses and ABIs

## Detailed Steps

### Step 1: Start Anvil

Open a terminal and start Anvil:

```bash
anvil
```

This will:
- Start a local Ethereum node on `http://localhost:8545`
- Create 10 pre-funded test accounts
- Display account addresses and private keys

**Keep this terminal running!**

### Step 2: Deploy Contracts

In another terminal, navigate to the `degen-rps` directory:

```bash
cd degen-rps
```

Then run the deployment command:

```bash
just deploy
```

This will:
- Check if Anvil is running
- Build contracts
- Deploy all contracts (Verifier, DegenRPS, Token0, Token1)
- **Automatically extract addresses** from broadcast files
- **Automatically update** `frontend/deployments.json` with addresses and ABIs

**Deployed contracts:**
- **HonkVerifier**: The ZK proof verifier contract
- **DegenRPS**: The main game contract  
- **Token0 & Token1**: Mock ERC20 tokens for testing (1M tokens minted to deployer)

**Note**: The `just deploy` command automatically handles everything - you don't need to manually update `deployments.json`!

### Step 5: Fund Test Accounts

The default Anvil accounts are already funded with ETH. To get test tokens:

1. **Connect MetaMask to Localhost**:
   - Network Name: `Localhost 8545`
   - RPC URL: `http://localhost:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. **Import Anvil Account**:
   - Use the private key from Anvil output (or the default deployer key below)
   - The deployer account already has 1M of each test token

3. **Default Deployer Account** (has tokens):
   - Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
   - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

### Step 6: Start Frontend

```bash
cd frontend
npm install  # if not already done
npm run dev  # or your dev server command
```

Navigate to `/swap-rps` and start testing!

## Anvil Default Accounts

Anvil creates 10 pre-funded accounts. Here are the first few:

| Index | Address | Private Key |
|-------|---------|-------------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

## Common Commands

### Using Just (Recommended)

```bash
# Deploy all contracts
just deploy

# Show deployment summary
just summary

# Show deployed addresses
just show-addresses

# Get next game ID
just next-game-id

# Get game info
just get-game <game_id>

# Get games waiting for Player 2
just games-waiting

# Get token balance
just balance <token_addr> <account>

# Run tests
just test

# Build contracts
just build

# Clean build artifacts
just clean
```

### Using Foundry directly

```bash
# Check contract state
cast call <DEGEN_RPS_ADDRESS> "nextGameId()" --rpc-url http://localhost:8545

# Get token balance
cast call <TOKEN_ADDRESS> "balanceOf(address)" <ACCOUNT> --rpc-url http://localhost:8545

# Get game info
cast call <DEGEN_RPS_ADDRESS> "getGame(uint256)" <GAME_ID> --rpc-url http://localhost:8545

# Approve tokens (using cast)
cast send <TOKEN_ADDRESS> "approve(address,uint256)" <DEGEN_RPS_ADDRESS> 1000000000000000000000 \
    --private-key <PRIVATE_KEY> --rpc-url http://localhost:8545
```

## Troubleshooting

### "Anvil not running"
- Make sure Anvil is running on port 8545
- Check with: `curl http://localhost:8545`

### "Insufficient funds"
- Use one of the pre-funded Anvil accounts
- All accounts start with 10,000 ETH

### "Contract not found"
- Verify `deployments.json` has the correct addresses
- Make sure you're on the right network (Chain ID: 31337)

### "Wrong network"
- MetaMask should be connected to Localhost (Chain ID: 31337)
- Check network settings in MetaMask

### "Token approval failed"
- Make sure you've approved the DegenRPS contract to spend your tokens
- Use the "Approve Token" button in the frontend, or use `cast send` command

## Testing Workflow

1. **Start Anvil** (Terminal 1): `anvil`
2. **Deploy contracts** (Terminal 2): `just deploy` (automatically updates deployments.json)
3. **Start frontend dev server** (Terminal 3)
4. **Connect MetaMask** to Localhost (Chain ID: 31337)
5. **Import Anvil account** with private key (default deployer has 1M test tokens)
6. **Approve tokens** in the frontend
7. **Create a game** as Player1
8. **Join the game** as Player2 (use a different account)
9. **Reveal and settle** as Player1
10. **Withdraw prize** as the winner

### Quick Deploy (All-in-One)

For a complete setup in one command:

```bash
just deploy-full
```

This will:
- Start Anvil in the background
- Deploy all contracts
- Update deployments.json
- Show deployment summary

## Notes

- The deployer account (Account 0) automatically receives 1M of each test token
- You can transfer tokens between accounts using the MockERC20 contract
- All games use the same token and bet amount (configurable in frontend)
- The reveal timeout is 30 minutes by default (configurable in contract)
