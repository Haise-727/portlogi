import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { shortId } from '../../engine/generator'
import { isPowered } from '../../engine/layout'
import type { Container, PriorityBand } from '../../engine/types'
import { GeoContext, useGeo, useMakeGeo } from '../../lib/geo'
import { legalityFor, priorityAt, useYard } from '../../store/app'
import { BAND_COLOR } from '../theme'
import { AgvLayer } from './AgvLayer'
import { PlanOverlay, RouteOverlay } from './Overlays'
import { SlotCell } from './SlotCell'
import { Terminals } from './Terminals'

/** How long the candidate scores stay on screen after the allocator runs. */
const FLASH_MS = 900

export function YardView() {
  const layout = useYard((s) => s.layout)
  const geo = useMakeGeo(layout)
  return (
    <GeoContext.Provider value={geo}>
      <YardInner />
    </GeoContext.Provider>
  )
}

function YardInner() {
  const geo = useGeo()
  const layout = useYard((s) => s.layout)
  const stacks = useYard((s) => s.view.stacks)
  const containers = useYard((s) => s.view.containers)
  const queues = useYard((s) => s.view.gateQueues)
  const allocation = useYard((s) => s.view.lastAllocation)
  const seq = useYard((s) => s.view.allocationSeq)
  const plan = useYard((s) => s.view.pendingPlan)
  const chainKey = useYard((s) => s.view.rehandleChain.join(','))
  const selected = useYard((s) => s.selected)
  const checked = useYard((s) => s.checked)
  const hoveredSlot = useYard((s) => s.hoveredSlot)
  const movingId = useYard((s) => s.movingId)
  const select = useYard((s) => s.select)
  const toggleChecked = useYard((s) => s.toggleChecked)
  const hoverSlot = useYard((s) => s.hoverSlot)
  const command = useYard((s) => s.command)
  const startMove = useYard((s) => s.startMove)
  // bands shift slowly; re-deriving them every frame would re-render the grid at 60fps for nothing
  const nowBucket = useYard((s) => Math.floor(s.view.now))

  const [flash, setFlash] = useState(false)
  const lastSeq = useRef(seq)
  useEffect(() => {
    if (seq === lastSeq.current) return
    lastSeq.current = seq
    setFlash(true)
    const t = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(t)
  }, [seq])

  const bandOf = (c: Container): PriorityBand => priorityAt(c, nowBucket).band
  const chain = useMemo(() => new Set(chainKey ? chainKey.split(',') : []), [chainKey])
  const candidateScores = new Map<string, number>()
  if (flash && allocation) for (const c of allocation.candidates) candidateScores.set(c.slot, c.score)

  const moving = movingId ? containers[movingId] : null

  return (
    <div className="grid h-full min-h-0 place-items-center p-3" style={{ containerType: 'size' }}>
      <div
        className="relative"
        style={{
          width: `min(100%, calc(100cqh * ${geo.W} / ${geo.H}))`,
          aspectRatio: `${geo.W} / ${geo.H}`,
        }}
      >
        <Floor />
        <Terminals layout={layout} queues={queues} containers={containers} stacks={stacks} bandOf={bandOf} />

        {layout.slotIds.map((slot) => {
          const stack = (stacks[slot] ?? []).map((id) => containers[id]).filter(Boolean)
          const disabled = layout.disabled.has(slot)
          const why = moving && !disabled ? (slot === moving.slot ? 'It is already here.' : legalityFor(moving.id, slot)) : null
          return (
            <div key={slot} className="absolute" style={geo.rectStyle(geo.slotRect(slot))}>
              <SlotCell
                slot={slot}
                tiers={layout.tiers}
                powered={isPowered(layout, slot)}
                disabled={disabled}
                stack={stack}
                bands={stack.map(bandOf)}
                overdues={stack.map((c) => priorityAt(c, nowBucket).overdue)}
                selected={selected}
                checked={checked}
                chosen={flash && allocation?.best?.slot === slot}
                candidateScore={candidateScores.get(slot) ?? null}
                rejected={moving ? why : flash ? (allocation?.rejectionBySlot[slot]?.reason ?? null) : null}
                target={!!moving && !disabled && why === null}
                chain={chain}
                hovered={hoveredSlot === slot}
                onHover={hoverSlot}
                onSelect={(id, additive) => (additive ? toggleChecked(id) : select(id))}
                onPick={(target) => {
                  if (!moving) return
                  command({ t: 'move', id: moving.id, slot: target })
                  startMove(null)
                }}
              />
            </div>
          )
        })}

        <PlanOverlay plan={plan} />
        <RouteStage />
        <AgvStage bandOf={bandOf} />

        <AnimatePresence>
          {hoveredSlot && layout.slotIds.includes(hoveredSlot) && (
            <SlotCard
              slot={hoveredSlot}
              stack={(stacks[hoveredSlot] ?? []).map((id) => containers[id]).filter(Boolean)}
              bandOf={bandOf}
              rejection={moving ? legalityFor(moving.id, hoveredSlot) : flash ? (allocation?.rejectionBySlot[hoveredSlot]?.reason ?? null) : null}
              now={nowBucket}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Vehicles move every frame, so they subscribe on their own and the grid does not. */
function AgvStage({ bandOf }: { bandOf: (c: Container) => PriorityBand }) {
  const agvs = useYard((s) => s.view.agvs)
  const containers = useYard((s) => s.view.containers)
  const frac = useYard((s) => s.frac)
  const still = useYard((s) => s.reduceMotion)
  return <AgvLayer agvs={agvs} containers={containers} bandOf={bandOf} frac={frac} still={still} />
}

function RouteStage() {
  const agvs = useYard((s) => s.view.agvs)
  const route = useYard((s) => s.view.route)
  const showExplored = useYard((s) => s.showExplored)
  return <RouteOverlay agvs={agvs} route={route} showExplored={showExplored} />
}

/** The aisle network the vehicles run in, drawn as paved lanes so the movement grid reads before anything moves. */
function Floor() {
  const geo = useGeo()
  const L = useYard((s) => s.layout)
  const LANE = 17
  const left = geo.cellCenter({ x: 0, y: 0 }).x
  const right = geo.cellCenter({ x: L.gridW - 1, y: 0 }).x
  const top = geo.cellCenter({ x: 0, y: 0 }).y
  const bottom = geo.cellCenter({ x: 0, y: L.gridH - 1 }).y

  const strips: { x: number; y: number; w: number; h: number }[] = []
  const dashes: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let y = 0; y < L.gridH; y += 2) {
    const cy = geo.cellCenter({ x: 0, y }).y
    strips.push({ x: left, y: cy - LANE / 2, w: right - left, h: LANE })
    dashes.push({ x1: left, y1: cy, x2: right, y2: cy })
  }
  for (const x of [0, L.gridW - 1]) {
    const cx = geo.cellCenter({ x, y: 0 }).x
    strips.push({ x: cx - LANE / 2, y: top, w: LANE, h: bottom - top })
    dashes.push({ x1: cx, y1: top, x2: cx, y2: bottom })
  }

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden>
      <rect x={0} y={0} width={geo.W} height={geo.H} fill="var(--color-panel)" />
      {strips.map((r, i) => (
        <rect key={`s${i}`} {...r} fill="var(--color-void)" opacity={0.75} />
      ))}
      {dashes.map((l, i) => (
        <line key={`d${i}`} {...l} stroke="var(--color-line-hi)" strokeWidth={0.7} strokeDasharray="3 7" />
      ))}
    </svg>
  )
}

/** Hover card: what is in the stack, bottom to top, or why the slot is illegal. */
function SlotCard({
  slot,
  stack,
  bandOf,
  rejection,
  now,
}: {
  slot: string
  stack: Container[]
  bandOf: (c: Container) => PriorityBand
  rejection: string | null
  now: number
}) {
  const geo = useGeo()
  const layout = useYard((s) => s.layout)
  const r = geo.slotRect(slot)
  const onRight = r.x / geo.W > 0.5
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="pointer-events-none absolute z-40 w-[168px] border border-line-hi bg-void p-2"
      style={{
        top: `${(r.y / geo.H) * 100}%`,
        ...(onRight
          ? { right: `${100 - (r.x / geo.W) * 100}%`, marginRight: 6 }
          : { left: `${((r.x + r.w) / geo.W) * 100}%`, marginLeft: 6 }),
        borderRadius: 2,
      }}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="token text-[10px] text-ink">{slot}</span>
        <span className="font-mono text-[9px] text-ink-3">
          {layout.disabled.has(slot) ? 'OUT OF SERVICE' : `${isPowered(layout, slot) ? 'POWERED' : 'DRY'} · ${stack.length}/${layout.tiers}`}
        </span>
      </div>
      {rejection ? (
        <p className="text-[10px] leading-snug" style={{ color: 'var(--color-critical)' }}>
          {rejection}
        </p>
      ) : stack.length === 0 ? (
        <p className="text-[10px] leading-snug text-ink-3">Empty. Ground tier available.</p>
      ) : (
        <ul className="flex flex-col-reverse gap-1">
          {stack.map((c, tier) => (
            <li key={c.id} className="flex items-center gap-[5px]">
              <span className="h-[10px] w-[2px] shrink-0" style={{ background: BAND_COLOR[bandOf(c)] }} />
              <span className="font-mono text-[9px] text-ink-2">T{tier + 1}</span>
              <span className="truncate font-mono text-[9px] text-ink">{shortId(c.id)}</span>
              <span className="ml-auto font-mono text-[9px] text-ink-3">{Math.max(0, Math.round(c.etd - now))}m</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
