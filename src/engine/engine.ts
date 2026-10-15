import {
  DEFAULT_WEIGHTS,
  allocate,
  allocateNaive,
  blockedCells,
  checkConstraints,
  emptySnapshot,
  type AllocationResult,
  type Candidate,
  type ScoreTerm,
  type Weights,
  type YardSnapshot,
} from './allocator'
import {
  VESSELS,
  containerFromTag,
  drawContainer,
  newGenState,
  nextCutoff,
  shortId,
  type GenState,
} from './generator'
import {
  buildLayout,
  cellKey,
  defaultSpec,
  isPad,
  isPowered,
  slotToCell,
  type Layout,
  type LayoutSpec,
  type Terminal,
} from './layout'
import { dirIndex, findPath, type PathOk } from './pathfinder'
import { computePriority, type PriorityResult } from './priority'
import {
  ReservationTable,
  detectDeadlock,
  resolveTraffic,
  segmentTimes,
  segmentPauses,
  MINUTES_PER_CELL,
  type Reservation,
} from './traffic'
import type { Cell, Container, ContainerType, EventSeverity, Flow, Tier, YardEvent } from './types'

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** Fixed simulation step, in sim-minutes. Everything is quantised to this. */
export const TICK = 0.01

export type Strategy = 'optimised' | 'naive'

/** How long a vehicle stays put while it lifts, in sim-minutes. */
export type Timing = {
  /** lowering or hoisting at a slot */
  lift: number
  /** collecting a box at the gate */
  gate: number
  /** handing a box to the quay */
  quay: number
  /** dig-out lifts are done slowly and carefully */
  slowFactor: number
}

export const DEFAULT_TIMING: Timing = { lift: 0.6, gate: 0.9, quay: 0.9, slowFactor: 2.2 }

export type AgvMode = 'idle' | 'moving' | 'hoisting' | 'lowering' | 'held' | 'broken'

export type Leg =
  | { kind: 'move'; goal: Cell; note: string }
  | { kind: 'hoist'; containerId: string; slot: string; slow?: boolean }
  | { kind: 'lower'; containerId: string; slot: string; slow?: boolean }
  | { kind: 'collect'; containerId: string; gate: string }
  | { kind: 'depart'; containerId: string; exit: string }

export type RetrievalPlan = {
  containerId: string
  slot: string
  blockers: { id: string; from: string; to: string }[]
  /** true when every blocking box departs later than this one: a genuine mis-stack */
  wasted: boolean
  extraMoves: number
}

export type Agv = {
  id: string
  bay: Cell
  cell: Cell
  /** fractional grid coordinates; the renderer maps these to pixels */
  pos: { x: number; y: number }
  facing: number | null
  mode: AgvMode
  legs: Leg[]
  path: Cell[] | null
  pathIndex: number
  segT: number
  segTimes: number[]
  /** pivot-in-place part of each segment's time (see segmentPauses) */
  segPause: number[]
  liftT: number
  liftTotal: number
  carrying: string | null
  priority: number
  holdUntil: number
  holdReason: string | null
  waitingFor: string | null
  brokenUntil: number
  taskLabel: string | null
  route: Cell[] | null
  busyMinutes: number
}

export type Job = {
  kind: 'place' | 'retrieve' | 'relocate'
  containerId: string
  priority: number
  createdAt: number
  /** relocation destination */
  target?: string
}

export type Metrics = {
  stored: number
  departed: number
  /** dig-out moves the AGVs actually performed */
  rehandleMoves: number
  /** rehandles the optimiser committed to at placement time */
  plannedRehandles: number
  /** same arrivals, first-available placement: the live baseline */
  naiveRehandles: number
  dwellTotal: number
  dwellCount: number
  agvBusy: number
  agvElapsed: number
  holds: number
  /** grid cells driven by all vehicles */
  cells: number
  gateWaitTotal: number
  gateWaitCount: number
}

export type RoutePreview = {
  agvId: string
  path: Cell[]
  explored: Cell[]
  cost: number
  turns: number
}

/** Why a box was put where it was: kept per container for the inspector. */
export type Decision = {
  slot: string
  tier: number
  score: number
  at: number
  evaluated: number
  strategy: Strategy
  breakdown: ScoreTerm[]
  runnersUp: { slot: string; score: number }[]
  rejected: { slot: string; reason: string }[]
  route: { cells: number; turns: number; cost: number } | null
}

export type EngineState = {
  tick: number
  now: number
  auto: boolean
  containers: Record<string, Container>
  stacks: Record<string, string[]>
  gateQueues: Record<string, string[]>
  agvs: Agv[]
  jobs: Job[]
  events: YardEvent[]
  eventSeq: number
  lastAllocation: AllocationResult | null
  allocationSeq: number
  decisions: Record<string, Decision>
  route: RoutePreview | null
  rehandleChain: string[]
  pendingPlan: RetrievalPlan | null
  metrics: Metrics
  gen: GenState
  arrivalTimer: number
  arrivals: number
  arrivalCap: number | null
  forced: { type: ContainerType; left: number } | null
  burst: { left: number; timer: number } | null
  backoff: Record<string, number>
  warned: Record<string, true>
  everStored: Record<string, true>
  /** shadow yard: the same arrivals placed first-available, for the live baseline */
  naiveStacks: Record<string, string[]>
}

export type ScenarioName = 'surge' | 'reefer-storm' | 'breakdown' | 'gate-burst' | 'cutoff-rush' | 'discharge'

export type Command =
  | { t: 'admit'; gate?: string; tagUid?: string; type?: ContainerType; group?: string; flow?: Flow }
  | { t: 'book'; id: string; fleetId: string; fleetName: string; start: number; end: number }
  | { t: 'cancelBooking'; id: string }
  /** A better guess at when a box will be collected, without a firm booking (from an appointment slot, a forecast, a call). */
  | { t: 'estimate'; id: string; etd: number }
  | { t: 'retrieve'; id: string }
  | { t: 'confirm' }
  | { t: 'cancel' }
  | { t: 'move'; id: string; slot: string }
  | { t: 'setType'; id: string; type: ContainerType }
  | { t: 'setGroup'; ids: string[]; group: string | null }
  | { t: 'auto'; on: boolean }
  | { t: 'layout'; spec: LayoutSpec }
  | { t: 'weights'; weights: Weights }
  | { t: 'timing'; timing: Timing }
  | { t: 'scenario'; name: ScenarioName; arg?: string }

export type EngineOptions = {
  seed: number
  spec?: LayoutSpec
  strategy?: Strategy
  weights?: Weights
  timing?: Timing
  auto?: boolean
  /** stop admitting automatically after this many arrivals (experiments) */
  arrivalCap?: number
}

export type Checkpoint = {
  seed: number
  strategy: Strategy
  weights: Weights
  timing: Timing
  spec: LayoutSpec
  state: EngineState
  reservations: Reservation[]
}

/**
 * Where a moving vehicle is `extra` sim-minutes after its last step. The engine
 * advances in fixed 0.01-minute steps but the screen redraws on its own clock;
 * extrapolating along the booked path by the leftover fraction makes motion
 * continuous instead of stepping with the simulation.
 */
export function agvPosAt(a: Agv, extra: number): { x: number; y: number } {
  if (a.mode !== 'moving' || !a.path || extra <= 0) return a.pos
  let idx = a.pathIndex
  let t = a.segT
  let rem = extra
  while (idx < a.path.length - 1) {
    const total = a.segTimes[idx]
    const need = (1 - t) * total
    if (rem >= need) {
      rem -= need
      idx++
      t = 0
    } else {
      t += rem / total
      break
    }
  }
  if (idx >= a.path.length - 1) {
    const end = a.path[a.path.length - 1]
    return { x: end.x, y: end.y }
  }
  const p0 = a.path[idx]
  const p1 = a.path[idx + 1]
  const g = glide(t, a.segTimes[idx], a.segPause[idx] ?? 0)
  return { x: p0.x + (p1.x - p0.x) * g, y: p0.y + (p1.y - p0.y) * g }
}

/**
 * How far along a segment the vehicle has actually travelled, given how far
 * through the segment's time it is. The first part of a corner segment is a
 * pivot in place; after it the vehicle moves at constant speed.
 */
function glide(t: number, total: number, pause: number): number {
  const travel = total - pause
  if (travel <= 0) return 1
  return Math.max(0, Math.min(1, (t * total - pause) / travel))
}

const BAY_NOTE = 'to bay'
const EVADE_NOTE = 'stepping aside'
const NO_SLOT = 'No legal slot: waiting'
/** Sim-minutes between automatic gate arrivals. */
const ARRIVAL_INTERVAL = 3.2
/** A stored box this close to its ETD is called forward automatically. */
const CALL_FORWARD = 22
const RETRY = 4
/** What the planner assumes about an import box nobody has booked yet: it leaves about this long after it arrives. */
const IMPORT_GUESS_MINUTES = 180
/** An import nobody books is collected by a walk-in truck after this long, so it cannot sit for ever. */
const IMPORT_MAX_DWELL = 360
/** A booking must start at least this far ahead, so the yard has time to bring the box out. */
export const BOOKING_MIN_LEAD = 15
/** The yard starts bringing a booked box to the exit this long before the truck is due. */
const CALL_LEAD = 20

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

/**
 * The whole simulation as a pure, deterministic object: no React, no timers,
 * no module-level state. Give it the same seed, layout and command sequence
 * and it produces the same yard, which is what makes replay, checkpointing and
 * the backend experiments possible.
 *
 * State branches are copy-on-write per step: once published, a branch object
 * is never mutated again, so a snapshot is just a shallow copy and unchanged
 * branches keep their identity (React re-renders only what moved).
 */
export class Engine {
  layout: Layout
  weights: Weights
  timing: Timing
  readonly strategy: Strategy
  readonly seed: number
  s: EngineState
  table: ReservationTable
  private touched = new Set<string>()

