import {
  BLACK,
  WHITE,
  HAND_TYPES,
  applyMove,
  colOf,
  findKing,
  generateLegalMoves,
  isInCheck,
  moveKey,
  opponent,
  pieceAttacksSquare,
  positionHash,
  rowOf,
} from './shogi.js';
import { findOpeningMove, strategyMoveBonus } from './opening-book.js';

// This engine is a browser-oriented port of AlphaSho's classical
// heuristicplayer: iterative deepening, negamax alpha-beta, a transposition
// table, material/hand evaluation, and tactical move ordering. Normal and hard
// add progressively more search and evaluation features on top of that base.
const MATE_SCORE = 1_000_000;
const INF = MATE_SCORE + 10_000;
const TIMEOUT_MESSAGE = 'CPU_TIMEOUT';

const PIECE_VALUES = Object.freeze({
  P: 100,
  L: 300,
  N: 320,
  S: 450,
  G: 520,
  B: 800,
  R: 1_000,
  K: 0,
});

const PROMOTED_VALUES = Object.freeze({
  P: 520,
  L: 520,
  N: 520,
  S: 520,
  B: 950,
  R: 1_150,
});

const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    maxDepth: 128,
    maxNodes: 10_000,
    timeLimitMs: 1_200,
    evaluation: 'base',
    quiescenceDepth: 0,
    useOpeningBook: false,
    openingTolerance: 0,
    useHistory: false,
    useKillers: false,
    usePvs: false,
    orderChecks: false,
    aspirationWindow: 0,
  }),
  normal: Object.freeze({
    maxDepth: 8,
    maxNodes: 40_000,
    timeLimitMs: 2_000,
    evaluation: 'positional',
    quiescenceDepth: 4,
    useOpeningBook: true,
    openingTolerance: 180,
    useHistory: true,
    useKillers: false,
    usePvs: false,
    orderChecks: false,
    aspirationWindow: 0,
  }),
  hard: Object.freeze({
    maxDepth: 12,
    maxNodes: 120_000,
    timeLimitMs: 3_500,
    evaluation: 'advanced',
    quiescenceDepth: 7,
    useOpeningBook: true,
    openingTolerance: 90,
    useHistory: true,
    useKillers: true,
    usePvs: true,
    orderChecks: true,
    aspirationWindow: 120,
  }),
});

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function pieceValue(piece) {
  if (!piece) return 0;
  if (piece.promoted && PROMOTED_VALUES[piece.type]) return PROMOTED_VALUES[piece.type];
  return PIECE_VALUES[piece.type] || 0;
}

function difficultyConfig(difficulty, options = {}) {
  const preset = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  return {
    ...preset,
    maxDepth: options.maxDepth ?? preset.maxDepth,
    maxNodes: options.maxNodes ?? options.maxPlayouts ?? preset.maxNodes,
    timeLimitMs: options.timeLimitMs ?? preset.timeLimitMs,
    quiescenceDepth: options.quiescenceDepth ?? preset.quiescenceDepth,
  };
}

function sideSign(player, perspective) {
  return player === perspective ? 1 : -1;
}

function advancementBonus(piece, square) {
  if (piece.type === 'K' || piece.type === 'G' || piece.type === 'B' || piece.type === 'R') return 0;
  const progress = piece.owner === BLACK ? 8 - rowOf(square) : rowOf(square);
  if (piece.type === 'P') return progress * 5;
  if (piece.type === 'L' || piece.type === 'N') return progress * 2;
  return progress * 3;
}

function centralizationBonus(piece, square) {
  if (piece.type === 'K' || piece.type === 'L') return 0;
  const distance = Math.abs(rowOf(square) - 4) + Math.abs(colOf(square) - 4);
  const weight = piece.type === 'R' || piece.type === 'B' ? 4 : 2;
  return Math.max(0, 8 - distance) * weight;
}

function neighboringDefenders(position, player) {
  const king = findKing(position, player);
  if (king < 0) return -100;
  const kingRow = rowOf(king);
  const kingCol = colOf(king);
  let defenders = 0;
  let shield = 0;
  const forward = player === BLACK ? -1 : 1;

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = kingRow + dr;
      const col = kingCol + dc;
      if (row < 0 || row >= 9 || col < 0 || col >= 9) continue;
      const piece = position.board[row * 9 + col];
      if (piece?.owner === player) {
        defenders += 1;
        if (dr === forward && ['P', 'G', 'S'].includes(piece.type)) shield += 1;
      }
    }
  }
  return defenders * 10 + shield * 8;
}

