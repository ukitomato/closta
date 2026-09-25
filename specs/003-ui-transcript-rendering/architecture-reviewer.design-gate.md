# architecture-reviewer — design-gate (R-3) Round 2

**Run**: 2026-09-24 / read-only

## Verdict: Critical 0 / High 2 / Medium 2 / Low 0

Round 1 resolved: 9 (C-001 SC-007 虚偽固定化 / H-001 署名 / H-002 型+AD-021 帰属 / H-003 XII vacuous / H-004 contract 本文経路 / M-001 KPI E2E / M-002 system 種別 / M-003 UL / L-001 glossary)。unresolved: 0。new: 4。

## High (new)

### H-001 — plan.md Constitution Check VII が中核設計と正反対 (「既存列挙プロセスに相乗りさせる」) で自己矛盾
- **Where**: plan.md:137 (VII 行が「相乗りさせる」肯定形) vs plan.md:42/67/402 / data-model §8 / research R-02 / tasks BE-020 / contracts C-2 (すべて「相乗りしない・env 固定専用プロセス」)
- **Issue**: VII の遵守根拠行を字義通り実装すると R-2 常駐プロセスの共有可変 env に相乗りし Round 1 の env レース (別ディストロ読み) を再導入。
- **Action**: plan.md:137 を「transcript 取得は `src/agents/` に専用 (短命) プロセスとして置き、常駐列挙プロセスに相乗りさせない (AD-021 §3 / AD-030 §3)。electron/native 推移的到達 0 を維持」に訂正。(platform-boundary H-101 と同一)

### H-002 — transcript 専用プロセスを spawn するモジュールの許可リスト計上漏れ (Principle VI / check.mjs 項目 7)
- **Where**: allowlists.mjs:208-223 `PROCESS_SPAWN_MODULES` は 4 件 (wsl-cli/run.mjs/package.mjs/enumerator-spawner)。read-transcript.ts は spawn される側。起動主体 (新設 spawner か session-service) が許可リストに無い。SH-001 ADR / SSoT 追随表 / SH-060 は AGENT_SDK_ALLOWED_CALLS のみ
- **Issue**: 専用プロセスを spawn すると check.mjs 項目 7 が違反発火 → SH-067 の「check:constitution 全通過」と両立しない。無断追記は Principle VI 違反。enumerator-spawner は AD-030 常駐用 (postMessage+stdout) で MessageChannelMain port transfer と前提が違う
- **Action**: (a) spawn 主体を実名で決め `PROCESS_SPAWN_MODULES` 追加を SH-001 ADR + SSoT 表 + SH-060 に明記。(b) enumerator-spawner 流用/一般化か新設かを Project Structure に。(c) 追加後 check.mjs 項目 7 が緑を SH-067 に含める。(platform-boundary M-101 と同一、severity High)

## Medium (new)

### M-001 — 起票 ADR (SH-001) の AD-030 調停が env レースのみで、並行 spawn 劣化とプロセス寿命/孤児処理を欠く
- **Where**: SH-001 (plan:309 / tasks:26) は env レース観点のみ。AD-030 のもう 1 つの実測 (並行 spawn で 10,470ms/3 件 11,419ms 劣化) と §Consequences (before-quit 終了・孤児 UNC ハンドル回避・落ちたら作り直す) が未反映。AD-023 §6「agents は per-session」に対し R-3 は第 3 のプロセス形態
- **Action**: SH-001 ADR に (a) 並行 spawn 劣化 — transcript は user 選択ごと 1 回で hot loop でない点を明記し許容 (research R-02 の論拠を ADR 本体へ)、(b) 専用プロセスのクラッシュ封じ込め・window close/before-quit 時終了・孤児 UNC ハンドル回避 (AD-030 §7 踏襲)、(c) per-session (AD-023 §6) / resident (AD-030) に対する第 3 形態としての位置づけ、を加える。

### M-002 — 「見栄えの一次判断」の SC 番号 drift (spec は SC-010、quickstart/plan #8/checklist は SC-009)
- **Where**: 誤用: quickstart.md:3,60 / plan.md:364 / checklists/requirements.md:36。正: spec.md:254 / tasks.md:10,167,168
- **Action**: 該当 4 箇所を SC-010 に統一。SC-009 (割当表) の計測経路は data-model §3 + Vitest である旨に整える。(po H-001 / analyze N2 と同一)

## H (owner 範囲)
- SC-007 の main 非デシリアライズのランタイム保証には自動回帰が無い (port transfer 構造検査 + 手動レビューのみ) が、Round 1 C-001 の是正で正直に開示され SH-062b で到達集合検査の持ち主 feature を roadmap 登録するため new finding にしない (開示済み)。
- 本文を log に出さない検査 (SH-067 / C-7 bounded FailureReason) は観測面を正しく絞り良好。

## 判定注記
Critical drift 無し。中核設計 (main を本文データ経路から外す / env 固定専用プロセス / Principle IX 正直化 / 到達集合検査の持ち主登録 / Principle XII vacuous 明記) は accepted ADR と整合し Round 1 の 9 指摘を全解消。残る 2 High は plan 内文面矛盾と spawn 許可リスト漏れで feature 内対処可能。
