"use client";

import { memo, useContext } from "react";
import { BotIcon, WrenchIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import type { TranscriptMessageDTO, TranscriptPartDTO } from "@domain/session/transcript-dto";
import {
  DOCUMENT_LABELS,
  documentKindLabel,
  SERVER_TOOL_LABELS,
  SYSTEM_EVENT_CATEGORY_LABELS,
  SYSTEM_EVENT_STATUS_LABELS,
} from "@/features/chat/labels";
import { toToolCallPartProps } from "@/features/chat/convert";
import { parseAgentArgs, parseTaskArgs } from "@/features/chat/tool-args";
import { useToolResultState } from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { MarkdownBody } from "./markdown-body";
import { NestedDepthContext, NestedToolRendererContext } from "./nested-tool-context";
import { ReasoningContent, ReasoningRoot, ReasoningText, ReasoningTrigger } from "./reasoning.aui";
import { ToolFallback } from "./tool-fallback.aui";
import { isTruncatedArgs, ToolResultMarks } from "./tool-result-marks";
import { TranscriptBoundary } from "./transcript-boundary";
import { UnsupportedBlockMark } from "./unsupported-block-mark";

/**
 * Task (subagent) を Subagent 表示にする (R-4 / FR-004 / FR-005 / US-2 / Tier A: Subagent list)。
 *
 * 呼び出し (subagent_type / 依頼) と最終結果に加え、**配下メッセージを親 Task の下に入れ子**で示す。
 * 入れ子データは `domain` (`transcript.ts`) が `parent_tool_use_id` で対応づけて DTO の tool-call.children に
 * 積み、`convert.ts` が `args.__subagentChildren` として渡す (research R-02 / data-model §4)。
 * 会話由来文字列は **plain text** で描画 (React escape。argsText は domain で sanitizeBody 済み)。
 * narrowing 失敗時は `ToolFallback` に退避 (FR-009 / SC-005)。
 *
 * **入れ子の中の描画** (O-11 / FE-031 / data-model §3.3): tool-call は主ループと同じ振り分け (完全一致の表 → MCP →
 * ToolFallback) で描く。振り分けは `nested-tool-context.ts` の `NestedToolRendererContext` で注入される — `tool-registry.aui.tsx` が Agent / Task の表示の
 * 包みで Provider を置く (**依存の向きは `tool-registry.aui.tsx` → 本ファイルの 1 方向のまま。本ファイルは `tool-registry.aui.tsx`
 * と `thread.aui.tsx` を import しない**。循環の禁止 / AD-023 §7)。値が `null` (registry の外で描いたとき) と、深さが
 * `VISUAL_MAX_DEPTH` を超えるときは今の簡易な描画 (tool 名・`ToolResultMarks`・結果の `pre`)。text は markdown (`MarkdownBody`)、
 * thinking は Reasoning、divider は `TranscriptBoundary`。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-subagent-list` (`SubagentList`) /
 * `agent-handoff`。入れ子 transcript の再帰描画は registry 版に無いため補完自作した (ADR 参照)。
 */

/** children を入れ子描画する視覚的な深さ上限 (これを超えたら件数だけ示す。data-model §4)。 */
const VISUAL_MAX_DEPTH = 3;

/** 1 階層に描画する子メッセージ数の上限 (PR-M-1。巨大 inline subagent ログでの renderer フリーズを防ぐ)。 */
const VISUAL_MAX_CHILDREN = 50;

/** 子メッセージの最小 shape 検証 (PR-H-1 の防御。malformed 要素で描画がクラッシュしないよう落とす)。 */
function isValidChild(message: unknown): message is TranscriptMessageDTO {
  if (typeof message !== "object" || message === null) return false;
  const r = message as Record<string, unknown>;
  return typeof r.id === "string" && Array.isArray(r.parts);
}

/**
 * convert.ts が args.__subagentChildren に積んだ DTO を取り出す。
 *
 * convert.ts が `__` prefix を strip して信頼値のみ設定するため (PR-H-1) 届く children は domain 由来だが、
 * defense-in-depth として per-item の最小 shape を検証し malformed は落とす (欠落より描画クラッシュ回避を優先)。
 */
function extractChildren(args: unknown): readonly TranscriptMessageDTO[] {
  if (typeof args !== "object" || args === null) return [];
  const raw = (args as Record<string, unknown>).__subagentChildren;
  return Array.isArray(raw) ? raw.filter(isValidChild) : [];
}

/** 入れ子の tool-call の 1 つ (結果の状態の hook を使うので component に切り出す。DTO の `result: null` は結果なし)。 */
function SubagentToolCall({
  part,
  depth,
}: {
  part: Extract<TranscriptPartDTO, { type: "tool-call" }>;
  depth: number;
}): React.JSX.Element {
  const renderNested = useContext(NestedToolRendererContext);
  const resultState = useToolResultState({
    toolCallId: part.toolCallId,
    result: part.result === null ? undefined : part.result,
    isError: part.isError,
  });
  if (renderNested !== null && depth <= VISUAL_MAX_DEPTH) {
    return (
      <div data-slot="subagent-nested-tool" className="flex flex-col gap-1">
        <NestedDepthContext.Provider value={depth}>
          {renderNested(toToolCallPartProps(part))}
        </NestedDepthContext.Provider>
      </div>
    );
  }
  const result = typeof part.result === "string" && part.result.length > 0 ? part.result : null;
  return (
    <div className="border-border/40 flex flex-col gap-1 rounded-md border px-2 py-1">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <WrenchIcon className="size-3 shrink-0" />
        <span className="font-medium">{part.toolName}</span>
        {/* 入れ子でも最上位と同じ印 (エラーと切り詰め。pr-gate R2 ui-coverage L-101)。 */}
        <ToolResultMarks
          toolCallId={part.toolCallId}
          pending={resultState.pending}
          state={resultState.state}
          isError={part.isError}
          truncated={part.truncated === true}
        />
      </div>
      {result ? (
        <pre className="text-foreground/70 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
          {result}
        </pre>
      ) : null}
      {Array.isArray(part.children) && part.children.length > 0 ? (
        <SubagentBody messages={part.children} depth={depth + 1} />
      ) : null}
    </div>
  );
}

/**
 * 入れ子のサーバー側の tool (O-12 / FR-008)。主ループと同じ振り分け (`NestedToolRendererContext` → ServerToolCall) で描く。
 * 振り分けの外 (`null`) では tool 名の 1 行 (結果の中身は出さない)。
 */
function SubagentServerToolCall({
  part,
  depth,
}: {
  part: Extract<TranscriptPartDTO, { type: "server-tool-call" }>;
  depth: number;
}): React.JSX.Element {
  const renderNested = useContext(NestedToolRendererContext);
  if (renderNested !== null && depth <= VISUAL_MAX_DEPTH) {
    return (
      <div data-slot="subagent-nested-tool" className="flex flex-col gap-1">
        <NestedDepthContext.Provider value={depth}>
          {renderNested(toToolCallPartProps(part))}
        </NestedDepthContext.Provider>
      </div>
    );
  }
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <WrenchIcon className="size-3 shrink-0" />
      <span className="font-medium">
        {part.toolName.length > 0 ? part.toolName : SERVER_TOOL_LABELS.defaultName}
      </span>
    </p>
  );
}

