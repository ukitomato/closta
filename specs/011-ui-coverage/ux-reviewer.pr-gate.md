# ux-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: ux-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 3 (HEAD a28fcf9。Round 2 の修正は 57fcc0b..a28fcf9)

## 初回読了 viewpoint

- FR/SC: FR-007、FR-008 / FR-009、FR-012 / FR-013、SC-003 / SC-005 / SC-006
- charter / Confirmation: ui charter (表示網羅)、Constitution XIII (新しいトークンなし)、glossary「Transcript density」「System event row」
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

a28fcf9 の変更 (`labels.ts`、`terminal-block.aui.tsx`、`tool-result-marks.tsx`、SystemEventRow、hook_name の allowlist、テスト、先送りの記録) を見た。R2 の Medium 3 件は直ったか持ち主付きで先送り。Low 7 件中 6 件も同様。L-006 だけ持ち主の記録が無い。

## Round 2 inheritance

| R2 ID | 状態 | 根拠 |
|---|---|---|
| M-001 結果待ち / 結果不明の印 | deferred (O-6) | roadmap.md:258、ui-coverage.md:104 |
| M-002 Terminal block の失敗の印 | resolved | terminal-block.aui.tsx:48、test :200-204 |
| M-003 TodoWrite / ExitPlanMode / Write のテスト | resolved | SessionScreen.o2.test.tsx:306-357 |
| L-001 「失敗」→「エラー」 | resolved | labels.ts:78 |
| L-002 Used tool の日本語化 | deferred (O-6) | roadmap.md:258 |
| L-003 密度の説明文 | resolved | labels.ts:95-97 |
| L-004 Hook / task の案内 | resolved | labels.ts:44-48、thread.aui.tsx:937-942、tests :204-239 |
| L-005 unknown / outcomeUnknown | resolved (正確さは L-101) | labels.ts:31, :39 |
| L-006 監視ビューの密度の見出し (system) | unresolved (持ち主なし) | → L-103 |
| L-007 シェルの BG task の見分け | deferred (O-6) | roadmap.md:258 |

## Findings

### [Low] 「SDK が知らない状態」の意味が逆 (L-101) (scope: feature)

- **観察**: `labels.ts:30-31` — 知らないのはアプリの方
- **推奨アクション**: 「未対応の状態」か「このアプリが知らない状態」
- **根拠**: UX-2

### [Low] Hook の名前を伏せたとき、同じ hook_event の Hook 同士を見分けられず、伏せたことも分からない (L-102) (scope: feature)

- **観察**: allowlist (`system-event.ts:59-65`) は正規表現の matcher (`PreToolUse:^Bash$` など) も `''` にする。行は「Hook / <hook_event> / <状態>」だけ
- **推奨アクション**: 伏せたときに muted の「（名前は非表示）」(domain に `nameHidden` の印が要る)、または O-6 の「一般の Hook の表示」に論点を書き足して先送り
- **根拠**: UX-1 / UX-2

### [Low] L-006 に持ち主が書かれていない (L-103) (scope: system)

- **推奨アクション**: roadmap の該当する行 (O-1 の続きか O-6) に 1 行足す
- **根拠**: UX-9

### [Low] (H) 正規表現の matcher の名前が伏せられることのテストが無い (L-104) (scope: feature)

- **推奨アクション**: `PreToolUse:^Bash$` のケースを 1 件足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `SDK が知らない` | 1 | src/renderer/src/features/chat/labels.ts:31 |
| L-102 | `hookNameOf` | 2 | src/domain/session/system-event.ts:62, :123 |
| L-103 | `L-006\|監視ビューの密度` | 先送りの記録 0 | — |
| L-104 | matcher のケース (system-event.test.ts) | 0 | src/domain/session/system-event.test.ts:201-227 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved 6 / deferred 3 / unresolved 1 / new 3
