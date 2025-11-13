#!/bin/bash

# Deploy DegenRPS contracts to local Anvil instance
# Make sure Anvil is running on http://localhost:8545

set -e

echo "🚀 Deploying DegenRPS contracts to local Anvil..."
echo ""

# Check if Anvil is running
if ! curl -s http://localhost:8545 > /dev/null 2>&1; then
    echo "❌ Error: Anvil is not running on http://localhost:8545"
    echo ""
    echo "   Please start Anvil first in another terminal:"
    echo "   $ anvil"
    echo ""
    exit 1
fi

echo "✅ Anvil is running"
echo ""

# Build contracts first
echo "📦 Building contracts..."
forge build --force > /dev/null 2>&1
echo "✅ Contracts built"
echo ""

# Deploy contracts
echo "🚀 Deploying contracts..."
echo ""

forge script script/Deploy.s.sol:DeployScript \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Copy the contract addresses from the output above"
echo "   2. Update frontend/deployments.json:"
echo "      - Add 'degenRPS' with the DegenRPS address"
echo "      - Update 'verifier' address if changed"
echo "      - Update 'token0' and 'token1' addresses if changed"
echo "   3. Make sure your frontend is pointing to http://localhost:8545"
echo "   4. Connect MetaMask to Localhost (Chain ID: 31337)"
echo "   5. Import Anvil account private key to MetaMask"
echo ""
echo "💡 Default deployer account (has 1M test tokens):"
echo "   Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
