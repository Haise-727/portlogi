import { create } from 'zustand'
import {
  allocate,
  allocateNaive,
  blockedCells,
  checkConstraints,
  countRehandles,
  emptySnapshot,
  type AllocationResult,
  type Candidate,
  type YardSnapshot,
} from '../lib/allocator'
import { createGenerator, nextCutoff, shortId, type Vessel } from '../lib/generator'
import { findPath, type PathOk } from '../lib/pathfinder'
import { computePriority, type PriorityResult } from '../lib/priority'
import { SimClock } from '../lib/simulation'
import {
  detectDeadlock,
  LIFT_MINUTES,
  MINUTES_PER_CELL,
  ReservationTable,
  resolveTraffic,
} from '../lib/traffic'
import type { Cell, Container, EventSeverity, Tier, YardEvent } from '../lib/types'
import { GATE_CELL, QUAY_CELL, SLOT_IDS, cellToSlot, slotToCell, yardConfig } from '../lib/yardConfig'
import { cellCenter } from '../lib/geometry'

/* ------------------------------------------------------------------ *
 * Cranes
 * ------------------------------------------------------------------ */

export type CraneMode = 'idle' | 'moving' | 'hoisting' | 'lowering' | 'held'

export type Leg =
  | { kind: 'move'; goal: Cell; note: string }
  | { kind: 'hoist'; containerId: string; slot: string; slow?: boolean }
  | { kind: 'lower'; containerId: string; slot: string; slow?: boolean }
  | { kind: 'collect'; containerId: string }
  | { kind: 'depart'; containerId: string }

/**
 * What a buried retrieval will cost, worked out before anyone commits to it.
 * Shown to the operator so the dig-out is a decision rather than a surprise.
 */
export type RetrievalPlan = {
  containerId: string
  slot: string
  blockers: { id: string; from: string; to: string }[]
  /** true when every blocking box departs later than this one — a genuine mis-stack */
  wasted: boolean
  extraMoves: number
}

export type Crane = {
  id: string
  home: Cell
  cell: Cell
  pos: { x: number; y: number }
  facing: number | null
  mode: CraneMode
  legs: Leg[]
  path: Cell[] | null
  pathIndex: number
  segT: number
  liftT: number
  carrying: string | null
  priority: number
  holdUntil: number
  holdReason: string | null
  taskLabel: string | null
  /** the route currently being driven, for the overlay */
  route: Cell[] | null
  busyMinutes: number
}

export type Job = {
  kind: 'place' | 'retrieve'
  containerId: string
  priority: number
  createdAt: number
}

export type Metrics = {
  stored: number
  departed: number
  /** dig-out moves the cranes actually performed */
  rehandleMoves: number
  /** rehandles the optimiser committed to at placement time */
  plannedRehandles: number
  /** same arrivals, first-available placement — the baseline */
  naiveRehandles: number
  dwellTotal: number
  dwellCount: number
  craneBusy: number
  craneElapsed: number
  holds: number
}

export type RoutePreview = {
  craneId: string
  path: Cell[]
  explored: Cell[]
  cost: number
  turns: number
}

export type YardState = {
  now: number
  running: boolean
  speed: number
  auto: boolean
  containers: Record<string, Container>
  stacks: Record<string, string[]>
  gateQueue: string[]
  cranes: Crane[]
  jobs: Job[]
  events: YardEvent[]
  vessels: Vessel[]
  lastAllocation: AllocationResult | null
  allocationSeq: number
  route: RoutePreview | null
  rehandleChain: string[]
  pendingPlan: RetrievalPlan | null
  selected: string | null
  hoveredSlot: string | null
  metrics: Metrics
  showExplored: boolean
}

export type YardActions = {
  tick: (dt: number) => void
  scan: () => void
  requestRetrieve: (containerId: string) => void
  confirmRetrieve: () => void
  cancelRetrieve: () => void
  setSpeed: (speed: number) => void
  toggleRunning: () => void
  toggleAuto: () => void
  toggleExplored: () => void
  select: (id: string | null) => void
  hoverSlot: (slot: string | null) => void
  reset: () => void
}

const CRANE_IDS = ['CR-1', 'CR-2']
const CRANE_HOMES: Cell[] = [
  { x: 0, y: 2 },
  { x: 5, y: 4 },
]
/** Sim-minutes between automatic gate arrivals. */
const ARRIVAL_INTERVAL = 3.2
/** A stored box this close to its ETD is called forward automatically. */
const CALL_FORWARD = 22
const SEED = 20260908
const NO_SLOT_HOLD = 'No legal slot — waiting'

/**
 * With reduced motion asked for, cranes step cell to cell instead of gliding.
 * The simulation still runs — the state changes are the content — but nothing
 * slides across the screen.
 */
const reducedMotionQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
let reducedMotion = reducedMotionQuery?.matches ?? false
reducedMotionQuery?.addEventListener('change', (e) => {
  reducedMotion = e.matches
})

