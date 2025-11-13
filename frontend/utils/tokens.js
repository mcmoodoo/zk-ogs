import { ethers } from "ethers";
import { log } from "./logger.js";

// Helper function to safely call ERC20 functions
export async function safeTokenCall(
  contract,
  functionName,
  defaultValue = null,
  provider = null
) {
  if (!contract) return defaultValue;
  try {
    // Check if contract has code at the address
    if (provider) {
      const code = await provider.getCode(contract.target || contract.address);
      if (!code || code === "0x" || code === "0x0") {
        return defaultValue;
      }
    }
    return await contract[functionName]();
  } catch (error) {
    // Silently fail and return default value
    return defaultValue;
  }
}

// Helper function to safely call ERC20 functions with parameters
export async function safeTokenCallWithParam(
  contract,
  functionName,
  param,
  defaultValue = null,
  provider = null
) {
  if (!contract) return defaultValue;
  try {
    // Check if contract has code at the address
    if (provider) {
      const code = await provider.getCode(contract.target || contract.address);
      if (!code || code === "0x" || code === "0x0") {
        return defaultValue;
      }
    }
    // If param is an array, spread it; otherwise pass it directly
    if (Array.isArray(param)) {
      return await contract[functionName](...param);
    } else {
      return await contract[functionName](param);
    }
  } catch (error) {
    // Silently fail and return default value
    return defaultValue;
  }
}

// Update token balance display for Maker view
export async function updateMakerTokenBalance(
  signer,
  token0Contract,
  token1Contract,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  provider
) {
  if (!signer || !token0Contract || !token1Contract || !provider) return;

  try {
    const address = await signer.getAddress();
    // Get token address from dropdown
    const tokenSelect = document.getElementById("makerTokenSelect");
    const tokenAddress =
      tokenSelect?.value || document.getElementById("makerTokenAddress")?.value;

    if (!tokenAddress) {
      document.getElementById("makerTokenBalance").textContent =
        "Please select a token";
      return;
    }

    let tokenContract, tokenSymbol;
    if (tokenAddress.toLowerCase() === TOKEN0_ADDRESS?.toLowerCase()) {
      tokenContract = token0Contract;
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token0",
        provider
      );
    } else if (tokenAddress.toLowerCase() === TOKEN1_ADDRESS?.toLowerCase()) {
      tokenContract = token1Contract;
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token1",
        provider
      );
    } else {
      // Custom token address - create contract on the fly
      const erc20ABI = [
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
      ];
      tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token",
        provider
      );
    }

    const balance = await safeTokenCallWithParam(
      tokenContract,
      "balanceOf",
      address,
      0n,
      provider
    );
    const decimals = await safeTokenCall(
      tokenContract,
      "decimals",
      18,
      provider
    );
    const balanceFormatted = ethers.formatUnits(balance, decimals);

    const balanceDiv = document.getElementById("makerTokenBalance");
    if (balanceDiv) {
      balanceDiv.innerHTML = `
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-2">
          <span class="text-sm font-semibold">${tokenSymbol} Balance: </span>
          <span class="text-sm font-mono">${balanceFormatted}</span>
        </div>
      `;
    }
  } catch (error) {
    // Silently fail - don't log errors for missing token contracts
    const balanceDiv = document.getElementById("makerTokenBalance");
    if (balanceDiv) {
      balanceDiv.innerHTML = "";
    }
  }
}

