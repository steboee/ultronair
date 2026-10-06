import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { Accessory, Tool } from '../model/types'
import { hex, shade } from './iso'

export type Pose = 'sit' | 'stand' | 'walk'
export type Mood = 'calm' | 'focus' | 'happy' | 'sad' | 'worried'
type Anim = 'idle' | 'type' | 'scratch' | 'talk' | 'coffee'

const SKIN = [0xffd9bf, 0xf3c3a0, 0xe0a87e, 0xc58c63, 0xffe3cf]
const HAIR = [0x3b2f2f, 0x6b4a3a, 0xe2b866, 0x2d2d3a, 0xb5523b, 0x8d6e63]
const INK = 0x2b2d42
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif'

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }

/** Small speech / thought bubble with truncated text. */
function bubble(text: string, kind: 'say' | 'think') {
  const c = new Container()
  const t = new Text({ text: text.length > 26 ? text.slice(0, 25) + '…' : text, style: { fontFamily: FONT, fontSize: 11, fontWeight: '700', fill: INK }, resolution: 3 })
  const w = Math.max(40, t.width + 16), h = 22
  const g = new Graphics()
  g.roundRect(-w / 2, -h, w, h, 11).fill(kind === 'think' ? 0xf3efff : 0xffffff).stroke({ width: 1.5, color: kind === 'think' ? 0xb7a6f0 : 0xd5dae6 })
  if (kind === 'say') g.poly([-6, -1, 2, -1, -8, 8]).fill(0xffffff)
  else g.circle(-8, 4, 3.5).circle(-12, 11, 2).fill(0xf3efff).stroke({ width: 1, color: 0xb7a6f0 })
  t.anchor.set(0.5, 0.5); t.position.set(0, -h / 2)
  c.addChild(g, t)
  return c
}

function toolBadge(tool: Tool) {
  const c = new Container()
  const g = new Graphics()
  const col = { terminal: 0x2b2d42, browser: 0x5b8def, file: 0xf6a34a, database: 0x3fb58e }[tool]
  g.roundRect(-12, -12, 24, 24, 8).fill(col).stroke({ width: 2, color: 0xffffff })
  switch (tool) {
    case 'terminal':
      g.poly([-6, -4, -1, 0, -6, 4]).stroke({ width: 2, color: 0xa6e3a1, join: 'round', cap: 'round' })
      g.roundRect(1, 3, 6, 2, 1).fill(0xffffff); break
    case 'browser':
      g.circle(0, 0, 7).stroke({ width: 1.8, color: 0xffffff })
      g.ellipse(0, 0, 3, 7).stroke({ width: 1.4, color: 0xffffff })
      g.poly([-7, 0, 7, 0]).stroke({ width: 1.4, color: 0xffffff }); break
    case 'file':
      g.poly([-5, -7, 2, -7, 6, -3, 6, 7, -5, 7]).fill(0xffffff)
      g.poly([2, -7, 2, -3, 6, -3]).fill(0xffd9a8)
      g.roundRect(-3, 0, 7, 1.6, 0.8).roundRect(-3, 3, 5, 1.6, 0.8).fill(col); break
    case 'database':
      g.ellipse(0, -5, 6, 2.5).fill(0xffffff)
      g.rect(-6, -5, 12, 10).fill(0xffffff)
      g.ellipse(0, 5, 6, 2.5).fill(0xffffff)
      g.ellipse(0, -1, 6, 2.2).stroke({ width: 1, color: col }); break
  }
  c.addChild(g)
  return c
}

function cloud() {
  const c = new Container()
  const g = new Graphics()
  g.circle(-9, 0, 8).circle(0, -5, 10).circle(10, 0, 8).roundRect(-16, -2, 32, 9, 4.5).fill(0x9aa1ad)
  const rain = new Graphics()
  for (let i = 0; i < 4; i++) rain.roundRect(-10 + i * 6.5, 12, 2, 5, 1).fill(0x7fa7d9)
  c.addChild(rain, g)
  ;(c as Container & { rain: Graphics }).rain = rain
  return c as Container & { rain: Graphics }
}

