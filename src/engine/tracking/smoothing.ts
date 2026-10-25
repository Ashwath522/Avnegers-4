/** One-Euro filter (Casiez et al.) — low jitter when still, low lag when moving fast. */
export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(public minCutoff = 1.2, public beta = 0.02, public dCutoff = 1.0) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null) { this.xPrev = x; this.tPrev = tMs; return x; }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuro.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = OneEuro.alpha(cutoff, dt);
    this.xPrev = a * x + (1 - a) * this.xPrev;
    return this.xPrev;
  }

  reset() { this.xPrev = null; this.dxPrev = 0; }
}

/** Bank of filters keyed by string, for x/y/z channels of many landmarks. */
export class FilterBank {
  private map = new Map<string, OneEuro>();
  constructor(public minCutoff = 1.2, public beta = 0.02) {}
  f(key: string, x: number, t: number) {
    let fl = this.map.get(key);
    if (!fl) { fl = new OneEuro(this.minCutoff, this.beta); this.map.set(key, fl); }
    fl.minCutoff = this.minCutoff; fl.beta = this.beta;
    return fl.filter(x, t);
  }
  resetPrefix(prefix: string) { for (const [k, v] of this.map) if (k.startsWith(prefix)) v.reset(); }
  reset() { this.map.clear(); }
}
