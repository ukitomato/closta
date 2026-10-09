# PR Gate Round 1: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T17:48:39Z
**Base**: main (merge-base 44ce810, HEAD fc3a5fc, 6 commits)
**Diff stat**: +15232 -896 over 115 files
**Reviewers**: security-reviewer / architecture-reviewer (default) / architecture-reviewer (`--scope adr-drift`) / po-reviewer / ux-reviewer / a11y-reviewer / platform-boundary-reviewer / ui-coverage-reviewer (8 runs, 7 agents, in parallel)
**Skipped**: database-reviewer (`auto_invoke_patterns` に一致する変更ファイルが無い。変更 115 件 / pattern 5 件)。lint-agent / test-agent / convention-reviewer は code-gate 専任のため起動しない
**Round inheritance**: Round 1 のため引き継ぐ pr-gate の findings は無い (Critical: 0, High: 0)。design-gate R3 で出て手当てされずに残った指摘 (MG-03 / 04 / 06 / 08 / 10 / 13 / 15 / 16、L-202 / 204 / 205 / 206 など) は、各 reviewer がこの round の findings として改めて出している
**Rule verification**: `node scripts/rules/run.mjs` を他の検出器と並べずに 1 回だけ実行。64 件すべて期待表と一致。機械検証で捕まらない経路 9 件は既知 (SC-017 で追跡)。実行後の作業ツリーはクリーン
**Code-gate verdict**: PASS (critical 0 / must_fix 0)。`must_fix_findings` が空なので、code-gate との重複として抑制したものは無い

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 2 | 0 | 2 | 2 | 0 |
| Medium   | 20 | 0 | 20 | 20 | 0 |
| Low      | 27 | 0 | 27 | 27 | 0 |

(reviewer の生の件数: High 2 / Medium 26 / Low 30。reviewer をまたいで同じ事象を集約し、Medium 6 件と Low 3 件を減らした。下の各 finding の origin 欄が集約元)

**Status**: PASS (Critical=0)
**Next**:
  PASS         → /cl-done specs/014-ui-metering-and-limits
  FIX_REQUIRED → (該当なし)
  CONVERGENCE  → (該当なし)

**/cl-done の前に人間が決めること (gate は止めない)**:
- M-001: O-4 と関係の無い commit `dc9ef2e` (codegraph / serena の設定) をこの PR に残すか、別の chore PR に分けるか
- M-002: AD-047 の Decision の 4 / 5 の並び。本文の 2 行を入れ替えるか、訂正節に 1 行足すか
- M-019: AD-047 訂正 #3 の根拠 `c89b423` を origin から辿れるようにするか (旧ブランチかタグを push する、根拠の字面を写す、head を別名で push する)
- M-007: V-4 (実機の確認、10 項目すべて未確認) を /cl-done の前に行うか、PR の説明に未検証の前提と持ち主を書くか
- H-001 / H-002: WCAG 1.4.3 のコントラスト不足 (High)。この PR で直すか

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 思考の印のトークン数のコントラストが 2.05:1 (light) / 2.52:1 (dark) [origin: a11y]
- **Where**: src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:570-580 (呼び出し側。vendored の thinking-indicator.tsx:20,37 の `text-foreground/30` と `/55`)
- **Issue**: US-4 AC4 の値「約 N トークン」が WCAG 1.4.3 (4.5:1) に届かない
- **Suggested fix**: 呼び出し側の className で `text-muted-foreground` に上書きする (vendored は触らない)。テストで class を確かめる
- **Status in this round**: new

### H-002 — 権限モードの警告の帯と Quota banner (rejected) の文字が light で 3.99:1 [origin: a11y]
- **Where**: src/renderer/src/features/shell/CenterBanners.tsx:90, :157 (`bg-destructive/10 text-destructive text-sm`)
- **Issue**: 安全の警告 (Principle III) の文が WCAG 1.4.3 に届かない。同じ class の既存の箇所 (LivePane.tsx:323 / thread.aui.tsx:795 / code-diff.aui.tsx:64) は system scope
- **Suggested fix**: 文字色を `text-foreground` にし、警告の見た目は枠と `aria-hidden` のアイコンで残す (または `text-red-700 dark:text-destructive`)
- **Status in this round**: new

## Medium (Round 1)

