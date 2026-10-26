---
spec_id: 022-ui-notices-checkpoints-and-content-blocks
feature_id: O-12
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: auto
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Feature Branch**: `022-ui-notices-checkpoints-and-content-blocks`

**Created**: 2026-10-22 (夜間の自走で起案。人間の判断が要る点は推奨案で採用した — 下の「判断の一覧」)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 23 の O-12 の行 (範囲と義務の正本)。O-11 の spec 019 の U-1 と [AD-056](../../docs/decisions/0056-o11-scope-background-task-list-and-o12-split.md) Decision 1 で O-11 から分けた。対応表 (`docs/ui-coverage.md`) の `後続: O-12` の行 (A 節 7 行・A' 節 1 行・B 節 3 行) と、備考で O-12 を指す行 (A 節の拒否 2 行・`informational`・`elicitation_complete`、E 節の `rewind_files`、F 節の Checkpoints / Document reference / File / Follow-up suggestions / Inline citation / Memory / Sources)。依存の O-11 は main にマージ済み。

## Summary

Claude Code が送ってくるのに Closta が捨てている知らせとブロックを、transcript に出す。Tier B と過去ログの経路だけなので M3 の完了の条件に数えない (AD-056 Decision 1)。

- **知らせの類**: `notification`・`local_command_output`・`memory_recall`・`mirror_error`・`tool_use_summary`・`active_goal` を、O-2 のシステムイベントの行で出す。`prompt_suggestion` は受け取る option を渡さないので出さない (U-1)
- **Checkpoints**: `files_persisted` (保存したファイルと失敗) を行で出す。巻き戻しはしない (AD-049 Decision 6)
- **中身のブロック**: `server_tool_use` と `web_search_tool_result` を tool の呼び出しと検索結果の一覧 (Sources) で出す。`user/document` を File element で出す。専用の表示が無いブロックは捨てず、種類の名前だけの印を出す (U-8)
- **過去ログ**: O-6 の行 (`informational`・拒否・会話の作り直し)・O-10 の `elicitation_complete` の行・本 feature の行を、記録の形が読めれば実行中と同じ行に変換する (U-9)
- **対応表の B 節の機械照合**: Constitution 検証の項目 21 で、B 節の行の集合を SDK の型の content block の集合と照合する (U-7)

## 判断の一覧 (2026-10-22 夜間の規則で推奨案を採用)

| 判断 | 1 行の要約 | 記録 |
|---|---|---|
| U-1 | `promptSuggestions` を渡さない。`prompt_suggestion` は `表示不要`、F 節の Follow-up suggestions は `未使用` (`QUERY_OPTION_KEYS` を変えない) | FR-001、Out of Scope |
| U-2 | 知らせの類は transcript のシステムイベントの行にする。右のペイン・`meter` には載せない。`notification` は同じ `key` を 1 行にまとめる。`active_goal` の `null` は「目標の解除」の行 | FR-002 / FR-003 |
| U-3 | 本文 (`text` / `content` / `summary` / `condition` / `error`) は伏せ字と切り詰めを通して出す。`memory_recall` は本文と絶対パスを出さず、件数・scope・ファイル名の末尾だけ。`mirror_error` の `key` は出さない | FR-004 / FR-005 |
| U-4 | Checkpoints は `files_persisted` の 1 行 (保存の件数・失敗の件数・ファイル名)。`file_id` は出さず、巻き戻し・ファイルを開く操作は付けない | FR-006 |
| U-5 | `server_tool_use` を tool の呼び出しにし、同じ id の `web_search_tool_result` を結果に埋めて Sources (タイトルと host) で出す。リンクは http(s) だけを既存の外部リンクの経路で開く。Inline citation (text の `citations`) は組まない | FR-007〜FR-009 |
| U-6 | `user/document` は File element (名前と種類) で出し、中身 (base64・text) は出さない。Document reference は `未使用` | FR-010 |
| U-7 | B 節の照合の基準は、Agent SDK の型が参照する union のメンバーの `type` (assistant は `BetaContentBlock`、user は `ContentBlockParam`)。足りない行を足して割当を書き、表の冒頭に `@anthropic-ai/sdk` の版を書く | FR-013 / FR-014、AD-060 |
| U-8 | 専用の表示が無い content block は捨てず、種類の名前だけの 1 行の印を出す (実行中と過去ログ) | FR-011、AD-060 |
| U-9 | 過去ログの記録は、判別子 (`type` / `subtype`) が読めれば実行中と同じ行の変換に通し、読めなければ今の伏せ字つきの本文のまま。O-6 / O-10 の V-3 は未実施なので両方の形に耐える | FR-012 |
| U-10 | 知らないブロックの印を出す経路は assistant のブロック (実行中と過去ログ) と過去ログの主ループの user のブロック。実行中の user のメッセージと過去ログの subagent の user の記録は今どおり tool_result だけを読む (design-gate H-001) | FR-011 / SC-004、AD-060 Decision 3 |
| U-11 | 過去ログの user の記録は許可一覧 (`text` / `image` / `document` / `tool_result`) の外を印にする (role を見る)。assistant は今の switch に case と `default:` の印を足す。system の記録は今のまま (design-gate H-002) | FR-011、data-model §2.2、AD-060 Decision 4 |
| U-12 | Constitution Principle XII の Verification の字面の改定は本 feature の PR に入れない。版は v1.5.0 (MINOR)。利用者のレビューの後に別の PR で行う (design-gate H-003 / H-004) | plan「ADR」、AD-060 |
| U-13 | `active_goal` は `SDKMessage` の外なので、stream の switch の `default:` の中の型ガードで受ける (cast しない)。届くかは quickstart V-1 で記録する (design-gate H-006) | FR-002、plan RK-11 |
| ADR | AD-060 (design で起こし、夜間の規則で推奨案を採用して accepted にする): 対応表の B 節の機械照合の基準 (AD-044 Decision 4 の読み替え。U-7) と、知らないブロックの印 (U-8) | `docs/decisions/` |
| ADR | AD-061 (pr-gate round 1 の H-002 で起こし、夜間の規則で推奨案を採用して 2026-10-27 に accepted にした): O-12 が広げた session の契約 (システムイベントの行の category 13 → 20・part `server-tool-call`・`file` の part の形・agents の `system` の 5 つの subtype とトップレベルの `tool_use_summary` / `active_goal` の分岐) | `docs/decisions/` |

各 U-n の検討した案・採った案は「Clarifications」の節に置く。

## 本 feature の位置づけ

- **ui の feature で、agents (実行中の変換)・domain (過去ログの変換)・renderer・Constitution 検証のスクリプトに触れる** (targets は both)。session の契約のうち `SessionEvent` の種類・承認の要求と応答・IPC・preload・main・`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS`・`METER_UPDATE_TYPES` は変えない。行は O-2 のシステムイベントの行 (`toSystemEventMessage` / `mergeSystemEvent`) の category を足して作る。DTO の part の種類を足すか (Sources・知らないブロックの印) は plan で決め、足すなら `TRANSCRIPT_PART_FIELDS` の固定テストを同じ PR で直す
- **本文の扱いは O-6 の `informational` の例外に揃える。** 知らせの本文は Claude Code が利用者に見せるための文なので出すが、伏せ字 (`redactSecrets`) と O-2 の切り詰めを通す (AD-049 Decision 3 と同じ形。U-3)
- **巻き戻し・task の操作はしない。** `rewind_files` / `stop_task` は `表示不要` のまま (AD-049 Decision 6)
- **M3 の完了の条件に数えない。** 対象の行は Tier B と、実行中の経路で `実装済み` の Tier A の行の過去ログの経路だけである

### 義務の扱い

roadmap の O-12 の行が預けた範囲と義務の扱いの正本はこの表である。

| 義務 (roadmap の O-12 の行) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| Tier B の知らせの類 (`notification` / `local_command_output` / `memory_recall` / `mirror_error` / `tool_use_summary` / `active_goal`) | 扱う | US-1、FR-002〜FR-005 |
| Tier B の知らせの類のうち `prompt_suggestion` | 扱う (出さない。`promptSuggestions` を渡さない。U-1) | FR-001 |
| Checkpoints の表示 (`files_persisted`。巻き戻しはしない) | 扱う | US-2、FR-006 |
| `user/document` の File element | 扱う | US-2、FR-010 |
| `server_tool_use` / `web_search_tool_result` (Sources / Inline citation の判断し直し。O-6 U-5) | 扱う (Sources は組む。Inline citation は組まない。U-5) | US-3、FR-007〜FR-009 |
| 対応表の B 節 (中身のブロック) の機械照合 | 扱う | FR-013 / FR-014、AD-060 |
| 過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) の変換 (O-6 の quickstart V-3 の記録による) | 扱う (V-3 は未実施。両方の形に耐える変換にし、本 feature の quickstart で記録する。U-9) | US-4、FR-012 |
| 過去ログへの O-10 の行 (`elicitation_complete`。category `elicitation`) の変換 (O-10 の quickstart V-3 の記録による) | 扱う (同上) | US-4、FR-012 |
| 完了の PR で対応表の `後続: O-12` の行を書き換える | 扱う | FR-015 |

