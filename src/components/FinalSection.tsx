"use client";

export default function FinalSection() {
  return (
    <section className="final" id="final">
      <div className="final-glow" aria-hidden="true" />

      <div className="final-inner">
        <p className="final-kicker">AURELIS &middot; NATURAL PERFUMERY</p>

        <h2 className="final-title">
          FROM NATURE.
          <br />
          DISTILLED INTO MEMORY.
        </h2>

        <span className="final-rule" aria-hidden="true">
          <i />
          <em />
          <i />
        </span>

        <p className="final-copy">
          One sequence. One valley. One hundred and ninety-two frames of light —
          carried from the mountainside to the atelier, and finally to skin.
        </p>

        <a
          className="final-cta"
          href="#final"
          onClick={(e) => e.preventDefault()}
        >
          EXPLORE THE ESSENCE
          <svg width="26" height="8" viewBox="0 0 26 8" fill="none" aria-hidden="true">
            <path d="M0 4 H24 M20 1 L24 4 L20 7" stroke="currentColor" strokeWidth="0.75" />
          </svg>
        </a>
      </div>

      <footer className="final-footer">
        <span>&copy; MMXXVI AURELIS</span>
        <span className="final-footer-sep" aria-hidden="true" />
        <span>DISTILLED IN THE MOUNTAINS</span>
        <span className="final-footer-sep" aria-hidden="true" />
        <span>NO. 01 &mdash; 50 ML</span>
      </footer>
    </section>
  );
}