const reservations = new ReservationTable()
const generator = createGenerator(SEED)
let eventId = 0
let arrivalTimer = 0
/** Shadow yard: the same arrivals placed first-available, for the baseline. */
let naiveStacks: Record<string, string[]> = {}
/** Containers that have been set down at least once, so restacks are not counted twice. */
const everStored = new Set<string>()
/**
 * When the yard has no legal slot for a box, retrying every frame achieves
 * nothing except two hundred identical log lines. Back off and say it once.
 */
const placementBackoff = new Map<string, number>()
const PLACEMENT_RETRY = 4 // sim-minutes

function freshCranes(): Crane[] {
  return CRANE_IDS.map((id, i) => ({
    id,
    home: CRANE_HOMES[i],
    cell: CRANE_HOMES[i],
    pos: cellCenter(CRANE_HOMES[i]),
    facing: null,
    mode: 'idle' as CraneMode,
    legs: [],
    path: null,
    pathIndex: 0,
    segT: 0,
    liftT: 0,
    carrying: null,
    priority: 0,
    holdUntil: 0,
    holdReason: null,
    taskLabel: null,
    route: null,
    busyMinutes: 0,
  }))
}

function emptyStacks(): Record<string, string[]> {
  const s: Record<string, string[]> = {}
  for (const id of SLOT_IDS) s[id] = []
  return s
}

function initialState(): YardState {
  generator.reset()
  reservations.release('CR-1')
  reservations.release('CR-2')
  eventId = 0
  arrivalTimer = 0
  naiveStacks = emptyStacks()
  everStored.clear()
  placementBackoff.clear()
  return {
    now: 0,
    running: true,
    speed: 1,
    auto: false,
    containers: {},
    stacks: emptyStacks(),
    gateQueue: [],
    cranes: freshCranes(),
    jobs: [],
    events: [
      {
        id: eventId++,
        at: 0,
        severity: 'info',
        message: 'Yard 3 online. 12 ground slots, 2 tiers, 2 gantry cranes.',
      },
    ],
    vessels: generator.vessels,
    lastAllocation: null,
    allocationSeq: 0,
    route: null,
    rehandleChain: [],
    pendingPlan: null,
    selected: null,
    hoveredSlot: null,
    metrics: {
      stored: 0,
      departed: 0,
      rehandleMoves: 0,
      plannedRehandles: 0,
      naiveRehandles: 0,
      dwellTotal: 0,
      dwellCount: 0,
      craneBusy: 0,
      craneElapsed: 0,
      holds: 0,
    },
    showExplored: false,
  }
}

/* ------------------------------------------------------------------ *
 * Draft helpers — the tick mutates a shallow draft, and only the
 * branches that actually changed get new object identities, so panels
 * that did not change do not re-render at 60fps.
 * ------------------------------------------------------------------ */

type Draft = YardState & { dirty: Set<keyof YardState> }

function draftOf(s: YardState): Draft {
  return { ...s, dirty: new Set() }
}

function touchContainers(d: Draft): Record<string, Container> {
  if (!d.dirty.has('containers')) {
    d.containers = { ...d.containers }
    d.dirty.add('containers')
  }
  return d.containers
}

function touchStacks(d: Draft): Record<string, string[]> {
  if (!d.dirty.has('stacks')) {
    d.stacks = { ...d.stacks }
    d.dirty.add('stacks')
  }
  return d.stacks
}

function patchContainer(d: Draft, id: string, patch: Partial<Container>): void {
  const cs = touchContainers(d)
  cs[id] = { ...cs[id], ...patch }
}

function log(d: Draft, severity: EventSeverity, message: string, ref?: string): void {
  if (!d.dirty.has('events')) {
    d.events = d.events.slice(0, 199)
    d.dirty.add('events')
  }
  d.events = [{ id: eventId++, at: d.now, severity, message, ref }, ...d.events].slice(0, 200)
}

/** Drop the dirty-tracking field before the draft goes back into the store. */
function strip(d: Draft): YardState {
  const { dirty, ...next } = d
  void dirty
  return next
}

function enqueueRetrieve(d: Draft, c: Container): void {
  const p = priorityOf(d, c)
  d.jobs = [...d.jobs, { kind: 'retrieve', containerId: c.id, priority: p.score, createdAt: d.now }]
}

/**
 * Work out, before committing, exactly which boxes have to move and where they
 * would go. Uses the same allocator that will run at execution time, so the
 * preview is the plan rather than an estimate of one.
 */
