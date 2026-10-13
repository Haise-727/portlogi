import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { DEFAULT_WEIGHTS, type Weights } from '../src/engine/allocator'
import { Engine } from '../src/engine/engine'
import { compare, runExperiment, stat, type RunSummary, type Stat } from '../src/engine/experiment'
import { defaultSpec, maxAgvs, type LayoutSpec } from '../src/engine/layout'
import { stressLayout } from '../src/engine/stress'
import { barChart } from './svg'

/**
 * Generates every number and figure the written report needs, from the real
 * engine. Run with `npm run report` (add `--quick` for a fast smoke run).
 * Output goes to reports/: CSV tables, SVG figures, results.json, results.md.
 */
const QUICK = process.argv.includes('--quick')
const OUT = new URL('../reports/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const file = (name: string, body: string) => writeFileSync(new URL(name, OUT), body)
const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i)
const f = (s: Stat, d = 1) => `${s.mean.toFixed(d)} ± ${s.ci95.toFixed(d)}`
const csv = (rows: (string | number)[][]) => rows.map((r) => r.join(',')).join('\n') + '\n'
const t0 = performance.now()
const log = (m: string) => console.log(`[${((performance.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)

const md: string[] = ['# portlogi: experimental results', '', `Generated ${new Date().toISOString()} by \`npm run report\`${QUICK ? ' (quick mode)' : ''}.`, '']
const json: Record<string, unknown> = {}

/* ---------------------------------------------------------------- *
 * 1. Headline: allocator vs first-available
 * ---------------------------------------------------------------- */
log('1/6 headline comparison')
const N = QUICK ? 20 : 100
const head = compare(seeds(N), { arrivals: 30, checkEvery: 25 })
file(
  'headline_runs.csv',
  csv([
    ['seed', 'strategy', 'rehandles', 'cells', 'makespan_min', 'avg_dwell_min', 'avg_gate_wait_min', 'holds', 'utilisation', 'finished', 'violations'],
    ...head.runs.flatMap((r) =>
      [r.optimised, r.naive].map((x) => [x.seed, x.strategy, x.rehandles, x.cells, x.makespan.toFixed(1), x.avgDwell.toFixed(1), x.avgGateWait.toFixed(1), x.holds, x.agvUtilisation.toFixed(3), x.finished, x.violations.length]),
    ),
  ]),
)
const wins = head.runs.filter((r) => r.optimised.rehandles < r.naive.rehandles).length
const ties = head.runs.filter((r) => r.optimised.rehandles === r.naive.rehandles).length
md.push(
  `## 1. Allocator versus first-available placement`,
  '',
  `${N} independent seeds, 30 arrivals each, identical containers within every pair. Mean ± 95% confidence interval.`,
  '',
  '| Measure | First-available | Allocator |',
  '|---|---|---|',
  `| Rehandles per run | ${f(head.rehandles.naive)} | ${f(head.rehandles.optimised)} |`,
  `| Grid cells driven | ${f(head.cells.naive, 0)} | ${f(head.cells.optimised, 0)} |`,
  `| Time to clear the yard (min) | ${f(head.makespan.naive, 0)} | ${f(head.makespan.optimised, 0)} |`,
  `| Average dwell (min) | ${f(head.avgDwell.naive, 0)} | ${f(head.avgDwell.optimised, 0)} |`,
  '',
  `Rehandle reduction: **${(head.rehandleReduction * 100).toFixed(1)}%**. The allocator was better in ${wins} of ${N} runs, tied in ${ties}, worse in ${N - wins - ties}. Safety violations across all ${N * 2} runs: **${head.violations}**.`,
  '',
)
json.headline = { seeds: N, reduction: head.rehandleReduction, rehandles: head.rehandles, cells: head.cells, makespan: head.makespan, avgDwell: head.avgDwell, wins, ties, violations: head.violations }
file(
  'fig1_headline.svg',
  barChart({
    title: 'Rehandles per run (mean, 95% CI)',
    yLabel: 'rehandles',
    categories: ['Rehandles'],
    series: [
      { name: 'First-available', colour: '#c2557e', values: [head.rehandles.naive.mean], errors: [head.rehandles.naive.ci95] },
      { name: 'Allocator', colour: '#00a7be', values: [head.rehandles.optimised.mean], errors: [head.rehandles.optimised.ci95] },
    ],
  }),
)

