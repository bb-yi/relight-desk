// Development-only browser tests. Import via the developer console; not in the production bundle.
import { RelightRenderer } from './renderer';
import { defaults, makeLight, type Channels, type Settings, type Light } from './types';
import { createDemo } from './demo';

export async function runGPUChecks() {
  const canvas=document.createElement('canvas'), r=new RelightRenderer(canvas);
  const results:Record<string,unknown>={};
  const check=(name:string,ok:boolean,details:unknown={})=>{results[name]={pass:ok,details};if(!ok)throw new Error(`${name}: ${JSON.stringify(details)}`);};
  const flat=(width=96,height=144):Channels=>({width,height,name:'test',source:'external',color:new Uint8ClampedArray(width*height*4).fill(255),depth:new Float32Array(width*height)});
  const pixels=async(s:Settings,lights:Light[],view:any='lit')=>{
    const blob=await r.exportPNG(s,lights,view);const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none'});
    const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
    return ctx.getImageData(0,0,c.width,c.height).data;
  };
  const mean=(p:Uint8ClampedArray)=>{let n=0;for(let i=0;i<p.length;i+=4)n+=p[i];return n/(p.length/4);};
  const middle=(p:Uint8ClampedArray)=>{let n=0;for(let i=0;i<p.length;i+=4)if(p[i]>5&&p[i]<250)n++;return n;};
  try {
    let c=flat(),s=defaults(),l=[makeLight(1,[.5,.4,1.4])];r.load(c);
    const planar=await pixels(s,l,'shadow');check('flat-no-self-shadow',mean(planar)>254.9,{mean:mean(planar)});
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(Math.abs(x-c.width*.5)<9&&Math.abs(y-c.height*.5)<14)c.depth[y*c.width+x]=1;
    r.load(c);s.height=.65;s.softness=0;
    const hard=await pixels(s,l,'shadow');check('actual-occlusion',mean(hard)<250,{mean:mean(hard)});
    const left=hard;l[0].position[0]=-.5;r.shadowDirty=true;const right=await pixels(s,l,'shadow');
    let diff=0;for(let i=0;i<left.length;i+=4)diff+=Math.abs(left[i]-right[i]);check('moving-light-moves-shadow',diff>1000,{absolutePixelDifference:diff});
    s.softness=.18;r.shadowDirty=true;const soft=await pixels(s,l,'shadow');check('softness-produces-penumbra',middle(soft)>middle(right),{hard:middle(right),soft:middle(soft)});
    s.shadows=false;r.shadowDirty=true;const off=await pixels(s,l,'shadow');check('shadow-off-is-visible',mean(off)>254.9,{mean:mean(off)});
    c=flat();for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;c.color.set(y<c.height/2?[231,18,44,255]:[25,66,211,255],i);}
    r.load(c);const original=await pixels(s,l,'original');check('orientation-and-srgb',original[0]===231&&original[1]===18&&original[original.length-2]===211,{top:[...original.subarray(0,4)],bottom:[...original.subarray(-4)]});
    c.mask=new Float32Array(c.width*c.height);r.load(c);const masked=await pixels(s,l);check('zero-mask-preserves-original',masked.every((v,i)=>v===original[i]));
    c.mask=undefined;for(let i=0;i<c.width*c.height;i++)c.color[i*4+3]=i%c.width<20?0:255;r.load(c);
    const alpha=await pixels(s,l);check('transparent-export',alpha[3]===0&&alpha[50*4+3]===255);
    c=flat();c.normal=new Float32Array(c.width*c.height*3);for(let i=0;i<c.normal.length;i+=3){c.normal[i]=.6;c.normal[i+2]=.8;}
    r.load(c);const nx=await pixels(s,l,'normal');s.flipX=true;r.channelDirty=true;const flipped=await pixels(s,l,'normal');check('normal-axis-flip',nx[0]>200&&flipped[0]<60,{before:nx[0],after:flipped[0]});
    const snapshots:{geometries:number;textures:number}[]=[];for(let i=0;i<6;i++){r.load(createDemo(128,192));r.render(defaults(),[makeLight(1)]);snapshots.push({...r.renderer.info.memory});}
    check('replacement-releases-textures',snapshots.slice(1).every(x=>x.textures===snapshots[0].textures),snapshots);
    const gl=r.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');results.gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    results.pass=true;return results;
  } finally {r.dispose();}
}

export async function benchmark(lightCount=1,frames=90) {
  const r=new RelightRenderer(document.createElement('canvas'));r.load(createDemo());const s=defaults();const lights=Array.from({length:lightCount},(_,i)=>makeLight(i+1,[Math.cos(i)*.7,Math.sin(i)*.7,1.2]));
  const times:number[]=[], intervals:number[]=[];let last=performance.now();
  try {
    for(let i=0;i<frames+10;i++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const start=performance.now();if(i>10)intervals.push(start-last);last=start;
      lights[0].position[0]=Math.sin(i*.07)*.7;lights[0].position[1]=Math.cos(i*.07)*.7;r.shadowDirty=true;r.render(s,lights,true);r.renderer.getContext().finish();
      if(i>=10)times.push(performance.now()-start);
    }
    const sorted=[...times].sort((a,b)=>a-b),mean=times.reduce((a,b)=>a+b,0)/times.length;
    return {lightCount,resolution:'1024x1536',shadowResolution:'512x768',steps:48,samples:1,frames:times.length,meanRenderMs:mean,p95RenderMs:sorted[Math.floor(sorted.length*.95)],observedFPS:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length)};
  } finally {r.dispose();}
}
