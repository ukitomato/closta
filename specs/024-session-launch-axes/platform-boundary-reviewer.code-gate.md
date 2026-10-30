# platform-boundary-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: code-gate iter 2 (pr-gate round 1 の High を直した後の再実行)

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (folder id → `resolveLaunchAxes` → main の `resolveAdditionalDirectories` → agents の `isLaunchDirectoryValue` で再検査)、FR-004 / FR-005 / FR-007、FR-009 / FR-011、FR-012、FR-016、SC-002 / SC-003 / SC-008
- touched files に該当する charter / Confirmation: Principle I (`src/domain/session/agent-session.ts:257-267`)、Principle III、Principle VII、AD-003 / AD-004 / AD-012、AD-064 の Decision 2 と Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

前回からの差分はコミット 5c15180 だけ。ソースの変更は renderer の 3 箇所 (`LaunchDialog.tsx` の H-002 / H-003 / H-004、`labels.ts` の文言 2 件、`LaunchDialog.test.tsx` のテスト追加)。main / agents / domain のパスの検査、lint と dependency-cruiser の設定には変更が無い。renderer が持つのは folder id だけで、プラットフォーム境界に新しい変化は無い。前回の Medium と Low は AD-050 により持ち越し。

## 固有観点の結果

- **PB-1**: 該当なし。folder id の配列の操作だけ
- **PB-2**: 該当なし
- **PB-3**: 該当なし
- **PB-4**: 該当なし。H-003 の修正は保存できる場面を狭めるだけ
- **PB-5**: 変換は 1 ホップで往復同じ扱い。変換後の重複を main が見ていない点は残る (M-001)
- **PB-6**: 該当なし
- **PB-7**: 該当なし。`tests/rule-fixtures/expected.mjs` の変更は `howToClose` の文言だけ

## Findings

### [Medium] 別の folder id が同じランタイムのパスに変換されると、main は通すが agents の decode が拒否し、利用者には `launch-failed` しか出ない (M-001) (scope: feature) — pr-gate M-003 の持ち越し

- **観察**: `src/main/app/launch-preparation.ts:118-139` の `resolveAdditionalDirectories` は変換後の値の重複を確かめない。agents の `isValidAdditionalDirectories` は重複を拒否する。所在 `windows` の `C:\work` と `wsl:Ubuntu` の `/mnt/c/work` を Ubuntu ランタイムで同時に選ぶと衝突する
- **同種事象探索**: `launch-preparation.ts` で `new Set` を検索して 0 件
- **リスク/影響**: FR-003 の役割分担が崩れる (`invalid-config` ではなく `launch-failed`)。安全性 (AD-064 Decision 2) は崩れていない
- **推奨アクション**: 変換後の重複 (と cwd と同じ値) で `null` を返す。テストを足す
- **根拠**: AD-064 Decision 2 / FR-003 / AD-004

### [Medium] 追加ディレクトリの POSIX パスの規則を `makeRuntimePath` とは別に書き直している (M-002) (scope: feature) — code-gate iter 1 M-001 の持ち越し

- **観察**: `src/domain/session/agent-session.ts:263-266` の POSIX 側は `src/domain/runtime/path-types.ts` の `makeRuntimePath` と同じ規則を自前で書いている
- **同種事象探索**: `src/domain` (テスト除く) で `split\('/'\)` 3 件
- **リスク/影響**: 現時点で実害なし。正本の規則変更時にずれうる
- **推奨アクション**: `path-types.ts` に名前空間を取らない述語を公開し、それを呼ぶ
- **根拠**: Principle I / AD-004

### [Low] 追加ディレクトリが原因の拒否が、ログでは他の `invalid-config` と区別できない (L-001) (scope: feature) — 持ち越し

- **観察**: `src/main/app/launch-preparation.ts:183` / `:294` 付近
- **推奨アクション**: `logRejection` に値を含まない補助のキーを渡す

### [Low] main と agents の追加ディレクトリの述語に同じ入力を通して突き合わせるテストが無い (L-002) (scope: feature) — pr-gate L-002 の持ち越し

- **観察**: `src/main` で `isValidAdditionalDirectories` 0 件
- **推奨アクション**: `launch-preparation.test.ts` で成功時の `additionalDirectories` を agents の述語に当てる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `new Set` in `src/main/app/launch-preparation.ts` | 0 | - |
| M-002 | `split\('/'\)` in `src/domain` (テストを除く) | 3 | `src/domain/session/agent-session.ts:266`, `src/domain/runtime/path-types.ts`, `src/domain/runtime/path-api.ts` |
| L-002 | `isValidAdditionalDirectories` in `src/main` | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved from N-1: 0 / unresolved: 4 (Medium / Low の持ち越し、AD-050) / new: 0
