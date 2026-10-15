"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";
import { resultTextOf } from "@/features/chat/tool-display";
import { useToolResultState } from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import {
  ToolFallbackContent,
  ToolFallbackRoot,
  ToolFallbackStatusIcon,
} from "./tool-fallback.aui";
import {
  isTruncatedArgs,
  ToolErrorResult,
  ToolResultMarks,
} from "./tool-result-marks";

/**
 * ファイル・検索・Web・計画の tool の表示 (FileTool / WebTool / TaskTool) の共通の枠 (O-6 / FE-020〜FE-022)。
 * 1 行の見出し (既定で畳む) と中身。状態のアイコンと経過時間の `pending` は FE-002 の `useToolResultState` から出す
 * (assistant-ui の part の状態を使わない)。エラーの結果は既存の `ToolResultMarks` の「エラー」の印と `ToolErrorResult` の
 * 本文で、畳んだままでも見える。
 *
 * registry 照合 (Principle XIII / 016 research R-05): 畳む部品は ToolFallback / McpToolCall と同じ
 * (`ToolFallbackRoot` / `CollapsibleTrigger`)。新しい依存は足さない。
 */
export function ToolDisplayFrame({
  slot,
  icon: Icon,
  heading,
  part,
  children,
}: {
  /** 外側の `data-slot` (`aui_file-tool` など)。 */
  slot: string;
  icon: React.ElementType;
  /** 1 行の見出し (純関数で作った値)。 */
  heading: string;
  part: ToolCallMessagePartProps;
  children?: React.ReactNode;
}): React.JSX.Element {
  const { state, status, pending } = useToolResultState(part);
  const [open, setOpen] = useState(false);
  return (
    <div
      data-slot={slot}
      className="border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <ToolFallbackRoot open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-3">
          <CollapsibleTrigger
            data-slot="tool-display-trigger"
            className="group/trigger text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-2 py-1.5 text-start text-sm transition-[color,scale] active:scale-[0.98]"
          >
            <ToolFallbackStatusIcon status={status} />
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            <span
              data-slot="tool-display-heading"
              className="text-foreground min-w-0 truncate font-medium"
            >
              {heading}
            </span>
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
          <ToolResultMarks
            toolCallId={part.toolCallId}
            pending={pending}
            state={state}
            isError={part.isError}
            truncated={isTruncatedArgs(part.args)}
            className="text-muted-foreground ms-auto text-xs"
          />
        </div>
        <ToolFallbackContent>{children}</ToolFallbackContent>
      </ToolFallbackRoot>
      <ToolErrorResult isError={part.isError} result={part.result} />
    </div>
  );
}

/**
 * 結果の本文。結果が無い (結果待ち・結果不明) ときとエラーのとき (`ToolErrorResult` が出す) は何も出さない。
 * text でない結果・空の結果は「text でない結果か、空の結果です」。text は `render` に渡す。
 */
export function ToolResultBody({
  part,
  render,
}: {
  part: Pick<ToolCallMessagePartProps, "result" | "isError">;
  render: (text: string) => React.ReactNode;
}): React.JSX.Element | null {
  if (part.result === undefined || part.isError) return null;
  const text = resultTextOf(part.result);
  return (
    <div data-slot="tool-display-result">
      <p className="text-muted-foreground text-xs font-medium">
        {TOOL_DISPLAY_LABELS.result}
      </p>
      {text === null ? (
        <p
          data-slot="tool-display-empty"
          className="text-muted-foreground mt-1 text-xs"
        >
          {TOOL_DISPLAY_LABELS.emptyResult}
        </p>
      ) : (
        render(text)
      )}
    </div>
  );
}

/** 結果の text を平文で出す (`<pre>`。markdown に通さない。React が escape する)。 */
export function ToolResultPre({ text }: { text: string }): React.JSX.Element {
  return (
    <pre
      data-slot="tool-display-result-text"
      className={cn(
        mono,
        "bg-muted/50 text-foreground/90 mt-1 max-h-96 overflow-auto rounded-md p-2.5 whitespace-pre-wrap wrap-break-word",
      )}
    >
      {text}
    </pre>
  );
}
