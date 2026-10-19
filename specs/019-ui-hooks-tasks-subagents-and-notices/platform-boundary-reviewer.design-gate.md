# platform-boundary-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-17
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-007 (query options の 2 キー。PB-4 で見た)、FR-005 / BE-001 (`pathTail` / `bashCommandName` を domain に移す。PB-1 / Principle I・VII で見た)、FR-010 / BE-033 (`read-transcript.ts` の `listSubagents` / `getSubagentMessages`。PB-1 の名前空間と `dir` で見た)、FR-013 / SC-004 / BE-040 (項目 14 の呼び出しごとのファイル制限。PB-7 で見た)。それ以外の FR は表示の規則で、プラットフォーム境界に触れない
- touched files に該当する charter / Confirmation: AD-055 Decision 1 / Confirmation (「`read-transcript.ts` の外で 2 つを呼ぶと項目 14 が発火する」)、Constitution I / VII (domain に移すコードと agents の import)、AD-034 (取得プロセスの env 固定)。runtime / isolation の charter と AD-003 / AD-004 / AD-012 は touched files に当たらない (main と `src/main/infra/runtime/` の差分は 0。SC-004)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer が owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer が owner
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter が扱う領域 (ランタイム検出・capabilities・隔離・パス変換) に触れない。main と `src/main/infra/runtime/` の差分 0 は SC-004 と quickstart V-0 で固定されている
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: Critical:0 High:1 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-11 では次の 3 つを足す。
- query の options に `includeHookEvents` / `forwardSubagentText` (どちらもリテラルの `true`)
- 過去ログの取得プロセスから SDK の `listSubagents` / `getSubagentMessages` を呼ぶ。項目 14 で `read-transcript.ts` の中に限る
- 会話由来の文字列を切り出す `pathTail` と `bashCommandName` を renderer から `src/domain/session/` に移す

プラットフォーム境界の観点 (PB-1〜PB-7) で確かめたこと:
- パス型の消失: 運ぶ値は id・種類・会話の本文だけで、branded のパス値は IPC / meter に乗らない
- ランタイムの単一インスタンス仮定: 前景の task の記憶・根の追跡・背景の task の一覧は、どれもセッションごとかストアのセッションごとの値。`createLiveToolResultTracker` は factory
- capabilities / 権限ゲート: 2 キーは escalation-neutral で、`QUERY_ESCALATION_OPTION_KEYS` は変わらない
- 多段パス変換 / 永続化: 当たらない
- lint ルール: 実質的な問題が残るのは PB-7。新しく足すファイル制限が、既存の項目 14 の検査の穴をそのまま受け継ぐ

## Findings

### [High] 項目 14 のファイル制限は、1 つ目の名前付き import しか読まず別名の側で照合するため、AD-055 Decision 1 の「`read-transcript.ts` の外で呼べば発火する」が成り立たない形がある (H-001) (scope: feature)

- **観察**:
  - `scripts/constitution/check.mjs:687-689`: SDK の名前付き import を `new RegExp(...)` ('g' フラグなし) の `.exec(src.code)` で取る。1 ファイルの中の **1 つ目の `import { ... } from '@anthropic-ai/claude-agent-sdk'` しか読まない**
  - `check.mjs:690-700`: binding の名前を `.split(/\s+as\s+/).pop()` で取る。照合に使うのは **import した名前ではなくローカルの別名**
  - plan の「機械強制」(`plan.md:229`)・research R-12 (`research.md:93`)・BE-040 (`tasks.md:36`) は、この `for (const name of bindings)` の中で `AGENT_SDK_CALL_FILES` を見る設計。そのため 2 つの穴を受け継ぐ。
  - (a) SDK をもう import しているファイル (`src/agents/sdk-agent-session.ts:4-19`・`src/agents/enumerate-sessions.ts:1`) に、2 つ目の文 `import { getSubagentMessages } from '@anthropic-ai/claude-agent-sdk'` を足して呼んでも、bindings に入らず項目 14 は ok のまま
  - (b) `import { listSessions, getSubagentMessages as getSessionMessages } from ...` のように、許可されている名前に別名を付けると `AGENT_SDK_ALLOWED_CALLS.includes('getSessionMessages')` で素通りする。`AGENT_SDK_CALL_FILES` のキー (`getSubagentMessages`) にも当たらない
