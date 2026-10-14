import { describe, expect, it } from 'vitest'
import { BOOKING_MIN_LEAD, Engine } from './engine'
import { checkInvariants } from './invariants'
import { defaultSpec } from './layout'
import { Session } from './session'
import type { Container } from './types'

const imports = (e: Engine): Container[] => Object.values(e.s.containers).filter((c) => c.flow === 'import')
const minutes = (m: number) => Math.round(m / 0.01)

/** Run until every import box is stored in the yard (not still waiting or on a truck). */
function settle(e: Engine, limit = 150): void {
  for (let m = 0; m < limit && imports(e).some((c) => c.status !== 'stored'); m += 1) e.run(minutes(1))
}

/** Session.advance deliberately does at most 400 steps a call (like one frame), so move in frame-sized chunks. */
function advance(s: Session, simMinutes: number): void {
  for (let m = 0; m < simMinutes; m += 0.5) s.advance(0.5)
}

describe('import flow', () => {
  it('imports come off a ship at a quay and wait with only an estimated departure', () => {
    const e = new Engine({ seed: 2 })
    e.exec({ t: 'scenario', name: 'discharge' })
    const boxes = imports(e)
    expect(boxes.length).toBe(6)
    for (const c of boxes) {
      expect(e.layout.quays.map((q) => q.id)).toContain(c.gate)
      expect(c.declared).toBe(false)
      expect(c.booking).toBeUndefined()
      expect(c.etd).toBeGreaterThan(e.s.now)
    }
    settle(e)
    expect(imports(e).every((c) => c.status === 'stored')).toBe(true)
    expect(checkInvariants(e)).toEqual([])
  })

  it('does not release an unbooked import just because its estimate passes', () => {
    const e = new Engine({ seed: 2, auto: true })
    e.exec({ t: 'scenario', name: 'discharge' })
    e.run(minutes(250)) // well past the 180-minute estimate
    expect(imports(e).filter((c) => c.status === 'departed')).toHaveLength(0)
  })

  it('a booking makes the departure firm, and the box leaves through a gate for that truck', () => {
    const e = new Engine({ seed: 3 })
    e.exec({ t: 'scenario', name: 'discharge' })
    settle(e)
    const c = imports(e)[0]
    const start = e.s.now + 40
    e.exec({ t: 'book', id: c.id, fleetId: 'f1', fleetName: 'Kaveri Carriers', start, end: start + 30 })
    const booked = e.s.containers[c.id]
    expect(booked.declared).toBe(true)
    expect(booked.etd).toBe(Math.round(start))
    expect(booked.booking?.status).toBe('confirmed')

    e.run(minutes(120))
    const done = e.s.containers[c.id]
    expect(done.status).toBe('departed')
    expect(done.booking?.status).toBe('released')
    const log = e.s.events.map((x) => x.message).join('\n')
    expect(log).toMatch(/released at G\d+ to Kaveri Carriers/)
    expect(log).not.toMatch(new RegExp(`${c.id.split(' ')[0]}.*loaded onto`)) // an import is never "loaded onto a vessel"
    expect(checkInvariants(e)).toEqual([])
  })

  it('refuses a booking that starts too soon, and changes nothing', () => {
    const e = new Engine({ seed: 3 })
    e.exec({ t: 'scenario', name: 'discharge' })
    settle(e)
    const c = imports(e)[0]
    const before = JSON.stringify(e.s.containers[c.id])
    e.exec({ t: 'book', id: c.id, fleetId: 'f1', fleetName: 'X', start: e.s.now + BOOKING_MIN_LEAD - 1, end: e.s.now + 60 })
    expect(JSON.stringify(e.s.containers[c.id])).toBe(before)
    expect(e.s.events[0].message).toMatch(/cannot be booked/)
  })

  it('ignores bookings for exports and for unknown boxes', () => {
    const e = new Engine({ seed: 4 })
    e.exec({ t: 'admit' })
    const exp = Object.values(e.s.containers)[0]
    e.exec({ t: 'book', id: exp.id, fleetId: 'f', fleetName: 'X', start: e.s.now + 60, end: e.s.now + 90 })
    e.exec({ t: 'book', id: 'NOPE', fleetId: 'f', fleetName: 'X', start: e.s.now + 60, end: e.s.now + 90 })
    expect(e.s.containers[exp.id].booking).toBeUndefined()
  })

  it('cancelling a booking makes the departure an estimate again', () => {
    const e = new Engine({ seed: 3 })
    e.exec({ t: 'scenario', name: 'discharge' })
    settle(e)
    const c = imports(e)[0]
    e.exec({ t: 'book', id: c.id, fleetId: 'f1', fleetName: 'X', start: e.s.now + 200, end: e.s.now + 230 })
    e.exec({ t: 'cancelBooking', id: c.id })
    const after = e.s.containers[c.id]
    expect(after.booking).toBeUndefined()
    expect(after.declared).toBe(false)
  })

  it('an import nobody books is collected by a walk-in truck, so it cannot sit for ever', () => {
    const e = new Engine({ seed: 5 })
    e.exec({ t: 'scenario', name: 'discharge' })
    e.run(minutes(500))
    const gone = imports(e).filter((c) => c.status === 'departed')
    expect(gone.length).toBeGreaterThan(0)
    expect(e.s.events.map((x) => x.message).join('\n')).toMatch(/never booked/)
    expect(checkInvariants(e)).toEqual([])
  })

  it('stays safe when exports, imports and bookings are mixed on a busier yard', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const e = new Engine({ seed, auto: true, spec: { ...defaultSpec(), rows: 4, cols: 5, agvs: 3, gates: [2, 4], quays: [2, 5] } })
      const bad: string[] = []
      for (let i = 0; i < 60000; i++) {
        e.step()
        if (i === 3000 || i === 25000) e.exec({ t: 'scenario', name: 'discharge' })
        // a business that books every unbooked import a little while after it lands
        if (i % 1500 === 0) {
          for (const c of imports(e)) {
            if (!c.booking && c.status === 'stored' && e.s.now - c.arrivedAt > 15) {
              e.exec({ t: 'book', id: c.id, fleetId: 'f', fleetName: 'Test Carriers', start: e.s.now + 30 + (i % 7) * 10, end: e.s.now + 120 })
            }
          }
        }
        if (i % 7 === 0) bad.push(...checkInvariants(e))
        if (bad.length) break
      }
      expect(bad, `seed ${seed}`).toEqual([])
      expect(imports(e).some((c) => c.status === 'departed')).toBe(true)
    }
  })

  it('replay reproduces bookings exactly', () => {
    const s = new Session({ seed: 6 })
    s.command({ t: 'scenario', name: 'discharge' })
    advance(s, 20)
    const c = Object.values(s.engine.s.containers).find((x) => x.flow === 'import' && x.status === 'stored')!
    s.command({ t: 'book', id: c.id, fleetId: 'f1', fleetName: 'Kaveri Carriers', start: s.engine.s.now + 60, end: s.engine.s.now + 90 })
    advance(s, 60)
    const at = s.tick
    advance(s, 40)
    const replayed = s.replayTo(at).engine
    const ref = new Engine({ seed: 6 })
    ref.exec({ t: 'scenario', name: 'discharge' })
    ref.run(2000)
    ref.exec({ t: 'book', id: c.id, fleetId: 'f1', fleetName: 'Kaveri Carriers', start: ref.s.now + 60, end: ref.s.now + 90 })
    ref.run(at - 2000)
    expect(JSON.stringify(replayed.s.containers)).toBe(JSON.stringify(ref.s.containers))
    expect(JSON.stringify(replayed.s.stacks)).toBe(JSON.stringify(ref.s.stacks))
  })
})
