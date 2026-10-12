# platform-boundary-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-007 / SC-002: `init` は `cwd` やプラグインの `path` を運ばない (PB-1)
  - FR-011 / SC-005: 項目 16 P3 の拡張 (PB-7 / Principle III)
  - FR-004: `toPermissionResult` を変えない (PB-4)
  - その他の FR は担当外
- touched files に該当する charter / Confirmation:
  - `scripts/constitution/check.mjs` 項目 16 P3
  - `scripts/constitution/allowlists.mjs` `QUERY_MUTATION_METHODS` (6 個から 21 個になった)
  - `tests/rule-fixtures/expected.mjs` `UNDETECTED_NOTES['sdk-query-method-indirect']`
  - `src/agents/sdk-agent-session.ts` の型による分類 (`QueryMutationMethod` / `QueryUnusedReadMethod`)
  - `docs/roadmap.md:295-303`
  - runtime / isolation の charter に当たる touched files はない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer が owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer が owner
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter に当たる touched files がない。diff で追加された行のうち `autoModeSafe` / `HostPath` / `RuntimePath` / `process.platform` / `docker` / `wsl.exe` / `--restart` / `volume create` / `electron` / `path` の import に当たるものは 0 件。`permissionMode` の出現は docs とテストの fixture だけ
- D. Constitution / ADR drift: 該当なし: Principle I / II / VI / VII に当たる追加は 0 件。`queryHandle` の参照は今も `sdk-agent-session.ts:373,542,615,616` だけ (`interrupt` と for-await)。承認の応答の経路は不変
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 2 の差分では、MD-10 (Round 1 の自分の L-001 と、architecture の M-001 を統合したもの) が直っている。

- `getContextUsage` と `usage_EXPERIMENTAL…` は denylist に移った (`allowlists.mjs:454-455`、`sdk-agent-session.ts:164-165`)。
- 次の 2 点が記録に書き足された (`expected.mjs:872-874`、`sdk-agent-session.ts:136-139`、`roadmap.md:299-300`)。
  - `QueryUnusedReadMethod` の分類は呼び出しを禁じない。
  - `close` は `promptQueue.close()` と綴りが衝突するので denylist に足せない。

MD-09 (Round 1 の自分の M-001) は直っていない。PB 観点ごとの結果は次のとおり。

- **PB-1**: Round 1 から変わっていない。`INIT_REPORT_FIELDS` / `pickPlugin` が `cwd` とプラグインの `path` を通さない。
- **PB-2 / PB-3 / PB-5 / PB-6**: 該当なし。ランタイム、capabilities、パスの変換、永続化に触れる差分が無い。
- **PB-4**: 該当なし。`ApprovalCard` の差分は表示だけ。
- **PB-7**: MD-09 が残っている。eslint の差分は `mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` を `GENERATED_FILES` 系の緩和に足していない。手書きのファイルとして、通常の規則の対象のまま (`eslint.config.mjs:591-597` の hunk)。

## Round inheritance

| 前 Round ID | 状態 | 根拠 |
|---|---|---|
| MD-09 (自分の M-001) | **unresolved** | `check.mjs:918-920` のコメントと `expected.mjs:863-867` の `why` が挙げるのは、今も分割代入・`.call` / `.apply`・変数のキーだけ。regex (`check.mjs:922`) も変わっていない |
| MD-10 (自分の L-001 + architecture M-001) | **resolved** | `expected.mjs:872-874` に「**この分類は呼び出しを禁じない**」と `close` の衝突が書かれた。`getContextUsage` / `usage_EXPERIMENTAL…` は `allowlists.mjs:454-455` と `sdk-agent-session.ts:164-165` で denylist に移り、型の union と配列が一致している。`roadmap.md:299-300` にも反映された |

## Findings

