---
status: accepted
date: 2026-09-29
id: AD-040
deciders: ukitomato
tags: [provider, session, auth, security, sdk]
supersedes: []
superseded-by: []
---

# AD-040: helper 委譲の `Options.settings` は 2 キー限定の制約付き射影として許す（AD-036 §4 P1 ↔ AD-039 D2 の調停）

## Context

X-3（Provider 登録と到達可能性判定）の design-gate Round 1 で platform-boundary-reviewer が Critical (C-001) を挙げた。
2 つの accepted ADR が調停されないまま衝突している:

- **[AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P1**（X-1、accepted・immutable）:
  `query()` options のキー集合を
  `{permissionMode, canUseTool, spawnClaudeCodeProcess, pathToClaudeCodeExecutable, abortController}` の
  **完全部分集合に固定**し、`settings` / `extraArgs` / `allowedTools` 等を**一切含めない**。理由は
  `Settings.permissions.defaultMode`（sdk.d.ts）経由で `settings` が `bypassPermissions` / `auto` へ遷移できる
  **昇格レバー**だから（Principle III）。機械強制は `scripts/constitution/allowlists.mjs` の
  `QUERY_ESCALATION_OPTION_KEYS`（先頭が `settings`）と `scripts/constitution/check.mjs` 項目 16 が
  `src/agents/` に `settings:` キーが現れると違反にする形で生きている。

- **[AD-039](0039-credential-delegation-verified.md) D2**（X-3 前提、accepted 2026-09-29）:
  `api-key-helper` / `aws-credential-export` の helper パスを **per-session の inline `Options.settings`**
  （inline `Settings` オブジェクト）として渡す。グローバル `~/.claude/settings.json` を汚さないため。

AD-039 は AD-036 に一切言及も supersede もしていないため、helper 委譲（AD-039 D2）を実装しようとすると
AD-036 §4 P1 の allowlist と項目 16 に**必ず違反する**。X-3 の中核機構（委譲の 2 方式）が既存の権限ゲート契約と
正面衝突しており、調停なしには implementing に進めない。

## Decision

**`query()` options の `settings` を、キー集合が `{apiKeyHelper, awsCredentialExport}` の完全部分集合である
場合に限り許す。それ以外の `Settings` キー（`permissions` / `permissionMode` / `env` / `allowedTools` 等）を
含む `settings` は従来どおり禁止する。**

昇格面（Principle III）は「`settings` を全面禁止」から「**helper パス 2 キー以外を含む `settings` を禁止**」へ
**穴を狭める** — 塞ぐ範囲は変えず、helper 委譲の 1 経路だけを検証済みで通す。

1. **型で閉じる**: helper を運ぶ値の型を `Settings` 全体でなく
   `type HelperSettings = { apiKeyHelper?: string; awsCredentialExport?: string }` に絞る。
   `deriveLaunchEnv` が返す `DerivedLaunchEnv.settings?` はこの型であり、`Settings` 全体を組み立てられない。
2. **実行時 assert で閉じる**: `query()` に渡す直前に `settings` のキー集合 ⊆ `{apiKeyHelper, awsCredentialExport}`
   を明示述語で検証する（`as` キャスト禁止。逸脱は throw）。Provider 由来データ（`extraEnv` 等ユーザ入力）から
   `permissions` / `permissionMode` / `env` が混入する経路を作らない。
3. **一次ゲート (`buildQueryOptions`) を通す**: AD-036 §4 P1 の正の構成 allowlist の**実装本体**は
   `src/agents/session-core.ts` の `buildQueryOptions`（戻り型 `BuiltQueryOptions` は 5 キーちょうどで
   `settings` を持たず、spread/merge/別変数からの追加キーを作らない）。helper 委譲を通すには、この一次ゲートの
   `BuiltQueryOptions` / `BuildQueryOptionsDeps` に **`settings?: HelperSettings` を*オブジェクトリテラルで*追加**し、
   後段 spread/append を作らない。**`buildQueryOptions` の出力に後から settings を append してはならない**
   （P1 が禁じた「別変数からの追加キー」に相当し正の構成をバイパスするため）。settings を options に載せる主体は
   一次ゲート `buildQueryOptions`（X-1 コードの改修）であり、query 直前の実行時 assert（下記 4）は backstop である。
4. **backstop 機械強制を更新する**: `check.mjs` 項目 16 / `QUERY_ESCALATION_OPTION_KEYS` を
   「`settings` キー全禁止」から「`settings` は許すが、その値のキー集合が `{apiKeyHelper, awsCredentialExport}` を
   超えたら違反」へ改める。`allowlists.mjs` に `QUERY_SETTINGS_ALLOWED_KEYS = ['apiKeyHelper', 'awsCredentialExport']`
   を追加し、違反 fixture（3 キー目を混ぜた `settings` が検出される）を `tests/rule-fixtures/` に置く。
   **項目 16 は grep ベースの backstop であり、`settings: someVar` の変数形は中身を見られない** — load-bearing gate は
   一次ゲート（3）と query 直前の実行時 assert（HelperSettings 型 + `Object.keys ⊆ allowlist`）である。

## Consequences

- AD-036 §4 P1 の**趣旨（昇格レバーを締め出す）は維持**され、塞ぐ面積は 2 キー分だけ狭まる。AD-036 は
  immutable なので本 ADR が §4 P1 の enforcement を**追記的に精緻化**する（wholesale supersede しない）。
- AD-039 D2 の設計（helper = per-session inline settings）は**変更不要でそのまま成立**する。
- `permissionMode` は依然 `settings` 経由で渡せない（`Options.permissionMode: 'default'` リテラル固定のまま）。
  `settings.permissions` / `settings.env` も禁止のまま。Principle III の昇格経路は 0 件を維持。
- **代償**: 機械強制（項目 16）が「キー存在」判定から「キー集合の部分集合」判定へ複雑化する。違反 fixture で
  「3 キー目が検出される」ことを担保する（穴を広げていないことの証跡）。
- X-3 の `deriveLaunchEnv` は `{ env, settings?: HelperSettings }` を返す。**一次ゲート `buildQueryOptions`
  （`src/agents/session-core.ts`）の改修は X-3 が行う**（`settings?: HelperSettings` をリテラルで受ける）。
  実際に Provider を選んで起動する配線（`deriveLaunchEnv` の呼び出しと launch への合流）は X-4 が行う。
  **実行時 assert（上記 2）の呼び出しは agents（`sdk-agent-session.ts`）の query 直前 1 箇所に集約**する。

## Confirmation

- **一次ゲート**: `buildQueryOptions` の `BuiltQueryOptions` に `settings?: HelperSettings` がリテラルで加わり、
  helper 方式で settings が query options に**現れる正例テスト** + 後段 append が無いことの構造確認。
- **backstop**: `check.mjs` 項目 16 が「`settings` に helper 2 キー以外が現れたら違反」を検出する（違反 fixture が発火）。
  ただし grep backstop であり `settings: someVar` 変数形は捕捉しづらい（load-bearing gate は下記 2 つ）。
- `deriveLaunchEnv` の戻り値型が `HelperSettings` に限定され、`permissions`/`permissionMode`/`env` を型で持てない。
- query 直前の実行時 assert が `settings` キー集合 ⊆ allowlist を検証し、逸脱を throw する単体テスト（負例含む）。
- SC-006 に「導出 `Settings` が helper パス 2 キー以外を含まない（permissions/permissionMode 0 件）」の assert。
  **SC-006 の主保証は `HelperSettings` 型 + query 直前実行時 assert であり、項目 16 fixture は綴りの backstop（grep 被覆限界あり）**。

## References

- [AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P1 — query options allowlist（本 ADR が enforcement を精緻化）
- [AD-039](0039-credential-delegation-verified.md) D2 — helper = per-session inline settings（本 ADR が成立を担保）
- Constitution Principle III — 権限モードはランタイムの capability に従う（昇格面 0 件を維持）
- `scripts/constitution/allowlists.mjs`（`QUERY_ESCALATION_OPTION_KEYS`）/ `check.mjs` 項目 16
