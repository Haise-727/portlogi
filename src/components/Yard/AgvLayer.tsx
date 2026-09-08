import { motion, useReducedMotion } from 'motion/react'
import { shortId } from '../../lib/generator'
import type { Container, PriorityBand } from '../../lib/types'
import { YARD_H, YARD_W } from '../../lib/geometry'
import type { Agv } from '../../store/yardStore'
import { BAND_COLOR } from '../ui'

type Props = {
  agvs: Agv[]
  containers: Record<string, Container>
  bandOf: (c: Container) => PriorityBand
}

/**
 * The yard vehicles. Positioned by percentage translate on a full-size mover,
 * so the transform is the only thing that changes per frame — no layout, no
 * repaint of the yard beneath them.
 */
export function AgvLayer({ agvs, containers, bandOf }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {agvs.map((agv) => {
        const cargo = agv.carrying ? containers[agv.carrying] : null
        return (
          <div
            key={agv.id}
            className="absolute inset-0 h-full w-full will-change-transform"
            style={{
              transform: `translate3d(${(agv.pos.x / YARD_W) * 100}%, ${
                (agv.pos.y / YARD_H) * 100
              }%, 0)`,
            }}
          >
            <div className="absolute left-0 top-0 w-[5.4%] -translate-x-1/2 -translate-y-1/2">
              <AgvBody agv={agv} cargo={cargo} band={cargo ? bandOf(cargo) : 'normal'} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AgvBody({
  agv,
  cargo,
  band,
}: {
  agv: Agv
  cargo: Container | null
  band: PriorityBand
}) {
  const still = useReducedMotion()
  const held = agv.mode === 'held'
  const lifting = agv.mode === 'hoisting' || agv.mode === 'lowering'
  const pulse = held && !still
  const outline = held ? 'var(--color-high)' : 'var(--color-ink-2)'

  // The vehicle turns to face its direction of travel, which is also what makes
  // a turn penalty legible: you can see it swing before it sets off again.
  const angle = agv.facing === null ? 0 : agv.facing * 90

  return (
    <div className="relative aspect-square w-full">
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: angle }}
        transition={{ type: 'spring', stiffness: 190, damping: 22 }}
      >
        <motion.div
          className="absolute inset-0"
          animate={pulse ? { opacity: [1, 0.42, 1] } : { opacity: 1 }}
          transition={
            pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }
          }
        >
          {/* wheels, fore and aft */}
          {['top-[12%]', 'bottom-[12%]'].map((pos) => (
            <span key={pos} className={`absolute inset-x-[-9%] h-[13%] ${pos}`}>
              <span
                className="absolute left-0 h-full w-[22%]"
                style={{ background: outline, borderRadius: 1 }}
              />
              <span
                className="absolute right-0 h-full w-[22%]"
                style={{ background: outline, borderRadius: 1 }}
              />
            </span>
          ))}

          {/* chassis */}
          <span
            className="absolute inset-x-[6%] inset-y-0"
            style={{
              border: `1px solid ${outline}`,
              background: 'color-mix(in srgb, var(--color-void) 88%, transparent)',
              borderRadius: 2,
            }}
          />

          {/* which way it is pointing */}
          <span
            className="absolute left-1/2 top-[4%] h-0 w-0 -translate-x-1/2"
            style={{
              borderLeft: '3px solid transparent',
              borderRight: '3px solid transparent',
              borderBottom: `4px solid ${outline}`,
            }}
          />

          {/* the box on the deck */}
          {cargo && (
            <motion.div
              animate={lifting && !still ? { scale: [1, 0.82, 1] } : { scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
              className="absolute inset-x-[16%] top-[26%] h-[48%]"
              style={{
                background: `color-mix(in srgb, ${BAND_COLOR[band]} 62%, var(--color-void))`,
                border: `1px solid ${BAND_COLOR[band]}`,
                borderRadius: 1,
                boxShadow: '0 5px 12px -3px rgba(0,0,0,0.8)',
              }}
            />
          )}
        </motion.div>
      </motion.div>

      {/* labels stay upright however the vehicle is pointing */}
      <span
        className="absolute left-1/2 top-[calc(100%+3px)] -translate-x-1/2 whitespace-nowrap font-mono text-[8px] leading-none"
        style={{ color: held ? 'var(--color-high)' : 'var(--color-ink-3)' }}
      >
        {agv.id}
        {cargo ? ` · ${shortId(cargo.id)}` : ''}
      </span>

      {held && agv.holdReason && (
        <span
          className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 whitespace-nowrap border px-[3px] py-[1px] font-mono text-[8px] leading-none"
          style={{
            background: 'var(--color-void)',
            borderColor: 'var(--color-high)',
            color: 'var(--color-high)',
            borderRadius: 2,
          }}
        >
          HELD · {agv.holdReason}
        </span>
      )}
    </div>
  )
}
