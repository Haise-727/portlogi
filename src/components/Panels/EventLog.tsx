import { AnimatePresence, motion } from 'motion/react'
import { formatShort } from '../../lib/simulation'
import { useYard } from '../../store/yardStore'
import { SEVERITY_COLOR } from '../ui'
import { PanelHeading } from './ControlPanel'

export function EventLog() {
  const events = useYard((s) => s.events)

  return (
    <section className="flex min-h-0 flex-col">
      <PanelHeading title="Event log" note={`${events.length}`} />
      <ol className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {events.map((e) => (
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
              <span className="text-[10px] leading-[14px] text-ink-2">{e.message}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  )
}
