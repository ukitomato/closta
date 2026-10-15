"use client";

import { memo } from "react";
import { CircleIcon, CircleCheckBigIcon, CircleDotIcon, ListTodoIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { isKnownTodoStatus, parseTodoArgs, type TodoStatus } from "@/features/chat/tool-args";
import { useToolResultState } from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { ToolFallback } from "./tool-fallback.aui";
import { isTruncatedArgs, ToolErrorResult, ToolResultMarks } from "./tool-result-marks";

/**
 * TodoWrite をチェックリスト表示にする (R-4 / FR-003 / Tier A: Todo list)。
 *
 * 各 Todo の status (pending / in_progress / completed) を **status ごとに区別可能な DOM マーカー**で示す
 * (視覚差の確認は quickstart 実機。SC-003)。未知 status は生値で示し欠落させない (SC-003)。
 * narrowing 失敗時は `ToolFallback` に退避 (FR-009 / SC-005)。
 * 結果は普段は出さず、エラーのときだけ「エラー」の印と本文を出す。切り詰めの印も出す (O-2 / FR-007)。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-todo-list` (`TodoList` / `TodoItem`)。
 * Claude Code の todos (content/status/activeForm) 形に合わせて `.aui.tsx` として自作した (ADR 参照)。
 */

const STATUS_META: Record<TodoStatus, { icon: React.ElementType; className: string; label: string }> =
  {
    pending: { icon: CircleIcon, className: "text-muted-foreground", label: "未着手" },
    in_progress: { icon: CircleDotIcon, className: "text-blue-500 dark:text-blue-400", label: "進行中" },
    completed: { icon: CircleCheckBigIcon, className: "text-emerald-500", label: "完了" },
  };

const TodoListImpl: ToolCallMessagePartComponent = (props) => {
  const resultState = useToolResultState(props);
  const args = parseTodoArgs(props.argsText);
  if (!args) return <ToolFallback {...props} />;

  return (
    <div
      data-slot="aui_todo-list"
      className="aui-todo-list border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-todo-list-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <ListTodoIcon className="size-3.5 shrink-0" />
        <span className="font-medium">Todo</span>
        {/* 透明度を足さない — muted-foreground のまま 4.5:1 を保つ (pr-gate R2 a11y H-001 の同種事象)。 */}
        <span>（{args.todos.length}）</span>
        <ToolResultMarks
          toolCallId={props.toolCallId}
          pending={resultState.pending}
          state={resultState.state}
          isError={props.isError}
          truncated={isTruncatedArgs(props.args)}
          className="ms-auto"
        />
      </div>
      {args.todos.length === 0 ? (
        <p className="text-muted-foreground border-border/40 border-t px-3 py-2 text-xs">
          項目はありません
        </p>
      ) : (
        <ul className="border-border/40 flex flex-col border-t">
          {args.todos.map((todo, index) => {
            const known = isKnownTodoStatus(todo.status);
            const meta = known ? STATUS_META[todo.status] : null;
            const Icon = meta?.icon ?? CircleIcon;
            return (
              <li
                key={index}
                data-status={todo.status}
                className="flex items-start gap-2 px-3 py-1.5"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", meta?.className ?? "text-amber-500")} />
                <span
                  className={cn(
                    "min-w-0 wrap-break-word",
                    known && todo.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {todo.content}
                </span>
                {!known ? (
                  <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                    {todo.status}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ToolErrorResult isError={props.isError} result={props.result} />
    </div>
  );
};

export const TodoList = memo(TodoListImpl) as ToolCallMessagePartComponent;
(TodoList as { displayName?: string }).displayName = "TodoList";
