# platform-boundary-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC: この PR で実装されたものと影響を受けるもの
  - FR-001 / FR-002 / FR-003: 追加ディレクトリを folder id で選ぶ → `resolveLaunchAxes` で項目を外す → main で `resolveFolderRuntime` を使ってランタイムのパスに変換する → agents が形を再検査する。本 reviewer の主な対象
  - FR-004 / FR-005 / FR-007: 上限と名前を main と agents の 2 段で検証する。パス境界とは関係ない
  - FR-009 / FR-011: プリセット版 2 は folder id だけを持ち、パスを永続化しない
  - FR-012: 再開も同じ `prepareLaunch` を通る (`session-launch-service.ts:502`)
  - FR-016: `ui-path-concat` が当たらないことの記録 (`tests/rule-fixtures/expected.mjs`)
  - SC-002 / SC-003 / SC-008
- touched files に該当する charter / Confirmation
  - Principle I: 追加ディレクトリのパスの形の検査を `src/domain/session/agent-session.ts` に新しく置いた
  - Principle III: 権限モードは安全な 3 値のまま。`assertSafePermissionMode` は変更なし
  - AD-004: HostPath と RuntimePath の名前空間。WSL では posix、Win32 では windows
  - AD-003: ランタイムは `wsl` と `win32` の 2 種類。複数インスタンスの仮定は崩れていない
  - AD-012: docker endpoint は対象外 (`RuntimeDescriptor` は 2 種類だけ)
  - runtime / isolation の charter の Out of scope に触れる変更はない (変換は workspace の `resolveFolderRuntime` を再利用している)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

本 PR は `SessionLaunchConfig` に 4 つのキー (`additionalDirectoryIds` / `maxTurns` / `maxBudgetUsd` / `sessionName`) を足し、`QUERY_OPTION_KEYS` を 12 から 16 に増やす。プラットフォーム境界に関わるのは追加ディレクトリだけで、経路は次のとおり。

- renderer は不透明な folder id だけを送る
- main の `resolveAdditionalDirectories` (`src/main/app/launch-preparation.ts:118`) が、選択ランタイムの descriptor に対して `resolveFolderRuntime` で変換する。`expectedNamespace` は WSL ならランタイムの id、Win32 なら `'host'`
- agents は `launchDirectoryKindOf(spec)` で posix / windows の形を再検査する (`src/agents/sdk-agent-session.ts:373`, `:904`)

確認できた事項は次のとおり。

- パスの値が renderer に戻ることも、永続化されることもない
- 往路と復路の非対称はない
- 1 ホップで済ませている箇所はない (docker endpoint はまだ無い)
- runtime と isolation の境界は崩れていない

## 固有観点の結果

- **PB-1 (IPC / 永続化境界での型の消失)**: 該当なし。renderer と永続層 (`presets.json` 版 2) が持つのは folder id だけ。ランタイムのパスは main で作られ、agents へ一方向にだけ渡る。agents は spec の kind からパスの形を決め直す。概要タブは id から表示名を引くだけ (`OverviewTab.tsx` の差分)
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。main は選択ランタイム 1 件を facts に入れて評価する。module スコープの「現在のランタイム」もキャッシュも新しく足していない
- **PB-3 (capabilities の虚偽表明)**: 該当なし。capabilities の生成と表明は変わっていない
- **PB-4 (権限ゲートの迂回)**: 該当なし。permissionMode は `checkLaunchConfig` / `checkResumeRequest` / `decodeLaunchOptions` / `buildQueryOptions` の 4 段で安全な 3 値に閉じている。プリセット (`isValidPresetConfig`) と再開も同じ述語を通る
- **PB-5 (多段パス変換の欠落)**: 該当なし。作業フォルダと同じ `resolveFolderRuntime` を使い、名前空間が `expectedNamespace` と一致することまで確かめている (`launch-preparation.ts:129-134`)。cwd は composition-root の `resolveCwd` という別関数を通るが、DTO が blocked のときは renderer が作業フォルダと追加ディレクトリの両方を同じ規則で保留・停止するので、実際に食い違う経路は見当たらない
- **PB-6 (実質的な永続環境の構築)**: 該当なし。volume / restart / ディストロへの書き込みは無い
- **PB-7 (lint ルール自体の網羅性)**: 該当なし。lint と dependency-cruiser の設定は変わっていない。新しい renderer ファイルはどれも既存の `src/renderer/**` の対象にある

## Findings

### [Medium] 追加ディレクトリの POSIX パスの規則を `makeRuntimePath` とは別に書いている (M-001) (scope: feature)

