import { ethers } from "ethers";
import { log } from "../utils/logger.js";
import { safeTokenCall, safeTokenCallWithParam } from "../utils/tokens.js";
import { saveMakerGame } from "../utils/storage.js";
import { generateProofForCreation } from "./proof.js";
import { frontendToContractMove } from "../config/constants.js";

// Select move for Maker
export function selectMakerMove(
  move,
  gameState,
  updateMakerMoveStatus,
  updateMakerButtonStates
) {
  gameState.move = move;

  // Update button borders to show selection
  const buttons = [
    document.getElementById("makerRockBtn"),
    document.getElementById("makerPaperBtn"),
    document.getElementById("makerScissorsBtn"),
  ];

  buttons.forEach((btn, index) => {
    if (btn) {
      // First, remove all border/ring classes to ensure clean state
      btn.classList.remove(
        "border-4",
        "border-green-400",
        "ring-4",
        "ring-green-200",
        "border-2",
        "border-blue-400"
      );

      if (index === move) {
        // Add border to selected button
        btn.classList.add(
          "border-4",
          "border-green-400",
          "ring-4",
          "ring-green-200"
        );
      }
    }
  });

  updateMakerMoveStatus();
  updateMakerButtonStates();
  log(
    `✅ Move selected: ${
      move === 0 ? "Rock" : move === 1 ? "Paper" : "Scissors"
    }`
  );
}

// Update maker move status display
export function updateMakerMoveStatus(gameState) {
  const moveStatusDiv = document.getElementById("makerMoveStatus");
  if (!moveStatusDiv) return;

  if (gameState.move === null || gameState.move === undefined) {
    moveStatusDiv.innerHTML = `
      <p class="text-xs text-gray-500">Select your move above</p>
    `;
    return;
  }

  moveStatusDiv.innerHTML = "";
}

// Update maker button states
export function updateMakerButtonStates(gameState) {
  const createBtn = document.getElementById("makerCreateGameBtn");
  if (createBtn) {
    const hasMove = gameState.move !== null && gameState.move !== undefined;
    const amountInput = document.getElementById("makerSwapAmount")?.value;
    const hasAmount = amountInput && parseFloat(amountInput) > 0;

    // Check if token is selected
    const tokenSelect = document.getElementById("makerTokenSelect");
    const tokenAddress =
      tokenSelect?.value || document.getElementById("makerTokenAddress")?.value;
    const hasToken = tokenAddress && ethers.isAddress(tokenAddress);

    const shouldEnable = hasMove && hasAmount && hasToken;

    createBtn.disabled = !shouldEnable;

    // Update button styling based on state
    if (shouldEnable) {
      createBtn.classList.remove(
        "disabled:bg-gray-400",
        "disabled:cursor-not-allowed"
      );
      createBtn.classList.add(
        "hover:from-green-700",
        "hover:to-emerald-700",
        "transform",
        "hover:scale-105"
      );
    } else {
      createBtn.classList.add(
        "disabled:bg-gray-400",
        "disabled:cursor-not-allowed"
      );
    }

    console.log(
      `Button state updated: move=${hasMove}, amount=${hasAmount}, token=${hasToken}, enabled=${shouldEnable}`
    );
  }
}