/**
 * A chibi agent: big round head, soft body, stubby arms. Drawn from parts so color,
 * skin, hair and accessory vary per agent. Pure presentation: the scene tells it
 * where to go and how to feel.
 */
export class Character extends Container {
  readonly agentId: string
  /** position in fractional grid tiles */
  gx = 0
  gy = 0
  path: { x: number; y: number }[] = []
  goalKey = ''
  pose: Pose = 'sit'
  anim: Anim = 'idle'
  mood: Mood = 'calm'

  private rig = new Container()
  private shadowG = new Graphics()
  private ring = new Graphics()
  private legs = new Graphics()
  private body = new Graphics()
  private armL = new Container()
  private armR = new Container()
  private head = new Container()
  private face = new Graphics()
  private cup = new Graphics()
  private over = new Container()
  private mark = new Container()
  private transient: { c: Container; born: number; until: number; kind: 'tool' | 'bubble' | 'cloud' }[] = []
  private t = Math.random() * 100
  private faceMood: Mood | '' = ''
  private oneShot?: { kind: 'celebrate' | 'slump'; t0: number; until: number }
  private nextStretch = 4 + Math.random() * 8
  private stretchUntil = 0
  private facing = 1
  selected = false

  constructor(agentId: string, color: string, accessory: Accessory) {
    super()
    this.agentId = agentId
    const h = hash(agentId)
    const skin = SKIN[h % SKIN.length]
    const hair = HAIR[(h >> 3) % HAIR.length]
    const c = hex(color)

    this.shadowG.ellipse(0, 0, 15, 6).fill({ color: 0x2a2f45, alpha: 0.18 })
    this.ring.ellipse(0, 0, 20, 9).stroke({ width: 2.5, color: c })
    this.ring.visible = false

    this.legs.roundRect(-9, -8, 7, 8, 3.5).roundRect(2, -8, 7, 8, 3.5).fill(shade(c, -0.45))
    this.body.roundRect(-12, -30, 24, 25, 11).fill(c)
    this.body.ellipse(0, -14, 7, 6).fill({ color: 0xffffff, alpha: 0.25 })
    for (const [arm, dir] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.addChild(new Graphics().roundRect(-3.5, 0, 7, 13, 3.5).fill(shade(c, -0.12)).circle(0, 13, 3.6).fill(skin))
      arm.position.set(dir * 11, -26)
      arm.rotation = -dir * 0.25
    }
    this.cup.roundRect(-3.5, -4, 7, 7, 2).fill(0xffffff).stroke({ width: 1, color: 0xd5dae6 })
    this.cup.position.set(0, 16)
    this.cup.visible = false
    this.armR.addChild(this.cup)

    // head: big and round
    const skull = new Graphics()
    skull.circle(0, 0, 15).fill(skin)
    skull.ellipse(0, -7, 15.5, 10).fill(hair) // fringe
    skull.circle(-12, -2, 4).circle(12, -2, 4).fill(hair)
    skull.ellipse(-10, 6, 3, 2).ellipse(10, 6, 3, 2).fill({ color: 0xff8fa3, alpha: 0.45 })
    this.head.addChild(skull, this.face, this.accessory(accessory, c))
    this.head.position.set(0, -44)

    this.over.position.set(0, -72)
    this.over.addChild(this.mark)
    this.rig.addChild(this.legs, this.armL, this.armR, this.body, this.head)
    // arms go in front of the body when typing; reorder once so hands show
    this.rig.setChildIndex(this.armL, this.rig.children.length - 1)
    this.rig.setChildIndex(this.armR, this.rig.children.length - 1)
    this.addChild(this.ring, this.shadowG, this.rig, this.over)

    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = new Rectangle(-18, -64, 36, 70)
    this.setMood('calm')
  }

