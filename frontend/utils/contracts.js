import { ethers } from "ethers";
import { log } from "./logger.js";
import { getNetworkName } from "./network.js";

// Load contract ABIs and addresses from deployments.json
export async function loadDeployments() {
  try {
    log("Loading deployments.json...");
    const deploymentsResponse = await fetch("/deployments.json");
    if (!deploymentsResponse.ok) {
      throw new Error(
        `Failed to load deployments: ${deploymentsResponse.statusText}`
      );
    }
    // Check if response is actually JSON (not HTML error page)
    const contentType = deploymentsResponse.headers.get("content-type");
    const text = await deploymentsResponse.text();
    if (!contentType || !contentType.includes("application/json")) {
      if (
        text.trim().startsWith("<!DOCTYPE") ||
        text.trim().startsWith("<html")
      ) {
        throw new Error(
          "Received HTML instead of JSON. deployments.json may not exist or Vercel routing is misconfigured."
        );
      }
      throw new Error(`Expected JSON but got ${contentType}`);
    }
    const deployments = JSON.parse(text);

    const DEPLOYED_CHAIN_ID = deployments.chainId?.toString();
    const DEPLOYED_RPC_URL = deployments.rpcUrl;
    let TOKEN0_ADDRESS = null;
    let TOKEN1_ADDRESS = null;
    let RPS_ADDRESS = null;

    if (deployments.contracts) {
      if (deployments.contracts.token0) {
        TOKEN0_ADDRESS = deployments.contracts.token0.address;
        log(`✅ Token0 address: ${TOKEN0_ADDRESS}`);
        // Update dropdown option
        const token0Option = document.getElementById("token0Option");
        if (token0Option) {
          token0Option.value = TOKEN0_ADDRESS;
          token0Option.textContent = `Token0 (${TOKEN0_ADDRESS.slice(
            0,
            6
          )}...${TOKEN0_ADDRESS.slice(-4)})`;
        }
      }
      if (deployments.contracts.token1) {
        TOKEN1_ADDRESS = deployments.contracts.token1.address;
        log(`✅ Token1 address: ${TOKEN1_ADDRESS}`);
        // Update dropdown option
        const token1Option = document.getElementById("token1Option");
        if (token1Option) {
          token1Option.value = TOKEN1_ADDRESS;
          token1Option.textContent = `Token1 (${TOKEN1_ADDRESS.slice(
            0,
            6
          )}...${TOKEN1_ADDRESS.slice(-4)})`;
        }
      }
      if (deployments.contracts.rockPaperScissors) {
        RPS_ADDRESS = deployments.contracts.rockPaperScissors.address;
        log(`✅ RockPaperScissors address: ${RPS_ADDRESS}`);
      }
      if (deployments.contracts.degenRPS) {
        log(`✅ DegenRPS address: ${deployments.contracts.degenRPS.address}`);
      }
    } else {
      log("⚠️ No contracts found in deployments.json");
    }

    log("✅ Deployments loaded");
    return {
      deployments,
      DEPLOYED_CHAIN_ID,
      DEPLOYED_RPC_URL,
      TOKEN0_ADDRESS,
      TOKEN1_ADDRESS,
      RPS_ADDRESS,
    };
  } catch (error) {
    log(`❌ Error loading deployments: ${error.message}`);
    throw error;
  }
}

