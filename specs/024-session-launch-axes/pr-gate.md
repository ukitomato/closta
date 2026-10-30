# PR Gate Round 1: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Base**: main (97f4b86) — origin/HEAD の symref (001-…) は stale のため main を採用 / head 98db185
**Diff stat**: +6340 -194 over 98 files
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, database-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (8 並列)
**Round inheritance**: Round 1 のため引継ぎなし
**Rule verification**: 実行 (Round 1)。`node scripts/rules/run.mjs` 単独実行で期待表と 79/79 一致。既知の機械検証外 8 件は従来どおり
**Skipped reviewers**: なし (`reviewers_filter` が候補 8 名すべてを start と判定)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 4 | 0 | 4 | 4 | 0 |
| Medium   | 12 | 0 | 12 | 12 | 0 |
| Low      | 12 | 0 | 12 | 12 | 0 |

(dedup 後。重複統合: ux H-001 + po M-001 → H-003 / ux M-002 + a11y L-001 → M-007 / a11y M-001 + ux L-003 → M-010 / a11y M-002 + ux L-002 → M-011 / ux L-004 + a11y L-002 → L-007。code-gate の `must_fix_findings` は空のため suppress 0 件。cascade 降格 0 件、viewpoint 欠落 0 件)

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/024-session-launch-axes
  ただし AGENTS.md / AD-050 により **High 4 件はこの round で直す**。Agent(implementer, mode: fix) で H-001〜H-004 を直し → /cl-code-gate → (High を確かめるためだけの round は回さない) → /cl-done

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — AD-064 Decision 2 の「書き込みは今どおり権限モードと承認で決まる」が訂正節 / research R-02a と矛盾 [origin: architecture]
- **Where**: docs/decisions/0064-launch-config-additional-directories-limits-and-title.md:37, specs/024-session-launch-axes/research.md:28, spec.md:54, plan.md:77
- **Issue**: skills の `allowed-tools` が実行中の承認を省く事実 (訂正節 :55) を Decision 本文と spec / plan / research が否定したまま
- **Why high**: accepted ADR の誤った前提から I-3 等が Principle III を評価する (事実誤認の訂正漏れ。決定の変更ではない)
- **Suggested fix**: AD-064 訂正節に 1 項追加し Decision 2 末文を正す。同文言で research:28 / spec:54 / plan:77 を直す
- **Status in this round**: new

### H-002 — 依存解決で外した追加ディレクトリが下書きに残り、10 件上限を超えられ、「外しました」と通知した項目が黙って戻る [origin: po]
- **Where**: src/renderer/src/features/session/LaunchDialog.tsx:487-503, :896-903, :935-947; src/domain/session/launch-resolution.ts:172-188
- **Issue**: `full` は effective の件数、`onAdd` は draft に追加。ランタイム切替の往復で draft 11 件 → effective 11 件になり main が `invalid-config` で拒否、lastConfig から同じ状態で再オープン
- **Why high**: FR-001 / US-1 AC5 / FR-002 が renderer で守られず、外したはずのディレクトリを扱わせたまま起動しうる
- **Suggested fix**: (a) 外した項目を draft にも書き戻す (1 回通知して消す)、または (b) `full` / `onAdd` を draft 件数にそろえ 10 超で起動保留。表テストを追加
- **Status in this round**: new

### H-003 — 上限の入力が不正なままプリセット保存すると、画面の値ではなく直前の有効値が黙って保存される [origin: ux (High) + po (Medium)]
- **Where**: src/renderer/src/features/session/LaunchDialog.tsx:662 (`current={config}`), :920-932; PresetPanel.tsx:165
- **Issue**: 起動は `limitsInvalid` で止まるが、プリセット保存は `config` (下書き由来) を渡すため押せて古い値を保存
- **Why high**: 費用の上限 (US-2 の目的) つきと思ったプリセットが上限なしで保存されうる。FR-009 / US-4 AC1
- **Suggested fix**: `limitsInvalid` のとき `PresetPanel` に `null` を渡し理由を 1 行出す。回帰テスト追加
- **Status in this round**: new

### H-004 — セッション名欄の Enter が「既定 Provider での起動の確認」中でも素通りで起動する [origin: a11y]
- **Where**: src/renderer/src/features/session/LaunchExtraAxes.tsx:102-109; LaunchDialog.tsx:915, :550-556
- **Issue**: 確認中に名前欄で再度 Enter すると確認ボタンを押さずに既定の資格情報・課金先で起動
- **Why high**: US-2 AC3 系列 (既定 Provider で黙って起動させない) の安全弁がキー 1 回で無効化 (WCAG 3.2.2 / 3.3.4)
- **Suggested fix**: `onSessionNameSubmit={() => { if (!confirming) launch() }}`。確認中の Enter のテスト追加
- **Status in this round**: new