function kingCampBonus(position, player) {
  const king = findKing(position, player);
  if (king < 0) return -MATE_SCORE;
  const row = rowOf(king);
  const col = colOf(king);
  const homeProgress = player === BLACK ? row : 8 - row;
  const sideDistance = Math.abs(col - 4);
  return homeProgress * 3 + sideDistance * 5;
}

function slidingFreedom(position, square, piece) {
  if (!['R', 'B', 'L'].includes(piece.type)) return 0;
  const directions = [];
  if (piece.type === 'R') directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  if (piece.type === 'B') directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  if (piece.type === 'L') directions.push([piece.owner === BLACK ? -1 : 1, 0]);

  let freedom = 0;
  for (const [dr, dc] of directions) {
    let row = rowOf(square) + dr;
    let col = colOf(square) + dc;
    while (row >= 0 && row < 9 && col >= 0 && col < 9) {
      const target = position.board[row * 9 + col];
      if (!target) freedom += 1;
      else {
        if (target.owner !== piece.owner) freedom += 1;
        break;
      }
      row += dr;
      col += dc;
    }
  }
  return freedom * 2;
}

function kingPressure(position, attacker) {
  const defender = opponent(attacker);
  const king = findKing(position, defender);
  if (king < 0) return MATE_SCORE;
  const targets = [king];
  const kingRow = rowOf(king);
  const kingCol = colOf(king);
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const row = kingRow + dr;
      const col = kingCol + dc;
      if (row >= 0 && row < 9 && col >= 0 && col < 9) targets.push(row * 9 + col);
    }
  }

  let pressure = 0;
  for (let from = 0; from < 81; from += 1) {
    const piece = position.board[from];
    if (piece?.owner !== attacker) continue;
    for (const target of targets) {
      if (pieceAttacksSquare(position, from, target)) pressure += target === king ? 8 : 2;
    }
  }
  return pressure;
}

export function evaluatePosition(position, perspective = position.turn, difficulty = 'easy') {
  const config = typeof difficulty === 'string' ? difficultyConfig(difficulty) : difficulty;
  let score = 0;

  for (let square = 0; square < 81; square += 1) {
    const piece = position.board[square];
    if (!piece) continue;
    const sign = sideSign(piece.owner, perspective);
    score += sign * pieceValue(piece);

    if (config.evaluation !== 'base') {
      score += sign * advancementBonus(piece, square);
      score += sign * centralizationBonus(piece, square);
    }
    if (config.evaluation === 'advanced') {
      score += sign * slidingFreedom(position, square, piece);
    }
  }

  for (const player of [BLACK, WHITE]) {
    const sign = sideSign(player, perspective);
    for (const type of HAND_TYPES) {
      score += sign * (position.hands[player][type] || 0) * PIECE_VALUES[type];
    }
  }

  if (config.evaluation !== 'base') {
    score += neighboringDefenders(position, perspective);
    score -= neighboringDefenders(position, opponent(perspective));
    score += kingCampBonus(position, perspective);
    score -= kingCampBonus(position, opponent(perspective));
  }

  if (config.evaluation === 'advanced') {
    score += kingPressure(position, perspective) * 3;
    score -= kingPressure(position, opponent(perspective)) * 3;
  }

  if (isInCheck(position, perspective)) score -= config.evaluation === 'base' ? 35 : 55;
  if (isInCheck(position, opponent(perspective))) score += config.evaluation === 'base' ? 35 : 45;
  return score;
}

function evaluateForTurn(position, config) {
  return evaluatePosition(position, position.turn, config);
}

function isCapture(position, move) {
  return move.kind === 'move' && Boolean(position.board[move.to]);
}

