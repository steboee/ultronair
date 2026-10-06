import type { Project } from '../model/types'

/** Each project gets a ROOM_W × ROOM_H room on a 4 × 2 grid, with corridors between. */
export const ROOM_W = 10
export const ROOM_H = 9
export const GAP = 2
export const COLS = 4
export const ROWS = 2
export const GRID_W = GAP + COLS * (ROOM_W + GAP)
export const GRID_H = GAP + ROWS * (ROOM_H + GAP)

export interface Tile { x: number; y: number }
export type FurnitureKind = 'desk' | 'coffee' | 'whiteboard' | 'doneboard' | 'plant' | 'table' | 'shelf'
export interface Furniture { kind: FurnitureKind; x: number; y: number; w: number; h: number }

/** Room-local furniture. Coordinates are tiles inside the room (0..ROOM_W-1, 0..ROOM_H-1). */
const DESKS: Tile[] = [{ x: 2, y: 3 }, { x: 5, y: 3 }, { x: 8, y: 3 }, { x: 2, y: 7 }]
const LOCAL: Furniture[] = [
  { kind: 'coffee', x: 0, y: 0, w: 1, h: 1 },
  { kind: 'whiteboard', x: 3, y: 0, w: 2, h: 1 },
  { kind: 'doneboard', x: 6, y: 0, w: 2, h: 1 },
  { kind: 'plant', x: 9, y: 0, w: 1, h: 1 },
  { kind: 'table', x: 5, y: 6, w: 2, h: 1 },
  { kind: 'plant', x: 9, y: 8, w: 1, h: 1 },
  { kind: 'shelf', x: 0, y: 4, w: 1, h: 2 },
]
/** seats around the meeting table (room-local) */
const TABLE_SEATS: Tile[] = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 4, y: 6 }, { x: 7, y: 6 }]

export interface RoomLayout {
  projectId: string
  origin: Tile
  desks: { desk: Tile; seat: Tile }[]
  furniture: Furniture[]
  coffeeSpot: Tile
  tableSeats: Tile[]
  doneBoard: Tile
  center: Tile
}

export class OfficeLayout {
  rooms = new Map<string, RoomLayout>()
  walkable: boolean[] = new Array(GRID_W * GRID_H).fill(true)

  constructor(projects: Project[]) {
    for (const p of projects) {
      const ox = GAP + p.room.col * (ROOM_W + GAP)
      const oy = GAP + p.room.row * (ROOM_H + GAP)
      const at = (t: Tile) => ({ x: ox + t.x, y: oy + t.y })
      const furniture = LOCAL.map((f) => ({ ...f, ...at(f) }))
      const desks = DESKS.map((d) => ({ desk: at(d), seat: at({ x: d.x - 1, y: d.y - 1 }) }))
      for (const f of furniture) for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) this.block(f.x + i, f.y + j)
      for (const d of desks) this.block(d.desk.x, d.desk.y)
      this.rooms.set(p.id, {
        projectId: p.id, origin: { x: ox, y: oy }, desks, furniture,
        coffeeSpot: at({ x: 1, y: 1 }), tableSeats: TABLE_SEATS.map(at), doneBoard: at({ x: 6.5, y: 0 }),
        center: at({ x: (ROOM_W - 1) / 2, y: (ROOM_H - 1) / 2 }),
      })
    }
  }

  private block(x: number, y: number) { this.walkable[y * GRID_W + x] = false }
  isWalkable(x: number, y: number) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && this.walkable[y * GRID_W + x] }

  roomAt(gx: number, gy: number): string | undefined {
    for (const r of this.rooms.values()) {
      if (gx >= r.origin.x - 0.5 && gx < r.origin.x + ROOM_W - 0.5 && gy >= r.origin.y - 0.5 && gy < r.origin.y + ROOM_H - 0.5) return r.projectId
    }
  }

  /** closest walkable tile next to `t` (for standing beside someone's desk) */
  besides(t: Tile): Tile {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (this.isWalkable(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy }
    }
    return t
  }

  /** A* on the tile grid, 4-neighbour. The goal itself may be any tile (e.g. a chair). */
  path(from: Tile, to: Tile): Tile[] {
    const W = GRID_W, start = from.y * W + from.x, goal = to.y * W + to.x
    if (start === goal) return []
    const g = new Map<number, number>([[start, 0]])
    const came = new Map<number, number>()
    const open: number[] = [start]
    const f = new Map<number, number>([[start, 0]])
    const h = (i: number) => Math.abs((i % W) - to.x) + Math.abs(Math.floor(i / W) - to.y)
    let guard = 0
    while (open.length && guard++ < 4000) {
      let bi = 0
      for (let i = 1; i < open.length; i++) if (f.get(open[i])! < f.get(open[bi])!) bi = i
      const cur = open.splice(bi, 1)[0]
      if (cur === goal) {
        const out: Tile[] = []
        for (let c = cur; c !== start; c = came.get(c)!) out.push({ x: c % W, y: Math.floor(c / W) })
        return out.reverse()
      }
      const cx = cur % W, cy = Math.floor(cur / W)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * W + nx
        if (ni !== goal && !this.isWalkable(nx, ny)) continue
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
        const ng = g.get(cur)! + 1
        if (ng < (g.get(ni) ?? Infinity)) {
          came.set(ni, cur); g.set(ni, ng); f.set(ni, ng + h(ni))
          if (!open.includes(ni)) open.push(ni)
        }
      }
    }
    return [to] // no path: step straight there rather than freeze
  }
}
