# architecture-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-29 · **Reviewer**: architecture-reviewer · **Round**: 2 (design-gate re-run, read-only)

## 初回読了 viewpoint

- FR/SC: FR-001〜014 / SC-001〜010。主眼: FR-005 (helper=制約付き settings / AD-040) · FR-008 (deriveLaunchEnv 純粋 + CLAUDE_CONFIG_DIR→RuntimePath) · FR-009 · FR-011 · FR-014。SC-003/004/006。
- touched charter / Confirmation: provider/charter.md · AD-005 · AD-036 §4 P1 / §6 (immutable) · AD-039 D2/D3/D4/§3/§5 · AD-040 (proposed) · AD-023 §7/§8 · AD-025。
- A. secret 管理: 該当なし: security/platform-boundary owner
- B. 入力検証: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter / Glossary drift: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / accepted ADR drift / layering: Critical:0 High:1 Medium:0 Low:1
- E. User Story/SC/AC/UX: 該当なし: po-reviewer owner
- F. 命名/lint: 該当なし: convention-reviewer owner
- G. optional: 該当なし
- H. テスト/coverage/observability/regression: 主要 gap は H-101 に内包

## スコープ要約

Round 1 の architecture 6 件 (H-001 deriveLaunchEnv 純粋性/secret seam・H-002 AD-036 §6 CLAUDE_CONFIG_DIR namespace・M-001 Principle II over-claim・M-002 contracts 不在・L-001 glossary ProviderProfile・L-002 _overview provider→runtime edge) は**全件 resolved**。AD-040 の調停は大部分健全だが、AD-036 §4 P1 を実装する**一次ゲート `buildQueryOptions` (agents/session-core.ts) を反映していない** (Round 1 C-001 action item 3 が名指した脚の片方が脱落)。加えて data-model の `credential` 型が AD-005 正本と乖離。Critical 0 だが H-101 は AD-040 accept (immutable 化) 前に閉じるべき。

## Round 1 継承の照合 (私の 6 件)

| R1 ID | 主題 | 判定 |
|---|---|---|
| H-001 (gate H-03) | deriveLaunchEnv 純粋性・secret seam | **RESOLVED** — signature `(profile, runtime, resolved)`、`ResolvedCredential` seam、純粋関数は I/O しない (data-model §4 / plan)。domain-not-to-io/electron 緑を維持 |
| H-002 (gate H-02) | AD-036 §6 CLAUDE_CONFIG_DIR namespace | **RESOLVED** — FR-008 が RuntimePath 変換必須、data-model §4/§6、plan A-4 が §6 反映 |
| M-001 (gate H-04) | Principle II over-claim | **RESOLVED** — plan Check II が infra/runtime 限定に精密化、allowlists.mjs:463 実測確認、R-04 deferred |
| M-002 (gate H-05) | contracts/data-model/research 不在 | **RESOLVED** — contracts/provider-registration.md 作成 (C-1〜C-5)、AD-023 §7/§8 準拠 |
| L-001 (gate L-01) | glossary ProviderProfile id/displayName | **RESOLVED** — glossary に id/displayName + AD-005 ref |
| L-002 (gate L-07) | _overview provider→runtime edge | **RESOLVED** — _overview 依存 bullet に追記 |

## Findings

### [High] AD-040 の調停が一次ゲート `buildQueryOptions` (AD-036 §4 P1 の実装本体) を反映していない — C-001 action item の片脚が落ちている (H-101) (scope: feature)

- **観察**: AD-036 §4 P1 の正の構成 allowlist の**実装本体**は `src/agents/session-core.ts:72-101` の `buildQueryOptions` (戻り型 `BuiltQueryOptions` は `permissionMode`/`canUseTool`/`pathToClaudeCodeExecutable`/`spawnClaudeCodeProcess`/`abortController` の 5 キーちょうどで `settings` を持たず、spread/merge/別変数追加を作らない)。`allowlists.mjs:333-337` / `check.mjs:758-764` が明記するとおり **P1 の正本は `buildQueryOptions`、項目 16 は backstop**。AD-040 Decision item 3 / SH-001b / BE-010b / contracts C-4 は**すべて項目 16 と query 直前 assert のみ**を扱い、一次ゲート `buildQueryOptions` (`BuiltQueryOptions`/`BuildQueryOptionsDeps` に `settings?: HelperSettings` を通す改修) を名指していない。Round 1 C-001 action item 3 は「項目 16 / `buildQueryOptions` の allowlist に…」と両方を名指していた。
- **同種事象探索**: `buildQueryOptions|BuiltQueryOptions|session-core|BuildQueryOptionsDeps` を更新 bundle+AD-040 で Grep → 更新成果物 0 件。実装は session-core.ts:72-101 (5 キー型) / sdk-agent-session.ts:336-352 (query 構築点)。
- **リスク/影響**: helper 委譲を実装しようとすると `deriveLaunchEnv` が返す `settings?` が `buildQueryOptions` を素通りできない: (a) settings が query() に届かず委譲の中核が沈黙失敗、または (b) buildQueryOptions 出力に後段で settings を append = P1 が禁じた「別変数からの追加キー」で AD-036 §4 P1 の正の構成をバイパス。昇格面は HelperSettings 型 + assert + 項目 16 で閉じられ Critical には至らないが、一次ゲートの改修主体が spec/plan/tasks/ADR のどこにも割り当てられていない。settings を options に載せる主体も plan (X-4) と tasks BE-010b (X-3) で齟齬。
- **推奨アクション**: (1) **AD-040 が accept される前に** Decision に「`buildQueryOptions` の `BuiltQueryOptions`/`BuildQueryOptionsDeps` に `settings?: HelperSettings` をオブジェクトリテラルで追加し後段 spread を作らない」を明記 (AD-031 上 accept 後は後続 ADR が要る)。(2) tasks に buildQueryOptions 改修タスク (agents/session-core.ts) を追加し SH-001b と対にする。BE-010b の assert は backstop であって一次ゲートでないことを明記。(3) settings を載せる主体を X-3/X-4 一意に確定し (plan と BE-010b の齟齬解消)、SC-006 に「helper 方式で settings が buildQueryOptions 経由で query options に現れる」**正例テスト**を 1 本足す (現状 SH-020(viii) は負例のみ)。
- **根拠**: AD-036 §4 P1 (immutable。正の構成 allowlist の正本) / AD-040 Decision 3 / Principle III / allowlists.mjs:333-337 / Round 1 C-001 action item 3。
- **scope 根拠**: AD-040 (proposed) と tasks は touched files。buildQueryOptions は X-1 コードだが本 feature が settings を通すため改修が必要。

