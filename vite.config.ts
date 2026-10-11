import { defineConfig } from 'vite';
import { modelMiddleware } from './scripts/server.mjs';
export default defineConfig({
  plugins: [{ name: 'local-model-files', configureServer(server) { server.middlewares.use(modelMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(modelMiddleware()); } }],
  // Prebundle the lazily-created worker dependency too; otherwise its first use can
  // trigger a Vite full reload and interrupt the first model download in development.
  optimizeDeps: { include: ['three', 'three/addons/loaders/EXRLoader.js', '@huggingface/transformers'] },
  worker: { format: 'es' },
  // QA exports may be locked briefly by Windows image readers; they are not source.
  server: { watch: { ignored: ['**/verification/**', '**/.cache/**', '**/test-results/**', '**/models/**'] } },
});
