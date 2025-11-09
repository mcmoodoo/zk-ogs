# Uniswap V4 Hook with ZK Rock Paper Scissors Game

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![Solidity 0.8.20](https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity)
![Hardhat 3](https://img.shields.io/badge/Hardhat-3.0-fff100?logo=hardhat&logoColor=black) ![Noir](https://img.shields.io/badge/Noir-ZK-black?logo=aztec&labelColor=000000)
![Vite](https://img.shields.io/badge/Vite-4.x-646CFF?logo=vite)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js)

A Uniswap v4 hook that turns every swap into a chance to play a zero-knowledge rock-paper-scissors duel. A small slice of the swap amount is escrowed inside the hook, the players resolve the match with Noir-based proofs, and the hook redistributes the game token stake to the winner. Built with **Noir**, **Barretenberg**, **Hardhat 3**, and **Ethereum**.

## Overview

Each game unfolds alongside a Uniswap swap:

- **Player A** creates a game during the hook’s pre-swap phase, escrowing 5% (configurable) of the swap amount and submitting a commitment to their move (`keccak256(move || salt)`).
- **Player B** joins any open game by matching the stake and submitting their clear-text move; no commitment step is required.
- Once matched, **Player A** reveals their move plus salt along with a Noir-generated ZK proof that the outcome was computed correctly.
- The hook contract validates the commitment, verifies the ZK proof through the game manager contract, and pays the escrowed tokens to the winner (or slashes Player A if they fail to reveal before expiry).

This flow keeps Player A’s move hidden until reveal, protects Player B from front-running, and ensures rewards are settled atomically with the swap.

## Technology Stack

### Zero-Knowledge Layer

- **Noir**: Defines the rock-paper-scissors circuit, including move validation and outcome computation.
- **Barretenberg (`@aztec/bb.js`)**: Generates UltraPLONK proofs that attest the circuit ran correctly.
- **NoirJS**: Bridges the browser to Noir so Player A can compile witnesses and proofs client-side.

### Game Manager Contracts

- **Solidity 0.8.20**: Implements the commit/reveal lifecycle, escrow bookkeeping, and proof verification interface.
- **Hardhat 3**: Provides compilation, testing, and deployment tooling for the core game logic.

### Uniswap Hook Layer

- **Solidity 0.8.20**: Extends Uniswap v4’s `IHooks` to siphon a configurable percentage of each swap into a game escrow, call into the manager contract, and release funds atomically with the swap outcome.
- **Hardhat 3**: Supplies the local fork environment and scripts used to exercise hook callbacks during development.

### Frontend Layer

- **Vite + Vanilla JS**: Lightweight UI for creating games, joining them, and triggering reveals from the browser.
- **Ethers.js v6**: Handles wallet connections, swap-triggered hook interactions, and proof submissions.
- **NoirJS**: Runs circuit witness generation and proof verification before anything touches the chain.

## Game Flow

```
Trader / Player A           Uniswap Hook                     Player B
--------------------------  -------------------------------  ----------------------
Swap starts                 |                               |
hook.beforeSwap() --------> |                               |
│  stake % of swap tokens   |                               |
│  createGame(commitment)   |                               |
│                           |-- open escrow & emit event -->|
│                           |                               |
Await opponent              |                               |
│                           |<-- joinGame(clearMove, stake)--│
│                           |      (no commit needed)        |
│                           |                               |
Reveal & resolve            |                               |
resolveGame(move, salt, proof)                              |
│ ------------------------> |                               |
│                           |-- verify commitment & proof -->|
│                           |-- call game logic              |
│                           |-- pay winner / slash default --|
│ <--- swap resumes --------|                               |
│                           |                               |
│                                                       winner receives stake
```

## Project Structure

```
zk-ogs/
├── circuit/                        # Noir ZK circuit & witness generation
│   ├── src/main.nr                 # Circuit: validates moves & outcome
│   └── regenerate-verifier.sh      # Helper script for verifier artifacts
├── contracts/                      # Core game manager (commit/reveal + proof)
│   ├── contracts/
│   │   ├── RockPaperScissors.sol   # Game lifecycle & escrow accounting
│   │   ├── Verifier.sol            # Generated verifier scaffold
│   │   └── RockPaperScissors.t.sol # Foundry-based tests
│   ├── ignition/modules/
│   │   └── RockPaperScissors.ts    # Hardhat Ignition deployment module
│   └── hardhat.config.ts           # Hardhat 3 configuration
├── raffle-pool/                    # Uniswap v4 hook + Foundry deployment flow
│   ├── src/RPSHook.sol             # Pre-swap hook that escrow swap stakes
│   ├── script/                     # Foundry scripts for pools & swaps
│   └── test/RPSHook.t.sol          # Hook integration tests
├── frontend/                       # Player-facing dapp for swap + gameplay
│   ├── app.js                      # Proof generation & contract interactions
│   ├── index.html                  # Minimal UI shell
│   └── public/target/circuit.json  # Bundled Noir circuit artifact
└── pool-ui/                        # React dashboard for pool + hook monitoring
    └── src/                        # Components, hooks, and routing
```

## Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Noir** ([install instructions](https://noir-lang.org/docs/getting_started/nargo_installation))
- **MetaMask** (for wallet connection)

### 1. Install Dependencies

```bash
# Circuit dependencies (Noir comes with nargo)
cd circuit
nargo --version  # Verify installation

# Contract dependencies
cd ../contracts
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### 2. Compile Circuit

```bash
cd circuit
nargo compile
nargo test  # Verify all tests pass
```

This generates `target/circuit.json` needed by the frontend.

### 3. Setup Frontend Artifacts

```bash
cd frontend

# Copy compiled circuit
mkdir -p target
cp ../circuit/target/circuit.json target/

# Copy contract artifact (after compilation)
cp ../contracts/artifacts/contracts/RockPaperScissors.sol/RockPaperScissors.json contract-artifact.json
```

## Running Locally

### 1. Start Hardhat Node

```bash
cd contracts
npx hardhat node
```

This starts a local Ethereum node at `http://127.0.0.1:8545` with Chain ID `31337`.

### 2. Deploy Contract

In a new terminal:

```bash
cd contracts
npx hardhat ignition deploy ignition/modules/RockPaperScissors.ts --network localhost
```

Copy the contract address from the output (e.g., `0x5FbDB2315678afecb367f032d93F642f64180aa3`).

### 3. Configure Frontend

1. Open `frontend/index.html` in browser (or use Vite dev server)
2. Enter the contract address in the UI
3. Click "Set Contract"

Alternatively, set it in `frontend/app.js`:

```javascript
let CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
```

### 4. Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173`

### 5. Fund Your Wallet

Hardhat node creates 20 accounts with 10,000 ETH each. Choose one:

**Option A: Import Hardhat Account to MetaMask**

- Copy a private key from the Hardhat node output
- In MetaMask: Account icon → Import Account → Paste private key

**Option B: Send ETH to MetaMask**

```bash
cd contracts
npx hardhat run scripts/fundWallet.ts --network localhost <YOUR_METAMASK_ADDRESS>
```

**Option C: Configure MetaMask Network**

- Network Name: `Hardhat Local`
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency Symbol: `ETH`

## Playing the Game

1. **Connect your wallet**  
   Launch `pool-ui` (`npm run dev`) and connect to your local Anvil / Hardhat network. The dashboard auto-loads deployed addresses from `deployments.json`.

2. **Swap & start a game (Player A)**  
   - Open the **Swap & Play** page.  
   - Choose the token pair, amount, and toggle the percentage of the swap you want to escrow (default 5%).  
   - Pick your move (Rock, Paper, or Scissors) and click **Swap & Start Game**.  
   - The UI submits a Uniswap swap routed through `RPSHook.sol`, escrows the stake, and stores your move + salt commitment locally (keep browser storage intact).

3. **Join an open game (Player B)**  
   - Visit **Games** to browse matches waiting for an opponent.  
   - Match the stake, pick your move, and confirm **Join Game**. Your move is written on-chain in clear text—no commitment phase required.

4. **Reveal & settle (Player A)**  
   - After someone joins, return to your game card and hit **Reveal Move**.  
   - The app reads your committed move/salt from localStorage, runs the Noir circuit to produce the proof, and calls `resolveGame`.  
   - The hook contract validates the commitment, verifies the proof via the manager contract, pays the winner from escrow, and releases the swap back to Uniswap.

5. **Handle timeouts**  
   If Player A never reveals before the deadline, Player B can trigger the timeout action from the UI to claim the escrow. Scripts in `raffle-pool/script/` demonstrate these flows end-to-end.

## How It Works

### ZK Proof Lifecycle

1. **State availability** – Player B’s clear-text move and both stakes are stored on-chain as soon as they join via the hook.  
2. **Witness construction** – When Player A clicks reveal, the frontend feeds `{player1_move, salt, player2_move}` into `circuit/src/main.nr` to compute the expected winner.  
3. **Proof generation** – Barretenberg (via `@aztec/bb.js`) creates an UltraPLONK proof that the moves were valid values and that the published winner matches the circuit logic.  
4. **Local verification** – The proof is checked client-side before submission; invalid proofs never hit the chain.  
5. **On-chain submission** – `resolveGame` receives `(move, salt, proof)`, verifying `keccak256(move || salt)` against the commitment and, when the verifier contract is configured, validating the proof bytes.

### Hook Settlement Path

1. **beforeSwap** – `RPSHook` runs before Uniswap finalizes the swap, siphoning the configured percentage into escrow and calling the game manager to record the commitment.  
2. **joinGame** – Counterparties stake the matching amount through the hook, which locks liquidity until the game is resolved.  
3. **resolveGame** – On reveal, the hook contract confirms the commitment, queries the verifier/game manager for the outcome, and sends the pooled tokens to the winner (or refunds both on draw).  
4. **afterSwap** – TBC

### Failure Modes & Safeguards

- **Timeouts** – Non-responsive Player A forfeits their stake after the reveal window expires; automation scripts and UI actions enforce this.  
- **Swap reentrancy** – Escrow updates happen before the pool’s state changes to avoid double-escrowing across nested hooks.  
- **Proof optionality** – During development you can deploy without the verifier contract; the manager accepts a mock flag to skip proof verification while still enforcing commitments.

## License

GPLv3
