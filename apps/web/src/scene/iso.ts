/** Isometric math. Grid coords (gx, gy) are tile centers; +gx goes down-right, +gy goes down-left. */
export const TW = 64
export const TH = 32

export const iso = (gx: number, gy: number) => ({ x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) })
export const fromIso = (x: number, y: number) => ({ gx: (x / (TW / 2) + y / (TH / 2)) / 2, gy: (y / (TH / 2) - x / (TW / 2)) / 2 })
/** draw order: further back = smaller */
export const depth = (gx: number, gy: number) => (gx + gy) * 100

export const hex = (c: string) => parseInt(c.replace('#', ''), 16)
export function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}
export const shade = (c: number, t: number) => (t < 0 ? mix(c, 0x1d2233, -t) : mix(c, 0xffffff, t))