/* ---------------------------------------------------------------- *
 * 2. Ablation: what does each scoring term contribute?
 * ---------------------------------------------------------------- */
log('2/6 ablation')
const A = QUICK ? 10 : 40
const zero = (k: keyof Weights): Weights => ({ ...DEFAULT_WEIGHTS, [k]: 0 })
const configs: { name: string; weights: Weights }[] = [
  { name: 'All terms', weights: DEFAULT_WEIGHTS },
  { name: 'No rehandle risk', weights: zero('rehandle') },
  { name: 'No travel', weights: zero('travel') },
  { name: 'No cluster', weights: zero('cluster') },
  { name: 'No spread', weights: zero('spread') },
  { name: 'No aisle access', weights: zero('access') },
]
const abl = configs.map((c) => {
  const runs = seeds(A).map((seed) => runExperiment({ seed, strategy: 'optimised', arrivals: 30, weights: c.weights }))
  return { name: c.name, rehandles: stat(runs.map((r) => r.rehandles)), cells: stat(runs.map((r) => r.cells)), makespan: stat(runs.map((r) => r.makespan)) }
})
const naiveRuns = seeds(A).map((seed) => runExperiment({ seed, strategy: 'naive', arrivals: 30 }))
const ablNaive = { name: 'First-available (baseline)', rehandles: stat(naiveRuns.map((r) => r.rehandles)), cells: stat(naiveRuns.map((r) => r.cells)), makespan: stat(naiveRuns.map((r) => r.makespan)) }
file('ablation.csv', csv([['config', 'rehandles_mean', 'rehandles_ci95', 'cells_mean', 'makespan_mean'], ...[...abl, ablNaive].map((a) => [a.name, a.rehandles.mean.toFixed(2), a.rehandles.ci95.toFixed(2), a.cells.mean.toFixed(0), a.makespan.mean.toFixed(0)])]))
md.push(
  '## 2. Ablation: contribution of each scoring term',
  '',
  `One term's weight set to zero at a time, ${A} seeds each.`,
  '',
  '| Configuration | Rehandles | Cells driven | Time to clear (min) |',
  '|---|---|---|---|',
  ...[...abl, ablNaive].map((a) => `| ${a.name} | ${f(a.rehandles)} | ${f(a.cells, 0)} | ${f(a.makespan, 0)} |`),
  '',
)
json.ablation = [...abl, ablNaive]
file(
  'fig2_ablation.svg',
  barChart({
    title: 'Ablation: rehandles per run',
    yLabel: 'rehandles',
    categories: [...abl, ablNaive].map((a) => a.name.replace('First-available (baseline)', 'Baseline')),
    series: [{ name: 'Rehandles', colour: '#00a7be', values: [...abl, ablNaive].map((a) => a.rehandles.mean), errors: [...abl, ablNaive].map((a) => a.rehandles.ci95) }],
  }),
)

/* ---------------------------------------------------------------- *
 * 3. Scale: the same code on bigger yards
 * ---------------------------------------------------------------- */
