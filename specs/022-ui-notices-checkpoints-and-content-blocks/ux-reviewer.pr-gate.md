# ux-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26
**Reviewer**: ux-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC (UX に関わるもの):
  - FR-002〜FR-006 / SC-001: 知らせの行と読み上げ。
  - FR-006 / SC-002: Checkpoints の行と File element。
  - FR-007〜FR-009 / SC-003: Sources とリンク。
  - FR-010 / SC-002: `user/document` の File element。
  - FR-011 / SC-004: 知らないブロックの印。
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md` (O-2 の行の作り方・AD-049 Decision 3 の伏せ字・AD-060)。UI ファイルは `thread.aui.tsx` の `SystemEventRow` / `NoticeNameList` / `DocumentFile`、`server-tool-call.aui.tsx`、`unsupported-block-mark.tsx`、`labels.ts`、`transcript-announcements.ts`。
- 読んでいない / 見ていないもの: Constitution の全文。ADR は Decision Outcome / Confirmation のみ参照対象で、UX 観点では ADR 側の指摘は出さない。vendored primitive (`file.tsx` など) は対象外。
- A. 認可 / 認証 / secret 管理: 該当なし: ux-reviewer の Owner 範囲外 (security-reviewer 担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: Owner 範囲外 (security-reviewer 担当)
- C. 業務不変条件 / Charter drift: 該当なし: Owner 範囲外 (architecture-reviewer 担当)
- D. Constitution / ADR drift: 該当なし: Owner 範囲外 (architecture-reviewer 担当)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer 担当。UX 実装の完成度は G に記録した
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer 担当。UX-9 の文言の揺れは G に記録した
- G. optional reviewer 範囲 (ux-reviewer): Critical:0 High:0 Medium:3 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

O-12 は、知らせの類 7 種を transcript のシステムイベントの行にし、`server_tool_use` と `web_search_tool_result` を Sources つきの tool 表示にし、`user/document` を File element にし、専用表示のないブロックに種類名だけの印を出す。UI は `SystemEventRow` の category 追加と `NoticeNameList`、`ServerToolCall` と `SourcesList`、`UnsupportedBlockMark`、`DocumentFile`、`TranscriptAnnouncer` の文言追加で組まれている。

次の点は実装が揃っていた。
- 知らせの行は注意と通常を、色だけでなく Badge の文言でも区別している。
- 空の Sources には「検索結果は 0 件です」を出す。
- 名前のない文書は「名前のない文書」を出し、英語の既定 (Unnamed file / Download) を出さない。
- 結果待ち・結果不明は既存の印に乗っている。
- 破壊的操作は無く、UX-5 は対象外。

指摘は Medium 3 件と Low 5 件で、Critical と High は無い。code-gate の must_fix は 0 件なので再指摘していない。

## Findings

### [Medium] files-persisted の見出しが「ファイルを保存しました」固定で、全件失敗のときに結果と矛盾する (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/chat/labels.ts:56` は category `files-persisted` の見出しを固定文言にしている。`noticeHeading` (`labels.ts:269-276`) が見出しを変えるのは `active-goal` の解除だけ。一方 `src/domain/session/notice-rows.ts:250-275` の `filesPersisted` は `files` が空でも `failed` が 1 件以上あれば行を作り、status を `failed`、detail を `0 N` にする。その行は「ファイルを保存しました [失敗] 保存 0 件・失敗 N 件 (理由)」と描かれる。`src/renderer/src/features/session/LivePane.o2.test.tsx:1308-1332` は一部成功の行 (`1 1`) の見出しだけを固定している。全件失敗の行は固定されていない。
- **同種事象探索**: `files-persisted` の見出しを引く箇所を grep した。見出しの出所は `labels.ts:56` と `labels.ts:275`、描画は `thread.aui.tsx:1329` の 1 箇所で、同種の矛盾はこの 1 件だけ。
- **リスク/影響**: 失敗の通知で成功を宣言する見出しが出て、見出しだけを流し読みする利用者を誤らせる。注意の見た目と Badge「失敗」と読み上げ「ファイルの保存に失敗しました」は正しく、矛盾するのは見出しだけ。
- **推奨アクション**: 保存 0 件のときは、`noticeHeading` に `detail` を渡す形か別の category で見出しを「ファイルの保存に失敗しました」に切り替える。全件失敗の行の test を足す。
- **根拠**: UX-2 (失敗種別ごとの表示の出し分け)、UX-9。
- **scope 根拠**: touched files (`labels.ts`、`thread.aui.tsx`) で直接修正できる。

