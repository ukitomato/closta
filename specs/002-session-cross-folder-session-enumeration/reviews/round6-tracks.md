# pr-gate Round 6 — track 別 findings 台帳

**Run**: 2026-09-24 / **目的**: 次 Round の継承検証を可能にする (PO5-004 / L5-07 / S4-002 が評価不能になった件の是正)。
各 track の全文は起票時の SubagentHandback にあり、本ファイルは ID / severity / 一言 / 判定 / file:line の要約である。

## security-reviewer (Critical 0 / High 1 / Medium 1 / Low 2 — resolved 0 / new 1 / unresolved 3)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| S6-001 (=H-D2 / S4-003) | High | `isValidDistroName` が bidi を通す / `dto-mapper` 関門が 3 フィールドのみ。到達経路は upstream で封止 = defense-in-depth | unresolved (Q1 未選択) | namespace.ts:35-45 / dto-mapper.ts |
| S6-002 (=M5-01) | Medium | `dto-boundary.test` が無 gate フィールド (cwd/cwdKey/location) を汚染入力で行使しない | unresolved | dto-boundary.test.ts:262-271 |
| S6-003 (=L5-01) | Low | `cwdKeyOf` の comment が `JSON.stringify` の保証を過大に述べる (DEL/C1/bidi 素通し) | unresolved | match.ts:84-86 |
| S6-004 | Low | posix/other のバックスラッシュ判定が正当な POSIX ファイル名も opaque に落とす (**fail-safe**、実害なし) | new (受容) | path-api.ts:211,222 |

Round 6 の 3 実装変更 (cwdDisplay 描画 / posix バックスラッシュ / inflight `\u0000`) は境界に制御文字・UNC・U+0000 を新たに漏らさないと観察確認。**PASS を覆す事由なし。**

## architecture-reviewer (Critical 0 / High 1 / Medium 2 / Low 2 — resolved 5 / partial 2 / unresolved 1 / new 4)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| H-001 (R5) | — | AD-032 §6 test describe 8 行化 | **resolved** | cwd-origin.test.ts 8 describe / 正本 1 対 1 |
| M-003 (R5) | — | charter VII/IX | **resolved** | session/isolation charter |
| M-004 (R5) | — | FR-031 infra 例外 | **resolved** | spec.md FR-031 |
| M-005 (R5) | — | agents 2役 | **resolved** | roadmap #6 |
| L-002 (R5) | — | opaque-unc を spec Edge Cases | **resolved** | AD-032 box / spec |
| A6-001 | **High** | H-A2 で `raw.includes('\\')` を足したのに **AD-032 §1/§3/Consequences「綴りに依存しない」を未訂正**。C4-012 と同型の drift が AD-032 自身に | new | 0032-...md:120 / path-api.ts:211,222 |
| A6-002 (=M-002 partial) | Medium | AD-028 に amended-by を足したが **AD-030 に `amends:[AD-028]` が無い** (AD-021↔AD-030 も片側) | partial | 0030-...md:7-8 |
| A6-003 (=M-001 partial) | Medium | 短命プロセスを 3 箇所直したが **plan.md:43 が「本線」のまま** plan.md:69 と内部矛盾 | partial | plan.md:43 |
| A6-004 | Low | isolation charter の Principle V が _overview 未割当 (既存、編集行で露出) | new | _overview.md:126 vs isolation/charter.md:133 |
| A6-005 (=L-001 R5) | Low | Constitution v1.2.5 の PATCH 再帰 | unresolved | constitution.md |

