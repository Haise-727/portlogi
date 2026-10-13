import type { Cell } from './types'

/**
 * The yard is data. A LayoutSpec is the small, serialisable description the
 * operator edits; buildLayout() derives everything else (grid size, slot ids,
 * gate/quay cells, parking bays) from it, so the engine, the router and the
 * renderer all follow one source of truth.
 *
 * Slot labels are row letter + column number (A1..C4) and match the hardware
 * rig's legend.
 */
export type LayoutSpec = {
  rows: number
  cols: number
  tiers: number
  /** slots with a reefer plug */
  powered: string[]
  /** slots taken out of service: solid obstacles, never allocated */
  disabled: string[]
  /** gate columns (1..cols) on the top edge */
  gates: number[]
  /** quay columns (1..cols) on the bottom edge */
  quays: number[]
  /** transfer pad x positions (0..cols+1) on the bottom apron */
  pads: number[]
  /** number of AGVs */
  agvs: number
}

export const LIMITS = {
  rows: [1, 8],
  cols: [1, 10],
  tiers: [1, 4],
  agvs: [1, 6],
  pads: 4,
} as const

export function defaultSpec(): LayoutSpec {
  return {
    rows: 3,
    cols: 4,
    tiers: 2,
    powered: ['A1', 'A2', 'A3', 'A4'],
    disabled: [],
    gates: [2],
    quays: [3],
    pads: [1, 4],
    agvs: 2,
  }
}

export type Terminal = { id: string; cell: Cell }

/**
 * Physical size of the grid, in drawing units. These are the single source for
 * both the renderer and the vehicle timing: a vehicle crosses a cell in time
 * proportional to its real length, so it moves at constant speed on screen.
 */
export const DIMS = {
  rail: 54, // side rail width
  slotW: 132,
  top: 66, // gate apron height
  slotH: 92,
  aisle: 42,
  bottom: 66, // quay apron height
} as const

