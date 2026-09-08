import { AnimatePresence, motion } from 'motion/react'
import { formatShort } from '../../lib/simulation'
import { useYard } from '../../store/yardStore'
import { SEVERITY_COLOR } from '../ui'

/**
 * Two audiences, one panel. By default it reads as a plain account of what
 * happened, one sentence per event, which is what an examiner needs. Detail
 * mode adds the scores, costs and rules underneath, plus the machine-level
 * traffic chatter that is hidden outright the rest of the time.
 */
export function EventLog() {
  const events = useYard((s) => s.events)
  const verbose = useYard((s) => s.verboseLog)
  const toggleVerbose = useYard((s) => s.toggleVerbose)

  const shown = verbose ? events : events.filter((e) => !e.verbose)

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-y border-line bg-panel px-2 py-[4px]">
        <h2 className="text-[11px] font-medium text-ink-2">Activity</h2>
        <button
          type="button"
          onClick={toggleVerbose}
          aria-pressed={verbose}
          className="flex items-center gap-[5px] border px-[5px] py-[1px] font-mono text-[9px] leading-[13px] transition-colors"
          style={{
            borderColor: verbose ? 'color-mix(in srgb, var(--color-signal) 45%, transparent)' : 'var(--color-line)',
            color: verbose ? 'var(--color-signal)' : 'var(--color-ink-3)',
            background: verbose ? 'color-mix(in srgb, var(--color-signal) 10%, transparent)' : 'transparent',
            borderRadius: 2,
          }}
        >
          <span
            className="h-[5px] w-[5px]"
            style={{ background: verbose ? 'var(--color-signal)' : 'var(--color-ink-3)' }}
          />
          detail
        </button>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {shown.map((e) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="flex gap-[6px] border-b border-line px-2 py-[4px]"
            >
              <span
                aria-hidden
                className="mt-[3px] h-[9px] w-[2px] shrink-0"
                style={{ background: SEVERITY_COLOR[e.severity] }}
              />
              <time className="shrink-0 font-mono text-[9px] leading-[14px] tabular-nums text-ink-3">
                {formatShort(e.at)}
              </time>
              <span className="min-w-0 flex-1">
                <span className="text-[10px] leading-[14px] text-ink-2">{e.message}</span>
                {e.count && e.count > 1 && (
                  <span className="ml-[4px] font-mono text-[9px] text-ink-3">×{e.count}</span>
                )}
                {verbose && e.detail && (
                  <span className="mt-[2px] block text-[9px] leading-[12px] text-ink-3">
                    {e.detail}
                  </span>
                )}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  )
}
