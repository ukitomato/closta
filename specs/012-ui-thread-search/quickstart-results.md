# Quickstart Results: Thread 検索と探す操作 (O-3)

手順は [quickstart.md](./quickstart.md)。合否の定義は spec の SC が正本。

## 自動の検証 (SH-043) — 2026-10-07 (Polish の SH-040〜SH-042 の後の値)

`docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、1 本ずつ直列に流した。

- 型検査: node (`tsconfig.node.json`) / web (`tsconfig.web.json`) / e2e (`e2e/tsconfig.json`) の 3 本とも 0 件。
  perf (`perf/tsconfig.json`。FE-004 が locator の文字列を直した) も 0 件
- ESLint: 0 件
- dependency-cruiser: 違反 0 (387 modules / 1894 dependencies)
- Constitution 検証 (`node scripts/constitution/check.mjs`): **ok 20 / 違反 0 / 検査対象なし 1** (#5 は R-1 からの pending)
  - 項目 21 (対応表): ok。行は A 39 / A' 4 / B 10 / C 45 / D 8 / E 38 / F 127 (A〜E 節の差分 0。O-3 は F 節の使い道と備考だけを直した)。
    M3 の完了の条件の残りは 24 (O-2 の後と同じ。O-3 は `後続` の行を持たない)
  - 項目 15 の対象に `src/main/app/launch-usage-service.ts` が入っている (BE-042 で `WSL_FREE_DIRECTORIES` に足した)
- 全件 `vitest run`: **132 files / 2266 tests passed**
- E2E (要ビルド) と基準画像は本機では流していない
  - **訂正 (pr-gate R1 C-001)**: この記録は当初「CI の e2e job で通す」と書いたが、事実と違った。`9d98c39` の時点で
    `verify.yml` の e2e job が流す spec は名指しの 4 本 (`ime` / `composer-screenshot` / `launch-dialog` / `multi-session`) だけで、
    `e2e/sidebar-screenshot.spec.ts` を流していなかった。基準画像もコミットしていない (`e2e/**/*.png` は composer の 1 枚だけ)。
    FR-018 / SC-008 の E2E (基準画像と高さ) は CI で一度も判定されていない
  - pr-gate R1 の修正で、e2e job の最後にステップ「e2e (サイドバーの過去のセッションの区画)」を足した。基準画像をコミットする
    までこのステップは落ちる。基準画像は CI の artifact から取り、利用者の承認の後にコミットする (下の V-4。未了)
  - `composer-fullwidth` が CI で変わったら、CI の artifact から取り直して理由をここに書く (FE-004)

## V-1 境界の差分 (SC-006) — 2026-10-07

変更はまだコミットしていないので、`git diff main...HEAD` の代わりに実装の基点 (`73ebbc0`。`.implement-base`) との差分
`git diff 73ebbc0 -- src/domain/capability.ts src/preload src/main/app/ipc.ts src/main/app/session-ipc.ts src/domain/session/launch-config.ts src/domain/session/agent-session.ts`
を読んだ。

- `IPC_CHANNELS` の追加は `getLaunchUsage: 'closta:getLaunchUsage'` の 1 つだけ。チャネルの集合の固定テスト
  (`src/domain/capability.test.ts` の `EXPECTED_CHANNELS`) も同じ集合 — **OK**
- `launchSession` の引数の追加は `origin: LaunchOrigin` の 1 つだけ。`src/domain/session/launch-config.ts` の差分は 0
  (`SessionLaunchConfig` の型は変わらない) — **OK**
- `ipc.ts` の差分は、`IpcDependencies` の 2 つ (`recordLaunchUsage` / `getLaunchUsage`)・`handleGetLaunchUsage` の import・
  新しいチャネルの登録だけ。起動元の検証と記録の呼び出しは `session-ipc.ts` の `handleLaunchSession` にある (`ipc.ts` の
  `launchSession` の handler は今までどおり `args` をそのまま渡す)。新しいチャネルも `handle()` (送信元の検査) を通る — **OK**
- `src/domain/session/agent-session.ts` の差分は 0 (`SessionEvent` の種類は変わらない)。`src/agents/` の差分も 0
  (query の options のキーは変わらない) — **OK**
- preload の差分は、`launchSession` が 2 つめの引数をそのまま invoke に渡すことと `getLaunchUsage` の 1 つだけ

## V-2 記録の追随 (SC-007) — 2026-10-07

- `docs/decisions/0045-ui-labels-no-i18n-resources.md` は **`status: accepted`** で、Confirmation に直書きの基準線
  (**331 行**。`73ebbc0` で数えた。式と範囲つき。SH-002) がある — **OK**
- Constitution XV を AD-045 に合わせて MINOR で改めた (**v1.3.0 → v1.4.0**。SH-042)。Sync Impact Report と Amendment trail の
  1.4.0 の行がある — **OK**。**改定手順 2 (architecture-reviewer を交えた人間のレビュー) はまだ受けていない** — O-3 の PR で
  利用者が行う (未了)
- `node scripts/constitution/check.mjs` が通り、項目 21 が ok (上の「自動の検証」) — **OK**
- roadmap の M3 に O-8 (順 17・`session`・依存 O-7) と O-9 (順 18・`ui`・依存 O-3) の行がある。O-3 の行に義務 (O-1 から) (2) の
  中身は残っておらず、O-8 を指すだけ。`#o3-kpi-smoothness` のアンカーは O-8 の行に移した (id は変えていない)。
  そのアンカーを指すリンクの文言を O-8 に直した: session charter の KPI「並列時の滑らかさ」・
  010 quickstart-results の「残す宿題」・roadmap の「実機計測ハーネス (`perf/`) の ADR 化」と O-1 の行 — **OK**
