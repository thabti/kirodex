import type { ReactNode } from 'react'

interface TitleBarToolbarProps {
  leftSlot?: ReactNode
  rightSlot?: ReactNode
  children?: ReactNode
}

export const TitleBarToolbar = ({ leftSlot, rightSlot, children }: TitleBarToolbarProps) => {
  return (
    <div data-tauri-drag-region className="flex h-[44px] w-full shrink-0 items-center">
      {leftSlot && <div className="flex shrink-0 items-center" data-no-drag>{leftSlot}</div>}
      <div className="flex min-w-0 flex-1 items-center" data-tauri-drag-region>{children}</div>
      {rightSlot && <div className="flex shrink-0 items-center" data-no-drag>{rightSlot}</div>}
    </div>
  )
}
