import { describe, expect, it } from 'vitest'
import { allocate, checkConstraints, emptySnapshot } from './allocator'
import { Engine } from './engine'
import { compare, runExperiment } from './experiment'
import { containerFromTag, drawContainer, newGenState } from './generator'
import { checkInvariants } from './invariants'
import { buildLayout, defaultSpec, normalizeSpec } from './layout'
import { findPath, costMap } from './pathfinder'
import { Session } from './session'
import { ReservationTable, schedulePath, segmentTimes } from './traffic'
import type { Container } from './types'

const L = buildLayout(defaultSpec())

function box(over: Partial<Container> = {}): Container {
  return {
    id: 'TUTX 100000 0',
    tagUid: 'AAAA0000',
    type: 'standard',
    etd: 100,
    weight: 10,
    destination: 'Colombo',
    vessel: 'SSL Kaveri',
    arrivedAt: 0,
    slot: null,
    tier: null,
    status: 'inbound',
    gate: 'G1',
    ...over,
  }
}

describe('layout', () => {
  it('derives the default 4x3 yard', () => {
    expect(L.slotIds).toHaveLength(12)
    expect(L.gridW).toBe(6)
    expect(L.gridH).toBe(7)
    expect(L.capacity).toBe(24)
  })

  it('grows to a larger yard and keeps every derived value consistent', () => {
    const big = buildLayout({ ...defaultSpec(), rows: 5, cols: 6, tiers: 3 })
    expect(big.slotIds).toHaveLength(30)
    expect(big.gridH).toBe(11)
    expect(big.capacity).toBe(90)
  })

  it('normalises bad input instead of throwing', () => {
    const s = normalizeSpec({ ...defaultSpec(), rows: 99, cols: -3, gates: [], quays: [99], pads: [3, 3, 99], powered: ['Z9', 'A1'] })
    expect(s.rows).toBeLessThanOrEqual(8)
    expect(s.cols).toBeGreaterThanOrEqual(1)
    expect(s.gates.length).toBeGreaterThan(0)
    expect(s.quays.length).toBeGreaterThan(0)
    expect(s.powered).not.toContain('Z9')
  })
})

describe('pathfinder', () => {
  it('finds a route and charges for turns', () => {
    const p = findPath(L, { x: 2, y: 0 }, { x: 3, y: 6 })
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.path[0]).toEqual({ x: 2, y: 0 })
      expect(p.path.at(-1)).toEqual({ x: 3, y: 6 })
      expect(p.cost).toBeGreaterThanOrEqual(p.steps)
    }
  })

  it('refuses to route through a stack, but may enter it as the goal', () => {
    const blocked = new Set(['2,1', '2,3', '2,5'])
    const p = findPath(L, { x: 1, y: 0 }, { x: 2, y: 3 }, { blocked })
    expect(p.ok).toBe(true)
    const through = findPath(L, { x: 2, y: 0 }, { x: 2, y: 6 }, { blocked })
    if (through.ok) expect(through.path.some((c) => c.x === 2 && c.y === 3)).toBe(false)
  })

  it('costMap agrees with findPath', () => {
    const blocked = new Set(['2,3'])
    const m = costMap(L, { x: 2, y: 0 }, blocked)
    for (const goal of [{ x: 4, y: 5 }, { x: 1, y: 3 }, { x: 3, y: 6 }]) {
      const p = findPath(L, { x: 2, y: 0 }, goal, { blocked })
      expect(p.ok).toBe(true)
      if (p.ok) expect(m.get(`${goal.x},${goal.y}`)).toBeCloseTo(p.cost, 5)
    }
  })
})

describe('traffic', () => {
  it('cornering takes longer than a straight run', () => {
    const straight = segmentTimes(L, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 1)
    const corner = segmentTimes(L, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 1)
    expect(corner[1]).toBeGreaterThan(straight[1])
  })

  it('a truck crosses a cell in time proportional to its real length', () => {
    // a slot column is wider than an aisle row is tall: same speed, different time
    const wide = segmentTimes(L, [{ x: 2, y: 1 }, { x: 3, y: 1 }], 1)[0]
    const narrow = segmentTimes(L, [{ x: 2, y: 1 }, { x: 2, y: 2 }], 2)[0]
    expect(wide).toBeGreaterThan(narrow)
    expect(wide / narrow).toBeCloseTo(132 / ((92 + 42) / 2), 1)
  })

  it('the final cell is an open-ended claim', () => {
    const t = schedulePath(L, [{ x: 0, y: 0 }, { x: 1, y: 0 }], 0, null)
    expect(t[1].exit).toBe(Infinity)
  })

  it('detects an overlapping booking and clears when the other has gone', () => {
    const table = new ReservationTable()
    table.reserve('A', 0, schedulePath(L, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 0, null), 'a')
    const mine = schedulePath(L, [{ x: 1, y: 0 }, { x: 2, y: 0 }], 0, null)
    expect(table.conflicts('B', mine).length).toBeGreaterThan(0)
    table.release('A')
    expect(table.conflicts('B', mine)).toHaveLength(0)
  })
})

