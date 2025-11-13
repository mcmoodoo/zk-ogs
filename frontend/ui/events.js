import { log } from "../utils/logger.js";
import { ethers } from "ethers";

// Switch between Maker and Taker views
export function switchView(
  view,
  currentViewRef,
  stopActiveGamesTimer,
  getSigner, // Getter function or value
  loadMakerGamesWithFeedback,
  loadAllTakerGames
) {
  // Helper to get value (handles both functions and direct values)
  const getValue = (getter) =>
    typeof getter === "function" ? getter() : getter;
  const signer = getValue(getSigner);

  currentViewRef.current = view;
  const makerView = document.getElementById("makerView");
  const takerView = document.getElementById("takerView");
  const makerTabBtn = document.getElementById("makerTabBtn");
  const takerTabBtn = document.getElementById("takerTabBtn");

  if (view === "maker") {
    // Stop timer when switching away from taker view
    stopActiveGamesTimer();
    makerView?.classList.remove("hidden");
    takerView?.classList.add("hidden");
    makerTabBtn?.classList.remove("bg-gray-200", "text-gray-700");
    makerTabBtn?.classList.add(
      "bg-gradient-to-r",
      "from-blue-600",
      "to-indigo-600",
      "text-white",
      "shadow-lg"
    );
    takerTabBtn?.classList.remove(
      "bg-gradient-to-r",
      "from-blue-600",
      "to-indigo-600",
      "text-white",
      "shadow-lg"
    );
    takerTabBtn?.classList.add("bg-gray-200", "text-gray-700");
    // Load maker's games when switching to maker view
    if (signer) {
      loadMakerGamesWithFeedback();
    }
  } else {
    makerView?.classList.add("hidden");
    takerView?.classList.remove("hidden");
    takerTabBtn?.classList.remove("bg-gray-200", "text-gray-700");
    takerTabBtn?.classList.add(
      "bg-gradient-to-r",
      "from-blue-600",
      "to-indigo-600",
      "text-white",
      "shadow-lg"
    );
    makerTabBtn?.classList.remove(
      "bg-gradient-to-r",
      "from-blue-600",
      "to-indigo-600",
      "text-white",
      "shadow-lg"
    );
    makerTabBtn?.classList.add("bg-gray-200", "text-gray-700");
    // Load taker's games when switching to taker view
    // Timer will be started by loadActiveGames()
    if (signer) {
      loadAllTakerGames();
    }
  }
}

