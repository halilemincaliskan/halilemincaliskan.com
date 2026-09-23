import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { build, experience as jobs } from '../data/site';
import type { StageId } from './contract';
import { DISPLAY } from './model';

const COPY = build.screen;
const WIDTH = 720;
const HEIGHT = Math.round((WIDTH * DISPLAY.height) / DISPLAY.width);
/** iPhone 16 Pro is 402 × 874 pt; everything below is laid out in points. */
const PT = WIDTH / 402;

/**
 * iOS 27 light-mode semantic colours (HIG, September 2026 values). The app screens use these and
 * nothing else, the way a SwiftUI app would with `.primary`, `.secondary` and the system tints.
 */
const IOS = {
  groupedBackground: '#f2f2f7',
  cell: '#ffffff',
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.29)',
  fill: 'rgba(120,120,128,0.2)',
  track: '#e5e5ea',
  green: 'rgb(52,199,89)',
  red: 'rgb(255,56,60)',
  blue: 'rgb(0,136,255)',
  gray: 'rgb(142,142,147)',
};

/** SF Pro on Apple devices; Geist everywhere else (Apple's fonts can't be served on the web). */
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Geist Variable", sans-serif';

/** Standard layout metrics. */
const MARGIN = 16;
const CELL = 52;
const CELL_RADIUS = 26;
const LIST_WIDTH = 402 - MARGIN * 2;
const TAB_Y = 790;

type Painter = (ctx: CanvasRenderingContext2D, t: number) => void;
type Tab = 0 | 1 | 2 | 3;

/** The visitor's own time on a 24-hour clock, as the lock screen shows it in Turkey. */
function clock(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function today(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ---- Drawing primitives (all in points) ------------------------------------------------------

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  color: string,
  options: { align?: CanvasTextAlign; maxWidth?: number } = {},
): void {
  let fitted = size;
  ctx.font = `${weight} ${fitted * PT}px ${SANS}`;
  if (options.maxWidth) {
    while (ctx.measureText(value).width > options.maxWidth * PT && fitted > size * 0.6) {
      fitted -= 0.5;
      ctx.font = `${weight} ${fitted * PT}px ${SANS}`;
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

function line(
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

function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  width: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * PT;
  ctx.beginPath();
  ctx.arc(x * PT, y * PT, r * PT, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * A Liquid Glass surface on a light background: translucent white, a hairline edge and a soft
 * shadow. Controls float on this; content never uses it.
 */
function glass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 18 * PT;
  ctx.shadowOffsetY = 4 * PT;
  rect(ctx, x, y, w, h, r, 'rgba(255,255,255,0.82)');
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 0.8 * PT;
  ctx.beginPath();
  ctx.roundRect(x * PT, y * PT, w * PT, h * PT, r * PT);
  ctx.stroke();
}

// ---- SF Symbols stand-ins --------------------------------------------------------------------

function checkmark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  line(ctx, color, s * 0.13, [
    [x - s * 0.32, y + s * 0.02],
    [x - s * 0.1, y + s * 0.24],
    [x + s * 0.33, y - s * 0.24],
  ]);
}

function xmark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const d = s * 0.26;
  line(ctx, color, s * 0.13, [
    [x - d, y - d],
    [x + d, y + d],
  ]);
  line(ctx, color, s * 0.13, [
    [x + d, y - d],
    [x - d, y + d],
  ]);
}

/** checkmark.circle.fill / xmark.circle.fill */
function statusIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  state: 'pass' | 'fail' | 'wait',
): void {
  if (state === 'wait') {
    ring(ctx, x, y, r - 1, 1.6, IOS.tertiary);
    return;
  }
  circle(ctx, x, y, r, state === 'pass' ? IOS.green : IOS.red);
  if (state === 'pass') checkmark(ctx, x, y + 0.5, r * 1.15, '#ffffff');
  else xmark(ctx, x, y, r * 1.15, '#ffffff');
}

/** UIActivityIndicatorView: eight spokes with trailing opacity. */
function activity(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  const head = Math.floor(t * 64) % 8;
  const base = ctx.globalAlpha;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const age = (head - i + 8) % 8;
    ctx.globalAlpha = base * (1 - age * 0.1);
    line(ctx, IOS.gray, r * 0.26, [
      [x + Math.cos(angle) * r * 0.5, y + Math.sin(angle) * r * 0.5],
      [x + Math.cos(angle) * r, y + Math.sin(angle) * r],
    ]);
  }
  ctx.globalAlpha = base;
}

function hammer(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, filled: boolean) {
  ctx.save();
  ctx.translate(x * PT, y * PT);
  ctx.rotate(-Math.PI / 4);
  ctx.translate(-x * PT, -y * PT);
  rect(ctx, x - 1.6, y - 3, 3.2, 14, 1.6, c);
  if (filled) rect(ctx, x - 7, y - 9, 14, 7, 2, c);
  else {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.7 * PT;
    ctx.beginPath();
    ctx.roundRect((x - 7) * PT, (y - 9) * PT, 14 * PT, 7 * PT, 2 * PT);
    ctx.stroke();
  }
  ctx.restore();
}

function listBullet(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  for (const dy of [-6, 0, 6]) {
    circle(ctx, x - 7, y + dy, 1.7, c);
    line(ctx, c, 2, [
      [x - 2.5, y + dy],
      [x + 8, y + dy],
    ]);
  }
}

function shield(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, filled: boolean) {
  ctx.beginPath();
  ctx.moveTo(x * PT, (y - 10) * PT);
  ctx.lineTo((x + 8.5) * PT, (y - 6.5) * PT);
  ctx.quadraticCurveTo((x + 8.5) * PT, (y + 6) * PT, x * PT, (y + 10.5) * PT);
  ctx.quadraticCurveTo((x - 8.5) * PT, (y + 6) * PT, (x - 8.5) * PT, (y - 6.5) * PT);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = c;
    ctx.fill();
    checkmark(ctx, x, y, 9, '#ffffff');
  } else {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.7 * PT;
    ctx.stroke();
    checkmark(ctx, x, y, 9, c);
  }
}

function clockGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  c: string,
  filled: boolean,
) {
  if (filled) circle(ctx, x, y, 10, c);
  else ring(ctx, x, y, 9.2, 1.7, c);
  const hand = filled ? '#ffffff' : c;
  line(ctx, hand, 1.8, [
    [x, y - 5.5],
    [x, y],
    [x + 4, y + 2.5],
  ]);
}

function magnifier(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  ring(ctx, x - 2, y - 2, 6.5, 2, c);
  line(ctx, c, 2.4, [
    [x + 3, y + 3],
    [x + 8, y + 8],
  ]);
}

function ellipsis(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  for (const dx of [-6, 0, 6]) circle(ctx, x + dx, y, 1.9, c);
}

// ---- System chrome ---------------------------------------------------------------------------

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
  rect(ctx, 134, 862, 134, 5, 2.5, color);
}

/** Navigation bar with a large title, an iOS 26+ subtitle and a glass "more" button. */
function navigation(ctx: CanvasRenderingContext2D, title: string, subtitle: string): void {
  glass(ctx, 342, 58, 44, 44, 22);
  ellipsis(ctx, 364, 80, IOS.label);
  text(ctx, title, MARGIN + 4, 142, 34, 700, IOS.label, { maxWidth: 360 });
  text(ctx, subtitle, MARGIN + 4, 166, 15, 400, IOS.secondary, { maxWidth: 360 });
}

