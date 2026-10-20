# convention-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: convention-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC: FR-014 (Windows 固有の値を `src/main/infra/runtime/` に閉じる)、FR-015 (記録)、FR-001〜FR-013、SC-001〜SC-006。convention 観点に効くのは命名・配置・記録の整合。
- charter / Confirmation: session charter X-8 の項、runtime charter の Related Specs。glossary は更新済み (`docs/glossary.md:563`, `:762`, `:874`, `:881`, `:1346`)。
- lint-agent JSON は受領済み。自分では lint を実行していない (CONV-1)。全 command の exit_code は 0 (eslint / tsc x3 / depcruise / constitution)。error 0、warning 24 (すべて `prettier/prettier`)。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の owner 外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の owner 外
- C. 業務不変条件 / Charter drift: 該当なし: convention-reviewer の owner 外 (glossary の identifier 反映は F の CONV-6 として確認し、問題なし)
- D. Constitution / ADR drift: 該当なし: convention-reviewer の owner 外。constitution 検査は lint-agent 側で違反 0。
- E. User Story / SC / AC / UX: 該当なし: convention-reviewer の owner 外
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:2
- G. optional reviewer 範囲: 該当なし: owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

新設は 4 モジュール (`claude-executable.ts`、`win32-claude.ts`、`win32-launch.ts`、`runtime-settings-store.ts`) と 2 サービス (`win32-claude-path-service.ts`、`launch-runtime-options.ts`)。配置は plan.md のレイヤ表どおり。ファイル名は既存と一貫、spec / plan の識別子と実装名は一致。depcruise 0 violations (`no-circular` 有効)。`no-unused-vars` 有効。`import/order` 系 rule は未設定。

## Findings

### [Medium] prettier/prettier の warning が 24 件、6 ファイルに残っている (M-001) (scope: feature)

- **観察**: `launch-preparation.test.ts` (306, 367, 540, 550)、`provider-service.test.ts` (493, 534-536, 539-540, 622, 637, 640-646)、`win32-claude-path-service.ts` (26, 42)、`win32-claude.ts` (73)、`runtime-settings-store.ts` (82)、`LaunchDialog.test.tsx` (1541)。
- **リスク/影響**: exit_code 0 なので gate は阻害しない。新規ファイル 3 つの整形が未適用。
- **推奨アクション**: 該当 6 ファイルに prettier の write を 1 回かける。
- **根拠**: CONV-1 (warning は Medium)。

### [Medium] `sdk-agent-session.ts` が 500 行超の状態でさらに肥大した (M-002) (scope: feature)

- **観察**: 813 行から 976 行 (+163)。他に既存超過 4 件 (session-core.ts 639、e2e-capability.ts 659、LaunchDialog.tsx 788、labels.ts 591) の増分は小さい。
- **推奨アクション**: 今回は対応不要。棚卸しで分離候補にする。
- **根拠**: CONV-3。AD-050。

### [Low] `isWin32LaunchInput` が export されているが未使用 (L-001) (scope: feature)

- **観察**: `src/domain/session/agent-session.ts:228` で定義、参照は定義のみ。
- **推奨アクション**: 削除するか `launch-preparation.ts:200` で使う。
- **根拠**: CONV-5。

### [Low] `.vitest/` が untracked のまま残っていて、`.gitignore` にも無い (L-002) (scope: out-of-scope)

- **推奨アクション**: 別 spec / chore で `.gitignore` に追加。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent violations[] (全数) | 24 warnings / 6 files | 上記 |
| M-002 | 500 行超ファイルの増分比較 | 4 files (全て既存超過) | 上記 |
| L-001 | `isWin32LaunchInput` | 1 (定義のみ) | `src/domain/session/agent-session.ts:228` |
| L-002 | `.vitest` / `cacheDir` | 0 | - |

Critical は 0 件なので、cascade_enforce による降格は発生しない。

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
