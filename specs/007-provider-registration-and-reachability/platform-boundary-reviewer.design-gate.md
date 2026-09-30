# platform-boundary-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-29 · **Reviewer**: platform-boundary-reviewer · **Round**: 2 (re-run after Round 1 fixes)

## 初回読了 viewpoint

- FR/SC: FR-005/008/009/011/012 / SC-003/004/006。Key Entities: DerivedLaunchEnv / HelperSettings / DetectedCandidate / Reachability / ProviderProfile.configDir
- touched charter / Confirmation: provider charter Scope。runtime/isolation charter は Out-of-scope 侵犯なし (Reachability/PathMapping 再利用のみ)。AD-040 Confirmation を検証対象にした
- A. secret 管理: 該当なし: security-reviewer owner。escalation-gate は D に計上
- B. 入力検証: 該当なし
- C. 業務不変条件 / Charter drift: 該当なし: runtime/isolation Out-of-scope 侵犯なし
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2
- E. User Story/SC/AC/UX: 該当なし: po-reviewer owner
- F. 命名/module/lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional: 該当なし
- H. テスト/coverage/observability/regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 で本 reviewer が唯一の Critical (C-001) を出した。Round 2 は AD-040 (proposed) + 新規成果物を追加。**C-001 は解消された** — AD-040 が AD-036 §4 P1 ↔ AD-039 D2 を調停し `settings` を `HelperSettings` 2 キー限定射影に (型 + query 直前実行時 assert + check.mjs 項目16 更新 + 違反 fixture) 閉じ込め、Principle III の昇格面を維持。H-001/H-002/H-003/M-001/M-002/M-003 も反映済み。ただし fix 成果物 (data-model) で UNC 第 3 名前空間の型不整合が新規露見、env 注入 locus と機械強制の書き方に Medium 残余。**新規 Critical は無い。**

## Round 1 指摘の継承判定

| Round1 ID | 判定 | 根拠 |
|---|---|---|
| **C-001** (settings 昇格レバー) | **RESOLVED** | AD-040 起票。`DerivedLaunchEnv.settings: HelperSettings` 型封鎖。query 直前 (agents) 実行時 assert。項目16 更新 + fixture。escalation surface は type+runtime-assert の 2 層で構造的閉鎖。AD-036 immutable のまま AD-040 が enforcement 追記精緻化 = 調停健全 |
| **H-001** (configDir bare HostPath / Location 喪失) | **RESOLVED** | FR-011 で configDir→Location 導出 (classifyRawPath/parseWslUncPath)。data-model §6。BE-012 |
| **H-002** (HostPath→RuntimePath 変換欠落) | **RESOLVED (残余→H-101)** | FR-008 / data-model §4 / BE-010 / SC-003。ただし UNC 名前空間が env 変換経路で未対応 (H-101) |
| **H-003** (検出 OS 依存 vs PLATFORM_BRANCH_DIRS) | **RESOLVED** | plan Check II を infra/runtime 限定に精密化 (allowlists.mjs 確認)。R-04 で置き場確定 task 化 |
| **M-001** (Reachability 判定不能が fail-closed でない) | **RESOLVED** | FR-011「所在不特定は非 reachable」/ SC-004 fail-closed / data-model §6 / BE-012 / SH-020(x) |
| **M-002** (services-not-to-io 0-target) | **RESOLVED** | SH-011「design 方針では不要 (純粋関数 + 薄い IPC)。mediator 発生時のみ from 実名 + fixture」 |
| **M-003** (SC-006 に escalation-free assert 無し) | **RESOLVED** | SC-006 キー集合 ⊆ {apiKeyHelper,awsCredentialExport} / SH-020(viii) |

## C-001 検証 (依頼された論点)

**Principle III の昇格面は依然閉じているか → YES。**
1. 型の層: `settings?: HelperSettings` は `{apiKeyHelper?, awsCredentialExport?}` のみで `Settings.permissions.defaultMode` を構造的に組めない。
2. 実行時 assert の層: main→agents (utilityProcess) の structured-clone で型保証が消えるが、**境界通過後・query 直前 (agents) の実行時 assert で再確立** (真の positive-allowlist、逸脱 throw、変数形でも効く)。これが load-bearing gate。
3. backstop の層: check.mjs 項目16 (M-102 参照)。

