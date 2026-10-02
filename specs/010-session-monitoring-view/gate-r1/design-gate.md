# Design Gate: セッション監視ビュー (O-1)

**Run**: 2026-10-02T15:00:00+09:00
**Spec**: specs/010-session-monitoring-view/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 1    | 7      | 10  |
| po-reviewer                | 0        | 3    | 6      | 2   |
| architecture-reviewer      | 0        | 3    | 4      | 6   |
| security-reviewer          | 0        | 0    | 3      | 6   |
| platform-boundary-reviewer | 0        | 1    | 5      | 3   |
| **Total (dedup)**          | **0**    | 7    | 15     | 19  |

viewpoint coverage: 4 reviewer とも A〜H 欠落なし。cascade_enforce による降格: 0 件 (Critical の申告なし)。

**Status**: PASS
**Next**: status: tasking → implementing 昇格、/cl-implement 起動可能。**ただし High 7 件は実装前に spec / plan / tasks へ反映することを推奨する** (うち H-03 / H-04 / H-05 は利用者の判断を要する)

## Critical (Total: 0)

なし。

## High (Total: 7, dedup 後)

### H-01 — 直近の活動の間引きをフックで行う設計では、行の再描画が減らない [origin: analyze C1 / architecture H-003] [new]

- **Where**: research.md R-03 / plan.md renderer 一覧節 / tasks.md FE-011・FE-012 / spec FR-006・FR-010・SC-006
- **Issue**: `useThrottledValue` は行のコンポーネントの中で動くため、表示値を遅らせるだけで、末尾メッセージ (upsert のたびに参照が変わる) の購読による再描画は 200 回/秒のまま残る。SC-006 を設計の段階で満たせない
- **Action**: 間引きを購読の手前に置く (ストアに `activity: Record<sessionId, string|null>` を持ち、セッションごとに 500ms で trailing 付きで書き込み、行は文字列 1 つだけを選ぶ)。FE-012 は行の描画回数で上限を測る

### H-02 — 新設の `perf/` が AD-038 D2 の分離規則 (実名リスト) の外にある [origin: architecture H-002 / analyze I2 / platform-boundary M-003] [new]

- **Where**: plan.md「機械強制の変更」 / tasks.md SH-032・SH-092 / eslint.config.mjs:172-179 / .dependency-cruiser.js:140-141 / allowlists.mjs:12 / e2e/tsconfig.json
- **Issue**: plan は「機械強制は変更しない」とするが、`perf/**` と `playwright.perf.config.ts` は eslint の ignores・depcruise `not-to-test`・check.mjs の `SCAN_ROOTS`・E2E の型検査のいずれにも入らない
- **Action**: eslint の ignores、`not-to-test` の prefix (`perf`)、型検査の方式を機械強制の表とタスクに足す。`SCAN_ROOTS` に入れない場合は死角として明記し AD-038 D4 の roadmap 項目に併記する

### H-03 — FR-011 の「強調込みの E2E」は main 側の stub を変えないと作れず、FR-010 / SC-006 (main 差分 0) と両立しない [origin: platform-boundary H-001 / analyze G1 / po M-006] [new] — **利用者の判断が要る**

- **Where**: spec FR-010・FR-011・SC-004・SC-006 / tasks.md SH-031 / src/main/app/e2e-capability.ts
- **Issue**: E2E stub は text のメッセージしか流さず、承認待ち・失敗・tool の分岐が負荷の中に現れない。SH-031 は強調を黙って落としている
- **Action**: (1) FR-011 / SC-004 から強調を外し component テストと実機計測で見る、または (2) E2E stub (`e2e-capability.ts`) の拡張を許し、SC-006 を「本番の composition・IPC・preload・supervisor の差分 0。E2E stub は除く」に書き直す

### H-04 — セッション画面以外を開いている間は、承認待ちと失敗が見えず通知もされない [origin: po H-001] [new] — **利用者の判断が要る**

