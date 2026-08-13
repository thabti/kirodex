import { useEffect, useState } from 'react'
import { IconX, IconMinus, IconArrowsDiagonal } from '@tabler/icons-react'
import { isTauriRuntime } from '@/lib/web-rpc'
import { cn } from '@/lib/utils'

const withWindow = (fn: (win: ReturnType<typeof import('@tauri-apps/api/window')['getCurrentWindow']>) => void): void => {
  if (!isTauriRuntime()) return
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    fn(getCurrentWindow())
  }).catch(() => {})
}

export const TrafficLights = () => {
  const [isWindowFocused, setIsWindowFocused] = useState(true)

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true)
    const handleBlur = () => setIsWindowFocused(false)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <div className={cn('traffic-lights-group', !isWindowFocused && 'window-unfocused')}>
      <button
        type="button"
        aria-label="Close"
        onClick={() => withWindow((win) => { void win.close() })}
        className="traffic-light traffic-light-close"
      >
        <span className="symbol"><IconX size={7} strokeWidth={3} color="rgba(0,0,0,0.5)" /></span>
      </button>
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => withWindow((win) => { void win.minimize() })}
        className="traffic-light traffic-light-minimize"
      >
        <span className="symbol"><IconMinus size={7} strokeWidth={3} color="rgba(0,0,0,0.5)" /></span>
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={() => withWindow((win) => { void win.isFullscreen().then(f => win.setFullscreen(!f)) })}
        className="traffic-light traffic-light-maximize"
      >
        <span className="symbol"><IconArrowsDiagonal size={7} strokeWidth={2.5} color="rgba(0,0,0,0.5)" /></span>
      </button>
    </div>
  )
}
