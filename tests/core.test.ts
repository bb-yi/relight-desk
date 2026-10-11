import { describe, it, expect } from 'vitest';
import { normalizeDepth, heightNormal, visibility } from '../src/math';
import { defaults, makeLight, validateSize } from '../src/types';
import { createDemo } from '../src/demo';
import { encodeFloatDepth, parseSettings, readChannel } from '../src/io';
import { DataTexture, FloatType, RGBAFormat } from 'three';
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js';
import { preset } from '../src/presets';

describe('floating depth', () => {
  it('preserves gradients without 8-bit quantization', () => {
    const values = Float32Array.from({ length: 1000 }, (_, i) => i / 999);
    expect(new Set(normalizeDepth(values)).size).toBe(1000);
  });
  it('handles flat, invalid and inverted input', () => {
    expect([...normalizeDepth(new Float32Array([4, 4, NaN, Infinity]))]).toEqual([0, 0, 0, 0]);
    expect([...normalizeDepth(new Float32Array([2, 3, 4]), true)]).toEqual([1, .5, 0]);
    expect([...normalizeDepth(new Float32Array([-10, 0, 20]), false, [0, 10])]).toEqual([0, 0, 1]);
  });
  it('encodes float PFM with bottom-up rows and little endian samples', () => {
    const out = encodeFloatDepth(new Float32Array([.1, .2, .3, .4]), 2, 2);
    const header = new TextEncoder().encode('Pf\n2 2\n-1.0\n');
    expect(new TextDecoder().decode(out.subarray(0, header.length))).toBe('Pf\n2 2\n-1.0\n');
    const view = new DataView(out.buffer);expect(view.getFloat32(header.length, true)).toBeCloseTo(.3);
    expect(view.getFloat32(header.length + 12, true)).toBeCloseTo(.2);
  });
});
describe('surface and occlusion', () => {
  it('flat surfaces have a front-facing normal, without self-shadow', () => {
    expect(heightNormal(new Float32Array(35).fill(.3), 5, 7, 2, 3)).toEqual([-0, -0, 1]);
    expect(visibility(() => .3, [0, 0, .3], [.7, -.9, 1.5])).toBe(1);
  });
  it('foreground blocks light for a receiver, moving the light clears it', () => {
    const field = (x: number) => Math.abs(x - .3) < .08 ? .7 : 0;
    expect(visibility(field, [0, 0, 0], [1, 0, 1])).toBe(0);
    expect(visibility(field, [0, 0, 0], [-1, 0, 1])).toBe(1);
    expect(visibility(() => null, [0, 0, 0], [1, 0, 1])).toBe(1);
  });
  it('non-square maps use consistent metric slopes', () => {
    const make = (w: number, h: number) => Float32Array.from({length:w*h}, (_, i) => (i % w) * 2 / h * .1);
    expect(heightNormal(make(20, 40), 20, 40, 10, 20)[0]).toBeCloseTo(heightNormal(make(40, 40), 40, 40, 20, 20)[0]);
  });
  it('demo has finite depth, unit normals, a foreground arm and receiving background', () => {
    const demo = createDemo(128, 192);expect(demo.depth.length).toBe(128 * 192);
    expect([...demo.depth].every(Number.isFinite)).toBe(true);
    expect(Math.max(...demo.depth)).toBeGreaterThan(.85);
    expect(demo.depth[0]).toBe(0);
    for(let i=0;i<demo.normal!.length;i+=3) expect(Math.hypot(...demo.normal!.subarray(i,i+3))).toBeCloseTo(1,4);
  });
});
describe('input contracts', () => {
  it('reads signed float EXR without gamma conversion and restores scanline direction', async () => {
    const raw = new Float32Array([.6,0,.8,1, -.6,0,.8,1, 0,.8,.6,1, 0,-.8,.6,1]);
    const tex = new DataTexture(raw,2,2,RGBAFormat,FloatType);
    const exr = await new EXRExporter().parse(tex,{type:FloatType,compression:0});
    const file = new File([exr as Uint8Array<ArrayBuffer>],'normal.exr');
    const channel = await readChannel(file,'normal',{width:2,height:2} as any);
    expect([...channel]).toEqual([...raw.subarray(8,11),...raw.subarray(12,15),...raw.subarray(0,3),...raw.subarray(4,7)]);
    const depth = await readChannel(file,'depth',{width:2,height:2} as any);
    expect(depth[2]).toBeCloseTo(.6);expect(depth[3]).toBeCloseTo(-.6);
  });
  it('rejects wrong dimensions instead of stretching', () => {
    expect(() => validateSize(128, 128, {width:128,height:192})).toThrow('不一致');
  });
  it('round trips settings, rejects malformed lights and parameters', () => {
    const file = {version:1,settings:defaults(),lights:[makeLight(1)]};
    expect(parseSettings(JSON.stringify(file))).toEqual(file);
    expect(() => parseSettings(JSON.stringify({...file, version:2}))).toThrow();
    expect(() => parseSettings(JSON.stringify({...file, lights:[{...makeLight(1),range:-1}]}))).toThrow();
    expect(() => parseSettings(JSON.stringify({...file, settings:{...defaults(),height:100}}))).toThrow();
  });
  it('all presets contain editable valid light lists', () => {
    for(let i=0;i<6;i++){const p=preset(i);expect(parseSettings(JSON.stringify({version:1,settings:{...defaults(),...p.settings},lights:p.lights})).lights.length).toBe(i===5?2:1);}
  });
});
