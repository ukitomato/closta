# PR Gate Round 1: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Base**: main (merge-base `7bdb271`) ... HEAD `9d98c39` (branch `012-ui-thread-search`)
**Diff stat**: +14512 -437 over 114 files
**Reviewers**: security-reviewer / architecture-reviewer (default + ADR-drift) / po-reviewer / database-reviewer / ux-reviewer / a11y-reviewer / platform-boundary-reviewer / ui-coverage-reviewer (8 並列)
**Round inheritance**: なし (Round 1)
**ルール検証**: `node scripts/rules/run.mjs` を Round 1 で単独実行 (reviewer の起動より前)。期待表と **64/64 件一致**。機械検証で捕まらない経路 9 件は期待表に `none` として宣言済み。所要 561 秒

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 1 | 0 | 1 | 1 | 0 |
| High     | 1 | 0 | 1 | 1 | 0 |
| Medium   | 21 | 0 | 21 | 21 | 0 |
| Low      | 40 | 0 | 40 | 40 | 0 |

件数は dedup 後。dedup 前の reviewer 合計は Critical 1 / High 2 / Medium 26 / Low 45 (下の「Dedup」)。code-gate の `must_fix_findings` は 0 件なので、suppress の対象は無い。

**Status**: FIX_REQUIRED
**Next**:
  FIX_REQUIRED → Agent(implementer, mode: fix) で C-001 を直す → /cl-code-gate → /cl-pr-gate (Round 2)

## Critical (Round 1)

### C-001 — サイドバーの基準画像の E2E が CI から一度も実行されず、基準画像もコミットされていない。FR-018 / SC-008 は判定されないまま CI が緑になる [origin: po (Critical) + architecture (H-001 として High)]
- **Where**: `.github/workflows/verify.yml:139,145,159,164` (e2e job が名指しで流す spec は 4 本。`e2e/sidebar-screenshot.spec.ts` が無い) / `e2e/sidebar-screenshot.spec.ts:81,89-129` / `e2e/**/*.png` に sidebar の基準画像が無い (composer の 1 枚だけ) / `specs/012-ui-thread-search/quickstart-results.md:18-19` (「CI の e2e job で通す」と事実と違う記録)
- **Issue**: FR-018 / SC-008 の計測経路 (高さの確認と基準画像の比較) が実行されない。計画 (spec.md:311 / tasks.md:50 SH-010) の「基準画像は CI の artifact から取る」も、CI がこの spec を流さないので始まらない。invoker も verify.yml の `playwright test` の行 4 本と Glob `e2e/**/*.png` 1 件で事実を確かめた
- **Why critical**: po-reviewer の PO-2 (SC の計測不能) に当たり、仮定ではなく今のリポジトリで観察できる事実である。CI は緑のまま、O-7 から預かった義務 (iii)「サイドバーの領域の基準画像を足す」が果たされずに completed に進みうる (偽の緑)。architecture-reviewer は同じ事実を AD-038 D5 / Confirmation の drift として High で出した。dedup で高い方を採った
- **Suggested fix**:
  1. verify.yml の e2e job に 1 ステップ足す: `pnpm exec playwright test e2e/sidebar-screenshot.spec.ts -c playwright.config.ts` (composer-screenshot と同じ形。1 検証 1 ステップ)
  2. CI を 1 回流し、失敗時の artifact (`e2e-test-results`) から `sidebar-past-sessions-win32.png` を取る。本機では基準画像を作らない (`sidebar-screenshot.spec.ts:17`、memory の「基準画像は CI の artifact から取る」)
  3. 利用者が見た目を承認し、quickstart / quickstart-results に記録してから `e2e/sidebar-screenshot.spec.ts-snapshots/` にコミットする (AD-038 D5)。quickstart に承認の行を足す
  4. `quickstart-results.md:18-19` を事実に合わせる
  5. (再発防止。system) `e2e/*.spec.ts` がすべて verify.yml に現れることを確かめる検査を system-scope に登録する
  - **注意**: 手順 2〜3 は CI の実行と利用者の目視の承認を要する。implementer の fix モードで閉じられるのは手順 1 / 4 と quickstart の行の追加までで、基準画像のコミットは人の承認の後になる
- **Status in this round**: new
- **Cascade**: po-reviewer の cascade summary に C-001 の行 (件数 1)。`gate_common::cascade_enforce` は C-001 を High に降格したが、invoker が取り消した (下の「cascade_enforce の降格の取り消し」)

## High (Round 1)

