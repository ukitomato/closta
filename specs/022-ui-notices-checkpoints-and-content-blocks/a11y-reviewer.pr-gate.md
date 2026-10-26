# a11y-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26
**Reviewer**: a11y-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC:
  - FR-002〜FR-006 (知らせの行・Checkpoints の行・notification の読み上げ)
  - FR-008 / FR-009 (Sources とリンク)
  - FR-010 (File element)
  - FR-011 (知らないブロックの印)
  - SC-001〜SC-004 (SC-003 は vitest-axe の違反 0 を条件にしている)
- touched files に該当する charter / Confirmation:
  - ui charter と Constitution VIII / XII / XIII の Manual の検証者に当たる。
  - 対象の UI ファイルは次の 7 つ。
    - `src/renderer/src/components/assistant-ui/elements/server-tool-call.aui.tsx`
    - `src/renderer/src/components/assistant-ui/elements/unsupported-block-mark.tsx`
    - `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` (SystemEventRow、NoticeNameList、DocumentFile)
    - `src/renderer/src/components/assistant-ui/elements/subagent.aui.tsx`
    - `src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx`
    - `src/renderer/src/features/chat/transcript-announcements.ts`
    - `src/renderer/src/features/chat/labels.ts`
  - vendored の `src/renderer/src/components/file.tsx` は `reviewers.yml` の `exclude_patterns` の趣旨どおり指摘しない。
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の範囲外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の範囲外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の範囲外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の範囲外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の範囲外 (po-reviewer が担当)
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の範囲外 (convention-reviewer が担当)
- G. optional reviewer 範囲 (a11y): Critical:0 High:0 Medium:2 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

### 検査した WCAG 項目の結果 (観察事実)

- **A11Y-1 (semantic)**:
  - Sources は `ul/li/a`、名前の列は `ul/li` で描かれている。
  - 行のアイコンは `aria-hidden` が付いている (`thread.aui.tsx:1327`)。
  - 新しい `<div onClick>` はない。
  - heading の階層を新しく足してはいない。
- **A11Y-2 (keyboard)**:
  - 新しく足した操作は Sources のリンクだけで、ネイティブの `<a href>` なので Tab で届く (`server-tool-call.aui.tsx:80`)。
  - リンクは畳んだ `ToolFallbackContent` の中にある。畳んでいる間は tab 順に入らず、開く trigger は `CollapsibleTrigger` (ボタン) なので問題ない。
  - 正の `tabindex` はない。
  - `files-persisted` の行にボタンとリンクがないことは `LivePane.o2.test.tsx:1346-1349` で固定されている。
- **A11Y-3 (focus visible)**:
  - Sources のリンクは `outline` を消していない。Chromium の既定の focus ring が出る。
  - 新しい `outline-none` はない。
- **A11Y-4 (contrast)**:
  - 次の 2 つの組み合わせは、`src/renderer/src/assets/main.css:98,137` と `:101` の oklch から手計算した。
    - 新しい text-xs の `text-muted-foreground` は、light で約 4.8:1、dark で約 6 以上。
    - `text-destructive` (`server-tool-call.aui.tsx:125`) は約 4.8:1。
  - いずれも 4.5:1 以上。
  - 新しい行・印はテストで `color-contrast` を無効にしている。jsdom は計算できないためで、手計算の結果とは矛盾しない。
  - `attention` の行 (`text-foreground`) と `quiet` の行 (`text-muted-foreground`) の差は色だけではない。注意・失敗の行には見出しと Badge ("注意" / "失敗") が付く (`thread.aui.tsx:1265-1273,1370-1378`)。
- **A11Y-5 (ARIA)**:
  - 読み上げは既存の `TranscriptAnnouncer` (`aria-live="polite"` / `aria-atomic`、`TranscriptAnnouncer.tsx:95`) に乗る。
  - 新しい文言は固定文だけで、本文・名前・理由・パスを入れていない (`labels.ts:132-135`)。
  - `notification` が `high` / `immediate` のときだけ `warning` になり読み上げられる (`notice-rows.ts:192-193`、`transcript-announcements.ts:72-75`)。
  - `mirror-error` と `files-persisted` の `failed` も読み上げられる。他の新しい行は読み上げない。これは `TranscriptAnnouncer.test.tsx:136-158` で固定されている。
  - 不要な ARIA の被せはない。
- **A11Y-6 (form)**: 該当なし: 本 PR で form を足していない。
- **A11Y-7 (image / icon)**:
  - 新しい icon-only の操作はない。
  - 行のアイコンは装飾で `aria-hidden`。
  - `File` は種類の文言 (`documentKindLabel`) を持ち、ダウンロードのリンクを出さない (`document-file.fe020.test.tsx:62-71`)。
