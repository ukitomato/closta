---
id: AD-033
title: SPIKE-2 — assistant-ui Elements の導入コストは R-1 で払い済み。R-3 の残作業は仮想化とデータ配線
status: accepted
date: 2026-09-24
deciders: [ukitomato]
tags: [ui, spike, verification]
supersedes: []
superseded-by: []
related: [AD-019, AD-023, AD-031]
---

# AD-033: SPIKE-2 — assistant-ui Elements の導入コストは R-1 で払い済み

## Context

SPIKE-2 は「assistant-ui Elements の導入コスト実測」であり、R-3（transcript の基本表示）の前提として
`docs/roadmap.md` に置かれている。

[AD-019](0019-assistant-ui-element-inventory.md) が SPIKE-2 に **2 つの問い**を明示的に残した。

1. 「入れてみてコストを測る」（存在確認は AD-019 で済んでいるので、コストに集中してよい）
2. element には **runtime 接続型（`<name>.aui.tsx`）と props 駆動の standalone 型**が混在する。
   `useExternalStoreRuntime` と接続する本プロダクトではどちらを採るかが実装コストに効く（AD-019 §訂正 L55-57）

**測定方法**: 新規に試作を起こすのではなく、**R-1（`3f60a41`）が既にコミットしている実物の統合を実測対象とした**。
R-1 の scaffold が assistant-ui 一式を入れており、導入コストは見積りでなく `main` に実在する。
新規 `npx assistant-ui add` を今あらためて走らせても、R-1 が既に示した以上の情報は得られず、
未コミットの生成物を残す（investigation ≠ implementation の逸脱）だけなので採らない。

## 実測結果

### 1. 導入は R-1 で完了し、runtime 接続型 `.aui.tsx` を採っている

- `package.json`: `@assistant-ui/react@^0.15.19` / `@assistant-ui/react-markdown@^0.14.15` に加え、
  Elements/shadcn の土台（`radix-ui` / `class-variance-authority` / `clsx` / `cn` / `tailwind-merge` /
  `lucide-react` / `tw-shimmer` / `tw-animate-css` / `remark-gfm`）、Tailwind v4（`@tailwindcss/vite`）、
  React 19 / Vite 7 / electron-vite 5 が揃っている。
- `components.json` が存在（shadcn: `style: new-york` / `baseColor: neutral` /
  `css: src/renderer/src/assets/main.css` / `registries.@assistant-ui: r.assistant-ui.com`）。
  **CLI 経由で導入された証跡**であり、electron-vite + Tailwind v4 の構成でレジストリ導入が成立している。
- renderer に **runtime 接続型 `.aui.tsx`** が実在する:
  `thread` / `thread-list` / `tool-fallback` / `tool-group` / `reasoning` / `attachment` /
  `follow-up-suggestions`。加えて shadcn primitives（`ui/button` `ui/dialog` `ui/tooltip`
  `ui/skeleton` 他）、`markdown-text` / `file` / `image`、`runtime/thread-list-adapter.ts`
  （`ExternalStoreThreadListAdapter`）。
- `ChatScreen`（R-1）が実 `Thread` を `useExternalStoreRuntime`（[AD-023](0023-application-architecture.md) の決定木）
  で載せる。空メッセージ・`isDisabled: true`・Claude 未接続の「部品確認画面」で、
  会話表示は R-3、起動は X-1 と明記されている。
- → **AD-019 の問い (2) の答え**: 本プロダクトは **`.aui.tsx` runtime 接続型を採用済み**。standalone は採らない。
  `useExternalStoreRuntime` に接続し、Thread の primitives（ActionBar / BranchPicker / GroupedParts）を
  そのまま使うためで、この判断は R-1 の実装で既に固定されている。

### 2. R-3 が要求する表示部品は、仮想化を除きすべて実在する

R-3 の受け入れ（roadmap / prompts.md）: markdown 本文 / streaming text / scroll anchor /
未定義ツールの fallback / 数千メッセージでも仮想化でスクロールが破綻しない。

| 要求 | 状態 | 実体 |
|---|---|---|
| markdown 本文 | ✓ 実在 | `markdown-text.tsx`（`@assistant-ui/react-markdown` + `dot.css` + `remark-gfm`） |
| streaming text | ✓ 実在 | `MarkdownText` を `text` part に配線済み。`reasoning` は streaming 対応 |
| scroll anchor | ✓ 実在 | `ThreadPrimitive.Viewport turnAnchor="top"` + `ThreadScrollToBottom` |
| 未定義ツール fallback | ✓ 実在 | `tool-fallback.aui.tsx` を `case "tool-call": part.toolUI ?? <ToolFallback>` に配線済み |
| 数千件の仮想化 | **不在** | 現 `Thread` は `ThreadPrimitive.Messages` で**全件描画** |

