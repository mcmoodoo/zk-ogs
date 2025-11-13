# Possible Solution

## Baseline Commit–Reveal Flow

- `playerA` chooses `moveA`, generates `saltA`, and publishes `commitA = commit(moveA, saltA)` on-chain.
- `playerB` chooses `moveB`, generates `saltB`, and publishes `commitB = commit(moveB, saltB)` on-chain.

## Option 1: Trusted 3rd Party

- Each player sends their `(move, salt)` reveal to an off-chain adjudicator.
- The adjudicator verifies both commitments, determines the winner, and distributes the rewards.
- Downsides: introduces full trust in the third party and breaks the on-chain autonomy we want.

## Option 2: Let Player B Prove the Result (Infeasible)

- `playerA` publishes `commitA` first.
- We ask `playerB` to reveal the outcome without learning `moveA`, e.g., by constructing a proof based on Player A’s ZK proof.
- After research/discussion, this is impossible without leaking Player A’s move unless we bring in heavier primitives such as MPC or co-SNARKs, which exceed the intended scope.

## Option 3: Player A Commits, Player B Responds in Clear

- `playerA` commits to their move (and optionally stakes) up front.
- `playerB` submits `moveB` directly without a commitment phase.
- When resolving, `playerA` reveals `(moveA, saltA)` plus a ZK proof that shows the winner matches both moves. `playerA` is incentivized to complete the reveal because the stake (and the opponent’s) is locked with a timeout limitation.
