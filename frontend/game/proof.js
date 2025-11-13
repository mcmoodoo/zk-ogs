import { ethers } from "ethers";
import { log } from "../utils/logger.js";

// Helper function to determine winner locally
export function determineWinnerLocal(move1, move2) {
  if (move1 === move2) return 0;
  // Rock beats Scissors, Paper beats Rock, Scissors beats Paper
  if (move1 === 0 && move2 === 2) return 1; // Rock beats Scissors
  if (move1 === 1 && move2 === 0) return 1; // Paper beats Rock
  if (move1 === 2 && move2 === 1) return 1; // Scissors beats Paper
  return 2; // Player 2 wins
}

// Serialize proof for contract
export async function serializeProof(proof) {
  try {
    // Check if proof is already bytes/hex
    if (typeof proof === "string" && proof.startsWith("0x")) {
      return proof;
    }

    // Check if it's a Uint8Array
    if (proof instanceof Uint8Array) {
      return ethers.hexlify(proof);
    }

    // Barretenberg bb.js proof format: check for proof.proof (raw bytes)
    if (proof.proof) {
      if (proof.proof instanceof Uint8Array) {
        return ethers.hexlify(proof.proof);
      }
      if (proof.proof.bytes && proof.proof.bytes instanceof Uint8Array) {
        return ethers.hexlify(proof.proof.bytes);
      }
    }

    // Check if it has a serialized property
    if (proof.serialized) {
      if (proof.serialized instanceof Uint8Array) {
        return ethers.hexlify(proof.serialized);
      }
      if (typeof proof.serialized === "string") {
        return proof.serialized;
      }
    }

    // Try to get bytes from the proof object
    if (proof.bytes) {
      if (proof.bytes instanceof Uint8Array) {
        return ethers.hexlify(proof.bytes);
      }
      if (typeof proof.bytes === "string") {
        return proof.bytes;
      }
    }

    // Check for ArrayBuffer
    if (proof instanceof ArrayBuffer) {
      return ethers.hexlify(new Uint8Array(proof));
    }

    console.log("Proof structure:", proof);
    console.log("Proof type:", typeof proof);
    console.log("Proof keys:", Object.keys(proof || {}));
    throw new Error("Could not serialize proof - unknown format");
  } catch (error) {
    console.error("Error serializing proof:", error);
    throw error;
  }
}

// Generate ZK proof for game creation (with placeholder move2)
export async function generateProofForCreation(noir, backend, moveValue) {
  log("🔐 Generating ZK proof...");

  let proofBytes = "0x";
  try {
    // Generate proof using Noir - the proof should prove the commitment matches the move and salt
    // We'll use a placeholder player2 move (0/Rock) since we don't know it yet
    const placeholderPlayer2Move = 0;
    // Calculate winner with placeholder (will be recalculated at reveal with actual moves)
    let placeholderWinner = determineWinnerLocal(
      moveValue,
      placeholderPlayer2Move
    );

    // The circuit expects: player1_move, player2_move, winner
    const inputs = {
      player1_move: moveValue,
      player2_move: placeholderPlayer2Move,
      winner: placeholderWinner,
    };

    log(
      `Generating proof with inputs: player1_move=${moveValue}, player2_move=${placeholderPlayer2Move}, winner=${placeholderWinner}`
    );

    // Step 1: Execute circuit to get witness
    let witness;
    try {
      const result = await noir.execute(inputs);
      witness = result.witness;
      log("✅ Witness computed successfully");
    } catch (witnessError) {
      log(`❌ Witness computation failed: ${witnessError.message}`);
      throw new Error(`Witness computation failed: ${witnessError.message}`);
    }

    // Step 2: Generate proof from witness
    let proof;
    try {
      proof = await backend.generateProof(witness, { keccak: true });
      log("✅ Proof generated successfully with Keccak256 hash");
    } catch (proofError) {
      log(`❌ Proof generation failed: ${proofError.message}`);
      throw new Error(`Proof generation failed: ${proofError.message}`);
    }

    // Step 3: Serialize proof
    try {
      if (proof.proof && proof.proof instanceof Uint8Array) {
        proofBytes = ethers.hexlify(proof.proof);
        log("✅ Proof serialized from proof.proof (Uint8Array)");
      } else if (backend.serializeProof) {
        proofBytes = await backend.serializeProof(proof);
        log("✅ Proof serialized using backend.serializeProof()");
      } else {
        proofBytes = await serializeProof(proof);
        log("✅ Proof serialized using custom method");
      }

      const proofLength =
        typeof proofBytes === "string"
          ? (proofBytes.length - 2) / 2
          : proofBytes.length;
      log(`📏 Proof length: ${proofLength} bytes`);
    } catch (serializeError) {
      log(`❌ Proof serialization failed: ${serializeError.message}`);
      throw serializeError;
    }

    log("✅ ZK proof generated (with placeholder move2)");
    return proofBytes;
  } catch (error) {
    log(`❌ Proof generation failed: ${error.message}`);
    log(`   Error details: ${error.stack || error}`);
    console.error("Full proof generation error:", error);
    throw new Error(`Proof generation failed: ${error.message}`);
  }
}

