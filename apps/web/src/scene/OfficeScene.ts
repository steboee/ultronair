import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js'
import type { Agent, OfficeEvent, Project } from '../model/types'
import { onOfficeEvent, useOffice } from '../store/office'
import { Character } from './character'
import type { Pose } from './character'
import { chair, DeskView, DoneBoard, makeFurniture } from './furniture'
import { depth, fromIso, hex, iso, mix, shade } from './iso'
import { GRID_H, GRID_W, OfficeLayout, ROOM_H, ROOM_W } from './layout'
import type { Tile } from './layout'

const WALK_SPEED = 2.6 // tiles per second
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif'

type Anim = Character['anim']
interface Goal { key: string; tile: Tile; pose: Exclude<Pose, 'walk'>; anim: Anim }
interface Seat { seat: Tile; desk: DeskView }
interface Particle { g: Graphics; vx: number; vy: number; vr: number; life: number; max: number }
interface Card { g: Graphics; x0: number; y0: number; x1: number; y1: number; t: number; projectId: string }

/**
 * Renders the office and animates agents from store state.
 * Reads the store every frame (cheap) and listens for one-shot events; never writes
 * agent state, only UI state (selection, hover, focus).
 */
export class OfficeScene {
  private world = new Container()
  private floor = new Container()
  private objects = new Container({ sortableChildren: true })
  private fx = new Container()
  private labels = new Container()
  private layout?: OfficeLayout
  private projectsKey = ''
  private chars = new Map<string, Character>()
  private goals = new Map<string, Goal>()
  private seats = new Map<string, Seat>()
  private desks: DeskView[] = []
  private boards = new Map<string, DoneBoard>()
  private roomItems = new Map<string, Container[]>()
  private trips = new Map<string, { until: number }>()
  private nextTrip = new Map<string, number>()
  private particles: Particle[] = []
  private cards: Card[] = []
  private cam = { x: 0, y: 0, s: 1 }
  private target = { x: 0, y: 0, s: 1 }
  private fitted = true
  private focusN = -1
  private drag?: { x: number; y: number; cx: number; cy: number; moved: boolean }
  private time = 0
  private off: (() => void)[] = []

  constructor(private app: Application) {
    this.world.addChild(this.floor, this.objects, this.labels, this.fx)
    app.stage.addChild(this.world)
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.on('pointerdown', this.onDown)
    app.stage.on('globalpointermove', this.onMove)
    app.stage.on('pointerup', this.onUp)
    app.stage.on('pointerupoutside', this.onUp)
    const wheel = (e: WheelEvent) => this.onWheel(e)
    app.canvas.addEventListener('wheel', wheel, { passive: false })
    const resize = () => { if (this.fitted) this.fit(true) }
    app.renderer.on('resize', resize)
    app.ticker.add(this.update)
    this.off.push(
      () => app.canvas.removeEventListener('wheel', wheel),
      () => app.renderer.off('resize', resize),
      () => app.ticker.remove(this.update),
      onOfficeEvent(this.onEvent),
    )
  }

  destroy() {
    this.off.forEach((f) => f())
    this.app.stage.removeAllListeners()
    this.world.destroy({ children: true })
  }

  // ---------- build ----------
  private build(projects: Project[], agents: Agent[]) {
    this.floor.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.labels.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.chars.clear(); this.seats.clear(); this.desks = []; this.boards.clear(); this.roomItems.clear(); this.goals.clear()
    const layout = (this.layout = new OfficeLayout(projects))
    this.drawFloor(projects, layout)

    for (const p of projects) {
      const room = layout.rooms.get(p.id)!
      const tint = hex(p.color)
      const items: Container[] = []
      const deskViews: DeskView[] = []
      for (const f of room.furniture) {
        const c = makeFurniture(f, tint)
        if (c instanceof DoneBoard) this.boards.set(p.id, c)
        items.push(c); this.objects.addChild(c)
      }
      for (const d of room.desks) {
        const c = makeFurniture({ kind: 'desk', x: d.desk.x, y: d.desk.y, w: 1, h: 1 }, tint) as DeskView
        const ch = chair(tint)
        const sp = iso(d.seat.x, d.seat.y)
        ch.position.set(sp.x, sp.y); ch.zIndex = depth(d.seat.x, d.seat.y) + 10
        deskViews.push(c); this.desks.push(c)
        items.push(c, ch); this.objects.addChild(c, ch)
      }
      this.roomItems.set(p.id, items)
      agents.filter((a) => a.projectId === p.id).forEach((a, i) => {
        const d = room.desks[i % room.desks.length]
        this.seats.set(a.id, { seat: d.seat, desk: deskViews[i % deskViews.length] })
      })
    }
    for (const a of agents) this.addCharacter(a)
    const tasks = Object.values(useOffice.getState().tasks)
    for (const [pid, b] of this.boards) b.setCount(tasks.filter((t) => t.projectId === pid && t.status === 'done').length)
    this.fit(true)
  }

