import { motion } from 'motion/react'
import { YARD_H, YARD_W, cellCenter } from '../../lib/geometry'
import type { RoutePreview } from '../../store/yardStore'

type Props = {
  route: RoutePreview | null
  showExplored: boolean
}

/**
 * The route the crane is actually driving, drawn from the A* output rather
 * than a straight line between two points. The path is the demonstration:
 * without it, "pathfinding" is a claim on a slide.
 */
export function RouteOverlay({ route, showExplored }: Props) {
  if (!route || route.path.length < 2) return null

  const pts = route.path.map((c) => cellCenter(c))
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const turns = route.path.filter((_, i) => {
    if (i === 0 || i === route.path.length - 1) return false
    const a = route.path[i - 1]
    const b = route.path[i + 1]
    return a.x !== b.x && a.y !== b.y
  })

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox={`0 0 ${YARD_W} ${YARD_H}`}
      aria-hidden
    >
      {showExplored &&
        route.explored.map((c, i) => {
          const p = cellCenter(c)
          return (
            <rect
              key={`${c.x}-${c.y}-${i}`}
              x={p.x - 5}
              y={p.y - 5}
              width={10}
              height={10}
              fill="var(--color-signal)"
              opacity={0.07}
            />
          )
        })}

      <motion.path
        key={d}
        d={d}
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth={1.4}
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity={0.5}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />

      {turns.map((c, i) => {
        const p = cellCenter(c)
        return (
          <circle
            key={`t${i}`}
            cx={p.x}
            cy={p.y}
            r={2.4}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth={1}
            opacity={0.7}
          />
        )
      })}

      <Crosshair point={pts[pts.length - 1]} />
    </svg>
  )
}

function Crosshair({ point }: { point: { x: number; y: number } }) {
  return (
    <g stroke="var(--color-signal)" strokeWidth={1} opacity={0.9}>
      <line x1={point.x - 7} y1={point.y} x2={point.x - 3} y2={point.y} />
      <line x1={point.x + 3} y1={point.y} x2={point.x + 7} y2={point.y} />
      <line x1={point.x} y1={point.y - 7} x2={point.x} y2={point.y - 3} />
      <line x1={point.x} y1={point.y + 3} x2={point.x} y2={point.y + 7} />
    </g>
  )
}