describe('allocator rules', () => {
  const snap = () => emptySnapshot(L)

  it('rejects a reefer outside the powered row', () => {
    expect(checkConstraints(L, box({ type: 'reefer' }), 'B2', 0, snap())?.rule).toBe('power')
    expect(checkConstraints(L, box({ type: 'reefer' }), 'A2', 0, snap())).toBeNull()
  })

  it('rejects a heavier box on a lighter one', () => {
    const y = snap()
    y.B1 = [box({ id: 'X 1 0', weight: 5 })]
    expect(checkConstraints(L, box({ weight: 9 }), 'B1', 1, y)?.rule).toBe('weight')
  })

  it('keeps hazmat apart', () => {
    const y = snap()
    y.B1 = [box({ id: 'X 1 0', type: 'hazmat' })]
    expect(checkConstraints(L, box({ type: 'hazmat' }), 'B2', 0, y)?.rule).toBe('segregation')
  })

  it('never buries an earlier departure when it can avoid it', () => {
    const y = snap()
    y.B1 = [box({ id: 'X 1 0', etd: 50, weight: 20 })]
    const r = allocate(L, box({ etd: 200, weight: 10 }), y, L.gates[0].cell)
    expect(r.best?.slot).not.toBe('B1')
  })

  it('treats a disabled slot as unavailable', () => {
    const l2 = buildLayout({ ...defaultSpec(), disabled: ['B2'] })
    const r = allocate(l2, box(), emptySnapshot(l2), l2.gates[0].cell)
    expect(r.candidates.some((c) => c.slot === 'B2')).toBe(false)
    expect(r.rejectionBySlot.B2.rule).toBe('disabled')
  })
})

describe('generator', () => {
  it('is reproducible from a seed', () => {
    const a = drawContainer(newGenState(7), 0, 'G1')
    const b = drawContainer(newGenState(7), 0, 'G1')
    expect(a).toEqual(b)
  })

  it('an RFID card always maps to the same container', () => {
    expect(containerFromTag('04a32f91', 0, 'G1')).toEqual(containerFromTag('04A32F91', 0, 'G1'))
    expect(containerFromTag('04A32F91', 0, 'G1').id).not.toBe(containerFromTag('04A32F92', 0, 'G1').id)
  })
})

describe('engine', () => {
  it('is deterministic: same seed and commands give the same yard', () => {
    const run = () => {
      const e = new Engine({ seed: 11, auto: true })
      e.run(20000)
      return JSON.stringify([e.s.stacks, e.s.metrics, e.s.now])
    }
    expect(run()).toBe(run())
  })

  it('places a scanned box and retrieves it', () => {
    const e = new Engine({ seed: 3 })
    e.exec({ t: 'admit' })
    e.run(6000)
    const c = Object.values(e.s.containers)[0]
    expect(c.status).toBe('stored')
    e.exec({ t: 'retrieve', id: c.id })
    e.run(8000)
    expect(e.s.containers[c.id].status).toBe('departed')
    expect(checkInvariants(e)).toEqual([])
  })

  it('trucks dwell: a lift takes the configured time', () => {
    const e = new Engine({ seed: 3, timing: { lift: 1, gate: 2, quay: 1, slowFactor: 2 } })
    e.exec({ t: 'admit' })
    let dwellSteps = 0
    for (let i = 0; i < 4000; i++) {
      e.step()
      if (e.s.agvs.some((a) => a.mode === 'hoisting')) dwellSteps++
    }
    expect(dwellSteps * 0.01).toBeGreaterThanOrEqual(1.9)
  })

  it('an out-of-range layout change is refused while boxes would be orphaned', () => {
    const e = new Engine({ seed: 3 })
    e.exec({ t: 'admit' })
    e.run(6000)
    const c = Object.values(e.s.containers)[0]
    const shrunk = { ...defaultSpec(), rows: 1, cols: 1, gates: [1], quays: [1], pads: [] }
    if (c.slot !== 'A1') {
      e.exec({ t: 'layout', spec: shrunk })
      expect(e.layout.slotIds).toHaveLength(12)
    }
  })

  it('applies a larger layout and keeps working', () => {
    const e = new Engine({ seed: 5, auto: true })
    e.exec({ t: 'layout', spec: { ...defaultSpec(), rows: 5, cols: 6, agvs: 4, gates: [2, 5], quays: [3, 6], pads: [1, 4], powered: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] } })
    expect(e.layout.slotIds).toHaveLength(30)
    for (let i = 0; i < 40; i++) {
      e.run(500)
      expect(checkInvariants(e)).toEqual([])
    }
    expect(e.s.metrics.stored).toBeGreaterThan(0)
  })

  it('moves a container on request and refuses an illegal move', () => {
    const e = new Engine({ seed: 9 })
    e.exec({ t: 'admit', type: 'standard' })
    e.run(6000)
    const c = Object.values(e.s.containers)[0]
    e.exec({ t: 'move', id: c.id, slot: 'C4' })
    e.run(8000)
    expect(e.s.containers[c.id].slot).toBe('C4')
    e.exec({ t: 'setType', id: c.id, type: 'reefer' })
    e.run(12000)
    const after = e.s.containers[c.id]
    expect(after.type).toBe('reefer')
    expect(L.powered.has(after.slot!)).toBe(true)
    expect(checkInvariants(e)).toEqual([])
  })

  it('groups containers', () => {
    const e = new Engine({ seed: 9 })
    e.exec({ t: 'admit' })
    const id = Object.keys(e.s.containers)[0]
    e.exec({ t: 'setGroup', ids: [id], group: 'Pharma' })
    expect(e.s.containers[id].group).toBe('Pharma')
  })
})

