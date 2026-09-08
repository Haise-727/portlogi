import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { ControlPanel, RetrievalQueue } from './components/Panels/ControlPanel'
import { ContainerDetail } from './components/Panels/ContainerDetail'
import { EventLog } from './components/Panels/EventLog'
import { Inspector } from './components/Panels/Inspector'
import { Metrics } from './components/Panels/Metrics'
import { RehandlePlan } from './components/Panels/RehandlePlan'
import { StatusBar } from './components/Panels/StatusBar'
import { Legend } from './components/Yard/Legend'
import { YardGrid } from './components/Yard/YardGrid'
import { useShortcuts } from './hooks/useShortcuts'
import { clock } from './store/yardStore'

/**
 * Recharts is only ever on screen inside comparison mode, and it is two thirds
 * of the bundle. Split it out so the yard - the thing that has to be up
 * instantly on a strange machine - is not waiting on a charting library.
 */
const ComparisonMode = lazy(() =>
  import('./components/Comparison/ComparisonMode').then((m) => ({ default: m.ComparisonMode })),
)

/**
 * Three-zone console: controls on the left, the yard in the middle, the
 * reasoning on the right. Fixed to the viewport — an ops console does not
 * scroll as a page; individual panels scroll inside themselves.
 */
export default function App() {
  const [comparing, setComparing] = useState(false)
  const toggleCompare = useCallback(() => setComparing((c) => !c), [])
  useShortcuts(toggleCompare)

  useEffect(() => {
    clock.start()
    return () => clock.stop()
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="grid h-full grid-rows-[34px_minmax(0,1fr)] bg-void">
      <StatusBar />
      <div className="grid min-h-0 grid-cols-[288px_minmax(0,1fr)_384px]">
        <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] border-r border-line bg-panel">
          <ControlPanel onCompare={() => setComparing(true)} />
          <Metrics />
          <RetrievalQueue />
          <RehandlePlan />
        </aside>

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-void">
          <YardGrid />
          <Legend />
        </main>

        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,34%)] border-l border-line bg-panel">
          <div className="flex min-h-0 flex-col">
            <ContainerDetail />
            <Inspector />
          </div>
          <EventLog />
        </aside>
      </div>
      {comparing && (
        <Suspense fallback={<ComparisonLoading />}>
          <ComparisonMode onClose={() => setComparing(false)} />
        </Suspense>
      )}
    </div>
    </MotionConfig>
  )
}

function ComparisonLoading() {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'color-mix(in srgb, var(--color-void) 88%, transparent)' }}
    >
      <div className="w-full max-w-[1060px] border border-line-hi bg-panel p-3">
        <div className="h-[13px] w-[220px] animate-pulse bg-line" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[54px] animate-pulse bg-line" />
          ))}
        </div>
        <div className="mt-3 h-[240px] animate-pulse bg-line" />
      </div>
    </div>
  )
}