// Initialize contract instances
export async function initializeContracts(
  signer,
  deployments,
  RPS_ADDRESS,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS
) {
  if (!signer) return null;

  // Ensure deployments are loaded
  if (!deployments) {
    log("⚠️ Deployments not loaded, loading now...");
    const loaded = await loadDeployments();
    deployments = loaded.deployments;
    RPS_ADDRESS = loaded.RPS_ADDRESS || RPS_ADDRESS;
    TOKEN0_ADDRESS = loaded.TOKEN0_ADDRESS || TOKEN0_ADDRESS;
    TOKEN1_ADDRESS = loaded.TOKEN1_ADDRESS || TOKEN1_ADDRESS;
  }

  try {
    // Load DegenRPS address and ABI from deployments
    let DEGEN_RPS_ADDRESS = null;
    let degenRPSABI = null;

    if (
      deployments &&
      deployments.contracts &&
      deployments.contracts.degenRPS
    ) {
      DEGEN_RPS_ADDRESS = deployments.contracts.degenRPS.address;
      degenRPSABI = deployments.contracts.degenRPS.abi;
      log(`✅ DegenRPS address: ${DEGEN_RPS_ADDRESS}`);
      if (degenRPSABI && degenRPSABI.length > 0) {
        log(`✅ DegenRPS ABI loaded (${degenRPSABI.length} entries)`);
      } else {
        log(`⚠️ DegenRPS ABI not found in deployments.json, using fallback`);
        // Fallback to hardcoded ABI if not in deployments
        degenRPSABI = [
          "function createGame(address tokenAddress, uint256 betAmount, bytes32 commitment, bytes calldata proof) external returns (uint256)",
          "function joinGame(uint256 gameId, uint8 move) external",
          "function revealAndSettle(uint256 gameId, uint8 move, bytes32 salt, bytes calldata proof) external",
          "function withdraw(uint256 gameId) external",
          "function refund(uint256 gameId) external",
          "function getGame(uint256 gameId) external view returns (tuple(address player1, address player2, address token, uint256 betAmount, bytes32 commitment, bytes proof, uint8 player2Move, uint8 player1Move, uint8 state, uint256 createdAt, uint256 revealDeadline, address winner))",
          "function getGamesWaitingForPlayer2() external view returns (uint256[])",
          "function getGamesWaitingForReveal() external view returns (uint256[])",
          "function getGamesByPlayer(address player) external view returns (uint256[])",
          "function revealTimeout() external view returns (uint256)",
          "event GameCreated(uint256 indexed gameId, address indexed player1, address indexed token, uint256 betAmount, bytes32 commitment)",
          "event Player2Joined(uint256 indexed gameId, address indexed player2, uint8 move)",
          "event MoveRevealed(uint256 indexed gameId, address indexed player1, uint8 move)",
          "event GameSettled(uint256 indexed gameId, address indexed winner, uint256 amount)",
          "event PrizeWithdrawn(uint256 indexed gameId, address indexed winner, uint256 amount)",
          "event GameRefunded(uint256 indexed gameId, address indexed player, uint256 amount)",
        ];
      }
    } else if (RPS_ADDRESS) {
      // Fallback to old RPS_ADDRESS if degenRPS not in deployments
      DEGEN_RPS_ADDRESS = RPS_ADDRESS;
      log(`⚠️ Using RPS_ADDRESS as DegenRPS: ${DEGEN_RPS_ADDRESS}`);
      // Use fallback ABI
      degenRPSABI = [
        "function createGame(address tokenAddress, uint256 betAmount, bytes32 commitment, bytes calldata proof) external returns (uint256)",
        "function joinGame(uint256 gameId, uint8 move) external",
        "function revealAndSettle(uint256 gameId, uint8 move, bytes32 salt, bytes calldata proof) external",
        "function withdraw(uint256 gameId) external",
        "function refund(uint256 gameId) external",
        "function getGame(uint256 gameId) external view returns (tuple(address player1, address player2, address token, uint256 betAmount, bytes32 commitment, bytes proof, uint8 player2Move, uint8 player1Move, uint8 state, uint256 createdAt, uint256 revealDeadline, address winner))",
        "function getGamesWaitingForPlayer2() external view returns (uint256[])",
        "function getGamesWaitingForReveal() external view returns (uint256[])",
        "function getGamesByPlayer(address player) external view returns (uint256[])",
        "function revealTimeout() external view returns (uint256)",
        "event GameCreated(uint256 indexed gameId, address indexed player1, address indexed token, uint256 betAmount, bytes32 commitment)",
        "event Player2Joined(uint256 indexed gameId, address indexed player2, uint8 move)",
        "event MoveRevealed(uint256 indexed gameId, address indexed player1, uint8 move)",
        "event GameSettled(uint256 indexed gameId, address indexed winner, uint256 amount)",
        "event PrizeWithdrawn(uint256 indexed gameId, address indexed winner, uint256 amount)",
        "event GameRefunded(uint256 indexed gameId, address indexed player, uint256 amount)",
      ];
    }

    let rpsContract = null;
    if (DEGEN_RPS_ADDRESS && degenRPSABI) {
      rpsContract = new ethers.Contract(DEGEN_RPS_ADDRESS, degenRPSABI, signer);
    }

    // ERC20 ABI - try to get from deployments, fallback to minimal ABI
    let erc20ABI = null;
    if (
      deployments &&
      deployments.contracts &&
      deployments.contracts.token0 &&
      deployments.contracts.token0.abi &&
      deployments.contracts.token0.abi.length > 0
    ) {
      erc20ABI = deployments.contracts.token0.abi;
      log(`✅ Token0 ABI loaded from deployments (${erc20ABI.length} entries)`);
    } else {
      // Fallback to minimal ABI
      erc20ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
      ];
    }

    let token0Contract = null;
    let token1Contract = null;
    if (TOKEN0_ADDRESS) {
      token0Contract = new ethers.Contract(TOKEN0_ADDRESS, erc20ABI, signer);
    }
    if (TOKEN1_ADDRESS) {
      token1Contract = new ethers.Contract(TOKEN1_ADDRESS, erc20ABI, signer);
    }

    log("✅ Contracts initialized");
    return {
      rpsContract,
      token0Contract,
      token1Contract,
      erc20ABI,
    };
  } catch (error) {
    log(`❌ Error initializing contracts: ${error.message}`);
    return null;
  }
}

