import type { Container, ContainerType } from './types'

/**
 * Realistic container generation.
 *
 * Everything is driven by a seeded PRNG so comparison mode can replay the exact
 * same arrival sequence through both the naive and the optimised allocator —
 * without that, the two runs are not comparable and the headline number means
 * nothing.
 */

/** Real feeder routes worked out of Thoothukudi (V.O. Chidambaranar). */
export const DESTINATIONS = [
  'Colombo',
  'Singapore',
  'Jebel Ali',
  'Port Klang',
  'Chennai',
  'Kochi',
] as const

export type Destination = (typeof DESTINATIONS)[number]

export type Vessel = {
  name: string
  destination: Destination
  /** loading cutoff, in sim-minutes from t=0 */
  cutoff: number
}

/** Plausible feeder-service names for this coast. */
const VESSEL_NAMES: Record<Destination, string> = {
  Colombo: 'SSL Kaveri',
  Singapore: 'X-Press Coromandel',
  'Jebel Ali': 'MV Pearl City',
  'Port Klang': 'MV Bay Trader',
  Chennai: 'SSL Ganga',
  Kochi: 'MV Malabar Star',
}

/** BIC owner prefixes; TUTX is the rig's own marking. */
const OWNER_PREFIXES = ['TUTX', 'MSCU', 'MAEU', 'CMAU', 'HLXU', 'OOLU', 'TCLU', 'SSLU']

const TYPE_MIX: { type: ContainerType; p: number }[] = [
  { type: 'reefer', p: 0.15 },
  { type: 'hazmat', p: 0.05 },
  { type: 'fragile', p: 0.07 },
  { type: 'standard', p: 1 },
]

/** ISO 6346 letter values: A=10, skipping every multiple of 11. */
const LETTER_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  let v = 10
  for (let i = 0; i < 26; i++) {
    if (v % 11 === 0) v++
    map[String.fromCharCode(65 + i)] = v
    v++
  }
  return map
})()

/** The real ISO 6346 check digit, not a random trailing number. */
export function checkDigit(owner: string, serial: string): number {
  const code = owner + serial
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const ch = code[i]
    const value = LETTER_VALUES[ch] ?? Number(ch)
    sum += value * 2 ** i
  }
  const rem = sum % 11
  return rem === 10 ? 0 : rem
}

/** mulberry32 — small, fast, and reproducible from a seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Generator = {
  vessels: Vessel[]
  next: (now: number) => Container
  reset: () => void
}

export function createGenerator(seed: number): Generator {
  let rng = makeRng(seed)
  let n = 0

  const vessels: Vessel[] = DESTINATIONS.map((d, i) => ({
    name: VESSEL_NAMES[d],
    destination: d,
    // staggered loading windows across the shift
    cutoff: 95 + i * 55,
  }))

  function pickType(): ContainerType {
    const r = rng()
    let acc = 0
    for (const t of TYPE_MIX) {
      acc += t.p
      if (r < acc) return t.type
    }
    return 'standard'
  }

  return {
    vessels,
    reset() {
      rng = makeRng(seed)
      n = 0
    },
    next(now: number): Container {
      n++
      const owner = OWNER_PREFIXES[Math.floor(rng() * OWNER_PREFIXES.length)]
      const serial = String(Math.floor(rng() * 900000) + 100000)
      const type = pickType()
      const destination = DESTINATIONS[Math.floor(rng() * DESTINATIONS.length)]
      const vessel = vessels.find((v) => v.destination === destination)!

      // Departures cluster near the vessel cutoff, with spread either side, so
      // stacks genuinely conflict rather than arriving in convenient order.
      const jitter = (rng() - 0.45) * 150
      const etd = Math.max(now + 25, Math.round(vessel.cutoff + jitter))

      // Reefers and hazmat run heavier; fragile cargo runs light.
      const base =
        type === 'reefer' ? 14 + rng() * 14 : type === 'fragile' ? 2 + rng() * 8 : 4 + rng() * 24

      return {
        id: `${owner} ${serial} ${checkDigit(owner, serial)}`,
        tagUid: hex(rng, 8),
        type,
        etd,
        weight: Math.round(base * 10) / 10,
        destination,
        vessel: vessel.name,
        arrivedAt: now,
        slot: null,
        tier: null,
        status: 'inbound',
      }
    },
  }
}

function hex(rng: () => number, len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += Math.floor(rng() * 16).toString(16).toUpperCase()
  return out
}

/** Short form used on the container face in the yard: "TUTX 4410". */
export function shortId(id: string): string {
  const [owner, serial] = id.split(' ')
  return `${owner} ${serial.slice(0, 4)}`
}
