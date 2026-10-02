# security-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Reviewer**: security-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-005 / FR-009 / FR-011 / FR-012 / SC-003 / SC-009 (今回の差分)。Round 2 で確認済み: FR-001 / FR-002 / FR-003 / FR-004 / FR-007 / FR-013 / FR-014 / SC-002 / SC-004 / SC-005 / SC-006
- 対象 files に該当する charter / Confirmation: AD-043 Decision 5 / 6 / 7、AD-036 §3、Principle V / VII
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## Round 2 以後の変更の確認 (指摘なし)

- spawn ガード: `src/agents/sdk-agent-session.ts:390` (closing || finished で throw)、catch `:546-549` は closing で失敗にしない。spawn は `:393` の 1 箇所、`shell: false`。負例テスト `sdk-agent-session.test.ts:357`
- resultAction: `session-core.ts:348-354` 純関数、権限ゲートに触れない。テスト `session-core.test.ts:102-110`
- canEnd: `run-state.ts:76-78`。スレッド側判定 `sdk-agent-session.ts:445`。renderer は表示の導出のみで迂回経路なし。e2e-capability は二重ゲート下
- session-view の強制終了 (`session-view.ts:128`): スレッドは `acceptsWhileClosing` で kill のみ受ける。受け付ける制御は広がっていない
- SessionScreen の表示名 (`SessionScreen.tsx:64-79`): React のエスケープ経由。`dangerouslySetInnerHTML` / `innerHTML` 実使用 0
- verify.yml (`:92-102`): 外部入力の展開なし、secret 参照なし、`contents: read`。許可リストは厳しい側への変更
- E2E 計測 / SessionScreen.test.tsx: アプリ・preload に口を足していない
- docs: AD-043 Decision 6・7 と check.mjs の検査項目の記述は一致

## Findings

該当なし。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| 再確認 | `spawnClaudeCodeProcess\|closing\|finished\|resultAction` | spawn 1 / ガード 1 | src/agents/sdk-agent-session.ts:390,393 |
| 再確認 | `dangerouslySetInnerHTML\|innerHTML\|openExternal\|eval\(\|new Function` (src/renderer) | 実使用 0 | ProviderScreen.tsx:27 / pending-queue-notice.test.tsx:38 |
| 再確認 | `canEnd` (src、非テスト) | 3 箇所 | run-state.ts:76 / sdk-agent-session.ts:445 / session-view.ts:117 / e2e-capability.ts:204 |
| 再確認 | verify.yml の `${{` 展開 | `run:` 内 0 | .github/workflows/verify.yml:92-102 |

Critical は 0 件で、cascade の対象は無い。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: resolved from 2: 0 / unresolved: 0 / new: 0
