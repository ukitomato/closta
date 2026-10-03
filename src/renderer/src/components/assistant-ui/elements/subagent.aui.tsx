"use client";

import { memo } from "react";
import { BotIcon, WrenchIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import type { TranscriptMessageDTO, TranscriptPartDTO } from "@domain/session/transcript-dto";
import {
  SYSTEM_EVENT_CATEGORY_LABELS,
  SYSTEM_EVENT_STATUS_LABELS,
} from "@/features/chat/labels";
import { parseAgentArgs, parseTaskArgs } from "@/features/chat/tool-args";
import { ToolFallback } from "./tool-fallback.aui";

/**
 * Task (subagent) を Subagent 表示にする (R-4 / FR-004 / FR-005 / US-2 / Tier A: Subagent list)。
 *
 * 呼び出し (subagent_type / 依頼) と最終結果に加え、**配下メッセージを親 Task の下に入れ子**で示す。
 * 入れ子データは `domain` (`transcript.ts`) が `parent_tool_use_id` で対応づけて DTO の tool-call.children に
 * 積み、`convert.ts` が `args.__subagentChildren` として渡す (research R-02 / data-model §4)。
 * 会話由来文字列は **plain text** で描画 (React escape。argsText は domain で sanitizeBody 済み)。
 * narrowing 失敗時は `ToolFallback` に退避 (FR-009 / SC-005)。
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
        <p className="text-foreground/85 whitespace-pre-wrap wrap-break-word leading-relaxed">
          {part.text}
        </p>
      );
    case "reasoning":
      return (
        <p className="text-muted-foreground whitespace-pre-wrap wrap-break-word text-xs italic">
          {part.text}
        </p>
      );
    case "tool-call": {
      const result = typeof part.result === "string" && part.result.length > 0 ? part.result : null;
      return (
        <div className="border-border/40 flex flex-col gap-1 rounded-md border px-2 py-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <WrenchIcon className="size-3 shrink-0" />
            <span className="font-medium">{part.toolName}</span>
            {part.isError ? <span className="text-destructive">失敗</span> : null}
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
    case "image":
      return <p className="text-muted-foreground text-xs">🖼 画像</p>;
    case "file":
      return <p className="text-muted-foreground text-xs">📎 {part.filename}</p>;
    case "divider":
      return <p className="text-muted-foreground text-center text-xs">── {part.label} ──</p>;
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
        {children.length > 0 ? <SubagentBody messages={children} depth={1} /> : null}
        {result ? (
          <div className="border-border/30 border-t pt-2">
            <p className="text-muted-foreground mb-1 text-xs font-medium">結果</p>
            <pre className="text-foreground/80 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
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
