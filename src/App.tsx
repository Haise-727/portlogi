import { useEffect, useState } from 'react'
import { ComparisonMode } from './components/Comparison/ComparisonMode'
import { ControlPanel, RetrievalQueue } from './components/Panels/ControlPanel'
import { ContainerDetail } from './components/Panels/ContainerDetail'
import { EventLog } from './components/Panels/EventLog'
import { Inspector } from './components/Panels/Inspector'
import { Metrics } from './components/Panels/Metrics'
import { StatusBar } from './components/Panels/StatusBar'
import { YardGrid } from './components/Yard/YardGrid'
import { clock } from './store/yardStore'

/**
 * Three-zone console: controls on the left, the yard in the middle, the
 * reasoning on the right. Fixed to the viewport — an ops console does not
 * scroll as a page; individual panels scroll inside themselves.
 */
export default function App() {
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    clock.start()
    return () => clock.stop()
  }, [])

  return (
    <div className="grid h-full grid-rows-[34px_minmax(0,1fr)] bg-void">
      <StatusBar />
      <div className="grid min-h-0 grid-cols-[288px_minmax(0,1fr)_384px]">
        <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r border-line bg-panel">
          <ControlPanel onCompare={() => setComparing(true)} />
          <Metrics />
          <RetrievalQueue />
        </aside>

        <main className="min-h-0 bg-void">
          <YardGrid />
        </main>

        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,34%)] border-l border-line bg-panel">
          <div className="flex min-h-0 flex-col">
            <ContainerDetail />
            <Inspector />
          </div>
          <EventLog />
        </aside>
      </div>
      {comparing && <ComparisonMode onClose={() => setComparing(false)} />}
    </div>
  )
}
