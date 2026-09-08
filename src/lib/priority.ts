import type { Container, ContainerType, PriorityBand } from './types'

/**
 * Priority detection.
 *
 * Four weighted factors produce a 0-100 score which is then cut into four
 * bands. The weights are exported so the inspector can show the operator what
 * the system is optimising for, rather than presenting a band as a given.
 */
export const PRIORITY_WEIGHTS = {
  urgency: 55, // dominant: how close the estimated departure is
  type: 18, // handling class — reefers have a power dependency
  dwell: 15, // sitting too long escalates on its own
  cutoff: 12, // the vessel is closing its loading window
} as const

/** Departures further out than this are not urgent at all. */
export const URGENCY_HORIZON = 190 // sim-minutes
/** Dwell at which a container is fully escalated (72h at demo scale). */
export const DWELL_LIMIT = 4320 // sim-minutes
/** A vessel cutoff inside this window pulls its cargo forward. */
export const CUTOFF_WINDOW = 90

const TYPE_WEIGHT: Record<ContainerType, number> = {
  reefer: 1, // loses cooling if it sits without power
  hazmat: 0.75, // segregation rules make late moves expensive
  fragile: 0.45,
  standard: 0,
}

const TYPE_REASON: Record<ContainerType, string> = {
  reefer: 'Reefer — power dependency',
  hazmat: 'Hazmat — segregated handling',
  fragile: 'Fragile — careful handling',
  standard: 'Standard box',
}

export const BAND_THRESHOLDS: { band: PriorityBand; min: number }[] = [
  { band: 'critical', min: 70 },
  { band: 'high', min: 48 },
  { band: 'normal', min: 24 },
  { band: 'low', min: 0 },
]

export const BAND_RANK: Record<PriorityBand, number> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0,
}

export type PriorityFactor = {
  key: keyof typeof PRIORITY_WEIGHTS
  label: string
  /** normalised 0..1 before weighting */
  raw: number
  points: number
  detail: string
}

export type PriorityResult = {
  band: PriorityBand
  score: number
  /** the single factor that drove the band, for one-line display */
  reason: string
  factors: PriorityFactor[]
}

export function computePriority(
  container: Container,
  now: number,
  vesselCutoff?: number,
): PriorityResult {
  const minutesToEtd = container.etd - now
  const dwell = Math.max(0, now - container.arrivedAt)

  const urgencyRaw = clamp01(1 - minutesToEtd / URGENCY_HORIZON)
  const typeRaw = TYPE_WEIGHT[container.type]
  const dwellRaw = clamp01(dwell / DWELL_LIMIT)
  const cutoffRaw =
    vesselCutoff === undefined ? 0 : clamp01(1 - (vesselCutoff - now) / CUTOFF_WINDOW)

  const factors: PriorityFactor[] = [
    {
      key: 'urgency',
      label: 'Departure urgency',
      raw: urgencyRaw,
      points: urgencyRaw * PRIORITY_WEIGHTS.urgency,
      detail:
        minutesToEtd <= 0
          ? 'ETD passed — overdue'
          : `ETD in ${formatMinutes(minutesToEtd)}`,
    },
    {
      key: 'type',
      label: 'Handling class',
      raw: typeRaw,
      points: typeRaw * PRIORITY_WEIGHTS.type,
      detail: TYPE_REASON[container.type],
    },
    {
      key: 'dwell',
      label: 'Dwell time',
      raw: dwellRaw,
      points: dwellRaw * PRIORITY_WEIGHTS.dwell,
      detail:
        dwellRaw >= 1
          ? 'Dwell exceeds 72h'
          : `In yard ${formatMinutes(dwell)}`,
    },
    {
      key: 'cutoff',
      label: 'Vessel cutoff',
      raw: cutoffRaw,
      points: cutoffRaw * PRIORITY_WEIGHTS.cutoff,
      detail:
        vesselCutoff === undefined
          ? 'No vessel booked'
          : cutoffRaw > 0
            ? `${container.vessel} closes in ${formatMinutes(vesselCutoff - now)}`
            : `${container.vessel} cutoff not near`,
    },
  ]

  const score = round(factors.reduce((sum, f) => sum + f.points, 0))
  const band = bandFor(score)
  const driver = factors.reduce((a, b) => (b.points > a.points ? b : a))

  return { band, score, reason: driver.points > 0 ? driver.detail : 'Routine cargo', factors }
}

export function bandFor(score: number): PriorityBand {
  for (const t of BAND_THRESHOLDS) if (score >= t.min) return t.band
  return 'low'
}

/** Retrieval queue order: priority first, then the earliest departure. */
export function compareByPriority(
  a: { priority: PriorityResult; container: Container },
  b: { priority: PriorityResult; container: Container },
): number {
  if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score
  return a.container.etd - b.container.etd
}

export function formatMinutes(mins: number): string {
  const m = Math.round(mins)
  if (m < 0) return `${formatMinutes(-m)} ago`
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}
