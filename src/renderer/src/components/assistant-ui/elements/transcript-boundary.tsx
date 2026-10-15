"use client";

import { transcriptBoundaryHeading } from "@/features/chat/labels";
import { MessagePrimitive, useAuiState } from "@assistant-ui/react";
import type { FC } from "react";

/**
 * 会話の境界 (圧縮の境界・会話の作り直し)。横いっぱいの区切りと見出しの文言 (O-6 / 016 data-model §1「見た目」・§4)。
 *
 * - 実行中の行 (`system` の `compact_boundary` / 最上位の `conversation_reset`) と過去ログの圧縮の境界 (domain の divider を
 *   `convert.ts` が同じ形の data part に写したもの。数は出さない) の両方が使う。見出しは `transcriptBoundaryHeading` が作る
 *   (会話内検索 `conversation-search.ts` も同じ関数で見出しを本文に取る)
 * - 会話の主役ではないので footer・action bar・branch picker・running indicator を付けない (`SystemEventRow` と同じ)
 * - 見出しは `detail` (agents / domain が形を検査した値) から作った固定の文言だけで、会話由来の文字列を描かない
 *
 * registry 照合 (Principle XIII。SH-002): registry の Day separator は日付の区切りで意味が違うので採らず、本 element を作る。
 */
export const TranscriptBoundary: FC<{
  category: "compact-boundary" | "conversation-reset";
  detail: string;
}> = ({ category, detail }) => {
  const messageId = useAuiState((s) => s.message.id);
  return (
    <MessagePrimitive.Root
      data-slot="aui_transcript-boundary"
      data-role="transcript-boundary"
      data-category={category}
      data-message-id={messageId}
      className="fade-in animate-in motion-reduce:animate-none px-2 py-1 duration-150 [contain-intrinsic-size:auto_32px] [content-visibility:auto]"
    >
      <div className="text-muted-foreground flex w-full items-center gap-3 text-xs">
        <hr aria-hidden className="border-border m-0 min-w-4 flex-1 border-t" />
        <span data-search-text="" className="max-w-[80%] text-center wrap-break-word">
          {transcriptBoundaryHeading(category, detail)}
        </span>
        <hr aria-hidden className="border-border m-0 min-w-4 flex-1 border-t" />
      </div>
    </MessagePrimitive.Root>
  );
};
