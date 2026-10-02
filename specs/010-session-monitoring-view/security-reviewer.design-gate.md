# security-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-02
**Reviewer**: security-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004 / SC-001: 強調、件数 (一覧の見出しとナビ)、App の寿命の live region を確認した。FR-004 (spec.md:160) で、通知の文から会話由来の文字列を除くことが固定された
  - FR-005〜FR-007 / SC-002: 直近の活動 (会話由来の文字列) の正規化と表示の境界を確認した。data-model §2 の `deriveActivity` / `toActivityLine` が対象
  - FR-008 / FR-009 / SC-003: compact の行では、`title` と `aria-describedby` に会話由来の文字列が入る
  - FR-010 / SC-006: main・preload・agents・domain の差分が 0 件であること (quickstart V-5 / SH-092)
  - FR-011 / SC-004: E2E stub は変えない
  - FR-012 / SC-005: 実機計測 (perf/) の安全柵・成果物・CI 境界・agent の実行の線引き
  - FR-013: discovery.md に実機計測の行を足す (agent 用の列の扱い)
- touched files に該当する charter / Confirmation:
  - session charter (Principle V: 資格情報を持たない)
  - AD-038 D3 / Confirmation:113-115 (CI に実資格情報が 0 件。stub は `!app.isPackaged && CLOSTA_E2E` の場合だけ)
  - AD-038 D5 / Confirmation:119 (基準画像に会話由来の情報を含めない。SH-091)
  - AD-043 Decision 2 (renderer は受け取った本文の形を検証する)、Decision 4 (状態通知に会話由来の文字列を載せない)
  - AD-034 (本文は main を通らない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。セキュリティに関わる ADR (AD-038 D3・D5 / AD-043 D2・D4 / AD-034) と plan の決定の食い違いは見つからなかった (スコープ要約を参照)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux は optional reviewer の担当 (本 reviewer は live region に入る文字列の出どころだけを見た)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R1 の後の改訂で、本 reviewer の R1 指摘 9 件 (M-001〜M-003 / L-001〜L-006) は、文面上すべて設計とタスクに反映されている。

**直近の活動の表示境界**
- `toActivityLine` は入力を `unknown` で受け、非文字列を `''` に倒す (data-model.md:33-35)。
- LF・CR・U+2028・U+2029 を行の区切りとし、行ごとに domain の `sanitizeBody` を再利用して双方向制御文字と C0 / C1 を除く (data-model.md:36-37)。
- 80 コードポイントで切り、サロゲートペアを割らない。描画は React のテキストノードだけで行う (data-model.md:38-40)。
- 固定の前置きを付け、会話由来の部分は状態の文言とは別の要素に置く (spec.md:173, data-model.md:42, plan.md:148)。
- XSS の回帰は FE-012 (tasks.md:60) で見る。正規化は SH-003 (tasks.md:16) の非文字列・U+202E・U+2028・サロゲートの観点で見る。

**live region とナビの件数**
- live region の文は、作業フォルダの表示名と固定の文言だけで組む。spec FR-004 (spec.md:160)・SC-001 (spec.md:239) で固定され、`announcements` は会話由来の値を引数に取らない (data-model.md:68)。
- FE-003 (tasks.md:46) が、tool 名・入力・本文の文字列が textContent に含まれないことを assert する。
- ナビの件数は数値と固定の accessible name だけである (research.md:67)。
- 会話由来の文字列が live region・ナビに入る経路は、設計の文面には無い。

**実機計測 (perf/)**
- 安全柵: config は `CI` で例外を投げる (plan.md:182)。spec は `CI` / `CLOSTA_E2E` / 必須 env の未設定で失敗して止まり、起動の env から `CLOSTA_E2E` を除き、本物の composition であることを確かめる (research.md:50, tasks.md:84)。
- 成果物: trace・screenshot・video は off、reporter は list、outputDir は gitignore 済みの場所。判定は `data-*` 属性で行う (research.md:51)。
- 記録: quickstart-results に写す項目を許可リストに限る (tasks.md:90, quickstart.md:32)。作業フォルダは秘密を含まない使い捨てのリポジトリとする (quickstart.md:8)。
- agent の実行: 利用者の明示的な指示があるときに限る (spec.md:201, plan.md:168, tasks.md:90)。
- `app.evaluate` を使わず、`finally` で close する (research.md:49, :54)。
- 結論: AD-038 D3 の CI 境界は保たれている。

**残る指摘**は次の 2 系統で、どちらも Low である。
- `toActivityLine` / `deriveActivity` の処理量の上界と、文字列連結の手前に残る型の穴 (L-007 / L-008)
- Playwright の失敗時の call log に要素の HTML の抜粋が出る経路 (L-009)

**owner 外への申し送り**: 実機計測で使う「既定の権限モード」と、承認カードに応答しないこと (権限ゲート) は、platform-boundary-reviewer (PB-4) の担当とする。

## R1 指摘の解消状況

| R1 ID | 状態 | 解消の根拠 |
|---|---|---|
| M-001 (perf の出力と成果物に本文が混ざる) | resolved from prev | research.md:51 (trace / screenshot / video off・reporter list・outputDir は gitignore 済み・`data-*` で判定)、tasks.md:85, :90 (許可リスト)、quickstart.md:8, :32。ただし残余は L-009 (new) |
| M-002 (CI・stub・agent の guard) | resolved from prev | plan.md:182 (config は CI で例外)、research.md:50、tasks.md:84、spec.md:201、plan.md:168、tasks.md:90 (担当は利用者)、quickstart.md:28 (安全柵の確認手順) |
| M-003 (非文字列の入力) | resolved from prev | data-model.md:33-37、spec.md:135、SC-002 (spec.md:240)、tasks.md:16。ただし連結の手前の穴は L-008 (new) |
| L-001 (状態の文言との見分け) | resolved from prev | spec.md:173、data-model.md:42、plan.md:148、tasks.md:56 |
| L-002 (live region に会話由来の文字列を入れない) | resolved from prev | spec.md:160、spec.md:239、research.md:33-34、tasks.md:46 |
| L-003 (tool 入力の先頭に秘密が出うる) | resolved from prev | spec.md:260 (Out of Scope で O-2 へ)、research.md:15、tasks.md:98 |
| L-004 (`app.evaluate` / close) | resolved from prev | research.md:49, :54、tasks.md:85, :89 |
| L-005 (`dangerouslySetInnerHTML` の lint による禁止) | resolved from prev (system scope として roadmap へ送付) | plan.md:167、tasks.md:98 |
| L-006 (セキュリティ主張のテスト観点) | resolved from prev | (a) tasks.md:16 / (b) tasks.md:46 / (c) quickstart.md:28 / (d) quickstart.md:46-52, tasks.md:101 / (e) spec.md:200, tasks.md:87 |

## Findings

### [Low] `toActivityLine` / `deriveActivity` の処理量が「行の長さ」に抑えられていない (L-007) (scope: feature) — new

- **観察**:
  - data-model.md:36 は「全体を分割しない。…処理量を行の長さに抑える」としている。しかし同 :37 は「**最初に空でなくなった行**を採る」としており、先頭に空行や空白・制御文字だけの行が続く入力では、本文の末尾まで行を走査する。例として、`"\n"` や `" \n"`、双方向制御文字だけの行が 200KB 続く part がある。
  - `reply` 分岐は「text の part を順に連結したもの」を入力にする (data-model.md:28)。AD-043 Decision 2 の上界は part ごとの `BODY_MAX_BYTES` (200,000。`src/domain/session/sanitize-body.ts:12`) であり、メッセージ全体の上界ではない。連結した文字列は part 数 × 200KB になりうる。
  - `sanitizeBody(line, 1024)` は空白を畳む前に 1024 バイトで切る (data-model.md:37)。そのため、先頭が 1024 バイトを超える空白の行は空と判定され、その行の後半の本文が飛ばされる。
  - SH-003 の観点 (tasks.md:16) は「200KB の 1 行目が短い本文で処理が 1 行目に閉じる」という良い場合だけを見ている。
- **同種事象探索**: 該当なし (新規の関数。既存の 1 行要約 `normalize.ts` は 512B で先に切る形)
- **リスク/影響**: 評価はセッションごとに 500ms で間引かれ (data-model.md:10)、入力の送り手は自前の agents であるため、現時点で DoS は観察されていない。ただし最悪の場合は 10 本 × 毎秒 2 回 × (part 数 × 200KB) の走査と連結になる。US-4 の閾値 (SC-004 / SC-005) と、spec Edge Cases の「一覧の描画を落とさない」(spec.md:135) の前提が崩れうる。分類は CWE-400 (B の入力に対する計算量)。
- **推奨アクション**:
  - data-model §2 に走査の上界を明記する。例: part を順に遅延して見て、走査は合計で先頭 N コードユニット (例: 4KB) まで、または最初の M 行までとし、上界に達したら空にする。
  - `reply` 分岐では part を連結せず、part ごとに行を取り出し、最初に空でない行が見つかった時点で止める。
  - `sanitizeBody` で切るのは、空白を畳んだ後か、上界の内側にする。
  - SH-003 に「先頭に空行・空白行が 200KB 続く入力」「200KB の text part が 20 個の reply」で走査が上界に閉じることを足す。
- **根拠**: AD-043 Decision 2 (renderer は形を検証する)、CWE-400、spec Edge Cases (spec.md:135-136)
- **scope 根拠**: 本 feature で新設する `session-view.ts` の純関数で直せる

### [Low] `reply` 分岐の text part の連結が `toActivityLine` の手前にあり、非文字列が文字列化されて表示される (L-008) (scope: feature) — new

- **観察**:
  - data-model.md:28 は `detail` を「text の part を順に連結したもの」としている。:31 で「`tool` と `detail` はどちらも `toActivityLine` を通す」としているが、型の検証 (:35) は**連結の後**にかかる。
  - renderer の decoder の `isMessage` は、part の `type` だけを検証する (`src/renderer/src/features/session/session-event-decoder.ts:34`)。そのため `text` が非文字列 (`undefined` / 数値 / オブジェクト) の part が届きうる。
  - `parts.map(p => p.text).join('')` のように実装すると、例外は出ないが `"undefined"` や `"[object Object]"` が直近の活動として出る。SC-002 (spec.md:240) の「非文字列を含む入力で … 空になる」に反する。
  - SH-003 の非文字列の観点 (tasks.md:16) は `toActivityLine` 単体だけを見ており、`deriveActivity` の連結を通る経路は観点に無い (tasks.md:15)。
- **同種事象探索**: `typeof` を `session-event-decoder.ts` で検索すると、message の part の `text` / `toolName` / `argsText` の型の検証は 0 件 (:34 は `type` だけ。:43-44 は PermissionRequest の検証)。
- **リスク/影響**: 表示の誤りであり、注入や漏洩ではない。AD-043 Decision 2 の「形を検証する」が、連結の手前で抜ける。
- **推奨アクション**:
  - data-model.md:28 を「`typeof part.text === 'string'` の text part だけを順に見る」に改める (L-007 の遅延走査と合わせる)。
  - SH-003 の `deriveActivity` の観点に「`text` が非文字列の part を含む reply は、その part を飛ばす (`undefined` という文字列を出さない)」を足す。
- **根拠**: AD-043 Decision 2、CWE-20、SC-002
- **scope 根拠**: `session-view.ts` の新規関数で直せる。decoder の拡張は要らない

### [Low] 実機計測の失敗時、Playwright の call log に行の HTML の抜粋 (会話由来の文字列) が標準出力へ出うる (L-009) (scope: feature) — new (R1 M-001 の残余)

- **観察**:
  - research.md:51 / tasks.md:85 は、状態の判定を `data-*` 属性で行い、会話由来の文字列を含む要素のテキストを assert に使わない、と定めている。
  - しかし Playwright は、locator の待機 (`waitFor` / `toHaveAttribute` など) が timeout したとき、call log に「locator resolved to `<div …>…</div>`」の形で、解決した要素の HTML の抜粋 (テキストを含む) を出す。属性で判定していても、行の要素を locator で待つ限りこの出力が出る。
  - 許可リスト (tasks.md:90) は、コミットされる quickstart-results への経路を塞ぐ。一方、標準出力そのもの (端末のログ、利用者の指示で agent が実行したときの agent の文脈) には残る。
- **同種事象探索**: `trace|screenshot|video|outputDir` を `playwright*.ts` で検索すると 0 件 (既存の `playwright.config.ts:15-27` に明示は無い。perf の設定は新設で off とする方針。research.md:51)。
- **リスク/影響**: 作業フォルダは秘密を含まない使い捨てのリポジトリと定めた (quickstart.md:8) ので、露出するのはそのリポジトリの内容と model の出力の断片に限る。コミットへの経路は許可リストで塞がれている。
- **推奨アクション**: SH-032 に、状態の判定を locator の待機ではなく、`page.evaluate` で一覧の `data-*` の enum 値だけを配列にして返す関数の `expect.poll` で行う、と 1 行足す。そうすれば、失敗時の出力にも enum と数値しか載らない。agent が実行した回の標準出力を記録に貼らないことも、quickstart V-3 の手順 4 に添える。
- **根拠**: CWE-532、Constitution Principle V、AD-038 D5 / Confirmation:119 の趣旨
- **scope 根拠**: perf/ は本 feature で新設する

### [Low] 実機計測の安全柵を確かめる経路が手動の手順だけで、ガードの置き場が lint・型検査の外にある (L-010) (scope: feature) — new — H

- **観察**:
  - CI のガードは `playwright.perf.config.ts` に置く (plan.md:182)。一方、同じ plan で `playwright.perf.config.ts` を eslint の ignores に足し (plan.md:178)、型検査の対象は `perf/` と `e2e/support/` である (plan.md:180)。ガードを持つ設定ファイルは、lint・型検査のどちらにも入らない (既存の `playwright.config.ts` も同じ扱いで、`e2e/tsconfig.json:4` の include は `e2e/` の中だけ)。
  - ガードの動作の確認は quickstart V-3 の手順 0 (quickstart.md:28) の手動だけである。
  - verify.yml に perf の実行が載っていないことを機械的に確かめる手段も無い (R1 では任意とした)。
- **同種事象探索**: 該当なし (新設ファイル)
- **リスク/影響**: ガードの回帰 (誤って消す・条件を反転させる) を検出できない。ガードが消えても、CI の e2e job は perf を名指しで実行しないので、即座に実害は出ない (二重の防御)。
- **推奨アクション**: 次のどちらかを SH-005 / SH-092 に足す。
  - (a) 型検査の include に `playwright.perf.config.ts` を足す。
  - (b) quickstart V-5 に「`.github/workflows/verify.yml` に `playwright.perf` が 0 件」の grep を 1 行足す。
  - 手動の手順 0 は維持する。
- **根拠**: reviewer-base H の規定、AD-038 D3、Constitution Principle XI
- **scope 根拠**: tasks / quickstart で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-007 | (新規の関数のため探索対象なし) | 0 | — |
| L-008 | `typeof` in `src/renderer/src/features/session/session-event-decoder.ts` (message の part の text / toolName / argsText の検証) | 0 | :34 は `type` だけ。:43-44 は PermissionRequest |
| L-009 | `trace\|screenshot\|video\|outputDir` in `playwright*.ts` | 0 | — (playwright.config.ts:15-27 に明示なし) |
| L-010 | `playwright` in `tsconfig.node.json` / `e2e/tsconfig.json` の include | 0 | e2e/tsconfig.json:4 (`**/*.ts`。e2e/ の中だけ) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved from 1: 9 (M-001, M-002, M-003, L-001, L-002, L-003, L-004, L-005, L-006) / unresolved: 0 / new: 4 (L-007, L-008, L-009, L-010)
