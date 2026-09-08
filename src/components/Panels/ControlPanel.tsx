import { Boxes, Pause, Play, RotateCcw, Radio, ScanLine, Search } from 'lucide-react'
import { shortId } from '../../lib/generator'
import type { Container } from '../../lib/types'
import { SLOT_IDS } from '../../lib/yardConfig'
import { assignedKey, priorityWith, useYard } from '../../store/yardStore'
import { BAND_COLOR } from '../ui'

const SPEEDS = [0.5, 1, 2, 4]

export function ControlPanel({ onCompare }: { onCompare: () => void }) {
  const scan = useYard((s) => s.scan)
  const auto = useYard((s) => s.auto)
  const toggleAuto = useYard((s) => s.toggleAuto)
  const running = useYard((s) => s.running)
  const toggleRunning = useYard((s) => s.toggleRunning)
  const speed = useYard((s) => s.speed)
  const setSpeed = useYard((s) => s.setSpeed)
  const reset = useYard((s) => s.reset)
  const showExplored = useYard((s) => s.showExplored)
  const toggleExplored = useYard((s) => s.toggleExplored)

  return (
    <div className="flex flex-col gap-2 p-2">
      <button
        type="button"
        onClick={scan}
        className="flex h-[34px] items-center justify-center gap-2 border text-[12px] font-medium text-ink transition-colors active:translate-y-px"
        style={{
          background: 'color-mix(in srgb, var(--color-signal) 16%, var(--color-raise))',
          borderColor: 'color-mix(in srgb, var(--color-signal) 55%, transparent)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
          borderRadius: 2,
        }}
      >
        <ScanLine size={13} strokeWidth={2} className="text-signal" />
        Scan container
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Toggle active={auto} onClick={toggleAuto} icon={Radio} label={auto ? 'Auto on' : 'Auto'} />
        <Toggle
          active={running}
          onClick={toggleRunning}
          icon={running ? Pause : Play}
          label={running ? 'Pause' : 'Run'}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">RATE</span>
        <div className="flex flex-1 border border-line" style={{ borderRadius: 2 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className="flex-1 py-[3px] font-mono text-[10px] transition-colors"
              style={{
                background: speed === s ? 'var(--color-raise)' : 'transparent',
                color: speed === s ? 'var(--color-signal)' : 'var(--color-ink-3)',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Toggle active={showExplored} onClick={toggleExplored} icon={Search} label="A* search" />
        <Toggle active={false} onClick={reset} icon={RotateCcw} label="Reset" />
      </div>

      <button
        type="button"
        onClick={onCompare}
        className="flex h-[28px] items-center justify-center gap-2 border border-line bg-raise text-[11px] text-ink-2 transition-colors hover:border-line-hi hover:text-ink active:translate-y-px"
        style={{ borderRadius: 2 }}
      >
        <Boxes size={12} strokeWidth={2} />
        Optimised vs naive
      </button>
    </div>
  )
}

function Toggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Play
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[26px] items-center justify-center gap-[5px] border text-[11px] transition-colors active:translate-y-px"
      style={{
        background: active ? 'color-mix(in srgb, var(--color-signal) 12%, var(--color-raise))' : 'var(--color-raise)',
        borderColor: active ? 'color-mix(in srgb, var(--color-signal) 45%, transparent)' : 'var(--color-line)',
        color: active ? 'var(--color-signal)' : 'var(--color-ink-2)',
        borderRadius: 2,
      }}
    >
      <Icon size={11} strokeWidth={2} />
      {label}
    </button>
  )
}

/** Everything stored, ordered the way the system would work it. */
export function RetrievalQueue() {
  const containers = useYard((s) => s.containers)
  const stacks = useYard((s) => s.stacks)
  const vessels = useYard((s) => s.vessels)
  const nowBucket = useYard((s) => Math.floor(s.now))
  const retrieve = useYard((s) => s.requestRetrieve)
  const jobs = useYard((s) => s.jobs)
  const workingKey = useYard(assignedKey)
  const select = useYard((s) => s.select)
  const hoverSlot = useYard((s) => s.hoverSlot)

  const stored = Object.values(containers).filter((c) => c.status === 'stored')
  const working = workingKey ? workingKey.split(',') : []
  const scored = stored
    .map((c) => ({
      c,
      p: priorityWith(c, nowBucket, vessels),
      buried: buriedCount(c, stacks, containers),
    }))
    .sort((a, b) => b.p.score - a.p.score || a.c.etd - b.c.etd)

  return (
    <section className="flex min-h-0 flex-col">
      <PanelHeading
        title="Retrieval queue"
        note={`${scored.length} stored · by priority`}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {scored.length === 0 ? (
          <p className="px-2 py-3 text-[11px] leading-snug text-ink-3">
            Nothing stored yet. Scan a container, or switch auto mode on and let the gate feed
            the yard.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {scored.map(({ c, p, buried }) => {
              const queued = jobs.some((j) => j.containerId === c.id) || working.includes(c.id)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(c.id)
                      retrieve(c.id)
                    }}
                    onMouseEnter={() => hoverSlot(c.slot)}
                    onMouseLeave={() => hoverSlot(null)}
                    disabled={queued}
                    className="flex w-full items-center gap-[6px] px-2 py-[5px] text-left transition-colors hover:bg-raise disabled:opacity-45"
                  >
                    <span
                      className="h-[16px] w-[2px] shrink-0"
                      style={{ background: BAND_COLOR[p.band] }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="flex items-baseline gap-[5px]">
                        <span className="font-mono text-[10px] text-ink">{shortId(c.id)}</span>
                        <span className="token text-[9px] text-ink-3">{c.slot}</span>
                        {buried > 0 && (
                          <span
                            className="font-mono text-[9px]"
                            style={{ color: 'var(--color-high)' }}
                          >
                            buried
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[9px] text-ink-3">{p.reason}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-2">
                      {queued ? '···' : Math.max(0, Math.round(c.etd - nowBucket)) + 'm'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function buriedCount(
  c: Container,
  stacks: Record<string, string[]>,
  containers: Record<string, Container>,
): number {
  if (!c.slot) return 0
  const stack = stacks[c.slot] ?? []
  const idx = stack.indexOf(c.id)
  return idx < 0 ? 0 : stack.slice(idx + 1).filter((id) => containers[id]).length
}

export function PanelHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between border-y border-line bg-panel px-2 py-[5px]">
      <h2 className="text-[11px] font-medium text-ink-2">{title}</h2>
      {note && <span className="font-mono text-[9px] text-ink-3">{note}</span>}
    </div>
  )
}

export { SLOT_IDS }