- **同種事象探索**: Grep `from '@anthropic-ai/claude-agent-sdk'` (src) → 3 件 (`src/agents/enumerate-sessions.ts:1`, `src/agents/read-transcript.ts:1`, `src/agents/sdk-agent-session.ts:19`)。(a) の形で穴が開くのは、もう SDK を import している read-transcript.ts 以外の 2 ファイル。`UNDETECTED_NOTES['sdk-forbidden-call-alias']` (`tests/rule-fixtures/expected.mjs:695-704`) が既知の限界として書くのは、再束縛 (`const r = renameSession; r()`) と動的 import だけ。(a) と (b) は書かれていない
- **リスク/影響**:
  - AD-055 Decision 1 / Confirmation と SC-004 (「`read-transcript.ts` の外に 2 つの API の呼び出しが 0」) は項目 14 で計測する。ところが SDK の呼び出しを置く可能性が最も高いファイル (セッションスレッド本体) で、正当に見える書き方のまま検査を抜けられる
  - 予定の fixture 2 本 (`src/agents/__rulecheck__/` に、import を 1 つだけ書いた新しいファイル) はどちらの形も試さない。CI が緑でも制限が効いている根拠にならない
  - 実行中のセッションで `getSubagentMessages` を呼べば、AD-055 Decision 1 の「実行中のセッションでは呼ばない」にも反する
- **推奨アクション**: BE-040 で次のとおり直す。
  1. 名前付き import を `matchAll` (または 'g' フラグ付きの走査) で**ファイル中のすべて**集める
  2. 各 specifier から (import した名前, ローカル名) の組を作る。`AGENT_SDK_ALLOWED_CALLS` と `AGENT_SDK_CALL_FILES` の照合は **import した名前**で行い、呼び出し形の検査は**ローカル名**で行う
  3. fixture を 2 本足す: (i) SDK を import したファイルの 2 つ目の import 文で `getSubagentMessages` を呼ぶ、(ii) `getSubagentMessages as getSessionMessages` で呼ぶ。どちらも項目 14 で発火させる
  4. 塞がない形 (再束縛・動的 import) は今どおり `UNDETECTED_NOTES` に残し、`listSubagents` / `getSubagentMessages` も対象であると書く
- **根拠**: AD-055 Decision 1 / Confirmation、spec FR-013 / SC-004、Constitution Principle IV (Automated の正本は `scripts/constitution/`)、本 reviewer の PB-7 (「ルールが 1 件も一致しない形で書かれていないか」)
- **scope 根拠**: BE-040 が直す `check.mjs:702-709` そのもの。本 feature の touched files の中で直せる

### [Medium] H-001 の取りこぼしを検出するテストが計画に無い (M-001) (scope: feature)

- **観察**: BE-040 の確認 (`tasks.md:37`) は「fixture 2 本が発火する」「今の `src` で ok」「`AGENT_SDK_CALL_FILES` から `read-transcript.ts` を外すと落ちる (手で確かめて戻す)」の 3 つ。最後の 1 つは手作業で、回帰として残らない。どれも、もう SDK を import しているファイルでの呼び出しと、許可された名前への別名を試さない
- **リスク/影響**: H-001 を直しても、後で検査を書き換えたときに戻ったことに気づけない
- **推奨アクション**: H-001 の fixture (i) / (ii) を `expected.mjs` に `detectors: ['constitution']`, `rules: ['#14']` で登録する。手作業の確認は fixture に置き換える
- **根拠**: reviewer-base の H (指摘を検出できるテストがあるか)
- **scope 根拠**: `tests/rule-fixtures/` は BE-040 の touched files

### [Low] `pathTail` を domain に移すと、branded のパス値にも型の上で当てられる (L-001) (scope: feature)

