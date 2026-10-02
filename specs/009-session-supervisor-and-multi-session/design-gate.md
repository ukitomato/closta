# Design Gate: supervisor 分離とマルチセッション (X-5) — Round 3

**Run**: 2026-10-01T00:00:00+09:00
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [gate-r2/design-gate.md](./gate-r2/design-gate.md) / [gate-r1/design-gate.md](./gate-r1/design-gate.md)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 1    | 4      | 6   |
| po-reviewer                | 0        | 1    | 4      | 3   |
| architecture-reviewer      | 0        | 1    | 4      | 2   |
| security-reviewer          | 0        | 1    | 1      | 4   |
| platform-boundary-reviewer | 0        | 0    | 3      | 1   |
| **Total (dedup)**          | **0**    | 4    | 11     | 12  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 5    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 4    |

viewpoint coverage: reviewer 4 トラックとも A-H 欠落なし。cascade_enforce による降格 0 件。High の推移: R1 16 → R2 5 → R3 4 (いずれも前 Round の解消策から派生した新規)。

**Status**: PASS (re-run on status=implementing。status は据置)
**Next**: Critical 0 のため gate は止めない。R3-H-01〜04 はいずれも plan / tasks の手修正で閉じられる (新たな利用者判断は不要)

## Critical (Total: 0)

なし。

## High (Total: 4, dedup)

| ID | 内容 | origin (元 ID) | prev | Where | Action (要旨) |
|---|---|---|---|---|---|
| R3-H-01 | 本番でも Ctrl+R / F5 の再読み込みが効き、1 回のキー操作で全セッションが確認なしに kill される (アプリはメニューを設定しておらず、Electron の既定メニューの accelerator が残る) | po H-001 | new (R2-H-03 の解消策から派生) | spec FR-014 / plan main/app 節・R-07 / window.ts:47 | 本番ビルドでは再読み込みの accelerator を無効にする (`Menu.setApplicationMenu(null)` か `before-input-event`)。残るのはクラッシュだけにする |
| R3-H-02 | `killAll` の検知契機 `did-start-navigation` と、既存の同一 origin 遷移の許可 (`will-navigate`) と会話由来 markdown の相対リンク許可の組み合わせで、リンク 1 クリックが全セッションの強制終了になる | sec H-001 | new (R2-H-03 の解消策から派生) | plan.md:222 / window.ts:70-83 / safe-url.ts:39 / markdown-text.tsx:153 | `will-navigate` は同一 origin を含め全遷移を拒否する (SPA)。検知契機は確定した文書の入れ替わり (`did-navigate` / `render-process-gone` / page epoch) にする。会話由来の相対 href の扱いを ui と決める |
| R3-H-03 | セッションスレッドが `ended` を送って正常終了したのに `child-exited` が未着のとき、`claudeAlive` を false にする経路が無い (launch のデコード失敗 / spawn 前の例外 / `launching` 中の kill / spawn 後の例外) — 枠が漏れ続け、行も終了済みにならない | analyze A1 | new (R2-H-05 の解消策から派生) | plan agents 節 L172-176 / spec FR-005 / tasks BE-008・BE-022 | Worker が終わり方を問わず終了した時点で、まだ生存なら回収 (pid 記録済み) / 回収不能の記録 (spawning のみ) のうえで false にする。`uncaughtException` の経路も子の exit を待つ |
| R3-H-04 | 終了・強制終了の処理中 (最大 3 秒) に composer が有効で、セッションスレッドは `done` で受けた送信を `running` に戻す (X-1 の dead-end の再発・run-state の巻き戻り・終了済みの行に停止が出る) | arch H-201 / po M-003 | new (R2-H-02 の解消策から派生) | plan agents 節 L185-186・renderer 節 L233-238 / run-state.ts:106 / spec FR-010 | セッションスレッドに `closing` を持たせ、kill / `end` の後の制御を無視する。renderer の composer 無効化とキュー終端を `ended || killed || ending` にする |

## Medium (Total: 11, dedup)

| ID | 内容 | origin |
|---|---|---|
| R3-M-01 | 即時の `claudeAlive: false` (`child-exited`・Worker 異常終了の合成) の扱いが FR-004 / SC-004 の「窓 1 つあたり 1 回」と両立せず、registry への反映が `acceptBatch` を迂回しうる。`supervisor-exited` の合成の registry 反映も未定義 | po M-001 / analyze A3 / arch M-202 |
| R3-M-02 | 一覧ラベルの導出で `ended` → 終了済みが `error` (失敗) を飲み込む | po M-002 |
| R3-M-03 | renderer 再読み込み時点で起動途中 (予約済み・`prepareLaunch` 待ち) の要求が `killAll` を逃れ、見えない枠を占める | sec M-001 |
| R3-M-04 | `reapable` の出所が未定義で、Worker 側の `killPid` 経路は `reapable` を見ない (WslRuntime 限定が調停役側で成り立たない) | pb M-001 |
| R3-M-05 | 項目 18 の対象が 2 ファイルの列挙で、本文を扱う `transport.ts` が漏れている (import 先の `protocol.ts` に `JSON.parse`) | pb M-002 |
| R3-M-06 | SH-000 (4) が素の `node` しか測らず、utilityProcess での `process.argv` の位置と asar 内の worker entry の `new Worker` が未測定 | pb M-003 |
| R3-M-07 | 「終了」が期限内に成功した / `done` 中に `claude` が自分で終わった / `wsl.exe` だけが異常終了した場合に Worker が `ended` を送るかが未定 (`threadAlive` が true のまま残る) | analyze A2 |
| R3-M-08 | SH-000 (2) の直送分岐で、標準入出力経路の本文の運び方と AD-030 §5 を守る形が未定 | analyze A4 / arch M-201 |
| R3-M-09 | worker のパスを必須の起動引数にすると Principle VII Statement / AD-010 の字面と食い違い、SH-092 の PATCH 区分も誤り (IX Good example も同様) | analyze A5 / arch M-203 / arch L-201 |
| R3-M-10 | 正常に起動して最初のプロンプトを待つセッションが `launching` のまま「起動中」と出て、強制終了しか選べない | arch M-204 |
| R3-M-11 | 今回の新規指摘を検出するテスト観点が無い | po M-004 |

## Low (Total: 12, dedup)

po L-001 (Assumptions の 5MB の残り) / po L-002 (再読み込み直後の窓・行の無い sessionId の状態通知) / po L-003・analyze A11 (`session-limit` 拒否時の入力保持のテスト) / sec L-001・pb L-001 (調停役の除外集合に親 pid) / sec L-002 (spec の残余記述の範囲) / sec L-003 (port 待避の「未要求」の判定時点) / sec L-004 (`endSession` の負例) / analyze A6 (false にする主体の用語) / analyze A7 (BE-022 の「5MB 相当の本文」) / analyze A8 (`end` の遷移の書き方) / analyze A9 (registry のエントリを消す契機) / analyze A10 (E2E 用 fake 接続の作成タスク) / arch L-202 (Confirmation の追記形式)

## Dedup log

R3-H-04 ← arch-H-201, po-M-003 (key: FR-010 / plan.md:236) / R3-M-01 ← po-M-001, analyze-A3, arch-M-202 (key: SC-004) / R3-M-08 ← analyze-A4, arch-M-201 (key: plan.md:190) / R3-M-09 ← analyze-A5, arch-M-203, arch-L-201 (key: Principle VII) / Low: po-L-003 + analyze-A11 (key: US-1 AC2) / sec-L-001 + pb-L-001 (key: plan.md:173)

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
