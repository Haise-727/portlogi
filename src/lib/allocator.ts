import { TURN_COST, findPath, type PathOk } from './pathfinder'
import type { Container, Tier } from './types'
import {
  GATE_CELL,
  GRID_H,
  GRID_W,
  SLOT_IDS,
  adjacentSlots,
  cellKey,
  colOf,
  isPoweredSlot,
  rowOf,
  slotToCell,
  yardConfig,
} from './yardConfig'

/**
 * Best-position detection.
 *
 * Every legal (slot, tier) pair is scored; the lowest score wins. Each term is
 * normalised to 0..1 before weighting so the bars in the inspector are directly
 * comparable, and every term carries the sentence it would use to justify
 * itself. Illegal positions are rejected outright with the rule that killed
 * them rather than being buried under a large penalty — "impossible" and
 * "expensive" are different answers and the operator needs to see which is which.
 */
export const ALLOC_WEIGHTS = {
  rehandle: 40, // the core idea: never bury an earlier departure
  travel: 15, // gate -> slot crane distance
  cluster: 15, // keep one destination together
  spread: 12, // do not fragment the yard across fresh stacks
  access: 18, // do not wall off the aisles
} as const

export type ScoreKey = keyof typeof ALLOC_WEIGHTS

/** Fixed normalisation ceiling so scores stay comparable between runs. */
const MAX_TRAVEL = GRID_W + GRID_H + 4 * TURN_COST
const MAX_SLOT_DIST = yardConfig.cols.length - 1 + (yardConfig.rows.length - 1)

export type ScoreTerm = {
  key: ScoreKey
  label: string
  raw: number
  weight: number
  points: number
  detail: string
}

export type Candidate = {
  slot: string
  tier: Tier
  score: number
  breakdown: ScoreTerm[]
  path: PathOk
  rehandles: number
}

export type Rejection = {
  slot: string
  tier: Tier
  rule: string
  reason: string
}

export type AllocationResult = {
  containerId: string
  best: Candidate | null
  runnersUp: Candidate[]
  candidates: Candidate[]
  rejected: Rejection[]
  /** one rejection per slot, for hover on a greyed-out slot */
  rejectionBySlot: Record<string, Rejection>
  evaluated: number
}

/** slot id -> containers, bottom tier first. Always contains every slot. */
export type YardSnapshot = Record<string, Container[]>

export function emptySnapshot(): YardSnapshot {
  const snap: YardSnapshot = {}
  for (const s of SLOT_IDS) snap[s] = []
  return snap
}

/** Cells a crane cannot drive through, because a stack stands there. */
export function blockedCells(yard: YardSnapshot): Set<string> {
  const set = new Set<string>()
  for (const slot of SLOT_IDS) {
    if (yard[slot].length > 0) set.add(cellKey(slotToCell(slot)))
  }
  return set
}

export function allocate(
  container: Container,
  yard: YardSnapshot,
  from = GATE_CELL,
): AllocationResult {
  const blocked = blockedCells(yard)
  const candidates: Candidate[] = []
  const rejected: Rejection[] = []
  const occupiedGround = SLOT_IDS.filter((s) => yard[s].length > 0).length
  const occupancy = occupiedGround / SLOT_IDS.length

  for (const slot of SLOT_IDS) {
    const stack = yard[slot]
    const tier = Math.min(stack.length, yardConfig.tiers - 1) as Tier
    const fail = checkConstraints(container, slot, tier, yard)
    if (fail) {
      rejected.push({ slot, tier, ...fail })
      continue
    }

    // A fresh stack is entered from the aisle, so the target cell is only
    // treated as solid once tier 0 is occupied — which findPath already allows
    // for the goal cell itself.
    const path = findPath(from, slotToCell(slot), { blocked })
    if (!path.ok) {
      rejected.push({ slot, tier, rule: 'unreachable', reason: path.reason })
      continue
    }

    const breakdown = scoreSlot(container, slot, tier, yard, path, occupancy)
    const score = round(breakdown.reduce((sum, t) => sum + t.points, 0))
    candidates.push({
      slot,
      tier,
      score,
      breakdown,
      path,
      rehandles: countRehandles(container, yard[slot]),
    })
  }

  candidates.sort((a, b) => a.score - b.score || a.slot.localeCompare(b.slot))
  const rejectionBySlot: Record<string, Rejection> = {}
  for (const r of rejected) rejectionBySlot[r.slot] = r

  return {
    containerId: container.id,
    best: candidates[0] ?? null,
    runnersUp: candidates.slice(1, 4),
    candidates,
    rejected,
    rejectionBySlot,
    evaluated: candidates.length + rejected.length,
  }
}

