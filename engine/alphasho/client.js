import { serializePosition } from '../shogi.js';
import {
  DEFAULT_METADATA_URL,
  DEFAULT_MODEL_URL,
  DEFAULT_ORT_MODULE_URL,
  DEFAULT_ORT_WASM_PATH,
  SEARCH_PRESETS,
} from './constants.js';

const DATABASE_NAME = 'pocket-shogi-ai';
const DATABASE_VERSION = 1;
const STORE_NAME = 'models';
const CUSTOM_MODEL_KEY = 'alphasho-custom';
const MAX_MODEL_BYTES = 64 * 1024 * 1024;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function readStoredModel() {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(CUSTOM_MODEL_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Stored model read failed'));
    transaction.oncomplete = () => database.close();
  });
}

async function writeStoredModel(record) {
  const database = await openDatabase();
  if (!database) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record, CUSTOM_MODEL_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Stored model write failed'));
  });
  database.close();
}

async function deleteStoredModel() {
  const database = await openDatabase();
  if (!database) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(CUSTOM_MODEL_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Stored model delete failed'));
  });
  database.close();
}

export class AlphaShoClient extends EventTarget {
  constructor(options = {}) {
    super();
    this.modelUrl = new URL(options.modelUrl || DEFAULT_MODEL_URL, globalThis.location?.href || import.meta.url).href;
    this.metadataUrl = new URL(options.metadataUrl || DEFAULT_METADATA_URL, globalThis.location?.href || import.meta.url).href;
    this.ortModuleUrl = options.ortModuleUrl || DEFAULT_ORT_MODULE_URL;
    this.ortWasmPath = options.ortWasmPath || DEFAULT_ORT_WASM_PATH;
    this.worker = null;
    this.pending = new Map();
    this.sequence = 0;
    this.ready = false;
    this.modelInfo = null;
    this.loading = null;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'AlphaSho worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.ready = false;
    });
    return this.worker;
  }

  handleMessage(message) {
    if (message.type === 'progress') {
      this.dispatchEvent(new CustomEvent('progress', { detail: message.progress }));
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.type === 'error') pending.reject(new Error(message.error));
    else pending.resolve(message.info || message.result || true);
  }

  request(type, payload = {}, transfer = []) {
    const worker = this.ensureWorker();
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({ type, requestId, ...payload }, transfer);
    });
  }

  async loadSource(source) {
    const transfer = source.kind === 'buffer' ? [source.buffer] : [];
    const info = await this.request('load', {
      source,
      options: {
        ortModuleUrl: this.ortModuleUrl,
        ortWasmPath: this.ortWasmPath,
      },
    }, transfer);
    this.ready = true;
    this.modelInfo = info;
    this.dispatchEvent(new CustomEvent('modelchange', { detail: info }));
    return info;
  }

  async ensureReady() {
    if (this.ready) return this.modelInfo;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      let stored = null;
      try {
        stored = await readStoredModel();
      } catch (error) {
        console.warn('Could not read the stored AlphaSho model.', error);
      }
      if (stored?.buffer) {
        const buffer = stored.buffer.slice(0);
        return this.loadSource({ kind: 'buffer', buffer, name: stored.name || '保存済みモデル' });
      }
      return this.loadSource({ kind: 'url', url: this.modelUrl, name: 'alphasho-mobile.onnx' });
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async loadModelFile(file, { persist = true } = {}) {
    if (!file || !file.name.toLowerCase().endsWith('.onnx')) {
      throw new Error('ONNXモデルを選択してください。');
    }
    if (file.size <= 0 || file.size > MAX_MODEL_BYTES) {
      throw new Error('モデルは64 MB以下にしてください。');
    }
    const original = await file.arrayBuffer();
    if (persist) {
      try {
        await writeStoredModel({ name: file.name, buffer: original.slice(0), savedAt: Date.now() });
      } catch (error) {
        console.warn('Could not persist the AlphaSho model.', error);
      }
    }
    this.ready = false;
    return this.loadSource({ kind: 'buffer', buffer: original, name: file.name });
  }

  async clearStoredModel() {
    try {
      await deleteStoredModel();
    } finally {
      this.ready = false;
      this.modelInfo = null;
      if (this.worker) await this.request('reset');
      this.dispatchEvent(new CustomEvent('modelchange', { detail: null }));
    }
  }

  async chooseMove({
    position,
    repetitionEntries = [],
    preset = 'standard',
    signal = null,
  }) {
    await this.ensureReady();
    const search = SEARCH_PRESETS[preset] || SEARCH_PRESETS.standard;
    const requestId = this.sequence + 1;
    let abortHandler = null;
    if (signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      abortHandler = () => this.worker?.postMessage({ type: 'cancel', requestId });
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    try {
      const response = await this.request('search', {
        position: serializePosition(position),
        repetitionEntries,
        options: search,
      });
      return response;
    } finally {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const pending of this.pending.values()) pending.reject(new Error('AlphaSho client destroyed'));
    this.pending.clear();
  }
}
