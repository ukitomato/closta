# convention-reviewer Review: 起動中のセッションの UI の手直し (O-13, spec 025)

**Run**: 2026-10-30
**Reviewer**: convention-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: code-gate iteration 3 (MF-001 修正 = labels.test.ts と data-model.md §9 の noMatch 追記の後)

## 初回読了 viewpoint

- FR/SC: FR-016〜FR-018 (`/resume`、`RESUME_PICKER_LABELS`)。iteration 2 から変わったのは `labels.test.ts` と `data-model.md` §9 だけ。FR-001〜FR-015 と SC-001〜SC-007 は iteration 2 の判断を引き継ぐ (差分が無いので再判定していない)。
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md`、`.dependency-cruiser.js` の `no-circular`、tasks.md FE-001 のテスト欄 (`features/session` から `features/shell` への import が 0 件)。
- lint-agent の JSON は受領済み。overall exit_code 0。6 コマンドすべて exit_code 0 なので、exit_code 起因の Critical は無し。violations は `prettier/prettier` の warning 4 件で、iteration 2 と同一。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: owner 外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: owner 外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: owner 外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:6 Low:2
- G. optional reviewer 範囲: 該当なし: owner 外 (optional reviewer)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (M-005: FE-001 の検査条件がテストファイルで破られている件。既存 regression を壊す根拠は見つからなかった)

## スコープ要約

iteration 2 からの差分は MF-001 の修正だけで、convention 観点の新規論点は無い。`src/renderer/src/features/session/labels.ts:487` の `noMatch: (query) => ...` は 6 つ目のキーとして実在する。`labels.test.ts:264-276` が 6 キーを `Object.keys().sort()` で網羅し、`noMatch` だけ関数なので分離して `noMatch('abc')` に `abc` が含まれることを確かめている。`data-model.md:292` の表も `title / search / empty / noMatch / loading / close` の 6 つで、コードと一致する。識別子の名前に spec と実装の食い違いは無い (CONV-6 でリネーム漏れ 0 件)。

## Findings

iteration 2 の 8 件はすべて未解決で、解消した finding は 0 件。どれも MF-001 の修正範囲外で、再検査の結果は次のとおり。

### [Medium] Lint rule violation: prettier/prettier (M-001〜M-004) (scope: feature) — 未解決

- **観察**: lint-agent の `violations_in_scope` に同じ 4 件が残っている。
  - `src/agents/sdk-agent-session.ts:21`
  - `src/agents/supervisor-protocol.test.ts:208`
  - `src/agents/supervisor-protocol.test.ts:215`
  - `src/renderer/src/features/shell/UsageTab.tsx:122`
- **同種事象探索**: lint-agent `violations[]` の `prettier/prettier` が 4 件 (上記)。
- **リスク/影響**: 整形の揺れ。
- **推奨アクション**: `prettier --write` を当該 3 ファイルに掛ける。
- **根拠**: lint-agent JSON。warning は Medium。

### [Medium] features/session のテストが features/shell を import している (M-005) (scope: feature) — 未解決

- **観察**: `src/renderer/src/features/session/LiveSettingsControls.test.tsx:15` が `@/features/shell/CenterHeader` を import している。一方 `features/shell/CenterHeader.tsx:8` は `features/session/LiveSettingsControls` を import している。tasks.md FE-001 は「`features/session` から `features/shell` への import が 0 件」を検査条件にしている。
- **同種事象探索**: `Grep "features/shell|\.\./shell" src/renderer/src/features/session` で 2 件。import は `LiveSettingsControls.test.tsx:15` の 1 件で、`ResumePickerDialog.tsx:24` はコメントなので import ではない。
- **推奨アクション**: `CenterHeader` を描く `describe` を `features/shell/CenterHeader.test.tsx` に移す。または FE-001 の検査条件を「本体の import」に限ると tasks.md に追記する。
- **根拠**: tasks.md FE-001、CONV-3。

### [Medium] 500 行超のファイルがさらに膨らんでいる (M-006) (scope: feature) — 未解決

- **観察**: iteration 2 と同じ。`LivePane.tsx` (619 → 793)、`session-launch-service.ts` (612 → 734) ほか計 7 ファイル。今回の差分はテストと data-model だけなので数値は変わっていない。
- **同種事象探索**: iteration 2 の 7 件のまま。
- **推奨アクション**: gate では直さず、マイルストーンの棚卸しで分割を扱う (AD-050)。
- **根拠**: CONV-3。

### [Low] `.vitest/` が未追跡のまま、`.gitignore` に無い (L-001) (scope: feature) — 未解決

- **観察**: git status に `?? .vitest/` が残っている。`Grep "vitest" .gitignore` は 0 件。
- **推奨アクション**: `.gitignore` に `.vitest/` を足す。
- **根拠**: CONV-2。

### [Low] 未追跡のバックアップが残っている (L-002) (scope: feature) — 未解決

- **観察**: `specs/025-ui-live-session-fixes/.gate-verdict-code.json.20261030T004558` が `??` のまま。gate 生成物なので gate 側で掃除すればよい。
- **根拠**: CONV-2。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001〜M-004 | lint-agent `violations[]` の `prettier/prettier` | 4 | `src/agents/sdk-agent-session.ts:21`、`src/agents/supervisor-protocol.test.ts:208`、`src/agents/supervisor-protocol.test.ts:215`、`src/renderer/src/features/shell/UsageTab.tsx:122` |
| M-005 | `features/shell\|\.\./shell` in `src/renderer/src/features/session` | 1 (import) + 1 (コメント) | `src/renderer/src/features/session/LiveSettingsControls.test.tsx:15` (`ResumePickerDialog.tsx:24` はコメント) |
| M-006 | 行数と base 7f6ef94 の比較 | 7 | iteration 2 と同じ |
| L-001 | `vitest` in `.gitignore` | 0 | (なし) |

## 補足 (finding にしない)

- `specs/025-ui-live-session-fixes/touched-files.txt:73-74` に旧パス `features/shell/LiveSettingsControls.{tsx,test.tsx}` が残っている。新パス `features/session/...` は `:56-57` に載っているので、旧パスは移動元の記録とも読める。記録の問題で、コードの問題ではない。
- iteration 2 の `noMatch` 関連の指摘 (MF-001) は、`labels.test.ts:264-276` と `data-model.md:292` で解消済みと確認した。

## Verdict

- Critical: 0
- High: 0
- Medium: 6
- Low: 2
- Round inheritance: resolved from iteration 2: 0 / unresolved: 8 (M-001〜M-006、L-001、L-002) / new: 0
- lint exit_code: 0 (非ゼロのコマンドなし)。lint 起因の Critical は無し。
