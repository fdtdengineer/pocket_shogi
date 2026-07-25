export const BLACK = 'black';
export const WHITE = 'white';

export const PIECE_TYPES = ['K', 'R', 'B', 'G', 'S', 'N', 'L', 'P'];
export const HAND_TYPES = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

const PROMOTABLE = new Set(['R', 'B', 'S', 'N', 'L', 'P']);
const GOLD_MOVERS = new Set(['S', 'N', 'L', 'P']);

export const PIECE_LABELS = Object.freeze({
  K: '王', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩',
  '+R': '龍', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
});

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function indexOf(row, col) {
  return row * 9 + col;
}

export function rowOf(index) {
  return Math.floor(index / 9);
}

export function colOf(index) {
  return index % 9;
}

export function inside(row, col) {
  return row >= 0 && row < 9 && col >= 0 && col < 9;
}

export function createPiece(type, owner, promoted = false) {
  return { type, owner, promoted: Boolean(promoted && PROMOTABLE.has(type)) };
}

export function emptyHands() {
  return {
    [BLACK]: Object.fromEntries(HAND_TYPES.map((type) => [type, 0])),
    [WHITE]: Object.fromEntries(HAND_TYPES.map((type) => [type, 0])),
  };
}

export function createInitialPosition() {
  const board = Array(81).fill(null);
  const backRank = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];

  backRank.forEach((type, col) => {
    board[indexOf(0, col)] = createPiece(type, WHITE);
    board[indexOf(8, col)] = createPiece(type, BLACK);
  });

  board[indexOf(1, 1)] = createPiece('R', WHITE);
  board[indexOf(1, 7)] = createPiece('B', WHITE);
  board[indexOf(7, 1)] = createPiece('B', BLACK);
  board[indexOf(7, 7)] = createPiece('R', BLACK);

  for (let col = 0; col < 9; col += 1) {
    board[indexOf(2, col)] = createPiece('P', WHITE);
    board[indexOf(6, col)] = createPiece('P', BLACK);
  }

  return {
    board,
    hands: emptyHands(),
    turn: BLACK,
    moveNumber: 1,
    lastMove: null,
  };
}

export function clonePosition(position) {
  return {
    ...position,
    board: position.board.map((piece) => (piece ? { ...piece } : null)),
    hands: {
      [BLACK]: { ...position.hands[BLACK] },
      [WHITE]: { ...position.hands[WHITE] },
    },
    lastMove: position.lastMove ? { ...position.lastMove } : null,
  };
}

export function pieceKey(piece) {
  return `${piece.promoted ? '+' : ''}${piece.type}`;
}

export function pieceLabel(piece) {
  if (!piece) return '';
  if (piece.type === 'K') return piece.owner === BLACK ? '王' : '玉';
  return PIECE_LABELS[pieceKey(piece)];
}

export function moveKey(move) {
  if (move.kind === 'drop') return `d:${move.pieceType}:${move.to}`;
  return `m:${move.from}:${move.to}:${move.promote ? 1 : 0}`;
}

function forward(player) {
  return player === BLACK ? -1 : 1;
}

export function inPromotionZone(player, row) {
  return player === BLACK ? row <= 2 : row >= 6;
}

export function mustPromote(type, player, destinationRow) {
  const last = player === BLACK ? 0 : 8;
  const secondLast = player === BLACK ? 1 : 7;
  if ((type === 'P' || type === 'L') && destinationRow === last) return true;
  return type === 'N' && (destinationRow === last || destinationRow === secondLast);
}

function addStepMove(position, moves, from, owner, dr, dc) {
  const row = rowOf(from) + dr;
  const col = colOf(from) + dc;
  if (!inside(row, col)) return;
  const to = indexOf(row, col);
  const target = position.board[to];
  if (target?.owner === owner || target?.type === 'K') return;
  moves.push(to);
}

