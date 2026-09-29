# Design Gate — Track A (analyze / 機械的 consistency)

**Run**: 2026-09-27 · read-only · ファイル書き込みなし

対象 8 ファイル + 参照 (AD-037 / AD-036 / AD-024 / constitution / ui charter) に加え、citation 検証のため spec 005 (X-1) の FR-011/018/019 と docs/roadmap.md L108-127 も実読して裏取り。

## 結論
Critical=0 / High=0 / Medium=0 / Low=3。mechanical consistency 上、昇格をブロックする指摘なし。identifier 整合・カバレッジ・AD/Principle 引用・trace はいずれも健全。

## 観点1: FR ↔ SC ↔ US ↔ contracts の整合とカバレッジ
- FR-001..013 (13)、SC-001..006 (6)、US1..4、C-1..5 すべて揃い欠番・重複なし。plan の "FR 13 / SC 6 / US 4" と一致。
- 孤立 SC なし。FR→SC: FR-001→SC-001, FR-002→SC-002, FR-004→SC-003, FR-005/006→SC-004, FR-007/008→SC-005, FR-009/010/011→SC-006, FR-012→SC-001。
- contracts C-1..5 は spec FR/SC と整合 (composer-behavior.md L53-60 の対応表と一致)。

**[Low] F-1 — FR-003 が SC 未対応 / 専用テストタスク不在**
- Where: spec.md:218 (FR-003) / data-model.md:34 / tasks.md 全体
- Issue: FR-003 (空・空白のみ送信不能 + バイト長上限) に対応する SC が無く tasks にも専用テストが無い。data-model は「空/空白のみは積まない (FR-003 継承)」と書くが assert タスク無し。
- Why: X-1 FR-018 からの明示的継承であり inherited work はカバレッジ要件から除外可。実害小。
- Action (任意): FR-003 が境界継承であることを SC 側にも一言残すか、queue の空入力拒否を T011 の assert に 1 行足す。

## 観点2: spec/plan/tasks/data-model/contracts 間の drift
概ね無矛盾。draft メモリ限定 / interrupt→steer しない / dispatch trigger=現ターン完了 / 新規起動なし、が 5 ファイルで一貫。

**[Low] F-2 — contracts C-5 の本文と対応表で FR-012 の扱いが不一致**
- Where: contracts/composer-behavior.md:49 (本文) vs :58 (対応表 C-5 行)
- Issue: C-5 本文は「FR-009/010/011/012」だが対応表 C-5 行は FR-012 が落ち「FR-009/010/011」(FR-012 は C-1 行のみ)。
- Action (任意): 表の C-5 行に FR-012 を追記して本文と揃える。

**[Low] F-3 — FR-004 が実装機構を hard requirement として断定 (research が未確認と明記)**
- Where: spec.md:223-225 (FR-004) vs research.md:23-26 (R-02)
- Issue: FR-004 は「message queue capability を宣言し」と機構を断定。research R-02 は「実ソースで確認、非対応なら feature 側キューで代替」と未確認・fallback を明記。要件文が実装未確定事項に踏み込む。
- Action (任意): FR-004 を「capability 宣言 または同等の feature 側 queue で C-3 の振る舞いを満たす」と振る舞い基準へ寄せる。ブロック性なし。

## 観点3: Constitution / AD 引用の正確さ — 該当なし (全件正確)
Principle 番号 (VIII/XV/XIII/XIV/XI/V/IV/XII/I-III/VI/VII/IX/X)、AD-037 D1/D2/D3/D4・§参照、AD-036/AD-024#18/AD-001、X-1 FR-011/018/019、roadmap L115/L120/L122-124 いずれも実在・正確。

## 観点4: tasks の trace と US ラベル対応 — 該当なし
US ラベル [US1..4] は spec の User Story 1..4 と過不足なく対応。全 FR がタスクに落ちている (FR-003 のみ F-1)。孤立タスク無し。順序矛盾なし (US-4 が US-3 より前だが priority 駆動で Dependencies 明記)。

## 観点5: EARS 曖昧さ / 測定不能 SC / [NEEDS CLARIFICATION] — 該当なし
[NEEDS CLARIFICATION] 残存 0。SC-001..006 すべて計測経路あり。SC-002 は測定不能な視覚判断を「基準画像一致」を合否にし視覚的妥当性のみ quickstart(人間 deferred)へ退避。dispatch trigger/キュー上限は Assumptions で境界化済み。

## 集計
- Critical: 0 / High: 0 / Medium: 0 / Low: 3 (F-1 FR-003 カバレッジ / F-2 contracts C-5 表 FR-012 / F-3 FR-004 機構断定)
