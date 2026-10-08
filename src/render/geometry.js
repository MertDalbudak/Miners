/*
  Procedural geometry: rounded blocks, rocks, crystals and a small merge
  utility so models built from many primitives render with few draw calls.

  Geometry here is plain data: { positions, normals, uvs, indices }.
*/

import * as pc from 'playcanvas';
import { Rng } from '../core/rng.js';

const tmpV = new pc.Vec3();
const tmpN = new pc.Vec3();

export function geo() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

// Wrap a PlayCanvas Geometry class (BoxGeometry etc.) as plain data
export function fromPc(geometry) {
  return {
    positions: Array.from(geometry.positions),
    normals: Array.from(geometry.normals),
    uvs: Array.from(geometry.uvs),
    indices: Array.from(geometry.indices)
  };
}

export const prim = {
  box: (hx, hy, hz) => fromPc(new pc.BoxGeometry({ halfExtents: new pc.Vec3(hx, hy, hz) })),
  sphere: (radius, lat = 12, lon = 16) => fromPc(new pc.SphereGeometry({ radius, latitudeBands: lat, longitudeBands: lon })),
  cylinder: (radius, height, segs = 12) => fromPc(new pc.CylinderGeometry({ radius, height, capSegments: segs, heightSegments: 1 })),
  cone: (baseRadius, peakRadius, height, segs = 12) =>
    fromPc(new pc.ConeGeometry({ baseRadius, peakRadius, height, capSegments: segs, heightSegments: 1 })),
  capsule: (radius, height, sides = 12) => fromPc(new pc.CapsuleGeometry({ radius, height, sides, heightSegments: 1 })),
  torus: (tubeRadius, ringRadius, segments = 16, sides = 8, sectorAngle = 360) =>
    fromPc(new pc.TorusGeometry({ tubeRadius, ringRadius, segments, sides, sectorAngle })),
  plane: (hx, hz) => fromPc(new pc.PlaneGeometry({ halfExtents: new pc.Vec2(hx, hz) }))
};

// Append geometry `g` to `target`, transformed by `mat` (pc.Mat4)
export function append(target, g, mat = null) {
  const base = target.positions.length / 3;
  const normalMat = mat ? new pc.Mat3().invertMat4(mat).transpose() : null;
  for (let i = 0; i < g.positions.length; i += 3) {
    tmpV.set(g.positions[i], g.positions[i + 1], g.positions[i + 2]);
    tmpN.set(g.normals[i], g.normals[i + 1], g.normals[i + 2]);
    if (mat) {
      mat.transformPoint(tmpV, tmpV);
      normalMat.transformVector(tmpN, tmpN).normalize();
    }
    target.positions.push(tmpV.x, tmpV.y, tmpV.z);
    target.normals.push(tmpN.x, tmpN.y, tmpN.z);
  }
  if (g.uvs && g.uvs.length) {
    for (let i = 0; i < g.uvs.length; i++) target.uvs.push(g.uvs[i]);
  } else {
    for (let i = 0; i < g.positions.length / 3; i++) target.uvs.push(0, 0);
  }
  for (let i = 0; i < g.indices.length; i++) target.indices.push(g.indices[i] + base);
  return target;
}

export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new pc.Mat4().setTRS(new pc.Vec3(x, y, z), new pc.Quat().setFromEulerAngles(rx, ry, rz), new pc.Vec3(sx, sy, sz));
}

export function merge(parts) {
  const out = geo();
  for (const [g, mat] of parts) append(out, g, mat);
  return out;
}

export function toMesh(device, g, { tangents = false } = {}) {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(g.positions);
  mesh.setNormals(g.normals);
  if (g.uvs && g.uvs.length) mesh.setUvs(0, g.uvs);
  if (tangents) {
    mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(g.positions, g.normals, g.uvs, g.indices), 4);
  }
  mesh.setIndices(g.indices.length > 65535 ? new Uint32Array(g.indices) : g.indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  // Meshes are shared between entities that come and go (monsters, falling
  // boulders). PlayCanvas frees a mesh when its last mesh instance is destroyed,
  // so hold one reference for the lifetime of the game.
  mesh.incRefCount();
  return mesh;
}

