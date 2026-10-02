# Design Gate: supervisor 分離とマルチセッション (X-5) — Round 2

**Run**: 2026-10-01T00:00:00+09:00
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [gate-r1/design-gate.md](./gate-r1/design-gate.md)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 2    | 10     | 9   |
| po-reviewer                | 0        | 2    | 4      | 2   |
| architecture-reviewer      | 0        | 2    | 4      | 2   |
| security-reviewer          | 0        | 0    | 4      | 1   |
| platform-boundary-reviewer | 0        | 1    | 3      | 2   |
| **Total (dedup)**          | **0**    | 5    | 18     | 14  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 15   |
| Unresolved from prev | 0        | 0 (DG-H-03 / DG-H-08 の残りは Medium に降格して継続) |
| New in this run      | 0        | 5    |

viewpoint coverage: reviewer 4 トラックとも A-H 欠落なし。cascade_enforce による降格 0 件。

**Status**: PASS (re-run on status=implementing。status は据置)
**Next**: Critical 0 のため gate は止めない。ただし R2-H-01 と R2-H-04 は、未解消のまま AD-043 を accepted にすると accepted ADR とのずれ / 誤 kill の窓になる (architecture・analyze の付記)。SH-001 の起票前に解消を推奨する

## Critical (Total: 0)

なし。

## High (Total: 5, dedup)

| ID | 内容 | origin (元 ID) | prev | Where | Action (要旨) |
|---|---|---|---|---|---|
| R2-H-01 | supervisor-core が transport の経路種別を見て本文の出口を分岐する。AD-030 §5「本体は経路を知らない」と食い違い、AD-043 の読み替え対象にも無い | arch H-101 / analyze N1 | new (DG-H-11 の修正から派生) | plan agents 節 L157・L177 / spec FR-001・FR-015 / tasks BE-003 | 分岐を transport の内側に戻す (`openBodySink(ports): BodySink \| null`)。または AD-043 で AD-030 §5 を読み替える |
| R2-H-02 | `done` の二義性が renderer に残る。応答待ちと `claude` 終了済みが一覧で同じに見え、終了後も composer が有効 (送れば拒否される dead-end)、送信待ちキューの扱いが未定義。「終了」を出す条件に `claudeAlive` が無い | po H-001 / arch H-102 / analyze N8(b) | new | spec FR-009・FR-010・FR-011 / plan renderer 節 / SessionScreen.tsx:140,165 | `ended = claudeAlive === false` を store で導出し、一覧ラベル・composer 無効化・キューの cancelled・終了ボタンの条件に使う |
| R2-H-03 | renderer の再読み込み / クラッシュで store と port が消えても、セッションは supervisor に残って枠を占め続ける (見えない枠で `session-limit`) | po H-002 | new | spec FR-008・FR-014・Edge Cases / tasks BE-020・BE-021 | main が renderer の再読み込み・`render-process-gone` を検知したら全セッションを kill する (最小案) |
| R2-H-04 | pid kill の本人確認に照合データの出所が無い。調停役スレッドの `killPid` 経路には pid 検証も本人確認も無い。WslRuntime 専用の限定が型に無い | pb H-001 / sec M-001・M-004 / analyze N6 | new (DG-H-08 の解消策の中に生じた穴) | plan agents 節 L164・L171 / main/infra 節 L187 / ADR Decision 5 / tasks BE-022・BE-023 | 共通の pid 受理述語を domain に置き両経路で使う。本人確認の手段を SH-000 (3) で決め、無ければ残余として AD-043 に書く。`reapable` を registry に持つ |
| R2-H-05 | Worker 終了時の判定「終端に達していなければ」が未定義。`done` を終端と読むと `done` 中のスレッド異常終了で `error` が出ず、読まないと kill 後の正常終了が `process-crashed` になる | analyze N2 | new (DG-H-02 の修正から派生) | plan agents 節 L164 / run-state.ts:23 | 条件を「`ended` を受け取ったか」で書く。BE-022 に両方向の単体 |

## Medium (Total: 18, dedup)

