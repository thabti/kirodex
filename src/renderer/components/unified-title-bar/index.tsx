import { useState, type ReactNode } from 'react'
import { UnifiedTitleBarMacOS } from './UnifiedTitleBarMacOS'
import { UnifiedTitleBarWindows } from './UnifiedTitleBarWindows'
import { UnifiedTitleBarLinux } from './UnifiedTitleBarLinux'

type AppPlatform = 'macos' | 'windows' | 'linux'

const detectPlatform = (): AppPlatform => {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  return 'linux'
}

const titleBarByPlatform: Record<AppPlatform, React.ComponentType<{ children?: ReactNode }>> = {
  macos: UnifiedTitleBarMacOS,
  windows: UnifiedTitleBarWindows,
  linux: UnifiedTitleBarLinux,
}

export const UnifiedTitleBar = ({ children }: { children?: ReactNode }) => {
  const [platform] = useState(detectPlatform)
  const TitleBar = titleBarByPlatform[platform]
  return <TitleBar>{children}</TitleBar>
}
