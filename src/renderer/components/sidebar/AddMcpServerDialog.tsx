import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { IconLoader2, IconPlug, IconWorld } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { ipc } from '@/lib/ipc'
import { useSettingsStore } from '@/stores/settingsStore'
import { useKiroStore } from '@/stores/kiroStore'
import { cn } from '@/lib/utils'

/**
 * Add a new MCP server through the kiro-cli's own `mcp add` subcommand.
 *
 * We deliberately shell out to the CLI rather than rewriting `mcp.json`
 * directly so the user gets the CLI's validation, registry-mode enforcement,
 * and any future side effects for free. Behavior mirrors the docs at
 * https://kiro.dev/docs/cli/mcp/configuration/
 */

type Transport = 'stdio' | 'http'
type Scope = 'global' | 'workspace' | 'agent'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional workspace path so workspace-scope adds end up in the right .kiro/. */
  workspace: string | null
}

export function AddMcpServerDialog({ open, onOpenChange, workspace }: Props) {
  const kiroBin = useSettingsStore((s) => s.settings.kiroBin)
  const agents = useKiroStore((s) => s.config.agents)

  const [transport, setTransport] = useState<Transport>('stdio')
  const [scope, setScope] = useState<Scope>(workspace ? 'workspace' : 'global')
  const [agentName, setAgentName] = useState<string>('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [url, setUrl] = useState('')
  const [envText, setEnvText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever the dialog opens (not on every dependency change).
  useEffect(() => {
    if (!open) return
    setTransport('stdio')
    setScope(workspace ? 'workspace' : 'global')
    setAgentName(agents[0]?.name ?? '')
    setName('')
    setCommand('')
    setArgsText('')
    setUrl('')
    setEnvText('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Args: one entry per line OR space-separated on a single line. We pick
  // line-based first since paths and shell strings can include spaces.
  const parsedArgs = useMemo(() => {
    if (!argsText.trim()) return []
    if (argsText.includes('\n')) {
      return argsText.split('\n').map((s) => s.trim()).filter(Boolean)
    }
    return argsText.trim().split(/\s+/)
  }, [argsText])

  const parsedEnv = useMemo(
    () =>
      envText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.includes('=')),
    [envText],
  )

  const isValidName = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name.trim())
  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    isValidName &&
    (transport === 'stdio' ? command.trim().length > 0 : url.trim().startsWith('http')) &&
    (scope !== 'agent' || agentName.trim().length > 0)

  const submit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const fullScope = scope === 'agent' ? `agent:${agentName.trim()}` : scope
    try {
      await ipc.mcpAddServer(
        {
          name: name.trim(),
          scope: fullScope,
          command: transport === 'stdio' ? command.trim() : undefined,
          args: transport === 'stdio' ? parsedArgs : [],
          url: transport === 'http' ? url.trim() : undefined,
          env: parsedEnv,
          force: false,
        },
        workspace ?? undefined,
        kiroBin,
      )
      toast.success(`Added MCP server "${name.trim()}"`, {
        description: `Scope: ${fullScope}. New chat threads will pick it up automatically.`,
      })
      // The kiro_watcher will fire onKiroConfigChanged → kiroStore reloads.
      // No need to invalidate here.
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Surface the CLI's own message — it's the most accurate diagnosis.
      toast.error('Could not add MCP server', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, scope, agentName, name, transport, command, parsedArgs, url, parsedEnv, workspace, kiroBin, onOpenChange])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (canSubmit) {
          e.preventDefault()
          void submit()
        }
      }
    },
    [canSubmit, submit],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Add MCP server</DialogTitle>
          <DialogDescription>
            Runs <code className="rounded bg-muted px-1 font-mono text-[11px]">kiro-cli mcp add</code>. Validation,
            registry checks, and config writes are handled by the CLI.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-3">
          {/* Transport */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTransport('stdio')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors',
                transport === 'stdio'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              <IconPlug className="size-3.5" /> Local (stdio)
            </button>
            <button
              type="button"
              onClick={() => setTransport('http')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors border-l border-border',
                transport === 'http'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              <IconWorld className="size-3.5" /> Remote (HTTP)
            </button>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. aws-docs"
              autoFocus
            />
            {name && !isValidName && (
              <p className="text-[10px] text-red-600 dark:text-red-400">
                Name must start with a letter or digit and contain only letters, digits, dashes, or underscores.
              </p>
            )}
          </div>

          {/* Scope */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Scope</label>
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <ScopeButton active={scope === 'global'} onClick={() => setScope('global')} label="Global" hint="~/.kiro/settings/mcp.json" />
              <ScopeButton
                active={scope === 'workspace'}
                onClick={() => setScope('workspace')}
                label="Workspace"
                hint=".kiro/settings/mcp.json"
                disabled={!workspace}
                divider
              />
              <ScopeButton
                active={scope === 'agent'}
                onClick={() => setScope('agent')}
                label="Agent"
                hint="Custom agent file"
                disabled={agents.length === 0}
                divider
              />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground/70">
              {scope === 'global'
                ? '~/.kiro/settings/mcp.json'
                : scope === 'workspace'
                  ? '.kiro/settings/mcp.json'
                  : 'Custom agent file'}
            </p>
            {scope === 'agent' && (
              <select
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary/50"
              >
                {agents.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Connection details */}
          {transport === 'stdio' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Command</label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="uvx, npx, /path/to/binary…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Arguments <span className="text-muted-foreground/60">(one per line, or space-separated)</span>
                </label>
                <Textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  rows={2}
                  placeholder="awslabs.aws-documentation-mcp-server@latest"
                  className="font-mono text-[12px]"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/mcp"
              />
              <p className="text-[10px] text-muted-foreground">
                OAuth flows trigger automatically the first time the server connects.
              </p>
            </div>
          )}

          {/* Env */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Environment variables <span className="text-muted-foreground/60">(KEY=VALUE, one per line)</span>
            </label>
            <Textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={3}
              placeholder={'BRAVE_API_KEY=${BRAVE_API_KEY}\nFASTMCP_LOG_LEVEL=ERROR'}
              className="font-mono text-[12px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Use <code className="font-mono">{'${VAR}'}</code> to reference env vars from your shell instead of hardcoding secrets.
            </p>
          </div>
        </div>

        <DialogFooter>
          <span className="text-[10px] text-muted-foreground/70 sm:mr-auto sm:self-center">
            ESC to cancel · ⌘↵ to add
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <IconLoader2 className="mr-1 size-3.5 animate-spin" />}
            Add server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScopeButton({
  active, onClick, label, hint, disabled, divider,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
  disabled?: boolean
  divider?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'flex flex-1 items-center justify-center px-3 py-1.5 text-[12px] font-medium transition-colors',
            divider && 'border-l border-border',
            active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50',
            disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
          )}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-mono text-[11px]">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
