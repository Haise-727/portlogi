import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useYard } from '../../store/app'
import { Button } from '../ui/button'

/** Brief, dismissible notes in the corner of the yard. */
export function Toasts() {
  const toasts = useYard((s) => s.toasts)
  const dismiss = useYard((s) => s.dismissToast)

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-50 flex w-[min(340px,calc(100%-24px))] flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="pointer-events-auto flex w-full items-start gap-3 border border-line-hi bg-panel p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            style={{ borderRadius: 2 }}
            role="status"
          >
            <span className="mt-[3px] h-[10px] w-[2px] shrink-0 bg-signal" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-snug text-ink-2">{t.text}</p>
              {t.actionLabel && (
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2"
                  onClick={() => {
                    t.action?.()
                    dismiss(t.id)
                  }}
                >
                  {t.actionLabel}
                </Button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-ink-3 transition-colors hover:text-ink" aria-label="Dismiss">
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
