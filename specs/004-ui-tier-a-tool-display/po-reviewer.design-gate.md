# Design-gate: po-reviewer (R-4)

**Run**: 2026-09-25 · **Verdict**: Critical 1 / High 1 / Medium 3 / Low 1 · Read-only.

総評: scope creep なし。「Tier A 完全化」の過大主張は O-2 送りで明示回避。targets→both も subagent 入れ子 1 点に限定され妥当。
**ただし「M1 完了 / 軸 1 確定」という milestone-closing な主張が SC-010 の実力を超えている (C-001)。**

## Findings

### PO-C-001 [Critical] SC-010 が outcome「M1 完了 / 軸 1 方針確定」を計測できていない
- **Where**: spec.md L42-43 / L64 (positioning) / L252-258 (SC-010); tasks.md SH-065 (「rubric は現状 `未実施`」);
  裏取り: `specs/003-ui-transcript-rendering/quickstart-results.md:32-39` (R-3 rubric-a/b = `未実施`、一次判断結論 未記入)
- **Issue**: SC-010 の outcome は「実機で rubric を OK/NG 記録し軸 1 方向性を確定 (M1 完了判定)」だが、**done 必須条件は
  「判定表が記録済みであること」だけ**で OK/NG 判断は人間 deferred・gate されない。前提の R-3 一次判断も実機未実施。
  → R-4 は「空の判定表 (全観点 `未実施`)」のまま done に到達でき、そのとき「軸 1 の方針を確定」は一度も行われない。
  宣言 outcome (確定する) と計測基準 (表の存在のみ) が乖離 = PO-2 (SC 計測不能)。
- **Why**: charter / _overview は「軸 1 方針確定」を M1 の存在理由とする (_overview L91 / charter Mission)。SC が outcome を
  計測できないと M1 が「軸 1 未確定のまま」閉じ、軸 1 が検証不能な目標になる。R-3 は「一次判断」という控えめな主張で
  同じ弱い基準 (pr-gate P-M-002) が許容されたが、R-4 は「二次判断 = 軸 1 の確定 / M1 完了判定」という強い主張に
  同じ空表基準を流用しており、R-3 の accepted 判断ではカバーされない。
