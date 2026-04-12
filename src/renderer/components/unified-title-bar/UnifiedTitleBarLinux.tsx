import { WindowsControls } from './WindowsControls'
import { TitleBarToolbar } from './TitleBarToolbar'
import type { ReactNode } from 'react'

/** Linux title bar — no native decorations, uses same controls as Windows. */
export const UnifiedTitleBarLinux = ({ children }: { children?: ReactNode }) => {
  return <TitleBarToolbar rightSlot={<WindowsControls />}>{children}</TitleBarToolbar>
}
