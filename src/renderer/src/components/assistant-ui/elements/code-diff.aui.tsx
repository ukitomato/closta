"use client";

import { memo } from "react";
import { FileDiffIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import {
  parseEditArgs,
  parseMultiEditArgs,
  parseWriteArgs,
  type MultiEditItem,
} from "@/features/chat/tool-args";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono } from "./surfaces";
import { ToolFallback } from "./tool-fallback.aui";
import { isTruncatedArgs, ToolErrorResult, ToolResultMarks } from "./tool-result-marks";

/**
 * Edit / Write / MultiEdit を hunk 単位の diff で示す (R-4 / FR-002 / Tier A: Code diff)。
 *
 * 変更前/後の文字列は会話由来の untrusted text として **plain text** で描画する — 生 HTML / markdown /
 * スクリプトを実行しない (React が escape する。FR-002 / SC-002)。`argsText` は domain で `sanitizeBody` 済み。
 * narrowing 失敗時は生 argsText の `ToolFallback` に退避する (FR-009 / SC-005)。
 *
 * registry 照合 (Principle XIII / FR-013): assistant-ui `elements-code-diff` (`CodeDiff` / `DiffLine`)。
 * Claude Code の Edit/Write/MultiEdit の args (old_string/new_string/content/edits) から行 diff を組む形に
 * 合わせて `.aui.tsx` として自作した (ADR 参照)。
 */

type DiffRow = { readonly kind: "del" | "add"; readonly text: string };

/** 1 hunk に描画する diff 行の上限 (PR-M-3 / FR-017 の折りたたみ)。超過分は件数だけ示す。 */
const MAX_DIFF_ROWS = 200;

/** old/new の変更行を del/add の行に落とす (共通の先頭/末尾行は省く簡易 hunk)。 */
function diffRows(oldStr: string, newStr: string): DiffRow[] {
  const o = oldStr.length > 0 ? oldStr.split("\n") : [];
  const n = newStr.length > 0 ? newStr.split("\n") : [];
  let start = 0;
  while (start < o.length && start < n.length && o[start] === n[start]) start++;
  let oEnd = o.length;
  let nEnd = n.length;
  while (oEnd > start && nEnd > start && o[oEnd - 1] === n[nEnd - 1]) {
    oEnd--;
    nEnd--;
  }
  const rows: DiffRow[] = [];
  for (let i = start; i < oEnd; i++) rows.push({ kind: "del", text: o[i] });
  for (let i = start; i < nEnd; i++) rows.push({ kind: "add", text: n[i] });
  return rows;
}

function Hunk({ rows }: { rows: readonly DiffRow[] }): React.JSX.Element {
  const shown = rows.slice(0, MAX_DIFF_ROWS);
  const omitted = rows.length - shown.length;
  return (
    <div className={cn(codeScroll, "border-border/40 border-t")}>
      <div className={cn(codeSurface, mono)}>
        {shown.map((row, index) => (
          <pre
            key={index}
            className={cn(
              "whitespace-pre-wrap px-3 py-px",
              row.kind === "del" && "bg-destructive/10 text-destructive/90",
              row.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            <span className="select-none opacity-60">{row.kind === "del" ? "- " : "+ "}</span>
            {row.text}
          </pre>
        ))}
        {omitted > 0 ? (
          <pre className="text-muted-foreground px-3 py-px">… 残り {omitted} 行を省略</pre>
        ) : null}
      </div>
    </div>
  );
}

/**
 * diff の枠。失敗・拒否された変更が適用済みの diff に見えないよう、ヘッダに「エラー」の Badge を出し、
 * エラーの結果の本文を diff の後に出す (成功の結果は出さない。O-2 / FR-007 / pr-gate R1 po H-001)。
 */
function DiffShell({
  filePath,
  truncated,
  isError,
  result,
  children,
}: {
  filePath: string;
  truncated: boolean;
  isError: boolean | undefined;
  result: unknown;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot="aui_code-diff"
      className="aui-code-diff border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="aui-code-diff-header text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
        <FileDiffIcon className="size-3.5 shrink-0" />
        <span className={cn(mono, "text-foreground/80 truncate")}>{filePath}</span>
        <ToolResultMarks isError={isError} truncated={truncated} className="ms-auto" />
      </div>
      {children}
      <ToolErrorResult isError={isError} result={result} />
    </div>
  );
}

const CodeDiffImpl: ToolCallMessagePartComponent = (props) => {
  const { toolName, argsText } = props;
  const shell = {
    truncated: isTruncatedArgs(props.args),
    isError: props.isError,
    result: props.result,
  };

  if (toolName === "Write") {
    const args = parseWriteArgs(argsText);
    if (!args) return <ToolFallback {...props} />;
    const rows = diffRows("", args.content);
    return (
      <DiffShell filePath={args.file_path} {...shell}>
        <Hunk rows={rows} />
      </DiffShell>
    );
  }

  if (toolName === "MultiEdit") {
    const args = parseMultiEditArgs(argsText);
    if (!args) return <ToolFallback {...props} />;
    return (
      <DiffShell filePath={args.file_path} {...shell}>
        {args.edits.map((edit: MultiEditItem, index) => (
          <Hunk key={index} rows={diffRows(edit.old_string, edit.new_string)} />
        ))}
      </DiffShell>
    );
  }

  // Edit
  const args = parseEditArgs(argsText);
  if (!args) return <ToolFallback {...props} />;
  return (
    <DiffShell filePath={args.file_path} {...shell}>
      <Hunk rows={diffRows(args.old_string, args.new_string)} />
    </DiffShell>
  );
};

export const CodeDiff = memo(CodeDiffImpl) as ToolCallMessagePartComponent;
(CodeDiff as { displayName?: string }).displayName = "CodeDiff";
