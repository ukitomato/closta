# convention-reviewer Review (code-gate iter 5): X-1
**Verdict**: Critical 0 / High 0 / Medium 3 / Low 1
## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / XSS: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution / ADR drift / layering: 該当なし: architecture-reviewer owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup / import order / dead code: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage: Critical:0 High:0 Medium:2 Low:0
lint-agent JSON exit 0 / violations 0 → CONV-1/3/4 clean。新規 wsl-cli.test.ts の配置・命名は適合。
## Findings
### [Medium] 検出用と起動用の env allowlist が重複で SSoT 割れ + コメント不正確 (M-001)
- DETECTION_ENV_ALLOWLIST (wsl-cli.ts) と LAUNCH_ENV_ALLOWLIST (launch-spec.ts) が同値の別定数。「circular」コメントは不正確 (launch-spec→wsl-cli は既に一方向。共有定数を wsl-cli に置けば非循環)。
- Fix: 共有 allowlist を wsl-cli.ts に一本化し launch-spec が import、または等価性 assert test + コメント正確化。
### [Medium] SessionScreen の新規描画分岐 (KilledNotice / killed 無効化 / ラベル) が未テスト (M-002) — X-2 移譲済維持だが今 iter の追加分は無テスト
### [Medium] useLiveSession の killed / kill() / failure→setPending(null) が同居 test 未カバー (M-003) — kill ケース追加を推奨 (send/interrupt/respond は test 済で非対称)
### [Low] wsl-cli.ts の WSL_BINARY コメントが launch-spec の import 対象を取り違え (L-001) — launch-spec は resolveWslBinary を import (WSL_BINARY 直接ではない)
## Verdict
Critical 0 / High 0 / Medium 3 / Low 1。gate を止める Critical/High なし。viewpoint A-H 完備。
