import { type ClassValue, clsx } from 'clsx';
import { keccak256, toBytes, hexToBytes } from 'viem';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatAmount(amount: bigint, decimals: number = 18, precision: number = 4): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, precision);
  return `${whole.toString()}.${fractionStr}`;
}

export function parseAmount(value: string, decimals: number = 18): bigint {
  const [whole, fraction = ''] = value.split('.');
  const fractionPadded = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fractionPadded || '0');
}

// Generate commitment hash: keccak256(move, salt)
export function generateCommitmentHash(move: number, salt: `0x${string}`): `0x${string}` {
  const moveBytes = toBytes(move);
  const saltBytes = hexToBytes(salt);
  const combined = new Uint8Array(moveBytes.length + saltBytes.length);
  combined.set(moveBytes, 0);
  combined.set(saltBytes, moveBytes.length);
  return keccak256(combined);
}

// Generate random salt
export function generateSalt(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

export const RPS_MOVES = {
  ROCK: 0,
  PAPER: 1,
  SCISSORS: 2,
} as const;

export const MOVE_NAMES = ['Rock', 'Paper', 'Scissors'] as const;
export const MOVE_EMOJIS = ['🪨', '📄', '✂️'] as const;

export function getMoveName(move: number): string {
  return MOVE_NAMES[move] || 'Unknown';
}

export function getMoveEmoji(move: number): string {
  return MOVE_EMOJIS[move] || '❓';
}

export function determineWinner(move1: number, move2: number): 'player1' | 'player2' | 'tie' {
  if (move1 === move2) return 'tie';
  if (
    (move1 === RPS_MOVES.ROCK && move2 === RPS_MOVES.SCISSORS) ||
    (move1 === RPS_MOVES.PAPER && move2 === RPS_MOVES.ROCK) ||
    (move1 === RPS_MOVES.SCISSORS && move2 === RPS_MOVES.PAPER)
  ) {
    return 'player1';
  }
  return 'player2';
}
