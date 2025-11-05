import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RockPaperScissorsModule", (m) => {
  const rockPaperScissors = m.contract("RockPaperScissors");

  return { rockPaperScissors };
});