function movePriority(position, move, preferredMoveKey, context, ply, strategy = null) {
  const key = moveKey(move);
  if (key === preferredMoveKey) return 100_000_000;

  let priority = 0;
  if (move.kind === 'move') {
    const moving = position.board[move.from];
    const captured = position.board[move.to];
    if (captured) priority += pieceValue(captured) * 10 - pieceValue(moving);
    if (move.promote) priority += 500;
  } else {
    priority += (PIECE_VALUES[move.pieceType] || 0) / 20;
  }

  if (strategy) priority += strategyMoveBonus(position, move, position.turn, strategy) * 10;
  if (context.config.useKillers && context.killers[ply]?.includes(key)) priority += 30_000;
  if (context.config.useHistory) priority += context.history.get(key) || 0;

  if (context.config.orderChecks) {
    const child = applyMove(position, move);
    if (isInCheck(child, child.turn)) priority += 20_000;
  }
  return priority;
}

function orderMoves(position, moves, preferredMoveKey, context, ply, strategy = null) {
  return moves.slice().sort((a, b) => (
    movePriority(position, b, preferredMoveKey, context, ply, strategy)
      - movePriority(position, a, preferredMoveKey, context, ply, strategy)
  ));
}

function touchNode(context) {
  context.nodes += 1;
  if (context.nodes >= context.nodeLimit || now() >= context.deadline) {
    throw new Error(TIMEOUT_MESSAGE);
  }
}

function terminalScore(position, legalMoves, ply) {
  if (legalMoves.length > 0) return null;
  return isInCheck(position, position.turn) ? -MATE_SCORE + ply : 0;
}

function recordCutoff(context, move, depth, ply) {
  if (context.config.useHistory) {
    const key = moveKey(move);
    context.history.set(key, Math.min(100_000, (context.history.get(key) || 0) + depth * depth));
  }
  if (context.config.useKillers && !isCapture(context.currentPosition, move)) {
    const key = moveKey(move);
    const killers = context.killers[ply] || [];
    context.killers[ply] = [key, ...killers.filter((candidate) => candidate !== key)].slice(0, 2);
  }
}

