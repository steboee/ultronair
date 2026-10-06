import type { Agent } from '../model/types'

/** Flat SVG version of the scene's chibi, for panels. */
export function Avatar({ agent, size = 44 }: { agent: Agent; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="shrink-0">
      <circle cx="22" cy="22" r="22" fill={agent.color} opacity=".18" />
      <rect x="11" y="27" width="22" height="18" rx="9" fill={agent.color} />
      <circle cx="22" cy="18" r="11" fill="#ffd9bf" />
      <path d="M11 17a11 9 0 0 1 22 0c-4-4-18-4-22 0z" fill="#4a3a33" />
      <ellipse cx="18" cy="19.5" rx="1.5" ry="2" fill="#2b2d42" />
      <ellipse cx="26" cy="19.5" rx="1.5" ry="2" fill="#2b2d42" />
      <path d="M19.5 23.5q2.5 2 5 0" stroke="#2b2d42" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
