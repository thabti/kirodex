import { useState, useEffect, useCallback } from 'react'
import {
  IconStack2, IconCircleCheck, IconCircleX,
  IconExternalLink, IconFolderOpen,
  IconMessageChatbot, IconListCheck, IconTool, IconLock,
  IconLoader2,
} from '@tabler/icons-react'
import { ipc } from '@/lib/ipc'
import { useSettingsStore } from '@/stores/settingsStore'

type DetectState = 'detecting' | 'found' | 'not-found'

export function Onboarding() {
  const [detectState, setDetectState] = useState<DetectState>('detecting')
  const [cliPath, setCliPath] = useState('')
  const [manualPath, setManualPath] = useState('')

  const detect = useCallback(async () => {
    setDetectState('detecting')
    try {
      const path = await ipc.detectKiroCli()
      if (path) { setCliPath(path); setDetectState('found') }
      else { setDetectState('not-found') }
    } catch { setDetectState('not-found') }
  }, [])

  useEffect(() => { detect() }, [detect])

  const finish = useCallback(async () => {
    const bin = cliPath || manualPath || 'kiro-cli'
    const settings = useSettingsStore.getState().settings
    await useSettingsStore.getState().saveSettings({ ...settings, kiroBin: bin, hasOnboarded: true })
    ipc.probeCapabilities().catch(() => {})
  }, [cliPath, manualPath])

  const handleBrowse = useCallback(async () => {
    const picked = await ipc.pickFolder()
    if (picked) setManualPath(picked)
  }, [])

  return (
    <div data-testid="onboarding-section" className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-background">
      <div className="fixed inset-x-0 top-0 h-10" data-tauri-drag-region />
      <div className="flex flex-col items-center gap-8 py-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
          <IconStack2 size={40} stroke={1.5} className="text-primary" />
        </div>
        <div>
          <h1 data-testid="onboarding-heading" className="text-3xl font-semibold tracking-tight text-foreground">Welcome to Kirodex</h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            A native desktop client for Kiro — the AI-powered coding assistant.
            Chat with your codebase, plan features, and let the agent work for you.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-left text-[14px] text-muted-foreground/80">
          <Feature Icon={IconMessageChatbot} text="Chat with AI about your code" />
          <Feature Icon={IconListCheck} text="Plan mode for structured feature development" />
          <Feature Icon={IconTool} text="Agent executes file edits, terminal commands, and more" />
          <Feature Icon={IconLock} text="Runs locally — your code stays on your machine" />
        </div>

        {/* Terminal-style CLI detection */}
        {/* Terminal */}
        <div data-testid="onboarding-terminal" className="w-full max-w-sm overflow-hidden rounded-xl bg-[#1a1a2e] shadow-lg shadow-black/20">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500/70" />
              <span className="size-2.5 rounded-full bg-yellow-500/70" />
              <span className="size-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="flex-1 text-center text-[10px] font-medium text-white/20">terminal</span>
          </div>
          {/* Terminal body */}
          <div className="px-4 py-3 font-mono text-[12px] leading-relaxed">
            {detectState === 'detecting' && (
              <div className="flex flex-col gap-1">
                <span className="text-green-400/80">$ <span className="text-white/60">which kiro-cli</span></span>
                <span className="inline-flex items-center gap-2 text-white/30">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                  searching…
                </span>
              </div>
            )}
            {detectState === 'found' && (
              <div className="flex flex-col gap-1">
                <span className="text-green-400/80">$ <span className="text-white/60">which kiro-cli</span></span>
                <span className="text-white/40">{cliPath}</span>
                <span className="mt-1 flex items-center gap-1.5 text-emerald-400">
                  <IconCircleCheck size={12} /> ready to go
                </span>
              </div>
            )}
            {detectState === 'not-found' && (
              <div className="flex flex-col gap-1">
                <span className="text-green-400/80">$ <span className="text-white/60">which kiro-cli</span></span>
                <span className="inline-flex items-center gap-1.5 text-red-400/80">
                  <IconCircleX size={12} /> kiro-cli not found
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Not-found actions — outside the terminal */}
        {detectState === 'not-found' && (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <button type="button"
              onClick={() => ipc.openUrl('https://kiro.dev/docs/cli/installation/')}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-muted"
            >
              Install kiro-cli <IconExternalLink size={14} />
            </button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] text-muted-foreground/40">or set path manually</span></div>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                data-testid="onboarding-path-input"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="/path/to/kiro-cli"
                className="flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-primary/40"
              />
              <button type="button"
                onClick={handleBrowse}
                className="rounded-lg border border-border/50 px-2.5 py-2 text-muted-foreground/50 transition-colors hover:text-foreground"
                title="Browse"
              >
                <IconFolderOpen size={16} />
              </button>
            </div>
            <button type="button" onClick={detect} data-testid="onboarding-retry-button"
              className="text-[12px] text-primary/60 transition-colors hover:text-primary"
            >
              Retry detection
            </button>
          </div>
        )}

        <button type="button"
          onClick={finish}
          data-testid="onboarding-submit-button"
          className="cursor-pointer rounded-xl bg-primary px-10 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {detectState === 'not-found' && manualPath ? 'Use This Path' : 'Get Started'}
        </button>
      </div>
    </div>
  )
}

function Feature({ Icon, text }: { Icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={20} stroke={1.5} className="text-muted-foreground/50" />
      <span>{text}</span>
    </div>
  )
}
