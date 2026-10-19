"use client";

import { TextMessagePartProvider } from "@assistant-ui/react";

import { MarkdownText } from "@/components/markdown-text";

/**
 * 会話由来の markdown の本文を、メッセージの part の context の外で描く共有の部品 (O-11 / FE-030。plan 申し送り #21)。
 *
 * `TextMessagePartProvider` (`isRunning={false}`) で文字列を包み、既存の `MarkdownText` で描く。Agent plan (O-6) と
 * subagent の入れ子の text (O-11) が使う。**新しい markdown の描画口は作らない** (`@assistant-ui/react-markdown` の
 * import は `markdown-text.tsx` だけ、`TextMessagePartProvider` の import はここだけ。固定テストで守る)。
 * 生 HTML は描画されず (rehype-raw 無し)、リンクは `safeUrlTransform` の allowlist (http(s) か相対) を通る。
 *
 * registry 照合 (Principle XIII): 描画の部品であって要素ではない (assistant-ui の `MarkdownText` の包み)。
 */
export function MarkdownBody({ text }: { text: string }): React.JSX.Element {
  return (
    <TextMessagePartProvider text={text} isRunning={false}>
      <MarkdownText />
    </TextMessagePartProvider>
  );
}
