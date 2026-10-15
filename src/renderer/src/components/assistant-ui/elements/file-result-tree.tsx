"use client";

import type { ComponentProps, JSX } from "react";
import { FileIcon } from "lucide-react";
import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

/** File tree の項目。`path` は添字の文字列、`name` は結果の 1 行の text (会話由来の本文。パスの値ではない)。 */
export interface FileResultNode {
  path: string;
  name: string;
}

/**
 * 検索・ファイル名の結果の一覧 (O-6 / 016 data-model §2「File tree の element」)。
 *
 * registry の `file-tree.tsx` (差分の要約: 英語の「{files} files changed」・増減の数・`key={node.path}`) を写して変えた
 * (元は変えない。意味が違うため)。見出しは「{n} 件のファイル」、増減の数を出さない、key は添字、**項目に操作を付けない**
 * (選ぶ・開く・表示する導線は Files の PathDTO の経路でだけ作る。AD-025)。階層は組まない (平らな配列)。
 *
 * registry 照合 (Principle XIII): File tree (採らない: 意味が違う → 写して変える)。
 */
export function FileResultTree({
  nodes,
  total,
  hiddenCount,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "nodes"> & {
  nodes: readonly FileResultNode[];
  /** 項目の総数。 */
  total: number;
  /** 出さなかった項目の数。 */
  hiddenCount: number;
}): JSX.Element {
  return (
    <div
      data-slot="file-result-tree"
      className={cn(paper, "flex w-full flex-col gap-2 rounded-xl p-3", className)}
      {...props}
    >
      <span className="px-1 text-[13px] font-medium">
        {TOOL_DISPLAY_LABELS.files(total)}
      </span>
      <ul className="flex flex-col">
        {nodes.map((node, index) => (
          <li
            key={index}
            data-slot="file-result-tree-item"
            className="flex items-center gap-2 rounded-lg px-1 py-1 text-[13px]"
          >
            <FileIcon
              aria-hidden="true"
              className="text-foreground/30 size-3.5 shrink-0"
            />
            <span className={cn(mono, "text-foreground/85 min-w-0 flex-1 break-all")}>
              {node.name}
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <span
          data-slot="file-result-tree-more"
          className="text-muted-foreground px-1 text-xs"
        >
          {TOOL_DISPLAY_LABELS.more(hiddenCount)}
        </span>
      ) : null}
    </div>
  );
}
