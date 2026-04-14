import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getKiroConfig: vi.fn().mockResolvedValue({ agents: [], skills: [], steeringRules: [], mcpServers: [] }),
    onMcpConnecting: vi.fn().mockReturnValue(() => {}),
    onMcpUpdate: vi.fn().mockReturnValue(() => {}),
  },
}))

import { useKiroStore, initKiroListeners } from './kiroStore'
import { ipc } from '@/lib/ipc'

const makeMcpServers = () => [
  { name: 'Slack', enabled: true, transport: 'stdio' as const, command: 'slack-mcp', filePath: '/p' },
  { name: 'GitHub', enabled: true, transport: 'http' as const, url: 'https://gh.mcp', filePath: '/p2' },
  { name: 'Disabled', enabled: false, transport: 'stdio' as const, command: 'x', filePath: '/p3' },
]

beforeEach(() => {
  vi.clearAllMocks()
  useKiroStore.setState({
    config: { agents: [], skills: [], steeringRules: [], mcpServers: makeMcpServers() },
    loading: false,
    loaded: true,
  })
})

describe('kiroStore', () => {
  describe('loadConfig', () => {
    it('loads config from IPC', async () => {
      vi.mocked(ipc.getKiroConfig).mockResolvedValue({
        agents: [{ name: 'Agent1', description: 'desc', tools: [], source: 'local', filePath: '/a' }],
        skills: [],
        steeringRules: [],
        mcpServers: [],
      } as never)
      useKiroStore.setState({ loaded: false })
      await useKiroStore.getState().loadConfig('/project')
      expect(ipc.getKiroConfig).toHaveBeenCalledWith('/project')
      expect(useKiroStore.getState().config.agents).toHaveLength(1)
      expect(useKiroStore.getState().loaded).toBe(true)
    })

    it('filters out agents without filePath', async () => {
      vi.mocked(ipc.getKiroConfig).mockResolvedValue({
        agents: [
          { name: 'Good', description: '', tools: [], source: 'local', filePath: '/a' },
          { name: 'Bad', description: '', tools: [], source: 'local', filePath: '' },
        ],
        skills: [],
        steeringRules: [],
        mcpServers: [],
      } as never)
      await useKiroStore.getState().loadConfig()
      expect(useKiroStore.getState().config.agents).toHaveLength(1)
      expect(useKiroStore.getState().config.agents[0].name).toBe('Good')
    })

    it('sets loaded on error', async () => {
      vi.mocked(ipc.getKiroConfig).mockRejectedValue(new Error('fail'))
      useKiroStore.setState({ loaded: false })
      await useKiroStore.getState().loadConfig()
      expect(useKiroStore.getState().loaded).toBe(true)
    })

    it('prevents concurrent loads', async () => {
      useKiroStore.setState({ loading: true })
      await useKiroStore.getState().loadConfig()
      expect(ipc.getKiroConfig).not.toHaveBeenCalled()
    })

    it('sets loading false after completion', async () => {
      await useKiroStore.getState().loadConfig()
      expect(useKiroStore.getState().loading).toBe(false)
    })
  })

  describe('setMcpError', () => {
    it('patches matching server with error', () => {
      useKiroStore.getState().setMcpError('Slack', 'OAuth failed')
      const slack = useKiroStore.getState().config.mcpServers?.find((s) => s.name === 'Slack')
      expect(slack?.error).toBe('OAuth failed')
      expect(slack?.status).toBe('error')
    })

    it('is case-insensitive', () => {
      useKiroStore.getState().setMcpError('slack', 'broken')
      const slack = useKiroStore.getState().config.mcpServers?.find((s) => s.name === 'Slack')
      expect(slack?.error).toBe('broken')
    })

    it('no-ops for unknown server', () => {
      const before = useKiroStore.getState().config.mcpServers
      useKiroStore.getState().setMcpError('Unknown', 'err')
      expect(useKiroStore.getState().config.mcpServers).toEqual(before)
    })
  })

  describe('updateMcpServer', () => {
    it('patches matching server', () => {
      useKiroStore.getState().updateMcpServer('GitHub', { status: 'ready' })
      const gh = useKiroStore.getState().config.mcpServers?.find((s) => s.name === 'GitHub')
      expect(gh?.status).toBe('ready')
    })

    it('patches with oauthUrl', () => {
      useKiroStore.getState().updateMcpServer('GitHub', { oauthUrl: 'https://auth.example.com' })
      const gh = useKiroStore.getState().config.mcpServers?.find((s) => s.name === 'GitHub')
      expect(gh?.oauthUrl).toBe('https://auth.example.com')
    })
  })

  describe('initKiroListeners', () => {
    it('registers MCP listeners and returns cleanup', () => {
      const cleanup = initKiroListeners()
      expect(ipc.onMcpConnecting).toHaveBeenCalled()
      expect(ipc.onMcpUpdate).toHaveBeenCalled()
      expect(typeof cleanup).toBe('function')
    })

    it('onMcpConnecting sets enabled servers to connecting', () => {
      // Get the callback registered with onMcpConnecting
      const connectingCallback = vi.mocked(ipc.onMcpConnecting).mock.calls[0]?.[0]
      if (!connectingCallback) {
        initKiroListeners()
      }
      const cb = vi.mocked(ipc.onMcpConnecting).mock.calls[0][0]
      cb()
      const servers = useKiroStore.getState().config.mcpServers ?? []
      const slack = servers.find((s) => s.name === 'Slack')
      const disabled = servers.find((s) => s.name === 'Disabled')
      expect(slack?.status).toBe('connecting')
      expect(disabled?.status).toBeUndefined() // disabled servers not touched
    })

    it('onMcpUpdate patches specific server', () => {
      initKiroListeners()
      const cb = vi.mocked(ipc.onMcpUpdate).mock.calls[0][0]
      cb({ serverName: 'Slack', status: 'ready' })
      const slack = useKiroStore.getState().config.mcpServers?.find((s) => s.name === 'Slack')
      expect(slack?.status).toBe('ready')
    })
  })
})
