import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  arc,
  offsetOutline,
  slab,
  squircle,
  sweepProfile,
  texturedFace,
  type OutlinePoint,
} from './geometry';

// iPhone 16 Pro, 1 unit = 10 mm: 71.5 x 149.6 x 8.25 mm.
export const BODY = { width: 7.15, height: 14.96, depth: 0.825, radius: 1.32 } as const;
const HALF_DEPTH = BODY.depth / 2;
const GLASS_INSET = 0.075;
const BEZEL = 0.135;
export const DISPLAY = {
  width: BODY.width - 2 * (GLASS_INSET + BEZEL),
  height: BODY.height - 2 * (GLASS_INSET + BEZEL),
  radius: BODY.radius - GLASS_INSET - BEZEL * 0.6,
};
// Camera plateau centre in front-view coordinates (it sits top-left when seen from the back).
const PLATEAU = { x: BODY.width / 2 - 0.3 - 1.9, y: BODY.height / 2 - 0.3 - 1.9, size: 3.8 };

export type LayerId = 'back' | 'frame' | 'internals' | 'display';

export interface Layer {
  id: LayerId;
  group: Group;
  /** Offset from the assembled position when fully exploded. */
  exploded: Vector3;
}

function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');
  paint(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Deterministic pseudo-random numbers so the board layout is identical on every load. */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * Collapses every set of meshes that share a material inside a layer into one mesh.
 * The layers only ever move as a whole, so this is purely a draw-call saving: ~90 calls → ~30.
 */
function mergeByMaterial(group: Group): void {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const buckets = new Map<Material, Mesh[]>();
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const list = buckets.get(object.material) ?? [];
    list.push(object);
    buckets.set(object.material, list);
  });
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      return geometry.index ? geometry.toNonIndexed() : geometry;
    });
    const names = Object.keys(parts[0].attributes).filter((name) =>
      parts.every((part) => part.hasAttribute(name)),
    );
    for (const part of parts) {
      for (const name of Object.keys(part.attributes)) {
        if (!names.includes(name)) part.deleteAttribute(name);
      }
    }
    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!merged) continue;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    group.add(new Mesh(merged, material));
  }
}

export class PhoneModel {
  readonly root = new Group();
  readonly layers: Layer[] = [];
  readonly screenMaterial: MeshBasicMaterial;
  readonly outline: OutlinePoint[];
  private readonly textures: Texture[] = [];