// Update contract address display
export async function updateContractAddressDisplay(
  rpsContract,
  deployments,
  RPS_ADDRESS,
  DEPLOYED_CHAIN_ID,
  provider
) {
  const displayDiv = document.getElementById("contractAddressDisplay");
  if (!displayDiv) return;

  // Try to get address from contract instance first, then from deployments
  let contractAddress = rpsContract?.target || rpsContract?.address;

  // If contract not initialized yet, try to get from deployments
  if (!contractAddress && deployments?.contracts) {
    contractAddress =
      deployments.contracts.degenRPS?.address ||
      deployments.contracts.rockPaperScissors?.address ||
      RPS_ADDRESS;
  }

  if (contractAddress) {
    let networkName = "Unknown";

    // Try to get network from MetaMask first
    if (provider) {
      try {
        const network = await provider.getNetwork();
        networkName = getNetworkName(network.chainId.toString());
      } catch {
        // Fall back to deployments.json chainId
        if (DEPLOYED_CHAIN_ID) {
          networkName = getNetworkName(DEPLOYED_CHAIN_ID);
        }
      }
    } else if (DEPLOYED_CHAIN_ID) {
      // Use chainId from deployments.json if MetaMask not connected
      networkName = getNetworkName(DEPLOYED_CHAIN_ID);
    }

    displayDiv.innerHTML = `
      <p class="text-gray-600 text-xs flex flex-wrap items-center gap-2">
        <span class="font-semibold">Contract Address (${networkName}):</span>
        <span class="font-mono text-purple-600 break-all">${contractAddress}</span>
      </p>
    `;
  } else {
    displayDiv.innerHTML = `
      <p class="text-gray-500 text-xs">Contract address will be loaded automatically...</p>
    `;
  }
}

// Initialize Noir
export async function initNoir() {
  try {
    log("Loading circuit...");
    const circuitResponse = await fetch("/target/circuit.json");
    if (!circuitResponse.ok) {
      throw new Error(`Failed to load circuit: ${circuitResponse.statusText}`);
    }
    // Check if response is actually JSON (not HTML error page)
    const contentType = circuitResponse.headers.get("content-type");
    const text = await circuitResponse.text();
    if (!contentType || !contentType.includes("application/json")) {
      if (
        text.trim().startsWith("<!DOCTYPE") ||
        text.trim().startsWith("<html")
      ) {
        throw new Error(
          "Received HTML instead of JSON. /target/circuit.json may not exist or Vercel routing is misconfigured."
        );
      }
      throw new Error(`Expected JSON but got ${contentType}`);
    }
    const circuit = JSON.parse(text);

    log("Initializing Noir and Barretenberg...");
    const { Noir } = await import("@noir-lang/noir_js");
    const { UltraHonkBackend } = await import("@aztec/bb.js");
    const noir = new Noir(circuit);
    const backend = new UltraHonkBackend(circuit.bytecode);
    log("✅ Noir initialized successfully");
    return { circuit, noir, backend };
  } catch (error) {
    log(`❌ Error initializing Noir: ${error.message}`);
    log("💡 Make sure circuit.json exists in frontend/target/");
    console.error("Noir initialization error:", error);
    throw error;
  }
}

