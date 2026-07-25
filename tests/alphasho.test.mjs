import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLACK,
  WHITE,
  applyMove,
  createInitialPosition,
  generateLegalMoves,
  positionHash,
} from '../engine/shogi.js';
import { encodePosition, normalizedSquare } from '../engine/alphasho/encoder.js';
import { moveToPolicyLabel } from '../engine/alphasho/policy-label.js';
import { runMcts } from '../engine/alphasho/mcts.js';
import { POLICY_SIZE } from '../engine/alphasho/constants.js';

function findMove(position, predicate) {
  const move = generateLegalMoves(position, position.turn).find(predicate);
  assert.ok(move, 'expected legal move');
  return move;
}

test('AlphaSho encoder emits cshogi-compatible feature shapes', () => {
  const position = createInitialPosition();
  const { features1, features2 } = encodePosition(position);
  assert.equal(features1.length, 62 * 81);
  assert.equal(features2.length, 57 * 81);

  const placementOnes = Array.from(features1.subarray(0, 14 * 81))
    .reduce((sum, value) => sum + value, 0);
  assert.equal(placementOnes, 20, 'side-to-move owns 20 board pieces');

  const blackPawn7g = 6 * 9 + 2;
  const square = normalizedSquare(blackPawn7g, BLACK);
  assert.equal(square, 60);
  assert.equal(features1[square], 1, 'black pawn plane contains 7g');
});

test('white-to-move features rotate the board and swap player channels', () => {
  const position = createInitialPosition();
  const blackMove = findMove(position, (move) => move.kind === 'move' && move.from === 56 && move.to === 47);
  const whitePosition = applyMove(position, blackMove);
  assert.equal(whitePosition.turn, WHITE);
  const { features1 } = encodePosition(whitePosition);

  const whitePawn3c = 2 * 9 + 6;
  const square = normalizedSquare(whitePawn3c, WHITE);
  assert.equal(square, 60);
  assert.equal(features1[square], 1, 'white pawn is in the current-player pawn plane');
});

test('policy labels match cshogi dlshogi direction normalization', () => {
  const initial = createInitialPosition();
  const black7g7f = findMove(initial, (move) => move.kind === 'move' && move.from === 56 && move.to === 47);
  assert.equal(moveToPolicyLabel(initial, black7g7f), 59);

  const whitePosition = applyMove(initial, black7g7f);
  const white3c3d = findMove(whitePosition, (move) => move.kind === 'move' && move.from === 24 && move.to === 33);
  assert.equal(moveToPolicyLabel(whitePosition, white3c3d), 59);

  assert.equal(
    moveToPolicyLabel(initial, { kind: 'drop', pieceType: 'P', to: 40 }),
    20 * 81 + 40,
  );
});

test('all legal moves have distinct AlphaSho policy labels', () => {
  let position = createInitialPosition();
  for (let ply = 0; ply < 8; ply += 1) {
    const moves = generateLegalMoves(position, position.turn);
    const labels = moves.map((move) => moveToPolicyLabel(position, move));
    assert.equal(new Set(labels).size, labels.length);
    position = applyMove(position, moves[ply % moves.length]);
  }
});

test('lightweight MCTS returns a legal move with a deterministic evaluator', async () => {
  const position = createInitialPosition();
  const legalMoves = generateLegalMoves(position, position.turn);
  const evaluator = {
    async evaluateBatch(positions) {
      return {
        logits: new Float32Array(positions.length * POLICY_SIZE),
        values: new Float32Array(positions.length),
      };
    },
  };
  const result = await runMcts({
    position,
    repetitionEntries: [[positionHash(position), 1]],
    evaluator,
    options: { playouts: 4, batchSize: 2, timeLimitMs: 1000 },
  });
  assert.ok(legalMoves.some((move) => JSON.stringify(move) === JSON.stringify(result.move)));
  assert.ok(result.stats.playouts > 0);
});
