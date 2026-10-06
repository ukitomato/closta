# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- 影響を受ける FR/SC: FR-001 / FR-002 (照合先に `cwdDisplay` / `targetLabel`)、FR-009〜FR-013、SC-005、SC-006
- 該当する charter / ADR: Principle I / II / III / VI / VII、AD-004、AD-023 §8。AD-003 / AD-012、runtime / isolation の charter に触れない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の Out of scope を侵さない。ui / session は architecture-reviewer の担当
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: 新しいモジュールは既存のディレクトリ規則に入る (PB-7)
- G. optional reviewer 範囲: 該当なし: database-reviewer / ui-coverage-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

renderer の中の検索 3 つと、main の計測の経路 (`origin`・`launch-usage.json`・`getLaunchUsage`)。PB-2 / PB-3 / PB-5 / PB-6 該当なし。PB-4: origin は `SessionLaunchConfig` にも `launchService.launch` にも渡らず迂回路は無い (保証するテストの置き場に穴: M-002)。PB-7: `launch-usage-store.ts` は `infra` (`eslint.config.mjs:252`) と `electron-only-from-app-and-secrets` (`.dependency-cruiser.js:283`)、`launch-usage.ts` は `domain-not-to-io` / `domain-not-to-electron` (:211, :267)、`features/search` / `features/palette` は `ui` (:254) に入る。

担当外 (po-reviewer へ): O-7 で失敗したセッションを閉じるとダイアログが作り直されるが、plan は「開き直したら `manual` に戻す」ので、プリセットで起動して失敗し、そのまま起動し直すと `manual` に数えられる。

## Findings

### [Medium] Thread search の照合先 `cwdDisplay` が、登録フォルダと所在の決まる未登録グループで常に null になる。plan の Principle I の判定はこの前提を取り違えている (M-001) (scope: feature)

- **観察**: `cwdDisplay` は `undetected-distro` / `unknown-location` でだけ非 null (`SessionListScreen.tsx:386-392`、`dto-schema.test.ts:34,77-85`、`group.test.ts:190`)。見出しは `folderLabels.nameOf(folderId)` (`:1127-1128`) と `group.cwd?.value ?? group.cwdDisplay` (`:142`)。`targetLabel` は候補ユーザ (`dto.ts:39-40`)
- **同種事象探索**: `cwdDisplay|targetLabel` (SessionListScreen.tsx) 4 件、`folderName|nameOf` 2 件
- **リスク/影響**: 画面のフォルダ名で検索しても登録フォルダのセッションが一致しない。手近な直し方で `cwd.value` を足すと名前空間が混ざる
- **推奨アクション**: 照合先を「画面が描く見出しの文字列」(登録フォルダは `nameOf`、未登録は見出しの導出) に。`cwd.value` を直接入れないと明記。plan の Principle I の根拠を直す。テスト
- **根拠**: Principle I、AD-004、R-2 FR-042

### [Medium] 起動元の記録と検証を electron に依存する `ipc.ts` に置く設計のため、BE-042 の非干渉テストを node の単体テストとして書けない (M-002) (scope: feature)

- **観察**: `ipc.ts` は `ipcMain` を import し node 環境で読めない。検証と service の呼び出しは `session-ipc.ts` に置く約束 (`ipc.ts:244-247,277-281`、`session-ipc.ts:137-144`)。「どの origin でも `launchSession` に渡る config とゲートの判定が同じ」のテストが無い
- **同種事象探索**: `launchSession|launching` (ipc.ts) 3 件、`handleLaunchSession` 1 件
- **推奨アクション**: 検証と「`launching` のときだけ記録」を `handleLaunchSession` に置き、`ipc.ts` は port の transfer だけ。BE-042 に「origin が preset / manual / 欠落 / 未知のどれでも `deps.launchSession` が同じ引数で 1 回」。plan / research を直す
- **根拠**: Principle III、AD-041

### [Low] data-model §4 に userData の型 (`HostPath`) と組み立て方が書かれていない (L-001) (scope: feature)

- **推奨アクション**: 「`createLaunchUsageStore(userDataDir: HostPath, now)`。一時ファイル・本体・`.bak` は `hostPathOps.join`」
- **根拠**: AD-004、AD-023 §8

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `cwdDisplay\|targetLabel` / `folderName\|nameOf` | 4 / 2 | SessionListScreen.tsx:379,386,392,395 / :111,1127-1128 |
| M-002 | `launchSession\|launching` (ipc.ts) / `handleLaunchSession` | 3 / 1 | ipc.ts:127,282,284 / session-ipc.ts:137 |
| L-001 | `userDataDir: HostPath` | 3 | folder-store.ts:54, preset-store.ts:60, provider-store.ts:53 |

## Verdict

- Critical: 0 / High: 0 / Medium: 2 / Low: 1
