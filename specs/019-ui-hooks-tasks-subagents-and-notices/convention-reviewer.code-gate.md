# convention-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: convention-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: code-gate iter 2

## 初回読了 viewpoint

- FR/SC: FR-006 / SC-002 (背景の task の一覧とタブ)、US-2 AC3〜AC4 (起動で一覧は空から始まる)。今回の diff はこの 1 点だけ。
  - 変更内容: `EMPTY_SESSION_METERS.backgroundTasks` を `null` から `[]` に変更。data-model §2.5、`running-session-store.test.ts`、`BackgroundTasksTab.test.tsx` の期待値を合わせた。
  - 出所は pr-gate round1 の po-reviewer H-002。
- touched files に該当する charter / Confirmation: ui charter (feature の持ち主は `ui`)。AD-056 Decision 2 (保持は session の契約)。
  - 命名と配置の変更はない。既存ファイルの値と期待値だけの変更。
- lint-agent JSON: `exit_code: 0`。detectors の `lint` / `typecheck-node` / `typecheck-web` / `depcruise` / `check:constitution` はすべて 0。
  - `violations[]` は空。
  - scope 外の warning 22 件は prettier のみ (scope 外なので finding にしない)。
  - CONV-1 の finding は 0 件、`exit_code` 非ゼロの Critical も 0 件。
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: owner は architecture-reviewer
- D. Constitution / ADR drift: 該当なし: owner は architecture-reviewer
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0
  - F の dead code 指摘を検出するテストはない。lint の `unused-vars` は到達不能な分岐を検出しない。これは lint の仕様で、指摘は M-001 に載せた。
  - 既存の振る舞いへの影響は次の根拠で壊していないと言える。
    - `useSessionMeters` は meters が無いとき `EMPTY_SESSION_METERS` を返す (`useSessionMeters.ts:23`)。
    - 更新後のテスト 2 件は `[]` と 0 件の表示を固定している (`running-session-store.test.ts:794`、`BackgroundTasksTab.test.tsx:84-93`)。
    - typecheck と lint は 0。

## スコープ要約

scope は 4 ファイル。data-model.md (§2.5 の初期値の記述)、`running-session-types.ts` (初期値 `[]` と doc コメント)、`running-session-store.test.ts` と `BackgroundTasksTab.test.tsx` (期待値)。

命名・ファイル配置・import 順序に問題は見つからなかった。`running-session-types.ts` は 500 行未満。

問題は、初期値を `[]` にしたのに `null` を前提にした実装と記述が残っていることだった。

## Findings

### [Medium] 初期値を `[]` にしたため、`backgroundTasks === null` の分岐と `awaiting` 表示が到達不能の dead code になった (M-001) (scope: feature)

- **観察**: `backgroundTasks` の値の出所は 2 つだけで、どちらも `null` を返さない。
  - 初期値 `src/renderer/src/features/session/running-session-types.ts:160` が `[]`。
  - 更新 `running-session-store.ts:232` は `update.tasks` (配列) で置き換える。
  - `useSessionMeters` は meters が無いとき `EMPTY_SESSION_METERS` を返す (`useSessionMeters.ts:23`)。
  - 型 `running-session-types.ts:132` は `readonly BackgroundTaskEntry[] | null` のまま。
  - 次の箇所が `null` を前提に残っている。
    - `src/renderer/src/features/shell/BackgroundTasksTab.tsx:70` の `tasks === null ? null : ...`
    - 同 `:72-75` の `tasks === null` 分岐と `data-testid="background-tasks-awaiting"`
    - `src/renderer/src/features/shell/labels.ts:262-263` の `BACKGROUND_TASKS_LABELS.awaiting` (「一覧はまだ届いていません」)
  - 更新後のテストは `awaiting` が出ないことだけを確認する (`BackgroundTasksTab.test.tsx:91`)。分岐そのものは検査されず、残り続ける。
  - `labels.ts:257` の `heading(count: string | null)` の `null` は `NotRunning` (`BackgroundTasksTab.tsx:36`) が使うので dead ではない。
- **同種事象探索**: `background-tasks-awaiting|\.awaiting|backgroundTasks.*null` を `src` と specs で検索した。`awaiting` は上記 2 箇所 (`BackgroundTasksTab.tsx:73-74`、`labels.ts:263`) と test の `:91`。`SessionNavBadge` など `counts.awaiting` は別概念で無関係。
- **リスク/影響**: 到達しない UI 文言と分岐が残る。将来 `null` を再導入したと誤読される。型が「まだ届いていない」を表せるように見えて契約が曖昧になる。
- **推奨アクション**: 次のどちらかに揃える。
  - (a) 型を `readonly BackgroundTaskEntry[]` にし、`BackgroundTasksTab.tsx` の `null` 分岐・`awaiting` 文言・`heading` の件数側の `null` を外す。
  - (b) 「まだ届いていない」を残す設計ならそれを spec に書き、初期値を `null` に戻す。ただし po-reviewer H-002 (SDK は起動時に何も emit しない) と矛盾する。
- **根拠**: CONV-5 (dead code の cascade 検証)。AD-050 により Medium は gate で直さず、マイルストーン終わりの棚卸しに回す。
- **scope 根拠**: `BackgroundTasksTab.tsx` / `labels.ts` は 019 の touched files。今回の iter の `.code-gate-scope.txt` には入っていない。

### [Low] research.md の Decision が旧仕様 (`null` = まだ届いていない) のまま (L-001) (scope: feature)

- **観察**: `specs/019-ui-hooks-tasks-subagents-and-notices/research.md:53` に「`backgroundTasks: ... | null` (null = まだ届いていない)」と書かれている。data-model.md:122 は今回 `[]` に直った。
- **同種事象探索**: `null = まだ届いていない|まだ届いていな|届くまで` を spec_dir の spec / plan / tasks / data-model / quickstart で検索した。`backgroundTasks` を含む記述は data-model.md:122 のみ (更新済み)。`research.md:53` 以外の stale は見つからなかった。`tasks.md:64,66,70` は長い行で省略されたので未確認。
- **リスク/影響**: CONV-6 の spec と実装の記述のずれ。research は決定の経緯の記録なので影響は小さい。
- **推奨アクション**: 直すなら `research.md:53` に「起動で `[]` から始まる (pr-gate R1 H-002)」と追記する。tasks.md の該当行も確認する。
- **根拠**: CONV-6。Low のため直さなくてよい。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `background-tasks-awaiting\|\.awaiting\|backgroundTasks.*null` | 3 (関連) | `BackgroundTasksTab.tsx:73-74`、`labels.ts:263`、`BackgroundTasksTab.test.tsx:91` |
| L-001 | `null = まだ届いていない\|まだ届いていな\|届くまで` | 1 (+ tasks.md 3 行が省略で未確認) | `research.md:53`、`tasks.md:64,66,70` |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 1
