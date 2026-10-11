import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { projectRoot, modelDirectory, ensureModels } from './scripts/models.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 5)) {
  console.error('Please install Node.js 24.5+ (24 LTS recommended). 请安装 Node.js 24.5 或更新版本。 https://nodejs.org/');process.exit(1);
}
// Honor standard HTTPS_PROXY / HTTP_PROXY without storing credentials in this project.
if (!process.execArgv.includes('--use-env-proxy')) {
  const child = spawnSync(process.execPath, ['--use-env-proxy', import.meta.filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
}
try {
  const { values } = parseArgs({ options: {
    'model-dir': { type:'string' }, port: { type:'string', default:'5178' },
    'no-open': { type:'boolean' }, 'models-only': { type:'boolean' }, 'demo-only': { type:'boolean' }, help: { type:'boolean' },
  } });
  if (values.help) {
    console.log('npm start -- [--port 5178] [--model-dir "D:\\Models\\RelightDesk"] [--no-open] [--models-only] [--demo-only]\nDefault model directory / 默认模型目录: ./models');process.exit(0);
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port / 端口必须为 1–65535');
  const models = modelDirectory(values['model-dir']);
  console.log(`\nRelight Desk · Local edition\nModel directory / 模型目录: ${models}\n`);
  const npmCli = process.env.npm_execpath || (process.platform === 'win32' ? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : null);
  function run(args) {
    // Invoke npm through Node on Windows: no command-shell quoting of file paths.
    const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`npm ${args.join(' ')} failed / 执行失败 (${result.status}): ${result.error?.message || ''}`);
  }
  if (!values['models-only']) {
    const lock = await readFile(resolve(projectRoot, 'package-lock.json'));
    const digest = createHash('sha256').update(lock).digest('hex');
    const marker = resolve(projectRoot, 'node_modules/.relight-dependencies');
    let ready = false;
    try { ready = (await readFile(marker, 'utf8')) === digest;await access(resolve(projectRoot,'node_modules/vite/bin/vite.js')); } catch { ready = false; }
    if (!ready) { console.log('Installing dependencies / 安装依赖…');run(['ci','--no-audit','--no-fund']);await writeFile(marker,digest); }
    else console.log('Dependencies ready / 已复用依赖');
  }
  if (!values['demo-only']) await ensureModels(models);
  else console.log('Demo-only mode / 仅内置场景模式：跳过模型下载');
  if (values['models-only']) process.exit(0);
  run(['run','build']);
  const { createAppServer } = await import('./scripts/server.mjs');
  const server = createAppServer({ models });
  await new Promise((resolve, reject) => { server.once('error',reject);server.listen(port,'127.0.0.1',resolve); });
  const url = `http://127.0.0.1:${port}/`;
  console.log(`\nREADY / 已启动: ${url}\nLocal browser inference · 本机浏览器推理\nCtrl+C to stop / 按 Ctrl+C 停止\n`);
  if (!values['no-open']) {
    const command = process.platform === 'win32' ? ['rundll32.exe',['url.dll,FileProtocolHandler',url]] : process.platform === 'darwin' ? ['open',[url]] : ['xdg-open',[url]];
    const browser = spawn(command[0],command[1],{stdio:'ignore',windowsHide:true});
    browser.on('error',()=>console.log(`Open manually / 请手动打开: ${url}`));browser.unref();
  }
  const close = () => { server.close();server.closeAllConnections(); };
  process.on('SIGINT',close);process.on('SIGTERM',close);
} catch (error) {
  console.error(`\nSTART FAILED / 启动失败: ${error.message}`);
  if (error.code === 'EADDRINUSE') console.error('Port in use. Close your earlier instance, or: npm start -- --port 5180\n端口已被占用，请关闭原服务或换端口。');
  process.exitCode = 1;
}
