# Design Gate: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 7    | 11     | 10  |
| po-reviewer                | 0        | 2    | 6      | 2   |
| architecture-reviewer      | 0        | 7    | 8      | 3   |
| security-reviewer          | 0        | 2    | 6      | 4   |
| platform-boundary-reviewer | 0        | 2    | 6      | 3   |
| **Total (dedup)**          | **0**    | 16   | 17     | 14  |

viewpoint coverage: reviewer 4 トラックとも A-H 欠落なし。cascade_enforce による降格 0 件。前回 gate なし (初回)。

**Status**: PASS
**Next**: status: tasking → implementing 昇格。`/cl-implement` 起動可能。ただし下記 High 16 件は gate を止めないが、実装前の解消を推奨する (特に DG-H-06 は未解決のまま AD-043 を accepted にすると Critical 相当の ADR drift になる — architecture-reviewer の付記)

## Critical (Total: 0)

なし。

## High (Total: 16, dedup)

| ID | 内容 | origin (元 ID) | Where | Action (要旨) |
|---|---|---|---|---|
| DG-H-01 | 状態の要約のフィールドが spec (3 つ) と plan (`claudeAlive` を含む 4 つ) で食い違う | analyze I1 / po M-001 / arch M-001 | spec FR-004・Key Entities / plan domain 節 | spec に `claudeAlive` を足す |
| DG-H-02 | 「終端」の定義が FR-004 (`error`/`done`)・plan の畳み込み・`TERMINAL_STATES` で食い違う | analyze I2 / po M-002 / arch M-002 | spec FR-004 / plan L131 / run-state.ts:23 | 終端を `error` と `claudeAlive:false` に改め、`done` を外す |
| DG-H-03 | registry 登録時の `claudeAlive` 初期値が未定で、launching 中に枠が空きうる | analyze U1 / arch M-003 | spec FR-005 / plan main/app 節 | 登録時 true、false は終了通知のみ。launching 中の 11 本目拒否テスト |
| DG-H-04 | FR-002「調停役は deserialize しない」が文字列中継と両立しない | analyze I3 / arch H-004 / pb M-001 | spec FR-002・SC-002 / plan agents 節 | 「JSON として解釈しない (文字列コピーは許容。上限は BODY_MAX_BYTES)」に改める |
| DG-H-05 | 「check.mjs の Principle IX 検査に JSON.parse 0 件を加える」— IX 項目は存在せず、制御行の decode と衝突し、置き場検査の盲点を再生産する | analyze I4・K2 / arch H-003 / pb M-001 / sec M-001 | plan 機械強制表 / tasks SH-010・BE-013 | 制御行 decoder を protocol 側に置き、本文は不透明型で縛る。新項目 18 + fixture。Constitution IX の現状の制約を PATCH |
| DG-H-06 | AD-043 を design-gate 通過で accepted にすると、SH-000 (成立性 spike) の結果による書き直し (R-01) と両立しない | analyze I5 / arch H-002 | plan ADR 節・R-01 / tasks SH-000・SH-001 | accepted 化を SH-000 の後に置く (または R-01 時は後続 ADR で supersede) |
| DG-H-07 | AD-043 の読み替え対象に AD-023 §1 (寿命) と AD-036 §3 (kill ハンドルの所有) が無い。AD-023 §6 の 3 根拠のうち 1 つしか扱っていない | arch H-001 / pb H-001(4) / analyze I6 | spec FR-015 / plan ADR 節 | 読み替え一覧に追加。クラッシュ隔離を失う代償を Consequences に |
| DG-H-08 | `reap.ts` の `process.kill(pid)` — pid を検証せず本人確認もせず、再利用の窓がある。「既存規則の範囲内」は誤り (pid kill を縛る規則は無い) | sec H-001 / pb H-001 | plan main/infra 節・機械強制表 / tasks BE-022 | `spawned` の検証、即時の child-exited 通知、本人確認、check.mjs に pid kill の許可リスト項目。SH-000(3) 次第で作らない選択肢 |
| DG-H-09 | worker 由来メッセージの sessionId を送信元 worker で束縛する規則と、supervisor の世代照合・`claudeAlive` の単調性が無い | sec H-002 / pb M-004 | plan agents・main/app 節 / tasks BE-004・BE-020 | 宛先表で sessionId を付与、世代番号、true→false のみ |
| DG-H-10 | worker 異常終了で `claudeAlive:false` を合成するが `wsl.exe` を誰も kill しない。未 spawn のデコード失敗は枠を返さない | pb H-002 / po M-003(一部) | plan L145・L152 / spec SC-008 | crash 時に pid 回収、未 spawn は ended→terminate、SC-008 にスレッド異常終了を追加 |
| DG-H-11 | 本文を port に流すか行に埋めるかの判定基準が無く、port の無い launch で本文が main を通る | arch H-005 | plan agents 節 L143 | 行埋めは stdio 経路のみ、port 無し launch は拒否、判定は transport の経路種別 |
| DG-H-12 | X-1 の「unmount で kill」(孤児防止) の移し先が無く、FR-008 と衝突する | arch H-006 | plan renderer 節 / useLiveSession.ts:187-196 | unmount→kill を撤去し寿命を store + dispose に一本化、回帰テスト |
| DG-H-13 | E2E の stub は main 内で単一セッション不変を複製しており、supervisor・semaphore を通らない。差し込み口の本番無効化の保証も無い | arch H-007 / pb M-006 / sec M-004 / analyze U3 | e2e-capability.ts:240-306 / tasks BE-008・SH-020・FE-020・BE-012 | 本物の launch-service + fake spawner、または計測範囲を明記。fake は別 entry + 二重ゲート |
| DG-H-14 | 応答待ち `done` は上限に数えるのに、枠を空ける穏当な操作が無い (中断では空かず、強制終了は破損警告付き) | po H-001 / analyze I8 | spec FR-005・FR-011・US-1 AC2 | 穏当な「終了」を足す、または最低限の明記 |
| DG-H-15 | SC-003 の負荷条件 (「高頻度」「数 MB」) と入力遅延の起点・終点が数値で決まっていない | po H-002 | spec SC-003 / plan L190 / tasks FE-020 | 負荷 (events/s・バイト数・tool_result サイズ) と計測点を定義 |
| DG-H-16 | SC-009 の計測経路「check:constitution の Principle VII 項目」は存在しない (正本は eslint + depcruise) | analyze K1 | spec SC-009 | lint + depcruise + 単独起動 Vitest に直す |

