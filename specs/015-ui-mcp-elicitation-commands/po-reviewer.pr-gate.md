# po-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 / SC-001 (US-1)、FR-007〜FR-009 / SC-002・SC-003 (US-2)、FR-010 / SC-003 (US-3。AC3 と AC6 は R1 MD-01 を受けて 2026-10-10 に改訂)、FR-011 / SC-005、FR-012〜FR-015 / SC-004
- touched files に該当する charter / Confirmation: ui charter (Mission、KPI「表示網羅」)、AD-048 Decision 1〜5、AD-047 訂正節、AD-036 §4 P3
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner 範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner 範囲
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:2 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の owner 範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

R1 の後に変わったのは次の 2 つ。
- MD-01: `live-signals.ts:446-525` で、開いた行が無いまま届いた結果から行を作るようにした。spec US-3 の AC3 / AC6 と data-model §4 (`data-model.md:137-139`) にも書いた
- MD-02: `RightPanel.tsx:150-176` で、開いた tablist のタブにも注意の印を出すようにした

どちらにもテストがある (`live-signals.test.ts:1636`、`:1649`。`LivePane.o2.test.tsx:827-865`。`RightPanel.tabs.test.tsx:278-299`)。認証の行は、セッションが終わった後も「失敗」のまま残ることまで確かめている (`LivePane.o2.test.tsx:834-835`)。po の担当のうち MD-07 / MD-08 / LW-18 のコードと文書は R1 から変わっていない。

## Round inheritance (po の担当分)

| R1 ID | pr-gate ID | 状態 | 根拠 |
|---|---|---|---|
| L-001 | MD-01 | **resolved** | `live-signals.ts:456-460` は `error` があるとき `auth:<n>` を `failed` で作る。`:489-505` は `started` が無くても行を開く。spec AC3 / AC6 (`spec.md:159`, `:162`)、data-model §4 (`:137-139`)、テスト (`LivePane.o2.test.tsx:827-854`) もそろった |
| M-001 | MD-02 | **resolved (コード)。文書は追いついていない** (下の L-101) | `RightPanel.tsx:150-176`、`RightPanel.tabs.test.tsx:278-299` |
| M-002 | MD-07 | **unresolved** | `askUserQuestionNotice` の参照は今も `ApprovalCard.tsx:66` と `ApprovalCard.test.tsx:104` だけ。`ask-user-question.aui.tsx` に注記は無い。spec の Edge Cases (`spec.md:177`) と roadmap の O-5 の行 (`docs/roadmap.md:372`) にも、承認カードが出ない権限モードの扱いが書かれていない |
| M-003 | MD-08 | **unresolved** | `shell/labels.ts:230-232` の文言は変わっていない。spec / data-model にも、直らなかったときの出口が書かれていない |
| L-002 | LW-17 | **一部 resolved** | MD-01 と MD-02 のテストは足された。MD-07 のテストは無い。E2E と V-3 は本機で確かめていない (`docs/roadmap.md:372` の未確認項目のまま) |
| L-003 | LW-18 | **unresolved** | `session-event-decoder.ts:88-91` は R1 から変わらず、観測点も足されていない |

## Findings

### [Medium] (unresolved, R1 M-002 / MD-07) 承認カードが出ない経路では、`AskUserQuestion` の「回答を送れない」の注記が利用者に届かない (M-001) (scope: feature)

- **観察**: 注記は今も `src/renderer/src/features/session/ApprovalCard.tsx:61-68` にしか無い。transcript の部品 `src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx` で `送れ` を Grep すると 0 件。一方で、`dontAsk`、`permissions.allow` の許可、昇格モードでは承認カードが出ない。spec の Edge Cases (`spec.md:177`) は「承認カードに暫定の注記」と書くだけで、カードが出ない経路に触れていない
- **同種事象探索**: `askUserQuestionNotice` を `src/renderer/src` で Grep して 3 件 (`features/session/labels.ts:191`、`ApprovalCard.tsx:66`、`ApprovalCard.test.tsx:104`)。transcript の部品からの参照は 0 件
- **リスク/影響**: 「なぜ今」の 3 つ目の問題 (`spec.md:37`。回答が届かない理由を利用者が知らない) が、上の経路では残る
- **推奨アクション**: 次のどちらかにする。(a) `ask-user-question.aui.tsx` の見出しの下に短い読み取り専用の注記を出し、テストを足す。(b) 出さないなら、spec の Edge Cases / Out of Scope と roadmap の O-5 の行の未確認項目に「承認カードが出ないモードでの `AskUserQuestion`」を書く
- **根拠**: spec「なぜ今」、US-1 AC7・AC8、PO-4
- **scope 根拠**: touched files (`ask-user-question.aui.tsx`、spec.md、roadmap.md) の中で直せる

