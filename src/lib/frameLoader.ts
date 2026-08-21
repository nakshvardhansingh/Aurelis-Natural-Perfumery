import { FRAMES, frameUrl } from "./config";

export interface FrameLoaderOptions {
  /** Called with 0–1 progress as frames arrive. */
  onProgress?: (progress: number) => void;
  /** Frames scrubbed first — loaded with maximum parallelism. */
  priorityCount?: number;
  /** Parallel requests for the remaining sequence. */
  concurrency?: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
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
        results[index] = await loadImage(frameUrl(index));
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
