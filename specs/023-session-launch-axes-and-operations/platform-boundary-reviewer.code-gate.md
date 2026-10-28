# platform-boundary-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-29T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Gate**: code-gate iter 1 (status=reviewing から再実行。4428b06 を含む)
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: 差分はランタイムの選択・検出、隔離の処理、`capabilities` に触れておらず、runtime / isolation charter の Out of scope を侵していない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

権限モードの経路は 4 段で閉じたまま (IPC `validate.ts:437-441` / `controlSession` が kind を固定 `session-ipc.ts:328-459` / decoder `session-core.ts:487-491` / `sdk-agent-session.ts:766` の `assertSafePermissionMode`)。項目 16 は `src/agents/` 全体を走査 (`check.mjs:852-858`)。renderer の選択肢は `SAFE_PERMISSION_MODES` のみ。4428b06 で pr-gate R1 の M-001 / M-002 は fixture と UNDETECTED_NOTES で手当て済み。PB-1 / PB-2 / PB-3 / PB-5 / PB-6 は問題なし。

## Findings

### [Medium] M-001 `AGENT_SDK_CALL_FILES` はファイルを縛るがプロセスは縛らない。`rename-session.ts` の export `run` は agents のどこからでも import できる (scope: feature)

- **観察**: `src/agents/rename-session.ts:56` の `export async function run(data)`。`import { run } from './rename-session'` は項目 14 の走査対象外 (`check.mjs:668`)、agents 内 import を縛る depcruise 規則も無い。AD-062 Decision 4 の「env を固定した短命の子からだけ呼ぶ」は機械検証で守られていない。
- **同種事象探索**: `rename-session'|read-transcript'` in src → 3 件 (すべてテスト: `rename-session.test.ts:11,:80`, `read-transcript.test.ts:15`)。`.dependency-cruiser.js` に `to: { path: '^src/agents` 0 件。
- **推奨アクション**: depcruise に `agents-entry-not-imported` 規則と rule fixture を追加。塞がないなら UNDETECTED_NOTES に記録。
- **根拠**: AD-062 Decision 4、AD-034 決定 2、PB-7

### [Medium] M-002 項目 14 は SDK サブパスからの値の import / 再 export を見ないのに、UNDETECTED_NOTES は「塞いでいる」と書く (scope: feature)

- **観察**: `check.mjs:689-692` / `:719-723` の正規表現はパッケージ名直後の閉じ引用符を要求し、`@anthropic-ai/claude-agent-sdk/bridge` を見逃す。`expected.mjs:838` の `mitigatedBy` は事実と違う。design-gate platform-boundary M-002 (a) が未着手。
- **同種事象探索**: `subpath|サブパス|bridge` in `tests/rule-fixtures/expected.mjs` → 0 件。`src/` のサブパス import 0 件。
- **推奨アクション**: 正規表現に `(?:/[^'"]*)?` を入れ fixture を追加。塞がないなら `mitigatedBy` を直す。
- **根拠**: AD-062 Decision 5、Constitution Principle IV、SC-017、PB-7

### [Medium] M-003 `resolveLiveTranscriptTarget` のテストが Win32 のみで、WSL ディストロ間の名前空間分離を確かめていない (scope: feature)

- **観察**: `live-transcript-target.test.ts:37` の `RUNTIMES` は `createWin32` のみ。`live-transcript-target.ts:37-41` の名前空間絞り込みに回帰検出が無い。SC-004 関連。
- **同種事象探索**: `createWsl|wsl` in `live-transcript-target.test.ts` → 0 件。`resume-service.test.ts` 3 件 (`:137,:168,:207`) は名前空間の絞り込みではない。
- **推奨アクション**: WSL 2 ディストロ + ホスト既定の表テストを追加。
- **根拠**: SC-004、AD-028、PB-1 / PB-2

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `rename-session'\|read-transcript'` in src / `to: \{ path: '\^src/agents` in .dependency-cruiser.js | 3 (テスト) / 0 | src/agents/rename-session.test.ts:11, :80; src/agents/read-transcript.test.ts:15 |
| M-002 | `subpath\|サブパス\|bridge` in tests/rule-fixtures/expected.mjs | 0 | scripts/constitution/check.mjs:689-692, :719-723; tests/rule-fixtures/expected.mjs:838 |
| M-003 | `createWsl\|wsl` in live-transcript-target.test.ts / resume-service.test.ts | 0 / 3 | src/main/app/resume-service.test.ts:137, :168, :207 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 0
- 引き継ぎ: pr-gate R1 M-001 解消 / pr-gate R1 M-002 は UNDETECTED_NOTES として扱い済み / 前回 code-gate M-002 (`queryHandle` の型) は Medium のまま未修正