function planRetrieval(d: Draft, target: Container): RetrievalPlan {
  const slot = target.slot!
  const stack = d.stacks[slot]
  const above = stack.slice((target.tier ?? 0) + 1)
  const working = snapshotOf(d)
  const blockers: RetrievalPlan['blockers'] = []

  for (const id of [...above].reverse()) {
    const blocker = d.containers[id]
    const to = pickTempSlot(blocker, working, slot, d, d.cranes[0])
    if (!to) continue
    blockers.push({ id, from: slot, to })
    working[slot] = working[slot].filter((c) => c.id !== id)
    working[to] = [...working[to], blocker]
  }

  // Two very different situations wear the same shape. Either the boxes on top
  // leave later than this one, in which case the stack was built wrong and the
  // dig-out is pure waste; or they leave sooner, in which case the stack was
  // right and the dig-out is the price of calling this box forward early.
  const wasted = blockers.every((b) => d.containers[b.id].etd > target.etd)

  return {
    containerId: target.id,
    slot,
    blockers,
    wasted,
    // off the stack and back on again
    extraMoves: blockers.length * 2,
  }
}

function snapshotOf(d: Draft): YardSnapshot {
  const snap = emptySnapshot()
  for (const slot of SLOT_IDS) {
    snap[slot] = d.stacks[slot].map((id) => d.containers[id]).filter(Boolean)
  }
  return snap
}

