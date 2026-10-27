# convention-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28
**Reviewer**: convention-reviewer
**Gate**: code-gate iter 1
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-018 / SC-001〜SC-008 (SC-009 は実機で未実施扱い)。F 観点で直接関わるのは FR-017 (allowlists / fixture / union の同 PR 修正)、FR-011 (`renameSession` を 1 ファイルに縛る)、FR-018 (用語を glossary に反映)
- charter / Confirmation: session charter の In scope `:64` `:65` `:68` `:69`。AD-062 / AD-034 決定 2 / AD-055 (`AGENT_SDK_CALL_FILES`)。Constitution VII / II が新設の `rename-session.ts` / `session-rename-service.ts` / `rename-spawner.ts` の配置に関わる
- lint-agent JSON の受領: **あり**。`exit_code: 0`。eslint 0 error / 42 warning (すべて `prettier/prettier`)、typecheck-node / typecheck-web 0 error、depcruise 0 violation、constitution 21 項目中 ok 20 / violation 0 / not_checked 1。非ゼロの exit code は無いので CONV の Critical (lint 非ゼロ) は 0 件
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner。constitution 検証は lint-agent で violation 0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:3
- G. optional reviewer 範囲: 該当なし: convention-reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: High:0 Medium:0 Low:0

## スコープ要約

scope は 73 ファイル (`b7d0dad..HEAD`)。新設モジュール 6 つ (`src/domain/session/live-settings.ts`、`src/agents/rename-session.ts`、`src/main/app/{live-transcript-target,session-rename-service,rename-spawner}.ts`、`src/renderer/src/features/shell/LiveSettingsControls.tsx`) と、既存の `SessionControl` / registry / IPC / ストア / ヘッダへの拡張、Constitution 検証と rule fixture の更新。

- 命名: 新設ファイルは kebab-case (renderer のコンポーネントは PascalCase) で既存規則と一致
- 配置: plan のとおり。`src/agents/rename-session.ts` は Electron を import しない。`electron` を持つ改名のモジュールは `rename-spawner.ts` だけ
- 実名リスト: `PROCESS_SPAWN_MODULES` / `WSL_FREE_DIRECTORIES` / `services-not-to-io` (`.dependency-cruiser.js:254`) に同じ変更で追加済み
- import 順: 一貫。depcruise 循環なし
- dead code: 新設 export はすべて参照あり
- spec / plan と実装の命名: 一致

## Findings

### [Medium] prettier/prettier の warning が新規コードに 42 件残っている (M-001) (scope: feature)

- **観察**: lint-agent の JSON に `prettier/prettier` が severity `warning` で 42 件。`error` は 0 件。主な場所: `src/main/app/session-launch-service.test.ts:1046-1054` (9 件)、`src/main/app/live-transcript-target.ts:37,42`、`src/main/app/rename-spawner.ts:30`、`src/main/app/ipc.ts:403,408`、`src/domain/session/live-settings.ts:15,71`、`src/domain/session/agent-session.ts:321`、`src/agents/sdk-agent-session.ts:186`、`src/renderer/src/features/shell/LiveSettingsControls.tsx:293-295`、`CenterHeader.tsx:166,180`、`src/renderer/src/features/session/useLiveSession.ts:40,98`、`scripts/constitution/check.mjs:710,712` ほか
- **同種事象探索**: lint-agent の JSON 上の `prettier/prettier` が 42 件。全数を列挙した
- **リスク/影響**: CI は落ちないが、整形差分が新規コードに混ざったまま残る
- **推奨アクション**: Prettier で整形する (振る舞いは変わらない)
- **根拠**: CONV-1 の warning は Medium
- **scope 根拠**: touched files の中

### [Medium] `session-launch-service.ts` が 500 行の目安を超えた (M-002) (scope: feature)

- **観察**: `src/main/app/session-launch-service.ts` が 410 行から 612 行に増え、500 行を新たに超えた
- **同種事象探索**: 差分前後の行数比較。新たに超過: `session-launch-service.ts`、`validate.ts` 519、`ipc.ts` 503。もともと超過: `running-session-store.ts` 1302、`composition-root.ts` 563、`labels.ts` 679、`sdk-agent-session.ts` 1065
- **リスク/影響**: 起動の service に実行中の設定の変更の責務が足され、単一責任が弱まる
- **推奨アクション**: 待ちの表と `requestControl` / `beginChange` / `endChange` / 保留を別モジュールに切り出す。plan が `session-launch-service.ts` に置くと明記しているので、マイルストーンの棚卸しで扱ってよい
- **根拠**: CONV-3
- **scope 根拠**: touched files の中

### [Low] もともと大きいファイルへの追記 (L-001) (scope: feature)

- **観察**: `running-session-store.ts` / `labels.ts` / `composition-root.ts` / `sdk-agent-session.ts` は変更前から 500 行超。`validate.ts` と `ipc.ts` は新たに超えたが幅は小さい
- **推奨アクション**: 分割は棚卸しで扱う

### [Low] plan / tasks の記載とファイル名の差 (L-002) (scope: feature)

- **観察**: tasks FE-030 は `RunningSessionRow.tsx` を変更対象に挙げるが、実装は `src/renderer/src/features/session/useRunningThreadList.ts:33-43`。FR-012 は満たしている
- **推奨アクション**: 記録の差だけ。直さなくてよい

### [Low] lint 範囲外のファイル (L-003) (scope: out-of-scope)

- **観察**: `e2e/live-session-settings.spec.ts` と `tests/rule-fixtures/expected.mjs` は lint 対象外。目視では命名は既存規則と一致

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent JSON の `rule == prettier/prettier` | 42 | 上の列挙のとおり |
| M-002 | `wc -l` の差分前後比較 (500 行超) | 1 (新規) / 5 (追記) | src/main/app/session-launch-service.ts ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
