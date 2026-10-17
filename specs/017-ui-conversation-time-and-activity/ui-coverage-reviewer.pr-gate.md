# ui-coverage-reviewer Review: 会話の時間と活動の可視化 (O-9 / 017)

**Run**: 2026-10-17
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-006 / FR-007 (時刻と所要時間を中央の本体に出す)、FR-008〜FR-013 (地図のタブと活動の帯)、FR-014 (対応表の更新)、FR-015 / FR-016 (AD-051 と記録)、SC-006 (項目 21 と F 節の割当先が O-9 の行が 0)。
- touched files に該当する charter / Confirmation: `docs/ui-coverage.md`、`docs/domains/ui/charter.md:79-86` (シェルの部品が SDK の emit を表示するときはその行の割当に部品を書く)、AD-044 Decision 1〜4、AD-051 Confirmation (SDK を上げる PR で過去ログの時刻を確かめる)、Constitution XII / XIII。
- A. 認可 / 認証 / secret 管理: 該当なし: ui-coverage-reviewer の owner 外。
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner 外 (security)。
- C. 業務不変条件 / Charter drift: 該当なし: owner 外 (architecture)。
- D. Constitution / ADR drift: 該当なし: owner 外 (architecture)。
- E. User Story / SC / AC / UX: 該当なし: owner 外 (po / ux)。
- F. 命名 / module / lint hookup: 該当なし: owner 外 (convention)。
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:1 Medium:1 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。
  - 割当が `実装済み` の element は存在し、テストもある (`MessageTimeLabel.test.tsx`、`ConversationMapTab.test.tsx`、`turns.test.ts`、`activity-bins.test.ts`、`panel-tabs.test.ts`)。
  - 項目 21 は quickstart-results V-1 で ok (F 128 行、`後続` の割当先に O-9 なし)。
  - H-001 (下記) は機械照合の対象外で、これを検出するテストは無い。判断が要る部分なので reviewer が拾う領域である。

## スコープ要約

O-9 は、メッセージの時刻 (`createdAt`) を過去ログ・実行中の変換で埋める。中央の本体に時刻と所要時間を出し、右のペインに「会話の地図」のタブ (ターンの行と活動の帯) を足す。対応表では次を変えている。
- A 節の `SDKAssistantMessage` / `SDKUserMessage` の割当に `MessageTimeLabel` / `ConversationMapTab` を追記。
- F 節の Message timing / Heat graph を使い道ありに、Activity graph / Trace waterfall を `未使用` と理由に。
- F 節に `Conversation map` を新設 (128 行)。
- 「SDK を上げたときの手順」に 4 を追加。

SDK の版は変わらない (`package.json` / `pnpm-lock.yaml` は diff 外)。`後続` の行の追加・変更はない。

観察事実:
- `docs/ui-coverage.md` の `後続` の行の割当先は O-10 / O-11 / X-6 / I-3 のみで、O-9 は 0 件。
- 128 行は F 節の表の行数 (236〜363 行) と一致する。
- SDK 0.3.270 の `sdk.mjs:134` は返りの記録に `timestamp:e.timestamp` を含める。AD-051 の前提は実在する。
- `thread.aui.tsx` の `AssistantMessage` / `UserMessage` に `MessageTimeLabel` が置かれている。
- `panel-tabs.ts` に `conversation-map` のタブがあり、`CenterPane.tsx` の `RunningCenter` / `PastCenter` の両方に `ConversationTimeProvider` がある。したがって A 節の経路「両方」は実装と合う。

各観点の結果:
- UC-1: 指摘 H-001 あり。
- UC-2: 該当なし。SDK の版を上げていない。
- UC-3: 指摘 M-001 あり。
- UC-4: 該当なし。Tier を下げた行はない。新設の `Conversation map` と、使い道を付けた Message timing / Heat graph はいずれも Tier B のまま (元の Tier B を維持)。ToolFallback のために Tier を動かした形跡もない。
- UC-5: 指摘 L-001 あり。
- UC-6: 該当なし。`SDKSessionInfo` など他 domain の値を行にしておらず、行から外した SDK の emit もない。
- UC-7: 該当なし。spec は `status: reviewing` で、`後続` の割当先に O-9 は 0 件。M3 の完了の主張は PR にない。

