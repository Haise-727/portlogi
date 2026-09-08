import { Zap } from 'lucide-react'
import { BAND_COLOR, TYPE_ICON } from '../ui'
import type { ContainerType, PriorityBand } from '../../lib/types'

const BANDS: { band: PriorityBand; label: string }[] = [
  { band: 'critical', label: 'Critical' },
  { band: 'high', label: 'High' },
  { band: 'normal', label: 'Normal' },
  { band: 'low', label: 'Low' },
]

const TYPES: { type: ContainerType; label: string }[] = [
  { type: 'reefer', label: 'Reefer' },
  { type: 'hazmat', label: 'Hazmat' },
  { type: 'fragile', label: 'Fragile' },
]

/**
 * The screen has to decode itself: the definition of done is that somebody who
 * knows nothing about ports can follow it without being talked through it.
 */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-[6px]">
      <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">PRIORITY</span>
      {BANDS.map(({ band, label }) => (
        <span key={band} className="flex items-center gap-[5px]">
          <span className="h-[9px] w-[3px]" style={{ background: BAND_COLOR[band] }} />
          <span className="text-[10px] text-ink-2">{label}</span>
        </span>
      ))}

      <span className="h-[11px] w-px bg-line" />

      <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">CARGO</span>
      {TYPES.map(({ type, label }) => {
        const Icon = TYPE_ICON[type]
        return (
          <span key={type} className="flex items-center gap-[5px]">
            <Icon size={10} strokeWidth={2} className="text-ink-2" />
            <span className="text-[10px] text-ink-2">{label}</span>
          </span>
        )
      })}

      <span className="h-[11px] w-px bg-line" />

      <span className="flex items-center gap-[5px]">
        <Zap size={10} strokeWidth={2} className="text-ink-3" />
        <span className="text-[10px] text-ink-2">Powered slot — reefers only</span>
      </span>

      <span className="flex items-center gap-[5px]">
        <span
          className="h-px w-[16px]"
          style={{
            background:
              'repeating-linear-gradient(90deg, var(--color-signal) 0 4px, transparent 4px 7px)',
          }}
        />
        <span className="text-[10px] text-ink-2">Crane route</span>
      </span>

      <span className="flex items-center gap-[5px]">
        <span
          className="h-[10px] w-[14px] border border-line"
          style={{
            background:
              'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-reject) 40%, var(--color-raise)) 0 3px, var(--color-raise) 3px 6px)',
          }}
        />
        <span className="text-[10px] text-ink-2">Illegal for this box — hover for the rule</span>
      </span>

      <span className="ml-auto text-[10px] text-ink-3">
        Tier 1 sits up-left of tier 0. Click a box for its file.
      </span>
    </div>
  )
}
