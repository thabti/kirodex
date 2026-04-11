import { useState, useEffect, useCallback } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import {
  IconX, IconCheck, IconAlertCircle, IconChevronDown, IconLoader2, IconSearch,
  IconHistory, IconKeyboard, IconSettings2, IconPaint, IconTool, IconTerminal,
  IconGitBranch, IconShield, IconEye, IconTypography, IconPalette, IconCommand, IconArrowLeft, IconTrash,
  IconBrandGithub, IconDownload, IconRefresh,
} from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUpdateStore } from '@/stores/updateStore'
import { ipc } from '@/lib/ipc'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'

// ── Navigation ───────────────────────────────────────────────────

type Section = 'general' | 'appearance' | 'keymap' | 'advanced'

const NAV: { id: Section; label: string; icon: typeof IconSettings2; description: string }[] = [
  { id: 'general', label: 'General', icon: IconSettings2, description: 'CLI path, model, permissions' },
  { id: 'appearance', label: 'Appearance', icon: IconPaint, description: 'Theme, font size' },
  { id: 'keymap', label: 'Keyboard', icon: IconKeyboard, description: 'Shortcuts reference' },
  { id: 'advanced', label: 'Advanced', icon: IconTool, description: 'Data, commits' },
]

// ── Keymap data ──────────────────────────────────────────────────

const IS_MAC = navigator.platform.toUpperCase().includes('MAC')
const MOD = IS_MAC ? '\u2318' : 'Ctrl'
const SHIFT = IS_MAC ? '\u21E7' : 'Shift'

interface KeymapEntry { command: string; keys: string; group: string }

const KEYMAP: KeymapEntry[] = [
  { group: 'Navigation', command: 'Previous thread', keys: `${MOD}+${SHIFT}+[` },
  { group: 'Navigation', command: 'Next thread', keys: `${MOD}+${SHIFT}+]` },
  { group: 'Navigation', command: 'Jump to thread 1–9', keys: `${MOD}+1 … 9` },
  { group: 'Panels', command: 'Toggle sidebar', keys: `${MOD}+B` },
  { group: 'Panels', command: 'Toggle terminal', keys: `${MOD}+J` },
  { group: 'Panels', command: 'Toggle diff panel', keys: `${MOD}+D` },
  { group: 'Panels', command: 'Open settings', keys: `${MOD}+,` },
  { group: 'Actions', command: 'New project', keys: `${MOD}+O` },
  { group: 'Actions', command: 'New thread', keys: `${MOD}+N` },
  { group: 'Actions', command: 'Close thread', keys: `${MOD}+W` },
  { group: 'Chat', command: 'Send message', keys: 'Enter' },
  { group: 'Chat', command: 'New line', keys: `${SHIFT}+Enter` },
  { group: 'Chat', command: 'Previous message', keys: '\u2191 (at start)' },
  { group: 'Chat', command: 'Pause agent', keys: 'Escape (while running)' },
]

const FONT_SIZES = [12, 13, 14, 15, 16]

// ── Reusable components ──────────────────────────────────────────

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('rounded-xl border border-border/50 bg-card/50 p-4', className)}>
    {children}
  </div>
)

const SectionTitle = ({ icon: Icon, title, description }: { icon: typeof IconSettings2; title: string; description?: string }) => (
  <div className="mb-5">
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-[11px] text-muted-foreground/60">{description}</p>}
      </div>
    </div>
  </div>
)

const Toggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description: string }) => (
  <div className="flex items-center justify-between gap-4 py-1">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-foreground/90">{label}</p>
      <p className="text-[11px] text-muted-foreground/50">{description}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/20',
      )}
    >
      <span className={cn(
        'pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
      )} />
    </button>
  </div>
)

