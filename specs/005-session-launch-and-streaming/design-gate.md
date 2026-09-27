# Design Gate (最終): 単一セッション起動とストリーミング (X-1)

**Run**: 2026-09-26
**Spec**: specs/005-session-launch-and-streaming/spec.md · **Domain**: session · **Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (clean-context 並列)

## Verdict: **PASS** (Critical = 0)

**Next**: status `tasking → implementing` に昇格。`/cl-implement specs/005-session-launch-and-streaming` 起動可能。
AD-036 を proposed → accepted に昇格。

## ラウンド経過 (Critical 収束)

| Round | tracks | Critical | 内容 | 帰結 |
|---|---|---|---|---|
| R1 | 5 | 3 | プロセス形態 (spawnClaudeCodeProcess はコールバック) / 起動 entry point scope 矛盾 / setPermissionMode 実行時回避 | AD-036 起票 + 全面修正 |
| R2 | 5 | 1 | canUseTool 応答 `updatedPermissions.setMode` (権限昇格面の別経路) | 修正 |
| R3 | 5 | 1 | `query().settings`/`applyFlagSettings`/`extraArgs` (権限昇格面のさらなる漏れ) | **denylist → 正の構成 (allowlist) へ反転** |
| R4 (確認) | 2 (platform + security) | **0** | 正の構成が権限昇格クラスを class ごと閉鎖したことを SDK 実型で確認 | **PASS** |

**Critical は R1→R2→R3 で「SDK の広大な permission/settings API を denylist で追う」同一クラスを 3 度露見させた**
(setPermissionMode → updatedPermissions.setMode → settings 系)。R3 で platform-boundary と security の独立推奨に従い
**denylist を正の構成 (allowlist) に反転**し、R4 で両トラックが「権限昇格クラス: Yes (閉じた) / env 境界: Yes (閉じた)」
と SDK 0.3.270 実型に照らして確認 (denylist なら漏れていた setModel/setMaxThinkingTokens 等も正の構成が一括で閉じる)。
architecture は R1-R3 で一貫して「設計は健全・ADR/charter/Constitution drift なし」と確認。

## 最終トラック集計

| Track | 最終 Round | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| analyze | R3 | 0 | 0 | 1 | 4 |
| po-reviewer | R3 | 0 | 0 | 2 | 5 |
| architecture-reviewer | R3 | 0 | 0 | 3 | 2 |
| security-reviewer | R4 | 0 | 0 | 1 | 4 |
| platform-boundary-reviewer | R4 | 0 | 2 | 2 | 0 |
| **Total (dedup)** | — | **0** | 2 | ~7 | ~11 |

**Critical 0 → PASS** (`gate_common::verdict_require_pass` は Critical=0 で通す)。
High/Medium/Low は gate をブロックしない。R4 の High 2 件 (H-401 検査を実 SDK 引数に固定 / H-402 kill 記述の
伝播漏れ) と Medium 2 件 (M-401 BE-010 の denylist 残滓 / M-402 すり抜け負例テスト) は **reviewer が処方した修正を
そのまま適用済み** (承認済み SSoT との整合 + 機械検査の強化であり再レビュー不要)。

## 正の構成 (権限ゲートの class-closing 設計。contracts C-4 P1-P3 / AD-036 §4)

- **P1**: `query()` options のキー集合を `{permissionMode:'default', canUseTool, spawnClaudeCodeProcess,
  pathToClaudeCodeExecutable}` の完全部分集合に固定 (settings/extraArgs/allowedTools 等の**未知を含む**昇格 option を締め出す)
- **P2**: `toPermissionResult` の出力を `{behavior, message}` に固定 (`updatedPermissions` 全 6 variant + `updatedInput` を締め出す)
- **P3**: `Query` メソッドは `interrupt()` のみ (setPermissionMode/applyFlagSettings/updateSettings 等の mutation を締め出す)
- 検査: allowlist の assert (キー集合 ⊆ 許可) + 実 SDK 引数への固定 + すり抜け負例 (SH-010/SH-020)。denylist の網羅に依存しない

## 主要 High/Medium の解消 (適用済み)

- 権限昇格クラス → 正の構成 P1-P3 (C-101/C-201/H-201/L-201 一括閉鎖)
- 起動配線 (spawnClaudeCodeProcess コールバック) → agents が spawn 主体 + wsl.exe リテラルは infra、AD-023 §7 を AD-036 §8 で調停
- kill → agents が SpawnedProcess を直接 kill (孤児回避。H-402 で plan/tasks も統一)
- env → 実名許可リスト + PATH 除外 + WSLENV/資格情報 denylist + 共有純関数 buildLaunchEnv + 実 spawn 点計測
- cwd → `--cd` 引数で RuntimePath を渡す (host cwd に渡さない)。変換主体は infra に一意化
- 起動 entry point (folder+runtime 選択→launch 検証ハンドラ BE-007) を US-1 に、安全ゲートを US-1 で閉じる
- 単一セッション不変 → SC-011 + launching 状態 (7 状態機械)

## 各トラック raw output

- Round 1: [design-gate.round1.md](design-gate.round1.md) (+ `<track>.design-gate.md` / analyze.md)
- Round 2: [design-gate.round2.md](design-gate.round2.md) (+ `<track>.design-gate.round2.md` / analyze.round2.md)
- Round 3: [design-gate.round3.md](design-gate.round3.md) (+ `<track>.design-gate.round3.md` / analyze.round3.md)
- Round 4: [security-reviewer.design-gate.round4.md](security-reviewer.design-gate.round4.md) /
  [platform-boundary-reviewer.design-gate.round4.md](platform-boundary-reviewer.design-gate.round4.md)

## 実装フェーズへの申し送り (残 Low / 手動担保)

- Principle IX の到達集合検査は未構築 (AD-034 と同じ限界)。SC-003 は port transfer 構造検査 + 手動レビューで暫定担保
- Principle XII の Automated ゲート (ui-coverage.md) は O-2 まで不活性。X-1 の新規 emit 2 経路は O-2 に繰り越し (SH-005)
- 孤児プロセス不在の実測は quickstart V-8 (人間 deferred)。fake では踏めない
- P2/P3 の静的検査で捕まらない alias/dynamic 経路は `UNDETECTED_NOTES` に nextFeature つき記録 (実装時)
- 監査ログ (permission/kill) owner を BE-011/BE-021 に付与 (L-403)
- AD-025「X-1 へ」の WSL×Win32Runtime 検証は X-4 へ繰り越し (roadmap 明記)