**調停の健全性 → 健全。** AD-036 immutable のまま。AD-040 が §4 P1 の enforcement を「settings 全禁止」→「helper 2 キー以外禁止」へ穴を狭めるのみ。許可 2 キーは helper スクリプトのパスで permissionMode を運べない。他の QUERY_ESCALATION_OPTION_KEYS は禁止のまま (allowlists.mjs 確認)。

**注記 (architecture-reviewer へ委譲)**: AD-040 が `supersedes: []` のまま AD-036 §4 P1 決定を実質変更する governance 妥当性 (supersede 宣言の要否) は ADR-drift owner = architecture-reviewer の領域。本 reviewer は Principle III の実装閉鎖のみ判定。

## Findings

### [High] configDir の UNC 第 3 名前空間が型・env 変換経路で未対応 (H-101) (scope: feature)

- **観察**: data-model §1 は `configDir?: HostPath`、§4 は `configDirRuntimePath?: RuntimePath // configDir(HostPath)→RuntimePath 変換` と configDir を HostPath 単一 brand で型付け。一方 spec FR-011 と plan は「configDir (HostPath/**UNC**) から所在を導出」と UNC を入力ドメインに含む。到達可能性側 (§6) は classifyRawPath/parseWslUncPath で UNC を扱うが、env 変換側 (§4) と型 (§1) は HostPath 前提で非対称。
- **リスク/影響**: AD-025 §2 は HostPath と WslUncPath を別 brand に分離 (Ubuntu と Debian が別 FS)。WSL 内 config を UNC 経由で登録した configDir は本来 WslUncPath だが HostPath に brand されると (a) 型が嘘をつき、(b) §4 の変換が win32 前提で UNC を誤変換し CLAUDE_CONFIG_DIR が壊れ WSL 内 claude が沈黙失敗 (H-002 と同じ失敗モードが UNC 名前空間で再演)。
- **推奨アクション**: (1) configDir の型を `HostPath | WslUncPath` に広げ data-model §1/§4 を FR-011 の「HostPath/UNC」に揃える。(2) env 変換を到達可能性と同じ classifyRawPath 経由に一意化 (往路 reachability と復路 env 変換の名前空間解釈を対称化)。(3) SH-020(ix) に UNC 入力ケースを追加。
- **根拠**: Principle I / AD-004 / AD-025 §2 / AD-036 §6。
- **scope 根拠**: data-model / spec FR-011 の文面不整合。Round 1 H-002 の残余 (UNC 名前空間が残存)。

### [Medium] 導出 env の注入 locus が Options.env と RuntimeLaunchSpec.env で未確定 (M-101) (scope: feature)

- **観察**: bundle は導出 env を一貫して `Options.env` として枠づけるが、X-1 の AD-036 §3 は custom `spawnClaudeCodeProcess` が `SpawnOptions.env` を無視し `RuntimeLaunchSpec.env` のみから spawn env を構成すると定める。bundle は RuntimeLaunchSpec に一度も言及しない。
- **リスク/影響**: 導出 env を文字どおり `Options.env` に載せると custom spawn 経路で無視され Provider 由来 env が起動プロセスに届かない (沈黙失敗)。かつ AD-036 §6 の denylist enforcement locus (SC-006(b)「合成後の最終 env」= RuntimeLaunchSpec.env) を通らないと既存 denylist 適用点を外れる。X-3 は FR-009/SC-003 で導出時に denylist 再適用するため秘密透過は塞がれるが注入点二重管理で経路取りこぼしを生む。
- **推奨アクション**: plan で「導出 env は X-4 が RuntimeLaunchSpec.env (infra/runtime) に合流させる (Options.env は AD-036 custom spawn 下で無効)」を明記し SC-006(b) 最終 env assert が Provider 由来 env を対象に含むことを確認。「Options.env は置換」は SDK セマンティクスの引用 (spread 根拠) で注入 locus 指定でない旨を区別。
- **根拠**: AD-036 §3/§6 / AD-039 D3 / Principle V。security H-101 (どの変数/denylist) とは別論点 (本件=注入 locus が有効か)。dedup 時に区別。

### [Medium] check.mjs 項目16 の書き換えが positive-allowlist を保つ保証を design に固定する (M-102) (scope: feature)

- **観察**: AD-040/SH-001b は項目16 を「settings 全禁止」→「値のキー集合が 2 キーを超えたら違反」へ変える。現行項目16 P1 は settings\s*: を flat regex で src.code に走査。値のキー集合を positive 検査には settings オブジェクト literal の境界解析が要り、`settings: someVar` 変数形は flat scanner で中身を見られない。
- **リスク/影響**: 項目16 を「内側の禁止キーを denylist」形で実装すると AD-036 §4 が禁じた denylist 方式に逆戻り。fixture が inline のみだと変数形の穴に気づけない。
- **推奨アクション**: (1)「項目16 は backstop、load-bearing gate は query 直前実行時 assert + HelperSettings 型」の前提を維持。(2) BE-010b の実行時 assert throw 負例を SH-020 に明示追加。(3) 項目16 fixture に変数形 settings の扱いを記録 (backstop の限界を UNDETECTED_NOTES に正直化)。
- **根拠**: AD-036 §4 (denylist→allowlist 反転の教訓) / AD-040 Confirmation / Principle III。
- **scope 根拠**: PB-7 (lint rule 網羅性)。

### [Medium] aws-sdk 隔離 depcruise ルールは node_modules/ 接頭辞形 + 発火 fixture を要する (M-103) (scope: feature)

- **観察**: research R-03/BE-020/SH-021 が aws-sdk を aws 境界のみ import 可とするルール (M-09) を足すが、パターン形と発火 fixture が明示指定されていない。
- **リスク/影響**: AD-025 実測 (d): depcruise では npm パッケージが `node_modules/<name>/...` として現れるため `^@aws-sdk/client-sts` は 1 件も一致せず黙って死ぬ (`^electron($|/)` が実際そうだった)。ルールが dead になると src/agents/ から aws-sdk へ到達しても検出されない (Principle VII 波及)。
- **推奨アクション**: `^(node_modules/)?@aws-sdk/client-sts(/|$)` 形で書き、tests/rule-fixtures/ に発火する違反サンプルを置く。R-02 で awsCredentialExport 化を採り本依存が不要なら削除条件も記す。
- **根拠**: AD-025 Consequences (d) / Principle VII / AD-027。security M-09 (隔離の要否) とは別 (本件=ルール形の網羅性)。dedup 時に区別。

### [Medium] 境界通過後の再検証・UNC 変換の test が SH-020 列挙に不足 (M-104) (scope: feature)

- **観察**: SH-020 は (viii) settings キー集合検査、(ix) CLAUDE_CONFIG_DIR RuntimePath (HostPath 前提)、(x) fail-closed を列挙するが、(a) BE-010b の query 直前 assert throw 負例 (C-001 の実質 gate)、(b) UNC 入力 configDir の RuntimePath 変換 (H-101)、(c) 導出 env に対する SC-006(b) 最終 env denylist 適用 (M-101) が列挙に無い。
- **推奨アクション**: SH-020 に (a)(b)(c) の負例を追加し AD-040 Confirmation の「実行時 assert throw 単体テスト」を tasks に結線。
- **根拠**: reviewer-base H / AD-040 Confirmation。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `configDir.*HostPath \| HostPath / UNC \| configDir\(HostPath\)` | 4 | data-model.md:16, §4, plan, spec FR-011/Key Entities |
| M-101 | `Options\.env \| RuntimeLaunchSpec` | RuntimeLaunchSpec=0 / Options.env=6 | 注入 locus が Options.env のみ、RuntimeLaunchSpec 言及 0 |
| M-102 | check.mjs 項目16 `settings\s*:` flat regex | 1 (check.mjs:776) + allowlists.mjs:341 | flat scanner が値キー集合を positive 検査できない |

## Verdict

- Critical: 0 · High: 1 (H-101) · Medium: 4 (M-101, M-102, M-103, M-104) · Low: 0
- Round inheritance: resolved from Round 1: 7 (C-001, H-001, H-002, H-003, M-001, M-002, M-003 全件) / unresolved: 0 / new: 5 (H-101, M-101〜M-104)

**総合**: 本 reviewer が Round 1 で出した唯一の Critical (C-001) は AD-040 + HelperSettings 型 + query 直前実行時 assert + 項目16 更新で**解消され、Principle III の昇格面は type + runtime-assert の 2 層で構造的に閉じている**。調停は健全。**新規 Critical は無く、design-gate 昇格を阻む gate-blocker は残っていない。** ただし H-101 (UNC 名前空間の型不整合, High) を implementing 前に env 変換経路の名前空間対称化で解消することを推奨。M-101〜M-104 は design-completeness 残余。
