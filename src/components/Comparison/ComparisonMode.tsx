import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { RefreshCw, X } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { runComparison, type ComparisonResult } from '../../lib/comparison'

const ARRIVALS = 30
const OPTIMISED = 'var(--color-run-optimised)'
const NAIVE = 'var(--color-run-naive)'

/**
 * The strongest evidence in the project on one screen: the same thirty
 * containers, in the same order, with the same departures, worked twice.
 */
export function ComparisonMode({ onClose }: { onClose: () => void }) {
  const [seed, setSeed] = useState(20260908)
  const result = useMemo(() => runComparison(seed, ARRIVALS), [seed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const avoided = result.naive.rehandles - result.optimised.rehandles
  const pctCut =
    result.naive.rehandles > 0 ? Math.round((avoided / result.naive.rehandles) * 100) : 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Optimised versus naive placement"
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'color-mix(in srgb, var(--color-void) 88%, transparent)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[1060px] flex-col overflow-hidden border border-line-hi bg-panel"
        style={{ borderRadius: 2 }}
      >
        <header className="flex items-center gap-3 border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-medium text-ink">Same {ARRIVALS} arrivals, two strategies</h2>
          <span className="font-mono text-[10px] text-ink-3">
            seed {result.seed} · identical containers, weights, departures
          </span>
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 900000) + 1000)}
            className="ml-auto flex items-center gap-[5px] border border-line bg-raise px-2 py-[3px] text-[10px] text-ink-2 transition-colors hover:border-line-hi hover:text-ink"
            style={{ borderRadius: 2 }}
          >
            <RefreshCw size={11} strokeWidth={2} />
            New sequence
          </button>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close comparison"
            className="text-ink-3 transition-colors hover:text-ink"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 border-b border-line">
            <Hero
              label="First-available placement"
              value={result.naive.rehandles}
              unit="rehandles"
              colour={NAIVE}
            />
            <Hero
              label="Allocator placement"
              value={result.optimised.rehandles}
              unit="rehandles"
              colour={OPTIMISED}
            />
            <div className="px-3 py-3">
              <div className="font-mono text-[9px] leading-none text-ink-3">WASTED MOVES AVOIDED</div>
              <div className="mt-[6px] flex items-baseline gap-2">
                <span className="font-mono text-[30px] leading-none tabular-nums text-ink">
                  {avoided}
                </span>
                <span className="font-mono text-[13px] tabular-nums text-ink-2">−{pctCut}%</span>
              </div>
              <p className="mt-[6px] text-[10px] leading-snug text-ink-3">
                Each one is a whole vehicle trip spent moving a box nobody asked for.
              </p>
            </div>
          </div>

          <figure className="px-3 pb-1 pt-3">
            <figcaption className="mb-2 flex items-center gap-4">
              <h3 className="text-[11px] text-ink-2">
                Cumulative rehandles as containers are loaded
              </h3>
              <span className="ml-auto flex items-center gap-3">
                <LegendKey colour={NAIVE} label="First-available" />
                <LegendKey colour={OPTIMISED} label="Allocator" />
              </span>
            </figcaption>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.points} margin={{ top: 6, right: 74, bottom: 4, left: 0 }}>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-line)"
                    strokeDasharray="0"
                  />
                  <XAxis
                    dataKey="n"
                    tick={{ fill: 'var(--color-ink-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    minTickGap={22}
                    interval="preserveStartEnd"
                    axisLine={{ stroke: 'var(--color-line)' }}
                    label={{
                      value: 'containers loaded to vessel',
                      position: 'insideBottomRight',
                      offset: -2,
                      fill: 'var(--color-ink-3)',
                      fontSize: 9,
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={34}
                    tick={{ fill: 'var(--color-ink-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--color-line-hi)', strokeWidth: 1 }}
                    content={<ChartTooltip />}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="naive"
                    stroke={NAIVE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                    label={endLabel(result.points.length, `First-available ${result.naive.rehandles}`, NAIVE)}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="optimised"
                    stroke={OPTIMISED}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                    label={endLabel(result.points.length, `Allocator ${result.optimised.rehandles}`, OPTIMISED)}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <Table result={result} />

          <p className="border-t border-line px-3 py-2 text-[10px] leading-snug text-ink-3">
            Both runs share one seeded sequence, so the only variable is slot choice. Rehandles
            are counted where a terminal actually pays for them — at retrieval, when a box has to
            come off the one that is wanted — not predicted at placement, which would let the
            optimiser mark its own homework. The allocator also refuses slots the first-available
            rule would happily take, so it can hold the gate longer: that is the trade it makes to
            keep the dig-outs down.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * Direct labels at the end of each line: identity should not depend on matching
 * a colour back to a legend.
 */
type PointLabelProps = { x?: number | string; y?: number | string; index?: number }

function endLabel(total: number, text: string, colour: string) {
  return function EndLabel(props: PointLabelProps) {
    if (props.index !== total - 1 || props.x == null || props.y == null) return <g />
    return (
      <text
        x={Number(props.x) + 8}
        y={Number(props.y) + 3.5}
        fill={colour}
        fontSize={10}
        fontFamily="var(--font-mono)"
      >
        {text}
      </text>
    )
  }
}

function Hero({
  label,
  value,
  unit,
  colour,
}: {
  label: string
  value: number
  unit: string
  colour: string
}) {
  return (
    <div className="border-r border-line px-3 py-3">
      <div className="flex items-center gap-[6px]">
        <span className="h-[8px] w-[8px]" style={{ background: colour }} />
        <span className="font-mono text-[9px] leading-none text-ink-3">{label.toUpperCase()}</span>
      </div>
      <div className="mt-[6px] flex items-baseline gap-2">
        <span className="font-mono text-[30px] leading-none tabular-nums text-ink">{value}</span>
        <span className="text-[11px] text-ink-2">{unit}</span>
      </div>
    </div>
  )
}

function LegendKey({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span className="h-[2px] w-[14px]" style={{ background: colour }} />
      <span className="text-[10px] text-ink-2">{label}</span>
    </span>
  )
}

type TooltipPayload = { payload?: { n: number; naive: number; optimised: number } }

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div
      className="border border-line-hi px-2 py-[5px]"
      style={{ background: 'var(--color-void)', borderRadius: 2 }}
    >
      <div className="font-mono text-[9px] text-ink-3">after {point.n} loaded</div>
      <div className="mt-[3px] flex items-center gap-[5px]">
        <span className="h-[2px] w-[10px]" style={{ background: NAIVE }} />
        <span className="text-[10px] text-ink-2">First-available</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink">{point.naive}</span>
      </div>
      <div className="mt-[2px] flex items-center gap-[5px]">
        <span className="h-[2px] w-[10px]" style={{ background: OPTIMISED }} />
        <span className="text-[10px] text-ink-2">Allocator</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink">
          {point.optimised}
        </span>
      </div>
    </div>
  )
}

/** The table view the chart owes the reader: same numbers, no colour needed. */
function Table({ result }: { result: ComparisonResult }) {
  const rows: { label: string; naive: string; optimised: string; better: 'lower' }[] = [
    {
      label: 'Rehandles forced at retrieval',
      naive: String(result.naive.rehandles),
      optimised: String(result.optimised.rehandles),
      better: 'lower',
    },
    {
      label: 'Loaded AGV travel (A* cost)',
      naive: result.naive.travel.toFixed(1),
      optimised: result.optimised.travel.toFixed(1),
      better: 'lower',
    },
    {
      label: 'Gate blocked, no legal slot',
      naive: `${result.naive.gateBlocked} min`,
      optimised: `${result.optimised.gateBlocked} min`,
      better: 'lower',
    },
  ]

  return (
    <table className="w-full border-t border-line text-left">
      <thead>
        <tr className="border-b border-line">
          <th className="px-3 py-[4px] font-mono text-[9px] font-normal tracking-[0.08em] text-ink-3">
            MEASURE
          </th>
          <th className="w-[130px] px-3 py-[4px] text-right font-mono text-[9px] font-normal tracking-[0.08em] text-ink-3">
            FIRST-AVAILABLE
          </th>
          <th className="w-[130px] px-3 py-[4px] text-right font-mono text-[9px] font-normal tracking-[0.08em] text-ink-3">
            ALLOCATOR
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const a = parseFloat(r.naive)
          const b = parseFloat(r.optimised)
          return (
            <tr key={r.label} className="border-b border-line">
              <td className="px-3 py-[5px] text-[10px] text-ink-2">{r.label}</td>
              <td className="px-3 py-[5px] text-right font-mono text-[11px] tabular-nums text-ink-2">
                {r.naive}
              </td>
              <td
                className="px-3 py-[5px] text-right font-mono text-[11px] tabular-nums"
                style={{ color: b < a ? 'var(--color-ink)' : 'var(--color-ink-2)' }}
              >
                {r.optimised}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