  private addCharacter(a: Agent) {
    const seat = this.seats.get(a.id)
    if (!seat) return
    const ch = new Character(a.id, a.color, a.accessory)
    ch.gx = seat.seat.x; ch.gy = seat.seat.y
    ch.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); useOffice.getState().select(a.id) })
    const hover = (e: FederatedPointerEvent) => useOffice.getState().setHover({ agentId: a.id, x: e.global.x, y: e.global.y })
    ch.on('pointerover', hover).on('pointermove', hover).on('pointerout', () => useOffice.getState().setHover(undefined))
    this.chars.set(a.id, ch)
    this.objects.addChild(ch)
  }

  private drawFloor(projects: Project[], layout: OfficeLayout) {
    const g = new Graphics()
    const W = (gx: number, gy: number, z = 0) => { const p = iso(gx, gy); return [p.x, p.y - z] }
    const quad = (x0: number, y0: number, x1: number, y1: number) => [...W(x0, y0), ...W(x1, y0), ...W(x1, y1), ...W(x0, y1)]
    const L = -0.5, R = GRID_W - 0.5, B = GRID_H - 0.5
    // platform thickness
    g.poly([...W(L, B), ...W(R, B), ...W(R, B, -14), ...W(L, B, -14)]).fill(0xcfc5b4)
    g.poly([...W(R, L), ...W(R, B), ...W(R, B, -14), ...W(R, L, -14)]).fill(0xb9ae9c)
    g.poly(quad(L, L, R, B)).fill(0xf1ece3)
    // corridor checker
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++)
      if ((x + y) % 2) g.poly(quad(x - 0.5, y - 0.5, x + 0.5, y + 0.5)).fill(0xebe4d8)

    for (const p of projects) {
      const r = layout.rooms.get(p.id)!
      const c = hex(p.color)
      const ox = r.origin.x, oy = r.origin.y
      const base = mix(0xf8f4ee, c, 0.2), alt = mix(0xf8f4ee, c, 0.27)
      // a raised, rounded-looking room platform
      g.poly([...W(ox - 0.5, oy + ROOM_H - 0.5), ...W(ox + ROOM_W - 0.5, oy + ROOM_H - 0.5), ...W(ox + ROOM_W - 0.5, oy + ROOM_H - 0.5, -5), ...W(ox - 0.5, oy + ROOM_H - 0.5, -5)]).fill(shade(base, -0.12))
      g.poly([...W(ox + ROOM_W - 0.5, oy - 0.5), ...W(ox + ROOM_W - 0.5, oy + ROOM_H - 0.5), ...W(ox + ROOM_W - 0.5, oy + ROOM_H - 0.5, -5), ...W(ox + ROOM_W - 0.5, oy - 0.5, -5)]).fill(shade(base, -0.2))
      for (let x = 0; x < ROOM_W; x++) for (let y = 0; y < ROOM_H; y++)
        g.poly(quad(ox + x - 0.5, oy + y - 0.5, ox + x + 0.5, oy + y + 0.5)).fill((x + y) % 2 ? alt : base)
      g.poly(quad(ox - 0.5, oy - 0.5, ox + ROOM_W - 0.5, oy + ROOM_H - 0.5)).stroke({ width: 2, color: shade(c, -0.05), alpha: 0.7 })
      // back walls (low, so nothing hides behind them)
      g.poly([...W(ox - 0.5, oy - 0.5), ...W(ox + ROOM_W - 0.5, oy - 0.5), ...W(ox + ROOM_W - 0.5, oy - 0.5, 26), ...W(ox - 0.5, oy - 0.5, 26)]).fill(shade(base, 0.35))
      g.poly([...W(ox - 0.5, oy - 0.5), ...W(ox - 0.5, oy + ROOM_H - 0.5), ...W(ox - 0.5, oy + ROOM_H - 0.5, 26), ...W(ox - 0.5, oy - 0.5, 26)]).fill(shade(base, 0.2))
      g.poly([...W(ox - 0.5, oy - 0.5, 26), ...W(ox + ROOM_W - 0.5, oy - 0.5, 26)]).stroke({ width: 3, color: c })
      g.poly([...W(ox - 0.5, oy - 0.5, 26), ...W(ox - 0.5, oy + ROOM_H - 0.5, 26)]).stroke({ width: 3, color: c })
      // rug under the meeting table
      g.poly(quad(ox + 3.6, oy + 4.6, ox + 7.4, oy + 7.4)).fill({ color: shade(c, 0.35), alpha: 0.9 })
      g.poly(quad(ox + 3.8, oy + 4.8, ox + 7.2, oy + 7.2)).stroke({ width: 1.5, color: shade(c, 0.1), alpha: 0.8 })
      // daylight from the windows
      for (const k of [1.5, 4.5, 7.5])
        g.poly([...W(ox + k, oy - 0.4), ...W(ox + k + 1.2, oy - 0.4), ...W(ox + k + 2.4, oy + 3.5), ...W(ox + k + 1.2, oy + 3.5)]).fill({ color: 0xffffff, alpha: 0.16 })

      // room name sign floating over the back corner, above everything
      const label = new Container()
      const t = new Text({ text: p.name, style: { fontFamily: FONT, fontSize: 15, fontWeight: '800', fill: 0xffffff }, resolution: 3 })
      t.anchor.set(0.5)
      const bg = new Graphics().roundRect(-t.width / 2 - 12, -14, t.width + 24, 28, 14).fill(c).stroke({ width: 3, color: 0xffffff })
      label.addChild(bg, t)
      const lp = iso(ox - 0.5, oy - 0.5)
      label.position.set(lp.x, lp.y - 44)
      this.labels.addChild(label)
    }
    this.floor.addChildAt(g, 0)
  }

  // ---------- behaviour ----------
  private goalFor(a: Agent, all: Record<string, Agent>): Goal {
    const layout = this.layout!
    const seat = this.seats.get(a.id)!.seat
    const room = layout.rooms.get(a.projectId)!
    const atSeat = (anim: Anim): Goal => ({ key: 'seat', tile: seat, pose: 'sit', anim })
    const tableSpot = (i: number): Goal => ({ key: 'table', tile: room.tableSeats[i % room.tableSeats.length], pose: 'stand', anim: 'talk' })
    const index = Object.values(all).filter((x) => x.projectId === a.projectId).findIndex((x) => x.id === a.id)
    if (a.status !== 'idle') this.trips.delete(a.id)
    switch (a.status) {
      case 'working': return atSeat('type')
      case 'blocked': {
        const other = a.waitingOn && this.seats.get(a.waitingOn)
        if (other) { const t = layout.besides(other.seat); return { key: `visit:${a.waitingOn}:${t.x},${t.y}`, tile: t, pose: 'stand', anim: 'scratch' } }
        return atSeat('scratch')
      }
      case 'review': return tableSpot(index)
      case 'idle': {
        if (Object.values(all).some((x) => x.status === 'review' && x.reviewerId === a.id)) return tableSpot(index + 3)
        if (a.taskId) return atSeat('idle')
        if (this.trips.has(a.id)) return { key: 'coffee', tile: room.coffeeSpot, pose: 'stand', anim: 'coffee' }
        return atSeat('idle')
      }
    }
  }

  private update = (ticker: { deltaMS: number }) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000)
    this.time += dt
    const s = useOffice.getState()
    const projects = Object.values(s.projects)
    const key = projects.map((p) => p.id + p.room.col + p.room.row).join('|') + '#' + Object.keys(s.agents).join(',')
    if (key !== this.projectsKey) { this.projectsKey = key; this.build(projects, Object.values(s.agents)) }
    if (!this.layout) return
    if (s.focus.n !== this.focusN) { this.focusN = s.focus.n; s.focus.projectId ? this.focusRoom(s.focus.projectId) : this.fit() }

    for (const d of this.desks) d.setMode('off')
    for (const a of Object.values(s.agents)) {
      const ch = this.chars.get(a.id)
      if (!ch) continue
      const goal = this.goalFor(a, s.agents)
      const prev = this.goals.get(a.id)
      if (!prev || prev.key !== goal.key) {
        this.goals.set(a.id, goal)
        ch.path = this.layout.path({ x: Math.round(ch.gx), y: Math.round(ch.gy) }, goal.tile)
        if (ch.path.length) { const last = ch.path[ch.path.length - 1]; if (last.x !== goal.tile.x || last.y !== goal.tile.y) ch.path.push(goal.tile) }
      }
      let screenDx = 0
      if (ch.path.length) {
        const n = ch.path[0]
        const dx = n.x - ch.gx, dy = n.y - ch.gy, dist = Math.hypot(dx, dy), step = WALK_SPEED * dt
        if (dist <= step) { ch.gx = n.x; ch.gy = n.y; ch.path.shift() } else { ch.gx += (dx / dist) * step; ch.gy += (dy / dist) * step }
        screenDx = dx - dy
      }
      const arrived = ch.path.length === 0
      ch.pose = arrived ? goal.pose : 'walk'
      ch.anim = arrived ? goal.anim : 'idle'
      ch.setMark(a.status === 'blocked' ? 'blocked' : 'none')

      // idle coffee runs
      if (a.status === 'idle' && !a.taskId) {
        const trip = this.trips.get(a.id)
        if (!trip && arrived && goal.key === 'seat' && this.time > (this.nextTrip.get(a.id) ?? (this.nextTrip.set(a.id, this.time + 5 + Math.random() * 20), Infinity))) {
          this.nextTrip.set(a.id, this.time + 15 + Math.random() * 25)
          if (Math.random() < 0.45) this.trips.set(a.id, { until: Infinity })
        } else if (trip && arrived && goal.key === 'coffee') {
          if (trip.until === Infinity) trip.until = this.time + 3 + Math.random() * 2
          else if (this.time > trip.until) this.trips.delete(a.id)
        }
      }

      const seat = this.seats.get(a.id)!
      if (arrived && goal.key === 'seat') seat.desk.setMode(a.status === 'working' ? 'code' : a.status === 'blocked' ? 'alert' : 'idle')

      const p = iso(ch.gx, ch.gy)
      ch.position.set(p.x, p.y)
      ch.zIndex = depth(ch.gx, ch.gy) + 50
      ch.setSelected(s.selectedAgentId === a.id)
      const dim = s.filterProjectId && s.filterProjectId !== a.projectId
      ch.alpha += ((dim ? 0.3 : 1) - ch.alpha) * Math.min(1, dt * 8)
      ch.tick(dt, screenDx)
    }
    for (const d of this.desks) d.update(dt)
    for (const [pid, items] of this.roomItems) {
      const a = s.filterProjectId && s.filterProjectId !== pid ? 0.35 : 1
      for (const it of items) it.alpha += (a - it.alpha) * Math.min(1, dt * 8)
    }
    this.stepEffects(dt)
    this.stepCamera(dt)
  }

  // ---------- one-shot events ----------
  private onEvent = (e: OfficeEvent) => {
    const ch = this.chars.get(e.agentId)
    if (!ch) return
    switch (e.type) {
      case 'tool_call': ch.showTool(e.payload.tool); break
      case 'message': ch.say(e.payload.text, e.payload.kind ?? 'say'); break
      case 'failed': ch.slump(); break
      case 'completed': {
        ch.celebrate()
        const h = ch.headPoint()
        this.confetti(h.x, h.y - 10)
        const a = useOffice.getState().agents[e.agentId]
        const board = a && this.boards.get(a.projectId)
        if (board) {
          const l = board.landing()
          const card = new Graphics()
          card.roundRect(-9, -7, 18, 14, 3).fill(0xffffff).stroke({ width: 1.5, color: 0xd5dae6 })
          card.roundRect(-9, -7, 18, 4, 2).fill(hex(useOffice.getState().projects[a.projectId].color))
          this.fx.addChild(card)
          this.cards.push({ g: card, x0: h.x, y0: h.y - 30, x1: board.x + l.x, y1: board.y + l.y, t: 0, projectId: a.projectId })
        }
        break
      }
    }
  }

  private confetti(x: number, y: number) {
    const colors = [0xff6f91, 0xffd166, 0x66c2a5, 0x7aa2ff, 0xc792ea, 0xff9e7a]
    for (let i = 0; i < 28; i++) {
      const g = new Graphics().roundRect(-2.5, -1.5, 5, 3, 1).fill(colors[i % colors.length])
      g.position.set(x, y)
      this.fx.addChild(g)
      this.particles.push({ g, vx: (Math.random() - 0.5) * 200, vy: -140 - Math.random() * 140, vr: (Math.random() - 0.5) * 12, life: 0, max: 1.1 + Math.random() * 0.5 })
    }
  }

  private stepEffects(dt: number) {
    for (const p of this.particles) {
      p.life += dt; p.vy += 420 * dt
      p.g.x += p.vx * dt; p.g.y += p.vy * dt; p.g.rotation += p.vr * dt
      p.g.alpha = Math.max(0, 1 - Math.max(0, p.life - p.max * 0.6) / (p.max * 0.4))
      if (p.life >= p.max) p.g.destroy()
    }
    this.particles = this.particles.filter((p) => p.life < p.max)
    for (const c of this.cards) {
      c.t += dt / 1.1
      const k = Math.min(1, c.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const mx = (c.x0 + c.x1) / 2, my = Math.min(c.y0, c.y1) - 90
      c.g.x = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * mx + e * e * c.x1
      c.g.y = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * my + e * e * c.y1
      c.g.rotation = Math.sin(k * Math.PI) * 0.6
      c.g.scale.set(1 + Math.sin(k * Math.PI) * 0.4 - k * 0.3)
      if (k >= 1) {
        c.g.destroy()
        const done = Object.values(useOffice.getState().tasks).filter((t) => t.projectId === c.projectId && t.status === 'done').length
        this.boards.get(c.projectId)?.setCount(done)
      }
    }
    this.cards = this.cards.filter((c) => c.t < 1)
  }

  // ---------- camera ----------
  private bounds() {
    const pts = [iso(-0.5, -0.5), iso(GRID_W - 0.5, -0.5), iso(-0.5, GRID_H - 0.5), iso(GRID_W - 0.5, GRID_H - 0.5)]
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - 80, y1: Math.max(...ys) + 40 }
  }
  private fitScale() {
    const b = this.bounds(), sw = this.app.screen.width, sh = this.app.screen.height
    return Math.min(sw / (b.x1 - b.x0), sh / (b.y1 - b.y0)) * 0.96
  }
  fit(instant = false) {
    const b = this.bounds(), s = this.fitScale()
    this.target = { s, x: this.app.screen.width / 2 - ((b.x0 + b.x1) / 2) * s, y: this.app.screen.height / 2 - ((b.y0 + b.y1) / 2) * s }
    if (instant) this.cam = { ...this.target }
    this.fitted = true
  }
  private focusRoom(id: string) {
    const r = this.layout?.rooms.get(id)
    if (!r) return
    const p = iso(r.center.x, r.center.y)
    const s = Math.min(1.6, Math.max(this.fitScale() * 2.4, 0.7))
    this.target = { s, x: this.app.screen.width / 2 - p.x * s, y: this.app.screen.height / 2 - (p.y - 30) * s }
    this.fitted = false
  }
  private stepCamera(dt: number) {
    const k = this.drag?.moved ? 1 : 1 - Math.exp(-dt * 7)
    this.cam.x += (this.target.x - this.cam.x) * k
    this.cam.y += (this.target.y - this.cam.y) * k
    this.cam.s += (this.target.s - this.cam.s) * k
    this.world.position.set(this.cam.x, this.cam.y)
    this.world.scale.set(this.cam.s)
  }

  private onDown = (e: FederatedPointerEvent) => {
    this.drag = { x: e.global.x, y: e.global.y, cx: this.target.x, cy: this.target.y, moved: false }
  }
  private onMove = (e: FederatedPointerEvent) => {
    const d = this.drag
    if (!d) return
    const dx = e.global.x - d.x, dy = e.global.y - d.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    this.target.x = this.cam.x = d.cx + dx
    this.target.y = this.cam.y = d.cy + dy
    this.target.s = this.cam.s
    this.fitted = false
    this.app.canvas.style.cursor = 'grabbing'
  }
  private onUp = (e: FederatedPointerEvent) => {
    const d = this.drag
    this.drag = undefined
    this.app.canvas.style.cursor = ''
    if (!d || d.moved || !this.layout || e.target instanceof Character) return
    const w = this.world.toLocal(e.global)
    const g = fromIso(w.x, w.y)
    const room = this.layout.roomAt(g.gx, g.gy)
    if (room) useOffice.getState().focusRoom(room)
  }
  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const r = this.app.canvas.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const fs = this.fitScale()
    const ns = Math.min(3, Math.max(fs * 0.7, this.target.s * Math.exp(-e.deltaY * 0.0015)))
    const wx = (mx - this.target.x) / this.target.s, wy = (my - this.target.y) / this.target.s
    this.target = { s: ns, x: mx - wx * ns, y: my - wy * ns }
    this.fitted = false
  }
}