/** Floating Liquid Glass tab bar with a separate search button, as in iOS 26+. */
function tabBar(ctx: CanvasRenderingContext2D, selected: Tab): void {
  const barX = 20;
  const barW = 296;
  const h = 62;
  glass(ctx, barX, TAB_Y, barW, h, h / 2);
  const slot = barW / 4;
  rect(
    ctx,
    barX + 4 + selected * slot,
    TAB_Y + 4,
    slot - 8,
    h - 8,
    (h - 8) / 2,
    'rgba(0,0,0,0.06)',
  );
  COPY.tabs.forEach((label, index) => {
    const cx = barX + slot * index + slot / 2;
    const on = index === selected;
    const tint = on ? IOS.blue : IOS.label;
    const iy = TAB_Y + 24;
    if (index === 0) hammer(ctx, cx, iy, tint, on);
    if (index === 1) listBullet(ctx, cx, iy, tint);
    if (index === 2) shield(ctx, cx, iy, tint, on);
    if (index === 3) clockGlyph(ctx, cx, iy, tint, on);
    text(ctx, label, cx, TAB_Y + 50, 10, 600, tint, { align: 'center' });
  });
  glass(ctx, 326, TAB_Y, 62, 62, 31);
  magnifier(ctx, 357, TAB_Y + 31, IOS.label);
}

/** Inset grouped section: optional header, then white rows with inset separators. */
function section(
  ctx: CanvasRenderingContext2D,
  y: number,
  rows: number,
  header?: string,
  rowHeight = CELL,
): number {
  let top = y;
  if (header) {
    text(ctx, header, MARGIN + 4, y + 16, 15, 600, IOS.secondary);
    top += 26;
  }
  rect(ctx, MARGIN, top, LIST_WIDTH, rows * rowHeight, CELL_RADIUS, IOS.cell);
  for (let i = 1; i < rows; i += 1) {
    rect(ctx, 60, top + i * rowHeight, LIST_WIDTH - 44, 0.6, 0, IOS.separator);
  }
  return top;
}

function appScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = IOS.groupedBackground;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function finish(ctx: CanvasRenderingContext2D, tab: Tab): void {
  tabBar(ctx, tab);
  statusBar(ctx, IOS.label);
  homeIndicator(ctx, IOS.label);
}

// ---- Screens ----------------------------------------------------------------------------------

/**
 * An abstract, iOS-style wallpaper drawn in code (Apple's own wallpapers are copyrighted, so they
 * can't ship on this site): deep blue at the top flowing into warm light at the bottom.
 */