**仮想化だけが唯一の穴である。** 現 `thread.aui.tsx` は `content-visibility: auto` /
`contain-intrinsic-size: auto 200px` で軽量化しているが、これは offscreen ペイントの抑止であって
**DOM ノードは全件マウントされる**。数千メッセージのマウント/更新コストは残る。
assistant-ui の公式指針（`.claude/skills/primitives/references/messages.md` §Virtualization）は
「マウント/更新がボトルネックのときだけ `@tanstack/react-virtual` + `ThreadPrimitive.ViewportProvider` +
`ThreadPrimitive.MessageByIndex`（または `Unstable_MessageById`）」を指示する。
`@tanstack/react-virtual` は `package.json` に無く、`src/` に `virtual*` の参照は 0 件
（`docs/` と skill 参照のみ）。`docs/discovery.md` L82 も「absent（R-3 で入る）」と既に予定している。

### 3. 実測: renderer は型検査を通る

`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false` → **エラー 0**（2026-09-24）。
assistant-ui Elements + React 19 + TypeScript 5.9 の統合は現状クリーンにコンパイルされる。

## Decision

### 1. R-3 は assistant-ui Elements を採用する（代替評価はしない）

導入済みかつ型検査を通り、runtime 接続型 `.aui.tsx` で `useExternalStoreRuntime` に接続する形が
R-1 で固定されている。R-3 はこの形を継続する。

### 2. R-3 の残コストは「仮想化の追加」と「transcript データ配線」の 2 点に限定される

- `@tanstack/react-virtual` を依存に追加する（`docs/discovery.md` L82 の予定どおり）。
- `Thread` の message list を `ThreadPrimitive.ViewportProvider` + virtualizer +
  `ThreadPrimitive.MessageByIndex`（または挿入に強い `Unstable_MessageById`）へ置き換える。
  **仮想スクローラは自前で scroll element を持つ**ため、現 `Viewport` ベースの auto-follow /
  measurement guard / run-start jump / `ScrollToBottom` を**その上で作り直す**。ここが唯一の非自明作業。
- transcript データ配線: パース済み session JSONL → `ThreadMessageLike[]` → `useExternalStoreRuntime`
  （現 `ChatScreen` は `[]` を渡している）。

### 3. 仮想化は「数千件がボトルネックのときだけ」入れる（公式の但し書き）

`content-visibility` の現行最適化は数千件規模の代替にならないが、小規模スレッドでは仮想化の複雑性
（measurement guard 等）が回帰を生みうる。R-3 の受け入れ条件が数千件を明示的に課すため R-3 で入れるが、
非仮想パスとの両立可否は R-3 の plan で検討する。

## Consequences

### 良くなること

- SPIKE-2 の 2 つの問い（コスト実測 / `.aui` vs standalone）が実測で解けた。存在確認（AD-019）と合わせ、
  R-3 は spec から実装へ直行できる。
- R-3 の非自明作業が「仮想化スクローラの再実装」1 点に切り出された。半日見積りの内訳が具体化した。

### 代償 / リスク

- 仮想化への移行で現 `thread.aui.tsx` の `Viewport` 配線を作り直す。assistant-ui の Thread element は
  `Viewport` 前提で書かれており、`ViewportProvider` 版は公式サンプルどまりで自前実装が要る。
- Principle IX（重いパースを main process で行わない）— transcript 本文のパース配置は R-3 申し送り #1
  （[AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2）。仮想化とデータ配線を同時に判断する。

### 申し送り（R-3 が持ち主）

- [ ] 仮想化の auto-follow / measurement guard / run-start jump を `ViewportProvider` 上で再実装する
- [ ] `@tanstack/react-virtual` の追加は **R-3 の実装コミット**で行う（本 SPIKE では入れない — investigation ≠ implementation）
- [ ] transcript パースの配置（main vs renderer / 構造体 `postMessage`）を Principle IX と
      AD-031 Decision 2 に照らして R-3 で決める

## Confirmation

- 導入の実在: renderer の `.aui.tsx` 群と `components.json` を確認（いずれも R-1 `3f60a41` で追加）。
- コンパイル: `tsc -p tsconfig.web.json` エラー 0（2026-09-24）。
- 仮想化不在: `@tanstack/react-virtual` は `package.json` になく、`src/` に `virtual*` 参照 0 件。
  `docs/discovery.md` L82 の「absent（R-3 で入る）」と一致する。

## References

- SPIKE-2（`docs/roadmap.md`）
- [AD-019](0019-assistant-ui-element-inventory.md)（element 実在確認。SPIKE-2 に「コスト実測」と「`.aui` vs standalone」を残した）
- [AD-023](0023-application-architecture.md)（`useExternalStoreRuntime` の採用）
- [AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2（Principle IX / パース配置の R-3 申し送り）
- assistant-ui 公式: `.claude/skills/primitives/references/messages.md` §Virtualization / §Scrollbars and scroll behavior
- 実測対象: `src/renderer/src/components/assistant-ui/elements/*.aui.tsx` / `src/renderer/src/features/chat/ChatScreen.tsx` / `components.json`