log('3/6 scale')
const S = QUICK ? 3 : 12
const powered = (rows: number, cols: number) => Array.from({ length: cols }, (_, c) => `A${c + 1}`).concat(rows > 3 ? Array.from({ length: Math.floor(cols / 2) }, (_, c) => `B${c + 1}`) : [])
const scales: { name: string; spec: LayoutSpec }[] = [
  { name: '3×4 (12)', spec: defaultSpec() },
  { name: '4×6 (24)', spec: { rows: 4, cols: 6, tiers: 3, powered: powered(4, 6), disabled: [], gates: [2, 5], quays: [3, 6], pads: [0, 7], agvs: 4 } },
  { name: '5×8 (40)', spec: { rows: 5, cols: 8, tiers: 3, powered: powered(5, 8), disabled: [], gates: [2, 5, 7], quays: [3, 6], pads: [0, 9], agvs: 5 } },
  { name: '6×10 (60)', spec: { rows: 6, cols: 10, tiers: 3, powered: powered(6, 10), disabled: [], gates: [2, 5, 8], quays: [3, 6, 9], pads: [0, 11], agvs: 6 } },
]
const scale = scales.map((sc) => {
  const slots = sc.spec.rows * sc.spec.cols
  const arrivals = slots * 2
  const wall: number[] = []
  const opt: RunSummary[] = []
  const nai: RunSummary[] = []
  for (const seed of seeds(S)) {
    const t = performance.now()
    opt.push(runExperiment({ seed, strategy: 'optimised', spec: sc.spec, arrivals, maxMinutes: 3000, checkEvery: 50 }))
    wall.push(performance.now() - t)
    nai.push(runExperiment({ seed, strategy: 'naive', spec: sc.spec, arrivals, maxMinutes: 3000 }))
  }
  return {
    name: sc.name,
    slots,
    arrivals,
    vehicles: Math.min(sc.spec.agvs, maxAgvs(sc.spec.rows, sc.spec.cols)),
    rehandlesOpt: stat(opt.map((r) => r.rehandles)),
    rehandlesNaive: stat(nai.map((r) => r.rehandles)),
    makespan: stat(opt.map((r) => r.makespan)),
    holds: stat(opt.map((r) => r.holds)),
    wallMs: stat(wall),
    finished: opt.filter((r) => r.finished).length,
    violations: opt.reduce((a, r) => a + r.violations.length, 0),
  }
})
file('scale.csv', csv([['layout', 'positions', 'arrivals', 'vehicles', 'rehandles_opt', 'rehandles_naive', 'makespan_min', 'holds', 'wall_ms_per_run', 'finished', 'violations'], ...scale.map((s) => [s.name, s.slots, s.arrivals, s.vehicles, s.rehandlesOpt.mean.toFixed(1), s.rehandlesNaive.mean.toFixed(1), s.makespan.mean.toFixed(0), s.holds.mean.toFixed(0), s.wallMs.mean.toFixed(0), `${s.finished}/${S}`, s.violations]) ]))
md.push(
  '## 3. Scaling to larger yards',
  '',
  `${S} seeds per layout; arrivals scale with yard size. Wall-clock is the cost of simulating the whole run headless.`,
  '',
  '| Layout (positions) | Vehicles | Rehandles: allocator | Rehandles: first-available | Time to clear (min) | Traffic holds | Wall-clock per run |',
  '|---|---|---|---|---|---|---|',
  ...scale.map((s) => `| ${s.name} | ${s.vehicles} | ${f(s.rehandlesOpt)} | ${f(s.rehandlesNaive)} | ${f(s.makespan, 0)} | ${f(s.holds, 0)} | ${(s.wallMs.mean / 1000).toFixed(1)} s |`),
  '',
)
json.scale = scale
file(
  'fig3_scale.svg',
  barChart({
    title: 'Rehandles by yard size',
    yLabel: 'rehandles',
    categories: scale.map((s) => s.name),
    series: [
      { name: 'First-available', colour: '#c2557e', values: scale.map((s) => s.rehandlesNaive.mean), errors: scale.map((s) => s.rehandlesNaive.ci95) },
      { name: 'Allocator', colour: '#00a7be', values: scale.map((s) => s.rehandlesOpt.mean), errors: scale.map((s) => s.rehandlesOpt.ci95) },
    ],
  }),
)

/* ---------------------------------------------------------------- *
 * 4. Fleet size
 * ---------------------------------------------------------------- */
