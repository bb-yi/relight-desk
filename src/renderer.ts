import * as T from 'three';
import type { Channels, Light, Settings, View } from './types';
import { normalizeDepth } from './math';
import { vertex, depthFragment, normalFragment, shadowFragment, blurFragment, lightingFragment } from './shaders';

function texture(data: Uint8ClampedArray | Float32Array, w: number, h: number, format: T.PixelFormat = T.RGBAFormat, type: T.TextureDataType = T.UnsignedByteType) {
  const t = new T.DataTexture(data, w, h, format, type); t.flipY = true;
  t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
function target(w: number, h: number, type: T.TextureDataType = T.HalfFloatType) {
  return new T.WebGLRenderTarget(w, h, { type, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false });
}
export class RelightRenderer {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene(); private camera = new T.Camera();
  private quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  private maps: T.Texture[] = [];
  private targets: T.WebGLRenderTarget[] = [];
  private depthRT!: T.WebGLRenderTarget; private normalRT!: T.WebGLRenderTarget;
  private shadowRT: T.WebGLRenderTarget[] = []; private blurRT: T.WebGLRenderTarget[] = [];
  private depthMat: T.ShaderMaterial; private normalMat: T.ShaderMaterial;
  private shadowMat: T.ShaderMaterial; private blurMat: T.ShaderMaterial; private lightingMat: T.ShaderMaterial;
  private shared: Record<string, T.IUniform>;
  channels!: Channels;
  channelDirty = true; shadowDirty = true;
  private quality = ''; private rangeKey = '';
  private exportTarget?: T.WebGLRenderTarget;
  error: string | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1); this.renderer.setClearColor(0, 0);
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) throw new Error('需要支持浮点渲染目标的 WebGL2 显卡；请启用浏览器硬件加速。');
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      this.error = `${gl.getProgramInfoLog(program)}\n${gl.getShaderInfoLog(vs)}\n${gl.getShaderInfoLog(fs)}`;
      console.error('Relight shader error', this.error);
    };
    this.scene.add(this.quad);this.quad.frustumCulled = false;
    this.shared = {
      colorMap: { value: null }, heightMap: { value: null }, imageSize: { value: new T.Vector2(1, 1) }, amplitude: { value: .65 },
      lightPosition: { value: Array.from({ length: 8 }, () => new T.Vector3()) }, lightColor: { value: Array.from({ length: 8 }, () => new T.Color()) },
      lightIntensity: { value: Array(8).fill(0) }, lightRange: { value: Array(8).fill(3) }, lightCount: { value: 1 },
    };
    const material = (fragmentShader: string, extras: Record<string, any>) => new T.ShaderMaterial({ vertexShader: vertex, fragmentShader, uniforms: { ...this.shared, ...Object.fromEntries(Object.entries(extras).map(([k, value]) => [k, { value }])) }, depthTest: false, depthWrite: false, blending: T.NoBlending });
    this.depthMat = material(depthFragment, { rawDepth: null, smoothing: 1, lineAssist: true });
    this.normalMat = material(normalFragment, { inputNormal: null, hasNormal: false, flips: new T.Vector3(1, 1, 1), normalStrength: 1 });
    this.shadowMat = material(shadowFragment, { groupIndex: 0, marchSteps: 48, areaSamples: 1, bias: .007, softness: .035, shadowsEnabled: true });
    this.blurMat = material(blurFragment, { shadowMap: null, shadowSize: new T.Vector2(1, 1), softness: .035 });
    this.lightingMat = material(lightingFragment, { normalMap: null, maskMap: null, shadows0: null, shadows1: null, ambient: .4, ambientColor: new T.Color(), wrapLight: .2, threshold: .18, feather: .08, specular: .13, shininess: 60, rim: .18, exposure: 0, effectMix: 1, comparison: .5, toon: false, baseMode: false, viewMode: 0 });
  }
  load(channels: Channels) {
    for (const t of this.maps) t.dispose(); for (const t of this.targets) t.dispose();
    this.maps = []; this.targets = []; this.channels = channels; this.rangeKey = '';this.quality = '';
    const { width: w, height: h } = channels;
    const rgbaNormal = new Float32Array(w * h * 4);
    if (channels.normal) for (let i = 0; i < w * h; i++) { rgbaNormal.set(channels.normal.subarray(i * 3, i * 3 + 3), i * 4); rgbaNormal[i * 4 + 3] = 1; }
    const mask = channels.mask ?? new Float32Array(w * h).fill(1);
    this.maps = [texture(channels.color, w, h), texture(normalizeDepth(channels.depth), w, h, T.RedFormat, T.FloatType), texture(rgbaNormal, w, h, T.RGBAFormat, T.FloatType), texture(mask, w, h, T.RedFormat, T.FloatType)];
    this.shared.colorMap.value = this.maps[0]; this.shared.imageSize.value.set(w, h);
    this.depthMat.uniforms.rawDepth.value = this.maps[1];
    this.normalMat.uniforms.inputNormal.value = this.maps[2]; this.normalMat.uniforms.hasNormal.value = !!channels.normal;
    this.lightingMat.uniforms.maskMap.value = this.maps[3];
    // Differentiating half-float heights at 1.5K creates quantization stripes on smooth
    // skin. Keep the height pass float32 even though normals themselves can be float16.
    this.depthRT = target(w, h, T.FloatType);this.normalRT = target(w, h);
    if (!this.renderer.extensions.has('OES_texture_float_linear')) {
      this.depthRT.texture.minFilter = this.depthRT.texture.magFilter = T.NearestFilter;
    }
    this.shadowRT = [target(Math.ceil(w / 2), Math.ceil(h / 2), T.UnsignedByteType), target(Math.ceil(w / 2), Math.ceil(h / 2), T.UnsignedByteType)];
    this.blurRT = this.shadowRT.map(rt => target(rt.width, rt.height, T.UnsignedByteType));
    this.targets = [this.depthRT, this.normalRT, ...this.shadowRT, ...this.blurRT];
    this.shared.heightMap.value = this.depthRT.texture;
    this.lightingMat.uniforms.normalMap.value = this.normalRT.texture;
    this.lightingMat.uniforms.shadows0.value = this.blurRT[0].texture; this.lightingMat.uniforms.shadows1.value = this.blurRT[1].texture;
    this.channelDirty = this.shadowDirty = true;
  }
  private pass(mat: T.ShaderMaterial, rt: T.WebGLRenderTarget | null) { this.quad.material = mat;this.renderer.setRenderTarget(rt);this.renderer.render(this.scene, this.camera); }
  render(s: Settings, lights: Light[], interacting = false, exportFull = false) {
    if (!this.channels) return;
    const { width: w, height: h } = this.channels;
    const previewScale = Math.min(1, 1536 / Math.max(w, h));
    if (!exportFull && (this.renderer.domElement.width !== Math.round(w * previewScale) || this.renderer.domElement.height !== Math.round(h * previewScale))) this.renderer.setSize(Math.round(w * previewScale), Math.round(h * previewScale), false);
    const rangeKey = `${s.invert}/${s.autoDepthRange}/${s.depthMin}/${s.depthMax}`;
    if (rangeKey !== this.rangeKey) {
      this.rangeKey = rangeKey; const data = normalizeDepth(this.channels.depth, s.invert, s.autoDepthRange ? undefined : [s.depthMin, s.depthMax]);
      (this.maps[1] as T.DataTexture).image.data = data; this.maps[1].needsUpdate = true; this.channelDirty = true;
    }
    this.shared.amplitude.value = s.height;
    this.shared.lightCount.value = lights.length;
    for (let i = 0; i < lights.length; i++) {
      this.shared.lightPosition.value[i].fromArray(lights[i].position);
      this.shared.lightColor.value[i].set(lights[i].color);
      this.shared.lightIntensity.value[i] = lights[i].enabled ? lights[i].intensity : 0;
      this.shared.lightRange.value[i] = lights[i].range;
    }
    if (this.channelDirty) {
      this.depthMat.uniforms.smoothing.value = s.smooth;this.depthMat.uniforms.lineAssist.value = s.lineAssist;
      this.pass(this.depthMat, this.depthRT);
      this.normalMat.uniforms.normalStrength.value = s.normalStrength;
      this.normalMat.uniforms.flips.value.set(s.flipX ? -1 : 1, s.flipY ? -1 : 1, s.flipZ ? -1 : 1);
      this.pass(this.normalMat, this.normalRT);this.channelDirty = false;this.shadowDirty = true;
    }
    const quality = `${interacting}/${exportFull}`;
    if (quality !== this.quality) { this.shadowDirty = true;this.quality = quality; }
    if (this.shadowDirty) {
      const sw = Math.ceil(w / (exportFull ? 1 : 2)), sh = Math.ceil(h / (exportFull ? 1 : 2));
      const u = this.shadowMat.uniforms;
      u.marchSteps.value = interacting ? 48 : 96;u.areaSamples.value = interacting || s.softness === 0 ? 1 : 4;
      u.bias.value = s.bias;u.softness.value = s.softness;u.shadowsEnabled.value = s.shadows;
      for (let g = 0; g < 2; g++) {
        this.shadowRT[g].setSize(sw, sh);this.blurRT[g].setSize(sw, sh);
        u.groupIndex.value = g;this.pass(this.shadowMat, this.shadowRT[g]);
        this.blurMat.uniforms.shadowMap.value = this.shadowRT[g].texture;
        this.blurMat.uniforms.shadowSize.value.set(sw, sh);this.blurMat.uniforms.softness.value = s.softness;
        this.pass(this.blurMat, this.blurRT[g]);
      }
      this.shadowDirty = false;
    }
    const u = this.lightingMat.uniforms;
    for (const k of ['ambient', 'threshold', 'feather', 'specular', 'shininess', 'rim', 'exposure', 'comparison', 'toon', 'baseMode'] as const) u[k].value = s[k];
    u.ambientColor.value.set(s.ambientColor);u.wrapLight.value = s.wrap;u.effectMix.value = s.mix;
    u.viewMode.value = ['lit', 'compare', 'original', 'normal', 'depth', 'lighting', 'shadow'].indexOf(s.view);
    this.pass(this.lightingMat, exportFull ? this.exportTarget! : null);
    if (this.error) throw new Error(this.error);
  }
  async exportPNG(s: Settings, lights: Light[], view: View = 'lit'): Promise<Blob> {
    const { width, height } = this.channels;
    this.exportTarget = target(width, height, T.UnsignedByteType);
    try {
      this.render({ ...s, view }, lights, false, true);
      const bytes = new Uint8Array(width * height * 4); this.renderer.readRenderTargetPixels(this.exportTarget, 0, 0, width, height, bytes);
      const out = new Uint8ClampedArray(bytes.length);
      for (let y = 0; y < height; y++) out.set(bytes.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
      const canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
      canvas.getContext('2d')!.putImageData(new ImageData(out, width, height), 0, 0);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 编码失败')), 'image/png'));
    } finally { this.exportTarget.dispose();this.exportTarget = undefined;this.shadowDirty = true;this.renderer.setRenderTarget(null); }
  }
  dispose() { for (const t of [...this.maps, ...this.targets]) t.dispose(); for (const m of [this.depthMat, this.normalMat, this.shadowMat, this.blurMat, this.lightingMat]) m.dispose();this.quad.geometry.dispose();this.renderer.dispose(); }
}
