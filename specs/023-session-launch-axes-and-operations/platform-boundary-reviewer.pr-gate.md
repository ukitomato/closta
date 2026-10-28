# platform-boundary-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28T09:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Gate**: pr-gate Round 1
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (権限モードを安全 3 値に閉じる: IPC の `checkSetPermissionModeArgs`、decoder の `isSafePermissionMode`、`assertSafePermissionMode`、項目 16)、FR-005 / FR-006 (モデルをカタログに閉じる)、FR-009〜FR-011 (改名を受け付ける条件、`CLAUDE_CONFIG_DIR` の env、`dir` を渡さない、`AGENT_SDK_CALL_FILES` で 1 ファイルに縛る)、FR-014 (書き戻さない)、FR-017 (allowlists と fixture)、SC-001 / SC-002 / SC-003 / SC-004
- touched files に該当する charter / Confirmation: Constitution Principle III (権限ゲート)、Principle VI (`PROCESS_SPAWN_MODULES` への追加は AD-063 で ADR 化済み)、Principle VII (`rename-session.ts` は electron を import せず、`parentPort` を構造的に取り出す)、AD-004 / AD-028 (改名の config ディレクトリは列挙対象から決める)、AD-062 Decision 1 / 4 / 5 と Confirmation、AD-063 Decision 1〜3、`tests/rule-fixtures/expected.mjs` の UNDETECTED_NOTES (SC-017 の追跡)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: 差分はランタイムの選択・検出、隔離の処理、`capabilities` に触れておらず、runtime / isolation charter の Out of scope を侵していない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

023 は動いているセッションの権限モード (安全 3 値の中だけ) とモデル (Provider のカタログの中だけ) を `Query.setPermissionMode` / `setModel` で切り替える。名前は、env を固定した短命の `utilityProcess` が `renameSession()` で付ける。

**PB-1 (パス型の消失)**: 改名の IPC が運ぶのは `sessionId` と名前だけで、パスは運ばない。config ディレクトリは main 側で決まる。`resolveLiveTranscriptTarget` → `sessions.transcriptTarget(targetKey)` → `buildTranscriptEnv` の順で、transcript 取得と同じ結線を使う (`src/main/app/composition-root.ts:380-389`)。子には `dir` を渡さない (`src/agents/rename-session.ts:60`)。renderer からパスが入る経路は 0 件。`live-transcript-target.ts:37` の `as RuntimeNamespaceId` は resume-service から移したもので、今回の差分で新しく入ったものではない。

**PB-2 (単一インスタンス仮定)**: 該当なし。`createRenameSpawner()` は composition root で作る 1 インスタンスで、子の追跡は閉包の `Set` が持つ。列挙対象は runtimeId の名前空間で絞る (`live-transcript-target.ts:37-41`)。

**PB-3 (`capabilities` の虚偽表明)**: 該当なし。ランタイムの `capabilities` に触れていない。`src/domain/capability.ts` の変更は renderer の capability API にメソッドを足しただけ。

**PB-4 (権限ゲートの迂回)**: 権限モードの入口は 3 つあり、すべて安全 3 値で閉じている。
- IPC: `validate.ts` の `checkSetPermissionModeArgs` が `isSafePermissionMode` で検査する
- 汎用の `controlSession`: `session-ipc.ts` が kind を固定して組むので、renderer は `set-permission-mode` を注入できない (`session-ipc.ts:328-459`)
- セッションスレッド: decoder の `isSafePermissionMode` (`session-core.ts:478-482`) と、呼び出し直前の `assertSafePermissionMode` (`sdk-agent-session.ts` の controlSink)

`control-result` は requestId・sessionId・世代の 3 つを照合する (`session-launch-service.ts:345-349`)。e2e の偽物も型付きの mode だけを受ける。

**PB-5 (多段パス変換)**: 該当なし。docker endpoint を扱わない。

**PB-6 (永続環境の構築)**: 該当なし。名前は transcript の custom-title の追記だけで、Closta 側には永続化しない。

