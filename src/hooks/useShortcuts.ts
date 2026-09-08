import { useEffect } from 'react'
import { useYard } from '../store/yardStore'

/**
 * Presenter keys. Standing in front of examiners is not the moment to be
 * hunting for a button with a trackpad.
 */
export function useShortcuts(toggleCompare: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const s = useYard.getState()
      switch (e.key.toLowerCase()) {
        case 's':
          s.scan()
          break
        case 'a':
          s.toggleAuto()
          break
        case 'c':
          toggleCompare()
          break
        case ' ':
          e.preventDefault()
          s.toggleRunning()
          break
        case 'escape':
          s.select(null)
          s.cancelRetrieve()
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCompare])
}
