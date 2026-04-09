import { useState, useEffect, useCallback } from 'react'
import {
  IconStack2, IconTerminal2, IconCircleCheck, IconCircleX,
  IconLoader2, IconExternalLink, IconFolderOpen,
  IconMessageChatbot, IconListCheck, IconTool, IconLock,
} from '@tabler/icons-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ipc } from '@/lib/ipc'
import { useSettingsStore } from '@/stores/settingsStore'

type DetectState = 'idle' | 'detecting' | 'found' | 'not-found'

const INTERACTIVE = 'button, a, input, textarea, select, [role="button"]'
const handleDrag = (e: React.MouseEvent<HTMLElement>) => {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return
  if (e.detail === 2) getCurrentWindow().toggleMaximize()
  else getCurrentWindow().startDragging()
}

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [detectState, setDetectState] = useState<DetectState>('idle')
  const [cliPath, setCliPath] = useState('')
  const [manualPath, setManualPath] = useState('')

  const detect = useCallback(async () => {
    setDetectState('detecting')
    try {
      const path = await ipc.detectKiroCli()
      if (path) {
        setCliPath(path)
        setDetectState('found')
      } else {
        setDetectState('not-found')
      }
    } catch {
      setDetectState('not-found')
    }
  }, [])

  useEffect(() => {
    if (step === 1) detect()
  }, [step, detect])

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

  if (step === 0) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background" onMouseDown={handleDrag}>
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
            <IconStack2 size={40} stroke={1.5} className="text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Welcome to Kirodex</h1>
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
          <button type="button"
            onClick={() => setStep(1)}
            className="mt-4 cursor-pointer rounded-xl bg-primary px-10 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background" onMouseDown={handleDrag}>
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <IconTerminal2 size={28} stroke={1.5} className="text-foreground/70" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Connect Kiro CLI</h2>
          <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
            Kirodex needs the Kiro CLI to communicate with the AI agent.
          </p>
        </div>

        <div className="w-full max-w-sm rounded-xl border border-border bg-card px-5 py-4">
          {detectState === 'detecting' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <IconLoader2 size={16} className="animate-spin text-primary" />
              Searching for kiro-cli…
            </div>
          )}
          {detectState === 'found' && (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <IconCircleCheck size={20} className="text-emerald-500" />
              <p className="text-sm font-medium text-emerald-500">Found kiro-cli</p>
              <p className="max-w-full truncate font-mono text-[11px] text-muted-foreground/60">{cliPath}</p>
            </div>
          )}
          {detectState === 'not-found' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <IconCircleX size={16} />
                kiro-cli not found
              </div>
              <button type="button"
                onClick={() => ipc.openUrl('https://kiro.dev/docs/cli/installation/')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-foreground/70 transition-colors hover:bg-muted"
              >
                Install kiro-cli <IconExternalLink size={14} />
              </button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
                <div className="relative flex justify-center"><span className="bg-card px-2 text-[10px] text-muted-foreground/40">or set path manually</span></div>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/path/to/kiro-cli"
                  className="flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-primary/40"
                />
                <button type="button"
                  onClick={handleBrowse}
                  className="rounded-lg border border-border/50 px-2.5 py-2 text-muted-foreground/50 transition-colors hover:text-foreground"
                  title="Browse"
                >
                  <IconFolderOpen size={16} />
                </button>
              </div>
              <button type="button"
                onClick={detect}
                className="text-[12px] text-primary/60 transition-colors hover:text-primary"
              >
                Retry detection
              </button>
            </div>
          )}
          {detectState === 'idle' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground/50">
              <IconLoader2 size={16} className="animate-spin" />
              Initializing…
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="button"
            onClick={() => setStep(0)}
            className="rounded-lg px-5 py-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Back
          </button>
          <button type="button"
            onClick={finish}
            disabled={detectState === 'detecting'}
            className="rounded-xl bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {detectState === 'found' ? 'Continue' : detectState === 'not-found' && manualPath ? 'Use This Path' : 'Skip for Now'}
          </button>
        </div>
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