| ID | 内容 | origin |
|---|---|---|
| R2-M-01 | SC-003 の「5MB」は本番では renderer に届かない (part 上限 200KB、tool_result は live 表示しない)。FR-002 の「1 メッセージで有界」も事実と少しずれる | po M-001 / analyze N7 |
| R2-M-02 | 「終了」が期限切れで強制終了に落ちたことが示されない。終了中の二度押しも未定義 | po M-002 |
| R2-M-03 | `launching` のまま進まないセッションに取れる操作が無い。`idle` の扱いが spec と plan で食い違う | po M-003 / analyze N8(a)(c) |
| R2-M-04 | renderer の port 受け渡しの待避が 1 枠で、並行起動で上書きされる。閉じた後の遅延 port の扱いも無い | sec M-002 |
| R2-M-05 | Worker に `resourceLimits` が無く、1 セッションの OOM が全セッションに及ぶ | sec M-003 |
| R2-M-06 | 項目 19 の正規表現が plan 自身の `process.kill` 参照渡しを捕捉しない。項目 18 / 20 も等価な形を取りこぼす | pb M-001 |
| R2-M-07 | Worker→調停役の状態通知などのデコード位置が未定義で、項目 18 と「payload は string」の検査が両立しない | pb M-002 |
| R2-M-08 | SC-009 にビルド出力 (`electron` の require 0 件) の検査が無い | pb M-003 |
| R2-M-09 | Principle IX の Good example からの逸脱の扱いと、SH-000 (2) 直送時の本文の形が未定 | arch M-101 / analyze L5 |
| R2-M-10 | AD-043 の Decision 2 / 5 が条件分岐のまま accepted になる。Confirmation の時点もずれる | arch M-102 / analyze L9 |
| R2-M-11 | 状態通知の受信規則が launch-service と relay に分かれ、relay に単調性の検査が無い | arch M-103 |
| R2-M-12 | 2 ペイン化が Principle VIII の基準画像 E2E と位置指定の起動補助に波及するのに、SH-011 で名指しされていない | arch M-104 |
| R2-M-13 | spawn 前の状態通知の `claudeAlive` の値が未定 (false にすると DG-H-03 が再発) | analyze N3 |
| R2-M-14 | spawn 後のスレッド異常終了で `claudeAlive:false` にする経路が FR-005 の 3 条件に無い | analyze N4 |
| R2-M-15 | `threadAlive` の更新元が無い (スレッド終了を main に伝える通知が無い) | analyze N5 |
| R2-M-16 | 送信方向の宛先解決のテストが無い。BE-011 の記述が自己矛盾 | analyze N9 |
| R2-M-17 | `wsl.exe` だけの異常終了のテストが無い / 新規指摘を検出するテスト (ラベル・送信不可・強制終了への落ち込み・launching の操作・renderer 再読み込み) が無い | analyze N10 / po M-004 |
| R2-M-18 | glossary 追随の漏れ (`SessionControl` の `end` / `SessionEvent` の経路 / plan #7 の `launch`)、空状態の条件の曖昧さ | analyze N11・N12 |

## Low (Total: 14, dedup)

analyze L1 (申し送り #9 の task ID) / L2 (SH-003・SH-004 のタグ) / L3 (SC-003 の相互参照) / L4 (AD-023 §3 の例示) / L6 (SH-011 の順序) / L7 (起動設定スナップショットのテスト) / L8 (「終了」の多義) / po L-001 (閉じた後の選択の移り先) / po L-002 (枠の残り数の表示) / arch L-101 (`stdio: 'ignore'` の理由) / arch L-102・analyze L5 (単独起動の字面) / sec L-001 (直送分岐の port inbound 検査) / pb L-001 (spawn 直後の窓) / pb L-002 (スレッド異常終了の誘発手段)

## Dedup log

R2-H-01 ← arch-H-101, analyze-N1 (key: plan.md:157 / AD-030 §5) / R2-H-02 ← po-H-001, arch-H-102, analyze-N8b (key: FR-009・FR-011) / R2-H-04 ← pb-H-001, sec-M-001, sec-M-004, analyze-N6 (key: plan.md:164・:187) / R2-M-01 ← po-M-001, analyze-N7 (key: SC-003) / R2-M-03 ← po-M-003, analyze-N8a・c (key: FR-011) / R2-M-09 ← arch-M-101, analyze-L5 (key: Principle IX) / R2-M-10 ← arch-M-102, analyze-L9 (key: plan ADR 節) / R2-M-17 ← analyze-N10, po-M-004 (key: tests) / R2-M-18 ← analyze-N11, analyze-N12 (key: FR-016)

## Track raw outputs

<details>
<summary>analyze</summary>

[analyze.md](./analyze.md)
</details>

<details>
<summary>po-reviewer</summary>

[po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
</details>

<details>
<summary>architecture-reviewer</summary>

[architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
</details>

<details>
<summary>security-reviewer</summary>

[security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
</details>

<details>
<summary>platform-boundary-reviewer</summary>

[platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
</details>