function priorityOf(d: Draft, c: Container): PriorityResult {
  const vessel = d.vessels.find((v) => v.name === c.vessel)
  return computePriority(c, d.now, vessel ? nextCutoff(vessel, d.now) : undefined)
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export const useYard = create<YardState & YardActions>((set, get) => ({
  ...initialState(),

  tick(dt) {
    if (dt <= 0) return
    set((state) => {
      const d = draftOf(state)
      d.now = state.now + dt
      reservations.prune(d.now)

      if (d.auto) {
        arrivalTimer += dt
        if (arrivalTimer >= ARRIVAL_INTERVAL) {
          arrivalTimer = 0
          // Back-pressure: raw capacity is not legal capacity. Reefer power,
          // hazmat segregation and the weight rule all shrink what is actually
          // usable, so filling to the brim gridlocks the yard with boxes that
          // have nowhere legal to go. Stop admitting well short of full.
          if (d.gateQueue.length < 3 && freeCapacity(d) >= 4) admit(d)
        }
        callForward(d)
      }

      dispatch(d)
      const cranes = d.cranes.map((c) => stepCrane(d, c, dt))
      d.cranes = cranes
      resolveDeadlocks(d)

      const busy = cranes.reduce((a, c) => a + c.busyMinutes, 0)
      d.metrics = {
        ...d.metrics,
        craneBusy: busy,
        craneElapsed: state.metrics.craneElapsed + dt * cranes.length,
      }

      return strip(d)
    })
  },

  scan() {
    set((state) => {
      const d = draftOf(state)
      if (freeCapacity(d) <= 0) {
        log(d, 'critical', 'Gate hold — yard at capacity, no legal position for a new box.')
        return strip(d)
      }
      admit(d)
      return strip(d)
    })
  },

  requestRetrieve(containerId) {
    set((state) => {
      const d = draftOf(state)
      const c = d.containers[containerId]
      if (!c || c.status !== 'stored' || isBusyWith(d, containerId)) {
        return strip(d)
      }

      const stack = d.stacks[c.slot!]
      const above = stack.slice((c.tier ?? 0) + 1)

      // Nothing on top: no decision to make, just work it.
      if (above.length === 0) {
        enqueueRetrieve(d, c)
        log(d, 'action', `Retrieval ${c.id} queued — top of stack, direct lift.`, containerId)
        return strip(d)
      }

      // Buried: cost it out and put the chain in front of the operator first.
      d.pendingPlan = planRetrieval(d, c)
      log(
        d,
        'warn',
        `${c.id} is buried under ${above.length} box${above.length === 1 ? '' : 'es'} — ${
          above.length * 2
        } extra crane moves before it can be loaded. Awaiting confirmation.`,
        containerId,
      )
      return strip(d)
    })
  },

  confirmRetrieve() {
    set((state) => {
      const d = draftOf(state)
      const plan = d.pendingPlan
      if (!plan) return strip(d)
      const c = d.containers[plan.containerId]
      d.pendingPlan = null
      if (!c || c.status !== 'stored') return strip(d)
      enqueueRetrieve(d, c)
      d.rehandleChain = plan.blockers.map((b) => b.id)
      log(
        d,
        'critical',
        `Dig-out authorised for ${c.id} — ${plan.blockers
          .map((b) => `${d.containers[b.id].id} to ${b.to}`)
          .join(', ')}, then back again.`,
        plan.containerId,
      )
      return strip(d)
    })
  },

  cancelRetrieve() {
    set((state) => {
      const d = draftOf(state)
      if (d.pendingPlan) {
        log(d, 'info', `Dig-out for ${d.containers[d.pendingPlan.containerId]?.id} cancelled.`)
      }
      d.pendingPlan = null
      return strip(d)
    })
  },

  setSpeed(speed) {
    clock.setSpeed(speed)
    set({ speed })
  },

  toggleRunning() {
    const running = !get().running
    if (running) clock.start()
    else clock.stop()
    set({ running })
  },

  toggleAuto() {
    set((s) => ({ auto: !s.auto }))
  },

  toggleExplored() {
    set((s) => ({ showExplored: !s.showExplored }))
  },

  select(id) {
    set({ selected: id })
  },

  hoverSlot(slot) {
    set({ hoveredSlot: slot })
  },

  reset() {
    set(initialState())
    clock.setSpeed(1)
    clock.start()
  },
}))

/* ------------------------------------------------------------------ *
 * Gate
 * ------------------------------------------------------------------ */

function admit(d: Draft): void {
  const c = generator.next(d.now)
  const cs = touchContainers(d)
  cs[c.id] = c
  d.gateQueue = [...d.gateQueue, c.id]
  const p = priorityOf(d, c)
  d.jobs = [...d.jobs, { kind: 'place', containerId: c.id, priority: p.score, createdAt: d.now }]

  // Shadow baseline: the same box, placed first-available.
  const naiveSnap = emptySnapshot()
  for (const slot of SLOT_IDS) {
    naiveSnap[slot] = (naiveStacks[slot] ?? []).map((id) => d.containers[id]).filter(Boolean)
  }
  const naive = allocateNaive(c, naiveSnap)
  if (naive) {
    naiveStacks = { ...naiveStacks, [naive.slot]: [...(naiveStacks[naive.slot] ?? []), c.id] }
    d.metrics = { ...d.metrics, naiveRehandles: d.metrics.naiveRehandles + naive.rehandles }
  }

  log(
    d,
    'action',
    `Gate scan ${c.tagUid} — ${c.id}, ${c.type}, ${c.weight}t for ${c.destination} (${c.vessel}).`,
    c.id,
  )
}

function freeCapacity(d: Draft): number {
  let used = 0
  for (const s of SLOT_IDS) used += d.stacks[s].length
  return SLOT_IDS.length * yardConfig.tiers - used - d.gateQueue.length
}

/** Container ids a crane is already working, whether or not a job still exists. */
function assignedIds(d: Draft): Set<string> {
  const out = new Set<string>()
  for (const c of d.cranes) {
    if (c.carrying) out.add(c.carrying)
    for (const leg of c.legs) {
      if (leg.kind !== 'move') out.add(leg.containerId)
    }
  }
  return out
}

function isBusyWith(d: Draft, id: string): boolean {
  return d.jobs.some((j) => j.containerId === id) || assignedIds(d).has(id)
}

/** Auto mode: call boxes forward as their departure approaches. */
function callForward(d: Draft): void {
  const busy = assignedIds(d)
  for (const id of Object.keys(d.containers)) {
    const c = d.containers[id]
    if (c.status !== 'stored') continue
    if (c.etd - d.now > CALL_FORWARD) continue
    if (busy.has(id)) continue
    if (d.jobs.some((j) => j.containerId === id)) continue
    const p = priorityOf(d, c)
    d.jobs = [...d.jobs, { kind: 'retrieve', containerId: id, priority: p.score, createdAt: d.now }]
    log(d, 'warn', `${c.vessel} calling ${c.id} forward — ETD in ${Math.round(c.etd - d.now)} min.`, id)
  }

  // Congestion drain. Without this the yard can sit full with nothing yet due,
  // which stalls the whole simulation: no arrivals (back-pressure) and no
  // departures (nothing near its ETD).
  let used = 0
  for (const slot of SLOT_IDS) used += d.stacks[slot].length
  const occ = used / (SLOT_IDS.length * yardConfig.tiers)
  if (occ <= 0.7) return
  if (d.jobs.filter((j) => j.kind === 'retrieve').length >= 2) return

  const next = Object.values(d.containers)
    .filter((c) => c.status === 'stored' && !busy.has(c.id) && !d.jobs.some((j) => j.containerId === c.id))
    .map((c) => ({ c, p: priorityOf(d, c) }))
    .sort((a, b) => b.p.score - a.p.score || a.c.etd - b.c.etd)[0]
  if (!next) return

  d.jobs = [...d.jobs, { kind: 'retrieve', containerId: next.c.id, priority: next.p.score, createdAt: d.now }]
  log(
    d,
    'warn',
    `Yard at ${Math.round(occ * 100)}% — working ${next.c.id} forward to free space.`,
    next.c.id,
  )
}

/* ------------------------------------------------------------------ *
 * Dispatcher — highest priority job to the first free crane
 * ------------------------------------------------------------------ */

function dispatch(d: Draft): void {
  if (d.jobs.length === 0) return
  const idle = d.cranes.filter((c) => c.mode === 'idle' && c.legs.length === 0 && !c.carrying)
  if (idle.length === 0) return

  let used = 0
  for (const slot of SLOT_IDS) used += d.stacks[slot].length
  const filling = used / (SLOT_IDS.length * yardConfig.tiers) > 0.65

  const queue = [...d.jobs].sort((a, b) => {
    // Once the yard is filling, moving boxes out beats moving more boxes in:
    // otherwise arrivals win on priority forever and the yard never drains.
    if (filling && a.kind !== b.kind) return a.kind === 'retrieve' ? -1 : 1
    return b.priority - a.priority || a.createdAt - b.createdAt
  })
  const taken: string[] = []

  for (const crane of idle) {
    const job = queue.find(
      (j) => !taken.includes(j.containerId) && (placementBackoff.get(j.containerId) ?? 0) <= d.now,
    )
    if (!job) break
    const built = job.kind === 'place' ? buildPlace(d, job, crane) : buildRetrieve(d, job, crane)
    if (!built) continue
    taken.push(job.containerId)
    d.cranes = d.cranes.map((c) => (c.id === crane.id ? built : c))
  }

  if (taken.length) d.jobs = d.jobs.filter((j) => !taken.includes(j.containerId))
}

/** Slots another crane is already carrying a box towards. */
function inFlightTargets(d: Draft, exclude?: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of d.cranes) {
    if (c.id === exclude) continue
    for (const leg of c.legs) {
      if (leg.kind === 'lower') out[leg.slot] = (out[leg.slot] ?? 0) + 1
    }
  }
  return out
}

