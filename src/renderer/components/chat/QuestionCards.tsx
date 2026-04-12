import { memo, useState, useCallback, useEffect } from "react";
import { IconChevronLeft, IconChevronRight, IconCornerDownLeft } from "@tabler/icons-react";
import { useTaskStore } from "@/stores/taskStore";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

interface QuestionOption {
  letter: string;
  text: string;
}

interface QuestionBlock {
  number: string;
  question: string;
  options: QuestionOption[];
}

const QUESTION_START = /^\s*\[(\d+)\]:?\s*/gm;
const QUESTION_START_BOLD = /^\s*\*\*(\d+)\.\s+/gm;
// Matches options in many formats:
// "a. text", "- a. text", "  - a. **text**", "a) text", "- a) text", "(a) text"
const OPTION_LINE = /^\s*(?:[-•*]\s+)?(?:\()?([a-z])(?:\)|\.|:)\s+(.+)$/;

function findQuestionStarts(
  text: string,
): { index: number; number: string; format: "bracket" | "bold" }[] {
  const starts: {
    index: number;
    number: string;
    format: "bracket" | "bold";
  }[] = [];
  let m: RegExpExecArray | null;
  const re1 = new RegExp(QUESTION_START.source, "gm");
  while ((m = re1.exec(text)) !== null) {
    starts.push({ index: m.index, number: m[1], format: "bracket" });
  }
  if (starts.length === 0) {
    const re2 = new RegExp(QUESTION_START_BOLD.source, "gm");
    while ((m = re2.exec(text)) !== null) {
      starts.push({ index: m.index, number: m[1], format: "bold" });
    }
  }
  return starts.sort((a, b) => a.index - b.index);
}

function parseQuestions(text: string): QuestionBlock[] {
  const blocks: QuestionBlock[] = [];
  const starts = findQuestionStarts(text);
  if (starts.length === 0) return [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    let sectionStart: number;
    if (start.format === "bracket") {
      const afterBracket = text.indexOf("]", start.index) + 1;
      const colon = text.indexOf(":", afterBracket);
      sectionStart =
        colon >= 0 && colon < afterBracket + 3 ? colon + 1 : afterBracket;
    } else {
      // Bold format: skip past the closing **
      const lineEnd = text.indexOf("\n", start.index);
      const closeBold = text.indexOf("**", start.index + 3);
      sectionStart =
        closeBold >= 0 && closeBold < (lineEnd >= 0 ? lineEnd : end)
          ? closeBold + 2
          : text.indexOf(" ", start.index + 4);
    }
    const section = text.slice(sectionStart, end).trim();
    const lines = section.split("\n");
    const questionLines: string[] = [];
    const options: QuestionOption[] = [];
    for (const line of lines) {
      const optMatch = line.match(OPTION_LINE);
      if (optMatch) {
        options.push({
          letter: optMatch[1],
          text: optMatch[2].replace(/\*\*/g, "").trim(),
        });
      } else if (options.length === 0) {
        const trimmed = line.trim().replace(/\*\*/g, "");
        if (trimmed) questionLines.push(trimmed);
      }
    }
    const question = questionLines.join(" ");
    if (question) blocks.push({ number: start.number, question, options });
  }
  return blocks;
}

export function hasQuestionBlocks(text: string): boolean {
  return /\[\d+\]:?\s/.test(text) || /\*\*\d+\.\s+/.test(text);
}

export function stripQuestionBlocks(text: string): string {
  const starts = findQuestionStarts(text);
  if (starts.length === 0) return text;
  let cutPoint = starts[0].index;
  // Also strip the lead-in line (e.g., "A few questions before I...")
  const before = text.slice(0, cutPoint);
  const lastNewline = before.lastIndexOf("\n\n");
  if (lastNewline >= 0) {
    const lastParagraph = before.slice(lastNewline).toLowerCase();
    if (
      lastParagraph.includes("question") ||
      lastParagraph.includes("could you") ||
      lastParagraph.includes("tell me") ||
      lastParagraph.includes("let me know")
    ) {
      cutPoint = lastNewline;
    }
  }
  return text.slice(0, cutPoint).trim();
}

