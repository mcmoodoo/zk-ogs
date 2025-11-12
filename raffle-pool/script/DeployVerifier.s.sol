// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {HonkVerifier} from "../src/Verifier.sol";

/// @notice Deploys the HonkVerifier contract
contract DeployVerifierScript is Script {
    function run() public {
        vm.startBroadcast();
        
        HonkVerifier verifier = new HonkVerifier();
        
        vm.stopBroadcast();
        
        console2.log("Deployed HonkVerifier at:", address(verifier));
        console2.log("Set VERIFIER_ADDRESS environment variable to:", address(verifier));
    }
}
