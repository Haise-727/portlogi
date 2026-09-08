export type ContainerType = 'standard' | 'reefer' | 'hazmat' | 'fragile'
export type PriorityBand = 'critical' | 'high' | 'normal' | 'low'
export type ContainerStatus = 'inbound' | 'stored' | 'retrieving' | 'departed'
export type Tier = 0 | 1

export type Container = {
  /** ISO-style marking, e.g. "TUTX 441021 3" */
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
}

/** A cell in the AGV movement grid (aisles + slot cells). */
export type Cell = { x: number; y: number }

export type EventSeverity = 'info' | 'action' | 'warn' | 'critical' | 'good'

export type YardEvent = {
  id: number
  /** sim-minutes */
  at: number
  severity: EventSeverity
  /** one plain sentence, readable by someone who has never seen a port */
  message: string
  /** engineering detail — scores, costs, rules. Shown only in detail mode. */
  detail?: string
  /** true for machine-level chatter that is hidden unless detail mode is on */
  verbose?: boolean
  /** consecutive repeats of the same line, collapsed */
  count?: number
  /** container id, if the event is about one */
  ref?: string
}
