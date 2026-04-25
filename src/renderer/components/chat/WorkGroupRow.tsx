import { memo } from 'react'
import { ToolCallDisplay } from './ToolCallDisplay'
import type { WorkRow as WorkRowData } from '@/lib/timeline'

export const WorkGroupRow = memo(function WorkGroupRow({ row }: { row: WorkRowData }) {
  return (
    <div className={row.squashed ? 'pb-2.5' : 'pb-4'} data-timeline-row-kind="work">
      <ToolCallDisplay toolCalls={row.toolCalls} />
    </div>
  )
})
