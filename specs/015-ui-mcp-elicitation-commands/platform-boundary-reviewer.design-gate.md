# platform-boundary-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-09 (design-gate R2)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-003 / FR-004 (PB-4: 承認カード)、FR-007 / FR-008 (PB-1 / PB-2: `init-report` の許可リストとセッションごとの保持)、FR-010 (PB-6: `plugin_install`)、FR-011 / SC-005 (PB-7: 項目 16 の P3)、SC-002 (PB-1: 通さないフィールド)
- 該当する charter / Confirmation: AD-036 §4 P3、AD-048 Decision 2 / 3 / 5 と Confirmation (SC-002 / SC-005)、AD-047 Decision 2、check.mjs 項目 16 (`check.mjs:917-924`)、`allowlists.mjs:419-427`、`tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の Out of scope に触れていない。R1 L-001 (WSL の決め打ち) は「このセッションを起動した環境で」(data-model.md:100, spec.md:146) で直っている
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (テストの観点は H-101 / M-101 の推奨に入れた。R1 の H-002 / M-001 / M-002 / M-004 / L-002 は BE-020 / FE-014 / BE-001 のテストで検出できるようになった)

## スコープ要約

R1 の指摘の手当てを確認した。H-002 (送るかの判定) は FR-007 / data-model.md:79 / BE-020 のテストで解消。M-001 は FR-004 / AC6 で解消。M-002 は O-4 がすでに `init.permissionMode` を読んでいる (`live-signals.ts:366-370`) ので解消。M-004 は BE-020 の `Equal<…>` で解消。L-002 は 64KB の上限 (data-model.md:76) で解消。L-003 は FR-013 で解消。M-003 は system scope に送った (plan #19 / SH-012)。H-001 は 11 個を足したので一部解消だが、SDK の `Query` の型 (`sdk.d.ts:2611-2972`) と突き合わせると、まだ穴が残っている (下の H-101)。

PB-1: `cwd` とプラグインの `path` は通さない。URI は解決しない。PB-2: dedupe の基準は `createLiveSignals` の closure で、セッションごとに作られる (`sdk-agent-session.ts:327`)。購読元は `sessionId` ごと (`LivePane.tsx:238-252`)。承認カードは同じ `LivePane` から名前を受ける。PB-3 / PB-5: 該当なし。PB-6: 永続化と導入はなく、`CLAUDE_CODE_SYNC_PLUGIN_INSTALL` も渡さない。

## Findings

### [High] 17 個に広げた P3 の denylist にも、スキルとタスクを操作する `Query` のメソッドが残っている。さらに pin テストの注記が、この穴を「ADR が要る」として固定してしまう (H-101) (scope: feature)

- **観察**: SDK 0.3.270 の `Query` (`sdk.d.ts:2611-2972`) のうち、`interrupt` と BE-040 の 17 個のどちらにも入らないメソッドが 10 個ある。`initializationResult`・`supportedCommands`・`supportedModels`・`supportedAgents`・`getContextUsage`・`usage_EXPERIMENTAL…`・`readFile` (:2820)・`reloadOutputStyles` (:2856)・`accountInfo`・`backgroundTasks` (:2962) である (`close` は `promptQueue.close()` と同じ綴りになるので除く)。
  - `reloadOutputStyles` の説明は「drops the shared markdown-file scan cache, so agents, skills and routines re-read their directories」(:2848-2852)。これは AD-048 Decision 2 の「スキルを操作しない」に当たる操作そのものである
  - `backgroundTasks` (:2949-2962) は実行中のタスクの状態を変える
  - `readFile` は cwd から相対でパスを解決し、セッション側のファイルを読む (:2811-2816)
- tasks.md:82 の pin テストは 17 個を固定し、「集合を変えるには ADR が要る」と注記する。spec.md:236 (SC-005) と quickstart.md:9 は「`Query` のメソッドの呼び出しは `interrupt` だけ」を合格の条件にしているが、検査は 17 個の名前しか見ない
- `package.json` は `^0.3.270` なので、SDK の版を上げて増えたメソッドも黙って通る
- **同種事象探索**: `\.\s*(…|readFile|backgroundTasks|reloadOutputStyles)\s*\(` を `src/agents` で検索して 0 件。足しても誤検出は出ない (`readFile` は `fs` と同じ名前なので、正規表現の対象には向かない)。`QUERY_MUTATION_METHODS` を参照しているのは 3 件 (`check.mjs:51,918`、`allowlists.mjs:420`)。AD-048:35 に 11 個の列挙
- **リスク/影響**: AD-036 §4 P3 (`interrupt` だけ) を、検査の上でも SC-005 の上でも「守った」と読めるのに、実際の歯止めは列挙した名前だけになっている。pin テストの注記があると、後から足すときに要らない ADR を求められる
- **推奨アクション**:
  - (1) BE-040 で `reloadOutputStyles` と `backgroundTasks` も足す。根拠は AD-036 §4 P3 そのものなので ADR は要らず、AD-048 の本文も変えない
  - (2) pin テストの注記を「**外す**には ADR が要る (足すのは P3 の範囲内)」に直す
  - (3) `tests/docs/` か `sdk-agent-session.test.ts` に型の網羅テストを置く。`keyof Query` を `'interrupt'`・`QUERY_MUTATION_METHODS`・「読み取りだけで呼ばない」の 3 つの表に分け、`Equal<Exclude<keyof Query, …>, never>` で固定する。そうすれば SDK の版を上げたときに tsc が落ちる。`readFile` と `close` はこの表で扱う
  - (4) SC-005 の「`interrupt` だけ」の計測経路に (3) を書く
- **根拠**: AD-036 Decision 4 §4 P3、AD-048 Decision 2、Principle III / IV
- **scope 根拠**: BE-040 と SC-005 の範囲で直せる。正の形への置き換えは引き続き system scope
- 追加事実 (R1 の H-001 からの継続): R1 では 11 個が無いことを指摘した。今回は SDK の型を全部並べて、AD-048 の 11 個に入っていない操作系のメソッド (`reloadOutputStyles`・`backgroundTasks`) を確かめた。Severity は R1 と同じ High

### [Medium] P3 はドット呼び出しの形しか見ない。同じ項目の P1 が塞いでいる計算キーの形を P3 は塞がず、その記録もない (M-101) (scope: feature / 検出器は system)

- **観察**: P3 は `new RegExp('\\.\\s*' + method + '\\s*\\(')` (`check.mjs:919`) だけで検査している。次の形は掛からない。
  - `q['reconnectMcpServer'](…)`
  - `const { reloadPlugins } = q; reloadPlugins()`
  - `q.reconnectMcpServer.call(q, …)`
  - 同じ項目 16 の P1 は、計算キー・引用符キー・代入の形を `bypassForms` で塞いでいる (`check.mjs:827-853`)。塞げない形は `UNDETECTED_NOTES` に書いている (:832-833、`expected.mjs:649`)。P3 にはどちらも無い
- BE-040 の fixture はドット呼び出しの 1 本だけである (tasks.md:82、research.md:53)
- **同種事象探索**: `bypassForms|UNDETECTED_NOTES` で `check.mjs:837`、`expected.mjs:236,340,375,474,649` の 6 件。いずれも P1 か他の項目で、P3 に当たるものは 0 件
- **リスク/影響**: FR-011 で「検査を広げた」と言える範囲は、ドットで呼ぶ形に限られる。H-101 の (3) は型の面を固め、本件は呼び出しの綴りの面を固める
- **推奨アクション**: BE-040 で P3 に計算キーの形 (`\[\s*['"\x60]method['"\x60]\s*\]\s*\(`) を足し、fixture を 1 本置く。分割代入と `.call` は `UNDETECTED_NOTES` に理由と代替を書く。代替は H-101 (3) と、system scope の `queryHandle` の型を `Pick<Query,'interrupt'> & AsyncIterable<SDKMessage>` に絞る案
- **根拠**: AD-036 §4 P3、PB-7

### [Low] その他の名前の allowlist は `/` を通すので、絶対パスの形の名前も形の検査に通る (L-101) (scope: feature)

- **観察**: data-model.md:70 の規則は `^[A-Za-z0-9_.:@/-]{1,128}$` で、禁じているのは `//` だけである。`/home/alice/proj/.claude/skills/x` のような名前も通って、構成のタブに出る。AD-048 Decision 3 と FR-007 は `cwd` とプラグインの `path` を通さないと決めているが、名前のフィールドにパスが入った場合の規則は無い。SDK がパスの形の名前を出すことはまだ観察していないので Low にした
- **同種事象探索**: `A-Za-z0-9_.:@/-` で data-model.md:70 の 1 件
- **推奨アクション**: 先頭の `/` と `~` を外す規則を足す (`^(?![/~])`)。BE-001 のテストに、パスの形のスキル名とコマンド名が落ちて `omitted` に数えられるケースを足す
- **根拠**: AD-048 Decision 3、Principle I (パスは名前空間を持つ値として扱い、表示の名前に混ぜない)

### 固有観点の記録

- PB-1: 該当なし。通さないフィールドは data-model §2 の許可リストで、SC-002 / SH-020 の目印のテストがある。パスの形の名前は L-101
- PB-2: 該当なし。dedupe の基準・連番・購読元はどれもセッションごとに作られる (`live-signals.ts:127-162`、`LivePane.tsx:238-252`)
- PB-3: 該当なし。`capabilities` は読まず、能力の表明にも触れていない
- PB-4: R1 の M-001 と M-002 は解消した。承認の応答 (`toPermissionResult`) は変えない
- PB-5: 該当なし。パスの変換は無い
- PB-6: 該当なし。永続化・導入・設定ファイルの書き込みは無い
- PB-7: H-101 と M-101

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `\.\s*(mcpServerStatus\|…\|readFile\|backgroundTasks\|reloadOutputStyles)\s*\(` in src/agents | 0 | — |
| H-101 | `QUERY_MUTATION_METHODS` | 3 | check.mjs:51,918 / allowlists.mjs:420 |
| H-101 | `^    [a-zA-Z]+\(` in sdk.d.ts の Query | 28 | sdk.d.ts:2625-2971 |
| M-101 | `bypassForms\|UNDETECTED_NOTES` | 6 | check.mjs:837 / expected.mjs:236,340,375,474,649 |
| L-101 | `A-Za-z0-9_.:@/-` (specs/015) | 1 | data-model.md:70 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 1
- Round inheritance: resolved from R1: 8 (H-002 / M-001 / M-002 / M-004 / L-001 / L-002 / L-003 と、M-003 の system scope への送り) / unresolved: 1 (H-001 は一部だけ解消し、H-101 として継続) / new: 2 (M-101 / L-101)
