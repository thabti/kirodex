import { create } from 'zustand'
import type { AppSettings, ProjectPrefs } from '@/types'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'

/** Workspaces where .kiro/goal/ has already been ensured this session. */
const goalDirEnsured = new Set<string>()

export interface ModelOption {
  modelId: string
  name: string
  description?: string | null
}

export interface ModeOption {
  id: string
  name: string
  description?: string | null
}

export interface SlashCommand {
  name: string
  description?: string
  inputType?: string
}

export interface LiveMcpServer {
  name: string
  status: string
  toolCount: number
}

interface SettingsStore {
  settings: AppSettings
  isLoaded: boolean
  availableModels: ModelOption[]
  currentModelId: string | null
  modelsLoading: boolean
  modelsError: string | null
  availableModes: ModeOption[]
  currentModeId: string | null
  activeWorkspace: string | null
  /** Actual working directory for operations (worktree path when in a worktree thread, project root otherwise). */
  operationalWorkspace: string | null
  availableCommands: SlashCommand[]
  liveMcpServers: LiveMcpServer[]
  kiroAuth: { email: string | null; accountType: string; region?: string; startUrl?: string } | null
  kiroAuthChecked: boolean
  loadSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  fetchModels: (kiroBin?: string) => Promise<void>
  setActiveWorkspace: (workspace: string | null, operationalWs?: string | null) => void
  setProjectPref: (workspace: string, patch: Partial<ProjectPrefs>) => void
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
  openLogin: () => void
}

