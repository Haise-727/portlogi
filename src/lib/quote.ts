import type { Haulier } from '../data/business'
import { SHIFTING_TARIFF } from '../data/ports'

/**
 * A quote for collecting an import box, shown before the business commits.
 *
 * Three honest parts:
 *  - the haulier's trip rate (invented, see data/business.ts),
 *  - the yard's handling: if the box is buried, the boxes on top must be lifted off and put back,
 *    which is two moves each, priced with the terminal's internal shifting tariff as a proxy,
 *  - a ready-by estimate for the yard, which is a rough guess and labelled as one.
 */
export type QuoteInput = {
  haulier: Haulier
  /** how many boxes are on top of this one */
  blockers: number
  /** jobs already waiting for a vehicle */
  queuedJobs: number
  now: number
  /** the window the business is asking for */
  start: number
  /** what one yard move is priced at, in rupees (defaults to the tariff proxy) */
  perMove?: number
}

export type Quote = {
  haulage: number
  digOutMoves: number
  handling: number
  total: number
  /** sim-minutes from now until the yard can have the box at the gate, roughly */
  readyInMinutes: number
  /** the window starts before the yard can plausibly be ready */
  tooEarly: boolean
}

/** Minutes of yard work per move, for the ready-by guess. A rough constant, not a measurement. */
const MINUTES_PER_MOVE = 3
const BASE_MINUTES = 8

export function quote(i: QuoteInput): Quote {
  const perMove = i.perMove ?? SHIFTING_TARIFF.rupeesPer20ft
  const digOutMoves = i.blockers * 2
  const handling = digOutMoves * perMove
  const readyInMinutes = BASE_MINUTES + i.queuedJobs * 2.5 + digOutMoves * MINUTES_PER_MOVE
  return {
    haulage: i.haulier.ratePerTrip,
    digOutMoves,
    handling,
    total: i.haulier.ratePerTrip + handling,
    readyInMinutes,
    tooEarly: i.start - i.now < readyInMinutes,
  }
}
