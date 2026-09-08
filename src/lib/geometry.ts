import type { Cell } from './types'
import { GRID_H, GRID_W, slotToCell, yardConfig } from './yardConfig'

/**
 * One virtual coordinate space shared by the slots, the cranes, the route
 * overlay and the carried containers. Everything is positioned as a percentage
 * of this space, so the whole yard scales with its container while staying
 * pixel-aligned with itself.
 */
const LANE_W = 54 // west/east driveway
const SLOT_W = 132
const TOP_H = 66 // gate apron
const SLOT_H = 92
const AISLE_H = 42
const BOT_H = 66 // quay apron

const colWidths = [LANE_W, ...yardConfig.cols.map(() => SLOT_W), LANE_W]
const rowHeights = [
  TOP_H,
  ...yardConfig.rows.flatMap((_, i) => (i === 0 ? [SLOT_H] : [AISLE_H, SLOT_H])),
  BOT_H,
]

const colOffsets = prefix(colWidths)
const rowOffsets = prefix(rowHeights)

export const YARD_W = colWidths.reduce((a, b) => a + b, 0)
export const YARD_H = rowHeights.reduce((a, b) => a + b, 0)

function prefix(sizes: number[]): number[] {
  const out: number[] = [0]
  for (const s of sizes) out.push(out[out.length - 1] + s)
  return out
}

export type Rect = { x: number; y: number; w: number; h: number }

/** Bounding box of a movement-grid cell, in virtual units. */
export function cellRect(cell: Cell): Rect {
  const x = colOffsets[clamp(cell.x, 0, GRID_W - 1)]
  const y = rowOffsets[clamp(cell.y, 0, GRID_H - 1)]
  return {
    x,
    y,
    w: colWidths[clamp(cell.x, 0, GRID_W - 1)],
    h: rowHeights[clamp(cell.y, 0, GRID_H - 1)],
  }
}

/** Centre point of a movement-grid cell, in virtual units. */
export function cellCenter(cell: Cell): { x: number; y: number } {
  const r = cellRect(cell)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function slotRect(slot: string): Rect {
  return cellRect(slotToCell(slot))
}

/** Fractional cell coordinates -> virtual units, for smooth crane motion. */
export function lerpCell(a: Cell, b: Cell, t: number): { x: number; y: number } {
  const ca = cellCenter(a)
  const cb = cellCenter(b)
  return { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t }
}

/** Virtual units -> CSS percentage of the yard box. */
export function pctX(v: number): string {
  return `${(v / YARD_W) * 100}%`
}

export function pctY(v: number): string {
  return `${(v / YARD_H) * 100}%`
}

export function rectStyle(r: Rect): {
  left: string
  top: string
  width: string
  height: string
} {
  return { left: pctX(r.x), top: pctY(r.y), width: pctX(r.w), height: pctY(r.h) }
}

/** SVG polyline points for a path, in virtual units. */
export function pathPoints(path: Cell[]): string {
  return path.map((c) => { const p = cellCenter(c); return `${p.x},${p.y}` }).join(' ')
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
