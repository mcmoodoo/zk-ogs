import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useRafflePoolBalance } from '../hooks/useRPSHook';
import { config, getPoolId } from '../lib/contracts';
import { formatAmount } from '../lib/utils';
import { Address } from 'viem';

export default function Home() {
  const { address, isConnected } = useAccount();
  const poolId = getPoolId();
  const token0Address = config.contracts.token0.address as Address;
  const { data: poolBalance } = useRafflePoolBalance(poolId, token0Address);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-white">
          🎮 Rock Paper Scissors on Uniswap V4
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto">
          Swap tokens, play RPS, and win the raffle pool! Every swap contributes 5% to the pool.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Total Raffle Pool</div>
          <div className="text-3xl font-bold text-white">
            {poolBalance ? formatAmount(poolBalance) : '0.0'}
          </div>
          <div className="text-sm text-slate-400 mt-1">Token0</div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">How It Works</div>
          <div className="text-sm text-slate-300 space-y-1">
            <div>1. Swap tokens with a move commitment</div>
            <div>2. Player 2 joins and makes their move</div>
            <div>3. Player 1 reveals their move</div>
            <div>4. Winner takes the pool!</div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Quick Actions</div>
          <div className="space-y-2">
            <Link
              to="/swap"
              className="block w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-center rounded-md transition-colors"
            >
              Start New Game
            </Link>
            <Link
              to="/games"
              className="block w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-center rounded-md transition-colors"
            >
              View My Games
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">🔐 Commit-Reveal Scheme</h3>
            <p className="text-slate-300">
              Fair gameplay using cryptographic commitments. Player 1 commits their move, Player 2 responds, then Player 1 reveals.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">💰 Raffle Pool</h3>
            <p className="text-slate-300">
              5% of every swap goes into the raffle pool. Winners take the combined contributions from both players.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">⏱️ Timeouts</h3>
            <p className="text-slate-300">
              Automatic refunds if Player 2 doesn't join within 60 seconds. Player 2 wins if Player 1 doesn't reveal in time.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">🦄 Uniswap V4 Hook</h3>
            <p className="text-slate-300">
              Built on Uniswap V4 hooks, seamlessly integrated into the swap flow.
            </p>
          </div>
        </div>
      </div>

      {!isConnected && (
        <div className="text-center p-6 bg-yellow-500/20 border border-yellow-500 rounded-lg">
          <p className="text-yellow-400">
            Connect your wallet to start playing!
          </p>
        </div>
      )}
    </div>
  );
}
