import { Biohazard, Container as ContainerIcon, Snowflake, TriangleAlert } from 'lucide-react'
import type { ContainerType, EventSeverity, PriorityBand } from '../lib/types'

/** Colour encodes priority and nothing else. */
export const BAND_COLOR: Record<PriorityBand, string> = {
  critical: 'var(--color-critical)',
  high: 'var(--color-high)',
  normal: 'var(--color-normal)',
  low: 'var(--color-low)',
}

export const BAND_ORDER: PriorityBand[] = ['critical', 'high', 'normal', 'low']

/** Type is an icon, so it never competes with the priority fill. */
export const TYPE_ICON: Record<ContainerType, typeof ContainerIcon> = {
  standard: ContainerIcon,
  reefer: Snowflake,
  hazmat: Biohazard,
  fragile: TriangleAlert,
}

export const TYPE_LABEL: Record<ContainerType, string> = {
  standard: 'Standard dry box',
  reefer: 'Reefer — powered',
  hazmat: 'Hazmat — segregated',
  fragile: 'Fragile handling',
}

export const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: 'var(--color-ink-3)',
  action: 'var(--color-signal)',
  good: 'var(--color-normal)',
  warn: 'var(--color-high)',
  critical: 'var(--color-critical)',
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
