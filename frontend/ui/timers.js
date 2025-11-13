import { log } from "../utils/logger.js";

// Timer management for active games
// Returns timer functions that work with the provided state objects
export function createTimers(
  rpsContract,
  activeGamesData,
  selectedMovesByGame,
  loadAllTakerGames,
  signer
) {
  let activeGamesUpdateInterval = null;
  let autoRefreshInterval = null;

  async function startActiveGamesTimer() {
    // Clear existing interval if any
    if (activeGamesUpdateInterval) {
      clearInterval(activeGamesUpdateInterval);
    }

    // Get REFUND_TIMEOUT from DegenRPS contract (defaults to 30 minutes = 1800 seconds)
    let refundTimeout = 1800; // default: 30 minutes
    if (rpsContract) {
      try {
        const timeout = await rpsContract.revealTimeout();
        refundTimeout = Number(timeout);
      } catch (error) {
        console.warn(
          "Could not get revealTimeout from DegenRPS contract, using default 30 minutes (1800 seconds)"
        );
      }
    }

    // Update every second
    activeGamesUpdateInterval = setInterval(() => {
      updateActiveGamesTimers(refundTimeout);
    }, 1000);

    // Initial update
    updateActiveGamesTimers(refundTimeout);
  }

  function stopActiveGamesTimer() {
    if (activeGamesUpdateInterval) {
      clearInterval(activeGamesUpdateInterval);
      activeGamesUpdateInterval = null;
    }
    activeGamesData.length = 0;
    // Clear selected moves when stopping timer
    Object.keys(selectedMovesByGame).forEach((key) => {
      delete selectedMovesByGame[key];
    });
  }

  // Auto-refresh games list periodically when on taker view
  function startAutoRefresh() {
    // Clear existing interval if any
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }

    // Refresh every 15 seconds
    autoRefreshInterval = setInterval(() => {
      const takerView = document.getElementById("takerView");
      if (takerView && !takerView.classList.contains("hidden") && signer) {
        console.log("🔄 Auto-refreshing games list...");
        loadAllTakerGames();
      }
    }, 15000); // 15 seconds
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  function updateActiveGamesTimers(refundTimeout) {
    if (!activeGamesData || activeGamesData.length === 0) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    activeGamesData.forEach(({ commitmentHash, timestamp, gameId }) => {
      const expiryTime = timestamp + refundTimeout;
      const timeRemaining = expiryTime - now;
      const isExpired = timeRemaining <= 0;

      // Format time remaining
      let timeRemainingText = "";
      if (isExpired) {
        const expiredSeconds = Math.abs(timeRemaining);
        const expiredMinutes = Math.floor(expiredSeconds / 60);
        const expiredSecs = expiredSeconds % 60;
        timeRemainingText = `Expired ${expiredMinutes}:${expiredSecs
          .toString()
          .padStart(2, "0")} ago`;
      } else {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        timeRemainingText = `${minutes}:${seconds
          .toString()
          .padStart(2, "0")} remaining`;
      }

      // Update the display
      const timeElement = document.getElementById(`${gameId}-time-remaining`);
      if (timeElement) {
        timeElement.textContent = timeRemainingText;
        timeElement.className = `text-sm font-semibold ${
          isExpired ? "text-red-600" : "text-orange-600"
        }`;

        // Update parent container styling if expired
        const gameContainer = document.getElementById(gameId);
        if (gameContainer) {
          if (isExpired) {
            gameContainer.className =
              "bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4";
          } else {
            gameContainer.className =
              "bg-white border-2 border-purple-200 rounded-xl p-4 mb-4";
          }

          // Update join button - but preserve enabled state if move is selected
          const joinBtn = document.getElementById(`${gameId}-join-btn`);
          if (joinBtn) {
            const hasMoveSelected = selectedMovesByGame[gameId] !== undefined;

            if (isExpired) {
              joinBtn.className =
                "w-full px-4 py-2 bg-red-300 text-red-700 cursor-not-allowed font-semibold rounded-lg";
              joinBtn.disabled = true;
              joinBtn.textContent = "⏰ Game Expired";
            } else if (hasMoveSelected) {
              // Preserve enabled state if move is selected
              joinBtn.className =
                "w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 transform hover:scale-105 transition-all font-semibold rounded-lg";
              joinBtn.disabled = false;
              joinBtn.textContent = "🎮 Join This Game";
            } else {
              // No move selected - keep disabled
              joinBtn.className =
                "w-full px-4 py-2 bg-gray-300 text-gray-600 cursor-not-allowed font-semibold rounded-lg";
              joinBtn.disabled = true;
              joinBtn.textContent = "🎮 Join This Game";
            }
          }
        }
      }
    });
  }

  return {
    startActiveGamesTimer,
    stopActiveGamesTimer,
    startAutoRefresh,
    stopAutoRefresh,
    updateActiveGamesTimers,
  };
}

