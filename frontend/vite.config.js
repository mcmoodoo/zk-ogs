import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      // To add only specific polyfills, add them here. If no option is given,
      // all polyfills are added.
      include: ['buffer', 'crypto', 'stream', 'util'],
      // To exclude specific polyfills, add them to this array.
      exclude: ['http'],
      // Whether to polyfill `node:test` module.
      protocolImports: true,
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: './index.html',
        fund: './fund.html',
        'swap-rps': './swap-rps.html',
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    exclude: [
      '@noir-lang/noirc_abi',
      '@noir-lang/acvm_js',
      '@aztec/bb.js',
      '@noir-lang/noir_js',
    ],
  },
  worker: {
    format: 'es',
  },
});

