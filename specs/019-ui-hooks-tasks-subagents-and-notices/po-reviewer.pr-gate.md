# po-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-003 (US-1 一般の Hook)、FR-004〜FR-006 (US-2 背景の task とタブ)、FR-007〜FR-011 (US-3 subagent の入れ子)、FR-012 (対応表。V-1/V-3/V-4 の記録が条件)、FR-013 (pin / fixture)、FR-014〜FR-016 (roadmap / charter / glossary)。SC-001〜SC-004 は自動テストで測る。SC-005 は自動の部分と、手で記録する部分 (quickstart V-1/V-3/V-4) に分かれる
- touched files に該当する charter / Confirmation: ui charter の KPI「表示網羅」(`docs/domains/ui/charter.md:180-182`、M3 の完了の条件)、ui charter の Open Questions `:278-281` (U-3)、session charter の O-11 の項 (FR-015)、AD-044 (M3 の完了の条件)、AD-056 Decision 2 (背景の task の一覧)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:2 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: ux / a11y / ui-coverage reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-11 は Tier A の 3 行を出す。一般の Hook (`includeHookEvents`)、後から背景に移った task と右のペインの「背景の task」タブ (`meter` の `background-tasks`)、実行中と過去ログでの subagent の入れ子 (`forwardSubagentText` / `listSubagents` / `getSubagentMessages`) である。Tier B は O-12 に送った。コードとテストは揃っている (Vitest 3449 件 pass)。ただし `quickstart-results.md` の実機の確認 V-1〜V-7 は未実施で、対応表 D 節の 3 行は `後続: O-11` のまま残っている。

## Findings

### [High] SC-005 が未達。FR-012 により、本 PR はまだ完了の PR として出せない (H-001) (scope: feature)

- **観察**: `specs/019-ui-hooks-tasks-subagents-and-notices/quickstart-results.md:21` に「割当先が O-11 の行が 0 にならない…M3 の完了の条件の残り 3」とある。同 `:25` は「V-1〜V-7 未実施 (利用者の作業)」。`docs/ui-coverage.md:181-183` の general-hooks / late-backgrounded-task / subagent-nesting-live はどれも `後続: O-11 … (未記録)` のまま。一方 spec FR-012 (`spec.md:218`) と quickstart (`quickstart.md:23`) は「記録が無い行は `実装済み` にせず、完了の PR を出さずに利用者に返す」と定めている。SC-005 (`spec.md:244-246`) は自動の部分 (割当先が O-11 の行が 0) も、手で記録する部分も成り立っていない
- **同種事象探索**: `後続: O-11` を `docs/ui-coverage.md` で探して 3 件 (`:181`, `:182`, `:183`)。`docs/roadmap.md:486` の O-11 の行も「D 節の 3 行は V-1 / V-3 / V-4 が『届いた』の記録のときだけ `実装済み`」と書いており、食い違いは無い
- **リスク/影響**: pr-gate は Critical だけで止まる。そのため本 finding が High でも、このまま `/cl-done` に進む経路がある。進めば FR-012 に反して完了の PR が出る。ui charter の KPI「表示網羅 / M3 の完了の条件」(`charter.md:180-182`) も 3 行残ったまま feature が閉じる
- **推奨アクション**: コードの修正は要らない。pr-gate の結果を問わず、`/cl-done` の前で止めて利用者に返す。利用者に頼むのは V-1 / V-3 / V-4 の実機の記録である (あわせて V-2 / V-5 / V-6 / V-7 も)。記録が「届いた」なら data-model §4 のとおり D 節の 3 行を `実装済み` にし、項目 21 で「割当先 O-11 = 0」を確かめてから完了の PR を出す。V-3 が「届かない」なら RK-06 のとおり SDK の版の待ちとして返す
- **根拠**: spec FR-012 / SC-005、plan RK-06、ui charter の KPI、AD-044
- **scope 根拠**: 本 feature の spec が完了の条件として定めたもの

### [High] 背景の task のタブが起動直後から「まだ届いていません」を出し続ける。US-2 AC4 の「一覧は空から始まる」に反する (H-002) (scope: feature)

