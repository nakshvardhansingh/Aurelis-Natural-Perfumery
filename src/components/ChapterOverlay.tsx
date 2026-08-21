"use client";

import { RefObject } from "react";
import { Chapter } from "@/lib/config";

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

            <h2 className="chapter-title">{chapter.title}</h2>

            <p className="chapter-desc">{chapter.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
