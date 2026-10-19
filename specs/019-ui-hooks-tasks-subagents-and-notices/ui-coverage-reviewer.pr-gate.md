# ui-coverage-reviewer Review: Hook・背景の task・実行中の subagent と知らせの類の表示 (O-11 / spec 019)

**Run**: 2026-10-19
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-012 (完了の PR での対応表の書き換え。D 節 3 行は V-1 / V-3 / V-4 が「届いた」の記録を条件に `実装済み` にする)、SC-005 (対応表と項目 21)、FR-013 (許可リストと pin テスト。UC-1 の実装の有無の確認だけに使用)。plan RK-06 / RK-07 / RK-11。
- touched files に該当する charter / Confirmation: `docs/ui-coverage.md` と AD-044 (割当 3 種類、Tier の決め方、M3 の完了の条件)。`docs/roadmap.md` の O-11 / O-12 行 (割当の範囲)。`docs/domains/ui/charter.md` の Out of scope。AD-056 Decision 1 / 4 / 5。`scripts/ui-coverage/coverage.mjs:471-477` (完了行の判定)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲 (本 reviewer は対応表の判断だけ)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。AD-044 / Principle XII の条文の drift は見ていない。本 PR は対応表の行ごとの判断だけを見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:1 Medium:2 Low:0
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (G の自分の範囲について。項目 21 が V-0b で ok、出力に M3 残 3 が出ているので機械で見える。`background_tasks_changed` / 一般の Hook / `getSubagentMessages` の実装は `session-core.ts:75,189` と `read-transcript.ts:71-88` と `BackgroundTasksTab.tsx` で確認でき、UC-1 の「実装済みと書いたが実装が無い」には該当しない。「`実装済み` の element が実在するか」を機械で見る検査は無い。これは本 reviewer の目視の範囲で、既知の限界であり指摘にはしない)

## スコープ要約

PR は O-11 の実装 (一般の Hook・後から背景に移る task・実行中の subagent の入れ子・背景の task のタブ) と、対応表・roadmap の書き換えを含む。`docs/ui-coverage.md` の行の書き換えは次の点で妥当と判断した。

