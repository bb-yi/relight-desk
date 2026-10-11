import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ensureModels, manifest, modelDirectory } from '../scripts/models.mjs';
import { createAppServer, safePath } from '../scripts/server.mjs';

const data = Buffer.from('test model'), spec = { id:'test/model', revision:'fixed', files:[{path:'onnx/model.onnx',size:data.length,sha256:createHash('sha256').update(data).digest('hex')}] };
async function temporary(fn) {
  const directory=await mkdtemp(join(tmpdir(),'relight-deploy-test-'));
  try { return await fn(directory); } finally { await rm(directory,{recursive:true,force:true}); }
}
describe('managed model files', () => {
  it('pins all files to a revision, size and SHA256', () => {
    expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/);
    for(const file of manifest.files){expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);expect(file.size).toBeGreaterThan(0);}
    expect(modelDirectory('models')).toMatch(/models$/);
  });
  it('downloads once and then verifies/reuses offline without even calling fetch', () => temporary(async directory => {
    let calls=0;
    const first=await ensureModels(directory,{spec,log:()=>{},fetcher:async()=>{calls++;return new Response(data);}});
    expect(first.downloaded).toBe(1);expect(calls).toBe(1);
    const second=await ensureModels(directory,{spec,log:()=>{},fetcher:async()=>{throw new Error('Network must not be used');}});
    expect(second).toEqual({reused:1,downloaded:0});
  }));
  it('rejects corrupted downloads, preserves existing files, and cleans partials', () => temporary(async directory => {
    const folder=join(directory,spec.id,'onnx');await mkdir(folder,{recursive:true});await writeFile(join(folder,'model.onnx'),'old model');
    await expect(ensureModels(directory,{spec,retries:0,log:()=>{},fetcher:async()=>new Response('bad')})).rejects.toThrow('mismatch');
    expect(await readFile(join(folder,'model.onnx'),'utf8')).toBe('old model');
    expect(await readdir(folder)).toEqual(['model.onnx']);
  }));
  it('keeps a recoverable backup when replacing an invalid model', () => temporary(async directory => {
    const folder=join(directory,spec.id,'onnx');await mkdir(folder,{recursive:true});await writeFile(join(folder,'model.onnx'),'old');
    await ensureModels(directory,{spec,retries:0,log:()=>{},fetcher:async()=>new Response(data)});
    expect((await readdir(folder)).some(name=>name.startsWith('model.onnx.invalid-'))).toBe(true);
    expect(await readFile(join(folder,'model.onnx'),'utf8')).toBe('test model');
  }));
});
describe('read-only local server', () => {
  it('serves built files and a custom model directory; rejects uploads and traversal', () => temporary(async directory => {
    const dist=join(directory,'dist'), models=join(directory,'separate-models');
    await mkdir(dist);await mkdir(join(models,manifest.id),{recursive:true});
    await writeFile(join(dist,'index.html'),'<h1>Relight Desk</h1>');
    await writeFile(join(models,manifest.id,'config.json'),'{}');
    const server=createAppServer({dist,models});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
      expect(await (await fetch(base)).text()).toContain('Relight Desk');
      const model=await fetch(`${base}/models/${manifest.id}/config.json`);expect(model.status).toBe(200);expect(model.headers.get('cache-control')).toBe('no-store');
      expect((await fetch(base,{method:'POST',body:'not an upload'})).status).toBe(405);
      expect((await fetch(`${base}/models/.env`)).status).toBe(404);
      expect((await fetch(`${base}/%2e%2e%5c.env`)).status).toBe(403);
      expect((await fetch(`${base}/missing.js`)).status).toBe(404);
      expect((await fetch(`${base}/models/${manifest.id}/config.json`,{method:'HEAD'})).status).toBe(200);
    } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
  }));
  it('keeps resolved static paths inside the intended root', () => {
    expect(safePath(tmpdir(),'/../secret')).toBeNull();expect(safePath(tmpdir(),'/..\\secret')).toBeNull();
  });
});
