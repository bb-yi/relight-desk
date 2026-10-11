import { en } from './locales/en';
export type Locale = 'zh-CN' | 'en';
export const localeStorageKey = 'relight-desk.locale';
export function resolveLocale(saved: string | null, languages: readonly string[] = []): Locale {
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return languages[0]?.toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}
function initialLocale(): Locale {
  try { return resolveLocale(localStorage.getItem(localeStorageKey), navigator.languages); }
  catch { return 'zh-CN'; }
}
let locale: Locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function setLocale(next: Locale) {
  locale = next;
  try { localStorage.setItem(localeStorageKey, next); } catch { /* Storage may be disabled. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = t('Relight Desk · 光影工作台');
  }
  for (const listener of listeners) listener();
}
export function onLocaleChange(listener: () => void) { listeners.add(listener);return () => listeners.delete(listener); }
export function t(key: string, ...values: unknown[]): string {
  return (locale === 'en' ? en[key] ?? key : key).replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) < values.length ? String(values[Number(index)]) : token);
}
// Bind only known UI text, once. Never scan user filenames or recreate the canvas.
export function bindStatic(root: HTMLElement) {
  const update: Array<() => void> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text, original = text.data, key = original.trim();
    if (text.parentElement?.closest('#status, #stats, #toggle-light, #language')) continue;
    if (Object.hasOwn(en, key)) update.push(() => { text.data = original.replace(key, t(key)); });
  }
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('[aria-label], [title]')]) {
    for (const attr of ['aria-label', 'title']) {
      const key = element.getAttribute(attr);
      if (key && Object.hasOwn(en, key)) update.push(() => element.setAttribute(attr, t(key)));
    }
  }
  const render = () => update.forEach(fn => fn());render();onLocaleChange(render);
}
// Retain a message producer so status/progress changes language even during inference.
export function localizedText(element: HTMLElement, message: string | (() => string)) {
  producers.set(element, typeof message === 'string' ? () => t(message) : message);
  element.textContent = producers.get(element)!();
}
const producers = new Map<HTMLElement, () => string>();
onLocaleChange(() => { for (const [element, produce] of producers) if (element.isConnected) element.textContent = produce(); });
export function lightName(name: string) {
  const match = /^(?:光源|Light) (\d+)$/.exec(name);
  return match ? t('光源 {0}', match[1]) : name;
}
