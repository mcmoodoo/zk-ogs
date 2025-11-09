# Raffle Pool UI

Frontend interface for the Rock Paper Scissors Raffle Pool built on Uniswap V4.

## Features

- 🎮 **Rock Paper Scissors Game**: Play RPS with commit-reveal scheme
- 💰 **Raffle Pool**: 5% of every swap goes into the pool
- 🔐 **Fair Play**: Cryptographic commitments ensure fair gameplay
- ⏱️ **Timeouts**: Automatic refunds and prize claims
- 🦄 **Uniswap V4**: Built on Uniswap V4 hooks

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Contracts**
   
   The app reads contract addresses from `deployments.json`. Make sure this file is up to date with your deployed contracts.

3. **Start Development Server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

4. **Connect Wallet**
   
   - Make sure you have MetaMask or another Web3 wallet installed
   - Connect to your local Anvil network (Chain ID: 31337)
   - The app will automatically detect the network

## Project Structure

```
src/
├── components/       # React components
│   ├── Game/        # Game-related components
│   ├── Swap/        # Swap interface components
│   └── Layout.tsx   # Main layout component
├── hooks/           # Custom React hooks for contract interactions
├── lib/             # Utilities and configuration
│   ├── contracts.ts # Contract addresses and ABIs
│   ├── utils.ts     # Helper functions
│   ├── wagmi.ts     # Wagmi configuration
│   └── storage.ts   # LocalStorage utilities
└── pages/           # Page components
    ├── Home.tsx     # Landing page
    ├── Swap.tsx     # Swap and start game
    ├── Games.tsx    # View and manage games
    └── Pool.tsx     # Pool statistics
```

## Usage

### Starting a Game

1. Go to the **Swap & Play** page
2. Select the token pair and amount
3. Choose your Rock Paper Scissors move
4. Click "Swap & Start Game"
5. Your move and salt are stored locally (important: don't clear localStorage!)

### Joining a Game

1. Go to the **My Games** page
2. Browse available games waiting for Player 2
3. Click on a game to view details
4. Select your move and click "Join Game"

### Revealing Your Move

1. After Player 2 joins, go to your game
2. Click "Reveal Move"
3. Your move and salt are retrieved from localStorage automatically
4. The winner is determined and prizes are distributed

## Important Notes

- **LocalStorage**: Your move commitments are stored in browser localStorage. If you clear it, you'll need to manually enter your move and salt to reveal.
- **Network**: Make sure you're connected to the correct network (local Anvil by default)
- **Tokens**: You need to have tokens in your wallet to swap and play

## Development

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Wagmi** - Ethereum React hooks
- **Viem** - Ethereum utilities
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **React Query** - Data fetching

## Troubleshooting

### Wallet Not Connecting

- Make sure MetaMask or your wallet is installed
- Check that you're on the correct network (Chain ID: 31337 for local)
- Try refreshing the page

### Contract Calls Failing

- Verify contract addresses in `deployments.json` are correct
- Check that contracts are deployed on the current network
- Ensure you have sufficient token balance and approvals

### Games Not Showing

- Check browser console for errors
- Verify localStorage is enabled
- Make sure you've completed a swap with a commitment
