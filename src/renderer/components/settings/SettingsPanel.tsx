import { useState, useEffect, useCallback } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import {
  IconX, IconCheck, IconAlertCircle, IconChevronDown, IconLoader2, IconSearch,
  IconKeyboard, IconSettings2, IconPaint, IconTool, IconTerminal,
  IconArrowLeft, IconTrash, IconBrandGithub, IconDownload, IconRefresh,
  IconUser, IconLogin, IconLogout,
} from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUpdateStore } from '@/stores/updateStore'
import { ipc } from '@/lib/ipc'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'

// ── Navigation ───────────────────────────────────────────────────

type Section = 'account' | 'general' | 'appearance' | 'keymap' | 'advanced'

const NAV: { id: Section; label: string; icon: typeof IconSettings2; description: string; group?: string }[] = [
  { id: 'account', label: 'Account', icon: IconUser, description: 'Auth status, login', group: 'account' },
  { id: 'general', label: 'General', icon: IconSettings2, description: 'CLI path, model, permissions', group: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: IconPaint, description: 'Theme, font size', group: 'settings' },
  { id: 'keymap', label: 'Keyboard', icon: IconKeyboard, description: 'Shortcuts reference', group: 'settings' },
  { id: 'advanced', label: 'Advanced', icon: IconTool, description: 'Data, commits', group: 'settings' },
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

const FONT_SIZES = [12, 13, 14, 15, 16] as const

// ── Reusable components ──────────────────────────────────────────

interface SettingRowProps {
  label: string
  description: string
  children: React.ReactNode
  className?: string
}

const SettingRow = ({ label, description, children, className }: SettingRowProps) => (
  <div className={cn('flex items-center justify-between gap-4 py-2.5', className)}>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-medium text-foreground/90">{label}</p>
      <p className="text-[11px] text-muted-foreground/50">{description}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
)

const SectionLabel = ({ title }: { title: string }) => (
  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">{title}</p>
)

const SettingsCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn(
    'rounded-xl border border-border/40 bg-card/30 px-5 py-1 transition-colors',
    className,
  )}>
    {children}
  </div>
)

const Divider = () => <div className="border-t border-border/30" />

// ── Updates card ─────────────────────────────────────────────────

const UpdatesCard = () => {
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
      useUpdateStore.getState().setError(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setIsChecking(false)
    }
  }

  const handleDownload = async () => {
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

  const statusText = (() => {
    if (status === 'checking') return 'Checking for updates...'
    if (status === 'available' && updateInfo) return `v${updateInfo.version} available`
    if (status === 'downloading') return pct !== null ? `Downloading... ${pct}%` : 'Downloading...'
    if (status === 'ready') return 'Update installed — restart to finish'
    if (status === 'error') return error ?? 'Update check failed'
    return 'Kirodex is up to date'
  })()

  return (
    <SettingRow label="Software updates" description={statusText}>
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
            Check
          </button>
        )}
        {status === 'downloading' && <IconLoader2 className="size-4 animate-spin text-primary" />}
      </div>
    </SettingRow>
  )
}

// ── Main component ───────────────────────────────────────────────