/** First candidate that will still have room once the boxes in transit land. */
function firstFreeCandidate(
  d: Draft,
  candidates: Candidate[],
  crane: Crane,
): Candidate | undefined {
  const inFlight = inFlightTargets(d, crane.id)
  return candidates.find(
    (c) => d.stacks[c.slot].length + (inFlight[c.slot] ?? 0) < yardConfig.tiers,
  )
}

function buildPlace(d: Draft, job: Job, crane: Crane): Crane | null {
  const container = d.containers[job.containerId]
  if (!container) return null

  const result = allocate(container, snapshotOf(d), GATE_CELL)

  const chosen = firstFreeCandidate(d, result.candidates, crane)
  if (!chosen) {
    if ((placementBackoff.get(container.id) ?? 0) <= d.now) {
      log(
        d,
        'critical',
        `No legal position for ${container.id} — every slot rejected. Holding at the gate until the yard drains.`,
        container.id,
      )
    }
    placementBackoff.set(container.id, d.now + PLACEMENT_RETRY)
    return null
  }
  placementBackoff.delete(container.id)

  d.lastAllocation = result
  d.allocationSeq = d.allocationSeq + 1

  const { slot, tier, score, rehandles } = chosen
  const runnerUp = result.candidates.find((c) => c.slot !== slot)
  log(
    d,
    'good',
    `Allocator picked ${slot} tier ${tier} for ${container.id} — score ${score.toFixed(1)}${
      runnerUp ? ` vs ${runnerUp.score.toFixed(1)} for ${runnerUp.slot}` : ''
    }, ${rehandles === 0 ? 'no rehandle' : `${rehandles} rehandle`}.`,
    container.id,
  )
  if (rehandles > 0) {
    d.metrics = { ...d.metrics, plannedRehandles: d.metrics.plannedRehandles + rehandles }
  }

  return {
    ...crane,
    priority: job.priority,
    taskLabel: `Place ${container.id} → ${slot}`,
    legs: [
      { kind: 'move', goal: GATE_CELL, note: 'to gate' },
      { kind: 'collect', containerId: container.id },
      { kind: 'move', goal: slotToCell(slot), note: `to ${slot}` },
      { kind: 'lower', containerId: container.id, slot },
    ],
  }
}

function buildRetrieve(d: Draft, job: Job, crane: Crane): Crane | null {
  const container = d.containers[job.containerId]
  if (!container || container.status !== 'stored' || !container.slot) return null

  const slot = container.slot
  const stack = d.stacks[slot]
  const idx = stack.indexOf(container.id)
  if (idx < 0) return null
  const above = stack.slice(idx + 1)

  const legs: Leg[] = []
  const parked: { id: string; slot: string }[] = []

  // Dig out everything sitting on top, one box at a time.
  const working = snapshotOf(d)
  for (const blockerId of [...above].reverse()) {
    const blocker = d.containers[blockerId]
    const temp = pickTempSlot(blocker, working, slot, d, crane)
    if (!temp) {
      log(d, 'critical', `Cannot dig out ${container.id} — nowhere legal to set ${blocker.id} down.`)
      return null
    }
    legs.push({ kind: 'move', goal: slotToCell(slot), note: `to ${slot}` })
    legs.push({ kind: 'hoist', containerId: blockerId, slot, slow: true })
    legs.push({ kind: 'move', goal: slotToCell(temp), note: `set down at ${temp}` })
    legs.push({ kind: 'lower', containerId: blockerId, slot: temp, slow: true })
    parked.push({ id: blockerId, slot: temp })
    working[slot] = working[slot].filter((c) => c.id !== blockerId)
    working[temp] = [...working[temp], blocker]
  }

  legs.push({ kind: 'move', goal: slotToCell(slot), note: `to ${slot}` })
  legs.push({ kind: 'hoist', containerId: container.id, slot })
  legs.push({ kind: 'move', goal: QUAY_CELL, note: 'to quay' })
  legs.push({ kind: 'depart', containerId: container.id })

  // and put the dug-out boxes back where they came from
  for (const p of [...parked].reverse()) {
    legs.push({ kind: 'move', goal: slotToCell(p.slot), note: `recover from ${p.slot}` })
    legs.push({ kind: 'hoist', containerId: p.id, slot: p.slot, slow: true })
    legs.push({ kind: 'move', goal: slotToCell(slot), note: `restack at ${slot}` })
    legs.push({ kind: 'lower', containerId: p.id, slot, slow: true })
  }

  if (above.length) {
    d.metrics = { ...d.metrics, rehandleMoves: d.metrics.rehandleMoves + above.length }
    d.rehandleChain = above
    log(
      d,
      'warn',
      `Rehandle: ${above.map((id) => d.containers[id].id).join(', ')} must come off ${slot} before ${container.id}.`,
      container.id,
    )
  }

  return {
    ...crane,
    priority: job.priority,
    taskLabel: `Retrieve ${container.id}`,
    legs,
  }
}

