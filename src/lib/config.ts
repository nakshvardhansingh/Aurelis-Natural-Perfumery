export interface Chapter {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  title: string;
  description: string;
  align: "left" | "center" | "right";
}

/**
 * FRAME SEQUENCE CONFIGURATION
 * ----------------------------
 * Frames live in /public/frames and are named frame-0000.webp … frame-0191.webp
 * Adjust `count` / `pad` if you regenerate the sequence.
 */
export const FRAMES = {
  directory: "/frames",
  prefix: "frame-",
  extension: ".webp",
  count: 192,
  pad: 4,
} as const;

export function frameUrl(index: number): string {
  return `${FRAMES.directory}/${FRAMES.prefix}${String(index).padStart(
    FRAMES.pad,
    "0"
  )}${FRAMES.extension}`;
}

/**
 * Total scroll length of the cinematic sequence, expressed in viewport heights.
 * Higher = slower, heavier, more luxurious scrubbing.
 */
export const SEQUENCE_VIEWPORTS = 6.5;

/** Progress (0–1) at which the hero typography has fully faded out. */
export const HERO_FADE_END = 0.05;

/** Progress at which the outro darkening begins, handing off to the final section. */
export const OUTRO_START = 0.92;

/**
 * STORY CHAPTERS
 * --------------
 * Frame ranges map directly onto the cinematic sequence.
 * Re-balance freely — everything downstream reads from this config.
 */
export const CHAPTERS: Chapter[] = [
  {
    id: "origin",
    index: 0,
    startFrame: 0,
    endFrame: 38,
    title: "ORIGIN",
    description: "Where every fragrance begins with the earth.",
    align: "left",
  },
  {
    id: "harvest",
    index: 1,
    startFrame: 39,
    endFrame: 80,
    title: "HARVEST",
    description: "Flowers gathered at first light, before the mountain wakes.",
    align: "right",
  },
  {
    id: "distillation",
    index: 2,
    startFrame: 81,
    endFrame: 120,
    title: "DISTILLATION",
    description: "Nature transformed into something timeless.",
    align: "left",
  },
  {
    id: "essence",
    index: 3,
    startFrame: 121,
    endFrame: 158,
    title: "ESSENCE",
    description: "Petals. Botanicals. Time.",
    align: "right",
  },
  {
    id: "creation",
    index: 4,
    startFrame: 159,
    endFrame: FRAMES.count - 1,
    title: "THE FINAL ESSENCE",
    description: "A fragrance shaped by the mountains.",
    align: "center",
  },
];

export const BOTANICAL_NOTES = [
  { name: "WILD DAISY", role: "TOP NOTE" },
  { name: "PINE", role: "HEART NOTE" },
  { name: "MOUNTAIN HERBS", role: "BASE NOTE" },
];
