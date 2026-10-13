import { DEFAULT_WEIGHTS, type Weights } from './allocator'
import { DEFAULT_TIMING, Engine, type Strategy, type Timing } from './engine'
import { checkInvariants } from './invariants'
import type { LayoutSpec } from './layout'

/**
 * Headless runs of the real engine. The browser, the test suite and the
 * backend all use this one simulation, so the numbers in the report are the
 * numbers on screen.
 */
export type RunConfig = {
  seed: number
  strategy: Strategy
  spec?: LayoutSpec
  arrivals?: number
  weights?: Weights
  timing?: Timing
  /** give up after this many sim-minutes */
  maxMinutes?: number
  /** check safety invariants every N ticks; 0 disables */
  checkEvery?: number
}

export type RunSummary = {
  seed: number
  strategy: Strategy
  arrivals: number
  departed: number
  finished: boolean
  /** sim-minutes until the last box left */
  makespan: number
  /** dig-out lifts forced at retrieval: the waste being eliminated */
  rehandles: number
  /** grid cells driven by all vehicles */
  cells: number
  avgDwell: number
  avgGateWait: number
  holds: number
  agvUtilisation: number
  /** safety violations observed; must be zero */
  violations: string[]
}

export function runExperiment(cfg: RunConfig): RunSummary {
  const arrivals = cfg.arrivals ?? 30
  const e = new Engine({
    seed: cfg.seed,
    spec: cfg.spec,
    strategy: cfg.strategy,
    weights: cfg.weights ?? { ...DEFAULT_WEIGHTS },
    timing: cfg.timing ?? { ...DEFAULT_TIMING },
    auto: true,
    arrivalCap: arrivals,
  })
  const limit = Math.round((cfg.maxMinutes ?? 1500) / 0.01)
  const every = cfg.checkEvery ?? 0
  const violations: string[] = []
  let finishedAt = -1

  for (let i = 0; i < limit; i++) {
    e.step()
    if (every && e.s.tick % every === 0 && violations.length < 10) violations.push(...checkInvariants(e))
    if (e.s.arrivals >= arrivals && e.s.metrics.departed >= arrivals) {
      finishedAt = e.s.now
      break
    }
  }

  const m = e.s.metrics
  return {
    seed: cfg.seed,
    strategy: cfg.strategy,
    arrivals,
    departed: m.departed,
    finished: finishedAt >= 0,
    makespan: finishedAt >= 0 ? finishedAt : e.s.now,
    rehandles: m.rehandleMoves,
    cells: m.cells,
    avgDwell: m.dwellCount ? m.dwellTotal / m.dwellCount : 0,
    avgGateWait: m.gateWaitCount ? m.gateWaitTotal / m.gateWaitCount : 0,
    holds: m.holds,
    agvUtilisation: m.agvElapsed ? m.agvBusy / m.agvElapsed : 0,
    violations: violations.slice(0, 10),
  }
}

export type Stat = { mean: number; sd: number; ci95: number; min: number; max: number; n: number }

export function stat(xs: number[]): Stat {
  const n = xs.length
  const mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  return {
    mean,
    sd,
    ci95: n > 1 ? 1.96 * (sd / Math.sqrt(n)) : 0,
    min: n ? Math.min(...xs) : 0,
    max: n ? Math.max(...xs) : 0,
    n,
  }
}

export type Comparison = {
  seeds: number[]
  runs: { optimised: RunSummary; naive: RunSummary }[]
  rehandles: { optimised: Stat; naive: Stat }
  cells: { optimised: Stat; naive: Stat }
  makespan: { optimised: Stat; naive: Stat }
  avgDwell: { optimised: Stat; naive: Stat }
  /** mean rehandles avoided as a share of the baseline */
  rehandleReduction: number
  violations: number
}

/** The headline experiment: the same arrivals worked both ways, across many seeds. */
export function compare(
  seeds: number[],
  base: Omit<RunConfig, 'seed' | 'strategy'> = {},
  onProgress?: (done: number, total: number) => void,
): Comparison {
  const runs = seeds.map((seed, i) => {
    const r = {
      optimised: runExperiment({ ...base, seed, strategy: 'optimised' }),
      naive: runExperiment({ ...base, seed, strategy: 'naive' }),
    }
    onProgress?.(i + 1, seeds.length)
    return r
  })
  const pick = (f: (r: RunSummary) => number) => ({
    optimised: stat(runs.map((r) => f(r.optimised))),
    naive: stat(runs.map((r) => f(r.naive))),
  })
  const rehandles = pick((r) => r.rehandles)
  return {
    seeds,
    runs,
    rehandles,
    cells: pick((r) => r.cells),
    makespan: pick((r) => r.makespan),
    avgDwell: pick((r) => r.avgDwell),
    rehandleReduction: rehandles.naive.mean ? 1 - rehandles.optimised.mean / rehandles.naive.mean : 0,
    violations: runs.reduce((a, r) => a + r.optimised.violations.length + r.naive.violations.length, 0),
  }
}
