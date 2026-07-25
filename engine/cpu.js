import {
  BLACK,
  WHITE,
  HAND_TYPES,
  applyMove,
  generateLegalMoves,
  isInCheck,
  moveKey,
  opponent,
  positionHash,
  rowOf,
} from './shogi.js';
import { findOpeningMove, strategyMoveBonus } from './opening-book.js';

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
const MATE_SCORE = 100000;
const TIMEOUT_MESSAGE = 'CPU_TIMEOUT';

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

function kingSafety(position, player) {
  const king = position.board.findIndex((piece) => piece?.owner === player && piece.type === 'K');
  if (king < 0) return -MATE_SCORE;

  const row = Math.floor(king / 9);
  const col = king % 9;
  let defenders = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= 9 || nextCol < 0 || nextCol >= 9) continue;
      if (position.board[nextRow * 9 + nextCol]?.owner === player) defenders += 1;
    }
  }
  return defenders * 8;
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

  score += kingSafety(position, perspective);
  score -= kingSafety(position, opponent(perspective));
  if (isInCheck(position, opponent(perspective))) score += 45;
  if (isInCheck(position, perspective)) score -= 55;
  return score;
}

function terminalScore(position, perspective, legalMoves, ply) {
  if (legalMoves.length > 0) return null;
  if (!isInCheck(position, position.turn)) return 0;
  return position.turn === perspective ? -MATE_SCORE + ply : MATE_SCORE - ply;
}

function isCapture(position, move) {
  return move.kind === 'move' && Boolean(position.board[move.to]);
}

function tacticalScore(position, move, preferredMoveKey = null) {
  if (preferredMoveKey && moveKey(move) === preferredMoveKey) return 1_000_000;
  if (move.kind === 'drop') return VALUES[move.pieceType] * 0.02;
  const captured = position.board[move.to];
  const moving = position.board[move.from];
  let score = captured ? pieceValue(captured) * 10 - pieceValue(moving) : 0;
  if (move.promote) score += (PROMOTION_BONUS[moving.type] || 80) * 3;
  return score;
}

function orderMoves(position, moves, preferredMoveKey = null) {
  return moves.slice().sort((a, b) => (
    tacticalScore(position, b, preferredMoveKey) - tacticalScore(position, a, preferredMoveKey)
  ));
}

function assertWithinDeadline(deadline) {
  if (now() >= deadline) throw new Error(TIMEOUT_MESSAGE);
}

