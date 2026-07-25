import {
  BLACK,
  WHITE,
  HAND_TYPES,
  applyMove,
  clonePosition,
  createInitialPosition,
  deserializePosition,
  gameStatus,
  generateLegalMoves,
  moveKey,
  opponent,
  pieceLabel,
  positionHash,
  serializePosition,
} from './engine/shogi.js';
import { chooseCpuMove } from './engine/cpu.js';
import { DqnClient } from './engine/dqn-client.js';
import { OnlineSession, normalizeRoomCode } from './online.js';

const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const storedDifficulty = localStorage.getItem('pocketShogiDifficulty');
const initialDifficulty = DIFFICULTIES.has(storedDifficulty) ? storedDifficulty : 'normal';
const storedSide = localStorage.getItem('pocketShogiSide') === 'white' ? WHITE : BLACK;

const elements = {
  board: document.querySelector('#board'),
  blackHand: document.querySelector('#blackHand'),
  whiteHand: document.querySelector('#whiteHand'),
  mobileOpponentHand: document.querySelector('#mobileOpponentHand'),
  mobilePlayerHand: document.querySelector('#mobilePlayerHand'),
  mobileOpponentHandTitle: document.querySelector('#mobileOpponentHandTitle'),
  mobilePlayerHandTitle: document.querySelector('#mobilePlayerHandTitle'),
  blackLabel: document.querySelector('#blackLabel'),
  whiteLabel: document.querySelector('#whiteLabel'),
  blackCard: document.querySelector('#blackCard'),
  whiteCard: document.querySelector('#whiteCard'),
  statusText: document.querySelector('#statusText'),
  statusDot: document.querySelector('#connectionDot'),
  modeText: document.querySelector('#modeText'),
  moveCountText: document.querySelector('#moveCountText'),
  thinkingBadge: document.querySelector('#thinkingBadge'),
  undoButton: document.querySelector('#undoButton'),
  autoPlayButton: document.querySelector('#autoPlayButton'),
  newGameButton: document.querySelector('#newGameButton'),
  menuButton: document.querySelector('#menuButton'),
  onlineButton: document.querySelector('#onlineButton'),
  modalBackdrop: document.querySelector('#modalBackdrop'),
  closeModalButton: document.querySelector('#closeModalButton'),
  modeChooser: document.querySelector('#modeChooser'),
  cpuPanel: document.querySelector('#cpuPanel'),
  cpuVsCpuPanel: document.querySelector('#cpuVsCpuPanel'),
  onlinePanel: document.querySelector('#onlinePanel'),
  waitingPanel: document.querySelector('#waitingPanel'),
  cpuModeButton: document.querySelector('#cpuModeButton'),
  playBlackButton: document.querySelector('#playBlackButton'),
  playWhiteButton: document.querySelector('#playWhiteButton'),
  localModeButton: document.querySelector('#localModeButton'),
  cpuVsCpuModeButton: document.querySelector('#cpuVsCpuModeButton'),
  startCpuVsCpuButton: document.querySelector('#startCpuVsCpuButton'),
  blackCpuDifficulty: document.querySelector('#blackCpuDifficulty'),
  whiteCpuDifficulty: document.querySelector('#whiteCpuDifficulty'),
  cpuVsCpuSpeed: document.querySelector('#cpuVsCpuSpeed'),
  onlineModeButton: document.querySelector('#onlineModeButton'),
  createRoomButton: document.querySelector('#createRoomButton'),
  joinRoomButton: document.querySelector('#joinRoomButton'),
  roomCodeInput: document.querySelector('#roomCodeInput'),
  roomCodeText: document.querySelector('#roomCodeText'),
  roomCodeBox: document.querySelector('#roomCodeBox'),
  shareRoomButton: document.querySelector('#shareRoomButton'),
  cancelOnlineButton: document.querySelector('#cancelOnlineButton'),
  waitingTitle: document.querySelector('#waitingTitle'),
  onlineStatusText: document.querySelector('#onlineStatusText'),
  promotionBackdrop: document.querySelector('#promotionBackdrop'),
  promoteButton: document.querySelector('#promoteButton'),
  declinePromotionButton: document.querySelector('#declinePromotionButton'),
  toast: document.querySelector('#toast'),
  fileLabels: [...document.querySelectorAll('.file-labels span')],
  rankLabels: [...document.querySelectorAll('.rank-labels span')],
};

