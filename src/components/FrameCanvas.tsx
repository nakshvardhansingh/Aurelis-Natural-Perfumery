"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface FrameCanvasHandle {
  /** Draw a specific frame (cover-fit). Falls back to nearest loaded frame. */
  draw: (index: number) => void;
}

interface FrameCanvasProps {
  frames: (HTMLImageElement | null)[];
}

/**
 * Full-viewport cinematic canvas.
 * Draws preloaded frames with correct aspect ratio (object-fit: cover
 * behaviour, implemented manually so there is zero distortion).
 */
const FrameCanvas = forwardRef<FrameCanvasHandle, FrameCanvasProps>(
  function FrameCanvas({ frames }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const lastIndexRef = useRef<number>(-1);

    const resize = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        lastIndexRef.current = -1; // force redraw at new size
      }
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      ctxRef.current = canvas.getContext("2d", { alpha: false });
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, [resize]);

    useImperativeHandle(
      ref,
      () => ({
        draw(index: number) {
          const canvas = canvasRef.current;
          const ctx = ctxRef.current;
          if (!canvas || !ctx || frames.length === 0) return;

          // Nearest successfully loaded frame (guards against failed loads).
          let img: HTMLImageElement | null = null;
          for (let offset = 0; offset < frames.length; offset++) {
            const a = index + offset;
            const b = index - offset;
            if (a >= 0 && a < frames.length && frames[a]) { img = frames[a]; break; }
            if (b >= 0 && b < frames.length && frames[b]) { img = frames[b]; break; }
          }
          if (!img || index === lastIndexRef.current) return;

          const cw = canvas.width;
          const ch = canvas.height;
          const iw = img.naturalWidth || img.width;
          const ih = img.naturalHeight || img.height;
          if (!iw || !ih) return;

          const scale = Math.max(cw / iw, ch / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          const dx = (cw - dw) / 2;
          const dy = (ch - dh) / 2;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, dx, dy, dw, dh);
          lastIndexRef.current = index;
        },
      }),
      [frames]
    );

    return (
      <canvas
        ref={canvasRef}
        className="cinema-canvas"
        aria-hidden="true"
      />
    );
  }
);

export default FrameCanvas;