function wallpaper(ctx: CanvasRenderingContext2D): void {
  const base = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  base.addColorStop(0, '#0a1330');
  base.addColorStop(0.45, '#1c1f5c');
  base.addColorStop(0.75, '#5a2a6e');
  base.addColorStop(1, '#c4563a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const blobs: Array<[number, number, number, string]> = [
    [0.15, 0.62, 0.75, 'rgba(255,141,40,0.55)'],
    [0.9, 0.78, 0.6, 'rgba(255,45,85,0.45)'],
    [0.85, 0.22, 0.7, 'rgba(0,136,255,0.45)'],
    [0.2, 0.08, 0.55, 'rgba(97,85,245,0.5)'],
  ];
  for (const [x, y, r, color] of blobs) {
    const glow = ctx.createRadialGradient(
      WIDTH * x,
      HEIGHT * y,
      0,
      WIDTH * x,
      HEIGHT * y,
      WIDTH * r,
    );
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  // Always-On dims the wallpaper; the phone is still in parts.
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** Always-On lock screen: the phone is still in parts, so the display only glows faintly. */
const lockScreen: Painter = (ctx) => {
  wallpaper(ctx);
  text(ctx, today(), 201, 128, 20, 600, 'rgba(255,255,255,0.66)', { align: 'center' });
  text(ctx, clock(), 201, 232, 110, 700, 'rgba(255,255,255,0.74)', {
    align: 'center',
    maxWidth: 360,
  });

  // Notification on clear Liquid Glass: app icon, app name, time, title and body.
  rect(ctx, 12, 668, 378, 86, 26, 'rgba(255,255,255,0.16)');
  const icon = ctx.createLinearGradient(0, 692 * PT, 0, 730 * PT);
  icon.addColorStop(0, '#3a3a3c');
  icon.addColorStop(1, '#1c1c1e');
  ctx.fillStyle = icon;
  ctx.beginPath();
  ctx.roundRect(26 * PT, 692 * PT, 38 * PT, 38 * PT, 9 * PT);
  ctx.fill();
  line(ctx, IOS.green, 2.6, [
    [36, 705],
    [42, 711],
    [36, 717],
  ]);
  line(ctx, IOS.green, 2.6, [
    [45, 718],
    [53, 718],
  ]);
  text(ctx, COPY.hero.title, 76, 707, 15, 600, 'rgba(255,255,255,0.9)', { maxWidth: 240 });
  text(ctx, 'now', 374, 707, 13, 400, 'rgba(255,255,255,0.55)', { align: 'right' });
  text(ctx, COPY.hero.body, 76, 727, 15, 400, 'rgba(255,255,255,0.78)', { maxWidth: 290 });

  // Flashlight and camera quick actions.
  for (const x of [72, 330]) circle(ctx, x, 790, 25, 'rgba(255,255,255,0.14)');
  rect(ctx, 68.5, 781, 7, 18, 2.5, 'rgba(255,255,255,0.72)');
  rect(ctx, 320, 783, 20, 14, 3.5, 'rgba(255,255,255,0.72)');
  circle(ctx, 330, 790, 3.6, 'rgba(0,0,0,0.6)');
  homeIndicator(ctx, 'rgba(255,255,255,0.5)');
};

/** Boot sequence between "assembled" and the first app screen: the Apple-style progress. */
const boot = (ctx: CanvasRenderingContext2D, t: number): void => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = clamp(t * 3);
  rect(ctx, 151, 470, 100, 4, 2, 'rgba(255,255,255,0.25)');
  rect(ctx, 151, 470, 100 * clamp(t * 1.2), 4, 2, '#ffffff');
  ctx.globalAlpha = 1;
};

const modules: Painter = (ctx, t) => {
  const copy = COPY.work;
  appScreen(ctx);
  navigation(ctx, copy.title, copy.subtitle);

  const packagesTop = section(ctx, 188, copy.packages.length, copy.packagesHeader);
  copy.packages.forEach((name, index) => {
    const y = packagesTop + index * CELL + CELL / 2;
    const done = t >= 0.12 + index * 0.05;
    statusIcon(ctx, 38, y, 11, done ? 'pass' : 'wait');
    text(ctx, name, 60, y + 6, 17, 400, IOS.label);
  });

  const count = 17;
  const compiled = clamp((t - 0.22) / 0.3) * count;
  const done = compiled >= count;
  const top = section(ctx, 386, 1, copy.modulesHeader, 76);
  text(ctx, done ? copy.compiled : copy.compiling, 36, top + 32, 17, 400, IOS.label);
  text(ctx, `${Math.floor(compiled)} of ${count}`, 366, top + 32, 17, 400, IOS.secondary, {
    align: 'right',
  });
  rect(ctx, 36, top + 54, 330, 4, 2, IOS.track);
  rect(ctx, 36, top + 54, 330 * (compiled / count), 4, 2, done ? IOS.green : IOS.blue);

  // What runs after every module: the checks that keep the build honest.
  const checksTop = section(ctx, 504, copy.checks.length, copy.checksHeader);
  copy.checks.forEach(([label, value], index) => {
    const y = checksTop + index * CELL + CELL / 2;
    const ran = done || compiled >= (index + 1) * 5;
    statusIcon(ctx, 38, y, 11, ran ? 'pass' : 'wait');
    text(ctx, label, 60, y + 6, 17, 400, ran ? IOS.label : IOS.secondary);
    text(ctx, ran ? value : 'Waiting', 366, y + 6, 17, 400, IOS.secondary, { align: 'right' });
  });
  finish(ctx, 0);
};

const work: Painter = (ctx, t) => {
  if (t < 0.08) boot(ctx, t / 0.08);
  else modules(ctx, t);
};

const workflow: Painter = (ctx, t) => {
  const copy = COPY.workflow;
  appScreen(ctx);
  navigation(ctx, copy.title, copy.subtitle);
  const top = section(ctx, 188, copy.rows.length);
  copy.rows.forEach((row, index) => {
    const y = top + index * CELL + CELL / 2;
    const phase = t * copy.rows.length - index;
    const done = phase >= 0.72;
    const running = phase >= 0 && !done;
    if (done) statusIcon(ctx, 38, y, 11, 'pass');
    else if (running) activity(ctx, 38, y, 10, phase);
    else statusIcon(ctx, 38, y, 11, 'wait');
    text(ctx, row, 60, y + 6, 17, 400, running || done ? IOS.label : IOS.secondary);
    const state = done ? copy.states.pass : running ? copy.states.run : copy.states.wait;
    text(ctx, state, 366, y + 6, 17, 400, IOS.secondary, { align: 'right' });
  });
  const passed = Math.min(copy.rows.length, Math.floor(t * copy.rows.length + 0.28));
  text(
    ctx,
    `${passed} of ${copy.rows.length} steps passed`,
    MARGIN + 4,
    top + 6 * CELL + 24,
    13,
    400,
    IOS.secondary,
  );
  finish(ctx, 1);
};

const gate: Painter = (ctx, t) => {
  const copy = COPY.gate;
  appScreen(ctx);
  navigation(ctx, copy.title, copy.subtitle);
  const failing = t >= 0.3 && t < 0.75;
  const passed = t >= 0.75;

  // Hero status card.
  rect(ctx, MARGIN, 188, LIST_WIDTH, 196, CELL_RADIUS, IOS.cell);
  if (failing) statusIcon(ctx, 201, 258, 34, 'fail');
  else if (passed) statusIcon(ctx, 201, 258, 34, 'pass');
  else activity(ctx, 201, 258, 22, t);
  const status = failing ? copy.failed : passed ? copy.passed : copy.running;
  text(ctx, status, 201, 330, 22, 700, IOS.label, { align: 'center', maxWidth: 330 });
  text(ctx, copy.subtitle, 201, 356, 15, 400, IOS.secondary, { align: 'center' });

  // The two builds side by side, as rows.
  const top = section(ctx, 404, 2);
  const rows: Array<[string, 'pass' | 'fail' | 'wait' | 'run', string]> = [
    [copy.simulator, 'pass', 'Passed'],
    [
      copy.device,
      failing ? 'fail' : passed ? 'pass' : 'run',
      failing ? 'Failed' : passed ? 'Passed' : 'Running',
    ],
  ];
  rows.forEach(([label, state, value], index) => {
    const y = top + index * CELL + CELL / 2;
    if (state === 'run') activity(ctx, 38, y, 10, t);
    else statusIcon(ctx, 38, y, 11, state);
    text(ctx, label, 60, y + 6, 17, 400, IOS.label);
    text(ctx, value, 366, y + 6, 17, 400, state === 'fail' ? IOS.red : IOS.secondary, {
      align: 'right',
    });
  });

  if (failing) {
    const errorTop = section(ctx, 524, 1, copy.errorTitle, 76);
    text(ctx, copy.errorBody, 36, errorTop + 32, 17, 400, IOS.label, { maxWidth: 330 });
    text(ctx, copy.errorHint, 36, errorTop + 56, 15, 400, IOS.secondary, { maxWidth: 330 });
  }
  finish(ctx, 2);
};

const defects: Painter = (ctx, t) => {
  const copy = COPY.defects;
  appScreen(ctx);
  navigation(ctx, copy.title, copy.subtitle);
  const top = section(ctx, 188, copy.items.length);
  copy.items.forEach((item, index) => {
    const y = top + index * CELL + CELL / 2;
    const fixed = t >= (index + 1) * 0.2;
    statusIcon(ctx, 38, y, 11, fixed ? 'pass' : 'fail');
    text(ctx, item, 60, y + 6, 17, 400, IOS.label, { maxWidth: 220 });
    text(
      ctx,
      fixed ? copy.states.fixed : copy.states.open,
      366,
      y + 6,
      17,
      400,
      fixed ? IOS.secondary : IOS.red,
      {
        align: 'right',
      },
    );
  });
  finish(ctx, 2);
};

const experience: Painter = (ctx, t) => {
  const copy = COPY.experience;
  appScreen(ctx);
  navigation(ctx, copy.title, copy.subtitle);
  // Newest on top, like the CV; rows light up from the oldest job at the bottom.
  const rowHeight = 64;
  const count = jobs.length;
  const top = section(ctx, 188, count, undefined, rowHeight);
  const base = ctx.globalAlpha;
  jobs.forEach((job, index) => {
    const y = top + index * rowHeight;
    const active = t >= ((count - 1 - index) / count) * 0.36;
    const current = index === 0;
    ctx.globalAlpha = base * (active ? 1 : 0.35);
    circle(ctx, 38, y + rowHeight / 2, 5, current ? IOS.green : IOS.gray);
    text(ctx, job.company, 60, y + 28, 17, 600, IOS.label, { maxWidth: 210 });
    text(ctx, job.role, 60, y + 49, 15, 400, IOS.secondary, { maxWidth: 230 });
    const year = job.period.match(/\d{4}/)?.[0] ?? '';
    if (current) {
      rect(ctx, 312, y + 20, 54, 24, 12, 'rgba(52,199,89,0.16)');
      text(ctx, copy.now, 339, y + 37, 13, 600, 'rgb(36,138,61)', { align: 'center' });
    } else {
      text(ctx, year, 366, y + 38, 17, 400, IOS.secondary, { align: 'right' });
    }
    ctx.globalAlpha = base;
  });
  finish(ctx, 3);
};

const contact: Painter = (ctx, t) => {
  const copy = COPY.contact;
  appScreen(ctx);
  const grow = 0.9 + clamp(t / 0.4) * 0.1;
  ctx.save();
  ctx.translate(201 * PT, 330 * PT);
  ctx.scale(grow, grow);
  ctx.translate(-201 * PT, -330 * PT);
  statusIcon(ctx, 201, 330, 48, 'pass');
  ctx.restore();
  text(ctx, copy.title, 201, 430, 28, 700, IOS.label, { align: 'center', maxWidth: 360 });
  text(ctx, copy.subtitle, 201, 460, 17, 400, IOS.secondary, { align: 'center' });
  // Prominent button: the accent colour goes on the background, not on the label.
  rect(ctx, 36, 700, 330, 52, 26, IOS.blue);
  text(ctx, copy.action, 201, 732, 17, 600, '#ffffff', { align: 'center' });
  statusBar(ctx, IOS.label);
  homeIndicator(ctx, IOS.label);
};

const painters: Record<StageId, Painter> = {
  hero: lockScreen,
  stats: lockScreen,
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
    // Fade through the background instead of blending two screens, so two titles never overlap.
    // Only the content area fades; the status bar and tab bar stay put, as they do on iOS.
    const from = previous[stage];
    const fade = clamp(this.t / 0.1);
    const outgoing = from !== undefined && fade < 0.5;
    painters[outgoing ? from : stage](ctx, outgoing ? 1 : this.t);
    if (from && fade < 1) {
      ctx.globalAlpha = outgoing ? fade * 2 : (1 - fade) * 2;
      rect(ctx, 0, 50, 402, TAB_Y - 56, 0, IOS.groupedBackground);
      ctx.globalAlpha = 1;
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
