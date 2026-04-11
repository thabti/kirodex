import { memo, useState, useCallback, useRef, useEffect } from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import type { TaskMessage, ToolCall } from "@/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useKiroStore } from "@/stores/kiroStore";
import ChatMarkdown from "./ChatMarkdown";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { TaskCompletionCard, parseReport, stripReport } from "./TaskCompletionCard";

const LOADING_WORDS = [
  "Thinking",
  "Reasoning",
  "Analyzing",
  "Planning",
  "Processing",
  "Reflecting",
  "Considering",
  "Evaluating",
  "Synthesizing",
  "Crafting",
];

function McpErrorLines() {
  const mcpServers = useKiroStore((s) => s.config.mcpServers ?? []);
  const failed = mcpServers.filter(
    (m) => m.enabled && (m.status === "needs-auth" || m.status === "error"),
  );
  if (failed.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {failed.map((m) => (
        <p key={m.name} className="text-[10px] text-red-400/70">
          {m.name} — {m.status === "needs-auth" ? "auth required" : "failed"}
        </p>
      ))}
    </div>
  );
}

function GeneratingIndicator() {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_WORDS.length),
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = () => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % LOADING_WORDS.length);
        setVisible(true);
      }, 300);
    };
    const t = setInterval(cycle, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="py-1 select-none">
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-muted-foreground/20 transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {LOADING_WORDS[idx]}&hellip;
        </span>
      </div>
      <McpErrorLines />
    </div>
  );
}

interface MessageItemProps {
  message: TaskMessage;
  streaming?: boolean;
  liveToolCalls?: ToolCall[];
  liveThinking?: string;
}

export const MessageItem = memo(function MessageItem({
  message,
  streaming,
  liveToolCalls,
  liveThinking,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(message.content).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1200);
    });
  }, [message.content]);

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString()
    : "";

  if (message.role === "system") {
    const isError =
      message.content.startsWith("\u26a0") ||
      message.content.toLowerCase().startsWith("error") ||
      message.content.toLowerCase().startsWith("failed");
    return (
      <div
        className="pb-3 px-1"
        data-testid="message-item-system"
        data-timeline-row-kind="message"
        data-message-role="system"
      >
        {isError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[13px] text-destructive/80">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{message.content.replace(/^\u26a0\ufe0f\s*/, "")}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-xs text-muted-foreground/40 select-none">
              {message.content}
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
        )}
      </div>
    );
  }

  if (isUser) {
    return (
      <div
        className="pb-3"
        data-testid="message-item-user"
        data-timeline-row-kind="message"
        data-message-role="user"
      >
        <div className="flex justify-end">
          <div className="group relative max-w-[75%]">
            <div className="rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 dark:bg-primary/[0.08]">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                {message.content}
              </p>
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5 px-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-md p-0.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/50 hover:!text-foreground"
                  >
                    {copied ? (
                      <IconCheck className="size-3" aria-hidden />
                    ) : (
                      <IconCopy className="size-3" aria-hidden />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {copied ? "Copied!" : "Copy message"}
                </TooltipContent>
              </Tooltip>
              <span className="text-[10px] tabular-nums text-muted-foreground/30">
                {timeStr}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const thinkingText =
    message.thinking || (streaming ? liveThinking : undefined);
  const toolCalls = message.toolCalls?.length
    ? message.toolCalls
    : streaming
      ? liveToolCalls
      : undefined;

  const report = !streaming ? parseReport(message.content) : null;
  const displayContent = report ? stripReport(message.content) : message.content;

  return (
    <div
      className="pb-4"
      data-testid="message-item-assistant"
      data-timeline-row-kind="message"
      data-message-role="assistant"
    >
      {streaming && !displayContent && !thinkingText && (
        <GeneratingIndicator />
      )}

      {toolCalls && toolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={toolCalls} />
      )}

      {displayContent ? (
        <ChatMarkdown text={displayContent} isStreaming={streaming} />
      ) : null}

      {report && <TaskCompletionCard report={report} />}
    </div>
  );
});