function quiescence(position, alpha, beta, perspective, deadline, ply, remainingDepth) {
  assertWithinDeadline(deadline);

  const legalMoves = generateLegalMoves(position, position.turn);
  const terminal = terminalScore(position, perspective, legalMoves, ply);
  if (terminal !== null) return terminal;

  const maximizing = position.turn === perspective;
  const inCheck = isInCheck(position, position.turn);
  const standPat = evaluatePosition(position, perspective);

  if (remainingDepth <= 0) return standPat;

  if (maximizing) {
    if (!inCheck) {
      if (standPat >= beta) return standPat;
      alpha = Math.max(alpha, standPat);
    }

    let value = inCheck ? -Infinity : standPat;
    const tacticalMoves = inCheck
      ? legalMoves
      : legalMoves.filter((move) => isCapture(position, move) || move.promote);

    for (const move of orderMoves(position, tacticalMoves)) {
      value = Math.max(value, quiescence(
        applyMove(position, move), alpha, beta, perspective, deadline, ply + 1, remainingDepth - 1,
      ));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  if (!inCheck) {
    if (standPat <= alpha) return standPat;
    beta = Math.min(beta, standPat);
  }

  let value = inCheck ? Infinity : standPat;
  const tacticalMoves = inCheck
    ? legalMoves
    : legalMoves.filter((move) => isCapture(position, move) || move.promote);

  for (const move of orderMoves(position, tacticalMoves)) {
    value = Math.min(value, quiescence(
      applyMove(position, move), alpha, beta, perspective, deadline, ply + 1, remainingDepth - 1,
    ));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function readTransposition(table, key, depth, alpha, beta) {
  const entry = table.get(key);
  if (!entry || entry.depth < depth) return null;
  if (entry.flag === 'exact') return entry.score;
  if (entry.flag === 'lower' && entry.score >= beta) return entry.score;
  if (entry.flag === 'upper' && entry.score <= alpha) return entry.score;
  return null;
}

function minimax(position, depth, alpha, beta, perspective, context, ply) {
  assertWithinDeadline(context.deadline);

  const hash = positionHash(position);
  const cached = readTransposition(context.table, hash, depth, alpha, beta);
  if (cached !== null) return cached;

  const cachedEntry = context.table.get(hash);
  const moves = orderMoves(
    position,
    generateLegalMoves(position, position.turn),
    cachedEntry?.bestMoveKey || null,
  );
  const terminal = terminalScore(position, perspective, moves, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) {
    return context.useQuiescence
      ? quiescence(position, alpha, beta, perspective, context.deadline, ply, context.quiescenceDepth)
      : evaluatePosition(position, perspective);
  }

  const originalAlpha = alpha;
  const originalBeta = beta;
  const maximizing = position.turn === perspective;
  let value = maximizing ? -Infinity : Infinity;
  let bestMoveKey = null;

  for (const move of moves) {
    const childScore = minimax(
      applyMove(position, move), depth - 1, alpha, beta, perspective, context, ply + 1,
    );
    if ((maximizing && childScore > value) || (!maximizing && childScore < value)) {
      value = childScore;
      bestMoveKey = moveKey(move);
    }
    if (maximizing) alpha = Math.max(alpha, value);
    else beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }

  let flag = 'exact';
  if (value <= originalAlpha) flag = 'upper';
  else if (value >= originalBeta) flag = 'lower';
  context.table.set(hash, { depth, score: value, flag, bestMoveKey });
  return value;
}

function scoreRootMove(position, move, depth, player, context) {
  const child = applyMove(position, move);
  if (depth <= 1) {
    return context.useQuiescence
      ? quiescence(child, -Infinity, Infinity, player, context.deadline, 1, context.quiescenceDepth)
      : evaluatePosition(child, player);
  }
  return minimax(child, depth - 1, -Infinity, Infinity, player, context, 1);
}

function difficultyConfig(difficulty, options) {
  if (difficulty === 'easy') {
    return {
      maxDepth: options.maxDepth ?? 5,
      timeLimitMs: options.timeLimitMs ?? 1200,
      useQuiescence: true,
      quiescenceDepth: options.quiescenceDepth ?? 4,
      openingTolerance: 320,
    };
  }
  if (difficulty === 'hard') {
    return {
      maxDepth: options.maxDepth ?? 7,
      timeLimitMs: options.timeLimitMs ?? 3500,
      useQuiescence: true,
      quiescenceDepth: options.quiescenceDepth ?? 6,
      openingTolerance: 100,
    };
  }
  return {
    maxDepth: options.maxDepth ?? 6,
    timeLimitMs: options.timeLimitMs ?? 2000,
    useQuiescence: true,
    quiescenceDepth: options.quiescenceDepth ?? 5,
    openingTolerance: 180,
  };
}

export async function chooseCpuMove(position, difficulty = 'normal', options = {}) {
  const legalMoves = generateLegalMoves(position, position.turn);
  if (legalMoves.length === 0) return null;

  const config = difficultyConfig(difficulty, options);
  const strategy = options.strategy || null;
  const opening = findOpeningMove(position, position.turn, strategy, legalMoves);
  const context = {
    deadline: now() + config.timeLimitMs,
    table: new Map(),
    useQuiescence: config.useQuiescence,
    quiescenceDepth: config.quiescenceDepth,
  };

  let ordered = orderMoves(position, legalMoves, opening ? moveKey(opening.move) : null);
  let lastComplete = ordered.map((move) => ({
    move,
    score: tacticalScore(position, move),
    adjustedScore: tacticalScore(position, move) + strategyMoveBonus(position, move, position.turn, strategy),
  }));

  for (let depth = 1; depth <= config.maxDepth; depth += 1) {
    const current = [];
    try {
      for (const move of ordered) {
        const score = scoreRootMove(position, move, depth, position.turn, context);
        current.push({
          move,
          score,
          adjustedScore: score + strategyMoveBonus(position, move, position.turn, strategy),
        });
      }
      current.sort((a, b) => b.adjustedScore - a.adjustedScore);
      lastComplete = current;
      ordered = current.map((entry) => entry.move);
    } catch (error) {
      if (error.message !== TIMEOUT_MESSAGE) throw error;
      break;
    }
    await Promise.resolve();
  }

  const bestRawScore = Math.max(...lastComplete.map((entry) => entry.score));
  if (opening) {
    const openingKey = moveKey(opening.move);
    const openingEntry = lastComplete.find((entry) => moveKey(entry.move) === openingKey);
    if (openingEntry && openingEntry.score >= bestRawScore - config.openingTolerance) {
      return openingEntry.move;
    }
  }

  return lastComplete[0]?.move || ordered[0] || null;
}
