import { motion } from 'motion/react'
import { YARD_H, YARD_W, slotRect } from '../../lib/geometry'
import type { RetrievalPlan } from '../../store/yardStore'

/**
 * The dig-out drawn on the yard before it happens: where each blocking box has
 * to go, and that it has to come back. Making the detour visible is the point —
 * a number in a panel does not read as waste, a loop across the yard does.
 */
export function PlanOverlay({ plan }: { plan: RetrievalPlan | null }) {
  if (!plan || plan.blockers.length === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      viewBox={`0 0 ${YARD_W} ${YARD_H}`}
      aria-hidden
    >
      <defs>
        <marker
          id="plan-arrow"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="var(--color-critical)" />
        </marker>
      </defs>

      {plan.blockers.map((b, i) => {
        const from = centre(b.from)
        const to = centre(b.to)
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 26 }
        const d = `M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`
        return (
          <g key={`${b.id}-${i}`}>
            <motion.path
              d={d}
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
            <text
              x={mid.x}
              y={mid.y - 3}
              textAnchor="middle"
              fill="var(--color-critical)"
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              dig-out {i + 1}
            </text>
          </g>
        )
      })}

      <rect
        {...boxOf(plan.slot)}
        fill="none"
        stroke="var(--color-critical)"
        strokeWidth={1}
        opacity={0.9}
      />
    </svg>
  )
}

function centre(slot: string): { x: number; y: number } {
  const r = slotRect(slot)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function boxOf(slot: string): { x: number; y: number; width: number; height: number } {
  const r = slotRect(slot)
  return { x: r.x + 3, y: r.y + 3, width: r.w - 6, height: r.h - 6 }
}