function quiescence(position, alpha, beta, context, ply, depth) {
  touchNode(context);
  const legalMoves = generateLegalMoves(position, position.turn);
  const terminal = terminalScore(position, legalMoves, ply);
  if (terminal !== null) return terminal;

  const inCheck = isInCheck(position, position.turn);
  const standPat = evaluateForTurn(position, context.config);
  if (depth <= 0) return standPat;

  if (!inCheck) {
    if (standPat >= beta) return standPat;
    alpha = Math.max(alpha, standPat);
  }

  const tacticalMoves = inCheck
    ? legalMoves
    : legalMoves.filter((move) => isCapture(position, move) || (move.kind === 'move' && move.promote));
  if (tacticalMoves.length === 0) return standPat;

  let best = inCheck ? -INF : standPat;
  const ordered = orderMoves(position, tacticalMoves, null, context, ply);
  for (const move of ordered) {
    const score = -quiescence(applyMove(position, move), -beta, -alpha, context, ply + 1, depth - 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function readTable(entry, depth, alpha, beta) {
  if (!entry || entry.depth < depth) return null;
  if (entry.bound === 'exact') return entry.score;
  if (entry.bound === 'lower' && entry.score >= beta) return entry.score;
  if (entry.bound === 'upper' && entry.score <= alpha) return entry.score;
  return null;
}

function negamax(position, depth, alpha, beta, context, ply) {
  touchNode(context);
  const hash = positionHash(position);
  const entry = context.table.get(hash);
  const cached = readTable(entry, depth, alpha, beta);
  if (cached !== null) return cached;

  const legalMoves = generateLegalMoves(position, position.turn);
  const terminal = terminalScore(position, legalMoves, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) {
    return context.config.quiescenceDepth > 0
      ? quiescence(position, alpha, beta, context, ply, context.config.quiescenceDepth)
      : evaluateForTurn(position, context.config);
  }

  const originalAlpha = alpha;
  const originalBeta = beta;
  let best = -INF;
  let bestMoveKey = null;
  const ordered = orderMoves(position, legalMoves, entry?.bestMoveKey || null, context, ply);

  for (let index = 0; index < ordered.length; index += 1) {
    const move = ordered[index];
    const child = applyMove(position, move);
    let score;

    if (context.config.usePvs && index > 0) {
      score = -negamax(child, depth - 1, -alpha - 1, -alpha, context, ply + 1);
      if (score > alpha && score < beta) {
        score = -negamax(child, depth - 1, -beta, -alpha, context, ply + 1);
      }
    } else {
      score = -negamax(child, depth - 1, -beta, -alpha, context, ply + 1);
    }

    if (score > best) {
      best = score;
      bestMoveKey = moveKey(move);
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      context.currentPosition = position;
      recordCutoff(context, move, depth, ply);
      break;
    }
  }

  let bound = 'exact';
  if (best <= originalAlpha) bound = 'upper';
  else if (best >= originalBeta) bound = 'lower';
  context.table.set(hash, { depth, score: best, bound, bestMoveKey });
  return best;
}

function rootSearch(position, depth, alpha, beta, orderedMoves, context, strategy) {
  const rootEntry = context.table.get(positionHash(position));
  const moves = orderMoves(
    position,
    orderedMoves,
    rootEntry?.bestMoveKey || null,
    context,
    0,
    strategy,
  );
  const scored = [];
  let bestScore = -INF;

  for (const move of moves) {
    touchNode(context);
    const score = -negamax(applyMove(position, move), depth - 1, -beta, -alpha, context, 1);
    scored.push({ move, score });
    if (score > bestScore) bestScore = score;
    if (score > alpha) alpha = score;
  }

  scored.sort((a, b) => b.score - a.score);
  context.table.set(positionHash(position), {
    depth,
    score: scored[0]?.score ?? -INF,
    bound: 'exact',
    bestMoveKey: scored[0] ? moveKey(scored[0].move) : null,
  });
  return scored;
}

function searchDepth(position, depth, orderedMoves, context, strategy, previousScore) {
  const window = context.config.aspirationWindow;
  if (!window || previousScore === null || Math.abs(previousScore) >= MATE_SCORE - 256) {
    return rootSearch(position, depth, -INF, INF, orderedMoves, context, strategy);
  }

  const alpha = previousScore - window;
  const beta = previousScore + window;
  const result = rootSearch(position, depth, alpha, beta, orderedMoves, context, strategy);
  const score = result[0]?.score ?? -INF;
  if (score <= alpha || score >= beta) {
    return rootSearch(position, depth, -INF, INF, orderedMoves, context, strategy);
  }
  return result;
}

export async function chooseCpuMove(position, difficulty = 'normal', options = {}) {
  const legalMoves = generateLegalMoves(position, position.turn);
  if (legalMoves.length === 0) return null;

  const config = difficultyConfig(difficulty, options);
  const strategy = config.useOpeningBook ? (options.strategy || null) : null;
  const opening = config.useOpeningBook
    ? findOpeningMove(position, position.turn, strategy, legalMoves)
    : null;
  const context = {
    config,
    deadline: now() + Math.max(1, config.timeLimitMs),
    nodeLimit: Math.max(1, config.maxNodes),
    nodes: 0,
    table: new Map(),
    history: new Map(),
    killers: [],
    currentPosition: position,
  };

  let orderedMoves = orderMoves(
    position,
    legalMoves,
    opening ? moveKey(opening.move) : null,
    context,
    0,
    strategy,
  );
  let lastComplete = orderedMoves.map((move) => ({ move, score: 0 }));
  let previousScore = null;

  for (let depth = 1; depth <= Math.max(1, config.maxDepth); depth += 1) {
    try {
      const current = searchDepth(position, depth, orderedMoves, context, strategy, previousScore);
      if (current.length > 0) {
        lastComplete = current;
        orderedMoves = current.map((entry) => entry.move);
        previousScore = current[0].score;
      }
    } catch (error) {
      if (error?.message !== TIMEOUT_MESSAGE) throw error;
      break;
    }

    if (Math.abs(previousScore ?? 0) >= MATE_SCORE - 256) break;
    await Promise.resolve();
  }

  if (opening) {
    const bestScore = lastComplete[0]?.score ?? -INF;
    const openingKey = moveKey(opening.move);
    const openingEntry = lastComplete.find((entry) => moveKey(entry.move) === openingKey);
    if (openingEntry && openingEntry.score >= bestScore - config.openingTolerance) {
      return openingEntry.move;
    }
  }

  return lastComplete[0]?.move || orderedMoves[0] || legalMoves[0];
}
