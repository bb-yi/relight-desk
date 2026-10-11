import { t } from './i18n';
export type Vec3 = [number, number, number];
export type View = 'lit' | 'compare' | 'original' | 'normal' | 'depth' | 'lighting' | 'shadow';
export interface Light { id: number; name: string; position: Vec3; color: string; intensity: number; range: number; enabled: boolean }
export interface Settings {
  view: View; comparison: number; toon: boolean; baseMode: boolean; mix: number;
  ambient: number; ambientColor: string; wrap: number; threshold: number; feather: number;
  shadows: boolean; bias: number; softness: number; specular: number; shininess: number;
  rim: number; exposure: number; height: number; invert: boolean; smooth: number;
  lineAssist: boolean; normalStrength: number; flipX: boolean; flipY: boolean; flipZ: boolean;
  depthMin: number; depthMax: number; autoDepthRange: boolean;
}
export interface Channels {
  width: number; height: number; color: Uint8ClampedArray; depth: Float32Array;
  normal?: Float32Array; mask?: Float32Array; source: 'demo' | 'bundled' | 'ai' | 'external' | 'pending'; name: string;
  normalBasis?: { height: number; smooth: number; lineAssist: boolean };
  nameKey?: string; // Only built-in assets have translatable names; filenames remain verbatim.
}
export const defaults = (): Settings => ({
  view: 'lit', comparison: .5, toon: false, baseMode: false, mix: 1,
  ambient: .42, ambientColor: '#b4bddc', wrap: .2, threshold: .18, feather: .08,
  shadows: true, bias: .007, softness: .035, specular: .13, shininess: 60,
  rim: .18, exposure: 0, height: .65, invert: false, smooth: 1,
  lineAssist: true, normalStrength: 1, flipX: false, flipY: false, flipZ: false,
  depthMin: 0, depthMax: 1, autoDepthRange: true,
});
export const makeLight = (id: number, position: Vec3 = [-.6, .65, 1.6]): Light => ({ id, name: `光源 ${id}`, position, color: '#fff0d8', intensity: 1.8, range: 3, enabled: true });
export function validateSize(w: number, h: number, source: Pick<Channels, 'width' | 'height'>) {
  if (w !== source.width || h !== source.height) throw new Error(t("通道尺寸 {0}×{1} 与原图 {2}×{3} 不一致；请从同一相机以相同分辨率导出。", w, h, source.width, source.height));
}
export interface SettingsFile { version: 1; settings: Settings; lights: Light[] }
