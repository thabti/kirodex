import { memo, useCallback } from 'react'

interface SplashItem {
  readonly label: string
  readonly description: string
  readonly insert: string
  readonly color: string
  readonly icon: () => React.ReactNode
}

/** Dispatch a custom event to insert text into the chat input and focus it */
const insertIntoInput = (text: string): void => {
  document.dispatchEvent(new CustomEvent('splash-insert', { detail: text }))
}

const icon = (d: string) => () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

const SLASH_COMMANDS: readonly SplashItem[] = [
  { label: '/plan', insert: '/plan ', description: 'Toggle plan mode', color: 'text-teal-600 dark:text-teal-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7h8M8 12h8M8 17h4" /></svg> },
  { label: '/model', insert: '/model ', description: 'Switch AI model', color: 'text-amber-600 dark:text-amber-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> },
  { label: '/clear', insert: '/clear ', description: 'Clear conversation', color: 'text-red-600 dark:text-red-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M5 6l1 14h12l1-14" /></svg> },
  { label: '/compact', insert: '/compact ', description: 'Summarize to free context', color: 'text-sky-600 dark:text-sky-400', icon: icon('M4 6h16M4 12h10M4 18h6') },
  { label: '/context', insert: '/context ', description: 'Manage context files', color: 'text-blue-600 dark:text-blue-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
  { label: '/tools', insert: '/tools ', description: 'View available tools', color: 'text-orange-600 dark:text-orange-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
  { label: '/usage', insert: '/usage ', description: 'Show token and cost usage', color: 'text-emerald-600 dark:text-emerald-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" /></svg> },
  { label: '/branch', insert: '/branch ', description: 'Create and checkout a branch', color: 'text-pink-600 dark:text-pink-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg> },
  { label: '/worktree', insert: '/worktree ', description: 'Create an isolated worktree', color: 'text-violet-600 dark:text-violet-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="6" y1="9" x2="6" y2="15" /><path d="M9 6h6" /><path d="M6 9c0 3 2 6 6 9" /></svg> },
  { label: '/btw', insert: '/btw ', description: 'Quick side question', color: 'text-yellow-600 dark:text-yellow-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15.02 19.52c-2.341 .736 -5 .606 -7.32 -.52l-4.7 1l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c1.649 1.407 2.575 3.253 2.742 5.152" /><path d="M19 22v.01" /><path d="M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" /></svg> },
] as const

const AT_COMMANDS: readonly SplashItem[] = [
  { label: '@file', insert: '@', description: 'Mention a file for context', color: 'text-cyan-600 dark:text-cyan-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
  { label: '@folder', insert: '@', description: 'Reference an entire directory', color: 'text-indigo-600 dark:text-indigo-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg> },
  { label: '@agent', insert: '@', description: 'Mention an agent by name', color: 'text-purple-600 dark:text-purple-400', icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg> },
] as const

const SplashItemButton = ({ item }: { readonly item: SplashItem }) => {
  const handleClick = useCallback(() => insertIntoInput(item.insert), [item.insert])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      insertIntoInput(item.insert)
    }
  }, [item.insert])
  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`Insert ${item.label}`}
      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className={`mt-px shrink-0 ${item.color}`}>
        {item.icon()}
      </span>
      <div className="min-w-0">
        <span className="text-[12px] font-medium text-foreground/70">{item.label}</span>
        <p className="text-[10px] leading-tight text-muted-foreground">{item.description}</p>
      </div>
    </button>
  )
}

export const EmptyThreadSplash = memo(function EmptyThreadSplash() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 select-none" role="region" aria-label="Getting started">
      {/* Logo / title */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted/40">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/70" aria-hidden>
            <path d="M4 17l6-6-6-6" /><path d="M12 19h8" />
          </svg>
        </div>
        <p className="text-[13px] font-medium text-foreground/70">What can I help you build?</p>
      </div>

      {/* Commands grid */}
      <div className="w-full max-w-xl">
        {/* Slash commands */}
        <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Slash commands
        </p>
        <div className="grid grid-cols-3 gap-x-0.5 gap-y-0">
          {SLASH_COMMANDS.map((item) => (
            <SplashItemButton key={item.label} item={item} />
          ))}
        </div>

        {/* @ mentions */}
        <p className="mb-1 mt-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mentions
        </p>
        <div className="grid grid-cols-3 gap-x-0.5 gap-y-0">
          {AT_COMMANDS.map((item) => (
            <SplashItemButton key={item.label} item={item} />
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Type <kbd className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[9px]">/</kbd> or <kbd className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[9px]">@</kbd> in the input to get started
      </p>
    </div>
  )
})