// Update game status display
export async function updateGameStatus(
  gameState,
  rpsContract,
  signer,
  revealMakerMove
) {
  const statusDiv = document.getElementById("gameResolutionStatus");
  if (!statusDiv) {
    return;
  }

  // If no game, show default message
  if (!gameState.gameId && !gameState.commitment) {
    statusDiv.innerHTML = `
      <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
        <p class="text-sm text-gray-600 text-center">
          No active game. Create or join a game to see status here.
        </p>
      </div>
    `;
    return;
  }

  try {
    let statusText = "Waiting";
    let statusColor = "yellow";
    let details = "";
    let game = null;

    // Try to get status from DegenRPS contract if we have gameId
    if (gameState.gameId && rpsContract) {
      try {
        game = await rpsContract.getGame(gameState.gameId);
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" && game.length !== undefined);
        const status = isArray ? game[3] : game.status;
        const statusNum = Number(status);

        switch (statusNum) {
          case 0: // WaitingForPlayer
            statusText = "Waiting for Player 2";
            statusColor = "yellow";
            details = "Waiting for Player 2 to join with opposite swap.";
            break;
          case 1: // Committed
            statusText = "Committed";
            statusColor = "blue";
            details = "Player 1 committed move. Waiting for Player 2...";
            break;
          case 2: // Revealed (Player 2 joined, waiting for reveal)
            statusText = "Waiting for Reveal";
            statusColor = "orange";
            details = "Player 2 has joined. Player 1 must reveal their move.";
            break;
          case 3: // Completed
            statusText = "Completed";
            statusColor = "green";
            const winner = isArray ? game[7] : game.winner;
            const winnerNum = Number(winner);
            if (winnerNum === 0) {
              details = "Game completed: It's a tie! 🤝";
            } else if (winnerNum === gameState.playerNumber) {
              details = "Game completed: You won! 🎉";
            } else {
              details = "Game completed: You lost. 😔";
            }
            break;
        }
      } catch (rpsError) {
        log(`⚠️ Error reading from DegenRPS contract: ${rpsError.message}`);
      }
    }

    const borderColorClass =
      {
        yellow: "border-yellow-200",
        blue: "border-blue-200",
        orange: "border-orange-200",
        green: "border-green-200",
      }[statusColor] || "border-gray-200";

    const gameIdDisplay = gameState.gameId
      ? `Game ID: <span class="font-mono text-purple-600">${gameState.gameId}</span>`
      : `Commitment: <span class="font-mono text-purple-600 text-xs">${gameState.commitment?.slice(
          0,
          10
        )}...${gameState.commitment?.slice(-8)}</span>`;

    statusDiv.innerHTML = `
      <div class="bg-white rounded-xl p-4 border-2 ${borderColorClass} slide-up">
        <div class="flex flex-wrap items-center gap-3 mb-2">
          <span class="status-badge status-${statusText
            .toLowerCase()
            .replace(" ", "-")}">${statusText}</span>
          <span class="text-gray-600 font-semibold text-sm">${gameIdDisplay}</span>
        </div>
        <p class="text-gray-700 font-medium text-sm">${details}</p>
        <p class="text-gray-600 text-xs mt-2">
          👤 You are <span class="font-semibold text-purple-600">Player ${
            gameState.playerNumber
          }</span>
        </p>
      </div>
    `;

    // Show reveal button if Player 1 and Player 2 has joined
    if (gameState.playerNumber === 1 && game && rpsContract) {
      const isArray =
        Array.isArray(game) ||
        (typeof game === "object" && game.length !== undefined);
      const status = isArray ? game[3] : game.status;
      const player2 = isArray ? game[2] : game.player2;
      const statusNum = Number(status);

      if (
        statusNum === 2 &&
        player2 !== ethers.ZeroAddress &&
        !gameState.isRevealed
      ) {
        const revealStatusDiv = document.getElementById("revealStatus");
        if (revealStatusDiv) {
          revealStatusDiv.innerHTML = `
            <button
              id="revealBtn"
              class="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              🔓 Reveal Move
            </button>
          `;
          // Remove old listener and add new one
          const oldBtn = document.getElementById("revealBtn");
          if (oldBtn) {
            const newBtn = oldBtn.cloneNode(true);
            oldBtn.parentNode.replaceChild(newBtn, oldBtn);
            newBtn.addEventListener("click", () => {
              if (gameState.gameId && gameState.commitment) {
                revealMakerMove(gameState.gameId, gameState.commitment);
              }
            });
          }
        }
      }
    }
  } catch (error) {
    log(`⚠️ Error updating game status: ${error.message}`);
  }
}

// Update step checkmarks
export function updateStepCheckmarks(signer, gameState) {
  const step1Checkmark = document.getElementById("step1Checkmark");
  if (step1Checkmark) {
    step1Checkmark.classList.toggle("hidden", !signer);
  }

  const step2Checkmark = document.getElementById("step2Checkmark");
  if (step2Checkmark) {
    step2Checkmark.classList.toggle("hidden", gameState.move === null);
  }

  const step3Checkmark = document.getElementById("step3Checkmark");
  if (step3Checkmark) {
    step3Checkmark.classList.toggle(
      "hidden",
      !gameState.isCommitted || gameState.playerNumber !== 1
    );
  }

  const step4Checkmark = document.getElementById("step4Checkmark");
  if (step4Checkmark) {
    step4Checkmark.classList.toggle("hidden", gameState.playerNumber !== 2);
  }

  const step5Checkmark = document.getElementById("step5Checkmark");
  if (step5Checkmark) {
    step5Checkmark.classList.toggle("hidden", !gameState.isRevealed);
  }
}

