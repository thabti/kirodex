import { WindowsControls } from './WindowsControls'
import { TitleBarToolbar } from './TitleBarToolbar'
import type { ReactNode } from 'react'

export const UnifiedTitleBarWindows = ({ children }: { children?: ReactNode }) => {
  return <TitleBarToolbar rightSlot={<WindowsControls />}>{children}</TitleBarToolbar>
}