  constructor(opts: EngineOptions) {
    this.seed = opts.seed
    this.strategy = opts.strategy ?? 'optimised'
    this.weights = opts.weights ?? { ...DEFAULT_WEIGHTS }
    this.timing = opts.timing ?? { ...DEFAULT_TIMING }
    this.layout = buildLayout(opts.spec ?? defaultSpec())
    this.table = new ReservationTable()
    this.s = this.initialState(opts.auto ?? false)
    this.s.arrivalCap = opts.arrivalCap ?? null
    for (const a of this.s.agvs) this.table.park(a.id, 0, a.cell, 0, 'parked')
    this.log('info', this.bootMessage())
  }

  private bootMessage(): string {
    const L = this.layout
    return `Yard online: ${L.activeSlots.length} positions, ${L.tiers} tiers high, ${L.spec.agvs} vehicles, ${L.pads.length} transfer pads, ${L.gates.length} gate${L.gates.length === 1 ? '' : 's'}, ${L.quays.length} quay${L.quays.length === 1 ? '' : 's'}.`
  }

  private initialState(auto: boolean): EngineState {
    const L = this.layout
    const stacks: Record<string, string[]> = {}
    for (const id of L.slotIds) stacks[id] = []
    for (const p of L.pads) stacks[p.id] = []
    const gateQueues: Record<string, string[]> = {}
    for (const g of L.gates) gateQueues[g.id] = []
    for (const q of L.quays) gateQueues[q.id] = []
    return {
      tick: 0,
      now: 0,
      auto,
      containers: {},
      stacks,
      gateQueues,
      agvs: this.freshAgvs([]),
      jobs: [],
      events: [],
      eventSeq: 0,
      lastAllocation: null,
      allocationSeq: 0,
      decisions: {},
      route: null,
      rehandleChain: [],
      pendingPlan: null,
      metrics: {
        stored: 0,
        departed: 0,
        rehandleMoves: 0,
        plannedRehandles: 0,
        naiveRehandles: 0,
        dwellTotal: 0,
        dwellCount: 0,
        agvBusy: 0,
        agvElapsed: 0,
        holds: 0,
        cells: 0,
        gateWaitTotal: 0,
        gateWaitCount: 0,
      },
      gen: newGenState(this.seed),
      arrivalTimer: 0,
      arrivals: 0,
      arrivalCap: null,
      forced: null,
      burst: null,
      backoff: {},
      warned: {},
      everStored: {},
      naiveStacks: this.emptyStacks(),
    }
  }

  private emptyStacks(): Record<string, string[]> {
    const o: Record<string, string[]> = {}
    for (const id of this.layout.slotIds) o[id] = []
    for (const p of this.layout.pads) o[p.id] = []
    return o
  }

  private freshAgvs(existing: Agv[]): Agv[] {
    return this.layout.bays.map((bay, i) => {
      const id = `AGV-${i + 1}`
      const prev = existing.find((a) => a.id === id)
      return {
        id,
        bay,
        cell: bay,
        pos: { x: bay.x, y: bay.y },
        facing: null,
        mode: 'idle' as AgvMode,
        legs: [],
        path: null,
        pathIndex: 0,
        segT: 0,
        segTimes: [],
        segPause: [],
        liftT: 0,
        liftTotal: 1,
        carrying: null,
        priority: 0,
        holdUntil: 0,
        holdReason: null,
        waitingFor: null,
        brokenUntil: 0,
        taskLabel: null,
        route: null,
        busyMinutes: prev?.busyMinutes ?? 0,
      }
    })
  }

  /* ---------------------------------------------------------------- *
   * Snapshots
   * ---------------------------------------------------------------- */

  /** Shallow copy for the UI. Unchanged branches keep their identity. */
  view(): EngineState {
    return { ...this.s }
  }

  checkpoint(): Checkpoint {
    return {
      seed: this.seed,
      strategy: this.strategy,
      weights: { ...this.weights },
      timing: { ...this.timing },
      spec: structuredClone(this.layout.spec),
      state: structuredClone(this.s),
      reservations: structuredClone(this.table.items),
    }
  }

  static restore(cp: Checkpoint): Engine {
    const e = new Engine({
      seed: cp.seed,
      spec: cp.spec,
      strategy: cp.strategy,
      weights: cp.weights,
      timing: cp.timing,
    })
    e.s = structuredClone(cp.state)
    e.table = ReservationTable.from(structuredClone(cp.reservations))
    return e
  }

  /** Copy-on-write access to one state branch. */
  private w<K extends keyof EngineState>(k: K): EngineState[K] {
    if (!this.touched.has(k)) {
      const v = this.s[k] as unknown
      this.s[k] = (
        Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v
      ) as EngineState[K]
      this.touched.add(k)
    }
    return this.s[k]
  }

  private patch(id: string, p: Partial<Container>): void {
    const cs = this.w('containers')
    cs[id] = { ...cs[id], ...p }
  }

  private setStack(slot: string, ids: string[]): void {
    this.w('stacks')[slot] = ids
  }

  private log(
    severity: EventSeverity,
    message: string,
    opts: { detail?: string; verbose?: boolean; ref?: string } = {},
  ): void {
    const s = this.s
    const head = s.events[0]
    if (head && head.message === message && head.severity === severity) {
      const ev = this.w('events')
      ev[0] = { ...head, count: (head.count ?? 1) + 1, at: s.now, tick: s.tick }
      return
    }
    const ev = this.w('events')
    ev.unshift({
      id: s.eventSeq++,
      at: s.now,
      tick: s.tick,
      severity,
      message,
      detail: opts.detail,
      verbose: opts.verbose,
      ref: opts.ref,
    })
    if (ev.length > 400) ev.length = 400
  }

  /* ---------------------------------------------------------------- *
   * Derived views of the yard
   * ---------------------------------------------------------------- */

  snapshotOf(): YardSnapshot {
    const snap = emptySnapshot(this.layout)
    for (const slot of Object.keys(snap)) {
      snap[slot] = (this.s.stacks[slot] ?? []).map((id) => this.s.containers[id]).filter(Boolean)
    }
    return snap
  }

  private stackCells(): Set<string> {
    return blockedCells(this.layout, this.snapshotOf())
  }

  priorityOf(c: Container): PriorityResult {
    const vessel = VESSELS.find((v) => v.name === c.vessel)
    return computePriority(c, this.s.now, vessel ? nextCutoff(vessel, this.s.now) : undefined)
  }

  private used(): number {
    let n = 0
    for (const s of this.layout.activeSlots) n += this.s.stacks[s].length
    return n
  }

  private queued(): number {
    return Object.values(this.s.gateQueues).reduce((a, q) => a + q.length, 0)
  }

  private freeCapacity(): number {
    return this.layout.capacity - this.used() - this.queued()
  }

  /** A gate or a quay by id. A box's arrival terminal is a gate for exports and a quay for imports. */
  private terminalAt(id: string): Terminal {
    return this.layout.gates.find((g) => g.id === id) ?? this.layout.quays.find((q) => q.id === id) ?? this.layout.gates[0]
  }

  private dwellOf(leg: Leg | undefined): number {
    if (!leg) return 0
    const t = this.timing
    switch (leg.kind) {
      case 'collect':
        return t.gate
      case 'depart':
        return t.quay
      case 'hoist':
      case 'lower':
        return t.lift * (leg.slow ? t.slowFactor : 1)
      default:
        return 0
    }
  }

  private assignedIds(): Set<string> {
    const out = new Set<string>()
    for (const a of this.s.agvs) {
      if (a.carrying) out.add(a.carrying)
      for (const leg of a.legs) if (leg.kind !== 'move') out.add(leg.containerId)
    }
    return out
  }

  isBusyWith(id: string): boolean {
    return this.s.jobs.some((j) => j.containerId === id) || this.assignedIds().has(id)
  }

  /** Slots a vehicle is about to lift from: nothing may be set down on them meanwhile. */
  private hoistSlots(except?: string): Set<string> {
    const out = new Set<string>()
    for (const a of this.s.agvs) {
      if (a.id === except) continue
      for (const leg of a.legs) if (leg.kind === 'hoist') out.add(leg.slot)
    }
    return out
  }

  /**
   * Slots holding a box that a vehicle is about to lift. Setting anything down
   * on these would bury it. Unlike hoistSlots this only counts boxes already in
   * the stack: a lift planned for a box that has not landed yet is no obstacle.
   */
  private liftingNow(except?: string): Set<string> {
    const out = new Set<string>()
    for (const a of this.s.agvs) {
      if (a.id === except) continue
      for (const leg of a.legs) {
        if (leg.kind === 'hoist' && this.s.stacks[leg.slot]?.includes(leg.containerId)) out.add(leg.slot)
      }
    }
    return out
  }

  private legCell(leg: Leg): Cell | null {
    const L = this.layout
    switch (leg.kind) {
      case 'hoist':
      case 'lower':
        return slotToCell(L, leg.slot)
      case 'collect':
        return this.terminalAt(leg.gate).cell
      case 'depart':
        return this.terminalAt(leg.exit).cell
      default:
        return null
    }
  }

  /** Try again shortly: the stack is in flux. */
  private defer(id: string, minutes = 0.3): null {
    this.w('backoff')[id] = this.s.now + minutes
    return null
  }

  /* ---------------------------------------------------------------- *
   * Commands
   * ---------------------------------------------------------------- */

