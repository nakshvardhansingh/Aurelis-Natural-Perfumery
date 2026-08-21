"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export interface ThreeCanvasHandle {
  draw: (index: number) => void;
}

interface ThreeCanvasProps {
  framesRef: React.MutableRefObject<(HTMLImageElement | null)[]>;
  scrollProgressRef?: React.MutableRefObject<number>;
}

const LIQUID_CONFIG = {
  radius: 240,
  intensity: 0.038,
  smoothing: 0.08,
  velocityInfluence: 0.16,
  relaxation: 0.92,
  noiseStrength: 0.007,
} as const;

const RAIN_CONFIG = {
  enabled: true,
  // CRITICAL: dense continuous field — always visible streaks across viewport
  particleCount: 3800,
  windStrength: 0.13,
  baseSpeed: 1.05,
  opacity: 0.42,
  mistStrength: 0.032,
  dropletCount: 0,
  dropletOpacity: 0,
} as const;

const RAIN_STAGES = [
  { at: 0.0, intensity: 0.48, mist: 0.04, droplets: 0 },
  { at: 0.18, intensity: 0.62, mist: 0.06, droplets: 0 },
  { at: 0.38, intensity: 0.82, mist: 0.08, droplets: 0 },
  { at: 0.58, intensity: 0.92, mist: 0.09, droplets: 0 },
  { at: 0.72, intensity: 0.10, mist: 0.025, droplets: 0 },
  { at: 1.0, intensity: 0.04, mist: 0.015, droplets: 0 },
] as const;

const RAIN_TEXT_CONFIG = {
  enabled: true,
  selectors: [".magnetic-text.hero-line", ".magnetic-text.chapter-title", ".magnetic-text.final-title"],
  collisionStrength: 0.14,
  edgeInfluence: 0.75,
  slideStrength: 0.09,
  detectionRadius: 0.018,
} as const;

function lerpStage(progress: number, key: "intensity" | "mist" | "droplets"): number {
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < RAIN_STAGES.length - 1; i++) {
    const a = RAIN_STAGES[i];
    const b = RAIN_STAGES[i + 1];
    if (p >= a.at && p <= b.at) {
      const t = (p - a.at) / (b.at - a.at);
      const st = t * t * (3 - 2 * t);
      // @ts-ignore
      return a[key] * (1 - st) + b[key] * st;
    }
  }
  return RAIN_STAGES[RAIN_STAGES.length - 1][key];
}

const VERTEX_CINEMATIC = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const FRAGMENT_CINEMATIC = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform vec2 uResolution;
  uniform vec2 uTextureSize;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRadius;
  uniform float uVelocityInfluence;
  uniform float uNoiseStrength;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.; a*=0.5;} return v; }
  float falloff(float d,float r){ float t=clamp(d/r,0.,1.); return 1.-t*t*(3.-2.*t); }
  void main(){
    vec2 uv=vUv;
    vec2 center=uMouse;
    vec2 toMouse=center-uv;
    float aspect=uResolution.x/uResolution.y;
    float dist=length(toMouse*vec2(aspect,1.));
    vec2 vel=(uMouse-uPrevMouse);
    float velMag=length(vel*vec2(aspect,1.));
    float radiusN=uRadius/max(uResolution.x,uResolution.y);
    float influence=falloff(dist,radiusN);
    float velInfluence=velMag*uVelocityInfluence*influence*14.;
    float total=influence*uIntensity + velInfluence;
    float n=fbm(uv*6.5+uTime*0.12)*uNoiseStrength;
    total*= (1.+ n*6.);
    vec2 dir=normalize(toMouse + vel*0.35 + vec2(0.0001));
    vec2 disp=dir*total*0.35;
    float chroma=total*0.0025;
    vec2 uvDist=uv+disp;
    float texAspect=uTextureSize.x/uTextureSize.y;
    float canvasAspect=uResolution.x/uResolution.y;
    vec2 coverUV;
    if(texAspect > canvasAspect){
      float scale=canvasAspect/texAspect;
      coverUV=vec2(uvDist.x*scale + (1.-scale)*0.5, uvDist.y);
    } else {
      float scale=texAspect/canvasAspect;
      coverUV=vec2(uvDist.x, uvDist.y*scale + (1.-scale)*0.5);
    }
    vec3 col;
    col.r=texture2D(uTexture, coverUV+vec2(chroma,0.)).r;
    col.g=texture2D(uTexture, coverUV).g;
    col.b=texture2D(uTexture, coverUV-vec2(chroma,0.)).b;
    gl_FragColor=vec4(col,1.0);
  }
