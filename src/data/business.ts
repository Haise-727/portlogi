/**
 * The fictional business side of the port: shipping lines and hauliers.
 *
 * Everything here is made up, on purpose. The shipping lines are real-sounding names with a letter changed
 * (Mersk, Hapak Lloyd, ...) so the demo reads as real without using anyone's name or logo. The hauliers and
 * their rates are invented, and the rates are illustrative, not market prices. Nothing in the simulation
 * depends on them except as labels and as the numbers shown in a quote.
 */

export type Line = { code: string; name: string }

/** Shipping lines, keyed by the 4-letter owner prefix at the start of a container marking. */
export const LINES: Record<string, Line> = {
  MAEU: { code: 'MRK', name: 'Mersk Line' },
  MSCU: { code: 'MDS', name: 'Meditarranean Shipping' },
  CMAU: { code: 'CMB', name: 'CMB CGM' },
  HLXU: { code: 'HPK', name: 'Hapak Lloyd' },
  OOLU: { code: 'OOV', name: 'Oriant Overseas' },
  TCLU: { code: 'TCL', name: 'Trans-Con Lines' },
  SSLU: { code: 'SSL', name: 'Southern Sea Lines' },
  TUTX: { code: 'TUT', name: 'Tuti Express' },
}

export function lineOf(containerId: string): Line {
  const prefix = containerId.slice(0, 4)
  return LINES[prefix] ?? { code: prefix, name: prefix }
}

export type TruckKind = 'standard' | 'reefer' | 'hazmat'

export type Haulier = {
  id: string
  name: string
  /** what it can carry */
  kinds: TruckKind[]
  /** an invented flat rate for one trip, in rupees */
  ratePerTrip: number
  /** how many trucks it can put on the gate at once in a window; used only to show availability */
  trucks: number
}

export const HAULIERS: Haulier[] = [
  { id: 'kaveri', name: 'Kaveri Carriers', kinds: ['standard'], ratePerTrip: 5200, trucks: 6 },
  { id: 'pandyan', name: 'Pandyan Logistics', kinds: ['standard', 'hazmat'], ratePerTrip: 6100, trucks: 4 },
  { id: 'tamira', name: 'Tamira Cold Chain', kinds: ['reefer'], ratePerTrip: 8900, trucks: 3 },
  { id: 'vaigai', name: 'Vaigai Trailers', kinds: ['standard'], ratePerTrip: 4700, trucks: 8 },
  { id: 'coromand', name: 'Coromand Cargo', kinds: ['standard', 'reefer', 'hazmat'], ratePerTrip: 7400, trucks: 5 },
]

export function kindOf(type: 'standard' | 'reefer' | 'hazmat' | 'fragile'): TruckKind {
  return type === 'reefer' ? 'reefer' : type === 'hazmat' ? 'hazmat' : 'standard'
}

/** Hauliers able to carry this box, cheapest first. */
export function hauliersFor(type: 'standard' | 'reefer' | 'hazmat' | 'fragile'): Haulier[] {
  const k = kindOf(type)
  return HAULIERS.filter((h) => h.kinds.includes(k)).sort((a, b) => a.ratePerTrip - b.ratePerTrip)
}
