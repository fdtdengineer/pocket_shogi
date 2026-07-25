import { BLACK, WHITE, moveKey } from './shogi.js';

export const AUTO_STRATEGY = 'auto';
export const STRATEGY_IDS = Object.freeze(['yagura', 'mino', 'bogin']);

export const STRATEGY_LABELS = Object.freeze({
  [AUTO_STRATEGY]: 'おまかせ',
  yagura: '矢倉',
  mino: '四間飛車・美濃',
  bogin: '棒銀',
});

const RANKS = 'abcdefghi';

function blackSquare(square) {
  const match = /^([1-9])([a-i])$/.exec(square);
  if (!match) throw new Error(`Invalid shogi square: ${square}`);
  const file = Number(match[1]);
  const row = RANKS.indexOf(match[2]);
  const col = 9 - file;
  return row * 9 + col;
}

function playerSquare(square, player) {
  const index = blackSquare(square);
  if (player === BLACK) return index;
  const row = Math.floor(index / 9);
  const col = index % 9;
  return (8 - row) * 9 + (8 - col);
}

const PLANS = Object.freeze({
  yagura: Object.freeze([
    ['7g', '7f', 'P'],
    ['7i', '6h', 'S'],
    ['6g', '6f', 'P'],
    ['5g', '5f', 'P'],
    ['6h', '7g', 'S'],
    ['6i', '7h', 'G'],
    ['4i', '5h', 'G'],
    ['5i', '6i', 'K'],
    ['6i', '7i', 'K'],
  ]),
  mino: Object.freeze([
    ['7g', '7f', 'P'],
    ['6g', '6f', 'P'],
    ['2h', '6h', 'R'],
    ['5i', '4h', 'K'],
    ['4h', '3h', 'K'],
    ['3h', '2h', 'K'],
    ['3i', '3h', 'S'],
    ['4i', '4h', 'G'],
  ]),
  bogin: Object.freeze([
    ['2g', '2f', 'P'],
    ['2f', '2e', 'P'],
    ['3i', '3h', 'S'],
    ['3h', '2g', 'S'],
    ['2g', '2f', 'S'],
    ['5i', '6h', 'K'],
    ['6h', '7h', 'K'],
  ]),
});

export function normalizeStrategy(value) {
  return STRATEGY_IDS.includes(value) ? value : AUTO_STRATEGY;
}

export function chooseRandomStrategy(random = Math.random) {
  return STRATEGY_IDS[Math.floor(random() * STRATEGY_IDS.length)] || STRATEGY_IDS[0];
}

export function resolveStrategy(value, random = Math.random) {
  const normalized = normalizeStrategy(value);
  return normalized === AUTO_STRATEGY ? chooseRandomStrategy(random) : normalized;
}

export function strategyLabel(value) {
  return STRATEGY_LABELS[value] || STRATEGY_LABELS[AUTO_STRATEGY];
}

function planFor(strategy) {
  return PLANS[normalizeStrategy(strategy)] || null;
}

function stepData(step, player) {
  const [fromSquare, toSquare, pieceType] = step;
  return {
    from: playerSquare(fromSquare, player),
    to: playerSquare(toSquare, player),
    pieceType,
  };
}

function stepCompleted(position, plan, stepIndex, player) {
  const { from, to, pieceType } = stepData(plan[stepIndex], player);
  const target = position.board[to];
  const source = position.board[from];
  if (target?.owner === player && target.type === pieceType
      && !(source?.owner === player && source.type === pieceType)) return true;

  if (source?.owner === player && source.type === pieceType) return false;
  for (let later = stepIndex + 1; later < plan.length; later += 1) {
    const laterStep = stepData(plan[later], player);
    if (laterStep.pieceType !== pieceType) continue;
    const laterTarget = position.board[laterStep.to];
    if (laterTarget?.owner === player && laterTarget.type === pieceType) return true;
  }
  return false;
}

export function findOpeningMove(position, player, strategy, legalMoves) {
  if (position.moveNumber > 36) return null;
  const plan = planFor(strategy);
  if (!plan) return null;

  const legalByKey = new Map(legalMoves.map((move) => [moveKey(move), move]));
  for (let stepIndex = 0; stepIndex < plan.length; stepIndex += 1) {
    const step = plan[stepIndex];
    if (stepCompleted(position, plan, stepIndex, player)) continue;

    const { from, to, pieceType } = stepData(step, player);
    const source = position.board[from];
    if (source?.owner !== player || source.type !== pieceType) return null;

    const candidateKey = moveKey({ kind: 'move', from, to, promote: false });
    const move = legalByKey.get(candidateKey) || null;
    return move ? { move, stepIndex, strategy } : null;
  }
  return null;
}

export function strategyMoveBonus(position, move, player, strategy) {
  if (position.moveNumber > 42 || move.kind !== 'move') return 0;
  const plan = planFor(strategy);
  if (!plan) return 0;

  let bonus = 0;
  for (let stepIndex = 0; stepIndex < plan.length; stepIndex += 1) {
    const step = plan[stepIndex];
    if (stepCompleted(position, plan, stepIndex, player)) continue;
    const { from, to, pieceType } = stepData(step, player);
    const moving = position.board[move.from];
    if (move.from === from && move.to === to) bonus = Math.max(bonus, 180 - stepIndex * 4);
    else if (move.to === to && moving?.owner === player && moving.type === pieceType) bonus = Math.max(bonus, 70);
  }
  return bonus;
}

export function openingPlan(strategy, player = BLACK) {
  const plan = planFor(strategy) || [];
  return plan.map((step) => stepData(step, player));
}

export { BLACK, WHITE };