- **A11Y-8 (motion)**: 新しい行は `motion-reduce:animate-none` を継承している (`thread.aui.tsx:1318`)。新しい自動再生・点滅はない。
- **A11Y-9 (locale)**: `src/renderer/index.html:7` が `<html lang="ja">`。新しい文言は日本語で、英語の既定 ("Unnamed file" / "Download") は出ない (`document-file.fe020.test.tsx:73-80`)。

## スコープ要約

O-12 は、知らせの類 7 種、Checkpoints (`files_persisted`)、`server_tool_use` + `web_search_tool_result` の Sources、`user/document` の File element、知らないブロックの印を transcript に出す。

a11y 観点の対象は次のとおり。

- 変更した UI は、SystemEventRow の新 category 7 つ (行・名前の列・Badge・attention)、`ServerToolCall` (Sources のリンク一覧とエラーの印)、`UnsupportedBlockMark`、`DocumentFile`、読み上げの追加。
- 新しい操作の入口は Sources の外部リンクだけで、`target="_blank"` + `rel="noreferrer noopener"`。
- Critical になる経路 (keyboard 到達不可、text 不可読の contrast) は観察できなかった。
- 以下の指摘は Medium 以下で、gate の合否には影響しない。

## Findings

### [Medium] Sources のリンクのタイトルが `truncate` され、全文を読む手段がない (M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/server-tool-call.aui.tsx:84` の `<a>` は `min-w-0 truncate`、`:89` の `<span>` も同じで、どちらにも `title` も全文の代替もない。
  - 同じ PR の他の行 (`thread.aui.tsx:1350,1386,1416`) は切り詰めた全文を `title` で見られるようにしている。そちらと扱いが不揃い。
  - タイトルは検索結果の見出しで、長いことが多い。
  - 右のペインやウィンドウが狭いと、リンクの目的 (どのページか) が省略記号で判別できなくなる (WCAG 2.1 1.4.10 Reflow、2.4.4 Link Purpose の趣旨)。
  - host は別行で出るが、タイトルの全文は得られない。
- **同種事象探索**: `Grep "truncate" server-tool-call.aui.tsx` で 4 件 (`:84`, `:89`, `:92` と、heading 側の `tool-display-frame.tsx:65`)。リンクの `title` なしは `:84`, `:89` の 2 件。
- **リスク/影響**: キーボード・タッチだけの利用者は `title` を読めない。狭い幅で、どの出典か判別できないままリンクを開くことになる。
- **推奨アクション**: Sources の項目は `truncate` をやめて折り返す (`wrap-break-word`) か、少なくとも `title={title}` を付ける。`thread.aui.tsx:1416` の名前の列は折り返しで解決済みで、同じ形に揃える。
- **根拠**: WCAG 2.1 1.4.10 / 2.4.4。
- **scope 根拠**: touched file `server-tool-call.aui.tsx` で直接修正できる。

### [Medium] `files_persisted` が全件失敗でも見出しが「ファイルを保存しました」のままで、読み順で矛盾する (M-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/labels.ts:269-276` の `noticeHeading` が見出しを変えるのは `active-goal` の `completed` だけ。
  - `files-persisted` は常に `'ファイルを保存しました'` (`labels.ts:56`)。
  - `notice-rows.ts:271` は `failed.length > 0` なら `status: 'failed'` にする。保存 0 件・失敗 N 件でも同じ。
  - `thread.aui.tsx:1328-1330` の見出しの直後に `保存 0 件・失敗 3 件` と Badge「失敗」が続く。
  - 支援技術は「ファイルを保存しました、保存 0 件・失敗 3 件、失敗」と順に読む。見出しが先に成功を主張する。
  - 一部成功 (保存 1 件・失敗 1 件) でも見出しは成功だけを言う。
- **同種事象探索**: `Grep "noticeHeading|SYSTEM_EVENT_CATEGORY_LABELS\[" src/renderer` で見出しを状態で変えるのは `active-goal` の 1 件 (`labels.ts:273`)。`mirror-error` は見出しが失敗を表す文言のため該当しない。
- **リスク/影響**: 見出しが結果を誤って先に伝える。読み上げ側 (`labels.ts:135` の「ファイルの保存に失敗しました」) は正しいので、live region と視覚の行で文言が食い違う。
- **推奨アクション**: `noticeHeading` に `files-persisted` + `failed` の分岐を足し、「ファイルの保存に失敗したものがあります」のように成功を主張しない見出しにする。読み上げ文 `ANNOUNCER_LABELS.filesPersistedFailed` と揃える。
- **根拠**: WCAG 2.1 1.3.1 / 3.3.1 の趣旨 (状態の正確な伝達)。
- **scope 根拠**: touched files の `labels.ts` で直接修正できる。UX 観点とも重なる (ux-reviewer の dedup 対象になりうる)。

### [Low] Sources の外部リンクが新しい窓で開くことを示さない (L-001) (scope: feature)

