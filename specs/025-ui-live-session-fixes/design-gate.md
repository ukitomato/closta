# Design Gate: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-29T00:00:00+09:00
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 4      | 10  |
| po-reviewer                | 0        | 2    | 5      | 2   |
| architecture-reviewer      | 0        | 1    | 6      | 2   |
| security-reviewer          | 0        | 2    | 1      | 0   |
| platform-boundary-reviewer | 0        | 0    | 1      | 1   |
| **Total (dedup)**          | **0**    | 5    | 15     | 13  |

Round 1 (前回 gate なし)。viewpoint coverage: reviewer 4 トラックとも A-H 欠落なし。cascade_enforce 降格 0 件。

**Status**: PASS
**Next**: status: tasking → implementing 昇格、/cl-implement 起動可能。High 5 件は AD-050 に従い implement 前に `Agent(designer)` で直すことを推奨 (High を確かめるためだけの round は回さない)。

## Critical (Total: 0)

なし。

## High (Total: 5)

### H-001 — 一覧の取得失敗の理由の文言が存在しない表のキー (`LIVE_SETTING_LABELS.failure[reason]`) を指す [origin: po] [new]

- **Where**: data-model.md:176, tasks.md:73 (FE-020), data-model.md:259-260 (FE-002)
- **Issue**: `LIVE_SETTING_LABELS.failure` は `Record<LiveSettingKind, string>` で、`LiveSettingFailure` をキーにした文言表は無い。US-2 AC3 / FR-007 の「理由つき」が設計どおりに作れない
- **Action**: 失敗理由ごとの文言を data-model §6.3 / §9 と FE-002 に足し、FE-020 の参照先とテストを直す

### H-002 — effort で絞った結果 0 件のとき「一覧を返しませんでした」と誤った理由が出る [origin: po] [new]

- **Where**: data-model.md:87, :175, :260, tasks.md:74, spec.md:171
- **Issue**: `switchableModels(liveModels, effort)` 後の 0 件と、Claude Code が本当に空を返したケースを区別できない
- **Action**: `LiveModelsResult` で空の理由を区別し、文言・Edge Case・BE-023 / FE-020 のテストを足す

### H-003 — RK-08 の PR 分割で Constitution の Exceptions より先に英語の名前が main に入る [origin: architecture] [new]

- **Where**: plan.md:391 (RK-08), tasks.md:126 (SH-011), tasks.md:154
- **Issue**: Governance「Constitution を正とする」と AD-065 Decision 4 改定手順 2 (人間レビュー) より先に例外が既成事実になる。関連: analyze D1 (AD-065 を plan 時点で accepted にした点)
- **Action**: FE-010 を Constitution 差分と同じ PR に入れるか、Constitution PR の先行マージを FE-010 の PR のマージ条件にする。SH-012 に確認項目を足す

### H-004 — main 側の `models-result` 再検査がセッションスレッドの出力の形 (`ModelEntry`) と合わない [origin: security] [new]

- **Where**: contracts/ipc-live-models.md:55, data-model.md:35, :38, tasks.md:65 (BE-022)
- **Issue**: main が `ModelInfo` 形 (`value`) 前提の `normalizeLiveModels` を `ModelEntry` 形の配列に当てると全件捨てられ、FR-005 が満たせない。検査を外せば境界の再検査が抜ける
- **Action**: main 側は `isValidModelEntry` ベースの述語 (または `normalizeLiveModelEntries`) にし、文書 3 箇所を揃える

### H-005 — H-004 の食い違いを検出できる層横断のテストが無い [origin: security] [new]

- **Where**: contracts/ipc-live-models.md:80-90, tasks.md:64, :66, :69
- **Issue**: 単体は層ごと、E2E は偽の capability、実機 V-1 は未実施でマージ可。CI 緑のまま FR-005 が壊れうる
- **Action**: セッションスレッドの正規化出力をそのまま main のデコーダに通して件数が保たれるテストを BE-022 / BE-023 と contracts のテスト観点に足す

## Medium (Total: 15, dedup 後)

詳細は各 raw output を参照。

- analyze C1 — 「右のパネル」と glossary の「右のペイン」の語の揺れ (Principle XIV)
- analyze D1 — AD-065 を design-gate / 人間レビュー前に accepted にした
- analyze U1 + po M-005 (dedup) — composer が狭いときの入力欄・送信ボタンの崩れにテストが無い (spec.md:170, plan.md:388 RK-05, tasks FE-011〜FE-013)
- analyze U2 + architecture M-003 (dedup) — `handOffFocusToComposer` の scope 未指定と、FE-053 が features/shell の `useDialogReturnFocus` を写す指示 (import 向きの検査も無い) (tasks.md:114, plan.md:321, data-model §7.4)
- po M-001 — 一覧の取得失敗後の聞き直しが 1 回だけで出口が無い
- po M-002 — SC-002 の実機の部分がマージ時点で判定できない
- po M-003 — US-3 の Esc が「既に動く」仮説に立ち、原因未特定のまま閉じうる
- po M-004 — `/resume` の選ぶ画面の先頭に今のセッション自身が出るケースが spec に無い
- architecture M-001 — session charter と `_overview.md` を直す予定が無い
- architecture M-002 — ui charter「面の状態」の例外が実態 (`setLaunchOpen`) と合わない (scope: system)
- architecture M-004 — `normalizeLiveModels` を provider の `model-catalog.ts` に置く置き場所
- architecture M-005 — AD-065 の読み替え表に AD-043 Decision 4 が無い
- architecture M-006 — 「composer の周り」が AD-046 Decision 6 の置き場所の語に無い
- security M-001 — `requestId` の検査が既存の UUID 検査より弱い
- platform-boundary M-001 — `/resume` の `fixed` (3 軸) の出どころが未記述

## Low (Total: 13, dedup 後)

- analyze I1, I2, I3, I4, I5, I6, U3, I8
- analyze I7 + architecture L-001 (dedup) — glossary SessionControl の列挙に `respond-elicitation` 欠落
- analyze U4 + po L-002 (dedup) — US-4 AC3 が R-07 により当たらないのに spec に残る
- po L-001 — SC-004 の variant 指標が弱い
- architecture L-002 — Resume picker の語が glossary に無い / `sessionId` と `conversationId` の揺れ
- platform-boundary L-001 — `supportedModels` の呼び出し制限の機械検査の射程を expected.mjs に明記

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
