// Rock = 0, Paper = 1, Scissors = 2
// Winner: 0 = tie, 1 = player1, 2 = player2

fn determine_winner(move1: Field, move2: Field) -> Field {
    // Rock = 0, Paper = 1, Scissors = 2
    
    // Check for tie first
    if (move1 == move2) {
        0
    } else {
        // Player 1 wins cases:
        // Rock (0) beats Scissors (2)
        if (move1 == 0) {
            if (move2 == 2) {
                1
            } else {
                2  // move2 must be 1 (paper beats rock)
            }
        } else {
            // Paper (1) beats Rock (0)
            if (move1 == 1) {
                if (move2 == 0) {
                    1
                } else {
                    2  // move2 must be 2 (scissors beats paper)
                }
            } else {
                // move1 must be 2 (Scissors)
                // Scissors (2) beats Paper (1)
                if (move2 == 1) {
                    1
                } else {
                    2  // move2 must be 0 (rock beats scissors)
                }
            }
        }
    }
}

fn main(
    // Player moves (0=rock, 1=paper, 2=scissors)
    player1_move: Field,
    player2_move: Field,
    
    // Public output - winner determined by circuit
    winner: pub Field
) {
    // Validate moves are in range (0, 1, or 2)
    // Noir doesn't support || in assert, so we use nested if-else
    if (player1_move == 0) {
        // Valid move 0
    } else {
        if (player1_move == 1) {
            // Valid move 1
        } else {
            assert(player1_move == 2); // Must be 2
        }
    }
    
    if (player2_move == 0) {
        // Valid move 0
    } else {
        if (player2_move == 1) {
            // Valid move 1
        } else {
            assert(player2_move == 2); // Must be 2
        }
    }
    
    // Determine winner (matches contract's _determineWinner logic)
    let computed_winner = determine_winner(player1_move, player2_move);
    
    // Output the winner
    assert(winner == computed_winner);
}

#[test]
fn test_rock_beats_scissors() {
    main(0, 2, 1); // Player 1 (Rock) beats Player 2 (Scissors)
}

#[test]
fn test_paper_beats_rock() {
    main(1, 0, 1); // Player 1 (Paper) beats Player 2 (Rock)
}

#[test]
fn test_scissors_beats_paper() {
    main(2, 1, 1); // Player 1 (Scissors) beats Player 2 (Paper)
}

#[test]
fn test_tie() {
    main(0, 0, 0); // Both Rock - tie
}

#[test]
fn test_player2_wins() {
    main(0, 1, 2); // Player 1 (Rock) loses to Player 2 (Paper)
}
