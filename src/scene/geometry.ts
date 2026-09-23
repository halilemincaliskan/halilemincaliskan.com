import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';

/** A point on a closed outline with its outward unit normal. */
export interface OutlinePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Rounded rectangle with "continuous" corners, the way Apple draws them: each corner is a
 * superellipse quadrant, so curvature eases in instead of jumping at the tangent point.
 * Points run counter-clockwise, starting at the bottom edge.
 */
export function squircle(
  width: number,
  height: number,
  radius: number,
  cornerSegments: number,
  exponent = 3.2,
): OutlinePoint[] {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  const corners: Array<[number, number, number]> = [
    [hw - r, -hh + r, -Math.PI / 2],
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
  ];
  const raw: Array<[number, number]> = [];
  const power = 2 / exponent;
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= cornerSegments; i += 1) {
      const angle = start + (i / cornerSegments) * (Math.PI / 2);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      raw.push([
        cx + r * Math.sign(c) * Math.abs(c) ** power,
        cy + r * Math.sign(s) * Math.abs(s) ** power,
      ]);
    }
  }
  const points: OutlinePoint[] = [];
  const count = raw.length;
  for (let i = 0; i < count; i += 1) {
    const [px, py] = raw[(i - 1 + count) % count];
    const [nx, ny] = raw[(i + 1) % count];
    const tx = nx - px;
    const ty = ny - py;
    const length = Math.hypot(tx, ty) || 1;
    points.push({ x: raw[i][0], y: raw[i][1], nx: ty / length, ny: -tx / length });
  }
  return points;
}

/** Moves every point along its normal. Negative distances shrink the outline. */
export function offsetOutline(outline: OutlinePoint[], distance: number): OutlinePoint[] {
  return outline.map((p) => ({
    x: p.x + p.nx * distance,
    y: p.y + p.ny * distance,
    nx: p.nx,
    ny: p.ny,
  }));
}

export function outlineShape(outline: OutlinePoint[]): Shape {
  return new Shape(outline.map((p) => new Vector2(p.x, p.y)));
}

/** One cross-section vertex: `s` is the outward offset from the outline, `z` the depth. */
export interface ProfilePoint {
  s: number;
  z: number;
  ns: number;
  nz: number;
}

/**
 * Sweeps cross-section strips around a closed outline. Each strip is shaded smoothly; separate
 * strips meet at a hard edge. This is how the titanium band gets its flat sides and soft rims.
 */
export function sweepProfile(outline: OutlinePoint[], strips: ProfilePoint[][]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const count = outline.length;
  for (const strip of strips) {
    const base = positions.length / 3;
    for (const p of outline) {
      for (const q of strip) {
        positions.push(p.x + p.nx * q.s, p.y + p.ny * q.s, q.z);
        const nx = p.nx * q.ns;
        const ny = p.ny * q.ns;
        const length = Math.hypot(nx, ny, q.nz) || 1;
        normals.push(nx / length, ny / length, q.nz / length);
      }
    }
    const rows = strip.length;
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      for (let j = 0; j < rows - 1; j += 1) {
        const a = base + i * rows + j;
        const b = base + next * rows + j;
        const c = base + next * rows + j + 1;
        const d = base + i * rows + j + 1;
        indices.push(a, b, d, b, c, d);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Quarter-circle profile points, used for rounded rims on swept shapes. */
export function arc(
  centerS: number,
  centerZ: number,
  radius: number,
  from: number,
  to: number,
  segments: number,
): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = from + ((to - from) * i) / segments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    points.push({ s: centerS + radius * c, z: centerZ + radius * s, ns: c, nz: s });
  }
  return points;
}

/** A slab with a softly rounded edge, centred on z = 0. Used for glass panels and parts. */
export function slab(outline: OutlinePoint[], depth: number, bevel: number): ExtrudeGeometry {
  const inner = bevel > 0 ? offsetOutline(outline, -bevel) : outline;
  const geometry = new ExtrudeGeometry(outlineShape(inner), {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  return geometry;
}

/** Flat face of an outline with UVs spanning its bounding box, for canvas textures. */
export function texturedFace(
  outline: OutlinePoint[],
  width: number,
  height: number,
): ShapeGeometry {
  const geometry = new ShapeGeometry(outlineShape(outline), 1);
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i += 1) {
    uv.push(position.getX(i) / width + 0.5, position.getY(i) / height + 0.5);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}
