import { Button } from '@/components/ui/button'

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
 */
export function ApprovalCard({
  request,
  onDecision
}: {
  readonly request: PendingPermission
  readonly onDecision: (outcome: 'allow' | 'deny') => void
}): React.JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-label="ツールの実行許可"
      className="border-border bg-card mx-auto w-full max-w-(--thread-max-width) rounded-lg border p-4 shadow-sm"
    >
      <p className="text-sm font-medium">
        Claude が <span className="font-semibold">{request.toolName}</span> の実行を求めています
      </p>
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
