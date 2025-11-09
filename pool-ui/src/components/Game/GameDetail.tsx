import { useParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { usePendingSwap, usePlayer1Reveal, usePlayer2PostMove, useRefundSwap, useClaimPrize, useCanRefund } from '../../hooks/useRPSHook';
import { useUserContribution } from '../../hooks/useRPSHook';
import { config, getPoolId } from '../../lib/contracts';
import { formatAddress, formatAmount, getMoveName, getMoveEmoji, determineWinner } from '../../lib/utils';
import { getCommitment } from '../../lib/storage';
import { Address } from 'viem';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';

export default function GameDetail() {
  const { hash } = useParams<{ hash: string }>();
  const { address } = useAccount();
  const commitmentHash = hash as `0x${string}` | undefined;

  const { data: game } = usePendingSwap(commitmentHash);
  const { data: canRefund, data: timeRemaining } = useCanRefund(commitmentHash);
  const poolId = getPoolId();
  const currency = game?.currency || (config.contracts.token0.address as Address);
  const { data: userContribution } = useUserContribution(address, poolId, currency);

  const { reveal, isPending: isRevealing } = usePlayer1Reveal();
  const { postMove, isPending: isPostingMove } = usePlayer2PostMove();
  const { refund, isPending: isRefunding } = useRefundSwap();
  const { claim, isPending: isClaiming } = useClaimPrize();

  const [move, setMove] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (timeRemaining && timeRemaining > 0n) {
      setCountdown(Number(timeRemaining));
      const interval = setInterval(() => {
        setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timeRemaining]);

  if (!game || !commitmentHash) {
    return (
      <div className="text-center text-slate-400">
        Game not found
      </div>
    );
  }

  const isPlayer1 = address?.toLowerCase() === game.player1.toLowerCase();
  const isPlayer2 = address?.toLowerCase() === game.player2.toLowerCase();
  const canJoin = !game.player2Moved && !isPlayer1 && address;
  const canReveal = isPlayer1 && game.player2Moved && !game.revealed;
  const canClaimTimeout = isPlayer2 && game.player2Moved && !game.revealed;

  const handleReveal = () => {
    const commitment = getCommitment(commitmentHash);
    if (!commitment) {
      toast.error('Commitment not found in local storage. Please enter manually.');
      return;
    }
    reveal(commitmentHash, commitment.move, commitment.salt as `0x${string}`);
  };

  const handlePostMove = () => {
    if (move === null) {
      toast.error('Please select a move');
      return;
    }
    if (!userContribution || userContribution < game.player1Contribution) {
      toast.error('Insufficient contribution. Make a swap first.');
      return;
    }
    postMove(commitmentHash, move, game.player1Contribution);
  };

  const winner = game.revealed
    ? determineWinner(game.player1Move, game.player2Move)
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Game Details</h2>
          <div className="text-sm font-mono text-slate-400 break-all">{commitmentHash}</div>
        </div>

        {/* Game Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Player 1</div>
            <div className="text-white font-medium">{formatAddress(game.player1)}</div>
            <div className="text-sm text-slate-300 mt-2">
              Contribution: {formatAmount(game.player1Contribution)}
            </div>
            {game.revealed && (
              <div className="text-lg mt-2">
                {getMoveEmoji(game.player1Move)} {getMoveName(game.player1Move)}
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Player 2</div>
            {game.player2Moved ? (
              <>
                <div className="text-white font-medium">{formatAddress(game.player2)}</div>
                <div className="text-sm text-slate-300 mt-2">
                  Contribution: {formatAmount(game.player2Contribution)}
                </div>
                {game.player2Moved && (
                  <div className="text-lg mt-2">
                    {getMoveEmoji(game.player2Move)} {getMoveName(game.player2Move)}
                  </div>
                )}
              </>
            ) : (
              <div className="text-slate-500">Waiting...</div>
            )}
          </div>
        </div>

        {/* Prize Pool */}
        <div className="bg-primary-500/20 border border-primary-500 rounded-lg p-4">
          <div className="text-sm text-primary-300 mb-1">Prize Pool</div>
          <div className="text-2xl font-bold text-white">
            {formatAmount(game.player1Contribution + game.player2Contribution)}
          </div>
        </div>

        {/* Winner Display */}
        {game.revealed && winner && (
          <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
            <div className="text-lg font-bold text-green-400">
              {winner === 'tie' ? "It's a tie!" : `Winner: ${winner === 'player1' ? 'Player 1' : 'Player 2'}`}
            </div>
          </div>
        )}

        {/* Countdown Timer */}
        {countdown !== null && countdown > 0 && (
          <div className="text-center text-yellow-400">
            Time remaining: {countdown}s
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {canJoin && (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Select your move:</div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMove(m)}
                    className={`p-4 rounded-lg border-2 ${
                      move === m
                        ? 'border-primary-500 bg-primary-500/20'
                        : 'border-slate-600 bg-slate-900'
                    }`}
                  >
                    <div className="text-3xl">{getMoveEmoji(m)}</div>
                    <div className="text-sm mt-1">{getMoveName(m)}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={handlePostMove}
                disabled={isPostingMove || move === null}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-md font-medium"
              >
                {isPostingMove ? 'Joining...' : 'Join Game'}
              </button>
            </div>
          )}

          {canReveal && (
            <button
              onClick={handleReveal}
              disabled={isRevealing}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {isRevealing ? 'Revealing...' : 'Reveal Move'}
            </button>
          )}

          {canRefund && isPlayer1 && (
            <button
              onClick={() => refund(commitmentHash)}
              disabled={isRefunding}
              className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {isRefunding ? 'Refunding...' : 'Request Refund'}
            </button>
          )}

          {canClaimTimeout && (
            <button
              onClick={() => claim(commitmentHash)}
              disabled={isClaiming}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {isClaiming ? 'Claiming...' : 'Claim Prize (Timeout)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