- **観察**: `server-tool-call.aui.tsx:80-87` は `target="_blank"` だが、新しい窓・外部サイトの手がかりが視覚にも名前にもない。同様のリンクは `ElicitationCard.tsx:303-313` にあり、そちらは `openUrlNote` の説明を付けている。
- **同種事象探索**: `Grep "target=\"_blank\"" src/renderer/src --glob *.tsx` で 2 件 (`server-tool-call.aui.tsx:82`, `ElicitationCard.tsx:305`)。ほかに `components/file.tsx:231` (vendored。指摘対象外)。
- **リスク/影響**: 文脈の変化が予告されない (WCAG 3.2.5 は AAA、G201 は advisory)。AA の不適合ではない。
- **推奨アクション**: host の行に「外部サイト」を添えるか、リンクに `aria-describedby` で説明を付ける。
- **根拠**: WCAG 2.1 3.2.5 (AAA 参考)。

### [Low] `title` が補助の唯一の手段になる箇所がある (L-002) (scope: feature)

- **観察**:
  - `thread.aui.tsx:1416` の `<li title={item}>` は、`wrap-break-word` で全文が見えており `title` が冗長。
  - `thread.aui.tsx:1350` の `title={detailText}` も、`wrapped` の行 (全文が折り返しで見える) では冗長。
  - 冗長な `title` は支援技術によっては名前を二重に読む。
- **同種事象探索**: `Grep "title=\{" thread.aui.tsx` で、新規の `wrapped` 行に当たるのは `:1350`, `:1416` の 2 件。
- **推奨アクション**: 折り返して全文が見える行では `title` を外す。
- **根拠**: ARIA / HTML の `title` の二重通知の注意。

### [Low] 知らないブロックの印の文言が `p` 1 行で、種類の名前が無い場合に意味が弱い (L-003) (scope: feature)

- **観察**: `unsupported-block-mark.tsx:19-26` と `labels.ts:428-433`。`blockType` が空のとき「表示に対応していないブロック」だけが出る。支援技術からは何のブロックか分からない。
- **同種事象探索**: `Grep "UnsupportedBlockMark" src/renderer` で 3 つの利用箇所 (`server-tool-call.aui.tsx:132`, `subagent.aui.tsx:184`, `thread.aui.tsx:971`)。
- **リスク/影響**: spec の Edge Cases が決めた挙動 (形が外れたら種類を出さない) どおり。a11y 上の不適合ではなく情報量の問題。
- **推奨アクション**: 対応不要でよい。要るなら「種類は不明」を添える。
- **根拠**: spec Edge Cases。

## テスト / regression (H)

- **a11y を検出するテスト**:
  - 追加した component テストは vitest-axe を `color-contrast` 無効で回している。
    - `server-tool-call.aui.test.tsx:61,91`
    - `unsupported-block-mark.test.tsx:67`
    - `document-file.fe020.test.tsx:70,121`
    - `LivePane.o2.test.tsx` の「a11y の違反が無い」
  - 行への操作の不在 (`LivePane.o2.test.tsx:1346-1349`)、読み上げの対象と非対象 (`TranscriptAnnouncer.test.tsx:136-158`)、リンクの `target` / `rel` / javascript: 除外 (`server-tool-call.aui.test.tsx:64-92`) は固定されている。
- **Low (L-004、H)**: Sources のリンクが Tab で届く・畳んだ中に入らないことの keyboard テストはない。`fireEvent.click` で開く確認だけ (`server-tool-call.aui.test.tsx:47-49`)。ネイティブの `<a>` と `Collapsible` の既存挙動に依存していて、現状の実装は問題ない。M-001 を直すときに再計算させる材料としても、keyboard の確認を 1 件足すとよい。
- **既存の regression**:
  - `SystemEventRow` の `wrapped` / `attention` の判定を拡張しているが、既存の category の分岐は変えていない (`thread.aui.tsx:1186-1197,1276-1285`)。
  - code-gate の全体テストは 3953 件 passed / 0 failed (`.gate-verdict-code.json`)。
- **observability**: 該当なし (UI 表示のみで、障害時の log や metric を足す対象がない)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `truncate` (Sources 内) / `title=` 無しのリンク | 2 | `server-tool-call.aui.tsx:84`, `server-tool-call.aui.tsx:89` |
| M-002 | `noticeHeading` / 状態で変わる見出し | 1 | `labels.ts:273` |
| L-001 | `target="_blank"` (renderer、vendored 除く) | 2 | `server-tool-call.aui.tsx:82`, `ElicitationCard.tsx:305` |
| L-002 | 冗長な `title=` | 2 | `thread.aui.tsx:1350`, `thread.aui.tsx:1416` |
| L-003 | `UnsupportedBlockMark` | 3 | `server-tool-call.aui.tsx:132`, `subagent.aui.tsx:184`, `thread.aui.tsx:971` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4 (L-001〜L-003 と、テスト節の L-004)
- Round inheritance: new (Round 1 のため前 Round はなし)
