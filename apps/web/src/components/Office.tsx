import { DEPTS, DEPT_VAR, DESKS } from '../company'
import type { Desk } from '../company'
import type { AgentState, Arrow } from '../state'
import { CEO, CELL_H, CELL_W, H, POS, ROOMS, ROOM_ROWS, W, center } from '../layout'
import type { Room } from '../layout'

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const CODE_W = [30, 22, 34, 18, 28, 24, 32, 20]

function Screen({ id, status }: { id: string; status: AgentState['status'] }) {
  const clip = `clip-${id}`
  return (
    <g>
      <clipPath id={clip}><rect x="27" y="43" width="36" height="19" /></clipPath>
      <rect className="scr" x="27" y="43" width="36" height="19" rx="1" />
      {status === 'tool' && (
        <g clipPath={`url(#${clip})`}>
          <g className="code">
            {[...CODE_W, ...CODE_W].map((w, i) => (
              <rect key={i} x={30 + (i % 3) * 3} y={45 + i * 4} width={w * 0.8} height="2" rx="1" />
            ))}
          </g>
        </g>
      )}
      {status === 'thinking' && (
        <g className="dots"><circle cx="38" cy="53" r="2" /><circle cx="45" cy="53" r="2" /><circle cx="52" cy="53" r="2" /></g>
      )}
      {status === 'waiting' && <text x="45" y="58" className="glyph">!</text>}
      {status === 'blocked' && <text x="45" y="58" className="glyph">×</text>}
      {status === 'done' && <path className="tick" d="M37 53l5 5 10-11" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'idle' && <rect className="idle-led" x="43" y="51" width="4" height="2" rx="1" />}
    </g>
  )
}

function DeskView(p: { id: string; name: string; sub: string; dept: string; bot: boolean; a: AgentState; selected: boolean; onSelect: () => void; ceo?: boolean }) {
  const { a } = p
  const c = p.ceo ? 'var(--ceo)' : `var(${DEPT_VAR[p.dept]})`
  return (
    <g
      transform={`translate(${POS[p.id].x},${POS[p.id].y})`}
      className={`dk s-${a.status}${p.bot ? ' bot' : ''}${p.selected ? ' sel' : ''}`}
      style={{ ['--c' as string]: c }}
      tabIndex={0}
      role="button"
      aria-label={`${p.name}: ${a.activity}`}
      onClick={p.onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && p.onSelect()}
    >
      <title>{`${p.name} — ${a.activity}`}</title>
      <rect className="hit" x="0" y="0" width={CELL_W} height="106" rx="8" />
      <rect className="chair" x="30" y="40" width="30" height="16" rx="6" />
      {/* person (or robot for HQ code) sits behind the monitor */}
      <g className="person">
        {p.bot ? (
          <>
            <line x1="45" y1="6" x2="45" y2="11" className="ant" /><circle cx="45" cy="5" r="2" className="led" />
            <rect x="35" y="11" width="20" height="16" rx="3" className="head" />
            <rect x="39" y="16" width="4" height="4" className="eye" /><rect x="47" y="16" width="4" height="4" className="eye" />
            <rect x="30" y="29" width="30" height="14" rx="4" className="body" />
          </>
        ) : (
          <>
            <path d="M28 46c0-10 7-16 17-16s17 6 17 16z" className="body" />
            <circle cx="45" cy="21" r="9" className="head" />
            <path className="hair" d="M36 20a9 9 0 0 1 18 0c-4-4-14-4-18 0z" />
          </>
        )}
      </g>
      {/* status marker over the head */}
      {a.status === 'waiting' && <g className="mark bounce"><circle cx="45" cy="-2" r="7" fill="var(--warn)" /><text x="45" y="2" textAnchor="middle" className="mk">!</text></g>}
      {a.status === 'thinking' && <g className="mark"><circle cx="63" cy="6" r="2" className="tb" /><circle cx="68" cy="1" r="3" className="tb" /><circle cx="76" cy="-6" r="6" className="tb" /></g>}
      {a.status === 'done' && <g className="mark"><circle cx="45" cy="-2" r="7" fill="var(--ok)" /><path d="M41 -2l3 3 5-6" stroke="#07140f" strokeWidth="1.8" fill="none" strokeLinecap="round" /></g>}
      {/* desk, monitor, keyboard */}
      <rect className="desktop" x="6" y="52" width="78" height="34" rx="3" />
      <rect className="mon" x="24" y="40" width="42" height="28" rx="2" />
      <Screen id={p.id} status={a.status} />
      <rect className="stand" x="41" y="68" width="8" height="4" />
      <rect className="kbd" x="32" y="75" width="26" height="6" rx="1" />
      {p.ceo && <rect className="mug" x="68" y="62" width="7" height="8" rx="1" />}
      <text x={CELL_W / 2} y="98" textAnchor="middle" className="nm">{p.name}</text>
      <text x={CELL_W / 2} y="109" textAnchor="middle" className="ac">{cut(a.activity, 17)}</text>
    </g>
  )
}