### H-001 — palette の現在の候補の指標が背景の 6% の濃淡 (1.14:1) だけで、入力欄も `outline-none`。ダイアログの中に見えるフォーカス指標が無い [origin: a11y]
- **Where**: `src/renderer/src/components/assistant-ui/elements/command-palette.tsx:202-209` (:205 の `bg-foreground/[0.06]`)・`:166` (`outline-none`)・`:259` (`tabIndex={-1}`)
- **Issue**: ↑↓ で動かす現在の候補を見分ける手段が 1.14:1 (light) / 1.16:1 (dark) の背景の差だけ。Windows の Contrast themes では消える。WCAG 2.1 SC 2.4.7 / 1.4.11
- **Suggested fix**: 現在の候補に `outline-2 -outline-offset-2 outline-ring` (`--ring` は白に対し 4.83:1) と `bg-accent` を足す。先例は `thread-list.aui.tsx:352-369` (H-008 / H-202) と `SessionListScreen.tsx:1232-1238` (H-003)
- **Status in this round**: new

## Medium (Round 1)

本文は各 reviewer の raw output にある。ID は `<reviewer>:<reviewer の ID>`。

| # | 指摘 | origin (dedup 元) | 主な Where | scope |
|---|---|---|---|---|
| 1 | 将来版のファイルでも「次に起動ダイアログを開いたときに読み直します」と出るが、読み直しは起きない | ux:M-005 / po:M-001 / database:L-001 | `session/labels.ts:485` / `PresetPanel.tsx:215-219` / `launch-usage-service.ts:65,75-79` | feature |
| 2 | 過去ログの取得中・失敗のときも会話内検索が開き「一致する箇所はありません」と出る。読み込み後に 1 件目を飛ばす | ux:M-002 / po:M-002 | `CenterPane.tsx:155,175` / `ConversationSearchBar.tsx:50-60` / `useConversationSearch.ts:92-121` | feature |
| 3 | 会話内検索の 0 件の文言が対象の範囲 (tool の入出力・Reasoning を除く) を示さない | ux:M-001 / po:M-004 | `chat/labels.ts:100-103` / `conversation-search.ts:63` | feature |
| 4 | palette の入口が Ctrl+K だけで画面に示されない。Ctrl+F も見える手がかりが無い | ux:M-007 / po:M-003 | `CommandPalette.tsx:79-89` / `ConversationSearchBar.tsx:76-78` | feature |
| 5 | palette の候補を 50 件で黙って切る | ux:M-006 / po:L-003 | `palette-commands.ts:97-98,229-241` / `command-palette.tsx:283-285` | feature |
| 6 | Thread search の件数「{n} 件が一致」が coverage を見ず、索引が null の間も「0 件が一致」と出る | ux:M-004 / po:L-005 | `SessionListScreen.tsx:1019,1131` / `session-list/labels.ts:204` | feature |
| 7 | `search-empty` が所在・フォルダの絞り込みで隠れた一致まで「一致するものはありません」と断言する | ux:M-003 | `SessionListScreen.tsx:998-1011,1094` / `session-list/labels.ts:208` | feature |
| 8 | perf の実機計測が本物の `launch-usage.json` に 1 回あたり最大 10 回の `manual` を書き込む。記録の扱いがどこにも無い | database:M-001 / architecture:M-005 | `perf/real-sessions.spec.ts:34,166,179-185` / `session-ipc.ts:161-163` | feature |
| 9 | 退避して空から読み直したことが画面に出ず「まだ記録がありません」と見える (code-gate DB-M-001 から持ち越し) | database:M-002 | `launch-usage-store.ts:150-177` / `launch-usage-service.ts:80-86` / `PresetPanel.tsx:222-223` | feature |
| 10 | Constitution XV の Manual の検証者 (ux-reviewer) の定義と発火条件が新しい規則に合っていない。element 2 つが a11y / ux の起動条件に無い | architecture:M-003 / a11y:L-006 | `.claude/agents/ux-reviewer.md:15,49-53` / `.specify/spec-gate/reviewers.yml:54-64,89-124` | feature (一部 system) |
| 11 | `features/search` と `features/session-list` の依存が双方向。`_overview.md` と charter 2 つの依存の記述が変わっていない | architecture:M-001 | `session-search.ts:3-4` / `SessionListScreen.tsx:21-26` / `_overview.md:126-138` | feature |
| 12 | ui と session の境界の集合 (逆向きの呼び出し・読む面の状態) が charter 2 つと glossary で食い違い、コードと合わない | architecture:M-002 | `ui/charter.md:174,185-189` / `session/charter.md:184-186` / `glossary.md:917-918` / `CenterPane.tsx:96` | feature |
| 13 | AD-045 の基準線を accepted の後に Confirmation へ in-place で追記 (AD-031 の規則の外) | architecture:M-004 | `docs/decisions/0045-ui-labels-no-i18n-resources.md:49-54` | feature (一部 system) |
| 14 | composer で変換中に Ctrl+F を押したときの IME の回帰を見る E2E が無い | architecture:M-006 | `ConversationSearchProvider.tsx:43-45,143-152` / `e2e/ime.spec.ts` | feature |
| 15 | US-4 を renderer → preload → main と通しで確かめるテストが無く、起動元の欠落・未知もログに残らない | po:M-005 | `src/preload/index.ts:59` / `session-ipc.ts:161-163` | feature |
| 16 | 新しい UI の文字のコントラストが 4.5:1 に届かない (placeholder・palette のグループ名・種別の札) | a11y:M-001 | `command-palette.tsx:166,173,195,221-227` / `conversation-search.tsx:83` / `SessionListScreen.tsx:853` | feature |
| 17 | 会話内検索の入力欄にフォーカスの指標が無い | a11y:M-002 | `conversation-search.tsx:62-67,83` | feature |
| 18 | palette が候補の件数も 0 件も読み上げない | a11y:M-003 | `CommandPalette.tsx:184-194` / `command-palette.tsx:283-285` | feature |
| 19 | コントラストとフォーカスの見えを確かめる経路が自動にも手順にも無い (vitest-axe は color-contrast を切る) | a11y:M-004 | `quickstart.md:29-36` / 対象のテスト 4 本 | feature |
| 20 | Windows の Contrast themes (forced colors) で新しいフォーカス指標と選択の指標が消える | a11y:M-005 | `SessionListScreen.tsx:853` / `surfaces.tsx:20` / renderer に `forced-colors` 0 件 | system |
| 21 | Principle II の検査 (項目 8) が renderer の `navigator.*` を見ていない (code-gate から持ち越し) | platform-boundary:M-001 | `scripts/constitution/allowlists.mjs:566-581` / `check.mjs:382-401` | system |

