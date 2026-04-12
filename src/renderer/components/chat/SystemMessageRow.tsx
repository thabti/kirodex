import { memo } from 'react'
import type { SystemMessageRow as SystemMessageRowData } from '@/lib/timeline'

export const SystemMessageRow = memo(function SystemMessageRow({ row }: { row: SystemMessageRowData }) {
  return (
    <div className="pb-5 px-1" data-timeline-row-kind="system-message">
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-[15px] text-destructive/80">
        <svg
          width="16"
          height="16"
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
        <span>{row.content.replace(/^\u26a0\ufe0f\s*/, '')}</span>
      </div>
    </div>
  )
})
