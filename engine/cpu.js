import {
  BLACK,
  WHITE,
  HAND_TYPES,
  applyMove,
  generateLegalMoves,
  isInCheck,
  opponent,
  rowOf,
} from './shogi.js';

const VALUES = Object.freeze({
  P: 100,
  L: 300,
  N: 320,
  S: 430,
  G: 520,
  B: 750,
  R: 900,
  K: 50000,
});

const PROMOTION_BONUS = Object.freeze({ P: 420, L: 230, N: 210, S: 100, B: 180, R: 220 });

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function pieceValue(piece) {
  return VALUES[piece.type] + (piece.promoted ? (PROMOTION_BONUS[piece.type] || 0) : 0);
}

function advancement(piece, row) {
  if (piece.type === 'K' || piece.type === 'G' || piece.type === 'R' || piece.type === 'B') return 0;
  const progress = piece.owner === BLACK ? 8 - row : row;
  return progress * (piece.type === 'P' ? 5 : 2);
}

export function evaluatePosition(position, perspective) {
  let score = 0;
  for (let index = 0; index < 81; index += 1) {
    const piece = position.board[index];
    if (!piece) continue;
    const sign = piece.owner === perspective ? 1 : -1;
    score += sign * (pieceValue(piece) + advancement(piece, rowOf(index)));
  }

  for (const player of [BLACK, WHITE]) {
    const sign = player === perspective ? 1 : -1;
    for (const type of HAND_TYPES) {
      score += sign * (position.hands[player][type] || 0) * VALUES[type] * 0.92;
    }
  }

  if (isInCheck(position, opponent(perspective))) score += 45;
  if (isInCheck(position, perspective)) score -= 55;
  return score;
}

function terminalScore(position, perspective, legalMoves, ply) {
  if (legalMoves.length > 0) return null;
  if (!isInCheck(position, position.turn)) return 0;
  return position.turn === perspective ? -100000 + ply : 100000 - ply;
}

function tacticalScore(position, move) {
  if (move.kind === 'drop') return VALUES[move.pieceType] * 0.02;
  const captured = position.board[move.to];
  const moving = position.board[move.from];
  let score = captured ? pieceValue(captured) * 10 - pieceValue(moving) : 0;
  if (move.promote) score += (PROMOTION_BONUS[moving.type] || 80) * 3;
  return score;
}

function orderMoves(position, moves) {
  return moves.slice().sort((a, b) => tacticalScore(position, b) - tacticalScore(position, a));
}

function minimax(position, depth, alpha, beta, perspective, deadline, ply) {
  if (now() >= deadline) throw new Error('CPU_TIMEOUT');

  const moves = orderMoves(position, generateLegalMoves(position, position.turn));
  const terminal = terminalScore(position, perspective, moves, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return evaluatePosition(position, perspective);

  if (position.turn === perspective) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, minimax(applyMove(position, move), depth - 1, alpha, beta, perspective, deadline, ply + 1));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, minimax(applyMove(position, move), depth - 1, alpha, beta, perspective, deadline, ply + 1));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function scoreRootMove(position, move, depth, player, deadline) {
  const child = applyMove(position, move);
  if (depth <= 1) return evaluatePosition(child, player);
  return minimax(child, depth - 1, -Infinity, Infinity, player, deadline, 1);
}

function weightedRandom(scored, spread = 80) {
  const best = scored[0]?.score ?? 0;
  const candidates = scored.filter((entry) => entry.score >= best - spread);
  return candidates[Math.floor(Math.random() * candidates.length)]?.move || scored[0]?.move || null;
}

export async function chooseCpuMove(position, difficulty = 'normal', options = {}) {
  const legalMoves = generateLegalMoves(position, position.turn);
  if (legalMoves.length === 0) return null;
  if (difficulty === 'easy') return legalMoves[Math.floor(Math.random() * legalMoves.length)];

  const timeLimitMs = options.timeLimitMs ?? (difficulty === 'hard' ? 700 : 180);
  const deadline = now() + timeLimitMs;
  const ordered = orderMoves(position, legalMoves);
  let lastComplete = ordered.map((move) => ({ move, score: tacticalScore(position, move) }));

  const maxDepth = difficulty === 'hard' ? 3 : 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const current = [];
    try {
      for (const move of ordered) {
        current.push({ move, score: scoreRootMove(position, move, depth, position.turn, deadline) });
      }
      current.sort((a, b) => b.score - a.score);
      lastComplete = current;
    } catch (error) {
      if (error.message !== 'CPU_TIMEOUT') throw error;
      break;
    }
    await Promise.resolve();
  }

  return difficulty === 'normal' ? weightedRandom(lastComplete, 45) : lastComplete[0]?.move || ordered[0];
}