### [Medium] 項目 16 P3 が検出しない呼び出しの形の一部が、まだ UNDETECTED_NOTES と roadmap に書かれていない (MD-09 持ち越し) (M-001) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:922` の `dotCall` は `\.\s*m\s*\(` のままで、メソッド名の直後に `(` が来る形しか拾わない。次の形はどれも一致しない。
  - `q.reloadPlugins?.()`
  - `q.reloadPlugins!()`
  - `q.reloadPlugins<void>()`
  - `(q.reloadPlugins)()`
  - `q.reloadPlugins.bind(q)()`

  `computedKeyCall` (`:923-925`) も同じで、`]\s*\(` を求めるので `q['reloadPlugins']?.()` を拾わない。一方、`check.mjs:918-920` のコメント、`expected.mjs:863-867` の `why`、`roadmap.md:300-301` が挙げる取りこぼしは分割代入・`.call` / `.apply`・変数のキーの 3 種だけである。`expected.mjs:865` の「`?.m(`」は `q?.m(` の形で、`dotCall` が拾える。`q.m?.(` は別の形で、拾えないのに書かれていない。
- **同種事象探索**: `queryHandle` in src/agents (非テスト) で 4 件 (`src/agents/sdk-agent-session.ts:373,542,615,616`)。呼び出しは `interrupt` と for-await だけで、上の形で mutation メソッドを呼んでいる箇所は 0 件。
- **リスク/影響**: 今は実害が無い。ただ、`mitigatedBy` (`expected.mjs:876`) は間接の呼び出しを reviewer の目視に任せている。その目視が頼る記録に穴の一部が載っていないので、後続の reviewer と項目 16 の持ち主が数え落とす。`?.()` は普通に書かれる形である。
- **推奨アクション**: 最小案は記録への追記で、regex は変えない。次の 3 か所に「`.m?.(`・`['m']?.(`・`.m!(`・`.m<T>(`・`(q.m)(`・`.m.bind(q)(`」を足す。
  - `expected.mjs:866` の `why`
  - `check.mjs:919` のコメント
  - `roadmap.md:300`

  代わりに regex を `\.\s*m\s*(?:\?\.|!|<[^>(]*>)?\s*\(` に広げ、計算キーの側にも同じ `(?:\?\.|!)?` を足して、`b-equivalent` の fixture を 1 本足してもよい。
- **根拠**: Constitution Principle III / AD-036 §4 P3 / AD-048 Decision 2 / FR-011 / SC-005 / PB-7
- **scope 根拠**: `check.mjs` / `expected.mjs` / `roadmap.md` はすべて touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `queryHandle` in src/agents (非テスト) | 4 | src/agents/sdk-agent-session.ts:373,542,615,616 |
| M-001 | `\?\.\(\|bind` in scripts/constitution/check.mjs (記録されていないことの確認) | 0 (項目 16 の範囲) | check.mjs:918-920 |

## H (テスト / regression) の根拠

- **PB-1**: `LEAK-cwd` / `LEAK-plugin-path` / `LEAK-capability` (`src/agents/live-signals.test.ts`) と `tests/meter/meter-through.test.tsx` が引き続き防いでいる。
- **PB-7 (MD-10 の修正)**:
  - `getContextUsage` / `usage_EXPERIMENTAL…` は型の union (`sdk-agent-session.ts:164-165`) と配列 (`allowlists.mjs:454-455`) の両方に入った。2 つの一致は `tests/docs/query-mutation-methods.test.ts` が固定している。
  - `queryMethodsAreClassified` (`sdk-agent-session.ts:175`) により、SDK の版上げで出た分類漏れは tsc が落とす。
  - この Round の rules runner は 66 件すべてが期待どおりだった。denylist を広げても、既存の agents のソースで誤検出は出ていない。
- **M-001**: 最小案は記録の追記なのでテストは要らない。regex を広げる案なら fixture 1 本で検出できる。

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 0
- Round inheritance: resolved from 1: 1 (MD-10) / unresolved: 1 (MD-09) / new: 0
