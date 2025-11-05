import { UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { ethers } from "ethers";

// Circuit will be loaded dynamically
let circuit = null;

// Game state
let gameState = {
  gameId: null,
  playerNumber: null,
  move: null,
  salt: null,
  commitment: null,
  isCommitted: false,
  isRevealed: false,
};

let noir = null;
let backend = null;
let provider = null;
let signer = null;
let contract = null;

// Contract ABI and address - will be loaded from artifacts
let CONTRACT_ABI = null;
let CONTRACT_ADDRESS = null;

// Load contract artifact
async function loadContractArtifact() {
  try {
    const artifactResponse = await fetch("/contract-artifact.json");
    const artifact = await artifactResponse.json();
    CONTRACT_ABI = artifact.abi;
    log("✅ Contract ABI loaded");
  } catch (error) {
    log(`❌ Error loading contract artifact: ${error.message}`);
    throw error;
  }
}

// Initialize Noir
async function initNoir() {
  try {
    log("Loading circuit...");
    const circuitResponse = await fetch("/target/circuit.json");
    if (!circuitResponse.ok) {
      throw new Error(`Failed to load circuit: ${circuitResponse.statusText}`);
    }
    circuit = await circuitResponse.json();

    log("Initializing Noir and Barretenberg...");
    noir = new Noir(circuit);
    backend = new UltraHonkBackend(circuit.bytecode);
    log("✅ Noir initialized successfully");
  } catch (error) {
    log(`❌ Error initializing Noir: ${error.message}`);
    log("💡 Make sure circuit.json exists in frontend/target/");
    throw error;
  }
}

// Logging utility
function log(message) {
  const logsDiv = document.getElementById("logs");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logsDiv.appendChild(entry);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Set contract address manually
function setContractAddress() {
  const address = document.getElementById("contractAddressInput").value.trim();
  if (!ethers.isAddress(address)) {
    log("❌ Invalid contract address");
    return;
  }

  CONTRACT_ADDRESS = address;
  log(`✅ Contract address set: ${address}`);

  // Connect contract if wallet is connected
  if (signer && CONTRACT_ABI) {
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    log("✅ Contract connected");
  } else {
    log(
      "⚠️ Connect wallet first, then contract will be connected automatically"
    );
  }
}

// Connect wallet
async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    log("❌ MetaMask not found. Please install MetaMask.");
    log(
      "💡 Tip: Make sure MetaMask is installed and configured for Hardhat network (Chain ID: 31337)"
    );
    return;
  }

  try {
    // Request network switch to Hardhat if needed
    // Hardhat node uses chain ID 31337 by default
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7A69" }], // 31337 in hex
      });
    } catch (switchError) {
      // Chain doesn't exist, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7A69", // 31337 in hex (Hardhat default)
              chainName: "Hardhat Local",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["http://127.0.0.1:8545"],
            },
          ],
        });
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    const address = await signer.getAddress();

    document.getElementById(
      "walletInfo"
    ).innerHTML = `<p>Connected: ${address.slice(0, 6)}...${address.slice(
      -4
    )}</p>`;

    log(`✅ Connected to wallet: ${address}`);

    // Load contract if address is available
    if (CONTRACT_ADDRESS && CONTRACT_ABI) {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      log("✅ Contract connected");
    } else {
      log("⚠️ Enter contract address above and click 'Set Contract'");
    }
  } catch (error) {
    log(`❌ Error connecting wallet: ${error.message}`);
    if (error.message.includes("JSON")) {
      log("💡 Make sure Hardhat node is running: npx hardhat node");
    }
  }
}

// Create game
async function createGame() {
  if (!contract) {
    log("❌ Contract not loaded. Please deploy contract first.");
    return;
  }

  try {
    log("Creating game...");
    const tx = await contract.createGame();
    log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Get game ID from event
    const event = receipt.logs.find((log) => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed && parsed.name === "GameCreated";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = contract.interface.parseLog(event);
      gameState.gameId = parsed.args.gameId.toString();
      gameState.playerNumber = 1;
      updateGameStatus();
      log(`✅ Game created! Game ID: ${gameState.gameId}`);
    }
  } catch (error) {
    log(`❌ Error creating game: ${error.message}`);
  }
}

