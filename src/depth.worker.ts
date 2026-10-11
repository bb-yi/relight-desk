/// <reference lib="webworker" />
import { env, pipeline, RawImage } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
// Vite ships the WASM runtime with the app; only model assets are fetched externally.
env.backends.onnx.wasm!.numThreads = 1;
let estimator: any = null;
let currentBackend = '';
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const { id, pixels, width, height, backend } = event.data;
  queue = queue.then(async () => {
    try {
      if (!estimator || currentBackend !== backend) {
        if (estimator) await estimator.dispose(); estimator = null;
        const opts = { device: backend, dtype: 'fp32', progress_callback: (p: any) => self.postMessage({ type: 'progress', id, progress: p }) };
        estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', opts as any);
        currentBackend = backend;
      }
      self.postMessage({ type: 'running', id, backend });
      const result = await estimator(new RawImage(new Uint8ClampedArray(pixels), width, height, 4));
      const tensor = result.predicted_depth;
      if (!tensor || tensor.dims.length < 2) throw new Error('模型没有返回浮点深度。');
      const depth = Float32Array.from(tensor.data as ArrayLike<number>);
      const dims = tensor.dims;
      self.postMessage({ type: 'result', id, backend, depth: depth.buffer, width: dims[dims.length - 1], height: dims[dims.length - 2] }, { transfer: [depth.buffer] });
    } catch (error) {
      self.postMessage({ type: 'error', id, backend, message: error instanceof Error ? error.message : String(error) });
    }
  });
};
