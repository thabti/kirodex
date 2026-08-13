import { memo } from 'react'
import { IconFolder } from '@tabler/icons-react'
import { FRAMEWORK_ICONS } from '@/lib/framework-icons'
import type { ProjectIconResult } from '@/hooks/useProjectIcon'

interface ProjectIconProps {
  readonly icon: ProjectIconResult
}

/** Renders a small circular project icon (favicon image, framework SVG, or emoji). */
export const ProjectIcon = memo(function ProjectIcon({ icon }: ProjectIconProps) {
  if (!icon) return <IconFolder className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />

  if (icon.type === 'emoji') {
    return (
      <span className="size-3.5 shrink-0 flex items-center justify-center text-[13px] leading-none" aria-hidden>
        {icon.emoji}
      </span>
    )
  }

  if (icon.type === 'favicon') {
    return (
      <img
        src={icon.dataUrl}
        alt=""
        aria-hidden
        className="size-3.5 shrink-0 rounded-full object-cover"
      />
    )
  }

  const FrameworkSvg = FRAMEWORK_ICONS[icon.id]
  if (!FrameworkSvg) return null

  return <FrameworkSvg className="size-3.5 shrink-0 rounded-full" aria-hidden />
})
