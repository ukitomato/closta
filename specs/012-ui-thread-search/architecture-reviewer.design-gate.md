# architecture-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: architecture-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-007。中心は FR-009〜FR-013、FR-014、FR-016
- 該当 charter / Confirmation: ui charter (:50 / :69-76)、session charter (:158-159 / :146)、`_overview.md` (:62 / :108)、AD-041 (h)、AD-044 Decision 1/3、AD-023 §5/§7/§8、AD-037 D1、AD-028 §5、AD-045 / AD-046 (proposed)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の領域
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の領域
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:0 High:2 Medium:3 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の領域
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の領域
- G. optional reviewer 範囲: 該当なし: database-reviewer / ui-coverage-reviewer の領域
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

コードの事実は一致 (`capability.ts:122,199-239`、`preload/index.ts:58`、`ipc.ts:164-172,282-291`、`session-ipc.ts:137-144`、`LaunchDialog.tsx:323-327,347-355,395-399`、`thread.aui.tsx:170,316,337,771`、`target-finder.ts:92,99`、IPC_CHANNELS の固定テストは 0 件)。不一致: `applyLocationFilter` は無い (`narrowToLocation`。`SessionListScreen.tsx:706`)。起動は `SessionScreen.tsx:119` → `running-session-store.ts:359` を経由する。

## Findings

### [High] 起動元の記録を `ipc.ts` の handler に置く設計が、検証と委譲を `session-ipc.ts` に分ける既存の層の規則に反し、SC-005 のテスト経路も成り立たない (H-001) (scope: feature)

- **観察**: plan.md:22 / research.md:41 / BE-042 は `ipc.ts` に置く。`session-ipc.ts:20-32` と `ipc.ts:280` の規則は検証と service 呼び出しを `session-ipc.ts` に
- **同種事象探索**: `handle\(IPC_CHANNELS\.(launchSession|getTranscript)` 2 件 (`ipc.ts:263,282`) とも `session-ipc.ts` に委ねる。`ipc.ts` で service を呼ぶ先例 0 件
- **推奨アクション**: `handleLaunchSession` に入れ `SessionIpcDeps` に `recordLaunchUsage(origin)`。`getLaunchUsage` の本体も `session-ipc.ts`。touched files を直す
- **根拠**: AD-023 §7、`session-ipc.ts:20-32`、SC-005

### [High] AD-045 の status をいつ何にするかが spec / plan / tasks / quickstart で食い違い、どの状態でも SC-007 か着手の条件のどちらかが偽になる (H-002) (scope: feature)

- **観察**: tasks.md:9 / spec.md:237 は accepted、SC-007 / V-2 / plan.md:143 は proposed
- **同種事象探索**: accepted を前提 2 件、proposed を前提 8 件
- **推奨アクション**: 「AD-045 の accepted を着手の条件」を正に。SC-007 / V-2 を accepted に。XV の改定を PR に含めるかを 1 文にそろえる
- **根拠**: 改定手順 (constitution.md:317-327)、Principle XV (:849)

### [High] ui の feature が session の操作 UI と session の domain のモジュールを書き換えるのに、未承認の判断として挙がっているのは IPC の拡張 (U-2) だけ (H-003) (scope: feature)

- **観察**: ui charter:69-76、AD-046 Decision 2、_overview.md:88-90。本 feature は過去の区画・`LaunchDialog` / `PresetPanel`・`stores/sessions.ts`・`domain/session/launch-usage.ts`・main の起動経路を変える
- **同種事象探索**: 4 件 (ui charter:69 / AD-046:26 / _overview.md:88 / session charter:59)。spec 012 に受ける記述 0 件
- **推奨アクション**: U-5 を足す。ui charter に「Thread 検索は session の一覧の上に ui が載せる例外」、session charter に「起動の利用記録は session の永続化層」
- **根拠**: ui charter Out of scope、AD-046 Decision 2、AGENTS.md

### [Medium] 起動元を capability まで運ぶ経路が plan / tasks の touched files から抜けている (M-001) (scope: feature)

