import type { McpStatusKey } from '@domain/session/session-init-report'

import type { SessionMeters } from '@/features/session/useSessionMeters'

/**
 * 構成のタブの注意の印の判定 (O-5 / 015 data-model §3「注意の印」)。タブの表 (`panel-tabs.ts`) の `attention` と、構成のタブ
 * (`InitReportTab.tsx`) の MCP サーバーの行が同じ規則を使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 印を付けるのは `failed` / `needs-auth` だけ。`unknown` (知らない値)・`pending` などは付けない | data-model §3 / spec US-2 AC2・AC6 |
 * | 読むのは表示中のセッションの `initReport` だけ (他のセッションの状態で印を出さない) | spec US-2 AC5 |
 */
export function mcpStatusNeedsAttention(status: McpStatusKey): boolean {
  return status === 'failed' || status === 'needs-auth'
}

/** そのセッションの最新の構成に、注意の印の付く MCP サーバーがあるか。構成がまだ無ければ false。 */
export function initReportNeedsAttention(meters: SessionMeters): boolean {
  return meters.initReport?.mcpServers.some((s) => mcpStatusNeedsAttention(s.status)) ?? false
}
