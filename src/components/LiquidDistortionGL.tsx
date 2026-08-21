"use client";

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";

export interface LiquidDistortionHandle {
  draw: (index: number) => void;
  setMouse: (x: number, y: number, vx: number, vy: number) => void;
  setIntensity: (intensity: number) => void;
}

interface LiquidDistortionProps {
  framesRef: React.MutableRefObject<(HTMLImageElement | null)[]>;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;
out vec2 v_clipPos;

void main() {
  v_texCoord = a_texCoord;
  v_clipPos = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_clipPos;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_prevMouse;
uniform float u_time;
uniform float u_intensity;
uniform float u_radius;
uniform float u_velocityInfluence;
uniform float u_relaxation;
uniform float u_noiseStrength;
uniform vec2 u_textureSize;
uniform float u_aspectRatio;
uniform float u_dpr;

out vec4 fragColor;

#define PI 3.14159265359

// Pseudo-random hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// Fractal Brownian Motion
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Smoothstep falloff
float smoothFalloff(float d, float radius) {
  float t = clamp(d / radius, 0.0, 1.0);
  return 1.0 - t * t * (3.0 - 2.0 * t);
}

// Elastic spring simulation
vec2 springDisplacement(vec2 center, vec2 target, float velocity, float dt, float stiffness, float damping) {
  vec2 displacement = target - center;
  vec2 force = displacement * stiffness - velocity * damping;
  return force * dt;
}

void main() {
  vec2 uv = v_texCoord;
  vec2 center = u_mouse / u_resolution;
  
  // Distance from mouse in normalized coordinates
  vec2 toMouse = center - uv;
  float dist = length(toMouse * vec2(u_aspectRatio, 1.0));
  
  // Mouse velocity
  vec2 mouseVel = (u_mouse - u_prevMouse) / u_resolution;
  float velMag = length(mouseVel * vec2(u_aspectRatio, 1.0));
  
  // Base influence with smooth falloff
  float influence = smoothFalloff(dist, u_radius / max(u_resolution.x, u_resolution.y));
  
  // Velocity influence - stretches in direction of movement
  float velInfluence = velMag * u_velocityInfluence * influence;
  
  // Total influence
  float totalInfluence = influence * u_intensity + velInfluence;
  
  // Organic noise modulation
  float n = fbm(uv * 8.0 + u_time * 0.15) * u_noiseStrength;
  totalInfluence *= (1.0 + n);
  
  // Direction of distortion - radial from mouse with velocity bias
  vec2 dir = normalize(toMouse + mouseVel * 0.3);
  
  // Elastic displacement
  vec2 displacement = dir * totalInfluence * 0.08;
  
  // Chromatic aberration - very subtle
  float chroma = totalInfluence * 0.0015;
  
  // Apply distortion to UV coordinates
  vec2 uvDistorted = uv + displacement;
  
  // Cover-fit UV calculation (matching original FrameCanvas behavior)
  float texAspect = u_textureSize.x / u_textureSize.y;
  float canvasAspect = u_aspectRatio;
  
  vec2 coverUV;
  if (texAspect > canvasAspect) {
    // Texture is wider - fit to height, crop sides
    float scale = 1.0 / canvasAspect * texAspect;
    coverUV = vec2(uvDistorted.x * scale + (1.0 - scale) * 0.5, uvDistorted.y);
  } else {
    // Texture is taller - fit to width, crop top/bottom
    float scale = canvasAspect / texAspect;
    coverUV = vec2(uvDistorted.x, uvDistorted.y * scale + (1.0 - scale) * 0.5);
  }
  
  // Clamp to avoid sampling outside texture
  coverUV = clamp(coverUV, vec2(0.0), vec2(1.0));
  
  // Sample with chromatic aberration
  vec3 color;
  color.r = texture(u_texture, coverUV + vec2(chroma, 0.0)).r;
  color.g = texture(u_texture, coverUV).g;
  color.b = texture(u_texture, coverUV - vec2(chroma, 0.0)).b;
  
  // Subtle vignette at edges of distortion field
  float vignette = 1.0 - smoothstep(0.0, u_radius / max(u_resolution.x, u_resolution.y) * 1.5, dist) * 0.02;
  color *= vignette;
  
  fragColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    throw new Error("Shader compilation failed");
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    throw new Error("Program linking failed");
  }
  return program;
}

const LIQUID_CONFIG = {
  radius: 220,
  intensity: 0.035,
  smoothing: 0.08,
  velocityInfluence: 0.18,
  relaxation: 0.92,
  noiseStrength: 0.006,
} as const;

const LiquidDistortionGL = forwardRef<LiquidDistortionHandle, LiquidDistortionProps>(
  function LiquidDistortionGL({ framesRef }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const lastIndexRef = useRef<number>(-1);
  const lastTextureIndexRef = useRef<number>(-1);
  
  // Mouse state
  const mouseRef = useRef({ x: 0, y: 0 });
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const smoothedMouseRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const intensityRef = useRef(LIQUID_CONFIG.intensity);
  const isHoveringRef = useRef(false);
  const targetIntensityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    
    if (!gl) {
      console.warn("WebGL2 not available, falling back to 2D canvas");
      return;
    }

    glRef.current = gl;

    // Compile shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = createProgram(gl, vs, fs);
    programRef.current = program;

    // Create full-screen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    vaoRef.current = vao;

    const positions = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);

    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "a_position");
    const texLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // Create texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Flip Y so HTML images (Y=0 top) match WebGL texture coords (Y=0 bottom)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    textureRef.current = texture;

