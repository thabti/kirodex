import { useEffect, useRef, type RefObject } from 'react'

/**
 * Adjusts a fixed-position menu element so it stays within the viewport.
 * Call after the menu renders; it measures the element and shifts left/top as needed.
 */
export function useMenuPosition(
  menuRef: RefObject<HTMLDivElement | null>,
  position: { x: number; y: number } | null,
): void {
  const adjusted = useRef(false)

  useEffect(() => {
    if (!position) {
      adjusted.current = false
      return
    }
    if (adjusted.current || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let needsUpdate = false
    let x = position.x
    let y = position.y
    if (rect.right > vw) { x = vw - rect.width - 4; needsUpdate = true }
    if (rect.bottom > vh) { y = vh - rect.height - 4; needsUpdate = true }
    if (x < 0) { x = 4; needsUpdate = true }
    if (y < 0) { y = 4; needsUpdate = true }
    if (needsUpdate) {
      adjusted.current = true
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  })
}
