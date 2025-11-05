# ZK Rock Paper Scissors Frontend

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Copy required files:**

```bash
# Copy circuit JSON
cp ../circuit/target/circuit.json target/

# Copy contract artifact
cp ../contracts/artifacts/contracts/RockPaperScissors.sol/RockPaperScissors.json contract-artifact.json
```

3. **Start Hardhat node** (in a separate terminal):

```bash
cd ../contracts
npx hardhat node
```

4. **Deploy contract** (in another terminal):

```bash
cd contracts
npx hardhat ignition deploy ignition/modules/RockPaperScissors.ts --network localhost
```

5. **Start frontend dev server:**

```bash
npm run dev
```

6. **Open browser:**

- Visit `http://localhost:5173`
- Open MetaMask and connect to Hardhat network (Chain ID: 31337, RPC: http://127.0.0.1:8545)
- The frontend will automatically add the Hardhat network to MetaMask if needed

## Usage

1. **Connect Wallet**: Click "Connect Wallet" button
2. **Set Contract Address**: Paste the deployed contract address and click "Set Contract"
3. **Create/Join Game**:
   - Player 1: Click "Create Game"
   - Player 2: Enter game ID and click "Join Game"
4. **Commit Move**: Select Rock, Paper, or Scissors
5. **Reveal Move**: Click "Reveal Move" after both players have committed

## Funding Your Wallet

When you run `npx hardhat node`, Hardhat creates 20 pre-funded accounts with 10,000 ETH each. You can use these accounts in two ways:

### Option 1: Import a Hardhat Account into MetaMask (Recommended)

1. When you start `npx hardhat node`, you'll see output like:

```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

2. In MetaMask:

   - Click the account icon (top right)
   - Select "Import Account"
   - Paste the private key from the Hardhat output
   - The account will be imported with 10,000 ETH

3. You can use any of the 20 accounts shown in the Hardhat node output.

### Option 2: Send ETH from a Hardhat Account to Your MetaMask Account

1. Copy your MetaMask account address
2. Use Hardhat console to send ETH:

```bash
cd contracts
npx hardhat console --network localhost
```

3. In the console:

```javascript
const [sender] = await ethers.getSigners();
await sender.sendTransaction({
  to: "YOUR_METAMASK_ADDRESS",
  value: ethers.parseEther("100.0"),
});
```

Or use a simple script:

```bash
npx hardhat run --network localhost scripts/fundWallet.js
```

## Troubleshooting

### "Parse error: Unexpected end of JSON input"

- Make sure Hardhat node is running: `npx hardhat node`
- Check that MetaMask is connected to the correct network (Chain ID: 31337)

### "Insufficient funds" or "Out of gas"

- Import one of Hardhat's pre-funded accounts (see "Funding Your Wallet" above)
- Or send ETH from a Hardhat account to your MetaMask account

### "Contract address not set"

- Deploy the contract first
- Copy the contract address from deployment output
- Paste it in the "Contract Address" field and click "Set Contract"

### Circuit not loading

- Make sure `circuit.json` exists in `frontend/target/`
- Run `nargo compile` in the circuit directory first
