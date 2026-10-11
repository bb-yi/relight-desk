export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function normalizeDepth(raw: Float32Array, invert = false, range?: [number, number]) {
  let low = range?.[0] ?? Infinity, high = range?.[1] ?? -Infinity;
  if (!range) for (const v of raw) if (Number.isFinite(v)) { low = Math.min(low, v); high = Math.max(high, v); }
  const out = new Float32Array(raw.length), span = high - low;
  for (let i = 0; i < out.length; i++) {
    const v = Number.isFinite(raw[i]) && span > 1e-8 ? clamp((raw[i] - low) / span) : 0;
    out[i] = invert ? 1 - v : v;
  }
  return out;
}
// Bottom-left UV convention, while file arrays are top-down. Used by regression fixtures.
export function heightNormal(depth: Float32Array, w: number, h: number, x: number, y: number, amplitude = 1) {
  const at = (xx: number, yy: number) => depth[clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)];
  const dx = (at(x + 1, y) - at(x - 1, y)) * amplitude * h / 4;
  const dy = (at(x, y - 1) - at(x, y + 1)) * amplitude * h / 4;
  const len = Math.hypot(dx, dy, 1);
  return [-dx / len, -dy / len, 1 / len];
}
export function visibility(heightAt: (x: number, y: number) => number | null, p: number[], light: number[], steps = 96, bias = .005) {
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = p[0] + (light[0] - p[0]) * t, y = p[1] + (light[1] - p[1]) * t;
    const h = heightAt(x, y);
    if (h !== null && h > p[2] + (light[2] - p[2]) * t + bias) return 0;
  }
  return 1;
}
/** Image-relative coordinates deliberately remain unclamped at the image edges. */
export function lightPositionFromUV(u: number, v: number, aspect: number): [number, number] {
  return [clamp((u * 2 - 1) * aspect, -100, 100), clamp(1 - v * 2, -100, 100)];
}
