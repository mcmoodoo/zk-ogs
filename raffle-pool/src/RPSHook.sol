// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {SenderRelayLibrary} from "./router/SenderRelayLibrary.sol";

/// @title RPSHook
/// @notice Uniswap V4 hook implementing Rock Paper Scissors game with commit-reveal scheme
/// @dev Players commit moves via swaps, play RPS, and winner takes the raffle pool
contract RPSHook is BaseHook, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;
    using SafeCast for int128;

    uint256 public constant RAFFLE_CONTRIBUTION_BIPS = 500; // 5%
    uint256 public constant BIPS_DENOMINATOR = 10000;
    uint256 public constant REFUND_TIMEOUT = 60; // 1 minute
    uint256 public constant REVEAL_TIMEOUT = 60; // 1 minute

    uint8 public constant ROCK = 0;
    uint8 public constant PAPER = 1;
    uint8 public constant SCISSORS = 2;

    mapping(PoolId => mapping(Currency => uint256)) public rafflePoolLedger;
    mapping(address => mapping(PoolId => mapping(Currency => uint256))) public contributionsByAddress;

    struct PendingSwap {
        address player1;
        uint256 timestamp;
        PoolId poolId;
        Currency currency;
        uint256 player1Contribution;
        bool player2Moved;
        address player2;
        uint8 player2Move;
        uint256 player2Contribution;
        uint256 player2MoveTimestamp;
        bool revealed;
        uint8 player1Move;
        bytes32 salt;
        bool resolved;
    }

    mapping(bytes32 => PendingSwap) public pendingSwaps;
    mapping(bytes32 => bool) public usedCommitments;

    event RaffleContribution(
        PoolId indexed poolId,
        address indexed contributor,
        Currency indexed currency,
        uint256 amount
    );

    event SwapRefunded(
        bytes32 indexed commitmentHash,
        address indexed player1,
        PoolId indexed poolId,
        Currency currency,
        uint256 refundAmount
    );

    event Player2Moved(
        bytes32 indexed commitmentHash,
        address indexed player2,
        uint8 move,
        uint256 contributionAmount
    );

    event Player1Revealed(
        bytes32 indexed commitmentHash,
        uint8 player1Move,
        uint8 player2Move,
        address indexed winner
    );

    event GameResolved(
        bytes32 indexed commitmentHash,
        address indexed winner,
        uint256 prizeAmount
    );

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        PoolId id = key.toId();
        (address originalSender, bytes32 commitmentHash,) = SenderRelayLibrary.decodeSenderAndCommitment(hookData);

        bool specifiedTokenIs0 = ((params.amountSpecified < 0) == params.zeroForOne);
        int128 outputAmount = specifiedTokenIs0 ? delta.amount1() : delta.amount0();
        if (outputAmount < 0) outputAmount = -outputAmount;

        if (outputAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        uint256 contributionAmount = (uint256(uint128(outputAmount)) * RAFFLE_CONTRIBUTION_BIPS) / BIPS_DENOMINATOR;
        if (contributionAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        Currency raffleCurrency = specifiedTokenIs0 ? key.currency1 : key.currency0;
        address contributor = originalSender != address(0) ? originalSender : sender;

        return _processContribution(id, raffleCurrency, contributionAmount, contributor, commitmentHash, sender);
    }

    function _processContribution(
        PoolId poolId,
        Currency currency,
        uint256 contributionAmount,
        address contributor,
        bytes32 commitmentHash,
        address fallbackSender
    ) internal returns (bytes4, int128) {
        poolManager.mint(address(this), currency.toId(), contributionAmount);
        rafflePoolLedger[poolId][currency] += contributionAmount;
        contributionsByAddress[contributor][poolId][currency] += contributionAmount;

        emit RaffleContribution(poolId, contributor, currency, contributionAmount);

        if (commitmentHash != bytes32(0) && !usedCommitments[commitmentHash]) {
            address player1 = contributor != address(0) ? contributor : fallbackSender;
            pendingSwaps[commitmentHash] = PendingSwap({
                player1: player1,
                timestamp: block.timestamp,
                poolId: poolId,
                currency: currency,
                player1Contribution: contributionAmount,
                player2Moved: false,
                player2: address(0),
                player2Move: 0,
                player2Contribution: 0,
                player2MoveTimestamp: 0,
                revealed: false,
                player1Move: 0,
                salt: bytes32(0),
                resolved: false
            });
            usedCommitments[commitmentHash] = true;
        }

        return (BaseHook.afterSwap.selector, contributionAmount.toInt128());
    }

    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        return BaseHook.beforeRemoveLiquidity.selector;
    }

    function getRafflePoolBalance(PoolId poolId, Currency currency) external view returns (uint256) {
        return rafflePoolLedger[poolId][currency];
    }

    function getContributionByAddress(address account, PoolId poolId, Currency currency)
        external
        view
        returns (uint256)
    {
        return contributionsByAddress[account][poolId][currency];
    }

    function refundPlayer1Swap(bytes32 commitmentHash) external {
        PendingSwap memory swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");
        require(!swap.player2Moved, "Player 2 already moved");
        require(block.timestamp >= swap.timestamp + REFUND_TIMEOUT, "Timeout not reached");
        require(
            poolManager.balanceOf(address(this), swap.currency.toId()) >= swap.player1Contribution,
            "Insufficient claim balance"
        );
        require(
            rafflePoolLedger[swap.poolId][swap.currency] >= swap.player1Contribution,
            "Insufficient pool balance"
        );

        poolManager.unlock(abi.encode(commitmentHash));
    }

    function player2PostMove(
        bytes32 commitmentHash,
        uint8 player2Move,
        uint256 player2ContributionAmount
    ) external {
        PendingSwap storage swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");
        require(!swap.player2Moved, "Player 2 already moved");
        require(player2Move <= SCISSORS, "Invalid move");
        require(player2ContributionAmount > 0, "Player 2 must have contributed");
        require(
            contributionsByAddress[msg.sender][swap.poolId][swap.currency] >= player2ContributionAmount,
            "Insufficient contribution from Player 2"
        );

        swap.player2Moved = true;
        swap.player2 = msg.sender;
        swap.player2Move = player2Move;
        swap.player2Contribution = player2ContributionAmount;
        swap.player2MoveTimestamp = block.timestamp;

        emit Player2Moved(commitmentHash, msg.sender, player2Move, player2ContributionAmount);
    }

    function player1Reveal(
        bytes32 commitmentHash,
        uint8 player1Move,
        bytes32 salt
    ) external {
        PendingSwap storage swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");
        require(msg.sender == swap.player1, "Only Player 1 can reveal");
        require(swap.player2Moved, "Player 2 must move first");
        require(!swap.revealed, "Already revealed");
        require(player1Move <= SCISSORS, "Invalid move");
        require(keccak256(abi.encodePacked(player1Move, salt)) == commitmentHash, "Invalid commitment");

        swap.revealed = true;
        swap.player1Move = player1Move;
        swap.salt = salt;
        swap.resolved = true;

        address winner = _determineWinner(player1Move, swap.player2Move, swap.player1, swap.player2);
        uint256 prizeAmount = swap.player1Contribution + swap.player2Contribution;

        emit Player1Revealed(commitmentHash, player1Move, swap.player2Move, winner);
        emit GameResolved(commitmentHash, winner, prizeAmount);

        _distributePrize(
            commitmentHash,
            swap.poolId,
            swap.currency,
            winner,
            prizeAmount,
            swap.player1,
            swap.player2,
            swap.player1Contribution,
            swap.player2Contribution
        );
    }

    function _determineWinner(
        uint8 move1,
        uint8 move2,
        address player1,
        address player2
    ) internal pure returns (address winner) {
        if (move1 == move2) {
            return address(0); // Tie
        }
        if ((move1 == ROCK && move2 == SCISSORS) ||
            (move1 == PAPER && move2 == ROCK) ||
            (move1 == SCISSORS && move2 == PAPER)) {
            return player1;
        }
        return player2;
    }

    function _distributePrize(
        bytes32 commitmentHash,
        PoolId poolId,
        Currency currency,
        address winner,
        uint256 prizeAmount,
        address player1,
        address player2,
        uint256 player1Amount,
        uint256 player2Amount
    ) internal {
        require(
            poolManager.balanceOf(address(this), currency.toId()) >= prizeAmount,
            "Insufficient claim balance"
        );
        require(
            rafflePoolLedger[poolId][currency] >= prizeAmount,
            "Insufficient pool balance"
        );

        poolManager.unlock(abi.encode(commitmentHash, winner, player1, player2, prizeAmount, player1Amount, player2Amount));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only pool manager");

        if (data.length == 32) {
            return _handleRefundCallback(abi.decode(data, (bytes32)));
        } else {
            (bytes32 commitmentHash, address winner, address player1, address player2, uint256 prizeAmount, uint256 player1Amount, uint256 player2Amount) =
                abi.decode(data, (bytes32, address, address, address, uint256, uint256, uint256));
            return _handlePrizeCallback(commitmentHash, winner, player1, player2, prizeAmount, player1Amount, player2Amount);
        }
    }

    function _handleRefundCallback(bytes32 commitmentHash) internal returns (bytes memory) {
        PendingSwap memory swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");

        poolManager.burn(address(this), swap.currency.toId(), swap.player1Contribution);
        poolManager.take(swap.currency, swap.player1, swap.player1Contribution);
        rafflePoolLedger[swap.poolId][swap.currency] -= swap.player1Contribution;
        contributionsByAddress[swap.player1][swap.poolId][swap.currency] -= swap.player1Contribution;

        delete pendingSwaps[commitmentHash];

        emit SwapRefunded(
            commitmentHash,
            swap.player1,
            swap.poolId,
            swap.currency,
            swap.player1Contribution
        );

        return "";
    }

    function _handlePrizeCallback(
        bytes32 commitmentHash,
        address winner,
        address player1,
        address player2,
        uint256 prizeAmount,
        uint256 player1Amount,
        uint256 player2Amount
    ) internal returns (bytes memory) {
        PendingSwap memory swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");

        Currency currency = swap.currency;
        PoolId poolId = swap.poolId;

        poolManager.burn(address(this), currency.toId(), prizeAmount);

        if (winner == address(0)) {
            poolManager.take(currency, player1, player1Amount);
            poolManager.take(currency, player2, player2Amount);
        } else {
            poolManager.take(currency, winner, prizeAmount);
        }

        rafflePoolLedger[poolId][currency] -= prizeAmount;
        contributionsByAddress[player1][poolId][currency] -= player1Amount;
        contributionsByAddress[player2][poolId][currency] -= player2Amount;

        delete pendingSwaps[commitmentHash];

        return "";
    }

    function canRefundSwap(bytes32 commitmentHash)
        external
        view
        returns (bool canRefund, uint256 timeRemaining)
    {
        PendingSwap memory swap = pendingSwaps[commitmentHash];
        if (swap.player1 == address(0) || swap.player2Moved) {
            return (false, 0);
        }
        uint256 elapsed = block.timestamp - swap.timestamp;
        if (elapsed >= REFUND_TIMEOUT) {
            return (true, 0);
        }
        return (false, REFUND_TIMEOUT - elapsed);
    }

    function claimPrizeAfterRevealTimeout(bytes32 commitmentHash) external {
        PendingSwap memory swap = pendingSwaps[commitmentHash];
        require(swap.player1 != address(0), "Swap not found");
        require(swap.player2Moved, "Player 2 must move first");
        require(!swap.revealed, "Player 1 already revealed");
        require(!swap.resolved, "Game already resolved");
        require(
            block.timestamp >= swap.player2MoveTimestamp + REVEAL_TIMEOUT,
            "Reveal timeout not reached"
        );

        uint256 prizeAmount = swap.player1Contribution + swap.player2Contribution;
        pendingSwaps[commitmentHash].resolved = true;

        emit GameResolved(commitmentHash, swap.player2, prizeAmount);

        _distributePrize(
            commitmentHash,
            swap.poolId,
            swap.currency,
            swap.player2,
            prizeAmount,
            swap.player1,
            swap.player2,
            swap.player1Contribution,
            swap.player2Contribution
        );
    }

    function getPendingSwap(bytes32 commitmentHash)
        external
        view
        returns (PendingSwap memory)
    {
        return pendingSwaps[commitmentHash];
    }
}
