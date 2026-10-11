import { t, bindStatic, localizedText, getLocale, setLocale, onLocaleChange, lightName, type Locale } from './i18n';
import './style.css';
import { createDemo } from './demo';
import { loadExample, exampleSettings } from './example';
import { RelightRenderer } from './renderer';
import { defaults, makeLight, type Channels, type Light, type Settings, type View } from './types';
import { clamp, normalizeDepth, lightPositionFromUV } from './math';
import { readImage, readChannel, download, encodeFloatDepth, parseSettings } from './io';
import { preset, presetNames } from './presets';

document.querySelector('#app')!.innerHTML = `
<header class="topbar"><div class="brand"><span class="brand-icon">◒</span><div><h1>Relight <em>Desk</em></h1><span class="edition">光影工作台 / LOCAL EDITION</span></div></div>
<div class="top-actions"><button id="example" class="quiet">默认示例</button><button id="demo" class="quiet">测试场景</button><button id="open-image">↗ 打开图片</button><button id="export-png" class="primary">导出 PNG <span>↓</span></button></div></header>
<main><section class="workspace"><nav class="views" aria-label="查看通道">${[['lit', '光照'], ['compare', '对比'], ['original', '原图'], ['normal', '法线'], ['depth', '深度'], ['lighting', '仅光照'], ['shadow', '阴影']].map(([id, label]) => `<button data-view="${id}" class="${id === 'lit' ? 'active' : ''}">${label}</button>`).join('')}</nav>
<div class="canvas-area" id="canvas-area"><div class="canvas-caption"><span id="asset-name"></span><span id="source-label"></span></div><div class="paper" id="paper"><canvas id="canvas" aria-label="实时重打光画布"></canvas><div id="light-markers"></div><div id="compare-line"><button aria-label="拖动原图对比线">↔</button></div><div class="corner-label">RELIGHT / 01</div></div><div id="empty-hint" hidden>已载入原图。生成或导入深度后，即可开始重打光。</div><div class="zoom-tools"><button id="zoom-out" aria-label="缩小">−</button><span id="zoom-value">100%</span><button id="zoom-in" aria-label="放大">＋</button><button id="fit">适应</button></div></div>
<div class="canvas-help"><span><i class="cyan-dot"></i> 拖动 · 移动光源 <b> / </b> 滚轮 · 灯光高度 <b> / </b> 空格＋拖动 · 平移</span><button id="help">使用说明 ↗</button></div>
<footer><span id="status">正在准备测试场景…</span><span id="stats">— FPS</span></footer></section>
<aside><section class="panel-section import-section"><div class="section-heading"><h2>图像与通道</h2><span class="section-number">01</span></div><p class="subtle">一张图，一次估计。之后每一束光都实时响应。</p><div class="two-col"><button id="estimate" class="accent-outline">✦ 生成深度与法线</button><select id="backend" aria-label="推理设备"><option value="webgpu">WebGPU · 优先</option><option value="wasm">WASM · 慢速</option></select></div><div id="progress" hidden><div><span id="progress-message"></span><button id="cancel-job">取消</button></div><progress max="100" value="0"></progress></div>
<details id="channels"><summary>导入 Blender 通道 <span>＋</span></summary><div class="channel-grid"><button data-import="depth">深度 PNG / EXR</button><button data-import="normal">法线 PNG / EXR</button><button data-import="mask">影响蒙版</button><button id="derive-normal">改用深度法线</button></div><p class="subtle">相机空间法线 · 同尺寸 · 独立 RGB EXR<br>世界空间与多层 EXR 请先转换。</p></details></section>
<fieldset id="lighting-controls"><section class="panel-section"><div class="section-heading"><h2>灯光</h2><span class="section-number">02</span></div><div id="light-list" class="light-list"></div><div class="light-actions"><button id="add-light">＋ 添加</button><button id="toggle-light">开启 / 关闭</button><button id="delete-light">删除</button><span id="light-count"></span></div><label class="check"><input id="animate" type="checkbox">自动环绕</label><div id="light-sliders"></div><div class="control-row"><label for="light-color">光源颜色</label><input id="light-color" type="color"></div>
<h3>光照预设</h3><div class="preset-grid">${presetNames.map((n, i) => `<button data-preset="${i}">${n}</button>`).join('')}</div></section>
<section class="panel-section"><div class="section-heading"><h2>明暗与投影</h2><span class="section-number">03</span></div><div class="segmented"><button id="mode-normal" class="active">普通</button><button id="mode-toon">赛璐璐</button></div><div class="control-row"><label for="ambientColor">环境光颜色</label><input id="ambientColor" type="color" data-setting="ambientColor"></div><div id="shading-sliders"></div><label class="check shadow-check"><input type="checkbox" id="shadows" data-setting="shadows" checked>深度投影 <span>人物内部＋背景</span></label><div id="shadow-sliders"></div><details><summary>高光与边缘光</summary><div id="highlight-sliders"></div></details></section>
<section class="panel-section"><div class="section-heading"><h2>表面与合成</h2><span class="section-number">04</span></div><label class="select-row">底色模式<select id="baseMode"><option value="false">保留原画 · 原阴影仍在</option><option value="true">无光照底色 · 重新着色</option></select></label><div id="surface-sliders"></div><label class="check"><input type="checkbox" data-setting="lineAssist" id="lineAssist" checked>线条辅助保边</label><label class="check"><input type="checkbox" data-setting="invert" id="invert">反转深度（近黑）</label><details><summary>通道方向与深度范围</summary><div class="axis-checks">${['X','Y','Z'].map(a => `<label class="check"><input type="checkbox" data-setting="flip${a}" id="flip${a}">翻转 ${a}</label>`).join('')}</div><label class="check"><input type="checkbox" data-setting="autoDepthRange" id="autoDepthRange" checked>自动归一化深度</label><div class="range-inputs"><label>最小<input id="depthMin" type="number" step="any" value="0"></label><label>最大<input id="depthMax" type="number" step="any" value="1"></label></div><p class="subtle">深度作为相对高度场使用，不是米制场景。</p></details></section></fieldset>
<section class="panel-section"><div class="section-heading"><h2>输出</h2><span class="section-number">05</span></div><div class="channel-grid"><button id="export-normal">法线 PNG ↓</button><button id="export-depth">浮点深度 PFM ↓</button><button id="export-settings">保存设置 ↓</button><button id="import-settings">载入设置 ↑</button></div><button id="reset" class="full-width quiet">重置灯光与参数</button><p class="privacy">● 本地处理 · 图片不离开你的设备</p></section></aside></main>
<input hidden type="file" id="image-file" accept="image/png,image/jpeg,image/webp,.exr"><input hidden type="file" id="channel-file" accept=".png,.exr"><input hidden type="file" id="settings-file" accept=".json">
<div id="toast" role="alert" hidden></div>
<dialog id="help-dialog"><button class="close-dialog" aria-label="关闭">×</button><span class="eyebrow">LIGHT, NOT REGENERATION</span><h2>一张图的另一束光。</h2><p>导入图片后，点击「生成深度与法线」。启动命令会把约 99 MB 模型准备到本地 models 文件夹；浏览器读取本地文件。推理完成后，移动灯光不再运行 AI。</p><p>灯位圆点控制平面位置，滚轮调整离画面的距离。深度和光源使用相对坐标，不能等同真实三维场景。右侧可调整深度强度，让投影更自然。</p><h3>从 Blender 导入</h3><p>所有通道使用同一相机和分辨率。法线先转换到相机空间：X 向右、Y 向上、Z 朝相机。PNG 编码为 N×0.5＋0.5；RGB EXR 保留有符号法线。深度复制到 RGB 保存独立 EXR，或输出近白远黑灰度 PNG。不要对数据通道应用 AgX、Filmic 或颜色变换。</p><p>相对高度场无法恢复画外或被遮住的几何；普通成图的原有光影不会自动消失。内置肖像是程序化算法测试场景，不是原视频素材。</p><p>导出的 PFM 保存处理前的归一化浮点高度（0—1、近白），搭配设置 JSON 保存高度强度等参数；PNG 法线为当前处理后的相机空间法线。</p></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const language = document.createElement('select');language.id = 'language';language.setAttribute('aria-label', '语言');
language.innerHTML = '<option value="zh-CN">简体中文</option><option value="en">English</option>';
document.querySelector('.top-actions')!.prepend(language);
document.querySelector('.close-dialog')!.setAttribute('aria-label', '关闭帮助');
const positionGroup = document.createElement('div');positionGroup.className = 'position-controls';
positionGroup.innerHTML = `<h3>灯光位置</h3><div class="position-inputs">${['X','Y','Z'].map((axis,i)=>`<label>${axis}<input id="position-${axis.toLowerCase()}" aria-label="位置 ${axis}" type="number" step="0.01" min="${i===2?'.1':'-100'}" max="${i===2?'4':'100'}" value="0"></label>`).join('')}</div><p class="subtle">可在图片外拖灯。X 向右、Y 向上、Z 朝观察者；图片上下边界为 Y ±1。</p>`;
document.querySelector('.light-actions')!.after(positionGroup);
bindStatic($('app'));
language.value = getLocale();language.onchange = () => setLocale(language.value as Locale);
let settings = defaults(), lights: Light[] = [makeLight(1)], selected = 1;
let channels: Channels, renderer: RelightRenderer;
let dirty = true, interactUntil = 0, previousInteractive = false, animate = false, jobId = 0;
let worker: Worker | null = null, busy = false, backendLabel = () => t('内置通道');
let exampleRequest: AbortController | null = null;
let zoom = 1, pan = { x: 0, y: 0 }, space = false, drag: { type: 'light' | 'pan' | 'compare'; x: number; y: number } | null = null;
let frames = 0, fpsStart = performance.now(), lastFrame = performance.now(), measuredFPS = 0;
const status = (message: string | (() => string)) => localizedText($('status'), message);
const toast = (message: string | (() => string)) => { localizedText($('toast'), message);$('toast').hidden = false;setTimeout(() => { $('toast').hidden = true; }, 9000); };
const selectedLight = () => lights.find(l => l.id === selected)!;
function change(channel = false, shadow = true) { dirty = true;interactUntil = performance.now() + 160;if (renderer) { renderer.channelDirty ||= channel;renderer.shadowDirty ||= shadow; } }

function slider(parent: string, key: string, label: string, min: number, max: number, step: number, scope = 'settings') {
  const row = document.createElement('label'); row.className = 'slider-row';
  row.innerHTML = `<span>${label}</span><input id="${scope}-${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}"><output></output>`;
  const input = row.querySelector('input')!, output = row.querySelector('output')!;
  const channelKeys = ['height', 'smooth', 'normalStrength'];
  input.oninput = () => {
    const value = Number(input.value);
    if (scope === 'light') { if (key === 'z') { selectedLight().position[2] = value;syncPosition(); } else (selectedLight() as any)[key] = value; }
    else (settings as any)[key] = value;
    output.value = value.toFixed(step < .01 ? 3 : step < 1 ? 2 : 0);
    change(channelKeys.includes(key));
  };
  $(parent).append(row);bindStatic(row);
}
slider('light-sliders', 'intensity', '强度', 0, 8, .01, 'light');slider('light-sliders', 'z', '高度（朝观察者）', .1, 4, .01, 'light');slider('light-sliders', 'range', '照射范围', .2, 8, .01, 'light');
for (const [k, label, min, max, step] of [['ambient','环境光',0,2,.01],['wrap','包裹光',0,1,.01],['threshold','明暗边界',-1,1,.01],['feather','边界羽化',.001,.5,.001]] as const) slider('shading-sliders',k,label,min,max,step);
slider('shadow-sliders','bias','遮挡深度偏差',.0001,.1,.0001);slider('shadow-sliders','softness','投影柔和度',0,.25,.001);
for (const [k,label,min,max,step] of [['specular','高光强度',0,2,.01],['shininess','高光硬度',1,256,1],['rim','边缘光',0,2,.01]] as const) slider('highlight-sliders',k,label,min,max,step);
for (const [k,label,min,max,step] of [['height','深度强度',.01,2,.01],['normalStrength','法线强度',.1,3,.01],['smooth','保边平滑',0,4,.1],['mix','效果混合',0,1,.01],['exposure','曝光 EV',-3,3,.01]] as const) slider('surface-sliders',k,label,min,max,step);

function sync() {
  syncPosition();
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type=range]')) {
    const [scope, key] = input.id.split('-'); const l = selectedLight();
    const value = scope === 'light' ? key === 'z' ? l.position[2] : (l as any)[key] : (settings as any)[key];
    input.value = String(value);input.nextElementSibling!.textContent = Number(value).toFixed(Number(input.step) < .01 ? 3 : Number(input.step) < 1 ? 2 : 0);
  }
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
    const value = (settings as any)[el.dataset.setting!]; if (el.type === 'checkbox') el.checked = value;else el.value = value;
  }
  $<HTMLInputElement>('light-color').value = selectedLight().color;
  $<HTMLSelectElement>('baseMode').value = String(settings.baseMode);
  $<HTMLInputElement>('animate').checked = animate;
  for (const key of ['depthMin','depthMax'] as const) { $<HTMLInputElement>(key).value = String(settings[key]);$<HTMLInputElement>(key).disabled = settings.autoDepthRange; }
  $('mode-normal').classList.toggle('active', !settings.toon);$('mode-toon').classList.toggle('active', settings.toon);
  $('toggle-light').textContent = selectedLight().enabled ? t('关闭') : t('开启');
  $<HTMLButtonElement>('add-light').disabled = lights.length >= 8;$<HTMLButtonElement>('delete-light').disabled = lights.length <= 1;
  $('light-count').textContent = `${lights.length} / 8`;
  const list = $('light-list'); list.replaceChildren();
  for (const light of lights) {
    const button = document.createElement('button');button.className = `light-chip ${light.id === selected ? 'active' : ''} ${light.enabled ? '' : 'off'}`;
    const dot = document.createElement('i');dot.style.background = light.color;button.append(dot, document.createTextNode(lightName(light.name)));
    button.onclick = () => { selected = light.id;sync(); };list.append(button);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) { b.classList.toggle('active', b.dataset.view === settings.view);b.disabled = channels?.source === 'pending' && b.dataset.view !== 'original'; }
  markers();
}
function syncPosition() {
  ['x','y','z'].forEach((axis,index) => {
    const input = $<HTMLInputElement>(`position-${axis}`);
    if (document.activeElement !== input) input.value = String(Number(selectedLight().position[index].toFixed(6)));
  });
}
for (const [index,axis] of ['x','y','z'].entries()) {
  const input = $<HTMLInputElement>(`position-${axis}`);
  const update = (reportError: boolean) => {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) {
      if (reportError) { toast(() => t('位置 {0} 必须在 {1} 到 {2} 之间。', axis.toUpperCase(), input.min, input.max));input.value = String(selectedLight().position[index]); }
      return;
    }
    selectedLight().position[index] = value;animate = false;change();sync();
  };
  input.oninput = () => update(false);input.onchange = () => update(true);
}
function markers() {
  if (!channels) return;const container = $('light-markers');container.replaceChildren();
  container.hidden = !['lit','compare','lighting','shadow'].includes(settings.view) || channels.source === 'pending';
  for (const light of lights) {
    const button = document.createElement('button');button.className = `light-marker ${light.id === selected ? 'selected' : ''} ${light.enabled ? '' : 'off'}`;
    button.dataset.light = String(light.id);button.setAttribute('aria-label', t("{0}：拖动位置", lightName(light.name)));
    button.style.left = `${(light.position[0] / (channels.width / channels.height) + 1) * 50}%`;
    button.style.top = `${(1 - light.position[1]) * 50}%`;button.style.setProperty('--light-color', light.color);
    button.textContent = String(light.id);container.append(button);
  }
  $('compare-line').hidden = settings.view !== 'compare';$('compare-line').style.left = `${settings.comparison * 100}%`;
}
function fit() {
  if (!channels) return;const area = $('canvas-area'); const availableW = Math.max(160, area.clientWidth - 100), availableH = Math.max(160, area.clientHeight - 80);
  const factor = Math.min(availableW / channels.width, availableH / channels.height);
  $('paper').style.width = `${channels.width * factor}px`;$('paper').style.height = `${channels.height * factor}px`;
  $('paper').style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
}
function loadChannels(next: Channels) {
  const max = renderer.renderer.capabilities.maxTextureSize;
  if (next.width > max || next.height > max) throw new Error(t("图片超过显卡最大纹理尺寸 {0}。", max));
  channels = next;renderer.load(channels);zoom = 1;pan = { x: 0, y: 0 };dirty = true;
  localizedText($('asset-name'), () => next.nameKey ? t(next.nameKey) : next.name);
  localizedText($('source-label'), () => `${next.width} × ${next.height} · ${next.source === 'demo' ? t('精确测试通道') : next.source === 'bundled' ? t('预置 AI 深度＋法线') : next.source === 'pending' ? t('待生成深度') : next.source === 'ai' ? t('AI 相对深度') : t('外部通道')}`);
  $<HTMLFieldSetElement>('lighting-controls').disabled = next.source === 'pending';$('empty-hint').hidden = next.source !== 'pending';
  $<HTMLButtonElement>('export-normal').disabled = $<HTMLButtonElement>('export-depth').disabled = next.source === 'pending';
  sync();fit();
}

try { renderer = new RelightRenderer($<HTMLCanvasElement>('canvas'));loadChannels(createDemo());status(() => t('就绪 · 内置精确通道，试试「底光」观察手臂投影')); }
catch (error) { toast(() => String(error));status(() => t('初始化失败 · 请检查 WebGL2 与硬件加速'));throw error; }

new ResizeObserver(fit).observe($('canvas-area'));
for (const el of document.querySelectorAll<HTMLInputElement>('[data-setting]')) el.oninput = () => {
  (settings as any)[el.dataset.setting!] = el.type === 'checkbox' ? el.checked : el.value;
  change(['lineAssist','invert','autoDepthRange','flipX','flipY','flipZ'].includes(el.dataset.setting!));
  if (el.dataset.setting === 'autoDepthRange') sync();
};
for (const key of ['depthMin','depthMax'] as const) $<HTMLInputElement>(key).onchange = () => {
  const value = Number($<HTMLInputElement>(key).value), next = { ...settings, [key]: value };
  if (!Number.isFinite(value) || next.depthMin >= next.depthMax) { toast(() => t('深度范围无效：最大值必须大于最小值。'));sync();return; }
  settings = next;change(true);
};
$<HTMLInputElement>('light-color').oninput = e => { selectedLight().color = (e.target as HTMLInputElement).value;change();markers(); };
$<HTMLSelectElement>('baseMode').onchange = e => { settings.baseMode = (e.target as HTMLSelectElement).value === 'true';change(false, false); };
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.onclick = () => { settings.view = b.dataset.view as View;change(false, false);sync(); };
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) b.onclick = () => {
  const index = Number(b.dataset.preset), p = preset(index);settings = { ...settings, ...p.settings };lights = p.lights;selected = lights[0].id;animate = p.animate;change();sync();status(() => t("预设 · {0}", t(presetNames[index])));
};
$('mode-normal').onclick = () => { settings.toon = false;change(false,false);sync(); };
$('mode-toon').onclick = () => { settings.toon = true;change(false,false);sync(); };
$('add-light').onclick = () => { if (lights.length >= 8) return;selected = Math.max(...lights.map(l => l.id)) + 1;lights.push(makeLight(selected, [.35,.2,1.4]));change();sync(); };
$('delete-light').onclick = () => { if (lights.length <= 1) return;lights = lights.filter(l => l.id !== selected);selected = lights[0].id;change();sync(); };
$('toggle-light').onclick = () => { selectedLight().enabled = !selectedLight().enabled;change();sync(); };
$<HTMLInputElement>('animate').onchange = e => { animate = (e.target as HTMLInputElement).checked;change(); };
$('reset').onclick = () => {
  const initial = channels.source === 'bundled' ? exampleSettings() : { settings: defaults(), lights: [makeLight(1)] };
  settings = initial.settings;lights = initial.lights;if (channels.source === 'pending') settings.view = 'original';
  selected = lights[0].id;animate = false;change(true);sync();
};
$('zoom-in').onclick = () => { zoom = Math.min(4, zoom * 1.2);fit(); };$('zoom-out').onclick = () => { zoom = Math.max(.25, zoom / 1.2);fit(); };$('fit').onclick = () => { zoom = 1;pan = { x: 0, y: 0 };fit(); };
document.addEventListener('keydown', e => { if (e.code === 'Space' && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement).tagName)) { space = true;e.preventDefault(); } });
document.addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
window.addEventListener('blur', () => { space = false;drag = null; });
const paper = $('paper'), dragArea = $('canvas-area');
dragArea.onpointerdown = e => {
  if (e.button !== 0 && e.button !== 1) return;
  const element = e.target as HTMLElement;
  if (element.closest('.zoom-tools')) return;
  if (space || e.button === 1) drag = { type:'pan',x:e.clientX - pan.x,y:e.clientY - pan.y };
  else if (element.closest('#compare-line')) drag = {type:'compare',x:0,y:0};
  else {
    if (channels.source === 'pending' || !['lit','compare','lighting','shadow'].includes(settings.view)) return;
    if (element.dataset.light) selected = Number(element.dataset.light);
    drag = {type:'light',x:0,y:0};animate = false;sync();
  }
  dragArea.setPointerCapture(e.pointerId);dragArea.onpointermove!(e);e.preventDefault();
};
dragArea.onpointermove = e => {
  if (!drag) return;
  if (drag.type === 'pan') { pan = {x:e.clientX-drag.x,y:e.clientY-drag.y};fit();return; }
  const r = paper.getBoundingClientRect(), u = (e.clientX-r.left)/r.width, v = (e.clientY-r.top)/r.height;
  if (drag.type === 'compare') { settings.comparison = clamp(u);change(false,false); }
  else { const [x,y]=lightPositionFromUV(u,v,channels.width/channels.height);selectedLight().position[0]=x;selectedLight().position[1]=y;change();syncPosition(); }
  markers();
};
dragArea.onpointerup = dragArea.onpointercancel = () => { drag=null;dirty=true; };
paper.addEventListener('wheel', e => { if (channels.source==='pending') return;e.preventDefault();selectedLight().position[2]=clamp(selectedLight().position[2]-e.deltaY*.0015,.1,4);change();sync(); },{passive:false});

function stopJob() { jobId++;exampleRequest?.abort();exampleRequest=null;busy=false;if(worker){worker.terminate();worker=null;}$('progress').hidden=true;$<HTMLButtonElement>('estimate').disabled=false; }
$('cancel-job').onclick = () => { stopJob();status(() => t('推理已取消 · 可以导入通道或重新生成')); };
async function openExample() {
  stopJob();const request = jobId, controller = new AbortController();exampleRequest = controller;
  status(() => t('正在加载默认示例与预置通道…'));
  try {
    const next = await loadExample(controller.signal);if (request !== jobId) return;
    const initial=exampleSettings();settings=initial.settings;lights=initial.lights;selected=lights[0].id;animate=false;backendLabel=()=>t('预置通道 · 无需推理');
    loadChannels(next);status(() => t('默认示例已就绪 · 深度与法线已附带，直接拖灯'));
  } catch(error) {
    if (request !== jobId || controller.signal.aborted) return;
    toast(() => String(error));status(() => t('默认示例加载失败 · 可重试或使用测试场景'));
  } finally { if(exampleRequest === controller) exampleRequest = null; }
}
$('example').onclick = () => void openExample();
$('demo').onclick = () => { stopJob();settings=defaults();lights=[makeLight(1)];selected=1;animate=false;backendLabel=()=>t('内置通道');loadChannels(createDemo());status(() => t('内置精确测试通道 · 无需模型')); };
$('open-image').onclick = () => $<HTMLInputElement>('image-file').click();
async function openImage(file: File) {
  stopJob();const request = jobId;try {
    const image=await readImage(file);if(request!==jobId)return;
    stopJob();settings=defaults();settings.view='original';animate=false;
    loadChannels({width:image.width,height:image.height,color:image.data,linearColor:image.linearColor,depth:new Float32Array(image.width*image.height),source:'pending',name:file.name});
    backendLabel=()=>t('未推理');status(() => image.linearColor ? t('EXR 已加载 · 保留线性 HDR；生成或导入深度后可打光（不是 Blender AgX 显示）') : t('图片已加载 · 点击「生成深度与法线」，或导入已有深度'));
  } catch(e){toast(() => String(e));}
}
$<HTMLInputElement>('image-file').onchange=e=>{const input=e.target as HTMLInputElement;if(input.files?.[0])void openImage(input.files[0]);input.value='';};
$('canvas-area').ondragover=e=>{e.preventDefault();};$('canvas-area').ondrop=e=>{e.preventDefault();if(e.dataTransfer?.files[0])void openImage(e.dataTransfer.files[0]);};

function upsample(data:Float32Array,w:number,h:number,W:number,H:number){
  const result=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const px=clamp((x+.5)*w/W-.5,0,w-1),py=clamp((y+.5)*h/H-.5,0,h-1),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1),fx=px-x0,fy=py-y0;
    result[y*W+x]=(data[y0*w+x0]*(1-fx)+data[y0*w+x1]*fx)*(1-fy)+(data[y1*w+x0]*(1-fx)+data[y1*w+x1]*fx)*fy;
  }return result;
}
async function estimate(){
  if(busy)return;const backend=$<HTMLSelectElement>('backend').value;
  exampleRequest?.abort();exampleRequest=null;
  if(backend==='webgpu' && !(navigator as Navigator & {gpu?:unknown}).gpu){toast(() => t('当前浏览器没有 WebGPU，请选择 WASM 慢速模式。'));return;}
  busy=true;const id=++jobId;$<HTMLButtonElement>('estimate').disabled=true;$('progress').hidden=false;
  localizedText($('progress-message'), () => t('读取本地模型 · 约 99 MB'));$('progress').querySelector('progress')!.removeAttribute('value');status(() => t('正在载入深度模型，图片不会上传'));
  if(!worker)worker=new Worker(new URL('./depth.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=e=>{
    const msg=e.data;if(msg.id!==jobId)return;
    if(msg.type==='progress'){
      const p=msg.progress;if(p.progress!=null){$('progress').querySelector('progress')!.value=p.progress;localizedText($('progress-message'), () => t("加载 {0} · {1}%", p.file??t('模型'), p.progress.toFixed(0)));}
    }else if(msg.type==='running'){localizedText($('progress-message'), () => t("{0} · 估计浮点深度中…", msg.backend.toUpperCase()));$('progress').querySelector('progress')!.removeAttribute('value');}
    else if(msg.type==='error'){
      busy=false;$<HTMLButtonElement>('estimate').disabled=false;$('progress').hidden=true;
      toast(() => t("深度生成失败：{0}{1}", t(msg.message), msg.backend==='webgpu'?t('。可选择 WASM 再试。'):''));status(() => t('模型推理失败 · 未生成替代深度'));backendLabel=()=>t("{0} 失败", msg.backend);
    }else if(msg.type==='result'){
      try{
        const depth=normalizeDepth(upsample(new Float32Array(msg.depth),msg.width,msg.height,channels.width,channels.height));
        settings.view='lit';settings.autoDepthRange=true;settings.invert=false;backendLabel=()=>msg.backend.toUpperCase();
        loadChannels({...channels,depth,normal:undefined,source:'ai'});status(() => t('深度与法线已就绪 · 拖灯无需再次推理'));
      }catch(error){toast(() => String(error));status(() => t('模型输出处理失败'));}
      busy=false;$<HTMLButtonElement>('estimate').disabled=false;$('progress').hidden=true;
    }
  };
  worker.onerror=e=>{stopJob();toast(() => t("推理 Worker 失败：{0}", e.message || t('模块加载中断，请确认本地服务仍在运行，然后刷新重试。')));status(() => t('模型运行失败'));};
  const copy=channels.color.slice();worker.postMessage({id,pixels:copy.buffer,width:channels.width,height:channels.height,backend},[copy.buffer]);
}
$('estimate').onclick=()=>void estimate();
let importKind:'normal'|'depth'|'mask'='depth';
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-import]')) b.onclick=()=>{importKind=b.dataset.import as typeof importKind;$<HTMLInputElement>('channel-file').click();};
$<HTMLInputElement>('channel-file').onchange=async e=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0],kind=importKind;input.value='';if(!file)return;
  const original=channels;
  try{
    const data=await readChannel(file,kind,original);if(channels!==original)return;stopJob();
    if(kind==='depth'){settings.autoDepthRange=true;settings.invert=false;settings.view='lit';}
    const next={...channels,[kind]:data};if(kind==='depth') { next.source='external';if(next.normalBasis) { next.normal=undefined;next.normalBasis=undefined; } }
    if(kind==='normal')next.normalBasis=undefined;
    // A normal map alone does not supply a shadow surface: keep pending until depth exists.
    loadChannels(next);status(() => t("已导入{0} · {1}{2}", kind==='normal'?t('法线'):kind==='depth'?t('深度'):t('影响蒙版'), file.name, next.source==='pending'?t(' · 仍需深度'):''));
  }catch(error){toast(() => String(error));}
};
$('derive-normal').onclick=()=>{loadChannels({...channels,normal:undefined});status(() => t('法线现在由深度派生'));};

async function savePNG(view:View,name:string){
  const button=$<HTMLButtonElement>(view==='normal'?'export-normal':'export-png');button.disabled=true;
  try{status(() => t('正在以原图尺寸计算高质量导出…'));await new Promise(r=>setTimeout(r,30));download(await renderer.exportPNG(settings,lights,view),name);status(() => t('PNG 已导出 · 原图尺寸 / 高质量投影'));}
  catch(error){toast(() => String(error));}finally{button.disabled=false;dirty=true;}
}
$('export-png').onclick=()=>void savePNG(channels.source==='pending'?'original':'lit','relight.png');
$('export-normal').onclick=()=>void savePNG('normal','normal-camera.png');
$('export-depth').onclick=()=>{const d=normalizeDepth(channels.depth,settings.invert,settings.autoDepthRange?undefined:[settings.depthMin,settings.depthMax]);download(new Blob([encodeFloatDepth(d,channels.width,channels.height)]), 'depth-relative.pfm');};
$('export-settings').onclick=()=>download(new Blob([JSON.stringify({version:1,settings,lights},null,2)],{type:'application/json'}),'relight-settings.json');
$('import-settings').onclick=()=>$<HTMLInputElement>('settings-file').click();
$<HTMLInputElement>('settings-file').onchange=async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;try{const p=parseSettings(await file.text());settings=p.settings;lights=p.lights;selected=lights[0].id;animate=false;if(channels.source==='pending')settings.view='original';change(true);sync();status(() => t('灯光与设置已恢复'));}catch(error){toast(() => String(error));}};
$('help').onclick=()=>$<HTMLDialogElement>('help-dialog').showModal();document.querySelector<HTMLButtonElement>('.close-dialog')!.onclick=()=>$<HTMLDialogElement>('help-dialog').close();

let renderingFailed=false;
function frame(time:number){
  const dt=Math.min((time-lastFrame)/1000,.05);lastFrame=time;
  const interactive=animate||!!drag||time<interactUntil;
  if(animate){for(let i=0;i<lights.length;i++){const l=lights[i],angle=Math.atan2(l.position[1],l.position[0])+.45*dt;const radius=Math.max(.6,Math.hypot(l.position[0],l.position[1]));l.position[0]=Math.cos(angle)*radius;l.position[1]=Math.sin(angle)*radius;}change();markers();syncPosition();}
  if(!renderingFailed&&(dirty||interactive||previousInteractive!==interactive)){
    try{renderer.render(settings,lights,interactive);frames++;dirty=false;}catch(error){renderingFailed=true;toast(() => String(error));status(() => t('渲染错误 · 请查看控制台'));}
  }
  previousInteractive=interactive;
  if(time-fpsStart>1000){measuredFPS=frames*1000/(time-fpsStart);const fps=frames?measuredFPS.toFixed(0)+' FPS':null;localizedText($('stats'),()=>`${fps??t('按需渲染')} · ${renderer.renderer.domElement.width}×${renderer.renderer.domElement.height} · ${backendLabel()}`);frames=0;fpsStart=time;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
onLocaleChange(() => { language.value=getLocale();sync();fit(); });
setLocale(getLocale());
window.addEventListener('beforeunload',()=>{worker?.terminate();renderer.dispose();});
void openExample();
// Local diagnostics for reproducible QA; no remote access, persistence or source image upload.
if(import.meta.env.DEV)(window as any).__relight={get state(){return {settings,lights,source:channels.source,busy,backend:backendLabel(),fps:measuredFPS,error:renderer.error,memory:renderer.renderer.info.memory};},setPreset:(index:number)=>{const p=preset(index);Object.assign(settings,p.settings);lights=p.lights;selected=lights[0].id;animate=p.animate;change();sync();},render:()=>{renderer.render(settings,lights,false);},exportPNG:(view:View='lit')=>renderer.exportPNG(settings,lights,view)};
