import { create } from 'zustand'
import type { AppSettings, ProjectPrefs } from '@/types'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'

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
  availableCommands: SlashCommand[]
  liveMcpServers: LiveMcpServer[]
  kiroAuth: { email: string | null; accountType: string; region?: string; startUrl?: string } | null
  kiroAuthChecked: boolean
  loadSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  fetchModels: (kiroBin?: string) => Promise<void>
  setActiveWorkspace: (workspace: string | null) => void
  setProjectPref: (workspace: string, patch: Partial<ProjectPrefs>) => void
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
  openLogin: () => void
}

const defaultSettings: AppSettings = {
  kiroBin: 'kiro-cli',
  agentProfiles: [],
  fontSize: 13,
  sidebarPosition: 'left',
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
  kiroAuth: null,
  kiroAuthChecked: false,
  availableCommands: [],
  liveMcpServers: [],

  loadSettings: async () => {
    try {
      const settings = await ipc.getSettings()
      set({ settings: { ...defaultSettings, ...settings }, isLoaded: true })
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
      'sidebarPosition', 'analyticsEnabled',
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

  setActiveWorkspace: (workspace) => {
    const { settings, currentModelId } = get()
    if (!workspace) { set({ activeWorkspace: null }); return }
    const prefs = settings.projectPrefs?.[workspace]
    const newModelId = prefs?.modelId !== undefined ? prefs.modelId : currentModelId
    // Only update if something actually changed
    const current = get()
    if (current.activeWorkspace === workspace && current.currentModelId === newModelId) return
    set({ activeWorkspace: workspace, currentModelId: newModelId ?? null })
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
