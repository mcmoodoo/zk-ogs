import { ethers } from "ethers";
import { log } from "../utils/logger.js";
import { safeTokenCall, safeTokenCallWithParam } from "../utils/tokens.js";
import { formatTimeRemaining, getTimeAgo } from "../utils/network.js";
import { MOVE_NAMES, GAME_STATE } from "../config/constants.js";
import { contractToFrontendMove } from "../config/constants.js";
import { getTakerGames } from "../utils/storage.js";

// Load Maker games
export async function loadMakerGames(
  signer,
  rpsContract,
  erc20ABI,
  revealMakerMove,
  withdrawPrize
) {
  if (!signer || !rpsContract) {
    const gamesListDiv = document.getElementById("makerGamesList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">Please connect your wallet first</p>
        </div>
      `;
    }
    return;
  }

  try {
    const userAddress = await signer.getAddress();
    const gamesListDiv = document.getElementById("makerGamesList");

    if (!gamesListDiv) return;

    log("📋 Loading maker games from contract...");

    // Use the new getGamesByPlayer function to get only games where user is player1
    const gameIds = await rpsContract.getGamesByPlayer(userAddress);

    if (!gameIds || gameIds.length === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No games created yet. Create your first game above!</p>
        </div>
      `;
      return;
    }

    log(`Found ${gameIds.length} game(s) created by ${userAddress}...`);

    const makerGames = [];

    // Query each game by ID
    for (const gameIdBigInt of gameIds) {
      const gameId =
        typeof gameIdBigInt === "bigint"
          ? gameIdBigInt.toString()
          : gameIdBigInt.toString();
      try {
        const game = await rpsContract.getGame(gameId);

        // Handle both array and object responses
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" &&
            game !== null &&
            game.length !== undefined);
        const state = isArray ? game[8] : game.state;
        const player2 = isArray ? game[1] : game.player2;
        const tokenAddress = isArray ? game[2] : game.token;
        const betAmount = isArray ? game[3] : game.betAmount;
        const player2Move = isArray ? game[6] : game.player2Move;
        const revealDeadline = isArray ? game[10] : game.revealDeadline;
        const winner = isArray ? game[11] : game.winner;
        const createdAt = isArray ? game[9] : game.createdAt;
        const commitment = isArray ? game[4] : game.commitment;

        makerGames.push({
          gameId: gameId,
          betAmount: betAmount,
          tokenAddress: tokenAddress,
          state: Number(state),
          player2: player2,
          player2Move:
            player2Move !== null && player2Move !== undefined
              ? Number(player2Move)
              : null,
          revealDeadline: revealDeadline ? Number(revealDeadline) : null,
          winner: winner,
          timestamp: createdAt ? Number(createdAt) : null,
          commitment: commitment,
        });
      } catch (error) {
        // Game might not exist (deleted or invalid ID), skip it
        console.log(`Game ${gameId} not found or error:`, error.message);
        continue;
      }
    }

    // Sort by timestamp (newest first)
    makerGames.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (makerGames.length === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No games created yet. Create your first game above!</p>
        </div>
      `;
      return;
    }

    // Display maker games
    const gameHTMLs = await Promise.all(
      makerGames.map(async (game) => {
        let statusText = "Waiting for Player 2";
        let statusColor = "yellow";
        let actionButton = "";

        // Get token decimals for display
        let betAmountFormatted = "0";
        if (game.tokenAddress && game.betAmount) {
          try {
            // Ensure erc20ABI is available
            let tokenABI = erc20ABI;
            if (!tokenABI) {
              tokenABI = [
                "function balanceOf(address account) external view returns (uint256)",
                "function decimals() external view returns (uint8)",
                "function symbol() external view returns (string)",
              ];
            }
            const tokenContract = new ethers.Contract(
              game.tokenAddress,
              tokenABI,
              signer
            );
            const decimals = await safeTokenCall(tokenContract, "decimals", 18);
            betAmountFormatted = ethers.formatUnits(game.betAmount, decimals);
          } catch (e) {
            betAmountFormatted = game.betAmount.toString();
          }
        }

        // DegenRPS GameState: 0=WaitingForPlayer2, 1=WaitingForReveal, 2=Settled
        if (game.state === null || game.state === undefined) {
          statusText = "Unknown";
          statusColor = "gray";
        } else if (game.state === GAME_STATE.WAITING_FOR_PLAYER2) {
          statusText = "Waiting for Player 2";
          statusColor = "yellow";
        } else if (game.state === GAME_STATE.WAITING_FOR_REVEAL) {
          statusText = "Waiting for Reveal";
          statusColor = "orange";
          // Convert player2Move from DegenRPS enum (1,2,3) to frontend (0,1,2)
          const player2MoveFrontend =
            game.player2Move !== null && game.player2Move !== undefined
              ? contractToFrontendMove(game.player2Move)
              : null;
          const player2MoveName =
            player2MoveFrontend !== null
              ? MOVE_NAMES[player2MoveFrontend]
              : "Unknown";
          // Get commitment hash from game data or use gameId as fallback
          const commitmentHash = game.commitment || game.gameId;
          actionButton = `
          <div class="mt-3 pt-3 border-t border-gray-200">
            <p class="text-xs text-gray-600 mb-2">Player 2's Move: ${player2MoveName}</p>
            <button
              id="reveal-btn-${game.gameId}"
              onclick="window.revealMakerMove('${game.gameId}', '${commitmentHash}')"
              class="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transform hover:scale-105 transition-all"
            >
              🔓 Reveal Move
            </button>
          </div>
        `;
        } else if (game.state === GAME_STATE.SETTLED) {
          statusText = "Settled";
          statusColor = "green";
          const userAddress = await signer.getAddress();
          const isWinner =
            game.winner &&
            game.winner.toLowerCase() === userAddress.toLowerCase();
          const isTie = !game.winner || game.winner === ethers.ZeroAddress;
          const winnerText = isTie
            ? "Tie 🤝"
            : isWinner
            ? "You Won! 🎉"
            : "You Lost 😔";
          actionButton = `
          <div class="mt-3 pt-3 border-t border-gray-200">
            <p class="text-sm font-semibold ${
              isWinner
                ? "text-green-600"
                : isTie
                ? "text-yellow-600"
                : "text-red-600"
            } mb-2">${winnerText}</p>
            ${
              isWinner || isTie
                ? `
              <button
                onclick="window.withdrawPrize('${game.gameId}')"
                class="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transform hover:scale-105 transition-all"
              >
                💰 Withdraw Prize
              </button>
            `
                : ""
            }
          </div>
        `;
        }

        const bgClass =
          {
            gray: "bg-gray-50",
            yellow: "bg-yellow-50",
            orange: "bg-orange-50",
            green: "bg-green-50",
          }[statusColor] || "bg-gray-50";

        const borderClass =
          {
            gray: "border-gray-200",
            yellow: "border-yellow-200",
            orange: "border-orange-200",
            green: "border-green-200",
          }[statusColor] || "border-gray-200";

        const timeInfo = game.revealDeadline
          ? formatTimeRemaining(game.revealDeadline)
          : null;

        return `
        <div class="${bgClass} border-2 ${borderClass} rounded-xl p-4">
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-sm font-semibold text-gray-700">Game ID:</span>
              <span class="text-xs font-mono text-purple-600">${
                game.gameId
              }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm font-semibold text-gray-700">Status:</span>
              <span class="text-sm font-semibold text-${statusColor}-600">${statusText}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Bet Amount:</span>
              <span class="text-sm font-semibold">${betAmountFormatted} tokens</span>
            </div>
            ${
              game.player2
                ? `
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Player 2:</span>
                <span class="text-xs font-mono text-purple-600">${game.player2.slice(
                  0,
                  6
                )}...${game.player2.slice(-4)}</span>
              </div>
            `
                : ""
            }
            ${
              timeInfo
                ? `
              <div class="flex justify-between items-center">
                <span class="text-sm ${
                  timeInfo.overdue
                    ? "text-red-600 font-bold"
                    : "text-orange-600"
                }">${
                    timeInfo.overdue
                      ? "⏰ Deadline Passed"
                      : "⏳ Time Remaining"
                  }:</span>
                <span class="text-sm font-semibold ${
                  timeInfo.overdue ? "text-red-600" : "text-orange-600"
                }">${timeInfo.text}</span>
              </div>
            `
                : ""
            }
            ${actionButton}
          </div>
        </div>
      `;
      })
    );

    gamesListDiv.innerHTML = gameHTMLs.join("");

    log(`✅ Loaded ${makerGames.length} maker game(s)`);
  } catch (error) {
    log(`❌ Error loading maker games: ${error.message}`);
    console.error("Error loading maker games:", error);
    const gamesListDiv = document.getElementById("makerGamesList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p class="text-sm text-red-600 text-center">Error loading games: ${error.message}</p>
        </div>
      `;
    }
  }
}