const cells = Array.from({ length: 81 }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cell';
  button.dataset.index = String(index);
  button.setAttribute('role', 'gridcell');
  button.addEventListener('click', () => onCellClick(index));
  return button;
});

const dqnClient = new DqnClient();
let cpuDifficulty = initialDifficulty;
let preferredHumanPlayer = storedSide;
let state = createState();
let legalMoves = [];
let currentInCheck = false;
let selected = null;
let pendingPromotionMoves = null;
let history = [];
let repetitionCounts = new Map();
let cpuToken = 0;
let online = null;
let toastTimer = null;

function createState(overrides = {}) {
  return {
    position: createInitialPosition(),
    mode: 'cpu',
    humanPlayer: preferredHumanPlayer,
    viewPlayer: preferredHumanPlayer,
    onlineRole: null,
    connected: false,
    gameOver: false,
    winner: null,
    endReason: null,
    version: 0,
    cpuVsCpuPaused: false,
    cpuConfig: { [BLACK]: 'normal', [WHITE]: 'normal' },
    cpuDelay: 650,
    ...overrides,
  };
}

function snapshot() {
  return {
    position: clonePosition(state.position),
    gameOver: state.gameOver,
    winner: state.winner,
    endReason: state.endReason,
    version: state.version,
    repetitionCounts: [...repetitionCounts.entries()],
  };
}

function restoreSnapshot(value) {
  state.position = clonePosition(value.position);
  state.gameOver = value.gameOver;
  state.winner = value.winner;
  state.endReason = value.endReason;
  state.version = value.version;
  repetitionCounts = new Map(value.repetitionCounts);
  selected = null;
  refreshDerived();
}

function initializeRepetition() {
  repetitionCounts = new Map([[positionHash(state.position), 1]]);
}

function refreshDerived() {
  if (state.gameOver && state.endReason === 'repetition') {
    legalMoves = [];
    currentInCheck = false;
    return;
  }
  const result = gameStatus(state.position);
  legalMoves = result.legalMoves;
  currentInCheck = result.inCheck;
  state.gameOver = result.over;
  state.winner = result.winner;
  state.endReason = result.reason;
}

