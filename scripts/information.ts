import { writeFileSync, mkdirSync } from 'node:fs'
import { compareInformation, POLICIES } from '../src/engine/information'

const seeds = Array.from({ length: 32 }, (_, i) => i + 1)
const rows = compareInformation(seeds, 20)
const f = (s: { mean: number; ci95: number }, d = 1) => `${s.mean.toFixed(d)} ± ${s.ci95.toFixed(d)}`
const md = [
  '# What is knowing the pickup time worth?',
  '',
  `Model result, ${seeds.length} seeds, 20 import boxes each, default 6-stack yard, optimised allocator. True pickup times are drawn uniformly 1 to 5 hours after arrival (a stand-in; real distributions were not found in a source). Values are mean ± 95% CI.`,
  '',
  '| Information available | Rehandles | Truck wait (min) | Worst wait (min) |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.label} | ${f(r.rehandles)} | ${f(r.truckWait)} | ${f(r.worstWait, 0)} |`),
  '',
  '## Reading it',
  '- A booking only helps rehandles if it is known **when the box is placed**. A booking made 20 minutes to 2 hours before pickup arrives after the box is already stacked, so it cannot change where it went.',
  '- Even a late booking removes the truck wait: the yard sees the time, digs the box out and stages it at the gate before the truck arrives.',
  '- A decent forecast (15 min error) recovers most of the rehandle saving without any firm booking.',
  '- So the policy lever for a port authority is booking **at discharge**, not at pickup.',
  '',
  '## Policies', ...POLICIES.map((p) => `- ${p.label}: ${p.detail}`),
]
mkdirSync('reports', { recursive: true })
writeFileSync('reports/information.md', md.join('\n') + '\n')
console.log(md.slice(4, 13).join('\n'))
