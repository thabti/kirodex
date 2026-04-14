import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue({ availableModels: [{ modelId: 'm1', name: 'Model 1' }], currentModelId: 'm1' }),
    kiroWhoami: vi.fn().mockResolvedValue({ accountType: 'pro', email: 'test@test.com', region: 'us-east-1' }),
    kiroLogout: vi.fn().mockResolvedValue(undefined),
    openTerminalWithCommand: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}))

import { useSettingsStore } from './settingsStore'
import { ipc } from '@/lib/ipc'

const defaultState = {
  settings: { kiroBin: 'kiro-cli', agentProfiles: [], fontSize: 13, sidebarPosition: 'left' as const, analyticsEnabled: true },
  isLoaded: false,
  availableModels: [],
  currentModelId: null,
  modelsLoading: false,
  modelsError: null,
  availableModes: [],
  currentModeId: null,
  activeWorkspace: null,
  availableCommands: [],
  liveMcpServers: [],
  kiroAuth: null,
  kiroAuthChecked: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(defaultState)
})

describe('settingsStore', () => {
  describe('loadSettings', () => {
    it('loads settings from IPC and merges with defaults', async () => {
      vi.mocked(ipc.getSettings).mockResolvedValue({ fontSize: 16 } as never)
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().settings.fontSize).toBe(16)
      expect(useSettingsStore.getState().settings.kiroBin).toBe('kiro-cli')
      expect(useSettingsStore.getState().isLoaded).toBe(true)
    })

    it('sets isLoaded even on error', async () => {
      vi.mocked(ipc.getSettings).mockRejectedValue(new Error('fail'))
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().isLoaded).toBe(true)
    })
  })

  describe('saveSettings', () => {
    it('saves settings via IPC and updates state', async () => {
      const newSettings = { ...defaultState.settings, fontSize: 18 }
      await useSettingsStore.getState().saveSettings(newSettings)
      expect(ipc.saveSettings).toHaveBeenCalledWith(newSettings)
      expect(useSettingsStore.getState().settings.fontSize).toBe(18)
    })
  })

  describe('fetchModels', () => {
    it('fetches models and sets state', async () => {
      await useSettingsStore.getState().fetchModels()
      expect(useSettingsStore.getState().availableModels).toHaveLength(1)
      expect(useSettingsStore.getState().currentModelId).toBe('m1')
      expect(useSettingsStore.getState().modelsLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(ipc.listModels).mockRejectedValue(new Error('network error'))
      await useSettingsStore.getState().fetchModels()
      expect(useSettingsStore.getState().modelsError).toBe('network error')
      expect(useSettingsStore.getState().modelsLoading).toBe(false)
    })

    it('sets generic error for non-Error throws', async () => {
      vi.mocked(ipc.listModels).mockRejectedValue('string error')
      await useSettingsStore.getState().fetchModels()
      expect(useSettingsStore.getState().modelsError).toBe('Failed to fetch models')
    })
  })

  describe('setActiveWorkspace', () => {
    it('sets workspace', () => {
      useSettingsStore.getState().setActiveWorkspace('/ws')
      expect(useSettingsStore.getState().activeWorkspace).toBe('/ws')
    })

    it('clears workspace when null', () => {
      useSettingsStore.getState().setActiveWorkspace('/ws')
      useSettingsStore.getState().setActiveWorkspace(null)
      expect(useSettingsStore.getState().activeWorkspace).toBeNull()
    })

    it('applies project model pref', () => {
      useSettingsStore.setState({
        settings: {
          ...defaultState.settings,
          projectPrefs: { '/ws': { modelId: 'claude-4' } },
        },
      })
      useSettingsStore.getState().setActiveWorkspace('/ws')
      expect(useSettingsStore.getState().currentModelId).toBe('claude-4')
    })

    it('bails out when workspace and model unchanged', () => {
      useSettingsStore.setState({ activeWorkspace: '/ws', currentModelId: 'claude-4' })
      useSettingsStore.setState({
        settings: {
          ...defaultState.settings,
          projectPrefs: { '/ws': { modelId: 'claude-4' } },
        },
      })
      // Should not throw or cause issues
      useSettingsStore.getState().setActiveWorkspace('/ws')
      expect(useSettingsStore.getState().activeWorkspace).toBe('/ws')
    })
  })

  describe('setProjectPref', () => {
    it('updates project prefs and model', () => {
      useSettingsStore.getState().setActiveWorkspace('/ws')
      useSettingsStore.getState().setProjectPref('/ws', { modelId: 'gpt-5', autoApprove: true })
      const prefs = useSettingsStore.getState().settings.projectPrefs?.['/ws']
      expect(prefs?.modelId).toBe('gpt-5')
      expect(prefs?.autoApprove).toBe(true)
      expect(useSettingsStore.getState().currentModelId).toBe('gpt-5')
    })

    it('merges with existing prefs', () => {
      useSettingsStore.setState({
        settings: {
          ...defaultState.settings,
          projectPrefs: { '/ws': { modelId: 'old', autoApprove: false } },
        },
      })
      useSettingsStore.getState().setProjectPref('/ws', { autoApprove: true })
      const prefs = useSettingsStore.getState().settings.projectPrefs?.['/ws']
      expect(prefs?.modelId).toBe('old')
      expect(prefs?.autoApprove).toBe(true)
    })
  })

  describe('checkAuth', () => {
    it('sets auth state on success', async () => {
      await useSettingsStore.getState().checkAuth()
      expect(useSettingsStore.getState().kiroAuth).toEqual({
        email: 'test@test.com',
        accountType: 'pro',
        region: 'us-east-1',
        startUrl: undefined,
      })
      expect(useSettingsStore.getState().kiroAuthChecked).toBe(true)
    })

    it('clears auth when whoami returns no accountType', async () => {
      vi.mocked(ipc.kiroWhoami).mockResolvedValue({} as never)
      await useSettingsStore.getState().checkAuth()
      expect(useSettingsStore.getState().kiroAuth).toBeNull()
      expect(useSettingsStore.getState().kiroAuthChecked).toBe(true)
    })

    it('clears auth on error', async () => {
      vi.mocked(ipc.kiroWhoami).mockRejectedValue(new Error('fail'))
      await useSettingsStore.getState().checkAuth()
      expect(useSettingsStore.getState().kiroAuth).toBeNull()
      expect(useSettingsStore.getState().kiroAuthChecked).toBe(true)
    })
  })

  describe('logout', () => {
    it('calls IPC logout and clears auth', async () => {
      useSettingsStore.setState({ kiroAuth: { email: 'a@b.com', accountType: 'pro' } })
      await useSettingsStore.getState().logout()
      expect(ipc.kiroLogout).toHaveBeenCalled()
      expect(useSettingsStore.getState().kiroAuth).toBeNull()
    })

    it('clears auth even when IPC fails', async () => {
      vi.mocked(ipc.kiroLogout).mockRejectedValue(new Error('fail'))
      useSettingsStore.setState({ kiroAuth: { email: 'a@b.com', accountType: 'pro' } })
      await useSettingsStore.getState().logout()
      expect(useSettingsStore.getState().kiroAuth).toBeNull()
    })
  })

  describe('openLogin', () => {
    it('refreshes state if already logged in', async () => {
      vi.mocked(ipc.kiroWhoami).mockResolvedValue({ accountType: 'pro', email: 'a@b.com' } as never)
      await useSettingsStore.getState().openLogin()
      expect(useSettingsStore.getState().kiroAuth?.accountType).toBe('pro')
      expect(ipc.openTerminalWithCommand).not.toHaveBeenCalled()
    })

    it('opens terminal when not logged in', async () => {
      vi.mocked(ipc.kiroWhoami).mockRejectedValue(new Error('not logged in'))
      await useSettingsStore.getState().openLogin()
      expect(ipc.openTerminalWithCommand).toHaveBeenCalledWith('kiro-cli login')
    })
  })
})
