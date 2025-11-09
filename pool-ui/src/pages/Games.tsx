import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Routes, Route, useParams, Link } from 'react-router-dom';
import { usePendingSwap } from '../hooks/useRPSHook';
import { getAllCommitments, getCommitment } from '../lib/storage';
import GameCard from '../components/Game/GameCard';
import GameDetail from '../components/Game/GameDetail';
import { formatAddress } from '../lib/utils';
import { Address } from 'viem';

function GamesList() {
  const { address } = useAccount();
  const [commitments, setCommitments] = useState<string[]>([]);
  const [games, setGames] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    // Load all commitments from localStorage
    const storedCommitments = getAllCommitments();
    setCommitments(storedCommitments.map((c) => c.commitmentHash));
  }, []);

  // Fetch game data for each commitment
  const { data: gameData } = usePendingSwap(
    commitments[0] as `0x${string}` | undefined
  );

  useEffect(() => {
    if (gameData && commitments.length > 0) {
      // In a real app, you'd fetch all games
      // For now, we'll just show games from localStorage
    }
  }, [gameData, commitments]);

  if (commitments.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-4">No games found</div>
        <Link
          to="/swap"
          className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
        >
          Start Your First Game
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">My Games</h1>
        <Link
          to="/swap"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
        >
          New Game
        </Link>
      </div>

      <div className="space-y-3">
        {commitments.map((hash) => (
          <GameCard
            key={hash}
            commitmentHash={hash}
            game={games.get(hash) || {
              player1: address || '0x0',
              timestamp: BigInt(0),
              poolId: '0x0',
              currency: '0x0',
              player1Contribution: BigInt(0),
              player2Moved: false,
              player2: '0x0',
              player2Move: 0,
              player2Contribution: BigInt(0),
              player2MoveTimestamp: BigInt(0),
              revealed: false,
              player1Move: 0,
              salt: '0x0',
              resolved: false,
            }}
            isPlayer1={true}
            isPlayer2={false}
          />
        ))}
      </div>
    </div>
  );
}

function GameDetailPage() {
  return <GameDetail />;
}

export default function Games() {
  return (
    <Routes>
      <Route path="/" element={<GamesList />} />
      <Route path="/:hash" element={<GameDetailPage />} />
    </Routes>
  );
}
