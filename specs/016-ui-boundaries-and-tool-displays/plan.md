# Implementation Plan: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Branch**: `016-ui-boundaries-and-tool-displays` (2026-10-13 に main (791f72d。O-7 / O-3 / O-4 / O-5 のマージの後) の上に載せ直した) | **Date**: 2026-10-04 (2026-10-13 に spec の載せ直しに合わせて古い参照だけを直した。本文は /cl-plan で作り直す) | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-7 と AD-046 / AD-047 / AD-048 / AD-049 は 2026-10-05 に利用者が承認した。O-7 (PR #13)・O-3 (PR #14)・O-4 (PR #15)・O-5 (PR #17) はマージ済み。承認の無い 3 点は spec の `.needs-input.md` Q1〜Q3。

## Summary

- 会話の境界と知らせ: agents (O-4 の `live-signals.ts` の `onSystem`。最上位の `conversation_reset` は `sdk-agent-session.ts` の switch) で `compact_boundary` / `conversation_reset` / `model_refusal_*` / `informational` を O-2 のシステムイベントの行に。本文は伏せ字を通す。拒否の取り消しは `supersedes` と `retracted_message_uuids` から `meter` の `retraction` で送り、agents の追跡と稼働中のストアの両方から外す。過去ログの divider は境界の表示 (TranscriptBoundary) に写し、過去ログの `system` の本文に伏せ字を当てる
- tool の専用表示: `Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` を `tool-registry.aui.tsx` の完全一致の表 (O-5 の 2 段の 1 段目) に登録。パスは本文。Agent plan を `TextMessagePartProvider` + `MarkdownText` で
- 結果の状態の純関数 (data-model §3) を O-4 の `ToolResultMarks` と O-5 の状態のアイコンの部品に通し、`TranscriptAnnouncer` を足す。ToolFallback の見出しの日本語化
- 項目 16 の禁止に `readFile` を足す (FR-018。残りの 2 つは O-5 が足した)。O-11 に分ける (AD-049)

## Technical Context

- **レイヤ**:
  - domain: `transcript-dto.ts` (category と status の列挙)、`system-event.ts` (終わりの判定)、`secret-redaction.ts` (新設。伏せ字の純関数)、O-4 の `meter.ts` (`MeterUpdate` と `METER_UPDATE_TYPES` に `retraction`)
  - domain (過去ログ): `transcript.ts` (`system` の text の part に伏せ字)
  - agents: `sdk-agent-session.ts` (最上位の `conversation_reset` の分岐、`case 'assistant'` で `emit` の前に `supersedes` の取り消し、`readFile` を `QueryMutationMethod` に、`queryHandle` の型を絞る) / O-4 の `live-signals.ts` (`onSystem` の `compact_boundary` / `model_refusal_*` / `informational`、取り消しの送信。`meter-throttle` を通さない) / `live-tool-results.ts` (`retract`)
  - renderer: `features/session/session-event-decoder.ts` (`retraction` の検証)、`running-session-store.ts` (取り消しと戻さない仕組み・`toolElapsed`) と `running-session-monitor.ts` (`trackDerived` を呼び直す)、`features/chat/convert.ts` (divider の写し)、`components/assistant-ui/elements/` (`transcript-boundary.tsx`・`file-tool.aui.tsx`・`web-tool.aui.tsx`・`task-tool.aui.tsx` と写して変えた File tree を新設、`tool-registry.aui.tsx`・`agent-plan.aui.tsx`・`tool-fallback.aui.tsx` (見出し・状態のアイコンの入力)・`tool-result-marks.tsx` (結果待ち・結果不明の印、`pending` の出所)・`thread.aui.tsx` の `SystemEventRow`)、`features/chat/tool-result-state.ts`・`path-tail.ts`・`TranscriptAnnouncer.tsx` (新設)・`labels.ts`、`features/session/session-view.ts` (`pathTail` を `path-tail.ts` から)
  - scripts / tests: `scripts/constitution/allowlists.mjs` (`QUERY_MUTATION_METHODS` に `readFile`)、`tests/docs/query-mutation-methods.test.ts` (21 → 22)、`tests/rule-fixtures/b-equivalent/` (メソッドごとの fixture と期待表)