log('4/6 fleet size')
const FS = QUICK ? 5 : 20
const fleet = [1, 2, 3].map((n) => {
  const runs = seeds(FS).map((seed) => runExperiment({ seed, strategy: 'optimised', arrivals: 30, spec: { ...defaultSpec(), agvs: n }, maxMinutes: 3000 }))
  return { vehicles: n, makespan: stat(runs.map((r) => r.makespan)), gateWait: stat(runs.map((r) => r.avgGateWait)), holds: stat(runs.map((r) => r.holds)), util: stat(runs.map((r) => r.agvUtilisation)) }
})
file('fleet.csv', csv([['vehicles', 'makespan_min', 'gate_wait_min', 'holds', 'utilisation'], ...fleet.map((x) => [x.vehicles, x.makespan.mean.toFixed(0), x.gateWait.mean.toFixed(1), x.holds.mean.toFixed(0), x.util.mean.toFixed(2)])]))
md.push(
  '## 4. Fleet size on the default 4×3 yard',
  '',
  `${FS} seeds per size.`,
  '',
  '| Vehicles | Time to clear (min) | Average gate wait (min) | Traffic holds | Utilisation |',
  '|---|---|---|---|---|',
  ...fleet.map((x) => `| ${x.vehicles} | ${f(x.makespan, 0)} | ${f(x.gateWait)} | ${f(x.holds, 0)} | ${f(x.util, 2)} |`),
  '',
)
json.fleet = fleet
file('fig4_fleet.svg', barChart({ title: 'Time to clear the yard by fleet size', yLabel: 'sim-minutes', categories: fleet.map((x) => `${x.vehicles} vehicle${x.vehicles > 1 ? 's' : ''}`), series: [{ name: 'Makespan', colour: '#00a7be', values: fleet.map((x) => x.makespan.mean), errors: fleet.map((x) => x.makespan.ci95) }] }))

/* ---------------------------------------------------------------- *
 * 5. Safety and robustness
 * ---------------------------------------------------------------- */
log('5/6 randomised stress sweep (slow)')
const R = QUICK ? 25 : 200
const stress = seeds(R, 20000).map((s) => stressLayout(s))
const safety = stress.filter((r) => r.failure === 'safety')
const stalls = stress.filter((r) => r.failure === 'stall')
file('stress.csv', csv([['seed', 'rows', 'cols', 'tiers', 'vehicles', 'gates', 'quays', 'pads', 'departed', 'result', 'detail'], ...stress.map((r) => [r.seed, r.spec.rows, r.spec.cols, r.spec.tiers, r.spec.agvs, r.spec.gates.length, r.spec.quays.length, r.spec.pads.length, r.departed, r.failure || 'ok', `"${r.detail}"`])]))
md.push(
  '## 5. Safety and robustness',
  '',
  `${R} random yards (1–6 rows, 2–10 columns, 1–4 tiers, 1–3 gates and quays, 1–6 vehicles, a closed slot in 40% of them) were each driven for 1000 simulated minutes with a vessel surge, a vehicle breakdown and a reefer storm injected. Invariants were checked every 9 ticks.`,
  '',
  '| Property | Result |',
  '|---|---|',
  `| Layouts simulated | ${R} |`,
  `| Safety violations (collision, illegal stack, lost or duplicated box) | **${safety.length}** |`,
  `| Layouts that stalled (no departure for 600 min) | ${stalls.length} (${((stalls.length / R) * 100).toFixed(1)}%) |`,
  `| Clean runs | ${stress.filter((r) => r.ok).length} (${((stress.filter((r) => r.ok).length / R) * 100).toFixed(1)}%) |`,
  '',
  stalls.length ? `Stalled layouts (rows×columns, tiers, vehicles): ${stalls.map((s) => `${s.spec.rows}×${s.spec.cols}, ${s.spec.tiers}t, ${s.spec.agvs}v`).join('; ')}.` : 'No layout stalled.',
  '',
)
json.stress = { layouts: R, safety: safety.length, stalls: stalls.length, stallSpecs: stalls.map((s) => s.spec) }

/* ---------------------------------------------------------------- *
 * 6. Determinism
 * ---------------------------------------------------------------- */
log('6/6 determinism')
const fingerprint = (seed: number) => {
  const e = new Engine({ seed, auto: true })
  e.run(60000)
  return JSON.stringify([e.s.stacks, e.s.metrics, e.s.tick])
}
const det = seeds(10).every((s) => fingerprint(s) === fingerprint(s))
md.push('## 6. Determinism', '', `Ten seeds were each simulated twice for 600 sim-minutes and compared state-for-state: **${det ? 'identical' : 'DIFFERENT'}**. This is what makes replay and the experiments reproducible.`, '')
json.deterministic = det

file('results.md', md.join('\n'))
file('results.json', JSON.stringify(json, null, 2))
log(`done. Wrote ${new URL('.', OUT).pathname}`)
