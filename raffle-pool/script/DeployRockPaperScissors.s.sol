// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RockPaperScissors} from "../src/RockPaperScissors.sol";

/// @notice Deploys the RockPaperScissors contract
contract DeployRockPaperScissorsScript is Script {
    function run() public {
        vm.startBroadcast();
        
        RockPaperScissors rps = new RockPaperScissors();
        
        vm.stopBroadcast();
        
        console2.log("Deployed RockPaperScissors at:", address(rps));
        console2.log("Set ROCK_PAPER_SCISSORS_ADDRESS environment variable to:", address(rps));
    }
}