function resetPosition(overrides = {}) {
  cpuToken += 1;
  state = createState({
    mode: state.mode,
    humanPlayer: state.humanPlayer,
    viewPlayer: state.viewPlayer,
    onlineRole: state.onlineRole,
    connected: state.connected,
    cpuConfig: { ...state.cpuConfig },
    cpuDelay: state.cpuDelay,
    ...overrides,
  });
  history = [];
  selected = null;
  pendingPromotionMoves = null;
  initializeRepetition();
  refreshDerived();
  render();
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

function setStatus(message, kind = 'ok') {
  elements.statusText.textContent = message;
  elements.statusDot.classList.toggle('is-waiting', kind === 'waiting');
  elements.statusDot.classList.toggle('is-error', kind === 'error');
}

function difficultyName(value) {
  return ({ easy: 'やさしい', normal: 'ふつう', hard: 'つよい' })[value] || 'ふつう';
}

function playerName(player) {
  return player === BLACK ? '先手' : '後手';
}

function myOnlinePlayer() {
  return state.onlineRole === 'host' ? BLACK : WHITE;
}

function canLocalPlayerMove() {
  if (state.gameOver) return false;
  if (state.mode === 'cpu') return state.position.turn === state.humanPlayer;
  if (state.mode === 'local') return true;
  if (state.mode === 'online') return state.connected && state.position.turn === myOnlinePlayer();
  return false;
}

function isCpuTurn() {
  if (state.gameOver) return false;
  if (state.mode === 'cpu') return state.position.turn !== state.humanPlayer;
  return state.mode === 'cpu-vs-cpu' && !state.cpuVsCpuPaused;
}

function selectedMoves() {
  if (!selected) return [];
  if (selected.kind === 'board') {
    return legalMoves.filter((move) => move.kind === 'move' && move.from === selected.from);
  }
  return legalMoves.filter((move) => move.kind === 'drop' && move.pieceType === selected.pieceType);
}

function renderCoordinates() {
  const files = state.viewPlayer === BLACK
    ? ['９','８','７','６','５','４','３','２','１']
    : ['１','２','３','４','５','６','７','８','９'];
  const ranks = state.viewPlayer === BLACK
    ? ['一','二','三','四','五','六','七','八','九']
    : ['九','八','七','六','五','四','三','二','一'];
  elements.fileLabels.forEach((element, index) => { element.textContent = files[index]; });
  elements.rankLabels.forEach((element, index) => { element.textContent = ranks[index]; });
}

function renderBoard() {
  const order = Array.from({ length: 81 }, (_, index) => (
    state.viewPlayer === BLACK ? index : 80 - index
  ));
  elements.board.replaceChildren(...order.map((index) => cells[index]));

  const targets = new Map();
  for (const move of selectedMoves()) {
    const list = targets.get(move.to) || [];
    list.push(move);
    targets.set(move.to, list);
  }

  const lastTarget = state.position.lastMove?.to ?? null;
  for (let index = 0; index < 81; index += 1) {
    const cell = cells[index];
    const piece = state.position.board[index];
    const targetMoves = targets.get(index) || [];
    const selectable = canLocalPlayerMove() && piece?.owner === state.position.turn;
    const checkedKing = currentInCheck && piece?.type === 'K' && piece.owner === state.position.turn;

    cell.replaceChildren();
    cell.classList.toggle('is-selected', selected?.kind === 'board' && selected.from === index);
    cell.classList.toggle('is-target', targetMoves.length > 0);
    cell.classList.toggle('is-capture', targetMoves.length > 0 && Boolean(piece));
    cell.classList.toggle('is-last', index === lastTarget);
    cell.classList.toggle('is-check', checkedKing);
    cell.disabled = !(selectable || targetMoves.length > 0);
    cell.setAttribute('aria-label', `盤面 ${Math.floor(index / 9) + 1}段 ${index % 9 + 1}列${piece ? ` ${pieceLabel(piece)}` : ''}`);

    if (piece) {
      const pieceElement = document.createElement('span');
      pieceElement.className = 'piece';
      pieceElement.textContent = pieceLabel(piece);
      pieceElement.classList.toggle('is-opponent', piece.owner !== state.viewPlayer);
      pieceElement.classList.toggle('is-promoted', piece.promoted);
      pieceElement.classList.toggle('is-selectable', selectable);
      cell.append(pieceElement);
    }
  }
}

function renderHand(container, player) {
  container.replaceChildren();
  let hasPiece = false;
  for (const type of HAND_TYPES) {
    const count = state.position.hands[player][type] || 0;
    if (count <= 0) continue;
    hasPiece = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hand-piece';
    button.classList.toggle('is-selected', selected?.kind === 'hand' && selected.pieceType === type && selected.player === player);
    button.disabled = !(canLocalPlayerMove() && state.position.turn === player);
    button.innerHTML = `${pieceLabel({ type, owner: player, promoted: false })}<span class="hand-count">×${count}</span>`;
    button.setAttribute('aria-label', `${playerName(player)}の持ち駒 ${pieceLabel({ type, owner: player, promoted: false })} ${count}枚`);
    button.addEventListener('click', () => selectHandPiece(player, type));
    container.append(button);
  }
  if (!hasPiece) {
    const empty = document.createElement('span');
    empty.className = 'empty-hand';
    empty.textContent = 'なし';
    container.append(empty);
  }
}

function renderHands() {
  renderHand(elements.blackHand, BLACK);
  renderHand(elements.whiteHand, WHITE);
  const primary = state.viewPlayer;
  const secondary = opponent(primary);
  elements.mobilePlayerHandTitle.textContent = `${primary === BLACK ? '先手' : '後手'}の持ち駒`;
  elements.mobileOpponentHandTitle.textContent = `${secondary === BLACK ? '先手' : '後手'}の持ち駒`;
  renderHand(elements.mobilePlayerHand, primary);
  renderHand(elements.mobileOpponentHand, secondary);
}

function renderLabels() {
  const turn = state.position.turn;
  elements.blackCard.classList.toggle('is-active', turn === BLACK && !state.gameOver);
  elements.whiteCard.classList.toggle('is-active', turn === WHITE && !state.gameOver);
  elements.moveCountText.textContent = `${state.position.moveNumber}手目`;

  if (state.mode === 'cpu') {
    elements.blackLabel.textContent = state.humanPlayer === BLACK ? 'あなた・先手' : `CPU・先手`;
    elements.whiteLabel.textContent = state.humanPlayer === WHITE ? 'あなた・後手' : `CPU・後手`;
    elements.modeText.textContent = `CPU対戦・${state.humanPlayer === BLACK ? '先手' : '後手'}・${difficultyName(cpuDifficulty)}`;
  } else if (state.mode === 'local') {
    elements.blackLabel.textContent = 'プレイヤー1・先手';
    elements.whiteLabel.textContent = 'プレイヤー2・後手';
    elements.modeText.textContent = '二人対戦';
  } else if (state.mode === 'cpu-vs-cpu') {
    elements.blackLabel.textContent = `CPU・先手・${difficultyName(state.cpuConfig[BLACK])}`;
    elements.whiteLabel.textContent = `CPU・後手・${difficultyName(state.cpuConfig[WHITE])}`;
    elements.modeText.textContent = `CPU同士・${difficultyName(state.cpuConfig[BLACK])} 対 ${difficultyName(state.cpuConfig[WHITE])}`;
  } else {
    elements.blackLabel.textContent = state.onlineRole === 'host' ? 'あなた・先手' : '対戦相手・先手';
    elements.whiteLabel.textContent = state.onlineRole === 'guest' ? 'あなた・後手' : '対戦相手・後手';
    elements.modeText.textContent = `オンライン・${state.onlineRole === 'host' ? '先手' : '後手'}`;
  }
}

function updateStatusFromState() {
  if (state.gameOver) {
    if (state.endReason === 'repetition') {
      setStatus('千日手で引き分けです');
    } else if (state.winner) {
      setStatus(`${playerName(state.winner)}の勝ちです`);
    } else {
      setStatus('引き分けです');
    }
    return;
  }

  if (state.mode === 'online' && !state.connected) {
    setStatus('対戦相手を待っています', 'waiting');
    return;
  }

  if (currentInCheck) {
    setStatus(`王手・${playerName(state.position.turn)}番です`, 'error');
    return;
  }

  if (state.mode === 'cpu') {
    const humanTurn = state.position.turn === state.humanPlayer;
    setStatus(humanTurn ? 'あなたの番です' : 'CPUが考えています', humanTurn ? 'ok' : 'waiting');
  } else if (state.mode === 'cpu-vs-cpu') {
    setStatus(
      state.cpuVsCpuPaused ? '自動対局を一時停止中' : `${playerName(state.position.turn)}CPUが考えています`,
      'waiting',
    );
  } else if (state.mode === 'online') {
    const myTurn = state.position.turn === myOnlinePlayer();
    setStatus(myTurn ? 'あなたの番です' : '対戦相手の番です', myTurn ? 'ok' : 'waiting');
  } else {
    setStatus(`${playerName(state.position.turn)}番です`);
  }
}

function render() {
  renderCoordinates();
  renderBoard();
  renderHands();
  renderLabels();
  updateStatusFromState();
  elements.undoButton.disabled = history.length === 0 || state.mode === 'online';
  elements.autoPlayButton.hidden = state.mode !== 'cpu-vs-cpu';
  elements.autoPlayButton.textContent = state.cpuVsCpuPaused ? '再開' : '一時停止';
}

function selectBoardPiece(index) {
  const piece = state.position.board[index];
  if (!canLocalPlayerMove() || piece?.owner !== state.position.turn) return;
  const moves = legalMoves.filter((move) => move.kind === 'move' && move.from === index);
  if (moves.length === 0) {
    selected = null;
    showToast('この駒は現在動かせません。');
  } else {
    selected = { kind: 'board', from: index };
  }
  render();
}

function selectHandPiece(player, pieceType) {
  if (!canLocalPlayerMove() || player !== state.position.turn) return;
  const moves = legalMoves.filter((move) => move.kind === 'drop' && move.pieceType === pieceType);
  if (moves.length === 0) {
    selected = null;
    showToast('この持ち駒を打てる場所がありません。');
  } else {
    selected = { kind: 'hand', player, pieceType };
  }
  render();
}

function onCellClick(index) {
  if (!canLocalPlayerMove()) return;
  const candidates = selectedMoves().filter((move) => move.to === index);
  if (candidates.length > 0) {
    if (candidates.length === 2 && candidates.some((move) => move.promote) && candidates.some((move) => !move.promote)) {
      pendingPromotionMoves = candidates;
      elements.promotionBackdrop.classList.add('is-visible');
      return;
    }
    submitHumanMove(candidates[0]);
    return;
  }

  const piece = state.position.board[index];
  if (piece?.owner === state.position.turn) {
    selectBoardPiece(index);
  } else {
    selected = null;
    render();
  }
}

function commitMove(move, options = {}) {
  const saveHistory = options.saveHistory !== false;
  if (saveHistory) history.push(snapshot());
  state.position = applyMove(state.position, move);
  state.version += 1;
  selected = null;

  const hash = positionHash(state.position);
  const count = (repetitionCounts.get(hash) || 0) + 1;
  repetitionCounts.set(hash, count);
  if (count >= 4) {
    state.gameOver = true;
    state.winner = null;
    state.endReason = 'repetition';
    legalMoves = [];
    currentInCheck = false;
  } else {
    refreshDerived();
  }
  render();
}

function submitHumanMove(move) {
  if (state.mode === 'online' && state.onlineRole === 'guest') {
    const sent = online?.send({ type: 'move', move, version: state.version });
    selected = null;
    render();
    if (sent) setStatus('指し手を送信しました', 'waiting');
    return;
  }

  commitMove(move, { saveHistory: state.mode !== 'online' });
  if (state.mode === 'online' && state.onlineRole === 'host') broadcastState();
  maybeRunCpu();
}

function cpuDifficultyForTurn() {
  return state.mode === 'cpu-vs-cpu' ? state.cpuConfig[state.position.turn] : cpuDifficulty;
}

function cpuDelayMs() {
  if (state.mode === 'cpu-vs-cpu') return state.cpuDelay;
  return cpuDifficulty === 'hard' ? 180 : 300;
}

function maybeRunCpu() {
  cpuToken += 1;
  const token = cpuToken;
  if (!isCpuTurn()) {
    elements.thinkingBadge.hidden = true;
    return;
  }

  const expectedVersion = state.version;
  const expectedTurn = state.position.turn;
  const position = clonePosition(state.position);
  const difficulty = cpuDifficultyForTurn();
  elements.thinkingBadge.hidden = false;

  setTimeout(async () => {
    if (token !== cpuToken || !isCpuTurn() || state.version !== expectedVersion || state.position.turn !== expectedTurn) return;
    try {
      const move = await chooseCpuMove(position, difficulty, {
        timeLimitMs: difficulty === 'hard' ? 520 : difficulty === 'normal' ? 170 : 40,
      });
      if (token !== cpuToken || !isCpuTurn() || state.version !== expectedVersion || state.position.turn !== expectedTurn) return;
      elements.thinkingBadge.hidden = true;
      if (move) commitMove(move, { saveHistory: true });
      maybeRunCpu();
    } catch (error) {
      elements.thinkingBadge.hidden = true;
      console.error('CPU move failed.', error);
      showToast('CPUの指し手生成に失敗しました。新しい対局を開始してください。');
    }
  }, cpuDelayMs());
}

function startCpuMode(humanPlayer) {
  stopOnline();
  preferredHumanPlayer = humanPlayer === WHITE ? WHITE : BLACK;
  localStorage.setItem('pocketShogiSide', preferredHumanPlayer === WHITE ? 'white' : 'black');
  state = createState({ mode: 'cpu', humanPlayer: preferredHumanPlayer, viewPlayer: preferredHumanPlayer });
  history = [];
  selected = null;
  initializeRepetition();
  refreshDerived();
  closeModal();
  render();
  maybeRunCpu();
}

function startLocalMode() {
  stopOnline();
  state = createState({ mode: 'local', viewPlayer: BLACK });
  history = [];
  selected = null;
  initializeRepetition();
  refreshDerived();
  closeModal();
  render();
}

function startCpuVsCpuMode() {
  stopOnline();
  const blackDifficulty = DIFFICULTIES.has(elements.blackCpuDifficulty.value) ? elements.blackCpuDifficulty.value : 'normal';
  const whiteDifficulty = DIFFICULTIES.has(elements.whiteCpuDifficulty.value) ? elements.whiteCpuDifficulty.value : 'normal';
  state = createState({
    mode: 'cpu-vs-cpu',
    viewPlayer: BLACK,
    cpuConfig: { [BLACK]: blackDifficulty, [WHITE]: whiteDifficulty },
    cpuDelay: Number(elements.cpuVsCpuSpeed.value) || 650,
    cpuVsCpuPaused: false,
  });
  history = [];
  selected = null;
  initializeRepetition();
  refreshDerived();
  closeModal();
  render();
  maybeRunCpu();
}

function resetCurrentGame() {
  if (state.mode === 'online' && state.onlineRole === 'guest') {
    online?.send({ type: 'new-game' });
    showToast('新しい対局をリクエストしました。');
    return;
  }

  resetPosition();
  if (state.mode === 'online' && state.onlineRole === 'host') broadcastState();
  maybeRunCpu();
}

function undoMove() {
  if (history.length === 0 || state.mode === 'online') return;
  cpuToken += 1;
  elements.thinkingBadge.hidden = true;

  let previous = history.pop();
  if (state.mode === 'cpu') {
    while (previous && previous.position.turn !== state.humanPlayer && history.length > 0) {
      previous = history.pop();
    }
  }
  if (state.mode === 'cpu-vs-cpu') state.cpuVsCpuPaused = true;
  restoreSnapshot(previous);
  render();
}

function openModal(view = 'modes') {
  elements.modalBackdrop.classList.add('is-visible');
  showModalView(view);
}

function closeModal() {
  elements.modalBackdrop.classList.remove('is-visible');
}

function showModalView(view) {
  elements.modeChooser.hidden = view !== 'modes';
  elements.cpuPanel.hidden = view !== 'cpu';
  elements.cpuVsCpuPanel.hidden = view !== 'cpu-vs-cpu';
  elements.onlinePanel.hidden = view !== 'online';
  elements.waitingPanel.hidden = view !== 'waiting';
}

function stopOnline() {
  if (online) online.destroy();
  online = null;
}

function setupOnlineSession() {
  cpuToken += 1;
  elements.thinkingBadge.hidden = true;
  stopOnline();
  online = new OnlineSession();

  online.addEventListener('ready', (event) => {
    elements.roomCodeText.textContent = event.detail.roomCode;
    elements.onlineStatusText.textContent = online.role === 'host'
      ? '対戦相手が参加するまで、この画面を開いたままにしてください。'
      : 'ホストへ接続しています…';
  });

  online.addEventListener('connected', () => {
    state.connected = true;
    elements.waitingTitle.textContent = '対戦相手が接続しました';
    elements.onlineStatusText.textContent = '対局を開始します…';
    if (online.role === 'host') {
      state = createState({ mode: 'online', onlineRole: 'host', connected: true, viewPlayer: BLACK });
      initializeRepetition();
      refreshDerived();
      broadcastState();
      setTimeout(closeModal, 450);
      render();
    }
  });

  online.addEventListener('message', (event) => handleOnlineMessage(event.detail.data));
  online.addEventListener('disconnected', (event) => {
    state.connected = false;
    render();
    showToast(event.detail.message || '対戦相手との接続が切れました。');
  });
  online.addEventListener('error', (event) => {
    elements.onlineStatusText.textContent = event.detail.message;
    setStatus(event.detail.message, 'error');
    showToast(event.detail.message);
  });
}

function hostOnlineGame() {
  setupOnlineSession();
  showModalView('waiting');
  elements.waitingTitle.textContent = '対戦相手を待っています…';
  elements.roomCodeBox.hidden = false;
  elements.shareRoomButton.hidden = false;
  elements.onlineStatusText.textContent = '部屋を作成しています…';
  try {
    const code = online.host();
    state = createState({ mode: 'online', onlineRole: 'host', connected: false, viewPlayer: BLACK });
    initializeRepetition();
    refreshDerived();
    elements.roomCodeText.textContent = code;
    render();
  } catch (error) {
    elements.onlineStatusText.textContent = error.message;
  }
}

function joinOnlineGame() {
  const code = normalizeRoomCode(elements.roomCodeInput.value);
  elements.roomCodeInput.value = code;
  if (code.length !== 6) {
    showToast('6文字の合言葉を入力してください。');
    return;
  }

  setupOnlineSession();
  showModalView('waiting');
  elements.waitingTitle.textContent = '部屋へ接続しています…';
  elements.roomCodeBox.hidden = false;
  elements.shareRoomButton.hidden = true;
  elements.roomCodeText.textContent = code;
  elements.onlineStatusText.textContent = 'ホストを探しています…';
  state = createState({ mode: 'online', onlineRole: 'guest', connected: false, viewPlayer: WHITE });
  initializeRepetition();
  refreshDerived();
  render();
  try {
    online.join(code);
  } catch (error) {
    elements.onlineStatusText.textContent = error.message;
  }
}

function serializableState() {
  return {
    position: serializePosition(state.position),
    gameOver: state.gameOver,
    winner: state.winner,
    endReason: state.endReason,
    version: state.version,
  };
}

function broadcastState() {
  online?.send({ type: 'state', state: serializableState() });
}

function handleOnlineMessage(message) {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'state' && online.role === 'guest') {
    try {
      const incoming = message.state;
      state.position = deserializePosition(incoming.position);
      state.mode = 'online';
      state.onlineRole = 'guest';
      state.connected = true;
      state.viewPlayer = WHITE;
      state.gameOver = Boolean(incoming.gameOver);
      state.winner = incoming.winner || null;
      state.endReason = incoming.endReason || null;
      state.version = Number(incoming.version) || 0;
      selected = null;
      history = [];
      initializeRepetition();
      if (state.gameOver) {
        legalMoves = [];
        currentInCheck = false;
      } else {
        refreshDerived();
      }
      closeModal();
      render();
    } catch (error) {
      console.error('Invalid online state.', error);
      showToast('受信した局面を読み込めませんでした。');
    }
    return;
  }

  if (message.type === 'move' && online.role === 'host') {
    if (message.version !== state.version || state.gameOver || state.position.turn !== WHITE) {
      broadcastState();
      return;
    }
    const incomingKey = moveKey(message.move || {});
    const legal = legalMoves.find((move) => moveKey(move) === incomingKey);
    if (!legal) {
      broadcastState();
      return;
    }
    commitMove(legal, { saveHistory: false });
    broadcastState();
    return;
  }

  if (message.type === 'new-game' && online.role === 'host') resetCurrentGame();
}

