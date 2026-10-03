# Implementation Plan: ui-coverage 対応表の確立 (O-2)

**Branch**: `011-ui-coverage` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

## Summary

`docs/ui-coverage.md` を作り、SDK の型定義と機械で照合する検査を Constitution 検証の項目 21 に置く。あわせて、実行中のセッションで捨てている tool の結果と Hook / Background task を transcript に出し、transcript の情報密度と直近の活動の整形を足す。

- 対応表は 6 節 (メッセージ型 / 中身のブロック / tool / アプリが作る経路 / 制御要求 / element の分類)。A・C・E 節は SDK の型定義の名前の集合と一致することを機械で確かめる (research R-01 / R-02)。形は [data-model.md](./data-model.md) §1 が正本
- 実行中の tool の結果は、`SessionEvent` の種類を増やさず、agents が結果を埋めた assistant メッセージを同じ id で送り直す (R-03)
- Hook / Background task は `TranscriptPartDTO` の新しい variant `event` にし、1 つの Hook / task を 1 行に保つ (R-04)。実行中と過去ログで同じ純関数を使う
- transcript の密度 (R-06)、直近の活動の tool ごとの要点 (R-07)、Subagent の `Agent` / `Task` (R-05)
- `ui-coverage-reviewer` を組み込み (R-09)、Constitution XII / XIII を PATCH し (R-10)、roadmap に O-4 / O-5 / O-6 を足す (R-11)

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / assistant-ui / `@anthropic-ai/claude-agent-sdk` 0.3.270 ([docs/discovery.md](../../docs/discovery.md))
- **レイヤ**:
  - domain (`src/domain/session/`): `transcript-dto.ts` (event の variant)、`system-event.ts` (新設。Hook / task → DTO の純関数)、`tool-result.ts` (新設。tool の結果の取り出しと `withToolResult`。`transcript.ts` から共通部分を移す)、`live-message.ts` (`redacted_thinking`)
  - agents (`src/agents/sdk-agent-session.ts`): メッセージの switch に `user` の tool_result と system の Hook / task の分岐を足す。結果待ちの対応 (data-model §3)
  - renderer: decoder (`session-event-decoder.ts` と過去ログの frame の decoder) が `event` の part を受ける、`convert.ts` が `event` を data part に写す、`thread.aui.tsx` がシステムイベントの行と密度を描く、`tool-registry.aui.tsx` / `tool-args.ts` (`Agent`)、`stores/ui` (密度)、`session-view.ts` (要点)
  - scripts: `scripts/ui-coverage/coverage.mjs` (新設)、`scripts/constitution/check.mjs` (項目 21)
- **既存の起点** (2026-10-03 の調べ):
  - `sdk-agent-session.ts:509-543` — SDK のメッセージの switch。`assistant` → `message`、`result` → `state` / `failure`、`system` は `permission_denied` だけを見て他を捨てる、`user` などは `default:` で捨てる (AD-020 / H-06 の注記)
  - `live-message.ts:57` — 実行中の tool-call は常に `result: null`。`:65-67` で `redacted_thinking` などを捨てる
  - `transcript.ts:132-137,190-192` — 過去ログの compact_boundary を divider に。`:230-252` — tool_result を id で対にする。`:263-270` — 知らないブロックを捨て、part が 0 のメッセージを落とす (Hook / task のシステムメッセージは今ここで消える)
  - `running-session-store.ts:246-264` — `message` を id で upsert する
  - `tool-registry.aui.tsx:22-30` — `Task` に Subagent。`tool-group.aui.tsx:49` — `defaultOpen = false`。`thread.aui.tsx:685-697` — Tool group を `defaultOpen` なしで描く
  - `scripts/constitution/check.mjs` — 項目 1〜20。`violations(id, title, principle, found, note)` の形 (`:1277`)

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス名前空間) | ✅ | パスを解決しない。直近の活動のファイル名は表示用の文字列の末尾を取るだけ (data-model §4) |
| II (プラットフォーム差を infra に閉じる) | N/A | infra を変えない |
| III (権限ゲート) | N/A | 権限モードと承認の経路を変えない |
| IV (SDK 経由) | ✅ | SDK の新しい呼び出しを足さない (`AGENT_SDK_ALLOWED_CALLS` の変更なし)。既に受けているメッセージの分岐を足すだけ |
| V (資格情報非永続) | ✅ | 新しい永続化なし (密度も保存しない)。Hook の出力本文・task の prompt / summary を通さない (data-model §2)。`Bash` の環境変数の代入を直近の活動に出さない (§4) |
| VI (永続環境を構築しない) | N/A | 子プロセスを足さない |
| VII (supervisor Electron 非依存) | ✅ | agents の変更は `sdk-agent-session.ts` の中の純粋な分岐と domain の純関数だけ。Electron を import しない |
| IX (main をブロックしない) | ✅ | 本文は port を通り main を経由しない (AD-034 / AD-043)。main は変えない |
| X (正本は Claude Code) | ✅ | 表示は SDK のメッセージから導くだけ。transcript を書き換えない |
| XI (観測可能な垂直スライス) | ✅ | tool の結果と Hook / task の行は component テストと実機の目視 (quickstart V-4) で観測できる |
| XII (ui-coverage) | ✅ | 本 feature が対応表と検査を作る。本 feature 自身が足す表示 (tool の結果・event の行) は対応表の行として同じ PR に入る |
| XIII (element 優先) | ✅ | システムイベントの行と密度の切り替えの候補を registry で照合する (research R-06 / tasks)。独自のトークンを足さない |
| XIV (glossary) | ✅ | 用語 (割当の 3 種類、transcript の情報密度、システムイベントの行) を glossary に先に足す |
| XV (Multi-language) | ✅ | 新しい文言 (event の状態の訳、密度) は `labels.ts` に置く |

