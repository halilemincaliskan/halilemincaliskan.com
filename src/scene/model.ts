import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
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
  Shape,
  ShapeGeometry,
  Texture,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import {
  arc,
  offsetOutline,
  slab,
  squircle,
  sweepProfile,
  texturedFace,
  type OutlinePoint,
} from './geometry';

// iPhone 18 Pro, 1 unit = 10 mm. Front proportions are measured from Apple's official iPhone 18 Pro
// bezel (Apple Design Resources, 2026-09): body 1301 x 2716 px around a 1206 x 2622 px (402 x 874 pt)
// screen, a 24 px titanium band and a 23 px black border. The corner leaves a 69 px gap along the
// diagonal; our continuous (superellipse, n = 3.2) corner leaves 0.195 r there, so r = 354 px (a
// circular corner would be 236 px and look too tight). The width keeps the 71.5 mm of the Pro line.
const PX = 7.15 / 1301;
export const BODY = { width: 7.15, height: 2716 * PX, depth: 0.825, radius: 354 * PX } as const;
const HALF_DEPTH = BODY.depth / 2;
const GLASS_INSET = 24 * PX;
const BEZEL = 23.5 * PX;
export const DISPLAY = {
  width: BODY.width - 2 * (GLASS_INSET + BEZEL),
  height: BODY.height - 2 * (GLASS_INSET + BEZEL),
  // Concentric with the body: the screen outline is the body outline offset inwards, so the black
  // border is the same thickness all the way round, corners included (HIG: concentric corners).
  radius: BODY.radius - GLASS_INSET - BEZEL,
};
// iPhone 18 Pro camera plateau height, from the top of the body (Apple's product photos).
const PLATEAU_HEIGHT = 4.3;

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

    // Burgundy, from apple.com/tr/iphone-18-pro (swatch #2e0f14, finish #4d1821) and the official
    // product photo (aluminium ~#4a2c30 in shadow, #875860 in highlights). Lifted slightly because
    // this scene is lit brighter than Apple's black studio shots.
    // Anodised aluminium: satin, so it doesn't blow out to pink when it faces the light.
    const titanium = new MeshPhysicalMaterial({
      color: '#6e4650',
      metalness: 0.9,
      roughness: 0.42,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
      // The room environment is almost white; at full strength it washes the colour out.
      envMapIntensity: 0.55,
    });
    const titaniumDark = new MeshPhysicalMaterial({
      color: '#6c444c',
      metalness: 0.9,
      roughness: 0.42,
      envMapIntensity: 0.55,
    });
    const frostedGlass = new MeshPhysicalMaterial({
      color: '#34181e',
      metalness: 0,
      roughness: 0.6,
      envMapIntensity: 0.15,
      specularIntensity: 0.35,
    });
    const blackGlass = new MeshPhysicalMaterial({
      color: '#050506',
      metalness: 0,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    const antennaBand = new MeshStandardMaterial({ color: '#5e3a42', roughness: 0.7 });
    const matteBlack = new MeshStandardMaterial({ color: '#121316', roughness: 0.55 });

    // ---- Back glass, camera plateau and MagSafe --------------------------------------------
    const back = new Group();
    back.name = 'back-glass';
    // iPhone 18 Pro back: an aluminium unibody with two dark islands on it, inset from the edges: the
    // raised camera plateau at the top and the glass panel below it, both the same deep colour.
    const plateauMetal = titanium.clone();
    plateauMetal.color = new Color('#5e3a43');
    plateauMetal.roughness = 0.58;
    plateauMetal.clearcoat = 0;
    plateauMetal.envMapIntensity = 0.45;

    const backOutline = offsetOutline(this.outline, -GLASS_INSET);
    const backPanel = new Mesh(slab(backOutline, 0.06, 0.02), plateauMetal);
    backPanel.position.z = -HALF_DEPTH + 0.018;
    back.add(backPanel);

    const islandInset = 0.3;
    const islandMetal = frostedGlass.clone();
    islandMetal.metalness = 0.35;
    islandMetal.roughness = 0.45;
    const plateauHeight = PLATEAU_HEIGHT - islandInset;
    const plateau = new Mesh(
      slab(
        squircle(BODY.width - 2 * islandInset, plateauHeight, BODY.radius - islandInset, corner),
        0.13,
        0.05,
      ),
      islandMetal,
    );
    plateau.position.set(0, BODY.height / 2 - islandInset - plateauHeight / 2, -HALF_DEPTH - 0.02);
    back.add(plateau);

    const plateauBottom = BODY.height / 2 - PLATEAU_HEIGHT;
    const cardTop = plateauBottom - 0.16;
    const cardBottom = -BODY.height / 2 + islandInset;
    const card = new Mesh(
      slab(
        squircle(
          BODY.width - 2 * islandInset,
          cardTop - cardBottom,
          BODY.radius - islandInset,
          corner,
        ),
        0.05,
        0.02,
      ),
      frostedGlass,
    );
    card.position.set(0, (cardTop + cardBottom) / 2, -HALF_DEPTH - 0.004);
    back.add(card);

    // Apple logo, polished, in the middle of the glass.
    const logo = this.appleLogo(1.3);
    logo.position.set(0, -1.5, -HALF_DEPTH - 0.032);
    logo.rotation.y = Math.PI;
    back.add(logo);

    const lensTexture = this.lensTexture();
    const lensGlass = new MeshPhysicalMaterial({
      map: lensTexture,
      metalness: 0.1,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    });
    // Camera layout measured from Apple's product photo, in island units: the two left lenses sit
    // in the island's corners (top-left and bottom-left seen from the back), the third between them
    // further in; flash and LiDAR line up with the top and bottom lenses on the far side.
    const islandTop = BODY.height / 2 - islandInset;
    const islandBottom = islandTop - plateauHeight;
    const islandEdge = BODY.width / 2 - islandInset; // lens side, in front-view x
    const outer = 0.92; // lens housing radius
    const margin = 0.1;
    const lensColumn = islandEdge - margin - outer;
    const topLens = islandTop - margin - outer;
    const bottomLens = islandBottom + margin + outer;
    const middleLens = (topLens + bottomLens) / 2;

    // Lens housing: flat-topped ring in the island's colour, not a rounded torus.
    const ringProfile = [
      [0.815, 0.02],
      [0.815, 0.19],
      [0.83, 0.205],
      [outer - 0.015, 0.205],
      [outer, 0.19],
      [outer, 0.02],
    ].map(([r, h]) => new Vector2(r, h));
    const ringGeometry = new LatheGeometry(ringProfile, round);
    const ringMetal = islandMetal.clone();
    ringMetal.metalness = 0.6;
    ringMetal.roughness = 0.35;
    ringMetal.side = DoubleSide;
    const lensGeometry = new CircleGeometry(0.82, round);
    const plateauBack = -HALF_DEPTH - 0.085;
    const lenses: Array<[number, number]> = [
      [lensColumn, topLens],
      [lensColumn, bottomLens],
      [lensColumn - 1.95, middleLens],
    ];
    for (const [x, y] of lenses) {
      const ring = new Mesh(ringGeometry, ringMetal);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y, plateauBack);
      back.add(ring);
      const lens = new Mesh(lensGeometry, lensGlass);
      lens.rotation.y = Math.PI;
      lens.position.set(x, y, plateauBack - 0.17);
      back.add(lens);
    }

    // Flash and LiDAR sit slightly recessed: a dark rim around each suggests the dip.
    const farSide = -islandEdge + 0.9;
    const recess = new MeshBasicMaterial({ color: '#1a0c10', transparent: true, opacity: 0.55 });
    const addRecessed = (radius: number, y: number, material: Material, rimWidth = 0.045): void => {
      const rim = new Mesh(new RingGeometry(radius, radius + rimWidth, round), recess);
      rim.rotation.y = Math.PI;
      rim.position.set(farSide, y, plateauBack - 0.003);
      back.add(rim);
      const disc = new Mesh(new CircleGeometry(radius, round), material);
      disc.rotation.y = Math.PI;
      disc.position.set(farSide, y, plateauBack - 0.002);
      back.add(disc);
    };
    addRecessed(
      0.34,
      topLens,
      new MeshPhysicalMaterial({
        color: '#f4efe2',
        roughness: 0.35,
        clearcoat: 1,
        emissive: new Color('#fff2c8'),
        emissiveIntensity: 0.15,
      }),
    );
    addRecessed(
      0.3,
      bottomLens,
      new MeshPhysicalMaterial({ color: '#0d0e10', roughness: 0.12, clearcoat: 1 }),
    );
    // Microphone: centred between flash and LiDAR, recessed like them.
    addRecessed(0.035, middleLens, new MeshBasicMaterial({ color: '#000000' }), 0.018);

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
    // Real iPhone buttons are capsules: fully rounded ends, slightly domed faces.
    const capsule = (length: number, height: number, depth: number): ExtrudeGeometry => {
      const r = height / 2;
      const shape = new Shape();
      shape.moveTo(-length / 2 + r, -r);
      shape.lineTo(length / 2 - r, -r);
      shape.absarc(length / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      shape.lineTo(-length / 2 + r, r);
      shape.absarc(-length / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
      const geometry = new ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: lowPower ? 2 : 4,
        curveSegments: lowPower ? 8 : 16,
      });
      // Length along y, height along z, extruded outwards along x.
      geometry.rotateY(Math.PI / 2);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(-depth / 2, 0, 0);
      return geometry;
    };
    for (const [side, fromTop, length, material] of buttons) {
      const button = new Mesh(capsule(length, 0.26, 0.08), material);
      button.position.set(side * (hw + 0.035), hh - fromTop, 0);
      frame.add(button);
    }
    // Camera Control: a flush sapphire pad in a thin titanium surround.
    const controlSurround = new Mesh(capsule(1.95, 0.34, 0.03), titaniumDark);
    controlSurround.position.set(hw + 0.005, hh - 10.05, 0);
    frame.add(controlSurround);
    const control = new Mesh(
      capsule(1.82, 0.26, 0.04),
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
    const pitch = 0.3;
    const areas: Array<[number, number, number, number]> = [
      [-0.3, 2.25, 11, 3], // board foot, beside the cameras
      [-3.05, 2.3, 9, 2], // strip under the package shields
    ];
    let part = 0;
    for (const [x0, y0, columns, rows] of areas) {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (random() < (lowPower ? 0.7 : 0.4)) continue;
          const w = 0.08 + random() * (pitch - 0.14);
          const h = 0.06 + random() * (pitch - 0.14);
          const depth = 0.03 + (part % 5) * 0.009;
          const smd = new Mesh(new BoxGeometry(w, h, depth), smdMaterials[part % 3]);
          smd.position.set(
            x0 + column * pitch + pitch / 2,
            y0 + row * pitch + pitch / 2,
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
    // One camera module behind each lens on the back.
    for (const [x, y] of lenses) {
      const module = new Mesh(new RoundedBoxGeometry(1.7, 1.7, 0.42, 2, 0.1), cameraBody);
      module.position.set(x, y, -0.08);
      internals.add(module);
      const barrel = new Mesh(new CylinderGeometry(0.62, 0.62, 0.2, round), titaniumDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, y, -0.34);
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
    const screenOutline = offsetOutline(this.outline, -(GLASS_INSET + BEZEL));
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

  /** The Apple logo as a flat polished inlay, `width` units across, centred on the origin. */
  private appleLogo(width: number): Mesh {
    // Apple logo outline (Simple Icons, CC0), 24 x 24 view box.
    const d =
      'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
    const svg = new SVGLoader().parse(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}"/></svg>`,
    );
    const shapes = svg.paths.flatMap((path) => path.toShapes());
    const geometry = new ShapeGeometry(shapes, 12);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const scale = width / (box.max.x - box.min.x);
    geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, 0);
    // SVG y runs down; flip it so the logo stands upright.
    geometry.scale(scale, -scale, 1);
    const material = new MeshPhysicalMaterial({
      // Polished, but tinted by the finish like in Apple's photos rather than a grey mirror.
      color: '#74404c',
      metalness: 0.15,
      roughness: 0.3,
      envMapIntensity: 0.25,
      side: DoubleSide,
    });
    return new Mesh(geometry, material);
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
