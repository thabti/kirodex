import { memo, useCallback, useEffect, useMemo, useRef, useState, Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { QuestionCards, hasQuestionBlocks, stripQuestionBlocks } from './QuestionCards'
import { useDiffStore } from '@/stores/diffStore'

interface ChatMarkdownProps {
  text: string
  isStreaming?: boolean
}

function nodeToPlainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToPlainText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToPlainText(node.props.children)
  return ''
}

function extractCodeBlock(children: ReactNode): { className?: string; code: string } | null {
  const nodes = Children.toArray(children)
  if (nodes.length !== 1) return null
  const child = nodes[0]
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child) || child.type !== 'code') return null
  return { className: child.props.className, code: nodeToPlainText(child.props.children) }
}

function extractLanguage(className?: string): string {
  return className?.match(/language-(\S+)/)?.[1] ?? 'text'
}

const CopyButton = memo(function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [text])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-foreground"
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
    </button>
  )
})

const remarkPlugins = [remarkGfm]

/** Close unclosed markdown constructs so ReactMarkdown doesn't produce broken DOM mid-stream */
function stabilizeStreamingMarkdown(text: string): string {
  // Close unclosed code fences (```)
  const fenceCount = (text.match(/^```/gm) || []).length
  if (fenceCount % 2 !== 0) {
    text += '\n```'
  }
  // Close unclosed inline backticks
  const backticks = (text.match(/(?<!`)`(?!`)/g) || []).length
  if (backticks % 2 !== 0) {
    text += '`'
  }
  return text
}

/** Single source of prose styling — all typography lives here, nothing in tailwind.css */
const PROSE_CLASSES = 'chat-markdown w-full min-w-0 leading-[1.7] text-[15px] text-foreground'

/** Matches strings that look like file paths (contain / or \ and end with a file extension) */
const FILE_PATH_RE = /^(?:\.{0,2}[\\/])?(?:[\w.@-]+[\\/])*[\w.@-]+\.\w{1,10}$/

function ChatMarkdown({ text, isStreaming = false }: ChatMarkdownProps) {
  const displayText = isStreaming ? stabilizeStreamingMarkdown(text) : text
  const showQuestions = useMemo(() => !isStreaming && hasQuestionBlocks(displayText), [isStreaming, displayText])
  const markdownText = useMemo(() => showQuestions ? stripQuestionBlocks(displayText) : displayText, [showQuestions, displayText])

  const components = useMemo<Components>(() => ({
    pre({ node, children, ...props }) {
      const block = extractCodeBlock(children)
      if (!block) return <pre {...props}>{children}</pre>
      const lang = extractLanguage(block.className)
      return (
        <div className="group relative my-3 overflow-hidden rounded-lg border border-border/50 bg-muted/50 dark:bg-[#0d1117]">
          <div className="flex items-center justify-between border-b border-border/40 px-3.5 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">{lang}</span>
            <CopyButton text={block.code} />
          </div>
          <pre className="overflow-x-auto px-4 py-3.5 text-[14px] leading-[1.6] text-foreground">
            <code className={block.className}>{block.code}</code>
          </pre>
        </div>
      )
    },
    code({ node, className, children, ...props }) {
      if (className?.startsWith('language-')) return <code className={className} {...props}>{children}</code>
      // Detect file paths in inline code and make them clickable
      const text = nodeToPlainText(children)
      if (!className && FILE_PATH_RE.test(text)) {
        return (
          <code
            role="button"
            tabIndex={0}
            onClick={() => useDiffStore.getState().openToFile(text)}
            onKeyDown={(e) => e.key === 'Enter' && useDiffStore.getState().openToFile(text)}
            className="cursor-pointer rounded-md border border-border/50 bg-muted px-1.5 py-0.5 text-[13.5px] text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:bg-accent hover:decoration-primary/60"
            title={`Open diff for ${text}`}
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className="rounded-md border border-border/50 bg-muted px-1.5 py-0.5 text-[13.5px] text-foreground"
          {...props}
        >
          {children}
        </code>
      )
    },
    a({ node, href, ...props }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary/60"
          {...props}
        />
      )
    },
  }), [])

  return (
    <div className={PROSE_CLASSES}>
      {showQuestions && <QuestionCards text={displayText} />}
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {markdownText}
      </ReactMarkdown>
    </div>
  )
}

export default memo(ChatMarkdown)
