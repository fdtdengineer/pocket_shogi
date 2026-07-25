export const FEATURES1_NUM = 62;
export const FEATURES2_NUM = 57;
export const BOARD_SIZE = 9;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;
export const POLICY_PLANES = 27;
export const POLICY_SIZE = POLICY_PLANES * SQUARES;

export const PIECE_PLANE_INDEX = Object.freeze({
  P: 0,
  L: 1,
  N: 2,
  S: 3,
  B: 4,
  R: 5,
  G: 6,
  K: 7,
  '+P': 8,
  '+L': 9,
  '+N': 10,
  '+S': 11,
  '+B': 12,
  '+R': 13,
});

export const HAND_FEATURES = Object.freeze([
  Object.freeze({ type: 'P', planes: 8 }),
  Object.freeze({ type: 'L', planes: 4 }),
  Object.freeze({ type: 'N', planes: 4 }),
  Object.freeze({ type: 'S', planes: 4 }),
  Object.freeze({ type: 'G', planes: 4 }),
  Object.freeze({ type: 'B', planes: 2 }),
  Object.freeze({ type: 'R', planes: 2 }),
]);

export const DROP_PLANE_INDEX = Object.freeze({
  P: 20,
  L: 21,
  N: 22,
  S: 23,
  G: 24,
  B: 25,
  R: 26,
});

export const SEARCH_PRESETS = Object.freeze({
  light: Object.freeze({ playouts: 16, batchSize: 2, timeLimitMs: 2500 }),
  standard: Object.freeze({ playouts: 32, batchSize: 4, timeLimitMs: 4500 }),
  strong: Object.freeze({ playouts: 64, batchSize: 4, timeLimitMs: 8000 }),
});

export const DEFAULT_SEARCH_OPTIONS = Object.freeze({
  ...SEARCH_PRESETS.standard,
  cPuct: 1.5,
  virtualLoss: 1.0,
  maxSearchPly: 256,
});

export const DEFAULT_MODEL_URL = './models/alphasho-mobile.onnx';
export const DEFAULT_METADATA_URL = './models/alphasho-mobile.json';
export const DEFAULT_ORT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/+esm';
export const DEFAULT_ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
