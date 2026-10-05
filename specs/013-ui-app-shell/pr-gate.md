# PR Gate Round 3: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Base**: origin/main
**Head**: bcd6aa4 (対象は R2 の修正の差分 a78a291..bcd6aa4。36 files)
**Reviewers**: security / architecture / po / ux / a11y / ui-coverage (6 並列。`reviewers_filter` で R2 の修正の差分に当てた。platform-boundary と database は auto_invoke_patterns に一致する変更が無く skip)
**Round inheritance**: Round 2 findings (Critical: 0, High: 0) を引継ぎ。Medium / Low は各 reviewer が自分の R2 の md を読んで判定した
**ルール発火検証**: 実行しない。a78a291..bcd6aa4 で規則の定義と fixture の差分が 0 (R1 の exit 0 の答えは変わらない)

## Verdict

| Severity | This round | Resolved from 2 | New in 3 | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 0 | 0 | 0 | 0 |
| Medium   | 1 | — | 1 | 1 | 0 |
| Low      | 24 | — | — | 24 | 0 |

**Status**: PASS (Critical=0)
**Next**: R3 の Low のうち安く直せるものを直し、M-201 (system) を roadmap に送ってから `/cl-done`

## R2 の Medium の判定 (feature の範囲)

| R2 | 内容 | R3 の判定 |
|---|---|---|
| MD-1 | 中央に出していない失敗したセッションを閉じると古い告知 | resolved (po / ux。`lastConfig` は記録つきで受け入れ) |
| MD-2 | 起動ダイアログが外側の押下で閉じる | resolved (po / ux) |
| MD-3 | サイドバーを畳むと過去の区画の状態が消える | resolved (po / ux / a11y) |
| MD-4 | 設定のダイアログの件数の印に文脈が無い | resolved (ux) |
| MD-5 | 未登録グループのパスに title が無い | resolved (ux) |
| MD-6 | `main` の常時の tabIndex | resolved (a11y。残りは a11y L-201) |
| MD-7 | 中央の「閉じる」でフォーカスが body に落ちる | resolved (中央) / 行の経路は roadmap (a11y)。同種事象の漏れは a11y M-201 |
| MD-8 | `dismissLaunchNotice` と AC7 の条件の記録 | resolved (architecture) |
| MD-9 | 見ているセッションの古い定義 | resolved (architecture / po) |
| MD-10 | ui-coverage-reviewer の発火条件 | resolved (ui-coverage。注記の位置は ui-coverage L-202) |
| MD-11 | tasks / SC が完了にしたテストの観点 | resolved / 記録つきで受け入れ (po。計測経路の正確さは po L-201 / L-202) |
| MD-12〜14 | system (composer のフォーカス・listRuntimes・稼働中の区画の上限) | roadmap に移送済み |

## Critical / High (Round 3)

なし。

## Medium (Round 3)

| ID | 内容 | origin | scope |
|---|---|---|---|
| M-201 | 中央の中身が替わらないまま押したボタンが消える経路 (承認カードの「許可」「拒否」・キューの通知の「閉じる」「キューから削除」・「表示を増やす」) でフォーカスが body に落ちる | a11y | system (X-1 / X-2 / X-5 からある session の部品。今回の差分は触れていない) |

## Low (Round 3、24 件)

| reviewer | ID |
|---|---|
| security (1) | L-003 vitest-axe の SEC-8 を PR の説明に |
| po (3) | L-201 SC-002 の追記が V-3 #3 の範囲を超える / L-202 V-3b に US-3 AC4 (登録の通し) の行が無い / L-203 spec の Edge Cases が文言を写している |
| ux (5) | L-201 Provider の一覧の取得の失敗で「概要」の 2 行が黙って消える / M-002 空の状態の 2 組 / L-002 Provider とプロバイダ / L-005 登録フォルダの取得の失敗 / M-011 テストの残り |
| ui-coverage (4) | L-101 残り (F 節の 2 行が置き場所の語に従わない) / L-201 Thread の操作のバーの行が `未使用` のまま / L-202 `LAUNCH_REJECT_LABELS` に注記が無い / L-203 中央のヘッダのテストが SessionStatusUpdate の経路を見ない |
| a11y (5) | L-201 スキップリンクの後の本文のクリックで `main` がフォーカスを持ち続け、印も無い / M-006 全文が title だけ / L-001 `main` の見出し / L-004 起動中の role=status / M-007 テストの残り |
| architecture (6) | L-201 AD-046 の訂正の節と ui charter の「同じ内容」/ L-202 失敗した close の推論の前提が store の側に無い / L-203 「起動の告知」が glossary に無い / L-204 composer のフォーカスの持ち主 / L-006 focus の書き手の検出 / L-007 CI と V-3b の記録 |

## Dedup

- 重なりは無かった (ux M-011 と a11y M-007 はどちらもテストの残りだが観点が違う。architecture L-007 は ux M-011 の V-3b の部分と重なるが、CI の記録を含むので別に数えた)

## code-gate との突合

Critical / High が 0 なので一致は 0。

## Track raw outputs

- `security-reviewer.pr-gate.round3.md` — C0 H0 M0 L1
- `architecture-reviewer.pr-gate.round3.md` — C0 H0 M0 L6
- `po-reviewer.pr-gate.round3.md` — C0 H0 M0 L3
- `ux-reviewer.pr-gate.round3.md` — C0 H0 M0 L5
- `a11y-reviewer.pr-gate.round3.md` — C0 H0 M1 L5
- `ui-coverage-reviewer.pr-gate.round3.md` — C0 H0 M0 L4

6 本すべてで `viewpoint_coverage_check` は missing 0、`cascade_enforce` の降格は 0。platform-boundary-reviewer の R2 の md (`*.pr-gate.md`) は R2 のまま (本 round では起動していない)。
