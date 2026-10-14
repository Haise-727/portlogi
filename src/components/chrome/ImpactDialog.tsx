import { ExternalLink } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BENCHMARKS, GRADE_LABEL, PORTS, SHIFTING_TARIFF, type Grade } from '../../data/ports'
import { MEASURED, formatInt, formatRupees, impact, reductionFor, usableThroughput, type Baseline } from '../../lib/impact'
import { useYard } from '../../store/app'
import { cn } from '../ui/cn'
import { Segmented } from '../ui/controls'
import { Dialog, Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/overlay'

/**
 * What the allocator's measured gain would mean at a real port's scale, the real figures it rests on
 * (with where each came from), and how this fits the G2B (government to business) idea.
 */
export default function ImpactDialog() {
  const open = useYard((s) => s.impactOpen)
  const setOpen = useYard((s) => s.setImpactOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen} className="h-[min(780px,88vh)]" title="Port impact and G2B" description="what the measured gain means at real scale, and where the numbers come from">
      <Tabs defaultValue="impact" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="impact">Impact</TabsTrigger>
          <TabsTrigger value="data">Ports and sources</TabsTrigger>
          <TabsTrigger value="g2b">G2B</TabsTrigger>
        </TabsList>
        <TabsContent value="impact">
          <Calculator />
        </TabsContent>
        <TabsContent value="data">
          <Data />
        </TabsContent>
        <TabsContent value="g2b">
          <G2B />
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Impact calculator
 * ------------------------------------------------------------------ */

function Calculator() {
  const usable = PORTS.filter((p) => usableThroughput(p) !== null)
  const [portId, setPortId] = useState('voc')
  const [teu, setTeu] = useState(usableThroughput(PORTS.find((p) => p.id === 'voc')!) ?? 0)
  const [teuPerBox, setTeuPerBox] = useState(1.6)
  const [rate, setRate] = useState(0.1)
  const [baseline, setBaseline] = useState<Baseline>('etd-rule')
  const [cost, setCost] = useState(SHIFTING_TARIFF.rupeesPer20ft)
  const [minutes, setMinutes] = useState(0)

  const input = { teuPerYear: teu, teuPerBox, rehandleRate: rate, baseline, costPerMove: cost, minutesPerMove: minutes }
  const r = impact(input)
  const port = PORTS.find((p) => p.id === portId)

  return (
    <div>
      <div className="border-b border-line bg-raise px-4 py-3">
        <p className="text-t10 leading-snug text-ink-2">
          <strong className="text-ink">A what-if, not a claim.</strong> How many extra moves a real yard does is not public, so you set it. The
          improvement figures are measured on the simulated yard ({MEASURED.source}). The default compares against a rule that already uses
          departure times, which is the fair comparison; the naive one is there to see the upper bound.
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-3 border-b border-line px-4 py-3 md:grid-cols-2">
        <Field label="Port">
          <select
            value={portId}
            onChange={(e) => {
              setPortId(e.target.value)
              const t = PORTS.find((p) => p.id === e.target.value)
              const v = t ? usableThroughput(t) : null
              if (v) setTeu(v)
            }}
            className="h-[28px] w-full border border-line bg-raise px-2 text-t10 text-ink outline-none focus:border-signal"
            style={{ borderRadius: 2 }}
          >
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.short} ({(usableThroughput(p)! / 1e6).toFixed(2)} M TEU, {p.throughput?.period})
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          {port?.throughput && <Badge grade={port.throughput.grade} />}
        </Field>
        <Num label="Containers a year, in TEU" value={teu} onChange={(v) => { setTeu(v); setPortId('custom') }} step={10000} />
        <Num label="TEU per box" value={teuPerBox} onChange={setTeuPerBox} step={0.1} hint="a 40-ft box is 2 TEU; real mixes sit between 1 and 2. An assumption." />
        <div>
          <Segmented
            label="Baseline extra moves per box"
            value={String(rate)}
            onChange={(v) => setRate(Number(v))}
            options={[0.05, 0.1, 0.2, 0.3].map((v) => ({ value: String(v), label: `${v * 100}%` }))}
          />
          <p className="text-t8 leading-snug text-ink-3">A scenario. Pick the range you want to argue about.</p>
        </div>
        <div>
          <Segmented
            label="Compared with"
            value={baseline}
            onChange={setBaseline}
            options={[
              { value: 'etd-rule', label: `ETD-aware rule (-${Math.round(reductionFor('etd-rule') * 100)}%)` },
              { value: 'first-available', label: `first free slot (-${Math.round(reductionFor('first-available') * 100)}%)` },
            ]}
          />
        </div>
        <div>
          <Num label="Worth of one avoided move (Rs)" value={cost} onChange={setCost} step={100} hint={`${SHIFTING_TARIFF.label}: Rs ${SHIFTING_TARIFF.rupeesPer20ft}. A price charged to customers, not the terminal's cost; edit it.`} />
        </div>
        <Num label="Minutes per move (optional)" value={minutes} onChange={setMinutes} step={1} hint="leave 0 to skip hours; a measured figure for your yard is better than a guess" />
      </div>

      <div className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        <Big label="Boxes a year" value={formatInt(r.boxes)} />
        <Big label="Extra moves today" value={formatInt(r.baselineRehandles)} />
        <Big label="Moves avoided a year" value={formatInt(r.avoided)} accent />
        <Big label="Moves avoided a day" value={formatInt(r.avoidedPerDay)} accent />
        {r.rupeesSaved !== null && <Big label="Value of those moves" value={formatRupees(r.rupeesSaved)} />}
        {r.hoursSaved !== null && <Big label="Handling hours saved" value={formatInt(r.hoursSaved)} />}
      </div>

      <div className="px-4 py-3">
        <h3 className="mb-2 text-t10 font-medium text-ink-2">The same assumptions at every port with a usable figure</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line font-mono text-t8 tracking-[0.08em] text-ink-3">
              <th className="py-[4px] font-normal">PORT</th>
              <th className="py-[4px] text-right font-normal">TEU</th>
              <th className="py-[4px] text-right font-normal">MOVES AVOIDED A YEAR</th>
            </tr>
          </thead>
          <tbody>
            {usable.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="py-[5px] text-t10 text-ink-2">{p.short}</td>
                <td className="py-[5px] text-right font-mono text-t10 tabular-nums text-ink-3">{formatInt(usableThroughput(p)!)}</td>
                <td className="py-[5px] text-right font-mono text-t10 tabular-nums text-ink">{formatInt(impact({ ...input, teuPerYear: usableThroughput(p)! }).avoided)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-t8 leading-snug text-ink-3">
          Periods differ between ports (financial or calendar year, partial years), so compare the shape, not the last digit. Figures marked
          unverified are shown on the next tab but never used here.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-t10 text-ink-2">{label}</span>
      {children}
    </label>
  )
}

function Num({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (v: number) => void; step: number; hint?: string }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="h-[28px] w-full border border-line bg-raise px-2 font-mono text-t10 tabular-nums text-ink outline-none focus:border-signal"
        style={{ borderRadius: 2 }}
      />
      {hint && <span className="text-t8 leading-snug text-ink-3">{hint}</span>}
    </Field>
  )
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-b border-r border-line px-4 py-3">
      <div className="font-mono text-t8 tracking-[0.08em] text-ink-3">{label.toUpperCase()}</div>
      <div className={cn('mt-[6px] font-mono text-t15 tabular-nums', accent ? 'text-signal' : 'text-ink')}>{value}</div>
    </div>
  )
}

function Badge({ grade }: { grade: Grade }) {
  const warn = grade === 'unverified'
  return (
    <span
      className="token mt-1 w-fit border px-[5px] py-[1px] text-t8 leading-none"
      style={{
        color: warn ? 'var(--color-high)' : 'var(--color-ink-3)',
        borderColor: warn ? 'color-mix(in srgb, var(--color-high) 55%, transparent)' : 'var(--color-line-hi)',
        borderRadius: 2,
      }}
    >
      {GRADE_LABEL[grade]}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Ports and sources
 * ------------------------------------------------------------------ */

function Link({ source }: { source: { label: string; url: string } }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-t9 text-signal hover:underline">
      {source.label}
      <ExternalLink size={10} aria-hidden />
    </a>
  )
}

function Data() {
  return (
    <div className="px-4 py-3">
      <p className="mb-3 text-t10 leading-snug text-ink-2">
        Every figure below was read from the source next to it. Nothing here is the real layout of any yard; the yards in the simulator are
        illustrative. Where a number could not be confirmed it says so.
      </p>

      <h3 className="mb-1 text-t10 font-medium text-ink">Ports</h3>
      <ul className="divide-y divide-line border-y border-line">
        {PORTS.map((p) => (
          <li key={p.id} className="py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-t10 text-ink">{p.name}</span>
              <span className="text-t9 text-ink-3">{p.state}</span>
              {p.throughput && <Badge grade={p.throughput.grade} />}
            </div>
            {p.throughput ? (
              <p className="mt-[2px] text-t9 leading-snug text-ink-2">
                <span className="font-mono tabular-nums">{formatInt(p.throughput.teu)} TEU</span>, {p.throughput.period}.{' '}
                {p.throughput.note && <span className="text-ink-3">{p.throughput.note} </span>}
                <Link source={p.throughput.source} />
              </p>
            ) : (
              <p className="mt-[2px] text-t9 text-ink-3">No throughput figure found.</p>
            )}
            {p.capacityTeu && (
              <p className="text-t9 leading-snug text-ink-2">
                Stated capacity <span className="font-mono tabular-nums">{formatInt(p.capacityTeu.value)} TEU</span> a year. <Link source={p.capacityTeu.source} />
              </p>
            )}
            {p.terminals && <p className="text-t9 leading-snug text-ink-3">{p.terminals}</p>}
            {p.notes && <p className="text-t9 leading-snug text-ink-3">{p.notes}</p>}
          </li>
        ))}
      </ul>

      <h3 className="mb-1 mt-4 text-t10 font-medium text-ink">Benchmarks for the whole system</h3>
      <ul className="divide-y divide-line border-y border-line">
        {BENCHMARKS.map((b) => (
          <li key={b.label} className="py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-t10 text-ink">{b.label}</span>
              <Badge grade={b.grade} />
            </div>
            <p className="mt-[2px] text-t9 leading-snug text-ink-2">
              {b.value}. <Link source={b.source} />
            </p>
          </li>
        ))}
      </ul>

      <h3 className="mb-1 mt-4 text-t10 font-medium text-ink">Cost proxy</h3>
      <p className="text-t9 leading-snug text-ink-2">
        {SHIFTING_TARIFF.label}: <span className="font-mono tabular-nums">Rs {SHIFTING_TARIFF.rupeesPer20ft}</span>. {SHIFTING_TARIFF.detail}{' '}
        <Link source={SHIFTING_TARIFF.source} />
      </p>
      <p className="mt-1 text-t9 leading-snug text-ink-3">
        This is what the terminal charges a customer, not what a move costs the terminal. It stands in for the value of one avoided move until a
        real cost per move is available.
      </p>

      <h3 className="mb-1 mt-4 text-t10 font-medium text-ink">Not found, so not claimed</h3>
      <ul className="list-disc pl-4 text-t9 leading-snug text-ink-3">
        <li>How many rehandles a real Indian yard performs.</li>
        <li>VOC Port's yard equipment, block sizes and stack heights.</li>
        <li>The share of dangerous goods in container volumes.</li>
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * G2B
 * ------------------------------------------------------------------ */

type Status = 'prototyped' | 'planned' | 'described'
const STATUS: Record<Status, { label: string; colour: string }> = {
  prototyped: { label: 'prototyped', colour: 'var(--color-signal)' },
  planned: { label: 'planned', colour: 'var(--color-high)' },
  described: { label: 'described only', colour: 'var(--color-ink-3)' },
}

const INTERFACES: { system: string; does: string; here: string; status: Status; source: { label: string; url: string } }[] = [
  {
    system: 'RFID container tags (Logistics Data Bank, NLDS)',
    does: 'Tags containers so they can be tracked from port to inland depots; gates read them.',
    here: 'An ESP32 and RFID reader admit a container at the gate, through a signed-in cloud database.',
    status: 'prototyped',
    source: { label: 'ITLN: Logistics Data Bank at APM Terminals Pipavav', url: 'https://www.itln.in/apm-terminals-pipavav-goes-live-with-nlds-container-tracking-service-supply-chain' },
  },
  {
    system: 'Truck appointment systems',
    does: 'Truckers choose a gate time slot, to level peaks and cut waiting. Gateway Terminals India went live on 29 Sep 2025.',
    here: 'Business booking of a pickup window, which gives the allocator a real departure time.',
    status: 'planned',
    source: { label: 'India Shipping News: Gateway Terminals India TAS', url: 'https://indiashippingnews.com/ports/gateway-terminals-india-optimises-truck-handling-with-new-truck-appointment-system/' },
  },
  {
    system: 'PCS1x (Indian Ports Association single window)',
    does: 'One exchange for port and maritime stakeholders. Launched December 2018; linked to ICEGATE from 31 July 2020 (2020 sources, so check current status).',
    here: 'Would supply vessel calls and cargo events. No connection exists.',
    status: 'described',
    source: { label: 'Maritime Gateway: PCS1x', url: 'https://www.maritimegateway.com/?p=25464' },
  },
  {
    system: 'ICEGATE and NLP-Marine',
    does: 'Customs e-filing, and a planned national maritime single window.',
    here: 'Customs clearance status would decide when a box may leave. No connection exists.',
    status: 'described',
    source: { label: 'Logistics Insider: National Logistics Portal', url: 'https://www.logisticsinsider.in/portall-infosystems-bags-deal-for-building-a-national-logistics-portal-for-the-govt/' },
  },
]

function G2B() {
  return (
    <div className="px-4 py-3">
      <h3 className="mb-1 text-t10 font-medium text-ink">Government to business (G2B)</h3>
      <p className="text-t10 leading-snug text-ink-2">
        The port authority is a government body. The shipping lines, customs brokers, hauliers and terminal operators that use the port are its
        business customers. G2B here means the authority offers those businesses one digital service: see what is happening in the yard, book
        a pickup, and get a predictable wait, instead of each business phoning around.
      </p>

      <table className="mt-3 w-full text-left">
        <thead>
          <tr className="border-b border-line font-mono text-t8 tracking-[0.08em] text-ink-3">
            <th className="py-[4px] font-normal">WHO</th>
            <th className="py-[4px] font-normal">WHAT THEY GET FROM PORTLOGI</th>
          </tr>
        </thead>
        <tbody className="text-t9 leading-snug text-ink-2">
          {[
            ['Port authority', 'The whole yard, live: congestion, dwell, vehicle utilisation, scenarios to rehearse a surge or a breakdown.'],
            ['Terminal operator', 'Why each box was put where it was (the score breakdown and the rejected slots), and what a dig-out will cost before it happens.'],
            ['Shipping line or broker', 'Only their own boxes, a quote that includes the dig-out cost, and a booked pickup window. (Planned.)'],
            ['Haulier', 'A confirmed gate slot, so the truck does not queue. (Planned.)'],
          ].map(([who, what]) => (
            <tr key={who} className="border-b border-line align-top">
              <td className="whitespace-nowrap py-[6px] pr-3 text-ink">{who}</td>
              <td className="py-[6px]">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 mt-4 text-t10 font-medium text-ink">How it connects to the systems India already runs</h3>
      <p className="mb-2 text-t9 leading-snug text-ink-3">
        Only what is marked prototyped exists. The rest is described so the design is clear about where it would plug in; nothing is connected.
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {INTERFACES.map((i) => (
          <li key={i.system} className="py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-t10 text-ink">{i.system}</span>
              <span className="token border px-[5px] py-[1px] text-t8 leading-none" style={{ color: STATUS[i.status].colour, borderColor: 'var(--color-line-hi)', borderRadius: 2 }}>
                {STATUS[i.status].label}
              </span>
            </div>
            <p className="mt-[2px] text-t9 leading-snug text-ink-2">{i.does}</p>
            <p className="text-t9 leading-snug text-ink-3">In portlogi: {i.here}</p>
            <Link source={i.source} />
          </li>
        ))}
      </ul>
    </div>
  )
}
