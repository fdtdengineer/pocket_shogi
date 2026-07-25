import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK,
  WHITE,
  applyMove,
  createInitialPosition,
  createPiece,
  emptyHands,
  generateLegalMoves,
  indexOf,
  isInCheck,
  moveKey,
} from '../engine/shogi.js';
import { chooseCpuMove } from '../engine/cpu.js';
import { findOpeningMove, openingPlan } from '../engine/opening-book.js';

function emptyPosition(turn = BLACK) {
  const board = Array(81).fill(null);
  board[indexOf(8, 4)] = createPiece('K', BLACK);
  board[indexOf(0, 4)] = createPiece('K', WHITE);
  return { board, hands: emptyHands(), turn, moveNumber: 1, lastMove: null };
}

test('initial position has all 40 pieces and legal opening moves', () => {
  const position = createInitialPosition();
  assert.equal(position.board.filter(Boolean).length, 40);
  assert.equal(position.turn, BLACK);
  assert.ok(generateLegalMoves(position).length >= 25);
});

test('a capture adds the demoted captured piece to hand', () => {
  const position = emptyPosition();
  position.board[indexOf(4, 4)] = createPiece('R', BLACK);
  position.board[indexOf(3, 4)] = createPiece('P', WHITE, true);
  const move = generateLegalMoves(position).find((candidate) => candidate.from === indexOf(4, 4) && candidate.to === indexOf(3, 4));
  const next = applyMove(position, move);
  assert.equal(next.hands[BLACK].P, 1);
  assert.equal(next.board[indexOf(3, 4)].type, 'R');
});

test('optional promotion produces both move variants', () => {
  const position = emptyPosition();
  position.board[indexOf(3, 3)] = createPiece('P', BLACK);
  const variants = generateLegalMoves(position).filter((move) => move.from === indexOf(3, 3) && move.to === indexOf(2, 3));
  assert.deepEqual(new Set(variants.map((move) => move.promote)), new Set([false, true]));
});

test('pawn promotion is mandatory on the last rank', () => {
  const position = emptyPosition();
  position.board[indexOf(1, 3)] = createPiece('P', BLACK);
  const variants = generateLegalMoves(position).filter((move) => move.from === indexOf(1, 3) && move.to === indexOf(0, 3));
  assert.equal(variants.length, 1);
  assert.equal(variants[0].promote, true);
});

test('nifu prevents a second unpromoted pawn drop on the same file', () => {
  const position = emptyPosition();
  position.hands[BLACK].P = 1;
  position.board[indexOf(5, 2)] = createPiece('P', BLACK);
  const drops = generateLegalMoves(position).filter((move) => move.kind === 'drop' && move.pieceType === 'P');
  assert.ok(drops.length > 0);
  assert.ok(drops.every((move) => move.to % 9 !== 2));
});

test('a pinned piece cannot expose its own king', () => {
  const position = emptyPosition();
  position.board[indexOf(8, 4)] = createPiece('K', BLACK);
  position.board[indexOf(6, 4)] = createPiece('G', BLACK);
  position.board[indexOf(2, 4)] = createPiece('R', WHITE);
  const illegalSideways = generateLegalMoves(position).filter((move) => move.from === indexOf(6, 4) && move.to === indexOf(6, 3));
  assert.equal(illegalSideways.length, 0);
});

test('check can be detected and legal moves must answer it', () => {
  const position = emptyPosition();
  position.board[indexOf(4, 4)] = createPiece('R', WHITE);
  assert.equal(isInCheck(position, BLACK), true);
  const moves = generateLegalMoves(position, BLACK);
  assert.ok(moves.length > 0);
  for (const move of moves) assert.equal(isInCheck(applyMove(position, move), BLACK), false);
});

test('all CPU difficulty levels return a legal move', async () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const position = createInitialPosition();
    const legalKeys = new Set(generateLegalMoves(position).map(moveKey));
    const move = await chooseCpuMove(position, difficulty, {
      timeLimitMs: 80,
      maxDepth: 3,
      quiescenceDepth: 2,
    });
    assert.ok(move, `${difficulty} should return a move`);
    assert.ok(legalKeys.has(moveKey(move)), `${difficulty} should return a legal move`);
  }
});


test('opening book starts each supported strategy with its basic first move', () => {
  const expected = {
    yagura: 'm:56:47:0',
    mino: 'm:56:47:0',
    bogin: 'm:61:52:0',
  };
  for (const strategy of Object.keys(expected)) {
    const position = createInitialPosition();
    const entry = findOpeningMove(position, BLACK, strategy, generateLegalMoves(position));
    assert.ok(entry, `${strategy} should have an opening move`);
    assert.equal(moveKey(entry.move), expected[strategy]);
  }
});

test('opening plans are mirrored correctly for the second player', () => {
  const blackPlan = openingPlan('mino', BLACK);
  const whitePlan = openingPlan('mino', WHITE);
  assert.equal(blackPlan.length, whitePlan.length);
  assert.equal(whitePlan[0].from, 80 - blackPlan[0].from);
  assert.equal(whitePlan[0].to, 80 - blackPlan[0].to);
});

test('CPU follows a safe selected opening strategy', async () => {
  const position = createInitialPosition();
  const move = await chooseCpuMove(position, 'easy', {
    strategy: 'bogin',
    timeLimitMs: 120,
    maxDepth: 1,
    quiescenceDepth: 1,
  });
  assert.equal(moveKey(move), 'm:61:52:0');
});