// Setup event listeners when DOM is ready
export function setupEventListeners(
  logFn,
  switchViewFn,
  connectWalletFn,
  approveTokenFn,
  createMakerGameFn,
  loadMakerGamesFn,
  loadAllTakerGamesFn,
  selectMakerMoveFn,
  checkMakerApprovalFn,
  updateMakerTokenBalanceFn,
  updateMakerButtonStatesFn,
  getSigner, // Getter function or value
  getRpsContract, // Getter function or value
  gameState,
  getToken0Contract, // Getter function or value
  getToken1Contract, // Getter function or value
  getErc20ABI, // Getter function or value
  getProvider, // Getter function or value
  getToken0Address, // Getter function or value
  getToken1Address, // Getter function or value
  ensureCorrectNetwork,
  initializeContracts,
  loadDeployments,
  getDeployedChainId, // Getter function or value
  getNoir, // Getter function or value
  getBackend, // Getter function or value
  getToken0AddressForCreate, // Getter function or value
  initNoir,
  revealMakerMove,
  withdrawPrize,
  updateMakerMoveStatus,
  updateMakerButtonStates
) {
  // Helper to get value (handles both functions and direct values)
  const getValue = (getter) =>
    typeof getter === "function" ? getter() : getter;
  console.log("Setting up event listeners...");

  // Add global error handler to catch any unhandled errors
  window.addEventListener("error", (event) => {
    console.error("Global error caught:", event.error);
    if (typeof logFn === "function") {
      logFn(`❌ JavaScript error: ${event.error?.message || event.message}`);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    if (typeof logFn === "function") {
      logFn(
        `❌ Unhandled promise rejection: ${
          event.reason?.message || event.reason
        }`
      );
    }
  });

  // Tab switching
  const makerTabBtn = document.getElementById("makerTabBtn");
  const takerTabBtn = document.getElementById("takerTabBtn");
  if (makerTabBtn) {
    makerTabBtn.addEventListener("click", () => switchViewFn("maker"));
  }
  if (takerTabBtn) {
    takerTabBtn.addEventListener("click", () => switchViewFn("taker"));
  }

  const connectBtn = document.getElementById("connectBtn");
  if (connectBtn) {
    connectBtn.addEventListener("click", connectWalletFn);
    console.log("✅ Connect button listener added");
  } else {
    console.error("❌ Connect button not found");
  }

  // Maker view buttons
  const makerApproveBtn = document.getElementById("makerApproveTokenBtn");
  if (makerApproveBtn) {
    makerApproveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Maker approve button clicked!");
      try {
        await approveTokenFn(
          "maker",
          getValue(getSigner),
          getValue(getRpsContract),
          getValue(getToken0Address),
          getValue(getToken1Address),
          getValue(getToken0Contract),
          getValue(getToken1Contract),
          getValue(getErc20ABI),
          ensureCorrectNetwork,
          initializeContracts,
          loadDeployments,
          () =>
            checkMakerApprovalFn(
              getValue(getSigner),
              getValue(getRpsContract),
              getValue(getToken0Address),
              getValue(getToken1Address),
              getValue(getToken0Contract),
              getValue(getToken1Contract),
              getValue(getErc20ABI),
              getValue(getProvider)
            ),
          getValue(getDeployedChainId),
          getValue(getProvider)
        );
      } catch (error) {
        console.error("Error in approveToken:", error);
        logFn(`❌ Unexpected error: ${error.message}`);
        throw error;
      }
    });
    console.log("✅ Maker approve button listener added");
  } else {
    console.error("❌ Maker approve button not found in DOM");
    console.error(
      "Available button IDs:",
      Array.from(document.querySelectorAll("button[id]")).map((b) => b.id)
    );
  }

  const makerCreateBtn = document.getElementById("makerCreateGameBtn");
  if (makerCreateBtn) {
    makerCreateBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Maker create game button clicked!");
      console.log("Button disabled state:", makerCreateBtn.disabled);

      if (makerCreateBtn.disabled) {
        console.warn("Button is disabled, cannot create game");
        const hasMove = gameState.move !== null && gameState.move !== undefined;
        const amountInput = document.getElementById("makerSwapAmount")?.value;
        const hasAmount = amountInput && parseFloat(amountInput) > 0;
        const tokenSelect = document.getElementById("makerTokenSelect");
        const tokenAddress =
          tokenSelect?.value ||
          document.getElementById("makerTokenAddress")?.value;
        const hasToken = tokenAddress && ethers.isAddress(tokenAddress);

        if (!hasMove) {
          logFn("⚠️ Please select a move first (Rock, Paper, or Scissors)");
        } else if (!hasToken) {
          logFn("⚠️ Please select a token from the dropdown");
        } else if (!hasAmount) {
          logFn("⚠️ Please enter a bet amount");
        } else {
          logFn("⚠️ Button is disabled. Please check all requirements.");
        }
        return;
      }

      try {
        await createMakerGameFn(
          getValue(getSigner),
          getValue(getRpsContract),
          gameState,
          getValue(getNoir),
          getValue(getBackend),
          getValue(getErc20ABI),
          getValue(getToken0AddressForCreate),
          ensureCorrectNetwork,
          initializeContracts,
          initNoir,
          () =>
            loadMakerGamesFn(
              getValue(getSigner),
              getValue(getRpsContract),
              getValue(getErc20ABI),
              revealMakerMove,
              withdrawPrize
            ),
          () => updateMakerMoveStatus(gameState),
          () => updateMakerButtonStates(gameState),
          getValue(getProvider)
        );
      } catch (error) {
        console.error("Error in createMakerGame:", error);
        logFn(`❌ Unexpected error: ${error.message}`);
        console.error("Full error:", error);
        throw error;
      }
    });
    console.log("✅ Maker create button listener added");
  } else {
    console.error("❌ Maker create button not found in DOM");
    console.error(
      "Available button IDs:",
      Array.from(document.querySelectorAll("button[id]")).map((b) => b.id)
    );
  }

  const makerRefreshBtn = document.getElementById("makerRefreshBtn");
  if (makerRefreshBtn) {
    makerRefreshBtn.addEventListener("click", () =>
      loadMakerGamesFn(
        getValue(getSigner),
        getValue(getRpsContract),
        getValue(getErc20ABI),
        revealMakerMove,
        withdrawPrize
      )
    );
    console.log("✅ Maker refresh button listener added");
  }

  const makerRockBtn = document.getElementById("makerRockBtn");
  if (makerRockBtn) {
    makerRockBtn.addEventListener("click", () => {
      console.log("Maker rock button clicked!");
      selectMakerMoveFn(
        0,
        gameState,
        () => updateMakerMoveStatus(gameState),
        () => updateMakerButtonStates(gameState)
      );
    });
  }

  const makerPaperBtn = document.getElementById("makerPaperBtn");
  if (makerPaperBtn) {
    makerPaperBtn.addEventListener("click", () => {
      console.log("Maker paper button clicked!");
      selectMakerMoveFn(
        1,
        gameState,
        () => updateMakerMoveStatus(gameState),
        () => updateMakerButtonStates(gameState)
      );
    });
  }

  const makerScissorsBtn = document.getElementById("makerScissorsBtn");
  if (makerScissorsBtn) {
    makerScissorsBtn.addEventListener("click", () => {
      console.log("Maker scissors button clicked!");
      selectMakerMoveFn(
        2,
        gameState,
        () => updateMakerMoveStatus(gameState),
        () => updateMakerButtonStates(gameState)
      );
    });
  }

  // Taker view buttons
  const takerRefreshBtn = document.getElementById("takerRefreshBtn");
  if (takerRefreshBtn) {
    takerRefreshBtn.addEventListener("click", loadAllTakerGamesFn);
    console.log("✅ Taker refresh button listener added");
  }

  const makerSwapAmount = document.getElementById("makerSwapAmount");
  if (makerSwapAmount) {
    makerSwapAmount.addEventListener("input", async () => {
      await checkMakerApprovalFn(
        getValue(getSigner),
        getValue(getRpsContract),
        getValue(getToken0Address),
        getValue(getToken1Address),
        getValue(getToken0Contract),
        getValue(getToken1Contract),
        getValue(getErc20ABI),
        getValue(getProvider)
      );
      updateMakerButtonStatesFn(gameState);
    });
    makerSwapAmount.addEventListener("change", async () => {
      updateMakerButtonStatesFn(gameState);
    });
    console.log("✅ Maker swap amount listener added");
  } else {
    console.error("❌ Maker swap amount element not found");
  }

  const makerTokenSelect = document.getElementById("makerTokenSelect");
  if (makerTokenSelect) {
    makerTokenSelect.addEventListener("change", async (e) => {
      const selectedAddress = e.target.value;
      const hiddenInput = document.getElementById("makerTokenAddress");
      if (hiddenInput) {
        hiddenInput.value = selectedAddress;
      }
      await updateMakerTokenBalanceFn(
        getValue(getSigner),
        getValue(getToken0Contract),
        getValue(getToken1Contract),
        getValue(getToken0Address),
        getValue(getToken1Address),
        getValue(getProvider)
      );
      await checkMakerApprovalFn(
        getValue(getSigner),
        getValue(getRpsContract),
        getValue(getToken0Address),
        getValue(getToken1Address),
        getValue(getToken0Contract),
        getValue(getToken1Contract),
        getValue(getErc20ABI),
        getValue(getProvider)
      );
      updateMakerButtonStatesFn(gameState);
    });
    console.log("✅ Maker token select listener added");
  } else {
    console.error("❌ Maker token select element not found");
  }

  // Initial button state update
  updateMakerButtonStatesFn(gameState);
}
