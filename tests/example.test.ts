import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RawImage } from '@huggingface/transformers';
import { decodeExampleDepth, useBakedNormal } from '../src/example';
import { defaults, type Channels } from '../src/types';
import manifest from '../public/example/manifest.json';

const asset = (name: string) => readFileSync(`public/example/${name}`);
describe('bundled illustration', () => {
  it('ships every asset with matching bytes and SHA256', () => {
    for (const [name, expected] of Object.entries(manifest.files)) {
      const bytes = asset(name);
      expect(bytes.length, name).toBe(expected.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(expected.sha256);
    }
  });
  it('uses matching dimensions and preserves the full-resolution original separately', () => {
    for (const name of ['color.png', 'normal.png', 'depth-preview.png', 'original.png']) {
      const png = asset(name), original = name === 'original.png';
      expect(png.readUInt32BE(16), name).toBe(original ? manifest.originalWidth : manifest.width);
      expect(png.readUInt32BE(20), name).toBe(original ? manifest.originalHeight : manifest.height);
    }
  });
  it('loads real finite float depth, not the quantized preview', () => {
    const buffer = Uint8Array.from(asset('depth.f32')).buffer;
    const depth = decodeExampleDepth(buffer, manifest.width, manifest.height);
    let min = Infinity, max = -Infinity, non8bit = 0;
    for (const v of depth) { min = Math.min(min, v);max = Math.max(max, v);if (Math.abs(v * 255 - Math.round(v * 255)) > .001) non8bit++; }
    expect(min).toBe(0);expect(max).toBe(1);expect(non8bit / depth.length).toBeGreaterThan(.9);
  });
  it('rejects truncated, nonfinite and out-of-range depth', () => {
    expect(() => decodeExampleDepth(new ArrayBuffer(3), 1, 1)).toThrow();
    for (const value of [NaN, Infinity, -1, 2]) {
      const buffer = new ArrayBuffer(4);new DataView(buffer).setFloat32(0, value, true);
      expect(() => decodeExampleDepth(buffer, 1, 1)).toThrow();
    }
  });
  it('contains valid camera-facing unit normals across the entire image, including bottom rows', async () => {
    const image = await RawImage.read('public/example/normal.png');
    let minLength = Infinity, maxLength = 0, minZ = Infinity;
    for (let i = 0; i < image.width * image.height; i++) {
      const n = [0,1,2].map(k => image.data[i * image.channels + k] / 255 * 2 - 1);
      const length = Math.hypot(...n);minLength = Math.min(minLength, length);maxLength = Math.max(maxLength, length);minZ = Math.min(minZ, n[2]);
    }
    expect(minLength).toBeGreaterThan(.99);expect(maxLength).toBeLessThan(1.01);expect(minZ).toBeGreaterThan(0);
  });
  it('recomputes baked normals when surface parameters change but preserves imported normals', () => {
    const channels: Channels = { width: 1, height: 1, color: new Uint8ClampedArray(4), depth: new Float32Array(1),
      normal: new Float32Array([0,0,1]), normalBasis: manifest.normalBasis, source: 'bundled', name: 'test' };
    expect(useBakedNormal(channels, defaults())).toBe(true);
    for (const override of [{ height: 1 }, { smooth: 2 }, { lineAssist: false }, { invert: true }, { autoDepthRange: false }])
      expect(useBakedNormal(channels, { ...defaults(), ...override })).toBe(false);
    expect(useBakedNormal({ ...channels, normalBasis: undefined }, { ...defaults(), height: 2 })).toBe(true);
    expect(useBakedNormal({ ...channels, normal: undefined }, defaults())).toBe(false);
  });
});