  exec(cmd: Command): void {
    this.touched.clear()
    switch (cmd.t) {
      case 'admit':
        return this.cmdAdmit(cmd)
      case 'retrieve':
        return this.cmdRetrieve(cmd.id)
      case 'book':
        return this.cmdBook(cmd.id, cmd.fleetId, cmd.fleetName, cmd.start, cmd.end)
      case 'cancelBooking':
        return this.cmdCancelBooking(cmd.id)
      case 'estimate': {
        const c = this.s.containers[cmd.id]
        if (c && c.status !== 'departed') this.patch(cmd.id, { etd: Math.round(cmd.etd) })
        return
      }
      case 'confirm':
        return this.cmdConfirm()
      case 'cancel':
        return this.cmdCancel()
      case 'move':
        return this.cmdMove(cmd.id, cmd.slot)
      case 'setType':
        return this.cmdSetType(cmd.id, cmd.type)
      case 'setGroup':
        return this.cmdSetGroup(cmd.ids, cmd.group)
      case 'auto':
        this.s.auto = cmd.on
        return
      case 'layout':
        return this.cmdLayout(cmd.spec)
      case 'weights':
        this.weights = { ...cmd.weights }
        this.log('info', 'Allocator weights changed.', {
          detail: Object.entries(cmd.weights)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · '),
        })
        return
      case 'timing':
        this.timing = { ...cmd.timing }
        this.log('info', 'Handling times changed.', {
          detail: `lift ${cmd.timing.lift} · gate ${cmd.timing.gate} · quay ${cmd.timing.quay} min`,
        })
        return
      case 'scenario':
        return this.cmdScenario(cmd.name, cmd.arg)
    }
  }

  private cmdAdmit(o: { gate?: string; tagUid?: string; type?: ContainerType; group?: string; flow?: Flow }): void {
    if (this.freeCapacity() <= 0) {
      this.log('critical', 'Gate held: the yard is full.')
      return
    }
    this.admit(o)
  }

  /** One box through a gate. Returns false if it could not be admitted. */
  private admit(o: { gate?: string; tagUid?: string; type?: ContainerType; group?: string; flow?: Flow } = {}): boolean {
    const s = this.s
    const L = this.layout
    const isImport = o.flow === 'import'
    // exports arrive at a gate; imports are lifted off a ship onto a quay
    const arrivals = isImport ? L.quays : L.gates
    const gate = o.gate && arrivals.some((g) => g.id === o.gate) ? o.gate : arrivals[s.arrivals % arrivals.length].id
    s.arrivals++

    const hasPlugs = L.activeSlots.some((x) => isPowered(L, x))
    let type = o.type
    if (!type && s.forced && s.forced.left > 0) {
      type = s.forced.type
      this.w('forced')
      s.forced = s.forced.left > 1 ? { ...s.forced, left: s.forced.left - 1 } : null
    }
    if (type === 'reefer' && !hasPlugs) type = 'standard'

    let c: Container
    if (o.tagUid) {
      const uid = o.tagUid.toUpperCase()
      const dup = Object.values(s.containers).find((x) => x.tagUid === uid && x.status !== 'departed')
      if (dup) {
        this.log('warn', `Card ${uid} is already in the yard as ${shortId(dup.id)}.`, { ref: dup.id })
        return false
      }
      c = containerFromTag(uid, s.now, gate, { type, group: o.group })
      if (c.type === 'reefer' && !hasPlugs) c = { ...c, type: 'standard' }
      if (s.containers[c.id] && s.containers[c.id].tagUid !== uid) {
        this.log('warn', `Card ${uid} maps to marking ${c.id}, which belongs to another box. Scan rejected.`)
        return false
      }
    } else {
      // Markings must be unique: a repeat would overwrite a box already in the yard.
      do {
        c = drawContainer(s.gen, s.now, gate, { type, group: o.group })
      } while (s.containers[c.id])
      if (c.type === 'reefer' && !hasPlugs) c = { ...c, type: 'standard' }
    }
    s.gen = { ...s.gen }
    if (isImport) {
      // Nobody has said when this box will be collected. The planner assumes a typical dwell until a booking says otherwise.
      c = { ...c, flow: 'import', declared: false, etd: Math.round(s.now + IMPORT_GUESS_MINUTES) }
    }

    this.w('containers')[c.id] = c
    const q = this.w('gateQueues')
    q[gate] = [...(q[gate] ?? []), c.id]
    this.w('jobs').push({ kind: 'place', containerId: c.id, priority: this.priorityOf(c).score, createdAt: s.now })

    if (this.strategy === 'optimised' && !isImport) {
      const naiveSnap = emptySnapshot(L)
      for (const slot of Object.keys(naiveSnap)) {
        naiveSnap[slot] = (s.naiveStacks[slot] ?? []).map((id) => s.containers[id]).filter(Boolean)
      }
      const naive = allocateNaive(L, c, naiveSnap)
      if (naive) {
        this.w('naiveStacks')[naive.slot] = [...(s.naiveStacks[naive.slot] ?? []), c.id]
        this.w('metrics').naiveRehandles += naive.rehandles
      }
    }

    this.log(
      'action',
      isImport
        ? `${gate}: ${shortId(c.id)} discharged from ${c.vessel}: ${c.type}, ${c.weight}t, waiting to be booked.`
        : `${gate}: ${shortId(c.id)} arrived: ${c.type}, ${c.weight}t for ${c.destination}.`,
      {
        ref: c.id,
        detail: `RFID ${c.tagUid} · full marking ${c.id} · ${isImport ? `import, departure estimated at +${IMPORT_GUESS_MINUTES} min until booked` : `booked on ${c.vessel}`}`,
      },
    )
    return true
  }

  private enqueueRetrieve(c: Container): void {
    this.w('jobs').push({
      kind: 'retrieve',
      containerId: c.id,
      priority: this.priorityOf(c).score,
      createdAt: this.s.now,
    })
  }

  private cmdRetrieve(id: string): void {
    const s = this.s
    const c = s.containers[id]
    if (!c || c.status !== 'stored' || this.isBusyWith(id)) return
    const stack = s.stacks[c.slot!]
    const above = stack.slice((c.tier ?? 0) + 1)

    if (above.length === 0) {
      this.enqueueRetrieve(c)
      this.log('action', `${shortId(c.id)} called for the quay: top of its stack, straight lift.`, { ref: id })
      return
    }

    const p = this.priorityOf(c)
    const overdue = c.etd <= s.now
    // Failsafe: waiting for approval costs more than the dig-out does when the
    // box is already late or critical.
    if (overdue || p.band === 'critical') {
      this.enqueueRetrieve(c)
      this.w('rehandleChain')
      s.rehandleChain = above
      this.log(
        'critical',
        `${shortId(c.id)} is ${overdue ? 'overdue' : 'critical'} and buried: digging it out now, ${above.length * 2} extra moves.`,
        {
          ref: id,
          detail: `Approval skipped because the box scored ${p.score.toFixed(1)} (${p.band}). Blocking boxes: ${above
            .map((b) => shortId(s.containers[b].id))
            .join(', ')}.`,
        },
      )
      return
    }

    s.pendingPlan = this.planRetrieval(c)
    this.log(
      'warn',
      `${shortId(c.id)} is buried under ${above.length} box${above.length === 1 ? '' : 'es'}: waiting for you to approve the dig-out.`,
      {
        ref: id,
        detail: `${above.length * 2} extra moves: lift each blocker off, park it, fetch the target, put the blockers back.`,
      },
    )
  }

  private cmdConfirm(): void {
    const s = this.s
    const plan = s.pendingPlan
    if (!plan) return
    const c = s.containers[plan.containerId]
    s.pendingPlan = null
    if (!c || c.status !== 'stored') return
    this.enqueueRetrieve(c)
    s.rehandleChain = plan.blockers.map((b) => b.id)
    this.log('critical', `Dig-out started for ${shortId(c.id)}.`, {
      ref: plan.containerId,
      detail: `Blockers go to ${plan.blockers
        .map((b) => `${shortId(s.containers[b.id].id)} → ${b.to}`)
        .join(', ')}, and come back afterwards.`,
    })
  }

  private cmdCancel(): void {
    const s = this.s
    if (s.pendingPlan) {
      const c = s.containers[s.pendingPlan.containerId]
      this.log('info', `Dig-out for ${c ? shortId(c.id) : 'box'} cancelled.`)
    }
    s.pendingPlan = null
  }

  /** Why a box may not be set down at `slot` right now, or null if it may. */
  legalityAt(c: Container, slot: string): string | null {
    const L = this.layout
    if (!L.activeSlots.includes(slot)) return 'Not a stacking position.'
    const snap = this.snapshotOf()
    const without = { ...snap, [c.slot ?? '']: (snap[c.slot ?? ''] ?? []).filter((x) => x.id !== c.id) }
    const tier = Math.min(without[slot].length, L.tiers - 1) as Tier
    return checkConstraints(L, c, slot, tier, without)?.reason ?? null
  }

  private cmdMove(id: string, slot: string): void {
    const c = this.s.containers[id]
    if (!c || c.status !== 'stored' || !c.slot || this.isBusyWith(id)) return
    if (c.slot === slot) return
    const why = this.legalityAt(c, slot)
    if (why) {
      this.log('warn', `${shortId(c.id)} cannot go to ${slot}: ${why}`, { ref: id })
      return
    }
    this.w('jobs').push({ kind: 'relocate', containerId: id, priority: 30, createdAt: this.s.now, target: slot })
    this.log('action', `${shortId(c.id)} queued to move ${c.slot} → ${slot}.`, { ref: id })
  }

  /** A business books a truck to collect an import box. The booked time becomes the box's real departure time. */
  private cmdBook(id: string, fleetId: string, fleetName: string, start: number, end: number): void {
    const s = this.s
    const c = s.containers[id]
    if (!c || c.flow !== 'import' || c.status === 'departed') return
    if (start < s.now + BOOKING_MIN_LEAD) {
      this.log('warn', `${shortId(c.id)} cannot be booked for ${Math.max(0, Math.round(start - s.now))} min from now: the yard needs at least ${BOOKING_MIN_LEAD}.`, { ref: id })
      return
    }
    const rebooked = !!c.booking
    this.patch(id, {
      etd: Math.round(start),
      declared: true,
      booking: { fleetId, fleetName, start, end: Math.max(end, start + 10), madeAt: s.now, status: 'confirmed' },
    })
    this.log('action', `${shortId(c.id)} ${rebooked ? 'rebooked' : 'booked'}: ${fleetName} collects it in about ${Math.round(start - s.now)} min.`, {
      ref: id,
      detail: `Departure time is now firm (it was an estimate). The yard will bring it to the gate ${CALL_LEAD} min before the truck is due.`,
    })
  }