## Medium (Round 1) — 直さない (AD-050。棚卸しで扱う)

| ID | origin | Where | 要旨 |
|---|---|---|---|
| M-001 | security | src/domain/session/agent-session.ts:257-267 | agents の windows パス述語が `..` 成分と ADS の `:` を拒否しない (design-gate M-001 未対応) |
| M-002 | security | src/main/app/launch-preparation.ts (directoryResets / resolve 失敗の reject) | 追加ディレクトリ起因の拒否がログで `invalid-config` と区別できない (design-gate M-002 未対応) |
| M-003 | platform-boundary | src/main/app/launch-preparation.ts:118-139 | 別 folder id が同じランタイムパスに変換されると main は通し agents が decode で拒否 → `launch-failed` |
| M-004 | architecture | docs/glossary.md:547, spec.md:26/:201, AD-064:17 | 起動軸「9」の内訳が glossary と spec / ADR で食い違う |
| M-005 | architecture | e2e/launch-extra-axes.spec.ts | charter KPI「依存解決の正しさ」の E2E に追加ディレクトリの reset が無い |
| M-006 | ux | src/renderer/src/features/session/labels.ts:76-77 | main が追加ディレクトリで拒否したときの文言が原因に触れない |
| M-007 | ux + a11y | src/renderer/src/features/session/LaunchExtraAxes.tsx:136 | 「フォルダを追加」が候補なし・10 件到達で理由を示さず無効 |
| M-008 | ux | labels.ts:583-586, LaunchDialog.tsx:982-1009 | 追加ディレクトリの越境警告が作業フォルダの文言を流用・項目ごとに繰り返し・確認中の名前が不正確 |
| M-009 | ux | LaunchDialog.test.tsx | 上限・追加ディレクトリの UX テスト不足 (H-003 / M-007 / 再開の名前欄 / 複数件越境) |
| M-010 | a11y + ux | LaunchExtraAxes.tsx:67-71, :87-91 | 上限欄の `role="alert"` が途中入力 (0, 0.) のたびに読み上げられる |
| M-011 | a11y + ux | LaunchExtraAxes.tsx:152-160 | 追加ディレクトリの「外す」後にフォーカスが失われる |
| M-012 | a11y | LaunchDialog.test.tsx | keyboard / 動的通知の経路を検出するテストが無い (`toHaveFocus` / `toHaveAccessibleDescription` 0 件) |

## Low (Round 1) — 直さない

| ID | origin | Where | 要旨 |
|---|---|---|---|
| L-001 | ui-coverage | docs/ui-coverage.md:219/:223 | 起動時 `title` の経路が備考に無い |
| L-002 | platform-boundary | src/main/app/launch-preparation.test.ts | main と agents の追加ディレクトリ述語を突き合わせるテストが無い |
| L-003 | architecture | docs/domains/session/charter.md:136 | Journey 4 手順 2 に追加ディレクトリが無い |
| L-004 | architecture | docs/roadmap.md:355 | X-6 行の「(AD-064 予定)」が残る |
| L-005 | architecture (system) | docs/decisions/0064-… | 未マージ ADR への訂正節 (AD-031 後続で規則化) |
| L-006 | ux | LaunchDialog.tsx:638, labels.ts:113-114 | 画面の説明文が新しい軸を言わない |
| L-007 | ux + a11y | LaunchExtraAxes.tsx:60/:80, labels.ts:563-564 | 範囲 hint が入力前に無い (placeholder のみ) |
| L-008 | ux | LaunchDialog.tsx:939 | 新規 aria-label の直書き (Principle XV / AD-045) |
| L-009 | ux | src/renderer/src/features/shell/OverviewTab.tsx:135 | folders 取得失敗時に追加ディレクトリ行が黙って消える |
| L-010 | a11y | LaunchExtraAxes.tsx:102-109 | 名前欄だけ Enter で起動し上限欄は起動しない |
| L-011 | a11y | LaunchExtraAxes.tsx:148, LaunchDialog.tsx:936-940 | ARIA の細部 (冗長 aria-label、role=status の ul、固定 id) |
| L-012 | po | LaunchDialog.tsx:911-914, :557 | 名前だけ変えた起動が KPI「再利用率」で manual に数えられない (文書化で閉じる) |

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — C0 H0 M2 L0
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — C0 H1 M2 L3
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — C0 H1 M1 L1
- [database-reviewer.pr-gate.md](./database-reviewer.pr-gate.md) — C0 H0 M0 L0
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) — C0 H1 M4 L6
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) — C0 H1 M3 L4
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — C0 H0 M1 L1
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) — C0 H0 M0 L1