`;

const VERTEX_RAIN = `
  attribute float size;
  attribute float alpha;
  attribute float speed;
  attribute float offset;
  uniform float uTime;
  uniform float uRainIntensity;
  uniform float uWind;
  uniform vec2 uResolution;
  uniform sampler2D uTextMask;
  uniform float uTextEnabled;
  varying float vAlpha;
  varying float vStretch;
  varying float vTextInfluence;
  float hashRain(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  void main(){
    vec3 pos = position;
    float effSpeed = speed * (0.60 + uRainIntensity*0.75);
    float t = uTime * effSpeed * 0.92;
    pos.y = mod(position.y - t + offset*2.6, 2.9) - 1.45;
    pos.x += uWind * t * 0.18 * (0.55 + speed*0.35) + sin(uTime*0.28 + position.x*3.2 + offset*5.5)*0.011;

    float textInfluence = 0.0;
    if(uTextEnabled > 0.5 && uRainIntensity > 0.04){
      vec2 maskUV = vec2(pos.x*0.5 + 0.5, pos.y*0.5 + 0.5);
      if(maskUV.x >= 0.0 && maskUV.x <= 1.0 && maskUV.y >= 0.0 && maskUV.y <= 1.0){
        float m = texture(uTextMask, maskUV).r;
        if(m > 0.04){
          float texel = 1.0/512.0;
          float l = texture(uTextMask, maskUV + vec2(-texel, 0.0)).r;
          float r = texture(uTextMask, maskUV + vec2(texel, 0.0)).r;
          float b = texture(uTextMask, maskUV + vec2(0.0, -texel)).r;
          float tt = texture(uTextMask, maskUV + vec2(0.0, texel)).r;
          vec2 grad = vec2(r - l, tt - b);
          float edge = length(grad);
          float rnd = hashRain(vec2(offset*12.3, speed*7.1));
          // probability: 70-85% subtle deflection, 10-20% slide, 5-10% stronger bounce
          float prob = 0.78 + rnd*0.18;
          // distance-based: detect before contact via neighbours
          float prox = max(max(l,r), max(b,tt));
          float base = max(m*0.88 + edge*0.55, prox*0.42);
          textInfluence = base * prob * uRainIntensity * (0.65 + speed*0.45);
          // gravity remains dominant — small deflection, mostly sideways
          vec2 n = vec2(0.0);
          if(edge > 0.02){
            n = normalize(grad + vec2(0.0, -0.85));
          } else {
            // interior flat — push sideways randomly
            n = normalize(vec2(hashRain(vec2(offset, speed))-0.5, -0.55));
          }
          // slide vs bounce: mostly slide along edge
          float slideBias = 0.7;
          vec2 slideDir = normalize(vec2(n.y, -n.x));
          vec2 dir = mix(n, slideDir, 0.38);
          pos.xy += dir * textInfluence * 0.052;
          // add micro trail bias downward
          pos.y -= textInfluence * 0.012;
        }
      }
    }
    vTextInfluence = textInfluence;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float resScale = max(uResolution.x, uResolution.y) / 1080.0;
    gl_PointSize = size * (0.78 + uRainIntensity*0.95) * (0.95 + resScale*0.42) * 2.1;
    gl_PointSize = clamp(gl_PointSize, 1.8, 15.0);
    vAlpha = alpha * (0.58 + uRainIntensity*1.05) * (1.0 - textInfluence*0.18);
    vStretch = 0.48 + speed * 0.58;
  }
`;

const FRAGMENT_RAIN = `
  precision highp float;
  varying float vAlpha;
  varying float vStretch;
  varying float vTextInfluence;
  void main(){
    vec2 p = gl_PointCoord*2.0 - 1.0;
    float d = length(vec2(p.x*3.8, p.y * vStretch));
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    float tip = smoothstep(-1.0, -0.18, p.y) * smoothstep(1.0, 0.16, p.y);
    a *= tip * 1.22;
    a *= vAlpha;
    // micro trail fade over text center
    a *= 1.0 - clamp(vTextInfluence*0.35, 0.0, 0.35);
    a = clamp(a, 0.0, 1.0);
    if(a < 0.012) discard;
    vec3 col = vec3(0.96, 0.97, 1.0);
    gl_FragColor = vec4(col, a*0.82);
  }
`;

const VERTEX_MIST = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FRAGMENT_MIST = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMist;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.; float a=0.5; for(int i=0;i<3;i++){ v+=a*noise(p); p*=2.; a*=0.5;} return v; }
  void main(){
    float n = fbm(vUv*2.8 + vec2(uTime*0.015, uTime*0.008));
    float n2 = fbm(vUv*5.5 - vec2(uTime*0.012, 0.0));
    float fog = smoothstep(0.35, 0.85, n*0.7 + n2*0.3);
    float heightFade = smoothstep(1.0, 0.12, vUv.y*1.1);
    float vign = smoothstep(0.0, 1.0, 1.0 - length((vUv-0.5)*0.9));
    float a = fog * uMist * 0.38 * heightFade * vign;
    vec3 col = vec3(0.74, 0.77, 0.84);
    gl_FragColor = vec4(col, a);
  }
`;

const VERTEX_DROPLET = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FRAGMENT_DROPLET = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uTextureSize;
  uniform float uDropletIntensity;
  uniform vec2 uDroplets[14];
  uniform float uDropletSizes[14];
  uniform float uTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  void main(){
    vec2 uv = vUv;
    float aspect = uResolution.x/uResolution.y;
    vec2 refractedUV = uv;
    float mask = 0.0;
    float highlight = 0.0;
    for(int i=0;i<14;i++){
      vec2 c = uDroplets[i];
      float sz = uDropletSizes[i];
      if(sz < 0.001) continue;
      vec2 toCenter = (uv - c) * vec2(aspect,1.0);
      // irregular shape via noise
      float n = hash(c*12.3 + float(i)*7.1) * 0.12;
      float r = sz * (0.85 + n);
      float d = length(toCenter);
      float m = 1.0 - smoothstep(r*0.82, r, d);
      if(m > 0.001){
        // refraction: pull uv toward center
        float refr = m * uDropletIntensity * 0.012;
        refractedUV += normalize(toCenter + vec2(0.0001)) * refr;
        mask = max(mask, m);
        // specular highlight top
        vec2 hlPos = c + vec2(0.006, 0.012) * (0.7 + sz*2.0);
        float hd = length((uv - hlPos)*vec2(aspect,1.0));
        float hl = smoothstep(r*0.28, 0.0, hd) * m * 0.75;
        highlight = max(highlight, hl);
      }
    }
    if(mask < 0.01){
      gl_FragColor = vec4(0.0);
      return;
    }
    // cover-fit for refraction sample
    float texAspect = uTextureSize.x/uTextureSize.y;
    float canvasAspect = uResolution.x/uResolution.y;
    vec2 cUV;
    if(texAspect > canvasAspect){
      float sc = canvasAspect/texAspect;
      cUV = vec2(refractedUV.x*sc + (1.0-sc)*0.5, refractedUV.y);
    } else {
      float sc = texAspect/canvasAspect;
      cUV = vec2(refractedUV.x, refractedUV.y*sc + (1.0-sc)*0.5);
    }
    vec3 col = texture2D(uTexture, cUV).rgb;
    // edge fresnel
    float edge = pow(mask, 1.4);
    col = mix(col, vec3(1.0), highlight*0.55);
    // slight bright rim
    col += vec3(0.12,0.14,0.16) * pow(mask, 8.0) * 0.35;
    float a = mask * 0.96 * uDropletIntensity;
    // fade with overall intensity
    gl_FragColor = vec4(col, a);
  }
`;

const ThreeCinematicCanvas = forwardRef<ThreeCanvasHandle, ThreeCanvasProps>(
  function ThreeCinematicCanvas({ framesRef, scrollProgressRef }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const rafRef = useRef<number>(0);

    const mouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const prevMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const targetMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const intensityRef = useRef(0);
    const targetIntensityRef = useRef(0);
    const lastIndexRef = useRef(-1);

    useImperativeHandle(
      ref,
      () => ({
        draw(index: number) {
          // handled via materialRef in effect — store index to pick up next frame
          lastIndexRef.current = index;
          // actual texture swap happens inside effect via framesRef
          const mat = (materialRef as any).current as THREE.ShaderMaterial | null;
          const tex = (textureRef as any).current as THREE.Texture | null;
          if (!mat || !tex || !framesRef.current[index]) {
            // fallback handled in render loop via lastIndexRef check
          } else {
            // quick path if already correct
          }
        },
      }),
      []
    );

    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const textureRef = useRef<THREE.Texture | null>(null);
    const rainMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
    const mistMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
    const dropletMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
    const dropletCentersRef = useRef<THREE.Vector2[]>([]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isCoarse =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;
      const disableRain = prefersReduced || isCoarse;

      // --- text collision mask (offscreen canvas -> texture) ---
      const maskCanvas = document.createElement("canvas");
      const maskW = 512;
      const maskH = Math.round(512 * window.innerHeight / Math.max(1, window.innerWidth));
      maskCanvas.width = maskW;
      maskCanvas.height = maskH;
      const maskCtx = maskCanvas.getContext("2d", { alpha: true })!;
      const maskTexture = new THREE.CanvasTexture(maskCanvas);
      maskTexture.minFilter = THREE.LinearFilter;
      maskTexture.magFilter = THREE.LinearFilter;
      maskTexture.wrapS = THREE.ClampToEdgeWrapping;
      maskTexture.wrapT = THREE.ClampToEdgeWrapping;
      maskTexture.needsUpdate = false;

      const getEffectiveOpacity = (el: Element): number => {
        let o = 1;
        let cur: Element | null = el;
        while (cur && cur !== container && cur !== document.documentElement) {
          const s = getComputedStyle(cur as Element);
          const v = parseFloat(s.opacity);
          if (!isNaN(v)) o *= v;
          if (s.display === "none" || s.visibility === "hidden") return 0;
          cur = cur.parentElement;
        }
        return o;
      };

      const updateTextMask = () => {
        if (!RAIN_TEXT_CONFIG.enabled) return;
        const w = maskCanvas.width, h = maskCanvas.height;
        maskCtx.clearRect(0, 0, w, h);
        maskCtx.fillStyle = "black";
        maskCtx.fillRect(0, 0, w, h);
        maskCtx.fillStyle = "white";
        const scaleX = w / window.innerWidth;
        const scaleY = h / window.innerHeight;
        const selectors = RAIN_TEXT_CONFIG.selectors.join(",");
        const els = document.querySelectorAll(selectors);
        els.forEach((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) return;
          if (rect.bottom < -30 || rect.top > window.innerHeight + 30) return;
          const effOpacity = getEffectiveOpacity(el);
          if (effOpacity < 0.07) return;
          const style = getComputedStyle(el);
          const raw = (el as HTMLElement).getAttribute("aria-label") || (el as HTMLElement).innerText || "";
          if (!raw.trim()) return;
          const lines = raw.split("\n");
          const fontSize = parseFloat(style.fontSize);
          const lineHeight = parseFloat(style.lineHeight) || fontSize * 0.98;
          const fontWeight = style.fontWeight;
          const fontFamily = style.fontFamily;
          let lsPx = 0;
          const ls = style.letterSpacing;
          if (ls && ls !== "normal") {
            if (ls.endsWith("em")) lsPx = parseFloat(ls) * fontSize;
            else if (ls.endsWith("px")) lsPx = parseFloat(ls);
          }
          maskCtx.font = `${fontWeight} ${fontSize * scaleX}px ${fontFamily}`;
          if ("letterSpacing" in maskCtx) (maskCtx as any).letterSpacing = `${lsPx * scaleX}px`;
          maskCtx.textAlign = (style.textAlign as CanvasTextAlign) || "left";
          maskCtx.textBaseline = "top";
          maskCtx.globalAlpha = Math.min(1, effOpacity);
          lines.forEach((line, li) => {
            let x = rect.left * scaleX;
            if (style.textAlign === "center") x = (rect.left + rect.width / 2) * scaleX;
            else if (style.textAlign === "right") x = rect.right * scaleX;
            const y = (rect.top + li * lineHeight) * scaleY;
            if (y < -80 * scaleY || y > h + 80 * scaleY) return;
            maskCtx.fillText(line, x, y);
          });
        });
        maskCtx.globalAlpha = 1;
        maskTexture.needsUpdate = true;
      };

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
      camera.position.z = 1;

      // --- cinematic plane ---
      const geo = new THREE.PlaneGeometry(2, 2);
      const tex = new THREE.Texture();
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      textureRef.current = tex;

      const cinematicMat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_CINEMATIC,
        fragmentShader: FRAGMENT_CINEMATIC,
        uniforms: {
          uTexture: { value: tex },
          uMouse: { value: new THREE.Vector2(0.5, 0.5) },
          uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uTextureSize: { value: new THREE.Vector2(1920, 1080) },
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uRadius: { value: LIQUID_CONFIG.radius },
          uVelocityInfluence: { value: LIQUID_CONFIG.velocityInfluence },
          uNoiseStrength: { value: LIQUID_CONFIG.noiseStrength },
        },
        depthWrite: false,
        depthTest: false,
      });
      materialRef.current = cinematicMat;
      const cinematicMesh = new THREE.Mesh(geo, cinematicMat);
      cinematicMesh.frustumCulled = false;
      scene.add(cinematicMesh);

      // --- mist ---
      const mistMat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_MIST,
        fragmentShader: FRAGMENT_MIST,
        uniforms: {
          uTime: { value: 0 },
          uMist: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      mistMaterialRef.current = mistMat;
      const mistMesh = new THREE.Mesh(geo.clone(), mistMat);
      mistMesh.frustumCulled = false;
      mistMesh.renderOrder = 1;
      scene.add(mistMesh);

      // --- rain points ---
      const rainCount = RAIN_CONFIG.particleCount;
      const rainGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(rainCount * 3);
      const sizes = new Float32Array(rainCount);
      const alphas = new Float32Array(rainCount);
      const speeds = new Float32Array(rainCount);
      const offsets = new Float32Array(rainCount);

      for (let i = 0; i < rainCount; i++) {
        const depth = Math.random(); // 0 bg small -> 1 fg large
        // distribute to match spec foreground 500 / mid 1200 / bg 800 approx via size
        positions[i * 3] = (Math.random() * 2.4 - 1.2) * 1.15;
        positions[i * 3 + 1] = Math.random() * 2.6 - 1.3;
        positions[i * 3 + 2] = 0;
        // size: bg ~1.2, fg ~5.2
        sizes[i] = THREE.MathUtils.lerp(1.4, 5.4, Math.pow(depth, 1.2)) + (Math.random() - 0.5) * 0.6;
        alphas[i] = THREE.MathUtils.lerp(0.06, 0.34, depth) * (0.7 + Math.random() * 0.6);
        speeds[i] = THREE.MathUtils.lerp(0.42, 1.18, depth) * RAIN_CONFIG.baseSpeed;
        offsets[i] = Math.random();
      }
      rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      rainGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      rainGeo.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
      rainGeo.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
      rainGeo.setAttribute("offset", new THREE.BufferAttribute(offsets, 1));

      const rainMat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_RAIN,
        fragmentShader: FRAGMENT_RAIN,
        uniforms: {
          uTime: { value: 0 },
          uRainIntensity: { value: 0 },
          uWind: { value: RAIN_CONFIG.windStrength },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uTextMask: { value: maskTexture },
          uTextEnabled: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      rainMaterialRef.current = rainMat;
      const rainPoints = new THREE.Points(rainGeo, rainMat);
      rainPoints.frustumCulled = false;
      rainPoints.renderOrder = 2;
      scene.add(rainPoints);

      // --- droplets ---
      const dropletCenters: THREE.Vector2[] = [];
      const dropletSizes: number[] = [];
      const dropletSpeeds: number[] = [];
      for (let i = 0; i < 14; i++) {
        dropletCenters.push(new THREE.Vector2(Math.random() * 0.9 + 0.05, Math.random() * 0.85 + 0.08));
        const sz = i < 2 ? 0.038 + Math.random() * 0.02 : 0.012 + Math.random() * 0.018;
        dropletSizes.push(sz);
        dropletSpeeds.push(0.00015 + Math.random() * 0.00035);
      }
      dropletCentersRef.current = dropletCenters;

      const dropletMat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_DROPLET,
        fragmentShader: FRAGMENT_DROPLET,
        uniforms: {
          uTexture: { value: tex },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uTextureSize: { value: new THREE.Vector2(1920, 1080) },
          uDropletIntensity: { value: 0 },
          uDroplets: { value: dropletCenters },
          uDropletSizes: { value: dropletSizes },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      dropletMaterialRef.current = dropletMat;
      const dropletMesh = new THREE.Mesh(geo.clone(), dropletMat);
      dropletMesh.frustumCulled = false;
      dropletMesh.renderOrder = 3;
      scene.add(dropletMesh);

      const resize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        (cinematicMat.uniforms.uResolution.value as THREE.Vector2).set(w, h);
        (dropletMat.uniforms.uResolution.value as THREE.Vector2).set(w, h);
        (rainMat.uniforms.uResolution.value as THREE.Vector2).set(w, h);
        const newMaskH = Math.round(512 * h / Math.max(1, w));
        if (maskCanvas.height !== newMaskH) {
          maskCanvas.height = newMaskH;
        }
      };
      resize();
      window.addEventListener("resize", resize);

      const onMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height;
        targetMouseRef.current.set(x, y);
        if (!prefersReduced && !isCoarse) targetIntensityRef.current = LIQUID_CONFIG.intensity;
      };
      const onLeave = () => {
        targetIntensityRef.current = 0;
      };
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);

      targetMouseRef.current.set(0.5, 0.5);
      smoothMouseRef.current.set(0.5, 0.5);

      let lastTime = performance.now();
      let lastFrameIdx = -1;

      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        const dt = Math.min((now - lastTime) / 1000, 0.06);
        lastTime = now;
        const t = now * 0.001;

        // mouse spring
        const k = LIQUID_CONFIG.smoothing;
        const lerpK = 1 - Math.pow(1 - k, dt * 60);
        smoothMouseRef.current.x += (targetMouseRef.current.x - smoothMouseRef.current.x) * lerpK;
        smoothMouseRef.current.y += (targetMouseRef.current.y - smoothMouseRef.current.y) * lerpK;
        const prevX = mouseRef.current.x;
        const prevY = mouseRef.current.y;
        mouseRef.current.copy(smoothMouseRef.current);
        const relaxK = 1 - Math.pow(LIQUID_CONFIG.relaxation, dt * 60);
        intensityRef.current += (targetIntensityRef.current - intensityRef.current) * (1 - relaxK);

        // scroll progress → rain/mist/droplet stage
        let prog = 0;
        if (scrollProgressRef?.current !== undefined) prog = scrollProgressRef.current;
        else {
          // fallback: estimate from lastIndexRef if no scrollProgressRef
          prog = lastIndexRef.current >= 0 ? lastIndexRef.current / 191 : 0;
        }
        const rainIntensity = lerpStage(prog, "intensity");
        const mistIntensity = lerpStage(prog, "mist");
        const dropletIntensity = lerpStage(prog, "droplets");

        const finalRainIntensity = disableRain ? 0 : rainIntensity;
        const finalMist = disableRain ? 0 : mistIntensity;
        const finalDroplets = disableRain ? 0 : dropletIntensity;

        // update cinematic texture if frame changed
        const idx = lastIndexRef.current;
        if (idx !== lastFrameIdx) {
          lastFrameIdx = idx;
          const img = framesRef.current[idx];
          if (img && (tex.image as any) !== img) {
            tex.image = img;
            tex.needsUpdate = true;
            cinematicMat.uniforms.uTextureSize.value.set(
              img.naturalWidth || 1920,
              img.naturalHeight || 1080
            );
            dropletMat.uniforms.uTextureSize.value.set(
              img.naturalWidth || 1920,
              img.naturalHeight || 1080
            );
          }
        } else if (idx >= 0) {
          const img = framesRef.current[idx];
          if (img && (tex.image as any) !== img) {
            tex.image = img;
            tex.needsUpdate = true;
          }
        }

        // uniforms — cinematic liquid
        cinematicMat.uniforms.uMouse.value.copy(smoothMouseRef.current);
        cinematicMat.uniforms.uPrevMouse.value.set(prevX, prevY);
        cinematicMat.uniforms.uTime.value = t;
        cinematicMat.uniforms.uIntensity.value = intensityRef.current;

        // mist
        mistMat.uniforms.uTime.value = t;
        mistMat.uniforms.uMist.value = finalMist * RAIN_CONFIG.mistStrength * 6.5;

        // update text collision mask for rain
        updateTextMask();
        rainMat.uniforms.uTextMask.value = maskTexture;
        rainMat.uniforms.uTextEnabled.value = RAIN_TEXT_CONFIG.enabled && finalRainIntensity > 0.02 ? 1 : 0;

        // rain
        rainMat.uniforms.uTime.value = t;
        rainMat.uniforms.uRainIntensity.value = finalRainIntensity;
        rainMat.uniforms.uWind.value = RAIN_CONFIG.windStrength;

        // droplets disabled per user — no floatingLens droplets
        dropletMesh.visible = false;
        dropletMat.uniforms.uDropletIntensity.value = 0;

        renderer.render(scene, camera);
      };
      rafRef.current = requestAnimationFrame(loop);

      return () => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseleave", onLeave);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        geo.dispose();
        rainGeo.dispose();
        cinematicMat.dispose();
        mistMat.dispose();
        rainMat.dispose();
        dropletMat.dispose();
        tex.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    }, [framesRef, scrollProgressRef]);

    return (
      <div
        ref={containerRef}
        className="three-canvas"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
      />
    );
  }
);

export default ThreeCinematicCanvas;
