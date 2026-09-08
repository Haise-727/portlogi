/**
 * Simulation clock.
 *
 * requestAnimationFrame rather than setInterval: the tick is tied to the
 * display, it pauses by itself when the tab is hidden instead of queueing up a
 * backlog of missed intervals, and the frame delta is what drives the crane
 * interpolation, so motion stays smooth at any speed multiplier.
 *
 * One real second is one sim-minute at 1x.
 */
export const REAL_SECOND_IN_SIM_MINUTES = 1
/** Ignore deltas larger than this: a backgrounded tab must not teleport cranes. */
const MAX_FRAME_SECONDS = 0.1

export type TickFn = (simMinutes: number) => void

export class SimClock {
  private raf: number | null = null
  private last = 0
  private readonly onTick: TickFn
  speed = 1
  running = false

  constructor(onTick: TickFn) {
    this.onTick = onTick
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const frame = (t: number) => {
      if (!this.running) return
      const realSeconds = Math.min((t - this.last) / 1000, MAX_FRAME_SECONDS)
      this.last = t
      this.onTick(realSeconds * REAL_SECOND_IN_SIM_MINUTES * this.speed)
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }
}

/** Sim-minutes since shift start -> wall clock on a 06:00 shift. */
export function formatClock(simMinutes: number): string {
  const total = 6 * 60 + simMinutes
  const h = Math.floor(total / 60) % 24
  const m = Math.floor(total % 60)
  const s = Math.floor((total * 60) % 60)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function formatShort(simMinutes: number): string {
  const total = 6 * 60 + simMinutes
  return `${pad(Math.floor(total / 60) % 24)}:${pad(Math.floor(total % 60))}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
