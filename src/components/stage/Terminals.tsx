import { AnimatePresence, motion } from 'motion/react'
import { shortId } from '../../engine/generator'
import { cellKey, type Layout } from '../../engine/layout'
import type { Container, PriorityBand } from '../../engine/types'
import { useGeo } from '../../lib/geo'
import { BAND_COLOR } from '../theme'

/** Gates (top edge), quays and transfer pads (bottom edge). */
export function Terminals({
  layout,
  queues,
  containers,
  stacks,
  bandOf,
}: {
  layout: Layout
  queues: Record<string, string[]>
  containers: Record<string, Container>
  stacks: Record<string, string[]>
  bandOf: (c: Container) => PriorityBand
}) {
  const geo = useGeo()
  const at = (cell: { x: number; y: number }) => {
    const p = geo.cellCenter(cell)
    return { left: geo.pctX(p.x), top: geo.pctY(p.y) }
  }

  return (
    <>
      <div
        className="absolute bottom-[2px] left-[8%] right-[8%] border-b border-dashed"
        style={{ borderColor: 'var(--color-line-hi)' }}
        aria-hidden
      />

      {layout.gates.map((g) => {
        const queue = (queues[g.id] ?? []).map((id) => containers[id]).filter(Boolean)
        return (
          <div key={g.id}>
            <div
              className="absolute flex -translate-x-1/2 -translate-y-[130%] items-center gap-[5px]"
              style={at(g.cell)}
            >
              <span className="token whitespace-nowrap text-t9 leading-none text-ink-2">{g.id} · GATE</span>
              <span className="h-[7px] w-[7px] rotate-45 border-b border-r border-ink-2" />
            </div>
            <div
              className="absolute flex -translate-x-full -translate-y-1/2 flex-row-reverse items-center gap-[3px] pr-[18px]"
              style={at(g.cell)}
            >
              <AnimatePresence mode="popLayout">
                {queue.slice(0, 4).map((c) => (
                  <motion.span
                    key={c.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="whitespace-nowrap border px-[3px] py-[2px] font-mono text-t8 leading-none"
                    style={{
                      borderColor: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 60%, transparent)`,
                      background: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 14%, var(--color-void))`,
                      color: 'var(--color-ink-2)',
                      borderRadius: 2,
                    }}
                  >
                    {shortId(c.id)}
                  </motion.span>
                ))}
              </AnimatePresence>
              {queue.length > 4 && <span className="font-mono text-t8 text-ink-3">+{queue.length - 4}</span>}
            </div>
          </div>
        )
      })}

      {layout.quays.map((q) => {
        const waiting = (queues[q.id] ?? []).map((id) => containers[id]).filter(Boolean)
        return (
          <div key={q.id}>
            <div className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[5px]" style={at(q.cell)}>
              <span className="h-[7px] w-[7px] rotate-45 border-b border-r border-ink-2" />
              <span className="token whitespace-nowrap text-t9 leading-none text-ink-2">{q.id} · QUAY</span>
            </div>
            {waiting.length > 0 && (
              <div className="absolute flex -translate-y-[190%] items-center gap-[3px]" style={{ ...at(q.cell), transform: 'translate(-50%, -190%)' }}>
                {waiting.slice(0, 4).map((c) => (
                  <span
                    key={c.id}
                    className="whitespace-nowrap border px-[3px] py-[2px] font-mono text-t8 leading-none"
                    style={{
                      borderColor: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 60%, transparent)`,
                      background: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 14%, var(--color-void))`,
                      color: 'var(--color-ink-2)',
                      borderRadius: 2,
                    }}
                  >
                    {shortId(c.id)}
                  </span>
                ))}
                {waiting.length > 4 && <span className="font-mono text-t8 text-ink-3">+{waiting.length - 4}</span>}
              </div>
            )}
          </div>
        )
      })}

      {layout.pads.map((pad) => {
        const c = containers[stacks[pad.id]?.[0] ?? '']
        const occupied = layout.quays.some((q) => cellKey(q.cell) === cellKey(pad.cell))
        if (occupied) return null
        return (
          <div
            key={pad.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[5px] border px-[5px] py-[3px]"
            style={{
              ...at(pad.cell),
              borderColor: c ? 'var(--color-high)' : 'var(--color-line)',
              background: 'var(--color-void)',
              borderStyle: c ? 'solid' : 'dashed',
              borderRadius: 2,
            }}
            title={c ? `Transfer pad ${pad.id}: ${c.id} set down temporarily` : `Transfer pad ${pad.id}: free`}
          >
            <span className="token text-t8 leading-none text-ink-3">{pad.id}</span>
            {c ? (
              <span className="font-mono text-t8 leading-none" style={{ color: 'var(--color-high)' }}>
                {shortId(c.id)}
              </span>
            ) : (
              <span className="text-t8 leading-none text-ink-3">pad</span>
            )}
          </div>
        )
      })}
    </>
  )
}
