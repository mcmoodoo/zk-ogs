// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RockPaperScissors} from "./RockPaperScissors.sol";
import {Test} from "forge-std/Test.sol";

contract RockPaperScissorsTest is Test {
    RockPaperScissors public game;
    address public player1;
    address public player2;

    function setUp() public {
        game = new RockPaperScissors();
        player1 = address(0x1);
        player2 = address(0x2);
    }

    function test_CreateGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(gameData.gameId == gameId, "Game ID mismatch");
        require(gameData.player1 == player1, "Player1 mismatch");
        require(
            uint8(gameData.status) == 0,
            "Status should be WaitingForPlayer"
        );
    }

    function test_JoinGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(uint8(gameData.status) == 1, "Status should be Committed");
        require(gameData.player2 == player2, "Player2 mismatch");
    }

    function test_CommitMoves() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        // Player 1 commits rock (0)
        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(0), p1Salt));

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        // Player 2 commits paper (1)
        bytes32 p2Salt = keccak256("salt2");
        bytes32 p2Commitment = keccak256(abi.encodePacked(uint8(1), p2Salt));

        vm.prank(player2);
        game.commitMove(gameId, p2Commitment);

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(
            gameData.player1Commitment != bytes32(0),
            "Player1 commitment should be set"
        );
        require(
            gameData.player2Commitment != bytes32(0),
            "Player2 commitment should be set"
        );
    }

    function test_RevealMoves() public {
        // Setup game
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        // Commit moves
        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(0), p1Salt)); // Rock

        bytes32 p2Salt = keccak256("salt2");
        bytes32 p2Commitment = keccak256(abi.encodePacked(uint8(2), p2Salt)); // Scissors

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        vm.prank(player2);
        game.commitMove(gameId, p2Commitment);

        // Reveal moves
        vm.prank(player1);
        game.revealMove(gameId, 0, p1Salt, "");

        vm.prank(player2);
        game.revealMove(gameId, 2, p2Salt, "");

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(uint8(gameData.status) == 3, "Status should be Completed");
        require(gameData.player1Move == 0, "Player1 move should be Rock (0)");
        require(
            gameData.player2Move == 2,
            "Player2 move should be Scissors (2)"
        );
        require(
            gameData.winner == 1,
            "Player1 should win (Rock beats Scissors)"
        );
    }

    function test_RockBeatsScissors() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(0), p1Salt)); // Rock

        bytes32 p2Salt = keccak256("salt2");
        bytes32 p2Commitment = keccak256(abi.encodePacked(uint8(2), p2Salt)); // Scissors

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        vm.prank(player2);
        game.commitMove(gameId, p2Commitment);

        vm.prank(player1);
        game.revealMove(gameId, 0, p1Salt, "");

        vm.prank(player2);
        game.revealMove(gameId, 2, p2Salt, "");

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(
            gameData.winner == 1,
            "Rock should beat Scissors (Player1 wins)"
        );
    }

    function test_PaperBeatsRock() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(1), p1Salt)); // Paper

        bytes32 p2Salt = keccak256("salt2");
        bytes32 p2Commitment = keccak256(abi.encodePacked(uint8(0), p2Salt)); // Rock

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        vm.prank(player2);
        game.commitMove(gameId, p2Commitment);

        vm.prank(player1);
        game.revealMove(gameId, 1, p1Salt, "");

        vm.prank(player2);
        game.revealMove(gameId, 0, p2Salt, "");

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(gameData.winner == 1, "Paper should beat Rock (Player1 wins)");
    }

    function test_Tie() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(0), p1Salt)); // Rock

        bytes32 p2Salt = keccak256("salt2");
        bytes32 p2Commitment = keccak256(abi.encodePacked(uint8(0), p2Salt)); // Rock

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        vm.prank(player2);
        game.commitMove(gameId, p2Commitment);

        vm.prank(player1);
        game.revealMove(gameId, 0, p1Salt, "");

        vm.prank(player2);
        game.revealMove(gameId, 0, p2Salt, "");

        RockPaperScissors.Game memory gameData = game.getGame(gameId);
        require(gameData.winner == 0, "Should be a tie");
    }

    function test_RevealWithWrongSalt() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();

        vm.prank(player2);
        game.joinGame(gameId);

        bytes32 p1Salt = keccak256("salt1");
        bytes32 p1Commitment = keccak256(abi.encodePacked(uint8(0), p1Salt));

        vm.prank(player1);
        game.commitMove(gameId, p1Commitment);

        // Try to reveal with wrong salt
        vm.prank(player1);
        vm.expectRevert();
        game.revealMove(gameId, 0, keccak256("wrong_salt"), "");
    }
}
