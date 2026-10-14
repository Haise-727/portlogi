/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PORTS } from '../data/ports'
import { MEASURED, formatRupees, impact, reductionFor, usableThroughput } from './impact'

const base = { teuPerYear: 1_000_000, teuPerBox: 1.6, rehandleRate: 0.1, baseline: 'etd-rule' as const, costPerMove: 0, minutesPerMove: 0 }

describe('impact arithmetic', () => {
  it('boxes, rehandles and avoided moves follow from the inputs', () => {
    const r = impact(base)
    expect(r.boxes).toBeCloseTo(625_000, 0)
    expect(r.baselineRehandles).toBeCloseTo(62_500, 0)
    expect(r.avoided).toBeCloseTo(62_500 * MEASURED.vsEtdRule, 3)
    expect(r.avoidedPerDay).toBeCloseTo(r.avoided / 365, 6)
  })

  it('money and time only appear when their inputs are given', () => {
    expect(impact(base).rupeesSaved).toBeNull()
    expect(impact(base).hoursSaved).toBeNull()
    const r = impact({ ...base, costPerMove: 1278, minutesPerMove: 3 })
    expect(r.rupeesSaved).toBeCloseTo(r.avoided * 1278, 3)
    expect(r.hoursSaved).toBeCloseTo((r.avoided * 3) / 60, 6)
  })

  it('is linear in throughput and in the baseline rehandle rate, and never negative', () => {
    expect(impact({ ...base, teuPerYear: 2_000_000 }).avoided).toBeCloseTo(impact(base).avoided * 2, 6)
    expect(impact({ ...base, rehandleRate: 0.2 }).avoided).toBeCloseTo(impact(base).avoided * 2, 6)
    expect(impact({ ...base, rehandleRate: -1 }).avoided).toBe(0)
    expect(impact({ ...base, teuPerBox: 0 }).boxes).toBe(0)
  })

  it('the honest baseline (an ETD-aware rule) always claims less than the naive one', () => {
    expect(reductionFor('etd-rule')).toBeLessThan(reductionFor('first-available'))
    expect(impact(base).avoided).toBeLessThan(impact({ ...base, baseline: 'first-available' }).avoided)
  })

  it('formats rupees in lakh and crore', () => {
    expect(formatRupees(1_250)).toBe('₹1,250')
    expect(formatRupees(2_500_000)).toBe('₹25.00 lakh')
    expect(formatRupees(123_000_000)).toBe('₹12.30 crore')
  })
})

describe('the dataset', () => {
  it('never lets an unverified throughput into a calculation', () => {
    for (const p of PORTS) {
      if (p.throughput?.grade === 'unverified') expect(usableThroughput(p)).toBeNull()
      else if (p.throughput) expect(usableThroughput(p)).toBe(p.throughput.teu)
    }
  })

  it('gives every figure a source link and every port a plausible Indian position', () => {
    for (const p of PORTS) {
      expect(p.lat).toBeGreaterThan(6)
      expect(p.lat).toBeLessThan(24)
      expect(p.lon).toBeGreaterThan(67)
      expect(p.lon).toBeLessThan(90)
      if (p.throughput) expect(p.throughput.source.url).toMatch(/^https:\/\//)
    }
    expect(new Set(PORTS.map((p) => p.id)).size).toBe(PORTS.length)
  })
})

describe('the measured reductions match the experiment report', () => {
  // The numbers in MEASURED are copied from reports/results.json; this fails if someone re-runs the report and forgets to update them.
  const file = new URL('../../reports/results.json', import.meta.url)
  it.skipIf(!existsSync(file))('first-available -> allocator reduction is within 3 points of the latest report', () => {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    expect(Math.abs(json.headline.reduction - MEASURED.vsFirstAvailable)).toBeLessThan(0.03)
  })

  it.skipIf(!existsSync(file))('ETD-rule -> allocator reduction is within 4 points of the latest report', () => {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    const etd = json.ablation.find((a: { name: string }) => /ETD rule only/.test(a.name))
    const full = json.ablation.find((a: { name: string }) => a.name === 'All terms')
    if (!etd || !full) return // the report predates this row; re-run npm run report
    expect(Math.abs(1 - full.rehandles.mean / etd.rehandles.mean - MEASURED.vsEtdRule)).toBeLessThan(0.04)
  })
})
