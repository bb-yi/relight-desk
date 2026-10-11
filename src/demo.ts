import type { Channels } from './types';
import { clamp } from './math';

// An analytic, orthographic still life. The maps are actual front-surface intersections,
// not a luminance-to-depth trick. The foreground arm can shadow the face and backdrop.
export function createDemo(width = 1024, height = 1536): Channels {
  const color = new Uint8ClampedArray(width * height * 4), depth = new Float32Array(width * height);
  const normal = new Float32Array(width * height * 3), aspect = width / height;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = (2 * (i + .5) / width - 1) * aspect, y = 1 - 2 * (j + .5) / height;
    let z = y < -.64 ? Math.min(.1, (-y - .64) * .22) : 0;
    let n = y < -.64 ? [0, .22 / Math.hypot(.22, 1), 1 / Math.hypot(.22, 1)] : [0, 0, 1];
    let c = y < -.64 ? [162, 148, 125] : [175, 181, 168];
    const grout = y < -.64 && (Math.abs(Math.sin(x * 19)) < .025 || Math.abs(Math.sin((y + .64) * 30)) < .025);
    if (grout) c = c.map(v => v * .78);
    function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, col: number[], angle = 0) {
      const co = Math.cos(angle), si = Math.sin(angle), px = x - cx, py = y - cy;
      const u = co * px + si * py, v = -si * px + co * py;
      const q = 1 - (u / rx) ** 2 - (v / ry) ** 2;
      if (q <= 0) return false;
      const zz = cz + rz * Math.sqrt(q);
      if (zz <= z) return false;
      z = zz; c = col;
      const nx = u / (rx * rx), ny = v / (ry * ry), nz = Math.sqrt(q) / rz;
      const len = Math.hypot(nx, ny, nz);
      n = [(co * nx - si * ny) / len, (si * nx + co * ny) / len, nz / len];
      return true;
    }
    ellipsoid(0, -.41, .055, .37, .34, .15, [45, 87, 94]);
    ellipsoid(-.2, -.39, .06, .2, .18, .15, [52, 104, 111]);
    ellipsoid(.2, -.39, .06, .2, .18, .15, [52, 104, 111]);
    ellipsoid(0, -.12, .1, .09, .23, .16, [213, 161, 126]);
    const hair = ellipsoid(0, .37, .08, .29, .43, .2, [53, 43, 43]);
    if (hair) {
      const str = Math.sin(Math.atan2(x, (y - .37) * .6) * 25 + y * 8);
      c = c.map(v => v + str * 5);
    }
    const face = ellipsoid(.008, .28, .18, .217, .292, .15, [225, 178, 142]);
    if (face) {
      const blush = Math.exp(-((Math.abs(x) - .125) ** 2 / .002 + (y - .22) ** 2 / .002));
      c = [225 + blush * 12, 178 - blush * 18, 142 - blush * 6];
      for (const ex of [-.087, .09]) {
        const eye = ((x - ex) / .044) ** 2 + ((y - .31) / .019) ** 2;
        if (eye < 1) c = [235, 225, 205];
        if (((x - ex - .005) / .014) ** 2 + ((y - .31) / .017) ** 2 < 1) c = [56, 70, 66];
        if (((x - ex) / .005) ** 2 + ((y - .318) / .006) ** 2 < 1) c = [250, 243, 223];
        if (Math.abs(y - (.355 + .1 * (x - ex))) < .006 && Math.abs(x - ex) < .043) c = [75, 55, 46];
      }
      if (Math.abs(y - (.16 + .4 * x * x)) < .004 && Math.abs(x) < .053) c = [151, 79, 70];
    }
    ellipsoid(.007, .251, .294, .029, .057, .06, [225, 174, 136]);
    ellipsoid(-.14, .53, .22, .1, .205, .095, [63, 46, 42], -.52);
    ellipsoid(.145, .535, .2, .095, .22, .1, [58, 43, 41], .55);
    // Near-camera arm crosses below the chin; its top surface sits ahead of the face.
    ellipsoid(.11, -.075, .39, .087, .31, .075, [207, 152, 117], .9);
    ellipsoid(-.113, .078, .4, .107, .056, .06, [225, 173, 135], -.25);
    const k = j * width + i;
    const grain = Math.sin(i * 1.713 + j * 2.18) * .9;
    for (let a = 0; a < 3; a++) { color[k * 4 + a] = clamp(c[a] + grain, 0, 255); normal[k * 3 + a] = n[a]; }
    color[k * 4 + 3] = 255; depth[k] = z / .5;
  }
  return { width, height, color, depth, normal, source: 'demo', name: '静物 01 · 玉色肖像', nameKey: '静物 01 · 玉色肖像' };
}
