import deployments from '../../deployments.json';
import { encodeAbiParameters, parseAbiParameters, keccak256 } from 'viem';

export interface DeploymentConfig {
  chainId: string;
  rpcUrl: string;
  contracts: {
    token0: { address: string; abi: any[] };
    token1: { address: string; abi: any[] };
    poolManager: { address: string; abi: any[] };
    positionManager: { address: string; abi: any[] };
    router: { address: string; abi: any[] };
    senderRelayRouter?: { address: string; abi: any[] };
    hook: { address: string; abi: any[] };
  };
}

export const config = deployments as DeploymentConfig;

// Router ABI - minimal interface for swapExactTokensForTokensWithCommitment
export const routerAbi = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'zeroForOne', type: 'bool' },
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'commitmentHash', type: 'bytes32' },
      { name: 'hookData', type: 'bytes' },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokensWithCommitment',
    outputs: [
      {
        name: 'delta',
        type: 'tuple',
        components: [
          { name: 'amount0', type: 'int128' },
          { name: 'amount1', type: 'int128' },
        ],
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

// Pool Key for the deployed pool (you may need to adjust these values)
export const POOL_FEE = 3000; // 0.3%
export const POOL_TICK_SPACING = 60;

export function getPoolKey() {
  return {
    currency0: config.contracts.token0.address as `0x${string}`,
    currency1: config.contracts.token1.address as `0x${string}`,
    fee: POOL_FEE,
    tickSpacing: POOL_TICK_SPACING,
    hooks: config.contracts.hook.address as `0x${string}`,
  };
}

export function getPoolId(): `0x${string}` {
  // PoolId is keccak256(abi.encode(poolKey))
  const poolKey = getPoolKey();
  const encoded = encodeAbiParameters(
    parseAbiParameters('address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks'),
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  return keccak256(encoded);
}
