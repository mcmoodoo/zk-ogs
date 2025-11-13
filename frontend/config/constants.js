// Game state
export const createGameState = () => ({
  gameId: null, // Game ID from DegenRPS contract
  role: null, // "maker" or "taker"
  move: null,
  salt: null,
  commitment: null,
});

// Move names for display
export const MOVE_NAMES = ["Rock 🪨", "Paper 📄", "Scissors ✂️"];

// DegenRPS GameState enum values
export const GAME_STATE = {
  WAITING_FOR_PLAYER2: 0,
  WAITING_FOR_REVEAL: 1,
  SETTLED: 2,
};

// Move enum conversion (frontend uses 0,1,2; contract uses 1,2,3)
export function frontendToContractMove(frontendMove) {
  return frontendMove + 1; // Convert 0,1,2 to 1,2,3
}

export function contractToFrontendMove(contractMove) {
  return contractMove - 1; // Convert 1,2,3 to 0,1,2
}