async function shareRoom() {
  const code = online?.roomCode || elements.roomCodeText.textContent;
  const url = new URL(window.location.href);
  url.searchParams.set('room', code);
  const text = `ポケット将棋の部屋「${code}」で対局しましょう。`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ポケット将棋', text, url: url.toString() });
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('招待内容をクリップボードへコピーしました。');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showToast('招待を共有できませんでした。');
  }
}

for (const button of document.querySelectorAll('[data-difficulty]')) {
  button.classList.toggle('is-selected', button.dataset.difficulty === cpuDifficulty);
  button.addEventListener('click', () => {
    cpuDifficulty = button.dataset.difficulty;
    localStorage.setItem('pocketShogiDifficulty', cpuDifficulty);
    for (const other of document.querySelectorAll('[data-difficulty]')) {
      other.classList.toggle('is-selected', other === button);
    }
    render();
  });
}

elements.promoteButton.addEventListener('click', () => {
  const move = pendingPromotionMoves?.find((candidate) => candidate.promote);
  pendingPromotionMoves = null;
  elements.promotionBackdrop.classList.remove('is-visible');
  if (move) submitHumanMove(move);
});
elements.declinePromotionButton.addEventListener('click', () => {
  const move = pendingPromotionMoves?.find((candidate) => !candidate.promote);
  pendingPromotionMoves = null;
  elements.promotionBackdrop.classList.remove('is-visible');
  if (move) submitHumanMove(move);
});

