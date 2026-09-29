# convention-reviewer Review: 日本語 composer (X-2)

**Run**: 2026-09-29
**Reviewer**: convention-reviewer
**Gate**: code-gate (convention track)
**Spec**: specs/006-ui-japanese-ime-composer/spec.md

## lint_input (CONV-1)

invoker から `lint-agent` の JSON を受領:
`{"detectors":["lint","typecheck","depcruise","check:constitution"],"violations":[],"exit_code":0,"counts":{"error":0,"warning":0,"info":0}}`

- `exit_code == 0` ゆえ「lint が落ちたこと自体を Critical にする」経路は発火しない。
- `violations == []` → CONV-1 の lint 由来 finding は 0 件。以下は read-only 観察 (Read/Grep/Glob) による convention 観点。

## viewpoint coverage

- A/B: 該当なし: security-reviewer owner
- C/D: 該当なし: architecture-reviewer owner (constitution VIII/charter/roadmap 追随は本 PR に含むが D owner 判断)
- E: 該当なし: po-reviewer owner (M-001 の「queue 上限が live 未配線」の機能的含意は SC-003/R2-M-001 として po へ委譲)
- F. 命名/module/lint hookup: Critical:0 High:0 Medium:2 Low:3
- G: 該当なし
- H. テスト/coverage/regression: Critical:0 High:0 Medium:1 Low:0

## 問題なしと判定した項目

- **module 配置 (適合)**: `src/main/app/e2e-capability.ts` は AD-023 §1 の `app` レイヤに整合。`electron`(MessageChannelMain)は許可行列の app+infra/secrets 例外、`node:crypto`(randomUUID)は app/infra 許可 core。E2E stub が単一 capability 境界 (FR-039) 上 shipping バンドルに乗るのは不可避で `src/main/app/` が正しい配置。
- **命名 (適合)**: `createE2eCapability`/`createStubSpawn`/`isBusyRunState`/`classifyEnqueue`/`PendingQueueNotice`/`DEFAULT_MAX_QUEUE_ITEMS`/`e2e-capability.ts` すべて既存慣習と一貫。
- **循環依存**: depcruise `no-circular` (error) exit 0 → 循環 0。
- **lint が src を弱めていない**: e2e ignore は `e2e/**`+`playwright.config.ts` に厳密限定。`.dependency-cruiser.js` の `not-to-test` は逆流入を新たに禁じる方向。`^e2e` は `src/main/app/e2e-capability.ts` を誤マッチしない。

## Findings

### [Medium] M-001 — `composer-queue.ts` の enqueue 検証・draft ヘルパ群がテスト専用の未使用 export (scope: feature)

- **観察**: `classifyEnqueue`/`DEFAULT_MAX_QUEUE_ITEMS`/`EnqueueVerdict`、`emptyDraft`/`setDraftText`/`clearDraftText`/`DraftState` は production から 1 件も参照されない。live 経路 (`SessionScreen.tsx`) が使うのは `isBusyRunState` と `isSendableText` の 2 つだけ。queue の run callback は `isSendableText` のみで上限判定 `classifyEnqueue` を呼ばない。draft は `useLiveSession` の `session.draft`/`setDraft` + `DraftBridge` の `aui.composer` 直操作で処理。
- **同種事象探索**: Grep で定義元 `composer-queue.ts` と `composer-queue.test.ts` の 2 ファイルのみ。production 参照 0。
- **リスク/影響**: (1) dead API が feature state モジュールに堆積。(2) unused-**export** を見る rule 不在で全機械検査をすり抜ける。(3) **機能的含意 (po へ委譲)**: 上限件数拒否+理由提示 (R2-M-001/SC-003) が pure 関数としてテスト済みだが live composer 経路に配線されていない可能性。
- **推奨**: (a) `classifyEnqueue`/`DEFAULT_MAX_QUEUE_ITEMS` を enqueue 経路に実配線し R2-M-001 を live で満たす、または scope 外なら export を純内部化/削除。(b) draft ヘルパは別実装済みのため production 使用か削除。(c) 恒久策として unused-export 検出 (knip/`import/no-unused-modules`) 導入検討。
- **根拠**: reviewer-base F (dead code/unused exports)。機能検証は po owner。