  constructor(screenTexture: Texture, lowPower: boolean) {
    this.root.name = 'iphone-16-pro';
    const corner = lowPower ? 10 : 22;
    const round = lowPower ? 32 : 64;
    this.outline = squircle(BODY.width, BODY.height, BODY.radius, corner);

    const titanium = new MeshPhysicalMaterial({
      color: '#b3b1ac',
      metalness: 1,
      roughness: 0.28,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    });
    const titaniumDark = new MeshPhysicalMaterial({
      color: '#a19f9a',
      metalness: 1,
      roughness: 0.38,
    });
    const frostedGlass = new MeshPhysicalMaterial({
      color: '#8c8b87',
      metalness: 0,
      roughness: 0.6,
      envMapIntensity: 0.4,
    });
    const glossGlass = new MeshPhysicalMaterial({
      color: '#8a8985',
      metalness: 0,
      roughness: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.7,
    });
    const blackGlass = new MeshPhysicalMaterial({
      color: '#050506',
      metalness: 0,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    const antennaBand = new MeshStandardMaterial({ color: '#8f8b85', roughness: 0.7 });
    const matteBlack = new MeshStandardMaterial({ color: '#121316', roughness: 0.55 });

    // ---- Back glass, camera plateau and MagSafe --------------------------------------------
    const back = new Group();
    back.name = 'back-glass';
    const backOutline = offsetOutline(this.outline, -GLASS_INSET);
    const backPanel = new Mesh(slab(backOutline, 0.06, 0.02), frostedGlass);
    backPanel.position.z = -HALF_DEPTH + 0.018;
    back.add(backPanel);

    const plateauOutline = squircle(PLATEAU.size, PLATEAU.size, 0.98, corner, 3.6);
    const plateau = new Mesh(slab(plateauOutline, 0.13, 0.05), glossGlass);
    plateau.position.set(PLATEAU.x, PLATEAU.y, -HALF_DEPTH - 0.02);
    back.add(plateau);

    const lensTexture = this.lensTexture();
    const lensGlass = new MeshPhysicalMaterial({
      map: lensTexture,
      metalness: 0.1,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    });
    // Lathe profile of the raised titanium ring around each lens: [radius, height].
    const ringProfile = [
      [0.6, 0.02],
      [0.6, 0.2],
      [0.645, 0.25],
      [0.76, 0.26],
      [0.815, 0.21],
      [0.83, 0.02],
    ].map(([r, h]) => new Vector2(r, h));
    const ringGeometry = new LatheGeometry(ringProfile, round);
    const ringMetal = titanium.clone();
    ringMetal.side = DoubleSide;
    const lensGeometry = new CircleGeometry(0.605, round);
    const plateauBack = -HALF_DEPTH - 0.085;
    // Back-view layout, mirrored into front coordinates (x flips).
    const lenses: Array<[number, number]> = [
      [-0.9, 0.9],
      [-0.9, -0.9],
      [0.88, 0],
    ];
    for (const [u, v] of lenses) {
      const x = PLATEAU.x - u;
      const y = PLATEAU.y + v;
      const ring = new Mesh(ringGeometry, ringMetal);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y, plateauBack);
      back.add(ring);
      const lens = new Mesh(lensGeometry, lensGlass);
      lens.rotation.y = Math.PI;
      lens.position.set(x, y, plateauBack - 0.19);
      back.add(lens);
    }
    const flash = new Mesh(
      new CircleGeometry(0.2, round),
      new MeshPhysicalMaterial({
        color: '#f4efe2',
        roughness: 0.35,
        clearcoat: 1,
        emissive: new Color('#fff2c8'),
        emissiveIntensity: 0.15,
      }),
    );
    flash.rotation.y = Math.PI;
    flash.position.set(PLATEAU.x - 0.95, PLATEAU.y + 1.27, plateauBack - 0.002);
    back.add(flash);
    const lidar = new Mesh(
      new CircleGeometry(0.19, round),
      new MeshPhysicalMaterial({ color: '#0d0e10', roughness: 0.12, clearcoat: 1 }),
    );
    lidar.rotation.y = Math.PI;
    lidar.position.set(PLATEAU.x - 0.95, PLATEAU.y - 1.27, plateauBack - 0.002);
    back.add(lidar);
    const mic = new Mesh(new CircleGeometry(0.035, 16), matteBlack);
    mic.rotation.y = Math.PI;
    mic.position.set(PLATEAU.x - 1.45, PLATEAU.y + 0.02, plateauBack - 0.002);
    back.add(mic);

    // MagSafe on the inside of the back glass, seen when the phone is taken apart.
    const coilTexture = this.coilTexture();
    const coil = new Mesh(
      new RingGeometry(1.25, 2.12, round, 1),
      new MeshStandardMaterial({ map: coilTexture, metalness: 0.7, roughness: 0.38 }),
    );
    coil.position.set(0, -0.35, -HALF_DEPTH + 0.085);
    back.add(coil);
    const magnetMaterial = new MeshStandardMaterial({
      color: '#6f7278',
      metalness: 0.85,
      roughness: 0.3,
    });
    const magnetCount = 18;
    for (let i = 0; i < magnetCount; i += 1) {
      const angle = (i / magnetCount) * Math.PI * 2;
      const magnet = new Mesh(new BoxGeometry(0.58, 0.16, 0.05), magnetMaterial);
      magnet.position.set(
        Math.cos(angle) * 2.32,
        -0.35 + Math.sin(angle) * 2.32,
        -HALF_DEPTH + 0.1,
      );
      magnet.rotation.z = angle + Math.PI / 2;
      back.add(magnet);
    }
    const alignment = new Mesh(new BoxGeometry(0.34, 1.0, 0.05), magnetMaterial);
    alignment.position.set(0, -3.35, -HALF_DEPTH + 0.1);
    back.add(alignment);
    this.addLayer('back', back, new Vector3(0, -1.0, -3.8));

    // ---- Titanium frame --------------------------------------------------------------------
    const frame = new Group();
    frame.name = 'titanium-frame';
    const rim = 0.11;
    const wall = -0.2;
    const rimSegments = lowPower ? 3 : 6;
    const bandGeometry = sweepProfile(this.outline, [
      [
        { s: wall, z: -HALF_DEPTH, ns: 0, nz: -1 },
        { s: -rim, z: -HALF_DEPTH, ns: 0, nz: -1 },
      ],
      [
        ...arc(-rim, -HALF_DEPTH + rim, rim, -Math.PI / 2, 0, rimSegments),
        ...arc(-rim, HALF_DEPTH - rim, rim, 0, Math.PI / 2, rimSegments),
      ],
      [
        { s: -rim, z: HALF_DEPTH, ns: 0, nz: 1 },
        { s: wall, z: HALF_DEPTH, ns: 0, nz: 1 },
      ],
      [
        { s: wall, z: HALF_DEPTH, ns: -1, nz: 0 },
        { s: wall, z: -HALF_DEPTH, ns: -1, nz: 0 },
      ],
    ]);
    frame.add(new Mesh(bandGeometry, titanium));

    // Antenna lines: thin plastic breaks in the band.
    const hw = BODY.width / 2;
    const hh = BODY.height / 2;
    const antennaSide = new PlaneGeometry(0.035, BODY.depth - 0.2);
    const antennaEnd = new PlaneGeometry(0.035, BODY.depth - 0.2);
    const sideBreaks = [hh - 1.55, -hh + 1.75];
    for (const y of sideBreaks) {
      for (const side of [-1, 1]) {
        const line = new Mesh(antennaSide, antennaBand);
        line.rotation.set(0, (side * Math.PI) / 2, Math.PI / 2);
        line.position.set(side * (hw + 0.002), y, 0);
        frame.add(line);
      }
    }
    for (const x of [-1.6, 1.6]) {
      for (const end of [-1, 1]) {
        const line = new Mesh(antennaEnd, antennaBand);
        line.rotation.set((-end * Math.PI) / 2, 0, 0);
        line.position.set(x, end * (hh + 0.002), 0);
        frame.add(line);
      }
    }

    // Buttons: [side, centre from top, length, material].
    const buttons: Array<[number, number, number, Material]> = [
      [-1, 3.35, 0.78, titaniumDark],
      [-1, 4.85, 1.05, titaniumDark],
      [-1, 6.3, 1.05, titaniumDark],
      [1, 4.95, 1.62, titaniumDark],
    ];
    for (const [side, fromTop, length, material] of buttons) {
      const button = new Mesh(
        new RoundedBoxGeometry(0.12, length, 0.3, lowPower ? 2 : 4, 0.05),
        material,
      );
      button.position.set(side * (hw + 0.025), hh - fromTop, 0);
      frame.add(button);
    }
    // Camera Control: a flush sapphire pad in a thin titanium surround.
    const controlSurround = new Mesh(
      new RoundedBoxGeometry(0.06, 1.95, 0.36, lowPower ? 2 : 4, 0.03),
      titaniumDark,
    );
    controlSurround.position.set(hw + 0.005, hh - 10.05, 0);
    frame.add(controlSurround);
    const control = new Mesh(
      new RoundedBoxGeometry(0.07, 1.82, 0.28, lowPower ? 2 : 4, 0.03),
      new MeshPhysicalMaterial({ color: '#8d8a86', roughness: 0.1, clearcoat: 1, metalness: 0.2 }),
    );
    control.position.set(hw + 0.008, hh - 10.05, 0);
    frame.add(control);

    // Bottom edge: USB-C port and speaker/microphone holes.
    const port = new Mesh(
      new RoundedBoxGeometry(0.9, 0.05, 0.3, 3, 0.02),
      new MeshBasicMaterial({ color: '#0b0b0c' }),
    );
    port.position.set(0, -hh - 0.002, 0);
    frame.add(port);
    const hole = new CylinderGeometry(0.042, 0.042, 0.02, 12);
    const holeMaterial = new MeshBasicMaterial({ color: '#1a1a1c' });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i += 1) {
        const dot = new Mesh(hole, holeMaterial);
        dot.position.set(side * (1.05 + i * 0.19), -hh - 0.004, 0);
        frame.add(dot);
      }
    }
    this.addLayer('frame', frame, new Vector3(0, -0.4, -1.1));

