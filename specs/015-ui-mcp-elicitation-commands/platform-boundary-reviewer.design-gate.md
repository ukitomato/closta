# platform-boundary-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-10 (design-gate R3)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-004 (PB-4: 承認カード。応答は変えない)、FR-007 / FR-008 (PB-1 / PB-2: `init-report` の許可リストとセッションごとの保持)、FR-010 (PB-6: `plugin_install`)、FR-011 / SC-005 (PB-7: 項目 16 の P3、`keyof Query` の網羅)、SC-002 (PB-1: 通さないフィールド)
- 該当する charter / Confirmation: AD-036 §4 P3、AD-048 Decision 2 / 3 / 5、`check.mjs:917-924` (項目 16 の P3)、`allowlists.mjs:420-427`、`sdk-agent-session.ts:91-108` (型の一致の並び)、`tsconfig.node.json:3-11`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の Out of scope に触れない。案内の文言は「このセッションを起動した環境で」のままで、WSL の決め打ちに戻っていない (data-model.md:109)
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (M-202 のずれを捕まえるテストが無い)

## スコープ要約

R2 の H-101 (= gate H-03) の手当てを確かめた。BE-040 (tasks.md:86) は `QUERY_MUTATION_METHODS` を 6 → 19 に広げる (`reloadOutputStyles` / `backgroundTasks` を含む)。pin テストの注記は「外すには ADR」になった。`keyof Query` の 3 分類による網羅 (`Equal<Exclude<…>, never>`) を置き、SC-005 (spec.md:237) と quickstart V-1 (quickstart.md:7,9) にその計測経路を書いた。SDK 0.3.270 の `Query` の自前のメソッドは実際に 29 個ある (`sdk.d.ts:2625-2971`)。内訳は interrupt 1・変更系 19・読み取り 9 で research R-06 の分類と一致する。よって H-101 は解消した。

ただし R2 M-101 (= gate M-12) と L-101 (= gate L-19) は文書に反映されておらず未解消 (Grep `計算キー|UNDETECTED_NOTES|\^\(\?!` は 6 文書で 0 件)。新しく見つけたのは (a) 型の網羅の変更系 union と JS の `QUERY_MUTATION_METHODS` を機械でつなぐものが無い、(b) 「呼ばない読み取り」の 9 個の呼び出しを自動で見る検査が無い、の 2 つ。

## Findings

### [Medium] 型の網羅の「変更系」の union と `QUERY_MUTATION_METHODS` (JS) が 2 つの別の列挙のままで、機械でつながっていない。SDK の版上げで増えた変更系のメソッドを union にだけ足すと、tsc も pin テストも緑のまま項目 16 が見逃す (M-202) (scope: feature) [new]

- **観察**:
  - tasks.md:86 は union を「19 個の union。pin テストと同じ名前」とする。union は `sdk-agent-session.ts` の型 (tsc が見る) にあり、pin テストは `tests/docs/query-mutation-methods.test.ts` で JS の配列 (`allowlists.mjs:420`) を 19 個に固定する
  - `tsconfig.node.json:3-11` の include は `tests/setup/**` だけなので `tests/docs/` は型検査の対象外。pin テストの側で型を突き合わせることもできない
  - research.md:55 (2) の「変更系なら (1) の集合と pin テストも同じ PR で足す」は人の手順にすぎない
- **具体的な経路**: SDK の版上げで `Query.foo()` (変更系) が増える → tsc が網羅で落ちる → 開発者が `foo` を union に足して tsc が通る → JS の集合は 19 のままなので pin テストも通る → `check.mjs:918-919` は `.foo(` を見ないので項目 16 は緑
- **同種事象探索**: `QUERY_MUTATION_METHODS` を repo 全体 (node_modules を除く) で 10 ファイル。コードは `allowlists.mjs` / `check.mjs` の 2 つだけで、`tests/` と `src/` は 0 件。union と配列をつなぐ参照は 0 件
- **リスク/影響**: 型の網羅は「分類したか」を固定するだけで、分類が検出器の集合と一致することは誰も確かめない。AD-036 §4 P3 の歯止めが版上げで静かに外れる
- **推奨アクション**: BE-040 に次のどちらかを足す
  - (a) pin テストが `src/agents/sdk-agent-session.ts` を文字列として読み、変更系の union の文字列リテラルを抜き出して `new Set(QUERY_MUTATION_METHODS)` と等しいことを確かめる。union は 1 か所の `type QueryMutationMethod = 'a' | 'b' | …` に書く
  - (b) union を `src/agents/` の SDK を import しないモジュールに `as const` の配列として置き、型は `[number]` で作る。pin テストはその配列と JS の集合が等しいことを確かめる
  - どちらの場合も pin テストの注記と research R-06 (2) をこの照合で強制する書き方に直す
- **根拠**: AD-036 Decision 4 §4 P3、Principle III / IV、PB-7
- **scope 根拠**: BE-040 と同じファイル群で直せる

