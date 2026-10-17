# PR Gate Round 1: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17T14:00:00Z
**Base**: main
**Head**: 459b359ae37d31201d890dca5d7f069a1553ba20
**Diff stat**: +5474 -182 over 76 files
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped**: database-reviewer (auto_invoke_patterns に一致する変更ファイルが無い。変更 76 件 / pattern 5 件)
**Round inheritance**: なし (Round 1)
**Rule verification**: `node scripts/rules/run.mjs` を単独で実行。期待表と一致 69 件、exit 0 (機械検証で捕まらない経路 9 件は既知の追跡対象で、本 PR の差分とは無関係)

## Verdict

dedup 後の件数 (重複の統合は下の「Dedup」節)。

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 5 | 0 | 5 | 5 | 0 |
| Medium   | 12 | 0 | 12 | 12 | 0 |
| Low      | 13 | 0 | 13 | 13 | 0 |

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/017-ui-conversation-time-and-activity
  ただし AD-050 により High はこの round で直す。High だけを確かめるための round は回さない。High 5 件を Agent(implementer, mode: fix) で直してから /cl-code-gate を通し、/cl-done へ進む。

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 過去の会話の読み込み中・失敗のとき、地図が事実と違う空の理由を出す [origin: ux]
- **Where**: src/renderer/src/features/shell/CenterPane.tsx:189-206, src/renderer/src/features/chat/ConversationTimeProvider.tsx:52-58, src/renderer/src/features/shell/ConversationMapTab.tsx:58,104-112,315-321
- **Issue**: `PastCenter` は transcript の status が loading / failed でも `messages=[]` を publish する。このため地図は「まだターンがありません」「時刻の記録が無いため…」と出す
- **Suggested fix**: loading / failed のあいだは publish しない。または公開値に status を載せて文言を分ける。loading / failed のテストを足す (ux L-006)
- **Status in this round**: new

### H-002 — 地図の行の補助テキストが bg-accent の上で light の 4.5:1 を割る (約 4.40:1) [origin: a11y]
- **Where**: src/renderer/src/features/shell/ConversationMapTab.tsx:396,406
- **Issue**: hover 行と aria-current 行で、`text-muted-foreground` text-xs が `bg-accent` の上に乗る (WCAG 1.4.3)
- **Suggested fix**: hover / current のとき補助行を `text-accent-foreground` にする。または current を左ボーダー方式にする (a11y M-001 と合わせて直す)
- **Status in this round**: new

### H-003 — SC-003 / US-2 AC3 (実行中に行が増えてもスクロールとフォーカスを奪わない) の計測経路が無い [origin: po]
- **Where**: src/renderer/src/features/shell/ConversationMapTab.test.tsx, src/renderer/src/features/chat/MessageTimeLabel.test.tsx
- **Issue**: 行の追加でフォーカスとスクロールが変わらないことを確かめるテストが無い。SC-002 の AC6 (時計が 2 つあるときの所要時間) も component テストに無い
- **Suggested fix**: 地図に 1 件足す (publish で n+3 → 500ms 進める → activeElement と scrollTop が不変)。MessageTimeLabel に receivedAt / createdAt を ±5 分ずらした fixture を 1 件足す
- **Status in this round**: new

### H-004 — 地図が出す境界・拒否の印と tool / エラーの数が、対応表の元の行の割当に書かれていない [origin: ui-coverage]
- **Where**: docs/ui-coverage.md:52,56,57,84,106,110
- **Issue**: ui charter:84-86 は、シェルの部品が emit を表示するならその行の割当に部品を書くと定める。地図はこれらの行の内容を表示している
- **Suggested fix**: A 節の 4 行の割当に `ConversationMapTab` を足す (経路は実際の出方に合わせる)。B 節の 2 行の備考に「O-9: 地図の行の tool の数とエラーの数」を足す
- **Status in this round**: new

### H-005 — roadmap の「V-3 で確かめられなかった項目」から AD-051 の Confirmation (V-3 #1) が抜けている [origin: architecture]
- **Where**: docs/roadmap.md:382, specs/017-ui-conversation-time-and-activity/quickstart-results.md:28
- **Issue**: roadmap は未確認を 2 項目としか書いていない。このため ADR の前提 (過去ログに `timestamp` がある) が確認済みに読める。quickstart-results とも食い違っている
- **Suggested fix**: roadmap の O-9 の行に、未確認の V-3 項目を全部挙げる (#1 を先頭に置き、AD-051 の Confirmation と明記する)。quickstart-results には持ち主を書く (po M-001 と関連)
- **Status in this round**: new

## Medium / Low

AD-050 により直さない。各 raw output に残す。dedup 後の内訳は次のとおり。
- security: Low 1
- architecture: Medium 2 (session charter の O-9 の記録、glossary の Message time の定義) / Low 2
- po: Medium 1 (V-3 未実施) / Low 1
- ux: Medium 4 / Low 6
- a11y: Medium 5 / Low 3
- platform-boundary: Low 1
- ui-coverage: Medium 1 / Low 3

## Dedup

自動で統合した。key は path:line と主題。
- ux M-004 と a11y M-004 (MessageTimeLabel.tsx:49 の `tabIndex=0`) → 1 件 (Medium)
- ux L-003 と a11y M-001 (ConversationMapTab.tsx:396 の現在行と hover が同じ色) → 1 件 (Medium の側に寄せた)
- ux M-002 と a11y L-001 (帯の区間に title / 時刻の範囲が無い) → 1 件 (Medium の側に寄せた)
- ui-coverage L-002 と architecture L-001 (registry の element 数 127→128) → 1 件 (Low)
- po L-001 と architecture L-002 (時刻が null に落ちたことを観測できない) → 1 件 (Low)

## Suppressed by code-gate

0 件。code-gate の `must_fix_findings` が空だったため。

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