/* ------------------------------------------------------------------ *
 * Hard constraints — a slot that fails any of these is not a bad
 * choice, it is not a choice at all.
 * ------------------------------------------------------------------ */

export function checkConstraints(
  container: Container,
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
): { rule: string; reason: string } | null {
  const stack = yard[slot]

  if (stack.length >= yardConfig.tiers) {
    return { rule: 'capacity', reason: `Stack full — ${yardConfig.tiers} tiers already placed.` }
  }

  // Tier 1 requires tier 0 occupied. Implied by using stack.length as the tier,
  // but stated explicitly because it is one of the rules being demonstrated.
  if (tier > 0 && stack.length !== tier) {
    return { rule: 'no-support', reason: `Tier ${tier} needs tier ${tier - 1} filled first.` }
  }

  if (container.type === 'reefer' && !isPoweredSlot(slot)) {
    return {
      rule: 'power',
      reason: `Reefer needs a power point — row ${yardConfig.poweredRows.join('/')} only.`,
    }
  }

  if (yardConfig.enforceWeightStacking && tier > 0) {
    const below = stack[stack.length - 1]
    if (container.weight > below.weight) {
      return {
        rule: 'weight',
        reason: `${container.weight}t cannot sit on ${below.weight}t (${below.id}).`,
      }
    }
  }

  if (container.type === 'hazmat') {
    const clash = adjacentSlots(slot).find((n) =>
      yard[n].some((c) => c.type === 'hazmat'),
    )
    if (clash) {
      return {
        rule: 'segregation',
        reason: `Hazmat already in ${clash} — segregation requires a clear neighbour.`,
      }
    }
    const sameStack = stack.some((c) => c.type === 'hazmat')
    if (sameStack) {
      return { rule: 'segregation', reason: `Hazmat already stacked in ${slot}.` }
    }
  }

  return null
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function scoreSlot(
  container: Container,
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
  path: PathOk,
  occupancy: number,
): ScoreTerm[] {
  const stack = yard[slot]

  /* 1. Rehandle risk — the whole point of the exercise. Placing a late
        departure on top of an early one guarantees a wasted crane move. */
  const buried = countRehandles(container, stack)
  const rehandleRaw = buried / Math.max(1, yardConfig.tiers - 1)
  const rehandleDetail =
    buried > 0
      ? `Buries ${stack
          .filter((c) => c.etd < container.etd)
          .map((c) => c.id.split(' ')[0])
          .join(', ')} — ${buried} dig-out later`
      : tier > 0
        ? 'Stacks on a later departure — no dig-out'
        : 'Ground tier — nothing buried'

  /* 2. Travel — real A* cost from the gate, turn penalty included. */
  const travelRaw = Math.min(1, path.cost / MAX_TRAVEL)
  const travelDetail = `${path.steps} cells, ${path.turns} turn${path.turns === 1 ? '' : 's'} (cost ${path.cost})`

  /* 3. Cluster — same destination should sit together so a vessel call can be
        worked from one part of the yard. */
  const { raw: clusterRaw, detail: clusterDetail } = clusterTerm(container, slot, yard)

  /* 4. Spread — opening a fresh stack costs more the fuller the yard gets. */
  const opensNew = stack.length === 0
  const spreadRaw = opensNew ? occupancy : 0
  const spreadDetail = opensNew
    ? `Opens a new stack, yard ${Math.round(occupancy * 100)}% committed`
    : 'Reuses an open stack'

  /* 5. Access — a fresh stack turns its cell solid, which can lengthen or cut
        off the routes to everything behind it. */
  const { raw: accessRaw, detail: accessDetail } = accessTerm(slot, tier, yard)

  return [
    term('rehandle', 'Rehandle risk', rehandleRaw, rehandleDetail),
    term('travel', 'Travel distance', travelRaw, travelDetail),
    term('cluster', 'Destination cluster', clusterRaw, clusterDetail),
    term('spread', 'Yard spread', spreadRaw, spreadDetail),
    term('access', 'Aisle access', accessRaw, accessDetail),
  ]
}

function term(key: ScoreKey, label: string, raw: number, detail: string): ScoreTerm {
  const weight = ALLOC_WEIGHTS[key]
  return { key, label, raw, weight, points: round(raw * weight), detail }
}

/** Containers in this stack that depart before ours, i.e. dig-outs we create. */
export function countRehandles(container: Container, stack: Container[]): number {
  return stack.filter((c) => c.etd < container.etd).length
}

function clusterTerm(
  container: Container,
  slot: string,
  yard: YardSnapshot,
): { raw: number; detail: string } {
  let nearest = Infinity
  let nearestSlot = ''
  for (const s of SLOT_IDS) {
    if (s === slot) {
      if (yard[s].some((c) => c.destination === container.destination)) {
        nearest = 0
        nearestSlot = s
      }
      continue
    }
    if (!yard[s].some((c) => c.destination === container.destination)) continue
    const d = slotDistance(slot, s)
    if (d < nearest) {
      nearest = d
      nearestSlot = s
    }
  }
  if (nearest === Infinity) {
    return { raw: 0, detail: `First ${container.destination} box in the yard` }
  }
  return {
    raw: Math.min(1, nearest / MAX_SLOT_DIST),
    detail:
      nearest === 0
        ? `Same stack as ${container.destination} cargo`
        : `${nearest} slot${nearest === 1 ? '' : 's'} from ${container.destination} cargo in ${nearestSlot}`,
  }
}

/**
 * How much does committing this cell cost the rest of the yard? Re-runs the
 * router to every still-free slot with this cell solid and measures the
 * lengthening. Slots that become unreachable dominate the term.
 */
function accessTerm(
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
): { raw: number; detail: string } {
  if (tier > 0) {
    return { raw: 0, detail: 'Stack already stands here — aisles unchanged' }
  }

  const base = blockedCells(yard)
  const after = new Set(base)
  after.add(cellKey(slotToCell(slot)))

  const free = SLOT_IDS.filter((s) => s !== slot && yard[s].length < yardConfig.tiers)
  let lengthened = 0
  let cut = 0
  let delta = 0

  for (const s of free) {
    const goal = slotToCell(s)
    const before = findPath(GATE_CELL, goal, { blocked: base })
    const now = findPath(GATE_CELL, goal, { blocked: after })
    if (!before.ok) continue
    if (!now.ok) {
      cut++
      continue
    }
    if (now.cost > before.cost) {
      lengthened++
      delta += now.cost - before.cost
    }
  }

  const denom = Math.max(1, free.length)
  const raw = Math.min(1, (cut * 1.5) / denom + delta / (denom * 4))
  const detail = cut
    ? `Cuts off ${cut} slot${cut === 1 ? '' : 's'} entirely`
    : lengthened
      ? `Lengthens the route to ${lengthened} slot${lengthened === 1 ? '' : 's'} (+${round(delta)})`
      : 'Leaves every aisle clear'

  return { raw, detail }
}

export function slotDistance(a: string, b: string): number {
  const ra = yardConfig.rows.indexOf(rowOf(a) as never)
  const rb = yardConfig.rows.indexOf(rowOf(b) as never)
  return Math.abs(colOf(a) - colOf(b)) + Math.abs(ra - rb)
}

/**
 * The baseline the optimiser is measured against: first slot with room, read
 * left-to-right, top-to-bottom, subject only to the hard constraints. This is
 * how the yard would be worked without a system, and it is what comparison
 * mode runs alongside `allocate`.
 */
export function allocateNaive(
  container: Container,
  yard: YardSnapshot,
): { slot: string; tier: Tier; rehandles: number } | null {
  for (const slot of SLOT_IDS) {
    const tier = yard[slot].length as Tier
    if (checkConstraints(container, slot, tier, yard)) continue
    return { slot, tier, rehandles: countRehandles(container, yard[slot]) }
  }
  return null
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
