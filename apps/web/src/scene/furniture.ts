import { Container, Graphics } from 'pixi.js'
import type { Furniture } from './layout'
import { depth, iso, shade, TH, TW } from './iso'

/** point on an iso box: a along +gx, b along +gy (tile units), z up (px) */
export const P = (a: number, b: number, z = 0) => [(a - b) * (TW / 2), (a + b) * (TH / 2) - z] as const

/** Soft-shaded isometric box (top + the two faces the camera sees). */
export function box(g: Graphics, a0: number, b0: number, a1: number, b1: number, z0: number, z1: number, color: number) {
  const pts = (...p: (readonly [number, number])[]) => p.flatMap((q) => [q[0], q[1]])
  g.poly(pts(P(a0, b1, z1), P(a1, b1, z1), P(a1, b1, z0), P(a0, b1, z0))).fill(shade(color, -0.12))
  g.poly(pts(P(a1, b0, z1), P(a1, b1, z1), P(a1, b1, z0), P(a1, b0, z0))).fill(shade(color, -0.24))
  g.poly(pts(P(a0, b0, z1), P(a1, b0, z1), P(a1, b1, z1), P(a0, b1, z1))).fill(color)
}
export function shadow(g: Graphics, a0: number, b0: number, a1: number, b1: number, grow = 0.12) {
  const pts = [P(a0 - grow, b0 - grow), P(a1 + grow, b0 - grow), P(a1 + grow, b1 + grow), P(a0 - grow, b1 + grow)].flatMap((q) => [q[0], q[1] + 2])
  g.poly(pts).fill({ color: 0x2a2f45, alpha: 0.12 })
}

const WOOD = 0xd9b48a
const WOOD_DARK = 0xb98e64
const METAL = 0x9aa3b5

/** A desk with a camera-facing monitor. The scene drives the screen per frame. */
export class DeskView extends Container {
  private glow = new Graphics()
  private screen = new Graphics()
  private lines = new Container()
  private dots = new Graphics()
  private alert = new Graphics()
  private t = Math.random() * 10
  mode?: 'off' | 'idle' | 'code' | 'alert'

  constructor(tint: number) {
    super()
    const g = new Graphics()
    shadow(g, -0.45, -0.42, 0.45, 0.42)
    // legs + top
    box(g, -0.42, -0.36, -0.34, 0.36, 0, 16, WOOD_DARK)
    box(g, 0.34, -0.36, 0.42, 0.36, 0, 16, WOOD_DARK)
    box(g, -0.46, -0.4, 0.46, 0.4, 16, 21, WOOD)
    // keyboard + mug on the desk top
    box(g, -0.05, 0.08, 0.3, 0.26, 21, 23, 0xeef0f5)
    const [mx, my] = P(-0.3, 0.2, 21)
    g.roundRect(mx - 4, my - 9, 8, 9, 2).fill(shade(tint, -0.1))
    this.addChild(g)

    // monitor faces the camera; the agent sits behind it
    this.glow.roundRect(-26, -62, 52, 42, 14).fill({ color: 0xffffff, alpha: 1 })
    this.glow.alpha = 0
    const frame = new Graphics()
    frame.roundRect(-4, -28, 8, 8, 2).fill(METAL)
    frame.roundRect(-12, -22, 24, 4, 2).fill(METAL)
    frame.roundRect(-20, -56, 40, 30, 5).fill(0x3b4256)
    this.screen.roundRect(-17, -53, 34, 24, 3).fill(0xffffff)
    const mask = new Graphics().roundRect(-17, -53, 34, 24, 3).fill(0xffffff)
    for (let i = 0; i < 12; i++) {
      const l = new Graphics().roundRect(-14 + (i % 3) * 3, 0, 8 + ((i * 7) % 15), 2.2, 1.1).fill(0xffffff)
      l.y = -50 + i * 4.2
      l.tint = [0x8be9fd, 0xffffff, 0xa6e3a1, 0xf9e2af][i % 4]
      this.lines.addChild(l)
    }
    this.lines.mask = mask
    this.dots.circle(-7, -41, 2).circle(0, -41, 2).circle(7, -41, 2).fill(0xffffff)
    this.alert.roundRect(-2, -49, 4, 11, 2).circle(0, -34, 2).fill(0xff6b6b)
    this.addChild(this.glow, frame, this.screen, mask, this.lines, this.dots, this.alert)
    this.setMode('off')
  }

