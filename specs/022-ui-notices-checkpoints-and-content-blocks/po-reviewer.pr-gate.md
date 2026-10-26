# po-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-017 と SC-001〜SC-009 のすべてに当たる。対応は次のとおり。
  - US-1: FR-001〜FR-005 (notice-rows.ts / live-signals.ts / transcript-announcements.ts / thread.aui.tsx SystemEventRow)
  - US-2: FR-006・FR-010 (notice-rows.ts filesPersisted、File element)
  - US-3: FR-007〜FR-009・FR-011 (content-blocks.ts、server-tool-call.aui.tsx、unsupported-block-mark.tsx)
  - US-4: FR-012 (transcript.ts)
  - 照合: FR-013〜FR-015 (coverage.mjs、ui-coverage.md)
  - 記録: FR-016・FR-017
  - SC-009 は quickstart-results.md に「V-1〜V-5 未実施」と書かれている。spec の「合否の扱い」のとおり、マージの条件には入らない
- touched files に当たる charter / Confirmation:
  - ui charter の Mission (charter.md:45) と KPI「表示網羅」(charter.md:180-182)
  - AD-049 Decision 3 (本文の伏せ字) と Decision 6 (巻き戻さない)
  - AD-060 (B 節の照合と知らないブロックの印)
  - AD-056 Decision 1 (Tier B であり、M3 の完了には数えない)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲 (伏せ字・`openExternalIfHttp` の経路は A / B で扱う)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:2 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲 (code-gate で確認済み)
- G. optional reviewer 範囲: 該当なし: 読み上げの WCAG 面は a11y-reviewer、empty state の文言は ux-reviewer が扱う
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Claude Code が送ってくるのに今は捨てている知らせ 7 種 (`notification` / `local_command_output` / `memory_recall` / `mirror_error` / `tool_use_summary` / `active_goal` / `files_persisted`) を、domain の `toNoticeRow` 1 つでシステムイベントの行にし、実行中と過去ログの両方で使う。`server_tool_use` / `web_search_tool_result` は ServerToolCall と Sources で、`user/document` は File で、専用の表示を持たないブロックは種類の名前だけの印で出す。B 節は `@anthropic-ai/sdk` 0.125.0 の union と機械照合する。

前回の design-gate で PO が出した指摘は次のように片づいている。
- H-001 は U-10 / U-11 で直った
- M-001 (検索結果 0 件) は `SERVER_TOOL_LABELS.noSources` で手当てされた
- M-003 (失敗の理由は最初の 1 件だけ) と L-001 (`http://` のパス) は Medium / Low として残っている。AD-050 に従い、ここでは指摘し直さない

この round では実装を AC と突き合わせた。行の合成 (AC2) と読み上げ (AC5) の組み合わせ、および `files_persisted` が全件失敗したときの表示に食い違いが見つかった。

## Findings

### [High] 同じ `key` の `notification` が 2 回目以降に `high` / `immediate` で届くと読み上げられず、US-1 AC5 を満たさない (H-001) (scope: feature)

- **観察**:
  - `src/domain/session/notice-rows.ts:187-191`: `notification` の行の id は `notification:<key>` で、同じ `key` は 1 行にまとまる (AC2)。
  - `src/renderer/src/features/chat/transcript-announcements.ts:57-62` / `:72-75`: 読み上げの鍵は `row:${messageId}:notification` で、本文も届いた回数も含まない。
  - `src/renderer/src/features/chat/TranscriptAnnouncer.tsx:66-73`: `seenRef` に鍵が既にあると `continue` するので、同じ行 (同じ `messageId`) に重ねて届いた 2 回目以降の `warning` は読まれない。
  - 結果として、1 回目が `high` で読み上げられた後、同じ `key` で新しい本文の `high` / `immediate` が届くと、画面の本文は書き換わる (AC2 の「最後の本文になる」) が、読み上げはされない。
- **同種事象探索**: `make\('(notification|mirror-error|files-failed)'` で 3 件 (`transcript-announcements.ts:74`, `:77`, `:80`)。id が届くたびに変わる `mirror-error:<uuid>` / `files-persisted:<uuid>` は当たらず、合成される id を持つのは `notification` の 1 件だけ。テストは `TranscriptAnnouncer.test.tsx:136-140` に 1 回目の `warning` の 1 件しかなく、同じ `key` を 2 回届ける fixture は 0 件。
- **リスク/影響**: US-1 AC5 は「`high` / `immediate` の `notification` が見ているセッションで届く → 読み上げられる」。2 回目以降に届いたものも「届く」に含まれる。支援技術を使う利用者には、注意を求める通知の更新が伝わらない。目で見る利用者は書き換わった本文を見られるので、伝わり方に差が出る。
- **推奨アクション**: `notification` の読み上げの鍵に、行が書き換わったことが分かる値を含める。たとえば domain の `mergeSystemEvent` で `notification` に届いた回数か本文の短い hash を持たせるか、renderer で `detail` を鍵に含める (`row:${messageId}:notification:${detail}` など。読み上げる文は固定の文言のまま)。`TranscriptAnnouncer.test.tsx` に「同じ `key` の `high` が 2 回届くと 2 回読む」「`high` の後に同じ本文の `low` が届いても読まない」の 2 件を足す。
- **根拠**: spec.md:117 (US-1 AC5)、spec.md:114 (AC2)、spec.md:96 (Clarifications の読み上げ)、PO-3 / PO-4
- **scope 根拠**: touched files の transcript-announcements.ts / TranscriptAnnouncer.test.tsx の中で直せる

