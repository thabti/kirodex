import { useState, useCallback } from 'react'
import {
  IconCheck, IconAlertCircle, IconChevronDown, IconLoader2,
  IconSearch, IconRefresh,
} from '@tabler/icons-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Switch } from '@/components/ui/switch'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'
import { SectionHeader, SectionLabel, SettingsCard, SettingRow, Divider } from './settings-shared'
import { UpdatesCard } from './updates-card'

interface GeneralSectionProps {
  draft: AppSettings
  updateDraft: (patch: Partial<AppSettings>) => void
}

export const GeneralSection = ({ draft, updateDraft }: GeneralSectionProps) => {
  const { availableModels, currentModelId, modelsLoading, modelsError, fetchModels, activeWorkspace } = useSettingsStore()
  const [cliStatus, setCliStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [isDetecting, setIsDetecting] = useState(false)

  const testCli = useCallback(async () => {
    setCliStatus('idle')
    try { await ipc.listTasks(); setCliStatus('ok') } catch { setCliStatus('fail') }
  }, [])

  const browseCli = async () => {
    const path = await ipc.pickFolder()
    if (path) updateDraft({ kiroBin: path })
  }

  const handleAutoDetect = useCallback(async () => {
    setIsDetecting(true)
    try {
      const path = await ipc.detectKiroCli()
      if (path) updateDraft({ kiroBin: path })
    } finally { setIsDetecting(false) }
  }, [updateDraft])

  const updateProjectPref = useCallback((key: string, value: boolean) => {
    if (!activeWorkspace) return
    const prefs = draft.projectPrefs ?? {}
    const existing = prefs[activeWorkspace] ?? {}
    updateDraft({ projectPrefs: { ...prefs, [activeWorkspace]: { ...existing, [key]: value } } })
  }, [activeWorkspace, draft.projectPrefs, updateDraft])

  return (
    <>
      <SectionHeader section="general" />

      {/* Connection */}
      <div>
        <SectionLabel title="Connection" />
        <SettingsCard>
          <div className="py-1">
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/70">kiro-cli path</label>
            <div className="flex gap-2">
              <input
                value={draft.kiroBin}
                data-testid="settings-cli-path-input"
                onChange={(e) => updateDraft({ kiroBin: e.target.value })}
                placeholder="kiro-cli"
                className="flex h-8 w-full flex-1 rounded-lg border border-input bg-background/50 px-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              <button onClick={testCli} className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent">Test connection</button>
              {cliStatus === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><IconCheck className="size-3" /> Connected</span>}
              {cliStatus === 'fail' && <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><IconAlertCircle className="size-3" /> Failed</span>}
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* Model */}
      <div>
        <SectionLabel title="Model" />
        <SettingsCard>
          <div className="py-1">
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
                <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
              </div>
              <button
                onClick={() => fetchModels(draft.kiroBin)}
                disabled={modelsLoading}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                {modelsLoading ? <><IconLoader2 className="size-3 animate-spin" /> Loading…</> : <><IconRefresh className="size-3" /> Refresh</>}
              </button>
            </div>
            {modelsError && <span className="mt-1.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><IconAlertCircle className="size-3" /> {modelsError}</span>}
          </div>
        </SettingsCard>
      </div>

      {/* Workspace — merged Permissions + Worktrees + Sandbox */}
      <div>
        <SectionLabel title="Workspace" />
        <SettingsCard>
          <SettingRow label="Auto-approve" description="Skip permission prompts for tool calls">
            <Switch checked={draft.autoApprove ?? false} onCheckedChange={(checked) => updateDraft({ autoApprove: checked })} aria-label="Toggle auto-approve permissions" />
          </SettingRow>
          <Divider />
          <SettingRow label="Respect .gitignore" description="Hide gitignored files from @ mentions">
            <Switch checked={draft.respectGitignore ?? true} onCheckedChange={(checked) => updateDraft({ respectGitignore: checked })} aria-label="Toggle respect gitignore" />
          </SettingRow>
          <Divider />
          <SettingRow label="Use worktrees" description="Isolate each thread in its own git worktree under .kiro/worktrees/">
            <Switch
              checked={draft.projectPrefs?.[activeWorkspace ?? '']?.worktreeEnabled ?? false}
              onCheckedChange={(checked) => updateProjectPref('worktreeEnabled', checked)}
              disabled={!activeWorkspace}
              aria-label="Toggle worktrees for new threads"
            />
          </SettingRow>
          <Divider />
          <SettingRow label="Tight sandbox" description="Restrict the agent to the project directory">
            <Switch
              checked={draft.projectPrefs?.[activeWorkspace ?? '']?.tightSandbox ?? true}
              onCheckedChange={(checked) => updateProjectPref('tightSandbox', checked)}
              disabled={!activeWorkspace}
              aria-label="Toggle tight sandbox"
            />
          </SettingRow>
        </SettingsCard>
      </div>

      {/* Notifications */}
      <div>
        <SectionLabel title="Notifications" />
        <SettingsCard>
          <SettingRow label="Desktop notifications" description="Notify when the agent finishes, errors, or needs approval in the background">
            <Switch checked={draft.notifications ?? true} onCheckedChange={(checked) => updateDraft({ notifications: checked })} aria-label="Toggle desktop notifications" />
          </SettingRow>
          <Divider />
          <SettingRow label="Notification sound" description="Play a chime when a notification is sent">
            <Switch
              checked={draft.soundNotifications ?? true}
              onCheckedChange={(checked) => updateDraft({ soundNotifications: checked })}
              disabled={!(draft.notifications ?? true)}
              aria-label="Toggle notification sound"
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
  )
}