- session charter の KPI「再利用率」の文言が「プリセットを適用した起動が、適用しない起動を上回る」(U-6) で、計測経路が
  プリセットの欄 (直近 30 日の 2 つの回数) と `launch-usage.json` — **OK**
- session charter の計測経路の注記に次の 4 点がある — **OK**
  - 判定の期間はプリセットの欄の直近 30 日の 2 つの回数
  - 最低件数と判定の時期を持たない
  - 数える単位は受け付けた起動の要求 (FR-010)
  - 前回の設定を変えずに起動し直した起動は、前回の起動元に数える (FR-009)
- glossary の「起動元」(`LaunchOrigin`) が FR-009 / data-model §4 を引き、Launch notice の「含まない起動の初期値」に
  `launch.lastOrigin` がある (SH-001) — **OK**
- `docs/ui-coverage.md` の F 節: Command palette / Conversation search は `SDK の外: <置き場所>` と SH-003 の照合の写し、
  Thread search は `未使用` と使わない理由、Empty state は O-3 の 4 つの空の状態を足した使い道。Activity graph / Heat graph /
  Message timing / Trace waterfall の備考は O-9。使い道の書式を凡例に移した (A〜E 節は変えていない) — **OK**

## V-3 実機の目視 (利用者。本番ビルド) — 未実施

利用者に残す。結果 (特に「過去のセッションが 50 件以上ある状態で、目当てを語 1〜2 個で絞れたか」。O-9 の本文の横断検索の
要否の判断の材料) はここに書く。

## V-4 サイドバーの基準画像の承認 (利用者。FR-018 / SC-008 / AD-038 D5) — 未実施

- 基準画像 `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png` はまだコミットしていない。CI の e2e job の
  「e2e (サイドバーの過去のセッションの区画)」は、コミットするまで基準画像が無くて落ちる
- 手順: 落ちた回の artifact (`e2e-test-results`) の actual (`sidebar-past-sessions-actual.png`) を利用者が見て、見出し・検索欄・
  グループの見出し・行の日本語の並び (全角の行送り・折返し・字幅の揃い) が許容範囲かを判断する。承認したら上の名前でコミットする。
  本機では撮らない (本機の描画は揺れる。013 quickstart-results)
- 記録すること: 承認の日、画像を取った CI の run、画像の大きさ、承認の根拠。コミットの後の CI でこのステップ (基準画像と高さの
  2 ケース) が通ったこと
