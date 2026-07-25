const ROOM_PREFIX = 'pocket-shogi-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .replace(/[IO01]/g, '')
    .slice(0, 6);
}

export function generateRoomCode(random = Math.random) {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class OnlineSession extends EventTarget {
  constructor() {
    super();
    this.peer = null;
    this.connection = null;
    this.role = null;
    this.roomCode = null;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  ensurePeerJs() {
    if (!window.Peer) throw new Error('オンライン対戦ライブラリを読み込めませんでした。');
  }

  destroy() {
    if (this.connection) this.connection.close();
    if (this.peer && !this.peer.destroyed) this.peer.destroy();
    this.connection = null;
    this.peer = null;
    this.role = null;
    this.roomCode = null;
  }

  host(code = generateRoomCode()) {
    this.destroy();
    this.ensurePeerJs();
    this.role = 'host';
    this.roomCode = normalizeRoomCode(code);
    this.peer = new window.Peer(ROOM_PREFIX + this.roomCode.toLowerCase(), { debug: 1 });

    this.peer.on('open', () => this.emit('ready', { role: this.role, roomCode: this.roomCode }));
    this.peer.on('connection', (connection) => {
      if (this.connection?.open) {
        connection.on('open', () => connection.close());
        return;
      }
      this.attachConnection(connection);
    });
    this.attachPeerErrors();
    return this.roomCode;
  }

  join(code) {
    this.destroy();
    this.ensurePeerJs();
    this.role = 'guest';
    this.roomCode = normalizeRoomCode(code);
    if (this.roomCode.length !== 6) throw new Error('6文字の合言葉を入力してください。');

    this.peer = new window.Peer(undefined, { debug: 1 });
    this.peer.on('open', () => {
      const connection = this.peer.connect(ROOM_PREFIX + this.roomCode.toLowerCase(), {
        serialization: 'json',
        reliable: true,
        metadata: { game: 'pocket-shogi', version: 1 },
      });
      this.attachConnection(connection);
    });
    this.attachPeerErrors();
  }

  attachPeerErrors() {
    this.peer.on('error', (error) => {
      let message = error.message || 'オンライン接続に失敗しました。';
      if (error.type === 'unavailable-id') message = 'この合言葉は使用中です。もう一度お試しください。';
      if (error.type === 'peer-unavailable') message = '部屋が見つかりません。合言葉とホストの待機状態を確認してください。';
      this.emit('error', { message, error });
    });
  }

  attachConnection(connection) {
    this.connection = connection;
    connection.on('open', () => this.emit('connected', { role: this.role, roomCode: this.roomCode }));
    connection.on('data', (data) => this.emit('message', { data }));
    connection.on('close', () => this.emit('disconnected', { message: '対戦相手との接続が切れました。' }));
    connection.on('error', (error) => this.emit('error', { message: error.message || '通信エラーが発生しました。', error }));
  }

  send(data) {
    if (!this.connection?.open) return false;
    this.connection.send(data);
    return true;
  }
}
