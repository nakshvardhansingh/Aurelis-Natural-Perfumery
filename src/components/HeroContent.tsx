"use client";

import { RefObject } from "react";

interface HeroContentProps {
  heroRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLParagraphElement | null>;
}

export default function HeroContent({ heroRef, hintRef }: HeroContentProps) {
  return (
    <div className="hero" ref={heroRef}>
      <p className="hero-kicker">EAU DE PARFUM &middot; No. 01</p>

      <h1 className="hero-title">
        <span className="hero-line">FROM THE WILD</span>
        <span className="hero-rule" aria-hidden="true">
          <i />
          <em />
          <i />
        </span>
        <span className="hero-line hero-line--sub">
          A FRAGRANCE
          <br />
          BORN OF NATURE
        </span>
      </h1>

      <p className="hero-support">
        Captured from flowers. Distilled in silence.
        <br />
        Created for the senses.
      </p>

      <p className="scroll-hint" ref={hintRef}>
        SCROLL TO DISCOVER
        <span className="scroll-hint-line" aria-hidden="true">
          <b />
        </span>
      </p>
    </div>
  );
}
