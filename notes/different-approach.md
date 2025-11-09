## Player A Circuit

**Inputs**

- `moveA` (private)
- `saltA` (private)
- `commitA` (public)

**Constraints**

- `hash(moveA, saltA) == commitA`

**Outputs**

- `public_proof_commit = PoseidonHash(moveA)`

---

## Player B Circuit

**Inputs**

- `moveB` (private)
- `saltB` (private)
- `commitB` (public)
- `proofA` (public)
- `commitA` (public)

**Constraints**

- `verify_zk_proof(proofA)`
- `hash(moveB, saltB) == commitB`

**Outcome**

- `winner = f(hashA, moveB)` derived from the public hash of `moveA`
