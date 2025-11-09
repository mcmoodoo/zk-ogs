// Local storage utilities for storing game commitments

const STORAGE_PREFIX = 'rps_game_';

export interface GameCommitment {
  commitmentHash: string;
  move: number;
  salt: string;
  timestamp: number;
}

export function saveCommitment(commitmentHash: string, move: number, salt: string): void {
  const commitment: GameCommitment = {
    commitmentHash,
    move,
    salt,
    timestamp: Date.now(),
  };
  localStorage.setItem(`${STORAGE_PREFIX}${commitmentHash}`, JSON.stringify(commitment));
}

export function getCommitment(commitmentHash: string): GameCommitment | null {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${commitmentHash}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function getAllCommitments(): GameCommitment[] {
  const commitments: GameCommitment[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      try {
        const commitment = JSON.parse(localStorage.getItem(key) || '{}');
        commitments.push(commitment);
      } catch {
        // Skip invalid entries
      }
    }
  }
  return commitments.sort((a, b) => b.timestamp - a.timestamp);
}

export function removeCommitment(commitmentHash: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${commitmentHash}`);
}