「AD-032 の amends から AD-028 を外した判断は妥当」と確認 (agents 2役は roadmap #6 に先送り、整合)。

## po-reviewer (Critical 0 / High 0 / Medium 1 / Low 2 — resolved 4 / unresolved 1 / new 3)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| PO5-001 (H-D1) | — | 偽完了訂正 + 台帳 | **resolved** | quickstart:5 / tasks:379 / roadmap #7 |
| PO5-002 (M5-09) | — | opaque-unc/undetected-distro spec 反映 + Key Entities 6 種 | **resolved** | spec Edge Cases / Key Entities |
| PO5-003 (M5-10) | — | FR-049 適用除外 | **resolved** (M-001 派生) | spec.md FR-049 |
| H-A1 (=ux C-001) | — | distroName が UI に到達 (US-1 AC-8) | **resolved** (end-to-end) | SessionMeta |
| PO5-004 (L5-07) | Low | track 本文の Round 別保存が未適用 | unresolved → **本ファイルで是正** | reviews/ |
| M-001 | Medium | **SC-006 本文 (総数=合計) が FR-049 の「総数−落とした件数」と未調律** | new | spec.md:391 (FR-049) vs :464 (SC-006) |
| L-001 | Low | AD-032 box / roadmap #5 が Round 6 実施分を「Round 5 で実施」と誤帰属 | new | 0032-...md / roadmap:93 |
| L-002 | Low | track 本文保存 (PO5-004 と同旨) | new → 本ファイルで是正 | reviews/ |

## platform-boundary-reviewer (Critical 0 / High 0 / Medium 1 / Low 1 — resolved 4 / new 0 / unresolved 3)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| PB5-001 (H-A2) | — | posix #7 の UNC 部分文字列露出 | **resolved (実測)** | path-api.ts:195-224 (単調安全) |
| PB5-002 (M5-02) | — | protocol docstring | **resolved** | protocol.ts:229-238 |
| PB5-003 (H-B1) | — | inflight scope | **resolved (実測)** | inflightKey 単射・境界非越 |
| PB5-004 (H-B2) | — | refresh 直列化 | **resolved (実測)** | fetchAllOnce, test hostCalls===1 |
| PB5-005 (項目14) | High | SDK import 検出器の回避形 | unresolved (**R-3 owned** roadmap #3) | check.mjs |
| PB5-006 (項目13) | High | agents→UNC API 検出器の別名回避 | unresolved (**R-3 owned** roadmap #3) | check.mjs |
| PB5-007 | Medium | `programmatic` が無検査で境界を渡る (`"yes"` 素通り) | unresolved (**持ち主未登録**) | build.ts:95 / dto-mapper.ts:136 |
| (refresh cooldown) | Low | 逐次連打の最小間隔なし (合流はする) | new (軽微) | session-service.ts:678 |

## a11y-reviewer (Critical 0 / High 0 new / Medium 0 new / Low 2 new — resolved 0 / new 2 / unresolved 5)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| (H-A1 の a11y 副要件) | — | cwdDisplay 描画に sr-only「作業ディレクトリ」が付き a11y 純増 | **改善確認** | SessionListScreen.tsx:392-397 |
| G-H1 | High | EmptyState を live region で包む | unresolved (**R-3 owned / 据え置き**) | SectionEmpty / empty-state.tsx |
| G-M2 | Medium | SourceLabel に役割 sr-only なし | unresolved | SessionListScreen.tsx:87-92 |
| G-M3 | Medium | SourceLabel badge の contrast (light 4.5:1 境界、要実測) | unresolved | SessionListScreen.tsx:90 / main.css |
| G-L4 | Low | `候補 #N` の `#` 発音不定 | unresolved | target-finder |
| G-L5 | Low | pathDisplay が truncated を捨てる | unresolved | dto-mapper.ts:98-100 |
| L6-01 | Low | sr-only 接頭辞「作業ディレクトリの所在」「作業ディレクトリ」が近似で紛らわしい | new | SessionListScreen.tsx:381,394 |
| L6-02 (=ux N-001) | Low | 視覚 truncate に title/reveal なし | new | SessionListScreen.tsx:393 |

## ux-reviewer (Critical 0 / High 0 / Medium 1 / Low 0 — resolved 2 / new 1 / unresolved 3)

| ID | sev | 内容 | 判定 | where |
|---|---|---|---|---|
| C-001 (H-A1) | — | distroName が画面に到達 | **resolved (経路追跡)** | SessionMeta / test 新設 |
| C-002 (M5-11) | — | unknown-location の記録値も表示 | **resolved** | SessionMeta guard length>0 |
| C-003 (L5-04) | Low | 候補#N の説明経路 | unresolved | SourceLabel |
| C-004 (M5-12) | Medium | fix-environment ボタン抑止 vs ヘッダ無条件 refresh の二重基準 (H-B2 は I/O 側のみ解消) | unresolved | SessionListScreen.tsx:476 vs 923 |
| C-005 (L5-06) | Low | 未検出概念の二重表示 (悪化なし) | unresolved | labels.ts:160,175 |
| N-001 (=a11y L6-02) | Medium | truncate に全文確認手段なし (長い unknown-location パスの同定 defeat) | new | SessionListScreen.tsx:393 |
