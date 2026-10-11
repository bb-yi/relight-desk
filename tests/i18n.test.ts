import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { en } from '../src/locales/en';
import { getLocale, lightName, localizedText, resolveLocale, setLocale, t } from '../src/i18n';
import { lightPositionFromUV } from '../src/math';
import { validateSize, defaults, makeLight } from '../src/types';
import { parseSettings } from '../src/io';

afterEach(() => { vi.unstubAllGlobals();setLocale('zh-CN'); });
describe('i18n', () => {
  it('uses a supported saved locale, browser preference, then Chinese fallback', () => {
    expect(resolveLocale('en', ['zh-CN'])).toBe('en');
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN');
    expect(resolveLocale(null, ['en-GB'])).toBe('en');
    expect(resolveLocale('unknown', ['ja'])).toBe('zh-CN');
  });
  it('translates parameters without interpreting or translating user data', () => {
    setLocale('en');
    expect(t('已导入{0} · {1}{2}', t('深度'), '夕阳.png', '')).toBe('Imported Depth · 夕阳.png');
    expect(t('not-a-message')).toBe('not-a-message');
    expect(lightName('光源 2')).toBe('Light 2');
    expect(lightName('用户灯光')).toBe('用户灯光');
  });
  it('keeps placeholder parity across the dictionary', () => {
    const slots = (s: string) => s.match(/\{\d+\}/g)?.sort() ?? [];
    for (const [key, value] of Object.entries(en)) expect(slots(value), key).toEqual(slots(key));
  });
  it('covers every literal t() message in the app modules', () => {
    for (const name of ['main','io','types','renderer','i18n','example']) {
      const file = ts.createSourceFile(name, readFileSync(`src/${name}.ts`, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText(file) === 't' && n.arguments[0] && ts.isStringLiteral(n.arguments[0]))
          expect(en[n.arguments[0].text], `${name}: ${n.arguments[0].text}`).toBeDefined();
        ts.forEachChild(n, visit);
      };visit(file);
    }
  });
  it('persists locale and survives unavailable storage', () => {
    const setItem = vi.fn();vi.stubGlobal('localStorage', { setItem });setLocale('en');
    expect(setItem).toHaveBeenCalledWith('relight-desk.locale', 'en');
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked'); } });
    expect(() => setLocale('zh-CN')).not.toThrow();expect(getLocale()).toBe('zh-CN');
  });
  it('re-renders a pending progress message without restarting work', () => {
    const node = { textContent: '', isConnected: true } as unknown as HTMLElement;
    localizedText(node, () => t('加载 {0} · {1}%', 'model.onnx', 42));
    setLocale('en');expect(node.textContent).toBe('Loading model.onnx · 42%');
    setLocale('zh-CN');expect(node.textContent).toBe('加载 model.onnx · 42%');
  });
  it('localizes channel size errors', () => {
    setLocale('en');expect(() => validateSize(64,64,{width:1024,height:1536})).toThrow('Pass size 64×64 does not match image size 1024×1536');
  });
});
describe('light position outside the image', () => {
  it('maps non-square images and permits coordinates beyond every edge', () => {
    expect(lightPositionFromUV(.5,.5,2/3)).toEqual([0,0]);
    expect(lightPositionFromUV(1.25,-.25,2/3)).toEqual([1,1.5]);
    expect(lightPositionFromUV(-.25,1.25,2/3)).toEqual([-1,-1.5]);
    expect(lightPositionFromUV(200,-200,1)).toEqual([100,100]);
  });
  it('preserves off-image positions and precision in settings round trips', () => {
    const light = makeLight(1,[1.2345,-1.25,2.1]);
    const restored = parseSettings(JSON.stringify({version:1,settings:defaults(),lights:[light]}));
    expect(restored.lights[0].position).toEqual([1.2345,-1.25,2.1]);
  });
});
