import { describe, expect, it } from 'vitest'
import { runInfoExperiment } from './information'

describe('value of departure information', () => {
  const seeds = [1, 2, 3, 4, 5, 6]
  const mean = (p: Parameters<typeof runInfoExperiment>[0]['policy'], k: 'rehandles' | 'truckWait') =>
    seeds.reduce((a, s) => a + runInfoExperiment({ seed: s, policy: p })[k], 0) / seeds.length

  it('knowing the time at placement cuts rehandles', () => {
    expect(mean('oracle', 'rehandles')).toBeLessThan(mean('constant', 'rehandles') * 0.6)
  })
  it('a booking made ahead stages the box so the truck does not wait', () => {
    expect(mean('lead60', 'truckWait')).toBeLessThan(1)
    expect(mean('constant', 'truckWait')).toBeGreaterThan(2)
  })
  it('every box leaves', () => {
    for (const p of ['constant', 'lead20', 'oracle'] as const) expect(runInfoExperiment({ seed: 3, policy: p }).departed).toBe(20)
  })
})