// Join game
async function joinGame() {
  if (!contract) {
    log("❌ Contract not loaded.");
    return;
  }

  const gameId = document.getElementById("gameIdInput").value;
  if (!gameId) {
    log("❌ Please enter a game ID");
    return;
  }

  try {
    log(`Joining game ${gameId}...`);
    const tx = await contract.joinGame(gameId);
    await tx.wait();

    gameState.gameId = gameId;
    gameState.playerNumber = 2;
    await updateGameStatus();
    log(`✅ Joined game ${gameId}`);

    // Start polling for game updates
    startGameResultPolling();
  } catch (error) {
    log(`❌ Error joining game: ${error.message}`);
  }
}

// Commit move
async function commitMove(move) {
  if (!contract || !noir || !backend) {
    log("❌ Noir or contract not initialized");
    return;
  }

  if (gameState.isCommitted) {
    log("❌ Move already committed");
    return;
  }

  try {
    // Generate random salt
    const salt = ethers.randomBytes(32);
    const saltField = ethers.hexlify(salt);

    // Create Keccak256 commitment (for contract verification)
    const commitment = ethers.keccak256(
      ethers.solidityPacked(["uint8", "bytes32"], [move, saltField])
    );

    log(`Move: ${move === 0 ? "Rock" : move === 1 ? "Paper" : "Scissors"}`);
    log(`Commitment: ${commitment.slice(0, 10)}...`);

    gameState.move = move;
    gameState.salt = saltField;
    gameState.commitment = commitment;

    log(
      `Committing move ${
        move === 0 ? "Rock" : move === 1 ? "Paper" : "Scissors"
      }...`
    );

    const tx = await contract.commitMove(gameState.gameId, commitment);
    await tx.wait();

    gameState.isCommitted = true;
    document.getElementById("revealBtn").disabled = false;
    updateMoveStatus();
    log(`✅ Move committed!`);
  } catch (error) {
    log(`❌ Error committing move: ${error.message}`);
  }
}

