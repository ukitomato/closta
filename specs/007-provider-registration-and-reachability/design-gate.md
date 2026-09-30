# Design Gate: Provider 登録と到達可能性判定 (X-3) — Round 2

**Run**: 2026-09-29 (Round 2, `--from gate` re-run after C-001 fix)
**Spec**: specs/007-provider-registration-and-reachability/spec.md
**Domain**: provider
**Charter**: docs/domains/provider/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous round**: [design-gate.round1.md](design-gate.round1.md) (FIX_REQUIRED, Critical=1)

## Verdict

| Track                        | Critical | High | Medium | Low |
| ---------------------------- | -------- | ---- | ------ | --- |
| analyze                      | 0        | 0    | 0      | 5   |
| po-reviewer                  | 0        | 0    | 2      | 3   |
| architecture-reviewer        | 0        | 1    | 1      | 1   |
| security-reviewer            | 0        | 1    | 2      | 0   |
| platform-boundary-reviewer   | 0        | 1    | 4      | 0   |
| **Total (dedup)**            | **0**    | 3    | 8      | 7   |

| Round 1 → Round 2         | Critical | High  |
| ------------------------- | -------- | ----- |
| Resolved from prev        | **1**    | 11    |
| Unresolved from prev      | 0        | 0     |
| New in this run           | 0        | 3     |

**Status**: PASS
**Next**: Critical=0。status: tasking → implementing 昇格。/cl-implement 起動可能。

cascade_enforce: 全 reviewer で demotions=0 (Round 2 は Critical 0)。
viewpoint_coverage: po / security / platform-boundary は A-H 全 present。**architecture-reviewer は H が narrative 形式のため
missing 判定 (warning のみ・gate fail にしない。reviewer 品質可視化)** → verdict JSON に `viewpoint_missing: ["H"]` 記録。

## Critical (Total: 0)

**なし。** Round 1 の唯一の Critical **C-001** (helper 委譲の `Options.settings` が AD-036 §4 P1 の権限ゲートと衝突) は
**RESOLVED**。C-001 を起こした platform-boundary-reviewer が Round 2 で「AD-040 + `HelperSettings` 型 + query 直前
実行時 assert + 項目 16 更新で解消され、Principle III の昇格面 (permissions/permissionMode/env) は type + runtime-assert の
2 層で構造的に閉じている。調停は健全 (AD-036 immutable のまま AD-040 が enforcement を追記精緻化)」と確認。

## High (Total: 3, dedup) — いずれも「implementing 前に解消」推奨。**本 gate 通過後の cleanup 編集で対応済み**

- **H-01** [architecture] AD-040 の調停が一次ゲート `buildQueryOptions` (AD-036 §4 P1 の実装本体。`src/agents/session-core.ts:72-93` 実在確認) を反映せず、backstop の check.mjs 項目 16 のみを扱っていた (C-001 action item 3 の片脚脱落)。**→ 対応済み**: AD-040 Decision 3 に buildQueryOptions の `settings?: HelperSettings` リテラル追加 (一次ゲート) を明記、item 16 を backstop に位置づけ。tasks SH-001b (一次ゲート改修) / SH-001c (backstop) に分割。settings 主体を SH-001b (X-1 コード改修) に確定、SC-006 に正例テスト (SH-020 xiv)
- **H-02** [security] `extraEnv` の**導出時**の扱い (env spread 可否と KEY denylist) が導出仕様に不在で、無害キー名下の WSLENV 再導入 seam が残っていた (Round 1 H-001 の derivation 半分)。**→ 対応済み**: FR-009 に「extraEnv は passthrough 許可リストの KEY のみ通し WSLENV/資格情報 KEY は導出時に除外」を追記。SH-020 (xvii) に導出時負例
- **H-03** [platform-boundary] `configDir` の UNC 第 3 名前空間が型 (`HostPath` 単一) と env 変換経路で未対応 (Round 1 H-002 の残余。WSL config を UNC 登録すると誤変換で CLAUDE_CONFIG_DIR 沈黙失敗)。**→ 対応済み**: data-model §1/§4 と spec Key Entities で `configDir: HostPath | WslUncPath`、env 変換を到達可能性 §6 と同じ `classifyRawPath`/`parseWslUncPath` 経由に一意化。SH-020 (xvi) に UNC 変換テスト

## Medium (Total: 8, dedup) — 対応済み / 追記済み