- **同種事象探索**: `\.launch\(` 2 件、`capability().launchSession` 1 件
- **推奨アクション**: `running-session-store.ts` / `running-session-types.ts` / 起動ダイアログの呼び出し元を足す。申し送り #5 に「引数の追加は派生値ではないので切り出しの発動条件に当たらない」
- **根拠**: AD-023 §7、roadmap:163-172

### [Medium] Constitution XV の改定を PATCH としているが、AD-045 Decision 2 は新しい規則を足すので MINOR に当たる (M-002) (scope: feature)

- **同種事象探索**: `PATCH` 3 件 (spec.md:56,237 / 0045:34)
- **推奨アクション**: MINOR に (Decision 2 を XV に入れない場合だけ PATCH)。改定手順 2 / 4。直書きの基準線
- **根拠**: 改定手順・版の方針 (constitution.md:315-327, :1005-1013)

### [Medium] KPI「再利用率」の数え方を ui の [ASSUMED] で決めていて、session charter の KPI の定義とずれる (M-003) (scope: feature)

- **同種事象探索**: `lastConfig` 7 件、復元の経路 1 本 (`LaunchDialog.tsx:179`)
- **推奨アクション**: 数え方を未承認の判断の表に。session charter で定義を書く。拒否の後の再試行は origin も復元 (`lastOrigin`)
- **根拠**: session charter KPI、AD-041 (h)

### [Medium] 同じ記録に 4 つの呼び名がある (M-004) (scope: feature)

- **同種事象探索**: 5 件
- **推奨アクション**: canonical を「起動の利用記録 (`LaunchUsage`)」に。「ローカル利用ログ」は Counterexamples。「Thread search」は「セッションの検索 (element 名は Thread search)」
- **根拠**: Principle XIV

### [Medium] E2E の配線で記録の依存をどう満たすかが決まっておらず、E2E の起動が実際のユーザデータに書き込みうる (M-005) (scope: feature)

- **推奨アクション**: E2E の stub の `recordLaunchUsage` はメモリ内の fake で書かない。E2E で `launch-usage.json` が作られないことを確かめる
- **根拠**: AD-038、AD-023 §8

### [Medium] window の capture で Ctrl+K / Ctrl+F を受けると composer のキー経路に割り込むのに、Principle VIII の E2E に回帰の項目を足していない (M-006) (scope: feature)

- **推奨アクション**: `e2e/ime.spec.ts` に「変換中に Ctrl+K / Ctrl+F を押しても開かず、変換が確定できる」
- **根拠**: Principle VIII Verification、AD-037 D1

### [Low] ローカルの暦日の計算を service に書く計画で、AD-023 §5 に寄っていない (L-001) (scope: feature)

- **推奨アクション**: `toLocalDayKey(epochMs, tzOffsetMin)` を domain の純関数に

### [Low] O-9 は session の変換の契約 (`createdAt`) を触るのに、「持ち主の確認」の注記が予定されていない (L-002) (scope: feature)

- **推奨アクション**: FR-016 の O-9 の行に注記

### [Low] 強調の `::highlight()` の色に既存のテーマのトークンを使う指定が無い (L-003) (scope: feature)

- **推奨アクション**: data-model §2 に既存のトークンを使う 1 行

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `handle\(IPC_CHANNELS\.(launchSession\|getTranscript)` | 2 | ipc.ts:263, :282 |
| H-002 | `proposed` / `accepted` | 8 / 2 | tasks.md:9, spec.md:237 / spec.md:56,274, plan.md:53,72,143,147, tasks.md:53, quickstart.md:15 |
| H-003 | `区画の中身の持ち主\|他 domain の操作 UI\|session の操作 UI` | 4 | ui charter:69, 0046:26, _overview.md:88, session charter:59 |
| M-001 | `\.launch\(` | 2 | LaunchDialog.tsx:354, SessionScreen.tsx:119 |
| M-003 | `lastConfig` | 7 | LaunchDialog.tsx:56,179 / running-session-store.ts:89,353,527 / running-session-types.ts:82 / SessionScreen.tsx:154 |
| M-004 | `再利用率の記録\|起動の利用記録\|ローカル利用ログ` | 5 | spec.md:246,255 / plan.md:80 / session charter:158 / roadmap.md:255 |

## Verdict

- Critical: 0 / High: 3 / Medium: 6 / Low: 3
