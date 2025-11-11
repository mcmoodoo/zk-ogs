#!/bin/bash

# Extract ABI from compiled contracts and update deployments.json
# This script should be run after deploying contracts

DEPLOYMENTS_FILE="../../frontend/deployments.json"
DEGEN_RPS_ABI="out/DegenRPS.sol/DegenRPS.json"
VERIFIER_ABI="out/Verifier.sol/Verifier.json"

if [ ! -f "$DEPLOYMENTS_FILE" ]; then
    echo "❌ deployments.json not found at $DEPLOYMENTS_FILE"
    exit 1
fi

echo "📦 Extracting ABIs..."

# Extract DegenRPS ABI
if [ -f "$DEGEN_RPS_ABI" ]; then
    echo "✅ Found DegenRPS ABI"
    # The ABI is in the JSON file under the "abi" key
    # We'll need to use jq or node to extract it
else
    echo "⚠️  DegenRPS ABI not found. Run 'forge build' first."
fi

# Extract Verifier ABI
if [ -f "$VERIFIER_ABI" ]; then
    echo "✅ Found Verifier ABI"
else
    echo "⚠️  Verifier ABI not found. Run 'forge build' first."
fi

echo ""
echo "💡 To extract ABIs, you can use:"
echo "   jq '.abi' out/DegenRPS.sol/DegenRPS.json > degenRPS.abi.json"
echo "   jq '.abi' out/Verifier.sol/Verifier.json > verifier.abi.json"
echo ""
echo "   Then manually add them to deployments.json"
