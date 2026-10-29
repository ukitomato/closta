# convention-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30
**Reviewer**: convention-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: iter 1 (code-gate)

## 初回読了 viewpoint

- FR/SC（本 diff で実装/影響されるもの）:
  - FR-001〜FR-004: composer の周りの選択。`ComposerExtensions.settings`、`LiveSettingsControls` の移動、`CenterHeader` から選択を外す、`ui-coverage.md`
  - FR-005〜FR-007: `supportedModels` の経路。`list-models`、`models-result`、`normalizeLiveModels`、`Entry.liveModels`
  - FR-008〜FR-010: `PERMISSION_MODE_NAMES` と `CLAUDE_CODE_PERMISSION_MODE_NAMES_VERSION`
  - FR-011〜FR-013: 停止ボタンの outline と Esc
  - FR-014〜FR-015: `RightPanel` / `UsageTab`
  - FR-016〜FR-018: `app-commands.ts`、`past-resume.ts`、`ResumePickerDialog`
  - SC-001〜SC-007: 各 E2E と単体
- touched files に該当する charter / Confirmation:
  - ui charter の composer / アプリのシェルの Scope
  - AD-065 Confirmation: 名前の表の pin、`QueryLiveReadMethod` の分類
  - Constitution 項目 16（`sdk-query-method-indirect`）と項目 21（ui-coverage）。`node scripts/constitution/check.mjs` は ok 20 / violations 0
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner。depcruise は 0 violations（569 modules）
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:5 Low:3
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer の範囲を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

lint-agent の JSON は受領済みで、本 reviewer は lint を実行していない。

- 全 5 コマンドが exit 0: eslint、`tsc` の node 用と web 用、dependency-cruise（569 modules）、`check:constitution`
- violations は prettier の warning 4 件のみ（Medium 扱い）。error は 0。
- 命名と配置:
  - 新設の `.ts` は kebab-case（`app-commands.ts` / `past-resume.ts` / `resume-picker-rows.ts`）、`.tsx` は PascalCase（`ResumePickerDialog.tsx`）で、既存の規則と一致している。
  - plan の「レイヤごとの変更」の表どおりに配置されている。`LiveSettingsControls` は `features/shell` から `features/session` へ `git mv` されており、これが invoker の注記の「diff に出ない」理由である（rename として出る）。
  - 旧パス `shell/LiveSettingsControls` への参照は src / docs / tests に 0 件。`LiveSettingsSlot` と `PERMISSION_MODE_DESCRIPTIONS` も、ADR 本文とコメントを除いて残っていない。
- dead code: `tseslint.configs.recommended`（`no-unused-vars` を含む）が有効。tsc も通っている。

## Findings

### [Medium] prettier/prettier warning: `src/agents/sdk-agent-session.ts:21` (M-001) (scope: feature)

- **観察**: lint-agent の violations[] にある。severity は warning。
- **同種事象探索**: lint-agent の JSON の violations[] 4 件を転記した。追加探索はしていない。
- **リスク/影響**: format の揺れ。
- **推奨アクション**: `prettier --write` を当てる。
- **根拠**: lint rule `prettier/prettier`
- **scope 根拠**: touched file

### [Medium] prettier/prettier warning: `src/agents/supervisor-protocol.test.ts:208` と `:215` (M-002, M-003) (scope: feature)

- **観察**: lint-agent の violations[] にある（2 件）。
- **同種事象探索**: M-001 と同じ。
- **推奨アクション**: `prettier --write` を当てる。
- **根拠**: lint rule `prettier/prettier`
- **scope 根拠**: touched file

### [Medium] prettier/prettier warning: `src/renderer/src/features/shell/UsageTab.tsx:122` (M-004) (scope: feature)

- **観察**: lint-agent の violations[] にある。
- **同種事象探索**: M-001 と同じ。
- **推奨アクション**: `prettier --write` を当てる。
- **根拠**: lint rule `prettier/prettier`
- **scope 根拠**: touched file

### [Medium] 500 行超のファイルが本 diff でさらに増えた (M-005) (scope: feature)

- **観察**（CONV-3 の警告基準は 1 ファイル 500 行超）:
  - `src/renderer/src/features/session/LivePane.tsx`: 619 行から 793 行（+174）。settings の配線（`:231` 付近の `mergeCommandCandidates`、`:390` 付近の一覧の理由の組み立て、`ResumePickerDialog` の描画）を同居させている。
  - `src/renderer/src/features/session/running-session-store.ts`: 1302 行から 1364 行
  - `src/main/app/session-launch-service.ts`: 612 行から 734 行
  - `src/agents/sdk-agent-session.ts`: 1062 行から 1082 行
  - `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx`: 1644 行から 1652 行
