"use client";

import { memo } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { AgentPlan } from "./agent-plan.aui";
import { CodeDiff } from "./code-diff.aui";
import { Subagent } from "./subagent.aui";
import { TerminalBlock } from "./terminal-block.aui";
import { TodoList } from "./todo-list.aui";
import { ToolFallback } from "./tool-fallback.aui";

/**
 * `toolName` → 専用表示の登録 (R-4 / FE-022 / contracts C-1 / research R-01)。
 *
 * **`useExternalStoreRuntime` では `part.toolUI` (name 登録 slot) が確実に埋まらない**ため、
 * `makeAssistantToolUI` に依存せず、この map で描画点 (thread.aui.tsx) から dispatch する。
 * **5 tool 表示種と 1:1** (Terminal / Code diff / Todo / Subagent / Agent plan)。Edit/Write/MultiEdit は
 * すべて Code diff に写す。**thinking(Reasoning) と連続 tool(Tool group) は toolName ではなく R-3 の grouping が
 * 担うため対象外** (data-model §3 / design-gate M-2)。**未登録 toolName は必ず `ToolFallback` に落ちる**。
 */
const TOOL_DISPLAY: Readonly<Record<string, ToolCallMessagePartComponent>> = {
  Bash: TerminalBlock,
  Edit: CodeDiff,
  Write: CodeDiff,
  MultiEdit: CodeDiff,
  TodoWrite: TodoList,
  // subagent の実行時の名前は SDK 0.3.270 で `Agent` (入力型 `AgentInput`)。旧名 `Task` も同じ表示に当てる
  // (O-2 / FR-010 / research R-05)。
  Task: Subagent,
  Agent: Subagent,
  ExitPlanMode: AgentPlan,
};

const ToolDisplayImpl: ToolCallMessagePartComponent = (props) => {
  const Component = TOOL_DISPLAY[props.toolName] ?? ToolFallback;
  return <Component {...props} />;
};

/** 描画点で使う dispatcher。未対応 tool は `ToolFallback` (R-3) にそのまま落ちる。 */
export const ToolDisplay = memo(ToolDisplayImpl) as ToolCallMessagePartComponent;
(ToolDisplay as { displayName?: string }).displayName = "ToolDisplay";
