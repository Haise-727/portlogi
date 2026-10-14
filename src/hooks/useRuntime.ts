import { useEffect } from 'react'
import { startFeed, type FeedApi } from '../lib/scanFeed'
import { setFeedApi, useYard } from '../store/app'

/** The simulation clock: one requestAnimationFrame loop, paused with the tab. */
export function useClock(): void {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      // a backgrounded tab must not teleport the vehicles
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      useYard.getState().frame(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

/** Presenter keys. Standing in front of examiners is not the moment to hunt for a button. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useYard.getState()
      switch (e.key.toLowerCase()) {
        case 's':
          if (!s.replay) s.command({ t: 'admit' })
          break
        case 'a':
          if (!s.replay) s.command({ t: 'auto', on: !s.view.auto })
          break
        case 'c':
          s.setCompareOpen(true)
          break
        case 'i':
          s.setImpactOpen(true)
          break
        case 'm':
          if (s.sidebar) s.closeSidebar()
          else s.openSidebar()
          break
        case 'l':
          s.setLogOpen(!s.logOpen)
          break
        case ' ':
          e.preventDefault()
          s.toggleRunning()
          break
        case 'escape':
          s.dismiss()
          break
        case '1':
          s.setSpeed(0.5)
          break
        case '2':
          s.setSpeed(1)
          break
        case '3':
          s.setSpeed(2)
          break
        case '4':
          s.setSpeed(4)
          break
        case '5':
          s.setSpeed(8)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Hardware feed. When switched on, load the Firebase SDK (only then) and listen for RFID reads that the
 * ESP32 writes to the database; each one admits that card's container at the gate. Off by default, so a
 * standalone demo makes no network calls at all.
 */
export function useScannerFeed(): void {
  const on = useYard((s) => s.scannerFeed)
  useEffect(() => {
    if (!on) return
    let cancelled = false
    let api: FeedApi | null = null
    const store = useYard.getState()
    startFeed({
      onScan: (uid) => useYard.getState().cardScanned(uid),
      onStatus: (status, detail) => useYard.getState().setScannerStatus(status, detail),
      onUser: (email) => useYard.getState().setScannerUser(email),
    })
      .then((feed) => {
        if (cancelled) return feed.stop()
        api = feed
        setFeedApi(feed)
      })
      .catch((e: Error) => store.setScannerStatus('error', e.message))
    return () => {
      cancelled = true
      api?.stop()
      setFeedApi(null)
    }
  }, [on])
}