function UpdatesCard() {
  const { status, updateInfo, progress, error } = useUpdateStore()
  const [isChecking, setIsChecking] = useState(false)

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      useUpdateStore.getState().setStatus('checking')
      const update = await check()
      if (update) {
        useUpdateStore.getState().setUpdateInfo({
          version: update.version,
          date: update.date ?? undefined,
          body: update.body ?? undefined,
        })
        useUpdateStore.getState().setStatus('available')
      } else {
        useUpdateStore.getState().setStatus('idle')
        useUpdateStore.getState().setUpdateInfo(null)
      }
    } catch (err) {
      useUpdateStore.getState().setError(
        err instanceof Error ? err.message : 'Check failed',
      )
    } finally {
      setIsChecking(false)
    }
  }

  const handleDownload = async () => {
    // Trigger download via the same mechanism as the toast
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return
    useUpdateStore.getState().setStatus('downloading')
    useUpdateStore.getState().setProgress({ downloaded: 0, total: null })
    try {
      let totalBytes: number | null = null
      let downloadedBytes = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = (event.data as { contentLength?: number }).contentLength ?? null
        } else if (event.event === 'Progress') {
          downloadedBytes += (event.data as { chunkLength: number }).chunkLength
          useUpdateStore.getState().setProgress({ downloaded: downloadedBytes, total: totalBytes })
        }
      })
      useUpdateStore.getState().setStatus('ready')
    } catch (err) {
      useUpdateStore.getState().setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleRestart = async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  }

  const isCheckingState = isChecking || status === 'checking'
  const pct = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : null

  return (
    <Card className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground/90">Software updates</p>
        <p className="text-[11px] text-muted-foreground/50">
          {status === 'idle' && !updateInfo && 'Kirodex is up to date'}
          {status === 'checking' && 'Checking for updates...'}
          {status === 'available' && updateInfo && `v${updateInfo.version} available`}
          {status === 'downloading' && (pct !== null ? `Downloading... ${pct}%` : 'Downloading...')}
          {status === 'ready' && 'Update installed — restart to finish'}
          {status === 'error' && (error ?? 'Update check failed')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {status === 'available' && (
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <IconDownload className="size-3" />
            Update now
          </button>
        )}
        {status === 'ready' && (
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <IconRefresh className="size-3" />
            Restart
          </button>
        )}
        {(status === 'idle' || status === 'error') && (
          <button
            type="button"
            onClick={handleCheck}
            disabled={isCheckingState}
            className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {isCheckingState ? <IconLoader2 className="size-3 animate-spin" /> : <IconRefresh className="size-3" />}
            Check for updates
          </button>
        )}
        {status === 'downloading' && (
          <IconLoader2 className="size-4 animate-spin text-primary" />
        )}
      </div>
    </Card>
  )
}

// ── Main component ───────────────────────────────────────────────

