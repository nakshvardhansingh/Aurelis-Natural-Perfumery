"use client";

import { useEffect, useRef } from "react";

interface MagneticTextProps {
  text: string;
  className?: string;
  /** tag to render */
  as?: "h1" | "h2" | "h3" | "p" | "div" | "span";
  /** extra intensity multiplier */
  intensity?: number;
  /** disable 3D tilt */
  no3d?: boolean;
}

export default function MagneticText({
  text,
  className = "",
  as = "div",
  intensity = 1,
  no3d = false,
}: MagneticTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chars = charsRef.current;

    const prefersReduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    // coarse pointer → simple hover only, no magnetic follow
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;

    let raf = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let isInside = false;

    const apply = () => {
      if (!isInside) return;
      for (let i = 0; i < chars.length; i++) {
        const el = chars[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);
        const maxDist = 180 * intensity;
        if (dist < maxDist) {
          const falloff = Math.pow(1 - dist / maxDist, 1.15);
          // sticky translate towards cursor — elastic feel
          const tx = dx * falloff * 0.22;
          const ty = dy * falloff * 0.13;
          // stretch: horizontal expand when near, vertical compress
          const sx = 1 + falloff * 0.48 * intensity;
          const sy = 1 - falloff * 0.18 * intensity;
          // skew for rubber effect
          const skew = dx * falloff * 0.015;
          const ry = no3d ? 0 : dx * 0.035 * falloff;
          const rx = no3d ? 0 : -dy * 0.028 * falloff;
          const shadowA = falloff * 0.34;
          const shadowY = falloff * 7;
          const shadowB = falloff * 16;

          el.style.transition = "transform 90ms linear, text-shadow 90ms linear";
          el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale3d(${sx.toFixed(3)}, ${sy.toFixed(3)}, 1) skewX(${skew.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
          ;(el.style as unknown as Record<string, string>).textShadow = `0 ${shadowY.toFixed(2)}px ${shadowB.toFixed(2)}px rgba(214,178,122,${shadowA.toFixed(3)})`;
        } else {
          el.style.transition = "transform 340ms cubic-bezier(0.22,1,0.36,1), text-shadow 340ms ease";
          el.style.transform = "translate3d(0,0,0) scale3d(1,1,1) skewX(0deg) rotateX(0) rotateY(0)";
          ;(el.style as unknown as Record<string, string>).textShadow = "none";
        }
      }
      raf = requestAnimationFrame(apply);
    };

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!isInside) return;
      if (!raf && !isCoarse) {
        raf = requestAnimationFrame(apply);
      } else if (isCoarse) {
        // on coarse we still want immediate subtle stretch on hover w/o per-frame
        for (let i = 0; i < chars.length; i++) {
          const el = chars[i];
          if (!el) continue;
          el.style.transition = "transform 90ms linear";
          el.style.transform = `translate3d(0,0,0) scale3d(1,1,1)`;
        }
      }
    };

    const onEnter = () => {
      isInside = true;
      container.classList.add("is-hovering");
      // bouncy entrance stagger — each char pops
      chars.forEach((el, i) => {
        if (!el) return;
        el.style.transition = "none";
        el.style.transform = "translate3d(0,0,0) scale3d(1,1,1)";
        // force reflow
        void el.offsetWidth;
        el.style.transition = `transform 720ms cubic-bezier(0.34,1.56,0.64,1) ${i * 14}ms`;
        // tiny initial pop for 3d feel
        el.style.transform = `translate3d(0,-1px, 6px) scale3d(1.08,0.96,1)`;
        window.setTimeout(() => {
          if (!isInside) return;
          el.style.transform = "translate3d(0,0,0) scale3d(1,1,1)";
        }, 18 + i * 14);
      });
      if (!isCoarse) {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(apply);
      }
      window.addEventListener("mousemove", onMove, { passive: true });
    };

    const onLeave = () => {
      isInside = false;
      container.classList.remove("is-hovering");
      window.removeEventListener("mousemove", onMove);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      // fast snap back with elastic overshoot (bouncy)
      chars.forEach((el, i) => {
        if (!el) return;
        el.style.transition = `transform 820ms cubic-bezier(0.34,1.56,0.64,1) ${i * 10}ms, text-shadow 420ms ease ${i * 10}ms`;
        el.style.transform = "translate3d(0,0,0) scale3d(1,1,1) skewX(0deg) rotateX(0) rotateY(0)";
        ;(el.style as unknown as Record<string, string>).textShadow = "none";
      });
    };

    container.addEventListener("mouseenter", onEnter);
    container.addEventListener("mouseleave", onLeave);

    return () => {
      container.removeEventListener("mouseenter", onEnter);
      container.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [intensity, no3d]);

  const Tag = as as unknown as "div";

  // Group words to keep them together (no mid-word break for MEMORY/DISTILLATION)
  const lines = text.split("\n");
  let charCounter = 0;
  const wordGroups: React.ReactNode[] = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) wordGroups.push(<br key={`br-${lineIdx}`} />);
    const words = line.split(" ");
    words.forEach((word, wordIdx) => {
      if (word.length > 0) {
        wordGroups.push(
          <span key={`w-${lineIdx}-${wordIdx}`} className="magnetic-word" aria-hidden="true">
            {Array.from(word).map((ch) => {
              const idx = charCounter++;
              return (
                <span
                  key={`c-${lineIdx}-${wordIdx}-${idx}`}
                  className="stretch-char"
                  aria-hidden="true"
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        );
      }
      if (wordIdx < words.length - 1) {
        const idx = charCounter++;
        wordGroups.push(
          <span
            key={`s-${lineIdx}-${wordIdx}`}
            className="stretch-char is-space"
            aria-hidden="true"
            ref={(el) => {
              charsRef.current[idx] = el;
            }}
          >
            {"\u00A0"}
          </span>
        );
      }
    });
  });

  return (
    <Tag
      ref={containerRef as unknown as React.RefObject<HTMLDivElement>}
      className={`magnetic-text ${className}`}
      aria-label={text}
    >
      {wordGroups}
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
