import { Engine } from './engine'
import { newGenState, rand } from './generator'
import type { LayoutSpec } from './layout'
import { stat, type Stat } from './experiment'

/**
 * What is knowing when a box will be collected worth?
 *
 * An import box has no fixed departure: it leaves when a truck comes for it. The yard has to place it
 * before it knows when that will be. This runs the same arrivals, the same hidden true pickup times and
 * the same yard under policies that reveal more and more about those times, and measures the cost of not
 * knowing: rehandles (boxes lifted aside to reach the one wanted) and how long trucks wait for their box.
 *
 * It is a model, not a measurement of a real port. The true pickup times are drawn from a plain uniform
 * distribution (1 to 5 hours after arrival) because real ones were not found in a source; what carries over
 * is the shape of the result (more information, fewer rehandles), not the size.
 */
export type InfoPolicy = 'constant' | 'noisy60' | 'noisy15' | 'lead20' | 'lead60' | 'lead120' | 'oracle'

export const POLICIES: { id: InfoPolicy; label: string; detail: string }[] = [
  { id: 'constant', label: 'Guess only', detail: 'assumed to leave 3 hours after arrival; the truck arrives unannounced' },
  { id: 'noisy60', label: 'Estimate, about 60 min off', detail: 'a forecast with a typical error of an hour; the truck arrives unannounced' },
  { id: 'noisy15', label: 'Estimate, about 15 min off', detail: 'a good forecast, such as an appointment slot; the truck arrives unannounced' },
  { id: 'lead20', label: 'Booked 20 min ahead', detail: 'the exact time is known 20 minutes before the truck is due' },
  { id: 'lead60', label: 'Booked 1 hour ahead', detail: 'the exact time is known an hour before' },
  { id: 'lead120', label: 'Booked 2 hours ahead', detail: 'the exact time is known two hours before' },
  { id: 'oracle', label: 'Booked at arrival', detail: 'the exact time is known when the box lands, before it is placed' },
]

export type InfoRun = {
  policy: InfoPolicy
  seed: number
  boxes: number
  departed: number
  rehandles: number
  /** mean minutes a truck waited for its box, counted from the moment it was due */
  truckWait: number
  /** longest wait */
  worstWait: number
}

const ARRIVE_EVERY = 3.2

export function runInfoExperiment(o: { seed: number; policy: InfoPolicy; boxes?: number; spec?: LayoutSpec }): InfoRun {
  const n = o.boxes ?? 20
  const e = new Engine({ seed: o.seed, spec: o.spec, strategy: 'optimised' })
  const g = newGenState((o.seed * 2654435761) >>> 0) // hidden truth, independent of the yard's own randomness
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand(g))) * Math.cos(2 * Math.PI * rand(g))

  const truth = new Map<string, number>()
  const pending: { at: number; run: () => void }[] = []
  const arrivalTicks = Array.from({ length: n }, (_, i) => Math.round((i * ARRIVE_EVERY) / 0.01))
  let admitted = 0
  const seen = new Set<string>()

  for (let tick = 0; tick < 150_000; tick++) {
    // a new import comes off the ship
    if (admitted < n && tick === arrivalTicks[admitted]) {
      e.exec({ t: 'admit', flow: 'import' })
      admitted++
      const c = Object.values(e.s.containers).find((x) => x.flow === 'import' && !seen.has(x.id))
      if (c) {
        seen.add(c.id)
        const T = e.s.now + 60 + rand(g) * 240 // when the truck really comes
        truth.set(c.id, T)
        const clamp = (t: number) => Math.max(t, e.s.now + 16)
        const book = (when: number) => () => e.exec({ t: 'book', id: c.id, fleetId: 'x', fleetName: 'Truck', start: Math.max(T, e.s.now + 16), end: T + 60 + (when - when) })
        if (o.policy === 'oracle') book(0)()
        else if (o.policy === 'noisy60') e.exec({ t: 'estimate', id: c.id, etd: clamp(T + gauss() * 60) })
        else if (o.policy === 'noisy15') e.exec({ t: 'estimate', id: c.id, etd: clamp(T + gauss() * 15) })
        else if (o.policy === 'lead20' || o.policy === 'lead60' || o.policy === 'lead120') {
          const lead = o.policy === 'lead20' ? 20 : o.policy === 'lead60' ? 60 : 120
          pending.push({ at: Math.max(e.s.now + 1, T - lead), run: book(0) })
        }
        // an unannounced truck turns up at T and asks for its box
        if (o.policy === 'constant' || o.policy === 'noisy60' || o.policy === 'noisy15') {
          pending.push({
            at: T,
            run: () => {
              e.exec({ t: 'retrieve', id: c.id })
              if (e.s.pendingPlan?.containerId === c.id) e.exec({ t: 'confirm' })
            },
          })
        }
      }
    }
    for (const p of pending) {
      if (p.at !== Infinity && e.s.now >= p.at) {
        p.run()
        p.at = Infinity
      }
    }
    e.step()
    if (admitted === n && Object.values(e.s.containers).every((c) => c.status === 'departed')) break
  }

  const waits = [...truth].map(([id, T]) => {
    const c = e.s.containers[id]
    return c.departedAt === undefined ? 600 : Math.max(0, c.departedAt - T)
  })
  return {
    policy: o.policy,
    seed: o.seed,
    boxes: n,
    departed: Object.values(e.s.containers).filter((c) => c.status === 'departed').length,
    rehandles: e.s.metrics.rehandleMoves,
    truckWait: waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length),
    worstWait: Math.max(0, ...waits),
  }
}

export type InfoSummary = { policy: InfoPolicy; label: string; rehandles: Stat; truckWait: Stat; worstWait: Stat; allDeparted: boolean }

export function compareInformation(seeds: number[], boxes = 20, spec?: LayoutSpec): InfoSummary[] {
  return POLICIES.map((p) => {
    const runs = seeds.map((seed) => runInfoExperiment({ seed, policy: p.id, boxes, spec }))
    return {
      policy: p.id,
      label: p.label,
      rehandles: stat(runs.map((r) => r.rehandles)),
      truckWait: stat(runs.map((r) => r.truckWait)),
      worstWait: stat(runs.map((r) => r.worstWait)),
      allDeparted: runs.every((r) => r.departed === r.boxes),
    }
  })
}
