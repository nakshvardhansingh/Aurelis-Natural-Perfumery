"use client";

import { RefObject } from "react";

interface BotanicalOverlayProps {
  wrapperRef: RefObject<HTMLDivElement | null>;
}

const PETAL_ANGLES = [0, 72, 144, 216, 288];

/**
 * Decorative botanical line art. Paths carry pathLength=1 so the parent can
 * scrub stroke-dashoffset from the rAF loop (self-drawing ink effect).
 * Group `a` draws during ORIGIN/HARVEST, group `b` during ESSENCE/CREATION.
 */
export default function BotanicalOverlay({ wrapperRef }: BotanicalOverlayProps) {
  return (
    <div className="botanicals" ref={wrapperRef} aria-hidden="true">
      {/* ——— GROUP A · mountain flora sketch (left edge) ——— */}
      <div className="botanical botanical--a" data-bot="a">
        <svg viewBox="0 0 300 540" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path className="bot-path" pathLength={1} d="M150 532 C142 448 168 372 146 272 C132 205 158 122 149 58" />
          <path className="bot-path" pathLength={1} d="M147 452 C108 436 88 404 84 368 C120 380 142 412 147 452" />
          <path className="bot-path" pathLength={1} d="M148 388 C186 372 204 340 206 306 C172 318 152 350 148 388" />
          <path className="bot-path" pathLength={1} d="M146 300 C112 286 96 258 94 226 C126 238 144 264 146 300" />
          <path className="bot-path" pathLength={1} d="M147 232 C182 218 198 190 200 158 C170 170 151 196 147 232" />
          <path className="bot-path" pathLength={1} d="M148 150 C120 138 106 116 104 90 C130 100 145 122 148 150" />
          {PETAL_ANGLES.map((angle) => (
            <path
              key={angle}
              className="bot-path"
              pathLength={1}
              transform={`rotate(${angle} 149 44)`}
              d="M149 42 C141 30 143 16 149 6 C155 16 157 30 149 42"
            />
          ))}
          <circle className="bot-path" pathLength={1} cx="149" cy="44" r="4.5" />
        </svg>
      </div>

      {/* ——— GROUP B · flacon & formulation diagram (right edge) ——— */}
      <div className="botanical botanical--b" data-bot="b">
        <svg viewBox="0 0 360 500" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path className="bot-path" pathLength={1} d="M162 92 L198 92 L198 140 L162 140 Z" />
          <path className="bot-path" pathLength={1} d="M150 140 L210 140 L210 168 C250 184 260 214 260 258 L260 398 C260 426 238 442 210 442 L150 442 C122 442 100 426 100 398 L100 258 C100 214 110 184 150 168 Z" />
          <path className="bot-path" pathLength={1} d="M118 296 L242 296" strokeDasharray="0.02 0.012" />
          <path className="bot-path" pathLength={1} d="M180 236 C171 253 165 264 165 275 C165 287 171 294 180 294 C189 294 195 287 195 275 C195 264 189 253 180 236 Z" />
          <circle className="bot-path" pathLength={1} cx="180" cy="330" r="34" opacity="0.7" />
          <path className="bot-path" pathLength={1} d="M60 472 L300 472" />
          <g>
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const x1 = 296 + Math.cos(rad) * 40;
              const y1 = 86 + Math.sin(rad) * 40;
              const x2 = 296 + Math.cos(rad) * 52;
              const y2 = 86 + Math.sin(rad) * 52;
              return (
                <path
                  key={deg}
                  className="bot-path"
                  pathLength={1}
                  d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`}
                />
              );
            })}
            <circle className="bot-path" pathLength={1} cx="296" cy="86" r="14" />
            <path className="bot-path" pathLength={1} d="M296 72 L296 100 M282 86 L310 86" opacity="0.6" />
          </g>
        </svg>
      </div>
    </div>
  );
}
