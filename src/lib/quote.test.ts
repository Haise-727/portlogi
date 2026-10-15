import { describe, expect, it } from 'vitest'
import { HAULIERS, LINES, hauliersFor, lineOf } from '../data/business'
import { quote } from './quote'

const haulier = HAULIERS[0]
const base = { haulier, blockers: 0, queuedJobs: 0, now: 100, start: 200 }

describe('quote', () => {
  it('a box on top costs only the haulage', () => {
    const q = quote(base)
    expect(q.digOutMoves).toBe(0)
    expect(q.handling).toBe(0)
    expect(q.total).toBe(haulier.ratePerTrip)
  })

  it('each box on top adds two moves (off and back), priced per move', () => {
    const q = quote({ ...base, blockers: 2, perMove: 1000 })
    expect(q.digOutMoves).toBe(4)
    expect(q.handling).toBe(4000)
    expect(q.total).toBe(haulier.ratePerTrip + 4000)
  })

  it('a buried box and a busy yard take longer to get ready, and can make a window too early', () => {
    const easy = quote(base)
    const hard = quote({ ...base, blockers: 3, queuedJobs: 10 })
    expect(hard.readyInMinutes).toBeGreaterThan(easy.readyInMinutes)
    expect(easy.tooEarly).toBe(false)
    expect(quote({ ...base, blockers: 3, queuedJobs: 10, start: 110 }).tooEarly).toBe(true)
  })
})

describe('the fictional business data', () => {
  it('maps every owner prefix the generator can produce to a line', () => {
    for (const p of ['TUTX', 'MSCU', 'MAEU', 'CMAU', 'HLXU', 'OOLU', 'TCLU', 'SSLU']) {
      expect(LINES[p]).toBeDefined()
      expect(lineOf(`${p} 123456 7`).name).toBe(LINES[p].name)
    }
  })

  it('keeps the shipping lines clear of real names', () => {
    const real = ['Maersk', 'Mediterranean', 'CMA CGM', 'Hapag-Lloyd', 'Orient Overseas', 'Evergreen', 'COSCO']
    for (const l of Object.values(LINES)) for (const r of real) expect(l.name).not.toBe(r)
  })

  it('offers only hauliers that can carry the cargo, cheapest first', () => {
    for (const type of ['standard', 'reefer', 'hazmat', 'fragile'] as const) {
      const list = hauliersFor(type)
      expect(list.length).toBeGreaterThan(0)
      for (let i = 1; i < list.length; i++) expect(list[i].ratePerTrip).toBeGreaterThanOrEqual(list[i - 1].ratePerTrip)
    }
    expect(hauliersFor('reefer').every((h) => h.kinds.includes('reefer'))).toBe(true)
    expect(hauliersFor('hazmat').every((h) => h.kinds.includes('hazmat'))).toBe(true)
  })
})
