"use client";

import { RefObject } from "react";
import { Chapter } from "@/lib/config";
import MagneticText from "./MagneticText";

interface ChapterOverlayProps {
  chapters: Chapter[];
  chapterRefs: RefObject<(HTMLDivElement | null)[]>;
}

export default function ChapterOverlay({ chapters, chapterRefs }: ChapterOverlayProps) {
  return (
    <div className="chapters" aria-live="off">
      {chapters.map((chapter, i) => (
        <div
          key={chapter.id}
          ref={(el) => {
            if (chapterRefs.current) chapterRefs.current[i] = el;
          }}
          className={`chapter chapter--${chapter.align}`}
          data-chapter={chapter.id}
        >
          <div className="chapter-inner">
            <p className="chapter-index">
              <span>{String(chapter.index + 1).padStart(2, "0")}</span>
              <span className="chapter-index-rule" aria-hidden="true" />
              <span>05</span>
            </p>

            <MagneticText
              text={chapter.title}
              as="h2"
              className="chapter-title"
              intensity={0.95}
            />

            <p className="chapter-desc fx-elastic">{chapter.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