// Reveal move with ZK proof
async function revealMove() {
  if (!contract || !noir || !backend) {
    log("❌ Noir or contract not initialized");
    return;
  }

  if (!gameState.isCommitted) {
    log("❌ Move not committed yet");
    return;
  }

  if (gameState.isRevealed) {
    log("❌ Move already revealed");
    return;
  }

  try {
    log("Getting game state from contract...");

    // Get current game state
    const game = await contract.getGame(gameState.gameId);

    // Get opponent's commitment
    const opponentCommitment =
      gameState.playerNumber === 1
        ? game.player2Commitment
        : game.player1Commitment;

    if (opponentCommitment === ethers.ZeroHash) {
      log("❌ Opponent hasn't committed yet. Wait for both players to commit.");
      return;
    }

    // Check if opponent has already revealed
    const opponentMove =
      gameState.playerNumber === 1 ? game.player2Move : game.player1Move;

    // Check if opponent has revealed (player1Move or player2Move will be set if revealed)
    const hasOpponentRevealed =
      gameState.playerNumber === 1
        ? game.player2Move !== 255
        : game.player1Move !== 255;

    if (!hasOpponentRevealed) {
      // Opponent hasn't revealed yet - we can reveal first
      // The contract will verify our commitment matches
      log("Revealing move (contract will verify commitment)...");

      const tx = await contract.revealMove(
        gameState.gameId,
        gameState.move,
        gameState.salt,
        "0x" // Empty proof for now - contract will verify commitment
      );

      const receipt = await tx.wait();
      log(`✅ Move revealed! Transaction: ${receipt.hash}`);

      gameState.isRevealed = true;
      updateRevealStatus();

      // Start polling for game result
      setTimeout(() => {
        startGameResultPolling();
      }, 1000);
      return;
    }

    // Generate ZK proof that proves the winner calculation is correct
    // The contract already verifies commitments using Keccak256
    // The ZK proof proves the winner matches the circuit's determine_winner logic
    log("Generating ZK proof for winner calculation... ⏳");

    try {
      // Calculate expected winner (matches contract's _determineWinner)
      const winner = determineWinnerLocal(gameState.move, opponentMove);

      // Prepare inputs for the simplified circuit
      // Circuit now only needs moves and winner (no commitments/salts)
      const p1Move = BigInt(
        gameState.playerNumber === 1 ? gameState.move : opponentMove
      );
      const p2Move = BigInt(
        gameState.playerNumber === 1 ? opponentMove : gameState.move
      );

      log("Computing witness... ⏳");
      const { witness, returnValue } = await noir.execute({
        player1_move: p1Move,
        player2_move: p2Move,
        winner: BigInt(winner),
      });

      log("Generating proof... ⏳");
      const proof = await backend.generateProof(witness);

      log("Verifying proof locally... ⏳");
      const isValid = await backend.verifyProof(proof);

      if (!isValid) {
        log("❌ Proof verification failed locally");
        throw new Error("Proof verification failed");
      }

      log(
        `✅ ZK proof generated and verified! Winner: ${
          winner === 0 ? "Tie" : `Player ${winner}`
        }`
      );

      // Serialize proof for contract
      // The proof object should have a serialized format
      const proofBytes = await serializeProof(proof);

      // Reveal move on contract with ZK proof
      const tx = await contract.revealMove(
        gameState.gameId,
        gameState.move,
        gameState.salt,
        proofBytes || "0x"
      );

      const receipt = await tx.wait();
      log(`✅ Move revealed! Transaction: ${receipt.hash}`);

      gameState.isRevealed = true;
      updateRevealStatus();

      // Start polling for game result
      setTimeout(() => {
        startGameResultPolling();
      }, 1000);
    } catch (error) {
      log(`❌ Error generating ZK proof: ${error.message}`);
      console.error(error);
      // Fallback: reveal without proof
      log("Attempting to reveal without ZK proof...");
      const tx = await contract.revealMove(
        gameState.gameId,
        gameState.move,
        gameState.salt,
        "0x"
      );
      const receipt = await tx.wait();
      log(`✅ Move revealed! Transaction: ${receipt.hash}`);
      gameState.isRevealed = true;
      updateRevealStatus();
      setTimeout(() => {
        startGameResultPolling();
      }, 1000);
    }
  } catch (error) {
    log(`❌ Error revealing move: ${error.message}`);
    console.error(error);
  }
}

// Helper function to determine winner locally
function determineWinnerLocal(move1, move2) {
  if (move1 === move2) return 0;
  // Rock beats Scissors, Paper beats Rock, Scissors beats Paper
  if (move1 === 0 && move2 === 2) return 1; // Rock beats Scissors
  if (move1 === 1 && move2 === 0) return 1; // Paper beats Rock
  if (move1 === 2 && move2 === 1) return 1; // Scissors beats Paper
  return 2; // Player 2 wins
}

// Serialize proof for contract
async function serializeProof(proof) {
  // Convert proof object to bytes
  // The proof format depends on the backend
  // For Barretenberg/Noir, we typically need to serialize the proof
  try {
    // The proof object should have a way to serialize
    // Check if it has a toBytes() method or similar
    if (proof.proof) {
      return proof.proof;
    }
    if (proof.toBytes) {
      return proof.toBytes();
    }
    // Fallback: try to serialize as hex
    return "0x" + JSON.stringify(proof).slice(0, 100); // Placeholder
  } catch (error) {
    console.error("Error serializing proof:", error);
    return "0x";
  }
}

