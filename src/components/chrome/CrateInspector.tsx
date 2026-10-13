import { AnimatePresence, animate, motion, motionValue, useDragControls } from 'motion/react'
import { ArrowRightLeft, GripHorizontal, PackageCheck, X } from 'lucide-react'
import type { RefObject } from 'react'
import { useState } from 'react'
import type { Decision } from '../../engine/engine'
import { formatMinutes } from '../../engine/priority'
import type { Container, ContainerType } from '../../engine/types'
import { priorityAt, useYard } from '../../store/app'
import { BAND_COLOR, TYPE_ICON, TYPE_LABEL } from '../theme'
import { Button } from '../ui/button'
import { Select } from '../ui/controls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/overlay'

/**
 * Appears only when a crate is clicked, and goes away with the X, Esc, or a
 * click on empty ground. Two tabs: what the box is, and why it is where it is.
 */

/** Where the window was left; module-level so it survives closing and reopening. */
const px = motionValue(0)
const py = motionValue(0)

export function CrateInspector({ bounds }: { bounds: RefObject<HTMLElement | null> }) {
  const id = useYard((s) => s.selected)
  const c = useYard((s) => (s.selected ? s.view.containers[s.selected] : undefined))
  const controls = useDragControls()

  return (
    <AnimatePresence>
      {id && c && (
        <motion.aside
          drag
          dragControls={controls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={bounds}
          style={{ x: px, y: py, right: 12, borderRadius: 2 }}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          className="absolute top-3 z-30 flex max-h-[calc(100%-24px)] w-[300px] flex-col border border-line-hi bg-panel shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          aria-label={`Container ${c.id}`}
        >
          <Body c={c} onGrab={(e) => controls.start(e)} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function Body({ c, onGrab }: { c: Container; onGrab: (e: React.PointerEvent) => void }) {
  const select = useYard((s) => s.select)
  const now = useYard((s) => Math.floor(s.view.now))
  const p = priorityAt(c, now)
  const decision = useYard((s) => s.view.decisions[c.id])

  return (
    <>
      <div
        className="flex cursor-grab touch-none select-none items-center gap-2 border-b border-line px-2 py-[6px] active:cursor-grabbing"
        onPointerDown={onGrab}
        onDoubleClick={() => {
          animate(px, 0, { duration: 0.2 })
          animate(py, 0, { duration: 0.2 })
        }}
        title="Drag to move. Double-click to put it back."
      >
        <GripHorizontal size={12} className="text-ink-3" aria-hidden />
        <span className="h-[12px] w-[2px]" style={{ background: BAND_COLOR[p.band] }} />
        <span className="font-mono text-[11px] text-ink">{c.id}</span>
        <span
          className="token border px-[4px] py-[1px] text-[8px] leading-none"
          style={{ color: BAND_COLOR[p.band], borderColor: `color-mix(in srgb, ${BAND_COLOR[p.band]} 50%, transparent)`, borderRadius: 2 }}
        >
          {p.band}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => select(null)}
          className="ml-auto text-ink-3 transition-colors hover:text-ink"
          aria-label="Close inspector"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="why">Why here</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Details key={`${c.id}|${c.group ?? ''}`} c={c} now={now} />
        </TabsContent>
        <TabsContent value="why">
          <Why decision={decision} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function Details({ c, now }: { c: Container; now: number }) {
  const p = priorityAt(c, now)
  const Icon = TYPE_ICON[c.type]
  const busy = useYard((s) => s.view.jobs.some((j) => j.containerId === c.id) || s.view.agvs.some((a) => a.carrying === c.id || a.legs.some((l) => l.kind !== 'move' && l.containerId === c.id)))
  const readOnly = useYard((s) => s.replay !== null)
  const command = useYard((s) => s.command)
  const startMove = useYard((s) => s.startMove)
  const moving = useYard((s) => s.movingId === c.id)
  const maxPoints = Math.max(...p.factors.map((f) => f.points), 0.001)
  const [group, setGroup] = useState(c.group ?? '')
  const stored = c.status === 'stored'

  return (
    <div>
      <dl className="grid grid-cols-3 border-b border-line">
        <Field label="RFID UID" value={c.tagUid} mono />
        <Field label="Position" value={c.slot ? `${c.slot} · T${(c.tier ?? 0) + 1}` : c.status} mono />
        <Field label="Weight" value={`${c.weight} t`} mono />
        <Field label="Destination" value={c.destination} />
        <Field label="Vessel" value={c.vessel} />
        <Field label="ETD" value={formatMinutes(c.etd - now)} mono />
      </dl>

      <div className="flex items-center gap-2 border-b border-line px-2 py-[5px]">
        <Icon size={12} strokeWidth={2} style={{ color: BAND_COLOR[p.band] }} />
        <Select
          value={c.type}
          disabled={readOnly || c.status === 'departed'}
          onValueChange={(v) => command({ t: 'setType', id: c.id, type: v as ContainerType })}
          options={(Object.keys(TYPE_LABEL) as ContainerType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          className="h-[22px] flex-1"
        />
        <span className="font-mono text-[10px] tabular-nums text-ink-2">{p.score.toFixed(1)} pts</span>
      </div>

      <ul className="border-b border-line px-2 py-[5px]">
        {p.factors.map((f) => (
          <li key={f.key} className="mb-[5px] last:mb-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] text-ink-2">{f.label}</span>
              <span className="font-mono text-[9px] tabular-nums text-ink-3">{f.points.toFixed(1)}</span>
            </div>
            <div className="mt-[2px] h-[2px] w-full bg-line">
              <div className="h-full" style={{ width: `${(f.points / maxPoints) * 100}%`, background: f.points === maxPoints ? BAND_COLOR[p.band] : 'var(--color-ink-3)' }} />
            </div>
            <p className="mt-[2px] text-[9px] leading-[12px] text-ink-3">{f.detail}</p>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 border-b border-line px-2 py-[5px]">
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          disabled={readOnly}
          placeholder="Group name"
          maxLength={24}
          className="h-[22px] min-w-0 flex-1 border border-line bg-raise px-2 text-[11px] text-ink outline-none placeholder:text-ink-3 focus:border-signal"
          style={{ borderRadius: 2 }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') command({ t: 'setGroup', ids: [c.id], group })
          }}
        />
        <Button size="sm" disabled={readOnly || group.trim() === (c.group ?? '')} onClick={() => command({ t: 'setGroup', ids: [c.id], group })}>
          Set
        </Button>
      </div>

      {stored && (
        <div className="grid grid-cols-2 gap-2 p-2">
          <Button variant="primary" disabled={readOnly || busy} onClick={() => command({ t: 'retrieve', id: c.id })}>
            <PackageCheck size={12} />
            {busy ? 'Queued' : 'Retrieve'}
          </Button>
          <Button variant={moving ? 'active' : 'default'} disabled={readOnly || busy} onClick={() => startMove(moving ? null : c.id)}>
            <ArrowRightLeft size={12} />
            {moving ? 'Pick a slot' : 'Move to…'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Why({ decision }: { decision: Decision | undefined }) {
  if (!decision) {
    return <p className="px-3 py-3 text-[11px] leading-relaxed text-ink-3">This box has not been placed by the allocator yet. Once a vehicle is sent to set it down, the full reasoning appears here.</p>
  }
  const top = Math.max(...decision.breakdown.map((t) => t.points), 0)
  return (
    <div>
      <div className="flex items-end justify-between border-b border-line px-2 py-[7px]">
        <div>
          <div className="font-mono text-[9px] leading-none text-ink-3">PLACED AT</div>
          <div className="token mt-[3px] text-[15px] leading-none text-signal">
            {decision.slot} · T{decision.tier + 1}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] leading-none text-ink-3">{decision.strategy === 'naive' ? 'FIRST AVAILABLE' : `SCORE · LOWEST OF ${decision.evaluated}`}</div>
          <div className="mt-[3px] font-mono text-[15px] leading-none tabular-nums text-ink">{decision.strategy === 'naive' ? '—' : decision.score.toFixed(1)}</div>
        </div>
      </div>

      <ul>
        {decision.breakdown.map((t) => (
          <li key={t.key} className="border-b border-line px-2 py-[5px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-ink-2">{t.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-ink-3">
                {t.points.toFixed(1)}
                <span className="text-ink-3/60"> / {t.weight}</span>
              </span>
            </div>
            <div className="mt-[4px] h-[3px] w-full bg-line">
              <motion.div
                className="h-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(0, Math.min(1, t.weight ? t.points / t.weight : 0)) }}
                style={{ transformOrigin: 'left', background: t.points === top && t.points > 0 ? 'var(--color-signal)' : 'var(--color-ink-3)' }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              />
            </div>
            <p className="mt-[3px] text-[9px] leading-[13px] text-ink-3">{t.detail}</p>
          </li>
        ))}
      </ul>

      {decision.runnersUp.length > 0 && (
        <>
          <Sub text="Runners-up" />
          <ul className="divide-y divide-line">
            {decision.runnersUp.map((r) => (
              <li key={r.slot} className="flex items-center gap-2 px-2 py-[4px]">
                <span className="token w-[26px] text-[10px] text-ink-2">{r.slot}</span>
                <span className="font-mono text-[10px] tabular-nums text-ink-3">{r.score.toFixed(1)}</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">+{(r.score - decision.score).toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {decision.rejected.length > 0 && (
        <>
          <Sub text={`Rejected (${decision.rejected.length})`} />
          <ul className="divide-y divide-line">
            {decision.rejected.map((r) => (
              <li key={r.slot} className="flex gap-2 px-2 py-[4px]">
                <span className="token w-[26px] shrink-0 text-[10px] text-ink-3">{r.slot}</span>
                <span className="text-[10px] leading-[14px] text-ink-3">{r.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {decision.route && (
        <>
          <Sub text="Route taken" />
          <div className="flex gap-4 px-2 py-[6px]">
            <Fact label="CELLS" value={String(decision.route.cells)} />
            <Fact label="TURNS" value={String(decision.route.turns)} />
            <Fact label="A* COST" value={decision.route.cost.toFixed(1)} />
          </div>
        </>
      )}
    </div>
  )
}

function Sub({ text }: { text: string }) {
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-r border-line px-2 py-[4px] last:border-r-0">
      <dt className="font-mono text-[8px] leading-none text-ink-3">{label}</dt>
      <dd className={`mt-[3px] truncate text-[10px] leading-none text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
