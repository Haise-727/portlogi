import {
  adjacentSlots,
  cellKey,
  isPowered,
  slotDistance,
  slotToCell,
  type Layout,
} from './layout'
import { costMap, findPath, type PathOk } from './pathfinder'
import type { Cell, Container, Tier } from './types'

/**
 * Best-position detection. Every legal (slot, tier) pair is scored; the lowest
 * score wins. Each term is normalised to 0..1 before weighting so the bars in
 * the inspector are directly comparable, and every term carries the sentence it
 * would use to justify itself. Illegal positions are rejected outright with the
 * rule that killed them: "impossible" and "expensive" are different answers.
 */
export type Weights = {
  rehandle: number
  travel: number
  cluster: number
  spread: number
  access: number
}

export const DEFAULT_WEIGHTS: Weights = {
  rehandle: 40, // the core idea: never bury an earlier departure
  travel: 15, // gate -> slot AGV distance
  cluster: 15, // keep one destination (or operator group) together
  spread: 12, // do not fragment the yard across fresh stacks
  access: 18, // do not wall off the aisles
}

export type ScoreKey = keyof Weights

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
  rejectionBySlot: Record<string, Rejection>
  evaluated: number
}

/** slot id -> containers, bottom tier first. Contains every active slot. */
export type YardSnapshot = Record<string, Container[]>

export function emptySnapshot(L: Layout): YardSnapshot {
  const snap: YardSnapshot = {}
  for (const s of L.slotIds) snap[s] = []
  for (const p of L.pads) snap[p.id] = []
  return snap
}

/** Cells an AGV cannot drive through: standing stacks and out-of-service slots. */
export function blockedCells(L: Layout, yard: YardSnapshot): Set<string> {
  const set = new Set<string>()
  for (const slot of L.slotIds) {
    if (L.disabled.has(slot) || (yard[slot]?.length ?? 0) > 0) set.add(cellKey(slotToCell(L, slot)))
  }
  return set
}