function addSlidingMoves(position, moves, from, owner, dr, dc) {
  let row = rowOf(from) + dr;
  let col = colOf(from) + dc;
  while (inside(row, col)) {
    const to = indexOf(row, col);
    const target = position.board[to];
    if (!target) {
      moves.push(to);
    } else {
      if (target.owner !== owner && target.type !== 'K') moves.push(to);
      break;
    }
    row += dr;
    col += dc;
  }
}

function rawDestinations(position, from) {
  const piece = position.board[from];
  if (!piece) return [];
  const moves = [];
  const f = forward(piece.owner);
  const goldSteps = [[f, -1], [f, 0], [f, 1], [0, -1], [0, 1], [-f, 0]];

  if (piece.type === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      addStepMove(position, moves, from, piece.owner, dr, dc);
    }
    return moves;
  }

  if (piece.type === 'G' || (piece.promoted && GOLD_MOVERS.has(piece.type))) {
    for (const [dr, dc] of goldSteps) addStepMove(position, moves, from, piece.owner, dr, dc);
    return moves;
  }

  if (piece.type === 'S') {
    for (const [dr, dc] of [[f,-1],[f,0],[f,1],[-f,-1],[-f,1]]) {
      addStepMove(position, moves, from, piece.owner, dr, dc);
    }
    return moves;
  }

  if (piece.type === 'N') {
    addStepMove(position, moves, from, piece.owner, 2 * f, -1);
    addStepMove(position, moves, from, piece.owner, 2 * f, 1);
    return moves;
  }

  if (piece.type === 'L') {
    addSlidingMoves(position, moves, from, piece.owner, f, 0);
    return moves;
  }

  if (piece.type === 'P') {
    addStepMove(position, moves, from, piece.owner, f, 0);
    return moves;
  }

  if (piece.type === 'R') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      addSlidingMoves(position, moves, from, piece.owner, dr, dc);
    }
    if (piece.promoted) {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        addStepMove(position, moves, from, piece.owner, dr, dc);
      }
    }
    return moves;
  }

  if (piece.type === 'B') {
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addSlidingMoves(position, moves, from, piece.owner, dr, dc);
    }
    if (piece.promoted) {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        addStepMove(position, moves, from, piece.owner, dr, dc);
      }
    }
  }

  return moves;
}

function promotionVariants(piece, from, to) {
  if (piece.promoted || !PROMOTABLE.has(piece.type)) return [false];
  const eligible = inPromotionZone(piece.owner, rowOf(from)) || inPromotionZone(piece.owner, rowOf(to));
  if (!eligible) return [false];
  if (mustPromote(piece.type, piece.owner, rowOf(to))) return [true];
  return [false, true];
}

export function generatePseudoBoardMoves(position, player) {
  const moves = [];
  for (let from = 0; from < 81; from += 1) {
    const piece = position.board[from];
    if (!piece || piece.owner !== player) continue;
    for (const to of rawDestinations(position, from)) {
      for (const promote of promotionVariants(piece, from, to)) {
        moves.push({ kind: 'move', from, to, promote });
      }
    }
  }
  return moves;
}

function hasUnpromotedPawnOnFile(position, player, col) {
  for (let row = 0; row < 9; row += 1) {
    const piece = position.board[indexOf(row, col)];
    if (piece?.owner === player && piece.type === 'P' && !piece.promoted) return true;
  }
  return false;
}

function dropAllowedByRank(type, player, row) {
  const last = player === BLACK ? 0 : 8;
  const secondLast = player === BLACK ? 1 : 7;
  if ((type === 'P' || type === 'L') && row === last) return false;
  if (type === 'N' && (row === last || row === secondLast)) return false;
  return true;
}

export function generatePseudoDrops(position, player) {
  const moves = [];
  for (const type of HAND_TYPES) {
    if ((position.hands[player]?.[type] || 0) <= 0) continue;
    for (let to = 0; to < 81; to += 1) {
      if (position.board[to]) continue;
      const row = rowOf(to);
      const col = colOf(to);
      if (!dropAllowedByRank(type, player, row)) continue;
      if (type === 'P' && hasUnpromotedPawnOnFile(position, player, col)) continue;
      moves.push({ kind: 'drop', pieceType: type, to });
    }
  }
  return moves;
}

