import { TrafficLights } from './TrafficLights'
import { TitleBarToolbar } from './TitleBarToolbar'
import type { ReactNode } from 'react'

export const UnifiedTitleBarMacOS = ({ children }: { children?: ReactNode }) => {
  return <TitleBarToolbar leftSlot={<div className="pl-3 pr-2"><TrafficLights /></div>}>{children}</TitleBarToolbar>
}
