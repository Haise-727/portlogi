import { motion, useReducedMotion } from 'motion/react'
import { shortId } from '../../lib/generator'
import type { Container, PriorityBand } from '../../lib/types'
import { YARD_H, YARD_W } from '../../lib/geometry'
import type { Crane } from '../../store/yardStore'
import { BAND_COLOR } from '../ui'

type Props = {
  cranes: Crane[]
  containers: Record<string, Container>
  bandOf: (c: Container) => PriorityBand
}

/**
 * Cranes are positioned by percentage translate on a full-size mover, so the
 * transform is the only thing that changes per frame — no layout, no repaint
 * of the yard beneath them.
 */
export function CraneLayer({ cranes, containers, bandOf }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {cranes.map((crane) => {
        const cargo = crane.carrying ? containers[crane.carrying] : null
        return (
          <div
            key={crane.id}
            className="absolute inset-0 h-full w-full will-change-transform"
            style={{
              transform: `translate3d(${(crane.pos.x / YARD_W) * 100}%, ${
                (crane.pos.y / YARD_H) * 100
              }%, 0)`,
            }}
          >
            <div className="absolute left-0 top-0 w-[4.6%] -translate-x-1/2 -translate-y-1/2">
              <CraneBody crane={crane} cargo={cargo} band={cargo ? bandOf(cargo) : 'normal'} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CraneBody({
  crane,
  cargo,
  band,
}: {
  crane: Crane
  cargo: Container | null
  band: PriorityBand
}) {
  const still = useReducedMotion()
  const held = crane.mode === 'held'
  const lifting = crane.mode === 'hoisting' || crane.mode === 'lowering'
  const pulse = held && !still

  return (
    <div className="relative aspect-square w-full">
      {/* portal frame, seen from above: two legs and the beam between them */}
      <motion.div
        animate={pulse ? { opacity: [1, 0.42, 1] } : { opacity: 1 }}
        transition={pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        className="absolute inset-0"
      >
        <span
          className="absolute inset-x-0 top-[18%] h-[64%]"
          style={{
            border: `1px solid ${held ? 'var(--color-high)' : 'var(--color-ink-2)'}`,
            background: 'color-mix(in srgb, var(--color-void) 88%, transparent)',
            borderRadius: 1,
          }}
        />
        {['top-0', 'bottom-0'].map((pos) => (
          <span
            key={pos}
            className={`absolute inset-x-[14%] h-[18%] ${pos}`}
            style={{ background: held ? 'var(--color-high)' : 'var(--color-ink-2)', opacity: 0.85 }}
          />
        ))}
      </motion.div>

      {/* the box being carried, held in the spreader */}
      {cargo && (
        <motion.div
          animate={lifting && !still ? { scale: [1, 0.82, 1] } : { scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
          className="absolute inset-x-[10%] top-[28%] h-[44%]"
          style={{
            background: `color-mix(in srgb, ${BAND_COLOR[band]} 62%, var(--color-void))`,
            border: `1px solid ${BAND_COLOR[band]}`,
            borderRadius: 1,
            boxShadow: '0 5px 12px -3px rgba(0,0,0,0.8)',
          }}
        />
      )}

      <span
        className="absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 whitespace-nowrap font-mono text-[8px] leading-none"
        style={{ color: held ? 'var(--color-high)' : 'var(--color-ink-3)' }}
      >
        {crane.id}
        {cargo ? ` · ${shortId(cargo.id)}` : ''}
      </span>

      {held && crane.holdReason && (
        <span
          className="absolute bottom-[calc(100%+3px)] left-1/2 -translate-x-1/2 whitespace-nowrap border px-[3px] py-[1px] font-mono text-[8px] leading-none"
          style={{
            background: 'var(--color-void)',
            borderColor: 'var(--color-high)',
            color: 'var(--color-high)',
            borderRadius: 2,
          }}
        >
          HELD · {crane.holdReason}
        </span>
      )}
    </div>
  )
}
