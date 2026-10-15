"use client";

import { memo, type JSX } from "react";
import {
  CircleCheckBigIcon,
  CircleDotIcon,
  CircleIcon,
  ListTodoIcon,
} from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import {
  readTaskToolView,
  type TaskItemView,
} from "@/features/chat/tool-display";
import { cn } from "@/lib/utils";
import {
  ToolDisplayFrame,
  ToolResultBody,
  ToolResultPre,
} from "./tool-display-frame";
import { ToolFallback } from "./tool-fallback.aui";

/**
 * `TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList` の表示 (O-6 / FE-022 / 016 data-model §2)。
 *
 * `TaskCreate` / `TaskUpdate` は TodoList と同じ体裁の 1 項目 (`TaskCreate` は「追加した時点: 未着手」と結果の text、
 * `TaskUpdate` は `subject` か「タスク #{taskId}」と状態。`status` が無ければ見出しだけ)。`TaskGet` / `TaskList` は
 * 見出しと結果の text。**呼び出しごとに描き、一覧に集めない** (FR-008)。状態は `Object.hasOwn` の表 (知らない値は「不明」)。
 *
 * registry 照合 (Principle XIII): Todo list (1 項目の描き方を写す。TodoWrite の `TodoList` は変えない)。
 */

const STATUS_ICON: Record<
  TaskItemView["statusKey"],
  { icon: React.ElementType; className: string }
> = {
  pending: { icon: CircleIcon, className: "text-muted-foreground" },
  in_progress: {
    icon: CircleDotIcon,
    className: "text-blue-500 dark:text-blue-400",
  },
  completed: { icon: CircleCheckBigIcon, className: "text-emerald-500" },
  deleted: { icon: CircleIcon, className: "text-muted-foreground" },
  unknown: { icon: CircleIcon, className: "text-amber-500" },
};

function TaskItem({ item }: { item: TaskItemView }): JSX.Element {
  const meta = STATUS_ICON[item.statusKey];
  const Icon = meta.icon;
  return (
    <ul data-slot="task-tool-item-list" className="flex flex-col">
      <li
        data-slot="task-tool-item"
        data-status={item.statusKey}
        className="flex items-start gap-2 py-1"
      >
        <Icon
          aria-hidden="true"
          className={cn("mt-0.5 size-4 shrink-0", meta.className)}
        />
        <span
          className={cn(
            "min-w-0 wrap-break-word",
            (item.statusKey === "completed" || item.statusKey === "deleted") &&
              "text-muted-foreground line-through",
          )}
        >
          {item.text}
          {item.activeForm !== null && item.activeForm !== "" ? (
            <span className="text-muted-foreground block text-xs">
              {item.activeForm}
            </span>
          ) : null}
        </span>
        <span
          data-slot="task-tool-status"
          className="text-muted-foreground ms-auto shrink-0 text-xs"
        >
          {item.statusLabel}
        </span>
      </li>
    </ul>
  );
}

const TaskToolImpl: ToolCallMessagePartComponent = (props) => {
  const view = readTaskToolView(props.toolName, props.argsText);
  if (view === null) return <ToolFallback {...props} />;
  return (
    <ToolDisplayFrame
      slot="aui_task-tool"
      icon={ListTodoIcon}
      heading={view.heading}
      part={props}
    >
      {view.item !== null ? <TaskItem item={view.item} /> : null}
      {view.tool !== "TaskUpdate" ? (
        <ToolResultBody
          part={props}
          render={(text) => <ToolResultPre text={text} />}
        />
      ) : null}
    </ToolDisplayFrame>
  );
};

export const TaskTool = memo(TaskToolImpl) as ToolCallMessagePartComponent;
(TaskTool as { displayName?: string }).displayName = "TaskTool";
