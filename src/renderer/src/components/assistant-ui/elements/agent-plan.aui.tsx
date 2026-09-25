"use client";

import { memo } from "react";
import { ClipboardListIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { parsePlanArgs } from "@/features/chat/tool-args";
import { ToolFallback } from "./tool-fallback.aui";

/**
 * ExitPlanMode の計画を Agent plan 表示にする (R-4 / FR-006 / Tier A: Agent plan)。
 *
 * plan は会話由来の untrusted markdown。**plain text (whitespace-pre-wrap) で描画する** — React が escape するため
 * 生 HTML は描画されず `javascript:` 等のリンクも inert text になる (FR-006 / FR-012 / SC-002 / design-gate M-5)。
 * `MarkdownText`/`MarkdownTextPrimitive` は text-part context 依存で任意文字列を安全に受けられないため、
 * R-4 は独自 markdown 経路を作らず plain text とする (rich markdown 化は将来、plan を text part 化して行う)。
 * `argsText` は domain で `sanitizeBody` (bidi/C1 除去 + byte 上限) 済み (design-gate H-1)。
 * narrowing 失敗時は `ToolFallback` に退避 (FR-009 / SC-005)。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-agent-plan` (`AgentPlan`)。
 * Claude Code の ExitPlanMode (plan 文字列) 形に合わせて `.aui.tsx` として自作した (ADR 参照)。
 */
const AgentPlanImpl: ToolCallMessagePartComponent = (props) => {
  const args = parsePlanArgs(props.argsText);
  if (!args) return <ToolFallback {...props} />;

  return (
    <div
      data-slot="aui_agent-plan"
      className="aui-agent-plan border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-agent-plan-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <ClipboardListIcon className="size-3.5 shrink-0" />
        <span className="font-medium">計画</span>
      </div>
      <div className="border-border/40 border-t px-3 py-2">
        <p className="text-foreground/90 whitespace-pre-wrap wrap-break-word leading-relaxed">
          {args.plan}
        </p>
      </div>
    </div>
  );
};

export const AgentPlan = memo(AgentPlanImpl) as ToolCallMessagePartComponent;
(AgentPlan as { displayName?: string }).displayName = "AgentPlan";
