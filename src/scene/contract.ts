// The page and the 3D scene talk only through this file.

export const STAGE_IDS = [
  'hero',
  'stats',
  'work',
  'workflow',
  'gate',
  'defects',
  'experience',
  'contact',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** Phones and weak GPUs: fewer segments, lower pixel ratio. */
  lowPower: boolean;
}

export interface BuildScene {
  /** Pure function of (stage, t) so scrolling backwards restores the same frame. */
  update(stage: StageId, t: number): void;
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export type CreateBuildScene = (options: SceneOptions) => BuildScene;
