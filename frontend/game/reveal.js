import { ethers } from "ethers";
import { log } from "../utils/logger.js";
import { getMakerGames } from "../utils/storage.js";
import { generateProofForReveal } from "./proof.js";
import { frontendToContractMove } from "../config/constants.js";

// Reveal move (Maker) with ZK proof
export async function revealMakerMove(
  gameId,
  commitmentHash,
  signer,
  rpsContract,
  noir,
  backend,
  erc20ABI,
  gameState,
  ensureCorrectNetwork,
  frontendToContractMoveFn,
  loadMakerGamesFn
) {
  console.log("revealMakerMove called with:", {
    gameId,
    commitmentHash,
    typeGameId: typeof gameId,
    typeCommitmentHash: typeof commitmentHash,
  });
  log("🔓 Reveal Move button clicked!");

  if (!signer || !rpsContract || !noir || !backend) {
    log("❌ Contracts or Noir not initialized");
    console.error("Missing:", {
      signer: !!signer,
      rpsContract: !!rpsContract,
      noir: !!noir,
      backend: !!backend,
    });
    return;
  }

  log("🔍 Step 1: Initial checks passed");

  // Set game state for this specific game
  const originalGameId = gameState.gameId;
  const originalCommitment = gameState.commitment;
  const originalRole = gameState.role;

  try {
    gameState.gameId = gameId;
    gameState.commitment = commitmentHash; // commitmentHash parameter is the commitment
    gameState.role = "maker";

    // Get the game data to find the salt and move
    log("🔍 Step 2: Getting game data from localStorage...");
    const trackedGames = getMakerGames();
    console.log("Tracked games:", trackedGames);
    console.log(
      "Looking for commitmentHash:",
      commitmentHash,
      "or gameId:",
      gameId
    );

    // Try multiple lookup strategies
    let gameData = null;
    const gameIdStr = gameId?.toString();
    const commitmentHashLower = commitmentHash?.toLowerCase();

    // Strategy 1: Direct lookup by commitment hash (exact match)
    if (commitmentHash && trackedGames[commitmentHash]) {
      gameData = trackedGames[commitmentHash];
      console.log("✅ Found game data by commitment hash (exact match)");
    }
    // Strategy 2: Lookup by commitment hash (case-insensitive)
    else if (commitmentHashLower) {
      for (const key in trackedGames) {
        if (key.toLowerCase() === commitmentHashLower) {
          gameData = trackedGames[key];
          console.log(
            `✅ Found game data by commitment hash (case-insensitive): ${key}`
          );
          break;
        }
      }
    }
    // Strategy 3: Lookup by gameId
    if (!gameData && gameIdStr && trackedGames[gameIdStr]) {
      gameData = trackedGames[gameIdStr];
      console.log("✅ Found game data by gameId");
    }
    // Strategy 4: Search all games for matching gameId or commitment
    if (!gameData) {
      for (const key in trackedGames) {
        const stored = trackedGames[key];
        if (
          (stored.gameId && stored.gameId === gameIdStr) ||
          (stored.commitment &&
            (stored.commitment.toLowerCase() === commitmentHashLower ||
              stored.commitment === commitmentHash))
        ) {
          gameData = stored;
          console.log(`✅ Found game data by searching: key=${key}`);
          break;
        }
      }
    }

    // Strategy 5: If still not found, try to get commitment from contract and match
    if (!gameData && rpsContract) {
      try {
        const gameIdBigInt =
          typeof gameId === "bigint" ? gameId : BigInt(gameId.toString());
        log(`🔍 Fetching game ${gameIdBigInt} from contract...`);
        const game = await rpsContract.getGame(gameIdBigInt);
        const isArray =
          Array.isArray(game) ||
          (typeof game === "object" &&
            game !== null &&
            game.length !== undefined);
        const contractCommitment = isArray ? game[4] : game.commitment;
        const contractPlayer1 = isArray ? game[0] : game.player1;
        const userAddress = await signer.getAddress();

        console.log("Contract game data:", {
          commitment: contractCommitment,
          player1: contractPlayer1,
          userAddress: userAddress,
        });

        // Check if user is player1
        if (
          contractPlayer1 &&
          contractPlayer1.toLowerCase() !== userAddress.toLowerCase()
        ) {
          log(
            `⚠️ You are not the creator of this game. Player1: ${contractPlayer1}`
          );
        }

        if (contractCommitment) {
          const contractCommitmentLower = contractCommitment.toLowerCase();
          log(`🔍 Searching for commitment: ${contractCommitmentLower}`);

          // Try to find by contract commitment (exact match)
          for (const key in trackedGames) {
            const stored = trackedGames[key];
            if (
              stored.commitment &&
              (stored.commitment.toLowerCase() === contractCommitmentLower ||
                stored.commitment === contractCommitment)
            ) {
              gameData = stored;
              console.log(
                `✅ Found game data by contract commitment: key=${key}`
              );
              break;
            }
          }

          // If still not found, try case-insensitive search on keys
          if (!gameData) {
            for (const key in trackedGames) {
              const keyLower = key.toLowerCase();
              if (keyLower === contractCommitmentLower) {
                gameData = trackedGames[key];
                console.log(
                  `✅ Found game data by commitment key (case-insensitive): key=${key}`
                );
                break;
              }
            }
          }
        }
      } catch (error) {
        console.warn("Could not fetch game from contract for lookup:", error);
        log(`⚠️ Error fetching game from contract: ${error.message}`);
      }
    }

    // Strategy 6: If still not found, try to find by gameId in all stored games (deep search)
    if (!gameData && gameIdStr) {
      log(
        `🔍 Deep search: Looking for gameId ${gameIdStr} in all stored games...`
      );
      for (const key in trackedGames) {
        const stored = trackedGames[key];
        // Check if stored gameId matches (as string)
        if (stored.gameId && stored.gameId.toString() === gameIdStr) {
          gameData = stored;
          console.log(
            `✅ Found game data by gameId (deep search): key=${key}, gameId=${stored.gameId}`
          );
          break;
        }
      }
    }

    console.log("Found game data:", gameData);

    if (!gameData) {
      log("❌ Game data not found. Cannot reveal without salt.");
      log(`   Searched for commitmentHash: ${commitmentHash}`);
      log(`   Searched for gameId: ${gameIdStr}`);
      log(
        `   Available keys in localStorage: ${Object.keys(trackedGames).join(
          ", "
        )}`
      );

      // Show what games are stored
      if (Object.keys(trackedGames).length > 0) {
        log(`   Stored games:`);
        for (const key in trackedGames) {
          const stored = trackedGames[key];
          log(
            `     - Key: ${key}, gameId: ${
              stored.gameId
            }, commitment: ${stored.commitment?.slice(0, 20)}...`
          );
        }
      } else {
        log(`   No games found in localStorage.`);
      }

      // Try to get game info from contract for better error message
      if (rpsContract) {
        try {
          const gameIdBigInt =
            typeof gameId === "bigint" ? gameId : BigInt(gameId.toString());
          const game = await rpsContract.getGame(gameIdBigInt);
          const isArray =
            Array.isArray(game) ||
            (typeof game === "object" &&
              game !== null &&
              game.length !== undefined);
          const contractCommitment = isArray ? game[4] : game.commitment;
          const contractPlayer1 = isArray ? game[0] : game.player1;
          const userAddress = await signer.getAddress();

          log(`   Contract game info:`);
          log(`     - GameId: ${gameIdStr}`);
          log(`     - Commitment: ${contractCommitment}`);
          log(`     - Player1: ${contractPlayer1}`);
          log(`     - Your address: ${userAddress}`);

          if (
            contractPlayer1 &&
            contractPlayer1.toLowerCase() !== userAddress.toLowerCase()
          ) {
            log(`   ⚠️ This game was created by a different address.`);
          } else {
            log(
              `   ⚠️ This game was created by you, but the salt/move data is not in localStorage.`
            );
            log(`   💡 Possible reasons:`);
            log(`      - Game was created before the refactoring`);
            log(`      - Browser data was cleared`);
            log(`      - Game was created in a different browser/session`);
            log(
              `   💡 Unfortunately, without the salt stored locally, you cannot reveal this game.`
            );
          }
        } catch (error) {
          log(
            `   ⚠️ Could not fetch game info from contract: ${error.message}`
          );
        }
      }

      return;
    }

    // Get salt and move from localStorage (stored when game was created)
    log("🔍 Step 3: Extracting salt and move...");
    const salt = gameData.salt || gameState.salt;
    const move =
      gameData.move !== null && gameData.move !== undefined
        ? gameData.move
        : gameState.move;
    console.log("Salt:", salt, "Move:", move);

    if (!salt) {
      log("❌ Salt not found. Cannot reveal this game.");
      log(`   Game data: ${JSON.stringify(gameData)}`);
      return;
    }

    if (move === null || move === undefined) {
      log("❌ Move not found. Cannot reveal this game.");
      log(`   Game data: ${JSON.stringify(gameData)}`);
      return;
    }

    log(`✅ Salt and move found: move=${move}, salt=${salt.slice(0, 10)}...`);

    // Convert gameId to BigInt for contract calls
    const gameIdBigInt =
      typeof gameId === "bigint" ? gameId : BigInt(gameId.toString());

    const networkOk = await ensureCorrectNetwork();
    if (!networkOk) {
      log("❌ Please switch to the correct network");
      return;
    }

    log("Getting game state from DegenRPS contract...");
    const game = await rpsContract.getGame(gameIdBigInt);

    // Check if it's an array or object
    const isArray =
      Array.isArray(game) ||
      (typeof game === "object" && game.length !== undefined);

    // Safely access fields
    let taker, takerMove, revealDeadlineBigInt;
    if (isArray && game.length > 10) {
      taker = game[1]; // player2 (index 1 in the struct)
      takerMove = game[6]; // player2Move (index 6 in the struct)
      revealDeadlineBigInt = game[10];
    } else {
      taker = game.player2;
      takerMove = game.player2Move;
      revealDeadlineBigInt = game.revealDeadline;
    }

    log(`🔍 Step 6: Checking game state...`);
    log(`   Taker: ${taker}`);
    log(`   Taker move (from contract): ${takerMove}`);

    // Check that Taker has joined
    if (taker === ethers.ZeroAddress || takerMove === 0 || takerMove === 255) {
      log("⏳ Waiting for taker to join...");
      return;
    }

    const deadline =
      typeof revealDeadlineBigInt === "bigint"
        ? Number(revealDeadlineBigInt)
        : Number(revealDeadlineBigInt.toString());

    const now = Math.floor(Date.now() / 1000);
    if (deadline > 0 && now > deadline) {
      log(`❌ Deadline has passed. (deadline: ${deadline}, now: ${now})`);
      return;
    }

    log("🔍 Step 7: Converting moves...");
    const makerMove = Number(move); // Frontend format: 0=Rock, 1=Paper, 2=Scissors
    const takerMoveContract = Number(takerMove); // DegenRPS enum: 1=Rock, 2=Paper, 3=Scissors

    // Convert taker's move from DegenRPS enum (1,2,3) to frontend format (0,1,2)
    const takerMoveNum = takerMoveContract - 1;

    log(
      `   Maker move (frontend): ${makerMove} (${
        makerMove === 0 ? "Rock" : makerMove === 1 ? "Paper" : "Scissors"
      })`
    );
    log(
      `   Taker move (contract enum): ${takerMoveContract} (${
        takerMoveContract === 1
          ? "Rock"
          : takerMoveContract === 2
          ? "Paper"
          : "Scissors"
      })`
    );
    log(
      `   Taker move (frontend): ${takerMoveNum} (${
        takerMoveNum === 0 ? "Rock" : takerMoveNum === 1 ? "Paper" : "Scissors"
      })`
    );

    // Validate moves (frontend format: 0-2)
    if (
      makerMove < 0 ||
      makerMove > 2 ||
      takerMoveNum < 0 ||
      takerMoveNum > 2
    ) {
      log(
        `❌ Invalid moves: makerMove=${makerMove}, takerMove=${takerMoveNum} (from contract enum ${takerMoveContract})`
      );
      throw new Error(
        `Invalid moves: makerMove=${makerMove}, takerMove=${takerMoveNum}`
      );
    }

    log("🔍 Step 8: Generating ZK proof...");
    log(
      `✅ Maker's move: ${
        makerMove === 0 ? "Rock" : makerMove === 1 ? "Paper" : "Scissors"
      } (${makerMove})`
    );
    log(
      `✅ Taker's move: ${
        takerMoveNum === 0 ? "Rock" : takerMoveNum === 1 ? "Paper" : "Scissors"
      } (${takerMoveNum})`
    );

    // Generate proof using module
    const proofBytes = await generateProofForReveal(
      noir,
      backend,
      makerMove,
      takerMoveNum
    );

    // Convert move to DegenRPS enum (1=Rock, 2=Paper, 3=Scissors) for the contract call
    const moveEnum = frontendToContractMoveFn(makerMove);

    // Verify commitment matches before sending transaction
    log("🔍 Step 9: Verifying commitment...");
    // IMPORTANT: The contract verifies commitment using the enum move (1,2,3), not frontend format (0,1,2)
    // But when we created the game, we used frontend format. Let's check both to see which one matches.
    const commitmentCheckFrontend = ethers.keccak256(
      ethers.solidityPacked(["uint8", "bytes32"], [makerMove, salt])
    );
    const commitmentCheckEnum = ethers.keccak256(
      ethers.solidityPacked(["uint8", "bytes32"], [moveEnum, salt])
    );
    const storedCommitment = isArray ? game[4] : game.commitment;
    log(
      `   Calculated commitment (frontend move ${makerMove}): ${commitmentCheckFrontend}`
    );
    log(
      `   Calculated commitment (enum move ${moveEnum}): ${commitmentCheckEnum}`
    );
    log(`   Stored commitment: ${storedCommitment}`);

    // Check which format matches - the contract expects enum format
    let commitmentMatches = false;
    if (commitmentCheckEnum.toLowerCase() === storedCommitment.toLowerCase()) {
      commitmentMatches = true;
      log(`✅ Commitment verified with enum format!`);
    } else if (
      commitmentCheckFrontend.toLowerCase() === storedCommitment.toLowerCase()
    ) {
      // This means the game was created with frontend format, but contract expects enum format
      log(
        `⚠️ Commitment matches frontend format, but contract expects enum format!`
      );
      log(`   This suggests the game was created incorrectly.`);
      throw new Error(
        "Commitment format mismatch - game was created with wrong move format"
      );
    } else {
      log(`❌ Commitment mismatch!`);
      log(`   Expected: ${storedCommitment}`);
      log(`   Got (frontend): ${commitmentCheckFrontend}`);
      log(`   Got (enum): ${commitmentCheckEnum}`);
      log(`   Move (frontend): ${makerMove}, Move (enum): ${moveEnum}`);
      log(`   Salt: ${salt.slice(0, 10)}...`);
      throw new Error(
        "Commitment verification failed - move or salt is incorrect"
      );
    }

    try {
      log("🔍 Step 10: Estimating gas...");
      const gasEstimate = await rpsContract.revealAndSettle.estimateGas(
        gameIdBigInt,
        moveEnum,
        salt,
        proofBytes
      );
      log(`⛽ Gas estimate: ${gasEstimate.toString()}`);

      log("🔍 Step 11: Sending reveal transaction...");
      log(`   gameId: ${gameIdBigInt}`);
      log(`   moveEnum: ${moveEnum} (frontend move: ${makerMove})`);
      log(`   salt: ${salt.slice(0, 10)}...`);
      log(`   proofBytes length: ${proofBytes.length} chars`);

      const tx = await rpsContract.revealAndSettle(
        gameIdBigInt,
        moveEnum,
        salt,
        proofBytes,
        { gasLimit: gasEstimate * BigInt(2) }
      );

      log(`📤 Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      log(
        `✅ Game settled! Transaction confirmed in block ${receipt.blockNumber}`
      );

      // Get updated game state to see winner
      const updatedGame = await rpsContract.getGame(gameId);
      const gameWinner = Array.isArray(updatedGame)
        ? updatedGame[11]
        : updatedGame.winner;
      const winnerAddress = gameWinner;

      if (winnerAddress === ethers.ZeroAddress) {
        log(`🎉 Result: Tie! Both players can withdraw their bet.`);
      } else {
        const userAddress = await signer.getAddress();
        if (winnerAddress.toLowerCase() === userAddress.toLowerCase()) {
          log(`🎉 You won! You can withdraw the prize pool.`);
        } else {
          log(`😔 You lost. The winner can withdraw the prize pool.`);
        }
      }

      // Refresh maker's games list
      await loadMakerGamesFn();
    } catch (txError) {
      log(`❌ Transaction failed: ${txError.message}`);
      if (txError.data) {
        log(`📋 Error data: ${txError.data}`);
      }
      if (txError.reason) {
        log(`📋 Error reason: ${txError.reason}`);
      }
      throw txError;
    }
  } catch (error) {
    log(`❌ Error revealing move: ${error.message}`);
    console.error("Full error:", error);
  } finally {
    // Restore original game state
    gameState.gameId = originalGameId;
    gameState.commitment = originalCommitment;
    gameState.role = originalRole;
  }
}
