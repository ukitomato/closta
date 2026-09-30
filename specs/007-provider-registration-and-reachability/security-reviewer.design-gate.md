# security-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-29 · **Reviewer**: security-reviewer · **Round**: 2

## 初回読了 viewpoint

- FR/SC (security lens): FR-002/004/005/006/007/008/009 ; SC-002/003/005/006
- touched charter / Confirmation: Principle V / provider charter 業務ルール / AD-040 Confirmation (HelperSettings 型限定 + query 直前 assert) / AD-039 §3・D2・D4 / AD-011 / AD-036 §4 P1・§6
- A. secret 管理 / プロセス境界: Critical:0 High:1 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP: Critical:0 High:0 Medium:1 Low:0
- C. Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution/ADR drift: 該当なし: architecture-reviewer owner (AD-040 の secret 露出面は検証済み clean)
- E. User Story/SC/AC/UX: 該当なし: po-reviewer owner
- F. 命名/lint: 該当なし: convention-reviewer owner
- G. optional: 該当なし
- H. テスト/coverage/observability: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 の security 指摘 (H-001〜H-004 / M-001〜M-003 / L-001〜L-002) と Critical C-001 の修正、新規成果物 (data-model / contracts / research / AD-040) を再検証。

**C-001 (AD-040 HelperSettings) の secret 露出面**: clean。`HelperSettings` は helper スクリプトのパスのみを運び秘密値を持たない。型で permissions/permissionMode/env を組めず、query 直前で `Object.keys(settings) ⊆ {apiKeyHelper, awsCredentialExport}` を assert。`DerivedLaunchEnv` は `provider.deriveEnv` の戻りに載らず main/agents 内に留まる (contracts C-1)。**新たな secret 露出経路を導入していない**。唯一の観察: check.mjs 項目 16 は settings のキー名のみ検査し値を見ないが、apiKeyHelper は定義上パスであり委譲設計と整合するため blocker ではない。

Round 1 の 9 件中 8 件は完全解消、H-001 は persist 半分のみ解消し derivation 半分が未閉塞のため H-101 として継続。

## Findings

### [High] extraEnv の導出時の扱い (env spread 可否と KEY denylist 適用) が導出仕様に不在 — WSLENV 経由の秘密透過 seam が残る (H-101) (scope: feature)

- **観察**: Round 1 H-001 の修正は persist 半分 (値スキャンで秘密らしい形を登録拒否) を解消したが、もう一つの経路 — **導出時の extraEnv 素通し** — が閉じていない。Edge Case (spec:178) は「extraEnv に WSLENV/資格情報を入れると許可リストで弾く (FR-009)」と behavior を assert するが、FR-009 / data-model §4 / BE-010・BE-011 は **extraEnv に一切言及しない**。FR-009 の 2 経路 (passthrough 許可リスト / 方式固有実名注入) は任意 KEY を持つ extraEnv を通す経路も弾く経路も定義していない。
- **同種事象探索**: `extraEnv` が導出仕様 (FR-008/FR-009/data-model §4/BE-010/BE-011) に現れる件数 0。`WSLENV` は passthrough/aws-assume-role 文脈で 20+ 行だが extraEnv KEY を導出時に denylist へ掛ける記述 0。
- **リスク/影響**: extraEnv が導出 env に spread される設計なら `extraEnv: { WSLENV: "AWS_SECRET_ACCESS_KEY" }` の値は秘密形でなく persist 値スキャンを通過し、導出時に KEY denylist が未定義なら WSLENV が subprocess env に載り FR-009 が塞ごうとした WSL 透過が再現 (Principle V 抵触)。逆に spread しないなら extraEnv は inert なデッドデータになる。extraEnv の導出時の役割と denylist 適用点が未確定。
- **推奨アクション**: (1) FR-008/FR-009 か data-model §4 に extraEnv の導出時扱いを明記 — 「extraEnv は passthrough 許可リストに含まれる KEY のみ通し、WSLENV/資格情報パターンの KEY は導出時に除外」を型/規則で定義するか「extraEnv は導出 env に spread しない」と明示して Edge Case を実際の除去点に結び直す。(2) SH-020 に導出時の負例を追加。
- **根拠**: Principle V / AD-036 §6 / CWE-200 / spec Edge Case (spec:178) ↔ FR-009 の不整合
- **scope 根拠**: feature (spec FR-009 / data-model §4 / tasks SH-020・BE-011)

### [Medium] extraEnv 値スキャンのヒューリスティックが秘密形の一部を取りこぼす (M-101) (scope: feature)

