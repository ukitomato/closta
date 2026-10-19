"use client";

import { memo, useState } from "react";
import { ClipboardListIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { Button } from "@/components/ui/button";
import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";
import { parsePlanArgs } from "@/features/chat/tool-args";
import { planHasUnrenderedMarkup } from "@/features/chat/tool-display";
import { useToolResultState } from "@/features/chat/transcript-context";
import { MarkdownBody } from "./markdown-body";
import { ToolFallback } from "./tool-fallback.aui";
import { isTruncatedArgs, ToolErrorResult, ToolResultMarks } from "./tool-result-marks";

/**
 * ExitPlanMode の計画を Agent plan 表示にする (R-4 / FR-006 / Tier A: Agent plan)。
 *
 * plan は会話由来の untrusted markdown。**共有の部品 `MarkdownBody` (既存の `MarkdownText` の包み) で描く** (O-6 / FE-023 /
 * 016 data-model §2「Agent plan」。AD-049 Decision 4。O-11 / FE-030 で部品に切り出した)。新しい markdown の描画口は作らない
 * (`@assistant-ui/react-markdown` の import は `markdown-text.tsx` だけ、`TextMessagePartProvider` の import は `markdown-body.tsx` だけ)。
 * 生 HTML は描画されず (rehype-raw 無し)、リンクは `safeUrlTransform` の allowlist (http(s) か相対) を通る。
 * 「原文」の切り替えで plain text (whitespace-pre-wrap) を出す。生 HTML・コメントがあるときは「表示されない部分が
 * あります。原文で確かめてください」の印を出す。
 * `argsText` は domain で `sanitizeBody` (bidi/C1 除去 + byte 上限) 済み (design-gate H-1)。
 * narrowing 失敗時は `ToolFallback` に退避 (FR-009 / SC-005)。
 * 結果は普段は出さず、エラー (計画の却下など) のときだけ「エラー」の印と本文を出す。切り詰めの印も出す (O-2 / FR-007)。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-agent-plan` (`AgentPlan`)。
 * Claude Code の ExitPlanMode (plan 文字列) 形に合わせて `.aui.tsx` として自作した (ADR 参照)。
 */
const AgentPlanImpl: ToolCallMessagePartComponent = (props) => {
  const [raw, setRaw] = useState(false);
  const resultState = useToolResultState(props);
  const args = parsePlanArgs(props.argsText);
  if (!args) return <ToolFallback {...props} />;
  const hasUnrendered = planHasUnrenderedMarkup(args.plan);

  return (
    <div
      data-slot="aui_agent-plan"
      className="aui-agent-plan border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-agent-plan-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <ClipboardListIcon className="size-3.5 shrink-0" />
        <span className="font-medium">計画</span>
        <ToolResultMarks
          toolCallId={props.toolCallId}
          pending={resultState.pending}
          state={resultState.state}
          isError={props.isError}
          truncated={isTruncatedArgs(props.args)}
          className="ms-auto"
        />
      </div>
      <div className="border-border/40 border-t px-3 py-2">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="agent-plan-raw-toggle"
            aria-pressed={raw}
            onClick={() => setRaw((v) => !v)}
          >
            {TOOL_DISPLAY_LABELS.raw}
          </Button>
          {hasUnrendered ? (
            <span
              data-slot="agent-plan-hidden-mark"
              role="note"
              className="text-muted-foreground text-xs"
            >
              {TOOL_DISPLAY_LABELS.planHidden}
            </span>
          ) : null}
        </div>
        {raw ? (
          <p
            data-slot="agent-plan-raw"
            className="text-foreground/90 whitespace-pre-wrap wrap-break-word leading-relaxed"
          >
            {args.plan}
          </p>
        ) : (
          <div
            data-slot="agent-plan-markdown"
            className="text-foreground/90 wrap-break-word"
          >
            <MarkdownBody text={args.plan} />
          </div>
        )}
      </div>
      <ToolErrorResult isError={props.isError} result={props.result} />
    </div>
  );
};

export const AgentPlan = memo(AgentPlanImpl) as ToolCallMessagePartComponent;
(AgentPlan as { displayName?: string }).displayName = "AgentPlan";
