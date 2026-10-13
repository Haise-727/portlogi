import type { Container, ContainerType } from './types'

/**
 * Seeded container generation. All RNG state is a single plain number so the
 * whole engine state can be cloned, checkpointed and replayed bit-for-bit.
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
  /** first loading cutoff, in sim-minutes from t=0 */
  cutoff: number
  /** the feeder comes back round on this interval */
  period: number
}

const VESSEL_NAMES: Record<Destination, string> = {
  Colombo: 'SSL Kaveri',
  Singapore: 'X-Press Coromandel',
  'Jebel Ali': 'MV Pearl City',
  'Port Klang': 'MV Bay Trader',
  Chennai: 'SSL Ganga',
  Kochi: 'MV Malabar Star',
}

/** Staggered loading windows, so some vessel is always closing. */
export const VESSELS: Vessel[] = DESTINATIONS.map((d, i) => ({
  name: VESSEL_NAMES[d],
  destination: d,
  cutoff: 45 + i * 48,
  period: 288,
}))

/**
 * Feeders rotate: once a cutoff passes, the next call is a period later.
 * Without this every vessel deadline expires early in a long demo.
 */
export function nextCutoff(v: Vessel, now: number): number {
  if (now <= v.cutoff) return v.cutoff
  return v.cutoff + Math.ceil((now - v.cutoff) / v.period) * v.period
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
    const value = LETTER_VALUES[code[i]] ?? Number(code[i])
    sum += value * 2 ** i
  }
  const rem = sum % 11
  return rem === 10 ? 0 : rem
}

/** Plain RNG state: one uint32 and a draw counter. */
export type GenState = { a: number; n: number }

export function newGenState(seed: number): GenState {
  return { a: seed >>> 0, n: 0 }
}

/** mulberry32 stepped in place, so the state stays a serialisable number. */
export function rand(g: { a: number }): number {
  g.a = (g.a + 0x6d2b79f5) >>> 0
  let t = Math.imul(g.a ^ (g.a >>> 15), 1 | g.a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export type Overrides = Partial<Pick<Container, 'type' | 'tagUid' | 'destination' | 'weight' | 'group'>>

/** One container, drawn from the RNG. `at` is the scheduled arrival time. */
export function drawContainer(g: GenState, at: number, gate: string, over: Overrides = {}): Container {
  g.n++
  const owner = OWNER_PREFIXES[Math.floor(rand(g) * OWNER_PREFIXES.length)]
  const serial = String(Math.floor(rand(g) * 900000) + 100000)
  const r = rand(g)
  let drawn: ContainerType = 'standard'
  let acc = 0
  for (const t of TYPE_MIX) {
    acc += t.p
    if (r < acc) {
      drawn = t.type
      break
    }
  }
  const type = over.type ?? drawn
  const destination = over.destination ?? DESTINATIONS[Math.floor(rand(g) * DESTINATIONS.length)]
  const vessel = VESSELS.find((v) => v.destination === destination)!

  // Departures cluster around the vessel's next cutoff, spread either side, so
  // stacks genuinely conflict rather than arriving in convenient order.
  const cutoff = nextCutoff(vessel, at)
  const jitter = (rand(g) - 0.62) * 130
  const etd = Math.max(at + 18, Math.round(cutoff + jitter))

  const base =
    type === 'reefer' ? 14 + rand(g) * 14 : type === 'fragile' ? 2 + rand(g) * 8 : 4 + rand(g) * 24
  const tag = hex(g, 8)

  return {
    id: `${owner} ${serial} ${checkDigit(owner, serial)}`,
    tagUid: over.tagUid ?? tag,
    type,
    etd,
    weight: over.weight ?? Math.round(base * 10) / 10,
    destination,
    vessel: vessel.name,
    arrivedAt: at,
    slot: null,
    tier: null,
    status: 'inbound',
    gate,
    group: over.group,
  }
}

/**
 * A physical RFID card always maps to the same container: the UID seeds a
 * private RNG. The ESP32 only has to report the UID.
 */
export function containerFromTag(uid: string, at: number, gate: string, over: Overrides = {}): Container {
  const g = newGenState(fnv1a(uid.toUpperCase()))
  return drawContainer(g, at, gate, { ...over, tagUid: uid.toUpperCase() })
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hex(g: { a: number }, len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += Math.floor(rand(g) * 16).toString(16).toUpperCase()
  return out
}

/** Short form used on the container face in the yard: "TUTX 4410". */
export function shortId(id: string): string {
  const [owner, serial] = id.split(' ')
  return `${owner} ${serial.slice(0, 4)}`
}