// Create game with DegenRPS (Maker)
export async function createMakerGame(
  signer,
  rpsContract,
  gameState,
  noir,
  backend,
  erc20ABI,
  TOKEN0_ADDRESS,
  ensureCorrectNetwork,
  initializeContracts,
  initNoir,
  loadMakerGames,
  updateMakerMoveStatus,
  updateMakerButtonStates,
  provider
) {
  console.log("createMakerGame called");
  log("🎮 Create Game button clicked!");

  if (!signer) {
    log("❌ Please connect your wallet first");
    console.error("No signer available");
    return;
  }

  log("✅ Wallet connected");

  if (!rpsContract) {
    log("❌ DegenRPS contract not initialized. Initializing now...");
    console.log("Initializing contracts...");
    console.log("Current signer:", signer);
    try {
      if (!signer) {
        throw new Error("Signer is not available for contract initialization");
      }
      const contracts = await initializeContracts(signer);
      console.log("Contracts returned from initializeContracts:", contracts);
      if (contracts && contracts.rpsContract) {
        // Use the returned contract, but also note that initializeContracts
        // updates the global rpsContract variable
        rpsContract = contracts.rpsContract;
        log("✅ Contract initialized successfully");
      } else {
        // If initializeContracts didn't return contracts, check if it updated
        // the global variable by calling the getter function
        // For now, throw a detailed error
        console.error("Contracts object:", contracts);
        throw new Error(
          `DegenRPS contract still not initialized after initialization attempt. Contracts returned: ${
            contracts ? JSON.stringify(Object.keys(contracts)) : "null"
          }`
        );
      }
    } catch (error) {
      log(`❌ Failed to initialize contracts: ${error.message}`);
      console.error("Contract initialization error:", error);
      console.error("Error stack:", error.stack);
      return;
    }
  }

  if (gameState.move === null || gameState.move === undefined) {
    log("❌ Please select your move first");
    console.error("No move selected. gameState.move:", gameState.move);
    return;
  }

  const networkOk = await ensureCorrectNetwork();
  if (!networkOk) {
    log("❌ Please switch to the correct network");
    return;
  }

  // Get token address from dropdown selector
  const tokenSelect = document.getElementById("makerTokenSelect");
  const tokenAddressInput =
    tokenSelect?.value ||
    document.getElementById("makerTokenAddress")?.value ||
    TOKEN0_ADDRESS;
  const amountInput = document.getElementById("makerSwapAmount")?.value;

  if (!tokenAddressInput || !ethers.isAddress(tokenAddressInput)) {
    log("❌ Please select a token from the dropdown");
    return;
  }

  if (!amountInput || parseFloat(amountInput) <= 0) {
    log("❌ Please enter a bet amount");
    return;
  }

  const btn = document.getElementById("makerCreateGameBtn");
  if (!btn) {
    log("❌ Create game button not found");
    return;
  }

  const originalText = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = "⏳ Creating...";

  log("🚀 Starting game creation process...");

  try {
    // Initialize Noir if not already done
    if (!noir || !backend) {
      log("🔧 Initializing Noir...");
      const noirResult = await initNoir();
      noir = noirResult.noir;
      backend = noirResult.backend;
    }

    // Generate salt and commitment
    const salt = ethers.randomBytes(32);
    const saltField = ethers.hexlify(salt);
    const moveValue = gameState.move; // 0=Rock, 1=Paper, 2=Scissors (frontend format)
    // IMPORTANT: The contract's revealAndSettle verifies commitment using enum format (1,2,3)
    // So we need to create the commitment with enum format to match
    const moveEnum = frontendToContractMove(moveValue); // Convert to DegenRPS enum: 1=Rock, 2=Paper, 3=Scissors
    const commitment = ethers.keccak256(
      ethers.solidityPacked(["uint8", "bytes32"], [moveEnum, saltField])
    );

    gameState.salt = saltField;
    gameState.commitment = commitment;
    gameState.role = "maker";

    log(`📋 Game details:`);
    log(
      `   Move: ${
        moveValue === 0 ? "Rock" : moveValue === 1 ? "Paper" : "Scissors"
      }`
    );
    log(`   Token: ${tokenAddressInput}`);
    log(`   Bet Amount: ${amountInput}`);
    log(`   Commitment: ${commitment.slice(0, 10)}...`);

    // Get token contract and decimals
    // Ensure erc20ABI is available (use fallback if not initialized)
    if (!erc20ABI) {
      erc20ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
      ];
    }
    const tokenContract = new ethers.Contract(
      tokenAddressInput,
      erc20ABI,
      signer
    );
    const decimals = await safeTokenCall(
      tokenContract,
      "decimals",
      18,
      provider
    );
    const betAmount = ethers.parseUnits(amountInput, decimals);
    const receiver = await signer.getAddress();

    // Check balance
    log("💰 Checking balance...");
    const balance = await safeTokenCallWithParam(
      tokenContract,
      "balanceOf",
      receiver,
      0n,
      provider
    );
    if (balance < betAmount) {
      throw new Error(
        `Insufficient balance. You need ${ethers.formatUnits(
          betAmount,
          decimals
        )}, but you have ${ethers.formatUnits(balance, decimals)}`
      );
    }
    log(`✅ Balance: ${ethers.formatUnits(balance, decimals)} tokens`);

    // Check allowance for DegenRPS contract
    const DEGEN_RPS_ADDRESS = rpsContract.target;
    log("🔓 Checking token approval...");
    const allowance = await safeTokenCallWithParam(
      tokenContract,
      "allowance",
      [receiver, DEGEN_RPS_ADDRESS],
      0n,
      provider
    );
    if (allowance < betAmount) {
      throw new Error(
        `Insufficient allowance. Please approve the token first.`
      );
    }
    log(`✅ Approval: ${ethers.formatUnits(allowance, decimals)} tokens`);

    // Generate ZK proof
    const proofBytes = await generateProofForCreation(noir, backend, moveValue);

    // Create game in DegenRPS contract
    log("🎮 Creating game in DegenRPS contract...");
    log("⏳ Waiting for MetaMask confirmation...");

    let createGameTx;
    try {
      createGameTx = await rpsContract.createGame(
        tokenAddressInput,
        betAmount,
        commitment,
        proofBytes
      );
      log(`📤 Transaction sent! Hash: ${createGameTx.hash}`);
      log(`⏳ Waiting for transaction confirmation...`);
    } catch (error) {
      if (
        error.code === 4001 ||
        error.message?.includes("user rejected") ||
        error.message?.includes("User denied")
      ) {
        log("❌ Transaction rejected by user in MetaMask");
        throw new Error("Transaction was rejected. Please try again.");
      }
      throw error;
    }

    // Wait for transaction to be mined
    let createGameReceipt;
    try {
      createGameReceipt = await createGameTx.wait();
      log(`✅ Transaction confirmed in block ${createGameReceipt.blockNumber}`);
      log(`🎉 SUCCESS! Your game has been created!`);
    } catch (error) {
      log(`❌ Transaction failed: ${error.message}`);
      if (error.receipt) {
        log(`   Block: ${error.receipt.blockNumber}`);
      }
      throw error;
    }

    // Extract gameId from event
    const gameCreatedEvent = createGameReceipt.logs.find((log) => {
      try {
        return (
          log.topics &&
          log.topics[0] ===
            ethers.id("GameCreated(uint256,address,address,uint256,bytes32)")
        );
      } catch {
        return false;
      }
    });

    if (gameCreatedEvent) {
      const parsed = rpsContract.interface.parseLog(gameCreatedEvent);
      gameState.gameId = parsed.args.gameId.toString();
      log(`✅ Game created! Game ID: ${gameState.gameId}`);
      log(`   Player1: ${parsed.args.player1}`);
      log(`   Token: ${parsed.args.token}`);
      log(
        `   Bet Amount: ${ethers.formatUnits(parsed.args.betAmount, decimals)}`
      );

      // Show prominent success message
      const successMsg = `🎉 Game #${gameState.gameId} created successfully!`;
      log(successMsg);
      log(`   Transaction: ${createGameTx.hash}`);
      log(`   Block: ${createGameReceipt.blockNumber}`);
    } else {
      log("⚠️ Could not extract gameId from event, but transaction succeeded");
      // Try to get gameId from the contract
      try {
        const nextGameId = await rpsContract.nextGameId();
        gameState.gameId = (nextGameId - 1n).toString();
        log(`✅ Game ID (from nextGameId): ${gameState.gameId}`);
        log(`🎉 Game #${gameState.gameId} created successfully!`);
        log(`   Transaction: ${createGameTx.hash}`);
        log(`   Block: ${createGameReceipt.blockNumber}`);
      } catch (e) {
        log("⚠️ Could not determine game ID");
        log(`   Transaction: ${createGameTx.hash}`);
        log(`   Block: ${createGameReceipt.blockNumber}`);
      }
    }

    // Save to localStorage for tracking (needed for reveal - stores salt and move)
    if (gameState.gameId && gameState.commitment) {
      saveMakerGame(
        gameState.commitment,
        gameState.gameId,
        amountInput,
        gameState.salt,
        moveValue,
        gameState
      );
    }

    // Refresh maker's games list
    await loadMakerGames();

    // Clear form
    document.getElementById("makerSwapAmount").value = "";
    gameState.move = null;
    // Clear move button highlights
    const buttons = [
      document.getElementById("makerRockBtn"),
      document.getElementById("makerPaperBtn"),
      document.getElementById("makerScissorsBtn"),
    ];
    buttons.forEach((btn) => {
      if (btn) {
        btn.classList.remove(
          "border-4",
          "border-green-400",
          "ring-4",
          "ring-green-200"
        );
      }
    });
    updateMakerMoveStatus(gameState);
    updateMakerButtonStates(gameState);

    // Show success notification
    btn.innerHTML = "✅ Game Created!";
    btn.classList.add("bg-green-600");
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove("bg-green-600");
      btn.disabled = originalDisabled;
    }, 3000);
  } catch (error) {
    log(`❌ Error creating game: ${error.message}`);
    console.error("Full error:", error);
    console.error("Error stack:", error.stack);

    // Provide more specific error messages
    if (
      error.code === 4001 ||
      error.message?.includes("user rejected") ||
      error.message?.includes("User denied")
    ) {
      log(
        `❌ Transaction was rejected in MetaMask. Please approve the transaction to create the game.`
      );
    } else if (error.reason) {
      log(`❌ Error reason: ${error.reason}`);
    } else if (error.message) {
      log(`❌ Error: ${error.message}`);
    }

    if (error.data) {
      log(`   Error data: ${JSON.stringify(error.data)}`);
    }
    if (error.code) {
      log(`   Error code: ${error.code}`);
    }
    if (error.transaction) {
      log(`   Transaction: ${JSON.stringify(error.transaction)}`);
    }
    if (error.transactionHash) {
      log(`   Transaction hash: ${error.transactionHash}`);
    }

    // Restore button state on error
    btn.disabled = originalDisabled;
    btn.innerHTML = originalText;
  }
}
