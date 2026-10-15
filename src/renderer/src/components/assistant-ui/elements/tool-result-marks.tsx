"use client";

import { Badge } from "@/components/ui/badge";
import { TOOL_RESULT_LABELS } from "@/features/chat/labels";
import type { ToolResultState } from "@/features/chat/tool-result-state";
import { useLiveToolElapsed } from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono } from "./surfaces";

/**
 * tool の結果のエラーと切り詰めの印 (O-2 / FR-007 / pr-gate R1 po H-001) と、結果待ちの tool の経過時間
 * (O-4 / 014 spec FR-012 / US-4 AC3。data-model §4「進み具合」)。
 *
 * Terminal block だけでなく、Code diff・ToolFallback・Subagent・Todo list・Agent plan のどの表示でも同じ印を出す
 * — 失敗・拒否された Edit が適用済みの diff に見えないようにする。
 *
 * 経過時間は結果がまだ無い間だけ、実行中の Thread の外側の購読元 (`LiveProgressContext`) から自分の tool の値だけを
 * `useSyncExternalStore` で読む (他の tool の更新で描き直さない)。過去ログには購読元が無いので出ない。
 * live region にしない (毎秒読み上げない)。
 *
 * registry 照合 (Principle XIII): 導入済みの `Badge` (destructive) と、既存の「（切り詰め）」の span の体裁。
 * 新しい色・間隔のトークンは足さない。
 */

/** 切り詰めフラグは convert.ts が args.__truncated に載せる (assistant-ui の tool-call part に専用フィールドが無いため)。 */
export function isTruncatedArgs(args: unknown): boolean {
  return (
    typeof args === "object" &&
    args !== null &&
    (args as Record<string, unknown>).__truncated === true
  );
}

function stateMarkLabel(state: ToolResultState | undefined): string | null {
  switch (state) {
    case "running":
    case "awaiting":
      return TOOL_RESULT_LABELS.pending;
    case "unknown":
      return TOOL_RESULT_LABELS.unknown;
    case "elsewhere":
      return TOOL_RESULT_LABELS.elsewhere;
    default:
      return null;
  }
}

/** ヘッダの右端に置く印。どれも無ければ何も描かない。 */
export function ToolResultMarks({
  toolCallId,
  pending,
  state,
  isError,
  truncated,
  className,
}: {
  /** tool の呼び出しの id (経過時間を引く鍵)。 */
  toolCallId: string;
  /** 結果待ちか (結果が届いたら経過時間を出さない)。 */
  pending: boolean;
  /**
   * 結果の状態 (O-6 / 016 data-model §3。`useToolResultState` の値)。結果待ち・結果不明・結果は別に表示の印を出す。
   * 渡さないときは状態の印を出さない。
   */
  state?: ToolResultState;
  isError: boolean | undefined;
  truncated: boolean;
  className?: string;
}): React.JSX.Element | null {
  const elapsed = useLiveToolElapsed(toolCallId, pending);
  const stateLabel = stateMarkLabel(state);
  if (!isError && !truncated && elapsed === null && stateLabel === null) return null;
  return (
    <span
      data-slot="tool-result-marks"
      className={cn("flex shrink-0 items-center gap-2", className)}
    >
      {stateLabel !== null ? (
        <span
          data-slot="tool-result-state"
          data-state={state}
          // 動く印 (応答中) だけ aria-busy。承認待ちは動かない (どの tool の承認かは承認カードが示す)。
          aria-busy={state === "running" ? true : undefined}
        >
          {state === "running" ? (
            <span
              data-slot="tool-result-spinner"
              aria-hidden="true"
              className="mr-1 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] motion-reduce:animate-none"
            />
          ) : null}
          {stateLabel}
        </span>
      ) : null}
      {elapsed !== null ? (
        <span data-slot="tool-result-elapsed" className="tabular-nums">
          {TOOL_RESULT_LABELS.toolElapsed(elapsed)}
        </span>
      ) : null}
      {truncated ? (
        // 透明度を足さない — 周りの muted-foreground のまま 4.5:1 を保つ (pr-gate R2 a11y H-001)
        <span data-slot="tool-result-truncated">{TOOL_RESULT_LABELS.truncated}</span>
      ) : null}
      {isError ? (
        <Badge data-slot="tool-result-error" variant="destructive">
          {TOOL_RESULT_LABELS.failed}
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * エラーの結果の本文 (結果を普段は出さない表示で、エラーのときだけ出す)。会話由来の untrusted text なので
 * plain text で描く (React が escape する。本文は domain で `sanitizeBody` 済み)。
 */
export function ToolErrorResult({
  isError,
  result,
}: {
  isError: boolean | undefined;
  result: unknown;
}): React.JSX.Element | null {
  if (!isError || typeof result !== "string" || result.length === 0) return null;
  return (
    <div
      data-slot="tool-result-error-text"
      className={cn(codeScroll, "border-border/40 border-t")}
    >
      <pre
        className={cn(
          codeSurface,
          mono,
          "text-destructive/90 whitespace-pre-wrap px-3 py-2",
        )}
      >
        {result}
      </pre>
    </div>
  );
}