// Update game status display
async function updateGameStatus() {
  if (!contract || !gameState.gameId) return;

  try {
    const game = await contract.getGame(gameState.gameId);
    const statusText = ["Waiting", "Committed", "Revealed", "Completed"][
      game.status
    ];

    document.getElementById("gameStatus").innerHTML = `
      <div class="status ${statusText.toLowerCase()}">
        <p>Game ID: ${gameState.gameId}</p>
        <p>Status: ${statusText}</p>
        <p>You are Player ${gameState.playerNumber}</p>
      </div>
    `;
  } catch (error) {
    log(`Error updating game status: ${error.message}`);
  }
}

// Update move status
function updateMoveStatus() {
  const moveNames = ["Rock", "Paper", "Scissors"];
  document.getElementById("moveStatus").innerHTML = `
    <p>Move: ${moveNames[gameState.move]}</p>
    <p>Status: ${gameState.isCommitted ? "Committed ✅" : "Not committed"}</p>
  `;
}

// Update reveal status
function updateRevealStatus() {
  document.getElementById("revealStatus").innerHTML = `
    <p>Status: ${gameState.isRevealed ? "Revealed ✅" : "Not revealed"}</p>
  `;
}

// Polling interval for checking game result
let gameResultPollInterval = null;

// Check game result
async function checkGameResult() {
  if (!contract || !gameState.gameId) return;

  try {
    const game = await contract.getGame(gameState.gameId);

    // Debug: Check actual status value
    const statusNum = Number(game.status);
    const p1Revealed = game.player1Move !== 255;
    const p2Revealed = game.player2Move !== 255;
    const bothRevealed = p1Revealed && p2Revealed;

    // Only show warning if status is Revealed (2) and both are revealed but status isn't Complete (3)
    const showWarning = bothRevealed && statusNum === 2;

    // Update game status display with debug info
    const statusText = ["Waiting", "Committed", "Revealed", "Completed"][
      statusNum
    ];
    document.getElementById("gameStatus").innerHTML = `
      <div class="status ${statusText.toLowerCase()}">
        <p>Game ID: ${gameState.gameId}</p>
        <p>Status: ${statusText} (${statusNum})</p>
        <p>You are Player ${gameState.playerNumber}</p>
        <p>Player 1 Revealed: ${p1Revealed ? "✅" : "❌"}</p>
        <p>Player 2 Revealed: ${p2Revealed ? "✅" : "❌"}</p>
        ${
          showWarning
            ? '<p style="color: orange;">⚠️ Both revealed but status not Complete!</p>'
            : ""
        }
      </div>
    `;

    // If both players revealed but status isn't 3, treat it as completed
    // BUT only if the game is actually in Revealed status (2) - not Waiting or Committed
    if (bothRevealed && statusNum === 2) {
      log(
        `⚠️ Both players revealed but contract status is ${statusNum} (expected 3). Checking winner...`
      );
      // Try to determine winner locally as fallback
      const winner = determineWinnerLocal(game.player1Move, game.player2Move);
      log(
        `🎉 Game completed! Winner: ${
          winner === 0 ? "Tie" : `Player ${winner}`
        }`
      );
      showGameResult(
        winner === 0
          ? "🤝 It's a TIE!"
          : winner === gameState.playerNumber
          ? "🎉 YOU WIN! 🎉"
          : "😔 You lost. Better luck next time!",
        winner,
        game
      );
      // Stop polling
      if (gameResultPollInterval) {
        clearInterval(gameResultPollInterval);
        gameResultPollInterval = null;
      }
      return;
    }

    if (statusNum === 3) {
      // Completed - stop polling
      if (gameResultPollInterval) {
        clearInterval(gameResultPollInterval);
        gameResultPollInterval = null;
      }

      // Show result
      const winnerNum = Number(game.winner);
      let winnerText = "";
      let announcement = "";

      if (winnerNum === 0) {
        winnerText = "Tie";
        announcement = "🤝 It's a TIE!";
      } else if (winnerNum === gameState.playerNumber) {
        winnerText = "You";
        announcement = "🎉 YOU WIN! 🎉";
      } else {
        winnerText = `Player ${winnerNum}`;
        announcement = "😔 You lost. Better luck next time!";
      }

      // Show big announcement (only if not already shown)
      if (!document.getElementById("gameResult")) {
        showGameResult(announcement, winnerNum, game);
      }

      log(`🎉 Game completed! Winner: ${winnerText}`);
      log(`Player 1 played: ${getMoveName(game.player1Move)}`);
      log(`Player 2 played: ${getMoveName(game.player2Move)}`);
    } else if (statusNum === 2) {
      // Status is "Revealed" but should be "Completed" if both revealed
      if (bothRevealed) {
        log("⏳ Both players revealed, waiting for contract to resolve...");
      } else {
        log("⏳ Waiting for opponent to reveal...");
      }
    } else {
      // Still waiting for other player to reveal
      if (gameState.isRevealed) {
        log("⏳ Waiting for opponent to reveal...");
      }
    }
  } catch (error) {
    log(`Error checking game result: ${error.message}`);
  }
}

