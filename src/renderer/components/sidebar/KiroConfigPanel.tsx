import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconRobot, IconBolt, IconCompass, IconChevronRight, IconSearch, IconPlug, IconEdit, IconHandFinger, IconPlus, IconAlignLeft, IconSettings, IconBug, IconDownload, IconDots } from '@tabler/icons-react'
import { getVersion } from '@tauri-apps/api/app'
import { KiroGhostIcon } from '@/components/icons/KiroGhostIcon'
import { useKiroStore } from '@/stores/kiroStore'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useJsDebugStore } from '@/stores/jsDebugStore'
import { useUpdateStore, type UpdateStatus } from '@/stores/updateStore'
import { ipc } from '@/lib/ipc'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { KiroFileViewer } from './KiroFileViewer'
import { type ViewerState, EMPTY_ARRAY, getAgentStack, SectionToggle, InlineSearch } from './kiro-config-helpers'
import { AgentRow, AgentStackGroup } from './KiroAgentSection'
import { SkillRow } from './KiroSkillRow'
import { SteeringRow } from './KiroSteeringRow'
import { McpRow } from './KiroMcpRow'
import { AddMcpServerDialog } from './AddMcpServerDialog'
import { HeaderUserMenu } from '@/components/header-user-menu'
import { useMenuPosition } from '@/hooks/useMenuPosition'
import { measureMemory, formatBytes } from '@/lib/thread-memory'
import { deriveConnectionUiState, type ConnectionUiState } from '@/lib/connection-state'

const MEMORY_SPIKE_THRESHOLD = 100 * 1024 * 1024
const MEMORY_CHECK_INTERVAL_MS = 5000

const hasUpdateIndicator = (status: UpdateStatus): boolean =>
  status === 'available' || status === 'downloading' || status === 'ready'

const CONNECTION_DOT: Record<ConnectionUiState, { color: string; label: string; pulse: boolean }> = {
  connected: { color: '#34d399', label: 'Connected', pulse: false },
  connecting: { color: '#fbbf24', label: 'Connecting…', pulse: true },
  reconnecting: { color: '#fbbf24', label: 'Reconnecting…', pulse: true },
  error: { color: '#f87171', label: 'Connection error', pulse: false },
  offline: { color: '#9a9a9a', label: 'Offline', pulse: false },
}