- **Where**: spec US-1 / Out of Scope / src/renderer/src/App.tsx:22-30 (7 画面のうち一覧は `launch` だけ)
- **Issue**: 強調・件数・live region がサイドバーの中にしかなく、R-2 の一覧や過去ログを開いている間は承認待ちを見逃す
- **Action**: (a) グローバルのヘッダの nav に承認待ちの件数を出し、live region を App の寿命に置く (renderer 内で閉じる) か、(b) 「セッション画面以外では通知しない」を Out of Scope に明記する

### H-05 — 既定の comfortable では 10 行が収まらず、画面外の失敗の行を見逃す [origin: po H-002] [new] — **利用者の判断が要る**

- **Where**: spec FR-002・FR-009・SC-001 / research.md R-06
- **Issue**: 失敗は件数に含めない [ASSUMED] ため、スクロールした先の失敗に手掛かりが無い
- **Action**: (a) 見出しに失敗の有無も出す、(b) 既定を compact にする、(c) 画面外の強調行の印を出す、のいずれか

### H-06 — 実機計測に「その回が有効か」の条件と、実アプリで動いたことの保証が無い [origin: po H-003 / analyze I3・I4 / platform-boundary M-001] [new]

- **Where**: spec FR-012・SC-005・US-4 AC2 / research.md R-07 / tasks.md SH-032 / quickstart V-3
- **Issue**: 10 本が窓の全期間で応答中か・メッセージ数の下限・窓の中での失敗が無効条件に入っていない。「長い応答」の表現が R-07 (メッセージ数で負荷を作る) と食い違う。`CLOSTA_E2E` が環境に残ると stub で走り偽の値が記録されうる
- **Action**: SC-005 / FR-012 に有効な回の条件 (窓の全期間で 10 本が応答中、承認待ち・応答待ち 0、窓の中のメッセージ数 N 件以上 [ASSUMED]) を足す。perf の起動で `CLOSTA_E2E` を削除し、本物の composition であることを assert する

### H-07 — ui charter の「情報密度の切替」と Journey 4 を本 feature が再定義しているが、ui charter の追随が無い [origin: architecture H-001] [new]

- **Where**: docs/domains/ui/charter.md:42, :102-105 / spec FR-013 / tasks.md SH-090 / plan 申し送り表
- **Issue**: ui charter は「監視 = compact、没入 = comfortable」を画面の性質として定義している。USER 決定 (サイドバー拡張のみ) と文面が食い違ったまま残る
- **Action**: SH-090 に ui charter の Scope / Journey 4 の改訂 (一覧の行の密度は O-1、transcript の密度は O-2) と session charter Journey 3 の注記を足し、申し送り表に ui charter の行を足す

## Medium (Total: 15, dedup 後)