### [Medium] 壊れた http(s) URL が死んだリンクになり、見出しが "URL" になる (M-002) (scope: feature)

- **観察**: `src/renderer/src/components/assistant-ui/elements/server-tool-call.aui.tsx:45-47` の `isHttpUrl` は正規表現 `/^https?:\/\//i` だけで判定する。`src/domain/session/content-blocks.ts:119-125` の `webSourceUrl` も同じ正規表現・長さ・制御文字だけで、`URL` で parse しない。`https://` のような文字列はこの 2 つを通る。`server-tool-call.aui.tsx:70-72` はその項目を `<a href="https://">` にし、`webFetchHeading` (`web-tool-heading.ts:14-28`) が parse に失敗すると固定の "URL" を返すので、タイトルが空なら表示が "URL" になる。main の `openExternalIfHttp` (`src/main/app/window.ts:31-38`) は `new URL` が失敗すると黙って return する。その結果、押しても何も起きず、フィードバックも出ない。
- **spec との差**: spec.md の Edge Cases は「URL が http(s) でない・形が壊れている → 項目は出すがリンクにしない」としている。`server-tool-call.aui.test.tsx:64-92` には http(s) でない scheme と空 URL の fixture だけがあり、形の壊れた http(s) の fixture は無い。
- **同種事象探索**: `isHttpUrl` と `webFetchHeading` の併用を grep した。`server-tool-call.aui.tsx:45,70,71` だけで、同種はこの 1 箇所。
- **リスク/影響**: 発生は稀だが、押しても反応しないリンクと、意味のない "URL" の文字が出る。
- **推奨アクション**: `linked` を `webFetchHeading(url) !== TOOL_DISPLAY_LABELS.urlHeading` の判定にするか、`new URL` の成功を条件にする。`https://` と host が 256 コードポイントを超える URL の test を足す。
- **根拠**: UX-2 (行き止まりの回避)、spec Edge Cases、FR-009。
- **scope 根拠**: touched files で直接修正できる。

### [Medium] 失敗の表示に利用者向けの文言と次の行動が無い (M-003) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/labels.ts:422-423` の `searchFailed` は SDK のエラー種別をそのまま `検索に失敗しました (max_uses_exceeded)` のように出す。
  - `mirror-error` (`labels.ts:54`、`thread.aui.tsx:1284`) は「記録の同期に失敗しました」と生の `error` 文だけで、案内の段 (`guidance`、`thread.aui.tsx:1294-1304`) が無い。Hook の失敗 (`hookFailedGuidance`) と task の失敗 (`taskFailedGuidance`) には確かめる場所を示す案内があり、同じ「失敗」の行で扱いが揃っていない。
- **同種事象探索**: `guidance` の分岐 (`thread.aui.tsx:1294-1304`) を読んだ。案内があるのは hook・task・auth・refusal だけで、`mirror-error`・`files-persisted` の失敗・サーバー側 tool のエラーには無い (3 件)。
- **リスク/影響**: 利用者は、コードが何を意味するか、再試行すべきか、諦めてよいかを判断できない。`mirror_error` は届く見込みが薄い (spec Assumptions) ので影響は限定的。
- **推奨アクション**: 既知のエラー種別 (`too_many_requests`、`max_uses_exceeded`、`unavailable`、`query_too_long`、`invalid_input`) を訳す表を `SERVER_TOOL_LABELS` に置き、未知の値は今のコード表示に落とす。`mirror-error` と保存失敗には 1 文の案内を足す。
- **根拠**: UX-2 (user-friendly なメッセージと recovery action)。
- **scope 根拠**: touched files で直接修正できる。

### [Low] local_command_output が 1 行・120 コードポイントに潰される (L-001) (scope: feature)

- **観察**: `src/domain/session/system-event.ts:55-61` の `redactedBodyLine` は空白と改行を 1 つの空白に畳み、120 コードポイントで `…` に切る。`notice-rows.ts:303-311` の `local_command_output` はこれを通す。slash command の表形式の出力 (`/cost` など) は構造が失われ、全文は見られない。
- **リスク/影響**: spec の U-3 と Edge Cases が決めた挙動で「…」の印も出るが、利用者が読める情報量が少ない。
- **推奨アクション**: 対応は不要。マイルストーン末の棚卸しで、折りたたみ表示にするか判断する。
- **根拠**: UX-7。