export function applyMove(position, move, options = {}) {
  const player = options.player || position.turn;
  const next = clonePosition(position);

  if (move.kind === 'drop') {
    if ((next.hands[player]?.[move.pieceType] || 0) <= 0) throw new Error('持ち駒がありません。');
    if (next.board[move.to]) throw new Error('駒のある場所には打てません。');
    next.hands[player][move.pieceType] -= 1;
    next.board[move.to] = createPiece(move.pieceType, player, false);
  } else {
    const piece = next.board[move.from];
    if (!piece || piece.owner !== player) throw new Error('移動元の駒が不正です。');
    const captured = next.board[move.to];
    if (captured) {
      if (captured.owner === player || captured.type === 'K') throw new Error('不正な取りです。');
      next.hands[player][captured.type] += 1;
    }
    next.board[move.from] = null;
    next.board[move.to] = { ...piece, promoted: piece.promoted || Boolean(move.promote) };
  }

  next.turn = opponent(player);
  next.moveNumber = position.moveNumber + 1;
  next.lastMove = { ...move, player };
  return next;
}

export function findKing(position, player) {
  return position.board.findIndex((piece) => piece?.owner === player && piece.type === 'K');
}

function attacksByStep(position, from, piece, target) {
  const f = forward(piece.owner);
  const tr = rowOf(target);
  const tc = colOf(target);
  const dr = tr - rowOf(from);
  const dc = tc - colOf(from);
  const has = (steps) => steps.some(([r, c]) => r === dr && c === dc);

  if (piece.type === 'K') return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
  if (piece.type === 'G' || (piece.promoted && GOLD_MOVERS.has(piece.type))) {
    return has([[f,-1],[f,0],[f,1],[0,-1],[0,1],[-f,0]]);
  }
  if (piece.type === 'S') return has([[f,-1],[f,0],[f,1],[-f,-1],[-f,1]]);
  if (piece.type === 'N') return has([[2*f,-1],[2*f,1]]);
  if (piece.type === 'P') return dr === f && dc === 0;
  return false;
}

function attacksByRay(position, from, target, directions) {
  const sr = rowOf(from);
  const sc = colOf(from);
  for (const [dr, dc] of directions) {
    let row = sr + dr;
    let col = sc + dc;
    while (inside(row, col)) {
      const index = indexOf(row, col);
      if (index === target) return true;
      if (position.board[index]) break;
      row += dr;
      col += dc;
    }
  }
  return false;
}

export function pieceAttacksSquare(position, from, target) {
  const piece = position.board[from];
  if (!piece || from === target) return false;

  if (['K', 'G', 'S', 'N', 'P'].includes(piece.type) || (piece.promoted && GOLD_MOVERS.has(piece.type))) {
    if (attacksByStep(position, from, piece, target)) return true;
  }

  if (piece.type === 'L' && !piece.promoted) {
    return attacksByRay(position, from, target, [[forward(piece.owner), 0]]);
  }

  if (piece.type === 'R') {
    if (attacksByRay(position, from, target, [[-1,0],[1,0],[0,-1],[0,1]])) return true;
    if (piece.promoted && attacksByStep(position, from, { ...piece, type: 'K' }, target)) {
      const dr = Math.abs(rowOf(target) - rowOf(from));
      const dc = Math.abs(colOf(target) - colOf(from));
      return dr === 1 && dc === 1;
    }
  }

  if (piece.type === 'B') {
    if (attacksByRay(position, from, target, [[-1,-1],[-1,1],[1,-1],[1,1]])) return true;
    if (piece.promoted) {
      const dr = Math.abs(rowOf(target) - rowOf(from));
      const dc = Math.abs(colOf(target) - colOf(from));
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) return true;
    }
  }

  return false;
}