// Check and update approval status for Maker view
export async function checkMakerApproval(
  signer,
  rpsContract,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  token0Contract,
  token1Contract,
  erc20ABI,
  provider
) {
  console.log("checkMakerApproval() called");
  if (!signer || !rpsContract) {
    console.warn(
      "checkMakerApproval() early return: contracts not initialized"
    );
    return;
  }

  try {
    const address = await signer.getAddress();
    // Get token address from dropdown
    const tokenSelect = document.getElementById("makerTokenSelect");
    const tokenAddress =
      tokenSelect?.value || document.getElementById("makerTokenAddress")?.value;
    const amountInput = document.getElementById("makerSwapAmount")?.value;
    console.log(
      "checkMakerApproval() - tokenAddress:",
      tokenAddress,
      "amountInput:",
      amountInput
    );

    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      console.log(
        "checkMakerApproval() - no token selected, clearing approval status"
      );
      const approvalDiv = document.getElementById("makerApprovalStatus");
      if (approvalDiv) {
        approvalDiv.innerHTML = "";
      }
      return;
    }

    if (!amountInput || parseFloat(amountInput) <= 0) {
      console.log(
        "checkMakerApproval() - no amount input, clearing approval status"
      );
      const approvalDiv = document.getElementById("makerApprovalStatus");
      if (approvalDiv) {
        approvalDiv.innerHTML = "";
      }
      return;
    }

    // Get token contract
    let tokenContract;
    if (tokenAddress.toLowerCase() === TOKEN0_ADDRESS?.toLowerCase()) {
      tokenContract = token0Contract;
    } else if (tokenAddress.toLowerCase() === TOKEN1_ADDRESS?.toLowerCase()) {
      tokenContract = token1Contract;
    } else {
      // Custom token - create contract on the fly
      const minimalABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
      ];
      tokenContract = new ethers.Contract(tokenAddress, minimalABI, signer);
    }

    if (!tokenContract) {
      return;
    }

    // Get DegenRPS address for approval check
    const DEGEN_RPS_ADDRESS = rpsContract.target || rpsContract.address;

    const decimals = await safeTokenCall(
      tokenContract,
      "decimals",
      18,
      provider
    );
    const amount = ethers.parseUnits(amountInput, decimals);
    const allowance = await safeTokenCallWithParam(
      tokenContract,
      "allowance",
      [address, DEGEN_RPS_ADDRESS],
      0n,
      provider
    );

    const approvalDiv = document.getElementById("makerApprovalStatus");
    if (approvalDiv) {
      if (allowance >= amount) {
        approvalDiv.innerHTML = `
          <div class="bg-green-50 border border-green-200 rounded-lg p-2">
            <span class="text-sm text-green-800">✅ Token approved</span>
          </div>
        `;
      } else {
        approvalDiv.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            <span class="text-sm text-yellow-800">⚠️ Token approval needed</span>
          </div>
        `;
      }
    }
  } catch (error) {
    log(`⚠️ Error checking approval: ${error.message}`);
  }
}

// Approve token (for Maker view)
export async function approveToken(
  view,
  signer,
  rpsContract,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  token0Contract,
  token1Contract,
  erc20ABI,
  ensureCorrectNetwork,
  initializeContracts,
  loadDeployments,
  checkMakerApproval,
  DEPLOYED_CHAIN_ID,
  provider
) {
  console.log(`approveToken called for ${view}`);
  log("🔓 Approve Token button clicked!");

  if (!signer) {
    log("❌ Please connect your wallet first");
    console.error("No signer");
    return;
  }

  // Ensure deployments are loaded
  if (!rpsContract) {
    log("⚠️ DegenRPS contract not found, loading deployments...");
    try {
      await loadDeployments();
      await initializeContracts();
    } catch (error) {
      log(`❌ Error loading deployments: ${error.message}`);
      console.error("Deployments loading error:", error);
    }
  }

  if (!rpsContract) {
    log("❌ DegenRPS contract not found. Please check deployments.json");
    console.error("No rpsContract:", rpsContract);
    return;
  }

  const networkOk = await ensureCorrectNetwork();
  if (!networkOk) {
    log("❌ Please switch to the correct network");
    return;
  }

  // Get token address from dropdown
  const tokenSelect = document.getElementById("makerTokenSelect");
  const tokenAddress =
    tokenSelect?.value || document.getElementById("makerTokenAddress")?.value;
  const amountInput = document.getElementById("makerSwapAmount")?.value;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    log("❌ Please select a token from the dropdown");
    return;
  }

  log(`📋 Approval details:`);
  log(`   Token: ${tokenAddress}`);
  log(`   Amount: ${amountInput || "Not specified"}`);

  const btn = document.getElementById("makerApproveTokenBtn");
  if (!btn) {
    log("❌ Approve button not found");
    console.error("Approve button element not found");
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "⏳ Approving...";

  try {
    // Initialize contracts if needed
    await initializeContracts();

    if (!rpsContract) {
      throw new Error("DegenRPS contract not available");
    }

    // Get token contract
    let tokenContract, tokenSymbol;
    if (tokenAddress.toLowerCase() === TOKEN0_ADDRESS?.toLowerCase()) {
      tokenContract = token0Contract;
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token0",
        provider
      );
    } else if (tokenAddress.toLowerCase() === TOKEN1_ADDRESS?.toLowerCase()) {
      tokenContract = token1Contract;
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token1",
        provider
      );
    } else {
      // Custom token - create contract on the fly
      const minimalABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function symbol() external view returns (string)",
      ];
      tokenContract = new ethers.Contract(tokenAddress, minimalABI, signer);
      tokenSymbol = await safeTokenCall(
        tokenContract,
        "symbol",
        "Token",
        provider
      );
    }

    if (!tokenContract) {
      throw new Error("Token contract not available");
    }

    // Get DegenRPS address for approval
    const DEGEN_RPS_ADDRESS = rpsContract.target || rpsContract.address;
    const maxApproval = ethers.MaxUint256;

    log(`🔓 Approving ${tokenSymbol} for DegenRPS...`);
    log(`   Token: ${tokenSymbol} (${tokenAddress})`);
    log(`   DegenRPS: ${DEGEN_RPS_ADDRESS}`);
    log(`   Amount: Maximum (${maxApproval.toString()})`);
    console.log(
      `Approving ${tokenSymbol} for DegenRPS at ${DEGEN_RPS_ADDRESS}`
    );

    const tx = await tokenContract.approve(DEGEN_RPS_ADDRESS, maxApproval);
    log(`📤 Transaction sent: ${tx.hash}`);
    console.log(`Transaction hash: ${tx.hash}`);

    log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    log(
      `✅ ${tokenSymbol} approved for DegenRPS! Confirmed in block ${receipt.blockNumber}`
    );
    console.log(`Approval confirmed in block ${receipt.blockNumber}`);

    // Update approval status display
    await checkMakerApproval();
  } catch (error) {
    log(`❌ Error approving token: ${error.message}`);
    console.error("Full approval error:", error);
    if (error.reason) {
      log(`Error reason: ${error.reason}`);
    }
    if (error.data) {
      log(`Error data: ${JSON.stringify(error.data)}`);
    }
    if (error.code) {
      log(`Error code: ${error.code}`);
    }
  } finally {
    const btn = document.getElementById("makerApproveTokenBtn");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}
