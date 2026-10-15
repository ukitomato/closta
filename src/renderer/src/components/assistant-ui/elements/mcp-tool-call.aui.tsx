"use client";

import { memo, useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { MCP_TOOL_LABELS } from "@/features/chat/labels";
import {
  mcpToolHeadingParts,
  parseMcpToolName,
  readMcpBuiltinArgs,
  summarizeResourceUri,
} from "@/features/chat/mcp-tool-name";
import {
  useLiveMcpServerNames,
  useToolResultState,
} from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono } from "./surfaces";
import {
  isCancelledToolStatus,
  offersInterruptAction,
  statusWithError,
  ToolFallback,
  ToolFallbackApproval,
  ToolFallbackContent,
  ToolFallbackDuration,
  ToolFallbackError,
  ToolFallbackRoot,
  ToolFallbackStatusIcon,
} from "./tool-fallback.aui";
import { isTruncatedArgs, ToolResultMarks } from "./tool-result-marks";

/**
 * MCP の tool の呼び出しの表示 (O-5 / FE-012 / AD-048 Decision 5。
 * [data-model](../../../../../../specs/015-ui-mcp-elicitation-commands/data-model.md) §1)。
 * `mcp__<server>__<tool>` と MCP の組み込みの 4 tool を、過去ログと実行中で同じ部品・同じ見出しの構造で描く。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 見出しはサーバー名 › tool 名 (表示中のセッションの構成のサーバー名で分ける。分け方を確かめられないときは「サーバー名は推定」)。入力の値を見出しに出さない。resource の tool は URI の要約だけを添える | data-model §1 / spec US-1 AC1・AC3〜AC5 |
 * | 入力は閉じた中身の JSON (`argsText`。domain で無害化と上限を通った値)。結果は `<pre>` の平文 (MarkdownText に通さない) | spec FR-001 / FR-006 |
 * | 状態の印 (状態のアイコン・中断の印・経過時間・エラーと切り詰めの印) は ToolFallback と同じ関数・部品で出す | data-model §1「状態の印」/ spec US-1 AC9 |
 * | 画像・resource の印は出さない。Data table / Chart などに写さない | U-7 / U-5 |
 *
 * registry 照合 (Principle XIII / research R-03): MCP の tool の呼び出しの element は registry に無く、汎用の Tool call は
 * 状態の印を出せないので採らない。既存の ToolFallback の部品と `surfaces.tsx` の体裁で作る。
 */

/** 結果を平文にする (文字列でなければ JSON。直列化できなければ空)。 */
function resultTextOf(result: unknown): string | null {
  if (result === undefined || result === null) return null;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2) ?? null;
  } catch {
    return null;
  }
}

