import { useEffect, useRef } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

interface TerminalOutputProps {
  lines: string[]
  onClear: () => void
}

// Strip ANSI escape codes
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

export function TerminalOutput({ lines, onClear }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-end border-b px-2 py-1">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClear}>
          <IconTrash className="h-3 w-3" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            No terminal output yet
          </div>
        ) : (
          <pre className="font-mono text-[11px] leading-5 whitespace-pre-wrap break-all">
            {lines.map((line, i) => (
              <div key={i}>{stripAnsi(line)}</div>
            ))}
          </pre>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
