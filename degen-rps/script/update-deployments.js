#!/usr/bin/env node

/**
 * Script to update frontend/deployments.json with deployed contract addresses
 * Usage: node script/update-deployments.js <verifier> <degenRPS> <token0> <token1>
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('Usage: node update-deployments.js <verifier> <degenRPS> <token0> <token1>');
  process.exit(1);
}

const [verifierAddr, degenRPSAddr, token0Addr, token1Addr] = args;

// Read existing deployments.json
const deploymentsPath = path.join(__dirname, '../../frontend/deployments.json');
let deployments = {};

if (fs.existsSync(deploymentsPath)) {
  deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
}

// Update with new addresses
deployments.chainId = "31337";
deployments.rpcUrl = "http://localhost:8545";

if (!deployments.contracts) {
  deployments.contracts = {};
}

deployments.contracts.degenRPS = {
  address: degenRPSAddr
};

deployments.contracts.verifier = {
  address: verifierAddr
};

deployments.contracts.token0 = {
  address: token0Addr
};

deployments.contracts.token1 = {
  address: token1Addr
};

// Write back
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

console.log('✅ Updated frontend/deployments.json');
console.log('   DegenRPS:', degenRPSAddr);
console.log('   Verifier:', verifierAddr);
console.log('   Token0:', token0Addr);
console.log('   Token1:', token1Addr);