// Start polling for game result
function startGameResultPolling() {
  // Clear any existing interval
  if (gameResultPollInterval) {
    clearInterval(gameResultPollInterval);
  }

  // Check immediately
  checkGameResult();

  // Then poll every 2 seconds
  gameResultPollInterval = setInterval(() => {
    checkGameResult();
  }, 2000);
}

// Helper function to get move name
function getMoveName(move) {
  const moves = ["Rock 🪨", "Paper 📄", "Scissors ✂️"];
  return moves[move] || "Unknown";
}

// Show game result announcement
function showGameResult(announcement, winner, game) {
  // Create or update result display
  let resultDiv = document.getElementById("gameResult");
  if (!resultDiv) {
    resultDiv = document.createElement("div");
    resultDiv.id = "gameResult";
    resultDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 40px;
      border-radius: 15px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 1000;
      text-align: center;
      max-width: 500px;
      border: 3px solid #4CAF50;
    `;
    document.body.appendChild(resultDiv);
  }

  const p1Move = getMoveName(game.player1Move);
  const p2Move = getMoveName(game.player2Move);

  resultDiv.innerHTML = `
    <h2 style="font-size: 2.5em; margin: 0 0 20px 0; color: #333;">${announcement}</h2>
    <div style="margin: 20px 0;">
      <p style="font-size: 1.2em; margin: 10px 0;"><strong>Player 1:</strong> ${p1Move}</p>
      <p style="font-size: 1.2em; margin: 10px 0;"><strong>Player 2:</strong> ${p2Move}</p>
    </div>
    ${
      winner === 0
        ? '<p style="font-size: 1.5em; color: #666;">🤝 It\'s a tie!</p>'
        : winner === gameState.playerNumber
        ? '<p style="font-size: 1.5em; color: #4CAF50;">🎉 You won!</p>'
        : '<p style="font-size: 1.5em; color: #f44336;">😔 You lost</p>'
    }
    <button onclick="this.parentElement.remove()" style="
      margin-top: 20px;
      padding: 12px 30px;
      font-size: 16px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    ">Close</button>
  `;
}

// Event listeners
document.getElementById("connectBtn").addEventListener("click", connectWallet);
document
  .getElementById("setContractBtn")
  .addEventListener("click", setContractAddress);
document.getElementById("createGameBtn").addEventListener("click", createGame);
document.getElementById("joinGameBtn").addEventListener("click", joinGame);
document
  .getElementById("rockBtn")
  .addEventListener("click", () => commitMove(0));
document
  .getElementById("paperBtn")
  .addEventListener("click", () => commitMove(1));
document
  .getElementById("scissorsBtn")
  .addEventListener("click", () => commitMove(2));
document.getElementById("revealBtn").addEventListener("click", revealMove);

// Initialize on load
async function init() {
  try {
    await loadContractArtifact();
    await initNoir();
    log("🚀 Application ready!");
    log("⚠️ Remember to set CONTRACT_ADDRESS after deploying the contract");
  } catch (error) {
    log(`Failed to initialize: ${error.message}`);
  }
}

init();
