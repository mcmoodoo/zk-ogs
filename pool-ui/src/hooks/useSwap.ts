import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { config, routerAbi, getPoolKey } from '../lib/contracts';
import { Address } from 'viem';

const routerAddress = config.contracts.router.address as Address;

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
  };
}