**code-gate からの引き継ぎ**:
- code-gate の H-001 (テストファイルを ADR なしで `PROCESS_SPAWN_MODULES` に登録) は AD-063 で ADR 化された。allowlists のコメントも AD-063 を参照しているので解消とみなす。`PROCESS_SPAWN_MODULES` を使う検査は項目 7 だけ (`check.mjs:367`) で、AD-063 の「項目 7 だけを許可」と一致する
- code-gate の M-002 (`queryHandle` の型が SDK の 6 値の `PermissionMode` まで広がった) は未修正のまま。Medium で、再掲しない

## Findings

### [Medium] 項目 14 は SDK の再 export と、リテラルでない specifier の動的 import を捕まえない。それなのに UNDETECTED_NOTES の記録だけ消した (M-001) (scope: feature)

- **観察**:
  - 静的 import の検査は `import { ... } from '<sdk>'` の形しか見ない (`scripts/constitution/check.mjs:689-692`)
  - 動的 import の検査は、specifier が文字列リテラルの `import('<sdk>')` / `require('<sdk>')` しか見ない (`check.mjs:709-715`)
  - SDK のパッケージ名を含まないファイルは走査されない (`check.mjs:668`)

  このため次の 3 経路が通る:
  - (a) `src/agents/x.ts` に `export { tagSession } from '@anthropic-ai/claude-agent-sdk'` (または `export *`) を置く。x.ts の finding は 0 件になる。x.ts から import する y.ts は SDK の名前を含まないので走査から外れる。結果として `tagSession` / `deleteSession` / `forkSession` を `src/agents/` のどこからでも呼べ、`renameSession` を `rename-session.ts` 以外からも呼べる
  - (b) `const p = '@anthropic-ai/claude-agent-sdk'; (await import(p)).tagSession()` は `:711` の regex に掛からない
  - (c) テンプレートや連結で組んだ specifier は、ファイルが SDK の名前を含まないので走査ごと外れる

  一方 `tests/rule-fixtures/expected.mjs` では、UNDETECTED_NOTES の `sdk-forbidden-call-alias` が丸ごと消された (diff の `-'sdk-forbidden-call-alias': {...}`)。消えた記録の `why` は「`(await import(...)).renameSession()` の動的 import」を限界として明記していた。fixture のコメントも「AD-034 §3 が明記した限界を閉じた」と書いている (`expected.mjs:476-477`)。
- **同種事象探索**: 次の検索はいずれも 0 件。今これらの経路を使っている実装は無い。
  - `export\s*(\*|\{)[^;]*from\s*['"]@anthropic-ai/claude-agent-sdk` (src/ と tests/)
  - `re-?export|export \{|export \*` (`tests/rule-fixtures/expected.mjs`。fixture も UNDETECTED_NOTES の記録も無い)
- **リスク/影響**: AD-062 Decision 5 の前提は、改名の IPC ができたことで AD-034 決定 3 の第一の担保 (書き込みを起こす IPC が無いこと) が崩れる、という点にある。書き込み系 API を静的に止めるのは、今は項目 14 だけになった。その穴が残ったまま、記録 (SC-017 の追跡) だけが消えている。期待表に「捕まる」と書いて捕まらない状態で、これは expected.mjs 冒頭が禁じている形にあたる。迂回する実装は 0 件なので、扱いは defense-in-depth。
- **推奨アクション**: 次のどちらか。
  - 塞ぐ: SDK のパッケージ名を含むファイルについて、値の再export (`export { X } from '<sdk>'` / `export * from '<sdk>'`。`export type` は除く) と、`import(` / `require(` の引数がリテラルでない形を項目 14 の違反に足す。`b-equivalent/` に再 export の fixture を 1 件足す
  - 記録する: `UNDETECTED_NOTES` に新しいエントリ (例: `sdk-reexport-or-dynamic-specifier`) を作り、why / mitigatedBy / nextFeature / howToClose を書く (SC-017)
- **根拠**: AD-062 Decision 5 / Confirmation、Constitution Principle IV、AD-034 決定 3、SC-017 (expected.mjs の `none` の規範)、PB-7
- **scope 根拠**: touched files (`scripts/constitution/check.mjs` / `tests/rule-fixtures/expected.mjs`) の中で直せる。code-gate M-001 と同じ事象で、未修正のまま残っている

