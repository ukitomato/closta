# ui-coverage-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-16
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC: Round 1 と同じ。FR-001〜FR-015、FR-018、SC-001〜SC-004。Round 2 の差分が触るのは FR-011〜FR-013 と FR-001〜FR-005 の伏せ字。
- charter / Confirmation: `docs/domains/ui/charter.md` (Out of scope)、AD-044 Confirmation、AD-049 Decision 1 / 3 / 6。
- 機械照合で見られるものは見ていない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:0 Medium:0 Low:0 (Round 1 の未解決は Medium:2 Low:2 のまま)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 2 で対応表に関わるのは `tool-result-marks.tsx` (+ test) と `secret-redaction.ts` (+ test) の 2 組だけ。`docs/ui-coverage.md` は差分に入っておらず、行・割当・Tier・経路は Round 1 から不変。

- UC-1: `tool-result-marks.tsx:85-91` の running 専用の動く印 (po H-003 の修正) の後も `docs/ui-coverage.md:109` の記述は真。行の追加・割当の変更は不要。逆向きは 0 件
- UC-3: running / awaiting の差は `tool-result-marks.test.tsx:80-96` が固定。経路は Round 1 から不変
- UC-2 / UC-4 / UC-5 / UC-6: 該当なし (対応表に変更なし)
- UC-7: `後続: O-6` の行は引き続き 0 件
- secret-redaction の変更 (`:60-91` の `redactJwt`、`:138` の mysql 上限) は対応表の「伏せ字つき」(`:55,56,82`) と矛盾しない

## Findings

Round 2 の新規指摘はありません。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (新規指摘なし) | — | — | — |
| 参考 (Round 1 M-002 の再確認) | `Inline citation\|Sources` を `docs/` で Grep | roadmap 0 件、`docs/ui-coverage.md:138,291,335,361` に備考 | 未解決 |

## H の根拠

- spinner の有無と `aria-busy` は `tool-result-marks.test.tsx:80-96` が固定。`motion-reduce` の class を直接見るテストは無いが a11y の範囲
- 伏せ字は `secret-redaction.test.ts:71-82` と `:118` 付近が固定
- 対応表の機械照合は項目 21 が CI で見る

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: resolved from 1: 0 / unresolved: 4 / new: 0

未解決 (Round 1、AD-050 により gate では直さない):
- ui-coverage M-001: 同じ `tool_use_id` の知らせの合成で `prevented` が後の `notice` に上書きされうる (`src/domain/session/system-event.ts:197,219`、`docs/ui-coverage.md:82`)
- ui-coverage M-002: F 節の Inline citation / Sources (`docs/ui-coverage.md:291,335`) が O-11 を持ち主にしているが roadmap O-11 の範囲 (`docs/roadmap.md:384`) に入っていない
- ui-coverage L-001: `docs/ui-coverage.md:83` (`conversation_reset`) に過去ログの扱いが無い
- ui-coverage L-002: `docs/ui-coverage.md:178` (`meter`) が `retraction` の種類を書いていない
