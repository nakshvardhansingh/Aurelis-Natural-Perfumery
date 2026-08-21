"use client";

import { RefObject } from "react";

interface ScrollIndicatorProps {
  fillRef: RefObject<HTMLSpanElement | null>;
  numRef: RefObject<HTMLSpanElement | null>;
  nameRef: RefObject<HTMLSpanElement | null>;
}

export default function ScrollIndicator({ fillRef, numRef, nameRef }: ScrollIndicatorProps) {
  return (
    <div className="scroll-indicator" aria-hidden="true">
      <div className="si-row">
        <span className="si-num" ref={numRef}>01</span>
        <span className="si-track">
          <span className="si-fill" ref={fillRef} />
          <span className="si-dot" />
        </span>
        <span className="si-total">05</span>
      </div>
      <span className="si-name" ref={nameRef}>ORIGIN</span>
    </div>
  );
}
