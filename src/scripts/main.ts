import Lenis from 'lenis';
import { build } from '../data/site';
import { STAGE_IDS, type BuildScene, type StageId } from '../scene/contract';

type GateState = 'pending' | 'running' | 'fail' | 'pass';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const lowPower = coarse || window.innerWidth < 760 || navigator.hardwareConcurrency <= 4;

const canvas = document.querySelector<HTMLCanvasElement>('[data-scene]');
const progressBar = document.querySelector<HTMLElement>('[data-progress]');
const island = document.querySelector<HTMLElement>('[data-island]');
const islandNum = document.querySelector<HTMLElement>('[data-island-num]');
const islandLabel = document.querySelector<HTMLElement>('[data-island-label]');
const islandLog = document.querySelector<HTMLElement>('[data-island-log]');
const islandAnnounce = document.querySelector<HTMLElement>('[data-island-announce]');
const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-stage]'));
const tabs = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-tab]'));
/** Which tab a stage belongs to; the hero and stats belong to none. */
const TAB_OF: Partial<Record<StageId, string>> = {
  work: 'work',
  workflow: 'how-i-work',
  gate: 'how-i-work',
  defects: 'how-i-work',
  experience: 'experience',
  contact: 'contact',
};
const gateItems = new Map(
  build.gates.map((gate) => [
    gate.id,
    document.querySelector<HTMLElement>(`[data-gate="${gate.id}"]`),
  ]),
);

let scene: BuildScene | undefined;
let current: StageId | undefined;
let collapseTimer = 0;
let typeTimer = 0;
let frame = 0;

// ---- Scroll → stage ---------------------------------------------------------------------------

/** The stage whose section contains the middle of the viewport, and progress through it. */
function readStage(): { stage: StageId; t: number } {
  const middle = window.innerHeight / 2;
  let chosen = sections[0];
  let best = Number.POSITIVE_INFINITY;
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const distance =
      middle < rect.top ? rect.top - middle : middle > rect.bottom ? middle - rect.bottom : 0;
    if (distance < best) {
      best = distance;
      chosen = section;
    }
  }
  const rect = chosen.getBoundingClientRect();
  return {
    stage: chosen.dataset.stage as StageId,
    t: Math.min(1, Math.max(0, (middle - rect.top) / rect.height)),
  };
}

function position(stage: string, t: number): number {
  return STAGE_IDS.indexOf(stage as StageId) + t;
}

function gateState(gate: (typeof build.gates)[number], at: number): GateState {
  const pass = position(gate.passAt.stage, gate.passAt.t);
  const fail = 'failAt' in gate ? position(gate.failAt.stage, gate.failAt.t) : Infinity;
  if (at >= pass) return 'pass';
  if (at >= fail) return 'fail';
  if (at >= Math.min(pass, fail) - 0.08) return 'running';
  return 'pending';
}

// ---- Island -----------------------------------------------------------------------------------

function lineTone(line: string): string {
  if (line.startsWith('✓') || line.startsWith('**')) return 'pass';
  if (line.startsWith('✗')) return 'fail';
  if (line.startsWith('$') || line.startsWith('▶')) return 'cmd';
  return '';
}

function typeLog(stage: StageId): void {
  if (!islandLog) return;
  window.clearInterval(typeTimer);
  const lines = JSON.parse(
    sections.find((section) => section.dataset.stage === stage)?.dataset.terminal ?? '[]',
  ) as string[];
  islandLog.replaceChildren();
  const rows = lines.map((line) => {
    const row = document.createElement('p');
    const tone = lineTone(line);
    if (tone) row.dataset.tone = tone;
    islandLog.append(row);
    return { line, row };
  });
  if (reducedMotion) {
    rows.forEach(({ line, row }) => (row.textContent = line));
    return;
  }
  let index = 0;
  let char = 0;
  typeTimer = window.setInterval(() => {
    const target = rows[index];
    if (!target) {
      window.clearInterval(typeTimer);
      return;
    }
    char += 2;
    target.row.textContent = target.line.slice(0, char);
    if (char >= target.line.length) {
      index += 1;
      char = 0;
    }
  }, 16);
}

function expandIsland(): void {
  if (!island) return;
  island.dataset.open = 'true';
  window.clearTimeout(collapseTimer);
  collapseTimer = window.setTimeout(() => {
    if (!island.matches(':hover, :focus-within')) delete island.dataset.open;
  }, 2400);
}

function enterStage(stage: StageId, first: boolean): void {
  const index = STAGE_IDS.indexOf(stage);
  const label = build.stages[index].label;
  if (islandNum) islandNum.textContent = String(index).padStart(2, '0');
  if (islandLabel) islandLabel.textContent = label;
  if (islandAnnounce) islandAnnounce.textContent = `Stage ${index}: ${label}`;
  typeLog(stage);
  // On narrow screens the expanded island would cover the text being read, so it only opens on tap.
  if (!first && window.innerWidth > 760) expandIsland();
}

// ---- Frame ------------------------------------------------------------------------------------

function update(): void {
  frame = 0;
  const { stage, t } = readStage();
  const at = position(stage, t);
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) {
    progressBar.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
  }
  for (const gate of build.gates) {
    const item = gateItems.get(gate.id);
    if (item) item.dataset.state = gateState(gate, at);
  }
  if (island) island.dataset.stage = stage;
  if (stage !== current) {
    for (const tab of tabs) {
      if (tab.dataset.tab === TAB_OF[stage]) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
    }
    enterStage(stage, current === undefined);
    current = stage;
  }
  scene?.update(stage, t);
}

function requestUpdate(): void {
  if (frame === 0) frame = window.requestAnimationFrame(update);
}

// ---- Page details -----------------------------------------------------------------------------

function revealOnScroll(): void {
  const items = document.querySelectorAll<HTMLElement>('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((item) => observer.observe(item));
}

function countUp(): void {
  const values = document.querySelectorAll<HTMLElement>('[data-count]');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const node = entry.target as HTMLElement;
        const target = Number(node.dataset.count);
        const suffix = node.dataset.suffix ?? '';
        if (reducedMotion || target === 0) continue;
        const start = performance.now();
        const tick = (now: number): void => {
          const k = Math.min(1, (now - start) / 900);
          node.textContent = `${Math.round(target * (1 - (1 - k) ** 3))}${suffix}`;
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.6 },
  );
  values.forEach((value) => observer.observe(value));
}

function smoothScroll(): void {
  if (coarse || reducedMotion) return;
  const lenis = new Lenis({ lerp: 0.11, anchors: true });
  const raf = (time: number): void => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

async function startScene(): Promise<void> {
  if (!canvas) return;
  try {
    const { createBuildScene } = await import('../scene/index');
    scene = createBuildScene({ canvas, lowPower });
    scene.resize(window.innerWidth, window.innerHeight);
    document.documentElement.classList.add('has-scene');
    requestUpdate();
  } catch (error) {
    console.error('3D scene unavailable, continuing without it.', error);
    canvas.hidden = true;
  }
}

island?.addEventListener('mouseenter', expandIsland);
island?.addEventListener('focus', expandIsland);
island?.addEventListener('click', expandIsland);
window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener(
  'resize',
  () => {
    scene?.resize(window.innerWidth, window.innerHeight);
    requestUpdate();
  },
  { passive: true },
);
document.addEventListener('visibilitychange', () =>
  document.hidden ? scene?.pause() : scene?.resume(),
);

revealOnScroll();
countUp();
smoothScroll();
update();
void startScene();
