import { cellDistance, cellKey, cellToSlot, type Layout } from './layout'
import { dirIndex, findPath, type PathOk } from './pathfinder'
import type { Cell } from './types'

/**
 * Traffic control for multiple AGVs on one grid.
 *
 * The invariant: two vehicles are never in the same cell, and never swap cells,
 * at the same time. Every vehicle books the cells of its route for the exact
 * window it will occupy them (travel, slower cornering, and the dwell while it
 * lifts); a parked or waiting vehicle books its cell indefinitely. A new route
 * is checked against those bookings before it starts. There is no pre-emption:
 * a booking, once made, is honoured, so priority only decides who is served
 * first, never who gets shoved out of the way.
 *
 * Because the simulation advances vehicles with the same per-segment times the
 * schedule used, the booked windows are exact rather than estimates.
 */

/** Sim-minutes to traverse one reference cell (REFERENCE_CELL drawing units). */
export const MINUTES_PER_CELL = 0.15
/** Cells are not all the same size; this is the length one MINUTES_PER_CELL covers. */
export const REFERENCE_CELL = 100
/** Extra sim-minutes to take a 90-degree corner (the vehicle slows to turn). */
export const TURN_MINUTES = 0.12
/** Safety margin held behind a vehicle before another may enter the cell. */
export const CLEARANCE = MINUTES_PER_CELL * 0.5

export type TimedCell = { key: string; cell: Cell; enter: number; exit: number }

export type Reservation = TimedCell & { agvId: string; priority: number; label: string }

export type Conflict = {
  key: string
  slot: string | null
  cell: Cell
  withAgv: string
  theirLabel: string
  parked: boolean
  from: number
  to: number
}

/**
 * Time to go from each cell of the path to the next. Travel time is
 * proportional to the real distance between the two cells (constant speed),
 * plus the corner cost where the vehicle has to turn.
 */
export function segmentTimes(L: Layout, path: Cell[], facing: number | null): number[] {
  const pauses = segmentPauses(path, facing)
  return pauses.map((pause, i) => (MINUTES_PER_CELL * cellDistance(L, path[i], path[i + 1])) / REFERENCE_CELL + pause)
}

/**
 * The part of each segment's time spent pivoting in place at its start cell
 * (the corner cost). The booked time is unchanged; this only says how it is
 * spent, so a truck can be drawn turning on the spot and then moving at
 * constant speed rather than visibly slowing through the corner.
 */
export function segmentPauses(path: Cell[], facing: number | null): number[] {
  const out: number[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const out_ = dirIndex(path[i], path[i + 1])
    const in_ = i === 0 ? facing : dirIndex(path[i - 1], path[i])
    out.push(in_ !== null && in_ !== out_ ? TURN_MINUTES : 0)
  }
  return out
}

/**
 * Lay a route out in time: when the vehicle is in each cell, and until when.
 * The final cell is an open-ended claim: the vehicle will dwell there to lift,
 * and may then have to wait before its next leg, so it holds the cell until it
 * books a route out. Anyone planned to pass through later is therefore never
 * driven into.
 */
export function schedulePath(L: Layout, path: Cell[], startAt: number, facing: number | null): TimedCell[] {
  const seg = segmentTimes(L, path, facing)
  let t = startAt
  return path.map((cell, i) => {
    const enter = t
    const isLast = i === path.length - 1
    const leaves = isLast ? 0 : seg[i]
    t += leaves
    return {
      key: cellKey(cell),
      cell,
      enter,
      exit: isLast ? Infinity : enter + leaves + CLEARANCE,
    }
  })
}

export class ReservationTable {
  items: Reservation[] = []

  static from(items: Reservation[]): ReservationTable {
    const t = new ReservationTable()
    t.items = items.map((r) => ({ ...r, cell: { ...r.cell } }))
    return t
  }

  reserve(agvId: string, priority: number, timed: TimedCell[], label: string): void {
    this.release(agvId)
    for (const t of timed) this.items.push({ ...t, agvId, priority, label })
  }

  /** A vehicle at rest holds its cell until it books a route out. */
  park(agvId: string, priority: number, cell: Cell, from: number, label: string): void {
    this.release(agvId)
    this.items.push({ key: cellKey(cell), cell, enter: from, exit: Infinity, agvId, priority, label })
  }

  release(agvId: string): void {
    this.items = this.items.filter((r) => r.agvId !== agvId)
  }

  /** Drop windows that are entirely in the past, so the table stays small. */
  prune(now: number): void {
    this.items = this.items.filter((r) => r.exit > now)
  }

  conflicts(agvId: string, timed: TimedCell[]): Conflict[] {
    const out: Conflict[] = []
    for (const t of timed) {
      for (const r of this.items) {
        if (r.agvId === agvId || r.key !== t.key) continue
        if (t.enter < r.exit && r.enter < t.exit) {
          out.push({
            key: t.key,
            slot: null,
            cell: t.cell,
            withAgv: r.agvId,
            theirLabel: r.label,
            parked: r.exit === Infinity,
            from: Math.max(t.enter, r.enter),
            to: Math.min(t.exit, r.exit),
          })
        }
      }
    }
    return out.sort((a, b) => a.from - b.from)
  }

