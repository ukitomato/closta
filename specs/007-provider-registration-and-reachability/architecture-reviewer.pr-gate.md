# architecture-reviewer Review (pr-gate Round 3): Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: pr-gate / **Round**: 3 / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift / cross-domain invariant: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / ADR drift / layering: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer owner
- G. optional reviewer 範囲: 該当なし: database / a11y / ux 各 owner
- H. テスト / coverage / observability / regression: Medium:0 Low:1

## Verdict
- Critical: 0 / High: 0 / Medium: 1 / Low: 1
- Round inheritance: resolved from R2: 1 (C-M-101 テスト固定で妥当) / appropriately据置: 2 (D-L-101/D-L-102 out-of-scope・roadmap durable 記録・ADR immutable 尊重) / new: 2 (C-M-201, H-L-201)

## Round 2 finding 解決状態
- **C-M-101** (reachability の stopped 分岐差) → **RESOLVED (妥当)**。reachability.test.ts に安全側の意図的差を固定。provider の stopped→blocked は workspace の reachability エンジン本体 (stage0) と一致し、差は resolution エンジンに対してのみ・fail-closed 安全側。
- **D-L-101/D-L-102** (ADR trail) → **appropriately据置**。roadmap.md X-3 行に durable 記録、AD-039/AD-005 本文 immutable 尊重・無改変を確認。

## Findings (new)
### [Medium] C-M-201 — spec/plan/data-model が aws-assume-role の「AWS 一時資格 3 変数を env に実名注入」(廃案 direct-AssumeRole) を残置し R-02 と自己矛盾
- **観察**: R-02 (awsCredentialExport 化) はコード (derive-env.ts:68-71 settings のみ・types.ts の CredentialRef aws-assume-role=helperPath のみ・ResolvedCredential に AWS 一時資格なし) では成立するが、FR-009 (spec.md:264/266)・data-model §4(b)・plan.md:142/149・tasks.md:87 が「aws-assume-role=AWS_ACCESS_KEY_ID+SECRET+SESSION_TOKEN を実名注入」を残置。同一 spec 内で FR-006 (helper 委譲) と FR-009 (3 変数注入) が正面矛盾。X-4 実装者が Principle V 再導入しかねない latent trap (src は R-02 準拠で現時点実害なし)。
- **推奨**: FR-009/data-model §4(b)/plan/tasks の aws-assume-role 3 変数を「helper 委譲 (settings.awsCredentialExport)」に置換。 → **[fixed] FR-009 / data-model §4(b) / plan.md:142,149 / tasks.md:87 を R-02 準拠 (helper 系は settings 委譲・aws-profile を実名集合に) に修正。**
### [Low] H-L-201 — derive-env.test が aws-assume-role で env.AWS_ACCESS_KEY_ID 等の不在を明示 assert せず、C-M-201 の回帰 (3 変数注入再導入) を検出できない。 → **[fixed] derive-env.test.ts に env.AWS_* 不在の negative assert 追加。**

## drift なし確認
レイヤ違反なし (reachability.ts の runtimePathOps import は Principle I 準拠・pure)、spec 改訂の charter/ADR 整合、AD-040 Confirmation、Reachability 型の domain 帰属、deriveEnv 二重 fail-closed。
