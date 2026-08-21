"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export interface ThreeCanvasHandle {
  draw: (index: number) => void;
}

interface ThreeCanvasProps {
  framesRef: React.MutableRefObject<(HTMLImageElement | null)[]>;
}

const LIQUID_CONFIG = {
  radius: 240,
  intensity: 0.038,
  smoothing: 0.08,
  velocityInfluence: 0.16,
  relaxation: 0.92,
  noiseStrength: 0.007,
} as const;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
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
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v=0.; float a=0.5;
    for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.; a*=0.5; }
    return v;
  }
  float falloff(float d,float r){
    float t=clamp(d/r,0.,1.);
    return 1. - t*t*(3.-2.*t);
  }

  void main(){
    vec2 uv = vUv;
    // mouse in 0..1 (normalized). Y is flipped so 0=bottom in WebGL but we pass top-left origin
    vec2 center = uMouse;
    vec2 toMouse = center - uv;
    // correct for aspect so radius is circular on screen
    float aspect = uResolution.x / uResolution.y;
    float dist = length(toMouse * vec2(aspect, 1.0));

    vec2 vel = (uMouse - uPrevMouse);
    float velMag = length(vel * vec2(aspect, 1.0));

    float radiusN = uRadius / max(uResolution.x, uResolution.y);
    float influence = falloff(dist, radiusN);

    // velocity stretches along motion direction
    float velInfluence = velMag * uVelocityInfluence * influence * 12.0;
    float total = influence * uIntensity + velInfluence;

    // organic noise breaks perfect circle
    float n = fbm(uv*6.5 + uTime*0.12) * uNoiseStrength;
    total *= (1. + n * 6.0);

    // direction: radial + velocity bias
    vec2 dir = normalize(toMouse + vel*0.35 + vec2(0.0001));
    vec2 disp = dir * total * 0.35;

    // chromatic micro-shift for water refraction (very subtle)
    float chroma = total * 0.0025;
    vec2 uvDist = uv + disp;

    // --- cover-fit (object-fit: cover) mapping ---
    float texAspect = uTextureSize.x / uTextureSize.y;
    float canvasAspect = uResolution.x / uResolution.y;
    vec2 coverUV;
    if(texAspect > canvasAspect){
      float scale = canvasAspect / texAspect;
      // texture wider than canvas -> crop sides
      coverUV = vec2(uvDist.x * scale + (1.0 - scale)*0.5, uvDist.y);
    } else {
      float scale = texAspect / canvasAspect;
      coverUV = vec2(uvDist.x, uvDist.y * scale + (1.0 - scale)*0.5);
    }
    // sample
    // we flip Y because Three textures are Y-flipped by default? We set flipY=true so keep as is
    vec3 col;
    col.r = texture2D(uTexture, coverUV + vec2(chroma, 0.)).r;
    col.g = texture2D(uTexture, coverUV).g;
    col.b = texture2D(uTexture, coverUV - vec2(chroma, 0.)).b;

    // feathered vignette on edge of liquid field (imperceptible hardening)
    // no hard rim — already via falloff

    gl_FragColor = vec4(col, 1.0);
  }
