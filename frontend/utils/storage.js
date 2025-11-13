// LocalStorage functions to track Maker's games
export function saveMakerGame(
  commitment,
  gameId,
  betAmount,
  salt = null,
  move = null,
  gameState = {}
) {
  try {
    const games = getMakerGames();
    const gameIdStr = gameId?.toString();
    
    if (!commitment && !gameIdStr) {
      console.warn("Cannot save maker game: no commitment or gameId");
      return;
    }

    const gameData = {
      commitment: commitment,
      gameId: gameIdStr,
      betAmount: betAmount,
      salt: salt || gameState.salt, // Store salt for later reveal
      move: move !== null ? move : gameState.move, // Store move for later reveal
      timestamp: Date.now(),
    };

    // Save under commitment key (primary key)
    if (commitment) {
      games[commitment] = gameData;
    }
    
    // Also save under gameId key (fallback key) if gameId exists
    if (gameIdStr) {
      games[gameIdStr] = gameData;
    }
    
    localStorage.setItem("makerGames", JSON.stringify(games));
    console.log(`✅ Saved maker game: commitment=${commitment?.slice(0, 10)}..., gameId=${gameIdStr}`);
  } catch (error) {
    console.error("Error saving maker game:", error);
  }
}

export function getMakerGames() {
  try {
    const stored = localStorage.getItem("makerGames");
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Error getting maker games:", error);
    return {};
  }
}

export function clearMakerGames() {
  try {
    localStorage.removeItem("makerGames");
  } catch (error) {
    console.error("Error clearing maker games:", error);
  }
}

// LocalStorage functions to track Taker's games
export function saveTakerGame(gameId, betAmount) {
  try {
    const games = getTakerGames();
    const gameKey = gameId?.toString();
    if (!gameKey) return;

    games[gameKey] = {
      gameId: gameId?.toString(),
      betAmount: betAmount,
      timestamp: Date.now(),
    };
    localStorage.setItem("takerGames", JSON.stringify(games));
  } catch (error) {
    console.error("Error saving taker game:", error);
  }
}

export function getTakerGames() {
  try {
    const stored = localStorage.getItem("takerGames");
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Error getting taker games:", error);
    return {};
  }
}

export function clearTakerGames() {
  try {
    localStorage.removeItem("takerGames");
  } catch (error) {
    console.error("Error clearing taker games:", error);
  }
}
