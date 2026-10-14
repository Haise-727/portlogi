import { AnimatePresence, motion } from 'motion/react'
import { Layers } from 'lucide-react'
import { shortId } from '../../engine/generator'
import { useYard } from '../../store/app'
import { Button } from '../ui/button'

/**
 * A buried box is not retrieved silently. The chain of moves is costed and put
 * in front of the operator first, because that cost is what the whole project
 * argues about. Only on screen while a decision is waiting.
 */
export function DigOutPrompt() {
  const plan = useYard((s) => s.view.pendingPlan)
  const containers = useYard((s) => s.view.containers)
  const command = useYard((s) => s.command)
  const target = plan ? containers[plan.containerId] : undefined

  return (
    <AnimatePresence>
      {plan && target && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute bottom-3 left-1/2 z-40 w-[min(380px,calc(100%-24px))] -translate-x-1/2 border bg-panel"
          style={{ borderColor: 'color-mix(in srgb, var(--color-critical) 55%, transparent)', borderRadius: 2 }}
          role="alertdialog"
          aria-label="Dig-out required"
        >
          <div className="flex items-center gap-[6px] px-2 py-[6px]">
            <Layers size={12} style={{ color: 'var(--color-critical)' }} />
            <h2 className="text-t11 font-medium" style={{ color: 'var(--color-critical)' }}>
              Dig-out required
            </h2>
            <span className="ml-auto font-mono text-t10 tabular-nums text-ink-2">+{plan.extraMoves} moves</span>
          </div>
          <p className="px-2 pb-2 text-t10 leading-snug text-ink-2">
            {shortId(target.id)} is at tier {(target.tier ?? 0) + 1} of {plan.slot}, under {plan.blockers.length} box{plan.blockers.length === 1 ? '' : 'es'}.{' '}
            {plan.wasted
              ? 'Everything on top leaves later, so every move is wasted work: the stack the allocator exists to avoid.'
              : 'The boxes on top are due out sooner, so the stack was right; this is the price of calling this box forward early.'}
          </p>
          <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            <Button variant="danger" onClick={() => command({ t: 'confirm' })}>
              Execute dig-out
            </Button>
            <Button onClick={() => command({ t: 'cancel' })}>Leave it</Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