export function SettingsPanel() {
  const open = useTaskStore((s) => s.isSettingsOpen)
  const setOpen = useTaskStore((s) => s.setSettingsOpen)
  const { settings, saveSettings, availableModels, currentModelId, modelsLoading, modelsError, fetchModels } = useSettingsStore()

  const [section, setSection] = useState<Section>('general')
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [cliStatus, setCliStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [isDetecting, setIsDetecting] = useState(false)
  const [keymapFilter, setKeymapFilter] = useState('')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}) }, [])

  useEffect(() => { setDraft(settings) }, [settings])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const handleSave = useCallback(() => {
    saveSettings(draft)
    setOpen(false)
  }, [draft, saveSettings, setOpen])

  const testCli = useCallback(async () => {
    setCliStatus('idle')
    try { await ipc.listTasks(); setCliStatus('ok') } catch { setCliStatus('fail') }
  }, [])

  const browseCli = async () => {
    const path = await ipc.pickFolder()
    if (path) setDraft({ ...draft, kiroBin: path })
  }

  const handleAutoDetect = useCallback(async () => {
    setIsDetecting(true)
    try {
      const path = await ipc.detectKiroCli()
      if (path) setDraft((d) => ({ ...d, kiroBin: path }))
    } finally { setIsDetecting(false) }
  }, [])

  if (!open) return null

  return (
    <div data-testid="settings-panel" className="fixed inset-0 z-50 flex animate-in fade-in-0 duration-150">
      {/* Full-page backdrop */}
      <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

      <div className="relative z-10 flex w-full">
        {/* ── Sidebar navigation ── */}
        <nav data-testid="settings-nav" className="flex w-56 shrink-0 flex-col border-r border-border/40 px-3 pt-16 pb-4">
          <div className="mb-6 px-3">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/50">Configure Kirodex</p>
          </div>

          <div className="flex flex-1 flex-col gap-0.5">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                  section === item.id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-tight">{item.label}</p>
                  <p className="truncate text-[10px] opacity-50">{item.description}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto px-3 pt-4 border-t border-border/30 space-y-3">
            <button
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <IconArrowLeft className="size-4" />
              Back
            </button>
            <div className="flex items-center justify-between px-3">
              <div>
                <p className="text-[10px] text-muted-foreground/30">Kirodex {appVersion ? `v${appVersion}` : ''}</p>
                <p className="text-[10px] text-muted-foreground/30">Copyright © 2026 Thabti</p>
              </div>
              <a
                href="https://github.com/thabti/kirodex"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kirodex on GitHub"
                tabIndex={0}
                className="text-muted-foreground/30 transition-colors hover:text-foreground"
              >
                <IconBrandGithub className="size-4" />
              </a>
            </div>
          </div>
        </nav>

        {/* ── Main content ── */}
        <div className="flex flex-1 flex-col min-h-0">
          {/* Top bar */}
          <div className="flex h-12 shrink-0 items-center justify-between px-6 pt-4">
            <div />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                data-testid="settings-save-button"
                className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Save changes
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpen(false)}
                    data-testid="settings-close-button"
                    className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <IconX className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close <kbd className="ml-1 text-[10px] opacity-50">Esc</kbd></TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-2xl space-y-6">

              {/* ── General ── */}
              {section === 'general' && (
                <>
                  <SectionTitle icon={IconTerminal} title="Connection" description="Configure the kiro-cli binary path" />
                  <Card>
                    <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      kiro-cli path
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={draft.kiroBin}
                        data-testid="settings-cli-path-input"
                        onChange={(e) => setDraft({ ...draft, kiroBin: e.target.value })}
                        placeholder="kiro-cli"
                        className="flex h-9 w-full flex-1 rounded-lg border border-input bg-background/50 px-3 py-1 font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <button onClick={browseCli} className="shrink-0 rounded-lg border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent">
                        Browse
                      </button>
                      <button
                        onClick={handleAutoDetect}
                        disabled={isDetecting}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                      >
                        {isDetecting ? <IconLoader2 className="size-3 animate-spin" /> : <IconSearch className="size-3" />}
                        Detect
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={testCli} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                        Test Connection
                      </button>
                      {cliStatus === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><IconCheck className="size-3.5" /> Connected</span>}
                      {cliStatus === 'fail' && <span className="flex items-center gap-1 text-xs text-red-400"><IconAlertCircle className="size-3.5" /> Failed</span>}
                    </div>
                  </Card>

                  <SectionTitle icon={IconGitBranch} title="Model" description="Default AI model for new threads" />
                  <Card>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <select
                          value={draft.defaultModel ?? currentModelId ?? ''}
                          onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value || null })}
                          disabled={modelsLoading || availableModels.length === 0}
                          className={cn(
                            'flex h-9 w-full appearance-none rounded-lg border border-input bg-background/50 px-3 py-1 pr-8 text-sm',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                          )}
                        >
                          {availableModels.length === 0 && !modelsLoading && <option value="">No models loaded</option>}
                          {modelsLoading && <option value="">Loading…</option>}
                          {availableModels.map((m) => <option key={m.modelId} value={m.modelId}>{m.name}</option>)}
                        </select>
                        <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
                      </div>
                      <button
                        onClick={() => fetchModels(draft.kiroBin)}
                        disabled={modelsLoading}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                      >
                        {modelsLoading ? <IconLoader2 className="size-3 animate-spin" /> : 'Fetch Models'}
                      </button>
                    </div>
                    {modelsError && <span className="mt-2 flex items-center gap-1 text-xs text-red-400"><IconAlertCircle className="size-3" /> {modelsError}</span>}
                  </Card>

                  <SectionTitle icon={IconShield} title="Permissions" description="Control agent behavior" />
                  <Card className="space-y-3">
                    <Toggle
                      checked={draft.autoApprove ?? false}
                      onChange={() => setDraft({ ...draft, autoApprove: !draft.autoApprove })}
                      label="Auto-approve permissions"
                      description="Automatically approve all tool permission requests"
                    />
                    <div className="border-t border-border/30" />
                    <Toggle
                      checked={draft.respectGitignore ?? true}
                      onChange={() => setDraft({ ...draft, respectGitignore: !(draft.respectGitignore ?? true) })}
                      label="Respect .gitignore"
                      description="Hide gitignored files from @ mentions file picker"
                    />
                    <div className="border-t border-border/30" />
                    <Toggle
                      checked={draft.notifications ?? true}
                      onChange={() => setDraft({ ...draft, notifications: !(draft.notifications ?? true) })}
                      label="Desktop notifications"
                      description="Notify when the agent finishes a turn while the window is in the background"
                    />
                  </Card>

                  <SectionTitle icon={IconDownload} title="Updates" description="Check for new versions of Kirodex" />
                  <UpdatesCard />
                </>
              )}
              {/* ── Appearance ── */}
              {section === 'appearance' && (
                <>
                  <SectionTitle icon={IconPalette} title="Theme" description="Visual appearance" />
                  <Card>
                    <div className="flex gap-2">
                      {(['Dark', 'Light', 'System'] as const).map((theme) => (
                        <button
                          key={theme}
                          disabled={theme !== 'Dark'}
                          className={cn(
                            'flex-1 rounded-lg border px-4 py-3 text-center text-xs font-medium transition-colors',
                            theme === 'Dark'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'cursor-not-allowed border-border/30 text-muted-foreground/25',
                          )}
                        >
                          {theme}
                          {theme !== 'Dark' && <span className="ml-1 text-[9px]">(soon)</span>}
                        </button>
                      ))}
                    </div>
                  </Card>

                  <SectionTitle icon={IconTypography} title="Typography" description="Adjust text rendering" />
                  <Card>
                    <label className="mb-3 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      Font size
                    </label>
                    <div className="flex gap-2">
                      {FONT_SIZES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setDraft({ ...draft, fontSize: s })}
                          className={cn(
                            'flex-1 rounded-lg border py-2.5 text-center text-sm font-medium transition-colors',
                            draft.fontSize === s
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/40 text-muted-foreground/60 hover:bg-accent hover:text-foreground',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground/40">
                      Preview: <span style={{ fontSize: draft.fontSize }}>The quick brown fox jumps over the lazy dog</span>
                    </p>
                  </Card>
                </>
              )}

              {/* ── Keymap ── */}
              {section === 'keymap' && (() => {
                const q = keymapFilter.toLowerCase()
                const filtered = q
                  ? KEYMAP.filter((e) => e.command.toLowerCase().includes(q) || e.keys.toLowerCase().includes(q) || e.group.toLowerCase().includes(q))
                  : KEYMAP
                const groups = [...new Set(filtered.map((e) => e.group))]

                return (
                  <>
                    <SectionTitle icon={IconCommand} title="Keyboard Shortcuts" description="Quick reference for all available shortcuts" />

                    <div className="relative">
                      <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/30" />
                      <input
                        value={keymapFilter}
                        onChange={(e) => setKeymapFilter(e.target.value)}
                        placeholder="Search shortcuts…"
                        className="flex h-10 w-full rounded-xl border border-input bg-background/50 pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>

                    {groups.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-12">
                        <IconSearch className="size-8 text-muted-foreground/20" />
                        <p className="text-sm text-muted-foreground/40">No matching shortcuts</p>
                      </div>
                    )}

                    {groups.map((group) => (
                      <div key={group}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">{group}</span>
                          <div className="flex-1 border-t border-border/20" />
                        </div>
                        <Card className="divide-y divide-border/30 !p-0 overflow-hidden">
                          {filtered.filter((e) => e.group === group).map((entry) => (
                            <div key={entry.command} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/10">
                              <span className="text-[13px] text-foreground/80">{entry.command}</span>
                              <kbd className="shrink-0 rounded-md border border-border/40 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground/70 shadow-sm">
                                {entry.keys}
                              </kbd>
                            </div>
                          ))}
                        </Card>
                      </div>
                    ))}
                  </>
                )
              })()}

              {/* ── Advanced ── */}
              {section === 'advanced' && (
                <>
                  <SectionTitle icon={IconEye} title="Git Integration" description="Commit and version control settings" />
                  <Card>
                    <Toggle
                      checked={draft.coAuthor ?? true}
                      onChange={() => setDraft({ ...draft, coAuthor: !(draft.coAuthor ?? true) })}
                      label="Co-authored-by Kirodex"
                      description="Append a Co-authored-by trailer to every commit"
                    />
                    <Toggle
                      checked={draft.coAuthorJsonReport ?? false}
                      onChange={() => setDraft({ ...draft, coAuthorJsonReport: !(draft.coAuthorJsonReport ?? false) })}
                      label="Task completion report"
                      description="Agent returns a JSON summary card when a task finishes"
                    />
                  </Card>

                  <SectionTitle icon={IconHistory} title="Data" description="Manage stored conversation history" />
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-foreground/90">Conversation history</p>
                      <p className="text-[11px] text-muted-foreground/50">Threads are saved between sessions for reference</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { useTaskStore.getState().clearHistory(); setOpen(false) }}
                      className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <IconTrash className="size-3" />
                      Clear history
                    </button>
                  </Card>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