- **観察**: `src/domain/session/agent-session.ts:257-267` の `isLaunchDirectoryValue('posix', …)` が、`src/domain/runtime/path-types.ts:106-121` の `makeRuntimePath` と同じ規則を自分で書き直している。規則は「`/` で始まる」「`\` を含まない」「制御文字を含まない」「4096 文字以下」「`.` / `..` の成分を含まない」の 5 つ。windows 側は `makeHostPath` を呼び、正規化した値が同じかまで見ている。posix 側は正規化の一致 (末尾の `/` の除去・空の成分) を見ていないので、2 つの検査の書き方が揃っていない
- **同種事象探索**: `split\('/'\)` を `src/domain` (テストを除く) で検索して 3 件。`agent-session.ts:266` が今回足したもの。`path-types.ts:116` が正本。`path-api.ts:322` は UNC 変換で別の用途
- **リスク/影響**: 今の時点で実害はない。main が `makeRuntimePath` を通った値しか渡さないので、両方を通る。ただ、正本の規則 (たとえば禁止文字) を変えると agents の再検査だけが古い規則で残り、main は通すのに agents が decode を null にして起動が黙って失敗する、というずれが起こりうる
- **推奨アクション**: `path-types.ts` に名前空間を取らない述語 (たとえば `isNormalizedRuntimePathValue(raw)`。`makeRuntimePath` の本体と規則を共有し、正規化した値が元と同じかまで見る) を出し、`isLaunchDirectoryValue` の posix 側はそれを呼ぶだけにする。windows 側と同じく「正規化して値が変わらない」まで確かめる形に揃える
- **根拠**: Constitution Principle I (パスの規則は domain のパス API を経由する) / AD-004
- **scope 根拠**: 本 PR で足したファイルなので、この PR の中で直せる

### [Low] 追加ディレクトリの変換に失敗しても、拒否の記録が他の invalid-config と区別できない (L-001) (scope: feature)

- **観察**: `src/main/app/launch-preparation.ts:171` / `:189` / `:282` / `:300` は、`directoryResets` が残っているときも変換に失敗したときも `reject('invalid-config')` を返す。その結果、`logRejection` に記録されるのは理由キーの `invalid-config` だけになる
- **同種事象探索**: `reject('invalid-config')` を `src/main/app/launch-preparation.ts` で検索して 8 件 (`:167`, `:169`, `:171`, `:180`, `:189`, `:218`, `:280`, `:282`, `:300`, `:323` のうち invalid-config の行)
- **リスク/影響**: 実機の quickstart (V-1 / SC-009) で「追加ディレクトリを付けたときだけ起動が拒否される」ことが起きても、ログから作業フォルダ・Provider・追加ディレクトリのどれが原因かを切り分けられない。値を出さないこと (Principle V) とは両立できる
- **推奨アクション**: `logRejection` に、値を含まない補助のキー (たとえば `invalid-config:additional-directory`) を渡す。renderer に返す理由キーは変えなくてよい
- **根拠**: viewpoint H (observability)
- **scope 根拠**: 本 PR の touched files の中で直せる

### H の補足 (テストと regression)

- PB-1 と PB-5 の経路は `src/main/app/launch-preparation.test.ts:678-743` が押さえている。対象は次の 4 つ
  - WSL のフォルダは POSIX のパス、Windows のフォルダは PathMapping の変換値になる
  - 未登録・別のディストロ・作業フォルダと同じ項目・マッピング外は invalid-config
  - PathMapping が未取得なら invalid-config
  - Win32 では WSL のフォルダが invalid-config、Windows のフォルダはドライブ付きのパスになる
- agents の形の再検査は `src/domain/session/agent-session.test.ts:317-373` が押さえている
- 既存の WSL / Win32 の起動経路が変わっていないことは、`launch-preparation.test.ts:533` (WSL の起動が Win32 の依存を呼ばない) と、既存の起動テスト群が残っていることで確かめられる
- M-001 のずれ (正本の規則だけが変わる場合) を検出するテストは無い。両方の述語に同じ表を流すテストを足せば検出できる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `split\('/'\)` in `src/domain` (テストを除く) | 3 | `src/domain/session/agent-session.ts:266`, `src/domain/runtime/path-types.ts:116`, `src/domain/runtime/path-api.ts:322` |
| L-001 | `reject('invalid-config')` in `src/main/app/launch-preparation.ts` | 8 | `launch-preparation.ts:167,169,171,180,189,218,280,282,300,323` (うち追加ディレクトリに関わるのは 171 / 189 / 282 / 300) |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 1
