import { DESKS } from './company'

export const W = 1000
export const H = 590
export const CELL_W = 90
export const CELL_H = 112
export const CEO = 'ceo'

export interface Room { dept: string; x: number; y: number; w: number; h: number }
export const ROOMS: Room[] = [
  { dept: 'hq', x: 10, y: 10, w: 290, h: 280 },
  { dept: 'product', x: 310, y: 10, w: 380, h: 280 },
  { dept: 'release', x: 700, y: 10, w: 290, h: 280 },
  { dept: 'engineering', x: 10, y: 300, w: 490, h: 280 },
  { dept: 'qa', x: 510, y: 300, w: 480, h: 280 },
]

/** Desk positions are generated from the roster, so editing company.yaml re-seats the office. */
export const POS: Record<string, { x: number; y: number }> = {}
export const ROOM_ROWS: Record<string, number> = {}
for (const r of ROOMS) {
  const ids = [...(r.dept === 'hq' ? [CEO] : []), ...DESKS.filter((d) => d.dept === r.dept).map((d) => d.id)]
  const maxCols = Math.max(1, Math.floor((r.w - 8) / (CELL_W + 2)))
  const rows = Math.ceil(ids.length / maxCols)
  const cols = Math.ceil(ids.length / rows)
  ROOM_ROWS[r.dept] = rows
  ids.forEach((id, i) => {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, ids.length - row * cols)
    const col = i % cols
    const x0 = r.x + (r.w - inRow * (CELL_W + 2)) / 2
    POS[id] = { x: x0 + col * (CELL_W + 2), y: r.y + 38 + row * CELL_H }
  })
}
export const center = (id: string) => ({ x: POS[id].x + CELL_W / 2, y: POS[id].y + 52 })
