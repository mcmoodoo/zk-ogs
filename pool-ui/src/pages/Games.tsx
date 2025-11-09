import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Routes, Route, useParams, Link } from 'react-router-dom';
import { usePendingSwap, useAllActiveGames } from '../hooks/useRPSHook';
import { getAllCommitments, getCommitment, removeCommitment } from '../lib/storage';
import GameCard from '../components/Game/GameCard';
import GameDetail from '../components/Game/GameDetail';
import { formatAddress } from '../lib/utils';
import { Address } from 'viem';

// Component to validate a single commitment exists on-chain
function ValidatedGameCard({ 
  commitmentHash, 
  address,
  onValidation 
}: { 
  commitmentHash: string; 
  address: Address | undefined;
  onValidation?: (hash: string, isValid: boolean) => void;
}) {
  const { data: gameData, isLoading, error } = usePendingSwap(commitmentHash as `0x${string}`);

  // Check if game actually exists on-chain
  // A game exists if player1 is not zero address and timestamp is not zero
  const gameExists = gameData && 
    gameData.player1 !== '0x0000000000000000000000000000000000000000' && 
    gameData.timestamp > 0n;

  const prevValidationRef = useRef<{ hash: string; isValid: boolean } | null>(null);
  
  useEffect(() => {
    if (!isLoading && onValidation) {
      const isValid = gameExists && !error;
      // Only call onValidation if the result has changed
      const current = { hash: commitmentHash, isValid };
      if (!prevValidationRef.current || 
          prevValidationRef.current.hash !== current.hash || 
          prevValidationRef.current.isValid !== current.isValid) {
        prevValidationRef.current = current;
        onValidation(commitmentHash, isValid);
      }
    }
  }, [isLoading, gameExists, error, commitmentHash, onValidation]);

  // If there's an error or the game doesn't exist on-chain, don't render
  if (!isLoading && (!gameExists || error)) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="text-slate-400">Loading game...</div>
      </div>
    );
  }

  return (
    <GameCard
      commitmentHash={commitmentHash}
      game={gameData || {
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
  );
}

function GamesList() {
  const { address } = useAccount();
  const [commitments, setCommitments] = useState<string[]>([]);
  const [validCommitments, setValidCommitments] = useState<Set<string>>(new Set());
  const [validationComplete, setValidationComplete] = useState(false);

  const [validatedHashes, setValidatedHashes] = useState<Set<string>>(new Set());

  // Query all active games from the contract (this is the source of truth)
  const { data: activeGamesFromContract, isLoading: isLoadingActiveGames } = useAllActiveGames();

  useEffect(() => {
    // Use games from the contract as the primary source
    // localStorage only stores move/salt secrets for Player 1 to reveal later
    const contractHashes = activeGamesFromContract || [];
    setCommitments(contractHashes);
    setValidCommitments(new Set());
    setValidatedHashes(new Set());
    setValidationComplete(false);
  }, [activeGamesFromContract]);

  const handleValidation = useCallback((hash: string, isValid: boolean) => {
    setValidatedHashes((prev) => {
      // Only update if this hash hasn't been validated yet
      if (prev.has(hash)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(hash);
      return next;
    });
    
    setValidCommitments((prev) => {
      const next = new Set(prev);
      if (isValid) {
        next.add(hash);
      } else {
        next.delete(hash);
      }
      return next;
    });
  }, []);
  
  // Check if validation is complete separately
  useEffect(() => {
    if (commitments.length > 0 && validatedHashes.size >= commitments.length) {
      setValidationComplete(true);
    }
  }, [commitments.length, validatedHashes.size]);

  // Filter out invalid commitments (those that don't exist on-chain)
  // We'll validate them as we render, but also provide a way to clean up
  const handleClearInvalid = () => {
    // Clear all localStorage secrets (development helper)
    // Note: This only clears the move/salt secrets, not the games themselves (which are on-chain)
    if (confirm('Clear all stored move/salt secrets from localStorage? Games will still exist on-chain, but you won\'t be able to reveal moves without the secrets.')) {
      commitments.forEach((hash) => {
        removeCommitment(hash);
      });
      // Don't clear commitments - they come from the contract
      setValidCommitments(new Set());
      setValidatedHashes(new Set());
      setValidationComplete(false);
    }
  };

  if (isLoadingActiveGames) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-4">Loading games...</div>
      </div>
    );
  }

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
        <div className="flex gap-2">
          <button
            onClick={handleClearInvalid}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors text-sm"
            title="Clear move/salt secrets from localStorage (games remain on-chain)"
          >
            Clear Secrets
          </button>
          <Link
            to="/swap"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
          >
            New Game
          </Link>
        </div>
      </div>

      {/* Debug info - show validation status */}
      {commitments.length > 0 && (
        <div className="mb-4 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm">
          <div className="text-slate-400 mb-2">
            Active Games: {commitments.length} (from contract)
            {getAllCommitments().length > 0 && ` • ${getAllCommitments().length} with stored secrets (move/salt)`}
            <br />
            Validation Status: {validatedHashes.size} / {commitments.length} checked
            {validationComplete && ` • ${validCommitments.size} valid on-chain`}
          </div>
          {commitments.length > 0 && (
            <div className="text-xs text-slate-500 space-y-1">
              {commitments.map((hash) => {
                const hasSecret = getCommitment(hash) !== null;
                return (
                  <div key={hash}>
                    {hash.slice(0, 10)}...: {validatedHashes.has(hash) 
                      ? (validCommitments.has(hash) ? `✓ Valid${hasSecret ? ' (has secret)' : ''}` : '✗ Not on-chain')
                      : '⏳ Checking...'}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {commitments.map((hash) => (
          <ValidatedGameCard 
            key={hash} 
            commitmentHash={hash} 
            address={address}
            onValidation={handleValidation}
          />
        ))}
      </div>
      
      {validationComplete && commitments.length > 0 && validCommitments.size === 0 && (
        <div className="text-center py-8 bg-yellow-500/20 border border-yellow-500 rounded-lg">
          <p className="text-yellow-400 mb-2">
            Games found on-chain but validation failed. This might indicate a connection issue.
          </p>
          <p className="text-sm text-slate-400 mb-4">
            Games are stored on-chain. localStorage only stores move/salt secrets for revealing.
          </p>
        </div>
      )}
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
