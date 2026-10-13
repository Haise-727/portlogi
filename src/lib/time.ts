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