- **観察**: 値スキャンパターンは `sk-`/`AIza`/`ghp-`/長大トークン/AWS キー形に限定。GitLab PAT (`glpat-`)/Slack (`xoxb-`)/`Bearer `/高エントロピー base64 は非該当で persist 値スキャンを通過。
- **リスク/影響**: 値スキャンは extraEnv 経由の平文永続の唯一の runtime ガード (SH-010 の静的検査は src スキーマのみ)。ヒューリスティックの穴 = Principle V の穴。「拒否漏れは平文永続」の非対称リスク。
- **推奨アクション**: パターンを単一 SSoT 定数に寄せ `glpat-`/`xoxb-`/`Bearer `/高エントロピー閾値を追加。「extraEnv はそもそも秘密の場所でなく値スキャンは best-effort backstop」を data-model に明記し SC-002 を完全防御と誤読させない。
- **根拠**: Principle V / CWE-312
- **scope 根拠**: feature (spec FR-004 / tasks BE-004・SH-020)

### [Medium] 導出時 extraEnv-KEY denylist の負例と Principle V 自動検査の runtime 死角が SH-020/SH-010 に未反映 (M-102) (scope: feature)

- **観察**: SH-020 の負例は (vi) persist 時値拒否・(ii) generic passthrough 止まりで、H-101 の「extraEnv KEY が導出 env に到達しない」検証が無い。SH-010 の Principle V 自動検査は infra/settings/** のソーススキーマを見るため runtime 永続の extraEnv 秘密値は原理的に検出不能 (この死角の UNDETECTED_NOTES 登録方針はあるが「値スキャンが唯一の runtime ガード」と SC-002 の紐付けが未明示)。
- **推奨アクション**: SH-020 に導出時負例を 1 本追加。SH-010 の UNDETECTED_NOTES に「runtime 永続 extraEnv 秘密値の自動検査は不能、runtime ガードは BE-004 値スキャン + SH-020 のみ」を明記し SC-002 に手動+test 範囲を正直反映。
- **根拠**: H カテゴリ / Principle V Verification (AD-024 #9)
- **scope 根拠**: feature (tasks SH-020・SH-010)

## Round 1 → Round 2 継承 (security items)

| Round 1 ID | 主題 | 状態 |
|---|---|---|
| H-001 (H-09) | extraEnv 秘密値の平文永続 + 導出時素通し | **部分解消** — persist 値スキャン追加 ✓。導出時扱い未定義 → **H-101 継続** |
| H-002 (H-01) | aws-assume-role AWS_* vs FR-009 | **解消** — passthrough vs 実名注入を型分離、carve-out、WSLENV 禁止、research R-02 |
| H-003 (H-10) | 検出が env 秘密値を IPC で運ぶ | **解消** — DetectedCandidate は名前/存在/所在のみ、SH-020(vii) |
| H-004 (H-11) | Principle V 自動ガード未コミット | **解消** — SH-010 が check.mjs 項目追加 + UNDETECTED_NOTES + SC-002 正直化。runtime 死角は M-102 継続 |
| M-001 (M-09) | aws-sdk 隔離が規約のみ | **解消** — depcruise ルール追加 (BE-020/SH-021) |
| M-002 (M-10) | register 例外が秘密 payload を echo | **解消** — 理由キーのみ構造化エラー (contracts C-3) |
| M-003 (M-11) | 値ベース負例欠落 | **解消** — SH-020(vi)(vii)。導出時 KEY denylist 負例は残 → M-102 |
| L-001 (L-08) | XSS 外部由来文字列 | **解消** — FE-030 React 既定エスケープ |
| L-002 (L-09) | preload 汎用チャネル | **解消** — contracts C-1 名前付きチャネルのみ |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `extraEnv` (導出仕様への出現) | 導出仕様に 0。参照は persist/型のみ | spec.md:178 ↔ FR-009 (extraEnv 無し) |
| H-101 | `WSLENV` | 20+ (passthrough/aws-assume-role)。extraEnv KEY denylist 記述 0 | spec.md:178,248-253 / data-model §4 / contracts C-5 |
| M-101 | `sk-\|AIza\|ghp-` | 3 (網羅根拠なし) | spec.md:212 / tasks.md:55 / data-model |
| M-102 | `SH-020\|負例` | 導出時 extraEnv KEY denylist assert 0 | tasks.md:148-156 |

## Verdict

- Critical: 0 · High: 1 (H-101) · Medium: 2 (M-101, M-102) · Low: 0
- Round inheritance: resolved from R1: 8 + H-001 persist 半分 / unresolved: 1 (H-001 derivation 半分 = H-101) / new: 2 (M-101, M-102)

**Gate 判定への含意**: Critical=0 要件を security track として満たす。C-001 の secret 露出面は clean。H-101 (extraEnv 導出時の WSLENV 透過 seam) は Round 1 H-001 の未閉塞半分であり、実装が extraEnv を unfiltered spread すれば code-gate で Principle V Critical に転じるため、implementing 前に FR-009/data-model §4 で extraEnv の導出時扱いを確定し SH-020 に導出時負例を追加することを強く推奨する。
