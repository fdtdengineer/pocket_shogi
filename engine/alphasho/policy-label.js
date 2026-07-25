import { BLACK } from '../shogi.js';
import {
  DROP_PLANE_INDEX,
  POLICY_SIZE,
  SQUARES,
} from './constants.js';
import { pocketIndexToCshogiSquare } from './encoder.js';

const DIRECTIONS = Object.freeze({
  UP: 0,
  UP_LEFT: 1,
  UP_RIGHT: 2,
  LEFT: 3,
  RIGHT: 4,
  DOWN: 5,
  DOWN_LEFT: 6,
  DOWN_RIGHT: 7,
  UP2_LEFT: 8,
  UP2_RIGHT: 9,
});

function normalizeCshogiSquare(square, turn) {
  return turn === BLACK ? square : 80 - square;
}

function moveDirection(fromSquare, toSquare) {
  const fromX = Math.floor(fromSquare / 9);
  const fromY = fromSquare % 9;
  const toX = Math.floor(toSquare / 9);
  const toY = toSquare % 9;
  const dirX = fromX - toX;
  const dirY = toY - fromY;

  if (dirY < 0 && dirX === 0) return DIRECTIONS.UP;
  if (dirY === -2 && dirX === -1) return DIRECTIONS.UP2_LEFT;
  if (dirY === -2 && dirX === 1) return DIRECTIONS.UP2_RIGHT;
  if (dirY < 0 && dirX < 0) return DIRECTIONS.UP_LEFT;
  if (dirY < 0 && dirX > 0) return DIRECTIONS.UP_RIGHT;
  if (dirY === 0 && dirX < 0) return DIRECTIONS.LEFT;
  if (dirY === 0 && dirX > 0) return DIRECTIONS.RIGHT;
  if (dirY > 0 && dirX === 0) return DIRECTIONS.DOWN;
  if (dirY > 0 && dirX < 0) return DIRECTIONS.DOWN_LEFT;
  return DIRECTIONS.DOWN_RIGHT;
}

/** Match cshogi.dlshogi.make_move_label(move, turn). */
export function moveToPolicyLabel(position, move) {
  const toSquare = normalizeCshogiSquare(
    pocketIndexToCshogiSquare(move.to),
    position.turn,
  );
  let plane;
  if (move.kind === 'drop') {
    plane = DROP_PLANE_INDEX[move.pieceType];
    if (!Number.isInteger(plane)) throw new Error(`Unsupported drop piece: ${move.pieceType}`);
  } else {
    const fromSquare = normalizeCshogiSquare(
      pocketIndexToCshogiSquare(move.from),
      position.turn,
    );
    plane = moveDirection(fromSquare, toSquare) + (move.promote ? 10 : 0);
  }
  const label = plane * SQUARES + toSquare;
  if (label < 0 || label >= POLICY_SIZE) throw new Error(`Policy label out of range: ${label}`);
  return label;
}

export function labelLegalMoves(position, legalMoves) {
  const seen = new Set();
  return legalMoves.map((move) => {
    const label = moveToPolicyLabel(position, move);
    if (seen.has(label)) throw new Error(`Colliding AlphaSho policy label: ${label}`);
    seen.add(label);
    return { move, label };
  });
}

export function normalizeLegalLogits(logits, labeledMoves) {
  if (labeledMoves.length === 0) return new Float32Array();
  let maximum = -Infinity;
  for (const entry of labeledMoves) maximum = Math.max(maximum, Number(logits[entry.label]));
  const probabilities = new Float32Array(labeledMoves.length);
  let total = 0;
  for (let index = 0; index < labeledMoves.length; index += 1) {
    const value = Math.exp(Number(logits[labeledMoves[index].label]) - maximum);
    probabilities[index] = Number.isFinite(value) ? value : 0;
    total += probabilities[index];
  }
  if (!Number.isFinite(total) || total <= 0) {
    probabilities.fill(1 / probabilities.length);
    return probabilities;
  }
  for (let index = 0; index < probabilities.length; index += 1) probabilities[index] /= total;
  return probabilities;
}