export function isSquareAttacked(position, square, byPlayer) {
  for (let from = 0; from < 81; from += 1) {
    if (position.board[from]?.owner === byPlayer && pieceAttacksSquare(position, from, square)) return true;
  }
  return false;
}

export function isInCheck(position, player) {
  const king = findKing(position, player);
  if (king < 0) return true;
  return isSquareAttacked(position, king, opponent(player));
}

function isPawnDropMate(position, move, player) {
  if (move.kind !== 'drop' || move.pieceType !== 'P') return false;
  const next = applyMove(position, move, { player });
  const enemy = opponent(player);
  const enemyKing = findKing(next, enemy);
  // 打ち歩詰めは、打った歩そのものが王手をかけて詰ませる場合だけを禁止する。
  if (enemyKing < 0 || !pieceAttacksSquare(next, move.to, enemyKing)) return false;
  return generateLegalMoves(next, enemy, { validatePawnDropMate: false }).length === 0;
}

export function generateLegalMoves(position, player = position.turn, options = {}) {
  const validatePawnDropMate = options.validatePawnDropMate !== false;
  const pseudo = [
    ...generatePseudoBoardMoves(position, player),
    ...generatePseudoDrops(position, player),
  ];
  const legal = [];

  for (const move of pseudo) {
    let next;
    try {
      next = applyMove(position, move, { player });
    } catch {
      continue;
    }
    if (isInCheck(next, player)) continue;
    if (validatePawnDropMate && isPawnDropMate(position, move, player)) continue;
    legal.push(move);
  }
  return legal;
}

export function legalMovesFrom(position, from, player = position.turn) {
  return generateLegalMoves(position, player).filter((move) => move.kind === 'move' && move.from === from);
}

export function legalDropsOf(position, pieceType, player = position.turn) {
  return generateLegalMoves(position, player).filter((move) => move.kind === 'drop' && move.pieceType === pieceType);
}

export function gameStatus(position) {
  const legalMoves = generateLegalMoves(position, position.turn);
  if (legalMoves.length > 0) {
    return {
      over: false,
      inCheck: isInCheck(position, position.turn),
      legalMoves,
      winner: null,
      reason: null,
    };
  }
  const checked = isInCheck(position, position.turn);
  return {
    over: true,
    inCheck: checked,
    legalMoves,
    winner: checked ? opponent(position.turn) : null,
    reason: checked ? 'checkmate' : 'no-legal-moves',
  };
}

export function serializePosition(position) {
  return {
    board: position.board.map((piece) => (piece ? { ...piece } : null)),
    hands: {
      [BLACK]: { ...position.hands[BLACK] },
      [WHITE]: { ...position.hands[WHITE] },
    },
    turn: position.turn,
    moveNumber: position.moveNumber,
    lastMove: position.lastMove ? { ...position.lastMove } : null,
  };
}

export function deserializePosition(value) {
  if (!value || !Array.isArray(value.board) || value.board.length !== 81) {
    throw new Error('局面データが不正です。');
  }
  return {
    board: value.board.map((piece) => (piece ? createPiece(piece.type, piece.owner, piece.promoted) : null)),
    hands: {
      [BLACK]: { ...emptyHands()[BLACK], ...(value.hands?.[BLACK] || {}) },
      [WHITE]: { ...emptyHands()[WHITE], ...(value.hands?.[WHITE] || {}) },
    },
    turn: value.turn === WHITE ? WHITE : BLACK,
    moveNumber: Number.isInteger(value.moveNumber) ? value.moveNumber : 1,
    lastMove: value.lastMove ? { ...value.lastMove } : null,
  };
}

export function positionHash(position) {
  const board = position.board.map((piece) => (
    piece ? `${piece.owner[0]}${piece.promoted ? '+' : ''}${piece.type}` : '--'
  )).join('');
  const hands = [BLACK, WHITE]
    .map((player) => HAND_TYPES.map((type) => `${type}${position.hands[player][type] || 0}`).join(','))
    .join('|');
  return `${position.turn}|${board}|${hands}`;
}
