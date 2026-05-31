export type AnalyticsEventKind =
  | 'session'
  | 'message_sent'
  | 'message_received'
  | 'token_usage'
  | 'tool_call'
  | 'file_edited'
  | 'diff_stats'
  | 'slash_cmd'
  | 'model_used'
  | 'mode_switch'
  | 'thread_created'
  | 'mcp_used'
  | 'skill_used'

export interface AnalyticsEvent {
  readonly ts: number
  readonly kind: AnalyticsEventKind
  readonly project?: string
  readonly thread?: string
  readonly detail?: string
  readonly value?: number
  readonly value2?: number
}