### [Medium] AD-062 Decision 5 で足した SDK の動的 import / require の検査に、発火を確かめる rule fixture が無い (M-002) (scope: feature)

- **観察**: `check.mjs:709-715` に `SDK を動的 import / require している` の分岐が足されたが、それを通る fixture が `tests/rule-fixtures/` に無い。023 で足した fixture は次の 4 件だけ。
  - `sdk-set-permission-mode-unwrapped`
  - `sdk-set-permission-mode-wrapper-escape`
  - `sdk-forbidden-call-alias` (値の import の分岐で発火する)
  - `sdk-rename-session-outside`

  AD-062 の Confirmation も、fixture を「書き込み系 API の別名」についてしか書いていない。
- **同種事象探索**: `import\(\s*['"\x60]@anthropic|require\(\s*['"\x60]@anthropic|動的 import` を `tests/rule-fixtures` で検索すると、SDK の動的 import の fixture は 0 件。ヒットするのは別規則の `dynamic-import-fs.ts.fixture` と、expected.mjs:11 / :165 の説明文だけ。`SDK を動的 import|値として import` を `tests/` で検索しても 0 件で、メッセージで照合する単体テストも無い。
- **リスク/影響**: run.mjs の「77/77 matched」は、登録された fixture の発火だけを保証する。この分岐は、regex の書き換えや `AGENT_SDK_PACKAGE` の変更で一致が 0 件になっても、どの検証も赤くならない。これは PB-7 の「ルールが 1 件も一致しない形で書かれていないか」にあたる。
- **推奨アクション**: `b-equivalent/sdk-dynamic-import.ts.fixture` を足す。内容は `export async function bad() { const m = await import('@anthropic-ai/claude-agent-sdk'); return m.tagSession('x', 't') }`。target は `src/agents/__rulecheck__/...`、`detectors: ['constitution']`、`rules: ['#14']` とする。`require(` の形も 1 件あるとよい。
- **根拠**: AD-062 Decision 5、AD-027 (規則の発火の検証)、PB-7
- **scope 根拠**: touched file (`tests/rule-fixtures/expected.mjs`) と fixture の追加で直せる

### [Low] 項目 14 の「許可外の名前の呼び出し形」の分岐は、値の import では到達しなくなった。2 つの fixture が同じ分岐を確かめている (L-001) (scope: feature)

- **観察**: `check.mjs:721-724` で、許可外の名前を値として import すると `continue` する。そのため `:735-737` の呼び出し形の検査に届くのは型の import だけになった。ところが型の import は呼び出すと tsc が落とすので、この分岐は実質的に死んでいる。`a-direct/sdk-forbidden-call.ts.fixture` (直接の呼び出し) と `a-direct/sdk-forbidden-call-alias.ts.fixture` (再束縛) は、どちらも値の import の分岐で発火する。差分のうち確かめているのは片方だけになっている。
- **同種事象探索**: `許可外の SDK API を呼んでいる` を `check.mjs` で検索して 1 件 (`:736`)。これを期待する fixture は 0 件 (expected.mjs はメッセージではなく `#14` で照合している)
- **リスク/影響**: 保守性の問題。分岐の意味と fixture の説明 (「呼び出し形で発火」) が食い違う。
- **推奨アクション**: `:735-737` を消すか、型の import を呼ぶ形だけを見る分岐だとコメントで明記する。`sdk-forbidden-call` の `what` を「値の import で発火」に直す。
- **根拠**: PB-7
- **scope 根拠**: touched files の中

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `export\s*(\*\|\{)[^;]*from\s*['"]@anthropic-ai/claude-agent-sdk` in src,tests | 0 | - |
| M-002 | `import\(\s*['"\x60]@anthropic\|require\(\s*['"\x60]@anthropic\|動的 import` in tests/rule-fixtures | 0 (SDK 対象) | - |
| L-001 | `許可外の SDK API を呼んでいる` in check.mjs | 1 | scripts/constitution/check.mjs:736 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
