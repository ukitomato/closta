# architecture-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer (default mode + ADR-drift mode)
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016、SC-001〜SC-007 のすべて
- charter / Confirmation: ui charter (Scope / 業務ルール / KPI「表示網羅」「自作率」 / Open Questions)、session charter (Open Questions :218-228)、`_overview.md` (Cross-domain invariants :132-146、M3 :108)、AD-044 Confirmation、AD-020 D1、AD-019 D2/D3、AD-034 決定 1、AD-035 D1/D4/Trade-off、AD-041 (g)、AD-043 Decision 2、Constitution 改定手順とバージョニング方針表
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 対応表の割当は ui-coverage-reviewer。ux/a11y の起動漏れは D の H-001 で扱う
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

対応表・項目 21・AD-044 (accepted)・Constitution v1.3.0、実行中の tool の結果 (同じ id で送り直し) と `system-event` (renderer で data part に写し domain の `mergeSystemEvent` で合成)、密度、`Agent`、直近の活動、`ui-coverage-reviewer` の組み込み。境界: supervisor / main / preload は無変更、`QUERY_OPTION_KEYS` 不変・`includeHookEvents` 0 件 (AD-041 (g))、本文の直列化はセッションスレッド (AD-043 D2)、過去ログの合成は取得プロセス側 (AD-034)、AD-035 の既定閉は Trade-off で drift ではない。Constitution 改定は手順 1・3・4・5 を満たし MINOR は妥当。

## Findings

### [High] ux-reviewer / a11y-reviewer が transcript とセッション画面の PR で起動しない (H-001) (scope: feature)

- **観察**: `reviewers.yml:40` / `:59` の `auto_invoke_patterns` は `features/session-list/**/*.tsx` だけ。`features/chat/**` はコメントアウト、`features/session/**` は候補にも無い。この PR は `ChatScreen.tsx` / `TranscriptDensityToggle.tsx` (自作部品) / `SessionScreen.tsx` を変えたが両 reviewer は起動しなかった。改めた XII の Manual (`constitution.md:781-782`)、XIII の Manual (`:819-820`)、ui charter の KPI「自作率」(`:144`) は `ux-reviewer` を検証者に挙げている
- **同種事象探索**: `specs/*/{ux,a11y}-reviewer*.md` 6 件 (001 / 002 のみ)。R-3 以降の ui・session 画面の feature で一度も起動していない
- **リスク/影響**: VIII / XII / XIII の Manual の検証が transcript の画面に当たらないまま pr-gate が PASS しうる
- **推奨アクション**: 最小案は Round 2 で ux / a11y を明示的に起動。本対応は `reviewers.yml` の 2 か所に `features/chat/**/*.tsx` と `features/session/**/*.tsx` を足す (chat の「仮実装」の扱いは人間が判断)
- **根拠**: Constitution VIII / XII / XIII Verification (Manual)、ui charter KPI、AGENTS.md
- **scope 根拠**: `reviewers.yml` は変更ファイル

### [Medium] Principle XII の Statement が「表示実装を割り当てる」のまま (M-001) (scope: feature)

- **観察**: `constitution.md:754` の Statement と `:762-766` の「割当の意味」(3 種類) が食い違う。Sync Impact Report も Statement を挙げていない
- **推奨アクション**: Statement を「各項目に割当 (実装済み・後続・表示不要) を持たせる」に改め、Modified sections に足す
- **根拠**: 改定手順、AD-044 Decision 1

### [Medium] 末尾の版表示が 1.2.9 / 2026-10-02 のまま、XIII の `amended` も未更新 (M-002) (scope: feature)

- **観察**: `constitution.md:1049` は 1.2.9。frontmatter と trail は 1.3.0。XIII の `amended` は 2026-09-15 のまま (`:799`)
- **推奨アクション**: `:1049` を 1.3.0 / 2026-10-03 に、`:799` に `2026-10-03 (AD-044 / v1.3.0)` を足す
- **根拠**: 改定手順 3・4

### [Medium] `後続` を他 domain の feature (X-6 / I-3) に割り当てたことで項目 21 が cross-domain の不変条件になったが、どこにも書かれていない (M-003) (scope: feature)

- **観察**: 完了済みの ID を持つ行は違反 (`coverage.mjs:623-628`)。`後続: X-6` 4 行、`後続: I-3` 2 行。X-6 / I-3 を `**完了**` にするコミットは対応表を同時に直さないと CI を落とす。`_overview.md:132-146` に XII の行が無く、session / isolation charter にも無い
- **推奨アクション**: `_overview.md` の Cross-domain invariants に XII の行、session / isolation charter に共有 invariant、roadmap の X-6 / I-3 の行に「完了の PR で対象の行を書き換える (項目 21)」。最小案は roadmap だけ
- **根拠**: Constitution XII / AD-044 Decision 1 / AD-028 §5

### [Medium] ui-coverage-reviewer の発火条件から `running-session-store.ts` / `session-event-decoder.ts` が漏れている (M-004) (scope: feature)

- **推奨アクション**: `auto_invoke_patterns` に 2 ファイルを足す
- **根拠**: spec FR-006、XII Verification (Manual)

### [Medium] (H) H-001 / M-002 / M-003 の再発を捕まえる仕組みが無い

- Manual の検証者が対象パスで起動することの検査、版の 3 点一致の検査、完了と対応表の同時書き換えの運用がいずれも無い。既存の振る舞いを壊していない根拠 (pin テスト・kinds 固定テスト) は観察できた

### [Low] `LOWER_BOUNDS` が実数と同じで、SDK が型を正当に減らすと「parse の取りこぼし」で落ちる (L-001)

- **推奨アクション**: 下限を実数の半分程度にするか、手順に `LOWER_BOUNDS` の更新を足す

### [Low] glossary の「後続」に「完了していない」の条件が無い (L-002)

- **推奨アクション**: `glossary.md:915` / `:918` を揃える

### [Low] ui charter の frontmatter と Key concepts が追随していない (L-003)

- **推奨アクション**: `last_reviewed` / `related_adrs` (AD-044 ほか) / `related_specs` (011)、`:114` の 202 に 127 (2026-10-03) を併記

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | Glob `specs/*/{ux,a11y}-reviewer*.md` / Grep `ux-reviewer\|a11y-reviewer` (docs) | 6 / 5 | specs/001・002 のみ / ui charter:144 ほか |
| M-001 | `表示実装を割り当て\|表示実装を割当` | 1 | .specify/memory/constitution.md:754 |
| M-002 | `\*\*Version\*\*\|Last Amended` | 1 | .specify/memory/constitution.md:1049 (+ :799) |
| M-003 | `ui-coverage\|X-6\|I-3` (docs/domains) | 0 | _overview.md:132-146, ui-coverage.md:167,184-187,218, roadmap.md:234,277 |
| M-004 | `mergeSystemEvent\|toSystemEventMessage` (src) | 5 (対象外 1) | running-session-store.ts:7,117; session-event-decoder.ts:56-60 |
| L-001 | `LOWER_BOUNDS` (docs) | 0 | coverage.mjs:37,553-559 |
| L-002 | `後続 \(roadmap に実在` | 1 (+ :918) | docs/glossary.md:915,918 |
| L-003 | `202` (ui charter) | 1 | docs/domains/ui/charter.md:114 |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3

ADR-drift (ARCH-3): accepted ADR の決定を書き換えた箇所は 0 件。
