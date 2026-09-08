import { findPath, type PathOk } from './pathfinder'
import type { Cell } from './types'
import { cellToSlot } from './yardConfig'

/**
 * Traffic control for multiple cranes on one grid.
 *
 * The cranes share aisles, so "shortest path" is not enough — a path is only
 * usable if nobody else is standing in it at the moment you arrive. Each crane
 * reserves the cells of its route for the time window it will occupy them; a
 * new route is checked against those windows before it starts. On a clash the
 * lower-priority crane gives way, either by waiting for the window to clear or
 * by taking a detour if the detour is cheaper than the wait.
 *
 * Every outcome carries a sentence for the event log. Traffic control that is
 * not narrated looks identical to traffic control that does not exist.
 */

/** Sim-minutes for a crane to traverse one grid cell. */
export const MINUTES_PER_CELL = 0.15
/** Sim-minutes to hoist or lower a box. */
export const LIFT_MINUTES = 0.45
/** Safety margin held behind a crane before another may enter the cell. */
export const CLEARANCE = MINUTES_PER_CELL * 0.6
/** Penalty applied to the crane forced to give way in a deadlock. */
export const YIELD_PENALTY = MINUTES_PER_CELL * 4

export type TimedCell = { key: string; cell: Cell; enter: number; exit: number }

export type Reservation = TimedCell & { craneId: string; priority: number }

export type Conflict = {
  key: string
  slot: string | null
  cell: Cell
  withCrane: string
  theirPriority: number
  from: number
  to: number
}

/** Lay a route out in time: when the crane is in each cell, and until when. */
export function schedulePath(
  path: Cell[],
  startAt: number,
  perCell = MINUTES_PER_CELL,
  dwellAtEnd = 0,
): TimedCell[] {
  return path.map((cell, i) => {
    const enter = startAt + i * perCell
    const isLast = i === path.length - 1
    return {
      key: `${cell.x},${cell.y}`,
      cell,
      enter,
      exit: enter + perCell + CLEARANCE + (isLast ? dwellAtEnd : 0),
    }
  })
}

export class ReservationTable {
  private byCell = new Map<string, Reservation[]>()

  reserve(craneId: string, priority: number, timed: TimedCell[]): void {
    this.release(craneId)
    for (const t of timed) {
      const list = this.byCell.get(t.key) ?? []
      list.push({ ...t, craneId, priority })
      this.byCell.set(t.key, list)
    }
  }

  release(craneId: string): void {
    for (const [key, list] of this.byCell) {
      const kept = list.filter((r) => r.craneId !== craneId)
      if (kept.length) this.byCell.set(key, kept)
      else this.byCell.delete(key)
    }
  }

  /** Drop windows that are entirely in the past, so the table stays small. */
  prune(now: number): void {
    for (const [key, list] of this.byCell) {
      const kept = list.filter((r) => r.exit > now)
      if (kept.length) this.byCell.set(key, kept)
      else this.byCell.delete(key)
    }
  }

  conflicts(craneId: string, timed: TimedCell[]): Conflict[] {
    const out: Conflict[] = []
    for (const t of timed) {
      for (const r of this.byCell.get(t.key) ?? []) {
        if (r.craneId === craneId) continue
        if (overlaps(t, r)) {
          out.push({
            key: t.key,
            slot: cellToSlot(t.cell),
            cell: t.cell,
            withCrane: r.craneId,
            theirPriority: r.priority,
            from: Math.max(t.enter, r.enter),
            to: Math.min(t.exit, r.exit),
          })
        }
      }
    }
    return out.sort((a, b) => a.from - b.from)
  }

  /** Earliest departure time at which this route is completely clear. */
  clearAt(craneId: string, path: Cell[], startAt: number, dwellAtEnd: number): number {
    let t = startAt
    for (let attempt = 0; attempt < 40; attempt++) {
      const timed = schedulePath(path, t, MINUTES_PER_CELL, dwellAtEnd)
      const cs = this.conflicts(craneId, timed)
      if (cs.length === 0) return t
      // Jump to just after the blocking window rather than creeping forward.
      const worst = cs.reduce((a, b) => (b.to > a.to ? b : a))
      const idx = timed.findIndex((c) => c.key === worst.key)
      const arrival = timed[idx].enter
      t += Math.max(worst.to - arrival + 0.01, MINUTES_PER_CELL * 0.5)
    }
    return t
  }