### [Medium] M-002 — e2e 配下が lint・typecheck・depcruise の全静的検査から外れ、代替の Playwright 専用 lint が未整備 (scope: feature)

- **観察**: `eslint.config.mjs` の global ignores が `e2e/**`/`playwright.config.ts` を丸ごと除外。`e2e/tsconfig.json` は code-gate typecheck から参照されない。depcruise も e2e 非走査。結果 e2e specs は lint も typecheck も depcruise もかからない。`playwright.config.ts` コメント/T002 は「override で base を緩めない」「Playwright 向け lint は別途」と述べるが、実装は全面 ignore で e2e ローカル eslint 設定は存在しない。
- **リスク/影響**: e2e の静的健全性は Playwright 実走でしか検出されない。ignore 範囲自体は src を弱めないが、「別途 lint」の約束が未履行で乖離。
- **推奨**: (a) e2e 用の最小 flat config (Playwright globals + base の TS/未使用 import 維持、react 系のみ off) を置き lint scope に含める、または (b) AD-038 D2 通り「e2e は Playwright 実走が唯一の検証」と決めるなら config コメント/T002 の文言を実態に合わせて訂正する。config が謳う状態と実装を一致させる。
- **根拠**: reviewer-base F (lint hookup)。AD-038 D2。

### [Low] L-001 — queue/draft のテストが実体モジュールと結びつかない kebab 名で対象は `SessionScreen.tsx` に同居 (scope: feature)

- **観察**: `pending-queue-notice.test.tsx`/`draft-bridge.test.tsx` は `SessionScreen.tsx` から `PendingQueueNotice`/`DraftBridge` を import するが、対応する `pending-queue-notice.tsx`/`draft-bridge.tsx` は存在しない (テスト用 export)。repo 慣習は `<Component>.test.tsx`。
- **推奨**: (a) `PendingQueueNotice`/`DraftBridge` を独立ファイルに切り出す、または (b) テストを `SessionScreen.test.tsx` に集約。
- **根拠**: reviewer-base F (命名/test 配置)。

### [Low] L-002 — `e2e/support/launch.ts` の import order が std→3rd-party の慣習と逆 (scope: feature)

- **観察**: `@playwright/test` (3rd) が `node:path` (std) より前。他の touched files は std→3rd→local 順。
- **推奨**: `node:path` を先頭へ。M-002 で e2e に lint を戻せば自動検出。

### [Low] L-003 — 手書き `ComposerAction` FC と IME マウスガードが generated 扱いの `thread.aui.tsx` に追加され strictness 復元が exhaustive-deps のみ (scope: feature)

- **観察**: `thread.aui.tsx` の override は `react-hooks/exhaustive-deps` のみ復元。R-4 の手書き element は `explicit-function-return-type`/`react-hooks/refs`/`no-empty` まで復元しており非対称。
- **推奨**: thread.aui.tsx の override に R-4 相当の意味論 rule を足すか、`ComposerAction` を手書き element 群と同じ扱いに。
- **根拠**: eslint.config.mjs の generated 内手書きコードへ strictness を戻す方針。

## H (テスト/coverage/regression)

- **[Medium] 変更した convention rule 自体の in-gate 検証が無い**: `eslint.config.mjs` の e2e ignore と `.dependency-cruiser.js` の `not-to-test` 拡張が意図通り発火するかは `pnpm test:rules` fixture のみで確かめられるが、test:rules は code-gate 非実行 (pr-gate Round 1 / CI 委譲)。pr-gate で `eslint.config.mjs`/`.dependency-cruiser.js` が変わった round は test:rules 再実行対象になる前提。
- **regression (問題なし)**: lint 4 検出器 exit 0。full vitest 1035 passed (scope=full)。src 側 convention 回帰なし。
- **coverage の歪み (M-001 再掲)**: `composer-queue.test.ts` は `classifyEnqueue`/draft ヘルパを網羅テストするが production 未配線のため「テスト緑」が live 挙動を保証しない。

## Verdict

- Critical: 0
- High: 0
- Medium: 3 (F: M-001, M-002 / H: modified-rule in-gate 検証欠如)
- Low: 3 (F: L-001, L-002, L-003)
