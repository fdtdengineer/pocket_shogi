import { deserializePosition } from '../shogi.js';
import {
  DEFAULT_ORT_MODULE_URL,
  DEFAULT_ORT_WASM_PATH,
  FEATURES1_NUM,
  FEATURES2_NUM,
  POLICY_SIZE,
} from './constants.js';
import { encodeBatch } from './encoder.js';
import { runMcts } from './mcts.js';

let ort = null;
let session = null;
let modelInfo = null;
let inputNames = null;
let outputNames = null;
const cancelled = new Set();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function loadOrt(moduleUrl = DEFAULT_ORT_MODULE_URL, wasmPath = DEFAULT_ORT_WASM_PATH) {
  if (ort) return ort;
  const imported = await import(moduleUrl);
  ort = imported.default || imported;
  if (!ort?.InferenceSession || !ort?.Tensor) throw new Error('ONNX Runtime Web could not be initialized');
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = true;
  return ort;
}

function resolveNames(loadedSession) {
  const inputs = loadedSession.inputNames || [];
  const outputs = loadedSession.outputNames || [];
  if (inputs.length !== 2) throw new Error(`AlphaSho model must have two inputs, got ${inputs.length}`);
  if (outputs.length < 2) throw new Error(`AlphaSho model must have policy and value outputs, got ${outputs.length}`);
  return {
    inputs: {
      features1: inputs.includes('features1') ? 'features1' : inputs[0],
      features2: inputs.includes('features2') ? 'features2' : inputs[1],
    },
    outputs: {
      policy: outputs.includes('policy_logits') ? 'policy_logits' : outputs[0],
      value: outputs.includes('value') ? 'value' : outputs[1],
    },
  };
}

async function loadModel(source, options = {}) {
  const runtime = await loadOrt(options.ortModuleUrl, options.ortWasmPath);
  const modelSource = source.kind === 'buffer' ? source.buffer : source.url;
  if (!modelSource) throw new Error('AlphaSho model source is missing');
  session?.release?.();
  session = await runtime.InferenceSession.create(modelSource, {
    executionProviders: ['wasm'],
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
  });
  const names = resolveNames(session);
  inputNames = names.inputs;
  outputNames = names.outputs;
  modelInfo = {
    name: source.name || source.url?.split('/').pop() || 'AlphaSho model',
    source: source.kind,
    inputs: inputNames,
    outputs: outputNames,
  };
  return modelInfo;
}

const evaluator = {
  async evaluateBatch(positions) {
    if (!session || !ort || !inputNames || !outputNames) throw new Error('AlphaSho model is not loaded');
    const encoded = encodeBatch(positions);
    const feeds = {
      [inputNames.features1]: new ort.Tensor(
        'float32',
        encoded.features1,
        [encoded.batchSize, FEATURES1_NUM, 9, 9],
      ),
      [inputNames.features2]: new ort.Tensor(
        'float32',
        encoded.features2,
        [encoded.batchSize, FEATURES2_NUM, 9, 9],
      ),
    };
    const outputs = await session.run(feeds);
    const logits = outputs[outputNames.policy]?.data;
    const values = outputs[outputNames.value]?.data;
    if (!logits || logits.length !== encoded.batchSize * POLICY_SIZE) {
      throw new Error(`Unexpected policy output size: ${logits?.length ?? 0}`);
    }
    if (!values || values.length !== encoded.batchSize) {
      throw new Error(`Unexpected value output size: ${values?.length ?? 0}`);
    }
    return { logits, values };
  },
};

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  const requestId = message.requestId;

  if (message.type === 'cancel') {
    cancelled.add(requestId);
    return;
  }

  try {
    if (message.type === 'load') {
      const info = await loadModel(message.source, message.options);
      self.postMessage({ type: 'loaded', requestId, info });
      return;
    }
    if (message.type === 'reset') {
      session?.release?.();
      session = null;
      modelInfo = null;
      inputNames = null;
      outputNames = null;
      self.postMessage({ type: 'reset', requestId });
      return;
    }
    if (message.type === 'search') {
      if (!session) throw new Error('AlphaSho model is not loaded');
      cancelled.delete(requestId);
      const position = deserializePosition(message.position);
      const result = await runMcts({
        position,
        repetitionEntries: message.repetitionEntries,
        evaluator,
        options: message.options,
        isCancelled: () => cancelled.has(requestId),
        onProgress: (progress) => {
          self.postMessage({ type: 'progress', requestId, progress });
        },
      });
      cancelled.delete(requestId);
      self.postMessage({ type: 'result', requestId, result });
      return;
    }
    throw new Error(`Unknown AlphaSho worker request: ${message.type}`);
  } catch (error) {
    cancelled.delete(requestId);
    self.postMessage({ type: 'error', requestId, error: errorMessage(error) });
  }
});
