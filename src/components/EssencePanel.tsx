"use client";

import { RefObject } from "react";
import { BOTANICAL_NOTES } from "@/lib/config";

interface EssencePanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
}

export default function EssencePanel({ panelRef }: EssencePanelProps) {
  return (
    <aside className="essence-panel" ref={panelRef} aria-hidden="true">
      <p className="ep-heading">BOTANICAL NOTES</p>
      <span className="ep-rule" aria-hidden="true" />

      <ul className="ep-list">
        {BOTANICAL_NOTES.map((note) => (
          <li key={note.name} className="ep-row">
            <span className="ep-name">{note.name}</span>
            <span className="ep-role">{note.role}</span>
          </li>
        ))}
      </ul>

      <p className="ep-foot">EXTRAIT &middot; 27% CONCENTRATION</p>
    </aside>
  );
}
