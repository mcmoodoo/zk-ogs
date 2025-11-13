import { ethers } from "ethers";
import { log } from "../utils/logger.js";
import { safeTokenCall, safeTokenCallWithParam } from "../utils/tokens.js";
import { MOVE_NAMES, frontendToContractMove } from "../config/constants.js";

// Select move for a specific game (Taker)
export function selectMoveForGame(
  gameIdDisplay,
  move,
  gameId,
  gameState,
  selectedMovesByGame
) {
  // Update global move state
  gameState.move = move;

  // Track that this game has a move selected
  selectedMovesByGame[gameIdDisplay] = move;

  // Update the specific game card UI
  const moveStatusDiv = document.getElementById(`${gameIdDisplay}-move-status`);
  const joinBtn = document.getElementById(`${gameIdDisplay}-join-btn`);

  if (moveStatusDiv) {
    moveStatusDiv.innerHTML = `<span class="text-green-600 font-semibold">✓ Selected: ${MOVE_NAMES[move]}</span>`;
  }

  if (joinBtn) {
    // Enable the join button
    const gameContainer = document.getElementById(gameId);
    const isExpired =
      gameContainer && gameContainer.classList.contains("bg-red-50");

    if (!isExpired) {
      joinBtn.disabled = false;
      joinBtn.classList.remove(
        "bg-gray-300",
        "text-gray-600",
        "cursor-not-allowed"
      );
      joinBtn.classList.add(
        "bg-gradient-to-r",
        "from-purple-600",
        "to-indigo-600",
        "text-white",
        "hover:from-purple-700",
        "hover:to-indigo-700",
        "transform",
        "hover:scale-105",
        "transition-all"
      );
    }
  }

  // Highlight selected move button
  const gameCard = document.getElementById(gameId);
  if (gameCard) {
    const moveButtons = gameCard.querySelectorAll(".move-btn");
    moveButtons.forEach((btn, index) => {
      if (index === move) {
        btn.classList.add(
          "border-4",
          "border-green-400",
          "ring-4",
          "ring-green-200"
        );
      } else {
        btn.classList.remove(
          "border-4",
          "border-green-400",
          "ring-4",
          "ring-green-200"
        );
      }
    });
  }

  log(`✅ Move selected: ${MOVE_NAMES[move]}`);
}