- **SDK の版**: 変更なし (`package.json` / `pnpm-lock.yaml` は diff に無い)。UC-2 は該当なし。
- **A 節**: `background_tasks_changed` を `実装済み: 背景の task のタブ (実行中)` に直した。タブの実装は実在する (`BackgroundTasksTab.tsx:18-77`、`live-signals.ts:704-711`、`running-session-store.ts:230`)。経路 `実行中` も実装と合う。
- **Tier B の `後続: O-11`**: すべて `後続: O-12` に付け替えた。roadmap の O-12 行の範囲 (知らせの類 7 種・Checkpoints・`user/document`・`server_tool_use` / `web_search_tool_result`) と、`後続: O-12` の 11 行 (A 節 6、A' 節 1、B 節 3、`user/document` 1) が一致する (UC-5 は該当なし)。
- **`get_hooks_listing`**: `後続` から `表示不要` に変えた。理由は「設定の一覧は /hooks で見られる (AD-056 Decision 4)」で、Tier B のまま。利用者が見ないと判断を誤る情報ではないので UC-3 は妥当。
- **Tier の変更**: 無い (UC-4 は該当なし)。
- **対象の範囲**: `SDKSessionInfo` などの他 domain の値を行にした形跡は無く、SDK が emit するものを他 domain 扱いで外した形跡も無い (UC-6 は該当なし)。
- **F 節**: Agent handoff を `未使用` (理由: subagent は会話の主導権を渡さない) にしたのは妥当。Background runs は自作の理由が書かれている。

D 節の Tier A 3 行 (general-hooks / late-backgrounded-task / subagent-nesting-live) は `後続: O-11` のまま、備考に「コードは実装済み (019)。V-1 / V-3 / V-4 の記録が『届いた』のときだけ `実装済み`」と書いてある。これは FR-012 の字面どおり。ただし下の H-001 を参照。

## Findings

### [High] O-11 に割り当てた Tier A の `後続` 3 行が、O-11 の完了で自己参照になり、完了の条件の記録 (V-1 / V-3 / V-4) も未記録のまま PR に進もうとしている (H-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:181-183` の D 節 3 行 (general-hooks / late-backgrounded-task / subagent-nesting-live) は Tier A・`後続: O-11` のまま。
  - `specs/019-.../quickstart-results.md:21` の V-0b は、割当先が O-11 の行が 0 にならない (M3 の完了の条件の残り 3) と記録している。`quickstart-results.md:23-25` の V-1〜V-7 は「未実施 (利用者の作業)。完了の PR の条件は V-1 / V-3 / V-4 が『届いた』の記録」。
  - spec FR-012 (`spec.md:218`) と plan RK-06 (`plan.md:281`) は「記録が無い・『届かない』の行は `実装済み` にせず、`後続: O-11` のまま**完了の PR を出さずに**利用者に返す」と書いている。roadmap の O-11 行 (`docs/roadmap.md:384`) も同じ。
  - いま pr-gate に出ている PR はそれ自身が完了の PR (`/cl-done` → マージ後に completed) の手前にある。
  - `scripts/ui-coverage/coverage.mjs:471-477, 623-627` は、roadmap の行の最後の列に `**完了**` が付いた feature への `後続` を違反にする。マージ後に O-11 の行を完了にすると、項目 21 が `後続の ID O-11 は roadmap で完了済み` で落ちる。
- **同種事象探索**: `後続: O-11` を `docs/ui-coverage.md` で Grep した結果は D 節の 3 行 (181 / 182 / 183)。A・C・E 節と F 節には他に `後続: O-11` は無い。F 節の Task card (`ui-coverage.md:344`) は `使い道` の欄で、割当ではない。
- **リスク/影響**:
  - 割当先が自分自身の `後続` の行を持ったまま feature を完了にすると、持ち主のいない延期になる (AD-028 §5)。M3 の完了の条件 (Tier A の `後続` で割当先が M3 の行が 0) が永久に満たされない。
  - 完了のコミットで CI の項目 21 が赤になる (上記の判定ロジック)。
  - 記録を取らないまま完了の PR を出すと、FR-012 / RK-06 の自分で決めた条件を破る。
  - 「コードは実装済み」と備考にあるので、利用者から見ると Tier A の行が表示されているのか不明なまま完了扱いになる (UC-3 / UC-7)。
- **推奨アクション** (どちらか。いずれも本 reviewer の範囲では利用者の判断):
  1. V-1 / V-3 / V-4 を実機で記録し、「届いた」なら 3 行を `実装済み` (経路 `実行中`) にする。そのうえで完了にする。
  2. 記録できないまま O-11 を完了にするなら、完了の PR の前に 3 行を **完了していない別の feature** (たとえば O-12 か新しい feature。roadmap の行に範囲の記述を足す) に付け替える。あるいは、O-11 を `reviewing` のまま完了にせず利用者に返す (FR-012 / RK-06 のとおり)。
  - どちらの場合も `/cl-done` の前に決める。この PR の中では `後続: O-11` のままで項目 21 は通るので、機械の検査は止めない。止まるのは完了のコミットの時点。
- **根拠**: AD-044 Decision 1 (`後続` は完了していない feature に限る) と Decision 3 / Constitution Principle XII / spec FR-012 / plan RK-06 / reviewer UC-7。AD-028 §5。
- **scope 根拠**: `docs/ui-coverage.md` と `quickstart-results.md` は本 PR の touched files。

### [Medium] 過去ログの経路を「両方」に直す確認の持ち主が、O-11 完了後に行から読み取れない (M-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:60-61 付近` と同表の hook_response / task_notification / task_started / task_updated の備考は「実データに残るかは **O-2 quickstart V-4** で確かめ、残れば経路を『両方』に直す」のままで、O-11 の差分でも直っていない (hook_started も同様)。`SDKBackgroundTasksChangedMessage` の行 (`ui-coverage.md:69`) だけは「019 quickstart V-2」と書いてある。
  - 019 の quickstart の V-2 (`quickstart.md:32`) が過去ログの Hook / task の行の確認を持つ。O-12 の roadmap 行の範囲 (`docs/roadmap.md:385`) には、この経路の書き換えが入っていない (入っているのは O-6 / O-10 の行の変換だけ)。
  - 関連して、`SDKTaskUpdatedMessage` の備考「行の状態だけを書き換える (説明の変更は読まない)」は、O-11 が `patch.is_backgrounded` で行を新しく作る (`foreground-tasks.ts:136`) ようにした実装と合わない。
- **同種事象探索**: `O-2 quickstart V-4` を `docs/ui-coverage.md` で Grep した結果は、hook_started・hook_response・task_notification・task_started・task_updated の 5 行。
- **リスク/影響**: V-2 を O-11 が未記録のまま完了にすると、「残れば経路を両方に直す」の持ち主がいなくなる (UC-5。H-001 の選択肢 2 を採ったとき顕在化する)。task_updated の備考は、利用者が行を読んだとき挙動を誤解する程度。
- **推奨アクション**: 5 行の備考の参照先を「019 quickstart V-2」に直す。task_updated の備考に「`patch.is_backgrounded` で背景に移った task の行を作る (O-11)」を足す。V-2 を未記録で完了にするなら、O-12 の roadmap 行の範囲に「過去ログの Hook / task の経路の確認」を足す。
- **根拠**: AD-044 Decision 1 / 割当の持ち主 (AD-028 §5)。reviewer UC-3 / UC-5。
- **scope 根拠**: `docs/ui-coverage.md` と `docs/roadmap.md` が touched files。

### [Medium] D 節の `meter` の行が、O-11 の `background-tasks` と `BackgroundTasksTab` を載せていない (M-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:179` の `meter` の行の割当の element の列は `UsageTab / ContextCostMeter / QuotaBanner / UnsafeModeBanner / OverviewTab / ToolResultMarks / ThinkingIndicator` で、O-11 が `meter` の 10 番目の種類として足した `background-tasks` (`meter.ts:86,128`。A 節 `background_tasks_changed` の行は `meter` の種類 `background-tasks` で運ぶと書く) の描き先 `BackgroundTasksTab` が無い。O-5 の `init-report` / `commands` の描き先 (`InitReportTab`) も同じ行に無いので、前の feature から続く漏れでもある。
- **同種事象探索**: `BackgroundTasksTab` を `docs/ui-coverage.md` で Grep した結果は A 節の `background_tasks_changed` の行 (69) の 1 件のみ。`InitReportTab` は A 節 `SDKSystemMessage` の行 (50) と F 節 MCP server panel (303) の 2 件で、D 節 `meter` の行には無い。
- **リスク/影響**: D 節の行から `meter` の描き先をたどる人が、背景の task のタブにたどり着けない。A 節の行に書いてあるので、利用者への表示が欠けているわけではなく、対応表の追跡可能性の問題に限る。
- **推奨アクション**: `meter` の行の割当に `BackgroundTasksTab` を足し、`background-tasks` を許可リストの運ぶ値の説明に加える (`InitReportTab` も同時に直せる)。
- **根拠**: AD-044 Decision 1 (`実装済み` は表示を担う element を書く)。reviewer UC-1 / UC-3。
- **scope 根拠**: `docs/ui-coverage.md` が touched files。

## 同種事象探索 cascade summary

Critical は 0 件のため cascade 義務は無いが、High / Medium の探索を記録する。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `後続: O-11` (`docs/ui-coverage.md`) | 3 | docs/ui-coverage.md:181, 182, 183 |
| M-001 | `O-2 quickstart V-4` (`docs/ui-coverage.md`) | 5 | docs/ui-coverage.md の A 節 hook_started / hook_response / task_notification / task_started / task_updated の各行 (59, 61, 65, 66, 67) |
| M-002 | `BackgroundTasksTab` / `InitReportTab` (`docs/ui-coverage.md`) | 1 / 2 | docs/ui-coverage.md:69 / 50, 303 (D 節 179 には無い) |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 0

観点別: UC-1 該当なし (対応表の `実装済み` に直した行 (`background_tasks_changed`) は実装がコード上にある。逆に実装が diff にあるが行が直っていないものも、D 節の 3 行を意図的に `後続` に残した点を除き無い)。UC-2 該当なし (SDK の版の変更なし)。UC-3 は M-002 と H-001。UC-4 該当なし (Tier の変更なし)。UC-5 は M-001 (Tier B の `後続: O-12` 11 行は roadmap の O-12 の範囲と一致)。UC-6 該当なし。UC-7 は H-001。
