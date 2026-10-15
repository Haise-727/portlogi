import { motion } from 'motion/react'
import { Ban, Boxes, FlaskConical, Landmark, Map, RotateCcw, ScanLine, Truck, X, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DEFAULT_WEIGHTS, type Weights } from '../../engine/allocator'
import { DEFAULT_TIMING, type ScenarioName } from '../../engine/engine'
import { shortId } from '../../engine/generator'
import { LIMITS, defaultSpec, maxAgvs, normalizeSpec, type LayoutSpec } from '../../engine/layout'
import { assignedKey, priorityAt, useYard, type Tab } from '../../store/app'
import { BAND_COLOR } from '../theme'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { Segmented, Slider, Switch } from '../ui/controls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/overlay'

/**
 * A real sidebar: it takes its width out of the page, so the yard shrinks to
 * make room instead of being covered. The width animates; the content inside
 * keeps a fixed width so it does not reflow while it opens.
 */
export function Sidebar() {
  const open = useYard((s) => s.sidebar)
  const tab = useYard((s) => s.tab)
  const close = useYard((s) => s.closeSidebar)
  const openSidebar = useYard((s) => s.openSidebar)

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? SIDEBAR_W : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="shrink-0 overflow-hidden"
      aria-label="Settings"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex h-full flex-col border-l border-line-hi bg-panel" style={{ width: SIDEBAR_W }}>
        <header className="flex items-center justify-between border-b border-line px-3 py-[6px]">
          <h2 className="text-t11 font-medium text-ink">Settings</h2>
          <button type="button" onClick={close} className="text-ink-3 transition-colors hover:text-ink" aria-label="Close settings">
            <X size={14} />
          </button>
        </header>
        <Tabs value={tab} onValueChange={(v) => openSidebar(v as Tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="boxes">Boxes</TabsTrigger>
            <TabsTrigger value="tuning">Tuning</TabsTrigger>
          </TabsList>
          <TabsContent value="run">
            <RunTab />
          </TabsContent>
          <TabsContent value="layout">
            <LayoutTab />
          </TabsContent>
          <TabsContent value="boxes">
            <BoxesTab />
          </TabsContent>
          <TabsContent value="tuning">
            <TuningTab />
          </TabsContent>
        </Tabs>
      </div>
    </motion.aside>
  )
}

const SIDEBAR_W = 340

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-t11 font-medium text-ink-2">{title}</h3>
        {note && <span className="font-mono text-t9 text-ink-3">{note}</span>}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const SCENARIOS: { name: ScenarioName; label: string; hint: string }[] = [
  { name: 'surge', label: 'Vessel surge', hint: 'Ten boxes arrive in quick succession' },
  { name: 'gate-burst', label: 'Gate burst', hint: 'Six boxes hit the gates at once' },
  { name: 'discharge', label: 'Vessel discharge', hint: 'Six import boxes come off a ship, waiting for trucks' },
  { name: 'reefer-storm', label: 'Reefer storm', hint: 'The next six arrivals are all reefers' },
  { name: 'cutoff-rush', label: 'Cutoff rush', hint: 'One vessel closes in 15 minutes' },
  { name: 'breakdown', label: 'Vehicle breakdown', hint: 'The busiest vehicle stops for 25 minutes' },
]

function RunTab() {
  const layout = useYard((s) => s.layout)
  const auto = useYard((s) => s.view.auto)
  const replay = useYard((s) => s.replay !== null)
  const showExplored = useYard((s) => s.showExplored)
  const command = useYard((s) => s.command)
  const toggleExplored = useYard((s) => s.toggleExplored)
  const setCompareOpen = useYard((s) => s.setCompareOpen)
  const setImpactOpen = useYard((s) => s.setImpactOpen)
  const setBusinessOpen = useYard((s) => s.setBusinessOpen)
  const goLanding = useYard((s) => s.goLanding)
  const reset = useYard((s) => s.reset)
  const feed = useYard((s) => s.scannerFeed)
  const reduce = useYard((s) => s.reduceMotion)
  const setReduce = useYard((s) => s.setReduceMotion)
  const theme = useYard((s) => s.theme)
  const setTheme = useYard((s) => s.setTheme)
  const textSize = useYard((s) => s.textSize)
  const setTextSize = useYard((s) => s.setTextSize)
  const status = useYard((s) => s.scannerStatus)
  const scannerUser = useYard((s) => s.scannerUser)
  const scannerError = useYard((s) => s.scannerError)
  const lastScan = useYard((s) => s.lastScan)
  const setFeed = useYard((s) => s.setScannerFeed)

  return (
    <div className="stagger">
      <Section title="Gates" note={`${layout.gates.length} open`}>
        <div className="grid grid-cols-2 gap-2">
          {layout.gates.map((g) => (
            <Button key={g.id} variant="primary" disabled={replay} onClick={() => command({ t: 'admit', gate: g.id })}>
              <ScanLine size={12} className="text-signal" />
              Scan at {g.id}
            </Button>
          ))}
        </div>
        <div className="mt-2">
          <Switch label="Auto: let the gates feed the yard" checked={auto} onCheckedChange={(on) => command({ t: 'auto', on })} />
        </div>
      </Section>

      <Section title="Hardware scanner" note={feed ? STATUS_NOTE[status] : 'off'}>
        <Switch label="Admit boxes from the RFID reader" checked={feed} onCheckedChange={setFeed} />
        {feed && <ScannerAccount status={status} user={scannerUser} error={scannerError} lastScan={lastScan} />}
        {!feed && (
          <p className="mt-1 text-t8 leading-snug text-ink-3">
            The ESP32 writes each card read to the cloud database; this page admits that card's container. Switching it on loads the cloud SDK and asks you to sign in.
          </p>
        )}
      </Section>

      <Section title="Scenarios" note="stress the yard">
        <ul className="grid grid-cols-1 gap-[6px]">
          {SCENARIOS.map((s) => (
            <li key={s.name}>
              <Button
                className="h-auto w-full flex-col items-start justify-start gap-[1px] whitespace-normal py-[6px] text-left"
                disabled={replay}
                onClick={() => command({ t: 'scenario', name: s.name })}
              >
                <span className="text-ink">{s.label}</span>
                <span className="text-t10 text-ink-3">{s.hint}</span>
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Appearance">
        <Segmented
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        <Segmented
          label="Text size"
          value={textSize}
          onChange={setTextSize}
          options={[
            { value: 'S', label: 'S' },
            { value: 'M', label: 'M' },
            { value: 'L', label: 'L' },
          ]}
        />
      </Section>

      <Section title="View">
        <Switch label="Show the A* search" checked={showExplored} onCheckedChange={toggleExplored} />
        <Switch label="Reduce motion (fewer animations)" checked={reduce} onCheckedChange={setReduce} />
        <Legend />
      </Section>

      <Section title="Evidence">
        <Button className="w-full" onClick={() => setCompareOpen(true)}>
          <FlaskConical size={12} />
          Optimised vs first-available
        </Button>
        <Button className="mt-2 w-full" onClick={() => setBusinessOpen(true)}>
          <Truck size={12} />
          Business desk: book a truck
        </Button>
        <Button className="mt-2 w-full" onClick={goLanding}>
          <Map size={12} />
          All ports (map)
        </Button>
        <Button className="mt-2 w-full" onClick={() => setImpactOpen(true)}>
          <Landmark size={12} />
          Real ports and G2B
        </Button>
        <Button className="mt-2 w-full" variant="ghost" onClick={reset}>
          <RotateCcw size={12} />
          Reset the yard
        </Button>
      </Section>
    </div>
  )
}

const STATUS_NOTE: Record<string, string> = {
  off: 'off',
  connecting: 'connecting…',
  signin: 'sign in',
  online: 'connected',
  error: 'problem',
}

/** Sign-in for the feed. Accounts are added by hand in the Firebase console; there is no sign-up here. */
function ScannerAccount({
  status,
  user,
  error,
  lastScan,
}: {
  status: string
  user: string | null
  error: string | null
  lastScan: string | null
}) {
  const signIn = useYard((s) => s.signInScanner)
  const signOut = useYard((s) => s.signOutScanner)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (user) {
    return (
      <div className="mt-2">
        <p className="text-t9 leading-snug text-ink-2">
          Signed in as <span className="font-mono">{user}</span>.{' '}
          {status === 'online' ? (lastScan ? `Listening. Last card ${lastScan}.` : 'Listening for a card.') : status === 'error' ? (error ?? 'Problem.') : 'Connecting…'}
        </p>
        <Button size="sm" className="mt-2" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  const field = 'h-[26px] w-full border border-line bg-raise px-2 text-t10 text-ink outline-none placeholder:text-ink-3 focus:border-signal'
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setProblem(null)
        signIn(email, password)
          .catch((err: Error) => setProblem(err.message))
          .finally(() => {
            setBusy(false)
            setPassword('')
          })
      }}
    >
      <input
        className={field}
        style={{ borderRadius: 2 }}
        type="email"
        autoComplete="username"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        required
      />
      <input
        className={field}
        style={{ borderRadius: 2 }}
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        required
      />
      <Button type="submit" variant="primary" disabled={busy || !email || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {(problem || (status === 'error' && error)) && (
        <p className="text-t9 leading-snug" style={{ color: 'var(--color-critical)' }}>
          {problem ?? error}
        </p>
      )}
      <p className="text-t8 leading-snug text-ink-3">Accounts are created by the project owner. There is no sign-up here.</p>
    </form>
  )
}

function Legend() {
  const bands = ['critical', 'high', 'normal', 'low'] as const
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-t10 text-ink-3">
      {bands.map((b) => (
        <span key={b} className="flex items-center gap-[4px]">
          <span className="h-[8px] w-[3px]" style={{ background: BAND_COLOR[b] }} />
          {b}
        </span>
      ))}
      <span className="flex items-center gap-[4px]">
        <Zap size={9} /> powered
      </span>
      <span className="flex items-center gap-[4px]">
        <Ban size={9} /> out of service
      </span>
      <span className="basis-full">
        Colour is priority. Icon is cargo type. Hatching means illegal for the box in hand. Shift-click boxes to select several.
        Gates (top) let boxes in and quays (bottom) send them to the ship. A <span className="token">pad</span> is a temporary set-down
        spot on the quay side: a truck parks a box there while it digs out the one underneath, or when no stacking position is legal yet.
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

const PRESETS: { label: string; spec: () => LayoutSpec }[] = [
  { label: 'Default 4×3', spec: defaultSpec },
  {
    label: 'Compact 3×3',
    spec: () => ({ ...defaultSpec(), cols: 3, gates: [2], quays: [2], pads: [0, 4], powered: ['A1', 'A2', 'A3'], agvs: 2 }),
  },
  {
    label: 'Wide 8×4',
    spec: () => ({
      ...defaultSpec(),
      rows: 4,
      cols: 8,
      tiers: 3,
      gates: [2, 6],
      quays: [4, 7],
      pads: [0, 9],
      powered: Array.from({ length: 8 }, (_, i) => `A${i + 1}`).concat(Array.from({ length: 4 }, (_, i) => `B${i + 1}`)),
      agvs: 4,
    }),
  },
  {
    label: 'Large 10×6',
    spec: () => ({
      ...defaultSpec(),
      rows: 6,
      cols: 10,
      tiers: 3,
      gates: [2, 5, 8],
      quays: [3, 6, 9],
      pads: [0, 11],
      powered: Array.from({ length: 10 }, (_, i) => `A${i + 1}`).concat(Array.from({ length: 5 }, (_, i) => `B${i + 1}`)),
      agvs: 6,
    }),
  },
]

function LayoutTab() {
  const spec = useYard((s) => s.layout.spec)
  // a fresh editor whenever the live layout changes underneath it
  return <LayoutEditor key={JSON.stringify(spec)} spec={spec} />
}

function LayoutEditor({ spec }: { spec: LayoutSpec }) {
  const applyLayout = useYard((s) => s.applyLayout)
  const pending = useYard((s) => s.pendingLayout)
  const cancelPending = useYard((s) => s.cancelPendingLayout)
  const readOnly = useYard((s) => s.replay !== null)
  const events = useYard((s) => s.view.events)
  const [draft, setDraft] = useState<LayoutSpec>(spec)
  const [asked, setAsked] = useState(false)

  const norm = useMemo(() => normalizeSpec(draft), [draft])
  const dirty = JSON.stringify(norm) !== JSON.stringify(spec)
  const refusal = asked && dirty ? events.find((e) => e.message.startsWith('Layout not changed')) : undefined
  const set = (p: Partial<LayoutSpec>) => setDraft((d) => ({ ...d, ...p }))
  const slotIds = useMemo(() => {
    const letters = 'ABCDEFGH'
    return Array.from({ length: norm.rows }, (_, r) => Array.from({ length: norm.cols }, (_, c) => `${letters[r]}${c + 1}`))
  }, [norm.rows, norm.cols])

  const toggle = (list: number[], x: number, min = 1) => {
    const has = list.includes(x)
    if (has && list.length <= min) return list
    return has ? list.filter((v) => v !== x) : [...list, x].sort((a, b) => a - b)
  }
  const cycle = (slot: string) => {
    const p = norm.powered.includes(slot)
    const d = norm.disabled.includes(slot)
    set({
      powered: !p && !d ? [...norm.powered, slot] : p ? norm.powered.filter((s) => s !== slot) : norm.powered,
      disabled: p ? [...norm.disabled, slot].filter((s, i, a) => a.indexOf(s) === i) : d ? norm.disabled.filter((s) => s !== slot) : norm.disabled,
    })
  }
  const fitAgvs = maxAgvs(norm.rows, norm.cols)

  return (
    <div className="stagger">
      <Section title="Presets">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} onClick={() => setDraft(p.spec())}>
              {p.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Size" note={`${norm.rows * norm.cols} positions · ${norm.rows * norm.cols * norm.tiers} boxes`}>
        <Slider label="Rows" value={norm.rows} min={LIMITS.rows[0]} max={LIMITS.rows[1]} onChange={(rows) => set({ rows })} />
        <Slider label="Columns" value={norm.cols} min={LIMITS.cols[0]} max={LIMITS.cols[1]} onChange={(cols) => set({ cols })} />
        <Slider label="Tiers high" value={norm.tiers} min={LIMITS.tiers[0]} max={LIMITS.tiers[1]} onChange={(tiers) => set({ tiers })} />
        <Slider
          label="Vehicles"
          value={Math.min(norm.agvs, fitAgvs)}
          min={1}
          max={fitAgvs}
          onChange={(agvs) => set({ agvs })}
          format={(v) => `${v} of ${fitAgvs} that fit`}
        />
      </Section>

      <Section title="Gates, quays, pads" note="top edge · bottom edge">
        <EdgeRow label="Gates" count={norm.cols} from={1} on={norm.gates} onToggle={(x) => set({ gates: toggle(norm.gates, x) })} />
        <EdgeRow label="Quays" count={norm.cols} from={1} on={norm.quays} onToggle={(x) => set({ quays: toggle(norm.quays, x), pads: norm.pads.filter((p) => p !== x) })} />
        <EdgeRow
          label="Pads"
          count={norm.cols + 2}
          from={0}
          on={norm.pads}
          blocked={norm.quays}
          onToggle={(x) => set({ pads: toggle(norm.pads, x, 1) })}
        />
      </Section>

      <Section title="Positions" note="click: dry → powered → out of service">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${norm.cols}, minmax(0, 1fr))` }}>
          {slotIds.flat().map((id) => {
            const p = norm.powered.includes(id)
            const d = norm.disabled.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => cycle(id)}
                className={cn(
                  'token flex h-[26px] items-center justify-center gap-[3px] border text-t9 transition-colors',
                  d ? 'border-line bg-void text-ink-3' : p ? 'border-signal/45 bg-signal/10 text-signal' : 'border-line bg-raise text-ink-2 hover:border-line-hi',
                )}
                style={{ borderRadius: 2 }}
                title={d ? 'Out of service' : p ? 'Powered (reefers)' : 'Dry'}
              >
                {p && <Zap size={8} />}
                {d && <Ban size={8} />}
                {id}
              </button>
            )
          })}
        </div>
      </Section>

      <div className="sticky bottom-0 border-t border-line bg-panel px-3 py-2">
        {refusal && <p className="mb-2 text-t10 leading-snug" style={{ color: 'var(--color-high)' }}>{refusal.message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            disabled={readOnly || !dirty || pending !== null}
            onClick={() => {
              setAsked(true)
              applyLayout(norm)
            }}
          >
            {pending ? 'Waiting for vehicles…' : 'Apply layout'}
          </Button>
          {pending ? (
            <Button onClick={cancelPending}>Cancel</Button>
          ) : (
            <Button disabled={!dirty} onClick={() => setDraft(spec)}>
              Revert
            </Button>
          )}
        </div>
        {pending && <p className="mt-2 text-t10 leading-snug text-high">New arrivals are paused. The layout applies as soon as every vehicle has finished its job.</p>}
        <p className="mt-2 text-t9 leading-snug text-ink-3">Aisles are generated for you. A change waits for the vehicles to finish, and is refused if it would leave a stored box without a position.</p>
      </div>
    </div>
  )
}

function EdgeRow({
  label,
  count,
  from,
  on,
  blocked = [],
  onToggle,
}: {
  label: string
  count: number
  from: number
  on: number[]
  blocked?: number[]
  onToggle: (x: number) => void
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-[3px] text-t10 text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: count }, (_, i) => from + i).map((x) => {
          const active = on.includes(x)
          const dead = blocked.includes(x)
          return (
            <button
              key={x}
              type="button"
              disabled={dead}
              onClick={() => onToggle(x)}
              className={cn(
                'h-[22px] min-w-[24px] border px-1 font-mono text-t9 transition-colors disabled:opacity-25',
                active ? 'border-signal/50 bg-signal/12 text-signal' : 'border-line bg-raise text-ink-3 hover:border-line-hi',
              )}
              style={{ borderRadius: 2 }}
            >
              {x === 0 ? 'W' : x === count + from - 1 && from === 0 ? 'E' : x}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Boxes
 * ------------------------------------------------------------------ */

function BoxesTab() {
  const containers = useYard((s) => s.view.containers)
  const now = useYard((s) => Math.floor(s.view.now))
  const workingKey = useYard((s) => assignedKey(s.view))
  const jobs = useYard((s) => s.view.jobs)
  const select = useYard((s) => s.select)
  const hoverSlot = useYard((s) => s.hoverSlot)
  const checked = useYard((s) => s.checked)
  const toggleChecked = useYard((s) => s.toggleChecked)
  const clearChecked = useYard((s) => s.clearChecked)
  const command = useYard((s) => s.command)
  const readOnly = useYard((s) => s.replay !== null)
  const [name, setName] = useState('')

  const working = useMemo(() => new Set(workingKey ? workingKey.split(',') : []), [workingKey])
  const rows = useMemo(
    () =>
      Object.values(containers)
        .filter((c) => c.status === 'stored')
        .map((c) => ({ c, p: priorityAt(c, now) }))
        .sort((a, b) => b.p.score - a.p.score || a.c.etd - b.c.etd),
    [containers, now],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={checked.length ? `Name the ${checked.length} selected` : 'Tick boxes to group them'}
            maxLength={24}
            disabled={readOnly}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-[26px] min-w-0 flex-1 border border-line bg-raise px-2 text-t11 text-ink outline-none placeholder:text-ink-3 focus:border-signal"
            style={{ borderRadius: 2 }}
          />
          <Button
            variant="primary"
            disabled={readOnly || !checked.length || !name.trim()}
            onClick={() => {
              command({ t: 'setGroup', ids: checked, group: name })
              clearChecked()
              setName('')
            }}
          >
            <Boxes size={12} />
            Group
          </Button>
          <Button disabled={readOnly || !checked.length} onClick={() => command({ t: 'setGroup', ids: checked, group: null })}>
            Clear
          </Button>
        </div>
        <p className="mt-1 text-t9 text-ink-3">Grouped boxes are kept together by the allocator.</p>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {rows.length === 0 && <li className="px-3 py-4 text-t11 text-ink-3">Nothing stored yet. Scan a container, or switch on Auto.</li>}
        {rows.map(({ c, p }) => {
          const queued = jobs.some((j) => j.containerId === c.id) || working.has(c.id)
          return (
            <li key={c.id} className="flex items-center gap-2 px-3 py-[5px] hover:bg-raise" onMouseEnter={() => hoverSlot(c.slot)} onMouseLeave={() => hoverSlot(null)}>
              <input type="checkbox" checked={checked.includes(c.id)} onChange={() => toggleChecked(c.id)} className="accent-[var(--color-signal)]" aria-label={`Select ${c.id}`} />
              <button type="button" onClick={() => select(c.id)} className="flex min-w-0 flex-1 items-center gap-[6px] text-left">
                <span className="h-[16px] w-[2px] shrink-0" style={{ background: BAND_COLOR[p.band] }} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="flex items-baseline gap-[5px]">
                    <span className="font-mono text-t10 text-ink">{shortId(c.id)}</span>
                    <span className="token text-t9 text-ink-3">{c.slot}</span>
                    {c.group && <span className="truncate text-t9 text-signal">{c.group}</span>}
                    {p.overdue && <span className="token text-t8 leading-none" style={{ color: 'var(--color-critical)' }}>overdue</span>}
                  </span>
                  <span className="truncate text-t9 text-ink-3">{p.reason}</span>
                </span>
                <span className="shrink-0 font-mono text-t10 tabular-nums text-ink-2">{queued ? '···' : `${Math.max(0, Math.round(c.etd - now))}m`}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

const WEIGHT_LABELS: Record<keyof Weights, string> = {
  rehandle: 'Rehandle risk',
  travel: 'Travel distance',
  cluster: 'Cluster',
  spread: 'Yard spread',
  access: 'Aisle access',
}

function TuningTab() {
  const weights = useYard((s) => s.weights)
  const timing = useYard((s) => s.timing)
  const command = useYard((s) => s.command)
  const readOnly = useYard((s) => s.replay !== null)

  return (
    <div className="stagger">
      <Section title="Allocator weights" note="lower score wins">
        {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => (
          <Slider
            key={k}
            label={WEIGHT_LABELS[k]}
            value={weights[k]}
            min={0}
            max={60}
            disabled={readOnly}
            onChange={() => undefined}
            onCommit={(v) => command({ t: 'weights', weights: { ...weights, [k]: v } })}
          />
        ))}
        <Button className="mt-1 w-full" disabled={readOnly} onClick={() => command({ t: 'weights', weights: { ...DEFAULT_WEIGHTS } })}>
          Restore defaults
        </Button>
        <p className="mt-2 text-t9 leading-snug text-ink-3">Takes effect on the next box placed. Setting rehandle risk to zero shows what the allocator is worth.</p>
      </Section>

      <Section title="Handling times" note="sim-minutes">
        {(
          [
            ['lift', 'Lift at a slot', 0.1, 2],
            ['gate', 'Collect at the gate', 0.1, 3],
            ['quay', 'Hand over at the quay', 0.1, 3],
            ['slowFactor', 'Dig-out slowdown', 1, 4],
          ] as const
        ).map(([k, label, min, max]) => (
          <Slider
            key={k}
            label={label}
            value={timing[k]}
            min={min}
            max={max}
            step={0.1}
            disabled={readOnly}
            format={(v) => (k === 'slowFactor' ? `×${v.toFixed(1)}` : `${v.toFixed(1)} min`)}
            onChange={() => undefined}
            onCommit={(v) => command({ t: 'timing', timing: { ...timing, [k]: Math.round(v * 10) / 10 } })}
          />
        ))}
        <Button className="mt-1 w-full" disabled={readOnly} onClick={() => command({ t: 'timing', timing: { ...DEFAULT_TIMING } })}>
          Restore defaults
        </Button>
        <p className="mt-2 text-t9 leading-snug text-ink-3">Vehicles really stand still for these times, and corners cost extra. Traffic control books the same times, so a slower lift makes other vehicles wait for it.</p>
      </Section>
    </div>
  )
}
