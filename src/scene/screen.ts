import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { build, experience as jobs } from '../data/site';
import type { StageId } from './contract';
import { DISPLAY } from './model';

const COPY = build.screen;
const WIDTH = 720;
const HEIGHT = Math.round((WIDTH * DISPLAY.height) / DISPLAY.width);
/** iPhone 16 Pro is 402 pt wide; everything below is laid out in points. */
const PT = WIDTH / 402;

const INK = {
  background: '#f2f2f7',
  card: '#ffffff',
  label: '#000000',
  secondary: '#3c3c4399',
  tertiary: '#3c3c434d',
  separator: '#c6c6c8',
  fill: '#78788033',
  green: '#34c759',
  greenInk: '#248a3d',
  red: '#ff3b30',
  redInk: '#d70015',
  blue: '#007aff',
  orange: '#ff9500',
};

const SANS = '"Geist Variable", system-ui, -apple-system, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';

type Painter = (ctx: CanvasRenderingContext2D, t: number) => void;

/** The visitor's own time, the way the iOS lock screen shows it (no AM/PM). */
function clock(): string {
  return new Date()
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?[APap]\.?[Mm]\.?$/, '');
}

function today(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function font(ctx: CanvasRenderingContext2D, size: number, weight: number, mono = false): void {
  ctx.font = `${weight} ${size * PT}px ${mono ? MONO : SANS}`;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  color: string,
  options: { mono?: boolean; align?: CanvasTextAlign; maxWidth?: number } = {},
): void {
  let fitted = size;
  font(ctx, fitted, weight, options.mono);
  if (options.maxWidth) {
    while (ctx.measureText(value).width > options.maxWidth * PT && fitted > size * 0.6) {
      fitted -= 0.5;
      font(ctx, fitted, weight, options.mono);
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x * PT, y * PT);
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x * PT, y * PT, w * PT, h * PT, r * PT);
  ctx.fill();
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x * PT, y * PT, r * PT, 0, Math.PI * 2);
  ctx.fill();
}

function stroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  path: Array<[number, number]>,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * PT;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach(([x, y], index) =>
    index === 0 ? ctx.moveTo(x * PT, y * PT) : ctx.lineTo(x * PT, y * PT),
  );
  ctx.stroke();
}

function check(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  stroke(ctx, color, size * 0.14, [
    [x - size * 0.34, y + size * 0.02],
    [x - size * 0.1, y + size * 0.26],
    [x + size * 0.36, y - size * 0.24],
  ]);
}

function cross(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const d = size * 0.28;
  stroke(ctx, color, size * 0.14, [
    [x - d, y - d],
    [x + d, y + d],
  ]);
  stroke(ctx, color, size * 0.14, [
    [x + d, y - d],
    [x - d, y + d],
  ]);
}

function spinner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.22 * PT;
  ctx.lineCap = 'round';
  const start = t * Math.PI * 8;
  ctx.beginPath();
  ctx.arc(x * PT, y * PT, r * PT, start, start + Math.PI * 1.35);
  ctx.stroke();
}