### [Low] 「ほか N 件」の文言が 4 箇所に重複し、桁区切りが揃っていない (L-002) (scope: feature)

- **観察**: `NOTICE_ROW_LABELS.more` (`labels.ts:265`) は `COUNT_FORMAT` を通す。`SERVER_TOOL_LABELS.more` (`labels.ts:424`)、`TOOL_DISPLAY_LABELS.more` (`labels.ts:532`)、`COMPOSER_LABELS.moreCommands` (`labels.ts:580`) は通さない。
- **同種事象探索**: `ほか .* 件` で `labels.ts` 内に 4 件。
- **推奨アクション**: 1 つの関数に寄せる。
- **根拠**: UX-9、UX-6。

### [Low] Sources のリンクに全文の確認手段と外部ブラウザで開く旨の手がかりが無い (L-003) (scope: feature)

- **観察**: `server-tool-call.aui.tsx:80-87` のリンクは `truncate` するが `title` が無い。行側 (`thread.aui.tsx:1350,1416`) は `title` を付けている。リンクを押すと OS の既定ブラウザが開くが、外部で開く旨の表示は無い。URL 全体は DOM にあるが画面には出ず (host だけ出す設計)、Electron にはステータスバーも無い。
- **推奨アクション**: `title` にタイトルを付ける。視覚的な外部リンクの印は任意。
- **根拠**: UX-9。

### [Low] mirror-error の行で「失敗」が見出しと Badge の二重になる (L-004) (scope: feature)

- **観察**: 見出し「記録の同期に失敗しました」(`labels.ts:54`) の隣に Badge「失敗」(`thread.aui.tsx:1370-1378`) が出る。`files-persisted` の成功と `active-goal` の解除には、見出しが状態を伝える行で Badge を抑える分岐がある (`thread.aui.tsx:1269-1271`)。`mirror-error` にはその分岐が無い。
- **推奨アクション**: Badge を抑える分岐に `mirror-error` を足す。ただし M-001 の見出し修正と同時に整理する。
- **根拠**: UX-9。

### [Low] 知らないブロックの印に説明と次の行動が無い (L-005) (scope: feature)

- **観察**: `unsupported-block-mark.tsx:19-26` は「表示に対応していないブロック (mcp_tool_use)」の 1 行だけを出す。内部の型名が出るだけで、全文を Claude Code で確かめられる旨の案内が無い。
- **リスク/影響**: Tier B で、spec の U-8 がこの形を決めている。
- **推奨アクション**: 対応は不要。棚卸しで検討する。
- **根拠**: UX-2。

## H. テスト / observability / regression (ux-reviewer の担当範囲)

- 検出できるテストがあるもの:
  - Sources のリンクの scheme と `rel` (`server-tool-call.aui.test.tsx:64-92`)。
  - 注意・通常・名前の列・同じ key の合成・a11y (`LivePane.o2.test.tsx:1295-1383`)。
  - File element の名前と種類と英語の既定が出ないこと (`document-file.fe020.test.tsx`)。
  - 知らないブロックの印と a11y (`unsupported-block-mark.test.tsx`)。
  - 読み上げ (`TranscriptAnnouncer.test.tsx`)。
  - code-gate は 3953 件の test が全 pass。
- 欠けているもの (H-M1): 全件失敗の `files-persisted` の見出し (M-001) と、形の壊れた http(s) URL (M-002) を検出するテストが無い。
- 既存 regression: `conversation-search.ts:68` の `file` の part の取り扱い変更は、「今までの検索の結果を保つ」というコメントのとおり `filename ?? ''` を維持している。`turns.ts` と `activity-bins.ts` は server tool を数えない。この除外は `isServerToolCallPart` で明示されている。サーバー側 tool のエラーが会話の地図のエラー数に出ない点は、文書化済みの設計判断で Low (L-H1)。
- observability: renderer の表示だけで log / metric は対象外。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade summary の対象は無い。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `files-persisted` の見出しを引く箇所 | 1 | `labels.ts:56`、`labels.ts:275`、`thread.aui.tsx:1329` |
| M-002 | `isHttpUrl` / `webFetchHeading` の併用 | 1 | `server-tool-call.aui.tsx:45,70,71` |
| M-003 | `guidance` を持たない失敗の行 | 3 | `thread.aui.tsx:1294-1304`、`labels.ts:54`、`labels.ts:422` |
| L-002 | `ほか .* 件` | 4 | `labels.ts:265,424,532,580` |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 5