describe('safety under load', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  it.each(seeds)('seed %i: no collisions, illegal stacks or lost boxes', (seed) => {
    const r = runExperiment({ seed, strategy: 'optimised', arrivals: 40, checkEvery: 5 })
    expect(r.violations).toEqual([])
    expect(r.finished).toBe(true)
  })

  it('stays safe with four vehicles on a larger yard, including breakdowns and surges', () => {
    const spec = { ...defaultSpec(), rows: 4, cols: 6, agvs: 4, gates: [2, 5], quays: [3, 6], pads: [1, 4], powered: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] }
    const e = new Engine({ seed: 21, spec, auto: true })
    const bad: string[] = []
    for (let i = 0; i < 60000; i++) {
      e.step()
      if (i === 8000) e.exec({ t: 'scenario', name: 'surge' })
      if (i === 15000) e.exec({ t: 'scenario', name: 'breakdown' })
      if (i === 25000) e.exec({ t: 'scenario', name: 'reefer-storm' })
      if (i % 5 === 0) bad.push(...checkInvariants(e))
      if (bad.length) break
    }
    expect(bad).toEqual([])
    expect(e.s.metrics.departed).toBeGreaterThan(5)
  })
})

describe('replay', () => {
  it('rebuilds the exact yard at an earlier tick', () => {
    const s = new Session({ seed: 4, auto: false })
    s.command({ t: 'admit' })
    s.advance(20)
    s.command({ t: 'admit' })
    s.advance(40)
    const mid = s.replayTo(3000).engine
    const ref = new Engine({ seed: 4 })
    ref.exec({ t: 'admit' })
    ref.run(2000)
    ref.exec({ t: 'admit' })
    ref.run(1000)
    expect(JSON.stringify(mid.s.stacks)).toBe(JSON.stringify(ref.s.stacks))
    expect(mid.s.agvs.map((a) => a.pos)).toEqual(ref.s.agvs.map((a) => a.pos))
  })
})

describe('the headline result', () => {
  it('the allocator causes fewer rehandles than first-available', () => {
    const c = compare([1, 2, 3, 4, 5, 6], { arrivals: 30 })
    expect(c.violations).toBe(0)
    expect(c.rehandles.optimised.mean).toBeLessThan(c.rehandles.naive.mean)
  })
})

describe('random layouts', () => {
  // small seeded generator so the layouts themselves are reproducible
  const pick = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

  it.each(Array.from({ length: 24 }, (_, i) => i + 100))('layout %i: safe and never deadlocks', (seed) => {
    const r = (() => {
      let a = seed
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0
        return a / 4294967296
      }
    })()
    const rows = pick(r, 2, 6)
    const cols = pick(r, 3, 9)
    const powered = Array.from({ length: cols }, (_, c) => `A${c + 1}`)
    const spec = {
      rows,
      cols,
      tiers: pick(r, 1, 3),
      powered,
      disabled: r() < 0.4 ? [`B${pick(r, 1, cols)}`] : [],
      gates: [pick(r, 1, cols), pick(r, 1, cols)],
      quays: [pick(r, 1, cols), pick(r, 1, cols)],
      pads: [0, cols + 1],
      agvs: pick(r, 1, 5),
    }
    const e = new Engine({ seed, spec, auto: true })
    let lastProgress = 0
    let lastDeparted = 0
    for (let i = 0; i < 90000; i++) {
      e.step()
      if (i % 7 === 0) {
        const bad = checkInvariants(e)
        if (bad.length) throw new Error(`${JSON.stringify(spec)}\n${bad[0]}`)
      }
      if (e.s.metrics.departed > lastDeparted) {
        lastDeparted = e.s.metrics.departed
        lastProgress = e.s.now
      }
      // a yard with work to do must keep delivering
      const waiting = e.s.jobs.length > 0 || Object.values(e.s.containers).some((c) => c.status === 'stored')
      if (waiting && e.s.now - lastProgress > 500 && e.s.now > 600) {
        throw new Error(`stalled at t=${e.s.now.toFixed(0)} (departed ${lastDeparted})\n${JSON.stringify(spec)}\n${e.s.events.slice(0, 4).map((x) => x.message).join('\n')}`)
      }
    }
    expect(e.s.metrics.stored).toBeGreaterThan(0)
  })
})