`;

const ThreeCinematicCanvas = forwardRef<ThreeCanvasHandle, ThreeCanvasProps>(
  function ThreeCinematicCanvas({ framesRef }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const textureRef = useRef<THREE.Texture | null>(null);
    const rafRef = useRef<number>(0);

    const mouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const prevMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const smoothMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const targetMouseRef = useRef(new THREE.Vector2(0.5, 0.5));
    const intensityRef = useRef(0);
    const targetIntensityRef = useRef(0);
    const timeRef = useRef(0);
    const lastIndexRef = useRef(-1);

    useImperativeHandle(
      ref,
      () => ({
        draw(index: number) {
          const tex = textureRef.current;
          const mat = materialRef.current;
          if (!tex || !mat) return;
          const frames = framesRef.current;
          if (frames.length === 0) return;
          let img: HTMLImageElement | null = null;
          if (frames[index]) img = frames[index];
          else {
            for (let o = 1; o < frames.length; o++) {
              const a = index + o, b = index - o;
              if (a < frames.length && frames[a]) { img = frames[a]; break; }
              if (b >= 0 && frames[b]) { img = frames[b]; break; }
            }
          }
          if (!img) return;
          if (index === lastIndexRef.current && tex.image === img) return;
          lastIndexRef.current = index;
          // update texture
          tex.image = img;
          tex.needsUpdate = true;
          // update texture size uniform
          if (materialRef.current) {
            materialRef.current.uniforms.uTextureSize.value.set(
              img.naturalWidth || img.width || 1920,
              img.naturalHeight || img.height || 1080
            );
          }
        },
      }),
      [framesRef]
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isCoarse =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;
      const disableLiquid = prefersReduced || isCoarse;

      // --- THREE setup ---
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      cameraRef.current = camera;

      const geometry = new THREE.PlaneGeometry(2, 2);

      const texture = new THREE.Texture();
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = false;
      textureRef.current = texture;

      // placeholder 1x1 pixel until first frame arrives
      const placeholder = document.createElement("canvas");
      placeholder.width = 1; placeholder.height = 1;
      const pctx = placeholder.getContext("2d")!;
      pctx.fillStyle = "#0D0B09"; pctx.fillRect(0,0,1,1);
      const placeholderTex = new THREE.CanvasTexture(placeholder);
      placeholderTex.colorSpace = THREE.SRGBColorSpace;
      texture.image = placeholder as unknown as HTMLImageElement;

      const uniforms: Record<string, THREE.IUniform> = {
        uTexture: { value: texture },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTextureSize: { value: new THREE.Vector2(1920, 1080) },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uRadius: { value: LIQUID_CONFIG.radius },
        uVelocityInfluence: { value: LIQUID_CONFIG.velocityInfluence },
        uNoiseStrength: { value: LIQUID_CONFIG.noiseStrength },
      };

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms,
        depthWrite: false,
        depthTest: false,
        transparent: false,
      });
      materialRef.current = material;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      meshRef.current = mesh;

      // initial sizing
      const resize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(w, h);
      };
      resize();
      window.addEventListener("resize", resize);

      // mouse tracking (window-level, so UI hover still drives liquid)
      const onMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height; // flip to uv space (0 bottom)
        targetMouseRef.current.set(x, y);
        if (!disableLiquid) targetIntensityRef.current = LIQUID_CONFIG.intensity;
      };
      const onLeave = () => {
        targetIntensityRef.current = 0;
      };
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);
      container.addEventListener("mouseenter", () => {
        if (!disableLiquid) targetIntensityRef.current = LIQUID_CONFIG.intensity;
      });

      // init mouse at center
      targetMouseRef.current.set(0.5, 0.5);
      smoothMouseRef.current.set(0.5, 0.5);
      mouseRef.current.set(0.5, 0.5);

      let lastTime = performance.now();
      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        const dt = Math.min((now - lastTime) / 1000, 0.06);
        lastTime = now;
        timeRef.current = now * 0.001;

        // smooth spring for mouse
        const k = LIQUID_CONFIG.smoothing;
        const lerpK = 1 - Math.pow(1 - k, dt * 60);
        smoothMouseRef.current.x += (targetMouseRef.current.x - smoothMouseRef.current.x) * lerpK;
        smoothMouseRef.current.y += (targetMouseRef.current.y - smoothMouseRef.current.y) * lerpK;

        // velocity for shader (prev vs smooth)
        const vx = smoothMouseRef.current.x - mouseRef.current.x;
        const vy = smoothMouseRef.current.y - mouseRef.current.y;
        // store prev before update
        prevMouseRef.current.copy(mouseRef.current);
        mouseRef.current.copy(smoothMouseRef.current);

        // intensity spring with relaxation
        const relaxK = 1 - Math.pow(LIQUID_CONFIG.relaxation, dt * 60);
        intensityRef.current += (targetIntensityRef.current - intensityRef.current) * (1 - relaxK);

        // update uniforms
        uniforms.uMouse.value.copy(smoothMouseRef.current);
        uniforms.uPrevMouse.value.copy(prevMouseRef.current);
        uniforms.uTime.value = timeRef.current;
        uniforms.uIntensity.value = intensityRef.current;
        // velocity is derived in shader from mouse delta, but we can also pass extra via intensity

        renderer.render(scene, camera);
      };
      rafRef.current = requestAnimationFrame(loop);

      return () => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseleave", onLeave);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        geometry.dispose();
        material.dispose();
        texture.dispose();
        placeholderTex.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="three-canvas"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      />
    );
  }
);

export default ThreeCinematicCanvas;
