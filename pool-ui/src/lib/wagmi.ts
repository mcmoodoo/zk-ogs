import { createConfig, http } from 'wagmi';
import { localhost, mainnet } from 'wagmi/chains';
import { injected, metaMask } from 'wagmi/connectors';
import config from '../../deployments.json';

// Create a custom chain for local Anvil
const anvilChain = {
  ...localhost,
  id: parseInt(config.chainId),
  name: 'Local Anvil',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [config.rpcUrl],
    },
  },
};

export const wagmiConfig = createConfig({
  chains: [anvilChain, mainnet],
  connectors: [injected(), metaMask()],
  transports: {
    [anvilChain.id]: http(),
    [mainnet.id]: http(),
  },
});