| ID | Title | Origin | Where | Status |
|---|---|---|---|---|
| M-001 | O-4 と無関係の commit `dc9ef2e` が PR に入っている。共有の設定に、PATH で解決するプロンプトごとの hook (`codegraph.cmd`) と `mcp__codegraph__*` の allow を足している。`.codegraph/.gitignore` を commit したので opt-in の条件が常に真になる | security M-001 + architecture M-003 | .claude/settings.json:21,24-35 / .mcp.json:5 / .codegraph/.gitignore / .claude/CLAUDE.md:4-9 | new |
| M-002 | AD-047 の Decision がソースでは 1,2,3,5,4 の順。Markdown で描くと 4 と 5 が入れ替わる | architecture M-002 + adr-drift M-001 | docs/decisions/0047-session-meter-and-failure-reasons.md:37-38 | new |
| M-003 | 「ターン数」が 2 つの数を指す (使用量のタブ = 受けた result の数、max-turns = SDK の往復の上限) | architecture M-001 + po L-002 | src/renderer/src/features/shell/labels.ts:185 / src/renderer/src/features/session/labels.ts:44,94 / docs/glossary.md:373,569 | new |
| M-004 | 権限モードの警告の帯が、終端のセッションでも `role="alert"` と「動いています」のまま出る。止める操作の案内も無い。終端の組み合わせのテストも無い | po M-002 + ux M-001 + ux M-005 | src/renderer/src/features/shell/CenterBanners.tsx:42-43,58-97 / shell/labels.ts:152-153 | new |
| M-005 | turn が届かない終わり方 (強制終了・異常終了・0 に倒した result) で、「思考中」の印と tool の経過時間が止まったまま残る。テストも無い | po M-001 + ux M-002 + ux M-005 | thread.aui.tsx:570-580 / tool-result-marks.tsx:49 / running-session-store.ts:163-202 | new |
| M-006 | 再ログインの導線がボタンの文言の差だけ (「閉じて起動し直す」と「閉じて再起動」は同義で、同じ処理)。rate-limited では解除の時刻が閉じたときに消える | ux M-003 + po L-001 | src/renderer/src/features/session/LivePane.tsx:327 / LivePane.failure.test.tsx:190-198 | new |
| M-007 | V-4 (実機) の 10 項目がすべて未確認。`実装済み` の対応表の行に注記が無く、結果を反映する持ち主も roadmap に無い | po M-006 + ui-coverage M-003 | quickstart-results.md:52-68 / docs/ui-coverage.md:48,52,53,62,67,69,77 / docs/roadmap.md:361 | new |
| M-008 | 最初のターンが終わるまで目盛りが出ない (US-3 AC2 と食い違い、テストが実装の側を固定している)。「最初の応答の後に出ます」の文言が条件と合わない | po M-003 + ux L-001 | ContextCostMeter.tsx:34-35 / ContextCostMeter.test.tsx:132 / UsageTab.tsx:48-49 / shell/labels.ts:191 | new |
| M-009 | ほかに 3 つの AC (US-4 AC1 / AC4・FR-012 / US-3 AC1) が FR と実装に追随していない | po M-004 | spec.md:134,152,156,213 | new |
| M-010 | 分類の表に無い失敗 (`overloaded` / `server_error` など。再試行を使い切った後の過負荷の fixture も) が `provider-error` (再ログインの導線) に倒れる。4xx に「待つ」を案内する。クレジットの案内が減った | po M-005 | src/agents/session-core.ts:403-417 / session/labels.ts:36-56 / session-core.test.ts:463-472 | new |
| M-011 | `tool-registry.aui.tsx` が tool 名を prototype を持つ object から引く (`__proto__` / `constructor` などで描画が例外を投げ、ErrorBoundary が無い) | security M-002 (scope: system) | src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx:22,36 | new |
| M-012 | Quota banner の `role="status"` が中身ごと差し込まれ、`key` で作り直されるので、読み上げが支援技術の組み合わせ次第になる | a11y M-001 | CenterBanners.tsx:118-121,150-152 | new |
| M-013 | 思考の印に読み上げが無く、data-model §4 の「読み上げは出たときの 1 回」と食い違う | a11y M-002 | thread.aui.tsx:566-580 / data-model.md:234 / LivePane.progress.test.tsx:290-292 | new |
| M-014 | tabpanel が Tab 順に入らない (APG Tabs pattern。中身に focusable が無い)。`aria-controls` が描いていないパネルを指す | a11y M-003 | src/renderer/src/features/shell/RightPanel.tsx:132,151-160 | new |
| M-015 | コントラストを機械で見る経路が無い (vitest-axe はすべて `color-contrast` を無効化、e2e に axe は 0 件) | a11y M-004 | CenterBanners.test.tsx:38 / RightPanel.tabs.test.tsx:134,182 ほか 13 ファイル | new |
| M-016 | 表示していないセッションの権限モードが安全 3 値の外になっても、どこにも知らせない (行にも読み上げにも出ない) | ux M-004 | CenterHeader.tsx:63-69 / CenterPane.tsx:104-109 / RunningSessionRow.tsx / SessionAttentionAnnouncer.tsx | new |
| M-017 | Tier A の `get_context_usage` を `表示不要` にした根拠 (推定の目盛り) の前提が確かめられていない。行に見直しの条件と持ち主が無い | ui-coverage M-001 | docs/ui-coverage.md:196 | new |
| M-018 | 対応表の A `init` の行の経路が `なし` のまま (O-4 は権限モードを実行中に出している)。Tier B の理由も O-4 の Edge Case と食い違う | ui-coverage M-002 | docs/ui-coverage.md:49 | new |
| M-019 | AD-047 訂正 #3 の根拠 `c89b423` (branch `014-ui-metering-and-limits-old`) は origin に無い。同じ名前で強制 push すると、origin で `c89b423` を指す ref が無くなる | adr-drift M-002 | docs/decisions/0047-session-meter-and-failure-reasons.md:73-75 / plan.md:255 / tasks.md:172 | new |
| M-020 | AD-047 Decision 4 (制御要求を呼ばない) を機械で検出する手段が無い。項目 14 は `Query` のメソッドを見ないのに、ADR と SC-006 はそれを前提にしている | adr-drift M-003 | scripts/constitution/check.mjs:687-709 / allowlists.mjs:420-427 / src/agents/sdk-agent-session.test.ts:146 | new |