const defaultSettings: AppSettings = {
  kiroBin: 'kiro-cli',
  agentProfiles: [],
  fontSize: 14,
  chatFontSize: 15,
  sidebarPosition: 'left',
  analyticsEnabled: true,
  // Default to true — new users get inline tool calls by default.
  // Existing users who never explicitly set this will also get the new default.
  // The toggle checks `!== false` so only an explicit `false` disables it.
  inlineToolCalls: true,
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  isLoaded: false,
  availableModels: [],
  currentModelId: null,
  modelsLoading: false,
  modelsError: null,
  availableModes: [],
  currentModeId: null,
  activeWorkspace: null,
  operationalWorkspace: null,
  kiroAuth: null,
  kiroAuthChecked: false,
  availableCommands: [],
  liveMcpServers: [],

  loadSettings: async () => {
    try {
      const settings = await ipc.getSettings()
      const merged = { ...defaultSettings, ...settings }
      // If settings look like defaults (user was onboarded but confy lost data),
      // restore from backup to recover projectPrefs, iconOverrides, etc.
      if (!merged.hasOnboardedV2) {
        try {
          const { loadBackup } = await import('@/lib/history-store')
          const backup = await loadBackup()
          if (backup.settings?.hasOnboardedV2) {
            const restored = { ...merged, ...backup.settings }
            // Seed transient currentModelId from the persisted default so the
            // picker shows the right value before any session_init lands.
            const seedModel = restored.defaultModel ?? null
            set({ settings: restored, isLoaded: true, currentModelId: seedModel })
            ipc.saveSettings(restored).catch(() => {})
            return
          }
        } catch { /* backup load is best-effort */ }
      }
      const seedModel = merged.defaultModel ?? null
      set({ settings: merged, isLoaded: true, currentModelId: seedModel })
    } catch {
      set({ isLoaded: true })
    }
  },

  saveSettings: async (settings) => {
    const prev = get().settings
    await ipc.saveSettings(settings)
    set({ settings })
    // Emit a settings_changed event per key that actually changed. We only
    // send the key name, never the value — e.g. the default model id is a
    // user-chosen string we don't need in analytics.
    const keys: Array<keyof AppSettings> = [
      'kiroBin', 'defaultModel', 'autoApprove', 'respectGitignore',
      'coAuthor', 'coAuthorJsonReport', 'notifications', 'fontSize',
      'chatFontSize',
      'sidebarPosition', 'analyticsEnabled', 'theme', 'customAppIcon',
    ]
    for (const k of keys) {
      if (prev[k] !== settings[k]) track('settings_changed', { key: String(k) })
    }
  },

  fetchModels: async (kiroBin?: string) => {
    set({ modelsLoading: true, modelsError: null })
    try {
      const result = await ipc.listModels(kiroBin)
      set({
        availableModels: result.availableModels,
        currentModelId: result.currentModelId,
        modelsLoading: false,
      })
    } catch (err) {
      set({
        modelsLoading: false,
        modelsError: err instanceof Error ? err.message : 'Failed to fetch models',
      })
    }
  },

  setActiveWorkspace: (workspace, operationalWs) => {
    const { settings, currentModelId } = get()
    if (!workspace) { set({ activeWorkspace: null, operationalWorkspace: null }); return }
    const prefs = settings.projectPrefs?.[workspace]
    // Resolution order: project pref → existing currentModelId → global default.
    // Falling back to defaultModel keeps the picker stable when a user opens a
    // project that has no per-project pref yet.
    const fallback = currentModelId ?? settings.defaultModel ?? null
    const newModelId = prefs?.modelId !== undefined ? prefs.modelId : fallback
    const opWs = operationalWs ?? workspace
    // Only update if something actually changed
    const current = get()
    if (current.activeWorkspace === workspace && current.currentModelId === newModelId && current.operationalWorkspace === opWs) return
    set({ activeWorkspace: workspace, operationalWorkspace: opWs, currentModelId: newModelId ?? null })
    // Ensure .kiro/goal/ directory exists for this project (once per session)
    if (!goalDirEnsured.has(workspace)) {
      goalDirEnsured.add(workspace)
      ipc.goalEnsureDir(workspace).catch(() => {})
    }
  },

  setProjectPref: (workspace, patch) => {
    const { settings } = get()
    const existing = settings.projectPrefs?.[workspace] ?? {}
    const updated: AppSettings = {
      ...settings,
      projectPrefs: {
        ...settings.projectPrefs,
        [workspace]: { ...existing, ...patch },
      },
    }
    // Single set() to avoid two render cycles
    set({
      settings: updated,
      ...(patch.modelId !== undefined ? { currentModelId: patch.modelId } : {}),
    })
    if (patch.modelId !== undefined) track('feature_used', { feature: 'model_switch' })
    ipc.saveSettings(updated).catch(() => {})
  },

  checkAuth: async () => {
    try {
      const { settings } = get()
      console.log('[auth] checkAuth called with kiroBin:', settings.kiroBin)
      const result = await ipc.kiroWhoami(settings.kiroBin)
      console.log('[auth] whoami result:', JSON.stringify(result))
      if (result.accountType) {
        set({
          kiroAuth: {
            email: result.email ?? null,
            accountType: result.accountType,
            region: result.region,
            startUrl: result.startUrl,
          },
          kiroAuthChecked: true,
        })
        console.log('[auth] authenticated:', result.accountType, result.email)
      } else {
        console.log('[auth] whoami returned no accountType')
        set({ kiroAuth: null, kiroAuthChecked: true })
      }
    } catch (err) {
      console.warn('[auth] checkAuth failed:', err)
      set({ kiroAuth: null, kiroAuthChecked: true })
    }
  },

  logout: async () => {
    try {
      const { settings } = get()
      await ipc.kiroLogout(settings.kiroBin)
    } catch { /* ignore */ }
    set({ kiroAuth: null })
  },

  openLogin: async () => {
    const { settings } = get()
    console.log('[auth] openLogin called with kiroBin:', settings.kiroBin)
    // If already logged in, just refresh state instead of opening terminal
    try {
      const result = await ipc.kiroWhoami(settings.kiroBin)
      console.log('[auth] openLogin whoami check:', JSON.stringify(result))
      if (result.accountType) {
        set({
          kiroAuth: {
            email: result.email ?? null,
            accountType: result.accountType,
            region: result.region,
            startUrl: result.startUrl,
          },
          kiroAuthChecked: true,
        })
        console.log('[auth] already logged in, skipping terminal')
        return
      }
    } catch (err) {
      console.log('[auth] openLogin whoami failed (not logged in):', err)
    }
    console.log('[auth] opening terminal with:', `${settings.kiroBin} login`)
    ipc.openTerminalWithCommand(`${settings.kiroBin} login`).catch((err) => {
      console.error('[auth] openTerminalWithCommand failed:', err)
    })
  },
}))

/**
 * Resolve the chat font size with fallback to the global UI font size.
 * Use everywhere chat content (markdown, assistant text, user bubble, chat textarea) is rendered
 * so that users on existing settings (no chatFontSize key) keep current behavior.
 */
export const selectChatFontSize = (s: { settings: AppSettings }): number =>
  s.settings.chatFontSize ?? s.settings.fontSize ?? 15
