"use client";

import { memo } from "react";
import { FileSearchIcon, FileTextIcon, FolderSearchIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";
import { buildResultTree, readFileToolView } from "@/features/chat/tool-display";
import { FileResultTree } from "./file-result-tree";
import { mono } from "./surfaces";
import {
  ToolDisplayFrame,
  ToolResultBody,
  ToolResultPre,
} from "./tool-display-frame";
import { ToolFallback } from "./tool-fallback.aui";
import { cn } from "@/lib/utils";

/**
 * `Read` / `Glob` / `Grep` の表示 (O-6 / FE-020 / 016 data-model §2)。過去ログと実行中で同じ部品。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 見出しは 1 行・80 コードポイント (パスの末尾・範囲・`pattern` など。自由文は伏せ字を通す)。中身は既定で畳む | data-model §2 の表 |
 * | パスは会話由来の本文のまま出す (判定も除去もしない)。**表示だけで、操作を付けない** | data-model §2「パス」 |
 * | `Glob` と `Grep` の `files_with_matches` は File tree、それ以外は text。`Read` の結果は `<pre>` | data-model §2 |
 * | `pattern` / `glob` は文字列として出すだけで、正規表現に組まない | data-model §2 |
 *
 * 入力が読めないときは ToolFallback に退避する (FR-009)。registry 照合 (Principle XIII): Tool call (状態の印を出せない
 * ので採らない)、File tree (写して変える。`FileResultTree`)。
 */
const FileToolImpl: ToolCallMessagePartComponent = (props) => {
  const view = readFileToolView(props.toolName, props.argsText);
  if (view === null) return <ToolFallback {...props} />;
  const Icon =
    view.tool === "Read"
      ? FileTextIcon
      : view.tool === "Glob"
        ? FolderSearchIcon
        : FileSearchIcon;
  return (
    <ToolDisplayFrame
      slot="aui_file-tool"
      icon={Icon}
      heading={view.heading}
      part={props}
    >
      {view.path !== null ? (
        <p data-slot="file-tool-path" className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">
            {TOOL_DISPLAY_LABELS.path}
          </span>
          <code className={cn(mono, "break-all")}>{view.path}</code>
        </p>
      ) : null}
      <ToolResultBody
        part={props}
        render={(text) => {
          const tree = view.tree ? buildResultTree(text) : null;
          if (tree === null) return <ToolResultPre text={text} />;
          return (
            <div className="mt-1 flex flex-col gap-1">
              {tree.notes.length > 0 ? (
                <div data-slot="file-tool-notes" className="flex flex-col">
                  {tree.notes.map((note, index) => (
                    <p key={index} className="text-muted-foreground text-xs">
                      {note}
                    </p>
                  ))}
                </div>
              ) : null}
              <FileResultTree
                nodes={tree.items.map((name, index) => ({
                  path: String(index),
                  name,
                }))}
                total={tree.total}
                hiddenCount={tree.hidden}
              />
            </div>
          );
        }}
      />
    </ToolDisplayFrame>
  );
};

export const FileTool = memo(FileToolImpl) as ToolCallMessagePartComponent;
(FileTool as { displayName?: string }).displayName = "FileTool";
