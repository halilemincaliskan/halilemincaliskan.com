import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineLoop,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CreateBuildScene, StageId } from './contract';
import { frameFor } from './choreography';
import { offsetOutline, squircle, type OutlinePoint } from './geometry';
import { BODY, DISPLAY, PhoneModel } from './model';
import { PhoneScreen } from './screen';

const GREEN = '#34c759';

function loop(outline: OutlinePoint[], z: number): BufferGeometry {
  return new BufferGeometry().setFromPoints(outline.map((p) => new Vector3(p.x, p.y, z)));
}

function canvasPlane(
  width: number,
  height: number,
  pixels: [number, number],
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): { mesh: Mesh; texture: CanvasTexture; material: MeshBasicMaterial } {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = pixels;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');
  paint(ctx, pixels[0], pixels[1]);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  return { mesh: new Mesh(new PlaneGeometry(width, height), material), texture, material };
}

export const createBuildScene: CreateBuildScene = ({ canvas, lowPower }) => {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 20, 70);
  camera.position.set(0, 0, 40);

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.03);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.95;
  room.dispose();
  pmrem.dispose();

  const key = new DirectionalLight('#ffffff', 2.2);
  key.position.set(-8, 10, 12);
  scene.add(key);
  const fill = new DirectionalLight('#eef4ff', 0.9);
  fill.position.set(10, 2, 8);
  scene.add(fill);
  const rim = new DirectionalLight('#ffffff', 1.6);
  rim.position.set(6, 6, -10);
  scene.add(rim);
  scene.add(new AmbientLight('#ffffff', 0.35));

  let dirty = true;
  const requestRenderRef = { current: (): void => {} };
  const screen = new PhoneScreen(() => requestRenderRef.current());
  const phone = new PhoneModel(screen.texture, lowPower);
  const holder = new Group();
  holder.add(phone.root);
  scene.add(holder);

  // Soft floor shadow under the sealed phone.
  const shadow = canvasPlane(1, 1, [256, 64], (ctx, w, h) => {
    // Drawn as a circle in a squashed space, so it lands as a soft ellipse.
    const g = ctx.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.setTransform(1, 0, 0, h / w, 0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  shadow.mesh.renderOrder = -1;
  scene.add(shadow.mesh);

  // Build-pass pulse: an outline that swells off the phone when the simulator build goes green.
  const pulseMaterial = new LineBasicMaterial({
    color: GREEN,
    transparent: true,
    depthTest: false,
  });
  const pulse = new LineLoop(
    loop(offsetOutline(phone.outline, 0.12), BODY.depth / 2 + 0.05),
    pulseMaterial,
  );
  pulse.visible = false;
  phone.root.add(pulse);

  // The simulator: a green wireframe twin that stays green while the real device fails.
  const ghost = new Group();
  const ghostMaterial = new LineBasicMaterial({
    color: GREEN,
    transparent: true,
    depthTest: false,
  });
  const ghostGeometries = [
    loop(phone.outline, 0),
    loop(squircle(DISPLAY.width, DISPLAY.height, DISPLAY.radius, 16), 0),
    loop(squircle(1.26, 0.37, 0.185, 8, 2), 0).translate(0, DISPLAY.height / 2 - 0.49, 0),
  ];
  ghostGeometries.forEach((geometry) => ghost.add(new LineLoop(geometry, ghostMaterial)));
  const badge = canvasPlane(4.4, 4.4, [512, 512], (ctx) => {
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 200, 110, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(200, 204);
    ctx.lineTo(240, 244);
    ctx.lineTo(314, 164);
    ctx.stroke();
    ctx.fillStyle = '#248a3d';
    ctx.textAlign = 'center';
    ctx.font = '650 44px "Geist Mono Variable", ui-monospace, monospace';
    ctx.fillText('Simulator', 256, 400);
    ctx.font = '600 36px "Geist Mono Variable", ui-monospace, monospace';
    ctx.fillText('build passed', 256, 452);
  });
  badge.mesh.position.set(0, 0.6, 0);
  ghost.add(badge.mesh);
  ghost.visible = false;
  scene.add(ghost);

  let width = 1;
  let height = 1;
  let stage: StageId = 'hero';
  let progress = 0;
  let running = true;
  let disposed = false;
  let raf = 0;
  const timer = new Timer();
  timer.connect(document);

  const render = (): void => {
    raf = 0;
    if (!running || disposed) return;
    timer.update();
    const elapsed = timer.getElapsed();
    const f = frameFor(stage, progress);
    const narrow = width / height < 0.8;
    const gate = stage === 'gate';

    const halfHeight = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfWidth = halfHeight * camera.aspect;
    // Fit the sealed phone: ~62% of the viewport height on desktop, top ~40% on phones.
    const heightShare = narrow ? 0.74 : 1.36;
    const widthShare = narrow ? 0.9 : 0.52;
    const fit = Math.min(
      (halfHeight * heightShare) / BODY.height,
      (halfWidth * widthShare) / BODY.width,
    );
    const ghostShift = narrow ? smoothstep(f.ghost) : 0;
    let scale = fit * f.size * (narrow ? 1 - 0.18 * ghostShift : 1);
    if (!narrow) {
      // In the gate the phone and its simulator twin share the space right of the copy column
      // (mirrors --gutter and --copy in site.css); shrink both when that space is tight.
      const copyRight = Math.min(72, Math.max(20, width * 0.05)) + Math.min(560, width * 0.44);
      const room = 0.95 - ((copyRight + 24) / width) * 2 + 1;
      const pairWidth = ((BODY.width * scale) / halfWidth) * 2 + 0.08;
      const gateWeight = smoothstep((f.x - 0.44) / 0.28);
      scale *= 1 + (Math.min(1, room / pairWidth) - 1) * gateWeight;
    }
    // Half the sealed phone's width in NDC, so wide poses never push it off the right edge.
    const halfNdc = (BODY.width * 0.5 * scale) / halfWidth;
    const x = narrow ? 0.38 * ghostShift : Math.min(f.x, 0.95 - halfNdc);
    const y = (narrow ? 0.4 : -0.04) - 0.06 * f.explode;

    phone.setExplode(f.layers);
    holder.scale.setScalar(scale);
    holder.position.set(x * halfWidth, y * halfHeight, 0);
    const float = f.idle ? Math.sin(elapsed * 0.8) * 0.06 : 0;
    holder.position.y += float;
    phone.root.rotation.set(
      f.rx + (f.idle ? Math.sin(elapsed * 0.5) * 0.015 : 0),
      f.ry + (f.idle ? Math.sin(elapsed * 0.37) * 0.03 : 0),
      f.rz,
    );

    shadow.material.opacity = f.shadow;
    shadow.mesh.visible = f.shadow > 0.01;
    shadow.mesh.position.set(
      holder.position.x,
      holder.position.y - (BODY.height / 2 + 0.9) * scale,
      -4,
    );
    shadow.mesh.scale.set(
      BODY.width * 1.6 * scale * (1 - float * 0.5),
      BODY.width * 0.4 * scale,
      1,
    );

    pulseMaterial.opacity = f.pulse * 0.8;
    pulse.visible = f.pulse > 0.01;
    pulse.scale.setScalar(1 + (1 - f.pulse) * 0.06);

    ghost.visible = gate && f.ghost > 0.01;
    ghostMaterial.opacity = f.ghost * (0.75 + Math.sin(elapsed * 3) * 0.1);
    badge.material.opacity = f.ghost;
    const ghostX = narrow ? -0.4 : x - halfNdc * 2 - 0.08;
    ghost.position.set(ghostX * halfWidth, y * halfHeight, 0);
    ghost.scale.setScalar(scale * (1 + Math.sin(elapsed * 2) * 0.006));

    const animated = f.idle || ghost.visible || pulse.visible;
    if (dirty || animated) {
      renderer.render(scene, camera);
      dirty = false;
    }
    if (animated) raf = window.requestAnimationFrame(render);
  };

  const requestRender = (): void => {
    dirty = true;
    if (running && !disposed && raf === 0) raf = window.requestAnimationFrame(render);
  };
  requestRenderRef.current = requestRender;
  requestRender();

  return {
    update(nextStage, t) {
      stage = nextStage;
      progress = Math.min(1, Math.max(0, t));
      screen.draw(stage, progress);
      requestRender();
    },
    resize(nextWidth, nextHeight) {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      requestRender();
    },
    pause() {
      running = false;
      if (raf !== 0) window.cancelAnimationFrame(raf);
      raf = 0;
      timer.update();
      timer.setTimescale(0);
    },
    resume() {
      if (disposed || running) return;
      running = true;
      timer.update();
      timer.setTimescale(1);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      if (raf !== 0) window.cancelAnimationFrame(raf);
      phone.dispose();
      screen.dispose();
      ghostGeometries.forEach((geometry) => geometry.dispose());
      ghostMaterial.dispose();
      badge.texture.dispose();
      badge.material.dispose();
      badge.mesh.geometry.dispose();
      pulse.geometry.dispose();
      pulseMaterial.dispose();
      shadow.texture.dispose();
      shadow.material.dispose();
      shadow.mesh.geometry.dispose();
      environment.dispose();
      timer.dispose();
      renderer.dispose();
    },
  };
};

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