// Convert to flat shading: every triangle gets its own vertices and normal
export function flatten(g) {
  const out = geo();
  const p = g.positions;
  const a = new pc.Vec3();
  const b = new pc.Vec3();
  const c = new pc.Vec3();
  const e1 = new pc.Vec3();
  const e2 = new pc.Vec3();
  const n = new pc.Vec3();
  for (let i = 0; i < g.indices.length; i += 3) {
    const ia = g.indices[i];
    const ib = g.indices[i + 1];
    const ic = g.indices[i + 2];
    a.set(p[ia * 3], p[ia * 3 + 1], p[ia * 3 + 2]);
    b.set(p[ib * 3], p[ib * 3 + 1], p[ib * 3 + 2]);
    c.set(p[ic * 3], p[ic * 3 + 1], p[ic * 3 + 2]);
    e1.sub2(b, a);
    e2.sub2(c, a);
    n.cross(e1, e2).normalize();
    const base = out.positions.length / 3;
    for (const [v, idx] of [[a, ia], [b, ib], [c, ic]]) {
      out.positions.push(v.x, v.y, v.z);
      out.normals.push(n.x, n.y, n.z);
      out.uvs.push(g.uvs[idx * 2] ?? 0, g.uvs[idx * 2 + 1] ?? 0);
    }
    out.indices.push(base, base + 1, base + 2);
  }
  return out;
}

/*
  Rounded cube centered at the origin. Vertices are distributed so the bevel
  is an even arc: on each face, coordinates near the edge are placed at
  (h - r) + r * tan(angle).
*/
export function roundedBox(half = 0.49, radius = 0.1, arcSteps = 3) {
  const flat = half - radius;
  const coords = [];
  for (let i = arcSteps; i >= 1; i--) coords.push(-(flat + radius * Math.tan((i / arcSteps) * Math.PI / 4)));
  coords.push(-flat, flat);
  for (let i = 1; i <= arcSteps; i++) coords.push(flat + radius * Math.tan((i / arcSteps) * Math.PI / 4));
  const n = coords.length;
  const g = geo();

  // face: normal axis, sign, u axis, v axis (v grows downwards in texture space)
  const faces = [
    { axis: 2, sign: 1, u: [0, 1], v: [1, -1] },   // +z front
    { axis: 2, sign: -1, u: [0, -1], v: [1, -1] }, // -z back
    { axis: 0, sign: 1, u: [2, -1], v: [1, -1] },  // +x right
    { axis: 0, sign: -1, u: [2, 1], v: [1, -1] },  // -x left
    { axis: 1, sign: 1, u: [0, 1], v: [2, 1] },    // +y top
    { axis: 1, sign: -1, u: [0, 1], v: [2, -1] }   // -y bottom
  ];

  const p = [0, 0, 0];
  for (const f of faces) {
    const base = g.positions.length / 3;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        p[f.axis] = f.sign * half;
        p[f.u[0]] = coords[i] * f.u[1];
        p[f.v[0]] = coords[j] * f.v[1];
        // clamp to the inner box and push out along the normal
        const qx = Math.max(-flat, Math.min(flat, p[0]));
        const qy = Math.max(-flat, Math.min(flat, p[1]));
        const qz = Math.max(-flat, Math.min(flat, p[2]));
        let nx = p[0] - qx;
        let ny = p[1] - qy;
        let nz = p[2] - qz;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        g.positions.push(qx + nx * radius, qy + ny * radius, qz + nz * radius);
        g.normals.push(nx, ny, nz);
        g.uvs.push((coords[i] + half) / (2 * half), (coords[j] + half) / (2 * half));
      }
    }
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = base + j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        g.indices.push(a, c, b, b, c, d);
      }
    }
  }
  fixWinding(g);
  return g;
}

// Ensure triangles face along their vertex normals (counter-clockwise front faces)
export function fixWinding(g) {
  const p = g.positions;
  const nrm = g.normals;
  for (let i = 0; i < g.indices.length; i += 3) {
    const ia = g.indices[i] * 3;
    const ib = g.indices[i + 1] * 3;
    const ic = g.indices[i + 2] * 3;
    const e1x = p[ib] - p[ia];
    const e1y = p[ib + 1] - p[ia + 1];
    const e1z = p[ib + 2] - p[ia + 2];
    const e2x = p[ic] - p[ia];
    const e2y = p[ic + 1] - p[ia + 1];
    const e2z = p[ic + 2] - p[ia + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const nx = nrm[ia] + nrm[ib] + nrm[ic];
    const ny = nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1];
    const nz = nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2];
    if (cx * nx + cy * ny + cz * nz < 0) {
      const t = g.indices[i + 1];
      g.indices[i + 1] = g.indices[i + 2];
      g.indices[i + 2] = t;
    }
  }
  return g;
}