export type Layout = {
  spec: LayoutSpec
  rowLabels: string[]
  cols: number
  tiers: number
  gridW: number
  gridH: number
  /** every slot, render order, including disabled ones */
  slotIds: string[]
  /** slots that can take a box */
  activeSlots: string[]
  powered: ReadonlySet<string>
  disabled: ReadonlySet<string>
  gates: Terminal[]
  quays: Terminal[]
  pads: Terminal[]
  /** one parking bay per AGV */
  bays: Cell[]
  /** column widths and row heights, with their cumulative offsets */
  colW: number[]
  rowH: number[]
  colOff: number[]
  rowOff: number[]
  capacity: number
  /** fixed normalisation ceilings for the allocator */
  maxTravel: number
  maxSlotDist: number
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`
}

/**
 * More vehicles than a yard can hold just queue behind each other. Roughly one
 * per five stacking positions, and never more than rows + 1 (each aisle is a
 * single lane), keeps the traffic workable. Both limits come from a sweep of
 * several hundred random layouts, where stalls only appeared above that density.
 */
export function maxAgvs(rows: number, cols: number): number {
  return Math.max(1, Math.min(LIMITS.agvs[1], Math.ceil((rows * cols) / 5), rows + 1))
}

/** Clamp and de-duplicate a spec so any edit yields a buildable layout. */
export function normalizeSpec(input: LayoutSpec): LayoutSpec {
  const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
    Math.max(lo, Math.min(hi, Math.round(v)))
  const rows = clamp(input.rows, LIMITS.rows)
  const cols = clamp(input.cols, LIMITS.cols)
  const tiers = clamp(input.tiers, LIMITS.tiers)
  const agvs = Math.min(clamp(input.agvs, LIMITS.agvs), maxAgvs(rows, cols))
  const ids = new Set<string>()
  for (let r = 0; r < rows; r++) for (let c = 1; c <= cols; c++) ids.add(`${ROW_LETTERS[r]}${c}`)

  const uniq = (xs: number[], lo: number, hi: number) =>
    [...new Set(xs.map((x) => Math.round(x)).filter((x) => x >= lo && x <= hi))].sort((a, b) => a - b)

  let gates = uniq(input.gates, 1, cols)
  if (gates.length === 0) gates = [Math.min(2, cols)]
  let quays = uniq(input.quays, 1, cols)
  if (quays.length === 0) quays = [Math.min(3, cols)]
  let pads = uniq(input.pads, 0, cols + 1)
    .filter((x) => !quays.includes(x))
    .slice(0, LIMITS.pads)
  // At least one transfer pad: it is the guarantee that a box always has
  // somewhere to be set down, so no vehicle can be stranded holding one.
  if (pads.length === 0) pads = [0]

  return {
    rows,
    cols,
    tiers,
    powered: [...new Set(input.powered)].filter((s) => ids.has(s)),
    disabled: [...new Set(input.disabled)].filter((s) => ids.has(s)),
    gates,
    quays,
    pads,
    agvs,
  }
}

export function buildLayout(raw: LayoutSpec): Layout {
  const spec = normalizeSpec(raw)
  const rowLabels = Array.from({ length: spec.rows }, (_, i) => ROW_LETTERS[i])
  const gridW = spec.cols + 2
  const gridH = spec.rows * 2 + 1
  const slotIds = rowLabels.flatMap((r) => Array.from({ length: spec.cols }, (_, c) => `${r}${c + 1}`))
  const disabled = new Set(spec.disabled)
  const activeSlots = slotIds.filter((s) => !disabled.has(s))

  const gates = spec.gates.map((x, i) => ({ id: `G${i + 1}`, cell: { x, y: 0 } }))
  const quays = spec.quays.map((x, i) => ({ id: `Q${i + 1}`, cell: { x, y: gridH - 1 } }))
  const pads = spec.pads.map((x, i) => ({ id: `T${i + 1}`, cell: { x, y: gridH - 1 } }))

  // Parking bays sit on the ring road: the four corners first, then down the
  // side rails. A parked AGV removes one vertex from a ladder graph that has
  // many alternatives, so it can never wall off the yard.
  const rail: Cell[] = [
    { x: 0, y: 0 },
    { x: gridW - 1, y: 0 },
    { x: 0, y: gridH - 1 },
    { x: gridW - 1, y: gridH - 1 },
  ]
  for (let y = 2; y < gridH - 2; y += 2) {
    rail.push({ x: 0, y }, { x: gridW - 1, y })
  }
  const bays = Array.from({ length: spec.agvs }, (_, i) => rail[i % rail.length])

  const colW = [DIMS.rail, ...Array.from({ length: spec.cols }, () => DIMS.slotW), DIMS.rail]
  const rowH = [DIMS.top, ...rowLabels.flatMap((_, i) => (i === 0 ? [DIMS.slotH] : [DIMS.aisle, DIMS.slotH])), DIMS.bottom]
  const prefix = (xs: number[]) => xs.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1] + v], [0])

  return {
    spec,
    rowLabels,
    cols: spec.cols,
    tiers: spec.tiers,
    gridW,
    gridH,
    slotIds,
    activeSlots,
    powered: new Set(spec.powered),
    disabled,
    gates,
    quays,
    pads,
    bays,
    colW,
    rowH,
    colOff: prefix(colW),
    rowOff: prefix(rowH),
    capacity: activeSlots.length * spec.tiers,
    maxTravel: gridW + gridH + 4 * 1.2,
    maxSlotDist: spec.cols - 1 + (spec.rows - 1),
  }
}

/* ------------------------------------------------------------------ *
 * Movement grid
 *
 *        x:  0     1     2     3     4     5
 *   y: 0    [ - - - top aisle (gates) - - - ]
 *   y: 1     |    A1    A2    A3    A4     |
 *   y: 2    [ - - - - - aisle  - - - - - - ]
 *   y: 3     |    B1    B2    B3    B4     |
 *   y: 4    [ - - - - - aisle  - - - - - - ]
 *   y: 5     |    C1    C2    C3    C4     |
 *   y: 6    [ - - bottom aisle (quays, pads) ]
 *
 * x=0 and x=gridW-1 are the side rails. Aisle cells are always traversable; a
 * slot cell is traversable only while it is empty and in service.
 * ------------------------------------------------------------------ */

export function rowOf(slot: string): string {
  return slot[0]
}

export function colOf(slot: string): number {
  return Number(slot.slice(1))
}

export function isSlot(L: Layout, id: string): boolean {
  return L.slotIds.includes(id)
}

export function isPad(L: Layout, id: string): boolean {
  return L.pads.some((p) => p.id === id)
}

export function isPowered(L: Layout, slot: string): boolean {
  return L.powered.has(slot)
}

export function slotToCell(L: Layout, slot: string): Cell {
  const pad = L.pads.find((p) => p.id === slot)
  if (pad) return pad.cell
  const r = L.rowLabels.indexOf(rowOf(slot))
  return { x: colOf(slot), y: r * 2 + 1 }
}

export function cellToSlot(L: Layout, cell: Cell): string | null {
  if (cell.y % 2 === 0) return null
  if (cell.x < 1 || cell.x > L.cols) return null
  const row = L.rowLabels[(cell.y - 1) / 2]
  return row ? `${row}${cell.x}` : null
}

export function inBounds(L: Layout, cell: Cell): boolean {
  return cell.x >= 0 && cell.x < L.gridW && cell.y >= 0 && cell.y < L.gridH
}

/** Ground-slot neighbours sharing an edge, used for hazmat segregation. */
export function adjacentSlots(L: Layout, slot: string): string[] {
  const c = colOf(slot)
  const ri = L.rowLabels.indexOf(rowOf(slot))
  const out: string[] = []
  for (const [dc, dr] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nc = c + dc
    const nr = ri + dr
    if (nc < 1 || nc > L.cols || nr < 0 || nr >= L.rowLabels.length) continue
    out.push(`${L.rowLabels[nr]}${nc}`)
  }
  return out
}

export function slotDistance(L: Layout, a: string, b: string): number {
  const ra = L.rowLabels.indexOf(rowOf(a))
  const rb = L.rowLabels.indexOf(rowOf(b))
  return Math.abs(colOf(a) - colOf(b)) + Math.abs(ra - rb)
}

export function terminalById(L: Layout, id: string): Terminal | undefined {
  return L.gates.find((g) => g.id === id) ?? L.quays.find((q) => q.id === id)
}

/** Fractional grid coordinates -> drawing units (centre-to-centre interpolation). */
export function unitsAt(L: Layout, gx: number, gy: number): { x: number; y: number } {
  const axis = (g: number, off: number[], size: number[], max: number) => {
    const i = Math.max(0, Math.min(max, Math.floor(g)))
    const j = Math.min(i + 1, max)
    const a = off[i] + size[i] / 2
    const b = off[j] + size[j] / 2
    return a + (b - a) * Math.max(0, Math.min(1, g - i))
  }
  return { x: axis(gx, L.colOff, L.colW, L.gridW - 1), y: axis(gy, L.rowOff, L.rowH, L.gridH - 1) }
}

/** Centre-to-centre distance between two adjacent cells, in drawing units. */
export function cellDistance(L: Layout, a: Cell, b: Cell): number {
  const p = unitsAt(L, a.x, a.y)
  const q = unitsAt(L, b.x, b.y)
  return Math.hypot(q.x - p.x, q.y - p.y)
}
