import SwapInterface from '../components/Swap/SwapInterface';

export default function Swap() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Swap & Start Game</h1>
        <p className="text-slate-400">
          Swap tokens and commit your Rock Paper Scissors move
        </p>
      </div>
      <SwapInterface />
    </div>
  );
}