  setMode(m: NonNullable<DeskView['mode']>) {
    if (m === this.mode) return
    this.mode = m
    this.screen.tint = { off: 0x2b3142, idle: 0x3a4a6a, code: 0x1e2a44, alert: 0x4a2630 }[m]
    this.lines.visible = m === 'code'
    this.dots.visible = m === 'idle'
    this.alert.visible = m === 'alert'
    this.glow.tint = m === 'alert' ? 0xff8a8a : 0x8fd3ff
  }

  update(dt: number) {
    this.t += dt
    const targetGlow = this.mode === 'code' ? 0.35 + Math.sin(this.t * 3) * 0.06 : this.mode === 'alert' ? 0.3 + Math.sin(this.t * 6) * 0.15 : 0
    this.glow.alpha += (targetGlow - this.glow.alpha) * Math.min(1, dt * 6)
    if (this.lines.visible) {
      for (const l of this.lines.children) {
        l.y -= dt * 9
        if (l.y < -54) l.y += 12 * 4.2
      }
    }
    if (this.dots.visible) this.dots.alpha = 0.35 + Math.sin(this.t * 2) * 0.25
  }
}

export function chair(tint: number) {
  const g = new Graphics()
  g.ellipse(0, 2, 13, 6).fill({ color: 0x2a2f45, alpha: 0.12 })
  g.roundRect(-2, -10, 4, 10, 2).fill(METAL)
  g.roundRect(-14, -46, 28, 30, 10).fill(shade(tint, -0.25))
  g.ellipse(0, -12, 14, 6).fill(shade(tint, -0.1))
  return g
}

/** Done board: one sticky note per finished task, newest at the end. */
export class DoneBoard extends Container {
  private notes = new Graphics()
  count = -1
  constructor(private accent: number) {
    super()
    const g = new Graphics()
    const face = (z0: number, z1: number, inset = 0) =>
      [P(-0.42 + inset, -0.3, z1 - inset * 30), P(1.42 - inset, -0.3, z1 - inset * 30), P(1.42 - inset, -0.3, z0 + inset * 30), P(-0.42 + inset, -0.3, z0 + inset * 30)].flatMap((p) => [p[0], p[1]])
    g.poly([...P(-0.3, -0.3), ...P(-0.3, -0.3, 22)]).stroke({ width: 3, color: WOOD_DARK })
    g.poly([...P(1.3, -0.3), ...P(1.3, -0.3, 22)]).stroke({ width: 3, color: WOOD_DARK })
    g.poly(face(20, 70)).fill(0x8a6a4a)
    g.poly(face(22, 68, 0.04)).fill(0xc79a6b)
    // header strip in project color
    g.poly([P(-0.38, -0.3, 66), P(1.38, -0.3, 66), P(1.38, -0.3, 58), P(-0.38, -0.3, 58)].flatMap((p) => [p[0], p[1]])).fill(accent)
    this.addChild(g, this.notes)
  }
  setCount(n: number) {
    if (n === this.count) return
    this.count = n
    this.notes.clear()
    const shown = Math.min(n, 12)
    for (let i = 0; i < shown; i++) {
      const col = i % 6, row = Math.floor(i / 6)
      const a = -0.3 + col * 0.28, z = 52 - row * 15
      const pts = [P(a, -0.3, z), P(a + 0.2, -0.3, z), P(a + 0.2, -0.3, z - 11), P(a, -0.3, z - 11)].flatMap((p) => [p[0], p[1]])
      this.notes.poly(pts).fill([0xfff3a3, 0xc8f7c5, 0xffd3e0, 0xcde7ff][i % 4])
    }
    if (n > 12) {
      const [x, y] = P(1.25, -0.3, 30)
      this.notes.circle(x, y, 6).fill(this.accent)
    }
  }
  /** world-space-ish anchor inside this container where a flying card should land */
  landing() { const [x, y] = P(0.5, -0.3, 45); return { x, y } }
}

function whiteboard(tint: number) {
  const g = new Graphics()
  const face = (a0: number, a1: number, z0: number, z1: number) => [P(a0, -0.3, z1), P(a1, -0.3, z1), P(a1, -0.3, z0), P(a0, -0.3, z0)].flatMap((p) => [p[0], p[1]])
  g.poly([...P(-0.3, -0.3), ...P(-0.3, -0.3, 22)]).stroke({ width: 3, color: METAL })
  g.poly([...P(1.3, -0.3), ...P(1.3, -0.3, 22)]).stroke({ width: 3, color: METAL })
  g.poly(face(-0.45, 1.45, 18, 72)).fill(0xc9ced9)
  g.poly(face(-0.4, 1.4, 21, 69)).fill(0xfbfcff)
  const strokes = [[-0.25, 0.6, 60], [-0.25, 0.9, 52], [-0.25, 0.4, 44], [0.75, 1.25, 60], [0.75, 1.1, 48]]
  strokes.forEach(([a0, a1, z], i) => g.poly([...P(a0, -0.3, z), ...P(a1, -0.3, z)]).stroke({ width: 2.5, color: i % 2 ? 0x8aa0c8 : tint, cap: 'round' }))
  // a little diagram
  const [cx, cy] = P(1.0, -0.3, 34)
  g.circle(cx, cy, 6).stroke({ width: 2, color: tint })
  return g
}

