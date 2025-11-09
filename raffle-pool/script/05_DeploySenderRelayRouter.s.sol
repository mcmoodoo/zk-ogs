// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {SenderRelayRouter} from "../src/router/SenderRelayRouter.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

/// @notice Deploy SenderRelayRouter and save its address
contract DeploySenderRelayRouter is Script {
    function run() external {
        // Get base router address from environment
        address baseRouterAddress = vm.envOr("ROUTER_ADDRESS", address(0));
        require(baseRouterAddress != address(0), "ROUTER_ADDRESS must be set");

        IUniswapV4Router04 baseRouter = IUniswapV4Router04(payable(baseRouterAddress));

        vm.startBroadcast();

        // Deploy SenderRelayRouter
        SenderRelayRouter relayRouter = new SenderRelayRouter(baseRouter);

        vm.stopBroadcast();

        console2.log("SenderRelayRouter deployed at:", address(relayRouter));
        console2.log("Base router address:", baseRouterAddress);
    }
}
