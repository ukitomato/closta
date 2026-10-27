# platform-boundary-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Gate**: code-gate iter 1
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (権限モードを安全 3 値に閉じる。IPC 検証、decoder、assert、項目 16)、FR-005 / FR-006 (モデルをカタログに閉じる)、FR-009〜FR-012 (改名の受け付け、config ディレクトリの env、`AGENT_SDK_CALL_FILES` で 1 ファイルに縛る)、FR-014 (書き戻さない)、FR-017 (allowlists / fixture)、SC-001 / SC-002 / SC-003 / SC-004
- touched files に該当する charter / Confirmation: Constitution Principle III (権限ゲート) / VI (`PROCESS_SPAWN_MODULES` の追加には ADR が要る) / VII (`src/agents/` の Electron 非依存。`rename-session.ts` は `parentPort` を構造的に取り出している)、AD-004 / AD-028 (改名の config ディレクトリは列挙対象の名前空間で決める)、AD-062 Decision 1 / 4 / 5 と Confirmation、`tests/rule-fixtures/expected.mjs` の UNDETECTED_NOTES `sdk-query-method-indirect` (「間接の呼び出しは platform-boundary-reviewer が agents の差分で確認する」と書いてある)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: 差分は runtime / isolation の charter の Out of scope を侵していない (ランタイムの選択と検出、隔離の処理に触れていない)
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

023 は動いているセッションの権限モード (安全 3 値の中だけ) とモデル (Provider のカタログの中だけ) を `Query.setPermissionMode` / `setModel` で切り替え、`renameSession()` で名前を付けます。改名は env を固定した短命の `utilityProcess` が行います。プラットフォーム境界から見た権限モードの経路は 4 段で閉じています: IPC の `checkSetPermissionModeArgs` → セッションスレッドの decoder の `isSafePermissionMode` → 呼び出しの直前の `assertSafePermissionMode` → 項目 16 の backstop。

UNDETECTED_NOTES がこの reviewer に預けた間接呼び出しは確認しました。`src/agents/sdk-agent-session.ts:1199` (diff の行) は直接の `.setPermissionMode(assertSafePermissionMode(mode))` だけで、間接呼び出しは 0 件です。

改名の config ディレクトリは `EnumerationTarget` の名前空間を付けた値で決まります (`live-transcript-target.ts:52-56`)。`dir` は渡さないので、HostPath と RuntimePath の取り違えは起きません。docker と多段の変換は範囲外です。

## Findings

### [High] `PROCESS_SPAWN_MODULES` に、ADR に載っていないテストファイルを足している (H-001) (scope: feature)

- **観察**: `scripts/constitution/allowlists.mjs:262-266` に `'src/main/app/rename-spawner.test.ts'` が足されている。AD-062 Decision 4 (`docs/decisions/0062-live-session-permission-mode-model-and-rename.md:39`) が実名で足すと決めたのは `src/main/app/rename-spawner.ts` だけ。tasks.md:82 もテストファイルの登録を許していない。
- **同種事象探索**: `\.test\.ts'` を `scripts/constitution/allowlists.mjs` で検索すると、`PROCESS_SPAWN_MODULES` の中のテストファイルはこの 1 件だけ (`:266`)。他は suffix の除外 (`:351` / `:715`) で、項目 7 の許可ではない。`utilityProcess` を `src/main/app/*.test.ts` で検索すると `rename-spawner.test.ts` の 2 件だけで、他の spawner のテストは名前を書かずに済ませている。
- **リスク/影響**: Principle VI は「許可リストの追加には ADR を要する」と定めている (`.specify/memory/constitution.md:526` / `:547-548`)。項目 7 はテストファイルも走査する (`check.mjs:366-372`)。登録された以上、このテストファイルの中で本物のプロセス起動を書いても項目 7 は捕まえない。今は `vi.mock` の偽物で実害はないが、ADR を経ない許可が 1 件増えた。
- **推奨アクション**: `createRenameSpawner` が `fork` を注入で受けるようにする。例: `createRenameSpawner({ fork: (path, args, opts) => utilityProcess.fork(path, args, opts) })` とし、`utilityProcess` は本体だけに残す。テストは偽の `fork` を渡し、`utilityProcess` を綴らない。そのうえで `allowlists.mjs:262-266` の登録を消す。テストの登録を残すなら、後続の ADR が要る (accepted の AD-062 の決定は書き換えられない)。
- **根拠**: Constitution Principle VI (allowlist_source / Verification)、AD-062 Decision 4
- **scope 根拠**: touched files (`allowlists.mjs` / `rename-spawner.ts` / `rename-spawner.test.ts`) の中で直せる

