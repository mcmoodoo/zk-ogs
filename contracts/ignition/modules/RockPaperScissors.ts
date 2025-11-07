import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RockPaperScissorsModule", (m) => {
  // Use new verifier deployed with bb 0.87.0
  // Sepolia: https://sepolia.etherscan.io/address/0x3743ACA8228D72448964F984D0b859b090a9f138
  const verifierAddress = m.getParameter(
    "verifierAddress",
    "0x3743ACA8228D72448964F984D0b859b090a9f138"
  );

  const rockPaperScissors = m.contract("RockPaperScissors", [], {});

  // Wire existing verifier into the game contract
  m.call(rockPaperScissors, "setVerifier", [verifierAddress], {
    after: [rockPaperScissors],
    id: "SetVerifier",
  });

  return { rockPaperScissors };
});
