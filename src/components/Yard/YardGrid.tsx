import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { YARD_H, YARD_W, cellCenter, slotRect } from '../../lib/geometry'
import { shortId } from '../../lib/generator'
import type { Container, PriorityBand } from '../../lib/types'
import {
  BUFFER_SLOTS,
  GATE_CELL,
  GRID_H,
  GRID_W,
  QUAY_CELL,
  SLOT_IDS,
  isPoweredSlot,
  slotToCell,
} from '../../lib/yardConfig'
import { priorityWith, useYard } from '../../store/yardStore'
import { BAND_COLOR } from '../ui'
import { AgvLayer } from './AgvLayer'
import { PlanOverlay } from './PlanOverlay'
import { RouteOverlay } from './RouteOverlay'
import { Slot } from './Slot'

/** How long the candidate scores stay on screen after the allocator runs. */
const FLASH_MS = 900

export function YardGrid() {
  const stacks = useYard((s) => s.stacks)
  const containers = useYard((s) => s.containers)
  const gateQueue = useYard((s) => s.gateQueue)
  const selected = useYard((s) => s.selected)
  const hoveredSlot = useYard((s) => s.hoveredSlot)
  const allocation = useYard((s) => s.lastAllocation)
  const seq = useYard((s) => s.allocationSeq)
  const vessels = useYard((s) => s.vessels)
  const select = useYard((s) => s.select)
  const hoverSlot = useYard((s) => s.hoverSlot)
  // Bands shift slowly; re-deriving them every frame would re-render the grid
  // at 60fps for no visible change.
  const nowBucket = useYard((s) => Math.floor(s.now))
  const pendingPlan = useYard((s) => s.pendingPlan)
  const chainKey = useYard((s) => s.rehandleChain.join(','))

  const [flash, setFlash] = useState(false)
  const lastSeq = useRef(seq)

  useEffect(() => {
    if (seq === lastSeq.current) return
    lastSeq.current = seq
    setFlash(true)
    const t = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(t)
  }, [seq])

  const priorityOf = (c: Container) => priorityWith(c, nowBucket, vessels)
  const bandOf = (c: Container): PriorityBand => priorityOf(c).band

  const chain = new Set(chainKey ? chainKey.split(',') : [])
  const candidateScores = new Map<string, number>()
  if (flash && allocation) {
    for (const c of allocation.candidates) candidateScores.set(c.slot, c.score)
  }

  return (
    <div className="grid h-full min-h-0 place-items-center p-3" style={{ containerType: 'size' }}>
      <div
        className="relative"
        style={{
          width: `min(100%, calc(100cqh * ${YARD_W} / ${YARD_H}))`,
          aspectRatio: `${YARD_W} / ${YARD_H}`,
        }}
      >
        <AisleMarkings />
        <GateApron queue={gateQueue.map((id) => containers[id]).filter(Boolean)} bandOf={bandOf} />
        <QuayApron />
        <TransferPads stacks={stacks} containers={containers} />

        {SLOT_IDS.map((slot) => {
          const r = slotRect(slot)
          const stack = stacks[slot].map((id) => containers[id]).filter(Boolean)
          return (
            <div
              key={slot}
              className="absolute"
              style={{
                left: `${(r.x / YARD_W) * 100}%`,
                top: `${(r.y / YARD_H) * 100}%`,
                width: `${(r.w / YARD_W) * 100}%`,
                height: `${(r.h / YARD_H) * 100}%`,
              }}
            >
              <Slot
                slot={slot}
                stack={stack}
                bands={stack.map(bandOf)}
                overdues={stack.map((c) => priorityOf(c).overdue)}
                selected={selected}
                chosen={flash && allocation?.best?.slot === slot}
                candidateScore={candidateScores.get(slot) ?? null}
                rejected={flash ? (allocation?.rejectionBySlot[slot]?.reason ?? null) : null}
                chain={chain}
                hovered={hoveredSlot === slot}
                onHover={hoverSlot}
                onSelect={select}
              />
            </div>
          )
        })}

        <PlanOverlay plan={pendingPlan} />
        <RouteStage />
        <AgvStage bandOf={bandOf} />

        <AnimatePresence>
          {hoveredSlot && (
            <SlotCard
              slot={hoveredSlot}
              stack={stacks[hoveredSlot].map((id) => containers[id]).filter(Boolean)}
              bandOf={bandOf}
              rejection={flash ? (allocation?.rejectionBySlot[hoveredSlot]?.reason ?? null) : null}
              now={nowBucket}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Agvs move every frame, so they subscribe on their own and the grid does not. */
function AgvStage({ bandOf }: { bandOf: (c: Container) => PriorityBand }) {
  const agvs = useYard((s) => s.agvs)
  const containers = useYard((s) => s.containers)
  return <AgvLayer agvs={agvs} containers={containers} bandOf={bandOf} />
}

/**
 * The route is drawn while a box is actually travelling it. Once the AGV has
 * set the box down the line comes off the yard, though the inspector keeps its
 * cost, turns and expanded-node count.
 */
function RouteStage() {
  const route = useYard((s) => s.route)
  const showExplored = useYard((s) => s.showExplored)
  const live = useYard((s) =>
    s.agvs.some((c) => c.id === s.route?.agvId && c.carrying !== null),
  )
  return <RouteOverlay route={live ? route : null} showExplored={showExplored} />
}

/** The aisle network the AGVs run in, drawn as paved lanes so the movement
 *  grid is legible before anything starts moving. */
function AisleMarkings() {
  const LANE = 17
  const strips: { x: number; y: number; w: number; h: number }[] = []
  const dashes: { x1: number; y1: number; x2: number; y2: number }[] = []

  const left = cellCenter({ x: 0, y: 0 }).x
  const right = cellCenter({ x: GRID_W - 1, y: 0 }).x
  const top = cellCenter({ x: 0, y: 0 }).y
  const bottom = cellCenter({ x: 0, y: GRID_H - 1 }).y

  for (let y = 0; y < GRID_H; y += 2) {
    const cy = cellCenter({ x: 0, y }).y
    strips.push({ x: left, y: cy - LANE / 2, w: right - left, h: LANE })
    dashes.push({ x1: left, y1: cy, x2: right, y2: cy })
  }
  for (const x of [0, GRID_W - 1]) {
    const cx = cellCenter({ x, y: 0 }).x
    strips.push({ x: cx - LANE / 2, y: top, w: LANE, h: bottom - top })
    dashes.push({ x1: cx, y1: top, x2: cx, y2: bottom })
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${YARD_W} ${YARD_H}`}
      aria-hidden
    >
      <rect x={0} y={0} width={YARD_W} height={YARD_H} fill="var(--color-panel)" />
      {strips.map((r, i) => (
        <rect key={`s${i}`} {...r} fill="var(--color-void)" opacity={0.75} />
      ))}
      {dashes.map((l, i) => (
        <line key={`d${i}`} {...l} stroke="var(--color-line-hi)" strokeWidth={0.7} strokeDasharray="3 7" />
      ))}
    </svg>
  )
}

function GateApron({
  queue,
  bandOf,
}: {
  queue: Container[]
  bandOf: (c: Container) => PriorityBand
}) {
  const g = cellCenter(GATE_CELL)
  return (
    <>
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[6px]"
        style={{ left: `${(g.x / YARD_W) * 100}%`, top: `${(g.y / YARD_H) * 100}%` }}
      >
        <span className="token whitespace-nowrap text-[9px] leading-none text-ink-2">GATE</span>
        <span className="h-[7px] w-[7px] rotate-45 border-b border-r border-ink-2" />
      </div>

      <div
        className="absolute flex -translate-y-1/2 flex-row-reverse items-center gap-[3px]"
        style={{ right: `${100 - (g.x / YARD_W) * 100 + 4.5}%`, top: `${(g.y / YARD_H) * 100}%` }}
      >
        <AnimatePresence mode="popLayout">
          {queue.slice(0, 5).map((c) => (
            <motion.span
              key={c.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="whitespace-nowrap border px-[3px] py-[2px] font-mono text-[8px] leading-none"
              style={{
                borderColor: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 60%, transparent)`,
                background: `color-mix(in srgb, ${BAND_COLOR[bandOf(c)]} 14%, var(--color-void))`,
                color: 'var(--color-ink-2)',
                borderRadius: 2,
              }}
            >
              {shortId(c.id)}
            </motion.span>
          ))}
        </AnimatePresence>
        {queue.length > 5 && (
          <span className="font-mono text-[8px] text-ink-3">+{queue.length - 5}</span>
        )}
      </div>
    </>
  )
}

