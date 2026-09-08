import { formatMinutes } from '../../lib/priority'
import { useYard } from '../../store/yardStore'
import { PanelHeading } from './ControlPanel'

/**
 * No boxed stat cards: values sit on a hairline grid, monospace and tabular so
 * they do not shift width as they tick.
 */
export function Metrics() {
  const m = useYard((s) => s.metrics)
  const gate = useYard((s) => s.gateQueue.length)
  const inYard = useYard(
    (s) => Object.values(s.containers).filter((c) => c.status === 'stored').length,
  )
  const avoided = Math.max(0, m.naiveRehandles - m.plannedRehandles)
  const util = m.agvElapsed > 0 ? m.agvBusy / m.agvElapsed : 0
  const dwell = m.dwellCount > 0 ? m.dwellTotal / m.dwellCount : 0

  return (
    <section>
      <PanelHeading title="Yard metrics" note="live" />
      <dl className="grid grid-cols-2">
        <Stat label="In yard" value={String(inYard)} />
        <Stat label="Loaded to vessel" value={String(m.departed)} />
        <Stat
          label="Rehandles incurred"
          value={String(m.rehandleMoves)}
          tint={m.rehandleMoves > 0 ? 'var(--color-high)' : undefined}
        />
        <Stat
          label="Avoided vs naive"
          value={String(avoided)}
          tint={avoided > 0 ? 'var(--color-signal)' : undefined}
        />
        <Stat label="Avg dwell" value={dwell ? formatMinutes(dwell) : '—'} />
        <Stat label="AGV utilisation" value={`${Math.round(util * 100)}%`} />
        <Stat label="Gate queue" value={String(gate)} />
        <Stat label="Traffic holds" value={String(m.holds)} />
      </dl>
    </section>
  )
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="border-b border-r border-line px-2 py-[6px] last:border-r-0 [&:nth-child(2n)]:border-r-0">
      <dd
        className="font-mono text-[15px] leading-none tabular-nums"
        style={{ color: tint ?? 'var(--color-ink)' }}
      >
        {value}
      </dd>
      <dt className="mt-[3px] text-[9px] leading-none text-ink-3">{label}</dt>
    </div>
  )
}
