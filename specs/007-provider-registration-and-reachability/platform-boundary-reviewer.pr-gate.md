# platform-boundary-reviewer Review (pr-gate Round 3): Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: pr-gate / **Round**: 3 / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: runtime/isolation charter 侵犯なし
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. lint ルール網羅性: 該当なし: item16/17 backstop に新規穴なし。`.slice(4)` 接頭辞剥がしは isValidPathDTO の確立パターン
- G. optional reviewer 範囲: 該当なし: owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## Verdict
- Critical: 0 / High: 0 / Medium: 1 / Low: 1
- Round inheritance: resolved from R2: 2 (PB-P-L03 対称修正・`as never` 完全除去確認 / PB-P-H02 IPC 境界負例テスト) / unresolved: 0 / new: 2 (M-001, L-001)

## Round 2 finding 解決状態
- **PB-P-L03** (configDir namespace 種別未検証) → **RESOLVED・妥当**。checkProviderDraft の `isValidConfigDirNamespace` (host / unc:<validDistro>) + toConfigDir 2 箇所の `as never` 除去 → `isValidDistroName` + `uncNamespace()` 経由。makeWslUncPath の distro cross-check で別 distro brand 生成不能。`src` の provider configDir 経路に `as never` 0 件を確認。
- **PB-P-H02** (namespace 拒否テスト) → **RESOLVED (IPC 境界)**。validate.test.ts に `wsl:` 拒否 + `host` 受理。**永続 read 境界は M-001 で補完。**

## 維持確認
deriveEnv fail-closed 完全性 (unreachable→null / reachable-but-unresolved→null) 全分岐で沈黙フォールバック断たれた。CLAUDE_CONFIG_DIR に HostPath 漏れなし (branded RuntimePath の .value のみ + extraEnv 締め出し)。秘密が IPC を越えない (deriveEnv 未配線・6 面一致)。AD-040 昇格面 0 件。単一インスタンス仮定なし。

## Findings (new)
### [Medium] M-001 — 永続 read 境界 (provider-record.toConfigDir) の unc 分岐と種別拒否が回帰テストで守られていない
- **観察**: PB-P-L03 で強化した 2 境界のうち永続 read 側 (`{namespace,value}` plain → branded) のテストが不在。将来 toConfigDir を緩めると WSL config Provider が reload で無言消失し検出できない (唯一のガードがテスト)。
- **推奨**: provider-store.test に unc round-trip 正例 + `wsl:`/不正 distro load 負例。 → **[fixed] provider-store.test.ts に追加 (DB-P3-M01 と同一・1 修正でカバー)。**
### [Low] L-001 — checkProviderDraft は namespace 種別は見るが unc **値の形**を検証せず toConfigDir に委ねる (isValidPathDTO と非対称・防御は toConfigDir で成立・live harm なし)。 → **deferred (任意・防御成立済み)。**