Constitution 自体の変更: XII / XIII の PATCH (v1.2.10。research R-10。利用者の決定 2026-10-03)。

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装 (Tier A 必須、Tier B は体験向上)、transcript の表示、tool 出力の専用表示、`docs/ui-coverage.md` の維持、transcript の情報密度 (O-2)。セッションの起動ロジックと状態遷移は session (本 domain は表示する)
- 業務ルール: emit される情報に未表示のものを残さない (対応表に未割当がある間 UI 系 feature を completed にしない)。assistant-ui の design system に乗る

### Related ADRs

- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の実在確認: accepted — Tier A 35 は実在。Tier B / C の 59 要素の再棚卸しは O-2
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — SDK のメッセージ型: accepted — `SDKMessage` は 39 型。対応表の行は型定義から機械的に導く。Hook / Background task の持ち主は未決 (本 feature が答える)
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の取得経路: accepted — 本文は port で直通し main を経由しない。DTO は domain
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool 表示: accepted — Tool group は既定で閉 (既定 open 化の要否は O-1 → O-2 に)
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — supervisor とセッションスレッド: accepted — 本文はセッションスレッドが文字列化し、調停役は中継するだけ
- [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5 — 持ち主のいない延期を残さない

### Glossary excerpt

- **ui-coverage 対応表**: `docs/ui-coverage.md`。SDK のメッセージ型・tool 名・システムイベントと表示実装の対応表。未割当行がある間、UI 系 feature を completed にしない
- **Tier A / B / C**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、B は体験を押し上げるもの、C は対象外
- **Density (情報密度)**: O-1 では監視ビューの行の密度。transcript の密度は O-2 (glossary の Counterexample)
- **TranscriptView**: 選んだセッションの過去メッセージを assistant-ui で仮想化描画する画面状態

## 上流からの申し送り

```
# 1) spec_id
grep -rn "011-ui-coverage" docs/ .specify/ tests/ specs/ (specs/011 を除く)
# → 0 件 (新しい ID)
# 2) feature ID と成果物名
Grep "011-ui-coverage|\bO-2\b|ui-coverage" (docs / .specify / tests / specs / scripts / eslint.config.mjs / .dependency-cruiser.js。node_modules を除く)
# → 210 件 / 61 ファイル。specs/011 の 19 件と src の 7 件・PLAN.md の 4 件を除く 180 件 / 53 ファイルを下表に割り当てる (src と PLAN.md の該当も処理した)
# 3) 実名リスト方式のルール
# eslint.config.mjs / .dependency-cruiser.js / scripts/constitution/allowlists.mjs に O-2 の名指しは 0 件。
# 新設の scripts/ui-coverage/ は check.mjs の SCAN_ROOTS (`src`, `scripts`) の内側。新設の domain モジュールは既存のレイヤ規則に入る
```

| # | 出所 | 申し送り | 処理 |
|---|---|---|---|
| 1 | roadmap:29、prompts.md:54・:227-236、discovery.md:392・:490、reviewers.yml:101 | P-4: ui-coverage-reviewer を O-2 で追加 | FR-006 / R-09。prompts.md:234 の「Tier A が未実装のまま completed にしない」は、後続 feature の ID を割当とみなす決定 (FR-016) の下では「Tier A の行が `後続` の割当を持つか」に読み替え、reviewer の観点に入れる。PLAN.md §12 の「機械検証」は FR-003 の検査が持つ |
| 2 | roadmap:250・:253、_overview:61・:81、PLAN.md:697 | O-2 の行 (39 型・Tier B/C・O-1 の義務 4 件)、題の「Tier A 完全化」 | FR-001〜005、FR-008〜014。題は FR-015 で直す (R-11) |
| 3 | roadmap:255-258、005 plan:163・tasks:42・spec:486 | X-1 の承認カードと聞かれずに拒否された操作 | FR-001 (D 節・A 節) / US-1 AC4 |
| 4 | prompts.md:219-223 | 元の O-2 のプロンプトの 8 つの表示と CI のスクリプト | CI: FR-003 (項目 21)。表示: 利用者の決定で後続に。Permission grant → I-3、Cost meter / Quota banner / Context display → O-4、Elicitation form / Server panel → O-5、Checkpoints / Web search → O-6 (FR-004) |
| 5 | roadmap:97、AD-035 D6 | Agent plan の markdown | C 節の `ExitPlanModeInput` の行の備考 + `後続: O-6` |
| 6 | roadmap:160 | 直近の活動の不可視文字の残り (候補は O-2 の義務 (4)) | 持ち主は変えない (spec Out of Scope)。FR-014 の整形で入力の大半を出さなくなったことを roadmap に書き足す (R-11) |
| 7 | roadmap:161-168、010 tasks:34・:125、010 convention-reviewer.code-gate:43・:92 | store / 一覧の切り出しと型の移動 (「O-2 の前」) | 利用者の決定で持ち主を付け替える (FR-015 / R-11) |
| 8 | ui charter:41・:42・:109・:117・:135・:174・:180-186・:194 | 対応表の維持、transcript の密度、KPI の計測経路、Related Specs、Open Questions (Tier B/C、§4.2、Hook / BG、Tier C の転用) | FR-005 / FR-012 / FR-015。Tier C の転用 (:194) は F 節で答え、MCP の結果の表示は O-5 |
| 9 | _overview:88-89、session charter:219-220、010 spec:50・:220-221・:239・:272、010 plan:51・:69・:104-107 | Hook / Background task の表示の割当と状態の持ち主 | FR-008 / FR-009。持ち主は不要 (状態を保持しない)。_overview と session charter に記録 (FR-015) |
| 10 | 010 spec:274・research:15、010 security design-gate L-003 | tool ごとの整形、入力の先頭の秘密 | FR-014 / data-model §4 |
| 11 | 010 spec:278・plan:72・:108、AD-035:93-97 | Tool group の既定 open 化 | FR-012 / R-06 (comfortable で開く) |
| 12 | glossary:192・:857-862 | transcript の密度、対応表の定義 | FR-015 (SH の最初のタスク) |
| 13 | AD-019:64-74・:86・:93-97 | Tier B/C の 59 要素、他の一次概念の element | FR-005 / R-08。59 の一覧は残っていないので registry から引き直す |
| 14 | AD-020:88-99・:129-133 | 機械で導く、SDK のバージョン、control 経路を分母に、表示不要の欄、Hook / BG の持ち主 | FR-001〜003 / R-01 (E 節に control_request。約 70 の内訳を備考に) |
| 15 | AD-020:130-131 | `SDKPartialAssistantMessage` を使うか | A 節の行。X-1 の決定 (005 spec:458。メッセージ単位で更新し、部分メッセージは要求しない) を割当の理由に書く (表示不要) |
| 16 | AD-035:54-57・:94 | `getSubagentMessages` による入れ子の完全化 (持ち主なし) | C 節の `AgentInput` の行の備考 + `後続: O-6` |
| 17 | constitution:717・:721-733・:755・:763、plan-template:61 | XII の検証の記述、XIII の「59」「143」 | FR-016 / R-10 |
| 18 | 002 plan:159-164・data-model:128-129・:171-173・tasks:232、`SessionListScreen.tsx:370` | `SDKSessionInfo` の 10 フィールドの表示先 (先行資料) | 行にしない (ui charter Out of scope)。理由を対応表の冒頭に書く (R-01) |
| 19 | 003 spec:131・:206・:276、003 plan:18・:40・:157-163・:176・:423、003 data-model:72-89 | 未定義の tool・ブロックの専用表示、compact_boundary の専用 element、先行の台帳 | B 節 / A 節の行。compact_boundary の専用 element は `後続: O-6`。003 の台帳は対応表の入力として参照 (FR-015 で 003 data-model §3 に参照を足す) |
| 20 | `transcript.ts:189`、`transcript-dto.ts:43`、`convert.ts:75`、`thread.aui.tsx:828` | コードの注記「専用 element は O-2」 | 注記を「対応表 A 節 / O-6」に直す (tasks) |
| 21 | `convert.ts:72`、004 plan:264-267・spec:288-290・tasks:100・data-model:74 | `file` part の専用 element | B 節の `user/document` の行。`後続: O-6` |
| 22 | `live-message.ts:34`・`:65-67` | 実行中の経路が知らないブロックを捨てる | B 節に行。`redacted_thinking` は FR-007 で Reasoning にそろえる。`server_tool_use` / `web_search_tool_result` は `後続: O-6` |
| 23 | 004 spec:49-52・:87・:191・:221・:287、004 plan (13 か所)、004 data-model:29・:48・:66-75・:131、004 quickstart:24 | Read / Glob / Grep の File tree、WebSearch / WebFetch、MCP、承認カード、fallback の台帳 | C 節の行。Tier の決め方 (FR-002) に従い、Tier A は `後続`、Tier B / C は `実装済み: ToolFallback`。File tree → O-6、MCP → O-5 |
| 24 | 004 spec:293-295 | subagent の深さの打ち切り | 実装済み。`AgentInput` の行の備考に書く |
| 25 | discovery.md:400・:479・:482・:560 | `ui-coverage.md` の不在 | FR-015 / R-12 で現在の状態に直す |
| 26 | verify-report.md:172・:295 | XII の reviewer 未配置 | 日付の付いた報告なので変えない (R-12) |
| 27 | 006 spec:408・plan:94・:166、009 plan:59、001 plan:122、002 architecture-reviewer:194-241、002 convention-reviewer:671 | 対応表の完成は O-2 (言及)、grep が空振りする指摘、`formatTime` の集約 | 言及は FR-001 / FR-003 で解消。`formatTime` の集約は対応表の行ではない (他 domain の一覧) ので対象外 |
| 28 | gate の出力 (003 / 004 / 010 の design-gate・reviewer の raw など 25 件) | 上の各項目と同じ内容 | 上の行で処理済み (固有の義務は無い) |

## 実装方針

### 対応表と検査 (US-1)

- `scripts/ui-coverage/coverage.mjs` (research R-02): `parseSdkMessageUnion(dts)` / `parseToolInputs(toolsDts)` / `parseControlRequestSubtypes(dts)` / `parseCoverage(markdown)` / `parseRoadmapIds(markdown)` / `checkCoverage({...})` → 失敗の配列 `{ section, id, reason }`
- `check.mjs` の項目 21 は、`node_modules/@anthropic-ai/claude-agent-sdk/{sdk.d.ts,sdk-tools.d.ts,package.json}`・`docs/ui-coverage.md`・`docs/roadmap.md` を読んで `checkCoverage` に渡す。SDK が入っていなければ「検査対象なし」(pending)
- `tests/ui-coverage/coverage.test.ts`: 失敗の条件 5 つ (行の欠け / 余分な行 / 割当が 3 種類でない / roadmap に無い ID / 版の違い) と、ToolFallback だけの Tier A の行、をそれぞれ文字列の fixture で落とす (SC-002)。現在の SDK と対応表で通ることは項目 21 自体が見る
- `docs/ui-coverage.md` を書く。A・C・E 節の行は parse 関数の出力から起こし、割当は人が書く (data-model §1)

### 実行中の tool の結果と Hook / task (US-2)

- domain: `tool-result.ts` (新設) に結果の取り出し (`transcript.ts:230-252` から移す) と `withToolResult`。`system-event.ts` (新設) に `toSystemEventMessage(msg): TranscriptMessageDTO | null` (data-model §2)。`transcript.ts` は過去ログで同じ関数を使い、同じ id の後続を最初の行にまとめる
- agents: `sdk-agent-session.ts` の switch に `user` (tool_result のブロックだけを見る。本文は renderer に送らない) と `system` の Hook / task の分岐。結果待ちの対応は data-model §3
- renderer: decoder が `event` の part を検証する (`category` / `status` は列挙、`name` / `detail` は文字列)。`convert.ts` は `event` を data part (`name: 'system-event'`) に写す。`thread.aui.tsx` の data part の分岐で、システムイベントの行を描く (アイコン + 状態の文言 + 名前。テキストノードだけ)。行の element は registry の候補を照合して決める (tasks の最初で記録)
- Subagent: `tool-registry.aui.tsx` に `Agent`、`tool-args.ts` の parse を `AgentInput` の形にも当てる

### transcript の情報密度 (US-3)

- `stores/ui` に `transcriptDensity`。`thread.aui.tsx` は context で受け、Tool group を `key={density}`・`defaultOpen={density === 'comfortable'}`、compact では Reasoning の `defaultOpen` を false、`data-density` で間隔を変える
- 切り替えは `SessionScreen` のペインのヘッダと `ChatScreen` のヘッダ (同じ部品。`Button` + `aria-pressed`)

### 直近の活動 (US-4)

- `session-view.ts` に `summarizeToolInput` (data-model §4)。`deriveActivity` の tool の分岐と承認待ちの分岐で使う。`toActivityLine` を通す

### 記録の追随と Constitution

- glossary (最初): ui-coverage 対応表 (割当の 3 種類)、transcript の情報密度、システムイベントの行
- ui charter / session charter / `_overview.md` / roadmap (O-2 の行・O-4〜O-6・P-4・付け替え) / prompts.md / discovery.md / PLAN.md §4.2 の注記 / 003・004 の data-model §3 から対応表への参照 / コードの注記 (#20)
- Constitution v1.2.10 (R-10)、plan-template の XII の行
- reviewer の組み込み (R-09)

## ADR

**起票しない。** 対応表の形と割当の読み方は Constitution XII (PATCH) と data-model §1 が正本になる。`event` の part は AD-034 の DTO の variant を足すだけで、取得経路・プロセス境界の決定を変えない。tool の結果を同じ id で送り直すのは、X-1 の「メッセージ単位で更新する」(live-message.ts の注記) の範囲である。AD-019 / AD-020 / AD-035 の Open Questions と Trade-off への回答は roadmap・charter・対応表に記録し、accepted の本文は変えない。

## 機械強制の変更

- `check.mjs` 項目 21 (新設。Principle XII)。項目の数が 20 → 21 になるので、`docs/discovery.md` の「20 項目」の記述と、`scripts/rules` の期待表が項目の数を持つならそれを直す (tasks で確かめる)
- `TRANSCRIPT_PART_FIELDS` に `event` (SC-009 の台帳の検査が自動で効く)
- reviewers.yml / registry / gate の候補の一覧 (R-09)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 過去ログに Hook / task のシステムメッセージが残らない | fixture のテストは作る。実データで確かめ (quickstart V-4)、残らなければ対応表の経路を「実行中のみ」と書く |
| RK-02 | 同じ assistant メッセージを結果の数だけ送り直して、renderer の負荷が上がる | 送り直しは本文の上限の範囲。X-5 の負荷 E2E (multi-session) を流して閾値を確かめる。結果待ちの上限 256 |
| RK-03 | SDK の `.d.ts` の書き方が変わり、parse 関数が型を取りこぼす | parse の結果が 0 件や極端に少ないときは失敗にする (空振りで通さない)。単体テストに実ファイルの抜粋の fixture |
| RK-04 | 実行時の subagent の tool 名が `Agent` か `Task` か分からない | 両方を当てる (R-05)。実データで確かめる (quickstart V-4) |
| RK-05 | `/cl-add-reviewer` の生成物が gate の候補の一覧を直さない | R-09 の手順で手で直し、`reviewers_filter` の出力で確かめる (SC-007) |
| RK-06 | element の registry の取得 (R-08) にネットワークが要る | 取得できないときは AD-019 の 202 と PLAN.md の名前で分類し、未確認として記録する |

## Project Structure

```
docs/ui-coverage.md                                  (新設)
scripts/ui-coverage/coverage.mjs                     (新設)
scripts/constitution/check.mjs                       (項目 21)
tests/ui-coverage/coverage.test.ts                   (新設)
src/domain/session/transcript-dto.ts                 (event の variant)
src/domain/session/system-event.ts (+ .test.ts)      (新設)
src/domain/session/tool-result.ts (+ .test.ts)       (新設。transcript.ts から移す)
src/domain/session/transcript.ts / live-message.ts
src/agents/sdk-agent-session.ts (+ test)
src/renderer/src/features/session/session-event-decoder.ts / session-view.ts / labels.ts
src/renderer/src/features/chat/convert.ts / tool-args.ts / ChatScreen.tsx (密度の切り替え)
src/renderer/src/features/session/SessionScreen.tsx (密度の切り替え)
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx / tool-registry.aui.tsx
src/renderer/src/stores/ui.ts
.claude/agents/ui-coverage-reviewer.md               (/cl-add-reviewer)
.specify/spec-gate/reviewers.yml / .specify/.agents-registry.yaml / .claude/skills/cl-{code,pr}-gate/SKILL.md / .claude/agents/reviewer-base.md
.specify/memory/constitution.md / .specify/templates/plan-template.md
docs/glossary.md / docs/roadmap.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/prompts.md / docs/discovery.md / PLAN.md
```
