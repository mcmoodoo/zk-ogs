import { ethers } from "ethers";

// Import utility modules
import { log } from "./utils/logger.js";
import {
  getNetworkName,
  normalizeChainId,
  ensureCorrectNetwork as ensureCorrectNetworkUtil,
  getTimeAgo,
  formatTimeRemaining,
} from "./utils/network.js";
import { connectWallet as connectWalletFromModule } from "./utils/wallet.js";
import {
  saveMakerGame,
  getMakerGames,
  getTakerGames,
} from "./utils/storage.js";
import {
  safeTokenCall,
  safeTokenCallWithParam,
  updateMakerTokenBalance,
  checkMakerApproval,
  approveToken,
} from "./utils/tokens.js";
import {
  loadDeployments as loadDeploymentsFromModule,
  initializeContracts as initializeContractsFromModule,
  updateContractAddressDisplay,
  initNoir as initNoirFromModule,
} from "./utils/contracts.js";

// Import game modules
import {
  selectMakerMove,
  updateMakerMoveStatus,
  updateMakerButtonStates,
  createMakerGame,
} from "./game/maker.js";
import {
  selectMoveForGame,
  joinGame,
  approveTokenForTakerGame,
} from "./game/taker.js";
import {
  generateProofForReveal,
  determineWinnerLocal,
  serializeProof,
} from "./game/proof.js";
import { revealMakerMove as revealMakerMoveFromModule } from "./game/reveal.js";

// Import UI modules
import {
  loadMakerGames,
  loadMakerGamesWithFeedback,
  loadActiveGames,
  loadAwaitingRevealGames,
  loadCompletedGames,
  loadAllTakerGames,
} from "./ui/games.js";
import { createTimers } from "./ui/timers.js";
import {
  switchView as switchViewFromModule,
  updateGameStatus as updateGameStatusFromModule,
  updateStepCheckmarks as updateStepCheckmarksFromModule,
  setupEventListeners as setupEventListenersFromModule,
} from "./ui/events.js";

// Import config
import {
  MOVE_NAMES,
  GAME_STATE,
  frontendToContractMove,
  contractToFrontendMove,
} from "./config/constants.js";

// Circuit will be loaded dynamically
let circuit = null;

// Game state
let gameState = {
  gameId: null, // Game ID from DegenRPS contract
  role: null, // "maker" or "taker"
  move: null,
  salt: null,
  commitment: null,
};

// Current view: "maker" or "taker"
let currentView = "maker";

// Interval for real-time timeout updates
let activeGamesData = []; // Store game data for real-time updates
let selectedMovesByGame = {}; // Track which games have moves selected: { gameId: move }

// Timer functions (created from ui/timers.js)
let timers = null;

let noir = null;
let backend = null;
let provider = null;
let signer = null;

// Contract instances
let rpsContract = null; // DegenRPS contract
let token0Contract = null;
let token1Contract = null;

// Contract addresses and ABIs - will be loaded from deployments.json
let RPS_ADDRESS = null; // DegenRPS contract address
let TOKEN0_ADDRESS = null;
let TOKEN1_ADDRESS = null;

// Network configuration
let DEPLOYED_CHAIN_ID = null;
let DEPLOYED_RPC_URL = null;

// Deployments data (loaded from deployments.json)
let deployments = null;

// ERC20 ABI (will be loaded from deployments or use fallback)
let erc20ABI = null;

// Load contract ABIs and addresses from deployments.json
async function loadDeployments() {
  try {
    const loaded = await loadDeploymentsFromModule();
    if (loaded) {
      DEPLOYED_CHAIN_ID = loaded.DEPLOYED_CHAIN_ID;
      DEPLOYED_RPC_URL = loaded.DEPLOYED_RPC_URL;
      TOKEN0_ADDRESS = loaded.TOKEN0_ADDRESS;
      TOKEN1_ADDRESS = loaded.TOKEN1_ADDRESS;
      RPS_ADDRESS = loaded.RPS_ADDRESS;
      deployments = loaded.deployments;
    }
    await updateContractAddressDisplay(
      rpsContract,
      deployments,
      RPS_ADDRESS,
      DEPLOYED_CHAIN_ID,
      provider
    );
  } catch (error) {
    log(`❌ Error loading deployments: ${error.message}`);
    throw error;
  }
}

