# PR Gate Round 2: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Base**: origin/main
**Head**: bb6f547 (R1 の後の修正は 7d46352..bb6f547)
**Diff stat**: +7425 -597 over 104 files (origin/main...HEAD)
**Reviewers**: security / architecture / po / ux / a11y / platform-boundary / ui-coverage (7 並列。database-reviewer は R1 と同じ理由で skip)
**Round inheritance**: Round 1 findings (Critical: 0, High: 7) を引継ぎ。round_history の high_findings と各 reviewer の R1 の md から復元した (summary-only ではない)
**ルール発火検証**: 実行しない。7d46352..bb6f547 で `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**` の差分が 0 (R1 の exit 0 の答えは変わらない)

## Verdict

| Severity | This round | Resolved from 1 | New in 2 | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 7 | 0 | 0 | 0 |
| Medium   | 14 | — | 9 | 14 | 0 |
| Low      | 38 | — | — | 38 | 0 |

(Medium / Low は dedup の後。raw は Medium 15 / Low 43。Medium の「New in 2」は R1 に無かった種類の数で、残り 5 は R1 から持ち越した部分か system-scope への移送)

**Status**: PASS (Critical=0)
**Next**: R2 の Medium のうち feature の範囲のものを直してから `/cl-done`。直した差分が大きければ Round 3

## R1 の High の判定 (7 件すべて resolved)

| R1 | 内容 | 判定 | 確かめた reviewer |
|---|---|---|---|
| HI-1 | 失敗の close が過去の会話から中央を奪い起動ダイアログを開く | resolved。同じ種類の別経路 (選んでいないセッション) は MD-1 | po / ux |
| HI-2 | 起動ダイアログを閉じてもフォーカスが戻らない | resolved | a11y |
| HI-3 | 畳む / 開くボタンが unmount され aria-expanded の変化が失われる | resolved。細かい点は LO-a11y-1 / 2 | a11y |
| HI-4 | 設定のダイアログの間、注意の印が見えない | resolved。文脈が無い点は MD-4 | ux |
| HI-5 | listRuntimes の待ちの間に読み込み中を示さず FR-016 を迂回できる | resolved。状態の行の文言は LO-ux-6 | ux / po / platform-boundary |
| HI-6 | 280px で過去の区画の見出しの行があふれる | resolved。パスの title が無い点は MD-5 | ux |
| HI-7 | AD-046 :38 と例外 2 件の食い違い | resolved (訂正の節は AD-031 に合う)。形の不足は LO-arch-2 | architecture |

## Critical (Round 2)

なし。

## High (Round 2)

なし。

## Medium (Round 2、dedup の後)

| ID | 内容 | origin | scope | 種類 |
|---|---|---|---|---|
| MD-1 | 中央に出していない失敗したセッションをサイドバーの行で閉じると、次の「新規起動」に古い失敗の告知 (role=alert) が出て、初期値がそのセッションの設定になる。`useShellFocus.ts:37` は selectedId→null のときだけ判断する | po M-101 = ux M-004 | feature | HI-1 の残り |
| MD-2 | 起動ダイアログは外側の押下で閉じ、選びかけの起動の設定を捨てる (`LaunchDialogHost.tsx:50-52`)。設定のダイアログとそろっていない | ux M-104 = po L-102 | feature | new |
| MD-3 | サイドバーを畳む (自動でも) と過去の区画が unmount され、絞り込みと開いたグループが既定に戻る (`SessionListScreen.tsx:200,728,729`) | ux M-103 = po L-101 | feature | new |
| MD-4 | 設定のダイアログの件数の印が「設定」の題の横にあり、何の件数かが見えない (`SettingsDialog.tsx:65-68`) | ux M-101 | feature | new (HI-4 の修正から) |
| MD-5 | 未登録グループの見出しのパスが切り詰められ、`title` が無い (`SessionListScreen.tsx:134`)。data-model §3:83 と食い違う | ux M-102 | feature | new (HI-6 の修正から) |
| MD-6 | 本文をクリックするとフォーカスが `main` (`tabIndex={-1}`) に移り、PageDown などで transcript がスクロールしなくなるおそれ (推定・実機未確認) | a11y M-103 | feature | new (R1 a11y M-005 の修正から) |
| MD-7 | 表示中のセッションを中央の「閉じる」で閉じると、押したボタンが消えフォーカスが body に落ちる。行の「閉じる」も同じ | a11y M-102 | feature (中央) / system (行) | new |
| MD-8 | `dismissLaunchNotice` (ui が session のストアの起動の状態を書く) と X-4 US-1 AC7 の開き直しの条件が session charter / roadmap / ui charter に無い。roadmap の行数が古い | architecture M-101 | feature | R1 M-001 の残り |
| MD-9 | 「見ているセッション」の定義の古い文面 (glossary.md:855-856、session-view.ts:434-435、SessionAttentionAnnouncer.tsx:13) | architecture M-102 = po L-103 | feature | new |
| MD-10 | ui-coverage-reviewer の発火条件に `ApprovalCard.tsx` が無く、注記は承認カードが `LivePane.tsx` にあると書いている | ui-coverage M-101 | feature | new |
| MD-11 | tasks / SC が完了にしたテストの観点のうち実在しないもの (FE-042 の U+202E、FE-031 の US-3 AC4、SC-004、入れ子のダイアログの Esc、SC-002 の設定の開閉) | po M-005 = security L-002 | feature | R1 po M-005 の残り |
| MD-12 | 表示中のセッションのターンが始まるたびに composer がシェルのどこからでもフォーカスを奪う (`unstable_focusOnRunStart` の既定 true) | a11y M-101 | system | new (X-2 / X-5 から前からある) |
| MD-13 | `listRuntimes` の待ちが検出をもう 1 本起こす。roadmap (3) に R1 の推奨テスト (c) が抜けている | platform-boundary M-001 | system (roadmap の追記だけ feature) | R1 から持ち越し |
| MD-14 | 稼働中の区画が上限まで伸びると過去の区画の 8rem が常設の要素で埋まる | ux M-008 | system (O-3 に送付済み) | R1 から持ち越し |

