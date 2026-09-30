# database-reviewer Review (pr-gate Round 3): Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: pr-gate / **Round**: 3 / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer SEC-1 owner (器のみ G)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution / ADR drift: 該当なし: Principle V の器は充足。ADR drift は architecture owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer owner
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## Verdict
- Critical: 0 / High: 0 / Medium: 1 / Low: 1
- Round inheritance: resolved from R2: 2 (DB-P-M01/M02 維持を実確認) / deferred (据置妥当と再判定): 6 (DB-P-M03→X-4 / DB-P-M04→future / L01-L04) / new: 2 (DB-P3-M01, DB-P3-L01)

## Round 2 finding 再判定
- **DB-P-M01/M02** → **RESOLVED・維持を確認** (save 3 箇所すべて storeNewerVersion gate 済み・将来版喪失経路なし / 一意 temp 名で並行破損なし)。
- **DB-P-M03 (X-4 deferred)** → **据置妥当・データ安全性の穴なし**。3 load 分岐すべてで元/.bak 保全を検証 (parse-failed は許可・schema-version-unknown は拒否の非対称は安全側で正しい)。残る欠落は観測面のみ (folder-service 同型 UI surface = X-4)。
- **DB-P-M04 (future deferred)** → **据置妥当** (v0/v2 不在で現時点実害ゼロ・forward-safe)。
- **toConfigDir の `as never` 除去** → load 経路の round-trip 整合を具体値で確認 (host/unc 復元・非対称なし)。

## Findings (new)
### [Medium] DB-P3-M01 — `unc:` configDir の store round-trip が無テストで PB-P-L03 の変更分岐が回帰保護されていない
- **観察**: 変更した toConfigDir の unc: 分岐を実 store save→load で通すテストがない (store round-trip は host のみ、service の unc テストは branded 値を直接構築し実シリアライズを通らない)。将来 offset/prefix を壊すと WSL config Provider が reload で無言消失し検出できない。
- **推奨**: provider-store.test.ts に unc round-trip 正例 + 不正 namespace load 負例を追加。 → **[fixed] provider-store.test.ts に unc save→load 保存確認 + `wsl:Ubuntu` namespace の load invalid-path skip 負例を追加。**
### [Low] DB-P3-L01 — 一意 temp 名化で crash 時 orphan `.tmp` が sweep されず累積 (folder-store と共通の横断課題・データ喪失なし)。 → **deferred (system scope)。**

## Principle V の器 (改修後充足)
平文 `secret` は transient CredentialDraft のみ、永続型 CredentialRef は secretRefKey (ciphertext) のみ。fromProviderRecord は allow-list キーのみ・平文カラムなし。extraEnv は全経路 scanExtraEnvForSecrets 防御。**器充足・Critical/High=0。**