### [Medium] P3 はドット呼び出しの形しか見ない。計算キーの形は塞がれず、`UNDETECTED_NOTES` への記録も無い (M-201) (scope: feature / 検出器は system) [unresolved from prev M-101]

- **観察**: `check.mjs:919` は今も `\.\s*method\s*\(` だけ。BE-040 (tasks.md:86) の fixture は `.reconnectMcpServer(` の 1 本で、計算キーの形 (`q['reconnectMcpServer'](…)`) の検出も `UNDETECTED_NOTES` への記録も無い。同じ項目 16 の P1 は計算キーを `bypassForms` で塞いでいる (`check.mjs:837-845`)
- **同種事象探索**: specs/015 の 6 文書で `計算キー|UNDETECTED_NOTES` を 0 件。`check.mjs` の P3 の節 (:917-924) にも 0 件
- **リスク/影響**: FR-011 の「広げた」と言える範囲はドットで呼ぶ形に限られる
- **推奨アクション**: BE-040 で P3 に計算キーの形 (`\[\s*['"\x60]method['"\x60]\s*\]\s*\(`) を足し fixture を 1 本置く。分割代入と `.call` は `UNDETECTED_NOTES` に理由と代わりの手段 (system scope の `queryHandle` の型の絞り込み) を書く
- **根拠**: AD-036 §4 P3、PB-7

### [Low] 「呼ばない読み取り」の 9 個の呼び出しを自動で見る検査が無い。それでも SC-005 の計測経路は自動の検査だけで満たしたように読める (L-202) (scope: feature) [new]

- **観察**: SC-005 (spec.md:237) の計測経路は固定テスト・`keyof Query` の網羅・項目 16 の fixture・`git diff`。網羅は分類しかせず、項目 16 は変更系の 19 個しか見ない。`initializationResult` / `supportedCommands` / `accountInfo` / `readFile` などの呼び出しは quickstart V-1 (quickstart.md:9) の目視でしか捕まらない。`readFile` (`sdk.d.ts:2820`) は AD-036 §4 P3 の「`interrupt` だけ」の範囲に入る
- **同種事象探索**: `src/agents` で Query メソッド名の呼び出しを検索して 7 件。`Query` のメソッドの呼び出しは `sdk-agent-session.ts:473` の `interrupt` だけ
- **推奨アクション**: SC-005 の計測経路に「読み取りの 9 個の呼び出しは quickstart V-1 の目視で確かめる (自動の検出は system scope の正の形)」と明記する。あるいは `readFile` / `close` を除く 7 個を P3 の別の配列として検出に足す
- **根拠**: AD-036 §4 P3、PB-7

### [Low] その他の名前の allowlist は `/` を通すので、絶対パスの形の名前も形の検査を通る (L-201) (scope: feature) [unresolved from prev L-101]

- **観察**: data-model.md:71 は今も `^[A-Za-z0-9_.:@/-]{1,128}$` で、禁じているのは `//` だけ。BE-001 のテスト (tasks.md:31) にもパスの形の名前のケースは無い
- **推奨アクション**: `^(?![/~])` を足し、BE-001 に「パスの形のスキル名・コマンド名が落ちて `omitted` に数えられる」ケースを足す
- **根拠**: AD-048 Decision 3、Principle I

### 固有観点の記録

- PB-1: 該当なし。`cwd`・`plugins[].path` は許可リストの外 (data-model.md:61)。パスの形の名前は L-201
- PB-2: 該当なし。`mcpServerNames()` は `LiveSessionPane` ごとに `meters[sessionId]` から作り (tasks.md:46)、判定の基準は `createLiveSignals` の closure (tasks.md:60)
- PB-3: 該当なし。`capabilities` は読まない (data-model.md:61)
- PB-4: 該当なし。`toPermissionResult` は変えず (FR-004)
- PB-5: 該当なし。パスの変換は無い
- PB-6: 該当なし。永続化・導入・設定ファイルの書き込みは無い
- PB-7: M-201 / M-202 / L-202。H-101 は解消した

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-202 | `QUERY_MUTATION_METHODS` (repo, node_modules を除く) | 10 ファイル (コードは 2) | scripts/constitution/allowlists.mjs:420 / check.mjs:51,918 |
| M-202 | `tsconfig.node.json` の include | 1 | tsconfig.node.json:3-11 |
| M-201 | `計算キー\|UNDETECTED_NOTES` (specs/015) | 0 | — |
| L-202 | Query メソッド名の呼び出し in src/agents | 7 | sdk-agent-session.ts:384,473,499,505,518 / supervisor-core.ts:134 / transport.test.ts:255 |
| L-201 | `A-Za-z0-9_.:@/-` (specs/015) | 1 | data-model.md:71 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved from R2: 1 (H-101 = gate H-03) / unresolved: 2 (M-201 = gate M-12、L-201 = gate L-19) / new: 2 (M-202 / L-202)