## Findings

### [High] 地図のタブが O-6 の境界・拒否の印と tool / エラーの数を出すのに、元の行の割当に ConversationMapTab が書かれていない (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/turns.ts:17` の `TURN_MARK_CATEGORIES = ['compact-boundary', 'conversation-reset', 'refusal']` が、`ConversationMapTab.tsx:380-413` の `TurnRow` で行の印として描かれる。
  - 同じ行に tool の呼び出しの数 (`toolCount`) とエラーの数 (`errorCount`) も出る。これは assistant の `tool_use` と user の `tool_result` から導出した表示である。
  - ところが `docs/ui-coverage.md` で `ConversationMapTab` が出るのは A 節の `SDKAssistantMessage` / `SDKUserMessage` (46・47 行) と F 節 (268・289 行) だけである。
  - 次の行の割当と備考は地図に触れていない。
    - A 節: `SDKCompactBoundaryMessage` (52 行。TranscriptBoundary)、`SDKConversationResetMessage` (84 行)、`SDKModelRefusalFallbackMessage` (56 行)、`SDKModelRefusalNoFallbackMessage` (57 行)。
    - B 節: `assistant/tool_use` (106 行)、`user/tool_result` (110 行)。
  - 一方 `docs/domains/ui/charter.md:84-86` は「シェルの部品 (中央のヘッダ・右のペインのタブ) が SDK の emit …を表示するときは、その行の割当にその部品を書き、表示を変える PR で対応表を直す」と定める。`docs/ui-coverage.md` の凡例も同じ趣旨である (pr-gate R1 ui-coverage M-002 の前例)。
  - 境界 3 種は Tier A (セッションの境界) の行で、地図は新しい表示面である。
- **同種事象探索**: `Grep "ConversationMapTab" docs/ui-coverage.md` で 4 件 (46・47・268・289)。境界・拒否の 4 行と B 節の 2 行には 0 件。
- **リスク/影響**:
  - 対応表は「どの SDK の emit がどこに出るか」の正本である。次にその行を触る feature (O-10 の「編集して再試行」、O-11 の過去ログの変換) が、地図の印を持つ面があることに気付かず壊しうる。
  - 項目 21 は割当の書式しか見ないので機械では落ちない。判断の誤りとして reviewer だけが拾える。
- **推奨アクション**:
  - A 節の 52・56・57・84 行の割当に `ConversationMapTab` を足す。例: `実装済み: TranscriptBoundary / ConversationMapTab (両方)`。
  - 経路は実際の出方に合わせる。境界は実行中と過去ログ、拒否と会話の作り直しは実行中。
  - 備考に「O-9: 地図の行の印 (ターンごと)」と書く。
  - B 節の `assistant/tool_use` / `user/tool_result` の備考に「O-9: 地図の行の tool の数とエラーの数」を足す。
- **根拠**: ui charter:84-86、Principle XII の Manual (表示を足す PR に対応表の更新が含まれるか)、`docs/ui-coverage.md` 凡例。
- **scope 根拠**: `docs/ui-coverage.md` は本 PR の touched files で、直接直せる。

### [Medium] Message timing の standalone 版を「形と合わない」として不採用にした理由が、research R-10 の読みと矛盾し、不採用の条件にも無い理由が混じっている (M-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:311` の備考は、`elements-message-timing` を「文言が英語の直書きで、メッセージの時刻と所要時間を出す形と合わない」として不採用にしている。
  - 一方 `specs/017-ui-conversation-time-and-activity/research.md:116` は同じ element を「第 1 候補。`stats: TimingStat[]` に時刻と『所要 m:ss』を渡せる形」と読み、「実装の最初に取り込んで確かめる」としていた。
  - `tasks.md` の SH-002 が定める不採用・作り替えの条件 (CSP / 外部取得 / 意味が違う / 独自カラートークン / 新しい npm 依存) に英語の直書きは含まれない。
  - O-3 / O-4 の前例 (Command palette、Conversation search、Thinking indicator) は、英語の文言を文言の表に差し替えて取り込んでいる。
  - `quickstart-results.md:23` は「element は取り込まず自作」とだけ書く。取り込んで試したか、読んだだけかが残っていない。
  - Heat graph の「日単位の `DataPoint` が前提」(F 節 289 行) も、research R-10:117 の「実装の最初に取り込んで確かめる」の結果が記録されていない。