## Low (Round 1)

| # | 指摘 | origin (dedup 元) | 主な Where | scope |
|---|---|---|---|---|
| 1 | palette の候補に HTML を含む題の行を出すテストが無い | security:L-001 | `CommandPalette.test.tsx` | feature |
| 2 | invoke 系のチャネルがすべて `handle()` を通ることを機械で確かめる手段が無い | security:L-002 | `src/main/app/ipc.ts:172-180,339-341` | feature |
| 3 | AD-033 §1「standalone は採らない」と standalone の element 2 つの関係が書かれていない | architecture:L-001 | `docs/decisions/0033…:50` / `research.md:53` | system |
| 4 | palette が AD-046 Decision 4 のモーダルの列挙に入る道筋が無い | architecture:L-002 | `roadmap.md:395` / `prompts.md:340` | feature |
| 5 | ui charter の Related ADRs に AD-045 が無い | architecture:L-003 | `ui/charter.md:7-15,191-197` | feature |
| 6 | `_overview.md` の帰属の判断根拠に O-3 / O-8 の理由が無い | architecture:L-004 | `_overview.md:82-105` | feature |
| 7 | spec / research が glossary の Counterexamples の語「再利用率の記録」を使う | architecture:L-005 | `spec.md:33,47,360` / `research.md:78` | feature |
| 8 | glossary の「中央のヘッダ」に会話内検索のボタンとバーが無い | architecture:L-006 | `glossary.md:909` | feature |
| 9 | `main.css` (XIII の除外のファイル) にテーマの外の規則を足し、冒頭の注記と合わない | architecture:L-007 | `main.css:1-12,151-167` | feature |
| 10 | 1,000 メッセージの走査の時間がどの記録にも残らない | architecture:L-008 | `conversation-search.test.ts:223-240` | feature |
| 11 | AD-046 の「稼働中と過去を混ぜるか」の結論が ui charter に無い | architecture:L-009 | `ui/charter.md` | feature |
| 12 | AC / SC と画面の文言の語が揃っていない (「手動」と「適用なし」ほか) | po:L-001 | `spec.md:175-181,336` | feature |
| 13 | 31 日より前の日にだけ記録があるときも「まだ記録がありません。」と出る | po:L-002 / ux:L-003 | `PresetPanel.tsx:220-224` / `session/labels.ts:481-482` | feature |
| 14 | US-3 の価値を確かめる観測が quickstart V-3 に無い | po:L-004 | `quickstart.md:29-36` | feature |
| 15 | 所在がすべて読めないときに `search-empty` が `all-unlisted` を隠す | po:L-006 | `SessionListScreen.tsx:1094,1100` | feature |
| 16 | E2E の偽の capability が過去の一覧に 6 行を返すようになったことが O-8 の基準の変化に無い | po:L-007 | `docs/roadmap.md:345,349` | feature |
| 17 | `.bak` の戻し方と、退避の一覧・復元の持ち主に `launch-usage.json` が無い | database:L-002 | `docs/discovery.md:367-369` / `roadmap.md:323` | feature |
| 18 | 同じ版のファイルの最上位の未知のキーが退避されずに次の書き込みで消える | database:L-003 | `launch-usage-store.ts:157-163` | feature |
| 19 | `LaunchUsageRecord.days` の鍵が `string` で brand が外れる | database:L-004 | `launch-usage.ts:66,209` | feature |
| 20 | 一時ファイル + rename に fsync が無く `.tmp` を掃除しない。settings の store の書き込みが 4 本目のコピー | database:L-005 | `launch-usage-store.ts:189-190` | system |
| 21 | 日付を作れないときも `write-failed` とログに出る | database:L-006 | `launch-usage-service.ts:102-107` | feature |
| 22 | 実物の store と service を組み合わせた経路のテストが無い | database:L-007 | `launch-usage-service.test.ts` / `launch-usage-store.test.ts` | feature |
| 23 | palette の 0 件の文言が「操作」としか言わない | ux:L-001 (po:L-003 の一部) | `shell/labels.ts:55-56` | feature |
| 24 | 0 件のとき「0 / 0 件」と空の状態が重なり、次へ / 前へも押せる | ux:L-002 | `ConversationSearchBar.tsx:31-33` / `conversation-search.tsx:92-112` | feature |
| 25 | palette の element に `esc` を直書き | ux:L-004 | `command-palette.tsx:168-177` | feature |
| 26 | 稼働中のセッションはフォルダとランタイムの名前でしか palette に当たらない | ux:L-005 | `session-search.ts:145-157` | feature |
| 27 | M-001〜M-005 (ux) の経路にテストが無いか、誤った振る舞いを固定している | ux:L-006 | `ConversationSearch.test.tsx:42,389-399` ほか | feature |
| 28 | 会話内検索の「現在以外の一致」の強調が 1.29:1 | a11y:L-001 | `main.css:159-162` | feature |
| 29 | 会話内検索の移動のたびに smooth scroll し、reduced-motion で止まらない | a11y:L-002 | `thread.aui.tsx:223,512` | feature |
| 30 | 過去の行のツールチップが行の名前と同じ文を再び読ませる | a11y:L-003 | `SessionListScreen.tsx:945-948` | feature |
| 31 | 会話内検索ではスクリーンリーダーの利用者が一致の中身を得られない | a11y:L-004 | `conversation-search.tsx:85-91` | feature |
| 32 | Thread search の検索欄と件数の live region が `aria-busy` の中にある | a11y:L-005 | `SessionListScreen.tsx:1110-1132` | feature |
| 33 | Ctrl+K / Ctrl+F の修飾キーの判定がテストでも文書でも固定されていない | platform-boundary:L-001 | `CommandPalette.tsx:38-46` / `ConversationSearchProvider.tsx:48-56` | feature |
| 34 | 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。注記が事実と違う | platform-boundary:L-002 | `allowlists.mjs:477-478` / `check.mjs:753` / `plan.md:234` | system |
| 35 | E2E の固定の索引の鍵を domain の関数を使わずに組んでいる。`sessionTargetKeys` が空 | platform-boundary:L-003 | `src/main/app/e2e-capability.ts` | feature |
| 36 | palette の過去の候補が所在を出さず、複数の所在の同じ題の行を見分けられない | platform-boundary:L-004 | `palette-commands.ts:211-218` | feature |
| 37 | 「Thread search は `cwd.value` を直接は読まない」の主張が未登録の区画では成り立たない | platform-boundary:L-005 | `group-label.ts:50-51` / `session-search.ts:14,67` | feature |
| 38 | 凡例の「取り込んだ element に手を入れたら変えた点を書く」が O-3 の element に揃って当たっていない | ui-coverage:L-001 | `docs/ui-coverage.md:19,248,250,263,341` | feature |
| 39 | 凡例の「行にしないもの」が palette と Thread search を挙げていない | ui-coverage:L-002 | `docs/ui-coverage.md:28` | feature |
| 40 | A 節の Hook / task の 5 行が完了した O-2 の quickstart V-4 を指したまま | ui-coverage:L-003 | `docs/ui-coverage.md:58,60,64,65,66` | system |

