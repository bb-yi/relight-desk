import manifest from '../public/example/manifest.json';
import { readImage, readChannel } from './io';
import { t } from './i18n';
import type { Channels, Settings } from './types';

export function decodeExampleDepth(buffer: ArrayBuffer, width: number, height: number) {
  if (buffer.byteLength !== width * height * 4) throw new Error(t('示例深度文件尺寸不匹配。'));
  const view = new DataView(buffer), depth = new Float32Array(width * height);
  for (let i = 0; i < depth.length; i++) {
    const v = view.getFloat32(i * 4, true);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(t('示例深度包含无效数值。'));
    depth[i] = v;
  }
  return depth;
}

// Baked normals are valid only for their bake settings. Editing the surface must
// still regenerate normals from float depth; external normal maps remain explicit.
export function useBakedNormal(channels: Channels, settings: Settings) {
  const basis = channels.normalBasis;
  return !!channels.normal && (!basis || (settings.height === basis.height && settings.smooth === basis.smooth
    && settings.lineAssist === basis.lineAssist && !settings.invert && settings.autoDepthRange));
}

export async function loadExample(signal?: AbortSignal): Promise<Channels> {
  const fetchAsset = async (name: string) => {
    const response = await fetch(`${import.meta.env.BASE_URL}example/${name}`, { signal });
    if (!response.ok) throw new Error(t('示例文件加载失败：{0}（HTTP {1}）', name, response.status));
    return response;
  };
  const [colorFile, depthFile, normalFile] = await Promise.all(['color.png', 'depth.f32', 'normal.png'].map(fetchAsset));
  const color = await readImage(new File([await colorFile.blob()], 'color.png', { type: 'image/png' }));
  if (color.width !== manifest.width || color.height !== manifest.height) throw new Error(t('示例图片尺寸不匹配。'));
  const channels: Channels = { width: color.width, height: color.height, color: color.data,
    depth: decodeExampleDepth(await depthFile.arrayBuffer(), color.width, color.height),
    source: 'bundled', name: manifest.sourceFilename, normalBasis: manifest.normalBasis };
  channels.normal = await readChannel(new File([await normalFile.blob()], 'normal.png', { type: 'image/png' }), 'normal', channels);
  return channels;
}
