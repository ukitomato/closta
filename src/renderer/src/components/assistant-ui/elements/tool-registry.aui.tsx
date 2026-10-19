"use client";

import { memo } from "react";
import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { parseMcpToolName } from "@/features/chat/mcp-tool-name";
import { AgentPlan } from "./agent-plan.aui";
import { AskUserQuestion } from "./ask-user-question.aui";
import { CodeDiff } from "./code-diff.aui";
import { FileTool } from "./file-tool.aui";
import { McpToolCall } from "./mcp-tool-call.aui";
import { NestedToolRendererContext } from "./nested-tool-context";
import { Subagent } from "./subagent.aui";
import { TaskTool } from "./task-tool.aui";
import { TerminalBlock } from "./terminal-block.aui";
import { TodoList } from "./todo-list.aui";
import { ToolFallback } from "./tool-fallback.aui";
import { WebTool } from "./web-tool.aui";

/**
 * `toolName` → 専用表示の登録 (R-4 / FE-022 / contracts C-1 / research R-01)。
 *
 * **`useExternalStoreRuntime` では `part.toolUI` (name 登録 slot) が確実に埋まらない**ため、
 * `makeAssistantToolUI` に依存せず、この map で描画点 (thread.aui.tsx) から dispatch する。
 * **5 tool 表示種と 1:1** (Terminal / Code diff / Todo / Subagent / Agent plan)。Edit/Write/MultiEdit は
 * すべて Code diff に写す。**thinking(Reasoning) と連続 tool(Tool group) は toolName ではなく R-3 の grouping が
 * 担うため対象外** (data-model §3 / design-gate M-2)。
 *
 * **振り分けは 2 段** (O-5 / AD-048 Decision 5。015 data-model §1「振り分け」):
 * (1) 完全一致の表 (`Object.hasOwn` で照合。`constructor` などの prototype のキーで `Object.prototype` の関数を引かない)
 * → (2) `parseMcpToolName` が `mcp` (`mcp__` で始まる名前) なら `McpToolCall` → (3) `ToolFallback`。
 * **(1)(2) のどちらにも当たらない toolName は必ず `ToolFallback` に落ちる** (AD-035 Decision 1)。
 */
/**
 * Agent / Task の表示の包み (O-11 / FE-031)。入れ子の tool-call を主ループと同じ振り分け (`ToolDisplay`) で描けるように、
 * `NestedToolRendererContext` (`nested-tool-context.ts`) の Provider を置く。`subagent.aui.tsx` は本ファイルを import しない
 * (依存の向きは本ファイル → `subagent.aui.tsx` の 1 方向。値は context で注入する)。
 */
function renderNestedTool(props: ToolCallMessagePartProps): React.JSX.Element {
  return <ToolDisplay key={props.toolCallId} {...props} />;
}

const SubagentWithNestedDisplay: ToolCallMessagePartComponent = (props) => (
  <NestedToolRendererContext.Provider value={renderNestedTool}>
    <Subagent {...props} />
  </NestedToolRendererContext.Provider>
);
SubagentWithNestedDisplay.displayName = "SubagentWithNestedDisplay";

const TOOL_DISPLAY: Readonly<Record<string, ToolCallMessagePartComponent>> = {
  Bash: TerminalBlock,
  Edit: CodeDiff,
  Write: CodeDiff,
  MultiEdit: CodeDiff,
  TodoWrite: TodoList,
  // subagent の実行時の名前は SDK 0.3.270 で `Agent` (入力型 `AgentInput`)。旧名 `Task` も同じ表示に当てる
  // (O-2 / FR-010 / research R-05)。
  Task: SubagentWithNestedDisplay,
  Agent: SubagentWithNestedDisplay,
  ExitPlanMode: AgentPlan,
  // MCP の組み込みの 4 tool (O-5 / 015 data-model §1)。`mcp__` の接頭辞を持たないので完全一致で振り分ける。
  ListMcpResourcesTool: McpToolCall,
  ReadMcpResourceTool: McpToolCall,
  ReadMcpResourceDir: McpToolCall,
  RefreshMcpTools: McpToolCall,
  // Claude からの問い (読み取り専用。回答の入力は O-10。015 data-model §1)。
  AskUserQuestion,
  // ファイル・検索・Web・計画の 9 tool (O-6 / 016 data-model §2)。`Task` は Subagent のまま (旧名の subagent)。
  Read: FileTool,
  Glob: FileTool,
  Grep: FileTool,
  WebFetch: WebTool,
  WebSearch: WebTool,
  TaskCreate: TaskTool,
  TaskGet: TaskTool,
  TaskUpdate: TaskTool,
  TaskList: TaskTool,
};

const ToolDisplayImpl: ToolCallMessagePartComponent = (props) => {
  // (1) 完全一致の表
  const Exact = Object.hasOwn(TOOL_DISPLAY, props.toolName)
    ? TOOL_DISPLAY[props.toolName]
    : undefined;
  if (Exact !== undefined) return <Exact {...props} />;
  // (2) `mcp__` の接頭辞。種類の判定にサーバー名は要らない (分け方は McpToolCall が表示中のセッションの構成で決める)。
  if (parseMcpToolName(props.toolName, [])?.kind === "mcp")
    return <McpToolCall {...props} />;
  // (3) どちらにも当たらない
  return <ToolFallback {...props} />;
};

/** 描画点で使う dispatcher。未対応 tool は `ToolFallback` (R-3) にそのまま落ちる。 */
export const ToolDisplay = memo(ToolDisplayImpl) as ToolCallMessagePartComponent;
(ToolDisplay as { displayName?: string }).displayName = "ToolDisplay";