function pickTempSlot(
  blocker: Container,
  yard: YardSnapshot,
  avoid: string,
  d: Draft,
  crane: Crane,
): string | null {
  const result = allocate(blocker, yard, slotToCell(avoid))
  const inFlight = inFlightTargets(d, crane.id)
  const pick = result.candidates.find(
    (c) => c.slot !== avoid && yard[c.slot].length + (inFlight[c.slot] ?? 0) < yardConfig.tiers,
  )
  return pick?.slot ?? null
}

/* ------------------------------------------------------------------ *
 * Crane execution
 * ------------------------------------------------------------------ */

function stepCrane(d: Draft, input: Crane, dt: number): Crane {
  let crane = { ...input }

  if (crane.mode === 'held') {
    if (d.now < crane.holdUntil) return crane
    crane.mode = 'idle'
    crane.holdReason = null
  }

  if (crane.path && crane.mode === 'moving') {
    crane = advance(crane, dt)
    if (crane.path) {
      crane.busyMinutes = crane.busyMinutes + dt
      return crane
    }
  }

  if (crane.mode === 'hoisting' || crane.mode === 'lowering') {
    const leg0 = crane.legs[0]
    const slow = leg0 && (leg0.kind === 'hoist' || leg0.kind === 'lower') && leg0.slow
    crane.liftT += dt / (LIFT_MINUTES * (slow ? 2.2 : 1))
    crane.busyMinutes = crane.busyMinutes + dt
    if (crane.liftT < 1) return crane
    crane = completeLift(d, crane)
    return crane
  }

  const leg = crane.legs[0]
  if (!leg) {
    if (crane.mode !== 'idle') {
      crane.mode = 'idle'
      crane.taskLabel = null
      crane.route = null
      crane.priority = 0
      reservations.release(crane.id)
    }
    return crane
  }

  crane.busyMinutes = crane.busyMinutes + dt

  switch (leg.kind) {
    case 'move':
      return beginMove(d, crane, leg.goal)
    case 'collect': {
      crane.mode = 'hoisting'
      crane.liftT = 0
      return crane
    }
    case 'hoist':
      crane.mode = 'hoisting'
      crane.liftT = 0
      return crane
    case 'lower':
    case 'depart':
      crane.mode = 'lowering'
      crane.liftT = 0
      return crane
  }
}

function beginMove(d: Draft, crane: Crane, goal: Cell): Crane {
  if (crane.cell.x === goal.x && crane.cell.y === goal.y) {
    return { ...crane, legs: crane.legs.slice(1), path: null, mode: 'idle' }
  }

  const blocked = stackCells(d)
  // Never treat the cell the crane is standing in as solid.
  blocked.delete(`${crane.cell.x},${crane.cell.y}`)
  const path = findPath(crane.cell, goal, { blocked, facing: crane.facing })

  if (!path.ok) {
    log(d, 'critical', `${crane.id} blocked: ${path.reason}`)
    return { ...crane, mode: 'held', holdUntil: d.now + MINUTES_PER_CELL * 3, holdReason: path.reason }
  }

  const cargo = crane.carrying ? d.containers[crane.carrying] : null
  const cargoLabel = cargo
    ? `carrying ${priorityOf(d, cargo).band}-priority ${shortId(cargo.id)}`
    : 'running empty'

  const decision = resolveTraffic({
    craneId: crane.id,
    priority: crane.priority,
    cargoLabel,
    start: crane.cell,
    goal,
    path,
    startAt: d.now,
    dwellAtEnd: LIFT_MINUTES,
    blocked,
    table: reservations,
  })

  if (decision.action === 'hold') {
    d.metrics = { ...d.metrics, holds: d.metrics.holds + 1 }
    log(d, 'warn', decision.reason)
    return {
      ...crane,
      mode: 'held',
      holdUntil: decision.until,
      holdReason: `Holding for ${decision.conflictWith} at ${decision.at}`,
      route: path.path,
    }
  }

  const chosen = decision.action === 'reroute' ? decision.path : decision.path
  reservations.reserve(crane.id, crane.priority, decision.timed, cargoLabel)

  if (decision.action === 'reroute') {
    log(d, 'info', decision.reason)
  } else if (decision.note) {
    log(d, 'info', decision.note)
    for (const other of decision.preempts) {
      reservations.release(other)
      d.cranes = d.cranes.map((c) =>
        c.id === other && c.mode === 'moving'
          ? { ...c, path: null, mode: 'idle', holdReason: `Yielded to ${crane.id}` }
          : c,
      )
    }
  }

  if (crane.carrying) {
    d.route = {
      craneId: crane.id,
      path: chosen,
      explored: (path as PathOk).explored,
      cost: path.cost,
      turns: path.turns,
    }
  }

  return {
    ...crane,
    mode: 'moving',
    path: chosen,
    pathIndex: 0,
    segT: 0,
    route: chosen,
    holdReason: null,
  }
}

