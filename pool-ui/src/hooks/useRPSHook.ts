import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { config, getPoolKey } from '../lib/contracts';
import { Address } from 'viem';

const hookAddress = config.contracts.hook.address as Address;
const hookAbi = config.contracts.hook.abi;

export function useRafflePoolBalance(poolId: `0x${string}`, currency: Address) {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'getRafflePoolBalance',
    args: [poolId, currency],
  });
}

export function useUserContribution(userAddress: Address | undefined, poolId: `0x${string}`, currency: Address) {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'getContributionByAddress',
    args: userAddress ? [userAddress, poolId, currency] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });
}

export function usePendingSwap(commitmentHash: `0x${string}` | undefined) {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'getPendingSwap',
    args: commitmentHash ? [commitmentHash] : undefined,
    query: {
      enabled: !!commitmentHash,
      refetchInterval: 5000, // Poll every 5 seconds
    },
  });
}

export function useCanRefund(commitmentHash: `0x${string}` | undefined) {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'canRefundSwap',
    args: commitmentHash ? [commitmentHash] : undefined,
    query: {
      enabled: !!commitmentHash,
      refetchInterval: 1000, // Poll every second for timeout
    },
  });
}

export function usePlayer2PostMove() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const postMove = (commitmentHash: `0x${string}`, move: number, contributionAmount: bigint) => {
    writeContract({
      address: hookAddress,
      abi: hookAbi,
      functionName: 'player2PostMove',
      args: [commitmentHash, move, contributionAmount],
    });
  };

  return {
    postMove,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function usePlayer1Reveal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const reveal = (commitmentHash: `0x${string}`, move: number, salt: `0x${string}`) => {
    writeContract({
      address: hookAddress,
      abi: hookAbi,
      functionName: 'player1Reveal',
      args: [commitmentHash, move, salt],
    });
  };

  return {
    reveal,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useRefundSwap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const refund = (commitmentHash: `0x${string}`) => {
    writeContract({
      address: hookAddress,
      abi: hookAbi,
      functionName: 'refundPlayer1Swap',
      args: [commitmentHash],
    });
  };

  return {
    refund,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useClaimPrize() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claim = (commitmentHash: `0x${string}`) => {
    writeContract({
      address: hookAddress,
      abi: hookAbi,
      functionName: 'claimPrizeAfterRevealTimeout',
      args: [commitmentHash],
    });
  };

  return {
    claim,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useAllActiveGames() {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'getAllActiveGames',
    query: {
      refetchInterval: 5000, // Poll every 5 seconds
    },
  });
}

export function useGamesWaitingForPlayer2() {
  return useReadContract({
    address: hookAddress,
    abi: hookAbi,
    functionName: 'getGamesWaitingForPlayer2',
    query: {
      refetchInterval: 5000, // Poll every 5 seconds
    },
  });
}
