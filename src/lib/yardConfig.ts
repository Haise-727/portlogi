import type { Cell } from './types'

/**
 * Every dimension of the yard lives here. Changing `rows`, `cols` or `tiers`
 * re-shapes the grid, the pathfinding graph and the rendered layout together —
 * the rest of the codebase derives from this object and never hardcodes 4x3.
 *
 * Slot labels match the hardware rig's keypad legend (A1..C4) so the physical
 * and software halves of the project read as one system.
 */
export const yardConfig = {
  rows: ['A', 'B', 'C'] as const,
  cols: [1, 2, 3, 4] as const,
  tiers: 2,
  /** Reefer power gantry runs along row A only — reefers are legal nowhere else. */
  poweredRows: ['A'] as const,
  /** Column index (1-based) the gate lane feeds into, at the top of the yard. */
  gateCol: 2,
  /** Column index (1-based) the quay lane draws from, at the bottom. */
  quayCol: 3,
  /** Max stack weight rule: a container may not sit on a lighter one. */
  enforceWeightStacking: true,
  /** Hazmat segregation distance, in ground slots (1 = no touching neighbours). */
  hazmatSeparation: 1,
}

export type RowLabel = (typeof yardConfig.rows)[number]

/** "A1", "A2", ... "C4" in render order. */
export const SLOT_IDS: string[] = yardConfig.rows.flatMap((r) =>
  yardConfig.cols.map((c) => `${r}${c}`),
)

export const SLOT_CAPACITY = SLOT_IDS.length * yardConfig.tiers

export function isPoweredSlot(slot: string): boolean {
  return (yardConfig.poweredRows as readonly string[]).includes(slot[0])
}

export function rowOf(slot: string): string {
  return slot[0]
}

export function colOf(slot: string): number {
  return Number(slot.slice(1))
}

/* ------------------------------------------------------------------ *
 * Movement grid
 *
 * Cranes run along aisles, so the pathfinding graph interleaves slot
 * rows with aisle rows and flanks the yard with two driveways:
 *
 *        x:  0     1     2     3     4     5
 *   y: 0    [ - - - top aisle (gate lane) - - - ]
 *   y: 1     |    A1    A2    A3    A4     |
 *   y: 2    [ - - - - - aisle  - - - - - - ]
 *   y: 3     |    B1    B2    B3    B4     |
 *   y: 4    [ - - - - - aisle  - - - - - - ]
 *   y: 5     |    C1    C2    C3    C4     |
 *   y: 6    [ - - bottom aisle (quay) - -  ]
 *
 * x=0 and x=5 are the west/east driveways. Aisle cells are always
 * traversable; a slot cell is traversable only while it is empty.
 * ------------------------------------------------------------------ */

export const GRID_W = yardConfig.cols.length + 2
export const GRID_H = yardConfig.rows.length * 2 + 1

export const GATE_CELL: Cell = { x: yardConfig.gateCol, y: 0 }
export const QUAY_CELL: Cell = { x: yardConfig.quayCol, y: GRID_H - 1 }

export function slotToCell(slot: string): Cell {
  const r = yardConfig.rows.indexOf(rowOf(slot) as RowLabel)
  return { x: colOf(slot), y: r * 2 + 1 }
}

export function cellToSlot(cell: Cell): string | null {
  if (cell.y % 2 === 0) return null
  if (cell.x < 1 || cell.x > yardConfig.cols.length) return null
  const row = yardConfig.rows[(cell.y - 1) / 2]
  return row ? `${row}${cell.x}` : null
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`
}

export function inBounds(cell: Cell): boolean {
  return cell.x >= 0 && cell.x < GRID_W && cell.y >= 0 && cell.y < GRID_H
}

/** Ground-slot neighbours sharing an edge — used for hazmat segregation. */
export function adjacentSlots(slot: string): string[] {
  const c = colOf(slot)
  const ri = yardConfig.rows.indexOf(rowOf(slot) as RowLabel)
  const out: string[] = []
  for (const [dc, dr] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nc = c + dc
    const nr = ri + dr
    if (nc < 1 || nc > yardConfig.cols.length) continue
    if (nr < 0 || nr >= yardConfig.rows.length) continue
    out.push(`${yardConfig.rows[nr]}${nc}`)
  }
  return out
}
