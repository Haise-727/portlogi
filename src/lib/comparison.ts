import { allocate, allocateNaive, emptySnapshot, type YardSnapshot } from './allocator'
import { createGenerator } from './generator'
import { findPath } from './pathfinder'
import type { Container } from './types'
import { GATE_CELL, QUAY_CELL, SLOT_IDS, slotToCell, yardConfig } from './yardConfig'

/**
 * The headline result: the same arrival sequence worked twice, once
 * first-available and once through the allocator.
 *
 * Both runs are driven by one seed, so the containers, their weights, their
 * departures and their arrival times are identical down to the check digit. The
 * only difference between the two runs is which slot gets chosen — which is the
 * only way the comparison means anything.
 *
 * Rehandles are counted where they are actually paid: at retrieval, when a box
 * has to come off the top of the one that is wanted. Placement-time prediction
 * would be the optimiser marking its own homework.
 */

export type Strategy = 'optimised' | 'naive'

export type StrategyResult = {
  strategy: Strategy
  placements: number
  /** dig-out lifts forced at retrieval — the waste being eliminated */
  rehandles: number
  /** A* cost of every loaded AGV move, including the dig-outs */
  travel: number
  /** sim-minutes the gate was blocked because the yard could not take a box */
  gateBlocked: number
  /** cumulative rehandles after each container is loaded to a vessel */
  series: number[]
}

export type ComparisonResult = {
  seed: number
  arrivals: number
  optimised: StrategyResult
  naive: StrategyResult
  points: { n: number; optimised: number; naive: number }[]
}

const STEP = 3.2 // sim-minutes between gate arrivals, matching the live yard

export function runComparison(seed: number, arrivals = 30): ComparisonResult {
  const optimised = runStrategy(seed, arrivals, 'optimised')
  const naive = runStrategy(seed, arrivals, 'naive')
  const n = Math.max(optimised.series.length, naive.series.length)
  const points = Array.from({ length: n }, (_, i) => ({
    n: i,
    optimised: optimised.series[Math.min(i, optimised.series.length - 1)],
    naive: naive.series[Math.min(i, naive.series.length - 1)],
  }))
  return { seed, arrivals, optimised, naive, points }
}

function runStrategy(seed: number, arrivals: number, strategy: Strategy): StrategyResult {
  const gen = createGenerator(seed)
  const yard = emptySnapshot()
  const queue: Container[] = []

  let spawned = 0
  let placements = 0
  let rehandles = 0
  let travel = 0
  let gateBlocked = 0
  let departures = 0
  let t = 0
  const series = [0]

  while (departures < arrivals && t < 40000) {
    // 1. everything whose departure has come due leaves for the quay
    for (;;) {
      const due = storedBoxes(yard)
        .filter((c) => c.etd <= t)
        .sort((a, b) => a.etd - b.etd)[0]
      if (!due) break
      const cost = retrieve(yard, due, strategy)
      rehandles += cost.rehandles
      travel += cost.travel
      departures++
      series[departures] = rehandles
    }

    // a box whose vessel closes while it is still at the gate is loaded direct
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].etd <= t) {
        queue.splice(i, 1)
        departures++
        series[departures] = rehandles
      }
    }

    // 2. the gate reads one box in
    if (spawned < arrivals) {
      queue.push(gen.next(t))
      spawned++
    }

    // 3. place whatever the yard can take
    while (queue.length) {
      const c = queue[0]
      const target =
        strategy === 'naive' ? allocateNaive(c, yard) : optimisedTarget(c, yard)
      if (!target) {
        gateBlocked += STEP
        break
      }
      travel += pathCost(GATE_CELL, target.slot, yard)
      yard[target.slot] = [...yard[target.slot], c]
      queue.shift()
      placements++
    }

    t += STEP
  }

  return { strategy, placements, rehandles, travel: round(travel), gateBlocked: round(gateBlocked), series }
}

function optimisedTarget(c: Container, yard: YardSnapshot): { slot: string } | null {
  const result = allocate(c, yard, GATE_CELL)
  const pick = result.candidates.find((k) => yard[k.slot].length < yardConfig.tiers)
  return pick ? { slot: pick.slot } : null
}

/** Dig a box out and run it to the quay, paying for every blocker on top of it. */
function retrieve(
  yard: YardSnapshot,
  target: Container,
  strategy: Strategy,
): { rehandles: number; travel: number } {
  const slot = SLOT_IDS.find((s) => yard[s].some((c) => c.id === target.id))
  if (!slot) return { rehandles: 0, travel: 0 }

  const idx = yard[slot].findIndex((c) => c.id === target.id)
  const above = yard[slot].slice(idx + 1).reverse()
  let rehandles = 0
  let travel = 0

  for (const blocker of above) {
    yard[slot] = yard[slot].filter((c) => c.id !== blocker.id)
    const temp = tempSlotFor(blocker, yard, slot, strategy)
    if (temp) {
      travel += pathCost(slotToCell(slot), temp, yard)
      yard[temp] = [...yard[temp], blocker]
    }
    rehandles++
  }

  yard[slot] = yard[slot].filter((c) => c.id !== target.id)
  travel += pathCostBetween(slotToCell(slot), QUAY_CELL, yard)
  return { rehandles, travel }
}

function tempSlotFor(
  blocker: Container,
  yard: YardSnapshot,
  avoid: string,
  strategy: Strategy,
): string | null {
  if (strategy === 'naive') {
    for (const s of SLOT_IDS) {
      if (s === avoid) continue
      if (yard[s].length >= yardConfig.tiers) continue
      return s
    }
    return null
  }
  const result = allocate(blocker, yard, slotToCell(avoid))
  const pick = result.candidates.find(
    (k) => k.slot !== avoid && yard[k.slot].length < yardConfig.tiers,
  )
  return pick?.slot ?? null
}

function pathCost(from: { x: number; y: number }, slot: string, yard: YardSnapshot): number {
  return pathCostBetween(from, slotToCell(slot), yard)
}

function pathCostBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
  yard: YardSnapshot,
): number {
  const blocked = new Set<string>()
  for (const s of SLOT_IDS) {
    if (yard[s].length > 0) {
      const c = slotToCell(s)
      blocked.add(`${c.x},${c.y}`)
    }
  }
  blocked.delete(`${from.x},${from.y}`)
  const p = findPath(from, to, { blocked })
  return p.ok ? p.cost : 0
}

function storedBoxes(yard: YardSnapshot): Container[] {
  return SLOT_IDS.flatMap((s) => yard[s])
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}