function statusBar(ctx: CanvasRenderingContext2D, color: string): void {
  text(ctx, clock(), 52, 36, 17, 600, color, { align: 'center' });
  ctx.fillStyle = color;
  [4, 6.5, 9, 11.5].forEach((h, i) => {
    ctx.beginPath();
    ctx.roundRect((300 + i * 5) * PT, (36 - h) * PT, 3.2 * PT, h * PT, 1 * PT);
    ctx.fill();
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.9 * PT;
  ctx.lineCap = 'round';
  for (const r of [9.5, 5.5]) {
    ctx.beginPath();
    ctx.arc(331 * PT, 36.5 * PT, r * PT, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  circle(ctx, 331, 35.2, 1.4, color);
  ctx.globalAlpha *= 0.4;
  ctx.lineWidth = 1 * PT;
  ctx.beginPath();
  ctx.roundRect(345 * PT, 26.5 * PT, 25 * PT, 12 * PT, 3.8 * PT);
  ctx.stroke();
  ctx.globalAlpha /= 0.4;
  rect(ctx, 347, 28.5, 21, 8, 2.2, color);
  ctx.globalAlpha *= 0.4;
  rect(ctx, 371.5, 30.5, 1.6, 4, 0.8, color);
  ctx.globalAlpha /= 0.4;
}

function homeIndicator(ctx: CanvasRenderingContext2D, color: string): void {
  rect(ctx, 134, 860, 134, 5, 2.5, color);
}

function largeTitle(
  ctx: CanvasRenderingContext2D,
  eyebrow: string,
  title: string,
  accent: string,
): void {
  text(ctx, eyebrow.toUpperCase(), 20, 104, 13, 600, accent, { mono: true });
  text(ctx, title, 20, 142, 34, 700, INK.label, { maxWidth: 362 });
}

// ---- Screens ----------------------------------------------------------------------------------

/** Always-On lock screen: the phone is still in parts, so the display only glows faintly. */
const alwaysOn: Painter = (ctx) => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(
    WIDTH * 0.3,
    HEIGHT * 0.78,
    10,
    WIDTH * 0.3,
    HEIGHT * 0.78,
    WIDTH,
  );
  glow.addColorStop(0, 'rgba(255,149,0,0.22)');
  glow.addColorStop(0.5, 'rgba(255,59,48,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const cool = ctx.createRadialGradient(
    WIDTH * 0.85,
    HEIGHT * 0.2,
    10,
    WIDTH * 0.85,
    HEIGHT * 0.2,
    WIDTH * 0.9,
  );
  cool.addColorStop(0, 'rgba(90,120,255,0.16)');
  cool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  text(ctx, today(), 201, 132, 19, 600, 'rgba(255,255,255,0.62)', { align: 'center' });
  text(ctx, clock(), 201, 232, 108, 700, 'rgba(255,255,255,0.72)', {
    align: 'center',
    maxWidth: 360,
  });

  rect(ctx, 16, 700, 370, 76, 24, 'rgba(255,255,255,0.14)');
  rect(ctx, 30, 714, 48, 48, 11, 'rgba(52,199,89,0.85)');
  text(ctx, '>_', 54, 745, 19, 700, 'rgba(0,0,0,0.75)', { mono: true, align: 'center' });
  text(ctx, COPY.hero.subtitle, 92, 734, 15, 650, 'rgba(255,255,255,0.8)');
  text(ctx, 'now', 370, 734, 13, 500, 'rgba(255,255,255,0.45)', { align: 'right' });
  text(ctx, COPY.hero.title, 92, 756, 15, 500, 'rgba(255,255,255,0.72)');
  homeIndicator(ctx, 'rgba(255,255,255,0.5)');
};

/** Boot sequence between "assembled" and the first app screen. */
const boot = (ctx: CanvasRenderingContext2D, t: number): void => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = clamp(t * 3);
  text(ctx, '>_', 201, 420, 64, 700, '#ffffff', { mono: true, align: 'center' });
  rect(ctx, 141, 470, 120, 4, 2, 'rgba(255,255,255,0.25)');
  rect(ctx, 141, 470, 120 * clamp(t * 1.2), 4, 2, '#ffffff');
  ctx.globalAlpha = 1;
};

function lightScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = INK.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

const modules: Painter = (ctx, t) => {
  lightScreen(ctx);
  largeTitle(ctx, COPY.work.eyebrow, COPY.work.title, INK.greenInk);
  const count = 17;
  const compiled = clamp((t - 0.1) / 0.38) * count;
  rect(ctx, 16, 170, 370, 58, 14, INK.card);
  text(ctx, `${Math.floor(compiled)} / ${count}`, 32, 206, 17, 600, INK.label, { mono: true });
  rect(ctx, 150, 194, 220, 6, 3, INK.fill);
  rect(ctx, 150, 194, 220 * (compiled / count), 6, 3, INK.green);
  for (let i = 0; i < count; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 16 + col * 94;
    const y = 246 + row * 94;
    const done = clamp(compiled - i);
    rect(ctx, x, y, 82, 82, 20, INK.card);
    if (done > 0) {
      ctx.globalAlpha = done;
      rect(ctx, x, y, 82, 82, 20, '#e8f8ec');
      check(ctx, x + 41, y + 34, 30, INK.green);
      ctx.globalAlpha = 1;
    }
    text(
      ctx,
      String(i + 1).padStart(2, '0'),
      x + 41,
      y + 70,
      12,
      600,
      done > 0.5 ? INK.greenInk : INK.secondary,
      {
        mono: true,
        align: 'center',
      },
    );
  }
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const work: Painter = (ctx, t) => {
  if (t < 0.08) boot(ctx, t / 0.08);
  else modules(ctx, t);
};

const workflow: Painter = (ctx, t) => {
  lightScreen(ctx);
  largeTitle(ctx, COPY.workflow.eyebrow, COPY.workflow.title, INK.blue);
  const rows = COPY.workflow.rows;
  const rowHeight = 58;
  rect(ctx, 16, 172, 370, rows.length * rowHeight, 14, INK.card);
  rows.forEach((row, index) => {
    const y = 172 + index * rowHeight;
    const phase = t * rows.length - index;
    const done = phase >= 0.72;
    const running = phase >= 0 && !done;
    if (index > 0) rect(ctx, 62, y, 324, 0.6, 0, INK.separator);
    if (done) {
      circle(ctx, 38, y + 29, 12, INK.green);
      check(ctx, 38, y + 29, 14, '#ffffff');
    } else if (running) {
      spinner(ctx, 38, y + 29, 10, phase, INK.blue);
    } else {
      circle(ctx, 38, y + 29, 11, INK.fill);
    }
    text(ctx, row, 62, y + 35, 17, 500, running || done ? INK.label : INK.secondary);
    const state = done
      ? COPY.workflow.states.pass
      : running
        ? COPY.workflow.states.run
        : COPY.workflow.states.wait;
    const tone = done ? INK.greenInk : running ? INK.blue : INK.secondary;
    text(ctx, state, 370, y + 34, 13, 650, tone, { mono: true, align: 'right' });
  });
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const gate: Painter = (ctx, t) => {
  lightScreen(ctx);
  const failing = t >= 0.3 && t < 0.75;
  const passed = t >= 0.75;
  const accent = failing ? INK.redInk : passed ? INK.greenInk : INK.blue;
  const status = failing ? COPY.gate.failed : passed ? COPY.gate.passed : COPY.gate.running;
  largeTitle(ctx, COPY.gate.eyebrow, status, accent);

  rect(ctx, 16, 172, 370, 250, 22, INK.card);
  const soft = failing ? '#ffe5e3' : passed ? '#e3f7e8' : '#e5f0ff';
  circle(ctx, 201, 272, 62, soft);
  if (failing) {
    circle(ctx, 201, 272, 42, INK.red);
    cross(ctx, 201, 272, 44, '#ffffff');
  } else if (passed) {
    circle(ctx, 201, 272, 42, INK.green);
    check(ctx, 201, 274, 44, '#ffffff');
  } else {
    spinner(ctx, 201, 272, 34, t, INK.blue);
  }
  text(ctx, 'generic/platform=iOS', 201, 382, 13, 550, INK.secondary, {
    mono: true,
    align: 'center',
  });

  if (failing) {
    rect(ctx, 16, 440, 370, 118, 16, INK.card);
    circle(ctx, 40, 470, 10, INK.red);
    cross(ctx, 40, 470, 12, '#ffffff');
    text(ctx, COPY.gate.errorTitle, 60, 476, 16, 650, INK.redInk);
    text(ctx, COPY.gate.errorBody, 32, 510, 15, 500, INK.label, { maxWidth: 338 });
    text(ctx, COPY.gate.errorHint, 32, 536, 14, 500, INK.secondary, { maxWidth: 338 });
  }
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const defects: Painter = (ctx, t) => {
  lightScreen(ctx);
  largeTitle(ctx, COPY.defects.eyebrow, COPY.defects.title, INK.greenInk);
  const items = COPY.defects.items;
  const rowHeight = 62;
  rect(ctx, 16, 172, 370, items.length * rowHeight, 14, INK.card);
  items.forEach((item, index) => {
    const y = 172 + index * rowHeight;
    const fixed = t >= (index + 1) * 0.2;
    if (index > 0) rect(ctx, 62, y, 324, 0.6, 0, INK.separator);
    circle(ctx, 38, y + 31, 12, fixed ? INK.green : INK.red);
    if (fixed) check(ctx, 38, y + 31, 14, '#ffffff');
    else cross(ctx, 38, y + 31, 13, '#ffffff');
    text(ctx, item, 62, y + 37, 17, 500, INK.label, { maxWidth: 230 });
    text(ctx, fixed ? 'FIXED' : 'OPEN', 370, y + 36, 12, 650, fixed ? INK.greenInk : INK.redInk, {
      mono: true,
      align: 'right',
    });
  });
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const experience: Painter = (ctx, t) => {
  lightScreen(ctx);
  largeTitle(ctx, COPY.experience.eyebrow, COPY.experience.title, INK.blue);
  // Newest on top, like the CV. The timeline fills from the oldest job at the bottom upwards,
  // and only the current job is green.
  const count = jobs.length;
  const rowGap = 96;
  rect(ctx, 44, 206, 2, (count - 1) * rowGap, 1, INK.separator);
  jobs.forEach((job, index) => {
    const y = 206 + index * rowGap;
    const active = t >= ((count - 1 - index) / count) * 0.36;
    const current = index === 0;
    const dot = active ? (current ? INK.green : INK.label) : INK.separator;
    circle(ctx, 45, y, active && current ? 9 : 6, dot);
    rect(ctx, 70, y - 36, 316, 72, 16, INK.card);
    const year = job.period.match(/\d{4}/)?.[0] ?? '';
    const tone = active ? INK.label : INK.secondary;
    text(ctx, year, 88, y - 4, 20, 650, current && active ? INK.greenInk : tone, { mono: true });
    text(ctx, job.company, 150, y - 4, 19, 650, tone, { maxWidth: 150 });
    if (current) {
      text(ctx, 'NOW', 368, y - 4, 12, 650, active ? INK.greenInk : INK.secondary, {
        mono: true,
        align: 'right',
      });
    }
    text(ctx, job.role, 88, y + 22, 14, 500, INK.secondary, { maxWidth: 280 });
  });
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const contact: Painter = (ctx, t) => {
  lightScreen(ctx);
  const grow = 0.9 + clamp(t / 0.4) * 0.1;
  ctx.save();
  ctx.translate(201 * PT, 330 * PT);
  ctx.scale(grow, grow);
  ctx.translate(-201 * PT, -330 * PT);
  circle(ctx, 201, 330, 84, '#e3f7e8');
  circle(ctx, 201, 330, 60, INK.green);
  check(ctx, 201, 333, 64, '#ffffff');
  ctx.restore();
  text(ctx, `${COPY.contact.top} ${COPY.contact.bottom}`, 201, 480, 26, 700, INK.greenInk, {
    mono: true,
    align: 'center',
    maxWidth: 360,
  });
  text(ctx, COPY.contact.subtitle, 201, 516, 17, 500, INK.secondary, { align: 'center' });
  statusBar(ctx, INK.label);
  homeIndicator(ctx, INK.label);
};

const painters: Record<StageId, Painter> = {
  hero: alwaysOn,
  stats: alwaysOn,
  work,
  workflow,
  gate,
  defects,
  experience,
  contact,
};

const previous: Partial<Record<StageId, StageId>> = {
  workflow: 'work',
  gate: 'workflow',
  defects: 'gate',
  experience: 'defects',
  contact: 'experience',
};

export class PhoneScreen {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private lastKey = '';
  private fonts = 0;
  private stage: StageId = 'hero';
  private t = 0;

  private minute = clock();
  private readonly ticker: number;

  constructor(onChange: () => void) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 8;
    this.draw('hero', 0);
    void document.fonts?.ready.then(() => {
      this.fonts += 1;
      this.draw(this.stage, this.t);
      onChange();
    });
    // Keep the clock honest: repaint when the minute turns over.
    this.ticker = window.setInterval(() => {
      if (clock() === this.minute) return;
      this.minute = clock();
      this.lastKey = '';
      this.draw(this.stage, this.t);
      onChange();
    }, 10_000);
  }

  /** Repaints when the visible frame changes. Returns true if the texture changed. */
  draw(stage: StageId, t: number): boolean {
    this.stage = stage;
    this.t = clamp(t);
    // The lock screen does not change with scroll, so it never re-uploads the texture.
    const steps = stage === 'hero' || stage === 'stats' ? 0 : 80;
    const key = `${stage}:${Math.round(this.t * steps)}:${this.fonts}:${this.minute}`;
    if (key === this.lastKey) return false;
    this.lastKey = key;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    painters[stage](ctx, this.t);
    const from = previous[stage];
    const fade = clamp(this.t / 0.12);
    if (from && fade < 1) {
      ctx.globalAlpha = 1 - fade;
      painters[from](ctx, 1);
    }
    ctx.restore();
    // The Dynamic Island is hardware, so it is painted over every screen.
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(138 * PT, 11 * PT, 126 * PT, 37 * PT, 18.5 * PT);
    ctx.fill();
    this.texture.needsUpdate = true;
    return true;
  }

  dispose(): void {
    window.clearInterval(this.ticker);
    this.texture.dispose();
  }
}
