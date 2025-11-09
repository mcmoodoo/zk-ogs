import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { config } from '../lib/contracts';
import { Address, erc20Abi, maxUint256, Abi } from 'viem';

export function useTokenBalance(tokenAddress: Address, userAddress: Address | undefined) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!tokenAddress,
      retry: false,
      retryOnMount: false,
    },
  });
}

export function useTokenAllowance(tokenAddress: Address, owner: Address | undefined, spender: Address) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner, spender] : undefined,
    query: {
      enabled: !!owner && !!tokenAddress && !!spender,
      retry: false,
      retryOnMount: false,
    },
  });
}

export function useApproveToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract({
    mutation: {
      onError: (error) => {
        console.error('Approval transaction error:', error);
      },
    },
  });
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (tokenAddress: Address, spender: Address, amount?: bigint) => {
    if (!tokenAddress || !spender) {
      throw new Error('Token address and spender address are required');
    }

    // Use unlimited allowance (maxUint256) by default
    const approvalAmount = amount ?? maxUint256;
    
    // Get the token ABI from config - use the actual deployed contract ABI
    let tokenAbi: Abi = erc20Abi;
    const token0Addr = config.contracts.token0.address.toLowerCase();
    const token1Addr = config.contracts.token1.address.toLowerCase();
    const targetAddr = tokenAddress.toLowerCase();
    
    if (targetAddr === token0Addr && config.contracts.token0.abi && config.contracts.token0.abi.length > 0) {
      tokenAbi = config.contracts.token0.abi as Abi;
    } else if (targetAddr === token1Addr && config.contracts.token1.abi && config.contracts.token1.abi.length > 0) {
      tokenAbi = config.contracts.token1.abi as Abi;
    }
    
    console.log('Approving token:', {
      tokenAddress,
      spender,
      amount: approvalAmount.toString(),
      usingAbi: tokenAbi === erc20Abi ? 'generic ERC20' : 'deployed contract ABI',
    });
    
    // Use writeContract - the supportsInterface errors are just warnings, transaction will still work
    writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: 'approve',
      args: [spender, approvalAmount],
    });
  };

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useTokenDecimals(tokenAddress: Address) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    query: {
      enabled: !!tokenAddress,
      retry: false, // Don't retry on failure
      retryOnMount: false,
    },
  });
}

export function useTokenSymbol(tokenAddress: Address) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
    query: {
      enabled: !!tokenAddress,
      retry: false,
      retryOnMount: false,
    },
  });
}

export function useMintToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const mint = (tokenAddress: Address, to: Address, amount: bigint) => {
    // Get the token ABI from config (token0 or token1)
    const tokenAbi = 
      tokenAddress.toLowerCase() === config.contracts.token0.address.toLowerCase()
        ? config.contracts.token0.abi
        : config.contracts.token1.abi;

    writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: 'mint',
      args: [to, amount],
    });
  };

  return {
    mint,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}
