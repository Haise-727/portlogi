import { compare } from '../src/engine/experiment'

process.once('message', (m: { seeds: number[]; arrivals: number }) => {
  process.send!(compare(m.seeds, { arrivals: m.arrivals }))
})
