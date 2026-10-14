export type ContainerType = 'standard' | 'reefer' | 'hazmat' | 'fragile'
export type PriorityBand = 'critical' | 'high' | 'normal' | 'low'
export type ContainerStatus = 'inbound' | 'stored' | 'retrieving' | 'departed'
export type Tier = number

/** Exports come in through a gate and leave from a quay; imports come off a ship at a quay and leave through a gate. */
export type Flow = 'export' | 'import'

/** A business's booking of a haulier's truck to collect an import box. */
export type Booking = {
  fleetId: string
  fleetName: string
  /** sim-minutes: the truck is due from this time */
  start: number
  /** the truck waits no later than this */
  end: number
  madeAt: number
  status: 'confirmed' | 'arrived' | 'released' | 'late'
}

export type Container = {
  /** ISO 6346 marking, e.g. "TUTX 441021 3" */
  id: string
  /** RFID tag UID read at the gate, e.g. "04A32F91" */
  tagUid: string
  type: ContainerType
  /** estimated time of departure, in sim-minutes from t=0 */
  etd: number
  /** tonnes */
  weight: number
  destination: string
  vessel: string
  arrivedAt: number
  slot: string | null
  tier: Tier | null
  status: ContainerStatus
  /** terminal the box arrived at: a gate for exports, a quay for imports */
  gate: string
  /** defaults to an export */
  flow?: Flow
  /** the departure time is firm (booked). Imports start with only an estimate. */
  declared?: boolean
  booking?: Booking
  /** operator-named group; groups are kept together by the allocator */
  group?: string
}

/** A cell in the AGV movement grid (aisles + slot cells). */
export type Cell = { x: number; y: number }

export type EventSeverity = 'info' | 'action' | 'warn' | 'critical' | 'good'

export type YardEvent = {
  id: number
  /** sim-minutes */
  at: number
  /** engine tick the event happened on, so replay can jump to it exactly */
  tick: number
  severity: EventSeverity
  /** one plain sentence, readable by someone who has never seen a port */
  message: string
  /** engineering detail: scores, costs, rules. Shown only in detail mode. */
  detail?: string
  /** machine-level chatter, hidden unless detail mode is on */
  verbose?: boolean
  /** consecutive repeats of the same line, collapsed */
  count?: number
  /** container id, if the event is about one */
  ref?: string
}
