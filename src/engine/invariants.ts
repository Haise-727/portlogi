import { checkConstraints, emptySnapshot } from './allocator'
import type { Engine } from './engine'
import { isPad, isPowered, unitsAt } from './layout'

/**
 * Safety properties the engine must hold at every step. The test suite runs
 * them across many seeds and layouts; any non-empty result is a defect.
 */
export function checkInvariants(e: Engine): string[] {
  const out: string[] = []
  const s = e.s
  const L = e.layout

  /* 1. Traffic: vehicles keep a physical gap. Following one another through a
        cell is fine; closing to within 40 drawing units (0.4 of a reference
        cell), sharing a cell, or swapping places is a collision. */
  for (let i = 0; i < s.agvs.length; i++) {
    for (let j = i + 1; j < s.agvs.length; j++) {
      const a = s.agvs[i]
      const b = s.agvs[j]
      const pa = unitsAt(L, a.pos.x, a.pos.y)
      const pb = unitsAt(L, b.pos.x, b.pos.y)
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y)
      if (d < 40) out.push(`t=${s.now.toFixed(2)} collision: ${a.id} and ${b.id} are ${d.toFixed(0)} units apart`)
    }
  }

  /* 2. Stacking rules hold for every stack. */
  const snap = emptySnapshot(L)
  for (const slot of Object.keys(snap)) {
    const ids = s.stacks[slot] ?? []
    if (ids.length > L.tiers && !isPad(L, slot)) out.push(`${slot} holds ${ids.length} > ${L.tiers} tiers`)
    snap[slot] = ids.map((id) => s.containers[id])
    for (const c of snap[slot]) if (!c) out.push(`${slot} references a missing container`)
  }
  for (const slot of L.activeSlots) {
    const stack = snap[slot]
    stack.forEach((c, i) => {
      if (!c) return
      if (c.type === 'reefer' && !isPowered(L, slot)) out.push(`reefer ${c.id} in unpowered ${slot}`)
      if (i > 0 && c.weight > stack[i - 1].weight) out.push(`${c.id} (${c.weight}t) on lighter ${stack[i - 1].id} in ${slot}`)
      if (c.slot !== slot || c.tier !== i) out.push(`${c.id} thinks it is at ${c.slot}/${c.tier}, stack says ${slot}/${i}`)
      // hazmat segregation
      if (c.type === 'hazmat') {
        const probe = { ...snap, [slot]: stack.slice(0, i) }
        const fail = checkConstraints(L, c, slot, i, probe)
        if (fail && fail.rule === 'segregation') out.push(`${c.id} hazmat segregation broken in ${slot}`)
      }
    })
  }
  for (const d of L.disabled) if ((s.stacks[d]?.length ?? 0) > 0) out.push(`disabled slot ${d} holds boxes`)

  /* 3. Conservation: every live box is in exactly one place. */
  const where = new Map<string, number>()
  const mark = (id: string) => where.set(id, (where.get(id) ?? 0) + 1)
  for (const ids of Object.values(s.stacks)) ids.forEach(mark)
  for (const ids of Object.values(s.gateQueues)) ids.forEach(mark)
  for (const a of s.agvs) if (a.carrying) mark(a.carrying)
  for (const c of Object.values(s.containers)) {
    const n = where.get(c.id) ?? 0
    if (c.status === 'departed') {
      if (n !== 0) out.push(`departed ${c.id} still located somewhere`)
    } else if (n !== 1) {
      out.push(`${c.id} (${c.status}) is in ${n} places`)
    }
  }
  return out
}
