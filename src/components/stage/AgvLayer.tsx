import { motion } from 'motion/react'
import { Wrench } from 'lucide-react'
import { agvPosAt, type Agv } from '../../engine/engine'
import { shortId } from '../../engine/generator'
import type { Container, PriorityBand } from '../../engine/types'
import { AGV_SIZE, useGeo } from '../../lib/geo'
import { BAND_COLOR } from '../theme'

type Props = {
  agvs: Agv[]
  containers: Record<string, Container>
  bandOf: (c: Container) => PriorityBand
  /** sim-minutes since the last engine step, so motion is continuous */
  frac: number
  /** damp decorative motion (pulses); vehicles always glide, because movement is the content */
  still: boolean
}

/**
 * The yard vehicles. Positioned by a percentage translate on a full-size
 * mover, so the transform is the only thing that changes per frame: no layout,
 * no repaint of the yard beneath them.
 */
export function AgvLayer({ agvs, containers, bandOf, frac, still }: Props) {
  const geo = useGeo()
  const widthPct = (AGV_SIZE / geo.W) * 100

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {agvs.map((agv) => {
        const cargo = agv.carrying ? containers[agv.carrying] : null
        const at = agvPosAt(agv, frac)
        const p = geo.point(at.x, at.y)
        return (
          <div
            key={agv.id}
            className="absolute inset-0 h-full w-full will-change-transform"
            style={{ transform: `translate3d(${(p.x / geo.W) * 100}%, ${(p.y / geo.H) * 100}%, 0)` }}
          >
            <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2" style={{ width: `${widthPct}%` }}>
              <AgvBody agv={agv} cargo={cargo} band={cargo ? bandOf(cargo) : 'normal'} still={still} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AgvBody({ agv, cargo, band, still }: { agv: Agv; cargo: Container | null; band: PriorityBand; still: boolean }) {
  const held = agv.mode === 'held'
  const broken = agv.mode === 'broken'
  const lifting = agv.mode === 'hoisting' || agv.mode === 'lowering'
  const outline = broken ? 'var(--color-critical)' : held ? 'var(--color-high)' : 'var(--color-ink-2)'
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
          animate={held && !still ? { opacity: [1, 0.42, 1] } : { opacity: 1 }}
          transition={held && !still ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          {['top-[12%]', 'bottom-[12%]'].map((pos) => (
            <span key={pos} className={`absolute inset-x-[-9%] h-[13%] ${pos}`}>
              <span className="absolute left-0 h-full w-[22%]" style={{ background: outline, borderRadius: 1 }} />
              <span className="absolute right-0 h-full w-[22%]" style={{ background: outline, borderRadius: 1 }} />
            </span>
          ))}
          <span
            className="absolute inset-x-[6%] inset-y-0"
            style={{
              border: `1px solid ${outline}`,
              background: 'color-mix(in srgb, var(--color-void) 88%, transparent)',
              borderRadius: 2,
            }}
          />
          <span
            className="absolute left-1/2 top-[4%] h-0 w-0 -translate-x-1/2"
            style={{
              borderLeft: '3px solid transparent',
              borderRight: '3px solid transparent',
              borderBottom: `4px solid ${outline}`,
            }}
          />
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

      {/* dwell: the vehicle really does stand still while it lifts */}
      {lifting && (
        <svg className="absolute -inset-[22%] h-[144%] w-[144%] -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-line-hi)" strokeWidth="1.2" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="1.8"
            strokeDasharray={`${Math.min(1, agv.liftT) * 100.5} 100.5`}
          />
        </svg>
      )}

      {broken && (
        <Wrench size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: 'var(--color-critical)' }} />
      )}

      <span
        className="absolute left-1/2 top-[calc(100%+3px)] -translate-x-1/2 whitespace-nowrap font-mono text-[8px] leading-none"
        style={{ color: broken ? 'var(--color-critical)' : held ? 'var(--color-high)' : 'var(--color-ink-3)' }}
      >
        {agv.id.replace('AGV-', 'A')}
        {cargo ? ` · ${shortId(cargo.id)}` : ''}
        {broken ? ' · down' : ''}
      </span>

      {held && agv.holdReason && (
        <span
          className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 whitespace-nowrap border px-[3px] py-[1px] font-mono text-[8px] leading-none"
          style={{ background: 'var(--color-void)', borderColor: 'var(--color-high)', color: 'var(--color-high)', borderRadius: 2 }}
        >
          HELD · {agv.holdReason}
        </span>
      )}
    </div>
  )
}