// Initialize Noir
async function initNoir() {
  try {
    const noirResult = await initNoirFromModule();
    if (noirResult) {
      circuit = noirResult.circuit;
      noir = noirResult.noir;
      backend = noirResult.backend;
    }
  } catch (error) {
    log(`❌ Error initializing Noir: ${error.message}`);
    log("💡 Make sure circuit.json exists in frontend/target/");
    console.error("Noir initialization error:", error);
    throw error;
  }
}

// Ensure we're on the correct network
async function ensureCorrectNetwork() {
  const result = await ensureCorrectNetworkUtil(
    DEPLOYED_CHAIN_ID,
    provider,
    signer,
    initializeContracts
  );
  if (result && provider) {
    provider = new ethers.BrowserProvider(window.ethereum);
    if (signer) {
      signer = await provider.getSigner();
      await initializeContracts();
    }
  }
  return result;
}

// Initialize contract instances
async function initializeContracts(signerParam = null) {
  // Use parameter signer if provided, otherwise use global signer
  const currentSigner = signerParam || signer;
  if (!currentSigner) {
    log("⚠️ No signer available for contract initialization");
    return null;
  }

  // Ensure deployments are loaded
  if (!deployments) {
    log("⚠️ Deployments not loaded, loading now...");
    await loadDeployments();
  }

  try {
    const contracts = await initializeContractsFromModule(
      currentSigner,
      deployments,
      RPS_ADDRESS,
      TOKEN0_ADDRESS,
      TOKEN1_ADDRESS
    );
    if (contracts) {
      rpsContract = contracts.rpsContract;
      token0Contract = contracts.token0Contract;
      token1Contract = contracts.token1Contract;
      erc20ABI = contracts.erc20ABI;
      // Update global signer if parameter was provided
      if (signerParam && signerParam !== signer) {
        signer = signerParam;
      }
    }
    await updateContractAddressDisplay(
      rpsContract,
      deployments,
      RPS_ADDRESS,
      DEPLOYED_CHAIN_ID,
      provider
    );
    return contracts;
  } catch (error) {
    log(`❌ Error initializing contracts: ${error.message}`);
    console.error("Full error:", error);
    return null;
  }
}

// connectWallet is imported from utils/wallet.js
async function connectWallet() {
  const providerRef = { current: provider };
  const signerRef = { current: signer };
  await connectWalletFromModule(
    () =>
      updateMakerTokenBalance(
        signerRef.current || signer,
        token0Contract, // These will be updated by initializeContracts
        token1Contract,
        TOKEN0_ADDRESS,
        TOKEN1_ADDRESS,
        providerRef.current || provider
      ),
    ensureCorrectNetwork,
    (signerParam) => initializeContracts(signerParam || signerRef.current),
    () =>
      loadMakerGames(
        signerRef.current || signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      ),
    () => loadAllTakerGamesHelper(),
    startAutoRefresh,
    currentView,
    providerRef,
    signerRef
  );
  // Update global references
  provider = providerRef.current;
  signer = signerRef.current;
  // Update balances after wallet is connected and contracts are initialized
  // Contracts should be initialized by connectWalletFromModule, but update balances here too
  if (signer && token0Contract && token1Contract) {
    await updateMakerTokenBalance(
      signer,
      token0Contract,
      token1Contract,
      TOKEN0_ADDRESS,
      TOKEN1_ADDRESS,
      provider
    );
  }
}

// Update move status display
function updateMoveStatus() {
  const moveStatusDiv = document.getElementById("moveStatus");
  if (!moveStatusDiv) return;

  if (gameState.move === null || gameState.move === undefined) {
    moveStatusDiv.innerHTML = `
      <div class="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
        <p class="text-gray-600 text-center">
          ⚠️ No move selected yet. Please select Rock, Paper, or Scissors above.
        </p>
      </div>
    `;
    return;
  }

  moveStatusDiv.innerHTML = "";
}

// Update button states
function updateButtonStates() {
  const createBtn = document.getElementById("makerCreateGameBtn");
  if (createBtn) {
    const hasMove = gameState.move !== null;
    const hasAmount = document.getElementById("makerSwapAmount")?.value;
    createBtn.disabled = !hasMove || !hasAmount;
  }
}

// createMakerGame is imported from game/maker.js - call it directly with all parameters

// LocalStorage functions are now imported from utils/storage.js
// Using: saveMakerGame, getMakerGames, getTakerGames from modules

// Timer functions are imported from ui/timers.js
// Initialize timers after contracts are ready
function initializeTimers() {
  if (!timers && rpsContract) {
    timers = createTimers(
      rpsContract,
      activeGamesData,
      selectedMovesByGame,
      () => loadAllTakerGamesHelper(),
      signer
    );
  }
}

