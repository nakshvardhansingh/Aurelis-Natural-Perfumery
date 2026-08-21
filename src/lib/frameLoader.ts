import { FRAMES, frameUrl } from "./config";

export interface FrameLoaderOptions {
  /** Called with 0–1 progress as frames arrive. */
  onProgress?: (progress: number) => void;
  /** Frames scrubbed first — loaded with maximum parallelism. */
  priorityCount?: number;
  /** Parallel requests for the remaining sequence. */
  concurrency?: number;
}

async function loadImage(url: string, withDecode = true): Promise<HTMLImageElement> {
  const img = new Image() as HTMLImageElement & { fetchPriority?: string };
  // Hint the browser — first frames are critical.
  img.decoding = "async";
  // fetchPriority is supported in Chromium; harmless elsewhere.
  if ("fetchPriority" in img) img.fetchPriority = "high";
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth) resolve();
    else {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
    }
  });

  if (withDecode) {
    try {
      // Ensure the bitmap is decoded off the main thread before we
      // consider the frame "ready" — prevents first-draw jank without
      // any quality loss (same WebP bytes, just pre-decoded).
      await img.decode();
    } catch {
      // decode() can throw if the image was already errored; ignore
    }
  }

  return img;
}

/**
 * Progressive frame preloader.
 *
 * 1. Loads the opening frames immediately (priority burst).
 * 2. Streams the rest of the sequence with bounded concurrency.
 * 3. Returns the full cached array — index-aligned with the frame sequence.
 *    Failed entries are stored as `null`; the renderer falls back to the
 *    nearest successfully loaded neighbour.
 */
export async function loadFrames(
  options: FrameLoaderOptions = {}
): Promise<(HTMLImageElement | null)[]> {
  const {
    onProgress,
    priorityCount = Math.min(12, FRAMES.count),
    concurrency = 6,
  } = options;

  const total = FRAMES.count;
  const results: (HTMLImageElement | null)[] = new Array(total).fill(null);

  // Priority order: opening frames first, then the remainder in sequence.
  const queue: number[] = [];
  for (let i = 0; i < Math.min(priorityCount, total); i++) queue.push(i);
  for (let i = priorityCount; i < total; i++) queue.push(i);

  let cursor = 0;
  let loaded = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const index = queue[cursor++];
      try {
        results[index] = await loadImage(frameUrl(index), true);
      } catch {
        results[index] = null;
      }
      loaded++;
      onProgress?.(loaded / total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  return results;
}

// ——— Progressive (early-ready) API ———

export interface ProgressiveLoadOptions {
  /** Mutable array that will be filled in-place (index-aligned). */
  framesRef: { current: (HTMLImageElement | null)[] };
  /** How many opening frames block the loading screen. */
  initialCount: number;
  /** Parallelism for the blocking phase (higher = faster first paint). */
  concurrency?: number;
  /** 0–1 progress for the blocking phase only. */
  onProgress?: (progress: number) => void;
}

/**
 * Loads only the opening `initialCount` frames and resolves.
 * Fills `framesRef.current` in place. The caller can lift the loading
 * curtain as soon as this resolves — remaining frames load in the
 * background via `loadRemainingFrames`.
 */
export async function loadInitialFrames(options: ProgressiveLoadOptions): Promise<void> {
  const { framesRef, initialCount, concurrency = 8, onProgress } = options;
  const total = Math.min(initialCount, FRAMES.count);
  let loaded = 0;

  // Ensure the backing array is the right size.
  if (framesRef.current.length !== FRAMES.count) {
    framesRef.current = new Array(FRAMES.count).fill(null);
  }

  const queue: number[] = [];
  for (let i = 0; i < total; i++) queue.push(i);

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const index = queue[cursor++];
      try {
        const img = await loadImage(frameUrl(index), true);
        framesRef.current[index] = img;
      } catch {
        framesRef.current[index] = null;
      }
      loaded++;
      onProgress?.(loaded / total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );
}

/**
 * Continues loading the remaining frames after the curtain has lifted.
 * Runs with higher parallelism (HTTP/2 multiplexed) and fills the same
 * `framesRef` in place. Call without awaiting — fire-and-forget.
 * No quality loss: same WebP bytes, same `high` smoothing on draw.
 */
export async function loadRemainingFrames(
  framesRef: { current: (HTMLImageElement | null)[] },
  fromIndex: number,
  concurrency = 10
): Promise<void> {
  const queue: number[] = [];
  for (let i = fromIndex; i < FRAMES.count; i++) {
    // Skip already-loaded (e.g. if initial phase already filled some)
    if (!framesRef.current[i]) queue.push(i);
  }
  if (queue.length === 0) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const index = queue[cursor++];
      try {
        // Background frames decode lazily — don't block on decode()
        // so network throughput stays maximal; decode happens on
        // first canvas draw (still high quality, just deferred).
        const img = await loadImage(frameUrl(index), false);
        framesRef.current[index] = img;
      } catch {
        framesRef.current[index] = null;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );
}