## Low (Round 1)

| ID | Title | Origin | Where |
|---|---|---|---|
| L-001 | `HOOK_OUTCOMES[m.outcome]` を prototype を持つ表から引く | security L-001 | src/domain/session/system-event.ts:76,118 |
| L-002 | userinfo を落とす正規表現が、パスワードに `/` を含む形 (`u:ab/cd@h/m`) を通す | security L-002 | src/domain/session/meter.ts:132,252 |
| L-003 | quickstart がキーをコマンドラインに書かない注意を書いていない (シェルの履歴に残る) | security L-003 | specs/014-ui-metering-and-limits/quickstart.md:43 |
| L-004 | `fail()` が `failure` を `state: error` より先に送る順の契約が、文書に書かれていない | architecture L-001 | src/agents/sdk-agent-session.ts:349-356 |
| L-005 | glossary に `PermissionModeKey` の項目が無い。「中央のヘッダ」の定義が目盛りと帯を含まない | architecture L-002 | docs/glossary.md:603,741,966,1070 |
| L-006 | session の UI が chat の文言の表に依存するようになったのに、charter の依存の欄が追随していない | architecture L-003 | docs/domains/ui/charter.md:174 / docs/domains/session/charter.md:195 |
| L-007 | AD-041 の記録 1 (`provider-error`) が、AD-047 の「読み替える箇所」に入っていない | architecture L-004 | docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:176 |
| L-008 | `fail()` の順を見るテストが result の経路だけを通っている | architecture L-005 | src/agents/sdk-agent-session.test.ts:569,798 |
| L-009 | spec U-2 と plan に、AD-047 Decision 2 の訂正の前の字面が残っている | adr-drift L-001 | spec.md:67 / plan.md:269 |
| L-010 | AD-047 の本文が採択の版から変わっていないことを確かめた記録が無い | adr-drift L-002 | quickstart.md / quickstart-results.md |
| L-011 | 使用量の推定の注記「再開と /clear で数え直す」が、数え直さない項目にも当たる | po L-003 | src/renderer/src/features/shell/labels.ts:189 |
| L-012 | 同じ出来事に 2 つの語 (「自動的に拒否」と「聞かれずに拒否」)。「(SDK の記録)」は利用者に通じない | ux L-002 | shell/labels.ts:187-188 / LivePane.tsx:471 |
| L-013 | 経過時間の書式が行ごとにばらばら | ux L-003 | src/renderer/src/features/chat/labels.ts:66-82,147-148 |
| L-014 | 再試行の行の「N 秒後」が、終わった後も未来の言い方のまま残る | ux L-004 | thread.aui.tsx:1046-1049 |
| L-015 | 失敗の案内に偏りがある (圧縮・再試行の失敗、max-turns / max-budget に次の一手が無い) | ux L-005 | thread.aui.tsx:1114-1119 / session/labels.ts:44-46 |
| L-016 | 権限モードの行が同じことを 3 回言っている | ux L-006 | thread.aui.tsx:1050-1053,1133-1135 / chat/labels.ts:44 |
| L-017 | 使用量のタブだけがモデルの生の id を出す | ux L-007 | UsageTab.tsx:150-153 |
| L-018 | 圧縮の行が `compact_result` でしか閉じない | ux L-008 | src/agents/live-signals.ts:262-276 |
| L-019 | 7 日の枠の注意の帯が何日も出たままで、閉じられない | ux L-009 | CenterBanners.tsx:149-163 / quota-banner.ts:51-62 |
| L-020 | AD-045 の直書きの数 331 → 335 (増えたのはテストの固定データ)。判定を記録する | ux L-010 | src/renderer/src/test-support/app-shell-harness.tsx:72,91,222,251 |
| L-021 | 使用量のタブの見出しが h3 で、右のペインに h2 が無い | a11y L-001 | UsageTab.tsx:142-145 |
| L-022 | tool の経過時間が「12秒」だけで、何の時間かを支援技術に伝えていない | a11y L-002 | tool-result-marks.tsx:56-60 |
| L-023 | 目盛りの 80% 以上の注意が色と太さだけ | a11y L-003 | ContextCostMeter.tsx:53-58 |
| L-024 | platform-boundary-reviewer の起動条件が、本 PR が足した権限モードと隔離の文言の判定点を含まない | platform-boundary L-001 | .specify/spec-gate/reviewers.yml:157-168 |
| L-025 | 対応表の `rate_limit_event` と Quota banner の行が、超過分の表示を書いていない | ui-coverage L-001 | docs/ui-coverage.md:77,316 |
| L-026 | O-4 の element に値を渡すようになった隣の行の割当が追随していない | ui-coverage L-002 | docs/ui-coverage.md:45,79,173 |
| L-027 | ui-coverage-reviewer の起動条件が `quota-banner.ts` / `useSessionMeters.ts` を拾わない | ui-coverage L-003 | .specify/spec-gate/reviewers.yml:178-206 |