function Plant({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x},${y})`}><circle r="9" className="leaf" /><circle cx="-4" cy="-3" r="5" className="leaf2" /><rect x="-5" y="7" width="10" height="7" rx="1" className="pot" /></g>
}

/** Rooms with a single row of desks get a lounge: whiteboard, meeting table, coffee. */
function Lounge({ r }: { r: Room }) {
  const y = r.y + 38 + CELL_H + 14
  const board = Math.min(170, r.w * 0.42)
  const tx = r.x + 30 + board + (r.w - board - 60) / 2
  return (
    <g className="lounge" style={{ ['--c' as string]: `var(${DEPT_VAR[r.dept]})` }}>
      <rect x={r.x + 24} y={y} width={board} height="70" rx="3" className="wb" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={r.x + 34} y={y + 12 + i * 13} width={board * [0.6, 0.8, 0.45, 0.7][i]} height="3" rx="1.5" className="wbl" />)}
      <rect x={r.x + 24 + board - 34} y={y + 10} width="22" height="16" rx="2" className="sticky" />
      <ellipse cx={tx} cy={y + 38} rx="46" ry="22" className="table" />
      {[-30, 0, 30].map((dx) => <circle key={dx} cx={tx + dx} cy={y + 10} r="7" className="seat" />)}
      {[-30, 0, 30].map((dx) => <circle key={'b' + dx} cx={tx + dx} cy={y + 66} r="7" className="seat" />)}
      <rect x={tx - 6} y={y + 32} width="8" height="9" rx="1.5" className="cup" />
      <rect x={tx + 8} y={y + 30} width="16" height="11" rx="1" className="paper" />
    </g>
  )
}

export function Office(p: {
  agents: Record<string, AgentState>
  arrows: Arrow[]
  pending: number
  selected: string
  onSelect: (id: string) => void
}) {
  const ceoState: AgentState = {
    status: p.pending ? 'waiting' : 'idle', tin: 0, tout: 0, usd: 0, task: '',
    activity: p.pending ? `${p.pending} to approve` : 'watching the floor',
  }
  return (
    <svg className="floor" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Office floor">
      <defs>
        <pattern id="tiles" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" className="tile" fill="none" /></pattern>
      </defs>
      {ROOMS.map((r) => {
        const c = `var(${DEPT_VAR[r.dept]})`
        return (
          <g key={r.dept} style={{ ['--c' as string]: c }}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" className="roomfloor" />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" fill="url(#tiles)" />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" className="wall" />
            <rect x={r.x + 12} y={r.y + 10} width={DEPTS.find((d) => d.id === r.dept)!.name.length * 9 + 20} height="20" rx="4" className="sign" />
            <text x={r.x + 22} y={r.y + 24} className="signtxt">{DEPTS.find((d) => d.id === r.dept)!.name.toUpperCase()}</text>
            <Plant x={r.x + r.w - 20} y={r.y + 22} />
            {ROOM_ROWS[r.dept] === 1 && <Lounge r={r} />}
          </g>
        )
      })}
      <DeskView ceo id={CEO} name="You (CEO)" sub="" dept="hq" bot={false} a={ceoState} selected={p.selected === CEO} onSelect={() => p.onSelect(CEO)} />
      {DESKS.map((d: Desk) => (
        <DeskView key={d.id} id={d.id} name={d.name} sub={d.role} dept={d.dept} bot={!d.model} a={p.agents[d.id]} selected={p.selected === d.id} onSelect={() => p.onSelect(d.id)} />
      ))}
      {p.arrows.map((ar) => {
        const a = center(ar.from), b = center(ar.to)
        return (
          <g key={ar.id} className="arrow">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <g>
              <rect x="-7" y="-5" width="14" height="10" rx="2" className="env" />
              <path d="M-7 -5l7 6 7-6" className="envf" fill="none" />
              <animateMotion dur="1.4s" fill="freeze" path={`M${a.x} ${a.y} L${b.x} ${b.y}`} />
            </g>
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" className="alabel">{ar.kind}</text>
          </g>
        )
      })}
    </svg>
  )
}