export const KiroConfigPanel = memo(function KiroConfigPanel({
  collapsed,
  onToggleCollapse,
}: {
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const agents = useKiroStore((s) => s.config.agents)
  const skills = useKiroStore((s) => s.config.skills)
  const steeringRules = useKiroStore((s) => s.config.steeringRules)
  const mcpServersRaw = useKiroStore((s) => s.config.mcpServers)
  const mcpServers = mcpServersRaw ?? EMPTY_ARRAY
  const prompts = useKiroStore((s) => s.config.prompts)
  const loaded = useKiroStore((s) => s.loaded)
  const loadConfig = useKiroStore((s) => s.loadConfig)
  const activeWorkspace = useTaskStore((s) => {
    const id = s.selectedTaskId
    if (id) {
      const t = s.tasks[id]
      return t?.originalWorkspace ?? t?.workspace
    }
    return s.pendingWorkspace
  }) ?? null

  const [agentsOpen, setAgentsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [addMcpOpen, setAddMcpOpen] = useState(false)

  // Footer state (merged into header row)
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen)
  const updateStatus = useUpdateStore((s) => s.status)
  const isUpdateAvailable = updateStatus === 'available'
  const triggerDownload = useUpdateStore((s) => s.triggerDownload)
  const isIndicatorVisible = hasUpdateIndicator(updateStatus)
  const connectionStatus = useTaskStore((s) => s.connectionStatus)
  const connectionUi = deriveConnectionUiState(connectionStatus)
  const connectionDot = CONNECTION_DOT[connectionUi]
  const [isMemorySpike, setIsMemorySpike] = useState(false)
  const [spikeTotal, setSpikeTotal] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  useMenuPosition(menuRef, menuOpen ? { x: menuPos.left, y: menuPos.top } : null)

  useEffect(() => { void loadConfig(activeWorkspace ?? undefined) }, [loadConfig, activeWorkspace])

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => {
      const report = measureMemory(
        useTaskStore.getState(),
        useDebugStore.getState(),
        useJsDebugStore.getState(),
      )
      const isHot = report.grandTotal >= MEMORY_SPIKE_THRESHOLD
      setIsMemorySpike(isHot)
      if (isHot) setSpikeTotal(formatBytes(report.grandTotal))
    }
    check()
    const id = window.setInterval(check, MEMORY_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const handleOpenMenu = useCallback(() => {
    setMenuOpen((v) => {
      if (!v && menuBtnRef.current) {
        const r = menuBtnRef.current.getBoundingClientRect()
        setMenuPos({ top: r.top - 8, left: r.left })
      }
      return !v
    })
  }, [])

  const handleSettingsClick = useCallback(() => {
    setMenuOpen(false)
    setSettingsOpen(true, isMemorySpike ? 'memory' : undefined)
  }, [setSettingsOpen, isMemorySpike])

  const handleDebugClick = useCallback(() => {
    setMenuOpen(false)
    useDebugStore.getState().toggleOpen()
  }, [])

  const handleUpdateClick = useCallback(() => {
    setMenuOpen(false)
    triggerDownload?.()
  }, [triggerDownload])

  // Start/stop watching the project's .kiro directory
  const prevWatchedRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevWatchedRef.current
    if (prev && prev !== activeWorkspace) {
      ipc.unwatchKiroPath(prev).catch(() => {})
    }
    if (activeWorkspace) {
      ipc.watchKiroPath(activeWorkspace).catch(() => {})
      prevWatchedRef.current = activeWorkspace
    } else {
      prevWatchedRef.current = null
    }
    return () => {
      if (prevWatchedRef.current) {
        ipc.unwatchKiroPath(prevWatchedRef.current).catch(() => {})
        prevWatchedRef.current = null
      }
    }
  }, [activeWorkspace])

  const lowerSearch = search.toLowerCase()

  const agentGroups = useMemo(() => {
    const filtered = agents.filter((a) =>
      !lowerSearch || a.name.toLowerCase().includes(lowerSearch) || a.description.toLowerCase().includes(lowerSearch))
    const map = new Map<string, typeof agents>()
    for (const agent of filtered) {
      const stack = getAgentStack(agent.name)
      if (!map.has(stack)) map.set(stack, [])
      map.get(stack)!.push(agent)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] === 'custom' ? 1 : b[0] === 'custom' ? -1 : a[0].localeCompare(b[0]))
  }, [agents, lowerSearch])

  const filteredSkills = useMemo(() =>
    skills.filter((s) => !lowerSearch || s.name.toLowerCase().includes(lowerSearch)), [skills, lowerSearch])
  const filteredRules = useMemo(() =>
    steeringRules.filter((r) => !lowerSearch || r.name.toLowerCase().includes(lowerSearch) || r.excerpt.toLowerCase().includes(lowerSearch)), [steeringRules, lowerSearch])
  const filteredMcp = useMemo(() =>
    mcpServers.filter((m) => !lowerSearch || m.name.toLowerCase().includes(lowerSearch)), [mcpServers, lowerSearch])
  const filteredPrompts = useMemo(() =>
    prompts.filter((p) => !lowerSearch || p.name.toLowerCase().includes(lowerSearch) || p.content.toLowerCase().includes(lowerSearch)), [prompts, lowerSearch])

  const totalAgents = agentGroups.reduce((n, [, a]) => n + a.length, 0)
  const mcpErrorCount = filteredMcp.filter((m) => m.status === 'error' || m.status === 'needs-auth').length
  const openViewer = useCallback((v: ViewerState) => setViewer(v), [])
  const closeViewer = useCallback(() => setViewer(null), [])

  if (!loaded) {
    return (
      <div className="flex flex-col gap-1.5 px-2 py-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-7 w-full rounded-lg skeleton" />)}
      </div>
    )
  }

  // Always render the panel once loaded — even with no items, the user needs
  // the "Add MCP server" button. The panel is hidden by the parent sidebar
  // when the workspace has no .kiro directory at all.
  if (agents.length === 0 && skills.length === 0 && steeringRules.length === 0 && mcpServers.length === 0 && prompts.length === 0) {
    // Nothing configured yet — show just the "Add MCP server" affordance
    // so a fresh install isn't a dead end.
    return (
      <>
        <div className="flex w-full min-w-0 flex-col">
          <div className="mb-0.5 flex items-center justify-between pr-1.5">
            <button type="button" onClick={onToggleCollapse}
              className="flex h-6 cursor-pointer items-center gap-1.5 pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-muted-foreground transition-colors">
              <KiroGhostIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              Kirodex
            </button>
            <div className="flex items-center gap-0.5">
              {connectionUi !== 'connected' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span role="status" aria-label={connectionDot.label} className="relative flex size-5 shrink-0 items-center justify-center">
                      {connectionDot.pulse && <span className="absolute size-2 animate-ping rounded-full" style={{ background: `${connectionDot.color}55` }} />}
                      <span className="relative size-1.5 rounded-full" style={{ background: connectionDot.color }} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{connectionDot.label}</TooltipContent>
                </Tooltip>
              )}
              {isMemorySpike && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={handleSettingsClick} aria-label={`Memory spike: ${spikeTotal}`}
                      className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive hover:bg-destructive/25 transition-colors">
                      <span className="size-1.5 rounded-full bg-destructive" /> Memory
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Memory spike: {spikeTotal}</TooltipContent>
                </Tooltip>
              )}
              {!isMemorySpike && isUpdateAvailable && (
                <button type="button" aria-label="Download and install update" onClick={handleUpdateClick}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium leading-none text-primary-foreground transition-colors hover:bg-primary/80">
                  <IconDownload size={10} /> Update
                </button>
              )}
              {!isMemorySpike && !isUpdateAvailable && isIndicatorVisible && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span data-testid="update-indicator-dot" className="relative flex size-5 shrink-0 items-center justify-center" aria-label="Update in progress">
                      <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/40" />
                      <span className="relative size-1.5 rounded-full bg-emerald-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Update in progress</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button ref={menuBtnRef} type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={handleOpenMenu}
                    className={cn('inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      menuOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                    <IconDots className="size-3" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">More</TooltipContent>
              </Tooltip>
              <HeaderUserMenu />
            </div>
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setAddMcpOpen(true)}
              className="flex w-full h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-left text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <IconPlus className="size-3.5 shrink-0" aria-hidden />
              <IconPlug className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
              <span className="flex-1 truncate">Add MCP server…</span>
            </button>
          )}
        </div>
        <AddMcpServerDialog open={addMcpOpen} onOpenChange={setAddMcpOpen} workspace={activeWorkspace} />
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[199]" onClick={() => setMenuOpen(false)} />
            <div ref={menuRef} role="menu" className="fixed z-[200] min-w-[180px] -translate-y-full rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: menuPos.top, left: menuPos.left }}>
              <button type="button" role="menuitem" onClick={handleSettingsClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
                <IconSettings className={cn('size-3.5', isMemorySpike && 'text-destructive')} aria-hidden />
                <span className={cn(isMemorySpike && 'font-medium text-destructive')}>{isMemorySpike ? 'Memory Spike' : 'Settings'}</span>
                {isMemorySpike && <span className="ml-auto text-[10px] text-destructive">{spikeTotal}</span>}
              </button>
              <button type="button" role="menuitem" onClick={handleDebugClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
                <IconBug className="size-3.5" aria-hidden /> Debug panel
              </button>
              {isUpdateAvailable && (
                <>
                  <div className="my-1 border-t border-border/50" />
                  <button type="button" role="menuitem" onClick={handleUpdateClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
                    <IconDownload className="size-3.5" aria-hidden /> Install update
                  </button>
                </>
              )}
              {appVersion && (
                <>
                  <div className="my-1 border-t border-border/50" />
                  <div className="px-3 py-1 text-[10px] tabular-nums text-muted-foreground/70">v{appVersion}</div>
                </>
              )}
            </div>
          </>
        )}
      </>
    )
  }

  const noResults = !!search && totalAgents === 0 && filteredSkills.length === 0 && filteredRules.length === 0 && filteredMcp.length === 0 && filteredPrompts.length === 0

  return (
    <>
      <div className="flex w-full min-w-0 flex-col">
        <div className="mb-0.5 flex items-center justify-between pr-1.5">
          <button type="button" onClick={onToggleCollapse}
            className="flex h-6 cursor-pointer items-center gap-1.5 pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-muted-foreground transition-colors">
            <KiroGhostIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            Kirodex
          </button>
          <div className="flex items-center gap-0.5">
            {!collapsed && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex size-5 items-center justify-center text-muted-foreground/70" aria-label="Drag tip">
                      <IconHandFinger className="size-3" aria-hidden />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p className="text-[11px] font-medium">Drag into chat</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">Drop any agent, skill, or steering rule into the message box to attach it as context.</p>
                  </TooltipContent>
                </Tooltip>
                {(agents.length + skills.length + steeringRules.length + mcpServers.length) > 10 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => setSearching((v) => !v)}
                        className={cn('inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
                          searching ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                        <IconSearch className="size-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Filter</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
            {connectionUi !== 'connected' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span role="status" aria-label={connectionDot.label} className="relative flex size-5 shrink-0 items-center justify-center">
                    {connectionDot.pulse && <span className="absolute size-2 animate-ping rounded-full" style={{ background: `${connectionDot.color}55` }} />}
                    <span className="relative size-1.5 rounded-full" style={{ background: connectionDot.color }} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{connectionDot.label}</TooltipContent>
              </Tooltip>
            )}
            {isMemorySpike && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={handleSettingsClick} aria-label={`Memory spike: ${spikeTotal}`}
                    className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive hover:bg-destructive/25 transition-colors">
                    <span className="size-1.5 rounded-full bg-destructive" /> Memory
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Memory spike: {spikeTotal}</TooltipContent>
              </Tooltip>
            )}
            {!isMemorySpike && isUpdateAvailable && (
              <button type="button" aria-label="Download and install update" onClick={handleUpdateClick}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium leading-none text-primary-foreground transition-colors hover:bg-primary/80">
                <IconDownload size={10} /> Update
              </button>
            )}
            {!isMemorySpike && !isUpdateAvailable && isIndicatorVisible && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span data-testid="update-indicator-dot" className="relative flex size-5 shrink-0 items-center justify-center" aria-label="Update in progress">
                    <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/40" />
                    <span className="relative size-1.5 rounded-full bg-emerald-400" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Update in progress</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button ref={menuBtnRef} type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={handleOpenMenu}
                  className={cn('inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    menuOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                  <IconDots className="size-3" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">More</TooltipContent>
            </Tooltip>
            <HeaderUserMenu />
          </div>
        </div>

        {!collapsed && (
          <>
            {searching && <InlineSearch value={search} onChange={setSearch} onClose={() => setSearching(false)} />}

            {steeringRules.length > 0 && (filteredRules.length > 0 || !search) && (
              <SectionToggle icon={IconCompass} iconColor="text-emerald-600 dark:text-emerald-400" label="Steering" count={filteredRules.length} expanded={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
            )}
            {rulesOpen && filteredRules.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l border-border/30 mx-1 px-1.5 py-px">
                {filteredRules.map((rule) => <SteeringRow key={`${rule.source}-${rule.name}`} rule={rule} onOpen={openViewer} />)}
              </ul>
            )}

            {skills.length > 0 && (filteredSkills.length > 0 || !search) && (
              <SectionToggle icon={IconBolt} iconColor="text-amber-600 dark:text-amber-400" label="Skills" count={filteredSkills.length} expanded={skillsOpen} onToggle={() => setSkillsOpen((v) => !v)} />
            )}
            {skillsOpen && filteredSkills.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l border-border/30 mx-1 px-1.5 py-px">
                {filteredSkills.map((skill) => <SkillRow key={`${skill.source}-${skill.name}`} skill={skill} onOpen={openViewer} />)}
              </ul>
            )}

            {agents.length > 0 && (totalAgents > 0 || !search) && (
              <SectionToggle icon={IconRobot} iconColor="text-violet-600 dark:text-violet-400" label="Agents" count={totalAgents} expanded={agentsOpen} onToggle={() => setAgentsOpen((v) => !v)} />
            )}
            {agentsOpen && totalAgents > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l border-border/30 mx-1 px-1.5 py-px">
                {agentGroups.map(([stack, agentList]) =>
                  agentList.length === 1
                    ? <AgentRow key={`${agentList[0].source}-${agentList[0].name}`} agent={agentList[0]} onOpen={openViewer} />
                    : <AgentStackGroup key={stack} stack={stack} agents={agentList} onOpen={openViewer} />
                )}
              </ul>
            )}

            {mcpServers.length > 0 && (filteredMcp.length > 0 || !search) && (
              <div className="flex items-center">
                <SectionToggle icon={IconPlug} iconColor="text-sky-600 dark:text-sky-400" label="MCP" count={filteredMcp.length} errorCount={mcpErrorCount} expanded={mcpOpen} onToggle={() => setMcpOpen((v) => !v)} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setAddMcpOpen(true)}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <IconPlus className="size-3" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Add MCP server</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        const fp = mcpServers[0]?.filePath
                        if (fp) openViewer({ filePath: fp, title: 'MCP Config' })
                      }}
                      className="mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <IconEdit className="size-3" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Edit mcp.json</TooltipContent>
                </Tooltip>
              </div>
            )}
            {/* Show an "Add MCP server" affordance even when there are zero servers configured. */}
            {mcpServers.length === 0 && (
              <button
                type="button"
                onClick={() => setAddMcpOpen(true)}
                className="flex w-full h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-left text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <IconPlus className="size-3.5 shrink-0" aria-hidden />
                <IconPlug className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                <span className="flex-1 truncate">Add MCP server…</span>
              </button>
            )}
            {mcpOpen && filteredMcp.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l border-border/30 mx-1 px-1.5 py-px">
                {filteredMcp.map((server) => <McpRow key={server.name} server={server} onOpen={openViewer} />)}
              </ul>
            )}

            {prompts.length > 0 && (filteredPrompts.length > 0 || !search) && (
              <SectionToggle icon={IconAlignLeft} iconColor="text-indigo-600 dark:text-indigo-400" label="Prompts" count={filteredPrompts.length} expanded={promptsOpen} onToggle={() => setPromptsOpen((v) => !v)} />
            )}
            {promptsOpen && filteredPrompts.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l border-border/30 mx-1 px-1.5 py-px">
                {filteredPrompts.map((prompt) => (
                  <li key={`${prompt.source}-${prompt.name}`}>
                    <button
                      type="button"
                      onClick={() => openViewer({ filePath: prompt.filePath, title: prompt.name })}
                      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <IconAlignLeft className="size-3 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                      <span className="flex-1 truncate">{prompt.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">{prompt.source}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {noResults && <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">No matches</p>}
          </>
        )}
      </div>

      {viewer && <KiroFileViewer filePath={viewer.filePath} title={viewer.title} onClose={closeViewer} />}
      <AddMcpServerDialog open={addMcpOpen} onOpenChange={setAddMcpOpen} workspace={activeWorkspace} />
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setMenuOpen(false)} />
          <div ref={menuRef} role="menu" className="fixed z-[200] min-w-[180px] -translate-y-full rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: menuPos.top, left: menuPos.left }}>
            <button type="button" role="menuitem" onClick={handleSettingsClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
              <IconSettings className={cn('size-3.5', isMemorySpike && 'text-destructive')} aria-hidden />
              <span className={cn(isMemorySpike && 'font-medium text-destructive')}>{isMemorySpike ? 'Memory Spike' : 'Settings'}</span>
              {isMemorySpike && <span className="ml-auto text-[10px] text-destructive">{spikeTotal}</span>}
            </button>
            <button type="button" role="menuitem" onClick={handleDebugClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
              <IconBug className="size-3.5" aria-hidden /> Debug panel
            </button>
            {isUpdateAvailable && (
              <>
                <div className="my-1 border-t border-border/50" />
                <button type="button" role="menuitem" onClick={handleUpdateClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent">
                  <IconDownload className="size-3.5" aria-hidden /> Install update
                </button>
              </>
            )}
            {appVersion && (
              <>
                <div className="my-1 border-t border-border/50" />
                <div className="px-3 py-1 text-[10px] tabular-nums text-muted-foreground/70">v{appVersion}</div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
})
