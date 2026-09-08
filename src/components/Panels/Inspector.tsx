import { motion } from 'motion/react'
import { shortId } from '../../lib/generator'
import type { ScoreTerm } from '../../lib/allocator'
import { useYard } from '../../store/yardStore'
import { PanelHeading } from './ControlPanel'

/**
 * The panel that answers "how does it decide?". Everything here is read
 * straight off the allocator's return value — nothing is re-derived for
 * display, so what is on screen is what the algorithm actually used.
 */
export function Inspector() {
  const allocation = useYard((s) => s.lastAllocation)
  const route = useYard((s) => s.route)
  const containers = useYard((s) => s.containers)
  const hoverSlot = useYard((s) => s.hoverSlot)

  if (!allocation || !allocation.best) {
    return (
      <section className="flex min-h-0 flex-1 flex-col">
        <PanelHeading title="Algorithm inspector" note="idle" />
        <div className="px-2 py-3">
          <p className="text-[11px] leading-relaxed text-ink-3">
            Scan a container to see the placement decision. Every legal slot is scored on five
            weighted terms; the breakdown, the runners-up and the reason each rejected slot was
            rejected all appear here.
          </p>
        </div>
      </section>
    )
  }

  const { best, runnersUp, rejected, evaluated } = allocation
  const container = containers[allocation.containerId]
  const top = Math.max(...best.breakdown.map((t) => t.points))

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PanelHeading
        title="Algorithm inspector"
        note={container ? shortId(container.id) : allocation.containerId}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-end justify-between border-b border-line px-2 py-[7px]">
          <div>
            <div className="font-mono text-[9px] leading-none text-ink-3">PLACED AT</div>
            <div className="mt-[3px] token text-[15px] leading-none text-signal">
              {best.slot} · T{best.tier}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[9px] leading-none text-ink-3">
              SCORE · LOWEST OF {evaluated}
            </div>
            <div className="mt-[3px] font-mono text-[15px] leading-none tabular-nums text-ink">
              {best.score.toFixed(1)}
            </div>
          </div>
        </div>

        <ul>
          {best.breakdown.map((t) => (
            <TermBar key={t.key} term={t} dominant={t.points === top && t.points > 0} />
          ))}
        </ul>

        {runnersUp.length > 0 && (
          <>
            <SubHeading text="Runners-up" />
            <ul className="divide-y divide-line">
              {runnersUp.map((c) => (
                <li
                  key={`${c.slot}-${c.tier}`}
                  onMouseEnter={() => hoverSlot(c.slot)}
                  onMouseLeave={() => hoverSlot(null)}
                  className="flex items-center gap-2 px-2 py-[4px]"
                >
                  <span className="token w-[26px] text-[10px] text-ink-2">{c.slot}</span>
                  <span className="font-mono text-[10px] tabular-nums text-ink-3">
                    {c.score.toFixed(1)}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
                    +{(c.score - best.score).toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {rejected.length > 0 && (
          <>
            <SubHeading text={`Rejected (${rejected.length})`} />
            <ul className="divide-y divide-line">
              {rejected.map((r) => (
                <li
                  key={r.slot}
                  onMouseEnter={() => hoverSlot(r.slot)}
                  onMouseLeave={() => hoverSlot(null)}
                  className="flex gap-2 px-2 py-[4px]"
                >
                  <span className="token w-[26px] shrink-0 text-[10px] text-ink-3">{r.slot}</span>
                  <span className="text-[10px] leading-[14px] text-ink-3">{r.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {route && (
          <>
            <SubHeading text="Route taken" />
            <div className="flex gap-4 px-2 py-[6px]">
              <Fact label="CELLS" value={String(route.path.length - 1)} />
              <Fact label="TURNS" value={String(route.turns)} />
              <Fact label="A* COST" value={route.cost.toFixed(1)} />
              <Fact label="EXPANDED" value={String(route.explored.length)} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function TermBar({ term, dominant }: { term: ScoreTerm; dominant: boolean }) {
  const fill = Math.max(0, Math.min(1, term.points / term.weight))
  return (
    <li className="border-b border-line px-2 py-[5px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-ink-2">{term.label}</span>
        <span className="font-mono text-[10px] tabular-nums text-ink-3">
          {term.points.toFixed(1)}
          <span className="text-ink-3/60"> / {term.weight}</span>
        </span>
      </div>
      <div className="mt-[4px] h-[3px] w-full bg-line">
        <motion.div
          className="h-full"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: fill }}
          style={{
            transformOrigin: 'left',
            background: dominant ? 'var(--color-signal)' : 'var(--color-ink-3)',
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        />
      </div>
      <p className="mt-[3px] text-[9px] leading-[13px] text-ink-3">{term.detail}</p>
    </li>
  )
}

function SubHeading({ text }: { text: string }) {
  return (
    <div className="border-y border-line bg-raise px-2 py-[3px]">
      <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">{text}</span>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-[2px]">
      <span className="font-mono text-[9px] leading-none text-ink-3">{label}</span>
      <span className="font-mono text-[12px] leading-none tabular-nums text-ink">{value}</span>
    </span>
  )
}
