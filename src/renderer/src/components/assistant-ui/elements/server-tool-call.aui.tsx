"use client";

import { memo } from "react";
import { GlobeIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { SERVER_TOOL_LABELS } from "@/features/chat/labels";
import { joinHeading } from "@/features/chat/tool-display";
import { redactSecrets } from "@domain/session/secret-redaction";
import type { ServerToolResultDTO } from "@domain/session/transcript-dto";
import { ToolDisplayFrame } from "./tool-display-frame";
import { UnsupportedBlockMark } from "./unsupported-block-mark";
import { webFetchHeading } from "./web-tool-heading";

/**
 * サーバー側の tool (`server_tool_use` とその結果のブロック) の表示 (O-12 / FR-008 / FR-009。data-model §2.5)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | `convert.ts` が信頼の印 `args.__serverTool` を付けた tool-call だけが来る (`tool-registry.aui.tsx` が先頭で振り分ける) | data-model §2.4 / PR-H-1 |
 * | 見出しは tool 名と、`web_search` なら検索語 (1 行。伏せ字を通す)。既定で畳む | data-model §2.5 |
 * | 結果は Sources の一覧 / エラーの印と種類 / 結果の位置の UnsupportedBlockMark。結果待ち・結果不明の印は `ToolDisplayFrame` の `ToolResultMarks` | US-3 AC1〜AC4 |
 * | Sources は項目ごとにタイトル (空なら host) と host。`https?://` で始まる URL だけ `<a target="_blank">`。URL を取得・プレビューしない | FR-009 |
 *
 * registry 照合 (Principle XIII / FE-001): registry の Web search / Sources は、リンクの開き方・http(s) 以外の除外・文言の英語の
 * 既定を source で確かめられず (CLI を実行しない)、結果の 3 形と信頼の印の振り分けも持たないため取り込まず、取り込み済みの
 * `ToolDisplayFrame` (ToolFallback と同じ枠) の中で自作した。
 */

function readServerResult(args: unknown): ServerToolResultDTO | null {
  if (typeof args !== "object" || args === null) return null;
  const marker = (args as Record<string, unknown>).__serverTool;
  if (typeof marker !== "object" || marker === null) return null;
  const result = (marker as Record<string, unknown>).result;
  if (typeof result !== "object" || result === null) return null;
  return result as ServerToolResultDTO;
}

function readQuery(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  const query = (args as Record<string, unknown>).query;
  return typeof query === "string" ? redactSecrets(query) : "";
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function SourcesList({
  sources,
  omitted,
}: {
  sources: readonly { title: string; url: string }[];
  omitted: number;
}): React.JSX.Element {
  if (sources.length === 0) {
    return (
      <p data-slot="server-tool-sources-empty" className="text-muted-foreground text-xs">
        {SERVER_TOOL_LABELS.noSources}
      </p>
    );
  }
  return (
    <div data-slot="server-tool-sources">
      <p className="text-muted-foreground text-xs font-medium">
        {SERVER_TOOL_LABELS.sources}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {sources.map((source, index) => {
          const linked = isHttpUrl(source.url);
          const host = linked ? webFetchHeading(source.url) : "";
          const title = source.title.length > 0 ? source.title : host;
          return (
            <li
              key={index}
              data-slot="server-tool-source"
              className="flex min-w-0 flex-col"
            >
              {linked ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-foreground min-w-0 truncate underline underline-offset-2"
                >
                  {title}
                </a>
              ) : (
                <span className="text-foreground min-w-0 truncate">{title}</span>
              )}
              {host.length > 0 && host !== title ? (
                <span className="text-muted-foreground min-w-0 truncate text-xs">
                  {host}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {omitted > 0 ? (
        <p data-slot="server-tool-sources-more" className="text-muted-foreground mt-1 text-xs">
          {SERVER_TOOL_LABELS.more(omitted)}
        </p>
      ) : null}
    </div>
  );
}

const ServerToolCallImpl: ToolCallMessagePartComponent = (props) => {
  const result = readServerResult(props.args);
  const query = props.toolName === "web_search" ? readQuery(props.args) : "";
  const heading = joinHeading([props.toolName, query]);
  return (
    <ToolDisplayFrame
      slot="aui_server-tool-call"
      icon={GlobeIcon}
      heading={heading}
      part={props}
    >
      {result?.kind === "web-search" ? (
        <SourcesList sources={result.sources} omitted={result.omitted} />
      ) : null}
      {result?.kind === "error" ? (
        <p
          data-slot="server-tool-error"
          className="text-destructive text-xs"
        >
          {SERVER_TOOL_LABELS.searchFailed(result.errorCode)}
        </p>
      ) : null}
      {result?.kind === "unsupported" ? (
        <UnsupportedBlockMark blockType={result.blockType} />
      ) : null}
    </ToolDisplayFrame>
  );
};

export const ServerToolCall = memo(ServerToolCallImpl) as ToolCallMessagePartComponent;
(ServerToolCall as { displayName?: string }).displayName = "ServerToolCall";