- **Action**: (a) SC-010 の done 必須条件を「rubric-a〜d が実機で OK/NG 記録済み (`未実施` を許さない) + R-3 一次判断も前提」に
  強化する、または (b) positioning を R-3 同等に緩め「M1 完了/軸 1 確定」を done-gate 主張から外し「判断材料の提示まで」に留める。
  design-gate 人間承認事項 (plan Post-design #6/#7) と一体で確定。**空の判定表で M1 を閉じることを認めない。**
- **同種**: `軸 1|二次判断|M1 を完了|方針を確定|完了判定` 12 箇所 (spec.md:42,43,64,253; plan.md:13,23,24,310,313; quickstart.md:41; checklists:10,38; tasks.md:145)

### PO-H-001 [High] R-4 spec 着手の roadmap 前提 (R-3 実機一次判断) が未達のまま R-4 が起票されている
- **Where**: `docs/roadmap.md:83-87`; 実測 `specs/003…/quickstart-results.md:32-33,37-39` (rubric-a/b 未実施); R-4 側 spec.md Dependencies / plan #6 / quickstart.md:9
- **Issue**: roadmap は R-3 一次判断 (rubric-a/b) を **R-4 spec 着手前の hard 前提**と定めるが実測で `未実施`。前提未達のまま
  R-4 の spec/plan/tasks が書かれている。quickstart.md:9 は「済んでいる」を前提列挙しつつ「未記入なら明記」とヘッジし矛盾。
- **Why**: charter「見た目の判断を先送りしない」と roadmap は「一次判断 NG なら charter/PLAN §4 を別 task で見直す」と定める。
  一次判断を飛ばして最終 feature を積むと、rubric-a/b が NG のとき描画基盤前提ごと手戻り。順序 (一次→二次→確定) 逆転。
- **Action**: disclosure は honest (plan Post-design #6)。ただし **rubber-stamp しない**。最小是正 = R-4 の quickstart 前に
  R-3 rubric-a/b の実機記入を先行させ一次判断結論を確定してから R-4 done を認める。C-001 の SC-010 強化と併せる。

### PO-M-001 [Medium] 「視覚的に区別」が jsdom Vitest で成立せず、視覚確認の quickstart 経路も欠ける
- **Where**: spec.md L79 (AC-3) / L170 (FR-003) / L237-238 (SC-003 計測=fixture Vitest); tasks FE-026
- **Issue**: SC-003/FR-003/AC-3 は Todo status を「視覚的に区別」と要求し計測を Vitest 単独明記。だが他所 (SC-006/007) は
  「jsdom はレイアウトを持たない」と認め視覚確認を quickstart に書き分けている。SC-003 は書き分けせず overclaim。
  rubric-c は「欠落なく構造を示す」(完全性) で status の視覚差ではない。
- **Action**: SC-003 を「Vitest = status ごとに区別可能な DOM マーカー (未知 status は生値保持) / 視覚差の確認 = quickstart 実機」に
  書き分け、quickstart/rubric に Todo status の視覚区別観点を 1 行追加。

### PO-M-002 [Medium] parent_agent_id の循環・自己参照が edge case に無く、深さ打ち切りの適用箇所が未確定
- **Where**: spec.md L149/L174/L273-275; data-model §4/§5 (children 全木 vs depth/parentId); contracts C-1
- **Issue**: Edge Cases は「多段ネスト=深さ打ち切り」を挙げるが**循環/自己参照 (A→B→A)** を明示扱いしない。深さ打ち切りは
  「描画コスト・可読性」目的で cycle 安全のためと書かれていない。DTO 表現が (a) children を採り打ち切りが描画側のみだと、
  取得プロセス側のグルーピング純関数が cycle で停止しうる (main を外していても取得プロセスが固まる)。
- **Action**: Edge Cases と contracts C-2 に「循環/自己参照 parent_agent_id」を 1 ケース追加し、深さ打ち切り (または visited-set) を
  **`domain` のグルーピング走査に**適用と明記。BE-012 に cycle fixture を加える。

### PO-M-003 [Medium] FR-007 / US-1 AC-6 (専用表示が Tool group / Reasoning 畳み込みと共存) に非 deferred な自動検証タスクが無い
- **Where**: spec.md L177-179 (FR-007) / L84-86 (AC-6); research R-06; tasks FE-023 (実装) / FE-029 (テストだが共存を明記せず); quickstart V-7 (人間 deferred)
- **Issue**: research R-06 は Vitest 回帰確認を宣言するが tasks では FE-029 のテスト範囲に「Tool group 内側での専用表示成立」の
  回帰テストが明示されない。唯一の検証が quickstart V-7 (人間 deferred)。FE-022/023 の tool-registry 差し込みで Tool group 畳み込みが
  回帰しても done 時点で検知されない。
- **Action**: FE-029 (または新規テスト) に「連続する専用表示を含む tool 列が 1 つの Tool group に畳まれ内部で各専用表示が成立」の
  Vitest を明示追加し、Tests 節に FR-007 の自動検証経路を記載。

### PO-L-001 [Low] 重複 / 曖昧な tool_use.id ↔ parent 対応が未定義
- **Where**: data-model §4; contracts/transcript-subagent.md C-1
- **Issue**: 同一 id を持つ Task が 2 つ / 親参照が複数 Task に一致する破損データのふるまいが未定義 (孤児・多段・並べ替え不変は定義済み)。
- **Action**: §4 に「id が一意でない/複数一致は最初の一致に attach するか孤児 fallback (二重 attach しない)」を追加、BE-012 に 1 ケース。