/**
 * The two set-down pads on the quay apron. They are the reason a dig-out can
 * never be impossible, so they are drawn rather than left implicit.
 */
function TransferPads({
  stacks,
  containers,
}: {
  stacks: Record<string, string[]>
  containers: Record<string, Container>
}) {
  return (
    <>
      {BUFFER_SLOTS.map((pad) => {
        const c = containers[stacks[pad]?.[0] ?? '']
        const p = cellCenter(slotToCell(pad))
        return (
          <div
            key={pad}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[5px] border px-[5px] py-[3px]"
            style={{
              left: `${(p.x / YARD_W) * 100}%`,
              top: `${(p.y / YARD_H) * 100}%`,
              borderColor: c ? 'var(--color-high)' : 'var(--color-line)',
              background: 'var(--color-void)',
              borderStyle: c ? 'solid' : 'dashed',
              borderRadius: 2,
            }}
            title={
              c
                ? `Transfer pad ${pad} — ${c.id} set down while another box is dug out`
                : `Transfer pad ${pad} — free`
            }
          >
            <span className="token text-[8px] leading-none text-ink-3">{pad}</span>
            {c ? (
              <span className="font-mono text-[8px] leading-none" style={{ color: 'var(--color-high)' }}>
                {shortId(c.id)}
              </span>
            ) : (
              <span className="text-[8px] leading-none text-ink-3">transfer pad</span>
            )}
          </div>
        )
      })}
    </>
  )
}

