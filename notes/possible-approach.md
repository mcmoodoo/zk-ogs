# Possible Solution

## Baseline Commit–Reveal Flow

- `playerA` chooses `moveA`, generates `saltA`, and publishes `commitA = commit(moveA, saltA)` on-chain.
- `playerB` chooses `moveB`, generates `saltB`, and publishes `commitB = commit(moveB, saltB)` on-chain.

## Option 1: Trusted 3rd Party

- Both players send their `(move, salt)` reveals to an off-chain 3rd party
- The 3rd party verifies the commitments, determines the winner, and distribute the rewards.

## Option 2: playerB prove he wins the game

- A made the moveA first
- Require `playerB` (the second mover) to escrow the stake and submit a zk-proof attesting to:
  - their committed move `moveB`
  - knowledge of `saltB`
  - that `moveB` defeats `moveA` once `moveA` is published by `playerA`
- Upon verification of the proof, the contract releases rewards to `playerB`.

<!--
but in this solutions, B can use his `moveB` keep trying different moveA until he can prove he is the winner

or let him only have one chance to try
-->