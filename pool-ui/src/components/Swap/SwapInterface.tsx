import { useState } from 'react';
import { useAccount } from 'wagmi';
import { config } from '../../lib/contracts';
import { useTokenBalance, useTokenSymbol, useApproveToken, useTokenAllowance } from '../../hooks/useToken';
import { useSwapWithCommitment } from '../../hooks/useSwap';
import { generateCommitmentHash, generateSalt, parseAmount, formatAmount } from '../../lib/utils';
import { saveCommitment } from '../../lib/storage';
import MoveSelector from './MoveSelector';
import toast from 'react-hot-toast';
import { Address } from 'viem';

export default function SwapInterface() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  const [zeroForOne, setZeroForOne] = useState(true);

  const token0Address = config.contracts.token0.address as Address;
  const token1Address = config.contracts.token1.address as Address;
  const routerAddress = config.contracts.router.address as Address;

  const inputToken = zeroForOne ? token0Address : token1Address;
  const outputToken = zeroForOne ? token1Address : token0Address;

  const { data: inputBalance } = useTokenBalance(inputToken, address);
  const { data: outputBalance } = useTokenBalance(outputToken, address);
  const { data: inputSymbol } = useTokenSymbol(inputToken);
  const { data: outputSymbol } = useTokenSymbol(outputToken);
  const { data: allowance } = useTokenAllowance(inputToken, address, routerAddress);
  const { approve, isPending: isApproving } = useApproveToken();
  const { swap, isPending: isSwapping, isSuccess } = useSwapWithCommitment();

  const needsApproval = amount && allowance !== undefined && parseAmount(amount) > allowance;

  const handleSwap = async () => {
    if (!address || !selectedMove || !amount) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      // Generate commitment
      const salt = generateSalt();
      const commitmentHash = generateCommitmentHash(selectedMove, salt);
      
      // Save to localStorage
      saveCommitment(commitmentHash, selectedMove, salt);

      // Parse amount
      const amountIn = parseAmount(amount);
      const amountOutMin = 0n; // TODO: Calculate minimum output
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

      // Execute swap
      swap(amountIn, amountOutMin, zeroForOne, commitmentHash, address, deadline);
      
      toast.success('Swap initiated! Check your games page.');
    } catch (error: any) {
      toast.error(error.message || 'Swap failed');
    }
  };

  const handleApprove = () => {
    if (!amount) return;
    const amountIn = parseAmount(amount);
    approve(inputToken, routerAddress, amountIn);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6">
        <h2 className="text-2xl font-bold text-white">Swap & Start Game</h2>

        {/* Token Selection */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setZeroForOne(true)}
            className={`px-4 py-2 rounded-md ${zeroForOne ? 'bg-primary-600' : 'bg-slate-700'} text-white`}
          >
            {inputSymbol || 'Token0'} → {outputSymbol || 'Token1'}
          </button>
          <button
            onClick={() => setZeroForOne(false)}
            className={`px-4 py-2 rounded-md ${!zeroForOne ? 'bg-primary-600' : 'bg-slate-700'} text-white`}
          >
            {outputSymbol || 'Token1'} → {inputSymbol || 'Token0'}
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Amount</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={() => inputBalance && setAmount(formatAmount(inputBalance))}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm"
            >
              Max
            </button>
          </div>
          {inputBalance && (
            <div className="text-sm text-slate-400">
              Balance: {formatAmount(inputBalance)} {inputSymbol}
            </div>
          )}
        </div>

        {/* Move Selector */}
        <MoveSelector
          selectedMove={selectedMove}
          onSelectMove={setSelectedMove}
          disabled={isSwapping || isApproving}
        />

        {/* Action Button */}
        {needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isApproving || !amount}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {isApproving ? 'Approving...' : `Approve ${inputSymbol}`}
          </button>
        ) : (
          <button
            onClick={handleSwap}
            disabled={isSwapping || !amount || selectedMove === null || !address}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {isSwapping ? 'Swapping...' : 'Swap & Start Game'}
          </button>
        )}

        {isSuccess && (
          <div className="p-4 bg-green-500/20 border border-green-500 rounded-md text-green-400">
            Swap successful! Your game has been created.
          </div>
        )}
      </div>
    </div>
  );
}