  private cmdCancelBooking(id: string): void {
    const s = this.s
    const c = s.containers[id]
    if (!c?.booking || c.status === 'departed') return
    const { booking, ...rest } = c
    void booking
    this.w('containers')[id] = { ...rest, declared: false, etd: Math.round(s.now + IMPORT_GUESS_MINUTES) }
    this.log('action', `Booking for ${shortId(c.id)} cancelled; its departure is an estimate again.`, { ref: id })
  }

  private cmdSetType(id: string, type: ContainerType): void {
    const s = this.s
    const L = this.layout
    const c = s.containers[id]
    if (!c || c.type === type || c.status === 'departed') return
    if (type === 'reefer' && !L.activeSlots.some((x) => isPowered(L, x))) {
      this.log('warn', 'No reefer plugs in this layout, so nothing can become a reefer.', { ref: id })
      return
    }
    const old = c.type
    this.patch(id, { type })
    this.log('action', `${shortId(c.id)} changed from ${old} to ${type}.`, { ref: id })

    if (c.status !== 'stored' || !c.slot || isPad(L, c.slot)) return
    const snap = this.snapshotOf()
    const stack = snap[c.slot]
    const idx = stack.findIndex((x) => x.id === id)
    const tester = { ...s.containers[id] }
    const probe = { ...snap, [c.slot]: stack.slice(0, idx) }
    const fail = checkConstraints(L, tester, c.slot, idx, probe)
    if (!fail || (fail.rule !== 'power' && fail.rule !== 'segregation')) return

    const res = allocate(L, tester, this.snapshotWithout(id), slotToCell(L, c.slot), this.weights)
    const to = res.candidates.find((k) => k.slot !== c.slot && this.s.stacks[k.slot].length < L.tiers)
    if (!to) {
      this.patch(id, { type: old })
      this.log('critical', `${shortId(c.id)} cannot become ${type}: ${fail.reason} and nowhere legal to move it. Change reverted.`, { ref: id })
      return
    }
    this.w('jobs').push({ kind: 'relocate', containerId: id, priority: 60, createdAt: s.now, target: to.slot })
    this.log('warn', `${shortId(c.id)} is a ${type} now and must leave ${c.slot}: moving it to ${to.slot}.`, {
      ref: id,
      detail: fail.reason,
    })
  }

  private snapshotWithout(id: string): YardSnapshot {
    const snap = this.snapshotOf()
    for (const k of Object.keys(snap)) snap[k] = snap[k].filter((x) => x.id !== id)
    return snap
  }

  private cmdSetGroup(ids: string[], group: string | null): void {
    const name = group?.trim() || undefined
    let n = 0
    for (const id of ids) {
      if (!this.s.containers[id]) continue
      this.patch(id, { group: name })
      n++
    }
    if (n) {
      this.log('action', name ? `${n} box${n === 1 ? '' : 'es'} grouped as "${name}".` : `${n} box${n === 1 ? '' : 'es'} ungrouped.`)
    }
  }

  private cmdScenario(name: ScenarioName, arg?: string): void {
    const s = this.s
    switch (name) {
      case 'surge':
        s.burst = { left: 10, timer: 0 }
        this.log('warn', 'Scenario: vessel surge. Ten boxes are about to hit the gates.')
        return
      case 'gate-burst': {
        let n = 0
        for (let i = 0; i < 6 && this.freeCapacity() > 0; i++) if (this.admit()) n++
        this.log('warn', `Scenario: gate burst. ${n} boxes arrived at once.`)
        return
      }
      case 'discharge': {
        let n = 0
        for (let i = 0; i < 6 && this.freeCapacity() > 0; i++) if (this.admit({ flow: 'import' })) n++
        this.log('warn', `Scenario: vessel discharge. ${n} import boxes were lifted onto the quay; none has a pickup booked yet.`)
        return
      }
      case 'reefer-storm':
        s.forced = { type: 'reefer', left: 6 }
        this.log('warn', 'Scenario: reefer storm. The next six arrivals are all reefers.')
        return
      case 'cutoff-rush': {
        const dest = arg ?? Object.values(s.containers).find((c) => c.status === 'stored')?.destination
        if (!dest) {
          this.log('info', 'Cutoff rush needs stored boxes first.')
          return
        }
        let n = 0
        for (const c of Object.values(s.containers)) {
          if (c.status === 'stored' && c.destination === dest) {
            this.patch(c.id, { etd: Math.min(c.etd, s.now + 15) })
            n++
          }
        }
        this.log('critical', `Scenario: cutoff rush. ${VESSELS.find((v) => v.destination === dest)?.name ?? dest} closes in 15 minutes, ${n} boxes due.`)
        return
      }
      case 'breakdown': {
        const target =
          s.agvs.find((a) => a.id === arg) ??
          [...s.agvs].sort((a, b) => b.busyMinutes - a.busyMinutes)[0]
        if (!target) return
        this.w('agvs')
        s.agvs = s.agvs.map((a) => (a.id === target.id ? { ...a, brokenUntil: s.now + 25 } : a))
        this.log('critical', `Scenario: ${target.id} breakdown. It stops at the next cell for 25 minutes.`)
        return
      }
    }
  }

  /**
   * Why a layout change cannot be applied right now, or null if it can. `busy`
   * clears by itself once the vehicles finish; `orphans` needs the operator to
   * retrieve or move boxes first.
   */
  layoutBlocker(spec: LayoutSpec): { kind: 'busy' | 'orphans'; message: string } | null {
    const s = this.s
    const next = buildLayout(spec)
    const busy = s.agvs.some(
      (a) =>
        a.carrying ||
        a.legs.some((l) => !(l.kind === 'move' && (l.note === BAY_NOTE || l.note === EVADE_NOTE))),
    )
    if (busy) return { kind: 'busy', message: 'Layout not changed: vehicles are mid-task.' }

    const stuck: string[] = []
    for (const c of Object.values(s.containers)) {
      if (c.status !== 'stored' || !c.slot) continue
      const stackLen = s.stacks[c.slot]?.length ?? 0
      const ok = isPad(next, c.slot) || (next.activeSlots.includes(c.slot) && stackLen <= next.tiers)
      if (!ok) stuck.push(`${shortId(c.id)} in ${c.slot}`)
    }
    if (stuck.length) {
      return {
        kind: 'orphans',
        message: `Layout not changed: ${stuck.slice(0, 3).join(', ')}${stuck.length > 3 ? '…' : ''} would be left without a position. Retrieve or move them first.`,
      }
    }
    return null
  }

  private cmdLayout(spec: LayoutSpec): void {
    const s = this.s
    const blocker = this.layoutBlocker(spec)
    if (blocker) {
      this.log('warn', blocker.message)
      return
    }
    const next = buildLayout(spec)

    this.layout = next
    const stacks: Record<string, string[]> = {}
    for (const id of next.slotIds) stacks[id] = s.stacks[id] ?? []
    for (const p of next.pads) stacks[p.id] = s.stacks[p.id] ?? []
    s.stacks = stacks
    this.touched.add('stacks')

    const queues: Record<string, string[]> = {}
    for (const g of next.gates) queues[g.id] = s.gateQueues[g.id] ?? []
    for (const q of next.quays) queues[q.id] = s.gateQueues[q.id] ?? []
    // boxes waiting at a terminal that no longer exists go to the first terminal of the same kind
    for (const [tid, ids] of Object.entries(s.gateQueues)) {
      if (queues[tid]) continue
      const fallback = tid.startsWith('Q') ? next.quays[0].id : next.gates[0].id
      queues[fallback] = [...queues[fallback], ...ids]
      for (const id of ids) this.patch(id, { gate: fallback })
    }
    s.gateQueues = queues
    this.touched.add('gateQueues')

    s.agvs = this.freshAgvs(s.agvs)
    this.table = new ReservationTable()
    for (const a of s.agvs) this.table.park(a.id, 0, a.cell, s.now, 'parked')
    s.naiveStacks = this.emptyStacks()
    s.lastAllocation = null
    s.route = null
    s.pendingPlan = null
    s.rehandleChain = []
    this.log('good', this.bootMessage().replace('Yard online', 'Layout applied'))
  }

  /* ---------------------------------------------------------------- *
   * Planning
   * ---------------------------------------------------------------- */

  private planRetrieval(target: Container): RetrievalPlan {
    const slot = target.slot!
    const above = this.s.stacks[slot].slice((target.tier ?? 0) + 1)
    const working = this.snapshotOf()
    const blockers: RetrievalPlan['blockers'] = []

    for (const id of [...above].reverse()) {
      const blocker = this.s.containers[id]
      const to = this.pickTempSlot(blocker, working, slot, undefined, blockers.map((b) => b.to))
      if (!to) continue
      blockers.push({ id, from: slot, to })
      working[slot] = working[slot].filter((c) => c.id !== id)
      working[to] = [...working[to], blocker]
    }

    // Two situations wear the same shape: boxes on top leave later than this
    // one (the stack was built wrong; pure waste) or sooner (the stack was
    // right; the dig-out is the price of calling this box forward early).
    const wasted = blockers.every((b) => this.s.containers[b.id].etd > target.etd)
    return { containerId: target.id, slot, blockers, wasted, extraMoves: blockers.length * 2 }
  }

