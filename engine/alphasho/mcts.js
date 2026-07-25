import {
  applyMove,
  clonePosition,
  gameStatus,
  generateLegalMoves,
  positionHash,
} from '../shogi.js';
import { DEFAULT_SEARCH_OPTIONS, POLICY_SIZE } from './constants.js';
import { labelLegalMoves, normalizeLegalLogits } from './policy-label.js';

class TreeNode {
  constructor(action = null, label = null, prior = 1) {
    this.action = action;
    this.label = label;
    this.prior = prior;
    this.children = new Map();
    this.visits = 0;
    this.valueSum = 0;
    this.virtualVisits = 0;
  }

  get qValue() {
    return this.visits ? this.valueSum / this.visits : 0;
  }

  select(cPuct, virtualLoss) {
    const parentScale = Math.sqrt(this.visits + this.virtualVisits + 1);
    let selected = null;
    let selectedScore = -Infinity;
    for (const child of this.children.values()) {
      const score = -child.qValue
        + cPuct * child.prior * parentScale / (1 + child.visits + child.virtualVisits)
        - virtualLoss * child.virtualVisits;
      if (score > selectedScore) {
        selectedScore = score;
        selected = child;
      }
    }
    return selected;
  }
}

function reserve(path) {
  for (const node of path) node.virtualVisits += 1;
}

function release(path) {
  for (const node of path) node.virtualVisits = Math.max(0, node.virtualVisits - 1);
}

function backup(path, leafValue, reserved = false) {
  let value = leafValue;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const node = path[index];
    if (reserved) node.virtualVisits = Math.max(0, node.virtualVisits - 1);
    node.visits += 1;
    node.valueSum += value;
    value = -value;
  }
}

function terminalValue(position, repetitionCounts, maxSearchPly, depth) {
  if ((repetitionCounts.get(positionHash(position)) || 0) >= 4) return 0;
  if (depth >= maxSearchPly || position.moveNumber >= 513) return 0;
  const status = gameStatus(position);
  if (!status.over) return null;
  return status.winner ? -1 : 0;
}

function selectLeaf(root, rootPosition, rootRepetitions, options) {
  const position = clonePosition(rootPosition);
  const repetitionCounts = new Map(rootRepetitions);
  const path = [root];
  let node = root;
  let depth = 0;

  while (node.children.size > 0) {
    const child = node.select(options.cPuct, options.virtualLoss);
    if (!child?.action) throw new Error('AlphaSho tree contains an invalid child');
    const next = applyMove(position, child.action);
    position.board = next.board;
    position.hands = next.hands;
    position.turn = next.turn;
    position.moveNumber = next.moveNumber;
    position.lastMove = next.lastMove;
    const hash = positionHash(position);
    repetitionCounts.set(hash, (repetitionCounts.get(hash) || 0) + 1);
    node = child;
    path.push(node);
    depth += 1;
    const terminal = terminalValue(position, repetitionCounts, options.maxSearchPly, depth);
    if (terminal !== null) return { node, path, position, repetitionCounts, terminal };
  }
  return { node, path, position, repetitionCounts, terminal: null };
}

function expand(node, position, logits) {
  if (logits.length < POLICY_SIZE) throw new Error(`Policy output is too short: ${logits.length}`);
  const legalMoves = generateLegalMoves(position, position.turn);
  const labeledMoves = labelLegalMoves(position, legalMoves);
  const probabilities = normalizeLegalLogits(logits, labeledMoves);
  labeledMoves.forEach((entry, index) => {
    if (!node.children.has(entry.label)) {
      node.children.set(entry.label, new TreeNode(entry.move, entry.label, probabilities[index]));
    }
  });
}

function rootChoice(root) {
  let best = null;
  for (const child of root.children.values()) {
    if (!best
      || child.visits > best.visits
      || (child.visits === best.visits && child.prior > best.prior)) {
      best = child;
    }
  }
  return best;
}

/**
 * evaluator.evaluateBatch(positions) must return flat policy logits and one value per position.
 */
export async function runMcts({
  position,
  repetitionEntries = [],
  evaluator,
  options = {},
  isCancelled = () => false,
  onProgress = null,
}) {
  const config = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  const root = new TreeNode();
  const repetitions = new Map(repetitionEntries);
  const rootHash = positionHash(position);
  if (!repetitions.has(rootHash)) repetitions.set(rootHash, 1);
  const started = performance.now();
  const deadline = started + config.timeLimitMs;
  let completed = 0;
  let evaluations = 0;

  const initial = selectLeaf(root, position, repetitions, config);
  reserve(initial.path);
  const initialEvaluation = await evaluator.evaluateBatch([initial.position]);
  expand(root, initial.position, initialEvaluation.logits.subarray(0, POLICY_SIZE));
  backup(initial.path, Number(initialEvaluation.values[0]), true);
  evaluations += 1;

  while (completed < config.playouts && performance.now() < deadline) {
    if (isCancelled()) throw new Error('ALPHASHO_CANCELLED');
    const pending = [];
    const pendingNodes = new Set();
    const target = Math.min(config.batchSize, config.playouts - completed);

    while (pending.length < target && completed + pending.length < config.playouts) {
      const leaf = selectLeaf(root, position, repetitions, config);
      if (leaf.terminal !== null) {
        backup(leaf.path, leaf.terminal, false);
        completed += 1;
        continue;
      }
      if (pendingNodes.has(leaf.node)) break;
      pendingNodes.add(leaf.node);
      reserve(leaf.path);
      pending.push(leaf);
    }

    if (pending.length > 0) {
      try {
        const result = await evaluator.evaluateBatch(pending.map((leaf) => leaf.position));
        pending.forEach((leaf, index) => {
          const offset = index * POLICY_SIZE;
          expand(leaf.node, leaf.position, result.logits.subarray(offset, offset + POLICY_SIZE));
          backup(leaf.path, Number(result.values[index]), true);
        });
        completed += pending.length;
        evaluations += 1;
      } catch (error) {
        for (const leaf of pending) release(leaf.path);
        throw error;
      }
    }

    if (onProgress) onProgress({ completed, total: config.playouts, evaluations });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const choice = rootChoice(root);
  if (!choice?.action) throw new Error('AlphaSho search produced no legal move');
  return {
    move: choice.action,
    stats: {
      playouts: completed,
      evaluations,
      elapsedMs: performance.now() - started,
      rootValue: root.qValue,
    },
  };
}