## Dedup

完全自動 (key: `path:line` > FR-NNN > Principle > 文の近さ)。severity は高い方を採った。

| 集約先 | 元の指摘 |
|---|---|
| C-001 | po:C-001 (Critical) / architecture:H-001 (High) |
| Medium #1 | ux:M-005 / po:M-001 / database:L-001 |
| Medium #2 | ux:M-002 / po:M-002 |
| Medium #3 | ux:M-001 / po:M-004 |
| Medium #4 | ux:M-007 / po:M-003 |
| Medium #5 | ux:M-006 / po:L-003 (0 件の文言の部分は Low #23 に残した) |
| Medium #6 | ux:M-004 / po:L-005 |
| Medium #8 | database:M-001 / architecture:M-005 |
| Medium #10 | architecture:M-003 / a11y:L-006 |
| Low #13 | po:L-002 / ux:L-003 |

dedup 前: Critical 1 / High 2 / Medium 26 / Low 45。dedup 後: Critical 1 / High 1 / Medium 21 / Low 40。

## cascade_enforce の降格の取り消し

- `gate_common::cascade_enforce` は po-reviewer の C-001 を High に降格した (marker: `finding=FR-018`)
- 原因は関数の指摘 ID の取り方である。本文に `(X-NNN)` が無いと見出しの最初の `[A-Z]+-\d+` を ID とみなす。reviewer-base.md:142 が定める見出しの書式 `### [Severity] <一行サマリ> (C-NNN) (scope: …)` では、一行サマリに FR-018 などが入ると宣言した ID (C-001) より先にそれを拾う
- cascade summary の C-001 の行は件数 1 (整数) で、関数自身の規則 (`verified_in_table`) では確認済みに当たる。invoker も事実を確かめた (verify.yml の `playwright test` の行 4 本、Glob `e2e/**/*.png` 1 件)
- そのため降格を取り消し、Critical に戻した。marker の下に取り消しの理由を書いてある (`po-reviewer.pr-gate.round1.md`)
- 補足: po-reviewer の初回の返り値は cascade summary の件数の列が複合表記で、関数が読めなかった。invoker が依頼して po-reviewer が表を返し直した。指摘の本文と重大度は初回のまま
- **system follow-up**: `cascade_enforce` の ID の取り方を、見出しの `\(([A-Z]+-\d+)\)` を先に見る形に直す (`.specify/scripts/gate-common.sh:506`)。直すまでは、一行サマリに FR / SC / AD の番号を含む Critical がすべて誤って降格される

