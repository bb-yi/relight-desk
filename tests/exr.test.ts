import { describe, expect, it } from 'vitest';
import { DataTexture, FloatType, HalfFloatType, RGBAFormat } from 'three';
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js';
import { decodeEXRImage, readImage, readChannel } from '../src/io';

async function fixture(type: typeof FloatType | typeof HalfFloatType = FloatType, compression = 0) {
  // DataTexture/exporter use bottom-up rows. Top: HDR red, 18% grey with alpha.
  const data = new Float32Array([0,0,1,1, 0,1,0,0, 4,0,0,1, .18,.18,.18,.5]);
  // The bundled exporter mishandles ZIP's uncompressed fallback on tiny images.
  // Use a complete, compressible 16-row block to test actual ZIP decompression.
  const size = compression === 3 ? 16 : 2;
  const pixels = new Float32Array(size * size * 4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const offset=(y>=size/2?8:0)+(x%2)*4;
    pixels.set(data.subarray(offset,offset+4),(y*size+x)*4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, FloatType);
  try { return Uint8Array.from(await new EXRExporter().parse(texture, { type, compression })); }
  finally { texture.dispose(); }
}
describe('EXR main image', () => {
  it.each([FloatType, HalfFloatType])('decodes real EXR type %s with correct orientation, alpha and HDR', async type => {
    const image = decodeEXRImage((await fixture(type)).buffer);
    expect([image.width,image.height]).toEqual([2,2]);
    expect(Array.from(image.linearColor!.slice(0,4))).toEqual([4,0,0,1]);
    expect(image.linearColor![4]).toBeCloseTo(.18,3);
    expect(image.data[4]).toBe(118);expect(image.data[7]).toBe(128);
    expect(Array.from(image.data.slice(8,12))).toEqual([0,0,255,255]);
    expect(image.data[15]).toBe(0);
  });
  it('accepts a ZIP-compressed EXR with an uppercase extension and empty browser MIME', async () => {
    const file = new File([await fixture(FloatType,3)],'render.EXR');
    const image = await readImage(file);expect(image.linearColor![0]).toBe(4);
  });
  it('keeps EXR depth channel values linear and floating point', async () => {
    const file = new File([await fixture()],'depth.exr');
    const depth = await readChannel(file,'depth',{width:2,height:2,color:new Uint8ClampedArray(16),depth:new Float32Array(4),source:'pending',name:'test'});
    expect(depth[0]).toBe(4);expect(depth[1]).toBeCloseTo(.18,6);
  });
  it('gives a useful error for invalid EXR without fabricating image data', () => {
    expect(() => decodeEXRImage(new ArrayBuffer(16))).toThrow('EXR');
  });
});
