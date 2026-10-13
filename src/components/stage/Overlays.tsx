import { motion } from 'motion/react'
import type { Agv, EngineState, RetrievalPlan } from '../../engine/engine'
import { useGeo } from '../../lib/geo'

/**
 * Every loaded vehicle's route, drawn from the path it is actually driving
 * (the remaining part of the A* output), not a straight line between two
 * points. With several vehicles out at once this is also the traffic picture:
 * you can see the lanes being shared.
 */
export function RouteOverlay({
  agvs,
  route,
  showExplored,
}: {
  agvs: Agv[]
  route: EngineState['route']
  showExplored: boolean
}) {
  const geo = useGeo()
  const live = agvs.filter((a) => a.carrying && a.path && a.path.length - a.pathIndex > 1)
  if (live.length === 0) return null

  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden>
      {showExplored &&
        route &&
        live.some((a) => a.id === route.agvId) &&
        route.explored.map((c, i) => {
          const p = geo.cellCenter(c)
          return <rect key={`${c.x}-${c.y}-${i}`} x={p.x - 5} y={p.y - 5} width={10} height={10} fill="var(--color-signal)" opacity={0.07} />
        })}

      {live.map((a) => {
        const rest = a.path!.slice(a.pathIndex)
        const pts = rest.map((c) => geo.cellCenter(c))
        const start = geo.point(a.pos.x, a.pos.y)
        const d = `M${start.x} ${start.y} ${pts
          .slice(1)
          .map((p) => `L${p.x} ${p.y}`)
          .join(' ')}`
        const corners = rest.filter((_, i) => i > 0 && i < rest.length - 1 && rest[i - 1].x !== rest[i + 1].x && rest[i - 1].y !== rest[i + 1].y)
        const end = pts[pts.length - 1]
        return (
          <g key={a.id}>
            <path d={d} fill="none" stroke="var(--color-signal)" strokeWidth={1.4} strokeDasharray="5 4" strokeLinecap="round" opacity={0.5} />
            {corners.map((c, i) => {
              const p = geo.cellCenter(c)
              return <circle key={i} cx={p.x} cy={p.y} r={2.4} fill="none" stroke="var(--color-signal)" strokeWidth={1} opacity={0.7} />
            })}
            <g stroke="var(--color-signal)" strokeWidth={1} opacity={0.9}>
              <line x1={end.x - 7} y1={end.y} x2={end.x - 3} y2={end.y} />
              <line x1={end.x + 3} y1={end.y} x2={end.x + 7} y2={end.y} />
              <line x1={end.x} y1={end.y - 7} x2={end.x} y2={end.y - 3} />
              <line x1={end.x} y1={end.y + 3} x2={end.x} y2={end.y + 7} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * The dig-out drawn on the yard before it happens: where each blocking box has
 * to go, and that it has to come back. A number in a panel does not read as
 * waste; a loop across the yard does.
 */
export function PlanOverlay({ plan }: { plan: RetrievalPlan | null }) {
  const geo = useGeo()
  if (!plan || plan.blockers.length === 0) return null
  const centre = (slot: string) => {
    const r = geo.slotRect(slot)
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }
  const box = geo.slotRect(plan.slot)

  return (
    <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full" viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden>
      <defs>
        <marker id="plan-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--color-critical)" />
        </marker>
      </defs>
      {plan.blockers.map((b, i) => {
        const from = centre(b.from)
        const to = centre(b.to)
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 26 }
        return (
          <g key={`${b.id}-${i}`}>
            <motion.path
              d={`M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`}
              fill="none"
              stroke="var(--color-critical)"
              strokeWidth={1.3}
              strokeDasharray="4 3"
              markerEnd="url(#plan-arrow)"
              opacity={0.85}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            <text x={mid.x} y={mid.y - 3} textAnchor="middle" fill="var(--color-critical)" fontSize={9} fontFamily="var(--font-mono)">
              dig-out {i + 1}
            </text>
          </g>
        )
      })}
      <rect x={box.x + 3} y={box.y + 3} width={box.w - 6} height={box.h - 6} fill="none" stroke="var(--color-critical)" strokeWidth={1} opacity={0.9} />
    </svg>
  )
}
