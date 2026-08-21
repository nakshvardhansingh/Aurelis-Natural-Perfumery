"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import ThreeCinematicCanvas, { ThreeCanvasHandle } from "./ThreeCinematicCanvas";
import Navigation, { NavTarget } from "./Navigation";
import HeroContent from "./HeroContent";
import ChapterOverlay from "./ChapterOverlay";
import ScrollIndicator from "./ScrollIndicator";
import BotanicalOverlay from "./BotanicalOverlay";
import EssencePanel from "./EssencePanel";
import LoadingScreen from "./LoadingScreen";
import {
  CHAPTERS,
  FRAMES,
  HERO_FADE_END,
  INITIAL_PRELOAD_COUNT,
  OUTRO_START,
  SEQUENCE_VIEWPORTS,
} from "@/lib/config";
import { loadInitialFrames, loadRemainingFrames } from "@/lib/frameLoader";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function smoothstep(a: number, b: number, t: number) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const x = (t - a) / (b - a);
  return x * x * (3 - 2 * x);
}

export default function CinematicExperience() {
  const [loadProgress, setLoadProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [leaving, setLeaving] = useState(false);

  // Mutable frame cache — fills progressively without React re-renders.
  const framesRef = useRef<(HTMLImageElement | null)[]>(
    Array.from({ length: FRAMES.count }, () => null)
  );

  const containerRef = useRef<HTMLElement>(null);
  const canvasHandleRef = useRef<ThreeCanvasHandle>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<number>(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const botanicalsRef = useRef<HTMLDivElement>(null);

  // rAF state
  const metricsRef = useRef({ top: 0, scrollable: 1, vh: 800 });
  const smoothedRef = useRef(0);
  const lastIdxRef = useRef(-1);
  const lastTimeRef = useRef(0);
  const activeChapterRef = useRef(-1);
  const botGroupsRef = useRef<{ a: SVGPathElement[]; b: SVGPathElement[] }>({ a: [], b: [] });
  const prevVisRef = useRef<number[]>(CHAPTERS.map(() => 0));
  const brightnessRef = useRef(0.55);

  // ——— INITIAL LOAD + LENIS SETUP ———
  useEffect(() => {
    // lock scroll during loading
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (history as any).scrollRestoration = "manual";
    } catch {}
    window.scrollTo(0, 0);
    document.documentElement.classList.add("lenis");

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lenis = new Lenis({
      duration: reduced ? 0.45 : 1.35,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) as any,
      smoothWheel: !reduced,
      touchMultiplier: 1.35,
    } as never);
    lenisRef.current = lenis;
    lenis.stop();

    let cancelled = false;
    const startTime = performance.now();

    // Only the opening 32 frames block the curtain — ~4.4 MB vs 26.5 MB.
    // Remaining 160 frames stream in the background without any quality loss
    // (same WebP bytes, same high smoothing on draw).
    loadInitialFrames({
      framesRef,
      initialCount: INITIAL_PRELOAD_COUNT,
      concurrency: 8,
      onProgress: (p) => {
        if (!cancelled) setLoadProgress(p);
      },
    })
      .then(() => {
        if (cancelled) return;
        // Ensure first frame is painted before the curtain lifts
        requestAnimationFrame(() => {
          canvasHandleRef.current?.draw(0);
        });

        const elapsed = performance.now() - startTime;
        const minDisplay = 900; // premium pause, but not wasteful
        const wait = Math.max(0, minDisplay - elapsed);

        window.setTimeout(() => {
          if (cancelled) return;
          setLeaving(true);
          window.setTimeout(() => {
            if (cancelled) return;
            setPhase("ready");
            document.body.style.overflow = prevOverflow;
            lenis.start();

            // Fire-and-forget: stream the rest of the sequence in the
            // background at higher parallelism (HTTP/2 multiplexed).
            // No decode() blocking — decode happens lazily on first draw.
            loadRemainingFrames(framesRef, INITIAL_PRELOAD_COUNT, 10).catch(() => {});
          }, 650);
        }, wait);
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("ready");
          document.body.style.overflow = prevOverflow;
          lenis.start();
          loadRemainingFrames(framesRef, INITIAL_PRELOAD_COUNT, 10).catch(() => {});
        }
      });

    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
      document.documentElement.classList.remove("lenis");
      lenis.destroy();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ——— NAVIGATION ———
  const handleNavigate = useCallback((target: NavTarget) => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    const m = metricsRef.current;

    if (target === "final") {
      const max = document.documentElement.scrollHeight;
      lenis.scrollTo(max, { duration: 2.2 } as never);
      return;
    }

    const chapter = CHAPTERS.find((c) => c.id === target);
    if (!chapter) return;
    const midFrame = (chapter.startFrame + chapter.endFrame) / 2;
    const progress = midFrame / (FRAMES.count - 1);
    const y = m.top + progress * m.scrollable;
    lenis.scrollTo(y, { duration: 2.2 } as never);
  }, []);

  // ——— MAIN RAF LOOP (only when ready) ———
  useEffect(() => {
    if (phase !== "ready") return;

    // collect botanical paths
    const wrapper = botanicalsRef.current;
    if (wrapper) {
      const a = Array.from(
        wrapper.querySelectorAll<SVGPathElement>('[data-bot="a"] .bot-path')
      );
      const b = Array.from(
        wrapper.querySelectorAll<SVGPathElement>('[data-bot="b"] .bot-path')
      );
      botGroupsRef.current = { a, b };
      // ensure dasharray present (already via CSS, but force for JS control)
      for (const p of [...a, ...b]) {
        p.style.strokeDasharray = "1";
        p.style.strokeDashoffset = "1";
      }
    }

    // metrics
    const computeMetrics = () => {
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const vh = window.innerHeight;
      const ch = c.offsetHeight;
      metricsRef.current = {
        top,
        scrollable: Math.max(1, ch - vh),
        vh,
      };
    };
    computeMetrics();

    // Paint first frame immediately on ready (in case resize happened)
    canvasHandleRef.current?.draw(0);
    lastIdxRef.current = 0;

    // sample canvas for brightness (lazy)
    let sampleCanvas: HTMLCanvasElement | null = null;
    let sampleCtx: CanvasRenderingContext2D | null = null;
    const getSampleCtx = () => {
      if (sampleCtx) return sampleCtx;
      sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 12;
      sampleCanvas.height = 12;
      sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      return sampleCtx;
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let brightnessCounter = 0;

    const loop = (time: number) => {
      const lenis = lenisRef.current;
      if (lenis) lenis.raf(time);

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      if (dt === 0 && lastTimeRef.current !== 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const m = metricsRef.current;
      const scrollY = lenis ? (lenis.scroll as number) : window.scrollY;
      const raw = clamp((scrollY - m.top) / m.scrollable, 0, 1);

      // heavy cinematic lerp
      const k = reduced ? 1 : 1 - Math.pow(1 - 0.13, dt * 60);
      let smoothed = smoothedRef.current + (raw - smoothedRef.current) * k;
      if (Math.abs(raw - smoothed) < 0.00015) smoothed = raw;
      smoothedRef.current = smoothed;

      const frameFloat = smoothed * (FRAMES.count - 1);
      const idx = Math.floor(clamp(frameFloat, 0, FRAMES.count - 1));

      // — draw frame ———
      if (idx !== lastIdxRef.current) {
        canvasHandleRef.current?.draw(idx);
        lastIdxRef.current = idx;

        // brightness sampling every 4th new frame — reads from ref,
        // works even while background frames are still streaming in
        brightnessCounter++;
        const frames = framesRef.current;
        if (brightnessCounter % 4 === 0 && frames[idx]) {
          try {
            const ctx = getSampleCtx();
            const cvs = sampleCanvas;
            if (ctx && cvs) {
              const img = frames[idx]!;
              ctx.clearRect(0, 0, cvs.width, cvs.height);
              ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
              const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
              let sum = 0;
              for (let i = 0; i < data.length; i += 4) {
                sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              }
              const avg = sum / (cvs.width * cvs.height);
              brightnessRef.current = clamp(avg / 255, 0, 1);
            }
          } catch {
            // tainted or unavailable — ignore
          }
        }
      }

      // — hero ———
      const hero = heroRef.current;
      const hint = hintRef.current;
      if (hero) {
        const t = clamp(smoothed / HERO_FADE_END, 0, 1);
        // only write when meaningfully changed to reduce style churn
        if (Math.abs(t - (hero as unknown as { _t?: number })._t!) > 0.002 || t === 0 || t === 1) {
          (hero as unknown as { _t?: number })._t = t;
          const eased = t * t * (3 - 2 * t);
          hero.style.opacity = String(1 - eased);
          hero.style.transform = `translateY(${(-eased * 34).toFixed(2)}px)`;
          hero.style.filter = `blur(${(eased * 7).toFixed(2)}px)`;
          hero.style.pointerEvents = t >= 0.98 ? "none" : "none";
        }
        if (hint) {
          const ht = clamp(smoothed / 0.035, 0, 1);
          const he = ht * ht * (3 - 2 * ht);
          hint.style.opacity = String(1 - he);
          hint.style.transform = `translateX(-50%) translateY(${(-he * 10).toFixed(2)}px)`;
        }
      }

      // — chapters ———
      for (let i = 0; i < CHAPTERS.length; i++) {
        const ch = CHAPTERS[i];
        const el = chapterRefs.current[i];
        if (!el) continue;
        const span = ch.endFrame - ch.startFrame || 1;
        const local = clamp((frameFloat - ch.startFrame) / span, 0, 1);
        // first chapter enters immediately; last chapter holds longer
        const enterEnd = i === 0 ? 0.08 : 0.18;
        const exitStart = i === CHAPTERS.length - 1 ? 1 : 0.82;
        const enter = smoothstep(0, enterEnd, local);
        // for last chapter, don't auto-exit; fade only with outro
        const exitT = i === CHAPTERS.length - 1 ? 0 : smoothstep(exitStart, 1, local);
        const vis = enter * (1 - exitT);
        const prev = prevVisRef.current[i] ?? 0;
        if (vis < 0.002 && prev < 0.002) continue;
        prevVisRef.current[i] = vis;
        el.style.opacity = String(Math.pow(vis, 0.95));
        const yEnter = (1 - enter) * 44;
        const yExit = exitT * -28;
        const y = yEnter + yExit;
        const blur = (1 - enter) * 8 + exitT * 6;
        el.style.transform = `translateY(${y.toFixed(2)}px)`;
        el.style.filter = `blur(${blur.toFixed(2)}px)`;
      }

      // — essence panel ———
      const panel = panelRef.current;
      if (panel) {
        const essence = CHAPTERS.find((c) => c.id === "essence");
        if (essence) {
          const span = essence.endFrame - essence.startFrame || 1;
          const local = clamp((frameFloat - essence.startFrame) / span, 0, 1);
          // appear slightly after chapter starts, disappear before it ends
          const enter = smoothstep(0.08, 0.34, local);
          const exit = smoothstep(0.72, 0.96, local);
          const vis = enter * (1 - exit);
          panel.style.opacity = String(Math.pow(vis, 0.9));
          const tx = (1 - enter) * -22 + exit * 18;
          const ty = -50 + exit * 6;
          // keep centered vertically but shift with parallax
          if (window.innerWidth <= 640) {
            panel.style.transform = `translateX(-50%) translateY(${(ty + 50).toFixed(2)}px) translateX(${tx.toFixed(2)}px)`;
            panel.style.filter = `blur(${((1 - enter) * 6 + exit * 4).toFixed(2)}px)`;
          } else {
            panel.style.transform = `translateY(${ty.toFixed(2)}%) translateX(${tx.toFixed(2)}px)`;
            panel.style.filter = `blur(${((1 - enter) * 6 + exit * 4).toFixed(2)}px)`;
          }
          panel.style.pointerEvents = "none";
        }
      }

      // — botanicals ———
      const groups = botGroupsRef.current;
      if (groups.a.length || groups.b.length) {
        // a draws early (0.01–0.18), b draws later (0.50–0.78)
        const drawA = smoothstep(0.01, 0.18, smoothed);
        const drawB = smoothstep(0.5, 0.78, smoothed);
        const offA = String((1 - drawA).toFixed(4));
        const offB = String((1 - drawB).toFixed(4));
        // cache to avoid writes when unchanged
        const cache = groups as unknown as { _a?: string; _b?: string };
        if (cache._a !== offA) {
          cache._a = offA;
          for (const p of groups.a) p.style.strokeDashoffset = offA;
        }
        if (cache._b !== offB) {
          cache._b = offB;
          for (const p of groups.b) p.style.strokeDashoffset = offB;
        }
      }

      // — scroll indicator ———
      const fill = fillRef.current;
      if (fill) {
        fill.style.transform = `scaleX(${smoothed.toFixed(4)})`;
      }
      // active chapter for label
      let activeIdx = 0;
      for (let i = CHAPTERS.length - 1; i >= 0; i--) {
        if (frameFloat >= CHAPTERS[i].startFrame - 0.5) {
          activeIdx = i;
          break;
        }
      }
      if (activeIdx !== activeChapterRef.current) {
        activeChapterRef.current = activeIdx;
        const ch = CHAPTERS[activeIdx];
        if (numRef.current) numRef.current.textContent = String(activeIdx + 1).padStart(2, "0");
        if (nameRef.current) nameRef.current.textContent = ch.title;
      }

      // — nav brightness ———
      const nav = navRef.current;
      if (nav) {
        const b = brightnessRef.current;
        // brighter frames → slightly lower nav opacity so text stays legible via shadow
        const targetOpacity = 0.62 + b * 0.32;
        nav.style.opacity = String(clamp(targetOpacity, 0.58, 0.96).toFixed(3));
      }

      // — outro ———
      const outro = outroRef.current;
      if (outro) {
        const o = smoothstep(OUTRO_START, 0.995, smoothed);
        outro.style.opacity = String((o * 0.96).toFixed(4));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      computeMetrics();
      // force redraw at current frame after resize
      const idx = Math.floor(clamp(smoothedRef.current * (FRAMES.count - 1), 0, FRAMES.count - 1));
      lastIdxRef.current = -1;
      canvasHandleRef.current?.draw(idx);
    };
    window.addEventListener("resize", onResize);

    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } else {
        lastTimeRef.current = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase]);

  const seqHeight = `${SEQUENCE_VIEWPORTS * 100}vh`;

  return (
    <>
      <Navigation navRef={navRef} onNavigate={handleNavigate} />
      {phase === "loading" ? (
        <LoadingScreen progress={loadProgress} leaving={leaving} />
      ) : null}

      <section
        ref={containerRef as unknown as React.RefObject<HTMLElement>}
        className="sequence"
        style={{ height: seqHeight }}
        id="top"
        aria-label="Cinematic fragrance sequence"
      >
        <div className="sequence-sticky">
          <ThreeCinematicCanvas ref={canvasHandleRef} framesRef={framesRef} />

          <div className="overlay-warmth" aria-hidden="true" />
          <div className="overlay-vignette" aria-hidden="true" />
          <div className="overlay-edges" aria-hidden="true" />
          <div className="grain" aria-hidden="true" />

          <BotanicalOverlay wrapperRef={botanicalsRef} />

          <ChapterOverlay chapters={CHAPTERS} chapterRefs={chapterRefs} />

          <EssencePanel panelRef={panelRef} />

          <HeroContent heroRef={heroRef} hintRef={hintRef} />

          <ScrollIndicator fillRef={fillRef} numRef={numRef} nameRef={nameRef} />

          <div ref={outroRef} className="outro-overlay" aria-hidden="true" />
        </div>
      </section>
    </>
  );
}
