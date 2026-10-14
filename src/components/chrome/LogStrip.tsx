import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, ChevronsUpDown, Pause, Play, SkipBack, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { formatClock, formatShort } from '../../lib/time'
import { TICK } from '../../engine/engine'
import { useYard } from '../../store/app'
import { SEVERITY_COLOR } from '../theme'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { Slider } from '../ui/controls'

/**
 * Three quiet lines in the corner. Everything else about the past is behind a
 * click: open the log, click any line, and the yard rewinds to that moment.
 */
export function LogStrip() {
  const events = useYard((s) => s.view.events)
  const replay = useYard((s) => s.replay !== null)
  const setLogOpen = useYard((s) => s.setLogOpen)
  if (replay) return <ReplayBar />
  const recent = events.filter((e) => !e.verbose).slice(0, 3)

  return (
    <button
      type="button"
      onClick={() => setLogOpen(true)}
      className="group absolute bottom-3 left-3 z-30 w-[min(430px,calc(100%-24px))] border border-line bg-panel/90 text-left backdrop-blur-[2px] transition-colors hover:border-line-hi"
      style={{ borderRadius: 2 }}
      aria-label="Open the activity log"
    >
      <ul>
        {recent.map((e) => (
          <li key={e.id} className="flex gap-[6px] border-b border-line px-2 py-[3px] last:border-b-0">
            <span className="mt-[3px] h-[8px] w-[2px] shrink-0" style={{ background: SEVERITY_COLOR[e.severity] }} />
            <time className="shrink-0 font-mono text-t9 leading-[calc(14px*var(--fs))] tabular-nums text-ink-3">{formatShort(e.at)}</time>
            <span className="min-w-0 flex-1 truncate text-t10 leading-[calc(14px*var(--fs))] text-ink-2">{e.message}</span>
          </li>
        ))}
        {recent.length === 0 && <li className="px-2 py-[5px] text-t10 text-ink-3">Nothing has happened yet.</li>}
      </ul>
      <ChevronsUpDown size={11} className="absolute right-2 top-2 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

/** The full log, as a bottom drawer. Clicking a line rewinds the yard to it. */
export function LogDrawer() {
  const open = useYard((s) => s.logOpen)
  const setLogOpen = useYard((s) => s.setLogOpen)
  const events = useYard((s) => s.view.events)
  const verbose = useYard((s) => s.verbose)
  const toggleVerbose = useYard((s) => s.toggleVerbose)
  const replay = useYard((s) => s.replay)
  const replayAt = useYard((s) => s.replayAt)
  const shown = verbose ? events : events.filter((e) => !e.verbose)

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 36 }}
          className="absolute inset-x-0 bottom-0 z-40 flex h-[44%] flex-col border-t border-line-hi bg-panel"
          aria-label="Activity log"
        >
          <header className="flex items-center gap-3 border-b border-line px-3 py-[5px]">
            <h2 className="text-t11 font-medium text-ink">Activity</h2>
            <span className="text-t10 text-ink-3">Click a line to see the yard as it was.</span>
            <Button size="sm" variant={verbose ? 'active' : 'default'} className="ml-auto" onClick={toggleVerbose}>
              detail
            </Button>
            <button type="button" onClick={() => setLogOpen(false)} className="text-ink-3 transition-colors hover:text-ink" aria-label="Close log">
              <ChevronDown size={14} />
            </button>
          </header>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((e) => {
              const here = replay && Math.abs(e.tick - replay.tick) < 2
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => replayAt(e.tick)}
                    className={cn(
                      'flex w-full gap-[7px] border-b border-line px-3 py-[4px] text-left transition-colors hover:bg-raise',
                      here && 'bg-raise shadow-[inset_2px_0_0_var(--color-high)]',
                    )}
                  >
                    <span className="mt-[3px] h-[9px] w-[2px] shrink-0" style={{ background: SEVERITY_COLOR[e.severity] }} />
                    <time className="shrink-0 font-mono text-t9 leading-[calc(14px*var(--fs))] tabular-nums text-ink-3">{formatClock(e.at)}</time>
                    <span className="min-w-0 flex-1">
                      <span className="text-t10 leading-[calc(14px*var(--fs))] text-ink-2">{e.message}</span>
                      {e.count && e.count > 1 && <span className="ml-[4px] font-mono text-t9 text-ink-3">×{e.count}</span>}
                      {verbose && e.detail && <span className="mt-[2px] block text-t9 leading-[calc(12px*var(--fs))] text-ink-3">{e.detail}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

/** Appears only while replaying: scrub, play on from the chosen moment, or go back to live. */
function ReplayBar() {
  const replay = useYard((s) => s.replay)!
  const liveTick = useYard((s) => s.liveTick)
  const scrub = useYard((s) => s.scrub)
  const toggle = useYard((s) => s.toggleReplayPlay)
  const exit = useYard((s) => s.exitReplay)
  const setLogOpen = useYard((s) => s.setLogOpen)
  const logOpen = useYard((s) => s.logOpen)

  // while dragging, show the thumb where the hand is and rebuild the yard at most ~8x a second
  const [drag, setDrag] = useState<{ v: number; base: number } | null>(null)
  const last = useRef(0)
  const value = drag && drag.base === replay.tick ? drag.v : replay.tick
  const minutes = (t: number) => t * TICK

  return (
    <div
      className="absolute left-1/2 z-50 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 border bg-panel px-3 py-[6px]"
      style={{
        // ride above the log drawer when it is open, so the scrubber is never covered
        bottom: logOpen ? 'calc(44% + 12px)' : 12,
        borderColor: 'color-mix(in srgb, var(--color-high) 55%, transparent)',
        borderRadius: 2,
      }}
    >
      <Button size="icon" variant="ghost" onClick={() => scrub(0)} aria-label="Back to the start">
        <SkipBack size={12} />
      </Button>
      <Button size="icon" variant={replay.playing ? 'active' : 'default'} onClick={toggle} disabled={replay.tick >= liveTick} aria-label={replay.playing ? 'Pause replay' : 'Play replay'}>
        {replay.playing ? <Pause size={12} /> : <Play size={12} />}
      </Button>
      <div className="min-w-0 flex-1">
        <Slider
          label={formatClock(minutes(value))}
          value={value}
          min={0}
          max={Math.max(1, liveTick)}
          step={10}
          format={() => `of ${formatClock(minutes(liveTick))}`}
          onChange={(v) => {
            setDrag({ v, base: replay.tick })
            const t = performance.now()
            if (t - last.current > 120) {
              last.current = t
              scrub(v)
            }
          }}
          onCommit={scrub}
        />
      </div>
      <Button size="sm" onClick={() => setLogOpen(true)}>
        Log
      </Button>
      <Button size="sm" variant="primary" onClick={exit}>
        <X size={11} />
        Back to live
      </Button>
    </div>
  )
}
