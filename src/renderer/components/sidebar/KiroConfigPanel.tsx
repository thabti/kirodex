import { memo, useCallback, useEffect, useMemo, useState, useRef, type ElementType } from 'react'
import {
  IconRobot, IconBolt, IconCompass, IconChevronRight, IconFolderCode, IconCircleDot, IconCircleDashed,
  IconSearch, IconX, IconStack2, IconDatabase, IconWorld, IconTerminal, IconCpu,
  IconTool, IconFlask, IconBook, IconRocket, IconShield, IconPalette,
  IconChartBar, IconCloud, IconGitBranch, IconBoxMultiple, IconPlug, IconCircle,
} from '@tabler/icons-react'
import {
  IconBrandNextjs, IconBrandLaravel, IconBrandPython, IconBrandSwift,
  IconBrandReactNative, IconBrandNodejs, IconBrandDocker, IconBrandAws,
  IconBrandPhp,
} from '@tabler/icons-react'
import { useKiroStore } from '@/stores/kiroStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { KiroAgent, KiroSkill, KiroSteeringRule, KiroMcpServer } from '@/types'
import { KiroFileViewer } from './KiroFileViewer'

const EMPTY_ARRAY: never[] = []

// ── Helpers ───────────────────────────────────────────────────────

function formatName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getAgentStack(name: string): string {
  const prefixes = [
    'nextjs', 'laravel', 'magento', 'strapi', 'expo-react-native',
    'express', 'nodejs', 'devops', 'python', 'swiftui', 'mumzworld',
  ]
  const lower = name.toLowerCase()
  for (const p of prefixes) {
    if (lower.startsWith(p) || lower.includes(`-${p}-`) || lower.includes(`-${p}`)) return p
  }
  return 'other'
}

function getStackLabel(stack: string): string {
  const map: Record<string, string> = {
    nextjs: 'Next.js', laravel: 'Laravel', magento: 'Magento', strapi: 'Strapi',
    'expo-react-native': 'React Native', express: 'Express', nodejs: 'Node.js',
    devops: 'DevOps', python: 'Python', swiftui: 'SwiftUI', mumzworld: 'Mumzworld', other: 'Other',
  }
  return map[stack] ?? formatName(stack)
}

function getAgentRole(name: string): string {
  const stack = getAgentStack(name)
  const raw = stack !== 'other' ? name.slice(stack.length + 1) : name
  return raw ? formatName(raw) : formatName(name)
}

// ── Stack icons + colors ──────────────────────────────────────────

type StackMeta = { icon: ElementType; color: string }

const STACK_META: Record<string, StackMeta> = {
  nextjs:             { icon: IconBrandNextjs,     color: 'text-foreground/70' },
  laravel:            { icon: IconBrandLaravel,    color: 'text-red-400' },
  magento:            { icon: IconBoxMultiple,     color: 'text-orange-400' },
  strapi:             { icon: IconDatabase,        color: 'text-indigo-400' },
  'expo-react-native':{ icon: IconBrandReactNative,color: 'text-cyan-400' },
  express:            { icon: IconStack2,          color: 'text-green-400' },
  nodejs:             { icon: IconBrandNodejs,     color: 'text-emerald-400' },
  devops:             { icon: IconBrandDocker,     color: 'text-sky-400' },
  python:             { icon: IconBrandPython,     color: 'text-yellow-400' },
  swiftui:            { icon: IconBrandSwift,      color: 'text-orange-300' },
  mumzworld:          { icon: IconWorld,           color: 'text-pink-400' },
  other:              { icon: IconTool,            color: 'text-muted-foreground/60' },
}

// Role-level icons for individual agents
function getRoleIcon(name: string): { icon: ElementType; color: string } {
  const n = name.toLowerCase()
  if (n.includes('orchestrator'))  return { icon: IconGitBranch,  color: 'text-violet-400' }
  if (n.includes('workflow'))      return { icon: IconGitBranch,  color: 'text-violet-400' }
  if (n.includes('automation'))    return { icon: IconFlask,      color: 'text-amber-400' }
  if (n.includes('code-review'))   return { icon: IconShield,     color: 'text-rose-400' }
  if (n.includes('documentation')) return { icon: IconBook,       color: 'text-blue-400' }
  if (n.includes('senior'))        return { icon: IconPalette,    color: 'text-teal-400' }
  if (n.includes('expert'))        return { icon: IconRocket,     color: 'text-amber-300' }
  return { icon: IconRobot, color: 'text-muted-foreground/50' }
}

// ── Viewer state ──────────────────────────────────────────────────

interface ViewerState { filePath: string; title: string }

// ── Section toggle ────────────────────────────────────────────────