- **観察**: BE-001 (`tasks.md:25`) は `src/renderer/src/features/chat/path-tail.ts:10` の `pathTail(path: string)` を、中身を変えずに `src/domain/session/path-tail.ts` に移す。`HostPath` / `RuntimePath` は `string` の branded 型なので `pathTail(hostPath)` も tsc を通る
  - renderer にあったときは、名前空間つきのパス値を renderer が組み立てないこと (`eslint.config.mjs:466` の SH-054) で、実質的に隔てられていた
  - 移した後は、Principle I の正本の `src/domain/runtime/path-api.ts` (`eslint.config.mjs:80`) と同じ domain 層に、パスを切る 2 つ目の関数が置かれる。main / infra からも import できる
- **同種事象探索**: Grep `pathTail` は本 spec の範囲 (BE-001) だけ。domain に移した後の利用者は、今はまだ無い
- **リスク/影響**: 将来、main 側で `HostPath` の末尾を出すのにこの関数が使われると、Principle I の「パス操作はパス API 経由」が型でも lint でも検出されない。今は実害が無い
- **推奨アクション**: 次のどちらかで、branded のパスを型で受け付けないようにする。
  - 引数を `path: string & { readonly __brand?: never }` にする
  - 名前を `textPathTail` などにし、docstring にある「アプリのパスの値ではない」を型の注記として明示する

  `.dependency-cruiser.js` で import 元を renderer と `src/domain/session/` に限ってもよい
- **根拠**: Constitution Principle I、AD-004 (branded のパス型)、AD-049 Decision 5
- **scope 根拠**: BE-001 で新設するファイル

### 観点ごとの確認 (該当なしの理由)

- **PB-1**: 該当なし。`background-tasks` の meter は `taskId` / `taskType` だけ、入れ子は会話の本文で、branded のパス値は境界を越えない。`listSubagents` / `getSubagentMessages` には `dir` を渡さない (BE-033)。そのため、今の `getSessionMessages` と同じく、spawn の時に env で固定した `CLAUDE_CONFIG_DIR` の下を探す (`read-transcript.ts:12`、SDK の `sdk.d.ts:812-814` / `:849-851` / `:1062-1064` は 3 つとも「省略時は全プロジェクトを探す」)。読む名前空間は主の記録と食い違わない
- **PB-2**: 該当なし。前景の task の記憶は「セッションスレッドに 1 つ / 変換 1 回に 1 つ」(data-model §2.1)、根の追跡は `createLiveToolResultTracker()` の factory (`live-tool-results.ts:83`)、一覧はストアのセッションごとの `meters` (§2.5)。どれも module スコープの可変状態を足さない
- **PB-3**: 該当なし。`capabilities` と `autoModeSafe` を変えない
- **PB-4**: 該当なし。2 キーは `buildQueryOptions` だけがリテラルで組み、起動の入力・IPC・プリセットからは渡らない (data-model §1.1)。`QUERY_ESCALATION_OPTION_KEYS` の差分は 0 (BE-002 で固定)。承認の経路 (`PermissionRequest` / `toPermissionResult`) も変えない
- **PB-5**: 該当なし。docker endpoint とパス変換に触れない
- **PB-6**: 該当なし。足す SDK の API は読み取り専用。ボリューム・設定ファイル・ディストロへの書き込みは無い
- **PB-7 (その他)**: Principle VII で、agents が足す import は domain の純粋なモジュール (`foreground-tasks.ts`・`command-name.ts`・`path-tail.ts`) だけ。新しいディレクトリも作らない (plan の Structure Decision)。Principle II の分岐も足さない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `from '@anthropic-ai/claude-agent-sdk'` (src) | 3 | src/agents/enumerate-sessions.ts:1, src/agents/read-transcript.ts:1, src/agents/sdk-agent-session.ts:19 |
| H-001 | `sdk-forbidden-call` (tests/rule-fixtures/expected.mjs) | 3 | expected.mjs:239, :413, :695 |
| L-001 | `PATH_API_FILE` / `path-api` (eslint.config.mjs) | 5 | eslint.config.mjs:79-80, :130, :238, :359, :437 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 1