function advance(crane: Crane, dt: number): Crane {
  const path = crane.path!
  let idx = crane.pathIndex
  let t = crane.segT + dt / MINUTES_PER_CELL

  while (t >= 1 && idx < path.length - 1) {
    t -= 1
    idx += 1
  }

  if (idx >= path.length - 1) {
    const end = path[path.length - 1]
    return {
      ...crane,
      cell: end,
      pos: cellCenter(end),
      path: null,
      pathIndex: 0,
      segT: 0,
      mode: 'idle',
      legs: crane.legs.slice(1),
    }
  }

  const a = path[idx]
  const b = path[idx + 1]
  const ca = cellCenter(a)
  const cb = cellCenter(b)
  return {
    ...crane,
    cell: a,
    pathIndex: idx,
    segT: t,
    facing: dirOf(a, b),
    pos: reducedMotion ? ca : { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t },
  }
}

function completeLift(d: Draft, crane: Crane): Crane {
  const leg = crane.legs[0]
  const rest = crane.legs.slice(1)
  if (!leg) return { ...crane, mode: 'idle', liftT: 0 }

  if (leg.kind === 'collect') {
    d.gateQueue = d.gateQueue.filter((id) => id !== leg.containerId)
    patchContainer(d, leg.containerId, { status: 'retrieving' })
    return { ...crane, mode: 'idle', liftT: 0, carrying: leg.containerId, legs: rest }
  }

  if (leg.kind === 'hoist') {
    const stacks = touchStacks(d)
    stacks[leg.slot] = stacks[leg.slot].filter((id) => id !== leg.containerId)
    patchContainer(d, leg.containerId, { status: 'retrieving', slot: null, tier: null })
    return { ...crane, mode: 'idle', liftT: 0, carrying: leg.containerId, legs: rest }
  }

  if (leg.kind === 'lower') {
    const box = d.containers[leg.containerId]
    const snap = snapshotOf(d)
    const targetTier = Math.min(d.stacks[leg.slot].length, yardConfig.tiers - 1) as Tier
    const illegal = checkConstraints(box, leg.slot, targetTier, snap)
    if (illegal) {
      // The slot changed under us mid-flight. Re-run the allocator rather than
      // forcing an illegal stack — and say so in the log.
      const redo = allocate(box, snap, slotToCell(leg.slot))
      const next = redo.candidates.find(
        (c) => c.slot !== leg.slot && d.stacks[c.slot].length < yardConfig.tiers,
      )
      if (next) {
        log(
          d,
          'warn',
          `${leg.slot} taken while ${box.id} was in the air (${illegal.reason}) — re-allocated to ${next.slot}.`,
          box.id,
        )
        return {
          ...crane,
          mode: 'idle',
          liftT: 0,
          legs: [
            { kind: 'move', goal: slotToCell(next.slot), note: `to ${next.slot}` },
            { kind: 'lower', containerId: leg.containerId, slot: next.slot },
            ...rest,
          ],
        }
      }
      // Nowhere legal to set it down. Keep hold of it and try again shortly
      // rather than bouncing it back to the gate, which would loop forever.
      if (crane.holdReason !== NO_SLOT_HOLD) {
        log(
          d,
          'critical',
          `${crane.id} is holding ${box.id} — no legal slot free. Waiting for the yard to drain.`,
          box.id,
        )
      }
      return {
        ...crane,
        mode: 'held',
        liftT: 0,
        holdUntil: d.now + PLACEMENT_RETRY,
        holdReason: NO_SLOT_HOLD,
      }
    }

    // Restacking a dug-out box is not a new arrival, so only count first storage.
    const firstStorage = !everStored.has(leg.containerId)
    everStored.add(leg.containerId)
    const stacks = touchStacks(d)
    const tier = stacks[leg.slot].length as Tier
    stacks[leg.slot] = [...stacks[leg.slot], leg.containerId]
    patchContainer(d, leg.containerId, { status: 'stored', slot: leg.slot, tier })
    if (firstStorage) d.metrics = { ...d.metrics, stored: d.metrics.stored + 1 }
    const c = d.containers[leg.containerId]
    log(d, 'good', `${c.id} set down at ${leg.slot} tier ${tier}.`, c.id)
    return { ...crane, mode: 'idle', liftT: 0, carrying: null, legs: rest }
  }

  if (leg.kind !== 'depart') return { ...crane, mode: 'idle', liftT: 0 }

  const c = d.containers[leg.containerId]
  patchContainer(d, leg.containerId, { status: 'departed', slot: null, tier: null })
  const dwell = d.now - c.arrivedAt
  d.metrics = {
    ...d.metrics,
    departed: d.metrics.departed + 1,
    dwellTotal: d.metrics.dwellTotal + dwell,
    dwellCount: d.metrics.dwellCount + 1,
  }
  naiveStacks = Object.fromEntries(
    Object.entries(naiveStacks).map(([k, v]) => [k, v.filter((id) => id !== c.id)]),
  )
  log(d, 'good', `${c.id} loaded to ${c.vessel} for ${c.destination}.`, c.id)
  if (d.rehandleChain.length) d.rehandleChain = []
  return { ...crane, mode: 'idle', liftT: 0, carrying: null, legs: rest }
}