function coffee() {
  const g = new Graphics()
  shadow(g, -0.4, -0.4, 0.4, 0.4)
  box(g, -0.36, -0.36, 0.36, 0.36, 0, 18, 0xe7dccb)
  box(g, -0.3, -0.3, 0.3, 0.3, 18, 48, 0x5a5f73)
  const [x, y] = P(0.3, 0.1, 40)
  g.circle(x - 2, y, 2.5).fill(0xff6b6b)
  const [cx, cy] = P(0.15, 0.3, 18)
  g.roundRect(cx - 4, cy - 8, 8, 8, 2).fill(0xffffff)
  return g
}

function plant() {
  const g = new Graphics()
  g.ellipse(0, 4, 14, 6).fill({ color: 0x2a2f45, alpha: 0.12 })
  g.roundRect(-9, -14, 18, 16, 5).fill(0xd98c6a)
  g.roundRect(-10, -16, 20, 5, 2.5).fill(0xe8a283)
  for (const [x, y, r, c] of [[-7, -26, 9, 0x5aa86f], [7, -28, 9, 0x4c9a63], [0, -36, 10, 0x6bbd7e], [-3, -46, 7, 0x7fcf8f], [5, -42, 6, 0x5aa86f]])
    g.circle(x, y, r).fill(c)
  return g
}

function table() {
  const g = new Graphics()
  shadow(g, -0.45, -0.4, 1.45, 0.4)
  box(g, -0.1, -0.1, 0.1, 0.1, 0, 14, WOOD_DARK)
  box(g, 0.9, -0.1, 1.1, 0.1, 0, 14, WOOD_DARK)
  box(g, -0.45, -0.38, 1.45, 0.38, 14, 19, 0xe6c49c)
  const [x, y] = P(0.6, 0, 19)
  g.poly([x - 10, y, x, y - 5, x + 10, y, x, y + 5]).fill(0xffffff)
  const [cx, cy] = P(0.1, 0.1, 19)
  g.roundRect(cx - 3, cy - 7, 6, 7, 2).fill(0x7aa2ff)
  return g
}

function shelf(tint: number) {
  const g = new Graphics()
  shadow(g, -0.4, -0.45, 0.4, 1.45)
  box(g, -0.35, -0.45, 0.35, 1.45, 0, 56, 0xc9a27c)
  // books on the camera-facing side
  const colors = [tint, 0x7aa2ff, 0xffd166, 0x66c2a5, 0xef8fb3, 0xc792ea]
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 7; i++) {
      const b0 = -0.38 + i * 0.26, z = 8 + s * 17
      const pts = [P(0.36, b0, z + 12 - (i % 3) * 2), P(0.36, b0 + 0.2, z + 12 - (i % 3) * 2), P(0.36, b0 + 0.2, z), P(0.36, b0, z)].flatMap((p) => [p[0], p[1]])
      g.poly(pts).fill(colors[(i + s) % colors.length])
    }
  }
  return g
}

/** Build one furniture piece, positioned and depth-sorted. Desks and done boards come back as their classes. */
export function makeFurniture(f: Furniture, tint: number): Container {
  let c: Container
  switch (f.kind) {
    case 'coffee': c = coffee(); break
    case 'whiteboard': c = whiteboard(tint); break
    case 'doneboard': c = new DoneBoard(tint); break
    case 'plant': c = plant(); break
    case 'table': c = table(); break
    case 'shelf': c = shelf(tint); break
    default: c = new DeskView(tint)
  }
  const p = iso(f.x, f.y)
  c.position.set(p.x, p.y)
  // wall-hugging boards sort behind anyone standing in front of them
  c.zIndex = f.kind === 'whiteboard' || f.kind === 'doneboard' ? depth(f.x, f.y) : depth(f.x + f.w - 1, f.y + f.h - 1) + 20
  return c
}