### [Medium] 項目 14 の SDK import の検査は、再 export と変数の specifier の動的 import を捕まえない (M-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:689-692` の `namedAll` が見るのは `import { ... } from '<sdk>'` の形だけ。動的 import の検査 (`:709-715`) は、specifier が文字列リテラルの `import('<sdk>')` / `require('<sdk>')` だけを見る。抜ける形は 2 つ:
  - (a) `src/agents/x.ts` に `export { tagSession } from '@anthropic-ai/claude-agent-sdk'` (または `export * from ...`) を置く。このファイルは名前空間 import でも名前付き import でも動的 import でもないので、finding が 0 件になる。それを import する `src/agents/y.ts` は SDK の名前を含まないので `:668` で走査から外れる。こうして許可外の書き込み API と、`renameSession` の呼べるファイルの縛り (`AGENT_SDK_CALL_FILES`) の両方を迂回できる
  - (b) `const p = '@anthropic-ai/claude-agent-sdk'; (await import(p)).tagSession(...)` は `:711` の regex に掛からない
- **同種事象探索**: `export\s*(\*|\{)[^;]*from\s*['"]@anthropic-ai/claude-agent-sdk` を `src/` と `tests/` で検索して 0 件 (今は違反していない)。`re-?export|export \{|export \*` を `tests/rule-fixtures/expected.mjs` で検索して 0 件 (fixture も UNDETECTED_NOTES の記録も無い)
- **リスク/影響**: AD-062 Decision 5 は、改名の IPC で AD-034 決定 3 の第一の担保 (書き込みを起こす IPC が無いこと) が崩れる代わりに、項目 14 で別名と動的 import を塞ぐと決めた。fixture のコメントは「限界を閉じた」と書いているが、上の 2 つの経路は開いたままで、記録もされていない。今は迂回する実装が 0 件なので defense-in-depth の扱い。
- **推奨アクション**: SDK のパッケージ名を含むファイルについて、再 export (型だけの再 export は除く) と、リテラルでない specifier の `import(` / `require(` を項目 14 の違反に足す。`b-equivalent/` に再 export の fixture を 1 件足す。塞がないなら、`UNDETECTED_NOTES` に理由と、塞ぐ feature を書く (AD-027)。
- **根拠**: AD-062 Decision 5 / Confirmation、Constitution Principle IV、PB-7
- **scope 根拠**: touched files (`check.mjs` / `expected.mjs`) の中

### [Medium] `queryHandle` の型が広がり、tsc で権限モードの値を止められなくなった (M-002) (scope: feature)

- **観察**: `src/agents/sdk-agent-session.ts` で `queryHandle` が `Pick<Query, 'interrupt' | 'setPermissionMode' | 'setModel'>` に広がった。SDK の `setPermissionMode` は 6 値の `PermissionMode` を受け、`setModel` は引数を省略できる。UNDETECTED_NOTES `sdk-query-method-indirect` の `howToClose` の型による担保が、追加した 2 メソッドでは消えている。項目 16 の新しい検査 (`check.mjs:975-990`) は `.setPermissionMode(` と `['setPermissionMode'](` だけを見る。
- **同種事象探索**: `setPermissionMode|setModel` の呼び出しは `sdk-agent-session.ts` の 2 件だけで、どちらも直接の形。
- **リスク/影響**: 今の実装は正しい。Principle III の機械検査が綴りの grep と実行時の assert だけになった。
- **推奨アクション**: `setPermissionMode(mode: SafePermissionMode)` / `setModel(model: string)` を持つ専用の型に絞り、`Query` から代入できることを型で確かめる。
- **根拠**: Constitution Principle III、AD-062 Decision 1 / 2
- **scope 根拠**: touched file (`sdk-agent-session.ts`) の中

### [Low] 改名の列挙対象の決め方は、起動の後に Provider が消えたり configDir が変わったりすると既定の対象に落ちる (L-001) (scope: feature)

- **観察**: `src/main/app/live-transcript-target.ts:45-60`。`record.providerId` が非 null でも Provider が今の store に無ければ `origin === 'default'` の対象に落ちる。
- **同種事象探索**: `resolveLiveTranscriptTarget` の呼び出しは `resume-service.ts` と `composition-root.ts:381` の 2 か所。
- **リスク/影響**: 別の config ディレクトリでは見つからずに `write-failed` になるのが普通で、別の会話に書く経路は観察できなかった。
- **推奨アクション**: 書き込み用途では Provider が見つからないとき `null` を返す。
- **根拠**: AD-028、PB-1
- **scope 根拠**: touched file (`live-transcript-target.ts`) の中

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `\.test\.ts'` in allowlists.mjs / `utilityProcess` in src/main/app/*.test.ts | 1 / 1 file | scripts/constitution/allowlists.mjs:266 / src/main/app/rename-spawner.test.ts:21 |
| M-001 | `export\s*(\*\|\{)[^;]*from\s*['"]@anthropic-ai/claude-agent-sdk` in src,tests | 0 | - |
| M-002 | `setPermissionMode\|setModel` call sites in src/agents | 2 | src/agents/sdk-agent-session.ts |
| L-001 | `resolveLiveTranscriptTarget` callers | 2 | src/main/app/resume-service.ts / src/main/app/composition-root.ts:381 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 1