function resolveDeadlocks(d: Draft): void {
  const held = d.cranes.filter((c) => c.mode === 'held' && c.holdReason?.startsWith('Holding for'))
  if (held.length < 2) return
  const waitingFor: Record<string, string | null> = {}
  const priorities: Record<string, number> = {}
  for (const c of d.cranes) {
    priorities[c.id] = c.priority
    const match = c.holdReason?.match(/Holding for (\S+)/)
    waitingFor[c.id] = c.mode === 'held' && match ? match[1] : null
  }
  const dl = detectDeadlock(waitingFor, priorities)
  if (!dl) return
  reservations.release(dl.yielder)
  d.cranes = d.cranes.map((c) =>
    c.id === dl.yielder
      ? { ...c, mode: 'held', holdUntil: d.now + MINUTES_PER_CELL * 4, holdReason: 'Yielding — deadlock' }
      : c,
  )
  log(
    d,
    'critical',
    `Deadlock ${dl.cycle.join(' ⇄ ')} — ${dl.yielder} forced to yield, lower cargo priority.`,
  )
}

function stackCells(d: Draft): Set<string> {
  const snap = emptySnapshot()
  for (const slot of SLOT_IDS) snap[slot] = d.stacks[slot].map((id) => d.containers[id])
  return blockedCells(snap)
}

function dirOf(a: Cell, b: Cell): number {
  if (b.y < a.y) return 0
  if (b.x > a.x) return 1
  if (b.y > a.y) return 2
  return 3
}

/* ------------------------------------------------------------------ *
 * Clock
 * ------------------------------------------------------------------ */

export const clock = new SimClock((dt) => useYard.getState().tick(dt))

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

export function yardSnapshot(s: YardState): YardSnapshot {
  const snap = emptySnapshot()
  for (const slot of SLOT_IDS) {
    snap[slot] = s.stacks[slot].map((id) => s.containers[id]).filter(Boolean)
  }
  return snap
}

/** The one place the UI computes a priority, so vessel rotation is applied everywhere. */
export function priorityWith(
  c: Container,
  now: number,
  vessels: Vessel[],
): PriorityResult {
  const vessel = vessels.find((v) => v.name === c.vessel)
  return computePriority(c, now, vessel ? nextCutoff(vessel, now) : undefined)
}

export function priorityFor(s: YardState, c: Container): PriorityResult {
  const vessel = s.vessels.find((v) => v.name === c.vessel)
  return computePriority(c, s.now, vessel ? nextCutoff(vessel, s.now) : undefined)
}

/**
 * Stable key of every container a crane is currently working. Returned as a
 * string so subscribers re-render when the set changes, not on every frame.
 */
export function assignedKey(s: YardState): string {
  const ids: string[] = []
  for (const c of s.cranes) {
    if (c.carrying) ids.push(c.carrying)
    for (const l of c.legs) if (l.kind !== 'move') ids.push(l.containerId)
  }
  return ids.join(',')
}

export function occupancy(s: YardState): number {
  let used = 0
  for (const slot of SLOT_IDS) used += s.stacks[slot].length
  return used / (SLOT_IDS.length * yardConfig.tiers)
}

export function rehandlesIfPlaced(s: YardState, c: Container, slot: string): number {
  return countRehandles(c, s.stacks[slot].map((id) => s.containers[id]).filter(Boolean))
}

export { cellToSlot, SLOT_IDS }
