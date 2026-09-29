# Design Gate — Track C (architecture-reviewer)

**Run**: 2026-09-27 · read-only · viewpoint C / D owner

## 初回読了 viewpoint
- FR/SC: FR-001〜013 / SC-001〜006。
- A. 認可/認証/secret/プロセス境界: 該当なし (security owner)
- B. 入力検証/injection/XSS/CSP: 該当なし (security owner)
- C. 業務不変条件/Charter・Glossary drift/cross-domain invariant: Critical:0 High:1 Medium:0 Low:2
- D. Constitution Principle drift/accepted ADR drift/layering: Critical:0 High:1 Medium:2 Low:0
- E. User Story/SC/AC/UX: 該当なし (po owner)
- F. 命名/module/lint: 該当なし (convention owner)
- G. optional reviewer 範囲: 該当なし
- H. テスト/coverage/regression: High:1 Medium:1 Low:0

## スコープ要約
X-2 は M2 2 本目、ui domain 5 本目。実装面は renderer (features/session/ + vendored thread.aui.tsx) + 新規 e2e/ + config/docs 追随に閉じ、agents/infra/SDK/spawn は触れない。AD-037 D1-D4・AD-036・AD-024#18・AD-001 との整合は良好で accepted ADR の Decision Outcome に反する設計は発見されず (Critical 0)。移設対象外 (スクロール安定 E2E / Principle IX 到達集合検査) の非混入は FR-011/SC-006/T018 で明示的に守られている。

## Findings

### [High] message queue が二層 (X-1 in-memory / composer renderer) になり所有と写像が未定義。FR-006/SC-004 が現設計で成立しない恐れ (C-001)
- 観察: spec.md:233-234/315-316・data-model.md:23-24 は「X-1 の in-memory キューの上に composer 側 queue を載せる/土台にする」。一方 data-model.md:52-58・T015 は「現ターン完了で queue 先頭を session.send」= running 中は renderer 保持で session.send を呼ばない。X-1 の in-memory キューは running/awaiting 中の sendPrompt で初めて積まれる層。composer 側が完了まで送らないなら X-1 層に item が届かず interrupt 時の still_queued/cancelled が空になり composer 側 item と対応づかない。
- 同種事象探索: 二層の所有/写像/dispatch 主体を定義する記述 0 件 (11 行走査)。
- リスク: (i) 二重積み/二重 dispatch、または (ii) FR-006/SC-004 の「何が残り何が消えたか」が取れず提示できない。
- Action: queue 保持の単一 locus を明文化。案 A: composer 側 renderer queue を唯一の保持層とし真実源も composer 側 (X-1 in-memory は単一セッションでは経由しない旨明記、FR-006 を「意味論を継承」に緩める)。案 B: running 中も即 session.send し X-1 層に積ませ renderer は interrupt-receipt を反映 (T015 の「完了で dispatch」撤回)。SC-004/T012 がその写像を assert するよう修正。

### [High] Principle VIII の IME E2E が「running + queue capability 宣言後」の composer 状態を対象にしておらず、最も壊れやすい誤送信経路が Automated 検証の外に残る (C-002)
- 観察: T006/SC-001 の IME E2E は idle/既定 composer で固定。AD-037 §4 の `if (threadState.isRunning && !hasQueue) return;` のとおり queue capability 宣言 (hasQueue=true) で running 中の Enter は送信/queue へ流れる分岐に入る — この状態でこそ isComposing ガードの先行を検証する必要。T011 は IME を扱わず、IME E2E は running/hasQueue を対象にしていない。既存 ChatScreen.test.tsx は isDisabled:true 前提で有効 composer の running 経路を守っていない。
- リスク: NON-NEGOTIABLE VIII の中核が queue 宣言後 running 状態で回帰しても CI 緑のまま通る。現設計で観察可能な回帰未検出点。
- Action: T006 を (a) idle と (b) running+queue capability 宣言済み の両状態で「isComposing 中 Enter が onNew/session.send に届かない」を assert に拡張、SC-001 に 2 状態明記。ChatScreen.test.tsx が有効 composer の番人でないことを spec/plan VIII 説明に注記。