- **同種事象探索**: `wc -l` で src の 500 行超を確認した。plan の「新設のモジュール 4 つ」の方針で一部は分離できているが、LivePane への settings の流入は分離されていない。
- **リスク/影響**: 保守性の低下。LivePane の増分の大半（約 170 行）が「一覧の状態から押せない理由を組み立てる」配線で、`LiveSettingsControls` 側か専用の hook に置けた。
- **推奨アクション**: 直さなくてよい（AD-050）。棚卸しで、LivePane の settings の配線を `useLiveSettingsProps` のような hook か `LiveSettingsControls` に寄せる。
- **根拠**: CONV-3
- **scope 根拠**: touched files

### [Low] `sdk-agent-session.ts:150` のコメントが `supportedModels` の追加に追随していない (L-001) (scope: feature)

- **観察**: `src/agents/sdk-agent-session.ts:150` は「呼ぶのは `interrupt` と、実行中の設定の切り替え (`QueryLiveSettingMethod`。AD-062) だけ」と書いている。同ファイルの `:182-183` で `QueryLiveReadMethod = 'supportedModels'` を新設して呼ぶ対象に加えており、コメントと実装がずれている。plan 申し送り #19 は「コメントに AD-065 を足す」としているが、足したのは `:182` の 1 行だけ。
- **同種事象探索**: `Grep "呼ぶのは" src/agents/sdk-agent-session.ts` で 1 件（`:150`）。
- **推奨アクション**: `:150` を「`interrupt`・実行中の設定・一覧の読み取り (`QueryLiveReadMethod`。AD-065)」に直す（CONV-6）。
- **根拠**: CONV-6 / 申し送り #19

### [Low] `RESUME_PICKER_LABELS.close` が未使用 (L-002) (scope: feature)

- **観察**: `src/renderer/src/features/session/labels.ts` で `close: '閉じる'` を定義している。本番コードでの参照は 0 件。`ResumePickerDialog.tsx` が使うのは `title` / `search` / `loading` / `empty` だけ。
- **同種事象探索**: `Grep RESUME_PICKER_LABELS ResumePickerDialog*` で `close` の参照は 0 件。
- **推奨アクション**: 閉じるボタンを出さないなら `close` を外す。出すなら使う。
- **根拠**: CONV-5

### [Low] `CLAUDE_CODE_PERMISSION_MODE_NAMES_VERSION` は本番コードの参照が無い (L-003) (scope: feature)

- **観察**: `src/renderer/src/features/chat/labels.ts:390` の定数。FR-010 の「記録」要件を満たす意図的な pin である。
- **推奨アクション**: 対応不要。unused-exports 検出器を将来入れる場合の allowlist 候補として記録する。
- **根拠**: CONV-5

### [Low] 未追跡の `.vitest/` が `.gitignore` に無い (L-004) (scope: system)

- **観察**: git status に `?? .vitest/` が出ている。`.gitignore` に `vitest` の行は 0 件。
- **推奨アクション**: `.vitest/` を `.gitignore` に足す。
- **根拠**: CONV-3

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-005 | `wc -l`（src の 500 行超） | 13 以上 | LivePane.tsx:793、running-session-store.ts:1364、session-launch-service.ts:734、sdk-agent-session.ts:1082、thread.aui.tsx:1652 ほか |
| L-001 | `呼ぶのは` | 1 | sdk-agent-session.ts:150 |
| L-002 | `RESUME_PICKER_LABELS` の `close` の参照 | 0 | labels.ts（定義のみ） |

Critical は 0 件のため、cascade の降格対象は無い。

## lint-agent の出力（要約）

- exit_code 0 / eslint exit 0 / `tsc` node・web exit 0 / dependency-cruise exit 0（569 modules）/ `check:constitution` exit 0（ok 20 / violations 0 / not-applicable 1）
- violations: prettier warning 4 件（M-001〜M-004）
- eslint が無視したファイル: `e2e/*.spec.ts` の 4 件と `tests/rule-fixtures/expected.mjs`（既存の config 由来）

## Verdict

- Critical: 0
- High: 0
- Medium: 5
- Low: 4
- 注記: lint-agent の `exit_code` は 0 で、非ゼロのコマンドは無かった。CONV-1 の「exit_code 非ゼロ = Critical」の経路には当たらない。
