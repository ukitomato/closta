# Design Gate — Track B (po-reviewer)

**Run**: 2026-09-27 · read-only

## 初回読了 viewpoint
- FR/SC: FR-001〜013 / SC-001〜006 / US-1〜4。PO 主対象は US 価値、SC 計測可能性、AC testability、Edge Cases。
- A. 認可/認証/secret: 該当なし (security 範囲)
- B. 入力検証/injection/CSP: 該当なし (AD-034 = security owner)
- C. 業務不変条件/Charter drift: 該当なし (architecture owner。FR-013 で glossary 追記予定)
- D. Constitution/ADR drift: 該当なし (architecture owner。AD-037 D1-D4 と整合)
- E. User Story/SC/AC/UX: Critical:0 High:2 Medium:2 Low:1
- F. 命名/module/lint: 該当なし (convention owner)
- G. optional reviewer: 該当なし (ux/a11y/database 範囲)
- H. テスト/coverage/regression: High:0 Medium:1 Low:0 (M-003)

## スコープ要約
X-2 は 4 US = (1) IME 確定 Enter 非送信+全角、(2) 実行中積み、(3) 下書きメモリ保持、(4) IME E2E+スクショ CI 常設。人間 deferred が SC 合否を汚していない (SC-001 は E2E+静的、SC-002 は基準画像一致 boolean、視覚判断のみ quickstart 隔離 = X-1 SC-009 と同一手法)。candidate-Critical「X-1 FR-019 の in-memory キュー実在」は X-1 spec 005:333-339/147-149/209 で実在確認、誤帰属 0 → Critical 0。

## Findings

### [High] error/crash など interrupt 以外の終端遷移での queue の扱いが未定義 (H-001)
- 観察: FR-006 / C-3 は queue 終端意味論を interrupt のみで定義。running 中に積んだ既存項目が error/crash/provider-error で終端したときの disposition が未定義。X-1 の 7 状態機械に running→error は実在。
- 同種事象探索: error/crash/killed × queue disposition = interrupt のみ (spec.md:194,232)、error 経路 0 件。
- リスク: 積んだ入力がターン異常終了時に「静かに消える/表示と不一致/復帰後に予期せず送られる」いずれか未定義。queue 経由の予期せぬ dispatch は誤送信の変種 (Principle VIII)。
- Action: FR-006 を全終端遷移に拡張、または Edge Cases に「running→error/crash 時の queue は cancelled 扱いで提示」を明記し SC-004 か新 AC に負例追加。

### [High] US-1 AC-6 (IME 変換中のマウス送信) に追跡テストが無い (H-002)
- 観察: AC-6 (spec.md:101-102) は「変換中にマウス送信ボタン → 未確定文字列が送信されない」を定義。tasks の US-1 テスト (T006-008) は keydown 確定 Enter/静的/スクショのみでマウス submit×変換中の検証タスク無し (`マウス|button|click` tasks.md 0 件)。AD-037 の二重ガードは keydown の isComposing ベースで、マウス submit を同様に抑止するか Confirmation でも未言及。
- リスク: Principle VIII 核心の AC が「自前ガードを足さない」方針でカバーされるか未検証。
- Action: AC-6 検証テストを US-1 に追加、または既存ガードで担保されないなら FR-001 の担保対象に含めるか AC-6 を範囲外に明記。

### [Medium] queue 上限到達時の利用者向け挙動に AC/SC/テストが無い (M-001)
- 観察: Edge Cases (spec.md:193) が「無制限に積ませない」と制約を明示するが到達時 UX (拒否/エラー提示/send 無効) を定める AC/SC 無し。
- Action: 上限到達時の観測可能な振る舞いを US-2 AC に 1 行追加し SC-003 か新 SC の計測経路に含める。

### [Medium] 取消/消失した queue 項目テキストの復帰導線が未定義、draft↔queue 境界が非明示 (M-002)
- 観察: FR-006 は cancelled を提示するがテキスト復帰/再編集を定義せず。running 中の「送信」= queue 追加で draft がクリアされるか、cancelled 項目が draft へ戻るかの境界が spec/contracts に無い (C-4 と C-3 が接続点を持たない)。
- Action: draft↔queue item のテキストライフサイクルを FR か data-model で明記し、復帰導線の有無を US-2 AC-4 か US-3 に確定。

### [Medium] composer 側 queue と X-1 セッション側 queue の整合を検証するテストが無い (M-003)
- 観察: 2 つの queue (composer capability 表示 と X-1 in-memory) を配線するが、SC-004/T012 は fake session の dispatch/interrupt 意味論のみで「表示 still_queued/cancelled = 実 dispatch 項目」の一致 assert が無い。
- リスク: 2 つの真実源で表示と実挙動がずれると VIII の誤送信防止が表示上のみ担保される。
- Action: SC-004 に「composer 側表示 = session 側 dispatch/cancel 結果」の一致 assert を加えるか、data-model で単一真実源を確定。

### [Low] SC-002/SC-006 の基準画像「正しさ」ゲートが人間 deferred のみで形骸化リスク (L-001)
- Action: T028 の quickstart-results に基準画像承認者と承認根拠の記録を必須化し、承認前は SC-002 を暫定扱いと明記。

## H narrative
H-002/M-001/H-001 は対応テストが tasks に無い = coverage 穴。M-003 は整合 assert 欠落。良い点: T027 全件 Vitest / T006・T019 の IME E2E 回帰固定 / SC-004 の interrupt→steer 負例明示。observability: Principle V で下書き/queue はログに出せず、error 経路 queue disposition (H-001) を仕様で閉じないと運用時の原因特定が state 表示依存になる。

## 同種事象探索 cascade summary
| 指摘 ID | Grep | 該当 | path:line |
|---|---|---|---|
| (candidate-Critical 却下) | still_queued/cancelled/queue in specs/005 | 実在 (誤帰属 0) | 005:147-149,209,337-339 |
| H-001 | error/crash/killed × queue in spec.md | interrupt のみ | spec.md:194,232 |
| H-002 | マウス/button/click in specs/006 | AC 本文 1/テスト 0 | spec.md:101 |
| M-001 | 上限/limit queue AC/SC | plan 委ねのみ | spec.md:193,322 |

## Verdict
Critical: 0 / High: 2 / Medium: 3 / Low: 1