- **観察**: `src/renderer/src/features/shell/BackgroundTasksTab.tsx:72-75` は `tasks === null` のとき `BACKGROUND_TASKS_LABELS.awaiting` (「背景の task の一覧はまだ届いていません。」、`src/renderer/src/features/shell/labels.ts:263`) を出す。`null` は起動のときの初期値である (`running-session-store.test.ts:791-794`「起動直後は null」)。**追加事実**: SDK の型の説明 (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3423`) には "nothing is emitted at startup, so consumers must reset to the empty set whenever the session's CLI process (re)starts" とある。`background_tasks_changed` が届くのは、背景の task の顔ぶれが変わったときだけ
- **同種事象探索**: `awaiting` を `src/renderer/src/features/shell` で探して 2 件 (`BackgroundTasksTab.tsx:73-74`, `labels.ts:263`)。テストは `BackgroundTasksTab.test.tsx:84`「一覧が届くまでは件数なし」で、この振る舞いを固定している
- **リスク/影響**: 背景の task を一度も使わないセッション (たいていのセッション) では、タブがセッションの間ずっと「まだ届いていません」になり、見出しに件数も出ない。利用者は「0 件」と「状態が分からない」を区別できない。AC4 (`spec.md:153`) の「一覧は空から始まる」が成り立たない。design-gate の po M-001 で null の本文が未定義だと指摘した点が、SDK の仕様と組み合わさって実際の不具合になった
- **推奨アクション**: SDK の指示どおり、セッションのプロセスの起動で `backgroundTasks` を `[]` にする (`EMPTY_SESSION_METERS` の初期値、または起動のときのリセットの箇所)。これで「今動いている背景の task はありません。」と「(0 件)」が出る。`awaiting` の文言と `BackgroundTasksTab.test.tsx:84`、`running-session-store.test.ts:791` の期待値を直す。data-model §2.5 の `null` の定義も `[]` に直す
- **根拠**: spec US-2 AC4、SDK `sdk.d.ts:3423`、PO-4 (empty state)
- **scope 根拠**: touched files (`BackgroundTasksTab.tsx`, `running-session-types.ts`, `running-session-store.ts`) の中で直せる

### [Medium] 過去ログの subagent が上限で切れても印が出ない。実行中は印が出る (U-10) ので、FR-011 の「同じ形」と見え方が分かれる (M-001) (scope: feature)

- **観察**: `src/agents/read-transcript.ts` (diff `:4651-4679`) は subagent を先頭から 32 件 (`MAX_SUBAGENTS`) だけ読み、1 件につき 500 メッセージ (`limit: SUBAGENT_MESSAGE_LIMIT`) で取る。33 件目以降と、501 件目以降のメッセージは黙って落ちる。一方、実行中は上限に当たると `truncated` の印が出る (US-3 AC6)。Edge Cases (`spec.md:188`) は「過去ログで開き直すと 500 まで読める」と書くだけで、500 を超えたときに過去ログで何が見えるかは書いていない
- **リスク/影響**: 長い subagent を過去ログで読むと、途中で切れていても印が無い。利用者は全部読めたと誤解する
- **推奨アクション**: 返ってきた件数が `limit` と同じなら、親の tool-call に `truncated` を立てる。または Out of Scope に「過去ログの上限での切り詰めは印を出さない」と明記する
- **根拠**: FR-011、U-10、PO-4

### [Medium] 一般の Hook の失敗の読み上げが、どの Hook かを伝えない (M-002) (scope: feature)

- **観察**: `src/renderer/src/features/chat/transcript-announcements.ts` (diff `:7985-7987`) は `ANNOUNCER_LABELS.hookEnded(label)` (=「Hook が失敗」、`labels.ts:117`) を読むだけで、名前も伏せた見出しも含めない。テスト `TranscriptAnnouncer.test.tsx:155` は `PreToolUse` が読まれないことを固定している。data-model §1.4 (`data-model.md:52`) は「伏せた名前の行は §1.3 の見出しを使う」としている
- **リスク/影響**: 1 ターンに Hook が何件も走るので、支援技術の利用者は失敗が聞こえても対象を特定できない。US-1 の Why (「Hook が tool を止めたことが見えない」) が、支援技術の利用者には半分しか満たされない。data-model のこの一文が読み上げの話か表示の話かは曖昧である
- **推奨アクション**: 読み上げに `hook_event` か伏せた見出し (「Hook (PreToolUse) 2 が失敗」) を含めるかを決める。含めないなら data-model §1.4 の一文を「表示の見出しだけ」と明確にする
- **根拠**: FR-003、data-model §1.4、PO-3

### [Medium] 過去ログの subagent の読み出しの失敗を観測できない (H 観点。design-gate po M-004 が未解消) (M-003) (scope: feature)

- **観察**: `src/agents/read-transcript.ts` (diff `:4662-4664`, `:4676-4678`) は `listSubagents` / `getSubagentMessages` の例外を握りつぶし、件数も記録しない
- **リスク/影響**: 「subagent に本文が無い」「読み出しに失敗した」「上限で落ちた」の区別が、利用者にも開発側にもつかない。V-6 で不具合を見つけても原因を追えない
- **推奨アクション**: frame か開発ビルドの診断に、失敗の件数と落とした件数 (本文は含めない) を出す。今回出さないなら、マイルストーンの終わりの棚卸しで扱う
- **根拠**: reviewer-base H (観測点)、PO-7

### [Low] User Story 3 本がすべて P1 (design-gate L-002 から持ち越し) (L-001) (scope: feature)

- **観察**: `spec.md:122`, `:140`, `:158`。どれも Tier A で M3 の完了の条件に入るので理屈は通るが、優先度の区別としては働いていない
- **推奨アクション**: なし (記録だけ)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `後続: O-11` in docs/ui-coverage.md | 3 | docs/ui-coverage.md:181, :182, :183 |
| H-002 | `awaiting` in src/renderer/src/features/shell | 2 | BackgroundTasksTab.tsx:73-74, labels.ts:263 (テスト BackgroundTasksTab.test.tsx:84, running-session-store.test.ts:791) |

## Verdict

- Critical: 0
- High: 2
- Medium: 3
- Low: 1

Note to the caller: H-001 cannot be fixed by implementer. Because FR-012 forbids the completion PR without the V-1/V-3/V-4 records, stop before `/cl-done` and hand this back to the user, whatever the pr-gate verdict. H-002 can be fixed inside the feature: initialise `backgroundTasks` to `[]` when the session process starts, as the SDK requires (`sdk.d.ts:3423`), and update the two tests that currently lock in the null behaviour.
