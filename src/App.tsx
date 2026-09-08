import { StatusBar } from './components/Panels/StatusBar'

/**
 * Three-zone console: controls on the left, the yard in the middle, the
 * reasoning on the right. Fixed to the viewport — an ops console does not
 * scroll as a page; individual panels scroll inside themselves.
 */
export default function App() {
  return (
    <div className="grid h-full grid-rows-[34px_minmax(0,1fr)] bg-void">
      <StatusBar />
      <div className="grid min-h-0 grid-cols-[288px_minmax(0,1fr)_384px]">
        <aside className="min-h-0 border-r border-line bg-panel" />
        <main className="min-h-0 bg-void" />
        <aside className="min-h-0 border-l border-line bg-panel" />
      </div>
    </div>
  )
}
