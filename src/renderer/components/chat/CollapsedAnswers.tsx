import { memo, useState } from 'react'
import { IconChevronDown, IconChevronRight, IconMessageCircleQuestion } from '@tabler/icons-react'

interface QuestionAnswer {
  question: string
  answer: string
}

interface CollapsedAnswersProps {
  questionAnswers: QuestionAnswer[]
}

export const CollapsedAnswers = memo(function CollapsedAnswers({ questionAnswers }: CollapsedAnswersProps) {
  const [expanded, setExpanded] = useState(false)
  if (!questionAnswers.length) return null
  return (
    <div className="rounded-lg border border-border/30 bg-card/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left transition-colors hover:bg-accent/5"
      >
        {expanded
          ? <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/40" />
          : <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />}
        <IconMessageCircleQuestion className="size-3.5 shrink-0 text-primary/50" />
        <span className="text-[13px] font-medium text-muted-foreground/60">
          Answered {questionAnswers.length} question{questionAnswers.length > 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/20 px-3.5 py-2.5 space-y-2.5">
          {questionAnswers.map((qa, i) => (
            <div key={i}>
              <p className="text-[13px] font-medium text-foreground/70">{qa.question}</p>
              <p className="text-[13px] text-primary/60">{qa.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
