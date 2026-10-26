"use client";

import type { DataMessagePartComponent } from "@assistant-ui/react";

import { UNSUPPORTED_BLOCK_LABELS } from "@/features/chat/labels";

/**
 * 専用の表示を持たない content block の印 (O-12 / FR-011。data-model §2.5)。種類の名前だけの 1 行で、ブロックの中身は
 * 運ばれていない (domain が捨てる)。`blockType` が空 (形が外れた) なら種類を出さない。
 *
 * registry 照合 (Principle XIII / FE-001): 取り込み済みの ToolFallback は tool-call 専用で、data part の 1 行に合わないため自作
 * (1 行の `<p>`。新しい色・間隔のトークンは足さない)。
 */
export function UnsupportedBlockMark({
  blockType,
}: {
  blockType: string;
}): React.JSX.Element {
  return (
    <p
      data-slot="unsupported-block-mark"
      className="text-muted-foreground py-1 text-xs"
    >
      {UNSUPPORTED_BLOCK_LABELS.text(blockType)}
    </p>
  );
}

/** data part (`unsupported-block`) の `data` から種類の名前を読む (形が外れたら空)。 */
function readBlockType(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const value = (data as Record<string, unknown>).blockType;
  return typeof value === "string" ? value : "";
}

/** assistant / user のメッセージの data part の描画。 */
export const UnsupportedBlockData: DataMessagePartComponent = (part) => (
  <UnsupportedBlockMark blockType={readBlockType(part.data)} />
);
