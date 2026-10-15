"use client";

import { memo } from "react";
import { GlobeIcon, SearchIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";
import { joinHeading, readWebToolView } from "@/features/chat/tool-display";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import {
  ToolDisplayFrame,
  ToolResultBody,
  ToolResultPre,
} from "./tool-display-frame";
import { ToolFallback } from "./tool-fallback.aui";
import { webFetchHeading } from "./web-tool-heading";

/**
 * `WebFetch` / `WebSearch` の表示 (O-6 / FE-021 / 016 data-model §2)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `WebFetch` の見出しは **URL の host だけ** (パス・クエリ・資格情報・フラグメントを出さない)。リンクにしない | data-model §2 (design-gate R2 H-01) |
 * | 中身は伏せ字を通した全体の URL・`prompt`・結果の text。URL を `<a>` にしない | data-model §2 |
 * | `WebSearch` は `query` と制限の件数。結果は text のまま (Sources を組まない。U-5) | data-model §2 |
 *
 * registry 照合 (Principle XIII): Web search (結果の組み立てが無いので採らず、既存の枠で作る)。Inline citation / Sources は
 * 使わない (結果の文からリンクを推測しない)。
 */
const WebToolImpl: ToolCallMessagePartComponent = (props) => {
  const view = readWebToolView(props.toolName, props.argsText);
  if (view === null) return <ToolFallback {...props} />;
  const heading =
    view.source !== null
      ? joinHeading([webFetchHeading(view.source)])
      : view.heading;
  return (
    <ToolDisplayFrame
      slot="aui_web-tool"
      icon={view.tool === "WebFetch" ? GlobeIcon : SearchIcon}
      heading={heading}
      part={props}
    >
      {view.url !== null ? (
        <p data-slot="web-tool-url" className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">
            {TOOL_DISPLAY_LABELS.url}
          </span>
          <code className={cn(mono, "break-all")}>{view.url}</code>
        </p>
      ) : null}
      {view.prompt !== null && view.prompt !== "" ? (
        <p data-slot="web-tool-prompt" className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">
            {TOOL_DISPLAY_LABELS.prompt}
          </span>
          <span className="whitespace-pre-wrap wrap-break-word">
            {view.prompt}
          </span>
        </p>
      ) : null}
      <ToolResultBody
        part={props}
        render={(text) => <ToolResultPre text={text} />}
      />
    </ToolDisplayFrame>
  );
};

export const WebTool = memo(WebToolImpl) as ToolCallMessagePartComponent;
(WebTool as { displayName?: string }).displayName = "WebTool";
