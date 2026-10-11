import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { FloatType } from 'three';
import type { Channels, Light, Settings, SettingsFile } from './types';
import { defaults, validateSize } from './types';

export async function readImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('主图仅支持 PNG、JPEG、WebP。');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error('图片超过 2400 万像素，请先缩小后导入。');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally { bitmap.close(); }
}
export async function readChannel(file: File, kind: 'normal' | 'depth' | 'mask', channels: Channels) {
  let data: Float32Array, stride: number, exr = false;
  if (/\.exr$/i.test(file.name)) {
    exr = true;
    const map = new EXRLoader().setDataType(FloatType).parse(await file.arrayBuffer());
    validateSize(map.width, map.height, channels);
    data = map.data as Float32Array; stride = data.length / (map.width * map.height);
    // EXRLoader returns bottom-up scanlines. CPU channel arrays use top-down scanlines.
    const topDown = new Float32Array(data.length);
    for (let y = 0; y < map.height; y++) topDown.set(data.subarray(y * map.width * stride, (y + 1) * map.width * stride), (map.height - 1 - y) * map.width * stride);
    data = topDown;
  } else {
    if (file.type !== 'image/png') throw new Error('数据通道只支持 PNG 或独立 RGB EXR。');
    const map = await readImage(file); validateSize(map.width, map.height, channels);
    data = Float32Array.from(map.data, v => v / 255); stride = 4;
  }
  const components = kind === 'normal' ? 3 : 1, out = new Float32Array(channels.width * channels.height * components);
  for (let i = 0; i < channels.width * channels.height; i++) for (let k = 0; k < components; k++) {
    let v = data[i * stride + k];
    if (!Number.isFinite(v)) v = 0;
    out[i * components + k] = kind === 'normal' && !exr ? v * 2 - 1 : v;
  }
  return out;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function encodeFloatDepth(depth: Float32Array, width: number, height: number) {
  // PFM: little-endian float32, bottom-up rows; supported by scientific imaging tools.
  const header = new TextEncoder().encode(`Pf\n${width} ${height}\n-1.0\n`);
  const bytes = new Uint8Array(header.length + depth.length * 4); bytes.set(header);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) view.setFloat32(header.length + ((height - 1 - y) * width + x) * 4, depth[y * width + x], true);
  return bytes;
}
export function parseSettings(text: string): SettingsFile {
  const obj = JSON.parse(text);
  if (obj.version !== 1 || !Array.isArray(obj.lights) || obj.lights.length < 1 || obj.lights.length > 8) throw new Error('设置文件版本或灯光数量不支持。');
  const baseline = defaults(), s = obj.settings;
  if (!s || Object.entries(baseline).some(([k, v]) => typeof s[k] !== typeof v)) throw new Error('设置文件字段不完整。');
  if (Object.values(s).some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('设置包含无效数值。');
  if (!/^#[0-9a-f]{6}$/i.test(s.ambientColor)) throw new Error('环境色无效。');
  const limits: Partial<Record<keyof Settings, [number, number]>> = { comparison: [0, 1], mix: [0, 1], ambient: [0, 2], wrap: [0, 1], threshold: [-1, 1], feather: [.001, .5], bias: [.0001, .1], softness: [0, .25], specular: [0, 2], shininess: [1, 256], rim: [0, 2], exposure: [-3, 3], height: [.01, 2], smooth: [0, 4], normalStrength: [.1, 3] };
  for (const [key, range] of Object.entries(limits)) if (s[key] < range![0] || s[key] > range![1]) throw new Error(`参数 ${key} 超出范围。`);
  if (s.depthMax <= s.depthMin) throw new Error('深度上限必须大于下限。');
  if (!['lit', 'compare', 'original', 'normal', 'depth', 'lighting', 'shadow'].includes(s.view)) throw new Error('视图无效。');
  for (const l of obj.lights) {
    if (!Number.isInteger(l.id) || typeof l.name !== 'string' || typeof l.enabled !== 'boolean' || !Array.isArray(l.position) || l.position.length !== 3 || l.position.some((v: number) => !Number.isFinite(v) || Math.abs(v) > 100) || !Number.isFinite(l.intensity) || l.intensity < 0 || l.intensity > 8 || !Number.isFinite(l.range) || l.range < .2 || l.range > 8 || !/^#[0-9a-f]{6}$/i.test(l.color)) throw new Error('灯光参数无效。');
  }
  if (new Set(obj.lights.map((l: Light) => l.id)).size !== obj.lights.length) throw new Error('灯光编号重复。');
  return { version: 1, settings: { ...baseline, ...s }, lights: obj.lights };
}
