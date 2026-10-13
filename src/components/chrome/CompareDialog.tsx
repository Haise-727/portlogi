import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Comparison, Stat } from '../../engine/experiment'
import { useYard } from '../../store/app'
import { Button } from '../ui/button'
import { Slider } from '../ui/controls'
import { Dialog } from '../ui/overlay'

const OPTIMISED = 'var(--color-run-optimised)'
const NAIVE = 'var(--color-run-naive)'

/**
 * The strongest evidence in the project on one screen: the same arrivals,
 * worked twice by the real engine, over many seeds. Runs in a worker.
 */
export default function CompareDialog() {
  const open = useYard((s) => s.compareOpen)
  const setOpen = useYard((s) => s.setCompareOpen)
  const [seeds, setSeeds] = useState(20)
  const [arrivals, setArrivals] = useState(30)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<Comparison | null>(null)
  const worker = useRef<Worker | null>(null)

  const run = () => {
    worker.current?.terminate()
    const w = new Worker(new URL('../../engine/compare.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    setProgress(0)
    w.onmessage = (e: MessageEvent<{ type: string; done?: number; total?: number; result?: Comparison }>) => {
      if (e.data.type === 'progress') setProgress((e.data.done ?? 0) / (e.data.total ?? 1))
      if (e.data.type === 'done') {
        setResult(e.data.result!)
        setProgress(null)
        w.terminate()
      }
    }
    w.postMessage({ seeds: Array.from({ length: seeds }, (_, i) => i + 1), arrivals })
  }

  useEffect(() => () => worker.current?.terminate(), [])

  const r = result
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Allocator vs first-available" description="the same containers, the same departures, two strategies">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-4 border-b border-line px-3 py-2">
          <Slider label="Seeds (independent runs)" value={seeds} min={5} max={100} step={5} onChange={setSeeds} />
          <Slider label="Arrivals per run" value={arrivals} min={10} max={80} step={5} onChange={setArrivals} />
          <Button variant="primary" onClick={run} disabled={progress !== null} className="mb-[3px]">
            <Play size={12} />
            {progress !== null ? `${Math.round(progress * 100)}%` : r ? 'Run again' : 'Run'}
          </Button>
        </div>

        {!r && progress === null && (
          <p className="px-3 py-8 text-center text-[11px] text-ink-3">
            Runs the real simulation {seeds * 2} times in the background. Every box, weight and departure is identical between the two strategies; only slot choice differs.
          </p>
        )}

        {r && (
          <>
            <div className="grid grid-cols-3 border-b border-line">
              <Hero label="First-available" stat={r.rehandles.naive} colour={NAIVE} />
              <Hero label="Allocator" stat={r.rehandles.optimised} colour={OPTIMISED} />
              <div className="px-3 py-3">
                <div className="font-mono text-[9px] leading-none text-ink-3">REHANDLES AVOIDED</div>
                <div className="mt-[6px] font-mono text-[30px] leading-none tabular-nums text-ink">−{Math.round(r.rehandleReduction * 100)}%</div>
                <p className="mt-[6px] text-[10px] leading-snug text-ink-3">
                  {r.violations === 0 ? 'No safety violations in any run.' : `${r.violations} safety violations detected.`}
                </p>
              </div>
            </div>

            <figure className="px-3 pb-1 pt-3">
              <figcaption className="mb-2 text-[11px] text-ink-2">Rehandles per run (each pair is one seed)</figcaption>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.runs.map((x, i) => ({ seed: r.seeds[i], naive: x.naive.rehandles, optimised: x.optimised.rehandles }))} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" />
                    <XAxis dataKey="seed" tick={{ fill: 'var(--color-ink-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
                    <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--color-ink-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--color-raise)' }} contentStyle={{ background: 'var(--color-void)', border: '1px solid var(--color-line-hi)', borderRadius: 2, fontSize: 11 }} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="naive" name="First-available" fill={NAIVE} isAnimationActive={false} />
                    <Bar dataKey="optimised" name="Allocator" fill={OPTIMISED} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <table className="w-full border-t border-line text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[9px] font-normal tracking-[0.08em] text-ink-3">
                  <th className="px-3 py-[4px] font-normal">MEASURE (MEAN ± 95% CI)</th>
                  <th className="w-[150px] px-3 py-[4px] text-right font-normal">FIRST-AVAILABLE</th>
                  <th className="w-[150px] px-3 py-[4px] text-right font-normal">ALLOCATOR</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Rehandles per run" a={r.rehandles.naive} b={r.rehandles.optimised} />
                <Row label="Grid cells driven" a={r.cells.naive} b={r.cells.optimised} digits={0} />
                <Row label="Time to clear the yard (min)" a={r.makespan.naive} b={r.makespan.optimised} digits={0} />
                <Row label="Average dwell (min)" a={r.avgDwell.naive} b={r.avgDwell.optimised} digits={0} />
              </tbody>
            </table>

            <p className="border-t border-line px-3 py-2 text-[10px] leading-snug text-ink-3">
              {r.seeds.length} seeds, identical arrivals within each pair. Rehandles are counted where a terminal pays for them, at retrieval, not predicted at placement. Both strategies obey the same hard rules and the same traffic control.
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}

function Hero({ label, stat, colour }: { label: string; stat: Stat; colour: string }) {
  return (
    <div className="border-r border-line px-3 py-3">
      <div className="flex items-center gap-[6px]">
        <span className="h-[8px] w-[8px]" style={{ background: colour }} />
        <span className="font-mono text-[9px] leading-none text-ink-3">{label.toUpperCase()}</span>
      </div>
      <div className="mt-[6px] flex items-baseline gap-2">
        <span className="font-mono text-[30px] leading-none tabular-nums text-ink">{stat.mean.toFixed(1)}</span>
        <span className="font-mono text-[11px] text-ink-3">± {stat.ci95.toFixed(1)}</span>
      </div>
      <div className="mt-1 text-[10px] text-ink-3">rehandles per run</div>
    </div>
  )
}

function Row({ label, a, b, digits = 1 }: { label: string; a: Stat; b: Stat; digits?: number }) {
  const f = (s: Stat) => `${s.mean.toFixed(digits)} ± ${s.ci95.toFixed(digits)}`
  return (
    <tr className="border-b border-line">
      <td className="px-3 py-[5px] text-[10px] text-ink-2">{label}</td>
      <td className="px-3 py-[5px] text-right font-mono text-[11px] tabular-nums text-ink-2">{f(a)}</td>
      <td className="px-3 py-[5px] text-right font-mono text-[11px] tabular-nums" style={{ color: b.mean < a.mean ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>
        {f(b)}
      </td>
    </tr>
  )
}
