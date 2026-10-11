export const vertex = /* glsl */`
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }
`;
const common = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D colorMap;
uniform sampler2D heightMap;
uniform vec2 imageSize;
uniform float amplitude;
float heightAt(vec2 p){return texture2D(heightMap,p).r*amplitude;}
vec3 positionAt(vec2 uv){return vec3((uv*2.-1.)*vec2(imageSize.x/imageSize.y,1.),heightAt(uv));}
vec2 toUV(vec2 p){return p*.5/vec2(imageSize.x/imageSize.y,1.)+.5;}
vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 encode(vec3 c){c=max(c,vec3(0)); return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
`;
export const depthFragment = common + /* glsl */`
uniform sampler2D rawDepth;
uniform float smoothing;
uniform bool lineAssist;
void main(){
  float c=texture2D(rawDepth,vUv).r;
  if(smoothing<.01){gl_FragColor=vec4(c,0.,0.,1.);return;}
  vec4 center=texture2D(colorMap,vUv); float total=0.,weights=0.;
  for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
    vec2 uv=vUv+vec2(float(x),float(y))*smoothing/imageSize;
    float d=texture2D(rawDepth,uv).r;vec4 color=texture2D(colorMap,uv);
    float spatial=exp(-float(x*x+y*y)/4.);
    float w=spatial*exp(-abs(d-c)*60.)*step(.01,color.a)*step(.01,center.a);
    if(lineAssist)w*=exp(-length(color.rgb-center.rgb)*12.);
    total+=d*w;weights+=w;
  }
  gl_FragColor=vec4(weights>.0001?total/weights:c,0.,0.,1.);
}
`;
export const normalFragment = common + /* glsl */`
uniform sampler2D inputNormal;
uniform bool hasNormal;
uniform vec3 flips;
uniform float normalStrength;
void main(){
  vec3 n;
  if(hasNormal){n=texture2D(inputNormal,vUv).xyz; if(length(n)<.001)n=vec3(0,0,1);}
  else {
    vec2 t=1./imageSize;float c=heightAt(vUv);
    float l=heightAt(vUv-vec2(t.x,0)),r=heightAt(vUv+vec2(t.x,0));
    float b=heightAt(vUv-vec2(0,t.y)),u=heightAt(vUv+vec2(0,t.y));
    // One-sided derivatives near discontinuities: never turn a silhouette into a bevel.
    float limit=.055*amplitude;
    float dx=abs(r-c)<limit && abs(c-l)<limit?(r-l)*.5:abs(r-c)<abs(c-l)?r-c:c-l;
    float dy=abs(u-c)<limit && abs(c-b)<limit?(u-b)*.5:abs(u-c)<abs(c-b)?u-c:c-b;
    if(min(abs(r-c),abs(l-c))>limit)dx=0.;
    if(min(abs(u-c),abs(b-c))>limit)dy=0.;
    n=vec3(-dx*imageSize.y*.5,-dy*imageSize.y*.5,1.);
  }
  n.xy*=normalStrength;n*=flips;n=normalize(n);
  gl_FragColor=vec4(n*.5+.5,texture2D(colorMap,vUv).a);
}
`;
const lightUniforms = /* glsl */`
uniform vec3 lightPosition[8];
uniform vec3 lightColor[8];
uniform float lightIntensity[8];
uniform float lightRange[8];
uniform int lightCount;
`;
export const shadowFragment = common + lightUniforms + /* glsl */`
uniform int groupIndex;
uniform int marchSteps;
uniform int areaSamples;
uniform float bias;
uniform float softness;
uniform bool shadowsEnabled;
float trace(vec3 p,vec3 target){
  vec3 delta=target-p;
  // Nothing can occlude the ray once it is above the maximum field height.
  float endT=delta.z>0.?clamp((amplitude+bias-p.z)/delta.z,0.,1.):1.;
  vec2 deltaPixels=(toUV(target.xy)-toUV(p.xy))*imageSize;
  float startT=min(.08,1.5/max(length(deltaPixels),1.));
  if(endT<=startT)return 1.;
  for(int j=0;j<96;j++){
    if(j>=marchSteps)break;
    float t=mix(startT,endT,(float(j)+.5)/float(marchSteps));
    vec3 q=p+delta*t;vec2 uv=toUV(q.xy);
    if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))break;
    if(texture2D(colorMap,uv).a<.05)continue;
    if(heightAt(uv)>q.z+bias)return 0.;
  }
  return 1.;
}
void main(){
  vec4 vis=vec4(1.); if(!shadowsEnabled||texture2D(colorMap,vUv).a<.01){gl_FragColor=vis;return;}
  vec3 p=positionAt(vUv);
  for(int k=0;k<4;k++){
    int index=groupIndex*4+k;if(index>=lightCount)break;
    if(lightIntensity[index]<=0.)continue;
    float value=0.;
    for(int s=0;s<4;s++){
      if(s>=areaSamples)break;
      float angle=(float(s)+.5)*2.399963;float radius=areaSamples==1?0.:sqrt((float(s)+.5)/float(areaSamples))*softness;
      vec3 target=lightPosition[index]+vec3(cos(angle),sin(angle),0.)*radius;
      value+=trace(p,target);
    }
    vis[k]=value/float(areaSamples);
  }
  gl_FragColor=vis;
}
`;
export const blurFragment = common + /* glsl */`
uniform sampler2D shadowMap;
uniform vec2 shadowSize;
uniform float softness;
void main(){
  float c=heightAt(vUv);vec4 result=vec4(0);float sum=0.;
  float radius=softness>0.?1.25:0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 p=vUv+vec2(float(x),float(y))*radius/shadowSize;
    float w=exp(-float(x*x+y*y)*.7-abs(heightAt(p)-c)*180./max(amplitude,.01));
    if(abs(texture2D(colorMap,p).a-texture2D(colorMap,vUv).a)>.1)w=0.;
    result+=texture2D(shadowMap,p)*w;sum+=w;
  }
  gl_FragColor=result/max(sum,.00001);
}
`;
export const lightingFragment = common + lightUniforms + /* glsl */`
uniform sampler2D normalMap;
uniform sampler2D linearColorMap;
uniform bool hasLinearColor;
uniform sampler2D maskMap;
uniform sampler2D shadows0;
uniform sampler2D shadows1;
uniform float ambient,wrapLight,threshold,feather,specular,shininess,rim,exposure,effectMix,comparison;
uniform vec3 ambientColor;
uniform bool toon,baseMode;
uniform int viewMode;
void main(){
  vec4 src=texture2D(colorMap,vUv);vec3 base=hasLinearColor?texture2D(linearColorMap,vUv).rgb:linearize(src.rgb);
  vec3 n=normalize(texture2D(normalMap,vUv).xyz*2.-1.),p=positionAt(vUv);
  vec3 direct=vec3(0), highlights=vec3(0);float visibleTotal=0.,lightWeight=0.;
  vec4 a=texture2D(shadows0,vUv),b=texture2D(shadows1,vUv);
  for(int k=0;k<8;k++){
    if(k>=lightCount)break;if(lightIntensity[k]<=0.)continue;
    vec3 offset=lightPosition[k]-p;float distanceToLight=max(length(offset),.01);vec3 l=offset/distanceToLight;
    float attenuation=1./(1.+pow(distanceToLight/max(lightRange[k],.01),2.));
    float ndl=dot(n,l);float diffuse=clamp((ndl+wrapLight)/(1.+wrapLight),0.,1.);
    if(toon)diffuse=smoothstep(threshold-feather,threshold+feather,ndl);
    float visibility=k<4?a[k]:b[k-4];
    vec3 radiance=lightColor[k]*lightIntensity[k]*attenuation;
    direct+=radiance*diffuse*visibility;
    vec3 halfSum=l+vec3(0,0,1);vec3 h=halfSum/max(length(halfSum),.0001);
    float shine=pow(max(dot(n,h),0.),shininess)*specular*step(0.,ndl);
    float edge=pow(1.-max(n.z,0.),3.)*max(dot(n,l),0.)*rim;
    highlights+=radiance*(shine+edge)*visibility;
    visibleTotal+=visibility*lightIntensity[k];lightWeight+=lightIntensity[k];
  }
  vec3 illumination=ambientColor*ambient+direct;
  vec3 result=base*illumination+highlights;
  if(!baseMode)result=(base*illumination+highlights)/(ambient+.8);
  result*=exp2(exposure);
  float mask=clamp(texture2D(maskMap,vUv).r,0.,1.);
  vec3 outputColor=mix(base,result,effectMix*mask);
  if(viewMode==1 && vUv.x<comparison)outputColor=base;
  if(viewMode==2)outputColor=base;
  if(viewMode==3){gl_FragColor=vec4(n*.5+.5,src.a);return;}
  if(viewMode==4){gl_FragColor=vec4(vec3(heightAt(vUv)/max(amplitude,.001)),src.a);return;}
  if(viewMode==5)outputColor=illumination+highlights;
  if(viewMode==6){gl_FragColor=vec4(vec3(lightWeight>0.?visibleTotal/lightWeight:1.),src.a);return;}
  gl_FragColor=vec4(clamp(encode(outputColor),0.,1.),src.a);
}
`;