function SectionToggle({ icon: Icon, iconColor, label, count, errorCount, expanded, onToggle }: {
  icon: typeof IconRobot; iconColor?: string; label: string; count: number; errorCount?: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <button type="button" onClick={onToggle} className={cn(
      'flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-xs text-left',
      'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
      'hover:bg-accent hover:text-foreground transition-colors',
    )}>
      <IconChevronRight className={cn('-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150', expanded && 'rotate-90')} aria-hidden />
      <Icon className={cn('size-3.5 shrink-0', iconColor ?? 'text-muted-foreground/60')} aria-hidden />
      <span className="flex-1 truncate text-xs font-medium text-foreground/90">{label}</span>
      {errorCount && errorCount > 0 ? (
        <span className="flex items-center gap-1">
          <IconCircle className="size-1.5 shrink-0 fill-red-500 text-red-500" aria-hidden />
          <span className="text-[10px] tabular-nums text-red-400/70">{errorCount}</span>
          <span className="text-[10px] text-muted-foreground/30">/</span>
          <span className="text-[10px] tabular-nums text-muted-foreground/50">{count}</span>
        </span>
      ) : (
        <span className="text-[10px] tabular-nums text-muted-foreground/50">{count}</span>
      )}
    </button>
  )
}

function SourceDot({ source }: { source: 'global' | 'local' }) {
  return source === 'local' ? <IconFolderCode className="size-2.5 shrink-0 text-primary/50" aria-hidden /> : null
}

// ── Agent stack group ─────────────────────────────────────────────

const AgentStackGroup = memo(function AgentStackGroup({ stack, agents, onOpen }: {
  stack: string; agents: KiroAgent[]; onOpen: (v: ViewerState) => void
}) {
  const [open, setOpen] = useState(false)
  const meta = STACK_META[stack] ?? STACK_META.other
  const StackIcon = meta.icon

  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} className={cn(
        'flex w-full h-6 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] text-left',
        'text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors',
        'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
      )}>
        <IconChevronRight className={cn('size-2.5 shrink-0 text-muted-foreground/40 transition-transform duration-150', open && 'rotate-90')} aria-hidden />
        <StackIcon className={cn('size-3.5 shrink-0', meta.color)} aria-hidden />
        <span className="flex-1 truncate font-medium text-left">{getStackLabel(stack)}</span>
        <span className="text-[9px] tabular-nums text-muted-foreground/40">{agents.length}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-px py-px pl-3">
          {agents.map((agent) => <AgentRow key={`${agent.source}-${agent.name}`} agent={agent} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  )
})

// ── Agent row ─────────────────────────────────────────────────────

const AgentRow = memo(function AgentRow({ agent, onOpen }: { agent: KiroAgent; onOpen: (v: ViewerState) => void }) {
  const { icon: RoleIcon, color } = getRoleIcon(agent.name)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li
          role="button"
          tabIndex={0}
          onClick={() => agent.filePath && onOpen({ filePath: agent.filePath, title: formatName(agent.name) })}
          onKeyDown={(e) => e.key === 'Enter' && agent.filePath && onOpen({ filePath: agent.filePath, title: formatName(agent.name) })}
          className={cn(
            'flex h-6 min-w-0 w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] cursor-pointer',
            'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors',
          )}
        >
          <RoleIcon className={cn('size-3 shrink-0', color)} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{getAgentRole(agent.name)}</span>
          <SourceDot source={agent.source} />
        </li>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px]">
        <p className="text-[11px] font-medium">{formatName(agent.name)}</p>
        {agent.description && <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">{agent.description.slice(0, 160)}</p>}
        <p className="mt-1 text-[9px] text-muted-foreground/50 font-mono">{(agent.filePath ?? '').replace(/^\/Users\/[^/]+/, '~')}</p>
      </TooltipContent>
    </Tooltip>
  )
})

// ── Skill row ─────────────────────────────────────────────────────

const SkillRow = memo(function SkillRow({ skill, onOpen }: { skill: KiroSkill; onOpen: (v: ViewerState) => void }) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => skill.filePath && onOpen({ filePath: skill.filePath, title: formatName(skill.name) })}
      onKeyDown={(e) => e.key === 'Enter' && skill.filePath && onOpen({ filePath: skill.filePath, title: formatName(skill.name) })}
      className={cn(
        'flex h-6 min-w-0 w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] cursor-pointer',
        'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors',
      )}
    >
      <IconBolt className="size-3 shrink-0 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{formatName(skill.name)}</span>
      <SourceDot source={skill.source} />
    </li>
  )
})

// ── Steering row ──────────────────────────────────────────────────

