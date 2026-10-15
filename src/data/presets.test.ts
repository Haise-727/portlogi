import { describe, expect, it } from 'vitest'
import { Engine } from '../engine/engine'
import { checkInvariants } from '../engine/invariants'
import { PORTS } from './ports'
import { PRESETS } from './presets'

describe('port presets', () => {
  it('every port has a preset', () => {
    for (const p of PORTS) expect(PRESETS[p.id], p.id).toBeTruthy()
  })
  for (const [id, pr] of Object.entries(PRESETS)) {
    it(`${id} runs 4 sim-hours safely`, () => {
      const e = new Engine({ seed: 7, spec: pr.spec, weights: pr.weights, timing: pr.timing, auto: true })
      for (let i = 0; i < 24_000; i++) {
        e.step()
        if (i % 500 === 0) expect(checkInvariants(e)).toEqual([])
      }
      expect(checkInvariants(e)).toEqual([])
      expect(Object.keys(e.s.containers).length).toBeGreaterThan(0)
    })
  }
})
