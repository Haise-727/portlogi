import { createContext, useContext, useMemo } from 'react'
import type { Layout } from '../engine/layout'
import { slotToCell, unitsAt } from '../engine/layout'
import type { Cell } from '../engine/types'

/**
 * One virtual coordinate space shared by the slots, the vehicles, the route
 * overlay and the carried containers. Everything is positioned as a percentage
 * of this space, so the whole yard scales with its container while staying
 * pixel-aligned with itself. It is derived from the layout, so adding rows or
 * columns re-shapes the drawing with no other code involved.
 */
export const AGV_SIZE = 34

export type Rect = { x: number; y: number; w: number; h: number }

export type Geo = {
  W: number
  H: number
  cellRect: (cell: Cell) => Rect
  cellCenter: (cell: Cell) => { x: number; y: number }
  slotRect: (slot: string) => Rect
  /** fractional grid coordinates -> virtual units, for smooth vehicle motion */
  point: (gx: number, gy: number) => { x: number; y: number }
  pctX: (v: number) => string
  pctY: (v: number) => string
  rectStyle: (r: Rect) => { left: string; top: string; width: string; height: string }
}

export function makeGeo(L: Layout): Geo {
  const colW = L.colW
  const rowH = L.rowH
  const colOff = L.colOff
  const rowOff = L.rowOff
  const W = colOff[colOff.length - 1]
  const H = rowOff[rowOff.length - 1]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const cellRect = (cell: Cell): Rect => {
    const cx = clamp(cell.x, 0, L.gridW - 1)
    const cy = clamp(cell.y, 0, L.gridH - 1)
    return { x: colOff[cx], y: rowOff[cy], w: colW[cx], h: rowH[cy] }
  }
  const cellCenter = (cell: Cell) => {
    const r = cellRect(cell)
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  return {
    W,
    H,
    cellRect,
    cellCenter,
    slotRect: (slot) => cellRect(slotToCell(L, slot)),
    point: (gx, gy) => unitsAt(L, gx, gy),
    pctX: (v) => `${(v / W) * 100}%`,
    pctY: (v) => `${(v / H) * 100}%`,
    rectStyle: (r) => ({
      left: `${(r.x / W) * 100}%`,
      top: `${(r.y / H) * 100}%`,
      width: `${(r.w / W) * 100}%`,
      height: `${(r.h / H) * 100}%`,
    }),
  }
}

export const GeoContext = createContext<Geo | null>(null)

export function useGeo(): Geo {
  const g = useContext(GeoContext)
  if (!g) throw new Error('useGeo outside a yard')
  return g
}

export function useMakeGeo(L: Layout): Geo {
  return useMemo(() => makeGeo(L), [L])
}
