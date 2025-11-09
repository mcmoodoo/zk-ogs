import { RPS_MOVES, MOVE_EMOJIS, MOVE_NAMES } from '../../lib/utils';

interface MoveSelectorProps {
  selectedMove: number | null;
  onSelectMove: (move: number) => void;
  disabled?: boolean;
}

export default function MoveSelector({ selectedMove, onSelectMove, disabled }: MoveSelectorProps) {
  const moves = [
    { value: RPS_MOVES.ROCK, emoji: MOVE_EMOJIS[0], name: MOVE_NAMES[0] },
    { value: RPS_MOVES.PAPER, emoji: MOVE_EMOJIS[1], name: MOVE_NAMES[1] },
    { value: RPS_MOVES.SCISSORS, emoji: MOVE_EMOJIS[2], name: MOVE_NAMES[2] },
  ];

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-300">Select Your Move</label>
      <div className="grid grid-cols-3 gap-4">
        {moves.map((move) => (
          <button
            key={move.value}
            onClick={() => !disabled && onSelectMove(move.value)}
            disabled={disabled}
            className={`
              p-6 rounded-lg border-2 transition-all
              ${selectedMove === move.value
                ? 'border-primary-500 bg-primary-500/20 scale-105'
                : 'border-slate-600 bg-slate-800 hover:border-slate-500'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="text-4xl mb-2">{move.emoji}</div>
            <div className="text-sm font-medium text-slate-200">{move.name}</div>
          </button>
        ))}
      </div>
      {selectedMove !== null && (
        <div className="text-sm text-slate-400">
          Selected: {MOVE_NAMES[selectedMove]} {MOVE_EMOJIS[selectedMove]}
        </div>
      )}
    </div>
  );
}