## Low (Round 2、dedup の後 38 件)

| reviewer | ID |
|---|---|
| security (3) | L-101 AppShell.tsx:26 の CSP の文言 / L-102 負の経路のテストの前提 / L-003 vitest-axe の SEC-8 を PR の説明に |
| platform-boundary (5) | L-002 probe-batch 未計測 / L-003 Constitution 項目 8 (system) / L-004 main の取得時刻 0 の publish (system) / L-101 取得時刻 0 = 未取得の取り決め (= architecture L-104) / L-102 「runtime」の明記 |
| ui-coverage (6) | M-005 残り (Attachment ほか) / L-101 `SDK の外` の凡例 / L-102 「起動時の」の退行テストと注記の持ち主 / L-103 plan.md:39・spec.md:218・data-model §5 / L-104 SDKSessionInfo の理由 / L-002 session-state のテスト |
| architecture (6) | L-101 ui charter :168 / L-102 AD-046 :38 の参照 / L-103 prompts の OPT-panel の `Content` / L-006 focus の書き手の検出 / L-007 CI の composer / L-105 V-3 のコミット |
| po (3) | M-004 US-3 AC2 の戻り先 / L-004 ランタイム 0 件の初回 / L-104 quickstart-results の「割った」と SC-003 の接頭辞 |
| ux (8) | M-002 空の状態の 2 組 / M-003 起動ダイアログの残り 2 件の案内 / L-002 Provider とプロバイダ / L-005 登録フォルダの取得の失敗 / L-101 data-model §6 と spec の文言 / L-102 待つ間の「未取得」 / L-103 「概要」の見出しと生の ID / M-011 テストの不足 |
| a11y (7) | L-101 右のペインの order-last / L-102 aria-label と aria-expanded / L-103 スキップリンクの余白 / M-006 過去の行のツールチップ / L-001 設定の中の h1 / L-004 起動中の role=status / M-007 a11y の自動テストの残り |

## Dedup

- path:line: MD-1 (`useShellFocus.ts:37` / `running-session-store.ts:548-556`)、MD-2 (`LaunchDialogHost.tsx:50`)、MD-3 (`SessionListScreen.tsx:200,728,729`)、MD-9 (`glossary.md:855`)、platform-boundary L-101 = architecture L-104 (`useSessions.ts:93`)
- FR: MD-11 は tasks FE-042 で security L-002 を取り込んだ
- 重い方の severity を残した (MD-2 / MD-3 / MD-9 は po の Low を Medium に寄せた)

## code-gate との突合

code-gate の MUST_FIX で resolved になった path:line と当 round の Critical / High の一致は 0 (Critical / High が 0)。

## Track raw outputs

- `security-reviewer.pr-gate.round2.md` — C0 H0 M0 L4
- `platform-boundary-reviewer.pr-gate.round2.md` — C0 H0 M1 L5
- `ui-coverage-reviewer.pr-gate.round2.md` — C0 H0 M1 L6
- `architecture-reviewer.pr-gate.round2.md` — C0 H0 M2 L7
- `po-reviewer.pr-gate.round2.md` — C0 H0 M2 L6
- `ux-reviewer.pr-gate.round2.md` — C0 H0 M6 L8
- `a11y-reviewer.pr-gate.round2.md` — C0 H0 M3 L7

7 本すべてで `viewpoint_coverage_check` は missing 0、`cascade_enforce` の降格は 0。
