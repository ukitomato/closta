# platform-boundary-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003: 追加ディレクトリの経路。folder id → `resolveLaunchAxes` → main の `resolveAdditionalDirectories` (`resolveFolderRuntime`) → agents の decoder と `buildQueryOptions` の再検査。本 reviewer の主な対象
  - FR-004 / FR-005 / FR-007: 上限と名前の 3 段の検査。名前は argv を通らない (stdin の initialize)。`--max-turns` / `--max-budget-usd` は数値だけ
  - FR-009 / FR-011: プリセット版 2 は folder id だけを持つ。パスは永続化しない
  - FR-012: 再開は `checkResumeRequest` (`sessionName === null`) を通り、同じ `prepareLaunch` に入る
  - FR-016 / SC-002 / SC-003 / SC-008
- touched files に該当する charter / Confirmation:
  - Principle I: `src/domain/session/agent-session.ts` の `isLaunchDirectoryValue`。windows 側は `makeHostPath`、posix 側は自前 (code-gate M-001 で指摘済み。繰り返さない)
  - Principle III: `assertSafePermissionMode` は 4 段とも変わらない。プリセットは `isValidPresetConfig` → `hasValidBaseAxes` → `isSafePermissionMode` を通る
  - Principle VII: `src/agents/` が新たに import するのは `@domain/session/*` と `@domain/runtime/path-types` だけ
  - AD-003 / AD-004 / AD-012、AD-064 Decision 2 と Confirmation。runtime / isolation の charter は変わっていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

`SessionLaunchConfig` に 4 キーを足して 10 キーにし、`QUERY_OPTION_KEYS` を 12 から 16 にする PR。プラットフォーム境界に関わるのは追加ディレクトリだけ。renderer と `presets.json` は不透明な folder id だけを持つ。main が選択ランタイムの descriptor に対して `resolveFolderRuntime` で変換し、`expectedNamespace` が一致するかを確かめる。agents は `launchDirectoryKindOf(spec)` で posix / windows の形を再検査する。code-gate の M-001 と L-001 は持ち越しなので繰り返さない。本 round で新しく見つけたのは、main と agents で重複の判定がずれている 1 件。

## 固有観点の結果

- **PB-1 (IPC / 永続化境界での型の消失)**: 該当なし。ランタイムのパスは main で作られ、agents へ一方向にだけ渡る (`launch-preparation.ts:101-111`)。agents は spec の kind から形を決め直す (`sdk-agent-session.ts:373`)
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。module スコープの状態もキャッシュも足していない
- **PB-3 (capabilities の虚偽表明)**: 該当なし
- **PB-4 (権限ゲートの迂回)**: 該当なし。各段で `isSafePermissionMode` / `assertSafePermissionMode` が残る。版 1 のプリセットの読み替えも同じ述語を通る
- **PB-5 (多段パス変換の欠落)**: 1 ホップの変換は作業フォルダと同じ関数で対称。ただし変換の後に値が重なるかを main が見ていない (M-001)
- **PB-6 (実質的な永続環境の構築)**: 該当なし
- **PB-7 (lint ルール自体の網羅性)**: 該当なし。`tests/rule-fixtures/expected.mjs` の変更は `ui-path-concat` の `howToClose` の文言だけ

## Findings

### [Medium] 別の folder id が同じランタイムのパスに変換されると、main は通すが agents が decode で拒否し、利用者には `launch-failed` しか出ない (M-001) (scope: feature)

- **観察**:
  - `src/main/app/launch-preparation.ts:118-139` の `resolveAdditionalDirectories` は、id ごとに変換した値をそのまま `out` に積む。変換後のパスの重なりは確かめない
  - main の手前の重複検査は id の単位だけ (`isValidAdditionalDirectoryIds` の `new Set(value).size`、`resolveLaunchAxes` の `seen`)
  - agents の `isValidAdditionalDirectories` (`src/agents/session-core.ts`) は**パスの文字列**の単位で重複を拒否し、decoder がこれを呼ぶ。拒否されると `decodeLaunch` が null を返し、`src/agents/sdk-agent-session.ts:1096-1105` で `reasonKey: 'launch-failed'` が送られる
  - 所在 `windows` の `C:\work` と所在 `wsl:Ubuntu` の `/mnt/c/work` は別々に登録できる (重複キーは `(所在, 正規化済みパス)`、`src/domain/workspace/folder.ts:98`)。Ubuntu のランタイムで両方を選ぶと、どちらも `/mnt/c/work` に変換される
- **同種事象探索**: `new Set\(` を `launch-preparation.ts` で 0 件。`mnt/c` を `launch-preparation.test.ts` で 2 件 (`:645`, `:685`) あるが、単一項目の変換のみ
- **リスク/影響**: FR-003 の 2 段の役割分担 (main が `invalid-config` で拒否、agents は再検査) が崩れ、原因の分からない `launch-failed` になる。renderer の依存解決も id しか見ないのでダイアログでは気づけない。AD-064 Decision 2 の安全性は崩れておらず、機能のずれである
- **推奨アクション**: `resolveAdditionalDirectories` で変換後の値の重複 (必要なら cwd と同じ値) を確かめ、見つかったら `null` を返して `invalid-config` にする。`launch-preparation.test.ts` に `C:\work` と `/mnt/c/work` を同時に選ぶケースを足す
- **根拠**: AD-064 Decision 2、spec FR-003、AD-004
- **scope 根拠**: 本 PR で足した関数の中で直せる

### [Low] main と agents の追加ディレクトリの述語を同じ入力で突き合わせるテストが無い (L-001) (scope: feature)

- **観察**: main の変換結果 (`launch-preparation.test.ts:678-743`) と agents の形 (`agent-session.test.ts` / `session-core.test.ts`) は別々に押さえられ、main の出力を agents の `isValidAdditionalDirectories` に流すテストは無い
- **同種事象探索**: `isValidAdditionalDirectories` を `src/main` で 0 件
- **推奨アクション**: `launch-preparation.test.ts` で成功時の `input.options.additionalDirectories` に `isValidAdditionalDirectories(launchDirectoryKindOf(spec), …)` を当てる assert を足す
- **根拠**: viewpoint H

### H の補足

- WSL / Win32 の変換、名前空間の不一致、PathMapping 未取得、未登録・別のディストロの拒否は `launch-preparation.test.ts:678-743` が押さえている
- decode の失敗は `launch-failed` の 1 種類しか出ない (code-gate L-001 と同じ系統)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `new Set\(` in `src/main/app/launch-preparation.ts` | 0 | - |
| M-001 | `mnt\|automount\|drvfs` in `src/domain/workspace` (テスト除く) | 2 (コメント) | `src/domain/workspace/dto.ts:79`, `src/domain/workspace/prefix-match.ts:29` |
| M-001 | `mnt/c` in `launch-preparation.test.ts` | 2 | `:645`, `:685` |
| L-001 | `isValidAdditionalDirectories` in `src/main` | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 1