### [Medium] (unresolved, R1 M-003 / MD-08) `needs-auth` / `failed` の案内に、従っても直らなかったときの出口が無い (M-002) (scope: feature)

- **観察**: `src/renderer/src/features/shell/labels.ts:230-232` は「claude を開き、/mcp で認証 / 詳細を確かめてください」で終わっていて、R1 から変わっていない。案内に従って直るかどうかは roadmap で未確認のまま (`docs/roadmap.md:372`)
- **同種事象探索**: `起動し直` を `shell/labels.ts` で Grep して 0 件
- **リスク/影響**: 回復の流れに出口が無い (PO-6)。印が消えないとき、待てばよいのか起動し直すべきかを利用者が判断できない
- **推奨アクション**: 2 つの案内に「次のターンでも変わらなければ、セッションを起動し直してください」を足す (`labels.ts` と data-model §3 / §6)。文言を V-3 の後に確定するなら、そのことを spec の Edge Cases に書く
- **根拠**: PO-6、design-gate R3 M-04
- **scope 根拠**: touched files の中で直せる

### [Low] (new) MD-02 の修正が spec AC5 / FR-009 と data-model §3 に反映されていない。開いた tablist に印を出すことが仕様に書かれていない (L-101) (scope: feature)

- **観察**: 印はコード (`RightPanel.tsx:30`, `:150-176`) とテスト (`RightPanel.tabs.test.tsx:278-299`) では開いた tablist にも出る。一方、文書は畳んだ帯のことしか書いていない
  - spec US-2 AC5 (`spec.md:141`): 「右のペインを畳んでいる」場合だけ
  - FR-009 (`spec.md:205`): 「畳んだ帯のアイコンに印を出す」だけ
  - data-model §3 (`data-model.md:123`): 開いた tablist に触れていない
- **同種事象探索**: `tablist` を data-model.md で Grep して 0 件
- **リスク/影響**: SC-003 は「US-2 の AC のとおり」で判定する。このため、新しく入れた振る舞いが受け入れ基準に無く、後の変更で外されても仕様の違反にならない
- **推奨アクション**: AC5 に「開いているときは tablist の『構成』のタブにも同じ印」を足す。FR-009 と data-model §3 も同じ形にそろえる
- **根拠**: PO-3
- **scope 根拠**: spec.md と data-model.md

### [Low] (unresolved, R1 L-002 / LW-17 の残り) H: MD-07 を検出するテストが無い。E2E と V-3 は本機で確かめていない (L-102) (scope: feature)

- **観察**: MD-01 と MD-02 のテストは足された (上の表)。MD-07 (承認カードを経ない `AskUserQuestion`) のテストは無い。V-3 の実機での目視は `docs/roadmap.md:372` で未確認のまま
- **推奨アクション**: M-001 を直すときにテストを足す。PR の説明に「E2E は CI の結果で判定する」「V-3 は未確認」と明記する
- **根拠**: reviewer-base H
- **scope 根拠**: touched files のテストと PR の説明

### [Low] (unresolved, R1 L-003 / LW-18) H: decoder が `init-report` / `commands` を捨てても観測点が無く、タブは待ちの表示のまま止まる (L-103) (scope: feature)

- **観察**: `src/renderer/src/features/session/session-event-decoder.ts:90-91` は R1 から変わっていない。spec の Edge Cases にも「起きない前提」の記述が無い
- **推奨アクション**: R1 と同じ。破棄を数える観測点を足すか、spec の Edge Cases に「起きない前提」として書く
- **根拠**: reviewer-base H、design-gate R3 M-05
- **scope 根拠**: touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `askUserQuestionNotice` (src/renderer/src) | 3 | features/session/labels.ts:191, ApprovalCard.tsx:66, ApprovalCard.test.tsx:104 |
| M-002 | `起動し直` (shell/labels.ts) | 0 | — |
| L-101 | `tablist` (data-model.md) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
- Round inheritance: resolved from 1: 2 (MD-01 / L-001 と MD-02 / M-001。MD-02 の文書の残りは L-101 として別に挙げた) / unresolved: 4 (MD-07、MD-08、LW-17 の残り、LW-18) / new: 1 (L-101)
