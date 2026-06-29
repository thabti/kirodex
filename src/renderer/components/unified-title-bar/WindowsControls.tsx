import { isTauriRuntime } from '@/lib/web-rpc'

const withWindow = (fn: (win: ReturnType<typeof import('@tauri-apps/api/window')['getCurrentWindow']>) => void): void => {
  if (!isTauriRuntime()) return
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    fn(getCurrentWindow())
  }).catch(() => {})
}

export const WindowsControls = () => {
  return (
    <div className="flex items-center" data-no-drag>
      <button
        type="button"
        onClick={() => withWindow((win) => { void win.minimize() })}
        className="flex h-[38px] w-[46px] items-center justify-center transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        aria-label="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
      </button>
      <button
        type="button"
        onClick={() => withWindow((win) => { void win.isMaximized().then(m => m ? win.unmaximize() : win.maximize()) })}
        className="flex h-[38px] w-[46px] items-center justify-center transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        aria-label="Maximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
      </button>
      <button
        type="button"
        onClick={() => withWindow((win) => { void win.close() })}
        className="group flex h-[38px] w-[46px] items-center justify-center transition-colors hover:bg-red-500 hover:text-white"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10" /><line x1="10" y1="0" x2="0" y2="10" /></svg>
      </button>
    </div>
  )
}