// Helper functions for timer operations
async function startActiveGamesTimer() {
  initializeTimers();
  if (timers) {
    await timers.startActiveGamesTimer();
  }
}

function stopActiveGamesTimer() {
  if (timers) {
    timers.stopActiveGamesTimer();
  }
}

function startAutoRefresh() {
  initializeTimers();
  if (timers) {
    timers.startAutoRefresh();
  }
}

function stopAutoRefresh() {
  if (timers) {
    timers.stopAutoRefresh();
  }
}

// loadActiveGames, loadAwaitingRevealGames, loadCompletedGames, loadAllTakerGames are imported from ui/games.js
// Helper function to call loadActiveGames with all required parameters
async function loadTakerAvailableGames() {
  await loadActiveGames(
    signer,
    rpsContract,
    erc20ABI,
    provider,
    initializeContracts,
    startActiveGamesTimer,
    startAutoRefresh,
    (gameId, move) => window.joinGame(gameId, move),
    stopActiveGamesTimer,
    activeGamesData,
    selectedMovesByGame
  );
}

// Helper function to call loadAllTakerGames with all required parameters
async function loadAllTakerGamesHelper() {
  await loadAllTakerGames(
    signer,
    rpsContract,
    erc20ABI,
    provider,
    initializeContracts,
    startActiveGamesTimer,
    startAutoRefresh,
    (gameId, move) => window.joinGame(gameId, move),
    stopActiveGamesTimer,
    activeGamesData,
    selectedMovesByGame
  );
}

// Load Maker games - now using module
// loadMakerGames and loadMakerGamesWithFeedback are imported from ui/games.js

// selectMoveForGame, joinGame, approveTokenForTakerGame are imported from game/taker.js
// These need to be on window for onclick handlers, so we keep them but call the module functions directly
window.selectMoveForGame = function (gameIdDisplay, move, gameId) {
  selectMoveForGame(
    gameIdDisplay,
    move,
    gameId,
    gameState,
    selectedMovesByGame
  );
};

window.joinGame = async function (gameId, move) {
  await joinGame(
    gameId,
    move,
    signer,
    rpsContract,
    erc20ABI,
    provider,
    gameState,
    ensureCorrectNetwork,
    initializeContracts,
    safeTokenCall,
    safeTokenCallWithParam,
    frontendToContractMove,
    (
      tokenContract,
      tokenSymbol,
      degenRpsAddress,
      betAmount,
      gameIdDisplay,
      gameId,
      player2Move
    ) =>
      approveTokenForTakerGame(
        tokenContract,
        tokenSymbol,
        degenRpsAddress,
        betAmount,
        gameIdDisplay,
        gameId,
        player2Move,
        signer,
        ensureCorrectNetwork,
        (gameId, move) => window.joinGame(gameId, move)
      ),
    () => loadTakerAvailableGames()
  );
};

// determineWinnerLocal and serializeProof are now imported from game/proof.js
// revealMakerMove is imported from game/reveal.js
async function revealMakerMove(gameId, commitmentHash) {
  await revealMakerMoveFromModule(
    gameId,
    commitmentHash,
    signer,
    rpsContract,
    noir,
    backend,
    erc20ABI,
    gameState,
    ensureCorrectNetwork,
    frontendToContractMove,
    () =>
      loadMakerGames(
        signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      )
  );
}

// Make revealMakerMove available globally for onclick handlers
window.revealMakerMove = revealMakerMove;

// Withdraw prize (for winners or ties)
window.withdrawPrize = async function (gameId) {
  if (!signer || !rpsContract) {
    log("❌ Contracts not initialized");
    return;
  }

  try {
    log(`💰 Withdrawing prize for game ${gameId}...`);
    const withdrawTx = await rpsContract.withdraw(gameId);
    log(`📤 Transaction sent: ${withdrawTx.hash}`);
    const receipt = await withdrawTx.wait();
    log(
      `✅ Prize withdrawn! Transaction confirmed in block ${receipt.blockNumber}`
    );

    // Refresh games list - check which view is active
    const makerView = document.getElementById("makerView");
    const takerView = document.getElementById("takerView");

    if (makerView && !makerView.classList.contains("hidden")) {
      await loadMakerGames(
        signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      );
    }
    if (takerView && !takerView.classList.contains("hidden")) {
      await loadAllTakerGamesHelper();
    }
  } catch (error) {
    log(`❌ Error withdrawing prize: ${error.message}`);
    console.error("Withdraw error:", error);
  }
};

