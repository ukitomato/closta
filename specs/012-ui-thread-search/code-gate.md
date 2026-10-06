# Code Gate Iteration 1: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Spec**: specs/012-ui-thread-search/
**Diff scope**: 93 files, +9773/-437 (作業ツリー vs HEAD `73ebbc0` = `.implement-base`。未追跡 32 件を含む。diff にあり touched に無い 5 件は spec_dir の設計文書で、scope から除外)
**Tracks**: lint-agent, test-agent, convention-reviewer, database-reviewer, platform-boundary-reviewer

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 0 | — |
| CONSIDER | 21 | 下の「CONSIDER findings」 (reviewer の Medium 5 / Low 16) |

**Status**: PASS

- lint track (7 検出器: eslint / tsc:node / tsc:web / dependency-cruiser / constitution-check / tsc:e2e / tsc:perf): すべて exit 0、violations 0。constitution-check は ok 20 / pending 1 (#5、対象なし)。`test:rules` は code-gate では実行していない
- test track (scope: full): `vitest run` exit 0。132 files / 2266 passed / 0 failed / 0 skipped / Errors 0
- reviewer: Critical 0 / High 0。cascade 降格 0 件。viewpoint A-H は 3 reviewer とも欠落なし

## MUST_FIX findings (0)

なし。

## CONSIDER findings (21)

本文は各 reviewer の raw output を正とする (`convention-reviewer.code-gate.md` / `database-reviewer.code-gate.md` / `platform-boundary-reviewer.code-gate.md`)。

| ID | Severity | origin | Where | 要旨 |
|---|---|---|---|---|
| CONV-M-001 | Medium | convention | `ConversationSearchProvider.tsx:43,166` ほか 4 ファイル | IME 変換中・モーダル判定が 7 か所にコピー |
| CONV-M-002 | Medium | convention | `SessionListScreen.tsx` (1427 行) | Thread search の部品が session の module 内。`features/search/` へ |
| CONV-M-003 | Medium | convention | `spec.md:317,320` | spec の Key Entities が `version` / 本文の位置のまま (実装は `schemaVersion` / `occurrence`) |
| CONV-L-001 | Low | convention | `conversation-search.ts:39` / `CenterPane.tsx:33` | 参照されない export と古い名前の注記 |
| CONV-L-002 | Low | convention | `launch-usage-store.ts:77` / `launch-usage-service.ts:46` | `errnoCode` が同名で契約違い |
| CONV-L-003 | Low | convention | `launch-usage-service.ts:55` / `data-model.md:249-256` | service の状態名が data-model と不一致 |
| CONV-L-004 | Low | convention | `running-session-store.ts:56-61,366` | `launch` の `origin` が任意で既定 `manual` |
| CONV-L-005 | Low | convention | `command-palette.tsx:67` / `CommandPalette.tsx:66` ほか | 名前の衝突 |
| CONV-L-006 | Low | convention | `palette-commands.ts:20-27,291-305` | 「純関数」の module がストアを import |
| CONV-L-007 | Low | convention | `e2e/multi-session.spec.ts:28` / `e2e/sidebar-screenshot.spec.ts:27,70` | E2E の手順のコピー |
| DB-M-001 | Medium | database | `launch-usage-service.ts:80-86` / `PresetPanel.tsx:222` | 退避後に空の状態と区別できない |
| DB-L-001 | Low | database | `docs/discovery.md` / `docs/roadmap.md:323` | `.bak` の戻し方と復元 UI の持ち主が無い |
| DB-L-002 | Low | database | `launch-usage-store.ts:157-163` | 最上位の未知のキーが黙って消える |
| DB-L-003 | Low | database | `launch-usage.ts:64-67` | 保存形の鍵が `string` で brand が外れる |
| DB-L-004 | Low | database (system) | `launch-usage-store.ts:189-190` ほか 3 store | fsync 無し・残った `.tmp` の掃除無し |
| DB-L-005 | Low | database | `launch-usage-service.ts:102,106-107` | 日付の `RangeError` も `write-failed` と出る |
| DB-L-006 | Low | database | `launch-usage-service.test.ts` | 実物の store + service の結合テストが無い |
| PB-M-001 | Medium | platform-boundary (system) | `scripts/constitution/allowlists.mjs:566-581` | 項目 8 が renderer の `navigator.*` を見ない (design-gate から持ち越し) |
| PB-L-001 | Low | platform-boundary | `CommandPalette.test.tsx:267-273` | Ctrl+K/F の修飾キー判定を固定する負例テストが無い |
| PB-L-002 | Low | platform-boundary (system) | `scripts/constitution/check.mjs:753` / `plan.md:234` | 実名列挙の規則に網羅の検査が無いのに「強制される」と書く |
| PB-L-003 | Low | platform-boundary | `e2e-capability.ts:121-122,556` | E2E 索引の鍵を手で組み、`sessionTargetKeys` が空 |

## 起動しなかった reviewer

- a11y-reviewer: gates=['pr-gate'] に code-gate が無い
- ux-reviewer: gates=['pr-gate'] に code-gate が無い
- security-reviewer / architecture-reviewer / po-reviewer: pr-gate 専任 (code-gate の候補に含めない)

## iter_history

| iter | must_fix | skipped | error |
|---|---|---|---|
| 1 | 0 | 0 | 0 |

auto-fix loop は起動していない (MUST_FIX 0)。