## 起動した reviewer / 起動しなかった reviewer

- 起動: `reviewers_filter pr-gate` が候補 8 つをすべて返した
  - security / architecture / po: 常駐
  - database-reviewer: `src/main/infra/settings/launch-usage-store.test.ts` が `src/main/infra/settings/**` に一致
  - ux-reviewer / a11y-reviewer: `src/renderer/src/components/assistant-ui/elements/thread-list.aui.tsx` に一致
  - platform-boundary-reviewer: `.dependency-cruiser.js` が `**/.dependency-cruiser.*` に一致
  - ui-coverage-reviewer: `docs/ui-coverage.md` に一致
- 起動しなかった reviewer: なし (`skipped_reviewers: []`)
- 設計どおり起動しないもの: lint-agent / test-agent / convention-reviewer (code-gate 専任)

## ルール検証 (Phase 0 step 6)

- Round 1 のため実行した (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` も本 diff で変わっている)
- 他の検出器と並行させず、reviewer の起動より前に単独で流した
- 結果: 期待表と 64/64 件一致。後始末: 完了。機械検証で捕まらない経路 9 件は期待表に `none` として宣言済み (SC-017 の追跡対象)

## system follow-up (本 round で見つかったもの。本 PR の Critical ではない)

- `gate_common::cascade_enforce` の指摘 ID の取り方 (上の節)
- `e2e/*.spec.ts` がすべて verify.yml から流れることを確かめる検査 (C-001 の再発防止。architecture:H-001 / po:C-001 の推奨)

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md)
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md)
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md)
- [database-reviewer.pr-gate.md](./database-reviewer.pr-gate.md)
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md)
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md)
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md)
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md)
- Round 1 の版: 各 `<reviewer>.pr-gate.round1.md`
