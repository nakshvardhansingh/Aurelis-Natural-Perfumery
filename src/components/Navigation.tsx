"use client";

import { RefObject } from "react";

export type NavTarget = "origin" | "harvest" | "distillation" | "essence" | "final";

interface NavigationProps {
  navRef: RefObject<HTMLElement | null>;
  onNavigate: (target: NavTarget) => void;
}

const LINKS: { label: string; target: NavTarget }[] = [
  { label: "THE ORIGIN", target: "origin" },
  { label: "THE CRAFT", target: "distillation" },
  { label: "THE ESSENCE", target: "essence" },
];

export default function Navigation({ navRef, onNavigate }: NavigationProps) {
  return (
    <header className="nav" ref={navRef}>
      <a
        href="#top"
        className="nav-brand"
        onClick={(e) => {
          e.preventDefault();
          onNavigate("origin");
        }}
      >
        <span className="nav-brand-name">AURELIS</span>
        <span className="nav-brand-sub">NATURAL PERFUMERY</span>
      </a>

      <nav className="nav-links" aria-label="Chapters">
        {LINKS.map((link) => (
          <button
            key={link.target}
            type="button"
            className="nav-link"
            onClick={() => onNavigate(link.target)}
          >
            {link.label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="nav-cta"
        onClick={() => onNavigate("final")}
      >
        DISCOVER
        <span className="nav-cta-line" />
      </button>
    </header>
  );
}