  private accessory(a: Accessory, c: number) {
    const g = new Graphics()
    switch (a) {
      case 'headphones':
        g.arc(0, -2, 16, Math.PI, 0).stroke({ width: 3, color: 0x3b4256 })
        g.roundRect(-19, -4, 6, 10, 3).roundRect(13, -4, 6, 10, 3).fill(shade(c, -0.3)); break
      case 'glasses':
        g.circle(-5, 1, 4.2).circle(5, 1, 4.2).stroke({ width: 1.6, color: INK })
        g.poly([-1, 1, 1, 1]).stroke({ width: 1.4, color: INK }); break
      case 'cap':
        g.ellipse(0, -10, 15, 8).fill(shade(c, -0.2))
        g.ellipse(8, -6, 10, 3).fill(shade(c, -0.35)); break
      case 'bow':
        g.poly([2, -14, 12, -20, 12, -8]).poly([2, -14, -8, -20, -8, -8]).fill(0xff6f91)
        g.circle(2, -14, 3).fill(0xff9fb4); break
      case 'beanie':
        g.ellipse(0, -9, 15.5, 9).fill(shade(c, 0.15))
        g.roundRect(-15, -6, 30, 5, 2.5).fill(shade(c, -0.1))
        g.circle(0, -19, 3.5).fill(0xffffff); break
      case 'antenna':
        g.poly([0, -15, 0, -24]).stroke({ width: 2, color: INK })
        g.circle(0, -26, 3.5).fill(0xffd166); break
    }
    return g
  }

