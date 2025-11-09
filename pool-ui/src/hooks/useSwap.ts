import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { config, routerAbi, getPoolKey } from '../lib/contracts';
import { Address } from 'viem';

// Use SenderRelayRouter if available, otherwise fall back to base router
const routerAddress = (config.contracts.senderRelayRouter?.address || config.contracts.router.address) as Address;

export function useSwapWithCommitment() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const swap = (
    amountIn: bigint,
    amountOutMin: bigint,
    zeroForOne: boolean,
    commitmentHash: `0x${string}`,
    receiver: Address,
    deadline: bigint
  ) => {
    const poolKey = getPoolKey();
    
    // Debug logging
    console.log('Swap with commitment:', {
      routerAddress,
      amountIn: amountIn.toString(),
      commitmentHash,
      zeroForOne,
      poolKey,
    });
    
    // Validate commitment hash is not zero
    if (!commitmentHash || commitmentHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.error('Invalid commitment hash: cannot be zero');
      throw new Error('Commitment hash cannot be zero');
    }
    
    writeContract({
      address: routerAddress,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokensWithCommitment',
      args: [
        amountIn,
        amountOutMin,
        zeroForOne,
        poolKey,
        commitmentHash,
        '0x' as `0x${string}`, // empty hookData
        receiver,
        deadline,
      ],
    });
  };

  return {
    swap,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isConfirming,
  };
}