// Claim refund (for player 2 when player 1 fails to reveal)
window.claimRefund = async function (gameId) {
  if (!signer || !rpsContract) {
    log("❌ Contracts not initialized");
    return;
  }

  const button = document.getElementById(`refund-btn-${gameId}`);
  if (button) {
    button.disabled = true;
    button.innerHTML = "⏳ Processing...";
  }

  try {
    log(`💰 Claiming refund for game ${gameId}...`);
    const refundTx = await rpsContract.refund(gameId);
    log(`📤 Transaction sent: ${refundTx.hash}`);
    const receipt = await refundTx.wait();
    log(
      `✅ Refund claimed! Transaction confirmed in block ${receipt.blockNumber}`
    );

    // Refresh games list - check which view is active
    const makerView = document.getElementById("makerView");
    const takerView = document.getElementById("takerView");

    if (makerView && !makerView.classList.contains("hidden")) {
      await loadMakerGames(
        signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      );
    }
    if (takerView && !takerView.classList.contains("hidden")) {
      await loadAllTakerGamesHelper();
    }
  } catch (error) {
    log(`❌ Error claiming refund: ${error.message}`);
    console.error("Refund error:", error);
    if (button) {
      button.disabled = false;
      button.innerHTML = "💰 Claim Refund";
    }
  }
};

// updateGameStatus, updateStepCheckmarks, switchView, setupEventListeners are imported from ui/events.js
async function updateGameStatus() {
  await updateGameStatusFromModule(
    gameState,
    rpsContract,
    signer,
    revealMakerMove
  );
}

function updateStepCheckmarks() {
  updateStepCheckmarksFromModule(signer, gameState);
}

// switchView needs to update currentView, so we use a ref
const currentViewRef = { current: currentView };
function switchView(view) {
  switchViewFromModule(
    view,
    currentViewRef,
    stopActiveGamesTimer,
    () => signer, // Getter function
    () =>
      loadMakerGamesWithFeedback(
        signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      ),
    () => loadAllTakerGamesHelper()
  );
  currentView = currentViewRef.current;
}

// setupEventListeners is imported from ui/events.js
function setupEventListeners() {
  setupEventListenersFromModule(
    log,
    switchView,
    connectWallet,
    approveToken,
    createMakerGame,
    (signer, rpsContract, erc20ABI, revealMakerMove, withdrawPrize) =>
      loadMakerGames(
        signer,
        rpsContract,
        erc20ABI,
        revealMakerMove,
        withdrawPrize
      ),
    loadAllTakerGamesHelper,
    selectMakerMove,
    checkMakerApproval,
    updateMakerTokenBalance,
    updateMakerButtonStates,
    () => signer, // Getter function to get current signer
    () => rpsContract, // Getter function to get current rpsContract
    gameState,
    () => token0Contract, // Getter function
    () => token1Contract, // Getter function
    () => erc20ABI, // Getter function
    () => provider, // Getter function
    () => TOKEN0_ADDRESS, // Getter function
    () => TOKEN1_ADDRESS, // Getter function
    ensureCorrectNetwork,
    initializeContracts,
    loadDeployments,
    () => DEPLOYED_CHAIN_ID, // Getter function
    () => noir, // Getter function
    () => backend, // Getter function
    () => TOKEN0_ADDRESS, // Getter function
    initNoir,
    revealMakerMove,
    withdrawPrize,
    updateMakerMoveStatus,
    updateMakerButtonStates
  );
}

// Listen for network changes
if (typeof window.ethereum !== "undefined") {
  window.ethereum.on("chainChanged", async (chainId) => {
    log(`🔄 Network changed to Chain ID: ${parseInt(chainId, 16)}`);
    if (provider) {
      provider = new ethers.BrowserProvider(window.ethereum);
      if (signer) {
        signer = await provider.getSigner();
        await initializeContracts();
      }
    }
  });
}

// Initialize on load
async function init() {
  try {
    // Setup event listeners FIRST, before any async operations
    // This ensures buttons work even if deployment loading fails
    setupEventListeners();

    await loadDeployments();
    await initNoir();
    log("🚀 Swap RPS application ready!");
  } catch (error) {
    log(`Failed to initialize: ${error.message}`);
    console.error("Initialization error:", error);
    // Even if initialization fails, event listeners should still work
    // They'll just show errors when clicked
  }
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  // DOM is already ready, run immediately
  init();
}