// Icosphere with random radial jitter - looks like a rock when flat shaded
export function rock(seed, radius = 0.5, detail = 1, jitter = 0.18, squash = [1, 1, 1]) {
  const rng = new Rng(seed);
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map(v => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (cache.has(key)) return cache.get(key);
      const va = verts[a];
      const vb = verts[b];
      const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const l = Math.hypot(...m);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const g = geo();
  for (const v of verts) {
    const s = radius * (1 + rng.float(-jitter, jitter));
    g.positions.push(v[0] * s * squash[0], v[1] * s * squash[1], v[2] * s * squash[2]);
    g.normals.push(v[0], v[1], v[2]);
    g.uvs.push(0.5 + Math.atan2(v[2], v[0]) / (Math.PI * 2), 0.5 - Math.asin(v[1]) / Math.PI);
  }
  for (const f of faces) g.indices.push(f[0], f[1], f[2]);
  fixWinding(g);
  return flatten(g);
}

// Hexagonal crystal standing on the origin, growing along +y
export function crystal(radius = 0.1, length = 0.4, tip = 0.12, sides = 6) {
  const g = geo();
  const ring = (y, r) => {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return out;
  };
  const bottom = ring(0, radius * 0.85);
  const top = ring(length, radius);
  const apex = [0, length + tip, 0];
  const pushTri = (a, b, c) => {
    const base = g.positions.length / 3;
    for (const v of [a, b, c]) {
      g.positions.push(...v);
      g.normals.push(0, 1, 0);
      g.uvs.push(0, 0);
    }
    g.indices.push(base, base + 1, base + 2);
  };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushTri(bottom[i], top[j], top[i]);
    pushTri(bottom[i], bottom[j], top[j]);
    pushTri(top[i], top[j], apex);
  }
  return flatten(orientOutward(g));
}

// Flip triangles that face towards the shape's center (for convex shapes)
function orientOutward(g) {
  const p = g.positions;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = p.length / 3;
  for (let i = 0; i < p.length; i += 3) {
    cx += p[i];
    cy += p[i + 1];
    cz += p[i + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;
  for (let i = 0; i < g.indices.length; i += 3) {
    const ia = g.indices[i] * 3;
    const ib = g.indices[i + 1] * 3;
    const ic = g.indices[i + 2] * 3;
    const e1 = [p[ib] - p[ia], p[ib + 1] - p[ia + 1], p[ib + 2] - p[ia + 2]];
    const e2 = [p[ic] - p[ia], p[ic + 1] - p[ia + 1], p[ic + 2] - p[ia + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const mx = (p[ia] + p[ib] + p[ic]) / 3 - cx;
    const my = (p[ia + 1] + p[ib + 1] + p[ic + 1]) / 3 - cy;
    const mz = (p[ia + 2] + p[ib + 2] + p[ic + 2]) / 3 - cz;
    if (n[0] * mx + n[1] * my + n[2] * mz < 0) {
      const t = g.indices[i + 1];
      g.indices[i + 1] = g.indices[i + 2];
      g.indices[i + 2] = t;
    }
  }
  return g;
}

// Low-poly cone-ish shape used for pine trees and mountains
export function lowCone(radius, height, sides = 7, seed = 1, jitter = 0.15) {
  const rng = new Rng(seed);
  const g = geo();
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const r = radius * (1 + rng.float(-jitter, jitter));
    ring.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  const apex = [rng.float(-0.05, 0.05) * radius, height, rng.float(-0.05, 0.05) * radius];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const base = g.positions.length / 3;
    for (const v of [ring[i], ring[j], apex]) {
      g.positions.push(...v);
      g.normals.push(0, 1, 0);
      g.uvs.push(0, 0);
    }
    g.indices.push(base, base + 1, base + 2);
  }
  return flatten(orientOutward(g));
}