export const SettingsPanel = () => {
  const open = useTaskStore((s) => s.isSettingsOpen)
  const setOpen = useTaskStore((s) => s.setSettingsOpen)
  const settingsInitialSection = useTaskStore((s) => s.settingsInitialSection)
  const {
    settings, saveSettings, availableModels, currentModelId,
    modelsLoading, modelsError, fetchModels,
    kiroAuth, kiroAuthChecked, checkAuth, logout, openLogin,
  } = useSettingsStore()

  const [section, setSection] = useState<Section>('general')
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [cliStatus, setCliStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [isDetecting, setIsDetecting] = useState(false)
  const [keymapFilter, setKeymapFilter] = useState('')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}) }, [])
  useEffect(() => { if (open && !kiroAuthChecked) checkAuth() }, [open, kiroAuthChecked, checkAuth])
  useEffect(() => { setDraft(settings) }, [settings])

  // Jump to requested section when settings opens
  useEffect(() => {
    if (open && settingsInitialSection) {
      setSection(settingsInitialSection as Section)
    }
  }, [open, settingsInitialSection])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
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

  const updateDraft = useCallback((patch: Partial<AppSettings>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  if (!open) return null

  return (
    <div data-testid="settings-panel" className="fixed inset-0 z-50 flex animate-in fade-in-0 duration-150">
      <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

      <div className="relative z-10 flex w-full">
        {/* ── Sidebar ── */}
        <nav data-testid="settings-nav" className="flex w-56 shrink-0 flex-col border-r border-border/40 px-3 pt-16 pb-4">
          <div className="mb-6 px-3">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/50">Configure Kirodex</p>
          </div>

          <div className="flex flex-1 flex-col gap-0.5">
            {NAV.map((item, idx) => (
              <div key={item.id}>
                {idx > 0 && NAV[idx - 1].group !== item.group && (
                  <div className="my-2 border-t border-border/20" />
                )}
                <button
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all',
                    section === item.id
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {section === item.id && (
                    <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <item.icon className={cn('size-4 shrink-0', section === item.id && 'text-primary')} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium leading-tight">{item.label}</p>
                    <p className="truncate text-[10px] opacity-50">{item.description}</p>
                  </div>
                </button>
              </div>
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

              {/* ── Account ── */}
              {section === 'account' && (
                <>
                  <SectionLabel title="Account" />
                  <SettingsCard>
                    {kiroAuth ? (
                      <SettingRow
                        label={kiroAuth.email ?? 'Authenticated'}
                        description={`${kiroAuth.accountType}${kiroAuth.region ? ` · ${kiroAuth.region}` : ''}`}
                      >
                        <button
                          type="button"
                          onClick={logout}
                          className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <IconLogout className="size-3" />
                          Sign out
                        </button>
                      </SettingRow>
                    ) : (
                      <SettingRow
                        label="Not signed in"
                        description="Sign in to access Kiro features and sync your preferences."
                      >
                        <button
                          type="button"
                          onClick={openLogin}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          <IconLogin className="size-3" />
                          Sign in
                        </button>
                      </SettingRow>
                    )}
                  </SettingsCard>
                </>
              )}

              {/* ── General ── */}
              {section === 'general' && (
                <>
                  {/* CLI + Model */}
                  <div>
                    <SectionLabel title="CLI and model" />
                    <SettingsCard className="!py-4 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-foreground/70">kiro-cli path</label>
                        <div className="flex gap-2">
                          <input
                            value={draft.kiroBin}
                            data-testid="settings-cli-path-input"
                            onChange={(e) => updateDraft({ kiroBin: e.target.value })}
                            placeholder="kiro-cli"
                            className="flex h-8 w-full flex-1 rounded-lg border border-input bg-background/50 px-3 font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <button onClick={browseCli} className="shrink-0 rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent">Browse</button>
                          <button
                            onClick={handleAutoDetect}
                            disabled={isDetecting}
                            className="flex shrink-0 items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                          >
                            {isDetecting ? <IconLoader2 className="size-3 animate-spin" /> : <IconSearch className="size-3" />}
                            Detect
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={testCli} className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent">Test</button>
                          {cliStatus === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><IconCheck className="size-3" /> Connected</span>}
                          {cliStatus === 'fail' && <span className="flex items-center gap-1 text-xs text-red-400"><IconAlertCircle className="size-3" /> Failed</span>}
                        </div>
                      </div>
                      <Divider />
                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-foreground/70">Default model</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <select
                              value={draft.defaultModel ?? currentModelId ?? ''}
                              onChange={(e) => updateDraft({ defaultModel: e.target.value || null })}
                              disabled={modelsLoading || availableModels.length === 0}
                              className={cn(
                                'flex h-8 w-full appearance-none rounded-lg border border-input bg-background/50 px-3 pr-8 text-sm',
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
                            className="flex shrink-0 items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                          >
                            {modelsLoading ? <><IconLoader2 className="size-3 animate-spin" /> Loading…</> : 'Refresh'}
                          </button>
                        </div>
                        {modelsError && <span className="mt-1.5 flex items-center gap-1 text-xs text-red-400"><IconAlertCircle className="size-3" /> {modelsError}</span>}
                      </div>
                    </SettingsCard>
                  </div>

                  {/* Permissions */}
                  <div>
                    <SectionLabel title="Permissions" />
                    <SettingsCard>
                      <SettingRow label="Auto-approve" description="Skip permission prompts for tool calls">
                        <Switch
                          checked={draft.autoApprove ?? false}
                          onCheckedChange={(checked) => updateDraft({ autoApprove: checked })}
                          aria-label="Toggle auto-approve permissions"
                        />
                      </SettingRow>
                      <Divider />
                      <SettingRow label="Respect .gitignore" description="Hide gitignored files from @ mentions">
                        <Switch
                          checked={draft.respectGitignore ?? true}
                          onCheckedChange={(checked) => updateDraft({ respectGitignore: checked })}
                          aria-label="Toggle respect gitignore"
                        />
                      </SettingRow>
                      <Divider />
                      <SettingRow label="Notifications" description="Notify when the agent finishes in the background">
                        <Switch
                          checked={draft.notifications ?? true}
                          onCheckedChange={(checked) => updateDraft({ notifications: checked })}
                          aria-label="Toggle desktop notifications"
                        />
                      </SettingRow>
                    </SettingsCard>
                  </div>

                  {/* Updates */}
                  <div>
                    <SectionLabel title="Updates" />
                    <SettingsCard>
                      <UpdatesCard />
                    </SettingsCard>
                  </div>
                </>
              )}

              {/* ── Appearance ── */}
              {section === 'appearance' && (
                <>
                  <div>
                    <SectionLabel title="Theme" />
                    <SettingsCard className="!py-4">
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
                    </SettingsCard>
                  </div>

                  <div>
                    <SectionLabel title="Font size" />
                    <SettingsCard className="!py-4">
                      <div className="flex gap-2">
                        {FONT_SIZES.map((s) => (
                          <button
                            key={s}
                            onClick={() => updateDraft({ fontSize: s })}
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
                      <p className="mt-3 text-[12px] text-muted-foreground/40">
                        Preview: <span style={{ fontSize: draft.fontSize }}>The quick brown fox jumps over the lazy dog</span>
                      </p>
                    </SettingsCard>
                  </div>
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
                    <SectionLabel title="Keyboard shortcuts" />

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
                      <div key={group} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">{group}</span>
                          <div className="flex-1 border-t border-border/20" />
                        </div>
                        <SettingsCard className="divide-y divide-border/30 !p-0 overflow-hidden">
                          {filtered.filter((e) => e.group === group).map((entry) => (
                            <div key={entry.command} className="flex items-center justify-between px-5 py-2.5 transition-colors hover:bg-muted/10">
                              <span className="text-[13px] text-foreground/80">{entry.command}</span>
                              <kbd className="shrink-0 rounded-md border border-border/40 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground/70 shadow-sm">
                                {entry.keys}
                              </kbd>
                            </div>
                          ))}
                        </SettingsCard>
                      </div>
                    ))}
                  </>
                )
              })()}

              {/* ── Advanced ── */}
              {section === 'advanced' && (
                <>
                  <div>
                    <SectionLabel title="Git" />
                    <SettingsCard>
                      <SettingRow label="Co-authored-by Kirodex" description="Append trailer to every commit">
                        <Switch
                          checked={draft.coAuthor ?? true}
                          onCheckedChange={(checked) => updateDraft({ coAuthor: checked })}
                          aria-label="Toggle co-author trailer"
                        />
                      </SettingRow>
                      <Divider />
                      <SettingRow label="Task completion report" description="JSON summary card when a task finishes">
                        <Switch
                          checked={draft.coAuthorJsonReport ?? false}
                          onCheckedChange={(checked) => updateDraft({ coAuthorJsonReport: checked })}
                          aria-label="Toggle task completion report"
                        />
                      </SettingRow>
                    </SettingsCard>
                  </div>

                  <div>
                    <SectionLabel title="Data" />
                    <SettingsCard>
                      <SettingRow label="Conversation history" description="Threads are saved between sessions">
                        <button
                          type="button"
                          onClick={() => { useTaskStore.getState().clearHistory(); setOpen(false) }}
                          className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <IconTrash className="size-3" />
                          Clear history
                        </button>
                      </SettingRow>
                    </SettingsCard>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
