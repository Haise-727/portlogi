import { motion } from 'motion/react'
import { shortId } from '../../lib/generator'
import type { Container, PriorityBand } from '../../lib/types'
import { BAND_COLOR, TYPE_ICON } from '../ui'

type Props = {
  container: Container
  band: PriorityBand
  /** virtual-unit box, already converted to percentages by the caller */
  style: React.CSSProperties
  tier: number
  selected?: boolean
  /** in the dig-out chain: this box only moves because it is in the way */
  flagged?: boolean
  /** departure already missed */
  overdue?: boolean
  onClick?: () => void
  /** carried boxes skip the descend animation, they are already in motion */
  carried?: boolean
}

/**
 * One box in the yard. Fill and rule carry the priority band; the icon carries
 * the cargo type. Tier 1 is offset up-left by the caller and gets a shadow, so
 * stacking reads instantly in plan view without a 3D engine.
 */
export function ContainerBlock({
  container,
  band,
  style,
  tier,
  selected,
  flagged,
  overdue,
  onClick,
  carried,
}: Props) {
  const colour = BAND_COLOR[band]
  const Icon = TYPE_ICON[container.type]

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={carried ? false : { y: '-26%', scale: 1.05, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.9 }}
      className="group absolute flex flex-col justify-between overflow-hidden border text-left"
      style={{
        ...style,
        background: `color-mix(in srgb, ${colour} 16%, var(--color-panel))`,
        borderColor: `color-mix(in srgb, ${colour} 55%, transparent)`,
        borderRadius: 2,
        boxShadow:
          tier > 0 || carried
            ? '0 6px 10px -3px rgba(0,0,0,0.65), 0 1px 0 0 rgba(255,255,255,0.05) inset'
            : '0 1px 0 0 rgba(255,255,255,0.04) inset',
        outline: selected
          ? '1px solid var(--color-signal)'
          : flagged
            ? '1px solid var(--color-critical)'
            : 'none',
        outlineOffset: 2,
      }}
      title={`${container.id} · ${container.destination} · ${container.weight}t${
        overdue ? ' · OVERDUE' : ''
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: overdue
            ? `repeating-linear-gradient(135deg, var(--color-critical) 0 3px, color-mix(in srgb, var(--color-critical) 30%, var(--color-void)) 3px 6px)`
            : colour,
        }}
      />

      {overdue && (
        <span
          aria-hidden
          className="flag-pulse pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 0 1px var(--color-critical)', borderRadius: 2 }}
        />
      )}
      {/* Destination sits in the top strip, which the box above covers when the
          stack is two high; the identity strip at the bottom always stays visible. */}
      <span className="flex items-start justify-between gap-1 pt-[3px] pl-[7px] pr-[4px]">
        <span className="truncate text-[8px] leading-none text-ink-3">{container.destination}</span>
        <Icon size={9} strokeWidth={2} style={{ color: colour }} />
      </span>
      <span className="flex items-end justify-between pb-[3px] pl-[7px] pr-[4px]">
        <span className="font-mono text-[9px] leading-none tracking-tight text-ink">
          {shortId(container.id)}
        </span>
        <span className="font-mono text-[8px] leading-none text-ink-3">{container.weight}t</span>
      </span>
    </motion.button>
  )
}