    // ---- Internals: logic board, cameras, battery -------------------------------------------
    const internals = new Group();
    internals.name = 'internals';
    const pcb = new MeshStandardMaterial({ color: '#1d2a22', roughness: 0.6, metalness: 0.2 });
    const shield = new MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.9, roughness: 0.34 });
    const board = new Group();
    const boardLeft = new Mesh(new RoundedBoxGeometry(3.0, 4.9, 0.1, 2, 0.04), pcb);
    boardLeft.position.set(-1.72, 4.55, 0);
    board.add(boardLeft);
    const boardFoot = new Mesh(new RoundedBoxGeometry(3.7, 1.2, 0.1, 2, 0.04), pcb);
    boardFoot.position.set(1.3, 2.7, 0);
    board.add(boardFoot);
    const packages = ['DesignSystem', 'Networking', 'Hardware'];
    packages.forEach((name, index) => {
      const can = new Mesh(new RoundedBoxGeometry(2.55, 1.08, 0.14, 2, 0.05), shield);
      can.position.set(-1.72, 6.2 - index * 1.36, 0.1);
      board.add(can);
      const label = this.labelTexture(name);
      const tag = new Mesh(
        new PlaneGeometry(2.3, 0.46),
        new MeshBasicMaterial({ map: label, transparent: true, toneMapped: false }),
      );
      tag.position.set(-1.72, 6.2 - index * 1.36, 0.175);
      board.add(tag);
    });
    const random = seeded(17);
    const smdMaterials = [
      new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.5 }),
      new MeshStandardMaterial({ color: '#b08d57', metalness: 0.8, roughness: 0.3 }),
      new MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.4 }),
    ];
    // Small parts sit on a grid (one per cell, never overlapping) with slightly different heights,
    // so no two top faces share a plane: overlapping coplanar faces z-fight and shimmer.
    const cell = 0.3;
    const areas: Array<[number, number, number, number]> = [
      [-0.3, 2.25, 11, 3], // board foot, beside the cameras
      [-3.05, 2.3, 9, 2], // strip under the package shields
    ];
    let part = 0;
    for (const [x0, y0, columns, rows] of areas) {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (random() < (lowPower ? 0.7 : 0.4)) continue;
          const w = 0.08 + random() * (cell - 0.14);
          const h = 0.06 + random() * (cell - 0.14);
          const depth = 0.03 + (part % 5) * 0.009;
          const smd = new Mesh(new BoxGeometry(w, h, depth), smdMaterials[part % 3]);
          smd.position.set(
            x0 + column * cell + cell / 2,
            y0 + row * cell + cell / 2,
            0.045 + depth / 2,
          );
          board.add(smd);
          part += 1;
        }
      }
    }
    board.position.z = 0.05;
    internals.add(board);

    const cameraBody = new MeshStandardMaterial({
      color: '#17181b',
      roughness: 0.45,
      metalness: 0.4,
    });
    for (const [u, v] of lenses) {
      const module = new Mesh(new RoundedBoxGeometry(1.35, 1.35, 0.42, 2, 0.08), cameraBody);
      module.position.set(PLATEAU.x - u, PLATEAU.y + v, -0.08);
      internals.add(module);
      const barrel = new Mesh(new CylinderGeometry(0.5, 0.5, 0.2, round), titaniumDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(PLATEAU.x - u, PLATEAU.y + v, -0.34);
      internals.add(barrel);
    }

    const battery = new Group();
    const cell = new Mesh(
      slab(squircle(6.1, 8.7, 0.55, corner, 2.6), 0.42, 0.05),
      new MeshStandardMaterial({ color: '#2a2b2f', metalness: 0.55, roughness: 0.42 }),
    );
    battery.add(cell);
    const batteryLabel = new Mesh(
      new PlaneGeometry(4.2, 2.1),
      new MeshBasicMaterial({ map: this.batteryTexture(), transparent: true, toneMapped: false }),
    );
    batteryLabel.position.z = 0.215;
    battery.add(batteryLabel);
    battery.position.set(-0.1, -2.55, -0.02);
    internals.add(battery);

    const taptic = new Mesh(new RoundedBoxGeometry(2.1, 0.75, 0.32, 2, 0.06), matteBlack);
    taptic.position.set(-1.9, -7.25 + 0.9, 0);
    internals.add(taptic);
    const speaker = new Mesh(new RoundedBoxGeometry(1.9, 0.75, 0.32, 2, 0.06), shield);
    speaker.position.set(1.85, -7.25 + 0.9, 0);
    internals.add(speaker);
    this.addLayer('internals', internals, new Vector3(0, 0.4, 1.5));

    // ---- Display --------------------------------------------------------------------------
    const display = new Group();
    display.name = 'display';
    const glassOutline = offsetOutline(this.outline, -GLASS_INSET);
    const glass = new Mesh(slab(glassOutline, 0.07, 0.03), blackGlass);
    glass.position.z = HALF_DEPTH - 0.02;
    display.add(glass);
    const screenOutline = squircle(DISPLAY.width, DISPLAY.height, DISPLAY.radius, corner);
    this.screenMaterial = new MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    const screen = new Mesh(
      texturedFace(screenOutline, DISPLAY.width, DISPLAY.height),
      this.screenMaterial,
    );
    screen.position.z = HALF_DEPTH + 0.0165;
    display.add(screen);
    this.addLayer('display', display, new Vector3(0, 0.8, 4.2));

    for (const layer of this.layers) {
      mergeByMaterial(layer.group);
      this.root.add(layer.group);
    }
  }

  /** Places every layer: 0 = assembled, 1 = fully exploded. */
  setExplode(amounts: Record<LayerId, number>): void {
    for (const layer of this.layers) {
      const amount = amounts[layer.id];
      layer.group.position.copy(layer.exploded).multiplyScalar(amount);
    }
    // Hidden once sealed in: saves draw calls and avoids anything peeking through the glass.
    const internals = this.layers.find((layer) => layer.id === 'internals');
    if (internals) {
      internals.group.visible =
        amounts.internals > 0.002 || amounts.display > 0.002 || amounts.back > 0.002;
    }
  }

  private addLayer(id: LayerId, group: Group, exploded: Vector3): void {
    this.layers.push({ id, group, exploded });
  }

  private lensTexture(): CanvasTexture {
    const texture = canvasTexture(256, 256, (ctx) => {
      const c = 128;
      const base = ctx.createRadialGradient(c, c, 4, c, c, 128);
      base.addColorStop(0, '#050506');
      base.addColorStop(0.55, '#0b0c0f');
      base.addColorStop(0.82, '#17181c');
      base.addColorStop(1, '#2a2b30');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      const rings: Array<[number, string, number]> = [
        [118, 'rgba(160,165,175,0.55)', 3],
        [100, 'rgba(10,12,18,0.9)', 8],
        [78, 'rgba(90,96,120,0.45)', 2],
        [52, 'rgba(24,22,40,0.85)', 10],
      ];
      for (const [radius, color, width] of rings) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(c, c, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      const coating = ctx.createRadialGradient(c - 16, c - 20, 2, c, c, 60);
      coating.addColorStop(0, 'rgba(110,100,190,0.32)');
      coating.addColorStop(0.5, 'rgba(50,70,120,0.14)');
      coating.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coating;
      ctx.beginPath();
      ctx.arc(c, c, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(c, c, 88, Math.PI * 1.1, Math.PI * 1.38);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(c + 30, c - 34, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    this.textures.push(texture);
    return texture;
  }

  private coilTexture(): CanvasTexture {
    const texture = canvasTexture(512, 512, (ctx) => {
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(0, 0, 512, 512);
      for (let r = 120; r < 256; r += 5) {
        ctx.strokeStyle = r % 10 === 0 ? '#c68a4c' : '#6e4420';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(256, 256, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    this.textures.push(texture);
    return texture;
  }

  private labelTexture(text: string): CanvasTexture {
    const texture = canvasTexture(512, 104, (ctx) => {
      ctx.fillStyle = '#5a5e64';
      ctx.font = '600 44px "Geist Mono Variable", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 56);
    });
    this.textures.push(texture);
    return texture;
  }

  private batteryTexture(): CanvasTexture {
    const texture = canvasTexture(840, 420, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(4, 4, 832, 412, 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '600 58px "Geist Variable", system-ui, sans-serif';
      ctx.fillText('Li-ion Battery', 44, 110);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 34px "Geist Mono Variable", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 38; i += 1) {
        ctx.fillRect(44 + i * 10, 300, i % 3 === 0 ? 6 : 3, 70);
      }
    });
    this.textures.push(texture);
    return texture;
  }

  dispose(): void {
    this.textures.forEach((texture) => texture.dispose());
    const geometries = new Set<object>();
    const materials = new Set<object>();
    this.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (!geometries.has(object.geometry)) {
        object.geometry.dispose();
        geometries.add(object.geometry);
      }
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => {
        if (!materials.has(material)) {
          material.dispose();
          materials.add(material);
        }
      });
    });
  }
}
