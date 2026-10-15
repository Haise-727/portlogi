import { PRESETS } from '../data/presets'
import { create } from 'zustand'
import { DEFAULT_WEIGHTS, type Weights } from '../engine/allocator'
import {
  DEFAULT_TIMING,
  type Command,
  type Engine,
  type EngineState,
  type Timing,
} from '../engine/engine'
import { VESSELS, nextCutoff } from '../engine/generator'
import { buildLayout, defaultSpec, type Layout, type LayoutSpec } from '../engine/layout'
import { computePriority, type PriorityResult } from '../engine/priority'
import { ReplayCursor, Session } from '../engine/session'
import type { Container } from '../engine/types'
import type { FeedApi, FeedStatus } from '../lib/scanFeed'

const SEED = 20260908
let toastSeq = 0
/** the running hardware feed, if any; kept out of React state because it is a live connection */
let feedApi: FeedApi | null = null
export function setFeedApi(api: FeedApi | null): void {
  feedApi = api
}

/** Tiny persisted flags. Storage can be blocked (private windows), so every access is guarded. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem('portlogi.' + key) === '1'
  } catch {
    return false
  }
}
function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem('portlogi.' + key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function writeStr(key: string, value: string): void {
  try {
    localStorage.setItem('portlogi.' + key, value)
  } catch {
    // not persisted; the page still works
  }
}
function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem('portlogi.' + key, on ? '1' : '0')
  } catch {
    // not persisted; the page still works
  }
}

export type Tab = 'run' | 'layout' | 'boxes' | 'tuning'

let portSeed = SEED
let session = new Session({ seed: SEED })

/** A stable seed per port id, so each port's illustrative yard is the same every time. */
function hashSeed(id: string): number {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
let cursor: ReplayCursor | null = null

/** The engine whose state is currently on screen. */
function shown(): Engine {
  return cursor ? cursor.engine : session.engine
}

export type ReplayState = { tick: number; playing: boolean }

export type AppState = {
  view: EngineState
  layout: Layout
  /** tick of the live run, for the replay scrubber's range */
  liveTick: number
  running: boolean
  speed: number
  replay: ReplayState | null

  selected: string | null
  hoveredSlot: string | null
  /** the box being relocated: slots become targets while this is set */
  movingId: string | null
  /** boxes ticked for grouping */
  checked: string[]
  showExplored: boolean
  verbose: boolean

  sidebar: boolean
  tab: Tab
  logOpen: boolean
  compareOpen: boolean
  impactOpen: boolean
  businessOpen: boolean
  screen: 'landing' | 'yard'
  portId: string
  goLanding: () => void
  enterYard: () => void
  openPort: (id: string) => void

  weights: Weights
  timing: Timing
  /** a layout waiting for the vehicles to finish before it is applied */
  pendingLayout: LayoutSpec | null
  /** listen to the backend for RFID scans from the ESP32 */
  scannerFeed: boolean
  /** where the hardware feed stands; 'off' when switched off */
  scannerStatus: 'off' | FeedStatus
  /** the signed-in account's email, shown in Settings */
  scannerUser: string | null
  scannerError: string | null
  /** UID of the most recent card, for the status line */
  lastScan: string | null
  /** sim-minutes between the last engine step and now, for smooth vehicle motion */
  frac: number
  /** animate the interface (default) or keep movement to a minimum */
  reduceMotion: boolean
  menuSeen: boolean
  toasts: Toast[]
  theme: ThemeChoice
  textSize: TextSize
}

export type ThemeChoice = 'system' | 'dark' | 'light'
export type TextSize = 'S' | 'M' | 'L'

export type Toast = { id: number; text: string; actionLabel?: string; action?: () => void }

export type AppActions = {
  frame: (dtReal: number) => void
  command: (cmd: Command) => void
  setSpeed: (speed: number) => void
  toggleRunning: () => void
  reset: () => void
  /** Apply a layout now if possible, otherwise stop arrivals and apply it when the vehicles are free. */
  applyLayout: (spec: LayoutSpec) => void
  cancelPendingLayout: () => void
  setReduceMotion: (on: boolean) => void
  setTheme: (t: ThemeChoice) => void
  setTextSize: (s: TextSize) => void
  showToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  setScannerFeed: (on: boolean) => void
  setScannerStatus: (status: 'off' | FeedStatus, detail?: string) => void
  setScannerUser: (email: string | null) => void
  signInScanner: (email: string, password: string) => Promise<void>
  signOutScanner: () => Promise<void>
  /** A card was read at the gate: admit its container. */
  cardScanned: (uid: string) => void

  select: (id: string | null) => void
  hoverSlot: (slot: string | null) => void
  startMove: (id: string | null) => void
  toggleChecked: (id: string) => void
  clearChecked: () => void
  toggleExplored: () => void
  toggleVerbose: () => void

  openSidebar: (tab?: Tab) => void
  closeSidebar: () => void
  setLogOpen: (open: boolean) => void
  setCompareOpen: (open: boolean) => void
  setImpactOpen: (open: boolean) => void
  setBusinessOpen: (open: boolean) => void

  replayAt: (tick: number) => void
  scrub: (tick: number) => void
  toggleReplayPlay: () => void
  exitReplay: () => void
  /** Escape: close whatever is on top, one layer at a time. */
  dismiss: () => void
}

function publish(): Pick<AppState, 'view' | 'layout' | 'liveTick'> {
  const e = shown()
  return { view: e.view(), layout: e.layout, liveTick: session.tick }
}

export const useYard = create<AppState & AppActions>((set, get) => ({
  ...publish(),
  running: false,
  speed: 1,
  replay: null,
  selected: null,
  hoveredSlot: null,
  movingId: null,
  checked: [],
  showExplored: false,
  verbose: false,
  sidebar: false,
  tab: 'run',
  logOpen: false,
  compareOpen: false,
  impactOpen: false,
  businessOpen: false,
  screen: 'landing',
  portId: 'voc',
  weights: { ...DEFAULT_WEIGHTS },
  timing: { ...DEFAULT_TIMING },
  pendingLayout: null,
  scannerFeed: false,
  scannerStatus: 'off',
  scannerUser: null,
  scannerError: null,
  lastScan: null,
  frac: 0,
  reduceMotion: readFlag('reduce-motion'),
  menuSeen: readFlag('menu-seen'),
  toasts: [],
  theme: readChoice('theme', ['system', 'dark', 'light'], 'system'),
  textSize: readChoice('text', ['S', 'M', 'L'], 'M'),

  frame(dt) {
    const st = get()
    if (cursor) {
      if (!st.replay?.playing) return
      cursor.advance(dt * st.speed)
      const playing = !cursor.atLive
      set({ ...publish(), replay: { tick: cursor.tick, playing } })
      return
    }
    if (!st.running) return
    const steps = session.advance(dt * st.speed)
    // the leftover is published every frame so vehicles glide between steps
    set(steps > 0 ? { ...publish(), frac: session.leftover } : { frac: session.leftover })
    if (steps > 0) {
      const want = get().pendingLayout
      if (want && session.engine.layoutBlocker(want)?.kind !== 'busy') {
        set({ pendingLayout: null })
        get().command({ t: 'layout', spec: want })
      }
    }
  },

  command(cmd) {
    if (cursor) return // the past is read-only
    session.command(cmd)
    const e = session.engine
    set({ ...publish(), weights: { ...e.weights }, timing: { ...e.timing } })
  },

  applyLayout(spec) {
    if (cursor) return
    const blocker = session.engine.layoutBlocker(spec)
    if (blocker?.kind === 'busy') {
      // stop feeding the yard so the vehicles can finish, then apply on its own
      if (session.engine.s.auto) get().command({ t: 'auto', on: false })
      set({ pendingLayout: spec })
      return
    }
    set({ pendingLayout: null })
    get().command({ t: 'layout', spec })
  },

  cancelPendingLayout() {
    set({ pendingLayout: null })
  },

  setTheme(theme) {
    writeStr('theme', theme)
    set({ theme })
  },
  setTextSize(textSize) {
    writeStr('text', textSize)
    set({ textSize })
  },
  setReduceMotion(on) {
    writeFlag('reduce-motion', on)
    set({ reduceMotion: on })
  },
  showToast(t) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => get().dismissToast(id), 9000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  setScannerFeed(on) {
    set({ scannerFeed: on, scannerStatus: on ? 'connecting' : 'off', scannerError: null, ...(on ? {} : { scannerUser: null }) })
  },
  setScannerStatus(status, detail) {
    set({ scannerStatus: status, scannerError: status === 'error' ? (detail ?? 'The feed stopped.') : null })
  },
  setScannerUser(email) {
    set({ scannerUser: email })
  },
  async signInScanner(email, password) {
    if (!feedApi) throw new Error('The feed is not running.')
    await feedApi.signIn(email, password)
  },
  async signOutScanner() {
    await feedApi?.signOut()
  },
  cardScanned(uid) {
    set({ lastScan: uid })
    if (!cursor) get().command({ t: 'admit', tagUid: uid })
  },

  setSpeed(speed) {
    set({ speed })
  },

  toggleRunning() {
    set((s) => ({ running: !s.running }))
  },

  reset() {
    const pr = PRESETS[get().portId] ?? PRESETS.voc
    session = new Session({ seed: portSeed, spec: pr.spec, weights: { ...pr.weights }, timing: { ...pr.timing } })
    cursor = null
    set({
      ...publish(),
      replay: null,
      selected: null,
      movingId: null,
      checked: [],
      weights: { ...pr.weights },
      timing: { ...pr.timing },
      running: true,
      pendingLayout: null,
    })
  },

  select(id) {
    set({ selected: id, movingId: null })
  },
  hoverSlot(slot) {
    set({ hoveredSlot: slot })
  },
  startMove(id) {
    set({ movingId: id })
  },
  toggleChecked(id) {
    set((s) => ({ checked: s.checked.includes(id) ? s.checked.filter((x) => x !== id) : [...s.checked, id] }))
  },
  clearChecked() {
    set({ checked: [] })
  },
  toggleExplored() {
    set((s) => ({ showExplored: !s.showExplored }))
  },
  toggleVerbose() {
    set((s) => ({ verbose: !s.verbose }))
  },

  openSidebar(tab) {
    writeFlag('menu-seen', true)
    set((s) => ({ sidebar: true, tab: tab ?? s.tab, menuSeen: true }))
  },
  closeSidebar() {
    set({ sidebar: false })
  },
  setLogOpen(open) {
    set({ logOpen: open })
  },
  setCompareOpen(open) {
    set({ compareOpen: open })
  },
  setImpactOpen(open) {
    set({ impactOpen: open })
  },
  setBusinessOpen(open) {
    set({ businessOpen: open })
  },
  goLanding() {
    set({ screen: 'landing', running: false })
  },
  enterYard() {
    set({ screen: 'yard', running: true })
  },
  openPort(id) {
    portSeed = id === 'voc' ? SEED : hashSeed(id)
    set({ portId: id, screen: 'yard' })
    get().reset()
  },

  replayAt(tick) {
    cursor = session.replayTo(tick)
    set({ ...publish(), replay: { tick: cursor.tick, playing: false }, movingId: null })
  },
  scrub(tick) {
    cursor = session.replayTo(tick)
    set({ ...publish(), replay: { tick: cursor.tick, playing: get().replay?.playing ?? false } })
  },
  toggleReplayPlay() {
    const r = get().replay
    if (!r) return
    if (cursor?.atLive) return
    set({ replay: { ...r, playing: !r.playing } })
  },
  exitReplay() {
    cursor = null
    set({ ...publish(), replay: null })
  },

  dismiss() {
    const s = get()
    if (s.movingId) return set({ movingId: null })
    if (s.view.pendingPlan) return get().command({ t: 'cancel' })
    if (s.logOpen) return set({ logOpen: false })
    if (s.sidebar) return set({ sidebar: false })
    if (s.selected) return set({ selected: null })
    if (s.checked.length) return set({ checked: [] })
    if (s.replay) get().exitReplay()
  },
}))

/* ------------------------------------------------------------------ *
 * Helpers the views share
 * ------------------------------------------------------------------ */

export function priorityAt(c: Container, now: number): PriorityResult {
  const vessel = VESSELS.find((v) => v.name === c.vessel)
  return computePriority(c, now, vessel ? nextCutoff(vessel, now) : undefined)
}

/** Why `slot` is not a legal home for the box, or null if it is. */
export function legalityFor(id: string, slot: string): string | null {
  const c = shown().s.containers[id]
  return c ? shown().legalityAt(c, slot) : 'Unknown box.'
}

/** Key that changes only when the set of boxes a vehicle is working changes. */
export function assignedKey(s: EngineState): string {
  const ids: string[] = []
  for (const a of s.agvs) {
    if (a.carrying) ids.push(a.carrying)
    for (const l of a.legs) if (l.kind !== 'move') ids.push(l.containerId)
  }
  return ids.join(',')
}

export const DEFAULT_LAYOUT = buildLayout(defaultSpec())