| ID | origin | 要旨 |
|---|---|---|
| M-01 | po M-005 / architecture M-003 / analyze I1 / po L-002 | 直近の活動の本文分岐: spec「先頭 1 行」と data-model「最後の text part を畳んで 80 文字・末尾が user なら null」が食い違う |
| M-02 | architecture M-001 / platform-boundary M-004 / architecture L-006 / analyze G3 | `slotUsage` が domain の `countOccupying` を使わず再実装。起動要求中の予約 (+1) も数えない |
| M-03 | po M-004 / analyze U1 | 同じバッチで複数が承認待ちに入ったとき・同じ文が続くときの live region の扱いが未定義 |
| M-04 | po M-001 / analyze U2 | 件数ボタンの移動先の規則 (表示中が列に無い / 列にある) が FR-002 の「早い順」と矛盾・未定義 |
| M-05 | po M-002 | 承認待ちが表示中の 1 本だけのとき、件数ボタンが押せるのに何も起きない |
| M-06 | po M-003 / architecture L-003 | 上限時の案内が「応答待ちを終了」に限られ、X-5 の `session-limit` 文言 (正本) より狭い |
| M-07 | architecture M-002 | Hook / Background task の状態管理の持ち主が空く。`_overview.md` と ui charter に反映が無い |
| M-08 | architecture M-004 | Principle VIII: compact 1 行の全角レイアウト (横あふれ・ボタンの押し出し) の検証経路が無い |
| M-09 | platform-boundary M-005 | compact の行の項目を固定し、isolation charter の隔離バッジの置き場が無い |
| M-10 | security M-001 | perf の出力・Playwright 成果物・quickstart-results に会話本文が混ざる経路を設定で塞いでいない |
| M-11 | security M-002 / platform-boundary L-001 | perf の実行 guard が無い (CI・`CLOSTA_E2E`・agent の自律実行) |
| M-12 | platform-boundary M-002 | perf の後始末 (全セッション停止・timeout・WSL 内 `claude` の残留確認・承認カードに応答しない) が無い |
| M-13 | security M-003 | `toActivityLine` が非文字列入力を想定しない (renderer の decoder は part のフィールドを検証しない) |
| M-14 | analyze I5 | FR-002 の「FR-004 と同じ」は FR-005 の誤り |
| M-15 | analyze K1 | SH-001 (glossary) に `[P]` が付き、Principle XIV の「コード投入前」と順序が矛盾 |

## Low (Total: 19, dedup 後)

- security L-001 (会話由来の文字列と状態文言の見分け。前置きを付ける) / L-002 (live region に会話由来の文字列を入れないことを spec とテストで固定) / L-003 (tool 入力の先頭に秘密が出うる。O-2 へ申し送り) / L-004 (perf は `app.evaluate` を使わない・`finally` で close) / L-005 (`react/no-danger` の機械強制。system scope) / L-006 (セキュリティ主張のテスト観点の不足)
- architecture L-001 (共有 element に session の語彙 `data-attention` を持ち込む) / L-002 (handshake 前の状態通知で `statusSince` がずれる) / L-004 (新用語の英語見出しと識別子の対応。「没入ビュー」を含む。analyze T3 を統合) / L-005 (perf の環境変数を discovery に)
- platform-boundary L-002 (実機計測が WSL 内に transcript を残すことを手順に書く) / L-003 (SC-006 に preload・domain を明記し差分を機械確認。analyze G2 を統合)
- analyze K2 (Principle XV の名前の誤り) / A1 (AD-043 Decision 4 と X-5 FR-004 の併記) / T1 (「表示中のメッセージ配列」の語) / T2 (plan のリスク ID と research の ID の衝突) / U3 (FR-012「1 度」と SC-005「3 回」) / Q1 (チェックリストの例外語の列挙)
- po L-001 (US-4 が P2 のまま。削らないと明記)

## Dedup log

| merged | key |
|---|---|
| analyze C1 + architecture H-003 | FR-006 / SC-006 (間引きの位置) |
| architecture H-002 + analyze I2 + platform-boundary M-003 | `perf/` の機械強制 (AD-038 D2) |
| platform-boundary H-001 + analyze G1 + po M-006 | FR-011 / SC-004 |
| po H-003 + analyze I3 + analyze I4 + platform-boundary M-001 | FR-012 / SC-005 |
| po M-005 + architecture M-003 + analyze I1 + po L-002 | FR-006 (本文分岐) |
| architecture M-001 + platform-boundary M-004 + architecture L-006 + analyze G3 | FR-007 (`slotUsage`) |
| po M-004 + analyze U1 | FR-004 |
| po M-001 + analyze U2 | FR-002 |
| po M-003 + architecture L-003 | FR-007 (上限時の案内) |
| security M-002 + platform-boundary L-001 | FR-012 (perf の guard) |
| architecture L-004 + analyze T3 | Principle XIV |
| platform-boundary L-003 + analyze G2 | SC-006 |

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
