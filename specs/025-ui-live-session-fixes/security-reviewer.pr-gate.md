# security-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-005 / FR-006 / FR-007: 新しい IPC `listSessionModels`、`SessionControl` の `list-models`、WorkerMessage の `models-result`、`setModel` の既定の Provider の分岐。本 reviewer の主な対象
  - FR-016 / FR-017 / FR-018: `/resume` の横取りと選ぶ画面。既存の `resolvePastResume` IPC を使う
  - FR-001〜FR-004 / FR-008〜FR-015: renderer の配置と文言。security 上の新しい入力経路は無い
  - SC-002 / SC-006: 上の経路の計測
- touched files に該当する charter / Confirmation:
  - ui charter に security 前提の記述は無い
  - AD-065 Decision / Confirmation (`setModel` は一覧の外と effort の外を拒む・`models: null` の経路)
  - `src/main/app/ipc.ts:213-221` の `handle()` wrapper (`isTrustedSender(event.senderFrame)`)
  - design-gate の security 指摘 H-001 / H-002 / M-001 (下で解消を確認)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

この PR で増える信頼境界は 2 つあり、どちらも実装済みです。

1. **renderer から main への `listSessionModels(sessionId)`。**
   - `ipc.ts:414` で `handle()` wrapper を通して登録している
   - 送り元は `isTrustedSender` で検査している
   - 引数は `checkListModelsArgs` (`validate.ts:455`) で、ちょうど 1 つの UUID であることを確かめている
   - preload の追加 (`preload/index.ts:89`) は名前つきの `invoke` 1 本だけで、汎用のパススルーは無い
2. **Claude Code からセッションスレッド・調停役を経て main に届く `supportedModels()` の値。**
   - セッションスレッドで `normalizeLiveModels` が `ModelInfo` の形の値を検査する
   - 調停役と main の両方のデコーダで `requestId` を `isValidSessionId` で検査する (`supervisor-protocol.ts:138`, `:253`)
   - main で `normalizeLiveModelEntries` (`model-catalog.ts:141`) が `ModelEntry` の形を検査し直す。未知のキー・文字種の外・`inferenceProfileId` つき・重複・65 件目以降を捨てる

`setModel` の既定の Provider の分岐 (`session-launch-service.ts:637-641`) は、main が最後に受け取った一覧を effort で絞った集合と照合します。一覧をまだ受け取っていないときと集合の外の値は拒み、送るのは一覧の `id` です。結果を待つ表 (`pendingModels`) は、`requestId` に加えてセッションと世代も照合します。ログに出すのは件数と捨てた数だけです (`:409`)。セッションスレッドは例外の文言を運びません (`sdk-agent-session.ts:794`)。

renderer 側:
- `displayName` は native の `<option>` にテキストとして描いている (`LiveSettingsControls.tsx:187-188`)
- 選ぶ画面の行の名前は React の既定のエスケープで描いている。`targetKey` は React の key に使うだけで DOM には出ない
- `/resume` の正規表現 `/^\/resume(?:\s|$)/u` は ReDoS を起こす形ではない
- 触れたファイルに `dangerouslySetInnerHTML` / `innerHTML` / `shell.openExternal` は無い

BrowserWindow / CSP / 子プロセス / 依存の追加は無く、変更もありません。

design-gate の指摘は 3 件とも実装で解消しています (H-001: `normalizeLiveModelEntries` に分離 / H-002: `src/agents/live-models-path.test.ts:27`, `:46` / M-001: `session-core.ts:500`, `supervisor-protocol.ts:138`, `:253`)。

## Findings

### [Low] `list-models` のデコーダのコメントが、実装より弱い検査を書いている (L-001) (scope: feature)

- **観察**: `src/agents/session-core.ts:497` のコメントは「requestId が空でない文字列であることだけを見る」と書いている。直下の `:500` の実装は `isValidSessionId(requestId)` (UUID の完全一致) で検査している。design-gate M-001 を直したときに、コメントを書き換えていない
- **同種事象探索**: `空でない文字列` を `src/agents` / `src/main` で探した。ずれは `session-core.ts:497` の 1 件。`supervisor-protocol.ts:137` / `:266` は実装と合っている
- **リスク/影響**: 今の実害は無い。後で読む人がコメントに合わせて検査を緩めるおそれ
- **推奨アクション**: `:497` のコメントを「requestId は UUID (`isValidSessionId`)。023 の `set-*` と同じ」に直す
- **根拠**: CWE-1116
- **scope 根拠**: touched file

## H (テスト / regression) の確認

- `checkListModelsArgs` の負例: `src/main/app/validate.test.ts:560-569`
- `list-models` の `requestId` が UUID でない場合の拒否: `src/agents/session-core.test.ts:806`
- 調停役と main のデコーダの負例: `src/agents/supervisor-protocol.test.ts:212`, `:215`, `:263` と `src/agents/supervisor-core.test.ts:495-497`
- main の再検査: `src/domain/provider/model-catalog.live.test.ts:48`, `:67`
- 層横断: `src/agents/live-models-path.test.ts:46`
- `setModel` の既定の Provider の分岐: `src/main/app/session-launch-service.test.ts:1278` 以降
- 観測点: 件数と捨てた数のログ (`session-launch-service.ts:409`)
- code-gate の test-agent は full で 4269 passed / 0 failed

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `空でない文字列` (src/agents, src/main) | 1 | src/agents/session-core.ts:497 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