- **M-01** [architecture] data-model `credential: CredentialRef` が AD-005 `CredentialSource` と乖離。**→ data-model §2 に読み替え明示 + spec Key Entities/glossary を CredentialRef に整合**
- **M-02** [platform] 導出 env の注入 locus が `Options.env` か `RuntimeLaunchSpec.env` か未確定 (AD-036 §3 custom spawn は Options.env を無視)。**→ data-model §4 + plan 図に「X-4 が RuntimeLaunchSpec.env に合流」を明記**
- **M-03** [platform] check.mjs 項目 16 を「値のキー集合 positive 検査」に変える際 denylist 逆戻り/変数形 settings の穴。**→ AD-040 Decision 4 + SH-001c で「項目 16 は backstop、load-bearing は一次ゲート+実行時 assert」、UNDETECTED_NOTES に限界記録**
- **M-04** [platform] aws-sdk 隔離 depcruise ルールの形 (`node_modules/` 接頭辞) + 発火 fixture 未指定。**→ BE-020 に `^(node_modules/)?@aws-sdk/client-sts(/|$)` 形 + 違反 fixture を明記 (AD-025 実測 d)**
- **M-05** [po] FR-013/US-3/SC-008 が無条件 must だが awsCredentialExport 化ブランチ (R-02) が無効化しうる。**→ FR-013 に「直接 AssumeRole ブランチ前提、awsCredentialExport 化なら US-3/SC-008 は N/A」を追記**
- **M-06** [po] SC-009 の fake Vitest は実スキャン網羅を測れない。**→ SC-009 を (a) Vitest normalize/skip、(b) quickstart 実スキャン網羅 (手動) の 2 段に分離**
- **M-07** [security/platform] 導出時 KEY denylist・実行時 assert throw・UNC 変換の test 死角。**→ SH-020 (xiv)-(xvii) に追加**
- **M-08** [security] extraEnv 値スキャンのヒューリスティック網羅性 (best-effort backstop)。**→ 追跡 (SH-010 の check.mjs 静的検査が primary、値スキャンは backstop。implementing で SSoT 定数化)**

## Low (Total: 7, dedup) — 対応済み / 追跡

- analyze N1 (data-model §5→§4 ref) **fixed** / N2 (BE-030 SC-010 backlink) **fixed** / N3-N5 (glossary DetectedCandidate 追記=SH-003 / X-4 follow-up / ADR framing) **追跡**
- po L-101 (委譲率 UI 提示の裏づけ) 追跡 / L-102 (読み取り不能 edge case) **fixed** (spec Edge Cases) / L-103 (AC-5/AC-6 test binding) **fixed** (SH-020 xvii)
- architecture L-101 (SC-006 backstop 明示) **fixed** (AD-040 Confirmation + SC-006)

## Dedup log

| Merged findings | Canonical | Key |
|---|---|---|
| (Round 2 High はすべて別 root。dedup なし) | H-01/H-02/H-03 | buildQueryOptions / extraEnv derivation / configDir UNC |
| security 由来 test 死角, platform M-104 | M-07 | 導出時 KEY denylist + assert throw + UNC 変換の test coverage |

Round 1 の C-001 は Round 2 で単一 origin (platform-boundary) が RESOLVED 判定。

## Track raw outputs (Round 2)

- [analyze.md](analyze.md)
- [po-reviewer.design-gate.md](po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](platform-boundary-reviewer.design-gate.md)
- Round 1: [design-gate.round1.md](design-gate.round1.md) + `*.round1.md`

## 補足: Round 2 High の cleanup 対応について

本 gate の verdict は Round 2 の 5 トラック (Critical=0) に基づく **PASS**。Round 2 で新規に出た 3 High + 主要 Medium は、
reviewer が一様に「implementing 前に解消を推奨」としたため、**gate 通過後の cleanup 編集で spec/plan/tasks/data-model/AD-040 に
反映済み** (上記各項)。これらの cleanup は High/Medium の解消であり Critical を導入しない (verdict PASS は不変)。
**cleanup の実装レベル検証は code-gate に委ねる** (design-gate では再レビューしない)。特に AD-040 は本 PASS で accepted へ
昇格するため、architecture H-01 (buildQueryOptions) を accept 前に AD-040 本文へ織り込んだ (AD-031: accept 後は後続 ADR が要るため)。