export function allocate(
  L: Layout,
  container: Container,
  yard: YardSnapshot,
  from: Cell,
  weights: Weights = DEFAULT_WEIGHTS,
): AllocationResult {
  const blocked = blockedCells(L, yard)
  const candidates: Candidate[] = []
  const rejected: Rejection[] = []
  const occupiedGround = L.activeSlots.filter((s) => yard[s].length > 0).length
  const occupancy = occupiedGround / Math.max(1, L.activeSlots.length)

  // One pass prices the aisle for the whole yard as it stands now.
  const baseCosts = costMap(L, from, blocked)

  for (const slot of L.activeSlots) {
    const stack = yard[slot]
    const tier = Math.min(stack.length, L.tiers - 1) as Tier
    const fail = checkConstraints(L, container, slot, tier, yard)
    if (fail) {
      rejected.push({ slot, tier, ...fail })
      continue
    }
    const path = findPath(L, from, slotToCell(L, slot), { blocked })
    if (!path.ok) {
      rejected.push({ slot, tier, rule: 'unreachable', reason: path.reason })
      continue
    }

    const breakdown = scoreSlot(L, container, slot, tier, yard, path, occupancy, weights, baseCosts, from, blocked)
    const score = round(breakdown.reduce((sum, t) => sum + t.points, 0))
    candidates.push({ slot, tier, score, breakdown, path, rehandles: countRehandles(container, stack) })
  }

  candidates.sort((a, b) => a.score - b.score || a.slot.localeCompare(b.slot, undefined, { numeric: true }))
  const rejectionBySlot: Record<string, Rejection> = {}
  for (const r of rejected) rejectionBySlot[r.slot] = r
  for (const s of L.disabled) {
    rejectionBySlot[s] = { slot: s, tier: 0, rule: 'disabled', reason: 'Slot is out of service.' }
  }

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
 * Hard constraints: a slot that fails any of these is not a bad choice,
 * it is not a choice at all.
 * ------------------------------------------------------------------ */

export function checkConstraints(
  L: Layout,
  container: Container,
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
): { rule: string; reason: string } | null {
  const stack = yard[slot]

  if (L.disabled.has(slot)) return { rule: 'disabled', reason: 'Slot is out of service.' }

  if (stack.length >= L.tiers) {
    return { rule: 'capacity', reason: `Stack full: ${L.tiers} tiers already placed.` }
  }
  if (tier > 0 && stack.length !== tier) {
    return { rule: 'no-support', reason: `Tier ${tier} needs tier ${tier - 1} filled first.` }
  }
  if (container.type === 'reefer' && !isPowered(L, slot)) {
    return { rule: 'power', reason: 'Reefer needs a power point; this slot has none.' }
  }

  // Plugs are scarce and reefers have nowhere else to go. A dry box may not take
  // the last powered position, because a reefer arriving after it would then
  // have no legal move at all.
  // The reserve only means something while there is somewhere else to put a
  // dry box; in a yard that is powered throughout it would reject everything.
  if (container.type !== 'reefer' && isPowered(L, slot) && L.activeSlots.some((s) => !isPowered(L, s))) {
    let freePowered = 0
    for (const s of L.activeSlots) if (isPowered(L, s)) freePowered += L.tiers - yard[s].length
    if (freePowered <= 1) {
      return { rule: 'plug-reserve', reason: 'Last powered position is held for reefers.' }
    }
  }

  if (tier > 0) {
    const below = stack[stack.length - 1]
    if (container.weight > below.weight) {
      return {
        rule: 'weight',
        reason: `${container.weight}t cannot sit on ${below.weight}t (${below.id}).`,
      }
    }
  }

  if (container.type === 'hazmat') {
    const clash = adjacentSlots(L, slot).find((n) => yard[n]?.some((c) => c.type === 'hazmat'))
    if (clash) {
      return {
        rule: 'segregation',
        reason: `Hazmat already in ${clash}: segregation requires a clear neighbour.`,
      }
    }
    if (stack.some((c) => c.type === 'hazmat')) {
      return { rule: 'segregation', reason: `Hazmat already stacked in ${slot}.` }
    }
  }

  return null
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function scoreSlot(
  L: Layout,
  container: Container,
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
  path: PathOk,
  occupancy: number,
  w: Weights,
  baseCosts: Map<string, number>,
  from: Cell,
  blocked: ReadonlySet<string>,
): ScoreTerm[] {
  const stack = yard[slot]
  const mk = (key: ScoreKey, label: string, raw: number, detail: string): ScoreTerm => ({
    key,
    label,
    raw,
    weight: w[key],
    points: round(raw * w[key]),
    detail,
  })

  /* 1. Rehandle risk: a late departure on top of an early one guarantees a
        wasted AGV move. */
  const buried = countRehandles(container, stack)
  const rehandleRaw = buried / Math.max(1, L.tiers - 1)
  const rehandleDetail =
    buried > 0
      ? `Buries ${stack
          .filter((c) => c.etd < container.etd)
          .map((c) => c.id.split(' ')[0])
          .join(', ')}: ${buried} dig-out later`
      : tier > 0
        ? 'Stacks on a later departure: no dig-out'
        : 'Ground tier: nothing buried'

  /* 2. Travel: real A* cost from the gate, turn penalty included. */
  const travelRaw = Math.min(1, path.cost / L.maxTravel)
  const travelDetail = `${path.steps} cells, ${path.turns} turn${path.turns === 1 ? '' : 's'} (cost ${path.cost})`

  /* 3. Cluster: same destination or group sits together. */
  const { raw: clusterRaw, detail: clusterDetail } = clusterTerm(L, container, slot, yard)

  /* 4. Spread: opening a fresh stack costs more the fuller the yard gets. */
  const opensNew = stack.length === 0
  const spreadRaw = opensNew ? occupancy : 0
  const spreadDetail = opensNew
    ? `Opens a new stack, yard ${Math.round(occupancy * 100)}% committed`
    : 'Reuses an open stack'

  /* 5. Access: a fresh stack turns its cell solid, which can lengthen or cut
        off routes to everything behind it. */
  const { raw: accessRaw, detail: accessDetail } = accessTerm(L, slot, tier, yard, baseCosts, from, blocked)

  return [
    mk('rehandle', 'Rehandle risk', rehandleRaw, rehandleDetail),
    mk('travel', 'Travel distance', travelRaw, travelDetail),
    mk('cluster', 'Cluster', clusterRaw, clusterDetail),
    mk('spread', 'Yard spread', spreadRaw, spreadDetail),
    mk('access', 'Aisle access', accessRaw, accessDetail),
  ]
}

/** Containers in this stack that depart before ours, i.e. dig-outs we create. */
export function countRehandles(container: Container, stack: Container[]): number {
  return stack.filter((c) => c.etd < container.etd).length
}

function sameCluster(a: Container, b: Container): boolean {
  if (a.group || b.group) return a.group === b.group
  return a.destination === b.destination
}

function clusterTerm(
  L: Layout,
  container: Container,
  slot: string,
  yard: YardSnapshot,
): { raw: number; detail: string } {
  const label = container.group ? `group "${container.group}"` : `${container.destination} cargo`
  let nearest = Infinity
  let nearestSlot = ''
  for (const s of L.activeSlots) {
    if (!yard[s].some((c) => sameCluster(c, container))) continue
    const d = s === slot ? 0 : slotDistance(L, slot, s)
    if (d < nearest) {
      nearest = d
      nearestSlot = s
    }
  }
  if (nearest === Infinity) return { raw: 0, detail: `First ${label} in the yard` }
  return {
    raw: Math.min(1, nearest / Math.max(1, L.maxSlotDist)),
    detail:
      nearest === 0
        ? `Same stack as ${label}`
        : `${nearest} slot${nearest === 1 ? '' : 's'} from ${label} in ${nearestSlot}`,
  }
}

/**
 * How much does committing this cell cost the rest of the yard? One cost map
 * with the cell solid is compared against the map without it, for every
 * still-free slot. Slots that become unreachable dominate the term.
 */
function accessTerm(
  L: Layout,
  slot: string,
  tier: Tier,
  yard: YardSnapshot,
  baseCosts: Map<string, number>,
  from: Cell,
  blocked: ReadonlySet<string>,
): { raw: number; detail: string } {
  if (tier > 0) return { raw: 0, detail: 'Stack already stands here: aisles unchanged' }

  const after = new Set(blocked)
  after.add(cellKey(slotToCell(L, slot)))
  const afterCosts = costMap(L, from, after)

  const free = L.activeSlots.filter((s) => s !== slot && yard[s].length < L.tiers)
  let lengthened = 0
  let cut = 0
  let delta = 0
  for (const s of free) {
    const key = cellKey(slotToCell(L, s))
    const before = baseCosts.get(key)
    if (before === undefined) continue
    const now = afterCosts.get(key)
    if (now === undefined) {
      cut++
      continue
    }
    if (now > before) {
      lengthened++
      delta += now - before
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

/**
 * The baseline: first slot with room, read left-to-right, top-to-bottom,
 * subject only to the hard constraints. How a yard is worked without a system.
 */
export function allocateNaive(
  L: Layout,
  container: Container,
  yard: YardSnapshot,
): { slot: string; tier: Tier; rehandles: number } | null {
  for (const slot of L.activeSlots) {
    const tier = yard[slot].length as Tier
    if (checkConstraints(L, container, slot, tier, yard)) continue
    return { slot, tier, rehandles: countRehandles(container, yard[slot]) }
  }
  return null
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
