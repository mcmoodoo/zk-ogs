// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {RPSHook} from "../src/RPSHook.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {SenderRelayRouter} from "../src/router/SenderRelayRouter.sol";

contract RPSHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    RPSHook hook;
    PoolId poolId;
    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        // Deploy all required artifacts
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();

        // Deploy the hook to an address with the correct flags
        address flags = address(
            uint160(
                Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
                    | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144) // Namespace the hook to avoid collisions
        );
        bytes memory constructorArgs = abi.encode(poolManager);
        deployCodeTo("RPSHook.sol:RPSHook", constructorArgs, flags);
        hook = RPSHook(flags);

        // Create the pool
        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Provide full-range liquidity to the pool
        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }


    // ============================================================
    // Raffle Pool Contribution Tests
    // ============================================================

    function testRaffleContributionIsTakenFromSwap() public {
        // Setup: Get initial balances
        uint256 amountIn = 10e18;
        uint256 balance0Before = MockERC20(Currency.unwrap(currency0)).balanceOf(address(this));
        uint256 balance1Before = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        
        // Execute swap (token0 -> token1)
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Get balances after swap
        uint256 balance0After = MockERC20(Currency.unwrap(currency0)).balanceOf(address(this));
        uint256 balance1After = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        
        // Calculate output received by user (after 5% contribution was taken)
        uint256 outputReceived = balance1After - balance1Before;
        
        // Verify 5% contribution was taken: check ERC6909 claim balance
        // If user received X tokens, the original output was X * 100/95, and contribution is X * 5/95 = X/19
        // This is because: contribution = 5% of original output, user gets 95% of original output
        uint256 expectedContribution = outputReceived / 19; // Approximately 5.26% of what user received
        uint256 actualClaimBalance = poolManager.balanceOf(address(hook), currency1.toId());
        
        // The contribution should be approximately 5% of the original output
        // Since user received ~95% of output, contribution should be ~outputReceived/19
        assertGt(actualClaimBalance, 0, "Hook should have ERC6909 claims");
        // Allow 10% tolerance for rounding and pool fees
        assertApproxEqRel(actualClaimBalance, expectedContribution, 0.1e18, "Contribution should be ~5% of output");
        
        // Verify ledger was updated
        uint256 ledgerBalance = hook.getRafflePoolBalance(poolId, currency1);
        assertEq(ledgerBalance, actualClaimBalance, "Ledger should match claim balance");
    }

    function testRaffleContributionTrackedPerAddress() public {
        address player1 = address(0x1111);
        address player2 = address(0x2222);
        
        // Transfer tokens to players
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player1, 20e18);
        token0.transfer(player2, 20e18);
        
        // Player 1 swaps
        vm.startPrank(player1);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player1,
            deadline: block.timestamp + 1
        });
        vm.stopPrank();

        // Player 2 swaps
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        vm.stopPrank();

        // Check per-address contributions
        uint256 player1Contribution = hook.getContributionByAddress(player1, poolId, currency1);
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        
        assertGt(player1Contribution, 0, "Player 1 should have contributions");
        assertGt(player2Contribution, 0, "Player 2 should have contributions");
        
        // Total pool balance should equal sum of individual contributions
        uint256 totalPoolBalance = hook.getRafflePoolBalance(poolId, currency1);
        assertEq(totalPoolBalance, player1Contribution + player2Contribution, "Total should equal sum of contributions");
    }

    function testRaffleContributionEventEmitted() public {
        vm.recordLogs();
        
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 eventSignature = keccak256("RaffleContribution(bytes32,address,address,uint256)");
        
        bool eventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == eventSignature) {
                eventFound = true;
                // Verify event data
                PoolId emittedPoolId = PoolId.wrap(bytes32(logs[i].topics[1]));
                address contributor = address(uint160(uint256(logs[i].topics[2])));
                Currency emittedCurrency = Currency.wrap(address(uint160(uint256(logs[i].topics[3]))));
                uint256 amount = abi.decode(logs[i].data, (uint256));
                
                assertEq(PoolId.unwrap(emittedPoolId), PoolId.unwrap(poolId), "PoolId should match");
                assertEq(contributor, address(this), "Contributor should be this contract");
                assertEq(Currency.unwrap(emittedCurrency), Currency.unwrap(currency1), "Currency should be currency1");
                assertGt(amount, 0, "Amount should be greater than 0");
                break;
            }
        }
        
        assertTrue(eventFound, "RaffleContribution event should be emitted");
    }

    // ============================================================
    // Refund Tests
    // ============================================================

    function testRefundFailsBeforeTimeout() public {
        bytes32 commitmentHash = keccak256("test commitment");
        
        // Execute swap with commitment hash
        SenderRelayRouter(payable(address(swapRouter))).swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Try to refund immediately (should fail)
        vm.expectRevert("Timeout not reached");
        hook.refundPlayer1Swap(commitmentHash);
    }

    function testRefundSucceedsAfterTimeout() public {
        bytes32 commitmentHash = keccak256("test commitment 2");
        
        // Execute swap with commitment
        SenderRelayRouter(payable(address(swapRouter))).swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Get contribution amount
        uint256 contributionAmount = hook.getContributionByAddress(address(this), poolId, currency1);
        assertGt(contributionAmount, 0, "Should have contribution");
        
        // Verify claim balance exists
        uint256 claimBalanceBefore = poolManager.balanceOf(address(hook), currency1.toId());
        assertGt(claimBalanceBefore, 0, "Hook should have claims");
        
        // Fast forward 1 minute + 1 second
        vm.warp(block.timestamp + 61);
        
        // Get balance before refund
        uint256 balanceBeforeRefund = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        
        // Refund should succeed (anyone can call it)
        address randomCaller = address(0x9999);
        vm.prank(randomCaller);
        hook.refundPlayer1Swap(commitmentHash);
        
        // Verify tokens were returned to Player 1 (this contract)
        uint256 balanceAfterRefund = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        assertEq(balanceAfterRefund - balanceBeforeRefund, contributionAmount, "Should receive contribution back");
        
        // Verify claim balance decreased
        uint256 claimBalanceAfter = poolManager.balanceOf(address(hook), currency1.toId());
        assertEq(claimBalanceAfter, claimBalanceBefore - contributionAmount, "Claim balance should decrease");
        
        // Verify ledger updated
        uint256 ledgerBalance = hook.getRafflePoolBalance(poolId, currency1);
        assertEq(ledgerBalance, claimBalanceAfter, "Ledger should match remaining claims");
        
        // Verify per-address contribution decreased
        uint256 contributionAfter = hook.getContributionByAddress(address(this), poolId, currency1);
        assertEq(contributionAfter, 0, "Contribution should be zero after refund");
    }

    function testRefundFailsIfPlayer2Moved() public {
        bytes32 commitmentHash = keccak256("test commitment 3");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Execute swap with commitment (Player 1)
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Player 2 makes a swap and posts their move
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution); // Paper
        vm.stopPrank();
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 61);
        
        // Refund should fail because Player 2 has moved
        vm.expectRevert("Player 2 already moved");
        hook.refundPlayer1Swap(commitmentHash);
    }

    function testRefundFailsForNonExistentSwap() public {
        bytes32 fakeCommitmentHash = keccak256("fake commitment");
        
        vm.expectRevert("Swap not found");
        hook.refundPlayer1Swap(fakeCommitmentHash);
    }

    function testRefundPermissionless() public {
        bytes32 commitmentHash = keccak256("test commitment 4");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Execute swap with commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Fast forward past timeout
        vm.warp(block.timestamp + 61);
        
        // Random address should be able to call refund
        address randomCaller = address(0xAAAA);
        uint256 balanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        uint256 contributionAmount = hook.getContributionByAddress(address(this), poolId, currency1);
        
        vm.prank(randomCaller);
        hook.refundPlayer1Swap(commitmentHash);
        
        // Verify refund went to Player 1 (this contract), not the caller
        uint256 balanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        assertEq(balanceAfter - balanceBefore, contributionAmount, "Refund should go to Player 1");
    }

    function testCanRefundSwapViewFunction() public {
        bytes32 commitmentHash = keccak256("test commitment 5");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Execute swap with commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Check immediately (should not be refundable)
        (bool canRefund, uint256 timeRemaining) = hook.canRefundSwap(commitmentHash);
        assertFalse(canRefund, "Should not be refundable yet");
        assertGt(timeRemaining, 0, "Should have time remaining");
        assertLe(timeRemaining, 60, "Time remaining should be <= 60 seconds");
        
        // Fast forward 30 seconds
        vm.warp(block.timestamp + 30);
        (canRefund, timeRemaining) = hook.canRefundSwap(commitmentHash);
        assertFalse(canRefund, "Should still not be refundable");
        assertGt(timeRemaining, 0, "Should still have time remaining");
        assertLe(timeRemaining, 31, "Time remaining should be <= 31 seconds");
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 31);
        (canRefund, timeRemaining) = hook.canRefundSwap(commitmentHash);
        assertTrue(canRefund, "Should be refundable now");
        assertEq(timeRemaining, 0, "Time remaining should be 0");
    }

    function testGetPendingSwapDetails() public {
        bytes32 commitmentHash = keccak256("test commitment 6");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Execute swap with commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Get pending swap details
        RPSHook.PendingSwap memory swap = hook.getPendingSwap(commitmentHash);
        
        assertEq(swap.player1, address(this), "Player1 should be this contract");
        assertEq(PoolId.unwrap(swap.poolId), PoolId.unwrap(poolId), "PoolId should match");
        assertEq(Currency.unwrap(swap.currency), Currency.unwrap(currency1), "Currency should be currency1");
        assertGt(swap.player1Contribution, 0, "Contribution amount should be > 0");
        assertFalse(swap.player2Moved, "Player 2 should not have moved");
        assertEq(swap.timestamp, block.timestamp, "Timestamp should match");
    }

    function testSwapWithoutCommitmentNotRefundable() public {
        // Execute swap WITHOUT commitment hash
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Contribution should still be taken
        uint256 contribution = hook.getContributionByAddress(address(this), poolId, currency1);
        assertGt(contribution, 0, "Should have contribution");
        
        // But there should be no pending swap (since no commitment hash)
        // We can't test refund because there's no commitment hash to use
        // This is expected behavior - swaps without commitments are not refundable
    }

    function testMultipleSwapsWithDifferentCommitments() public {
        bytes32 commitment1 = keccak256("commitment 1");
        bytes32 commitment2 = keccak256("commitment 2");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // First swap
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitment1,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Second swap
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitment2,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Both should be tracked separately
        RPSHook.PendingSwap memory swap1 = hook.getPendingSwap(commitment1);
        RPSHook.PendingSwap memory swap2 = hook.getPendingSwap(commitment2);
        
        assertEq(swap1.player1, address(this), "Swap1 player1 should match");
        assertEq(swap2.player1, address(this), "Swap2 player1 should match");
        assertGt(swap1.player1Contribution, 0, "Swap1 should have contribution");
        assertGt(swap2.player1Contribution, 0, "Swap2 should have contribution");
        
        // Refund first swap
        vm.warp(block.timestamp + 61);
        hook.refundPlayer1Swap(commitment1);
        
        // Second swap should still exist
        swap2 = hook.getPendingSwap(commitment2);
        assertGt(swap2.player1Contribution, 0, "Swap2 should still exist");
    }

    function testRefundEventEmitted() public {
        bytes32 commitmentHash = keccak256("test commitment event");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Execute swap with commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        uint256 contributionAmount = hook.getContributionByAddress(address(this), poolId, currency1);
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 61);
        
        vm.recordLogs();
        hook.refundPlayer1Swap(commitmentHash);
        
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 eventSignature = keccak256("SwapRefunded(bytes32,address,bytes32,address,uint256)");
        
        bool eventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == eventSignature) {
                eventFound = true;
                bytes32 emittedCommitment = bytes32(logs[i].topics[1]);
                address player1 = address(uint160(uint256(logs[i].topics[2])));
                PoolId emittedPoolId = PoolId.wrap(bytes32(logs[i].topics[3]));
                (Currency currency, uint256 amount) = abi.decode(logs[i].data, (Currency, uint256));
                
                assertEq(emittedCommitment, commitmentHash, "Commitment should match");
                assertEq(player1, address(this), "Player1 should match");
                assertEq(PoolId.unwrap(emittedPoolId), PoolId.unwrap(poolId), "PoolId should match");
                assertEq(Currency.unwrap(currency), Currency.unwrap(currency1), "Currency should match");
                assertEq(amount, contributionAmount, "Amount should match");
                break;
            }
        }
        
        assertTrue(eventFound, "SwapRefunded event should be emitted");
    }

    // ============================================================
    // RPS Commit-Reveal Game Tests
    // ============================================================

    function testPlayer2PostMoveSuccess() public {
        bytes32 commitmentHash = keccak256(abi.encodePacked(uint8(0), bytes32(uint256(12345)))); // Rock with salt
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Player 2 makes a swap and posts their move
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        assertGt(player2Contribution, 0, "Player 2 should have contribution");
        
        // Player 2 posts Paper (1)
        vm.recordLogs();
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        vm.stopPrank();
        
        // Verify the move was recorded
        RPSHook.PendingSwap memory swap = hook.getPendingSwap(commitmentHash);
        assertTrue(swap.player2Moved, "Player 2 should have moved");
        assertEq(swap.player2, player2, "Player 2 address should be set");
        assertEq(swap.player2Move, 1, "Player 2 move should be Paper");
        assertEq(swap.player2Contribution, player2Contribution, "Player 2 contribution should match");
        assertEq(swap.player2MoveTimestamp, block.timestamp, "Timestamp should be set");
        
        // Verify event was emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 eventSignature = keccak256("Player2Moved(bytes32,address,uint8,uint256)");
        bool eventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == eventSignature) {
                eventFound = true;
                bytes32 emittedCommitment = bytes32(logs[i].topics[1]);
                address emittedPlayer2 = address(uint160(uint256(logs[i].topics[2])));
                (uint8 move, uint256 amount) = abi.decode(logs[i].data, (uint8, uint256));
                
                assertEq(emittedCommitment, commitmentHash, "Commitment should match");
                assertEq(emittedPlayer2, player2, "Player 2 should match");
                assertEq(move, 1, "Move should be Paper");
                assertEq(amount, player2Contribution, "Contribution should match");
                break;
            }
        }
        assertTrue(eventFound, "Player2Moved event should be emitted");
    }

    function testPlayer2PostMoveFailsIfAlreadyMoved() public {
        bytes32 commitmentHash = keccak256("test commitment");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Player 2 posts move
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        
        // Try to post move again - should fail
        vm.expectRevert("Player 2 already moved");
        hook.player2PostMove(commitmentHash, 2, player2Contribution);
        vm.stopPrank();
    }

    function testPlayer2PostMoveFailsWithInvalidMove() public {
        bytes32 commitmentHash = keccak256("test commitment");
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        
        // Try invalid move (3 is not valid)
        vm.expectRevert("Invalid move");
        hook.player2PostMove(commitmentHash, 3, player2Contribution);
        vm.stopPrank();
    }

    function testPlayer1RevealPlayer1Wins() public {
        // Player 1 chooses Rock (0) with salt
        bytes32 salt = bytes32(uint256(12345));
        uint8 player1Move = 0; // Rock
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        uint256 player1Contribution = hook.getContributionByAddress(address(this), poolId, currency1);

        // Player 2 makes swap and posts Scissors (2) - Rock beats Scissors
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 2, player2Contribution); // Scissors
        vm.stopPrank();

        // Get balances before reveal
        uint256 player1BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        uint256 prizeAmount = player1Contribution + player2Contribution;

        // Player 1 reveals
        vm.recordLogs();
        hook.player1Reveal(commitmentHash, player1Move, salt);

        // Verify Player 1 won and received the prize
        uint256 player1BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        assertEq(
            player1BalanceAfter - player1BalanceBefore,
            prizeAmount,
            "Player 1 should receive the full prize"
        );

        // Verify swap is resolved (swap is deleted after resolution, so check it doesn't exist)
        RPSHook.PendingSwap memory swap = hook.getPendingSwap(commitmentHash);
        assertEq(swap.player1, address(0), "Swap should be deleted after resolution");

        // Verify events
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 revealEventSig = keccak256("Player1Revealed(bytes32,uint8,uint8,address)");
        bytes32 resolvedEventSig = keccak256("GameResolved(bytes32,address,uint256)");
        
        bool revealEventFound = false;
        bool resolvedEventFound = false;
        
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == revealEventSig) {
                revealEventFound = true;
                bytes32 emittedCommitment = bytes32(logs[i].topics[1]);
                address winner = address(uint160(uint256(logs[i].topics[2])));
                (uint8 p1Move, uint8 p2Move) = abi.decode(logs[i].data, (uint8, uint8));
                
                assertEq(emittedCommitment, commitmentHash, "Commitment should match");
                assertEq(winner, address(this), "Player 1 should win");
                assertEq(p1Move, 0, "Player 1 move should be Rock");
                assertEq(p2Move, 2, "Player 2 move should be Scissors");
            }
            if (logs[i].topics.length > 0 && logs[i].topics[0] == resolvedEventSig) {
                resolvedEventFound = true;
                bytes32 emittedCommitment = bytes32(logs[i].topics[1]);
                address winner = address(uint160(uint256(logs[i].topics[2])));
                uint256 prize = abi.decode(logs[i].data, (uint256));
                
                assertEq(emittedCommitment, commitmentHash, "Commitment should match");
                assertEq(winner, address(this), "Player 1 should win");
                assertEq(prize, prizeAmount, "Prize amount should match");
            }
        }
        
        assertTrue(revealEventFound, "Player1Revealed event should be emitted");
        assertTrue(resolvedEventFound, "GameResolved event should be emitted");
    }

    function testPlayer1RevealPlayer2Wins() public {
        // Player 1 chooses Scissors (2) with salt
        bytes32 salt = bytes32(uint256(67890));
        uint8 player1Move = 2; // Scissors
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Player 2 makes swap and posts Rock (0) - Rock beats Scissors
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 0, player2Contribution); // Rock
        vm.stopPrank();

        uint256 player1Contribution = hook.getContributionByAddress(address(this), poolId, currency1);
        uint256 prizeAmount = player1Contribution + player2Contribution;

        // Get balances before reveal
        uint256 player2BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);

        // Player 1 reveals
        hook.player1Reveal(commitmentHash, player1Move, salt);

        // Verify Player 2 won and received the prize
        uint256 player2BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);
        assertEq(
            player2BalanceAfter - player2BalanceBefore,
            prizeAmount,
            "Player 2 should receive the full prize"
        );
    }

    function testPlayer1RevealTie() public {
        // Player 1 chooses Paper (1) with salt
        bytes32 salt = bytes32(uint256(11111));
        uint8 player1Move = 1; // Paper
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        uint256 player1Contribution = hook.getContributionByAddress(address(this), poolId, currency1);

        // Player 2 makes swap and posts Paper (1) - Tie
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution); // Paper
        vm.stopPrank();

        // Get balances before reveal
        uint256 player1BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        uint256 player2BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);

        // Player 1 reveals
        hook.player1Reveal(commitmentHash, player1Move, salt);

        // Verify both players got refunded (tie)
        uint256 player1BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        uint256 player2BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);
        
        assertEq(
            player1BalanceAfter - player1BalanceBefore,
            player1Contribution,
            "Player 1 should get their contribution back"
        );
        assertEq(
            player2BalanceAfter - player2BalanceBefore,
            player2Contribution,
            "Player 2 should get their contribution back"
        );
    }

    function testPlayer1RevealFailsWithInvalidCommitment() public {
        bytes32 salt = bytes32(uint256(12345));
        uint8 player1Move = 0; // Rock
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        vm.stopPrank();

        // Try to reveal with wrong salt
        bytes32 wrongSalt = bytes32(uint256(99999));
        vm.expectRevert("Invalid commitment");
        hook.player1Reveal(commitmentHash, player1Move, wrongSalt);
    }

    function testPlayer1RevealFailsIfPlayer2HasntMoved() public {
        bytes32 salt = bytes32(uint256(12345));
        uint8 player1Move = 0;
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        // Try to reveal before Player 2 moves
        vm.expectRevert("Player 2 must move first");
        hook.player1Reveal(commitmentHash, player1Move, salt);
    }

    function testPlayer1RevealFailsIfNotPlayer1() public {
        bytes32 salt = bytes32(uint256(12345));
        uint8 player1Move = 0;
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        
        // Player 2 tries to reveal - should fail
        vm.expectRevert("Only Player 1 can reveal");
        hook.player1Reveal(commitmentHash, player1Move, salt);
        vm.stopPrank();
    }

    function testClaimPrizeAfterRevealTimeout() public {
        bytes32 salt = bytes32(uint256(12345));
        uint8 player1Move = 0;
        bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        // Player 1 posts commitment
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        uint256 player1Contribution = hook.getContributionByAddress(address(this), poolId, currency1);

        // Player 2 makes swap and posts move
        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        vm.stopPrank();

        uint256 prizeAmount = player1Contribution + player2Contribution;

        // Fast forward past reveal timeout
        vm.warp(block.timestamp + 61);

        // Get balance before claim
        uint256 player2BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);

        // Anyone can call this (permissionless)
        address randomCaller = address(0x9999);
        vm.prank(randomCaller);
        hook.claimPrizeAfterRevealTimeout(commitmentHash);

        // Verify Player 2 won (Player 1 failed to reveal)
        uint256 player2BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(player2);
        assertEq(
            player2BalanceAfter - player2BalanceBefore,
            prizeAmount,
            "Player 2 should receive the full prize"
        );

        // Verify swap is resolved (swap is deleted after resolution, so check it doesn't exist)
        RPSHook.PendingSwap memory swap = hook.getPendingSwap(commitmentHash);
        assertEq(swap.player1, address(0), "Swap should be deleted after resolution");
    }

    function testClaimPrizeAfterRevealTimeoutFailsBeforeTimeout() public {
        bytes32 commitmentHash = keccak256("test commitment");
        
        SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
        
        relayRouter.swapExactTokensForTokensWithCommitment({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            commitmentHash: commitmentHash,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        address player2 = address(0x2222);
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        token0.transfer(player2, 20e18);
        
        vm.startPrank(player2);
        token0.approve(address(swapRouter), type(uint256).max);
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: player2,
            deadline: block.timestamp + 1
        });
        
        uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
        hook.player2PostMove(commitmentHash, 1, player2Contribution);
        vm.stopPrank();

        // Try to claim immediately - should fail
        vm.expectRevert("Reveal timeout not reached");
        hook.claimPrizeAfterRevealTimeout(commitmentHash);
    }

    function testAllRPSWinScenarios() public {
        // Test all winning combinations
        // Rock (0) beats Scissors (2)
        // Paper (1) beats Rock (0)
        // Scissors (2) beats Paper (1)
        
        uint8[3][3] memory scenarios = [
            [uint8(0), uint8(2), uint8(0)], // Player 1 Rock vs Player 2 Scissors -> Player 1 wins
            [uint8(1), uint8(0), uint8(0)], // Player 1 Paper vs Player 2 Rock -> Player 1 wins
            [uint8(2), uint8(1), uint8(0)]  // Player 1 Scissors vs Player 2 Paper -> Player 1 wins
        ];

        for (uint256 i = 0; i < 3; i++) {
            bytes32 salt = bytes32(uint256(i + 1000));
            uint8 player1Move = scenarios[i][0];
            uint8 player2Move = scenarios[i][1];
            bytes32 commitmentHash = keccak256(abi.encodePacked(player1Move, salt));
            
            SenderRelayRouter relayRouter = SenderRelayRouter(payable(address(swapRouter)));
            
            // Player 1 posts commitment
            relayRouter.swapExactTokensForTokensWithCommitment({
                amountIn: 10e18,
                amountOutMin: 0,
                zeroForOne: true,
                poolKey: poolKey,
                commitmentHash: commitmentHash,
                hookData: Constants.ZERO_BYTES,
                receiver: address(this),
                deadline: block.timestamp + 1
            });

            // Player 2 makes swap and posts move
            address player2 = address(uint160(0x2222 + i));
            MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
            token0.transfer(player2, 20e18);
            
            vm.startPrank(player2);
            token0.approve(address(swapRouter), type(uint256).max);
            swapRouter.swapExactTokensForTokens({
                amountIn: 10e18,
                amountOutMin: 0,
                zeroForOne: true,
                poolKey: poolKey,
                hookData: Constants.ZERO_BYTES,
                receiver: player2,
                deadline: block.timestamp + 1
            });
            
            uint256 player2Contribution = hook.getContributionByAddress(player2, poolId, currency1);
            hook.player2PostMove(commitmentHash, player2Move, player2Contribution);
            vm.stopPrank();

            uint256 player1Contribution = hook.getContributionByAddress(address(this), poolId, currency1);
            uint256 prizeAmount = player1Contribution + player2Contribution;
            uint256 player1BalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));

            // Player 1 reveals
            hook.player1Reveal(commitmentHash, player1Move, salt);

            // Verify Player 1 won
            uint256 player1BalanceAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
            assertEq(
                player1BalanceAfter - player1BalanceBefore,
                prizeAmount,
                "Player 1 should win in this scenario"
            );
        }
    }
}