    // Clean up shaders
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Handle resize
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
        lastIndexRef.current = -1;
        lastTextureIndexRef.current = -1;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse tracking - window-level so effect follows cursor everywhere
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      isHoveringRef.current = true;
      targetIntensityRef.current = LIQUID_CONFIG.intensity;
    };

    const onMouseLeave = () => {
      isHoveringRef.current = false;
      targetIntensityRef.current = 0;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave);

    // Render loop
    const render = (time: number) => {
      const gl = glRef.current;
      const program = programRef.current;
      if (!gl || !program) return;

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      // Smooth mouse interpolation (elastic spring)
      const k = LIQUID_CONFIG.smoothing;
      const lerpK = 1 - Math.pow(1 - k, dt * 60);
      
      smoothedMouseRef.current.x += (mouseRef.current.x - smoothedMouseRef.current.x) * lerpK;
      smoothedMouseRef.current.y += (mouseRef.current.y - smoothedMouseRef.current.y) * lerpK;

      // Velocity calculation
      velocityRef.current.x = (smoothedMouseRef.current.x - prevMouseRef.current.x) / Math.max(dt, 0.001);
      velocityRef.current.y = (smoothedMouseRef.current.y - prevMouseRef.current.y) / Math.max(dt, 0.001);
      prevMouseRef.current.x = smoothedMouseRef.current.x;
      prevMouseRef.current.y = smoothedMouseRef.current.y;

      // Intensity spring
      intensityRef.current += (targetIntensityRef.current - intensityRef.current) * (1 - Math.pow(LIQUID_CONFIG.relaxation, dt * 60));

      // Draw current frame if changed
      const frames = framesRef.current;
      // We need to know current frame index - this will be set by the draw call
      // For now, we'll check if there's a current frame in a shared ref
      // The actual frame index is managed by CinematicExperience

      rafRef.current = requestAnimationFrame(render);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
    };
  }, [framesRef]);

  // Draw function - called by CinematicExperience
  const draw = useCallback((index: number) => {
    const gl = glRef.current;
    const program = programRef.current;
    const texture = textureRef.current;
    const vao = vaoRef.current;
    const canvas = canvasRef.current;
    
    if (!gl || !program || !texture || !vao || !canvas) return;
    if (framesRef.current.length === 0) return;

    const frames = framesRef.current;
    let img: HTMLImageElement | null = null;
    
    if (frames[index]) {
      img = frames[index];
    } else {
      for (let offset = 1; offset < frames.length; offset++) {
        const a = index + offset;
        const b = index - offset;
        if (a >= 0 && a < frames.length && frames[a]) { img = frames[a]; break; }
        if (b >= 0 && b < frames.length && frames[b]) { img = frames[b]; break; }
      }
    }
    
    if (!img || index === lastIndexRef.current) {
      if (!img) return;
    }

    // Upload texture if changed
    if (index !== lastTextureIndexRef.current || img !== framesRef.current[lastTextureIndexRef.current]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      lastTextureIndexRef.current = index;
    }

    lastIndexRef.current = index;

    // Render
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set uniforms
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(program, "u_mouse"), smoothedMouseRef.current.x * dpr, (h - smoothedMouseRef.current.y) * dpr);
    gl.uniform2f(gl.getUniformLocation(program, "u_prevMouse"), prevMouseRef.current.x * dpr, (h - prevMouseRef.current.y) * dpr);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), performance.now() * 0.001);
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), intensityRef.current);
    gl.uniform1f(gl.getUniformLocation(program, "u_radius"), LIQUID_CONFIG.radius * dpr);
    gl.uniform1f(gl.getUniformLocation(program, "u_velocityInfluence"), LIQUID_CONFIG.velocityInfluence);
    gl.uniform1f(gl.getUniformLocation(program, "u_relaxation"), LIQUID_CONFIG.relaxation);
    gl.uniform1f(gl.getUniformLocation(program, "u_noiseStrength"), LIQUID_CONFIG.noiseStrength);
    gl.uniform2f(gl.getUniformLocation(program, "u_textureSize"), img.naturalWidth, img.naturalHeight);
    gl.uniform1f(gl.getUniformLocation(program, "u_aspectRatio"), canvas.width / canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, "u_dpr"), dpr);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [framesRef]);

  const setMouse = useCallback((x: number, y: number, vx: number, vy: number) => {
    // External mouse control (if needed)
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = x - rect.left;
    mouseRef.current.y = y - rect.top;
  }, []);

  const setIntensity = useCallback((intensity: number) => {
    targetIntensityRef.current = intensity;
  }, []);

  useImperativeHandle(ref, () => ({
    draw,
    setMouse,
    setIntensity,
  }), [draw, setMouse, setIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className="cinema-canvas"
      aria-hidden="true"
    />
  );
}
);

export default LiquidDistortionGL;