## Medium (Total: 17, dedup)

| ID | 内容 | origin |
|---|---|---|
| DG-M-01 | requestId の負例テストを main の IPC 単体に置いているが main は requestId を知らない | analyze I7 / sec M-006 / arch M-008 |
| DG-M-02 | before-quit 非同期化: 登録先は index.ts、再入ガード・全体期限・`dispose` 型変更の波及 (composition-root / e2e-capability) が無い | sec M-005 / arch M-007 / pb L-002 / po L-002 |
| DG-M-03 | 複数セッションの資格情報が 1 プロセスに同居する前提の規則 (Worker の env 未指定・SHARE_ENV 禁止・spec を保持しない) が無い | sec M-002 / analyze S1 |
| DG-M-04 | 新経路での例外・破棄値のログ非混入と fork の `stdio: 'ignore'` 維持が書かれていない | sec M-003 |
| DG-M-05 | 単独起動 entry と worker パスの解決方法 (ハッシュ名・`?modulePath`) が未確定 | pb M-002 |
| DG-M-06 | `reapProcesses` はランタイム非依存の顔をしているが WslRuntime でしか成立しない (AD-003) | pb M-003 |
| DG-M-07 | stdio 経路で `transport.onClosed` の扱いが無く、親が消えても worker と子が残る | pb M-005 |
| DG-M-08 | 合成規則と pid 回収を Service に直接書く設計 (AD-023 §5) | arch M-004 |
| DG-M-09 | 「状態の要約」「稼働中セッション一覧」が既存の SessionSummary / セッション一覧と衝突 | arch M-005 / analyze T2 |
| DG-M-10 | 一覧の element 選定 (ThreadList) を plan が先取りしている | arch M-006 |
| DG-M-11 | 起動・終了・再起動の競合 (quit 中の起動要求・二重 fork・初回要約前の supervisor 落ち) と fork 失敗時の枠解放が無い | po M-004 / analyze U2 |
| DG-M-12 | AC に対応するテストの欠落 (承認待ちの独立性・port close 後の保持・同一フォルダ警告・port inbound の無視・wsl.exe 異常終了) | po M-005 / analyze C1・C2・C4 / sec L-004 |
| DG-M-13 | supervisor 異常終了の原因を追う観測点 (exit code・稼働数・回収失敗数のログ) が無い | po M-006 |
| DG-M-14 | 終了済みセッションの蓄積と `error` 後の Worker 残留に上限が無い (R-05 の記述は誤り) | po M-003 |
| DG-M-15 | glossary 追随の漏れ (AgentSession / SessionEvent / FailureReason の件数) | analyze T1 |
| DG-M-16 | FR-015「許可リストの付け替え」と plan「名前を維持」の文言不一致 | analyze I9 |
| DG-M-17 | 調停役スレッドの受信行 decode の置き場と検証が未規定 | sec M-001 (DG-H-05 と同根だが decoder 新設の作業として残す) |