function SubagentPart({
  part,
  depth,
}: {
  part: TranscriptPartDTO;
  depth: number;
}): React.JSX.Element | null {
  switch (part.type) {
    case "text":
      return (
        <div data-slot="subagent-text" className="text-foreground/85 wrap-break-word">
          <MarkdownBody text={part.text} />
        </div>
      );
    case "reasoning":
      return (
        <ReasoningRoot>
          <ReasoningTrigger />
          <ReasoningContent>
            <ReasoningText>
              <MarkdownBody text={part.text} />
            </ReasoningText>
          </ReasoningContent>
        </ReasoningRoot>
      );
    case "tool-call": {
      return <SubagentToolCall part={part} depth={depth} />;
    }
    case "server-tool-call":
      return <SubagentServerToolCall part={part} depth={depth} />;
    case "unsupported-block":
      return <UnsupportedBlockMark blockType={part.blockType} />;
    case "image":
      return <p className="text-muted-foreground text-xs">🖼 画像</p>;
    case "file":
      return (
        <p data-slot="subagent-file" className="text-muted-foreground text-xs">
          📎 {part.filename.length > 0 ? part.filename : DOCUMENT_LABELS.unnamed}
          {" "}({documentKindLabel(part.mediaType)})
        </p>
      );
    case "divider":
      // 圧縮の境界 (O-6 の TranscriptBoundary。数を省いた文言。`label` は読まない)。
      return <TranscriptBoundary category="compact-boundary" detail="" />;
    case "system-event":
      // 入れ子の中のシステムイベントは最小の 1 行 (種類と状態。O-2)。行の合成と「結果不明」は transcript の行が担う。
      return (
        <p className="text-muted-foreground text-xs">
          {SYSTEM_EVENT_CATEGORY_LABELS[part.category]}
          {part.status !== null ? ` — ${SYSTEM_EVENT_STATUS_LABELS[part.status]}` : ""}
        </p>
      );
  }
}

