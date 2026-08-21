"use client";

interface LoadingScreenProps {
  progress: number; // 0–1
  leaving: boolean;
}

export default function LoadingScreen({ progress, leaving }: LoadingScreenProps) {
  const pct = Math.round(progress * 100);

  return (
    <div className={`loading-screen${leaving ? " is-leaving" : ""}`} aria-live="polite">
      <div className="loading-inner">
        <p className="loading-brand">AURELIS</p>
        <p className="loading-sub">NATURAL PERFUMERY</p>

        <h1 className="loading-title">
          ESSENCE
          <span>FROM THE MOUNTAINS</span>
        </h1>

        <div className="loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="loading-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <p className="loading-count">
          <span>LOADING</span>
          <span className="loading-num">{String(pct).padStart(3, "0")} — 100</span>
        </p>
      </div>

      <div className="loading-corner loading-corner--tl" />
      <div className="loading-corner loading-corner--br" />
    </div>
  );
}
