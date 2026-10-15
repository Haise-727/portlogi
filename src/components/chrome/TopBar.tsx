import { Activity, Menu, Moon, Pause, Play, ScanLine, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { PORTS } from '../../data/ports'
import { formatClock } from '../../lib/time'
import { formatMinutes } from '../../engine/priority'
import { useYard } from '../../store/app'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { Popover, PopoverContent, PopoverTrigger, Tip } from '../ui/overlay'

const SPEEDS = [0.5, 1, 2, 4, 8]

/**
 * The whole chrome: one thin bar. Only four figures are on screen; the rest of
 * the metrics are one click away, and everything configurable lives in the
 * sidebar, so the yard keeps the screen.
 */
export function TopBar() {
  const now = useYard((s) => Math.floor(s.view.now * 60) / 60)
  const running = useYard((s) => s.running)
  const speed = useYard((s) => s.speed)
  const auto = useYard((s) => s.view.auto)
  const replay = useYard((s) => s.replay !== null)
  const toggleRunning = useYard((s) => s.toggleRunning)
  const setSpeed = useYard((s) => s.setSpeed)
  const command = useYard((s) => s.command)
  const openSidebar = useYard((s) => s.openSidebar)
  const sidebar = useYard((s) => s.sidebar)
  const closeSidebar = useYard((s) => s.closeSidebar)
  const menuSeen = useYard((s) => s.menuSeen)
  const theme = useYard((s) => s.theme)
  const setTheme = useYard((s) => s.setTheme)

  const isLight =
    theme === 'light' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)

  return (
    <header className="flex h-9 items-center gap-3 border-b border-line bg-panel px-3">
      <span className="font-mono text-t12 font-semibold tracking-[0.16em] text-ink">PORTLOGI</span>
      <span className="hidden h-[11px] w-px bg-line-hi sm:block" />
      <PortName />

      <Metrics />

      <span className="ml-auto flex items-center gap-2">
        {replay && (
          <span
            className="token border px-[5px] py-[2px] text-t9 leading-none"
            style={{ color: 'var(--color-high)', borderColor: 'color-mix(in srgb, var(--color-high) 55%, transparent)', borderRadius: 2 }}
          >
            replay
          </span>
        )}

        <span className="flex items-center gap-[5px] font-mono text-t12 tabular-nums text-ink">
          {running ? <Activity size={11} className="text-signal" strokeWidth={2} /> : <Pause size={11} className="text-ink-3" strokeWidth={2} />}
          {formatClock(now)}
        </span>

        <Tip label={running ? 'Pause (space)' : 'Run (space)'}>
          <Button size="icon" variant="ghost" onClick={toggleRunning} aria-label={running ? 'Pause' : 'Run'}>
            {running ? <Pause size={12} /> : <Play size={12} />}
          </Button>
        </Tip>

        <div className="flex border border-line" style={{ borderRadius: 2 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                'px-[6px] py-[3px] font-mono text-t10 transition-colors',
                speed === s ? 'bg-raise text-signal' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        <Tip label="Scan a container at the gate (S)">
          <Button variant="primary" disabled={replay} onClick={() => command({ t: 'admit' })}>
            <ScanLine size={12} className="text-signal" />
            Scan
          </Button>
        </Tip>
        <Tip label="Let the gates feed the yard (A)">
          <Button variant={auto ? 'active' : 'default'} disabled={replay} onClick={() => command({ t: 'auto', on: !auto })}>
            Auto
          </Button>
        </Tip>
        <Tip label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}>
          <Button size="icon" variant="ghost" onClick={() => setTheme(isLight ? 'dark' : 'light')} aria-label="Toggle theme">
            {isLight ? <Moon size={13} /> : <Sun size={13} />}
          </Button>
        </Tip>
        <Tip label="Layout, scenarios, boxes and tuning (M)">
          <span className="relative">
            {!menuSeen && (
              <span aria-hidden className="pointer-events-none absolute inset-0 animate-ping border border-signal opacity-60" style={{ borderRadius: 2 }} />
            )}
            <Button variant={sidebar ? 'active' : menuSeen ? 'default' : 'primary'} onClick={() => (sidebar ? closeSidebar() : openSidebar())} aria-label="Settings" aria-expanded={sidebar}>
              <Menu size={13} />
              <span className="hidden lg:inline">Settings</span>
            </Button>
          </span>
        </Tip>
      </span>
    </header>
  )
}

function Metrics() {
  const layout = useYard((s) => s.layout)
  const used = useYard((s) => layout.activeSlots.reduce((a, slot) => a + (s.view.stacks[slot]?.length ?? 0), 0))
  const m = useYard((s) => s.view.metrics)
  const queue = useYard((s) => Object.values(s.view.gateQueues).reduce((a, q) => a + q.length, 0))
  const util = m.agvElapsed > 0 ? m.agvBusy / m.agvElapsed : 0
  const avoided = Math.max(0, m.naiveRehandles - m.plannedRehandles)
  const dwell = m.dwellCount ? m.dwellTotal / m.dwellCount : 0
  const wait = m.gateWaitCount ? m.gateWaitTotal / m.gateWaitCount : 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-2 flex items-center gap-4 border border-transparent px-2 py-[3px] transition-colors hover:border-line hover:bg-raise"
          style={{ borderRadius: 2 }}
          aria-label="Yard metrics"
        >
          <Chip label="IN YARD" value={`${used}/${layout.capacity}`} />
          <Chip label="OUT" value={String(m.departed)} />
          <Chip label="REHANDLES" value={String(m.rehandleMoves)} tint={m.rehandleMoves > 0 ? 'var(--color-high)' : undefined} />
          <Chip label="BUSY" value={`${Math.round(util * 100)}%`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px]">
        <dl className="grid grid-cols-2">
          <Stat label="Gate queue" value={String(queue)} />
          <Stat label="Loaded to vessel" value={String(m.departed)} />
          <Stat label="Rehandles incurred" value={String(m.rehandleMoves)} tint={m.rehandleMoves > 0 ? 'var(--color-high)' : undefined} />
          <Stat label="Avoided vs naive" value={String(avoided)} tint={avoided > 0 ? 'var(--color-signal)' : undefined} />
          <Stat label="Avg dwell" value={dwell ? formatMinutes(dwell) : '—'} />
          <Stat label="Avg gate wait" value={wait ? formatMinutes(wait) : '—'} />
          <Stat label="Vehicle utilisation" value={`${Math.round(util * 100)}%`} />
          <Stat label="Traffic holds" value={String(m.holds)} />
          <Stat label="Cells driven" value={String(m.cells)} />
          <Stat label="Planned rehandles" value={String(m.plannedRehandles)} />
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function Chip({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <span className="flex items-baseline gap-[5px]">
      <span className="font-mono text-t9 tracking-[0.08em] text-ink-3">{label}</span>
      <span className="font-mono text-t11 tabular-nums" style={{ color: tint ?? 'var(--color-ink)' }}>
        {value}
      </span>
    </span>
  )
}

function Stat({ label, value, tint }: { label: string; value: ReactNode; tint?: string }) {
  return (
    <div className="border-b border-r border-line px-2 py-[6px] [&:nth-child(2n)]:border-r-0">
      <dd className="font-mono text-t14 leading-none tabular-nums" style={{ color: tint ?? 'var(--color-ink)' }}>
        {value}
      </dd>
      <dt className="mt-[3px] text-t9 leading-none text-ink-3">{label}</dt>
    </div>
  )
}

function PortName() {
  const id = useYard((s) => s.portId)
  const p = PORTS.find((x) => x.id === id)
  return (
    <span className="hidden text-t11 text-ink-3 md:block">
      {p?.name ?? id}
      {id !== 'voc' && ' (illustrative yard)'}
    </span>
  )
}