## Low (Total: 14, dedup)

analyze C3 (要約の全フィールド走査タスク) / analyze U4・sec L-002 (stdio envelope は JSON.stringify で組む) / analyze U5・pb L-001 (同一フォルダ警告の照合キー) / analyze T3 (スレッドの呼び名の揺れ) / analyze T4・arch L-002 (charter の追随範囲) / analyze O1 (eslint 許可の先行) / analyze K3 (Constitution Check の欠行) / analyze L1 (checklist の [ASSUMED] 件数) / analyze L2 (spec Dependencies に AD-030) / arch L-001 (単一セッション前提のコメント 15 ファイル) / arch L-003 (合成要約の窓外送信) / sec L-001 (renderer の本文 decoder) / sec L-003 (requestId を UUID 述語に) / pb L-003 (agents の標準モジュール禁止が import 層だけ。scope: system) / po L-001 (同一フォルダの行の見分け)

## Dedup log

DG-H-01 ← analyze-I1, po-M-001, arch-M-001 (key: FR-004) / DG-H-02 ← analyze-I2, po-M-002, arch-M-002 (key: FR-004) / DG-H-03 ← analyze-U1, arch-M-003 (key: FR-005) / DG-H-04 ← analyze-I3, arch-H-004, pb-M-001 (key: FR-002) / DG-H-05 ← analyze-I4, analyze-K2, arch-H-003, pb-M-001, sec-M-001 (key: SC-002 / Principle IX) / DG-H-06 ← analyze-I5, arch-H-002 (key: plan.md:194) / DG-H-07 ← arch-H-001, analyze-I6 (key: FR-015) / DG-H-08 ← sec-H-001, pb-H-001 (key: plan.md:159) / DG-H-09 ← sec-H-002, pb-M-004 (key: plan.md:167) / DG-H-10 ← pb-H-002, po-M-003 (key: plan.md:145) / DG-H-13 ← arch-H-007, pb-M-006, sec-M-004, analyze-U3 (key: e2e-capability.ts) / DG-H-14 ← po-H-001, analyze-I8 (key: FR-011) / DG-M-01 ← analyze-I7, sec-M-006, arch-M-008 (key: SC-005) / DG-M-02 ← sec-M-005, arch-M-007, pb-L-002, po-L-002 (key: FR-014) / DG-M-03 ← sec-M-002, analyze-S1 (key: Principle V) / DG-M-09 ← arch-M-005, analyze-T2 / DG-M-11 ← po-M-004, analyze-U2 / DG-M-12 ← po-M-005, analyze-C1, analyze-C2, analyze-C4, sec-L-004

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