### [Medium] 全件が失敗した `files_persisted` でも見出しが「ファイルを保存しました」になる (M-001) (scope: feature)

- **観察**:
  - `src/domain/session/notice-rows.ts:255-271`: `files` が空で `failed` だけがあっても行を作り、status は `failed` になる。
  - 見出しは `labels.ts:56` の固定の「ファイルを保存しました」で、`noticeHeading` (`labels.ts:269-276`) が言い換えるのは `active-goal` の解除だけ。
  - そのため 1 行に「ファイルを保存しました」「保存 0 件・失敗 N 件 (...)」「失敗」の Badge が並ぶ (`thread.aui.tsx:1265-1273`, `:1329`)。
- **同種事象探索**: `保存 0 件|files: \[\]` を src で検索して 1 件 (`notice-rows.test.ts:219`。両方とも空のときに行を作らないテスト)。全件失敗の fixture は 0 件。
- **リスク/影響**: 見出しが事実と逆を言う。US-2 AC1 の件数そのものは正しいが、最初に目に入る見出しで誤読しやすい。
- **推奨アクション**: `noticeHeading` に「`files-persisted` で保存 0 件・失敗 1 件以上なら『ファイルの保存に失敗しました』」(読み上げの文言 `ANNOUNCER_LABELS.filesPersistedFailed` と同じ文) を足し、component テストに全件失敗の fixture を足す。
- **根拠**: PO-3 / PO-4 (異常系)、spec.md:132

### [Medium] `files_persisted` の名前の列が保存したファイルと失敗したファイルを区別しない (M-002) (scope: feature)

- **観察**:
  - `notice-rows.ts:272` は `[...filenamesOf(files), ...filenamesOf(failed)]` を 1 つの列にまとめる。
  - `thread.aui.tsx:1408-1423` の `NoticeNameList` も項目を区別せずに並べる。data-model.md:87 も「`files` → `failed` の順」としか書いていない。
- **同種事象探索**: `filenamesOf\(` で 2 件 (`notice-rows.ts:247`, `:272`)。
- **リスク/影響**: 「失敗 2 件」と出ても、どのファイルが失敗したかが分からない。失敗の理由は最初の 1 件だけ (design-gate の M-003 で既出) なので、利用者は次の行動 (どのファイルを確かめ直すか) を決められない。
- **推奨アクション**: 失敗の項目に印を付ける (たとえば名前の列の行頭に固定の接頭辞を付け、renderer が「(失敗)」に組む)。あるいは列を 2 つに分ける。これを data-model §1.5 に書く。
- **根拠**: PO-6 (recovery flow)、spec.md:132

### [Low] http(s) でない URL でタイトルが空の Sources の項目は、何も書かれていない行になる (L-001) (scope: feature)

- **観察**: `server-tool-call.aui.tsx:70-72` は、http(s) でないとき `host = ""`、タイトルも空なら `title = ""` になり、`<li>` は空になる。spec.md:177 の Edge Case は「項目は出すがリンクにしない」としている。
- **推奨アクション**: タイトルも host も空のときは固定の文言 (「タイトルのない結果」など) を出す。
- **根拠**: PO-4

### [Low] 検索の失敗の種類が SDK の英語の識別子のまま出る (L-002) (scope: feature)

- **観察**: `labels.ts:422-423` は `検索に失敗しました (${errorCode})` で、`max_uses_exceeded` などをそのまま出す。US-3 AC3 の「エラーの種類を出す」は満たしているが、利用者向けの文言になっていない。
- **推奨アクション**: 既知の `error_code` に訳の表を足し、表に無い値は今のまま出す (`TASK_TYPE_LABELS` と同じ形)。
- **根拠**: PO-6

### [Medium] H: AC5 と AC2 の組み合わせ・全件失敗を固定するテストが無い (M-003) (scope: feature)

- **観察**:
  - H-001 の経路 (同じ `key` で 2 回目の `high`) を検出するテストは `TranscriptAnnouncer.test.tsx` に無い (:136-160 は 1 回目だけ)。
  - M-001 の全件失敗の表示を固定するテストも無い (上記の Grep で 0 件)。
  - code-gate の test-agent は 3953 件が通っているが、これらの AC の組み合わせは測られていない。
- **推奨アクション**: H-001 / M-001 の推奨アクションに書いたテストを足す。
- **根拠**: SC-001 / SC-002 の計測経路 (spec.md:238-239)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `make\('(notification\|mirror-error\|files-failed)'` (transcript-announcements.ts) | 3 | src/renderer/src/features/chat/transcript-announcements.ts:74, :77, :80 (id が合成されるのは :74 の notification だけ) |
| H-001 | `notification` (TranscriptAnnouncer.test.tsx) | 2 | src/renderer/src/features/chat/TranscriptAnnouncer.test.tsx:138, :153 (同じ key を 2 回届ける fixture は 0) |
| M-001 | `保存 0 件\|files: \[\]` (src) | 1 | src/domain/session/notice-rows.test.ts:219 (全件失敗の fixture は 0) |
| M-002 | `filenamesOf\(` (notice-rows.ts) | 2 | src/domain/session/notice-rows.ts:247, :272 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 2
