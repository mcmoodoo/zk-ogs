import { useAccount } from 'wagmi';
import { useRafflePoolBalance, useUserContribution } from '../hooks/useRPSHook';
import { config, getPoolId } from '../lib/contracts';
import { formatAmount } from '../lib/utils';
import { Address } from 'viem';

export default function Pool() {
  const { address } = useAccount();
  const poolId = getPoolId();
  const token0Address = config.contracts.token0.address as Address;
  const token1Address = config.contracts.token1.address as Address;

  const { data: poolBalance0 } = useRafflePoolBalance(poolId, token0Address);
  const { data: poolBalance1 } = useRafflePoolBalance(poolId, token1Address);
  const { data: userContribution0 } = useUserContribution(address, poolId, token0Address);
  const { data: userContribution1 } = useUserContribution(address, poolId, token1Address);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Raffle Pool Stats</h1>
        <p className="text-slate-400">
          View the total pool balance and your contributions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Token0 Pool */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Token0 Pool</div>
          <div className="text-3xl font-bold text-white mb-4">
            {poolBalance0 ? formatAmount(poolBalance0) : '0.0'}
          </div>
          {address && (
            <div className="pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400 mb-1">Your Contribution</div>
              <div className="text-xl font-semibold text-primary-400">
                {userContribution0 ? formatAmount(userContribution0) : '0.0'}
              </div>
            </div>
          )}
        </div>

        {/* Token1 Pool */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Token1 Pool</div>
          <div className="text-3xl font-bold text-white mb-4">
            {poolBalance1 ? formatAmount(poolBalance1) : '0.0'}
          </div>
          {address && (
            <div className="pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400 mb-1">Your Contribution</div>
              <div className="text-xl font-semibold text-primary-400">
                {userContribution1 ? formatAmount(userContribution1) : '0.0'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">How the Pool Works</h2>
        <div className="space-y-3 text-slate-300">
          <p>
            Every swap on the pool contributes 5% of the output amount to the raffle pool.
          </p>
          <p>
            When you start a game by swapping with a commitment, your contribution is locked in the pool.
          </p>
          <p>
            The winner of each Rock Paper Scissors game takes the combined contributions from both players.
          </p>
          <p className="text-sm text-slate-400">
            Note: The pool accumulates contributions from all swaps, not just game participants.
          </p>
        </div>
      </div>
    </div>
  );
}
