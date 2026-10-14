import { AnimatePresence, motion } from 'motion/react'
import { Ban, Zap } from 'lucide-react'
import type { Container, PriorityBand } from '../../engine/types'
import { ContainerBlock } from './ContainerBlock'

/** Box footprint inside a slot, in slot-relative percentages. */
const BOX = { w: 82, h: 40 }

/**
 * Tier i sits further up and to the left of tier i-1. The step shrinks as
 * the yard gets taller, so any number of tiers fits in the same footprint and
 * every box keeps a visible identity strip along its bottom edge.
 */
function tierPos(tier: number, tiers: number): { left: number; top: number } {
  const t = Math.max(1, tiers - 1)
  const rise = tiers <= 2 ? 28 : 40 / t
  return { left: 14 - (tiers <= 1 ? 0 : 10 * (tier / t)), top: 52 - tier * rise }
}

type Props = {
  slot: string
  tiers: number
  powered: boolean
  disabled: boolean
  stack: Container[]
  bands: PriorityBand[]
  overdues: boolean[]
  selected: string | null
  checked: string[]
  chosen: boolean
  candidateScore: number | null
  /** why the slot is illegal for the box being placed or moved */
  rejected: string | null
  /** a legal target while a box is being moved */
  target: boolean
  chain: Set<string>
  hovered: boolean
  onHover: (slot: string | null) => void
  onSelect: (id: string, additive: boolean) => void
  onPick: (slot: string) => void
}

export function SlotCell(p: Props) {
  const { slot, stack, tiers } = p
  const floor = tierPos(0, tiers)

  return (
    <div
      className="absolute"
      style={{ inset: 0, cursor: p.target ? 'pointer' : undefined }}
      onMouseEnter={() => p.onHover(slot)}
      onMouseLeave={() => p.onHover(null)}
      onClick={() => p.target && p.onPick(slot)}
    >
      <div
        className="absolute inset-[3px] transition-colors duration-150"
        style={{
          background: p.disabled
            ? 'repeating-linear-gradient(135deg, var(--color-void) 0 5px, var(--color-panel) 5px 10px)'
            : p.rejected
              ? 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-reject) 15%, var(--color-raise)) 0 4px, var(--color-raise) 4px 10px)'
              : 'var(--color-raise)',
          border: `1px solid ${
            p.target && p.hovered
              ? 'var(--color-signal)'
              : p.chosen
                ? 'var(--color-signal)'
                : p.rejected
                  ? 'color-mix(in srgb, var(--color-reject) 60%, transparent)'
                  : p.target
                    ? 'color-mix(in srgb, var(--color-signal) 45%, transparent)'
                    : p.hovered
                      ? 'var(--color-line-hi)'
                      : 'var(--color-line)'
          }`,
          borderRadius: 2,
        }}
      />

      {p.disabled && (
        <Ban size={14} strokeWidth={1.5} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ink-3" />
      )}

      {!p.disabled && stack.length === 0 && (
        <div
          className="absolute border border-dashed"
          style={{
            left: `${floor.left}%`,
            top: `${floor.top}%`,
            width: `${BOX.w}%`,
            height: `${BOX.h}%`,
            borderColor: 'color-mix(in srgb, var(--color-line-hi) 70%, transparent)',
            borderRadius: 2,
          }}
        />
      )}

      <span className="token absolute left-[7px] top-[4px] text-t9 leading-none text-ink-3">{slot}</span>
      {p.powered && !p.disabled && (
        <Zap size={9} strokeWidth={2} className="absolute right-[6px] top-[4px] text-ink-3" aria-label="Powered slot" />
      )}

      {stack.map((c, i) => {
        const pos = tierPos(i, tiers)
        return (
          <ContainerBlock
            key={c.id}
            container={c}
            band={p.bands[i]}
            tier={i}
            selected={p.selected === c.id}
            checked={p.checked.includes(c.id)}
            flagged={p.chain.has(c.id)}
            overdue={p.overdues[i]}
            onClick={(e) => {
              e.stopPropagation()
              p.onSelect(c.id, e.shiftKey || e.ctrlKey || e.metaKey)
            }}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: `${BOX.w}%`,
              height: `${BOX.h}%`,
              zIndex: 2 + i,
            }}
          />
        )
      })}

      <AnimatePresence>
        {p.candidateScore !== null && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute left-[26px] top-[3px] z-20 border px-[4px] py-[1px] font-mono text-t9 leading-none"
            style={{
              background: 'color-mix(in srgb, var(--color-void) 82%, transparent)',
              borderColor: p.chosen ? 'var(--color-signal)' : 'var(--color-line-hi)',
              color: p.chosen ? 'var(--color-signal)' : 'var(--color-ink-2)',
              borderRadius: 2,
            }}
          >
            {p.candidateScore.toFixed(1)}
          </motion.span>
        )}
      </AnimatePresence>

      {p.chosen && <CornerTicks />}
    </div>
  )
}

/** Radar-cursor corner ticks rather than a glow: a glow reads wrong top-down. */
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
          className={`pointer-events-none absolute z-20 h-[7px] w-[7px] border-signal ${c}`}
        />
      ))}
    </>
  )
}
