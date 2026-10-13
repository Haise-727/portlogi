import { Suspense, lazy, useEffect, useRef } from 'react'
import { MotionConfig } from 'motion/react'
import { CrateInspector } from './components/chrome/CrateInspector'
import { DigOutPrompt } from './components/chrome/DigOutPrompt'
import { LogDrawer, LogStrip } from './components/chrome/LogStrip'
import { Sidebar } from './components/chrome/Sidebar'
import { Toasts } from './components/chrome/Toasts'
import { TopBar } from './components/chrome/TopBar'
import { YardView } from './components/stage/YardView'
import { TipProvider } from './components/ui/overlay'
import { useClock, useScannerFeed, useShortcuts } from './hooks/useRuntime'
import { useYard } from './store/app'

/** Recharts is only ever on screen inside the comparison dialog, so it is not in the first load. */
const CompareDialog = lazy(() => import('./components/chrome/CompareDialog'))

/**
 * The yard owns the screen. Everything else is either a thin bar, a three-line
 * log, or something you summon: the settings sidebar (which pushes the yard
 * aside rather than covering it), a crate's inspector, the full log with
 * replay, and the evidence dialog.
 */
export default function App() {
  useClock()
  useShortcuts()
  useScannerFeed()
  const compareOpen = useYard((s) => s.compareOpen)
  const select = useYard((s) => s.select)
  const reduce = useYard((s) => s.reduceMotion)
  const stage = useRef<HTMLElement>(null)

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduce)
  }, [reduce])

  // Say once, on a first visit, where everything configurable lives.
  useEffect(() => {
    if (useYard.getState().menuSeen) return
    const t = setTimeout(() => {
      const s = useYard.getState()
      if (s.menuSeen) return
      s.showToast({
        text: 'Layout editor, scenarios, box groups and tuning all live in Settings. Click any crate for its inspector, or the log to replay.',
        actionLabel: 'Open settings',
        action: () => useYard.getState().openSidebar(),
      })
    }, 1400)
    return () => clearTimeout(t)
  }, [])

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      <TipProvider>
        <div className="grid h-full grid-rows-[36px_minmax(0,1fr)] bg-void">
          <TopBar />
          <main className="flex min-h-0 overflow-hidden">
            <section
              ref={stage}
              className="relative min-w-0 flex-1 overflow-hidden"
              onClick={(e) => e.target === e.currentTarget && select(null)}
            >
              <YardView />
              <LogStrip />
              <LogDrawer />
              <DigOutPrompt />
              <CrateInspector bounds={stage} />
              <Toasts />
            </section>
            <Sidebar />
          </main>
        </div>
        {compareOpen && (
          <Suspense fallback={null}>
            <CompareDialog />
          </Suspense>
        )}
      </TipProvider>
    </MotionConfig>
  )
}
