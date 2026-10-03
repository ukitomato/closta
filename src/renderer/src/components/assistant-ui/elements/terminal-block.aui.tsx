"use client";

import { memo } from "react";
import { CheckIcon, TerminalIcon, XCircleIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { parseBashArgs } from "@/features/chat/tool-args";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono } from "./surfaces";
import { ToolFallback } from "./tool-fallback.aui";

/**
 * Bash の tool 実行を端末風ブロックで示す (R-4 / FR-001 / Tier A: Terminal block)。
 *
 * **過去ログから再現可能な静的表示**に限る — command と捕捉済み出力を等幅・改行保持で並べ、成否を示す。
 * live の行単位ストリームと exit status のリアルタイム表示は X-1 (spec [ASSUMED: live 実行は対象外])。
 * command / output は会話由来の untrusted text として **plain text** で描画する (React が escape する。FR-002 精神)。
 * `argsText` は domain で `sanitizeBody` (bidi/C1 除去 + byte 上限) 済み (design-gate H-1)。
 * narrowing 失敗時は生 argsText の `ToolFallback` に退避する (FR-009 / SC-005)。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-terminal-block` (`TerminalBlock`)。
 * command + 捕捉済み出力 + 成否という Claude Code の Bash 形に合わせて `.aui.tsx` として自作した
 * (registry 版は live 行ストリーム前提で props 形が合わないため。ADR 参照)。
 */
const TerminalBlockImpl: ToolCallMessagePartComponent = (props) => {
  const args = parseBashArgs(props.argsText);
  if (!args) return <ToolFallback {...props} />;

  const output = typeof props.result === "string" ? props.result : null;
  const hasOutput = output !== null && output.length > 0;
  // 切り詰めフラグは convert.ts が args.__truncated に載せる (Code diff と同じ経路。O-2 / FR-007 で実行中の結果も通る)。
  const isTruncated =
    typeof props.args === "object" &&
    props.args !== null &&
    (props.args as Record<string, unknown>).__truncated === true;

  return (
    <div
      data-slot="aui_terminal-block"
      className="aui-terminal-block border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-terminal-block-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <TerminalIcon className="size-3.5 shrink-0" />
        <span className="font-medium">Bash</span>
        {args.description ? (
          <span className="truncate opacity-80">— {args.description}</span>
        ) : null}
        {isTruncated ? (
          <span className="ms-auto shrink-0 opacity-70">（切り詰め）</span>
        ) : null}
        {props.isError ? (
          <XCircleIcon
            className={cn("text-destructive size-3.5 shrink-0", !isTruncated && "ms-auto")}
            aria-label="失敗"
          />
        ) : hasOutput ? (
          <CheckIcon
            className={cn("size-3.5 shrink-0 text-emerald-500", !isTruncated && "ms-auto")}
            aria-label="完了"
          />
        ) : null}
      </div>
      <div className={cn(codeScroll, "border-border/40 border-t")}>
        <pre
          className={cn(
            codeSurface,
            mono,
            "text-foreground/90 whitespace-pre-wrap px-3 py-2",
          )}
        >
          <span className="text-muted-foreground select-none">$ </span>
          {args.command}
        </pre>
      </div>
      {hasOutput ? (
        <div className={cn(codeScroll, "border-border/40 border-t")}>
          <pre
            className={cn(
              codeSurface,
              mono,
              "whitespace-pre-wrap px-3 py-2",
              props.isError ? "text-destructive/90" : "text-foreground/75",
            )}
          >
            {output}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

export const TerminalBlock = memo(TerminalBlockImpl) as ToolCallMessagePartComponent;
(TerminalBlock as { displayName?: string }).displayName = "TerminalBlock";