- **同種事象探索**: `Grep "elements-message-timing|heat-graph" specs/017-*/` で、取り込んで試した記録は 0 件 (計画・調査・手順書の記述のみ)。
- **リスク/影響**: Tier B の自作の根拠が「読んだだけ」だと、Principle XIII の Exceptions (候補を実名で照合したうえで不適合) の要件を満たしたか判定できない。次に registry を見直すとき、対応表の備考が根拠にならない。
- **推奨アクション**: PR の説明に、取り込んで確かめた結果か「読んだだけ」であることと、不採用の実際の理由を書く。備考は R-10 の読みと合わせ、事実のとおりの理由に直す。
- **根拠**: Principle XIII の Exceptions、AD-044 Decision 2、O-3 / O-4 の前例の備考。
- **scope 根拠**: F 節の備考は本 PR の touched files。

### [Low] Trace waterfall の「再検討は O-11 の入れ子の後」が、O-11 の roadmap の行の範囲に無い (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:363` に「再検討は O-11 の入れ子の後」とあるが、`docs/roadmap.md` の O-11 の行の「範囲」に Trace waterfall が無い。
- **同種事象探索**: `Grep "Trace waterfall" docs/roadmap.md` で O-9 の行以外に 0 件。
- **リスク/影響**: 持ち主の feature が自分の担当と気付けない再検討の約束になる (AD-028 §5)。Tier B の任意の再検討なので Low。
- **推奨アクション**: roadmap の O-11 の行に一言足すか、備考から O-11 の語を外して条件で書く。
- **根拠**: AD-028 §5、AD-044 Consequences。

### [Low] 対応表の「確認日」と Constitution XIII の element 数が 128 に追随していない (L-002) (scope: system)

- **観察**: `docs/ui-coverage.md:7` の「確認日: 2026-10-03」のまま、F 節の見出しだけ 128。`.specify/memory/constitution.md:833` と `:842` は「127 の element」のまま。
- **同種事象探索**: `Grep "127" .specify/memory/constitution.md` で 3 件。
- **推奨アクション**: 確認日を更新。Constitution の 127 は次の改定で 128 へ (本 PR では直さなくてよい)。
- **根拠**: Principle XIII の Exceptions。

### [Low] Principle XIII が要求する PR の説明の照合の結果が、F 節の備考の「正本」として参照されているが未記述 (L-003) (scope: feature)

- **観察**: F 節の備考は「正本は O-9 の PR の説明」と書く。`quickstart-results.md:24` は「未了: PR の説明に照合の結果を書く」。
- **推奨アクション**: `/cl-done` で PR の説明に research R-10 の表を写す。
- **根拠**: Principle XIII の Verification (Manual)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `ConversationMapTab` in `docs/ui-coverage.md` | 4 (境界・拒否の 4 行と B 節の 2 行には 0) | `docs/ui-coverage.md:46,47,268,289` |
| M-001 | `elements-message-timing\|heat-graph` (取り込んで試した記録) | 0 | `specs/017-ui-conversation-time-and-activity/quickstart-results.md:23` |
| L-001 | `Trace waterfall` in `docs/roadmap.md` | O-9 の行以外 0 | `docs/ui-coverage.md:363` |
| L-002 | `127` in `.specify/memory/constitution.md` | 3 | `.specify/memory/constitution.md:833,842` ほか |
| L-003 | `PR の説明` in `quickstart-results.md` | 1 | `quickstart-results.md:24` |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 3
