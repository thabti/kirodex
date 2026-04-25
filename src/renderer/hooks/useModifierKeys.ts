import { useEffect, useRef, useState } from 'react'

const SHOW_DELAY_MS = 100

/**
 * Tracks whether the Meta (Cmd) key is held down.
 * Uses delayed show (100ms) and instant hide to prevent flicker.
 * Clears on window blur to avoid stuck state.
 */
export const useModifierKeys = (): boolean => {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isVisibleRef = useRef(false)

  useEffect(() => {
    const show = (): void => {
      if (isVisibleRef.current || timeoutRef.current !== null) return
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        isVisibleRef.current = true
        setIsVisible(true)
      }, SHOW_DELAY_MS)
    }
    const hide = (): void => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (isVisibleRef.current) {
        isVisibleRef.current = false
        setIsVisible(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Meta' || e.key === 'OS' || e.key === 'Command') {
        show()
      }
    }
    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Meta' || e.key === 'OS' || e.key === 'Command') {
        hide()
      }
    }
    const handleBlur = (): void => {
      hide()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return isVisible
}
