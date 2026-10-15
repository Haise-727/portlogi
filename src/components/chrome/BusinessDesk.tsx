import { useState } from 'react'
import { HAULIERS, hauliersFor, lineOf } from '../../data/business'
import { formatInt } from '../../lib/impact'
import { quote } from '../../lib/quote'
import { formatShort } from '../../lib/time'
import type { Container } from '../../engine/types'
import { shortId } from '../../engine/generator'
import { useYard } from '../../store/app'
import { TYPE_ICON } from '../theme'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { Segmented, Slider } from '../ui/controls'
import { Dialog } from '../ui/overlay'

/**
 * The business side of G2B. A shipping line sees only its own import boxes, books a haulier's truck for a
 * pickup window, and sees what that will cost before committing, including the yard's cost of digging the
 * box out. Choosing "all lines" is the authority's view. The booking becomes the box's real departure time,
 * which is what the allocator was missing.
 *
 * The lines and hauliers are fictional (data/business.ts). This is a demonstration of the flow, not a
 * secured multi-tenant system: the line selector is a view filter, not a login.
 */
export default function BusinessDesk() {
  const open = useYard((s) => s.businessOpen)
  const setOpen = useYard((s) => s.setBusinessOpen)
  const containers = useYard((s) => s.view.containers)
  const [lineCode, setLineCode] = useState('all')
  const [picked, setPicked] = useState<string | null>(null)

  const all = Object.values(containers).filter((c) => c.flow === 'import')
  const live = all.filter((c) => c.status !== 'departed')
  const released = all.length - live.length
  const lines = [...new Map(live.map((c) => [lineOf(c.id).code, lineOf(c.id)])).values()]
  const mine = live
    .filter((c) => lineCode === 'all' || lineOf(c.id).code === lineCode)
    .sort((a, b) => Number(!!a.booking) - Number(!!b.booking) || a.arrivedAt - b.arrivedAt)
  const selected = mine.find((c) => c.id === picked) ?? mine[0] ?? null
  const waiting = mine.filter((c) => !c.booking).length

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      className="h-[min(780px,88vh)]"
      title="Business desk"
      description="book a truck for an import box; the booking is what tells the yard when it leaves"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <span className="text-t10 text-ink-2">Viewing as</span>
        <select
          value={lineCode}
          onChange={(e) => setLineCode(e.target.value)}
          className="h-[26px] border border-line bg-raise px-2 text-t10 text-ink outline-none focus:border-signal"
          style={{ borderRadius: 2 }}
          aria-label="Viewing as"
        >
          <option value="all">All lines (port authority)</option>
          {lines.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-t9 text-ink-3">
          {waiting} waiting to be booked · {mine.length - waiting} booked · {released} released
        </span>
      </div>

      {live.length === 0 ? (
        <Empty hadAny={all.length > 0} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <ul className="min-h-0 divide-y divide-line overflow-y-auto border-r border-line">
            {mine.length === 0 && <li className="px-4 py-4 text-t10 text-ink-3">No import boxes for this line right now.</li>}
            {mine.map((c) => (
              <Row key={c.id} c={c} active={c.id === selected?.id} onPick={() => setPicked(c.id)} />
            ))}
          </ul>
          <div className="min-h-0 overflow-y-auto">{selected ? <Panel key={selected.id} c={selected} /> : null}</div>
        </div>
      )}

      <p className="border-t border-line px-4 py-2 text-t8 leading-snug text-ink-3">
        Shipping lines, hauliers and rates are invented for the demonstration; the line names are real-sounding with a letter changed. The
        line selector filters the view; it is not a login. An unbooked box is assumed to leave about 180 minutes after it arrives, and is
        collected by a walk-in truck after 360.
      </p>
    </Dialog>
  )
}

function Empty({ hadAny }: { hadAny: boolean }) {
  const command = useYard((s) => s.command)
  const readOnly = useYard((s) => s.replay !== null)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-[420px] text-t10 leading-snug text-ink-2">
        {hadAny
          ? 'Every import box has been collected. Discharge another vessel to continue.'
          : 'No import boxes yet. Imports come off a ship onto a quay and wait for a truck. Discharge a vessel to see the flow.'}
      </p>
      <Button variant="primary" disabled={readOnly} onClick={() => command({ t: 'scenario', name: 'discharge' })}>
        Discharge a vessel
      </Button>
    </div>
  )
}

function Row({ c, active, onPick }: { c: Container; active: boolean; onPick: () => void }) {
  const now = useYard((s) => s.view.now)
  const line = lineOf(c.id)
  const Icon = TYPE_ICON[c.type]
  const b = c.booking
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn('flex w-full items-center gap-3 px-4 py-[7px] text-left transition-colors hover:bg-raise', active && 'bg-raise shadow-[inset_2px_0_0_var(--color-signal)]')}
      >
        <span className="token w-[30px] shrink-0 border border-line-hi px-[3px] py-[2px] text-center text-t8 leading-none text-ink-2" style={{ borderRadius: 2 }}>
          {line.code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-[6px]">
            <span className="font-mono text-t10 text-ink">{shortId(c.id)}</span>
            <Icon size={10} className="text-ink-3" aria-hidden />
            <span className="token text-t9 text-ink-3">{c.slot ?? (c.status === 'inbound' ? 'quay' : 'moving')}</span>
          </span>
          <span className="block truncate text-t9 text-ink-3">
            {b ? `${b.fleetName} · ${formatShort(b.start)} · ${b.status}` : `estimated out in about ${Math.max(0, Math.round(c.etd - now))} min`}
          </span>
        </span>
        <span
          className="token shrink-0 border px-[5px] py-[1px] text-t8 leading-none"
          style={{
            color: b ? (b.status === 'late' ? 'var(--color-critical)' : 'var(--color-signal)') : 'var(--color-high)',
            borderColor: 'var(--color-line-hi)',
            borderRadius: 2,
          }}
        >
          {b ? 'booked' : 'needs booking'}
        </span>
      </button>
    </li>
  )
}

