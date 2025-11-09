import { Link } from 'react-router-dom';
import { formatAddress, formatAmount, getMoveName, getMoveEmoji } from '../../lib/utils';
import { Address } from 'viem';

interface PendingSwap {
  player1: Address;
  timestamp: bigint;
  poolId: `0x${string}`;
  currency: Address;
  player1Contribution: bigint;
  player2Moved: boolean;
  player2: Address;
  player2Move: number;
  player2Contribution: bigint;
  player2MoveTimestamp: bigint;
  revealed: boolean;
  player1Move: number;
  salt: `0x${string}`;
  resolved: boolean;
}

interface GameCardProps {
  commitmentHash: string;
  game: PendingSwap;
  isPlayer1: boolean;
  isPlayer2: boolean;
}

export default function GameCard({ commitmentHash, game, isPlayer1, isPlayer2 }: GameCardProps) {
  const getStatus = () => {
    if (game.resolved) return { text: 'Resolved', color: 'text-slate-400' };
    if (game.revealed) return { text: 'Revealed', color: 'text-blue-400' };
    if (game.player2Moved) return { text: 'Waiting for Reveal', color: 'text-yellow-400' };
    return { text: 'Waiting for Player 2', color: 'text-green-400' };
  };

  const status = getStatus();

  return (
    <Link
      to={`/games/${commitmentHash}`}
      className="block bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-mono text-slate-400">
              {commitmentHash.slice(0, 10)}...
            </span>
            <span className={`text-sm font-medium ${status.color}`}>{status.text}</span>
          </div>
          <div className="text-sm text-slate-300 space-y-1">
            <div>Player 1: {formatAddress(game.player1)}</div>
            {game.player2Moved && (
              <div>Player 2: {formatAddress(game.player2)}</div>
            )}
            <div>
              Prize: {formatAmount(game.player1Contribution + game.player2Contribution)}
            </div>
            {game.player2Moved && !game.revealed && (
              <div className="text-yellow-400">
                Player 2: {getMoveEmoji(game.player2Move)} {getMoveName(game.player2Move)}
              </div>
            )}
            {game.revealed && (
              <div className="space-y-1">
                <div>
                  Player 1: {getMoveEmoji(game.player1Move)} {getMoveName(game.player1Move)}
                </div>
                <div>
                  Player 2: {getMoveEmoji(game.player2Move)} {getMoveName(game.player2Move)}
                </div>
              </div>
            )}
          </div>
        </div>
        {(isPlayer1 || isPlayer2) && (
          <div className="ml-4 px-3 py-1 bg-primary-600/20 text-primary-400 rounded-md text-sm">
            {isPlayer1 ? 'You (P1)' : 'You (P2)'}
          </div>
        )}
      </div>
    </Link>
  );
}
