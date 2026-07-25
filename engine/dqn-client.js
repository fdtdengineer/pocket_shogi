/**
 * DQN inference adapter.
 *
 * Keep this public interface stable when a trained model is added later:
 *   const client = new DqnClient();
 *   await client.ensureReady();
 *   const move = await client.chooseMove(position, legalMoves);
 *
 * A future implementation can load ONNX Runtime Web, TensorFlow.js, or a
 * hand-written compact network without changing app.js.
 */
export class DqnClient {
  constructor(options = {}) {
    this.modelUrl = options.modelUrl || './models/shogi-dqn.onnx';
    this.ready = false;
  }

  async ensureReady() {
    throw new Error('DQN model is not implemented yet.');
  }

  async chooseMove(_position, _legalMoves) {
    throw new Error('DQN model is not implemented yet.');
  }

  destroy() {
    this.ready = false;
  }
}
