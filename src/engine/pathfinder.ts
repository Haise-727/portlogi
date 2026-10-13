import { cellKey, cellToSlot, inBounds, type Layout } from './layout'
import type { Cell } from './types'

/**
 * A* over the yard movement grid, written by hand: it needs a turn penalty
 * (cornering a loaded AGV is slow) and the explored set, so the search itself
 * can be drawn. costMap() is the same search run to completion from one start,
 * which lets the allocator price every slot with a single pass.
 */

/** N, E, S, W. AGVs do not travel diagonally. */
export const DIRS: Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

export const STEP_COST = 1
/** Extra cost of a 90-degree turn; proportional to the real extra time (see traffic.ts). */
export const TURN_COST = 0.8

export type PathOk = {
  ok: true
  path: Cell[]
  cost: number
  steps: number
  turns: number
  /** every node A* pulled off the open set, in visit order */
  explored: Cell[]
}

export type PathFail = {
  ok: false
  reason: string
  blockers: string[]
  explored: Cell[]
}

export type PathResult = PathOk | PathFail

export type PathOptions = {
  /** cells the AGV may not travel through (stacks, parked vehicles) */
  blocked?: ReadonlySet<string>
  /** direction the AGV is already facing, as a DIRS index; omit if stationary */
  facing?: number | null
  turnCost?: number
}

type Node = {
  x: number
  y: number
  dir: number
  g: number
  f: number
  parent: Node | null
}

export function dirIndex(a: Cell, b: Cell): number {
  if (b.y < a.y) return 0
  if (b.x > a.x) return 1
  if (b.y > a.y) return 2
  return 3
}

export function findPath(L: Layout, start: Cell, goal: Cell, opts: PathOptions = {}): PathResult {
  const blocked = opts.blocked ?? new Set<string>()
  const turnCost = opts.turnCost ?? TURN_COST
  const goalKey = cellKey(goal)
  const explored: Cell[] = []

  if (!inBounds(L, start) || !inBounds(L, goal)) {
    return { ok: false, reason: 'Target lies outside the yard grid.', blockers: [], explored }
  }
  if (start.x === goal.x && start.y === goal.y) {
    return { ok: true, path: [start], cost: 0, steps: 0, turns: 0, explored: [start] }
  }

  const open = new MinHeap<Node>()
  const best = new Map<number, number>()
  const stateKey = (x: number, y: number, d: number) => (y * L.gridW + x) * 5 + (d + 1)
  const startNode: Node = {
    x: start.x,
    y: start.y,
    dir: opts.facing ?? -1,
    g: 0,
    f: heuristic(start, goal),
    parent: null,
  }
  open.push(startNode, startNode.f)
  best.set(stateKey(startNode.x, startNode.y, startNode.dir), 0)

  while (open.size > 0) {
    const node = open.pop()!
    if (node.g > (best.get(stateKey(node.x, node.y, node.dir)) ?? Infinity)) continue
    explored.push({ x: node.x, y: node.y })

    if (node.x === goal.x && node.y === goal.y) return finish(node, explored)

    for (let d = 0; d < DIRS.length; d++) {
      const nx = node.x + DIRS[d].x
      const ny = node.y + DIRS[d].y
      if (nx < 0 || ny < 0 || nx >= L.gridW || ny >= L.gridH) continue
      const key = `${nx},${ny}`
      // The destination stack is enterable: the AGV pulls alongside it to lift
      // or lower. Any other occupied stack is solid.
      if (blocked.has(key) && key !== goalKey) continue

      const turned = node.dir !== -1 && node.dir !== d
      const g = node.g + STEP_COST + (turned ? turnCost : 0)
      const sk = stateKey(nx, ny, d)
      if (g >= (best.get(sk) ?? Infinity)) continue
      best.set(sk, g)
      const next: Node = { x: nx, y: ny, dir: d, g, f: g + heuristic({ x: nx, y: ny }, goal), parent: node }
      open.push(next, next.f)
    }
  }

  return { ok: false, ...describeFailure(L, goal, blocked), explored }
}

/**
 * Cost from `start` to every reachable cell in one pass. A blocked cell can be
 * entered (it may be the destination) but never passed through, which is the
 * same rule findPath applies to its goal.
 */
export function costMap(L: Layout, start: Cell, blocked: ReadonlySet<string>): Map<string, number> {
  const open = new MinHeap<{ x: number; y: number; dir: number; g: number }>()
  const best = new Map<number, number>()
  const out = new Map<string, number>()
  const sk = (x: number, y: number, d: number) => (y * L.gridW + x) * 5 + (d + 1)
  open.push({ x: start.x, y: start.y, dir: -1, g: 0 }, 0)
  best.set(sk(start.x, start.y, -1), 0)
  out.set(cellKey(start), 0)

  while (open.size > 0) {
    const n = open.pop()!
    if (n.g > (best.get(sk(n.x, n.y, n.dir)) ?? Infinity)) continue
    const here = `${n.x},${n.y}`
    if (blocked.has(here) && !(n.x === start.x && n.y === start.y)) continue

    for (let d = 0; d < 4; d++) {
      const nx = n.x + DIRS[d].x
      const ny = n.y + DIRS[d].y
      if (nx < 0 || ny < 0 || nx >= L.gridW || ny >= L.gridH) continue
      const g = n.g + STEP_COST + (n.dir !== -1 && n.dir !== d ? TURN_COST : 0)
      const k = sk(nx, ny, d)
      if (g >= (best.get(k) ?? Infinity)) continue
      best.set(k, g)
      const ck = `${nx},${ny}`
      if (g < (out.get(ck) ?? Infinity)) out.set(ck, g)
      open.push({ x: nx, y: ny, dir: d, g }, g)
    }
  }
  return out
}

function finish(node: Node, explored: Cell[]): PathOk {
  const path: Cell[] = []
  let turns = 0
  let cur: Node | null = node
  let lastDir = -1
  while (cur) {
    path.push({ x: cur.x, y: cur.y })
    if (lastDir !== -1 && cur.dir !== -1 && cur.dir !== lastDir) turns++
    lastDir = cur.dir
    cur = cur.parent
  }
  path.reverse()
  return { ok: true, path, cost: round(node.g), steps: path.length - 1, turns, explored }
}

function heuristic(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function describeFailure(
  L: Layout,
  goal: Cell,
  blocked: ReadonlySet<string>,
): { reason: string; blockers: string[] } {
  const blockers: string[] = []
  for (const d of DIRS) {
    const n = { x: goal.x + d.x, y: goal.y + d.y }
    if (!inBounds(L, n)) continue
    if (blocked.has(cellKey(n))) blockers.push(cellToSlot(L, n) ?? cellKey(n))
  }
  const reason = blockers.length
    ? `No route: the approach is walled in by ${blockers.join(', ')}.`
    : 'No route: every corridor to the target is occupied.'
  return { reason, blockers }
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

/** Binary min-heap for the open set. */
export class MinHeap<T> {
  private items: { value: T; p: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(value: T, p: number): void {
    this.items.push({ value, p })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].p <= this.items[i].p) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let small = i
        if (l < this.items.length && this.items[l].p < this.items[small].p) small = l
        if (r < this.items.length && this.items[r].p < this.items[small].p) small = r
        if (small === i) break
        this.swap(i, small)
        i = small
      }
    }
    return top.value
  }

  private swap(a: number, b: number): void {
    const t = this.items[a]
    this.items[a] = this.items[b]
    this.items[b] = t
  }
}
