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
const ImpactDialog = lazy(() => import('./components/chrome/ImpactDialog'))
const BusinessDesk = lazy(() => import('./components/chrome/BusinessDesk'))
const Landing = lazy(() => import('./components/Landing'))

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
  const impactOpen = useYard((s) => s.impactOpen)
  const businessOpen = useYard((s) => s.businessOpen)
  const screen = useYard((s) => s.screen)
  const select = useYard((s) => s.select)
  const reduce = useYard((s) => s.reduceMotion)
  const theme = useYard((s) => s.theme)
  const textSize = useYard((s) => s.textSize)
  const stage = useRef<HTMLElement>(null)

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduce)
  }, [reduce])

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const light = theme === 'light' || (theme === 'system' && mq.matches)
      root.dataset.theme = light ? 'light' : 'dark'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f2f4f6' : '#080b0d')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.text = textSize
  }, [textSize])

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
        {screen === 'landing' ? (
          <Suspense fallback={<div className="h-full bg-void" />}>
            <Landing />
          </Suspense>
        ) : (
          <div className="grid h-full grid-rows-[36px_minmax(0,1fr)] bg-void">
            <TopBar />
            <main className="flex min-h-0 overflow-hidden">
              <section ref={stage} className="relative min-w-0 flex-1 overflow-hidden" onClick={(e) => e.target === e.currentTarget && select(null)}>
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
        )}
        {compareOpen && (
          <Suspense fallback={null}>
            <CompareDialog />
          </Suspense>
        )}
        {impactOpen && (
          <Suspense fallback={null}>
            <ImpactDialog />
          </Suspense>
        )}
        {businessOpen && (
          <Suspense fallback={null}>
            <BusinessDesk />
          </Suspense>
        )}
      </TipProvider>
    </MotionConfig>
  )
}
