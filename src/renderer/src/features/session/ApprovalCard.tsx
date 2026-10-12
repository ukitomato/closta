import { Button } from '@/components/ui/button'
import { MCP_TOOL_LABELS } from '@/features/chat/labels'
import { parseMcpToolName } from '@/features/chat/mcp-tool-name'

import { APPROVAL_CARD_LABELS } from './labels'
import type { PendingPermission } from './useLiveSession'

/**
 * 承認カード (X-1 / FE-010 / FR-012)。**承認の唯一の経路** (H-05)。
 *
 * assistant-ui にはこのバージョンで承認専用の element が無いため**自前のカード**で描画する
 * (Principle XIII。候補 `ApprovalPrimitive` は当該版に存在しない)。`toolName` / 入力は
 * **agents 側でサニタイズ済みの plain text** であり (双方向制御文字・C0/C1 除去済み)、React の
 * 既定エスケープでそのまま表示する — MCP 由来の表示偽装を防ぐ (H-05/H-06)。
 *
 * 単発 (`once`) と capability 付与を区別して表示する (glossary Approval card)。
 * 要求 scope は常に `once` (capability 付与は I-3。AD-041 (c))。
 *
 * O-5 (015 data-model §1「承認カード」/ §4): MCP の tool は**生の `toolName` を切り詰めずに**等幅・`break-all` で出し
 * (承認の判断の正本の識別子)、補助としてサーバー名 › tool 名の見出し (分け方を確かめられなければ「サーバー名は推定」) を
 * 出す。`AskUserQuestion` は暫定の注記を出す。それ以外の tool は今のまま。承認の応答は変えない。
 */
export function ApprovalCard({
  request,
  onDecision,
  mcpServerNames = []
}: {
  readonly request: PendingPermission
  readonly onDecision: (outcome: 'allow' | 'deny') => void
  /** 表示中のセッションの構成が報告した MCP サーバーの名前 (`LivePane` が transcript と同じ一覧を渡す)。 */
  readonly mcpServerNames?: readonly string[]
}): React.JSX.Element {
  const mcp = parseMcpToolName(request.toolName, mcpServerNames, request.input)
  return (
    <div
      role="alertdialog"
      aria-label="ツールの実行許可"
      className="border-border bg-card mx-auto w-full max-w-(--thread-max-width) rounded-lg border p-4 shadow-sm"
    >
      {mcp === null ? (
        <p className="text-sm font-medium">
          Claude が <span className="font-semibold">{request.toolName}</span> の実行を求めています
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">
            Claude が{' '}
            <span data-slot="approval-tool-name" className="font-mono font-semibold break-all">
              {request.toolName}
            </span>{' '}
            の実行を求めています
          </p>
          <p data-slot="approval-mcp-heading" className="text-muted-foreground mt-1 text-xs">
            {mcp.server === null ? mcp.tool : `${mcp.server} › ${mcp.tool}`}
            {mcp.inferred ? (
              <span data-slot="approval-mcp-inferred"> ({MCP_TOOL_LABELS.serverInferred})</span>
            ) : null}
          </p>
        </>
      )}
      {request.toolName === 'AskUserQuestion' ? (
        <p
          data-slot="approval-ask-user-question-notice"
          className="border-border bg-muted text-foreground mt-2 rounded-md border px-2.5 py-1.5 text-xs"
        >
          {APPROVAL_CARD_LABELS.askUserQuestionNotice}
        </p>
      ) : null}
      {request.scope === 'capability' ? (
        <p className="text-muted-foreground mt-1 text-xs">
          今後このセッション中は同種の要求を再確認しません (capability 付与)。
        </p>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">この 1 回だけの許可です。</p>
      )}
      {request.input.length > 0 && (
        <pre className="bg-muted text-foreground mt-2 max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
          {request.input}
        </pre>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onDecision('deny')}>
          拒否
        </Button>
        <Button type="button" size="sm" onClick={() => onDecision('allow')}>
          許可
        </Button>
      </div>
    </div>
  )
}
