import { useState, useEffect, useCallback } from 'react'
import { X, Check, AlertCircle, Plus, Trash2, ChevronDown, Loader2, Search } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ipc } from '@/lib/ipc'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AppSettings, AgentProfile } from '@/types'

type Tab = 'general' | 'agents' | 'appearance' | 'misc'
const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'agents', label: 'Agents' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'misc', label: 'Misc' },
]
const FONT_SIZES = [12, 13, 14, 15, 16]

export function SettingsPanel() {
  const open = useTaskStore((s) => s.isSettingsOpen)
  const setOpen = useTaskStore((s) => s.setSettingsOpen)
  const { settings, saveSettings, availableModels, currentModelId, modelsLoading, modelsError, fetchModels } = useSettingsStore()

  const [tab, setTab] = useState<Tab>('general')
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [cliStatus, setCliStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [isDetecting, setIsDetecting] = useState(false)
  const [newProfile, setNewProfile] = useState({ name: '', agentId: '', tags: '' })

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const handleSave = () => {
    saveSettings(draft)
    setOpen(false)
  }

  const testCli = useCallback(async () => {
    setCliStatus('idle')
    try {
      await ipc.listTasks()
      setCliStatus('ok')
    } catch {
      setCliStatus('fail')
    }
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
    } finally {
      setIsDetecting(false)
    }
  }, [])

  const addProfile = () => {
    if (!newProfile.name.trim() || !newProfile.agentId.trim()) return
    const profile: AgentProfile = {
      id: crypto.randomUUID(),
      name: newProfile.name.trim(),
      agentId: newProfile.agentId.trim(),
      tags: newProfile.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isDefault: draft.agentProfiles.length === 0,
    }
    setDraft({ ...draft, agentProfiles: [...draft.agentProfiles, profile] })
    setNewProfile({ name: '', agentId: '', tags: '' })
  }

  const removeProfile = (id: string) => {
    setDraft({
      ...draft,
      agentProfiles: draft.agentProfiles.filter((p) => p.id !== id),
    })
  }

  const toggleDefault = (id: string) => {
    setDraft({
      ...draft,
      agentProfiles: draft.agentProfiles.map((p) => ({
        ...p,
        isDefault: p.id === id,
      })),
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-[600px] flex-col rounded-lg border border-border bg-background shadow-2xl animate-in zoom-in-95 fade-in-0" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative px-3 py-2.5 text-xs font-medium transition-colors',
                tab === t.id
                  ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  kiro-cli Path
                </label>
                <div className="flex gap-2">
                  <input
                    value={draft.kiroBin}
                    onChange={(e) => setDraft({ ...draft, kiroBin: e.target.value })}
                    placeholder="kiro-cli"
                    className="flex h-9 w-full flex-1 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    onClick={browseCli}
                    className="shrink-0 rounded-md border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    Browse
                  </button>
                  <button
                    onClick={handleAutoDetect}
                    disabled={isDetecting}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Auto-detect kiro-cli path"
                  >
                    {isDetecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    Detect
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={testCli}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  Test Connection
                </button>
                {cliStatus === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Working
                  </span>
                )}
                {cliStatus === 'fail' && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Failed
                  </span>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Default Model
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      value={draft.defaultModel ?? currentModelId ?? ''}
                      onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value || null })}
                      disabled={modelsLoading || availableModels.length === 0}
                      className={cn(
                        'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {availableModels.length === 0 && !modelsLoading && (
                        <option value="">No models loaded</option>
                      )}
                      {modelsLoading && <option value="">Loading…</option>}
                      {availableModels.map((m) => (
                        <option key={m.modelId} value={m.modelId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <button
                    onClick={() => fetchModels(draft.kiroBin)}
                    disabled={modelsLoading}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-input px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  >
                    {modelsLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Fetch Models'
                    )}
                  </button>
                </div>
                {modelsError && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="h-3 w-3" /> {modelsError}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Auto-approve permissions</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Automatically approve all tool permission requests
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, autoApprove: !draft.autoApprove })}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                    draft.autoApprove ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform',
                      draft.autoApprove ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Respect .gitignore</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Hide .gitignore'd files from @ mentions file picker
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, respectGitignore: !(draft.respectGitignore ?? true) })}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                    (draft.respectGitignore ?? true) ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform',
                      (draft.respectGitignore ?? true) ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            </div>
          )}

          {tab === 'agents' && (
            <div className="space-y-4">
              {draft.agentProfiles.length > 0 && (
                <div className="space-y-2">
                  {draft.agentProfiles.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {p.agentId}
                          </span>
                          {p.isDefault && (
                            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              default
                            </span>
                          )}
                        </div>
                        {p.tags.length > 0 && (
                          <div className="mt-0.5 flex gap-1">
                            {p.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleDefault(p.id)}
                        className={cn(
                          'text-[10px] font-medium transition-colors',
                          p.isDefault ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p.isDefault ? 'Default' : 'Set default'}
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => removeProfile(p.id)}
                            className="text-muted-foreground transition-colors hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Remove profile</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Add Profile</p>
                <div className="flex gap-2">
                  <input
                    value={newProfile.name}
                    onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                    placeholder="Name"
                    className="flex h-8 w-full flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <input
                    value={newProfile.agentId}
                    onChange={(e) => setNewProfile({ ...newProfile, agentId: e.target.value })}
                    placeholder="Agent ID"
                    className="flex h-8 w-full flex-1 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={newProfile.tags}
                    onChange={(e) => setNewProfile({ ...newProfile, tags: e.target.value })}
                    placeholder="Tags (comma-separated)"
                    className="flex h-8 w-full flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    onClick={addProfile}
                    disabled={!newProfile.name.trim() || !newProfile.agentId.trim()}
                    className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Theme
                </label>
                <div className="flex gap-2">
                  <span className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                    Dark
                  </span>
                  <span className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground/40">
                    Light
                  </span>
                  <span className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground/40">
                    System
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Font Size
                </label>
                <div className="flex gap-1.5">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setDraft({ ...draft, fontSize: s })}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        draft.fontSize === s
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'misc' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Co-authored-by Kirodex</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Append a Co-authored-by trailer to every commit
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.coAuthor ?? true}
                  aria-label="Toggle co-author trailer on commits"
                  onClick={() => setDraft({ ...draft, coAuthor: !(draft.coAuthor ?? true) })}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                    (draft.coAuthor ?? true) ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform',
                      (draft.coAuthor ?? true) ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-6 py-4">
          <button
            onClick={() => setOpen(false)}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