  all(): Reservation[] {
    return [...this.byCell.values()].flat()
  }

  cellsHeldBy(craneId: string): string[] {
    const out: string[] = []
    for (const [key, list] of this.byCell) {
      if (list.some((r) => r.craneId === craneId)) out.push(key)
    }
    return out
  }
}

function overlaps(a: { enter: number; exit: number }, b: { enter: number; exit: number }): boolean {
  return a.enter < b.exit && b.enter < a.exit
}

export type TrafficDecision =
  | { action: 'proceed'; timed: TimedCell[]; path: Cell[]; preempts: string[]; note?: string }
  | {
      action: 'hold'
      until: number
      seconds: number
      at: string
      conflictWith: string
      reason: string
    }
  | {
      action: 'reroute'
      path: Cell[]
      timed: TimedCell[]
      conflictWith: string
      reason: string
      extraCost: number
    }

export type TrafficRequest = {
  craneId: string
  priority: number
  /** human label for the log, e.g. "critical-priority TUTX 4410" */
  cargoLabel: string
  start: Cell
  goal: Cell
  path: PathOk
  startAt: number
  dwellAtEnd: number
  blocked: ReadonlySet<string>
  table: ReservationTable
}

/**
 * Decide whether a crane may start now, must wait, or should go around.
 * Priority is the tie-breaker in every case: a crane carrying critical cargo
 * is not asked to give way to a routine move.
 */
export function resolveTraffic(req: TrafficRequest): TrafficDecision {
  const { craneId, priority, path, startAt, dwellAtEnd, table } = req
  const timed = schedulePath(path.path, startAt, MINUTES_PER_CELL, dwellAtEnd)
  const conflicts = table.conflicts(craneId, timed)

  if (conflicts.length === 0) {
    return { action: 'proceed', timed, path: path.path, preempts: [] }
  }

  const first = conflicts[0]
  const where = first.slot ?? 'the aisle'

  // We outrank the other crane: it gives way, we keep our slot in the schedule.
  if (priority > first.theirPriority) {
    return {
      action: 'proceed',
      timed,
      path: path.path,
      preempts: [...new Set(conflicts.filter((c) => c.theirPriority < priority).map((c) => c.withCrane))],
      note: `${craneId} takes right of way at ${where} — carrying ${req.cargoLabel}.`,
    }
  }

  // Otherwise: wait, or go around if going around is cheaper than waiting.
  const clear = table.clearAt(craneId, path.path, startAt, dwellAtEnd)
  const waitCost = clear - startAt

  const detourBlocked = new Set(req.blocked)
  for (const c of conflicts) detourBlocked.add(c.key)
  const detour = findPath(req.start, req.goal, { blocked: detourBlocked })

  if (detour.ok) {
    const detourTimed = schedulePath(detour.path, startAt, MINUTES_PER_CELL, dwellAtEnd)
    const stillClashes = table.conflicts(craneId, detourTimed).length > 0
    const extra = (detour.cost - path.cost) * MINUTES_PER_CELL
    if (!stillClashes && extra < waitCost) {
      return {
        action: 'reroute',
        path: detour.path,
        timed: detourTimed,
        conflictWith: first.withCrane,
        extraCost: round(extra * 60),
        reason: `${craneId} routes around ${where} — ${Math.round(extra * 60)}s detour beats a ${Math.round(waitCost * 60)}s wait behind ${first.withCrane}.`,
      }
    }
  }

  return {
    action: 'hold',
    until: clear,
    seconds: Math.max(1, Math.round(waitCost * 60)),
    at: where,
    conflictWith: first.withCrane,
    reason: `${craneId} held ${Math.max(1, Math.round(waitCost * 60))}s at ${where} — ${first.withCrane} carrying ${req.cargoLabel}.`,
  }
}

/**
 * Deadlock: each crane in a cycle is waiting on the next. Nobody moves without
 * an intervention, so the lowest-priority member is forced to give way.
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

function round(v: number): number {
  return Math.round(v * 100) / 100
}