// Load Maker games with refresh button feedback
export async function loadMakerGamesWithFeedback(
  signer,
  rpsContract,
  erc20ABI,
  revealMakerMove,
  withdrawPrize
) {
  const refreshBtn = document.getElementById("makerRefreshBtn");
  const originalText = refreshBtn ? refreshBtn.innerHTML : "";
  const originalDisabled = refreshBtn ? refreshBtn.disabled : false;

  // Update button to show loading state
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = "⏳ Refreshing...";
    refreshBtn.classList.add("opacity-75", "cursor-not-allowed");
  }

  try {
    await loadMakerGames(
      signer,
      rpsContract,
      erc20ABI,
      revealMakerMove,
      withdrawPrize
    );

    // Show success feedback briefly
    if (refreshBtn) {
      refreshBtn.innerHTML = "✅ Refreshed!";
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    log(`❌ Error refreshing games: ${error.message}`);
    // Show error feedback briefly
    if (refreshBtn) {
      refreshBtn.innerHTML = "❌ Error";
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    // Restore original button state
    if (refreshBtn) {
      refreshBtn.disabled = originalDisabled;
      refreshBtn.innerHTML = originalText || "🔄 Refresh";
      refreshBtn.classList.remove("opacity-75", "cursor-not-allowed");
    }
  }
}

// Taker game loading functions
export async function loadActiveGames(
  signer,
  rpsContract,
  erc20ABI,
  provider,
  initializeContracts,
  startActiveGamesTimer,
  startAutoRefresh,
  joinGame,
  stopActiveGamesTimer,
  activeGamesData,
  selectedMovesByGame
) {
  if (!signer) {
    log("❌ Please connect your wallet first");
    return;
  }

  if (!rpsContract) {
    log("❌ DegenRPS contract not initialized. Initializing now...");
    try {
      await initializeContracts();
    } catch (error) {
      log(`❌ Failed to initialize contracts: ${error.message}`);
      return;
    }
  }

  if (!rpsContract) {
    log(
      "❌ DegenRPS contract still not initialized. Please check deployments.json"
    );
    return;
  }

  try {
    log("Loading active games...");
    console.log(
      "Calling getGamesWaitingForPlayer2 on DegenRPS at:",
      rpsContract.target
    );
    const activeGameIds = await rpsContract.getGamesWaitingForPlayer2();
    console.log("Active game IDs received:", activeGameIds);
    console.log("Number of games:", activeGameIds.length);

    const gamesListDiv = document.getElementById("takerAvailableGamesList");
    if (!gamesListDiv) {
      log("❌ Games list div not found");
      return;
    }

    if (!activeGameIds || activeGameIds.length === 0) {
      log("ℹ️ No active games waiting for Player 2");
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No active games waiting for Player 2</p>
          <p class="text-xs text-gray-500 text-center mt-2">Make sure Player 1 has created a game first</p>
        </div>
      `;
      return;
    }

    log(`✅ Found ${activeGameIds.length} game(s) waiting for Player 2`);

    // Fetch details for each game
    log(`Fetching details for ${activeGameIds.length} game(s)...`);
    const gamePromises = activeGameIds.map(async (gameId) => {
      try {
        const gameIdBigInt =
          typeof gameId === "bigint" ? gameId : BigInt(gameId.toString());
        const gameIdNum = gameIdBigInt.toString();
        console.log(
          `Fetching game details for gameId: ${gameIdNum} (type: ${typeof gameId})`
        );
        const game = await rpsContract.getGame(gameIdBigInt);
        console.log(`Game details for ${gameIdNum}:`, game);

        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" &&
            game !== null &&
            game.length !== undefined);
        const gameState = isArray ? Number(game[8]) : Number(game.state);
        console.log(
          `Game ${gameIdNum} state: ${gameState} (0=WaitingForPlayer2, 1=WaitingForReveal, 2=Settled)`
        );

        if (gameState !== 0) {
          console.warn(
            `⚠️ Game ${gameIdNum} is not in WaitingForPlayer2 state (state=${gameState}), skipping`
          );
          return null;
        }

        return { gameId: gameIdNum, game };
      } catch (error) {
        log(`⚠️ Error fetching game ${gameId}: ${error.message}`);
        console.error("Error fetching game:", error);
        return null;
      }
    });

    const games = (await Promise.all(gamePromises)).filter((g) => g !== null);
    console.log(
      `Successfully fetched ${games.length} game(s) in WaitingForPlayer2 state`
    );

    // Filter out games where current user is player1 (can't join your own game)
    // Also filter out games with zero balance and games created by zero address
    const userAddress = await signer.getAddress();
    console.log(`Current user address: ${userAddress}`);
    const zeroAddress = ethers.ZeroAddress.toLowerCase();
    const availableGames = games.filter(({ game, gameId }) => {
      const isArray =
        Array.isArray(game) ||
        (typeof game === "object" &&
          game !== null &&
          game.length !== undefined);
      const player1 = isArray ? game[0] : game.player1;
      const betAmount = isArray ? game[3] : game.betAmount;
      const player1Lower = player1 ? player1.toLowerCase() : "";
      const userLower = userAddress.toLowerCase();
      const isOwnGame = player1Lower === userLower;

      const betAmountBigInt =
        typeof betAmount === "bigint"
          ? betAmount
          : BigInt(betAmount?.toString() || "0");
      const hasZeroBalance = betAmountBigInt === 0n;

      const isZeroAddress =
        !player1 || player1Lower === zeroAddress || player1Lower === "0x0";

      if (isOwnGame) {
        console.log(
          `Filtering out game ${gameId} - user is player1 (${player1Lower})`
        );
      }
      if (hasZeroBalance) {
        console.log(
          `Filtering out game ${gameId} - zero balance (betAmount: ${betAmountBigInt.toString()})`
        );
      }
      if (isZeroAddress) {
        console.log(
          `Filtering out game ${gameId} - invalid player1 address (${player1Lower})`
        );
      }

      return player1 && !isOwnGame && !hasZeroBalance && !isZeroAddress;
    });

    console.log(
      `Filtered to ${availableGames.length} game(s) available to join (excluding own games)`
    );

    if (availableGames.length === 0) {
      log("ℹ️ No games available to join");
      const totalGamesFound = games.length;
      const ownGamesCount = games.length - availableGames.length;
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No games available to join</p>
          <p class="text-xs text-gray-500 text-center mt-2">
            ${
              totalGamesFound > 0
                ? `Found ${totalGamesFound} game(s), but ${ownGamesCount} are your own games.`
                : activeGameIds.length > 0
                ? `Found ${activeGameIds.length} game ID(s) from contract, but could not load game details.`
                : "No active games found. Make sure Player 1 has created a game and the transaction has been confirmed."
            }
          </p>
          <p class="text-xs text-blue-600 text-center mt-2 font-semibold">💡 Tip: Click "Refresh" to check for new games</p>
        </div>
      `;
      return;
    }

    // Sort by createdAt (most recent first)
    availableGames.sort((a, b) => {
      const aCreatedAt =
        a.game &&
        (Array.isArray(a.game)
          ? Number(a.game[9])
          : Number(a.game.createdAt || 0));
      const bCreatedAt =
        b.game &&
        (Array.isArray(b.game)
          ? Number(b.game[9])
          : Number(b.game.createdAt || 0));
      return (bCreatedAt || 0) - (aCreatedAt || 0);
    });

    // Display games - get token decimals and symbol for each
    const gamePromisesWithDecimals = availableGames.map(
      async ({ gameId, game }) => {
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" &&
            game !== null &&
            game.length !== undefined);
        const tokenAddress = isArray ? game[2] : game.token;
        const betAmount = isArray ? game[3] : game.betAmount;
        const player1 = isArray ? game[0] : game.player1;
        const createdAt = isArray ? game[9] : game.createdAt;

        let tokenABI = erc20ABI;
        if (!tokenABI) {
          tokenABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)",
            "function symbol() external view returns (string)",
          ];
        }
        const tokenContract = new ethers.Contract(
          tokenAddress,
          tokenABI,
          signer
        );
        const decimals = await safeTokenCall(
          tokenContract,
          "decimals",
          18,
          provider
        );
        const tokenSymbol = await safeTokenCall(
          tokenContract,
          "symbol",
          "TOKEN",
          provider
        );
        const betAmountFormatted = ethers.formatUnits(betAmount, decimals);

        return {
          gameId,
          tokenAddress,
          betAmount,
          betAmountFormatted,
          tokenSymbol,
          player1,
          createdAt: Number(createdAt),
          decimals,
        };
      }
    );

    const gamesWithDetails = await Promise.all(gamePromisesWithDecimals);
    console.log("Games with details:", gamesWithDetails);

    log(`✅ Displaying ${gamesWithDetails.length} game(s)`);

    // Store game data for timer updates
    activeGamesData.length = 0;
    gamesWithDetails.forEach(({ gameId, createdAt }) => {
      activeGamesData.push({
        gameId: `game-${gameId}`,
        timestamp: createdAt,
        commitmentHash: gameId,
      });
    });

    // Display games in a two-column grid
    gamesListDiv.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${gamesWithDetails
          .map(
            ({
              gameId,
              tokenAddress,
              betAmountFormatted,
              tokenSymbol,
              player1,
              createdAt,
            }) => {
              const gameIdDisplay = `game-${gameId}`;
              const timeAgo = createdAt
                ? getTimeAgo(createdAt * 1000)
                : "Unknown";
              return `
        <div class="bg-white border-2 border-purple-200 rounded-xl p-4 hover:border-purple-300 transition-colors" id="${gameId}">
          <div class="flex flex-col gap-3">
            <div class="flex justify-between items-center">
              <span class="text-sm font-semibold text-gray-700">Game ID:</span>
              <span class="text-xs font-mono text-purple-600 font-bold">#${gameId}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Created by:</span>
              <span class="text-xs font-mono text-gray-700" title="${player1}">${player1.slice(
                0,
                6
              )}...${player1.slice(-4)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Bet Amount:</span>
              <span class="text-sm font-semibold text-purple-600">${betAmountFormatted} ${tokenSymbol}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Token:</span>
              <span class="text-xs font-mono text-gray-700" title="${tokenAddress}">${
                tokenSymbol ||
                tokenAddress.slice(0, 6) + "..." + tokenAddress.slice(-4)
              }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Created:</span>
              <span class="text-xs text-gray-500">${timeAgo}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-orange-600">⏳ Time Remaining:</span>
              <span id="${gameId}-time-remaining" class="text-sm font-semibold text-orange-600">Calculating...</span>
            </div>
            
            <!-- Move Selection for this game -->
            <div class="mt-2 pt-3 border-t border-gray-200">
              <p class="text-xs text-gray-600 mb-2">Select your move:</p>
              <div class="flex gap-2 mb-3">
                <button 
                  class="move-btn rock-btn px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow"
                  onclick="window.selectMoveForGame('${gameIdDisplay}', 0, '${gameId}')"
                >
                  🪨 Rock
                </button>
                <button 
                  class="move-btn paper-btn px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow"
                  onclick="window.selectMoveForGame('${gameIdDisplay}', 1, '${gameId}')"
                >
                  📄 Paper
                </button>
                <button 
                  class="move-btn scissors-btn px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow"
                  onclick="window.selectMoveForGame('${gameIdDisplay}', 2, '${gameId}')"
                >
                  ✂️ Scissors
                </button>
              </div>
              <div id="${gameIdDisplay}-move-status" class="text-xs text-gray-500 mb-2"></div>
              <button 
                id="${gameIdDisplay}-join-btn"
                class="w-full px-4 py-2 bg-gray-300 text-gray-600 cursor-not-allowed font-semibold rounded-lg"
                disabled
                data-game-id="${gameId}"
              >
                🎮 Join This Game
              </button>
            </div>
          </div>
        </div>
      `;
            }
          )
          .join("")}
      </div>
    `;

    log(`✅ Loaded ${gamesWithDetails.length} active game(s)`);

    // Attach event listeners to join buttons
    gamesWithDetails.forEach(({ gameId }) => {
      const gameIdDisplay = `game-${gameId}`;
      const joinBtn = document.getElementById(`${gameIdDisplay}-join-btn`);
      if (joinBtn) {
        const newBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newBtn, joinBtn);

        newBtn.addEventListener("click", function () {
          if (!this.disabled) {
            const gameIdNum = this.getAttribute("data-game-id");
            const selectedMove = selectedMovesByGame[gameIdDisplay];
            if (selectedMove !== undefined) {
              joinGame(gameIdNum, selectedMove);
            } else {
              log("❌ Please select a move first");
            }
          }
        });
      }
    });

    // Start real-time timeout updates
    await startActiveGamesTimer();

    // Ensure auto-refresh is running (if on taker view)
    const takerView = document.getElementById("takerView");
    if (takerView && !takerView.classList.contains("hidden")) {
      startAutoRefresh();
    }
  } catch (error) {
    log(`❌ Error loading active games: ${error.message}`);
    console.error("Full error loading active games:", error);
    if (error.reason) {
      log(`Error reason: ${error.reason}`);
    }
    const gamesListDiv = document.getElementById("takerAvailableGamesList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p class="text-sm text-red-600 text-center">Error loading games: ${error.message}</p>
          <p class="text-xs text-red-500 text-center mt-2">Check console for details</p>
        </div>
      `;
    }
    stopActiveGamesTimer();
  }
}