  private inFlightTargets(exclude?: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const a of this.s.agvs) {
      if (a.id === exclude) continue
      for (const leg of a.legs) if (leg.kind === 'lower') out[leg.slot] = (out[leg.slot] ?? 0) + 1
    }
    return out
  }

  /**
   * Where a blocking box goes while the one beneath it is fetched. A real
   * stacking position is preferred; the transfer pads guarantee a dig-out can
   * never be impossible.
   */
  private pickTempSlot(
    blocker: Container,
    yard: YardSnapshot,
    avoid: string,
    agvId: string | undefined,
    taken: string[] = [],
  ): string | null {
    const L = this.layout
    const inFlight = this.inFlightTargets(agvId)
    const lifting = this.hoistSlots()
    const room = (slot: string) => !lifting.has(slot) && yard[slot].length + (inFlight[slot] ?? 0) < L.tiers

    if (this.strategy === 'naive') {
      for (const slot of L.activeSlots) {
        if (slot === avoid || taken.includes(slot) || !room(slot)) continue
        if (checkConstraints(L, blocker, slot, yard[slot].length, yard)) continue
        return slot
      }
    } else {
      const result = allocate(L, blocker, yard, slotToCell(L, avoid), this.weights)
      const pick = result.candidates.find((c) => c.slot !== avoid && !taken.includes(c.slot) && room(c.slot))
      if (pick) return pick.slot
    }

    const pad = L.pads.find(
      (p) =>
        (this.s.stacks[p.id]?.length ?? 0) === 0 && !taken.includes(p.id) && !inFlight[p.id] && !lifting.has(p.id),
    )
    return pad?.id ?? null
  }

  /** The slot an arriving box should go to, honouring boxes already in flight. */
  private chooseSlot(
    c: Container,
    from: Cell,
    agvId: string,
  ): { slot: string; tier: Tier; score: number; rehandles: number; result: AllocationResult | null } | null {
    const L = this.layout
    const snap = this.snapshotOf()
    const inFlight = this.inFlightTargets(agvId)
    const lifting = this.hoistSlots()
    const room = (slot: string) => !lifting.has(slot) && snap[slot].length + (inFlight[slot] ?? 0) < L.tiers

    if (this.strategy === 'naive') {
      for (const slot of L.activeSlots) {
        const tier = snap[slot].length as Tier
        if (!room(slot) || checkConstraints(L, c, slot, tier, snap)) continue
        return { slot, tier, score: 0, rehandles: snap[slot].filter((x) => x.etd < c.etd).length, result: null }
      }
      return null
    }

    const result = allocate(L, c, snap, from, this.weights)
    const pick: Candidate | undefined = result.candidates.find((k) => room(k.slot))
    return pick ? { slot: pick.slot, tier: pick.tier, score: pick.score, rehandles: pick.rehandles, result } : null
  }

  /* ---------------------------------------------------------------- *
   * Gate, call-forward and dispatch
   * ---------------------------------------------------------------- */

  private autoArrivals(): void {
    const s = this.s
    if (s.arrivalCap !== null && s.arrivals >= s.arrivalCap) return
    s.arrivalTimer += TICK
    if (s.arrivalTimer < ARRIVAL_INTERVAL) return
    s.arrivalTimer = 0
    // Back-pressure: raw capacity is not legal capacity. Reefer power, hazmat
    // segregation and the weight rule shrink what is usable, so filling to the
    // brim gridlocks the yard. Ground slots are the binding constraint.
    const L = this.layout
    const groundFree = L.activeSlots.filter((x) => s.stacks[x].length === 0).length
    const roomToWork = groundFree > 0 || this.queued() === 0
    if (this.queued() < 3 * L.gates.length && this.freeCapacity() >= 4 && roomToWork) this.admit()
  }

  private surge(): void {
    const b = this.s.burst
    if (!b) return
    const timer = b.timer - TICK
    if (timer > 0) {
      this.s.burst = { ...b, timer }
      return
    }
    if (this.freeCapacity() > 0) this.admit()
    this.s.burst = b.left > 1 ? { left: b.left - 1, timer: 0.5 } : null
  }

  private callForward(): void {
    const s = this.s
    const busy = this.assignedIds()
    const queuedIds = new Set(s.jobs.map((j) => j.containerId))
    for (const id of Object.keys(s.containers)) {
      const c = s.containers[id]
      if (c.status !== 'stored' || busy.has(id) || queuedIds.has(id)) continue
      if (c.flow === 'import') continue // an import leaves when its truck is booked (see serviceBookings)
      if (c.etd - s.now > CALL_FORWARD) continue
      this.enqueueRetrieve(c)
      queuedIds.add(id)
      this.log('warn', `${c.vessel} is calling ${shortId(c.id)} forward: due out in ${Math.round(c.etd - s.now)} min.`, { ref: id })
    }

    // Boxes parked on a pad are in the wrong place by definition: move them
    // into the yard as soon as a legal position exists.
    for (const pad of this.layout.pads) {
      const id = s.stacks[pad.id]?.[0]
      const c = id ? s.containers[id] : undefined
      if (!c || c.status !== 'stored' || busy.has(c.id) || queuedIds.has(c.id)) continue
      if ((s.backoff['pad' + c.id] ?? 0) > s.now) continue
      this.w('backoff')['pad' + c.id] = s.now + 3
      const snap = this.snapshotWithout(c.id)
      const lifting = this.hoistSlots()
      const inFlight = this.inFlightTargets()
      const res = allocate(this.layout, c, snap, pad.cell, this.weights)
      const to = res.candidates.find(
        (k) => !lifting.has(k.slot) && s.stacks[k.slot].length + (inFlight[k.slot] ?? 0) < this.layout.tiers,
      )
      if (!to) continue
      this.w('jobs').push({ kind: 'relocate', containerId: c.id, priority: 25, createdAt: s.now, target: to.slot })
      queuedIds.add(c.id)
      this.log('info', `${shortId(c.id)} moves from pad ${pad.id} to ${to.slot}.`, { ref: c.id, verbose: true })
    }

    // Congestion drain: without it the yard can sit full with nothing yet due,
    // which stalls everything (no arrivals by back-pressure, no departures).
    const occ = this.used() / Math.max(1, this.layout.capacity)
    if (occ <= 0.7) return
    if (s.jobs.filter((j) => j.kind === 'retrieve').length >= 2) return
    const next = Object.values(s.containers)
      .filter((c) => c.status === 'stored' && c.flow !== 'import' && !busy.has(c.id) && !queuedIds.has(c.id))
      .map((c) => ({ c, p: this.priorityOf(c) }))
      .sort((a, b) => b.p.score - a.p.score || a.c.etd - b.c.etd)[0]
    if (!next) return
    this.enqueueRetrieve(next.c)
    this.log('warn', `Yard ${Math.round(occ * 100)}% full: bringing ${shortId(next.c.id)} forward to free space.`, { ref: next.c.id })
  }

  /**
   * Import boxes leave only when a truck comes for them. A booked box is brought to the gate shortly
   * before its window; one nobody books is eventually collected by a walk-in truck. Runs whether or not
   * auto mode is on, because bookings are an operator action, not a simulation setting.
   */
  private serviceBookings(): void {
    const s = this.s
    const busy = this.assignedIds()
    const queued = new Set(s.jobs.map((j) => j.containerId))
    for (const c of Object.values(s.containers)) {
      if (c.flow !== 'import' || c.status === 'departed') continue
      const b = c.booking
      if (b) {
        if (b.status === 'confirmed' && s.now >= b.start) {
          this.patch(c.id, { booking: { ...b, status: 'arrived' } })
          this.log('info', `${b.fleetName} has arrived for ${shortId(c.id)} and is waiting.`, { ref: c.id, verbose: true })
        }
        if (c.status === 'stored' && !busy.has(c.id) && !queued.has(c.id) && s.now >= b.start - CALL_LEAD) {
          this.enqueueRetrieve(c)
          queued.add(c.id)
          this.log('warn', `${shortId(c.id)} is being brought to the gate for ${b.fleetName}, due in ${Math.max(0, Math.round(b.start - s.now))} min.`, { ref: c.id })
        }
        if (b.status !== 'late' && b.status !== 'released' && s.now > b.end) {
          this.patch(c.id, { booking: { ...b, status: 'late' } })
          this.log('critical', `${shortId(c.id)} missed its pickup window: ${b.fleetName} is waiting.`, { ref: c.id })
        }
      } else if (c.status === 'stored' && s.now - c.arrivedAt >= IMPORT_MAX_DWELL && !busy.has(c.id) && !queued.has(c.id)) {
        this.enqueueRetrieve(c)
        queued.add(c.id)
        this.log('warn', `${shortId(c.id)} was never booked: after ${Math.round(s.now - c.arrivedAt)} min it goes to a walk-in truck.`, { ref: c.id })
      }
    }
  }

  private isFree(a: Agv): boolean {
    return (
      a.mode === 'idle' &&
      !a.carrying &&
      a.brokenUntil <= this.s.now &&
      (a.legs.length === 0 || (a.legs.length === 1 && a.legs[0].kind === 'move' && a.legs[0].note === BAY_NOTE))
    )
  }

  private jobOrigin(j: Job): Cell | null {
    const c = this.s.containers[j.containerId]
    if (!c) return null
    if (j.kind === 'place') return this.terminalAt(c.gate).cell
    return c.slot ? slotToCell(this.layout, c.slot) : null
  }

  private dispatch(): void {
    const s = this.s
    if (s.jobs.length === 0) return
    let free = s.agvs.filter((a) => this.isFree(a))
    if (free.length === 0) return

    const filling = this.used() / Math.max(1, this.layout.capacity) > 0.6
    const queue = [...s.jobs].sort((a, b) => {
      // Once the yard is filling, moving boxes out beats moving more in:
      // otherwise arrivals win on priority forever and the yard never drains.
      if (filling && a.kind !== b.kind) {
        if (a.kind === 'retrieve') return -1
        if (b.kind === 'retrieve') return 1
      }
      return b.priority - a.priority || a.createdAt - b.createdAt
    })
    const done: Job[] = []

    for (const job of queue) {
      if (free.length === 0) break
      if ((s.backoff[job.containerId] ?? 0) > s.now) continue
      const at = this.jobOrigin(job)
      if (!at) {
        done.push(job)
        continue
      }
      // nearest free vehicle to where the work is
      const agv = [...free].sort(
        (a, b) =>
          Math.abs(a.cell.x - at.x) + Math.abs(a.cell.y - at.y) - (Math.abs(b.cell.x - at.x) + Math.abs(b.cell.y - at.y)) ||
          a.id.localeCompare(b.id),
      )[0]
      const built =
        job.kind === 'place' ? this.buildPlace(job, agv) : job.kind === 'retrieve' ? this.buildRetrieve(job, agv) : this.buildRelocate(job, agv)
      if (built === 'drop') {
        done.push(job)
        continue
      }
      if (!built) continue
      done.push(job)
      free = free.filter((a) => a.id !== agv.id)
      s.agvs = s.agvs.map((a) => (a.id === agv.id ? built : a))
    }
    if (done.length) s.jobs = s.jobs.filter((j) => !done.includes(j))
  }

  private buildPlace(job: Job, agv: Agv): Agv | null | 'drop' {
    const s = this.s
    const c = s.containers[job.containerId]
    if (!c || c.status !== 'inbound') return 'drop'
    const gate = this.terminalAt(c.gate)
    const chosen = this.chooseSlot(c, gate.cell, agv.id)

    if (!chosen) {
      if (!s.warned['p' + c.id]) {
        this.w('warned')['p' + c.id] = true
        this.log('critical', `${shortId(c.id)} is waiting at ${gate.id}: no legal position for it yet.`, {
          ref: c.id,
          detail: 'Every position was rejected by a hard rule (power, weight, segregation or capacity).',
        })
      }
      this.w('backoff')[c.id] = s.now + RETRY
      return null
    }
    delete this.w('backoff')[c.id]
    delete this.w('warned')['p' + c.id]

    if (chosen.result) {
      s.lastAllocation = chosen.result
      s.allocationSeq++
    }
    const { slot, tier, score, rehandles, result } = chosen
    const best = result?.candidates.find((k) => k.slot === slot)
    this.w('decisions')[c.id] = {
      slot,
      tier,
      score,
      at: s.now,
      evaluated: result?.evaluated ?? 0,
      strategy: this.strategy,
      breakdown: best?.breakdown ?? [],
      runnersUp: (result?.candidates ?? []).filter((k) => k.slot !== slot).slice(0, 3).map((k) => ({ slot: k.slot, score: k.score })),
      rejected: (result?.rejected ?? []).map((r) => ({ slot: r.slot, reason: r.reason })),
      route: best ? { cells: best.path.steps, turns: best.path.turns, cost: best.path.cost } : null,
    }
    const runnerUp = result?.candidates.find((k) => k.slot !== slot)
    this.log(
      'good',
      `${shortId(c.id)} → ${slot}, ${tier === 0 ? 'ground' : `tier ${tier + 1}`}${rehandles === 0 ? '' : `: buries ${rehandles} earlier departure`}.`,
      {
        ref: c.id,
        detail: result
          ? `Best of ${result.evaluated} positions, score ${score.toFixed(1)}${runnerUp ? ` against ${runnerUp.score.toFixed(1)} for ${runnerUp.slot}` : ''}.`
          : 'First available legal position.',
      },
    )
    if (rehandles > 0) this.w('metrics').plannedRehandles += rehandles

    return {
      ...agv,
      priority: job.priority,
      taskLabel: `Place ${c.id} → ${slot}`,
      legs: [
        { kind: 'move', goal: gate.cell, note: `to ${gate.id}` },
        { kind: 'collect', containerId: c.id, gate: gate.id },
        { kind: 'move', goal: slotToCell(this.layout, slot), note: `to ${slot}` },
        { kind: 'lower', containerId: c.id, slot },
      ],
    }
  }

  /** Legs that lift every box off the target and park it, plus the restack legs. */
  private digOut(
    container: Container,
    agv: Agv,
  ): { legs: Leg[]; restack: Leg[]; parked: { id: string; slot: string }[] } | 'blocked' {
    const L = this.layout
    const slot = container.slot!
    const stack = this.s.stacks[slot]
    const above = stack.slice(stack.indexOf(container.id) + 1)

    // The stack must be still: no box in the air towards it, none of its boxes
    // already assigned to another vehicle.
    const assigned = this.assignedIds()
    if ((this.inFlightTargets(agv.id)[slot] ?? 0) > 0 || assigned.has(container.id) || above.some((id) => assigned.has(id))) {
      this.defer(container.id)
      return 'blocked'
    }
    const legs: Leg[] = []
    const restack: Leg[] = []
    const parked: { id: string; slot: string }[] = []
    const working = this.snapshotOf()

    for (const blockerId of [...above].reverse()) {
      const blocker = this.s.containers[blockerId]
      const temp = this.pickTempSlot(blocker, working, slot, agv.id, parked.map((p) => p.slot))
      if (!temp) {
        if (!this.s.warned['d' + container.id]) {
          this.w('warned')['d' + container.id] = true
          this.log('critical', `${shortId(container.id)} cannot be dug out yet: nowhere to put ${shortId(blocker.id)} down. Waiting for space.`, { ref: container.id })
        }
        this.w('backoff')[container.id] = this.s.now + RETRY
        return 'blocked'
      }
      if (isPad(L, temp)) {
        this.log('warn', `No yard position free for ${shortId(blocker.id)}: parking it on pad ${temp}.`, {
          ref: blocker.id,
          detail: 'The transfer pads exist so a dig-out is never impossible; the box returns once the target is away.',
        })
      }
      legs.push({ kind: 'move', goal: slotToCell(L, slot), note: `to ${slot}` })
      legs.push({ kind: 'hoist', containerId: blockerId, slot, slow: true })
      legs.push({ kind: 'move', goal: slotToCell(L, temp), note: `set down at ${temp}` })
      legs.push({ kind: 'lower', containerId: blockerId, slot: temp, slow: true })
      parked.push({ id: blockerId, slot: temp })
      working[slot] = working[slot].filter((c) => c.id !== blockerId)
      working[temp] = [...working[temp], blocker]
    }

    for (const p of [...parked].reverse()) {
      restack.push({ kind: 'move', goal: slotToCell(L, p.slot), note: `recover from ${p.slot}` })
      restack.push({ kind: 'hoist', containerId: p.id, slot: p.slot, slow: true })
      restack.push({ kind: 'move', goal: slotToCell(L, slot), note: `restack at ${slot}` })
      restack.push({ kind: 'lower', containerId: p.id, slot, slow: true })
    }

    if (this.s.warned['d' + container.id]) delete this.w('warned')['d' + container.id]
    delete this.w('backoff')[container.id]
    if (above.length) {
      this.w('metrics').rehandleMoves += above.length
      this.s.rehandleChain = above
      this.log('warn', `${above.map((id) => shortId(this.s.containers[id].id)).join(', ')} must come off ${slot} before ${shortId(container.id)} can move.`, { ref: container.id })
    }
    return { legs, restack, parked }
  }

  private nearestTerminal(list: Terminal[], from: Cell): Terminal {
    return [...list].sort(
      (a, b) => Math.abs(a.cell.x - from.x) + Math.abs(a.cell.y - from.y) - (Math.abs(b.cell.x - from.x) + Math.abs(b.cell.y - from.y)),
    )[0]
  }

  private buildRetrieve(job: Job, agv: Agv): Agv | null | 'drop' {
    const c = this.s.containers[job.containerId]
    if (!c || c.status !== 'stored' || !c.slot) return 'drop'
    if (this.s.stacks[c.slot].indexOf(c.id) < 0) return 'drop'
    const dig = this.digOut(c, agv)
    if (dig === 'blocked') return null

    const L = this.layout
    // exports go to a quay for the ship; imports go to a gate for the truck
    const exit = this.nearestTerminal(c.flow === 'import' ? L.gates : L.quays, slotToCell(L, c.slot))
    return {
      ...agv,
      priority: job.priority,
      taskLabel: `Retrieve ${c.id}`,
      legs: [
        ...dig.legs,
        { kind: 'move', goal: slotToCell(L, c.slot), note: `to ${c.slot}` },
        { kind: 'hoist', containerId: c.id, slot: c.slot },
        { kind: 'move', goal: exit.cell, note: `to ${exit.id}` },
        { kind: 'depart', containerId: c.id, exit: exit.id },
        ...dig.restack,
      ],
    }
  }

  private buildRelocate(job: Job, agv: Agv): Agv | null | 'drop' {
    const c = this.s.containers[job.containerId]
    const target = job.target
    if (!c || c.status !== 'stored' || !c.slot || !target) return 'drop'
    const why = this.legalityAt(c, target)
    if (this.hoistSlots().has(target)) return this.defer(c.id)
    const room = this.s.stacks[target].length + (this.inFlightTargets(agv.id)[target] ?? 0) < this.layout.tiers
    if (why || !room) {
      this.log('warn', `Move of ${shortId(c.id)} to ${target} dropped: ${why ?? 'no room any more'}.`, { ref: c.id })
      return 'drop'
    }
    const dig = this.digOut(c, agv)
    if (dig === 'blocked') return null

    const L = this.layout
    return {
      ...agv,
      priority: job.priority,
      taskLabel: `Move ${c.id} → ${target}`,
      legs: [
        ...dig.legs,
        { kind: 'move', goal: slotToCell(L, c.slot), note: `to ${c.slot}` },
        { kind: 'hoist', containerId: c.id, slot: c.slot },
        { kind: 'move', goal: slotToCell(L, target), note: `to ${target}` },
        { kind: 'lower', containerId: c.id, slot: target },
        ...dig.restack,
      ],
    }
  }

  /* ---------------------------------------------------------------- *
   * Vehicle execution
   * ---------------------------------------------------------------- */

  private claimHere(agv: Agv, label = 'parked'): void {
    this.table.park(agv.id, agv.priority, agv.cell, this.s.now, label)
  }

  private stepAgv(input: Agv): Agv {
    const s = this.s
    let agv = input

    if (agv.mode === 'broken') {
      if (s.now < agv.brokenUntil) return agv
      this.log('good', `${agv.id} is repaired and back in service.`)
      agv = { ...agv, mode: 'idle', brokenUntil: 0 }
    } else if (agv.brokenUntil > s.now && agv.mode === 'idle') {
      this.claimHere(agv, 'broken down')
      this.log('critical', `${agv.id} has broken down at ${cellKey(agv.cell)}; other vehicles are routing around it.`, { verbose: true })
      return { ...agv, mode: 'broken' }
    }

    if (agv.mode === 'held') {
      if (s.now < agv.holdUntil) return agv
      agv = { ...agv, mode: 'idle', holdReason: null, waitingFor: null }
    }

    if (agv.mode === 'moving' && agv.path) {
      agv = this.advance(agv)
      agv.busyMinutes += TICK
      if (agv.mode === 'moving') return agv
    }

    if (agv.mode === 'hoisting' || agv.mode === 'lowering') {
      agv = { ...agv, liftT: agv.liftT + TICK / agv.liftTotal, busyMinutes: agv.busyMinutes + TICK }
      if (agv.liftT < 1) return agv
      return this.completeLift(agv)
    }

    const leg = agv.legs[0]
    if (!leg) {
      // Back to the bay, unless someone is waiting for this vehicle to get out
      // of their way (it would only drive straight back into it).
      const needed = s.agvs.some((o) => o.mode === 'held' && o.waitingFor === agv.id)
      if (!agv.carrying && !needed && (agv.cell.x !== agv.bay.x || agv.cell.y !== agv.bay.y)) {
        return { ...agv, taskLabel: null, route: null, priority: 0, legs: [{ kind: 'move', goal: agv.bay, note: BAY_NOTE }] }
      }
      if (agv.taskLabel || agv.route || agv.priority) return { ...agv, taskLabel: null, route: null, priority: 0 }
      return agv
    }

    agv = { ...agv, busyMinutes: agv.busyMinutes + TICK }
    switch (leg.kind) {
      case 'move':
        return this.beginMove(agv, leg.goal, leg.note)
      case 'collect':
      case 'hoist':
        return { ...agv, mode: 'hoisting', liftT: 0, liftTotal: this.dwellOf(leg) }
      case 'lower':
      case 'depart':
        return { ...agv, mode: 'lowering', liftT: 0, liftTotal: this.dwellOf(leg) }
    }
  }

  private beginMove(agv: Agv, goal: Cell, note: string): Agv {
    const s = this.s
    const L = this.layout
    if (agv.cell.x === goal.x && agv.cell.y === goal.y) {
      return { ...agv, legs: agv.legs.slice(1), path: null, mode: 'idle' }
    }

    const blocked = this.stackCells()
    blocked.delete(cellKey(agv.cell))
    const path = findPath(L, agv.cell, goal, { blocked, facing: agv.facing })
    if (!path.ok) {
      this.log('critical', `${agv.id} cannot get through: ${path.reason}`)
      this.claimHere(agv)
      return { ...agv, mode: 'held', holdUntil: s.now + MINUTES_PER_CELL * 3, holdReason: path.reason, waitingFor: null }
    }

    const cargo = agv.carrying ? s.containers[agv.carrying] : null
    const cargoLabel = cargo ? `carrying ${this.priorityOf(cargo).band}-priority ${shortId(cargo.id)}` : 'running empty'

    const decision = resolveTraffic(L, {
      agvId: agv.id,
      cargoLabel,
      start: agv.cell,
      goal,
      path,
      startAt: s.now,
      facing: agv.facing,
      blocked,
      table: this.table,
    })

    if (decision.action === 'hold') {
      this.w('metrics').holds++
      this.log('warn', decision.reason, { verbose: true })
      this.claimHere(agv)
      return {
        ...agv,
        mode: 'held',
        holdUntil: decision.until,
        holdReason: `Holding for ${decision.conflictWith} at ${decision.at}`,
        waitingFor: decision.conflictWith,
        route: path.path,
      }
    }

    this.table.reserve(agv.id, agv.priority, decision.timed, cargoLabel)
    if (decision.action === 'reroute') this.log('info', decision.reason, { verbose: true })

    const chosen = decision.path
    if (agv.carrying && note !== BAY_NOTE) {
      s.route = {
        agvId: agv.id,
        path: chosen,
        explored: (path as PathOk).explored,
        cost: path.cost,
        turns: path.turns,
      }
    }

    return {
      ...agv,
      mode: 'moving',
      path: chosen,
      pathIndex: 0,
      segT: 0,
      segTimes: segmentTimes(L, chosen, agv.facing),
      segPause: segmentPauses(chosen, agv.facing),
      route: chosen,
      holdReason: null,
      waitingFor: null,
    }
  }

  private advance(agv: Agv): Agv {
    const path = agv.path!
    let idx = agv.pathIndex
    let t = agv.segT
    let rem = TICK
    let entered = 0
    while (idx < path.length - 1) {
      const total = agv.segTimes[idx]
      const need = (1 - t) * total
      if (rem >= need) {
        rem -= need
        idx++
        entered++
        t = 0
      } else {
        t += rem / total
        break
      }
    }
    if (entered) this.w('metrics').cells += entered

    if (idx >= path.length - 1) {
      const end = path[path.length - 1]
      const prev = path[path.length - 2]
      return {
        ...agv,
        cell: end,
        pos: { x: end.x, y: end.y },
        facing: prev ? dirIndex(prev, end) : agv.facing,
        path: null,
        pathIndex: 0,
        segT: 0,
        mode: 'idle',
        legs: agv.legs.slice(1),
      }
    }

    const a = path[idx]
    const b = path[idx + 1]
    return {
      ...agv,
      cell: a,
      pathIndex: idx,
      segT: t,
      facing: dirIndex(a, b),
      pos: (() => {
        const g = glide(t, agv.segTimes[idx], agv.segPause[idx] ?? 0)
        return { x: a.x + (b.x - a.x) * g, y: a.y + (b.y - a.y) * g }
      })(),
    }
  }

  /**
   * A box set down somewhere other than planned must still be found where it
   * actually is: later legs that recover it from the old slot are re-pointed,
   * along with the drive that precedes them.
   */
  private retarget(legs: Leg[], containerId: string, from: string, to: string): Leg[] {
    const L = this.layout
    return legs.map((leg, i) => {
      if ((leg.kind === 'hoist' || leg.kind === 'lower') && leg.containerId === containerId && leg.slot === from) {
        return { ...leg, slot: to }
      }
      const nxt = legs[i + 1]
      if (leg.kind === 'move' && nxt?.kind === 'hoist' && nxt.containerId === containerId && nxt.slot === from) {
        return { ...leg, goal: slotToCell(L, to), note: `recover from ${to}` }
      }
      return leg
    })
  }

  private completeLift(agv: Agv): Agv {
    const s = this.s
    const L = this.layout
    const leg = agv.legs[0]
    const rest = agv.legs.slice(1)
    if (!leg) return { ...agv, mode: 'idle', liftT: 0 }

    if (leg.kind === 'collect') {
      const q = this.w('gateQueues')
      q[leg.gate] = (q[leg.gate] ?? []).filter((id) => id !== leg.containerId)
      const c = s.containers[leg.containerId]
      const m = this.w('metrics')
      m.gateWaitTotal += s.now - c.arrivedAt
      m.gateWaitCount++
      this.patch(leg.containerId, { status: 'retrieving' })
      return { ...agv, mode: 'idle', liftT: 0, carrying: leg.containerId, legs: rest }
    }

    if (leg.kind === 'hoist') {
      this.setStack(leg.slot, s.stacks[leg.slot].filter((id) => id !== leg.containerId))
      this.patch(leg.containerId, { status: 'retrieving', slot: null, tier: null })
      return { ...agv, mode: 'idle', liftT: 0, carrying: leg.containerId, legs: rest }
    }

    if (leg.kind === 'lower') {
      const box = s.containers[leg.containerId]
      const snap = this.snapshotOf()
      const targetTier = Math.min(s.stacks[leg.slot].length, L.tiers - 1)
      // Plans are made independently, so another vehicle may have booked a lift
      // from this very stack since ours was drawn up. Setting a box down on top
      // of it would leave the base box impossible to lift.
      const illegal = this.liftingNow(agv.id).has(leg.slot)
        ? { rule: 'lifting', reason: `Another vehicle is about to lift from ${leg.slot}.` }
        : isPad(L, leg.slot)
          ? s.stacks[leg.slot].length > 0
            ? { rule: 'capacity', reason: `Transfer pad ${leg.slot} is occupied.` }
            : null
          : checkConstraints(L, box, leg.slot, targetTier, snap)
      if (illegal) {
        // The slot changed under us mid-flight. Re-run the allocator rather than
        // forcing an illegal stack, and say so in the log.
        const redo = allocate(L, box, snap, slotToCell(L, leg.slot), this.weights)
        const inFlight = this.inFlightTargets(agv.id)
        // never a stack with a lift pending on it, including this vehicle's own
        // (a blocker must not be set back down on the box it is digging out)
        const lifting = this.liftingNow()
        const next = redo.candidates.find(
          (c) => c.slot !== leg.slot && !lifting.has(c.slot) && s.stacks[c.slot].length + (inFlight[c.slot] ?? 0) < L.tiers,
        )
        if (next) {
          this.log('warn', `${leg.slot} was taken while ${shortId(box.id)} was in the air: moved to ${next.slot}.`, {
            ref: box.id,
            verbose: true,
            detail: illegal.reason,
          })
          return {
            ...agv,
            mode: 'idle',
            liftT: 0,
            legs: [
              { kind: 'move', goal: slotToCell(L, next.slot), note: `to ${next.slot}` },
              { kind: 'lower', containerId: leg.containerId, slot: next.slot },
              ...this.retarget(rest, leg.containerId, leg.slot, next.slot),
            ],
          }
        }
        // No legal stacking position at all. A transfer pad always accepts a
        // box, so use one rather than leave the vehicle stuck on a cell the rest
        // of the yard needs; the box is re-slotted once a legal position opens.
        const pad = L.pads.find(
          (p) =>
            p.id !== leg.slot &&
            s.stacks[p.id].length === 0 &&
            !inFlight[p.id] &&
            !lifting.has(p.id),
        )
        if (pad) {
          this.log('warn', `No legal position for ${shortId(box.id)}: parking it on pad ${pad.id} until one opens up.`, {
            ref: box.id,
            detail: illegal.reason,
          })
          return {
            ...agv,
            mode: 'idle',
            liftT: 0,
            legs: [
              { kind: 'move', goal: pad.cell, note: `to ${pad.id}` },
              { kind: 'lower', containerId: leg.containerId, slot: pad.id },
              ...this.retarget(rest, leg.containerId, leg.slot, pad.id),
            ],
          }
        }
        // Nowhere at all: keep hold and retry shortly rather than bouncing it
        // back to the gate, which would loop forever.
        if (agv.holdReason !== NO_SLOT) {
          this.log('critical', `${agv.id} is still holding ${shortId(box.id)}: no legal position free.`, { ref: box.id })
        }
        return { ...agv, mode: 'held', liftT: 0, holdUntil: s.now + RETRY, holdReason: NO_SLOT, waitingFor: null }
      }

      const firstStorage = !s.everStored[leg.containerId]
      this.w('everStored')[leg.containerId] = true
      const tier = s.stacks[leg.slot].length
      this.setStack(leg.slot, [...s.stacks[leg.slot], leg.containerId])
      this.patch(leg.containerId, { status: 'stored', slot: leg.slot, tier })
      if (firstStorage) this.w('metrics').stored++
      this.log('good', `${shortId(box.id)} set down at ${leg.slot}.`, { ref: box.id, verbose: true, detail: `Tier ${tier}.` })
      return { ...agv, mode: 'idle', liftT: 0, carrying: null, legs: rest }
    }

    if (leg.kind !== 'depart') return { ...agv, mode: 'idle', liftT: 0 }
    const c = s.containers[leg.containerId]
    this.patch(leg.containerId, { status: 'departed', slot: null, tier: null, departedAt: s.now })
    const m = this.w('metrics')
    m.departed++
    m.dwellTotal += s.now - c.arrivedAt
    m.dwellCount++
    if (Object.values(s.naiveStacks).some((v) => v.includes(c.id))) {
      const ns = this.w('naiveStacks')
      for (const k of Object.keys(ns)) if (ns[k].includes(c.id)) ns[k] = ns[k].filter((id) => id !== c.id)
    }
    if (c.flow === 'import') {
      if (c.booking) this.patch(c.id, { booking: { ...c.booking, status: 'released' } })
      this.log('good', `${shortId(c.id)} released at ${leg.exit} to ${c.booking?.fleetName ?? 'a walk-in truck'}.`, { ref: c.id })
    } else {
      this.log('good', `${shortId(c.id)} loaded onto ${c.vessel} at ${leg.exit} for ${c.destination}.`, { ref: c.id })
    }
    if (s.rehandleChain.length) s.rehandleChain = []
    return { ...agv, mode: 'idle', liftT: 0, carrying: null, legs: rest }
  }

  /* ---------------------------------------------------------------- *
   * Deadlock
   * ---------------------------------------------------------------- */

  private resolveDeadlocks(): void {
    const s = this.s

    // A vehicle stuck holding a box with nowhere to put it must not sit on a
    // cell somebody else is waiting for: step aside, then come back and retry.
    for (const h of s.agvs) {
      if (h.mode !== 'held' || h.holdReason !== NO_SLOT) continue
      if (!s.agvs.some((o) => o.id !== h.id && o.mode === 'held' && o.waitingFor === h.id)) continue
      const aside = this.freeCellNear(h)
      const back = h.legs[0] ? this.legCell(h.legs[0]) : null
      if (!aside || !back) continue
      this.log('warn', `${h.id} steps aside with ${shortId(h.carrying ?? '')} so ${s.agvs.find((o) => o.waitingFor === h.id)?.id} can work.`, { verbose: true })
      s.agvs = s.agvs.map((a) =>
        a.id !== h.id
          ? a
          : {
              ...a,
              mode: 'idle',
              holdReason: null,
              legs: [
                { kind: 'move', goal: aside, note: EVADE_NOTE },
                { kind: 'move', goal: back, note: 'returning to set down' },
                ...a.legs,
              ],
            },
      )
      return
    }

    // A vehicle waiting on one that is simply parked: ask the idle one to get
    // out of the way. This is not a cycle, so nothing else would ever move it.
    for (const h of s.agvs) {
      if (h.mode !== 'held' || !h.waitingFor) continue
      const p = s.agvs.find((a) => a.id === h.waitingFor)
      if (!p || p.mode !== 'idle' || p.carrying || p.legs.length > 0) continue
      const aside = this.freeCellNear(p, new Set((h.route ?? []).map(cellKey)))
      if (!aside) continue
      this.log('info', `${p.id} moves aside for ${h.id}.`, { verbose: true })
      s.agvs = s.agvs.map((a) =>
        a.id === p.id ? { ...a, legs: [{ kind: 'move', goal: aside, note: EVADE_NOTE }], taskLabel: null } : a,
      )
      return
    }

    const held = s.agvs.filter((a) => a.mode === 'held' && a.waitingFor)
    if (held.length < 2) return
    const waitingFor: Record<string, string | null> = {}
    const priorities: Record<string, number> = {}
    for (const a of s.agvs) {
      // a vehicle already stepping aside has done what it can: ask someone else
      const evading = a.legs[0]?.kind === 'move' && (a.legs[0] as { note: string }).note === EVADE_NOTE
      priorities[a.id] = evading ? Infinity : a.priority
      waitingFor[a.id] = a.mode === 'held' ? a.waitingFor : null
    }
    const dl = detectDeadlock(waitingFor, priorities)
    if (!dl || priorities[dl.yielder] === Infinity) return

    // Ask cycle members in priority order, lowest first, and take the first
    // one that can actually step somewhere. The lowest-priority vehicle may be
    // boxed into a dead end with nowhere to go; sending it nowhere would leave
    // the deadlock in place for good.
    const byPriority = (ids: string[]) => ids.filter((id) => priorities[id] !== Infinity).sort((x, y2) => priorities[x] - priorities[y2])
    // The cycle first. If none of them can move, a vehicle waiting (directly or
    // through a chain) on the cycle may be what is boxing them in, and may have
    // room to step aside itself, which then frees a cell for the pair.
    const reach = new Set(dl.cycle)
    for (let grew = true; grew; ) {
      grew = false
      for (const a of s.agvs) {
        if (!reach.has(a.id) && a.mode === 'held' && a.waitingFor && reach.has(a.waitingFor)) {
          reach.add(a.id)
          grew = true
        }
      }
    }
    const order = [...byPriority(dl.cycle), ...byPriority([...reach].filter((id) => !dl.cycle.includes(id)))]
    let yielder: Agv | undefined
    let aside: Cell | null = null
    for (const id of order) {
      const cand = s.agvs.find((a) => a.id === id)!
      const theirRoutes = new Set<string>()
      // only the vehicles actually in the cycle matter; a bystander's speculative route must not rule out a refuge
      for (const a of s.agvs) if (a.id !== cand.id && dl.cycle.includes(a.id)) for (const c of a.route ?? []) theirRoutes.add(cellKey(c))
      const spot = this.freeCellNear(cand, theirRoutes)
      if (spot) {
        yielder = cand
        aside = spot
        break
      }
    }
    if (!yielder || !aside) {
      // nobody can move aside right now; back the lowest-priority one off briefly and look again
      const low = s.agvs.find((a) => a.id === dl.yielder)!
      s.agvs = s.agvs.map((a) => (a.id === low.id ? { ...a, holdUntil: s.now + MINUTES_PER_CELL * 4 } : a))
      return
    }
    const who = yielder.id
    this.log('warn', `${dl.cycle.join(' and ')} were blocking each other: ${who} stepped aside.`, {
      detail: 'Deadlock broken by sending the lowest-priority vehicle that has somewhere to go to the nearest free cell.',
    })
    s.agvs = s.agvs.map((a) =>
      a.id !== who
        ? a
        : { ...a, mode: 'idle', holdReason: null, waitingFor: null, legs: [{ kind: 'move', goal: aside!, note: EVADE_NOTE }, ...a.legs] },
    )
  }

  /** Nearest aisle cell nobody has claimed, found breadth-first over the grid. */
  private freeCellNear(agv: Agv, avoid: Set<string> = new Set()): Cell | null {
    const L = this.layout
    const blocked = this.stackCells()
    const others = this.table.items.filter((r) => r.agvId !== agv.id)
    // cells another vehicle is standing in right now are walls for the search
    const occupied = new Set(others.filter((r) => r.exit === Infinity).map((r) => r.key))
    const claimed = new Set(others.map((r) => r.key))
    for (const k of avoid) claimed.add(k)
    const seen = new Set<string>([cellKey(agv.cell)])
    const queue: Cell[] = [agv.cell]
    while (queue.length) {
      const c = queue.shift()!
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = { x: c.x + dx, y: c.y + dy }
        const k = cellKey(n)
        if (n.x < 0 || n.y < 0 || n.x >= L.gridW || n.y >= L.gridH || seen.has(k) || blocked.has(k)) continue
        seen.add(k)
        if (occupied.has(k)) continue
        if (!claimed.has(k)) return n
        queue.push(n)
      }
    }
    return null
  }

  /* ---------------------------------------------------------------- *
   * Step
   * ---------------------------------------------------------------- */

  step(): void {
    const s = this.s
    this.touched.clear()
    s.tick++
    s.now = s.tick * TICK
    this.table.prune(s.now)

    this.surge()
    if (s.auto) {
      this.autoArrivals()
      if (s.tick % 10 === 0) this.callForward()
    }
    if (s.tick % 10 === 5) this.serviceBookings()
    this.dispatch()
    s.agvs = s.agvs.map((a) => this.stepAgv(a))
    this.resolveDeadlocks()

    const m = this.w('metrics')
    m.agvElapsed += TICK * s.agvs.length
    m.agvBusy = s.agvs.reduce((acc, a) => acc + a.busyMinutes, 0)
  }

  /** Run `n` steps. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step()
  }
}
