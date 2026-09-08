import type { Cell } from './types'
import { GRID_H, GRID_W, cellKey, cellToSlot, inBounds } from './yardConfig'

/**
 * A* over the yard movement grid.
 *
 * Written by hand rather than pulled from a library: it is ~80 lines, it has to
 * be explainable to an examiner line by line, and it needs two things a generic
 * implementation does not give us — a turn penalty (turning a
 * loaded vehicle is slow, so a straight detour often beats a zig-zag) and the set of explored nodes, so the
 * search itself can be drawn on screen.
 */

/** N, E, S, W. Agvs do not travel diagonally. */
const DIRS: Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]
export const DIR_NAMES = ['north', 'east', 'south', 'west']

/** Cost of one cell of travel. */
export const STEP_COST = 1
/** Extra cost of a 90-degree turn — a loaded AGV corners far slower than it runs. */
export const TURN_COST = 0.6

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
  /** cells the AGV may not travel through (occupied stacks) */
  blocked?: ReadonlySet<string>
  /** direction the AGV is already facing, as a DIRS index; omit if stationary */
  facing?: number | null
  turnCost?: number
}

type Node = {
  x: number
  y: number
  dir: number // -1 = stationary at start
  g: number
  f: number
  parent: Node | null
}

export function findPath(start: Cell, goal: Cell, opts: PathOptions = {}): PathResult {
  const blocked = opts.blocked ?? new Set<string>()
  const turnCost = opts.turnCost ?? TURN_COST
  const goalKey = cellKey(goal)
  const explored: Cell[] = []

  if (!inBounds(start) || !inBounds(goal)) {
    return { ok: false, reason: 'Target lies outside the yard grid.', blockers: [], explored }
  }

  if (start.x === goal.x && start.y === goal.y) {
    return { ok: true, path: [start], cost: 0, steps: 0, turns: 0, explored: [start] }
  }

  const open = new MinHeap<Node>()
  const best = new Map<string, number>()
  const startNode: Node = {
    x: start.x,
    y: start.y,
    dir: opts.facing ?? -1,
    g: 0,
    f: heuristic(start, goal),
    parent: null,
  }
  open.push(startNode, startNode.f)
  best.set(stateKey(startNode), 0)

  while (open.size > 0) {
    const node = open.pop()!
    if (node.g > (best.get(stateKey(node)) ?? Infinity)) continue
    explored.push({ x: node.x, y: node.y })

    if (node.x === goal.x && node.y === goal.y) {
      return finish(node, explored)
    }

    for (let d = 0; d < DIRS.length; d++) {
      const nx = node.x + DIRS[d].x
      const ny = node.y + DIRS[d].y
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue

      const key = `${nx},${ny}`
      // The destination stack is enterable — the AGV pulls alongside it to lift
      // or lower. Any other occupied stack is solid.
      if (blocked.has(key) && key !== goalKey) continue

      const turned = node.dir !== -1 && node.dir !== d
      const g = node.g + STEP_COST + (turned ? turnCost : 0)
      const next: Node = {
        x: nx,
        y: ny,
        dir: d,
        g,
        f: g + heuristic({ x: nx, y: ny }, goal),
        parent: node,
      }
      const sk = stateKey(next)
      if (g >= (best.get(sk) ?? Infinity)) continue
      best.set(sk, g)
      open.push(next, next.f)
    }
  }

  return { ok: false, ...describeFailure(goal, blocked), explored }
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

/** Manhattan distance — admissible on a 4-connected grid with unit steps. */
function heuristic(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function stateKey(n: Node): string {
  return `${n.x},${n.y},${n.dir}`
}

/** Turn "no path" into something the operator can act on. */
function describeFailure(
  goal: Cell,
  blocked: ReadonlySet<string>,
): { reason: string; blockers: string[] } {
  const blockers: string[] = []
  for (const d of DIRS) {
    const n = { x: goal.x + d.x, y: goal.y + d.y }
    if (!inBounds(n)) continue
    if (blocked.has(cellKey(n))) blockers.push(cellToSlot(n) ?? cellKey(n))
  }
  const reason = blockers.length
    ? `No route: the approach is walled in by ${blockers.join(', ')}.`
    : 'No route: every corridor to the target is occupied.'
  return { reason, blockers }
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Binary min-heap. The open set is the only part of A* where the data structure
 * matters; a sorted array would make this O(n log n) per insert.
 */
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
