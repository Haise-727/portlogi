import { motion } from 'motion/react'
import { Layers } from 'lucide-react'
import { shortId } from '../../lib/generator'
import { useYard } from '../../store/yardStore'

/**
 * A buried box is not retrieved silently. The chain of moves is costed and put
 * in front of the operator first, because that cost is the thing the whole
 * project is arguing about.
 */
export function RehandlePlan() {
  const plan = useYard((s) => s.pendingPlan)
  const containers = useYard((s) => s.containers)
  const confirm = useYard((s) => s.confirmRetrieve)
  const cancel = useYard((s) => s.cancelRetrieve)

  if (!plan) return null
  const target = containers[plan.containerId]
  if (!target) return null

  const steps: string[] = []
  for (const b of plan.blockers) {
    steps.push(`Lift ${shortId(containers[b.id]?.id ?? b.id)} off ${b.from}`)
    steps.push(`Set it down at ${b.to}`)
  }
  steps.push(`Lift ${shortId(target.id)} and run it to the quay`)
  for (const b of [...plan.blockers].reverse()) {
    steps.push(`Return ${shortId(containers[b.id]?.id ?? b.id)} to ${b.from}`)
  }

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="overflow-hidden border-t"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-critical) 45%, transparent)',
        background: 'color-mix(in srgb, var(--color-critical) 7%, var(--color-panel))',
      }}
    >
      <div className="flex items-center gap-[6px] px-2 py-[5px]">
        <Layers size={12} strokeWidth={2} style={{ color: 'var(--color-critical)' }} />
        <h2 className="text-[11px] font-medium" style={{ color: 'var(--color-critical)' }}>
          Dig-out required
        </h2>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-2">
          +{plan.extraMoves} moves
        </span>
      </div>

      <p className="px-2 pb-[5px] text-[10px] leading-snug text-ink-2">
        {shortId(target.id)} is at tier {target.tier} of {plan.slot}, under {plan.blockers.length}{' '}
        box{plan.blockers.length === 1 ? '' : 'es'}.{' '}
        {plan.wasted
          ? 'Everything on top of it leaves later, so every move below is wasted work — this is the stack the allocator exists to avoid.'
          : 'The boxes on top are due out sooner, so the stack was built correctly; this dig-out is the price of calling this box forward early.'}
      </p>

      <ol className="mx-2 mb-2 border-l border-line pl-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-[6px] py-[2px]">
            <span className="font-mono text-[9px] leading-[13px] text-ink-3">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-[10px] leading-[13px] text-ink-2">{step}</span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={confirm}
          className="h-[26px] border text-[11px] transition-colors active:translate-y-px"
          style={{
            background: 'color-mix(in srgb, var(--color-critical) 18%, var(--color-raise))',
            borderColor: 'color-mix(in srgb, var(--color-critical) 55%, transparent)',
            color: 'var(--color-ink)',
            borderRadius: 2,
          }}
        >
          Execute dig-out
        </button>
        <button
          type="button"
          onClick={cancel}
          className="h-[26px] border border-line bg-raise text-[11px] text-ink-2 transition-colors hover:border-line-hi hover:text-ink active:translate-y-px"
          style={{ borderRadius: 2 }}
        >
          Leave it
        </button>
      </div>
    </motion.section>
  )
}