const McpToolCallImpl: ToolCallMessagePartComponent = (props) => {
  const {
    toolCallId,
    toolName,
    args,
    argsText,
    result,
    isError,
    status: runtimeStatus,
    addResult,
    resume,
    interrupt,
    approval,
    respondToApproval,
  } = props;
  const knownServers = useLiveMcpServerNames();
  const parts = useMemo(
    () => parseMcpToolName(toolName, knownServers, argsText),
    [toolName, knownServers, argsText],
  );

  // 開閉は ToolFallback と同じ: 承認待ちになったら開く。それ以外は閉じた中身。
  // 表示の状態は結果の状態から決める (O-6 / 016 data-model §3)。part の状態は承認の操作を出すかの判定にだけ使う。
  const resultState = useToolResultState({ toolCallId, result, isError });
  const status = resultState.status;
  const approvalStatus = statusWithError(runtimeStatus, isError);
  const isRequiresAction = approvalStatus?.type === "requires-action";
  const [open, setOpen] = useState(isRequiresAction);
  const [prevRequiresAction, setPrevRequiresAction] = useState(isRequiresAction);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) setOpen(true);
  }

  if (parts === null) return <ToolFallback {...props} />;

  const isCancelled = isCancelledToolStatus(status);
  const isRunning = status?.type === "running";
  const shouldRenderApproval =
    isRequiresAction && offersInterruptAction(approvalStatus, approval, interrupt);
  const heading = mcpToolHeadingParts(parts);
  const uriSummary =
    parts.kind === "mcp-builtin"
      ? summarizeResourceUri(readMcpBuiltinArgs(argsText).uri)
      : null;
  const resultText = resultTextOf(result);

  return (
    <div
      data-slot="aui_mcp-tool-call"
      data-mcp-kind={parts.kind}
      className="aui-mcp-tool-call border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <ToolFallbackRoot open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-3">
          <CollapsibleTrigger
            data-slot="mcp-tool-call-trigger"
            className="aui-mcp-tool-call-trigger group/trigger text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-2 py-1.5 text-start text-sm transition-[color,scale] active:scale-[0.98]"
          >
            <ToolFallbackStatusIcon status={status} />
            <span
              data-slot="mcp-tool-call-heading"
              className={cn(
                "flex min-w-0 items-center gap-1 leading-none",
                isCancelled && "text-muted-foreground line-through",
                isRunning && "shimmer motion-reduce:animate-none",
              )}
            >
              {heading.server !== null ? (
                <>
                  <span data-slot="mcp-tool-call-server" className="truncate">
                    {heading.server}
                  </span>
                  <span aria-hidden="true">›</span>
                </>
              ) : null}
              <span
                data-slot="mcp-tool-call-tool"
                className="text-foreground truncate font-medium"
              >
                {heading.tool}
              </span>
            </span>
            {parts.inferred ? (
              <span
                data-slot="mcp-tool-call-inferred"
                className="shrink-0 text-xs"
              >
                ({MCP_TOOL_LABELS.serverInferred})
              </span>
            ) : null}
            {uriSummary !== null ? (
              <span
                data-slot="mcp-tool-call-uri"
                className={cn(mono, "min-w-0 truncate")}
              >
                {uriSummary}
              </span>
            ) : null}
            <ToolFallbackDuration />
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                "transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                "-rotate-90",
                "group-data-open/trigger:rotate-0",
                "group-data-panel-open/trigger:rotate-0",
              )}
            />
          </CollapsibleTrigger>
          {/* エラーと切り詰めの印・経過時間は閉じたままでも見えるよう見出しの横に出す (ToolFallback と同じ)。 */}
          <ToolResultMarks
            toolCallId={toolCallId}
            pending={resultState.pending}
            state={resultState.state}
            isError={isError}
            truncated={isTruncatedArgs(args)}
            className="text-muted-foreground ms-auto text-xs"
          />
        </div>
        <ToolFallbackContent>
          <ToolFallbackError status={status} />
          {argsText ? (
            <div data-slot="mcp-tool-call-args">
              <p className="text-muted-foreground text-xs font-medium">
                {MCP_TOOL_LABELS.input}
              </p>
              <pre
                className={cn(
                  "bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs whitespace-pre-wrap",
                  isCancelled && "opacity-60",
                )}
              >
                {argsText}
              </pre>
            </div>
          ) : null}
          {shouldRenderApproval && (
            <ToolFallbackApproval
              addResult={addResult}
              resume={resume}
              interrupt={interrupt}
              approval={approval}
              respondToApproval={respondToApproval}
              status={approvalStatus}
            />
          )}
        </ToolFallbackContent>
      </ToolFallbackRoot>
      {!isCancelled && resultText !== null && resultText.length > 0 ? (
        <div
          data-slot="mcp-tool-call-result"
          className={cn(codeScroll, "border-border/40 border-t")}
        >
          <p className="text-muted-foreground px-3 pt-2 text-xs font-medium">
            {MCP_TOOL_LABELS.result}
          </p>
          {/* 平文 (MarkdownText に通さない。React が escape する。本文は domain で無害化済み)。 */}
          <pre
            className={cn(
              codeSurface,
              mono,
              "whitespace-pre-wrap px-3 py-2",
              isError ? "text-destructive/90" : "text-foreground/75",
            )}
          >
            {resultText}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

export const McpToolCall = memo(McpToolCallImpl) as ToolCallMessagePartComponent;
(McpToolCall as { displayName?: string }).displayName = "McpToolCall";