export async function loadAwaitingRevealGames(
  signer,
  rpsContract,
  erc20ABI,
  provider
) {
  if (!signer || !rpsContract) {
    const gamesListDiv = document.getElementById("takerAwaitingRevealList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">Please connect your wallet first</p>
        </div>
      `;
    }
    return;
  }

  try {
    const userAddress = await signer.getAddress();
    log("Loading games awaiting reveal...");

    const awaitingRevealGameIds = await rpsContract.getGamesWaitingForReveal();
    const gamesListDiv = document.getElementById("takerAwaitingRevealList");

    if (!gamesListDiv) return;

    if (!awaitingRevealGameIds || awaitingRevealGameIds.length === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No games awaiting reveal</p>
        </div>
      `;
      return;
    }

    log(`Found ${awaitingRevealGameIds.length} game(s) waiting for reveal`);

    const userGames = [];
    for (const gameIdBigInt of awaitingRevealGameIds) {
      const gameId =
        typeof gameIdBigInt === "bigint"
          ? gameIdBigInt.toString()
          : gameIdBigInt.toString();
      try {
        const game = await rpsContract.getGame(gameId);
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" &&
            game !== null &&
            game.length !== undefined);
        const player2 = isArray ? game[1] : game.player2;

        if (player2 && player2.toLowerCase() === userAddress.toLowerCase()) {
          const player2Move = isArray ? game[6] : game.player2Move;
          const tokenAddress = isArray ? game[2] : game.token;
          const betAmount = isArray ? game[3] : game.betAmount;
          const revealDeadline = isArray ? game[10] : game.revealDeadline;

          userGames.push({
            gameId: gameId,
            player2Move: Number(player2Move),
            tokenAddress: tokenAddress,
            betAmount: betAmount,
            revealDeadline: revealDeadline ? Number(revealDeadline) : null,
          });
        }
      } catch (error) {
        console.error(`Error processing game ${gameId}:`, error);
      }
    }

    if (userGames.length === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No games awaiting reveal where you are Player 2</p>
        </div>
      `;
      return;
    }

    const gamesWithDetails = await Promise.all(
      userGames.map(
        async ({
          gameId,
          player2Move,
          tokenAddress,
          betAmount,
          revealDeadline,
        }) => {
          let tokenABI = erc20ABI;
          if (!tokenABI) {
            tokenABI = [
              "function balanceOf(address account) external view returns (uint256)",
              "function decimals() external view returns (uint8)",
              "function symbol() external view returns (string)",
            ];
          }
          const tokenContract = new ethers.Contract(
            tokenAddress,
            tokenABI,
            signer
          );
          const decimals = await safeTokenCall(
            tokenContract,
            "decimals",
            18,
            provider
          );
          const tokenSymbol = await safeTokenCall(
            tokenContract,
            "symbol",
            "TOKEN",
            provider
          );
          const betAmountFormatted = ethers.formatUnits(betAmount, decimals);

          return {
            gameId,
            player2Move,
            tokenAddress,
            betAmountFormatted,
            tokenSymbol,
            revealDeadline,
          };
        }
      )
    );

    gamesListDiv.innerHTML = gamesWithDetails
      .map(
        ({
          gameId,
          player2Move,
          betAmountFormatted,
          tokenSymbol,
          revealDeadline,
        }) => {
          const now = Math.floor(Date.now() / 1000);
          const timeRemaining = revealDeadline ? revealDeadline - now : null;
          const isOverdue = timeRemaining !== null && timeRemaining < 0;
          const minutes =
            timeRemaining !== null
              ? Math.floor(Math.abs(timeRemaining) / 60)
              : 0;
          const seconds =
            timeRemaining !== null ? Math.abs(timeRemaining) % 60 : 0;
          const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

          const moveNames = ["Rock 🪨", "Paper 📄", "Scissors ✂️"];
          const player2MoveFrontend = player2Move - 1;
          const player2MoveName = moveNames[player2MoveFrontend] || "Unknown";

          return `
        <div class="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-sm font-semibold text-gray-700">Game ID:</span>
              <span class="text-xs font-mono text-purple-600 font-bold">#${gameId}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Your Move:</span>
              <span class="text-sm font-semibold">${player2MoveName}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Bet Amount:</span>
              <span class="text-sm font-semibold text-orange-600">${betAmountFormatted} ${tokenSymbol}</span>
            </div>
            ${
              revealDeadline
                ? `
              <div class="flex justify-between items-center">
                <span class="text-sm ${
                  isOverdue ? "text-red-600 font-bold" : "text-orange-600"
                }">${
                    isOverdue ? "⏰ Deadline Passed" : "⏳ Time Remaining"
                  }:</span>
                <span class="text-sm font-semibold ${
                  isOverdue ? "text-red-600" : "text-orange-600"
                }">${isOverdue ? `${timeStr} ago` : timeStr}</span>
              </div>
              ${
                isOverdue
                  ? `
                <div class="mt-2 p-2 bg-red-100 border border-red-300 rounded-lg">
                  <p class="text-xs text-red-800 text-center">Player 1 failed to reveal. You can claim a refund!</p>
                </div>
              `
                  : ""
              }
            `
                : ""
            }
          </div>
        </div>
      `;
        }
      )
      .join("");

    log(`✅ Loaded ${gamesWithDetails.length} game(s) awaiting reveal`);
  } catch (error) {
    log(`❌ Error loading games awaiting reveal: ${error.message}`);
    console.error("Error loading awaiting reveal games:", error);
    const gamesListDiv = document.getElementById("takerAwaitingRevealList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p class="text-sm text-red-600 text-center">Error loading games: ${error.message}</p>
        </div>
      `;
    }
  }
}

