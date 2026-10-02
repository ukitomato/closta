# platform-boundary-reviewer のレビュー: セッション監視ビュー (O-1)

**Run**: 2026-10-02
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Gate**: code-gate (実装の self-review)

**結論**: Critical 0 件・High 0 件。指摘は Medium 1 件と Low 3 件で、いずれも perf/ の計測ハーネスまわりです。plan の「機械強制の変更」は 5 項目とも差分で確認しました。ランタイム・隔離の境界に当たる実装差分はありません。

## 初回読了 viewpoint

- FR/SC:
  - FR-010 と SC-006 は境界の維持を求めています。`git diff --name-only HEAD -- src/main src/preload src/agents src/domain` は 0 件で、同じディレクトリに未追跡のファイルもありません。
  - FR-011 と SC-004: `e2e/multi-session.spec.ts` と `e2e/support/input-probe.ts`。
  - FR-012 と SC-005: `perf/real-sessions.spec.ts`、`playwright.perf.config.ts`、`perf/tsconfig.json`、verify.yml の perf 型検査 step。
  - FR-001〜FR-009 は renderer の中だけの変更で、ランタイムとパスには触れません。
- touched files に該当する charter / Confirmation:
  - AD-038 の D2 と D3。perf/ にこれを類推で当てはめています。
  - AD-043 の Decision 3 と 4。main と domain に差分がないので維持されています。
  - session charter の KPI「並列時の滑らかさ」の計測経路。
  - Principle III / VI / VII と `scripts/constitution/allowlists.mjs` の `SCAN_ROOTS`。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の領分
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の領分 (直近の活動の sanitize を含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の領分
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の領分
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-1 は X-5 の稼働中セッション一覧を renderer の中だけで監視ビューに広げる変更で、実 `claude` 10 本で入力の滑らかさを測る perf/ を新しく置いています。差分は 32 ファイル。

### plan「機械強制の変更」との照合

5 項目とも差分で確認しました。

- `eslint.config.mjs` の ignores に `perf/**` と `playwright.perf.config.ts`
- `.dependency-cruiser.js` の `not-to-test` が `^(specs|tests|e2e|perf)`
- `verify.yml` の step は `tsc -p perf/tsconfig.json` の型検査だけで、perf を実行する step はない
- `SCAN_ROOTS` は変えていない。死角は `docs/roadmap.md` に登録済み
- `playwright.perf.config.ts` に `CI` で例外を投げるガード

### 依頼された perf/ の観点

- 子プロセス: perf 自身は起こさない (`child_process`・`spawn`・`exec`・`wsl.exe` を使わない。`current.process().kill()` は Playwright の既存のハンドル)
- CLOSTA_E2E: 設定されていれば失敗で止まり、起動 env からも除く
- CI: 設定ファイルとテスト本体の 2 か所で止まる。CI の e2e step は spec を名指しし、`testDir` は `./e2e`
- app.evaluate: 使っていない
- 成果物: trace・screenshot・video は off、outputDir は OS の一時ディレクトリ
- vitest: include を明示しているので perf/ を拾わない

### PB-1〜PB-7

- PB-1: 該当なし (`folderLabel` は表示名でパスは IPC にも永続化にも流れない)
- PB-2: renderer の実装には該当なし。perf のランタイム選択だけに L-001
- PB-3: 該当なし
- PB-4: 権限ゲートの迂回経路は増えていない。既定であることを確かめる仕組みがない点だけ L-002
- PB-5: 該当なし
- PB-6: 永続環境の構築なし。WSL 内の transcript は Principle X に沿って消していない
- PB-7: M-001

## Findings

### [Medium] perf/ が子プロセスを起こさないことを機械的に守る検査が 1 つもない (M-001) (scope: system)

- **観察**: perf/ は ESLint の除外・depcruise の起点外・check.mjs の `SCAN_ROOTS` の外で、CI では型検査だけ。「perf は子プロセスを起こさない」はレビューの観点として扱っている (SH-032)。現時点の perf は条件を守っている
- **同種事象探索**: Grep `child_process|spawn|exec\(|wsl` を perf/ と `playwright.perf.config.ts` にかけて 0 件 (注記を除く)
- **リスク/影響**: 今すぐの実害はない。将来 `child_process` が入ってもどの検査も落ちない (PB-7)
- **推奨アクション**: `SCAN_ROOTS` を決めるまでのつなぎとして、(a) `eslint.config.mjs` に `files: ['perf/**/*.ts']` だけを対象にしたブロックを置き、`no-restricted-imports` で `child_process` / `node:child_process` を禁じる、または (b) roadmap の項目に「perf/ ではレビューだけで担保している」を明記する
- **根拠**: Constitution Principle VI Verification、plan「機械強制の変更」、AD-038 D2
- **scope 根拠**: `SCAN_ROOTS` の変更は ADR が要る。roadmap に system-scope として登録済み

### [Low] perf のランタイムと作業フォルダの選択が部分一致の最初の候補で、複数インスタンスを区別しない (L-001) (scope: feature)

- **観察**: `optionIndex` は `includes` で部分一致した最初の選択肢を採る。`CLOSTA_PERF_RUNTIME=Ubuntu` だと `Ubuntu-24.04` や停止中の `Ubuntu（停止中）` も一致する
- **同種事象探索**: Grep `optionIndex\(` を perf/ にかけて 4 件
- **推奨アクション**: 一致が 2 件以上なら `*-ambiguous` で失敗させ (完全一致を優先)、選んだランタイムに「（停止中）」が付いていれば失敗させる。記録にランタイムは足さない
- **根拠**: AD-003、FR-012
- **scope 根拠**: `perf/real-sessions.spec.ts` の中で直せる

### [Low] perf が起動時の権限モードが既定であることを確かめない (L-002) (scope: feature)

- **観察**: `launchOne` は権限モードの select に触れず、ダイアログの既定値 `default` に暗黙に頼っている。将来、前回の設定の復元が既定の起点になると、perf は Auto や bypass のまま無人で走りうる
- **同種事象探索**: Grep `permission|権限` を perf/ にかけて 0 件 (注記を除く)
- **推奨アクション**: 起動の直前に権限モードの combobox の値が `default` であることを確かめ、違えば `permission-mode-not-default` で失敗させる
- **根拠**: Constitution Principle III、AD-024 #13
- **scope 根拠**: touched file の中で直せる

### [Low] `not-to-test` に perf を足したが、規則が発火することを確かめるサンプルがない (L-003) (scope: system)

- **観察**: この規則には `scripts/rules` にも `tests/rule-fixtures` にも違反サンプルがない (e2e のときから残っている穴)。prefix の末尾に `/` がないので `performance/` にも一致するが、塞ぐ側の過剰一致なので害はない
- **同種事象探索**: Grep `not-to-test` を `scripts/rules` と `tests/rule-fixtures` にかけて 0 件
- **推奨アクション**: e2e/ と perf/ を import するサンプルを置き、`scripts/rules/run.mjs` で発火を確かめる。別 spec で扱うのが妥当
- **根拠**: AD-038 D2 の Confirmation、PB-7
- **scope 根拠**: rule-fixture の仕組みは touched files の外

## H (テスト / regression) の所見

- 境界: src/main・preload・agents・domain の差分 0 件
- `e2e/support/input-probe.ts` は計測の仕込みと集計をそのまま関数にしたもので、閾値も p95 の式も同じ
- `playwright.perf.config.ts` の CI ガードを検証するテストは無い (1 行なので指摘にしない)
- 後始末の `close-timeout` 15 秒は main の `QUIT_TIMEOUT_MS = 5000` より長いので、正常系では main の後始末が先に終わる。kill に落ちるのは異常系だけ

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `child_process\|spawn\|exec\(\|wsl` (perf/・playwright.perf.config.ts) | 0 (注記を除く) | lint と depcruise の対象外は `eslint.config.mjs:180-181` |
| L-001 | `optionIndex\(` (perf/) | 4 | perf/real-sessions.spec.ts:89,91,95,103 |
| L-002 | `permission\|権限` (perf/) | 0 | — |
| L-003 | `not-to-test` (scripts/rules, tests/rule-fixtures) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