platform-boundary-reviewer は code-gate の自分の指摘 5 件 (M-001 / L-001〜L-004) が HEAD でも直っていないことを確かめた。code-gate で出ている指摘なので、この round の件数には入れていない。

## Viewpoint coverage (reviewer の生の件数)

| Cat | Count | Owners |
|---|---|---|
| A | Critical:0 High:0 Medium:1 Low:1 | security |
| B | Critical:0 High:0 Medium:1 Low:2 | security |
| C | Critical:0 High:0 Medium:1 Low:2 | architecture (platform-boundary は 0) |
| D | Critical:0 High:0 Medium:4 Low:3 | architecture / adr-drift (platform-boundary は 0) |
| E | Critical:0 High:0 Medium:5 Low:3 | po |
| F | Critical:0 High:0 Medium:0 Low:1 | platform-boundary |
| G | Critical:0 High:2 Medium:10 Low:15 | a11y / ux / ui-coverage |
| H | Critical:0 High:0 Medium:4 Low:3 | adr-drift / po / ux / a11y / architecture / ui-coverage |

8 件の raw output はどれも A-H の 8 カテゴリをすべて書いている (`viewpoint_coverage_check` で missing 0)。`cascade_enforce` で降格したものは 0 件 (Critical の申告が 0 件)。

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) (round: [security-reviewer.pr-gate.round1.md](./security-reviewer.pr-gate.round1.md))
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) (round: [architecture-reviewer.pr-gate.round1.md](./architecture-reviewer.pr-gate.round1.md))
- [architecture-reviewer-adr-drift.pr-gate.md](./architecture-reviewer-adr-drift.pr-gate.md) (round: [architecture-reviewer-adr-drift.pr-gate.round1.md](./architecture-reviewer-adr-drift.pr-gate.round1.md))
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) (round: [po-reviewer.pr-gate.round1.md](./po-reviewer.pr-gate.round1.md))
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) (round: [ux-reviewer.pr-gate.round1.md](./ux-reviewer.pr-gate.round1.md))
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) (round: [a11y-reviewer.pr-gate.round1.md](./a11y-reviewer.pr-gate.round1.md))
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) (round: [platform-boundary-reviewer.pr-gate.round1.md](./platform-boundary-reviewer.pr-gate.round1.md))
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) (round: [ui-coverage-reviewer.pr-gate.round1.md](./ui-coverage-reviewer.pr-gate.round1.md))
- Verdict JSON: [.gate-verdict-pr.json](./.gate-verdict-pr.json)