function QuayApron() {
  const q = cellCenter(QUAY_CELL)
  return (
    <>
      <div
        className="absolute bottom-[2px] left-[8%] right-[8%] border-b border-dashed"
        style={{ borderColor: 'var(--color-line-hi)' }}
      />
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[6px]"
        style={{ left: `${(q.x / YARD_W) * 100}%`, top: `${(q.y / YARD_H) * 100}%` }}
      >
        <span className="h-[7px] w-[7px] rotate-45 border-b border-r border-ink-2" />
        <span className="token whitespace-nowrap text-[9px] leading-none text-ink-2">
          QUAY · BERTH 3
        </span>
      </div>
    </>
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
  const r = slotRect(slot)
  const onRight = r.x / YARD_W > 0.5
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="pointer-events-none absolute z-30 w-[168px] border border-line-hi bg-void p-2"
      style={{
        top: `${(r.y / YARD_H) * 100}%`,
        ...(onRight
          ? { right: `${100 - (r.x / YARD_W) * 100}%`, marginRight: 6 }
          : { left: `${((r.x + r.w) / YARD_W) * 100}%`, marginLeft: 6 }),
        borderRadius: 2,
      }}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="token text-[10px] text-ink">{slot}</span>
        <span className="font-mono text-[9px] text-ink-3">
          {isPoweredSlot(slot) ? 'POWERED' : 'DRY'} · {stack.length}/2
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
              <span
                className="h-[10px] w-[2px] shrink-0"
                style={{ background: BAND_COLOR[bandOf(c)] }}
              />
              <span className="font-mono text-[9px] text-ink-2">T{tier}</span>
              <span className="truncate font-mono text-[9px] text-ink">{shortId(c.id)}</span>
              <span className="ml-auto font-mono text-[9px] text-ink-3">
                {Math.max(0, Math.round(c.etd - now))}m
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
