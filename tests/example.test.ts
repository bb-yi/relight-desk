import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RawImage } from '@huggingface/transformers';
import { decodeExampleDepth, useBakedNormal, exampleSettings } from '../src/example';
import { defaults, type Channels } from '../src/types';
import manifest from '../public/example/manifest.json';

const asset = (name: string) => readFileSync(`public/example/${name}`);
describe('bundled illustration', () => {
  it('restores the owner-authored dual-light settings without rounding positions', () => {
    const config = exampleSettings();
    expect(config.lights).toHaveLength(2);
    expect(config.lights[0]).toMatchObject({ position: [-0.5455302492990204, -0.49313621964097143, 1.6], color: '#fed6ff', intensity: .62, enabled: true });
    expect(config.lights[1]).toMatchObject({ position: [.7560996786174156, .706441393875396, 1.4], color: '#e1bd84', intensity: 1.17, enabled: true });
    expect(config.settings.feather).toBe(.117);
    expect(config.settings.shadows).toBe(true);
    expect(config).toEqual(JSON.parse(asset('settings.json').toString('utf8')));
  });
  it('never mutates stored example settings or generic defaults during editing', () => {
    const first = exampleSettings();first.lights[0].position[0] = 99;first.settings.feather = .4;first.lights.pop();
    const restored = exampleSettings();
    expect(restored.lights).toHaveLength(2);expect(restored.lights[0].position[0]).toBe(-.5455302492990204);
    expect(restored.settings.feather).toBe(.117);expect(defaults().feather).toBe(.08);
  });
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
