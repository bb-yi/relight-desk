import { defaults, makeLight, type Settings, type Light } from './types';
export const presetNames = ['演播室', '赛璐璐', '夕阳', '夜间窗光', '底光', '动画双灯'];
export function preset(index: number): { settings: Partial<Settings>; lights: Light[]; animate: boolean } {
  const d = defaults(), key = makeLight(1);
  const settings: Partial<Settings> = { ambient: d.ambient, ambientColor: d.ambientColor, toon: false, threshold: d.threshold, feather: d.feather, specular: d.specular, rim: d.rim, exposure: 0, shadows: true, softness: d.softness };
  if (index === 1) { settings.toon = true;settings.feather = .025;settings.ambient = .38;key.position = [-.7, .75, 1.5]; }
  if (index === 2) { key.color = '#ffc28b';key.position = [-1, .35, .95];key.intensity = 2.4;settings.ambientColor = '#859acb';settings.ambient = .48;settings.softness = .06; }
  if (index === 3) { key.color = '#abcfff';key.position = [.7, .4, 1.2];settings.ambientColor = '#7983ad';settings.ambient = .2;settings.exposure = -.1; }
  if (index === 4) { key.position = [.05, -.88, .95];key.intensity = 2;settings.ambient = .35;settings.softness = .025; }
  const lights = [key];
  if (index === 5) { key.color = '#f2c496'; const fill = makeLight(2, [.8, .15, 1.4]);fill.color = '#82b7ed';fill.intensity = 1.1;lights.push(fill);settings.ambient = .26; }
  return { settings, lights, animate: index === 5 };
}
