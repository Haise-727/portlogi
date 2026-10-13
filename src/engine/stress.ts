import { Engine } from './engine'
import { checkInvariants } from './invariants'
import { normalizeSpec, type LayoutSpec } from './layout'

/**
 * Randomised robustness test: a reproducible random yard (size, tiers, power,
 * a closed slot, gates, quays, pads, fleet) is driven for 1000 sim-minutes
 * with a vessel surge, a vehicle breakdown and a reefer storm thrown in.
 * Safety (no collision, illegal stack or lost box) is checked throughout;
 * liveness (boxes keep leaving) is checked by a watchdog.
 */
export type StressResult = {
  seed: number
  spec: LayoutSpec
  ok: boolean
  /** empty when ok; otherwise the first thing that went wrong */
  failure: '' | 'safety' | 'stall'
  detail: string
  departed: number
}

export function randomSpec(seed: number): LayoutSpec {
  let a = seed
  const r = () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
  const pick = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const rows = pick(1, 6)
  const cols = pick(2, 10)
  return normalizeSpec({
    rows,
    cols,
    tiers: pick(1, 4),
    powered: Array.from({ length: cols }, (_, c) => `A${c + 1}`).slice(0, pick(1, cols)),
    disabled: r() < 0.4 ? [`${'ABCDEF'[pick(0, rows - 1)]}${pick(1, cols)}`] : [],
    gates: Array.from({ length: pick(1, 3) }, () => pick(1, cols)),
    quays: Array.from({ length: pick(1, 3) }, () => pick(1, cols)),
    pads: [0, cols + 1].slice(0, pick(0, 2)),
    agvs: pick(1, 6),
  })
}

export function stressLayout(seed: number): StressResult {
  const spec = randomSpec(seed)
  const e = new Engine({ seed, spec, auto: true })
  let lastDeparted = 0
  let lastProgress = 0

  for (let i = 0; i < 100000; i++) {
    e.step()
    if (i === 12000) e.exec({ t: 'scenario', name: 'surge' })
    if (i === 30000) e.exec({ t: 'scenario', name: 'breakdown' })
    if (i === 50000) e.exec({ t: 'scenario', name: 'reefer-storm' })
    if (i % 9 === 0) {
      const bad = checkInvariants(e)
      if (bad.length) return { seed, spec, ok: false, failure: 'safety', detail: bad[0], departed: lastDeparted }
    }
    if (e.s.metrics.departed > lastDeparted) {
      lastDeparted = e.s.metrics.departed
      lastProgress = e.s.now
    }
    const work = e.s.jobs.length > 0 || Object.values(e.s.containers).some((c) => c.status === 'stored')
    if (work && e.s.now > 700 && e.s.now - lastProgress > 600) {
      return { seed, spec, ok: false, failure: 'stall', detail: `no departure since t=${lastProgress.toFixed(0)}`, departed: lastDeparted }
    }
  }
  return { seed, spec, ok: true, failure: '', detail: '', departed: lastDeparted }
}
