import { createGameState } from "./constants.js";

// Global state management
export const state = {
  // Game state
  gameState: createGameState(),

  // Current view: "maker" or "taker"
  currentView: "maker",

  // Interval for real-time timeout updates
  activeGamesUpdateInterval: null,
  activeGamesData: [], // Store game data for real-time updates
  selectedMovesByGame: {}, // Track which games have moves selected: { gameId: move }
  autoRefreshInterval: null, // Auto-refresh games list interval

  // Noir and backend
  circuit: null,
  noir: null,
  backend: null,

  // Provider and signer
  provider: null,
  signer: null,

  // Contract instances
  rpsContract: null, // DegenRPS contract
  token0Contract: null,
  token1Contract: null,

  // Contract addresses and ABIs - will be loaded from deployments.json
  RPS_ADDRESS: null, // DegenRPS contract address
  TOKEN0_ADDRESS: null,
  TOKEN1_ADDRESS: null,

  // Network configuration
  DEPLOYED_CHAIN_ID: null,
  DEPLOYED_RPC_URL: null,

  // Deployments data (loaded from deployments.json)
  deployments: null,

  // ERC20 ABI (will be loaded from deployments or use fallback)
  erc20ABI: null,
};

// Helper to get state
export function getState() {
  return state;
}

// Helper to update state
export function updateState(updates) {
  Object.assign(state, updates);
}
