import {
  BLACK,
  WHITE,
  isInCheck,
  pieceAttacksSquare,
} from '../shogi.js';
import {
  FEATURES1_NUM,
  FEATURES2_NUM,
  HAND_FEATURES,
  PIECE_PLANE_INDEX,
  SQUARES,
} from './constants.js';

function piecePlane(piece) {
  if (!piece) return null;
  const key = `${piece.promoted ? '+' : ''}${piece.type}`;
  const plane = PIECE_PLANE_INDEX[key];
  return Number.isInteger(plane) ? plane : null;
}

export function pocketIndexToCshogiSquare(index) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  return (8 - col) * 9 + row;
}

export function normalizedSquare(index, turn) {
  const square = pocketIndexToCshogiSquare(index);
  return turn === BLACK ? square : 80 - square;
}

function normalizedOwner(owner, turn) {
  return owner === turn ? 0 : 1;
}

function fillPlane(buffer, plane, value = 1) {
  buffer.fill(value, plane * SQUARES, (plane + 1) * SQUARES);
}

/**
 * Build the exact cshogi 1.0.4 dlshogi feature layout used by AlphaSho.
 * The returned arrays are channel-first and flattened as [C, 9, 9].
 */
export function encodePosition(position) {
  const features1 = new Float32Array(FEATURES1_NUM * SQUARES);
  const features2 = new Float32Array(FEATURES2_NUM * SQUARES);
  const attackCounts = new Uint8Array(2 * SQUARES);

  for (let from = 0; from < SQUARES; from += 1) {
    const piece = position.board[from];
    if (!piece) continue;
    const typePlane = piecePlane(piece);
    if (typePlane === null) continue;
    const ownerPlane = normalizedOwner(piece.owner, position.turn);
    const fromSquare = normalizedSquare(from, position.turn);
    features1[(ownerPlane * 31 + typePlane) * SQUARES + fromSquare] = 1;

    for (let target = 0; target < SQUARES; target += 1) {
      if (!pieceAttacksSquare(position, from, target)) continue;
      const targetSquare = normalizedSquare(target, position.turn);
      const attackPlane = ownerPlane * 31 + 14 + typePlane;
      features1[attackPlane * SQUARES + targetSquare] = 1;
      const countIndex = ownerPlane * SQUARES + targetSquare;
      if (attackCounts[countIndex] < 3) attackCounts[countIndex] += 1;
    }
  }

  for (let ownerPlane = 0; ownerPlane < 2; ownerPlane += 1) {
    for (let square = 0; square < SQUARES; square += 1) {
      const count = attackCounts[ownerPlane * SQUARES + square];
      for (let level = 0; level < count; level += 1) {
        const plane = ownerPlane * 31 + 28 + level;
        features1[plane * SQUARES + square] = 1;
      }
    }
  }

  for (const owner of [BLACK, WHITE]) {
    const ownerPlane = normalizedOwner(owner, position.turn);
    let offset = ownerPlane * 28;
    for (const feature of HAND_FEATURES) {
      const count = Math.min(position.hands[owner]?.[feature.type] || 0, feature.planes);
      for (let index = 0; index < count; index += 1) fillPlane(features2, offset + index);
      offset += feature.planes;
    }
  }

  if (isInCheck(position, position.turn)) fillPlane(features2, 56);
  return { features1, features2 };
}

export function encodeBatch(positions) {
  const batchSize = positions.length;
  const features1 = new Float32Array(batchSize * FEATURES1_NUM * SQUARES);
  const features2 = new Float32Array(batchSize * FEATURES2_NUM * SQUARES);
  positions.forEach((position, batchIndex) => {
    const encoded = encodePosition(position);
    features1.set(encoded.features1, batchIndex * FEATURES1_NUM * SQUARES);
    features2.set(encoded.features2, batchIndex * FEATURES2_NUM * SQUARES);
  });
  return { features1, features2, batchSize };
}