// Join game (Taker/Player2)
export async function joinGame(
  gameId,
  move,
  signer,
  rpsContract,
  erc20ABI,
  provider,
  gameState,
  ensureCorrectNetwork,
  initializeContracts,
  safeTokenCallFn,
  safeTokenCallWithParamFn,
  frontendToContractMoveFn,
  approveTokenForTakerGameFn,
  loadActiveGamesFn
) {
  console.log("joinGame called with:", {
    gameId,
    move,
    type: typeof gameId,
    typeMove: typeof move,
  });
  log("🎮 Join game button clicked!");

  const gameIdDisplay = `game-${gameId}`;
  const joinBtn = document.getElementById(`${gameIdDisplay}-join-btn`);
  const originalBtnText = joinBtn ? joinBtn.innerHTML : "";
  const originalBtnDisabled = joinBtn ? joinBtn.disabled : false;

  // Disable button and show loading state
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.innerHTML = "⏳ Joining...";
  }

  try {
    log("🔍 Step 1: Checking signer...");
    if (!signer) {
      log("❌ Please connect your wallet first");
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      return;
    }
    log("✅ Signer found");

    log("🔍 Step 2: Checking contract...");
    if (!rpsContract) {
      log("❌ DegenRPS contract not initialized. Initializing now...");
      try {
        await initializeContracts();
        if (!rpsContract) {
          throw new Error("DegenRPS contract still not initialized");
        }
        log("✅ Contract initialized");
      } catch (error) {
        log(`❌ Failed to initialize contracts: ${error.message}`);
        console.error("Contract initialization error:", error);
        if (joinBtn) {
          joinBtn.disabled = originalBtnDisabled;
          joinBtn.innerHTML = originalBtnText;
        }
        return;
      }
    }
    log("✅ Contract found");

    // Move can be passed as parameter or from gameState
    log("🔍 Step 3: Validating move...");
    const player2Move =
      move !== null && move !== undefined ? move : gameState.move;
    console.log("Player2 move:", {
      move,
      gameStateMove: gameState.move,
      player2Move,
    });
    if (player2Move === null || player2Move === undefined) {
      log("❌ Please select your move first");
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      return;
    }
    log(`✅ Move validated: ${player2Move}`);

    // Convert move to DegenRPS Move enum (Rock=1, Paper=2, Scissors=3)
    const moveEnum = frontendToContractMoveFn(Number(player2Move));
    log(
      `✅ Move enum: ${moveEnum} (${
        player2Move === 0 ? "Rock" : player2Move === 1 ? "Paper" : "Scissors"
      })`
    );

    log("🔍 Step 4: Checking network...");
    const networkOk = await ensureCorrectNetwork();
    if (!networkOk) {
      log("❌ Please switch to the correct network");
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      return;
    }
    log("✅ Network OK");

    // Convert gameId to BigInt for contract calls
    log("🔍 Step 5: Getting game details...");
    const gameIdBigInt =
      typeof gameId === "bigint" ? gameId : BigInt(gameId.toString());
    log(`📋 Getting game details for gameId: ${gameIdBigInt}...`);

    // Get game details to check bet amount and token
    let game;
    try {
      game = await rpsContract.getGame(gameIdBigInt);
      console.log("Game details:", game);
      log("✅ Game details retrieved");
    } catch (gameError) {
      log(`❌ Error getting game details: ${gameError.message}`);
      console.error("Game details error:", gameError);
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      throw gameError;
    }

    // Handle both array and object responses
    const isArray =
      Array.isArray(game) ||
      (typeof game === "object" && game !== null && game.length !== undefined);
    const tokenAddress = isArray ? game[2] : game.token;
    const betAmount = isArray ? game[3] : game.betAmount;
    const gameState_enum = isArray ? Number(game[8]) : Number(game.state);

    log(
      `Game state: ${gameState_enum} (0=WaitingForPlayer2, 1=WaitingForReveal, 2=Settled)`
    );

    // Check game state
    if (gameState_enum !== 0) {
      // 0 = WaitingForPlayer2
      log(`❌ Game is not available to join (state: ${gameState_enum})`);
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      return;
    }

    // Get token contract
    let tokenABI = erc20ABI;
    if (!tokenABI) {
      tokenABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
      ];
    }
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, signer);
    const decimals = await safeTokenCallFn(
      tokenContract,
      "decimals",
      18,
      provider
    );
    const tokenSymbol = await safeTokenCallFn(
      tokenContract,
      "symbol",
      "TOKEN",
      provider
    );
    const userAddress = await signer.getAddress();
    const DEGEN_RPS_ADDRESS = rpsContract.target;

    // Check balance
    log("🔍 Step 6: Checking balance...");
    try {
      const balance = await safeTokenCallWithParamFn(
        tokenContract,
        "balanceOf",
        userAddress,
        0n,
        provider
      );
      log(
        `💰 Balance: ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`
      );
      if (balance < betAmount) {
        const errorMsg = `Insufficient balance. You need ${ethers.formatUnits(
          betAmount,
          decimals
        )} ${tokenSymbol}, but you have ${ethers.formatUnits(
          balance,
          decimals
        )} ${tokenSymbol}`;
        log(`❌ ${errorMsg}`);
        if (joinBtn) {
          joinBtn.disabled = originalBtnDisabled;
          joinBtn.innerHTML = originalBtnText;
        }
        throw new Error(errorMsg);
      }
      log(
        `✅ Balance sufficient: ${ethers.formatUnits(
          balance,
          decimals
        )} ${tokenSymbol}`
      );
    } catch (balanceError) {
      log(`❌ Error checking balance: ${balanceError.message}`);
      console.error("Balance check error:", balanceError);
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      throw balanceError;
    }

    // Check allowance
    log("🔍 Step 7: Checking token approval...");
    try {
      const allowance = await safeTokenCallWithParamFn(
        tokenContract,
        "allowance",
        [userAddress, DEGEN_RPS_ADDRESS],
        0n,
        provider
      );
      log(
        `🔓 Allowance: ${ethers.formatUnits(
          allowance,
          decimals
        )} ${tokenSymbol}`
      );
      if (allowance < betAmount) {
        const errorMsg = `Insufficient allowance. Please approve ${tokenSymbol} for DegenRPS contract first.`;
        log(`❌ ${errorMsg}`);

        // Show approval button in the game card
        const moveStatusDiv = document.getElementById(
          `${gameIdDisplay}-move-status`
        );
        if (moveStatusDiv) {
          moveStatusDiv.innerHTML = `
            <div class="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-3 mb-2">
              <p class="text-sm text-yellow-800 font-semibold mb-2">⚠️ Token approval required</p>
              <p class="text-xs text-yellow-700 mb-2">You need to approve ${tokenSymbol} before joining this game.</p>
              <button 
                id="${gameIdDisplay}-approve-btn"
                class="w-full px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-semibold rounded-lg hover:from-yellow-700 hover:to-orange-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              >
                🔓 Approve ${tokenSymbol}
              </button>
            </div>
          `;

          // Add click handler for approve button
          const approveBtn = document.getElementById(
            `${gameIdDisplay}-approve-btn`
          );
          if (approveBtn) {
            // Remove any existing listeners by cloning
            const newApproveBtn = approveBtn.cloneNode(true);
            approveBtn.parentNode.replaceChild(newApproveBtn, approveBtn);

            newApproveBtn.addEventListener("click", async () => {
              await approveTokenForTakerGameFn(
                tokenContract,
                tokenSymbol,
                DEGEN_RPS_ADDRESS,
                betAmount,
                gameIdDisplay,
                gameIdBigInt.toString(),
                player2Move
              );
            });
          }
        }

        if (joinBtn) {
          joinBtn.disabled = true;
          joinBtn.innerHTML = "⚠️ Approval Required";
          joinBtn.classList.remove(
            "bg-gradient-to-r",
            "from-purple-600",
            "to-indigo-600",
            "text-white"
          );
          joinBtn.classList.add(
            "bg-gray-400",
            "text-gray-700",
            "cursor-not-allowed"
          );
        }
        throw new Error(errorMsg);
      }
      log(
        `✅ Approval sufficient: ${ethers.formatUnits(
          allowance,
          decimals
        )} ${tokenSymbol}`
      );
    } catch (allowanceError) {
      if (allowanceError.message?.includes("Insufficient allowance")) {
        // Already handled above, just rethrow
        throw allowanceError;
      }
      log(`❌ Error checking allowance: ${allowanceError.message}`);
      console.error("Allowance check error:", allowanceError);
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      throw allowanceError;
    }

    // Join the game
    log("🔍 Step 8: Preparing to join game...");
    log(`   Game ID: ${gameIdBigInt}`);
    log(
      `   Move: ${
        player2Move === 0
          ? "Rock 🪨"
          : player2Move === 1
          ? "Paper 📄"
          : "Scissors ✂️"
      } (enum: ${moveEnum})`
    );
    log(
      `   Bet Amount: ${ethers.formatUnits(betAmount, decimals)} ${tokenSymbol}`
    );
    log(`   Contract: ${rpsContract.target}`);
    log(`⏳ Sending transaction to join game...`);
    console.log("Calling joinGame with:", {
      gameIdBigInt,
      moveEnum,
      gameIdType: typeof gameIdBigInt,
      moveEnumType: typeof moveEnum,
    });

    let joinTx;
    try {
      log("📤 Calling rpsContract.joinGame()...");
      joinTx = await rpsContract.joinGame(gameIdBigInt, moveEnum);
      log(`✅ Transaction sent! Hash: ${joinTx.hash}`);
      console.log("Transaction object:", joinTx);
    } catch (txError) {
      if (
        txError.code === 4001 ||
        txError.message?.includes("user rejected") ||
        txError.message?.includes("User denied")
      ) {
        log("❌ Transaction rejected by user in MetaMask");
        if (joinBtn) {
          joinBtn.disabled = originalBtnDisabled;
          joinBtn.innerHTML = originalBtnText;
        }
        return;
      }
      log(`❌ Error sending transaction: ${txError.message}`);
      console.error("Transaction error:", txError);
      throw txError;
    }

    log(`⏳ Waiting for transaction confirmation...`);

    let joinReceipt;
    try {
      joinReceipt = await joinTx.wait();
      log(`✅ Transaction confirmed in block ${joinReceipt.blockNumber}`);
      log(`🎉 Successfully joined game ${gameIdBigInt}!`);
    } catch (waitError) {
      log(`❌ Transaction failed: ${waitError.message}`);
      if (waitError.receipt) {
        log(`   Block: ${waitError.receipt.blockNumber}`);
      }
      if (joinBtn) {
        joinBtn.disabled = originalBtnDisabled;
        joinBtn.innerHTML = originalBtnText;
      }
      throw waitError;
    }

    // Update game state
    gameState.gameId = gameIdBigInt.toString();
    gameState.role = "taker";
    gameState.move = player2Move;

    // Refresh games list (but don't wait for it to complete)
    loadActiveGamesFn().catch((err) => {
      console.error("Error refreshing games after join:", err);
    });

    // Show success feedback
    if (joinBtn) {
      joinBtn.innerHTML = "✅ Joined!";
      joinBtn.classList.add("bg-green-600");
      setTimeout(() => {
        joinBtn.innerHTML = originalBtnText;
        joinBtn.classList.remove("bg-green-600");
        joinBtn.disabled = originalBtnDisabled;
      }, 2000);
    }
  } catch (error) {
    log(`❌ Error joining game: ${error.message}`);
    console.error("Full error:", error);
    if (error.reason) {
      log(`   Error reason: ${error.reason}`);
    }
    if (error.code === 4001 || error.message?.includes("user rejected")) {
      log(`   Transaction was rejected in MetaMask`);
    }

    // Restore button state
    if (joinBtn) {
      joinBtn.disabled = originalBtnDisabled;
      joinBtn.innerHTML = originalBtnText;
    }
  }
}

