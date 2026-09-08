import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { formatMinutes } from '../../lib/priority'
import { priorityWith, useYard } from '../../store/yardStore'
import { BAND_COLOR, TYPE_ICON, TYPE_LABEL } from '../ui'

export function ContainerDetail() {
  const selectedId = useYard((s) => s.selected)
  const containers = useYard((s) => s.containers)
  const vessels = useYard((s) => s.vessels)
  const nowBucket = useYard((s) => Math.floor(s.now))
  const select = useYard((s) => s.select)
  const retrieve = useYard((s) => s.requestRetrieve)
  const jobs = useYard((s) => s.jobs)

  const c = selectedId ? containers[selectedId] : null
  if (!c) return null

  const p = priorityWith(c, nowBucket, vessels)
  const Icon = TYPE_ICON[c.type]
  const queued = jobs.some((j) => j.containerId === c.id)
  const maxPoints = Math.max(...p.factors.map((f) => f.points), 0.001)

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="overflow-hidden border-b border-line"
      style={{ background: `color-mix(in srgb, ${BAND_COLOR[p.band]} 6%, var(--color-panel))` }}
    >
      <div className="flex items-center gap-2 border-b border-line px-2 py-[5px]">
        <span className="h-[12px] w-[2px]" style={{ background: BAND_COLOR[p.band] }} />
        <span className="font-mono text-[11px] text-ink">{c.id}</span>
        <span
          className="token border px-[4px] py-[1px] text-[8px] leading-none"
          style={{
            color: BAND_COLOR[p.band],
            borderColor: `color-mix(in srgb, ${BAND_COLOR[p.band]} 50%, transparent)`,
            borderRadius: 2,
          }}
        >
          {p.band}
        </span>
        <button
          type="button"
          onClick={() => select(null)}
          className="ml-auto text-ink-3 transition-colors hover:text-ink"
          aria-label="Close container detail"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      <dl className="grid grid-cols-3 border-b border-line">
        <Field label="RFID UID" value={c.tagUid} mono />
        <Field label="Position" value={c.slot ? `${c.slot} · T${c.tier}` : c.status} mono />
        <Field label="Weight" value={`${c.weight} t`} mono />
        <Field label="Destination" value={c.destination} />
        <Field label="Vessel" value={c.vessel} />
        <Field label="ETD" value={formatMinutes(c.etd - nowBucket)} mono />
      </dl>

      <div className="flex items-center gap-[6px] border-b border-line px-2 py-[5px]">
        <Icon size={12} strokeWidth={2} style={{ color: BAND_COLOR[p.band] }} />
        <span className="text-[10px] text-ink-2">{TYPE_LABEL[c.type]}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-2">
          {p.score.toFixed(1)} pts
        </span>
      </div>

      <ul className="px-2 py-[5px]">
        {p.factors.map((f) => (
          <li key={f.key} className="mb-[5px] last:mb-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] text-ink-2">{f.label}</span>
              <span className="font-mono text-[9px] tabular-nums text-ink-3">
                {f.points.toFixed(1)}
              </span>
            </div>
            <div className="mt-[2px] h-[2px] w-full bg-line">
              <div
                className="h-full"
                style={{
                  width: `${(f.points / maxPoints) * 100}%`,
                  background:
                    f.points === maxPoints ? BAND_COLOR[p.band] : 'var(--color-ink-3)',
                }}
              />
            </div>
            <p className="mt-[2px] text-[9px] leading-[12px] text-ink-3">{f.detail}</p>
          </li>
        ))}
      </ul>

      {c.status === 'stored' && (
        <div className="px-2 pb-2">
          <button
            type="button"
            disabled={queued}
            onClick={() => retrieve(c.id)}
            className="h-[24px] w-full border border-line bg-raise text-[10px] text-ink-2 transition-colors hover:border-line-hi hover:text-ink disabled:opacity-45"
            style={{ borderRadius: 2 }}
          >
            {queued ? 'Retrieval queued' : 'Retrieve to quay'}
          </button>
        </div>
      )}
    </motion.section>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-r border-line px-2 py-[4px] last:border-r-0">
      <dt className="font-mono text-[8px] leading-none text-ink-3">{label}</dt>
      <dd
        className={`mt-[3px] truncate text-[10px] leading-none text-ink ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}
