#!/bin/bash

# Quick deployment script for local testing
# This script:
# 1. Checks if Anvil is running
# 2. Deploys contracts
# 3. Extracts addresses and updates deployments.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$(cd "$PROJECT_ROOT/../frontend" && pwd)"

echo "🚀 Quick Deploy Script for DegenRPS"
echo "===================================="
echo ""

# Check if Anvil is running
echo "1️⃣  Checking if Anvil is running..."
if ! curl -s http://localhost:8545 > /dev/null 2>&1; then
    echo "❌ Error: Anvil is not running on http://localhost:8545"
    echo ""
    echo "   Please start Anvil in another terminal:"
    echo "   $ anvil"
    echo ""
    exit 1
fi
echo "✅ Anvil is running"
echo ""

# Build contracts
echo "2️⃣  Building contracts..."
cd "$PROJECT_ROOT"
forge build --force > /dev/null 2>&1
echo "✅ Contracts built"
echo ""

# Deploy contracts
echo "3️⃣  Deploying contracts..."
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 2>&1)

# Extract addresses from output
VERIFIER_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Verifier deployed at: \K0x[a-fA-F0-9]{40}' | head -1)
DEGEN_RPS_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oP 'DegenRPS deployed at: \K0x[a-fA-F0-9]{40}' | head -1)
TOKEN0_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Token0 deployed at: \K0x[a-fA-F0-9]{40}' | head -1)
TOKEN1_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Token1 deployed at: \K0x[a-fA-F0-9]{40}' | head -1)

if [ -z "$VERIFIER_ADDR" ] || [ -z "$DEGEN_RPS_ADDR" ] || [ -z "$TOKEN0_ADDR" ] || [ -z "$TOKEN1_ADDR" ]; then
    echo "❌ Failed to extract contract addresses from deployment output"
    echo ""
    echo "Deployment output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "✅ Contracts deployed:"
echo "   Verifier:  $VERIFIER_ADDR"
echo "   DegenRPS:  $DEGEN_RPS_ADDR"
echo "   Token0:    $TOKEN0_ADDR"
echo "   Token1:    $TOKEN1_ADDR"
echo ""

# Update deployments.json
echo "4️⃣  Updating frontend/deployments.json..."

# Read existing deployments.json
DEPLOYMENTS_FILE="$FRONTEND_DIR/deployments.json"
if [ ! -f "$DEPLOYMENTS_FILE" ]; then
    echo "❌ deployments.json not found at $DEPLOYMENTS_FILE"
    exit 1
fi

# Use node to update JSON if available, otherwise provide manual instructions
if command -v node &> /dev/null; then
    cd "$SCRIPT_DIR"
    node update-deployments.js "$VERIFIER_ADDR" "$DEGEN_RPS_ADDR" "$TOKEN0_ADDR" "$TOKEN1_ADDR"
    echo "✅ deployments.json updated"
else
    echo "⚠️  Node.js not found. Please manually update deployments.json:"
    echo ""
    echo "   degenRPS:  $DEGEN_RPS_ADDR"
    echo "   verifier:  $VERIFIER_ADDR"
    echo "   token0:    $TOKEN0_ADDR"
    echo "   token1:    $TOKEN1_ADDR"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Make sure your frontend dev server is running"
echo "   2. Connect MetaMask to Localhost (Chain ID: 31337)"
echo "   3. Import an Anvil account private key to MetaMask"
echo "   4. Navigate to /swap-rps and start testing!"
echo ""
echo "💡 Anvil default account (has tokens):"
echo "   Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