## Clarifications

### Session 2026-10-22 (夜間の規則で推奨案を採用)

- **U-1** Q: `prompt_suggestion` (次のプロンプトの予測) を出すか → 検討した案: (a) `promptSuggestions` を渡さず `表示不要` (b) `promptSuggestions: true` をリテラルで渡し、composer の上に候補を出して押すと composer に入れる (送らない) (c) 起動のダイアログで切り替える → **採った案: (a)**。(b) は query の options の読み替え (AD-041 (g)・`QUERY_OPTION_KEYS` 12 → 13) の ADR と、毎ターンの追加のモデルの呼び出しを伴うのに、利用者の判断に要る情報は増えない (Tier B)。(c) は起動の入力・プリセットが広がる。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-2** Q: 知らせの類をどこに出すか → 検討した案: (a) transcript のシステムイベントの行 (b) 右のペインの新しいタブ (c) `active_goal` だけ `meter` で「概要」のタブに今の目標を出す → **採った案: (a)**。O-2 / O-6 の行の作り方をそのまま使え、過去ログとも同じ形になる。(b) (c) は `METER_UPDATE_TYPES` とタブを広げる (session の契約の拡張)。`notification` は同じ `key` の知らせを 1 行にまとめ (同じ `tool_use_id` の `informational` と同じ考え方)、`active_goal` の `value: null` は「目標を解除した」の行にする。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-3** Q: 知らせの本文をどこまで出すか → 検討した案: (a) 本文は伏せ字と切り詰めを通して出し、`memory_recall` の本文と絶対パス・`mirror_error` の `key` は出さない (b) 本文をすべて出さず、種類の名前だけ (c) 本文をそのまま出す → **採った案: (a)**。(b) は知らせの意味が伝わらない。(c) は slash command の出力・メモリの本文に秘密が入りうる。メモリの本文は利用者が書いた長い文書で、行の 1 行に収まらず Claude Code の `/memory` で見られる。絶対パスはユーザー名を含むので末尾だけにする。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-4** Q: Checkpoints (`files_persisted`) をどう出すか → 検討した案: (a) 1 行に保存の件数・失敗の件数・ファイル名 (失敗の理由は伏せ字つき) (b) 右のペインに保存したファイルの一覧のタブ (c) 巻き戻しの操作つきの Checkpoints の element → **採った案: (a)**。(c) は AD-049 Decision 6 (チェックポイントを操作しない) に反する。(b) は状態の持ち主が要る。`file_id` は利用者の判断に要らず、出さない。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-5** Q: `server_tool_use` / `web_search_tool_result` をどう出すか。Sources / Inline citation を組むか (O-6 U-5 の判断し直し) → 検討した案: (a) `server_tool_use` を tool の呼び出しとし、同じ id の結果のブロックを結果に埋め、検索結果をタイトルと host の一覧 (Sources) で出す。Inline citation は組まない (b) Sources と Inline citation の両方を組む (c) どちらも組まず結果を text にする → **採った案: (a)**。O-6 U-5 が避けたのは「text からリンクを推測すること」で、結果のブロックは API が返す構造の URL なので推測にならない。Inline citation は text の `citations` を MarkdownText の中に差し込む必要があり、R-3 の markdown の XSS 境界 (AD-034) に触れるので組まない (AD-019 を変えない)。リンクは http(s) だけを既存の外部リンクの経路 (`openExternalIfHttp`) で開き、`encrypted_content` は読まない。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-6** Q: `user/document` をどう出すか → 検討した案: (a) File element に名前と種類 (PDF / text など) だけ (b) text の文書は中身も出す → **採った案: (a)**。Closta の composer は添付を受け付けず (F 節の Attachment)、文書が来るのは過去ログの記録だけで、中身は元のファイルで見られる。base64 の中身を renderer に運ばない。Document reference は引用の位置を指す element で、届く値に位置が無いので `未使用` にする。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-7** Q: B 節の機械照合の基準をどこに取るか → 検討した案: (a) Agent SDK の型 (`sdk.d.ts`) が参照する union (`SDKAssistantMessage.message` の `BetaMessage` の content の `BetaContentBlock`、`SDKUserMessage.message` の `MessageParam` の content の `ContentBlockParam`) のメンバーの `type` (b) 今の B 節の 10 行を固定の一覧として照合する (c) 照合しない (AD-044 Decision 4 のまま) → **採った案: (a)**。(b) は SDK の版を上げても足りない行が検出されない。(c) は roadmap の義務を満たさない。`@anthropic-ai/sdk` は Agent SDK の依存として入る版を読み、版を表の冒頭に書く (A / C / E 節の `SDK:` の行と同じ)。照合で今の表に無い行が assistant 側 11・user 側 12 ほど増える (0.125.0 の型で数えた。数の正本は design の照合の結果)。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-8** Q: 照合で増えた行のうち、専用の表示を持たないブロックをどうするか → 検討した案: (a) 捨てずに、種類の名前 (形の検査を通したものだけ) の 1 行の印を出し、その行の割当を `実装済み: <印の element>` (Tier B) にする。Claude Code の会話に現れない組み合わせ (user の `tool_use` など) は `表示不要: <理由>` にする (b) 今どおり捨て、行を全部 `表示不要` にする (c) 行ごとに専用の表示を作る → **採った案: (a)**。(b) は「知らないブロックとして捨てている」状態を割当で追認するだけで、新しいブロックが届いても利用者に見えない (Principle XII)。(c) は Tier B の行のために表示が増え、FR が 20 を超える。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-9** Q: 過去ログの O-6 / O-10 の行の変換を、記録の形を確かめずに作るか (O-6 / O-10 の quickstart V-3 は未実施) → 検討した案: (a) 記録に判別子 (`type` / `subtype`) と必要なフィールドが読めれば実行中と同じ変換で行にし、読めなければ今の伏せ字つきの本文のまま (両方の形に耐える)。実データの形は本 feature の quickstart で記録する (b) 記録の形を確かめるまで変換を作らない (c) 本文の文面から種類を推測する → **採った案: (a)**。O-2 の Hook / task の行の過去ログの変換と同じ扱いで、どちらの形でも今より悪くならない。(b) は義務を満たさない。(c) は推測で行の種類を誤る。対応表の経路は実機の記録で「両方」に直す。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-10** (design-gate H-001 の修正。夜間の規則で推奨案を採用) Q: 知らないブロックの印をどの経路で出すか。実行中の user のメッセージと過去ログの subagent の user の記録は tool_result だけを読む → 検討した案: (a) 印の範囲を「assistant のブロック (実行中と過去ログ。subagent の assistant を含む) と過去ログの主ループの user のブロック」に絞り、外す 2 つの経路と理由を書く (b) 2 つの経路でも印を出す → **採った案: (a)**。外す 2 つの経路は知らないブロックだけを捨てているのではなく、user の content を tool_result のほかは読まない経路である。実行中の user の本文は送らず (利用者の入力は renderer の送信の値を出す)、subagent の user の記録は親の `Agent` の入力の重複 (O-11 U-11)。(b) は実行中の user のメッセージに本文の DTO を作る経路を新設し、範囲が広がる。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-11** (design-gate H-002 の修正) Q: 過去ログのブロックの変換で role を見るか (今の `convertBlocks` は role を見ず、user の `thinking` / `tool_use` も reasoning / tool-call になる) → 検討した案: (a) user の記録は許可一覧 (`text` / `image` / `document` / `tool_result`) の外をすべて `unsupported-block` にする (b) role を見ず、対応表の備考と AD-060 Decision 4 を「届けば今の part になる」に直す → **採った案: (a)**。(b) では Claude Code の会話に無い形 (user の `tool_use`) が正しい tool の呼び出しとして描かれ、届いたことが印で分からない。assistant の記録は今の switch に新しい case と `default:` の印を足すだけ。system の記録は今のまま (印を出さない。本文は FR-012 の経路)。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-12** (design-gate H-003 / H-004 の修正) Q: Constitution Principle XII の Verification (Automated) の「A・C・E 節」を B 節に追随させる改定をどう扱うか → 検討した案: (a) 本 feature の PR に入れず、利用者のレビューの後に別の PR で v1.5.0 (MINOR) として行う (b) 本 feature の PR に入れ、完了の PR の前に利用者の承認の記録を条件にする (c) v1.4.1 (PATCH) で本 feature の PR に入れる → **採った案: (a)**。改定手順 2 (`architecture-reviewer` の owner を交えた人間レビュー。constitution.md「改定手順」) は夜間の自走では満たせない。(b) は承認まで本 feature の他の変更のマージも止まる。(c) は照合の範囲を広げる改定で、バージョニング方針表の「指針の実質的な拡張 = MINOR」に当たり「Verification の現状の制約の事実追随 = PATCH」に当たらない。改定までの間、項目 21 は字面 (A・C・E 節) より多くを照合するが、字面に反しない。改定の持ち越しは roadmap の O-12 の行に残す。採用 (2026-10-22 夜間の規則で推奨案を採用)
- **U-13** (design-gate H-006 の修正) Q: `active_goal` (`SDKActiveGoalMessage`) は `SDKMessage` の union の外 (`sdk.d.ts` の `StdoutMessage` にだけある) で、stream の switch に `case 'active_goal'` を書くと型が通らない。どう受けるか → 検討した案: (a) switch の `default:` の中で `asRecord(message)` の `type === 'active_goal'` を確かめる型ガードで受ける (cast しない) (b) `message` を `StdoutMessage` に cast して case を書く (c) `active_goal` を範囲から外す → **採った案: (a)**。(b) は SDK の型の境界を cast で弱める (Principle IV)。(c) は roadmap の O-12 の義務 (A' 節の `active_goal`) を満たさない。`query()` の反復が実行時に `active_goal` を返すかは確かめていない。quickstart V-1 の 5 で記録し、届かなくても割当は `実装済み` のまま (Assumptions)。採用 (2026-10-22 夜間の規則で推奨案を採用)
- Q: 知らせの類の行の見出し → A: 「通知」(`notification`)・「コマンドの出力」(`local_command_output`)・「メモリを読み込みました」(`memory_recall`)・「記録の同期に失敗しました」(`mirror_error`)・「tool の要約」(`tool_use_summary`)・「目標」/「目標を解除しました」(`active_goal`)・「ファイルを保存しました」(`files_persisted`) [ASSUMED: UI ラベル]
- Q: `notification` の `priority` の見た目と読み上げ → A: `high` / `immediate` は注意の見た目にして読み上げる。`low` / `medium` は控えめの見た目で読み上げない。`color` / `timeout_ms` は読まない (行は消えない) [ASSUMED: デフォルト表示状態・読み上げの量 (O-11 の Hook の読み上げと同じ扱い)]
- Q: `files_persisted` の行に並べるファイル名の数 → A: 最大 20 件。超えた分は「ほか N 件」 [ASSUMED: 数値の既定値]
- Q: Sources の一覧の既定の開閉と件数 → A: 畳む (tool の表示の既定のまま)。最大 20 件 [ASSUMED: デフォルト表示状態・数値の既定値]
- Q: 知らないブロックの印の文言 → A: 「表示に対応していないブロック ({type})」 [ASSUMED: UI ラベル]

## User Scenarios & Testing

### User Story 1 - Claude Code からの知らせが分かる (Priority: P2)

利用者は transcript で、Claude Code が出した通知・slash command の出力・読み込んだメモリ・tool の要約・目標の設定と解除・記録の同期の失敗を、起きた位置の 1 行で見る。

**Why this priority**: Tier B。無くても判断を誤らないが、今は届いても捨てていて、Claude Code の画面では見えるものが Closta では見えない。

**Independent Test**: agents の変換の単体 (偽の SDK のメッセージ) と行の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中のセッション、**When** `notification` / `local_command_output` / `tool_use_summary` / `active_goal` / `mirror_error` が届く、**Then** それぞれの見出しの行が出て、本文は伏せ字と切り詰めを通して出る
2. **Given** 同じ `key` の `notification` が続けて届く、**When** 見る、**Then** 1 行にまとまり、最後の本文になる
3. **Given** `memory_recall` が届く、**When** 見る、**Then** 読み込んだ件数・scope ごとの数・ファイル名の末尾が出て、メモリの本文と絶対パスは DOM と `SessionEvent` に出ない
4. **Given** `active_goal` の `value` が `null`、**When** 届く、**Then** 「目標を解除しました」の行が出る
5. **Given** `priority` が `high` / `immediate` の `notification`、**When** 見ているセッションで届く、**Then** 支援技術に読み上げられる。`low` / `medium` は読み上げない
6. **Given** セッションの起動、**When** query の options を見る、**Then** `promptSuggestions` は含まれず、`prompt_suggestion` の行は出ない (U-1)

---

### User Story 2 - 保存されたファイルと添付の文書が分かる (Priority: P2)

利用者は、Claude Code がファイルを保存したこと (Checkpoints) と、会話に添付された文書を transcript で見る。

**Why this priority**: Tier B。今は `files_persisted` を捨て、文書はファイル名の文字列だけで種類が分からない。

**Independent Test**: agents の変換の単体・過去ログの変換の単体・行と File element の component テスト。

**Acceptance Scenarios**:

1. **Given** `files_persisted` が届く、**When** 見る、**Then** 保存の件数・失敗の件数・ファイル名の行が出る。失敗の理由は伏せ字つきで、`file_id` は出ない
2. **Given** 上の行、**When** 操作を探す、**Then** 巻き戻し・ファイルを開く操作は無い
3. **Given** `document` のブロックを含む過去ログ、**When** 開く、**Then** File element に名前と種類が出て、中身は出ない

---

### User Story 3 - サーバー側の検索と知らないブロックが分かる (Priority: P2)

利用者は、モデルがサーバー側で行った検索の呼び出しと結果の一覧を見て、結果のページを開ける。Closta が専用の表示を持たないブロックが来ても、来たことは分かる。

**Why this priority**: Tier B。今は `server_tool_use` と結果のブロックを捨て、モデルが何を根拠に答えたかが見えない。

**Independent Test**: agents と過去ログの変換の単体・tool の表示と Sources の component テスト。

**Acceptance Scenarios**:

1. **Given** `server_tool_use` (検索) と同じ id の `web_search_tool_result`、**When** 見る、**Then** 検索の呼び出し (検索語) と、結果のタイトルと host の一覧が 1 つの tool の表示に出る (実行中と過去ログ)
2. **Given** 結果の一覧の項目、**When** 開く、**Then** http(s) の URL だけが既存の外部リンクの経路で開く。それ以外の scheme は開けない
3. **Given** 結果のブロックがエラー (`web_search_tool_result_error`)、**When** 見る、**Then** tool の表示がエラーの印とエラーの種類を出す
4. **Given** 結果が届かないまま終わった `server_tool_use`、**When** 見る、**Then** O-6 の結果待ち・結果不明の印が出る
5. **Given** 専用の表示の無いブロック (`mcp_tool_use`・`compaction` など。経路は FR-011)、**When** 届く、**Then** 「表示に対応していないブロック ({type})」の 1 行が出て、ブロックの中身は出ない
6. **Given** text のブロックの `citations`、**When** 見る、**Then** 本文は今どおりで、引用の印は出ない (U-5)

---

### User Story 4 - 過去ログでも実行中と同じ行が出る (Priority: P3)

利用者は過去ログで、知らせ・拒否・会話の作り直し・URL の手続きの完了・本 feature の行を、実行中と同じ行で見る。

**Why this priority**: 実行中の経路は `実装済み` で、過去ログは伏せ字つきの system の本文として読める (欠落はしていない)。形が揃うと過去ログを読み返すときに迷わない。

**Independent Test**: 過去ログの変換の単体 (判別子のある記録・無い記録の両方の fixture)。

**Acceptance Scenarios**:

1. **Given** 判別子とフィールドが読める `informational` / 拒否 / 会話の作り直し / `elicitation_complete` / 本 feature の知らせの記録、**When** 過去ログを開く、**Then** 実行中と同じ category と見出しの行が出る
2. **Given** 判別子が読めない system の記録、**When** 開く、**Then** 今どおり伏せ字つきの本文が出る (欠落しない)
3. **Given** 過去ログの行、**When** 見る、**Then** 実行中の行と同じく、出さないと決めたフィールド (U-3) は出ない

### Edge Cases

- 同じ `key` の `notification` の間に別の行が挟まる → 最初の行の位置で書き換える (`mergeSystemEvent` の規則のまま)
- `memory_recall` の `path` が `<synthesis:DIR>` の形・https の URL → 「要約」・URL の host だけを出す
- `files_persisted` の `files` と `failed` がどちらも空 → 行を作らない
- `server_tool_use` の名前が `web_search` 以外 (`web_fetch` / `code_execution` など) → tool の呼び出しとして出し、結果のブロックに専用の表示が無ければ U-8 の印を結果の位置に出す
- 結果の一覧の URL が http(s) でない・形が壊れている → 項目は出すがリンクにしない
- 知らないブロックの `type` が形 (英小文字と `_`、長さの上限) に合わない → 種類の名前を出さず「表示に対応していないブロック」だけ
- subagent の中の知らせ (`parent_tool_use_id` 付き) → O-11 U-9 のまま主ループの行にする
- `local_command_output` が長い → O-2 の切り詰めの印を出す (全文は Claude Code で見られる)
- Agent SDK の版を上げて B 節の照合が落ちる → 対応表の「SDK を上げたときの手順」に B 節を足し、同じ PR で直す (AD-044 Consequences)

## Requirements

### Functional Requirements

#### 知らせの類 (US-1)

- **FR-001**: セッションの起動の query の options に `promptSuggestions` を渡してはならない (U-1)。`QUERY_OPTION_KEYS` の pin テストの集合は変えない。対応表の `prompt_suggestion` の行は `表示不要`、F 節の Follow-up suggestions は `未使用` にする
- **FR-002**: agents (実行中) と domain (過去ログ) は、`notification` / `local_command_output` / `memory_recall` / `mirror_error` / `tool_use_summary` / `active_goal` / `files_persisted` を O-2 のシステムイベントの行 (`toSystemEventMessage`) にしなければならない。category を足し (`SYSTEM_EVENT_CATEGORIES` の固定テストを直す)、読むフィールドの正本は data-model に 1 つ置く
- **FR-003**: 同じ `key` の `notification` は 1 行にまとめなければならない (`mergeSystemEvent`)。`active_goal` の `value: null` は解除の行にする (U-2)
- **FR-004**: 知らせの本文 (`notification.text` / `local_command_output.content` / `tool_use_summary.summary` / `active_goal.value.condition` / `mirror_error.error` / `files_persisted.failed[].error`) は、伏せ字 (`redactSecrets`) と O-2 の切り詰めを通して出さなければならない (U-3。AD-049 Decision 3 と同じ形)。`notification.color` / `timeout_ms`・`mirror_error.key`・`files_persisted.files[].file_id` は読まない
- **FR-005**: `memory_recall` は件数・`mode`・scope ごとの数・ファイル名の末尾 (合成の印は「要約」、URL は host) だけを運び、`memories[].content` と絶対パスを `SessionEvent` と DOM に出してはならない (U-3)
- **FR-006**: `files_persisted` の行は保存の件数・失敗の件数・ファイル名 (上限つき) を出し、巻き戻し・ファイルを開く操作を持ってはならない (U-4。AD-049 Decision 6)。`rewind_files` は `表示不要` のまま

#### 中身のブロック (US-2 / US-3)

- **FR-007**: assistant の `server_tool_use` は、実行中と過去ログの両方で tool の呼び出しとして描かなければならない。名前と入力は tool_use と同じ無害化 (`sanitizeBody` とバイトの上限) を通す
- **FR-008**: `web_search_tool_result` は同じ `tool_use_id` の `server_tool_use` の結果に埋め、結果の各項目のタイトル (無害化)・URL の host・URL を Sources の一覧で描かなければならない。`encrypted_content` は運ばない。エラーのブロックはエラーの印とエラーの種類を出す。対応の無い結果ブロックは O-2 の孤児の結果と同じく単独で出す
- **FR-009**: Sources の項目のリンクは http(s) の URL だけを既存の外部リンクの経路 (`openExternalIfHttp`) で開かなければならない。renderer で URL を解決・読み込みしない (リンクのプレビューを作らない)。text の `citations` から Inline citation を組まない (U-5)
- **FR-010**: `user/document` は File element で名前と種類 (`source.type` / `media_type` から) を描き、中身 (base64・text) を DTO に運んではならない (U-6)
- **FR-011**: 専用の表示を持たない content block は、assistant のブロック (実行中と過去ログ。subagent の assistant を含む) と過去ログの主ループの user のブロックで、捨てずに種類の名前の 1 行の印を出さなければならない (U-8 / U-10)。過去ログの user の記録は許可一覧 (`text` / `image` / `document` / `tool_result`) の外のブロックを印にする (U-11)。実行中の user のメッセージと過去ログの subagent の user の記録は今どおり tool_result だけを読み、印を出さない (U-10。user の content を読まない経路)。種類の名前は形の検査 (英小文字と `_`・長さの上限) を通したものだけを出し、ブロックの中身は運ばない

#### 過去ログ (US-4)

- **FR-012**: 過去ログの変換 (`transcript.ts`) は、`system` などの記録の判別子 (`type` / `subtype`) と必要なフィールドが読めれば、`informational`・`model_refusal_*`・`conversation_reset`・`elicitation_complete`・FR-002 の知らせを、実行中と同じ変換 (同じ category・同じ読むフィールド・同じ伏せ字) で行にしなければならない。読めない記録は今の伏せ字つきの本文のまま出す (U-9)。変換の関数は実行中の経路と domain で共有し、2 つ持たない

#### 対応表と照合 (Constitution XII / AD-044)

- **FR-013**: Constitution 検証の項目 21 (`scripts/ui-coverage/coverage.mjs`) は、B 節の行の集合を、assistant 側は `BetaContentBlock`、user 側は `ContentBlockParam` のメンバーの `type` の集合 (識別子は `<role>/<type>`) と照合し、足りない行・消えた行・`@anthropic-ai/sdk` の版の違いで違反にしなければならない (U-7)。入力のファイルが無いとき・読めた名前が下限より少ないときも違反にする (`LOWER_BOUNDS` に B を足す)。照合のテストに、行が足りない・余る・版が違う・入力が無い fixture を足す
- **FR-014**: 対応表の B 節に照合で足りない行を足し、各行に割当 (専用の表示・FR-011 の印・`表示不要: <理由>` のどれか) を書き、凡例の「機械照合」と「SDK を上げたときの手順」に B 節を足さなければならない
- **FR-015**: 完了の PR で `docs/ui-coverage.md` の `後続: O-12` の行を、本 feature の表示 (`実装済み`)・`表示不要` のどれかに書き換えなければならない (割当先が O-12 の行が項目 21 の出力で 0)。A 節の拒否 2 行・`informational`・`elicitation_complete` の備考の「行は O-12」と、F 節の Checkpoints / Document reference / File / Follow-up suggestions / Inline citation / Memory / Sources の行を直す。過去ログの経路は quickstart の実機の記録が「残る」のときだけ「両方」に直す

#### 記録

- **FR-016**: AD-060 (AD-044 Decision 4 の読み替え・照合の基準・知らないブロックの印) を ui charter の Related ADRs に記録し、完了の PR で roadmap の O-12 の行に結論を書かなければならない。本 feature は session の契約 (`SYSTEM_EVENT_CATEGORIES`・`TRANSCRIPT_PART_FIELDS`・`file` の part の形・agents の `system` の subtype とトップレベルの種類の分岐) を広げるので、O-5 / O-6 と同じく session charter (Related Specs と「セッションスレッドの `system` の分岐」の項) と `docs/domains/_overview.md` (ui の feature が session の契約を広げる例外の項) にも記録する (design-gate H-005)
- **FR-017**: 導入した用語 (知らせの類・知らないブロックの印) を glossary に反映し (Principle XIV)、roadmap の O-8 の行の (c) に「O-12 の新しい行は `message` なので `receivedMessages` に数える」を並べて書かなければならない

### Key Entities

- **知らせの行**: FR-002 の 7 つのメッセージから作るシステムイベントの行。読むフィールドと出さないフィールドの正本は data-model
- **Sources**: `web_search_tool_result` の結果の項目 (タイトル・host・URL) の一覧。`server_tool_use` の tool の表示の中に出す
- **知らないブロックの印**: 専用の表示を持たない content block の種類の名前だけを持つ 1 行
- **B 節の照合の基準**: `BetaContentBlock` と `ContentBlockParam` のメンバーの `type` の集合と、`@anthropic-ai/sdk` の版

### Assumptions

- `notification` / `local_command_output` / `memory_recall` / `tool_use_summary` / `active_goal` / `files_persisted` が実機で届く条件は確かめていない。届かないものは quickstart に「届かない」と記録し、行の割当は `実装済み` のままにする (単体と component のテストで経路を固定する)。`mirror_error` は SessionStore を使わない今の構成では届かない見込み
- `active_goal` は Agent SDK の `SDKMessage` の型の外 (`StdoutMessage` にだけある) で、`query()` の反復が実行時に返すかは確かめていない (U-13)。quickstart V-1 で記録する
- `server_tool_use` が Claude Code の主ループの assistant のメッセージに現れるか (Claude Code の WebSearch はクライアントの tool) は確かめていない。quickstart で記録する
- O-6 / O-10 の quickstart V-3 (過去ログに `informational`・拒否・会話の作り直し・`elicitation_complete` が残るか) は未実施。本 feature の quickstart で記録する (U-9)
- `@anthropic-ai/sdk` は Agent SDK の依存として入り、`node_modules` から型定義を読める。読む経路 (pnpm の配置) は plan で決める

## Success Criteria

### Measurable Outcomes

- **SC-001**: **知らせの類が出る。** US-1 の AC1〜AC6 のとおりになり、`memory_recall` の本文と絶対パス・`mirror_error` の `key`・`file_id` の目印の値が `SessionEvent` と DOM に 0 件。`QUERY_OPTION_KEYS` の pin テストが変わらない。計測経路: agents の変換の単体 + 行と読み上げの component テスト + pin テスト
- **SC-002**: **Checkpoints と文書が出る。** US-2 の AC1〜AC3 のとおりになり、文書の中身の目印の値が DTO と DOM に 0 件。計測経路: agents・過去ログの変換の単体 + 行と File element の component テスト
- **SC-003**: **検索の呼び出しと結果が出て、リンクの経路が閉じている。** US-3 の AC1〜AC4 / AC6 のとおりになり、http(s) でない URL がリンクにならず、`encrypted_content` の目印の値が DTO に 0 件。計測経路: 変換の単体 + tool の表示と Sources の component テスト (vitest-axe の違反 0)
- **SC-004**: **知らないブロックが捨てられない。** US-3 の AC5 と Edge Cases の形の検査のとおりになり、B 節の各行のブロックの fixture を FR-011 の経路 (実行中の assistant・過去ログの assistant・過去ログの主ループの user) に流すと、どのブロックも専用の表示か印のどちらかになる (0 件で消えるブロックが無い)。FR-011 が外す 2 つの経路 (実行中の user・過去ログの subagent の user) は tool_result だけが part になることを同じ表で固定する。計測経路: 変換の単体 (B 節の行 × 経路の表で回す)
- **SC-005**: **過去ログが両方の形に耐える。** US-4 の AC1〜AC3 のとおりになる。計測経路: 過去ログの変換の単体 (判別子のある記録・無い記録の fixture)
- **SC-006**: **B 節が機械照合され、O-12 の行が無くなる。** 項目 21 が B 節を照合して通り、FR-013 の fixture で落ち、出力で割当先が O-12 の行が 0。計測経路: `node scripts/constitution/check.mjs` + 照合のテスト
- **SC-007**: **境界が広がらない。** `SessionEvent` の種類・`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS`・`METER_UPDATE_TYPES`・IPC・preload・main の差分が 0。計測経路: 固定テスト + Constitution 検証 + `git diff` (quickstart)
- **SC-008**: **既存の表示と検証が壊れない。** 計測経路: `docs/discovery.md` の verify (CI と同じコマンド)
- **SC-009**: **実機の記録。** 知らせの類・`files_persisted`・`server_tool_use` が実機で届くか、過去ログに O-6 / O-10 / 本 feature の行が残るかを記録する。計測経路: quickstart の実機の目視 (`quickstart-results.md`)

**合否の扱い**: SC-001〜SC-008 はマージの条件。SC-009 は実機の確認の条件で、行えなかったときは `quickstart-results.md` に「未実施」と書いてマージし、roadmap の O-12 の行に未確認の項目として残す (2026-10-21 夜間の規則)。実機で「届かない」「残らない」と記録した行は、経路を直さずそのまま書く (FR-015)。

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): システムイベントの行の変換と合成・切り詰め・tool の結果の送り直し・孤児の結果・対応表と項目 21 を継承する
- **O-6** ([016](../016-ui-boundaries-and-tool-displays/spec.md)): `informational` の伏せ字の例外 (AD-049 Decision 3)・結果待ちと結果不明の印・読み上げ (`TranscriptAnnouncer`)・WebTool・過去ログの system の本文の伏せ字を継承する
- **O-10** ([018](../018-session-answer-ui-and-composer-commands/spec.md)): category `elicitation` の行を継承する
- **O-11** ([019](../019-ui-hooks-tasks-subagents-and-notices/spec.md)): 帰属つきの system のメッセージを主ループの行にする規則 (U-9)・`QUERY_OPTION_KEYS` の集合 (AD-054) を継承する
- **R-3 / R-4** (003 / 004): 過去ログの変換・本文の無害化・markdown の XSS 境界 (AD-034)・File / Image の part を継承する
- **X-9** ([021](../021-session-resume/spec.md)): `QUERY_OPTION_KEYS` の `resume` (AD-059。12 キー) を継承する。本 feature は変えない

## Out of Scope

- `prompt_suggestion` の表示と `promptSuggestions` の option (U-1)
- 巻き戻し (`rewind_files`)・保存したファイルを開く操作 (U-4。AD-049 Decision 6)
- Inline citation (text の `citations`。U-5) とリンクのプレビュー
- 文書の中身の表示 (U-6) と composer の添付
- 照合で足した行のうち、印で足りるブロックの専用の表示 (U-8)
- 知らせの類の右のペインのタブ・`meter` (U-2)
- メモリの本文の表示 (U-3。Claude Code の `/memory` で見られる)