export const QuestionCards = memo(function QuestionCards({
  text,
}: {
  text: string;
}) {
  const blocks = parseQuestions(text);
  const [page, setPage] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [extraText, setExtraText] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState(false);

  const total = blocks.length;
  const current = blocks[page];

  const handleSelect = useCallback((questionNum: string, letter: string) => {
    setSelections((prev) =>
      prev[questionNum] === letter
        ? (() => {
            const next = { ...prev };
            delete next[questionNum];
            return next;
          })()
        : { ...prev, [questionNum]: letter },
    );
  }, []);

  const isAllAnswered = blocks.every((b) => selections[b.number] || b.options.length === 0);
  const currentExtra = current ? (extraText[current.number] ?? '') : ''
  const hasAnyInput =
    Object.keys(selections).length > 0 || Object.values(extraText).some((v) => v.trim().length > 0);
  const isLastPage = page === total - 1

  const handleContinue = useCallback(() => {
    // If not on last page and not all answered, navigate to next unanswered
    if (!isLastPage && !isAllAnswered) {
      const nextUnanswered = blocks.findIndex(
        (b, i) => i > page && !selections[b.number] && b.options.length > 0,
      );
      if (nextUnanswered >= 0) {
        setPage(nextUnanswered);
        return;
      }
      // Jump to last page if all option-questions are answered
      setPage(total - 1);
      return;
    }
    // All answered — submit
    const state = useTaskStore.getState();
    const id = state.selectedTaskId;
    const task = id ? state.tasks[id] : null;
    if (!task || task.status === "running" || task.status === "cancelled")
      return;
    const parts: string[] = [];
    for (const block of blocks) {
      const sel = selections[block.number];
      const extra = (extraText[block.number] ?? '').trim();
      if (sel && extra) {
        parts.push(`${block.number}=${sel}, ${extra}`);
      } else if (sel) {
        parts.push(`${block.number}=${sel}`);
      } else if (extra) {
        parts.push(`${block.number}=${extra}`);
      }
    }
    if (parts.length === 0) return;
    const msg = parts.join(", ");
    const questionAnswers = blocks
      .filter((b) => selections[b.number] || (extraText[b.number] ?? '').trim())
      .map((b) => {
        const sel = selections[b.number]
        const extra = (extraText[b.number] ?? '').trim()
        const opt = b.options.find((o) => o.letter === sel)
        const answer = [opt?.text ?? sel, extra].filter(Boolean).join(', ')
        return { question: b.question, answer }
      })
    const userMsg = {
      role: "user" as const,
      content: msg,
      timestamp: new Date().toISOString(),
      questionAnswers,
    };
    state.upsertTask({
      ...task,
      status: "running",
      messages: [...task.messages, userMsg],
    });
    state.clearTurn(task.id);
    ipc.sendMessage(task.id, msg);
    setDismissed(true);
  }, [blocks, selections, extraText, isAllAnswered, isLastPage, total, page]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (dismissed || total === 0) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && hasAnyInput) {
        e.preventDefault();
        handleContinue();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setPage((p) => Math.max(0, p - 1));
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setPage((p) => Math.min(total - 1, p + 1));
        return;
      }
      // Number keys to select options
      if (current?.options.length) {
        const idx = e.key.charCodeAt(0) - 97; // a=0, b=1, c=2...
        if (idx >= 0 && idx < current.options.length) {
          handleSelect(current.number, current.options[idx].letter);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    dismissed,
    total,
    current,
    selections,
    handleDismiss,
    handleContinue,
    handleSelect,
  ]);

  if (blocks.length === 0 || dismissed) return null;

  const selectedCount = Object.keys(selections).length;

  return (
    <div className="my-4 rounded-2xl border border-border bg-muted shadow-lg">
      {/* Header: question + pagination */}
      <div className="flex items-start gap-3 px-6 pt-5 pb-4">
        <p className="flex-1 text-[15px] font-medium leading-relaxed text-foreground">
          {current?.question}
        </p>
        {total > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground/50">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-0.5 transition-colors hover:text-foreground disabled:opacity-20"
              aria-label="Previous question"
            >
              <IconChevronLeft className="size-3.5" />
            </button>
            <span className="tabular-nums">
              {page + 1} of {total}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
              disabled={page === total - 1}
              className="rounded p-0.5 transition-colors hover:text-foreground disabled:opacity-20"
              aria-label="Next question"
            >
              <IconChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Options */}
      {current?.options.length > 0 && (
        <div className="flex flex-col gap-1 px-4 pb-3">
          {current.options.map((opt) => {
            const isSelected = selections[current.number] === opt.letter;
            return (
              <button
                key={opt.letter}
                type="button"
                onClick={() => handleSelect(current.number, opt.letter)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-[14px] transition-all",
                  isSelected
                    ? "border-primary/30 bg-primary/8 text-foreground"
                    : "border-border/40 bg-transparent text-foreground/60 hover:border-primary/30 hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[13px] font-semibold",
                    isSelected ? "text-primary" : "text-gray-300",
                  )}
                >
                  {opt.letter}.
                </span>
                <span
                  className={cn("text-[13px]", isSelected && "font-medium")}
                >
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Extra text input for custom answers */}
      <div className="px-6 pb-4">
        <input
          type="text"
          value={currentExtra}
          onChange={(e) => setExtraText((prev) => ({ ...prev, [current?.number ?? '']: e.target.value }))}
          placeholder="Add extra context (optional)"
          className="w-full rounded-lg border border-border/50 bg-background/50 px-3.5 py-2 text-[13px] text-black dark:text-white outline-none placeholder:text-muted-foreground/30 focus:border-primary/30"
        />
      </div>

      {/* Footer: dismiss + continue */}
      <div className="flex items-center justify-end gap-2 border-t border-border/30 px-5 py-3">
        {selectedCount > 0 && total > 1 && (
          <span className="mr-auto text-[11px] text-muted-foreground/40">
            {selectedCount} of {total} answered
          </span>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          Dismiss
          <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 text-[10px] font-medium">
            ESC
          </kbd>
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!hasAnyInput}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-all",
            hasAnyInput
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed",
          )}
        >
          {isAllAnswered || isLastPage ? "Submit" : "Next"}
          <IconCornerDownLeft className="size-3" />
        </button>
      </div>
    </div>
  );
});
