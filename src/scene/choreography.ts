import { STAGE_IDS, type StageId } from './contract';
import type { LayerId } from './model';

/**
 * The whole scroll is one timeline: position = stage index + progress (0..8).
 * Poses are keyframes on that timeline, so leaving one stage and entering the next is always
 * continuous, and scrubbing backwards lands on exactly the same frame.
 */
export interface Pose {
  rx: number;
  ry: number;
  rz: number;
  /** 1 = fully exploded view, 0 = sealed phone. */
  explode: number;
  /** Horizontal placement on wide screens, in NDC (-1..1). */
  x: number;
  /** Uniform size multiplier on top of the viewport fit. */
  size: number;
}

export interface Frame extends Pose {
  layers: Record<LayerId, number>;
  ghost: number;
  pulse: number;
  shadow: number;
  idle: boolean;
}

const KEYS: Array<[number, Pose]> = [
  [0.0, { rx: -0.3, ry: -0.92, rz: 0.1, explode: 1, x: 0.46, size: 0.8 }],
  [1.0, { rx: -0.26, ry: -0.8, rz: 0.07, explode: 0.94, x: 0.46, size: 0.84 }],
  [1.25, { rx: -0.22, ry: -0.72, rz: 0.05, explode: 0.93, x: 0.45, size: 0.87 }],
  [2.0, { rx: 0.06, ry: -0.3, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [3.0, { rx: 0.02, ry: -0.2, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [3.85, { rx: 0, ry: 0.12, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [4.12, { rx: 0, ry: 0, rz: 0, explode: 0, x: 0.72, size: 1 }],
  [4.88, { rx: 0, ry: 0, rz: 0, explode: 0, x: 0.72, size: 1 }],
  [5.15, { rx: 0.02, ry: -0.16, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [6.0, { rx: 0, ry: -0.08, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [6.4, { rx: 0, ry: -0.02, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [6.82, { rx: -0.06, ry: Math.PI - 0.42, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [7.0, { rx: -0.06, ry: Math.PI - 0.3, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [7.6, { rx: 0, ry: Math.PI * 2 - 0.18, rz: 0, explode: 0, x: 0.44, size: 1 }],
  [8.0, { rx: 0, ry: Math.PI * 2 - 0.12, rz: 0, explode: 0, x: 0.44, size: 1 }],
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smooth(value: number): number {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function samplePose(position: number): Pose {
  let index = 0;
  while (index < KEYS.length - 2 && position > KEYS[index + 1][0]) index += 1;
  const [p0, a] = KEYS[index];
  const [p1, b] = KEYS[index + 1];
  const k = smooth((position - p0) / (p1 - p0));
  const mix = (from: number, to: number): number => from + (to - from) * k;
  return {
    rx: mix(a.rx, b.rx),
    ry: mix(a.ry, b.ry),
    rz: mix(a.rz, b.rz),
    explode: mix(a.explode, b.explode),
    x: mix(a.x, b.x),
    size: mix(a.size, b.size),
  };
}

/**
 * Assembly happens while the stats are on screen, so the phone is sealed and booting by the time
 * the case study arrives. Order: internals drop into the frame, the back closes, the display
 * comes down last. Each layer eases on its own slice of the assembly window.
 */
const ASSEMBLE_FROM = 0.25;
const ASSEMBLY: Record<LayerId, [number, number]> = {
  frame: [0.0, 0.34],
  internals: [0.04, 0.4],
  back: [0.18, 0.5],
  display: [0.3, 0.6],
};

export function frameFor(stage: StageId, t: number): Frame {
  const index = STAGE_IDS.indexOf(stage);
  const position = index + clamp(t);
  const pose = samplePose(position);

  const layers = {} as Record<LayerId, number>;
  for (const id of Object.keys(ASSEMBLY) as LayerId[]) {
    if (index === 0) layers[id] = pose.explode;
    else if (index > 1) layers[id] = 0;
    else {
      const [start, end] = ASSEMBLY[id];
      const u = (t - ASSEMBLE_FROM) / (1 - ASSEMBLE_FROM);
      layers[id] = 0.94 * (1 - smooth((u - start) / (end - start)));
    }
  }

  const ghost = stage === 'gate' ? smooth((t - 0.06) / 0.1) * (1 - smooth((t - 0.86) / 0.1)) : 0;
  const pulse = stage === 'work' ? Math.max(0, 1 - Math.abs(t - 0.5) / 0.06) : 0;
  const shadow = 1 - smooth(pose.explode / 0.6);

  return {
    ...pose,
    layers,
    ghost,
    pulse,
    shadow,
    idle: stage === 'hero' || stage === 'stats' || stage === 'experience' || stage === 'contact',
  };
}