  setMood(m: Mood) {
    if (m === this.faceMood) return
    this.faceMood = m
    const f = this.face.clear()
    if (m === 'happy') {
      f.arc(-5, 2, 2.6, Math.PI, 0).stroke({ width: 2, color: INK, cap: 'round' })
      f.arc(5, 2, 2.6, Math.PI, 0).stroke({ width: 2, color: INK, cap: 'round' })
      f.arc(0, 6, 4, 0, Math.PI).fill(0xc94f63)
    } else {
      const eyeH = m === 'focus' ? 1.6 : 2.6
      f.ellipse(-5, 2, 2, eyeH).ellipse(5, 2, 2, eyeH).fill(INK)
      if (m !== 'focus') f.circle(-4.3, 1, 0.8).circle(5.7, 1, 0.8).fill(0xffffff)
      if (m === 'sad') f.arc(0, 11, 3.5, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 1.8, color: INK, cap: 'round' })
      else if (m === 'worried') {
        f.poly([-8, -3, -3, -4]).poly([8, -3, 3, -4]).stroke({ width: 1.5, color: INK, cap: 'round' })
        f.ellipse(0, 8, 2, 1.6).fill(INK)
      } else f.arc(0, 6, 3, 0.15 * Math.PI, 0.85 * Math.PI).stroke({ width: 1.8, color: INK, cap: 'round' })
    }
  }

  setMark(kind: 'none' | 'blocked') {
    this.mark.removeChildren().forEach((c) => c.destroy())
    if (kind === 'blocked') {
      const g = new Graphics()
      g.circle(0, 0, 10).fill(0xff5d5d).stroke({ width: 2, color: 0xffffff })
      g.roundRect(-1.8, -6, 3.6, 8, 1.8).circle(0, 5, 1.9).fill(0xffffff)
      this.mark.addChild(g)
    }
  }

  private addTransient(c: Container, kind: 'tool' | 'bubble' | 'cloud', secs: number) {
    this.transient.filter((x) => x.kind === kind).forEach((x) => { x.c.destroy({ children: true }); x.until = 0 })
    this.transient = this.transient.filter((x) => x.until > 0)
    c.scale.set(0.01)
    this.over.addChild(c)
    this.transient.push({ c, born: this.t, until: this.t + secs, kind })
  }
  showTool(tool: Tool) { const b = toolBadge(tool); b.position.set(-20, 4); this.addTransient(b, 'tool', 2.4) }
  say(text: string, kind: 'say' | 'think') { const b = bubble(text, kind); b.position.set(16, -2); this.addTransient(b, 'bubble', 3.2) }
  celebrate() { this.oneShot = { kind: 'celebrate', t0: this.t, until: this.t + 1.8 } }
  slump() {
    this.oneShot = { kind: 'slump', t0: this.t, until: this.t + 4 }
    const c = cloud(); c.position.set(0, -4); this.addTransient(c, 'cloud', 4)
  }
  /** head position in local coords, for effects */
  headPoint() { return { x: this.x, y: this.y + this.rig.y - 44 } }

  setSelected(s: boolean) { this.selected = s; this.ring.visible = s }

  /** Per-frame animation. `moving` is set by the scene while following a path. */
  tick(dt: number, moveDx: number) {
    this.t += dt
    const t = this.t
    const rig = this.rig
    const sitting = this.pose === 'sit'
    this.legs.visible = !sitting
    this.cup.visible = this.anim === 'coffee'

    if (Math.abs(moveDx) > 0.001) this.facing = moveDx > 0 ? 1 : -1
    rig.scale.x = this.pose === 'walk' ? this.facing : 1

    // defaults
    let y = sitting ? -14 : 0, rot = 0, aL = 0.25, aR = -0.25, headY = -44, headRot = 0
    let mood: Mood = this.mood

    if (this.pose === 'walk') {
      y = -Math.abs(Math.sin(t * 11)) * 2.5
      this.legs.y = Math.sin(t * 11) * 1.5
      aL = Math.sin(t * 11) * 0.5; aR = -Math.sin(t * 11) * 0.5
    } else switch (this.anim) {
      case 'type':
        aL = -0.75 + Math.sin(t * 22) * 0.18; aR = 0.75 + Math.sin(t * 22 + 1.7) * 0.18
        headRot = Math.sin(t * 1.3) * 0.03; headY += Math.sin(t * 11) * 0.4
        mood = 'focus'; break
      case 'scratch':
        aR = 2.5 + Math.sin(t * 14) * 0.25; aL = 0.2
        headRot = Math.sin(t * 2) * 0.08; mood = 'worried'; break
      case 'talk':
        aL = -0.5 + Math.sin(t * 3) * 0.35; aR = 0.4 + Math.sin(t * 2.4 + 1) * 0.3
        headRot = Math.sin(t * 2) * 0.05; break
      case 'coffee':
        aR = 1.3; headRot = Math.sin(t * 1.5) * 0.04; mood = 'happy'; break
      default: // idle: lean back, breathe, stretch now and then
        if (sitting) rot = -0.05
        y += Math.sin(t * 2) * 0.6
        if (t > this.nextStretch) { this.stretchUntil = t + 1.3; this.nextStretch = t + 7 + Math.random() * 10 }
        if (t < this.stretchUntil) { aL = 2.7; aR = -2.7; mood = 'happy' }
    }

    if (this.oneShot) {
      const k = (t - this.oneShot.t0) / (this.oneShot.until - this.oneShot.t0)
      if (k >= 1) this.oneShot = undefined
      else if (this.oneShot.kind === 'celebrate') {
        y -= Math.abs(Math.sin(k * Math.PI * 3)) * 16
        aL = 2.6; aR = -2.6; mood = 'happy'
      } else {
        rot = 0.1; headY += 3; headRot = 0.18; aL = 0.05; aR = -0.05; mood = 'sad'
      }
    }

    // ease toward targets so pose changes never pop
    const e = Math.min(1, dt * 14)
    rig.y += (y - rig.y) * (this.pose === 'walk' || this.oneShot ? 1 : e)
    rig.rotation += (rot - rig.rotation) * e
    this.armL.rotation += (aL - this.armL.rotation) * e
    this.armR.rotation += (aR - this.armR.rotation) * e
    this.head.y += (headY - this.head.y) * e
    this.head.rotation += (headRot - this.head.rotation) * e
    this.setMood(mood)
    this.shadowG.scale.set(1 + Math.min(0, rig.y + (sitting ? 14 : 0)) / 40)
    this.over.y = -72 + rig.y
    if (this.ring.visible) this.ring.alpha = 0.6 + Math.sin(t * 4) * 0.4
    this.mark.y = Math.sin(t * 5) * 2

    for (const x of this.transient) {
      const left = x.until - t
      const k = Math.min(1, (t - x.born) / 0.28)
      const pop = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) // ease-out-back
      x.c.scale.set(left < 0.2 ? Math.max(0.01, left * 5) : Math.max(0.01, pop))
      if (x.kind === 'cloud') (x.c as Container & { rain: Graphics }).rain.y = ((t * 20) % 6)
      if (left <= 0) x.c.destroy({ children: true })
    }
    this.transient = this.transient.filter((x) => x.until > t)
  }
}