// Generate ZK proof for reveal (with actual moves)
export async function generateProofForReveal(
  noir,
  backend,
  makerMove,
  takerMove
) {
  log("🔍 Step 8: Generating ZK proof...");
  log(
    `✅ Maker's move: ${
      makerMove === 0 ? "Rock" : makerMove === 1 ? "Paper" : "Scissors"
    } (${makerMove})`
  );
  log(
    `✅ Taker's move: ${
      takerMove === 0 ? "Rock" : takerMove === 1 ? "Paper" : "Scissors"
    } (${takerMove})`
  );

  const winner = determineWinnerLocal(makerMove, takerMove);
  log(
    `Expected winner: ${
      winner === 0 ? "Tie" : winner === 1 ? "Maker" : "Taker"
    } (${winner})`
  );

  // Generate proof - Noir expects Field values (frontend format: 0,1,2)
  const inputs = {
    player1_move: makerMove, // Frontend format: 0=Rock, 1=Paper, 2=Scissors
    player2_move: takerMove, // Frontend format: 0=Rock, 1=Paper, 2=Scissors
    winner: winner, // 0=Tie, 1=Player1, 2=Player2
  };

  log(
    `Proof inputs: player1_move=${inputs.player1_move}, player2_move=${inputs.player2_move}, winner=${inputs.winner}`
  );

  log(
    `Calling noir.execute with inputs: player1_move=${makerMove}, player2_move=${takerMove}, winner=${winner}`
  );

  let witness;
  try {
    const result = await noir.execute(inputs);
    witness = result.witness;
    log("✅ Witness computed successfully");
  } catch (witnessError) {
    log(`❌ Witness computation failed: ${witnessError.message}`);
    throw new Error(`Witness computation failed: ${witnessError.message}`);
  }

  let proof;
  try {
    // Use keccak hash function to match the verifier
    proof = await backend.generateProof(witness, { keccak: true });
    log("✅ Proof generated successfully with Keccak256 hash");
  } catch (proofError) {
    log(`❌ Proof generation failed: ${proofError.message}`);
    throw new Error(`Proof generation failed: ${proofError.message}`);
  }

  // Verify proof locally
  const isValid = await backend.verifyProof(proof, { keccak: true });
  if (!isValid) {
    throw new Error("Proof verification failed locally");
  }

  log("✅ Proof generated and verified!");

  // Serialize proof
  let proofBytes;
  try {
    if (proof.proof && proof.proof instanceof Uint8Array) {
      proofBytes = ethers.hexlify(proof.proof);
      log("✅ Proof serialized from proof.proof (Uint8Array)");
    } else if (backend.serializeProof) {
      proofBytes = await backend.serializeProof(proof);
      log("✅ Proof serialized using backend.serializeProof()");
    } else {
      proofBytes = await serializeProof(proof);
      log("✅ Proof serialized using custom method");
    }

    const proofLength =
      typeof proofBytes === "string"
        ? (proofBytes.length - 2) / 2
        : proofBytes.length;
    log(`📏 Proof length: ${proofLength} bytes`);
  } catch (serializeError) {
    log(`❌ Proof serialization failed: ${serializeError.message}`);
    throw serializeError;
  }

  return proofBytes;
}