### [Medium] data-model の `credential: CredentialRef` が AD-005 型正本 `credential: CredentialSource` と乖離し spec/glossary とも不一致 (M-101) (scope: feature)

- **観察**: data-model §1 は `credential: CredentialRef`、§2 で CredentialRef を判別 union と定義。型正本 AD-005 は `credential: CredentialSource`。spec Key Entities は `credential (CredentialSource)`、glossary は無型。4 成果物で表記が 3 通りに割れる。
- **リスク/影響**: `CredentialSource` は 9 種の認証方式 enum で参照の置き場を持たない。秘密非保持・参照のみ (FR-004) には CredentialRef 化は実質必要な精緻化だが、data-model が AD-005 を「型の正本」と称しつつ literal 型を無断差し替え。実装者が credential の型と参照の置き場を判断できない。
- **推奨アクション**: data-model §2 に「AD-005 の `credential: CredentialSource` を、非秘密の参照を担うため `CredentialRef = { source: CredentialSource, ...ref }` に精緻化する (AD-005 の意図は保持・秘密非保持)」と乖離を明示。spec Key Entities と glossary の `credential` 表記を `CredentialRef` に統一 (Principle XIV)。AD-005 は immutable なので参照側で読み替えを記録。
- **根拠**: AD-005 / Principle XIV / Principle V。
- **scope 根拠**: data-model / spec / glossary は touched files。

### [Low] SC-006 / AD-040 が項目 16 (grep ベース) に「settings キー集合 ⊆ allowlist」検出を負わせるが実保証は型 + 実行時 assert 側 (L-101) (scope: feature)

- **観察**: AD-040 Confirmation / SC-006 は「項目 16 の違反 fixture」を機械強制として挙げるが、項目 16 は grep ベース backstop で部分集合違反を静的に捕捉しづらい (AD-040 Consequences 自身が複雑化を認める)。
- **推奨アクション**: SC-006 / AD-040 に「主保証は HelperSettings 型 + query 直前実行時 assert であり、項目 16 fixture は綴りの backstop (grep 被覆限界あり)」の 1 行を足す。
- **根拠**: Principle V/IX の Verification 留保の形式 / AD-040 Consequences。
- **scope 根拠**: SC-006 (spec) / AD-040 は touched files。

## viewpoint H narrative

(1) deriveLaunchEnv 純粋性 regression は domain-not-to-io/electron が構造的に守り SH-021 検証 — 健全。(2) CLAUDE_CONFIG_DIR→RuntimePath / 所在不特定 fail-closed は SH-020(ix)(x) — 健全。(3) **C-001/AD-040 regression に穴** — SH-020(viii) は負例のみで helper settings が buildQueryOptions 経由で query options に届く**正の flow テストが無い** (H-101 に内包)。(4) ADR drift は自動 guard を持たず manual 検査依存 — 構造的限界で本 feature 固有欠陥でない。observability は FR-007 / contracts C-3 が理由キーのみを規定 — 原因特定点は確保。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `buildQueryOptions\|BuiltQueryOptions\|session-core\|BuildQueryOptionsDeps` (更新 bundle+AD-040) | 更新成果物 0 / 実装 2 | session-core.ts:72-101 (5 キー型) / sdk-agent-session.ts:336-352 |
| M-101 | `CredentialRef` (bundle) | 2 | data-model.md:17,26 (spec は CredentialSource / AD-005:30 は CredentialSource / glossary 無型) |
| L-101 | (Low・探索不要) | — | 実保証所在: AD-040 実行時 assert + HelperSettings 型 / SC-006 |

## Verdict

- Critical: 0 · High: 1 (H-101) · Medium: 1 (M-101) · Low: 1 (L-101)
- Round inheritance: resolved from R1: 6 (全件) / unresolved: 0 / new: 3 (H-101 は C-001 action item 3 の buildQueryOptions 脚脱落の派生 / M-101 / L-101)

**総評**: 私 owner の Round 1 全 6 件 resolved。Critical 無し。H-101 は AD-040 accept (immutable 化) 前に閉じるべき。AD-040 の AD-036 §4 P1 ↔ AD-039 D2 調停は「新 ADR で読み替える」機構として手続き上は正しく immutable ADR を wholesale supersede していないが、enforcement の一次 locus (buildQueryOptions) を記述し損ねている点が唯一の実質的欠落。
