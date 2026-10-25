/**
 * Maps normalized video coordinates (0..1, origin top-left, as MediaPipe returns them)
 * into stage world space (pixels, y-up), matching a <video> drawn with object-fit: cover
 * and optionally mirrored.
 */
export interface CoverMap { W: number; H: number; vw: number; vh: number; mirror: boolean }

export function coverParams(m: CoverMap) {
  const s = Math.max(m.W / m.vw, m.H / m.vh);
  const dw = m.vw * s, dh = m.vh * s;
  return { s, dw, dh, ox: (m.W - dw) / 2, oy: (m.H - dh) / 2 };
}

export function mapPoint(m: CoverMap, nx: number, ny: number, nz = 0) {
  const { dw, dh, ox, oy } = coverParams(m);
  const x = m.mirror ? 1 - nx : nx;
  const px = ox + x * dw;
  const pyDown = oy + ny * dh;
  return { x: px, y: m.H - pyDown, z: -nz * dw };
}