### [Medium] plan.md の Constitution Check が「v1.0.0 に基づくゲート」と明記。現行 v1.2.6 で VIII の「現状の制約」が改定済み (C-003)
- 観察: plan.md:150「v1.0.0」だが現行は v1.2.6 (constitution.md:3/921)。VIII は v1.2.1〜1.2.6 と AD-024#18/AD-028§5 で改定済み。
- Action: plan.md:150 を v1.2.6 に直し、VIII の該当改定を辿れる形に。

### [Medium] E2E/スクリーンショット検証ハーネスは新規 ADR を起票すべき。research 留めは governance 不足 (C-004)
- 観察: T001/T002 はハーネス導入に伴い eslint/depcruise/tsconfig の検証 scope に e2e/ を編入する = AD-023 が機械強制するレイヤ依存規則の適用範囲を変える新規判断。
- 判断 = 起票すべき: (a) roadmap L244/PLAN.md §3 と先例 AD-036/AD-034 と同格の cross-cutting 基盤、(b) 機械強制レイヤ規則の scope 変更はアーキ決定、(c) 技術選定/CI 統合/基準画像承認手順/日本語フォント provisioning を単一 ADR に固定すれば後続 deferred feature が根拠を得る。T029 を「要否判断」から「ADR 起票」に確定。
- 根拠: AD-023 / Principle VI / roadmap L244 / PLAN.md §3 / AD-036・AD-034。

### [Low] ui charter の Related Specs が R-4 を「着手中」のまま。X-2 追随 (T023) で R-4 完了状態も直すべき (C-005) [scope: system]
- charter.md:156 R-4「着手中」だが merge 済 (731f27d)。frontmatter related_specs も 003/004 のみ。T023 に R-4 完了更新と related_specs 反映範囲を含める。

### [Low] glossary 追記 (FR-013) の canonical 表記を英語 canonical に揃え message mapping と概念衝突しない注記を (C-006)
- MessageQueueItem/Composer draft/Message queue item と表記揺れ。既存 glossary に近接 message mapping あり。見出しを英語 canonical で統一し Counterexamples 注記、spec/data-model のフィールド名と一致させる。

## 同種事象探索 cascade summary
| 指摘 | Grep | 該当 | path:line |
|---|---|---|---|
| C-001 | in-memory/セッションキュー/土台/対応 | 11 行 (所有/写像定義 0) | spec.md:233-234,315-316; data-model.md:23-24,52-58; tasks.md:84 |
| C-002 | running/hasQueue/queue capability (tasks) | 4 行 (IME E2E が running 対象 0) | tasks.md:56,77,82; AD-037 §4 |
| C-003 | v1.0.0 | 1 件 (現行 v1.2.6) | plan.md:150 |
| C-004 | playwright/e2e/screenshot (config) | 実名ルール 0 (ADR 未起票) | plan.md:171-175; tasks.md:29-30 |
| C-005 | charter Related Specs 状態 | R-4「着手中」1 | charter.md:10-12,156 |
| C-006 | glossary message 系 | message mapping 1 | glossary.md:261- |

## Verdict
Critical: 0 / High: 2 (C-001 two-queue / C-002 VIII running-state IME E2E) / Medium: 2 (C-003 版 drift / C-004 ADR 起票要) / Low: 2

accepted ADR drift: なし。AD-037 D1-D4・AD-036 (interrupt→steer しない)・AD-024#18・AD-001 遵守。移設対象外の非混入も守られている。AD-037 D3 の前倒しは後続 ADR で決定を変える正規機構で in-place 改変でない (AD-031 適合)。Constitution VIII 現状の制約と roadmap L115-124 は未追随で T024/B-7 が担う (未実施なら drift)。新規 ADR (E2E ハーネス) = 起票すべき。
