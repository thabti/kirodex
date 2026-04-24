import { useState, useEffect } from 'react'
import { IconTrash, IconRefresh, IconChartBar } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAnalyticsStore } from '@/stores/analyticsStore'
import { Switch } from '@/components/ui/switch'
import type { AppSettings } from '@/types'
import { SectionHeader, SettingsCard, SettingRow, SettingsGrid, Divider, ConfirmDialog } from './settings-shared'

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AdvancedSectionProps {
  draft: AppSettings
  updateDraft: (patch: Partial<AppSettings>) => void
  onClose: () => void
}

export const AdvancedSection = ({ draft, updateDraft, onClose }: AdvancedSectionProps) => {
  const [analyticsSize, setAnalyticsSize] = useState<number>(0)
  const refreshDbSize = useAnalyticsStore((s) => s.refreshDbSize)
  const clearAnalytics = useAnalyticsStore((s) => s.clearData)
  const dbSize = useAnalyticsStore((s) => s.dbSize)
  const [isConfirmHistoryOpen, setIsConfirmHistoryOpen] = useState(false)
  const [isConfirmAnalyticsOpen, setIsConfirmAnalyticsOpen] = useState(false)

  useEffect(() => { refreshDbSize() }, [refreshDbSize])
  useEffect(() => { setAnalyticsSize(dbSize) }, [dbSize])

  const handleClearHistory = () => {
    useTaskStore.getState().clearHistory()
    onClose()
  }

  const handleClearAnalytics = async () => {
    await clearAnalytics()
    refreshDbSize()
  }

  return (
    <>
      <SectionHeader section="advanced" />

      <SettingsGrid label="Privacy" description="Anonymous usage data">
        <SettingsCard>
          <SettingRow label="Share anonymous usage data" description="Feature usage and app version only. No code or file paths.">
            <Switch
              checked={draft.analyticsEnabled ?? true}
              onCheckedChange={(checked) => updateDraft({ analyticsEnabled: checked })}
              aria-label="Toggle anonymous analytics"
            />
          </SettingRow>
        </SettingsCard>
      </SettingsGrid>

      <SettingsGrid label="Git" description="Commit trailers and reports">
        <SettingsCard>
          <SettingRow label="Co-authored-by Kirodex" description="Append trailer to every commit">
            <Switch
              checked={draft.coAuthor ?? true}
              onCheckedChange={(checked) => updateDraft({ coAuthor: checked })}
              aria-label="Toggle co-author trailer"
            />
          </SettingRow>
          <Divider />
          <SettingRow label="Task completion report" description="Summary card when a task finishes">
            <Switch
              checked={draft.coAuthorJsonReport ?? true}
              onCheckedChange={(checked) => updateDraft({ coAuthorJsonReport: checked })}
              aria-label="Toggle task completion report"
            />
          </SettingRow>
        </SettingsCard>
      </SettingsGrid>

      <SettingsGrid label="Side questions" description="/btw character limit">
        <SettingsCard>
          <SettingRow label="Max question length" description="Character limit for /btw questions">
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              value={draft.btwMaxChars ?? 1220}
              onChange={(e) => updateDraft({ btwMaxChars: Math.max(100, Math.min(10000, Number(e.target.value) || 1220)) })}
              className="w-20 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              aria-label="Max btw question characters"
            />
          </SettingRow>
        </SettingsCard>
      </SettingsGrid>

      <SettingsGrid label="Data" description="Clear history and analytics">
        <SettingsCard>
          <SettingRow label="Conversation history" description="Clear all threads without resetting settings">
            <button
              type="button"
              onClick={() => setIsConfirmHistoryOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              aria-label="Clear chat history"
            >
              <IconTrash className="size-3" />
              Clear
            </button>
          </SettingRow>
          <Divider />
          <SettingRow label="Analytics data" description={`Local stats on disk (${formatBytes(analyticsSize)})`}>
            <button
              type="button"
              onClick={() => setIsConfirmAnalyticsOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              aria-label="Clear analytics data"
            >
              <IconChartBar className="size-3" />
              Clear
            </button>
          </SettingRow>
          <Divider />
          <SettingRow label="Replay onboarding" description="Run the setup wizard again">
            <button
              type="button"
              onClick={async () => {
                const store = useSettingsStore.getState()
                await store.saveSettings({ ...store.settings, hasOnboardedV2: false })
                onClose()
              }}
              className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
            >
              <IconRefresh className="size-3" />
              Replay
            </button>
          </SettingRow>
        </SettingsCard>
      </SettingsGrid>

      <ConfirmDialog
        open={isConfirmHistoryOpen}
        onOpenChange={setIsConfirmHistoryOpen}
        title="Clear conversation history?"
        description="This permanently deletes all conversation threads. Your settings, onboarding state, and preferences are preserved. This action cannot be undone."
        confirmLabel="Clear history"
        onConfirm={handleClearHistory}
      />
      <ConfirmDialog
        open={isConfirmAnalyticsOpen}
        onOpenChange={setIsConfirmAnalyticsOpen}
        title="Clear analytics data?"
        description="This permanently deletes all local usage statistics. This action cannot be undone."
        confirmLabel="Clear analytics"
        onConfirm={handleClearAnalytics}
      />
    </>
  )
}
