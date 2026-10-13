import { compare } from './experiment'

/** Runs the headline experiment off the main thread so the interface stays alive. */
self.onmessage = (e: MessageEvent<{ seeds: number[]; arrivals: number }>) => {
  const { seeds, arrivals } = e.data
  const result = compare(seeds, { arrivals }, (done, total) => {
    self.postMessage({ type: 'progress', done, total })
  })
  self.postMessage({ type: 'done', result })
}
