// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {SenderRelayLibrary} from "./SenderRelayLibrary.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";

/// @title SenderRelayRouter
/// @notice A wrapper router that relays the original msg.sender (EOA) to hooks via hookData
/// @dev This router wraps the standard V4SwapRouter and automatically encodes msg.sender
///      into the hookData parameter so hooks can access the original transaction initiator
contract SenderRelayRouter {
    using SenderRelayLibrary for bytes;
    using CurrencyLibrary for Currency;

    IUniswapV4Router04 public immutable router;

    constructor(IUniswapV4Router04 _router) {
        router = _router;
    }

    /// @notice Swaps an exact amount of input tokens for as many output tokens as possible
    /// @dev Automatically encodes msg.sender into hookData before calling the underlying router
    /// @param amountIn The exact amount of input tokens to swap
    /// @param amountOutMin The minimum amount of output tokens to receive
    /// @param zeroForOne The direction of the swap (true = token0 -> token1)
    /// @param poolKey The pool key identifying the pool to swap in
    /// @param hookData Additional data to pass to hooks (will be prepended with msg.sender)
    /// @param receiver The address to receive the output tokens
    /// @param deadline The deadline for the swap
    /// @return delta The balance delta from the swap
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        PoolKey calldata poolKey,
        bytes calldata hookData,
        address receiver,
        uint256 deadline
    ) external payable returns (BalanceDelta delta) {
        // Encode msg.sender into hookData (backward compatible, commitment hash will be zero)
        bytes memory relayedHookData = SenderRelayLibrary.encodeWithSender(msg.sender, hookData);
        return _executeSwap(amountIn, amountOutMin, zeroForOne, poolKey, relayedHookData, receiver, deadline);
    }

    /// @notice Swaps an exact amount of input tokens with a commitment hash
    /// @dev Automatically encodes msg.sender and commitment hash into hookData
    /// @param amountIn The exact amount of input tokens to swap
    /// @param amountOutMin The minimum amount of output tokens to receive
    /// @param zeroForOne The direction of the swap (true = token0 -> token1)
    /// @param poolKey The pool key identifying the pool to swap in
    /// @param commitmentHash The 256-bit commitment hash to pass to hooks
    /// @param hookData Additional data to pass to hooks (will be appended after sender and commitment)
    /// @param receiver The address to receive the output tokens
    /// @param deadline The deadline for the swap
    /// @return delta The balance delta from the swap
    function swapExactTokensForTokensWithCommitment(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        PoolKey calldata poolKey,
        bytes32 commitmentHash,
        bytes calldata hookData,
        address receiver,
        uint256 deadline
    ) external payable returns (BalanceDelta delta) {
        // Encode msg.sender and commitment hash into hookData
        bytes memory relayedHookData = SenderRelayLibrary.encodeWithSenderAndCommitment(
            msg.sender,
            commitmentHash,
            hookData
        );
        return _executeSwap(amountIn, amountOutMin, zeroForOne, poolKey, relayedHookData, receiver, deadline);
    }

    /// @notice Internal function to execute the swap
    function _executeSwap(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        PoolKey calldata poolKey,
        bytes memory relayedHookData,
        address receiver,
        uint256 deadline
    ) internal returns (BalanceDelta delta) {

        // Transfer input tokens from the original caller to this contract
        // The underlying router will then pull them from this contract
        Currency inputCurrency = zeroForOne ? poolKey.currency0 : poolKey.currency1;
        if (!inputCurrency.isAddressZero()) {
            IERC20(Currency.unwrap(inputCurrency)).transferFrom(msg.sender, address(this), amountIn);
            // Approve the underlying router to spend the tokens
            IERC20(Currency.unwrap(inputCurrency)).approve(address(router), amountIn);
        }

        // Call the underlying router with the modified hookData
        delta = router.swapExactTokensForTokens{value: msg.value}(
            amountIn,
            amountOutMin,
            zeroForOne,
            poolKey,
            relayedHookData,
            receiver,
            deadline
        );

        // Clean up approval
        if (!inputCurrency.isAddressZero()) {
            IERC20(Currency.unwrap(inputCurrency)).approve(address(router), 0);
        }
    }

    /// @notice Receive ETH (for native token swaps)
    receive() external payable {
        // Forward any received ETH to the underlying router
        (bool success,) = payable(address(router)).call{value: msg.value}("");
        require(success, "SenderRelayRouter: ETH transfer failed");
    }
}
