# Design Gate: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-04 (Round 1)
**Spec**: specs/013-ui-app-shell/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 4 | 10 | 8 |
| po-reviewer | 0 | 4 | 5 | 2 |
| architecture-reviewer | 0 | 4 | 5 | 3 |
| security-reviewer | 0 | 0 | 3 | 2 |
| platform-boundary-reviewer | 0 | 1 | 2 | 1 |
| **Total (dedup)** | **0** | 8 | 17 | 12 |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし本 spec は未承認の判断 (U-1〜U-5) と proposed の AD-046 に依るので、夜間の方針により /cl-implement には入らない。** High 8 件は gate の後に spec / plan / data-model / tasks / AD-046 で手当てした (下の「R1 の後の手当て」)。手当ては再レビューを受けていない

## High (dedup 後 8 件)

| ID | 内容 | 出所 | 手当て |
|---|---|---|---|
| H-01 | 失敗したセッションを「閉じて起動し直す」と空の状態に落ち、X-4 US-1 AC7 (前回の設定と理由つきの起動ダイアログ) が切れる | analyze H3 / po H-001 / arch H-002 | FR-007 と data-model §1 に「close で `previousFailure` が立ったら `launchOpen = true`」。US-2 AC4・FE-021 |
| H-02 | 既定 1100px で中央が 500px になり composer の基準画像が変わる。SC-003「更新 0」が満たせない | analyze H1 / po H-002 / arch H-003 | 右のペインは既定で畳む (中央 ≒ 772px で composer は 704px の上限のまま)。SC-003 を「更新 0、変わったら撮り直しと人間の承認」に。FR-011・SH-020 |
| H-03 | `focus` と `selectedId` の 2 か所持ちで、ストア内部の選択の変化 (起動の受け付け・close・承認待ちへの移動) に中央が追随しない。読み上げの「見ているセッション」の定義が無い (`SessionAttentionAnnouncer.tsx:28`) | analyze H2 / arch H-001 | data-model §1 に focus の書き手 (シェルが 2 つのストアの選択の変化を購読) と `watchedId` の定義。FE-001 / FE-010 / FE-014 |
| H-04 | スクロールの位置の保持を X-5 FR-008 に帰しているが要件も手段も無い | po H-003 / arch M-003 | FR-004 / US-1 AC4 から外し、「戻ると下端に追従する (今の振る舞い)」と書く |
| H-05 | 立て直しの流れと基準画像を検出するテストの観点が無い | po H-004 | FE-014 / FE-021 / SH-020 に観点 |
| H-06 | `RunningSessionList.tsx:93` が自分で `<nav>` を描き、ランドマークが二重になる | analyze H4 | FR-001 / SC-001 を「トップレベルの `nav` が 1 つ」に。RunningSessionList の `nav` は区画の `section` に替える (FE-012) |
| H-07 | `perf/real-sessions.spec.ts:189,191` が nav の「セッション起動」を押す。KPI の計測経路が壊れる | arch H-004 | SH-020 / SC-005 / quickstart V-1 に perf を足す |
| H-08 | 過去の区画を常時マウントすると、ランタイム検出の前にセッション列挙が走る (`useSessions.ts:71-77` / `main/index.ts:192-196`) | pb H-001 | FR-016 (新設): 過去の区画の初回取得は `listRuntimes()` の解決の後。FE-011 にテスト、quickstart V-3 に実機の確認、plan RK-06 |

## Medium / Low (抜粋。全文は各トラックの raw output)

- 「概要」の項目の出所 (`cwdDisplay` は大半で null・所在が無い・ランタイム名の fallback) → data-model §5 を直した (pb M-001 / analyze M2 / sec L-001 / po L-001)
- 取り込む部品が本番の CSP (`style-src 'self'`) と両立するか → SH-002 の観点と「`protocol.ts` の差分 0」を SC-001 に (sec M-001)
- 右のペインに外部コンテンツのタブを足すときの境界 (`webviewTag` を有効にしない・モーダルの間は隠す・矩形を main で検証) → AD-046 Decision 4 と data-model §4 (sec M-002)
- XSS の payload の観点 → FE-014 / FE-042 (sec M-003)
- 設定のダイアログを閉じたら中を unmount (平文の秘密の寿命) → FR-008 / FE-031 (sec L-002)
- AD-046 Decision 5 の読み替えの誤り (R-1 の 4 画面 = 3 画面 + chat) → 直した (arch M-002)
- OPT-panel と OPT-pty の Terminal の重なり → OPT-panel から Terminal を外した (arch M-005)
- glossary の追随の対象 (没入ビュー・ナビ・過去の区画) → FR-013 / SH-001 (arch M-004)
- ui charter の除外の理由と依存の向き → FR-013 (arch M-001)
- 起動中のダイアログの閉じ方と拒否の AC → US-2 AC4 / AC5 (po M-001)
- US-3 を P1 に (登録画面への唯一の入口) (po M-004)
- 「新規起動」の E2E の locator の一意性 (analyze M4)、SessionListScreen の 280px の崩れ (analyze M7)、2 つのストアの両方の行の強調 (analyze M8)、research R-02 の事実誤り (analyze M1)、`discovery.md` の参照の誤り (analyze M10)
- AD-045 の欠番 (arch L-002) → AD-045 は O-3 (ブランチ `012-ui-thread-search`) の proposed の ADR。AD-046 の Context に注記

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
