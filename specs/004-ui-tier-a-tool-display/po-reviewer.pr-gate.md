# po-reviewer Review (R-4 Tier A tool 表示) — pr-gate Round 2 (re-verify)

**Run**: 2026-09-25 · Read-only · **Round**: 2

## 初回読了 viewpoint

- FR/SC (re-verified): FR-006 / FR-017 / SC-004 / SC-009 / US-1 AC-4 / US-2 AC-3
- touched charter/Confirmation: `docs/domains/ui/charter.md` Journey 1 step3; AD-035 Decision 5/6 + Confirmation
- A. 認可 / 認証 / secret: 該当なし: read-only 表示経路、authn/secret 面なし (security-reviewer owner)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: XSS/bidi は security-reviewer owner。PO 範囲外
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer owner (AD-035 Confirmation の事実誤記は E で扱う)
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:1 Low:0
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer owner
- G. optional reviewer 範囲: 該当なし: optional reviewer 未 install
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

Round 1 の 5 指摘 (H-001 / H-002 / M-001 / M-002 / L-001) の解消を working-tree diff で再検証した。
コード側の修正 (agent-plan plain-text 化、diff 行折りたたみ、depth/breadth 打ち切り、隣接非依存テスト、
empty-todos / 小文字 bash テスト) はすべて実在を確認。H-001 / M-001 / L-001 は完全解消。
H-002 と M-002 は core は解消済みだが **done-evidence / 契約文書の文言残渣**と**折りたたみ経路の未テスト**が残る。
NEW 1 件 (breadth 打ち切りの未テスト) を検出。**Critical / High は 0**。

## Verdict

po-reviewer: Critical 0 / High 0 / Medium 1 / Low 2  (UNRESOLVED + NEW のみ計上)

Round inheritance: resolved from Round 1: 5 (H-001, H-002 core, M-001, M-002 core, L-001) / unresolved: 0 / new: 1 (Low)。残渣として H-002 residual (Medium) / M-002 residual (Low) を計上。

## Resolved

- **H-001 (Agent plan markdown drift)** — 完全解消。plain-text が正式方針として全 artifact で一致 (`agent-plan.aui.tsx:37-39` / FR-006 / US-1 AC-4 / C-3 / §6 / FE-027 / quickstart V-5)。roadmap tracked debt に markdown 整形を明記。
- **M-001 (depth cutoff 未テスト + AC 乖離)** — 完全解消。domain 平坦化テスト `transcript.test.ts:354-378`、renderer visual 省略テスト `ChatScreen.test.tsx:574-601`。`data-model.md` が 2 段構えを明記。
- **L-001 (empty-todos / toolName-case)** — 完全解消。`ChatScreen.test.tsx:603-609` / `:611-617`。

## Unresolved / New

### [Medium] H-002 residual: 「並べ替え不変」の文言が 4 artifact に残り、狭義化した SC-009 と矛盾 (PO-M) — **修正済み (invoker 適用)**
- **Where**: `quickstart-results.md:21` (SC-004 done-evidence 行) / `tasks.md:57` (BE-012) / `docs/decisions/0035-...md:102` (Confirmation) / `plan.md:191`。
- **Issue**: `spec.md:270` が「『任意の並べ替えで不変』ではなく隣接非依存に narrowing した」と明言したのに 4 文書が旧文言を保持し内部矛盾。特に quickstart-results.md:21 は done-evidence として存在しないテスト名を PASS 根拠に挙げていた。
- **適用した Fix**: 4 箇所の「並べ替え不変」を「隣接非依存」へ差し替え。quickstart-results.md:21 を実在テスト名 (入れ子/孤児/多段/隣接非依存) に揃え、0035 Confirmation は merge 前の新規 ADR のため in-place 修正。

### [Low] M-002 residual: diff 行折りたたみ経路が未テスト + 「（切り詰め）」バッジの説明が不正確 (PO-L1) — **修正済み (invoker 適用)**
- **Where**: `code-diff.aui.tsx:52-77` の折りたたみ表示の render テスト不在。`data-model.md:39-40` のバッジ説明。
- **Issue**: 巨大 diff の折りたたみは実装済みだが「残り N 行を省略」を回帰検出するテストが無かった。バッジの到達性説明が不正確。
- **適用した Fix**: (1) >200 行 diff の Write を描画し `残り N 行を省略` を assert するテストを追加 (`ChatScreen.test.tsx`)。(2) `data-model.md:39-40` を正確化 — `truncated` は argsText 切り詰め ∨ result 切り詰めの論理和で、code-diff のバッジは result 切り詰めの信号 (args 切り詰めは fallback へ)。**バッジは dead UI ではない** (result 切り詰め経由で点灯)。
- **注**: reviewer の「バッジ削除」提案は不採用。`transcript.ts:238` により result 切り詰め時にバッジは到達可能なため。

### [Low] NEW: subagent breadth 打ち切り (VISUAL_MAX_CHILDREN=50) が未テスト (PO-L2) — **修正済み (invoker 適用)**
- **Where**: `subagent.aui.tsx:112-129`。
- **Issue**: 51+ 兄弟の breadth 折りたたみを踏む unit test が無かった。
- **適用した Fix**: 51 件の children を持つ Task を描画し `（以降 1 件を省略）` を assert するテストを追加 (`ChatScreen.test.tsx`)。

## 補足 (肯定的確認)
- SC-009 の spec 文言・data-model §4・AD-035 Decision 5 はすべて「隣接非依存 (full reorder では孤児化)」で一致し対応テストも実在。
- convert.ts の `__` prefix strip + 注入耐性テストにより argsText 経由の偽入れ子・偽切り詰めバッジは防止済み。
- R-3 回帰の非破壊を再確認 (composer 閉塞 / XSS 境界 / argsText サニタイズ / id ベース対応づけ)。

## 同種事象探索 cascade summary
| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (Critical なし) | — | — | Critical 申告なしのため cascade 必須要件は非該当 |
| PO-M 文言残渣 | `並べ替え不変` | Round 2 で 4 箇所修正済 → 現存 0 | quickstart-results/tasks/plan/0035 |