  /** Earliest start at which the route is completely clear, or null if a parked vehicle never clears. */
  clearAt(L: Layout, agvId: string, path: Cell[], startAt: number, facing: number | null): number | null {
    let t = startAt
    for (let attempt = 0; attempt < 40; attempt++) {
      const timed = schedulePath(L, path, t, facing)
      const cs = this.conflicts(agvId, timed)
      if (cs.length === 0) return t
      if (cs.every((c) => c.parked)) return null
      const finite = cs.filter((c) => !c.parked)
      const worst = finite.reduce((a, b) => (b.to > a.to ? b : a))
      const arrival = timed.find((c) => c.key === worst.key)!.enter
      t += Math.max(worst.to - arrival + 0.01, MINUTES_PER_CELL * 0.5)
    }
    return null
  }

  cellsHeldBy(agvId: string): string[] {
    return this.items.filter((r) => r.agvId === agvId).map((r) => r.key)
  }
}

export type TrafficDecision =
  | { action: 'proceed'; timed: TimedCell[]; path: Cell[] }
  | {
      action: 'reroute'
      path: Cell[]
      timed: TimedCell[]
      conflictWith: string
      reason: string
      extraSeconds: number
    }
  | {
      action: 'hold'
      until: number
      at: string
      conflictWith: string
      reason: string
    }

export type TrafficRequest = {
  agvId: string
  /** human phrase for the log, e.g. "carrying critical-priority TUTX 4410" */
  cargoLabel: string
  start: Cell
  goal: Cell
  path: PathOk
  startAt: number
  facing: number | null
  blocked: ReadonlySet<string>
  table: ReservationTable
}

/**
 * Decide whether a vehicle may start now, must wait, or should go around.
 * Going around is chosen when it is cheaper than waiting, or when the obstacle
 * is a vehicle parked indefinitely and waiting would never end.
 */
export function resolveTraffic(L: Layout, req: TrafficRequest): TrafficDecision {
  const { agvId, path, startAt, facing, table } = req
  const timed = schedulePath(L, path.path, startAt, facing)
  const conflicts = withSlots(L, table.conflicts(agvId, timed))
  if (conflicts.length === 0) return { action: 'proceed', timed, path: path.path }

  const first = conflicts[0]
  const where = first.slot ?? 'the aisle'
  const goalKey = cellKey(req.goal)

  const clear = table.clearAt(L, agvId, path.path, startAt, facing)
  const waitCost = clear === null ? Infinity : clear - startAt

  // Try going around, growing the set of cells to avoid as new clashes appear.
  // Never route around the goal itself: a busy destination can only be waited for.
  const avoid = new Set(req.blocked)
  const startKey = cellKey(req.start)
  let detour = path
  let detourTimed = timed
  let found = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const clashes = table.conflicts(agvId, detourTimed)
    if (clashes.length === 0) {
      found = attempt > 0
      break
    }
    if (clashes.some((c) => c.key === goalKey)) break
    for (const c of clashes) if (c.key !== startKey) avoid.add(c.key)
    const next = findPath(L, req.start, req.goal, { blocked: avoid, facing })
    if (!next.ok) break
    detour = next
    detourTimed = schedulePath(L, next.path, startAt, facing)
  }

  if (found) {
    const extra = detourTimed[detourTimed.length - 1].enter - timed[timed.length - 1].enter
    if (extra < waitCost) {
      return {
        action: 'reroute',
        path: detour.path,
        timed: detourTimed,
        conflictWith: first.withAgv,
        extraSeconds: Math.max(0, Math.round(extra * 60)),
        reason: `${agvId} routes around ${where}: a ${Math.max(0, Math.round(extra * 60))}s detour beats waiting for ${first.withAgv}.`,
      }
    }
  }

  const until = clear ?? startAt + MINUTES_PER_CELL * 2
  const secs = Math.max(1, Math.round((until - startAt) * 60))
  return {
    action: 'hold',
    until,
    at: where,
    conflictWith: first.withAgv,
    reason: `${agvId} held ${secs}s at ${where}: ${first.withAgv} is in that cell, ${first.theirLabel}.`,
  }
}

function withSlots(L: Layout, cs: Conflict[]): Conflict[] {
  return cs.map((c) => ({ ...c, slot: cellToSlot(L, c.cell) }))
}

/**
 * Deadlock: each vehicle in a cycle is waiting on the next. Nobody moves
 * without an intervention, so the lowest-priority member is told to step aside.
 */
export function detectDeadlock(
  waitingFor: Record<string, string | null>,
  priorities: Record<string, number>,
): { cycle: string[]; yielder: string } | null {
  for (const start of Object.keys(waitingFor)) {
    const seen: string[] = []
    let cur: string | null = start
    while (cur && !seen.includes(cur)) {
      seen.push(cur)
      cur = waitingFor[cur] ?? null
    }
    if (cur && seen.includes(cur)) {
      const cycle = seen.slice(seen.indexOf(cur))
      if (cycle.length < 2) continue
      const yielder = cycle.reduce((a, b) => ((priorities[b] ?? 0) < (priorities[a] ?? 0) ? b : a))
      return { cycle, yielder }
    }
  }
  return null
}
