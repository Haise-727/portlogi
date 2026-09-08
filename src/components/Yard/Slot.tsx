import { AnimatePresence, motion } from 'motion/react'
import { Zap } from 'lucide-react'
import type { Container, PriorityBand } from '../../lib/types'
import { isPoweredSlot } from '../../lib/yardConfig'
import { ContainerBlock } from './ContainerBlock'

/** Box footprint inside a slot, in slot-relative percentages. */
const BOX = { w: 82, h: 40 }
const TIER_POS = [
  { left: 14, top: 52 }, // tier 0 sits low-right
  { left: 4, top: 24 }, // tier 1 offsets up-left and casts a shadow onto it
]

type Props = {
  slot: string
  stack: Container[]
  bands: PriorityBand[]
  overdues: boolean[]
  selected: string | null
  chosen: boolean
  candidateScore: number | null
  rejected: string | null
  chain: Set<string>
  hovered: boolean
  onHover: (slot: string | null) => void
  onSelect: (id: string) => void
}

export function Slot({
  slot,
  stack,
  bands,
  overdues,
  selected,
  chosen,
  candidateScore,
  rejected,
  chain,
  hovered,
  onHover,
  onSelect,
}: Props) {
  const powered = isPoweredSlot(slot)

  return (
    <div
      className="absolute"
      style={{ inset: 0 }}
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
    >
      {/* pavement */}
      <div
        className="absolute inset-[3px] transition-colors duration-150"
        style={{
          background: rejected
            ? 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-reject) 15%, var(--color-raise)) 0 4px, var(--color-raise) 4px 10px)'
            : 'var(--color-raise)',
          border: `1px solid ${
            chosen
              ? 'var(--color-signal)'
              : rejected
                ? 'color-mix(in srgb, var(--color-reject) 60%, transparent)'
                : hovered
                  ? 'var(--color-line-hi)'
                  : 'var(--color-line)'
          }`,
          borderRadius: 2,
        }}
      />

      {/* empty-slot footprint marking, so the landing area reads before anything lands */}
      {stack.length === 0 && (
        <div
          className="absolute border border-dashed"
          style={{
            left: `${TIER_POS[0].left}%`,
            top: `${TIER_POS[0].top}%`,
            width: `${BOX.w}%`,
            height: `${BOX.h}%`,
            borderColor: 'color-mix(in srgb, var(--color-line-hi) 70%, transparent)',
            borderRadius: 2,
          }}
        />
      )}

      <span className="absolute left-[7px] top-[4px] token text-[9px] leading-none text-ink-3">
        {slot}
      </span>

      {powered && (
        <Zap
          size={9}
          strokeWidth={2}
          className="absolute right-[6px] top-[4px] text-ink-3"
          aria-label="Powered slot"
        />
      )}

      {stack.map((c, i) => {
        const tier = Math.min(i, TIER_POS.length - 1)
        return (
        <ContainerBlock
          key={c.id}
          container={c}
          band={bands[i]}
          tier={tier}
          selected={selected === c.id}
          flagged={chain.has(c.id)}
          overdue={overdues[i]}
          onClick={() => onSelect(c.id)}
          style={{
            left: `${TIER_POS[tier].left}%`,
            top: `${TIER_POS[tier].top}%`,
            width: `${BOX.w}%`,
            height: `${BOX.h}%`,
            zIndex: 2 + tier,
          }}
        />
        )
      })}

      {/* the allocator's search, made visible: every candidate flashes its score */}
      <AnimatePresence>
        {candidateScore !== null && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute left-[26px] top-[3px] z-10 border px-[4px] py-[1px] font-mono text-[9px] leading-none"
            style={{
              background: 'color-mix(in srgb, var(--color-void) 82%, transparent)',
              borderColor: chosen ? 'var(--color-signal)' : 'var(--color-line-hi)',
              color: chosen ? 'var(--color-signal)' : 'var(--color-ink-2)',
              borderRadius: 2,
            }}
          >
            {candidateScore.toFixed(1)}
          </motion.span>
        )}
      </AnimatePresence>

      {chosen && <CornerTicks />}
    </div>
  )
}

/** Radar-cursor corner ticks rather than a glow — a glow is an AI tell and reads wrong top-down. */
function CornerTicks() {
  const corners = [
    'left-[1px] top-[1px] border-l border-t',
    'right-[1px] top-[1px] border-r border-t',
    'left-[1px] bottom-[1px] border-l border-b',
    'right-[1px] bottom-[1px] border-r border-b',
  ]
  return (
    <>
      {corners.map((c) => (
        <motion.span
          key={c}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`pointer-events-none absolute z-10 h-[7px] w-[7px] border-signal ${c}`}
        />
      ))}
    </>
  )
}
