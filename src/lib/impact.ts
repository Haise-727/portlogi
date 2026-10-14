import type { Grade, PortFact } from '../data/ports'

/**
 * What the allocator's measured improvement would mean at a real port's scale.
 *
 * The inputs that are NOT public (how many rehandles a real yard does) are what-if sliders, never claims.
 * The two reductions are measured by portlogi's own experiments (reports/results.md, `npm run report`)
 * and are the honest pair: against a naive baseline, and against a rule that already uses departure times.
 */
export const MEASURED = {
  /** first-available placement -> the full allocator; 100 seeds */
  vsFirstAvailable: 0.696,
  /** ETD rule alone (rehandle term only) -> the full allocator; 60 seeds */
  vsEtdRule: 0.31,
  source: 'portlogi experiments on the simulated 4x3 yard, reports/results.md',
} as const

export type Baseline = 'first-available' | 'etd-rule'

export type ImpactInput = {
  teuPerYear: number
  /** TEU per container box; a 40-ft box is 2 TEU, so real mixes sit between 1 and 2 */
  teuPerBox: number
  /** extra yard moves per box that the baseline strategy causes (a what-if) */
  rehandleRate: number
  baseline: Baseline
  /** what one avoided move is worth, in rupees; leave 0 to skip */
  costPerMove: number
  /** minutes of vehicle or crane time one move takes; leave 0 to skip */
  minutesPerMove: number
}

export type ImpactResult = {
  boxes: number
  baselineRehandles: number
  reduction: number
  avoided: number
  avoidedPerDay: number
  rupeesSaved: number | null
  hoursSaved: number | null
}

export function reductionFor(b: Baseline): number {
  return b === 'first-available' ? MEASURED.vsFirstAvailable : MEASURED.vsEtdRule
}

export function impact(i: ImpactInput): ImpactResult {
  const boxes = i.teuPerBox > 0 ? i.teuPerYear / i.teuPerBox : 0
  const baselineRehandles = boxes * Math.max(0, i.rehandleRate)
  const reduction = reductionFor(i.baseline)
  const avoided = baselineRehandles * reduction
  return {
    boxes,
    baselineRehandles,
    reduction,
    avoided,
    avoidedPerDay: avoided / 365,
    rupeesSaved: i.costPerMove > 0 ? avoided * i.costPerMove : null,
    hoursSaved: i.minutesPerMove > 0 ? (avoided * i.minutesPerMove) / 60 : null,
  }
}

/** Ports that have a throughput figure a calculation may rely on (never an unverified one). */
export function usableThroughput(p: PortFact): number | null {
  const t = p.throughput
  return t && t.grade !== ('unverified' satisfies Grade) ? t.teu : null
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN')
}

/** Indian digit grouping with a crore / lakh word for big rupee figures. */
export function formatRupees(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} crore`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} lakh`
  return `₹${formatInt(n)}`
}