const SteeringRow = memo(function SteeringRow({ rule, onOpen }: { rule: KiroSteeringRule; onOpen: (v: ViewerState) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li
          role="button"
          tabIndex={0}
          onClick={() => rule.filePath && onOpen({ filePath: rule.filePath, title: formatName(rule.name) })}
          onKeyDown={(e) => e.key === 'Enter' && rule.filePath && onOpen({ filePath: rule.filePath, title: formatName(rule.name) })}
          className={cn(
            'flex h-6 min-w-0 w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] cursor-pointer',
            'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors',
          )}
        >
          {rule.alwaysApply
            ? <IconCircleDot className="size-3 shrink-0 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" aria-hidden />
            : <IconCircleDashed className="size-3 shrink-0 text-muted-foreground/30" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{formatName(rule.name)}</span>
          {rule.alwaysApply && <span className="shrink-0 text-[9px] text-emerald-400/60">on</span>}
          <SourceDot source={rule.source} />
        </li>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        <p className="text-[11px] font-medium">{formatName(rule.name)}</p>
        {rule.excerpt && <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">{rule.excerpt}</p>}
        <p className="mt-1 text-[9px] text-muted-foreground/50 font-mono">{(rule.filePath ?? '').replace(/^\/Users\/[^/]+/, '~')}</p>
      </TooltipContent>
    </Tooltip>
  )
})

// ── MCP server row ───────────────────────────────────────────────

const McpRow = memo(function McpRow({ server, onOpen }: { server: KiroMcpServer; onOpen: (v: ViewerState) => void }) {
  const dotClass = !server.enabled
    ? 'fill-muted-foreground/20 text-muted-foreground/20'
    : server.status === 'error' || server.status === 'needs-auth'
      ? 'fill-red-500 text-red-500'
      : 'fill-emerald-400 text-emerald-400'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li
          role="button"
          tabIndex={0}
          onClick={() => server.filePath && onOpen({ filePath: server.filePath, title: `MCP: ${server.name}` })}
          onKeyDown={(e) => e.key === 'Enter' && server.filePath && onOpen({ filePath: server.filePath, title: `MCP: ${server.name}` })}
          className={cn(
            'flex h-6 min-w-0 w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] cursor-pointer',
            'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors',
          )}
        >
          <IconCircle className={cn('size-2 shrink-0', dotClass)} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{server.name}</span>
          <span className="shrink-0 text-[9px] text-muted-foreground/40">
            {server.transport}
          </span>
        </li>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        <p className="text-[11px] font-medium">{server.name}</p>
        {(server.status === 'error' || server.status === 'needs-auth') && (
          <p className="mt-0.5 text-[10px] text-red-400">
            {server.status === 'needs-auth' ? 'Auth required' : 'Failed to connect'}
          </p>
        )}
        {server.error && (
          <p className="mt-0.5 text-[9px] text-muted-foreground/50 font-mono truncate">{server.error}</p>
        )}
      </TooltipContent>
    </Tooltip>
  )
})

// ── Inline search ─────────────────────────────────────────────────

function InlineSearch({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="relative mx-2 mb-1">
      <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40 pointer-events-none" />
      <input ref={ref} type="text" value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); onClose() } }}
        placeholder="Filter…"
        className="h-6 w-full rounded-md bg-muted/30 pl-6 pr-6 text-[11px] text-foreground placeholder:text-muted-foreground/35 outline-none focus:bg-muted/50 transition-colors"
      />
      {value && (
        <button type="button" onClick={() => { onChange(''); onClose() }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-3.5 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors">
          <IconX className="size-2.5" />
        </button>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────

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
  const loading = useKiroStore((s) => s.loading)
  const loaded = useKiroStore((s) => s.loaded)
  const loadConfig = useKiroStore((s) => s.loadConfig)

  const [agentsOpen, setAgentsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [viewer, setViewer] = useState<ViewerState | null>(null)

  useEffect(() => { if (!loaded && !loading) void loadConfig() }, [loaded, loading, loadConfig])

  const lowerSearch = search.toLowerCase()

  const agentGroups = useMemo(() => {
    const filtered = agents.filter((a) =>
      !lowerSearch || a.name.toLowerCase().includes(lowerSearch) || a.description.toLowerCase().includes(lowerSearch))
    const map = new Map<string, KiroAgent[]>()
    for (const agent of filtered) {
      const stack = getAgentStack(agent.name)
      if (!map.has(stack)) map.set(stack, [])
      map.get(stack)!.push(agent)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] === 'other' ? 1 : b[0] === 'other' ? -1 : a[0].localeCompare(b[0]))
  }, [agents, lowerSearch])

  const filteredSkills = useMemo(() =>
    skills.filter((s) => !lowerSearch || s.name.toLowerCase().includes(lowerSearch)),
    [skills, lowerSearch])

  const filteredRules = useMemo(() =>
    steeringRules.filter((r) => !lowerSearch || r.name.toLowerCase().includes(lowerSearch) || r.excerpt.toLowerCase().includes(lowerSearch)),
    [steeringRules, lowerSearch])

  const filteredMcp = useMemo(() =>
    mcpServers.filter((m) => !lowerSearch || m.name.toLowerCase().includes(lowerSearch)),
    [mcpServers, lowerSearch])

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

  if (agents.length === 0 && skills.length === 0 && steeringRules.length === 0 && mcpServers.length === 0) return null

  const noResults = !!search && totalAgents === 0 && filteredSkills.length === 0 && filteredRules.length === 0 && filteredMcp.length === 0

  return (
    <>
      <div className="flex w-full min-w-0 flex-col">
        {/* Header — merged collapse toggle + search */}
        <div className="mb-0.5 flex items-center justify-between pr-1.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-6 flex-1 items-center gap-1.5 pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <IconChevronRight className={cn('size-3 shrink-0 transition-transform duration-150', !collapsed && 'rotate-90')} aria-hidden />
            Kiro
          </button>
          {!collapsed && (agents.length + skills.length + steeringRules.length + mcpServers.length) > 10 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setSearching((v) => !v)}
                  className={cn('inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
                    searching ? 'bg-accent text-foreground' : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground')}>
                  <IconSearch className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Filter</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Sections — hidden when collapsed */}
        {!collapsed && (
          <>
            {searching && <InlineSearch value={search} onChange={setSearch} onClose={() => setSearching(false)} />}

            {/* Steering */}
            {steeringRules.length > 0 && (filteredRules.length > 0 || !search) && (
              <SectionToggle icon={IconCompass} iconColor="text-emerald-400" label="Steering" count={filteredRules.length} expanded={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
            )}
            {rulesOpen && filteredRules.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l mx-1 px-1.5 py-px" style={{ borderColor: 'var(--border)' }}>
                {filteredRules.map((rule) => <SteeringRow key={`${rule.source}-${rule.name}`} rule={rule} onOpen={openViewer} />)}
              </ul>
            )}

            {/* Skills */}
            {skills.length > 0 && (filteredSkills.length > 0 || !search) && (
              <SectionToggle icon={IconBolt} iconColor="text-amber-400" label="Skills" count={filteredSkills.length} expanded={skillsOpen} onToggle={() => setSkillsOpen((v) => !v)} />
            )}
            {skillsOpen && filteredSkills.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l mx-1 px-1.5 py-px" style={{ borderColor: 'var(--border)' }}>
                {filteredSkills.map((skill) => <SkillRow key={`${skill.source}-${skill.name}`} skill={skill} onOpen={openViewer} />)}
              </ul>
            )}

            {/* Agents */}
            {agents.length > 0 && (totalAgents > 0 || !search) && (
              <SectionToggle icon={IconRobot} iconColor="text-violet-400" label="Agents" count={totalAgents} expanded={agentsOpen} onToggle={() => setAgentsOpen((v) => !v)} />
            )}
            {agentsOpen && totalAgents > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l mx-1 px-1.5 py-px" style={{ borderColor: 'var(--border)' }}>
                {agentGroups.map(([stack, agentList]) =>
                  agentList.length === 1
                    ? <AgentRow key={`${agentList[0].source}-${agentList[0].name}`} agent={agentList[0]} onOpen={openViewer} />
                    : <AgentStackGroup key={stack} stack={stack} agents={agentList} onOpen={openViewer} />
                )}
              </ul>
            )}

            {/* MCP */}
            {mcpServers.length > 0 && (filteredMcp.length > 0 || !search) && (
              <SectionToggle icon={IconPlug} iconColor="text-sky-400" label="MCP" count={filteredMcp.length} errorCount={mcpErrorCount} expanded={mcpOpen} onToggle={() => setMcpOpen((v) => !v)} />
            )}
            {mcpOpen && filteredMcp.length > 0 && (
              <ul className="flex min-w-0 flex-col gap-px border-l mx-1 px-1.5 py-px" style={{ borderColor: 'var(--border)' }}>
                {filteredMcp.map((server) => <McpRow key={server.name} server={server} onOpen={openViewer} />)}
              </ul>
            )}

            {noResults && <p className="px-2 py-3 text-center text-[10px] text-muted-foreground/40">No matches</p>}
          </>
        )}
      </div>

      {viewer && <KiroFileViewer filePath={viewer.filePath} title={viewer.title} onClose={closeViewer} />}
    </>
  )
})