// Approve token for Taker when joining a game
export async function approveTokenForTakerGame(
  tokenContract,
  tokenSymbol,
  degenRpsAddress,
  betAmount,
  gameIdDisplay,
  gameId,
  player2Move,
  signer,
  ensureCorrectNetwork,
  joinGameFn
) {
  log(`🔓 Approving ${tokenSymbol} for DegenRPS contract...`);

  const approveBtn = document.getElementById(`${gameIdDisplay}-approve-btn`);
  const originalApproveText = approveBtn ? approveBtn.innerHTML : "";

  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.innerHTML = "⏳ Approving...";
  }

  try {
    if (!signer) {
      log("❌ Please connect your wallet first");
      if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.innerHTML = originalApproveText;
      }
      return;
    }

    const networkOk = await ensureCorrectNetwork();
    if (!networkOk) {
      log("❌ Please switch to the correct network");
      if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.innerHTML = originalApproveText;
      }
      return;
    }

    // Use max approval for convenience (user can join multiple games)
    const maxApproval = ethers.MaxUint256;

    log(`🔓 Approving ${tokenSymbol} for DegenRPS...`);
    log(`   Token: ${tokenSymbol}`);
    log(`   DegenRPS: ${degenRpsAddress}`);
    log(`   Amount: Maximum (${maxApproval.toString()})`);

    const tx = await tokenContract.approve(degenRpsAddress, maxApproval);
    log(`📤 Approval transaction sent: ${tx.hash}`);
    log(`⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();
    log(
      `✅ ${tokenSymbol} approved! Confirmed in block ${receipt.blockNumber}`
    );

    // Update UI
    const moveStatusDiv = document.getElementById(
      `${gameIdDisplay}-move-status`
    );
    if (moveStatusDiv) {
      moveStatusDiv.innerHTML = `
        <div class="bg-green-50 border-2 border-green-300 rounded-lg p-2 mb-2">
          <p class="text-sm text-green-800 font-semibold">✅ Token approved! You can now join the game.</p>
        </div>
      `;
    }

    // Re-enable join button
    const joinBtn = document.getElementById(`${gameIdDisplay}-join-btn`);
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.innerHTML = "🎮 Join This Game";
      joinBtn.classList.remove(
        "bg-gray-400",
        "text-gray-700",
        "cursor-not-allowed"
      );
      joinBtn.classList.add(
        "bg-gradient-to-r",
        "from-purple-600",
        "to-indigo-600",
        "text-white",
        "hover:from-purple-700",
        "hover:to-indigo-700",
        "transform",
        "hover:scale-105",
        "transition-all"
      );
    }

    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.innerHTML = "✅ Approved";
      approveBtn.classList.add("bg-green-600");
      setTimeout(() => {
        if (approveBtn) {
          approveBtn.style.display = "none";
        }
      }, 2000);
    }

    // Auto-retry joining the game after approval
    log("🔄 Retrying to join game after approval...");
    setTimeout(() => {
      joinGameFn(gameId, player2Move);
    }, 1000);
  } catch (error) {
    log(`❌ Error approving token: ${error.message}`);
    console.error("Approval error:", error);

    if (error.code === 4001 || error.message?.includes("user rejected")) {
      log("❌ Transaction rejected by user in MetaMask");
    }

    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.innerHTML = originalApproveText;
    }

    const moveStatusDiv = document.getElementById(
      `${gameIdDisplay}-move-status`
    );
    if (moveStatusDiv) {
      moveStatusDiv.innerHTML = `
        <div class="bg-red-50 border-2 border-red-300 rounded-lg p-2 mb-2">
          <p class="text-sm text-red-800 font-semibold">❌ Approval failed: ${error.message}</p>
          <button 
            id="${gameIdDisplay}-approve-btn-retry"
            class="mt-2 w-full px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-semibold rounded-lg hover:from-yellow-700 hover:to-orange-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg text-sm"
          >
            🔄 Retry Approval
          </button>
        </div>
      `;

      const retryBtn = document.getElementById(
        `${gameIdDisplay}-approve-btn-retry`
      );
      if (retryBtn) {
        retryBtn.addEventListener("click", async () => {
          await approveTokenForTakerGame(
            tokenContract,
            tokenSymbol,
            degenRpsAddress,
            betAmount,
            gameIdDisplay,
            gameId,
            player2Move,
            signer,
            ensureCorrectNetwork,
            joinGameFn
          );
        });
      }
    }
  }
}