function SubagentBody({
  messages,
  depth,
}: {
  messages: readonly TranscriptMessageDTO[];
  depth: number;
}): React.JSX.Element {
  if (depth > VISUAL_MAX_DEPTH) {
    return (
      <p className="text-muted-foreground text-xs">
        （深いネストのため以降 {messages.length} 件を省略）
      </p>
    );
  }
  // breadth 上限 (PR-M-1): 1 階層で全件を eager 描画すると巨大 inline ログで renderer が固まるため件数を絞る。
  const shown = messages.slice(0, VISUAL_MAX_CHILDREN);
  const omitted = messages.length - shown.length;
  return (
    <div className="border-border/30 ms-1 flex flex-col gap-2 border-s ps-3">
      {shown.map((message) => (
        <div key={message.id} data-role={message.role} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {message.role}
          </span>
          {message.parts.map((part, index) => (
            <SubagentPart key={index} part={part} depth={depth} />
          ))}
        </div>
      ))}
      {omitted > 0 ? (
        <p className="text-muted-foreground text-xs">（以降 {omitted} 件を省略）</p>
      ) : null}
    </div>
  );
}

const SubagentImpl: ToolCallMessagePartComponent = (props) => {
  // 実行時の名前は `Agent` (SDK 0.3.270) と旧名 `Task` のどちらも来る (O-2 / FR-010)。
  const resultState = useToolResultState(props);
  const baseDepth = useContext(NestedDepthContext);
  const args =
    props.toolName === "Agent"
      ? parseAgentArgs(props.argsText)
      : parseTaskArgs(props.argsText);
  if (!args) return <ToolFallback {...props} />;

  const children = extractChildren(props.args);
  const result = typeof props.result === "string" && props.result.length > 0 ? props.result : null;

  return (
    <div
      data-slot="aui_subagent"
      className="aui-subagent border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-subagent-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <BotIcon className="size-3.5 shrink-0" />
        <span className="font-medium">サブエージェント</span>
        {args.subagent_type ? (
          <span className="bg-muted text-foreground/80 rounded px-1.5 py-0.5">
            {args.subagent_type}
          </span>
        ) : null}
        {/* 最上位の失敗と切り詰め (入れ子の印だけでなく。O-2 / FR-007 / pr-gate R1 po H-001)。 */}
        <ToolResultMarks
          toolCallId={props.toolCallId}
          pending={resultState.pending}
          state={resultState.state}
          isError={props.isError}
          truncated={isTruncatedArgs(props.args)}
          className="ms-auto"
        />
      </div>
      <div className="border-border/40 flex flex-col gap-2 border-t px-3 py-2">
        {args.description ? (
          <p className="text-foreground/85 wrap-break-word">{args.description}</p>
        ) : null}
        {args.prompt ? (
          <pre className="text-foreground/70 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
            {args.prompt}
          </pre>
        ) : null}
        {children.length > 0 ? <SubagentBody messages={children} depth={baseDepth + 1} /> : null}
        {result ? (
          <div className="border-border/30 border-t pt-2">
            <p className="text-muted-foreground mb-1 text-xs font-medium">結果</p>
            <pre
              className={cn(
                "max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px]",
                props.isError ? "text-destructive/90" : "text-foreground/80",
              )}
            >
              {result}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const Subagent = memo(SubagentImpl) as ToolCallMessagePartComponent;
(Subagent as { displayName?: string }).displayName = "Subagent";