elements.undoButton.addEventListener('click', undoMove);
elements.newGameButton.addEventListener('click', resetCurrentGame);
elements.autoPlayButton.addEventListener('click', () => {
  if (state.mode !== 'cpu-vs-cpu') return;
  state.cpuVsCpuPaused = !state.cpuVsCpuPaused;
  cpuToken += 1;
  elements.thinkingBadge.hidden = state.cpuVsCpuPaused;
  render();
  if (!state.cpuVsCpuPaused) maybeRunCpu();
});
elements.menuButton.addEventListener('click', () => openModal('modes'));
elements.onlineButton.addEventListener('click', () => openModal('online'));
elements.closeModalButton.addEventListener('click', closeModal);
elements.modalBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.modalBackdrop) closeModal();
});
elements.cpuModeButton.addEventListener('click', () => showModalView('cpu'));
elements.playBlackButton.addEventListener('click', () => startCpuMode(BLACK));
elements.playWhiteButton.addEventListener('click', () => startCpuMode(WHITE));
elements.localModeButton.addEventListener('click', startLocalMode);
elements.cpuVsCpuModeButton.addEventListener('click', () => showModalView('cpu-vs-cpu'));
elements.startCpuVsCpuButton.addEventListener('click', startCpuVsCpuMode);
elements.onlineModeButton.addEventListener('click', () => showModalView('online'));
for (const button of document.querySelectorAll('.back-to-modes')) {
  button.addEventListener('click', () => showModalView('modes'));
}
elements.createRoomButton.addEventListener('click', hostOnlineGame);
elements.joinRoomButton.addEventListener('click', joinOnlineGame);
elements.roomCodeInput.addEventListener('input', () => {
  elements.roomCodeInput.value = normalizeRoomCode(elements.roomCodeInput.value);
});
elements.roomCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinOnlineGame();
});
elements.shareRoomButton.addEventListener('click', shareRoom);
elements.cancelOnlineButton.addEventListener('click', () => {
  stopOnline();
  state = createState({ mode: 'cpu', humanPlayer: preferredHumanPlayer, viewPlayer: preferredHumanPlayer });
  history = [];
  selected = null;
  initializeRepetition();
  refreshDerived();
  render();
  maybeRunCpu();
  showModalView('online');
});

const invitedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get('room'));
if (invitedRoom.length === 6) {
  elements.roomCodeInput.value = invitedRoom;
  showModalView('online');
}

initializeRepetition();
refreshDerived();
render();
maybeRunCpu();

window.addEventListener('pagehide', () => {
  dqnClient.destroy();
  stopOnline();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