export async function loadCompletedGames(
  signer,
  rpsContract,
  erc20ABI,
  provider
) {
  if (!signer || !rpsContract) {
    return;
  }

  try {
    const userAddress = await signer.getAddress();
    const gamesListDiv = document.getElementById("takerCompletedGamesList");

    if (!gamesListDiv) {
      console.warn("takerCompletedGamesList div not found");
      return;
    }

    log("🔍 Loading completed games from contract...");

    const nextGameId = await rpsContract.nextGameId();
    const totalGames = Number(nextGameId);

    if (totalGames === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No completed games yet</p>
        </div>
      `;
      return;
    }

    log(
      `📊 Checking ${totalGames} game(s) for completed games where you are player2...`
    );

    const completedGames = [];
    const trackedGames = getTakerGames();

    const startGameId = Math.max(0, totalGames - 100);

    for (let i = startGameId; i < totalGames; i++) {
      try {
        const game = await rpsContract.getGame(i);
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" && game.length !== undefined);
        const state = isArray ? game[8] : game.state;
        const player2 = isArray ? game[1] : game.player2;
        const stateNum = Number(state);

        if (
          stateNum === 2 &&
          player2 &&
          player2.toLowerCase() === userAddress.toLowerCase()
        ) {
          const winner = isArray ? game[11] : game.winner;
          const player1MoveRaw = isArray ? game[7] : game.player1Move;
          const player2MoveRaw = isArray ? game[6] : game.player2Move;
          const createdAt = isArray ? game[9] : game.createdAt;
          const tokenAddress = isArray ? game[2] : game.token;
          const betAmount = isArray ? game[3] : game.betAmount;

          const player1Move = Number(player1MoveRaw) - 1;
          const player2Move = Number(player2MoveRaw) - 1;

          const gameKey = i.toString();
          const trackedData = trackedGames[gameKey] || {};

          completedGames.push({
            gameId: i.toString(),
            commitment: trackedData.commitment || null,
            winner:
              winner && winner !== ethers.ZeroAddress
                ? winner.toLowerCase() === userAddress.toLowerCase()
                  ? 2
                  : 1
                : 0,
            player1Move: player1Move,
            player2Move: player2Move,
            createdAt: Number(createdAt),
            tokenAddress: tokenAddress,
            betAmount: betAmount,
            timestamp: trackedData.timestamp || Number(createdAt),
          });
        }
      } catch (error) {
        if (
          !error.message.includes("revert") &&
          !error.message.includes("Game does not exist")
        ) {
          console.error(`Error checking game ${i}:`, error);
        }
      }
    }

    completedGames.sort((a, b) => b.createdAt - a.createdAt);

    if (completedGames.length === 0) {
      gamesListDiv.innerHTML = `
        <div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
          <p class="text-sm text-gray-600 text-center">No completed games yet</p>
        </div>
      `;
      return;
    }

    const gamesWithDetails = await Promise.all(
      completedGames.map(async (game) => {
        let tokenABI = erc20ABI;
        if (!tokenABI) {
          tokenABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)",
            "function symbol() external view returns (string)",
          ];
        }
        const tokenContract = new ethers.Contract(
          game.tokenAddress,
          tokenABI,
          signer
        );
        const decimals = await safeTokenCall(
          tokenContract,
          "decimals",
          18,
          provider
        );
        const tokenSymbol = await safeTokenCall(
          tokenContract,
          "symbol",
          "TOKEN",
          provider
        );
        const betAmountFormatted = ethers.formatUnits(game.betAmount, decimals);

        return {
          ...game,
          betAmountFormatted,
          tokenSymbol,
        };
      })
    );

    const moveNames = ["Rock 🪨", "Paper 📄", "Scissors ✂️"];
    gamesListDiv.innerHTML = gamesWithDetails
      .map((game) => {
        const isWin = game.winner === 2;
        const isTie = game.winner === 0;
        const resultText = isTie
          ? "Tie 🤝"
          : isWin
          ? "You Won! 🎉"
          : "You Lost 😔";
        const bgClass = isTie
          ? "bg-yellow-50"
          : isWin
          ? "bg-green-50"
          : "bg-red-50";
        const borderClass = isTie
          ? "border-yellow-200"
          : isWin
          ? "border-green-200"
          : "border-red-200";
        const textClass = isTie
          ? "text-yellow-600"
          : isWin
          ? "text-green-600"
          : "text-red-600";
        const date = new Date(game.createdAt * 1000);
        const dateStr = date.toLocaleString();

        const withdrawButton =
          isWin || isTie
            ? `
        <div class="mt-3 pt-3 border-t ${borderClass}">
          <button
            onclick="window.withdrawPrize('${game.gameId}')"
            class="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transform hover:scale-105 transition-all"
          >
            💰 Withdraw Prize
          </button>
        </div>
      `
            : "";

        return `
        <div class="${bgClass} border-2 ${borderClass} rounded-xl p-4">
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-sm font-semibold text-gray-700">Game ID:</span>
              <span class="text-xs font-mono text-purple-600 font-bold">#${
                game.gameId
              }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Result:</span>
              <span class="text-sm font-bold ${textClass}">${resultText}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Maker's Move:</span>
              <span class="text-sm font-semibold">${
                moveNames[game.player1Move] || "Unknown"
              }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Your Move:</span>
              <span class="text-sm font-semibold">${
                moveNames[game.player2Move] || "Unknown"
              }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Bet Amount:</span>
              <span class="text-sm font-semibold">${game.betAmountFormatted} ${
          game.tokenSymbol
        }</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Completed:</span>
              <span class="text-xs text-gray-500">${dateStr}</span>
            </div>
            ${withdrawButton}
          </div>
        </div>
      `;
      })
      .join("");

    log(`✅ Loaded ${gamesWithDetails.length} completed game(s)`);
  } catch (error) {
    log(`❌ Error loading completed games: ${error.message}`);
    console.error("Error loading completed games:", error);
    const gamesListDiv = document.getElementById("takerCompletedGamesList");
    if (gamesListDiv) {
      gamesListDiv.innerHTML = `
        <div class="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p class="text-sm text-red-600 text-center">Error loading games: ${error.message}</p>
        </div>
      `;
    }
  }
}

export async function loadAllTakerGames(
  signer,
  rpsContract,
  erc20ABI,
  provider,
  initializeContracts,
  startActiveGamesTimer,
  startAutoRefresh,
  joinGame,
  stopActiveGamesTimer,
  activeGamesData,
  selectedMovesByGame
) {
  stopActiveGamesTimer();

  const refreshBtn = document.getElementById("takerRefreshBtn");
  const originalText = refreshBtn ? refreshBtn.innerHTML : "";
  const originalDisabled = refreshBtn ? refreshBtn.disabled : false;

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = "⏳ Refreshing...";
    refreshBtn.classList.add("opacity-75", "cursor-not-allowed");
  }

  try {
    await loadActiveGames(
      signer,
      rpsContract,
      erc20ABI,
      provider,
      initializeContracts,
      startActiveGamesTimer,
      startAutoRefresh,
      joinGame,
      stopActiveGamesTimer,
      activeGamesData,
      selectedMovesByGame
    );
    await loadAwaitingRevealGames(signer, rpsContract, erc20ABI, provider);
    await loadCompletedGames(signer, rpsContract, erc20ABI, provider);

    if (refreshBtn) {
      refreshBtn.innerHTML = "✅ Refreshed!";
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    log(`❌ Error refreshing games: ${error.message}`);
    if (refreshBtn) {
      refreshBtn.innerHTML = "❌ Error";
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = originalDisabled;
      refreshBtn.innerHTML = originalText || "🔄 Refresh";
      refreshBtn.classList.remove("opacity-75", "cursor-not-allowed");
    }
  }
}
