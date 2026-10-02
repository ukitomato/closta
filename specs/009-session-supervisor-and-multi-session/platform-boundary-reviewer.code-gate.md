# platform-boundary-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 2 (code-gate iteration 2。iteration 1 の出力は `platform-boundary-reviewer.code-gate.md.iter1`)

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 / FR-005 / FR-006 / FR-012 / FR-013 / FR-014、SC-002 (項目 18)、SC-008、SC-009
- touched files に掛かる charter / Confirmation: runtime charter の不変条件 (Principle I / II、capabilities を正直に表明)、AD-043 Decision 1 / 2 / 5 / 6 / 7 と Confirmation、Constitution Principle I / II / III / VI / VII
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer (Worker の env の lint の穴は F で扱う)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の領分は本スライスの外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

iteration 1 の修正 5 件と、実機で見つかった修正 2 件 (応答待ちの間の子の異常終了を `process-crashed` に / run-state の `fail` を `done` からも受ける) を境界の観点で確認した。check.mjs は項目 18 / 19 / 20 が ok (ok 19 / 違反 0 / pending 1 = 既存の #5)。ESLint の Node API に 9 形を流し、app / infra での `worker_threads` の import (named / namespace / re-export) が両ルールで止まり、動的 import と `require` が `boundaries/dependencies` で止まることを確認。止まらないのは app での `process.getBuiltinModule('node:worker_threads')` の 1 形 (L-101)。

- PB-1 パス型の消失: 該当なし
- PB-2 単一インスタンスの仮定: 該当なし (fork env は curated base、ランタイム固有値はセッションごとの `spec.env`、世代番号を照合)
- PB-3 capabilities の虚偽表明: 該当なし
- PB-4 権限ゲートの迂回: 該当なし (`sdk-agent-session.ts:466` が Worker の中で `assertSafePermissionMode`)
- PB-5 多段パス変換: 該当なし
- PB-6 実質的な永続環境: 該当なし
- PB-7 lint ルールの網羅性: iteration 1 の 5 件は解消。新規は L-101

実機修正 2 件: `sdk-agent-session.ts:395` は `!closing && !finished && !isErrored()` のときだけ `process-crashed`、`:522` は既にエラーなら上書きしない。`run-state.ts:80` の「`fail` は `error` 以外から `error`」は、強制終了・終了の後の `fail` を `closing` と `fatalSink` の `!closing` で塞いでいる。理由キーだけを流し本文の断片は載せない。

## Round 1 指摘の解消状況

- **M-001: resolved** — `eslint.config.mjs:383-394` の全レイヤ禁止 policy + `RESTRICTED_DEFAULT` (`:152`)、2 ファイルで without。stdin 試験で app / infra の import が両ルールで止まる
- **M-002: resolved** — `check.mjs:1083-1136` が named / default / namespace import・re-export・require を数える。fixture 3 件。require 形は `@typescript-eslint/no-require-imports` でも止まる
- **M-003: resolved** — eslint 発火 fixture 2 件、`worker-env-via-expression` は注入形で `none`
- **L-001: resolved** — `supervisor[\w-]*\.(?:ts|mts|cts)$`、注記と一致
- **L-002: resolved** — `check.mjs:1221-1275` が `process.env` の書き換えと `workerData` を数える。fixture 3 件

## Findings

### [Low] `process.getBuiltinModule('node:worker_threads')` は全レイヤ禁止をすり抜け、`worker-env-via-expression` の mitigatedBy の「(a) と (b) に限られる」と合わない (L-101) (new) (scope: feature)

- **観察**: app で `process.getBuiltinModule('node:worker_threads')` を置くと ESLint の指摘は 0 件。`.dependency-cruiser.js` は `detectProcessBuiltinModuleCalls: true` だが `worker_threads` を名指す規則が無い。`expected.mjs:777-779` と `eslint.config.mjs:117-122` の主張から (c) が漏れている
- **同種事象探索**: `getBuiltinModule` (src) 0 件 / `new Worker(` は `src/agents/supervisor.ts` の 1 件
- **推奨アクション**: (a) `.dependency-cruiser.js` に `worker-threads-only-from-entry` を足し `getBuiltinModule` 形の fixture (`detectors: ['depcruise']`) を足す、または (b) 主張を事実どおりに直す
- **対応 (invoker)**: (a) を採用。`.dependency-cruiser.js` に `worker-threads-only-from-entry` (2 ファイル以外からの `worker_threads` への core 依存を禁止)、fixture `b-equivalent/app-worker-threads-via-get-builtin-module.ts.fixture` (`detectors: ['depcruise']`)、`expected.mjs` の mitigatedBy と `eslint.config.mjs` のコメントを更新
- **根拠**: AD-043 Decision 7 / AD-024 #7

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 |
|---|---|---|
| L-101 | `getBuiltinModule` (src) | 0 |
| L-101 | `new Worker(` (src、test を除く) | 1 |
| (確認) | `worker_threads` の import (src、test を除く) | 2 |
| (確認) | `process-crashed` を付ける箇所 (agents) | 2 |

Critical の申告なし。Critical 候補の 0 件確認: PB-4 (`assertSafePermissionMode` / `isSafePermissionMode` を通らない permissionMode の経路) 0 件 / PB-3 (`autoModeSafe` の変更) 0 件 / PB-1 (renderer でのパス値の組み立て) 0 件 / PB-6 (`docker volume` / `--restart` / ディストロへの書き込み) 0 件。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 1: 5 / unresolved: 0 / new: 1 (L-101、invoker が修正)