function Panel({ c }: { c: Container }) {
  const now = useYard((s) => s.view.now)
  const stacks = useYard((s) => s.view.stacks)
  const queued = useYard((s) => s.view.jobs.length)
  const command = useYard((s) => s.command)
  const readOnly = useYard((s) => s.replay !== null)
  const options = hauliersFor(c.type)
  const [haulierId, setHaulierId] = useState(options[0]?.id ?? HAULIERS[0].id)
  const [due, setDue] = useState(60)
  const [length, setLength] = useState(60)

  const line = lineOf(c.id)
  const haulier = options.find((h) => h.id === haulierId) ?? options[0]
  const stack = c.slot ? (stacks[c.slot] ?? []) : []
  const blockers = c.slot && c.status === 'stored' ? Math.max(0, stack.length - (stack.indexOf(c.id) + 1)) : 0
  const q = quote({ haulier, blockers, queuedJobs: queued, now, start: now + due })
  const b = c.booking

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-mono text-t11 text-ink">{c.id}</h3>
        <span className="text-t10 text-ink-2">
          {line.name} ({line.code})
        </span>
      </div>
      <p className="mt-1 text-t9 leading-snug text-ink-3">
        {c.type}, {c.weight} t, from {c.destination} on {c.vessel}.{' '}
        {c.slot ? `In ${c.slot}, tier ${(c.tier ?? 0) + 1}${blockers ? `, under ${blockers} box${blockers === 1 ? '' : 'es'}` : ', on top of its stack'}.` : 'Still being moved into the yard.'}
      </p>

      {b && (
        <div className="mt-3 border border-line-hi bg-raise px-3 py-2" style={{ borderRadius: 2 }}>
          <div className="text-t10 text-ink">
            Booked with {b.fleetName}: truck due {formatShort(b.start)}, waits until {formatShort(b.end)}.
          </div>
          <div className="mt-[2px] text-t9 text-ink-3">Status: {b.status}. The yard brings the box to the gate shortly before it is due.</div>
          <Button size="sm" className="mt-2" disabled={readOnly || b.status === 'released'} onClick={() => command({ t: 'cancelBooking', id: c.id })}>
            Cancel booking
          </Button>
        </div>
      )}

      {c.status !== 'departed' && (
        <>
          <h4 className="mb-1 mt-4 text-t10 font-medium text-ink">{b ? 'Rebook' : 'Choose a haulier'}</h4>
          <ul className="divide-y divide-line border-y border-line">
            {options.map((h) => (
              <li key={h.id}>
                <label className="flex cursor-pointer items-center gap-3 py-[6px]">
                  <input type="radio" name="haulier" checked={h.id === haulier.id} onChange={() => setHaulierId(h.id)} className="accent-[var(--color-signal)]" />
                  <span className="flex-1 text-t10 text-ink">{h.name}</span>
                  <span className="text-t9 text-ink-3">{h.trucks} trucks</span>
                  <span className="font-mono text-t10 tabular-nums text-ink-2">Rs {formatInt(h.ratePerTrip)}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-2">
            <Slider label="Truck due in" value={due} min={15} max={240} step={5} onChange={setDue} format={(v) => `${v} min (${formatShort(now + v)})`} />
            <Segmented
              label="Window"
              value={String(length)}
              onChange={(v) => setLength(Number(v))}
              options={[30, 60, 90].map((v) => ({ value: String(v), label: `${v} min` }))}
            />
          </div>

          <table className="mt-3 w-full text-left">
            <tbody className="text-t10 text-ink-2">
              <tr className="border-b border-line">
                <td className="py-[4px]">Haulage, {haulier.name}</td>
                <td className="py-[4px] text-right font-mono tabular-nums">Rs {formatInt(q.haulage)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-[4px]">
                  Yard handling{q.digOutMoves ? `: ${q.digOutMoves} moves to dig it out` : ': none, it is on top'}
                </td>
                <td className="py-[4px] text-right font-mono tabular-nums">Rs {formatInt(q.handling)}</td>
              </tr>
              <tr>
                <td className="py-[5px] text-ink">Total</td>
                <td className="py-[5px] text-right font-mono tabular-nums text-ink">Rs {formatInt(q.total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-t8 leading-snug text-ink-3">
            Haulage rates are invented. Handling uses a terminal's published internal-shifting charge per move as a stand-in. The yard needs about{' '}
            {Math.ceil(q.readyInMinutes)} min to have this box at the gate (a rough estimate).
          </p>
          {q.tooEarly && (
            <p className="mt-1 text-t9 leading-snug" style={{ color: 'var(--color-high)' }}>
              That window is earlier than the yard can plausibly be ready, so the truck would wait.
            </p>
          )}
          <Button
            variant="primary"
            className="mt-3 w-full"
            disabled={readOnly}
            onClick={() => command({ t: 'book', id: c.id, fleetId: haulier.id, fleetName: haulier.name, start: now + due, end: now + due + length })}
          >
            {b ? 'Confirm new booking' : 'Confirm booking'}
          </Button>
        </>
      )}
    </div>
  )
}