- **既存の起点**: research R-01〜R-14。`transcript.ts:207` (過去ログの divider)、`transcript-dto.ts:68-97`、`tool-registry.aui.tsx:30-61`、`live-signals.ts:390-408` (`onStatus`) / `:578-607` (`onSystem`)、`sdk-agent-session.ts:143-175` (`Query` のメソッドの分類) / `:621-688` (メッセージの switch)、`live-tool-results.ts:61-131`、`tool-result-marks.tsx:34-72`、`tool-fallback.aui.tsx:144-213`、`markdown-text.tsx`、`session-view.ts:257` (`pathTail`)、AD-035 D6

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス) | ✅ | tool の入力と結果のパスは会話由来の本文で、解決しない・UNC を判定しない・`path-api` に触れない (AD-025:181 / AD-028 §3 規則 4 の対象の外。範囲の確認)。見出しの末尾は renderer の表示用の純関数 `pathTail` で切り出す (`/` と `\` の両方。ホスト OS で分けない)。切った値を IPC・port に戻さず、本文のパスに操作を付けない (R-08) |
| II (プラットフォーム分岐) | ✅ | 区切りをホスト OS やランタイムで選ばない |
| III / IV / VI / VII / IX / X | ✅ / N/A | 承認の要求と応答の形・SDK の呼び出し・options・プロセス・main を変えない。行は port で main を経由しない。`Query` のメソッドは `interrupt` だけで、項目 16 の禁止に `readFile` を足す (FR-018) |
| V (資格情報非永続) | ✅ | `api_refusal_explanation`・`preserved_*` を通さない。`informational` などの本文は伏せ字 (`redactSecrets`) を通し、伏せ字の前の本文をログに書かない。`WebFetch` の見出しにクエリ・資格情報を出さない |
| VIII (日本語の表示) | ✅ | 見出しは 1 行・80 コードポイントで切り詰め、日本語のファイル名・全角の検索語で崩れない (component テスト) |
| XI | ✅ | 単体・component テストと実機の目視 (quickstart V-3) |
| XII | ✅ | O-6 の行を同じ PR で書き換え、O-11 の Tier A 3 行を D 節に立てる (data-model §5)。O-11 の行を同じ PR で roadmap に足す (FR-015) |
| XIII | ✅ | File tree / Tool call / Web search / Todo list / Day separator を registry で先に確かめる (SH-002)。区切りの element は registry に無いので TranscriptBoundary を作り、File tree は差分の要約なので写して変える (research R-05) |
| XIV | ✅ | 用語を先に glossary に (SH-001) |
| XV (i18n) | ✅ | 文言は `labels.ts` (AD-045 Decision 2。accepted)。`transcript.ts:207` の domain の日本語の label は表示に使わず (renderer は divider を TranscriptBoundary に写し、`labels.ts` の文言を出す)、DTO を変えないので残す |

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)) — transcript の表示、tool 出力の専用表示、`docs/ui-coverage.md`
- session の契約と操作 UI に触れる (U-6): agents の分岐、`meter` の `retraction`、稼働中のストアからの削除。[session charter](../../docs/domains/session/charter.md) に記録する

### Related ADRs

- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — O-11 への分割・取り消し・本文の伏せ字・Agent plan の markdown・tool のパス: **accepted** (本 feature で起こし、2026-10-05 に承認。本文は変えない)
- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — tool の登録の 2 段・`QUERY_MUTATION_METHODS` の拡張・`meter` の上限の例外: **accepted** (O-5。実装済み)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` と行の作り方 (D2 を読み替える): **accepted** (O-4。実装済み)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェル・`watchedId`・右のペインのタブの表: **accepted** (O-7。実装済み)
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言は `labels.ts` に置く: **accepted** (O-3)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件 (D4 / D6 の持ち主を O-11 に): accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — options のキーの pin ((g)。O-11 の義務): accepted
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — §4 P3 (Query のメソッドは interrupt だけ): accepted
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool の表示 (D6 を読み替える。D3 は O-11 の義務): accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 本文の経路: accepted
- [AD-032](../../docs/decisions/0032-unc-shape-classification-by-separator-count.md) / [AD-029](../../docs/decisions/0029-session-cwd-origin-classification.md) — UNC の判定の唯一の入口 (本 feature は当てない): accepted
- [AD-050](../../docs/decisions/0050-gate-finding-handling-and-round-limit.md) — gate の Medium / Low の扱いと round の上限: proposed (本 feature の design-gate がパイロット 2。AGENTS.md の gate の原則に入っている。spec の `.needs-input.md` Q2)

### Glossary excerpt

- **システムイベントの行** (O-2) / **計量 (meter)** (O-4) / **Tool group** / **見ているセッション** (O-7)
- 新しく足す・直す: 会話の境界、取り消し (retraction)、結果待ち / 結果不明、O-11、System event row と Hook の定義

## 上流からの申し送り

```
# 1) spec_id: rg "016-ui-boundaries-and-tool-displays" → 本 spec と AD-049 のほかは 014 data-model:56 の注記だけ
# 2) feature ID: rg "\bO-6\b" → roadmap:380 (O-6 の行) / ui-coverage の 30 行と備考・F 節 / constitution:57 / _overview.md:66,99,101,116 /
#    ui charter:79,220,242,253 / glossary:89,422 / prompts.md:228 / AD-044:19,66,84,103 / AD-046:19,43,48 / AD-050 /
#    011 一式 (spec・plan・research・tasks・data-model・quickstart-results・pr-gate) / 013・014・015 の注記 / 004 data-model:48
# 3) 実名リスト方式のルール: QUERY_MUTATION_METHODS に readFile (FR-018)。新設の element と純関数は既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:380 (O-6 の行) | 対応表の割当・O-2 の pr-gate の項目・V-4 の 4 項目・O-7 のタブの候補・O-4 から | **受ける / 送る** — spec の「義務の扱い」の表が正本 |
| 2 | ui-coverage の `後続: O-6` と F 節・A / B / C 節の備考の「O-6」(O-4 が足した `tool_progress` の備考を含む) | 書き換え | **受ける** — data-model §5 |
| 3 | 011 pr-gate M-201 | Tier A の備考の残り (5 行) を M3 の件数が数えない | **受ける** — 2 行は O-6 で解消、3 行は D 節に `後続: O-11` (data-model §5) |
| 4 | 011 pr-gate po H-001 / a11y L-201 / ux L-101・L-104 | TodoList のエラーのテスト / SystemEventRow の title のテスト / 「SDK が知らない状態」の文言 / matcher のテスト | **受ける** — FE-022 / FE-011。Low の 3 つは **[未承認 — spec の `.needs-input.md` Q2]** |
| 5 | 011 pr-gate a11y L-001 / L-202 | 密度の説明が title だけ / 成功の ✓ のコントラスト | **受ける** — FE-031 **[未承認 — Q2]** |
| 6 | 011 pr-gate ux L-102 / arch L-201 / ux L-103 | 伏せた Hook 名の見分け / session の無害化に触れる後続の domain の依存 / 監視ビューの密度の見出し | **送る** — L-102・L-201 は O-11 (spec の箇条書き)。L-103 は O-7 が完了したので持ち主が無い (Q2 の回答で、system scope に書くか O-2 の gate の出力に残すかを決める) |
| 6a | 011 pr-gate a11y M-003 (roadmap:380) | Hook・task の状態の変化と tool のエラーの読み上げ | **受ける** — data-model §4 (Hook / task の行の終わりを読む) |
| 6b | 本 feature の範囲外 | 拒否の後の編集して再試行 | **送る** — O-10 (roadmap の O-10 の行に書く) |
| 6c | 本 feature の design-gate R2 H-01 | O-5 の MCP resource の URI の要約も最後のパスの要素を出す | **当たらない** — O-5 は最後の要素を秘密の形の検査に通してから出す形で実装した (`mcp-tool-name.ts:170-212`。data-model §2) |
| 7 | 011 quickstart-results V-4 | 利用者の判定と未記録の 4 項目 (2026-10-13 も未記録) | **受ける / 送る** — 本 feature の 2 つは両方に耐える規則、残り 2 つは O-11 |
| 8 | 014 data-model §3 / roadmap の O-6 の行の「O-4 から」 | 圧縮の行と境界の関係を O-6 が決める | **受ける** — 並べる (research R-07) **[未承認 — Q1]** |
| 9 | AD-035 D6 | Agent plan は plain text | **受ける** — AD-049 Decision 4 で読み替える |
| 10 | AD-044 D4 / D6 (B 節の照合・task の一覧の要否は O-6) | 持ち主 | **送る** — O-11。AD-049 に読み替えを書いた (AD-044 の本文は変えない) |
| 11 | ui charter:253 の Open Questions・glossary:89・_overview.md:99 の「実行中の task の一覧の要否は O-6」 | 持ち主 | **送る** — O-11 |
| 12 | constitution:57 | 項目 21 の件数 (O-6 30) | **注記** — 完了の PR で項目 21 の出力が変わる |
| 13 | `transcript.ts:207` | domain が日本語の label を作る | **注記** — 表示には使わない (Constitution Check の XV) |
| 14 | O-7 のタブの候補 (TodoList・Background task) | 右のペインのタブ | **送る** — O-11 (U-1) |
| 15 | O-4 の `ToolResultMarks` (経過時間) / O-5 の状態のアイコンの部品 | 結果の状態と重なる | **受ける** — `toolResultState` を入力にする (data-model §3) |
| 16 | O-5 の `QUERY_MUTATION_METHODS` の拡張 (`backgroundTasks` / `reloadOutputStyles` と集合の固定テスト) | AD-049 Decision 6 の 3 つのうち 2 つは済み | **受ける** — 残りの `readFile` だけを足す (FR-018) |
| 17 | roadmap の O-8 の行の (c) | `receivedMessages` の基準の変化 | **注記** — 本 feature の行は数え、`retraction` は数えない |

## 実装方針

- 行: O-4 の `live-signals.ts` の `onSystem` の switch に 3 つの subtype。`conversation_reset` は最上位の `type` なので `sdk-agent-session.ts` の switch に `case 'conversation_reset'` を足して `live-signals` の関数を呼ぶ (O-5 の `auth_status` と同じ形)。値は `Object.hasOwn` の表で照合する
- 取り消し: `sdk-agent-session.ts` の `case 'assistant'` で、`emit` と `trackAssistant` の前に `supersedes` から `retraction` を送り、`live-tool-results.ts` の `retract` を呼ぶ。`model_refusal_fallback` の `retracted_message_uuids` は `onSystem` で同じ関数に渡す。送信は `live-signals.ts` の `send` (`meter-throttle` を通さない)。renderer は decoder で検証し、ストアの `removeMessages(sessionId, ids)` が外して覚え、`running-session-monitor.ts` の `trackDerived` を呼び直す
- 表示: `tool-registry.aui.tsx` の完全一致の表に 9 つ。`toolResultState` を §3 の表示すべてで使い、O-4 の `ToolResultMarks` の `pending` と O-5 の `ToolFallbackStatusIcon` / `statusWithError` の入力にする。`TranscriptAnnouncer` は見ているセッションの thread の中に 1 つ
- Agent plan: `agent-plan.aui.tsx` の本文を `TextMessagePartProvider` + `MarkdownText` に。「原文」の切り替え

## ADR

**AD-049 は 2026-10-05 に accepted** (本 feature で起こし、承認された)。本文は変えない。Decision 6 の 3 つのメソッドのうち 2 つは O-5 が先に足したので、本 feature は残りの `readFile` を足す (読み替えではなく実施の順の違い)。O-11 の ADR (`includeHookEvents`・`getSubagentMessages`・`get_hooks_listing` を呼ぶなら) は O-11 の design の前に起こす。

## 機械強制の変更

- 項目 16: `QUERY_MUTATION_METHODS` に `readFile`、`sdk-agent-session.ts` の `QueryMutationMethod` に移す (`QueryUnusedReadMethod` から)、`tests/docs/query-mutation-methods.test.ts` の集合を 22 に、メソッドごとの違反の fixture (`readFile` / `backgroundTasks` / `reloadOutputStyles`) と期待表 (FR-018)
- 固定テスト: `METER_UPDATE_TYPES` の集合 (`retraction` を含む 9)、`PermissionRequest` のフィールドの集合、`toPermissionResult` の出力の形、`@assistant-ui/react-markdown` の import が `markdown-text.tsx` だけ、domain の divider の生成が 1 か所
- 単体: `retraction` の検証・`redactSecrets`・tool の振り分け (9 つの tool が ToolFallback に落ちない)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 仮採用した判断 (U-1〜U-7)・AD-046 / AD-047 / AD-048 / AD-049 が覆る | 2026-10-05 に利用者が推奨案どおり承認した。承認の無い 3 点は `.needs-input.md` Q1〜Q3 |
| RK-02 | 取り消したメッセージに結果待ちの tool や承認カードが含まれる | agents の追跡から外し、後の結果を捨てる。ストアも外した id を覚える。承認の要求 (`pending`) は消さず、承認カードは利用者の応答を待つ (自動で解決しない。何の操作かは承認カードの入力で分かる)。拒否のときに承認待ちが残るかは V-3 で記録する。テストで固定 (FE-010) |
| RK-03 | 読み上げが多すぎる / 少なすぎる | 新しく届いた出来事だけ・1 秒に 1 回のまとめ・対象の限定 (data-model §4)。実機の目視で利用者が確かめる (quickstart V-3) |
| RK-04 | `Glob` / `Grep` の結果の形が CLI の版で変わる | 注記の形以外の行を項目にし、0 件なら text に倒す (data-model §2)。全部の行がどこかに見える。V-3 で実際の結果を記録して fixture にする |
| RK-05 | V-4 の未記録の項目が本 feature の前提を崩す | 両方の形に耐える規則 (data-model §3)。残りは O-11 |
| RK-06 | `TextMessagePartProvider` の中で `MarkdownText` が描けない | 実装の最初に確かめる (R-06)。描けなければ U-4 を plain text に戻し、AD-049 Decision 4 を取り下げる (accepted の ADR なので、取り下げは新しい ADR で行う) |
| RK-07 | 伏せ字の取りこぼし | パターンの fixture と、普通の文 (括弧・引用符を含む) が変わらない fixture を両方固定する。漏れの型が見つかれば data-model §1 に足す |
| RK-08 | O-4 / O-5 の実装との重なり (経過時間の印・状態のアイコン・`QUERY_MUTATION_METHODS`) | 2026-10-13 に `tool-result-marks.tsx` / `tool-fallback.aui.tsx` / `allowlists.mjs` / `sdk-agent-session.ts` と突き合わせ、spec / data-model を直した |
| RK-09 | 項目 16 の `readFile` の綴りが、SDK を持つファイル (`AGENT_SDK_IMPORT_DIRECTORIES`) の `fs.readFile(` に当たる | 今の `src/agents` に `.readFile(` は 0 件。将来当たったら fixture の注記に従い、`Query` の値に限る形を項目 16 の持ち主と決める |

## Project Structure

```
docs/decisions/0049-boundaries-retraction-and-o11-split.md   (accepted。変えない)
src/domain/session/transcript-dto.ts / system-event.ts / secret-redaction.ts (新設) / transcript.ts / meter.ts (O-4)
src/agents/sdk-agent-session.ts (+ test) / live-signals.ts (+ test。O-4) / live-tool-results.ts (+ test)
src/renderer/src/features/session/session-event-decoder.ts / running-session-store.ts / running-session-monitor.ts / session-view.ts (pathTail を path-tail.ts から)
src/renderer/src/features/chat/convert.ts / tool-result-state.ts / path-tail.ts / TranscriptAnnouncer.tsx (新設) / labels.ts
src/renderer/src/components/assistant-ui/elements/transcript-boundary.tsx / file-tool.aui.tsx / web-tool.aui.tsx / task-tool.aui.tsx / ファイル一覧 (File tree を写して変える) (新設) / tool-registry.aui.tsx / agent-plan.aui.tsx / tool-fallback.aui.tsx / tool-result-marks.tsx / thread.aui.tsx
scripts/constitution/allowlists.mjs / tests/docs/query-mutation-methods.test.ts / tests/rule-fixtures/b-equivalent/sdk-query-{read-file,background-tasks,reload-output-styles}.ts.fixture (新設) / expected.mjs
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/roadmap.md / docs/prompts.md
specs/014-ui-metering-and-limits/data-model.md (§2 の検証の表) / docs/decisions/0047-session-meter-and-failure-reasons.md (Consequences の参照。AD-048 への参照と同じ節)
```
