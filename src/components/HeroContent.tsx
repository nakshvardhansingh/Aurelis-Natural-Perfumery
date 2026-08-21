"use client";

import { RefObject } from "react";
import MagneticText from "./MagneticText";

interface HeroContentProps {
  heroRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLParagraphElement | null>;
}

export default function HeroContent({ heroRef, hintRef }: HeroContentProps) {
  return (
    <div className="hero" ref={heroRef}>
      <p className="hero-kicker fx-elastic">EAU DE PARFUM &middot; No. 01</p>

      <h1 className="hero-title">
        <MagneticText
          text="FROM THE WILD"
          as="span"
          className="hero-line"
          intensity={1.08}
        />
        <span className="hero-rule" aria-hidden="true">
          <i />
          <em />
          <i />
        </span>
        <MagneticText
          text="A FRAGRANCE"
          as="span"
          className="hero-line hero-line--sub"
          intensity={1.12}
        />
        <MagneticText
          text="BORN OF NATURE"
          as="span"
          className="hero-line hero-line--sub"
          intensity={1.12}
        />
      </h1>

      <p className="hero-support fx-elastic">
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
