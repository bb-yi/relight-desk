import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(await readFile(new URL('../model-manifest.json', import.meta.url), 'utf8'));
export const modelDirectory = (override) => resolve(projectRoot, override || process.env.RELIGHT_MODEL_DIR || 'models');
export async function validModelFile(file, entry) {
  try {
    if ((await stat(file)).size !== entry.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === entry.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false;throw error; }
}
export async function ensureModels(root, { spec = manifest, fetcher = fetch, log = console.log, retries = 2 } = {}) {
  const summary = { reused: 0, downloaded: 0 };
  for (const entry of spec.files) {
    const file = resolve(root, spec.id, entry.path);
    if (await validModelFile(file, entry)) { log(`[model] OK / 已复用 ${entry.path}`);summary.reused++;continue; }
    await mkdir(dirname(file), { recursive: true });
    let failure;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const temporary = `${file}.partial-${randomUUID()}`;
      try {
        const url = `https://huggingface.co/${spec.id}/resolve/${spec.revision}/${entry.path}`;
        log(`[model] Download / 下载 ${entry.path} (${(entry.size / 1e6).toFixed(2)} MB), attempt ${attempt + 1}`);
        const response = await fetcher(url, { signal: AbortSignal.timeout(600_000) });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${entry.path}`);
        let received = 0, lastPercent = -10;
        const meter = new Transform({ transform(chunk, _encoding, callback) {
          received += chunk.length;
          if (received > entry.size) return callback(new Error(`File larger than manifest: ${entry.path}`));
          const percent = Math.floor(received / entry.size * 100);
          if (percent >= lastPercent + 10) { log(`  ${entry.path}: ${percent}%`);lastPercent = percent; }
          callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary, { flags: 'wx' }));
        if (!(await validModelFile(temporary, entry))) throw new Error(`SHA-256/size mismatch: ${entry.path}`);
        // Preserve a pre-existing invalid file rather than destroying user-managed data.
        try { await rename(file, `${file}.invalid-${randomUUID()}`);log(`[model] Preserved invalid file / 已备份无效文件 ${file}`); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await rename(temporary, file);summary.downloaded++;failure = null;break;
      } catch (error) { failure = error;log(`[model] ${error.message}`); }
      finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
    if (failure) throw new Error(`Model preparation failed / 模型准备失败: ${failure.message}\nCheck network/proxy and run again; verified files will be reused. 检查网络或代理后重试，完整文件不会重新下载。`);
  }
  return summary;
}
