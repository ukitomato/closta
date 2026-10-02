# po-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Reviewer**: po-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-009 / FR-010 / FR-011 / SC-003 / SC-006
- touched files に該当する charter / Confirmation: session charter Journey 3、KPI「並列時の滑らかさ」。AD-043 Decision 3
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux は担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## Round 2 指摘の判定

| ID | 判定 | 根拠 |
|---|---|---|
| M-101 | resolved | `spec.md:88`, `:92-94`, `:225-226`, `:305`、glossary `:289-290`, `:549`, `:594-595`、`quickstart-results.md:63` |
| M-102 | resolved | `e2e/multi-session.spec.ts:150-155`, `:194-195`、`quickstart-results.md:73,75`、`spec.md:297` |
| M-103 | resolved | `session-view.test.ts:64-79` |
| M-104 | resolved | `session-view.ts:128`、`running-session-store.test.ts:285-295`、`spec.md:225` (残る UX は L-201) |
| L-101 | resolved | `SessionScreen.tsx:64-79,102-107`、`SessionScreen.test.tsx:142-145` |
| L-102 | resolved | `SessionScreen.test.tsx:118-140` |
| L-103 | resolved | `labels.ts:90,101-102`、`session-view.ts:73`、`RunningSessionList.test.tsx:146-148` |

## Findings

### [Low] L-201 終了がセッションスレッドに受け付けられなかった後も行が「終了中」のまま戻らず、応答待ちに戻っても穏当な終了をやり直せない (new)
- **観察**: `running-session-store.ts:341` は `ending: true` を立てるだけで戻す経路が無い (`:263` のみ)。`session-view.ts:73` は ending を優先表示、`sdk-agent-session.ts:445` は `canEnd` 偽なら黙って捨てる。テスト `running-session-store.test.ts:291-294` がこの振る舞いを固定
- **同種事象探索**: `ending: (true|false)` 2 件 (:263, :341)。拒否を返す経路 0 件
- **推奨アクション**: ending の間に run-state が `running` / `awaiting_permission` へ移ったら ending を外す。テストの期待値も合わせる
- **根拠**: spec FR-011 / FR-009

### [Low] L-202 「最初のプロンプトの前は JSONL がまだ書かれていない」を spec が事実として書く (new)
- **観察**: `spec.md:93`, `:226` は断定、`quickstart-results.md:63` はファイル単位の確認なしと記録
- **同種事象探索**: `JSONL` 3 件 (spec.md:226, quickstart-results.md:63 ×2)
- **推奨アクション**: spec の該当文に `[ASSUMED]` を付けて quickstart-results を参照、または実機で確認
- **根拠**: spec FR-011、AD-043 Decision 3

### Critical が 0 件であることの確認
終了中の強制終了、プロンプト待ちの即時停止、承認待ち / 応答中の操作、SC-003 の窓内着信、読み込み中のヘッダを確認。データ喪失・停止の経路なし。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `ending: (true\|false)` | 2 | running-session-store.ts:263, :341 |
| L-202 | `JSONL` (spec / quickstart-results) | 3 | spec.md:226, quickstart-results.md:63 (2) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved from 2: 7 / unresolved: 0 / new: 2 (L-201 / L-202)
