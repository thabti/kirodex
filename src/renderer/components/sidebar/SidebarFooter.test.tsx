import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUpdateStore } from '@/stores/updateStore'
import type { UpdateStatus } from '@/stores/updateStore'

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ setSettingsOpen: vi.fn(), connectionStatus: { state: 'connected' }, selectedTaskId: null, pendingWorkspace: null }),
    { getState: () => ({ setSettingsOpen: vi.fn(), connectionStatus: { state: 'connected' } }), setState: vi.fn() },
  ),
}))

vi.mock('@/stores/kiroStore', () => ({
  useKiroStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ config: { agents: [], skills: [], steeringRules: [], mcpServers: [], prompts: [] }, loaded: true, loadConfig: vi.fn() }),
    { getState: () => ({ config: { agents: [], skills: [], steeringRules: [], mcpServers: [], prompts: [] }, loaded: true }) },
  ),
}))

vi.mock('@/stores/debugStore', () => ({
  useDebugStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isOpen: false }),
    { getState: () => ({ toggleOpen: vi.fn() }) },
  ),
}))

vi.mock('@/stores/jsDebugStore', () => ({
  useJsDebugStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({}),
    { getState: () => ({}) },
  ),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: { watchKiroPath: vi.fn().mockResolvedValue(undefined), unwatchKiroPath: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0'),
}))

vi.mock('@/lib/thread-memory', () => ({
  measureMemory: () => ({ threads: [], threadsTotal: 0, debugTotal: 0, softDeletedTotal: 0, grandTotal: 0 }),
  formatBytes: (n: number) => `${n} B`,
}))

vi.mock('@/hooks/useMenuPosition', () => ({
  useMenuPosition: vi.fn(),
}))

vi.mock('@/lib/connection-state', () => ({
  deriveConnectionUiState: () => 'connected',
}))

vi.mock('@/components/header-user-menu', () => ({
  HeaderUserMenu: () => <div data-testid="header-user-menu" />,
}))

import { KiroConfigPanel } from './KiroConfigPanel'

const wrap = (ui: React.ReactNode) => <TooltipProvider>{ui}</TooltipProvider>

const resetUpdateStore = (overrides: Partial<{ status: UpdateStatus; triggerDownload: (() => void) | null; triggerRestart: (() => Promise<void>) | null }> = {}) => {
  useUpdateStore.setState({
    status: 'idle',
    updateInfo: null,
    progress: null,
    error: null,
    dismissedVersion: null,
    triggerDownload: null,
    triggerRestart: null,
    ...overrides,
  })
}

beforeEach(() => {
  resetUpdateStore()
})

describe('KiroConfigPanel update indicator', () => {
  it('does not show indicator dot when status is idle', () => {
    resetUpdateStore({ status: 'idle' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('does not show indicator dot when status is checking', () => {
    resetUpdateStore({ status: 'checking' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('shows indicator dot when status is downloading', () => {
    resetUpdateStore({ status: 'downloading' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.getByTestId('update-indicator-dot')).toBeInTheDocument()
  })

  it('shows indicator dot when status is ready', () => {
    resetUpdateStore({ status: 'ready' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.getByTestId('update-indicator-dot')).toBeInTheDocument()
  })

  it('does not show indicator dot when status is error', () => {
    resetUpdateStore({ status: 'error' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.queryByTestId('update-indicator-dot')).not.toBeInTheDocument()
  })

  it('shows "Update" badge only when status is available', () => {
    resetUpdateStore({ status: 'available', triggerDownload: vi.fn() })
    render(wrap(<KiroConfigPanel />))
    expect(screen.getByText('Update')).toBeInTheDocument()
  })

  it('does not show "Update" badge when status is downloading', () => {
    resetUpdateStore({ status: 'downloading' })
    render(wrap(<KiroConfigPanel />))
    expect(screen.queryByText('Update')).not.toBeInTheDocument()
  })
})
