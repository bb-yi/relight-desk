// Maintainer-only bake. The shipped example never runs this script on startup.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { env, pipeline, RawImage } from '@huggingface/transformers';
import { modelDirectory, manifest, validModelFile, projectRoot } from './models.mjs';
import { normalizeDepth } from '../src/math.ts';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/bake-example.mjs <source.png>');
const root = modelDirectory();
for (const file of manifest.files) {
  if (!await validModelFile(resolve(root, manifest.id, file.path), file)) throw new Error('Run npm run models:download first');
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = root.replaceAll('\\', '/') + '/';
env.useFSCache = false;
const directory = resolve(projectRoot, 'public/example');
await mkdir(directory, { recursive: true });
const original = await RawImage.read(input);
const scale = Math.min(1, 1536 / Math.max(original.width, original.height));
const width = Math.round(original.width * scale), height = Math.round(original.height * scale);
const image = (await original.resize(width, height)).rgba();
console.log(`Baking ${width}x${height} from ${original.width}x${original.height}; local CPU / FP32`);
const estimator = await pipeline('depth-estimation', manifest.id, { device: 'cpu', dtype: 'fp32' });
let tensor;
// The processor converts its input to RGB in place; keep the RGBA source for baking.
try { tensor = (await estimator(image.clone())).predicted_depth; } finally { await estimator.dispose(); }
const [h, w] = tensor.dims.slice(-2);
const raw = Float32Array.from(tensor.data), resized = new Float32Array(width * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const px = Math.max(0, Math.min(w - 1, (x + .5) * w / width - .5));
  const py = Math.max(0, Math.min(h - 1, (y + .5) * h / height - .5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = px - x0, fy = py - y0;
  resized[y * width + x] = (raw[y0 * w + x0] * (1 - fx) + raw[y0 * w + x1] * fx) * (1 - fy)
    + (raw[y1 * w + x0] * (1 - fx) + raw[y1 * w + x1] * fx) * fy;
}
const depth = normalizeDepth(resized);
// Same default 5x5, color/depth-aware filter and discontinuity handling as shaders.ts.
const filtered = new Float32Array(depth.length), normals = new Uint8ClampedArray(depth.length * 3);
const at = (x, y) => Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = at(x, y); let sum = 0, weights = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const j = at(x + dx, y + dy);
    const colorDistance = Math.hypot(...[0, 1, 2].map(k => (image.data[j * 4 + k] - image.data[i * 4 + k]) / 255));
    const weight = Math.exp(-(dx * dx + dy * dy) / 4 - Math.abs(depth[j] - depth[i]) * 60 - colorDistance * 12);
    sum += depth[j] * weight; weights += weight;
  }
  filtered[i] = sum / weights;
}
function derivative(c, a, b) {
  if (Math.min(Math.abs(a - c), Math.abs(b - c)) > .055) return 0;
  return Math.abs(b - c) < .055 && Math.abs(c - a) < .055 ? (b - a) * .5 : Math.abs(b - c) < Math.abs(c - a) ? b - c : c - a;
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = at(x, y), c = filtered[i];
  const dx = derivative(c, filtered[at(x - 1, y)], filtered[at(x + 1, y)]) * .65 * height * .5;
  const dy = derivative(c, filtered[at(x, y + 1)], filtered[at(x, y - 1)]) * .65 * height * .5;
  const len = Math.hypot(dx, dy, 1);
  normals.set([-dx / len, -dy / len, 1 / len].map(v => Math.round((v * .5 + .5) * 255)), i * 3);
}
const bytes = Buffer.alloc(depth.length * 4);
for (let i = 0; i < depth.length; i++) bytes.writeFloatLE(depth[i], i * 4);
await copyFile(input, resolve(directory, 'original.png'));
await image.save(resolve(directory, 'color.png'));
await writeFile(resolve(directory, 'depth.f32'), bytes);
await new RawImage(Uint8ClampedArray.from(depth, v => Math.round(v * 255)), width, height, 1).save(resolve(directory, 'depth-preview.png'));
await new RawImage(normals, width, height, 3).save(resolve(directory, 'normal.png'));
const files = {};
for (const name of ['original.png', 'color.png', 'depth.f32', 'depth-preview.png', 'normal.png']) {
  const data = await readFile(resolve(directory, name));
  files[name] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({
  version: 1, width, height, originalWidth: original.width, originalHeight: original.height,
  sourceFilename: basename(input), model: manifest.id, revision: manifest.revision,
  backend: 'onnxruntime-node/cpu', dtype: 'fp32', depthEncoding: 'float32-le/top-down/normalized-near-one',
  normalEncoding: 'RGB*2-1; X-right Y-up Z-viewer', normalBasis: { height: .65, smooth: 1, lineAssist: true }, files,
}, null, 2) + '\n');
console.log('Saved original, display image, float depth, preview, normals and manifest to public/example.');
