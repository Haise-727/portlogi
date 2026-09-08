import { Activity, Pause, Play } from 'lucide-react'
import { formatClock } from '../../lib/simulation'
import { SLOT_IDS, yardConfig } from '../../lib/yardConfig'
import { useYard } from '../../store/yardStore'

export function StatusBar() {
  const now = useYard((s) => Math.floor(s.now * 60) / 60)
  const running = useYard((s) => s.running)
  const auto = useYard((s) => s.auto)
  const speed = useYard((s) => s.speed)
  const stacks = useYard((s) => s.stacks)

  const used = SLOT_IDS.reduce((a, s) => a + stacks[s].length, 0)
  const cap = SLOT_IDS.length * yardConfig.tiers

  return (
    <header className="flex items-center gap-3 border-b border-line bg-panel px-3">
      <span className="font-mono text-[12px] font-semibold tracking-[0.16em] text-ink">
        PORTLOGI
      </span>
      <span className="h-[11px] w-px bg-line-hi" />
      <span className="text-[11px] text-ink-3">
        V.O. Chidambaranar Port · Thoothukudi · Yard 3
      </span>

      <span className="ml-auto flex items-center gap-3">
        <Readout label="OCCUPANCY" value={`${used}/${cap}`} />
        <Readout label="MODE" value={auto ? 'AUTO' : 'MANUAL'} tint={auto} />
        <Readout label="RATE" value={`${speed}x`} />
        <span className="flex items-center gap-[5px] font-mono text-[12px] tabular-nums text-ink">
          {running ? (
            <Activity size={11} className="text-signal" strokeWidth={2} />
          ) : (
            <Pause size={11} className="text-ink-3" strokeWidth={2} />
          )}
          {formatClock(now)}
        </span>
      </span>
    </header>
  )
}

function Readout({ label, value, tint }: { label: string; value: string; tint?: boolean }) {
  return (
    <span className="flex items-baseline gap-[5px]">
      <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">{label}</span>
      <span
        className="font-mono text-[11px] tabular-nums"
        style={{ color: tint ? 'var(--color-signal)' : 'var(--color-ink-2)' }}
      >
        {value}
      </span>
    </span>
  )
}

export { Play }
