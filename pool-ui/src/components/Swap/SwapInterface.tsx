import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '../../lib/contracts';
import { useTokenBalance, useTokenSymbol, useApproveToken, useTokenAllowance } from '../../hooks/useToken';
import { useSwapWithCommitment } from '../../hooks/useSwap';
import { generateCommitmentHash, generateSalt, parseAmount, formatAmount } from '../../lib/utils';
import { saveCommitment } from '../../lib/storage';
import MoveSelector from './MoveSelector';
import toast from 'react-hot-toast';
import { Address, maxUint256 } from 'viem';

export default function SwapInterface() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  const [zeroForOne, setZeroForOne] = useState(true);

  const token0Address = config.contracts.token0.address as Address;
  const token1Address = config.contracts.token1.address as Address;
  // Use SenderRelayRouter if available, otherwise fall back to base router
  const routerAddress = (config.contracts.senderRelayRouter?.address || config.contracts.router.address) as Address;

  const inputToken = zeroForOne ? token0Address : token1Address;
  const outputToken = zeroForOne ? token1Address : token0Address;

  // Safety check: ensure we're not accidentally using router address as token
  if (!inputToken || !outputToken || inputToken === routerAddress || outputToken === routerAddress) {
    console.error('Invalid token addresses detected!', { inputToken, outputToken, routerAddress });
  }

  const { data: inputBalance } = useTokenBalance(inputToken, address);
  const { data: outputBalance } = useTokenBalance(outputToken, address);
  const { data: inputSymbol } = useTokenSymbol(inputToken);
  const { data: outputSymbol } = useTokenSymbol(outputToken);
  const { data: allowance, refetch: refetchAllowance } = useTokenAllowance(inputToken, address, routerAddress);
  const { approve, isPending: isApproving, isSuccess: isApprovalSuccess, error: approvalError } = useApproveToken();
  const { swap, isPending: isSwapping, isLoading: isConfirming, isSuccess, hash, error: swapError } = useSwapWithCommitment();
  
  // Track if a swap transaction is in progress (pending or confirming)
  const isSwapInProgress = isSwapping || isConfirming || !!hash;

  // Refetch allowance when approval succeeds
  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful! Unlimited allowance granted.');
      // Invalidate and refetch allowance after a short delay to allow blockchain to update
      setTimeout(() => {
        queryClient.invalidateQueries();
        refetchAllowance?.();
      }, 1000);
    }
  }, [isApprovalSuccess, queryClient, refetchAllowance]);

  // Show swap errors
  useEffect(() => {
    if (swapError) {
      console.error('Swap transaction error:', swapError);
      toast.error(`Swap failed: ${swapError.message || 'Unknown error'}`);
    }
  }, [swapError]);

  // Show approval errors
  useEffect(() => {
    if (approvalError) {
      console.error('Approval error:', approvalError);
      const errorMessage = approvalError instanceof Error 
        ? approvalError.message 
        : 'Approval failed. Please try again.';
      toast.error(`Approval failed: ${errorMessage}`);
    }
  }, [approvalError]);

  // Check if approval is needed
  // We need approval if:
  // 1. Allowance is loaded (not undefined)
  // 2. We don't have unlimited allowance (allowance < 90% of maxUint256)
  // 3. Either no amount is entered yet, or allowance is less than amount needed
  // Note: We use a large threshold (90% of maxUint256) to consider it "unlimited"
  const UNLIMITED_THRESHOLD = maxUint256 / 10n * 9n; // 90% of maxUint256
  const hasUnlimitedAllowance = allowance !== undefined && allowance >= UNLIMITED_THRESHOLD;
  const amountNeeded = amount ? parseAmount(amount) : 0n;
  
  // Only show approval button if:
  // - Allowance is loaded
  // - We don't have unlimited allowance
  // - Either no amount entered, or current allowance is insufficient
  const needsApproval = allowance !== undefined && 
    !hasUnlimitedAllowance && 
    (amountNeeded === 0n || allowance < amountNeeded);

  const handleSwap = async () => {
    // Prevent double-submission
    if (isSwapInProgress) {
      toast.error('Transaction already in progress. Please wait...');
      return;
    }

    if (!address || selectedMove === null || !amount) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      // Generate commitment hash for commit-reveal scheme
      const salt = generateSalt();
      const commitmentHash = generateCommitmentHash(selectedMove, salt);
      
      // Save move + salt to localStorage (needed for Player 1 to reveal later)
      // The commitment hash goes on-chain, but we need the original move/salt to reveal
      saveCommitment(commitmentHash, selectedMove, salt);

      // Parse amount
      const amountIn = parseAmount(amount);
      const amountOutMin = 0n; // TODO: Calculate minimum output
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

      // Execute swap
      console.log('Initiating swap with commitment:', {
        commitmentHash,
        amountIn: amountIn.toString(),
        routerAddress,
      });
      
      swap(amountIn, amountOutMin, zeroForOne, commitmentHash, address, deadline);
      
      toast.success('Swap initiated! Check your games page.');
    } catch (error: any) {
      console.error('Swap initiation error:', error);
      toast.error(error.message || 'Swap failed');
    }
  };

  const handleApprove = async () => {
    try {
      // Approve with unlimited allowance (no amount parameter = maxUint256)
      approve(inputToken, routerAddress);
    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error(`Approval failed: ${error?.message || 'Unknown error'}`);
    }
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
          <div className="flex items-center justify-between text-sm">
            {inputBalance && (
              <div className="text-slate-400">
                Balance: {formatAmount(inputBalance)} {inputSymbol}
              </div>
            )}
            {allowance !== undefined && (
              <div className={`text-xs ${hasUnlimitedAllowance ? 'text-green-400' : 'text-slate-500'}`}>
                {hasUnlimitedAllowance ? '✓ Unlimited allowance' : `Allowance: ${formatAmount(allowance)}`}
              </div>
            )}
          </div>
        </div>

        {/* Move Selector */}
        <MoveSelector
          selectedMove={selectedMove}
          onSelectMove={setSelectedMove}
          disabled={isSwapInProgress || isApproving}
        />

        {/* Approval Error Display */}
        {approvalError && (
          <div className="p-4 bg-red-500/20 border border-red-500 rounded-md text-red-400 text-sm">
            <div className="font-semibold mb-1">Approval Error:</div>
            <div>{approvalError instanceof Error ? approvalError.message : String(approvalError)}</div>
            <div className="mt-2 text-xs text-red-300">
              Tip: Make sure you're connected to the correct network and have sufficient gas.
            </div>
          </div>
        )}

        {/* Action Button */}
        {needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {isApproving ? 'Approving...' : `Approve ${inputSymbol} (Unlimited)`}
          </button>
        ) : (
          <button
            onClick={handleSwap}
            disabled={isSwapInProgress || !amount || selectedMove === null || !address}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {isSwapInProgress ? (isConfirming ? 'Confirming...' : 'Swapping...') : 'Swap & Start Game'}
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
