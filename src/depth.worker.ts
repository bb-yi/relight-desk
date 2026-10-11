/// <reference lib="webworker" />
import { env, pipeline, RawImage } from '@huggingface/transformers';
// Models are managed disk files served by our local read-only HTTP server.
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = false;
env.useFSCache = false;
// Vite ships the WASM runtime with the app. No browser request to a model hub.
env.backends.onnx.wasm!.numThreads = 1;
let estimator: any = null;
let currentBackend = '';
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const { id, pixels, width, height, backend } = event.data;
  queue = queue.then(async () => {
    try {
      if (!estimator || currentBackend !== backend) {
        const check = await fetch('/models/onnx-community/depth-anything-v2-small/onnx/model.onnx', { method: 'HEAD', cache: 'no-store' });
        if (!check.ok) throw new Error('本地模型文件缺失，请在项目目录运行 npm start 准备模型，或检查 --model-dir 路径。');
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
