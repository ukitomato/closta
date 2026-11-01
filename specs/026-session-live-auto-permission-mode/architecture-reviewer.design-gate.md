# architecture-reviewer Review: 権限モードの Auto (起動と実行中) (X-10)

**Run**: 2026-11-01T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012 と SC-001〜SC-005 が対象。本 reviewer が主に見たのは次の FR。
  - FR-005 / FR-006: U-6 を受けて、true で確認を省く規則と単一の判定点
  - FR-009: AD-066 の読み替え表
  - FR-010: Principle III の改定文 (data-model §8.1)
  - FR-011: charter・glossary・roadmap の追随 (data-model §11)
  - FR-012: プリセットの版 3
- touched files に該当する charter / Confirmation:
  - session charter: `:85` (Out of scope)、`:144` (Key concepts)、`:188-190` (業務ルール)
  - isolation charter: `:30-31` (In scope)、`:74` (Journey 2)、`:87` (Key concepts)、`:101` (業務ルール)、`:127` (KPI)
  - runtime charter: `:48`、`:113`
  - `_overview`: `:76`、`:143`、`:174` (III の cross-domain invariant)
  - Constitution: Principle III (`:460-481`)、改定手順 (`:363-375`)、バージョニング方針 (`:1072-1080`)
  - accepted ADR: AD-015 §8 / Consequences、AD-020 Decision 3、AD-025 §5、AD-036 §5、AD-041 (a)(c)、AD-042、AD-047 Decision 5、AD-059 Decision 1 / 3 / V-9、AD-062 Decision 1、AD-064 Decision 4、AD-065 Decision 3、AD-031
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner。本 reviewer は権限ゲートの所在 (C / D) だけを見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:2 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner (用語の一貫性は C の ARCH-7 で扱った)
- G. optional reviewer 範囲: 該当なし: プリセットの互換は database-reviewer、帯と確認の a11y は a11y-reviewer、ui-coverage の行は ui-coverage-reviewer の owner
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (前の Round で本 reviewer が挙げたテストの穴は埋まった。以下は根拠)
  - isolation charter の KPI の計測経路 (前 M-003): §11 で `e2e/launch-dialog.spec.ts` (FE-017) を指すようになった
  - Principle III の Why / Bad の文が残っていないかの確認: SH-010 が Grep で確かめる
  - AD-066 が accepted か: SH-012 がマージの前に確かめる
  - true の行 (U-6): BE-010 でテスト名に U-6 を書いて固定する。FE-010 / FE-015 が `allowed` の文に「隔離されていません」が入ることを確かめる

## スコープ要約

Round 2 は、Round 1 の後に直した spec / plan / tasks / data-model / AD-066 を見直した。

- 利用者は C-001 に U-6 で答えた。「true のランタイムでは確認を省く」を残し、sandbox が有効になっていないリスクは受け入れる。手当ては文言に限る
- 前の Round で本 reviewer が出した High 4 件は直っている
  - isolation charter と glossary の追随
  - AD-066 の読み替え表の 3 行
  - Why / Bad の置き換え
  - RK-01 の一本化
- 新しく見つかったのは次の 2 件
  - plan が「ゲートの持ち主は動かさない」という前の記述を残したまま、「session に暫定で置く」と決めたこと。この 2 つは食い違う
  - 改定文が「`autoModeSafe === true` は sandbox が有効という意味ではない」と認めたのに、`bypassPermissions` の規則は同じ値で開いたままであること
- layering の変更は無い。`requiresAutoModeConfirmation` は domain の純関数で、`isAutoModeAllowed` は composition-root から注入する。`services-not-to-io` に触れない

## Findings

### [High] plan の「判断の承認」が「ゲートの持ち主は動かさない」を根拠に gated の確定事項でないとしているが、同じ plan と data-model §1・AD-066 Decision 2 は「ゲートの方針を session に暫定で置く」と決めている (H-101) (scope: feature) [new]

- **観察**:
  - `specs/026-…/plan.md:21`: 「`requiresAutoModeConfirmation` は `isolation` の判定 (`isAutoModeAllowed`) を入力に取るだけで、ゲートの持ち主 (session charter Out of scope「権限モードのゲート → `isolation`」) は動かさない」。これを根拠に `:20` で「AGENTS.md の gated 確定事項には当たらない」としている
  - `plan.md:152`: 「`isolation` / `runtime`: `isAutoModeAllowed` / `autoModeStatus` を読むだけ」
  - 一方で次の 4 か所は、ゲートの方針を session に移すと書いている
    - `plan.md:137`: 「ゲートの方針にあたる … X-10 では session に暫定で置き、I-3 で isolation へ移す」
    - `plan.md:154`: 「Auto の確認の判定を X-10 では session に暫定で置く」
    - `data-model.md:34` (§1): 「ゲートの方針にあたる。X-10 では `src/domain/session/launch-config.ts` に暫定で置き」
    - `docs/decisions/0066-…md:44` (Decision 2 の末尾): 同じ趣旨
  - data-model §11 (`:266`) は isolation charter の In scope を書き換え、「本 domain の責務の一部を session が暫定で持つ」とする。これは 2 つの domain の責務の割り当てを変えることになる
  - spec の「決定済みの事項」(U-1〜U-6) に、この割り当てを承認した行は無い
- **同種事象探索**: `ゲートの持ち主|読むだけ|暫定で置` を spec dir で検索して 6 件。plan.md:21, :152 は「動かさない / 読むだけ」、plan.md:137, :154 と data-model.md:34, :266 は「暫定で置く」
- **リスク/影響**:
  - AGENTS.md「gate の原則」には「domain decomposition … は必ず人間が承認する」とある。plan はこれに当たらないと書いたが、その根拠は plan 自身の決定と食い違う
  - pr-gate や I-3 で記録をたどる人は、責務の移動に承認が要ったのか、要らなかったのかを判別できない
  - 実害は小さい。AD-066 Decision 2 は PR のレビュー (改定手順 2) で人間が見るので、マージまでに承認の機会は 1 度ある。ただし、その経路が承認の記録として書かれていない
- **推奨アクション**:
  1. plan.md:21 を書き換える。中身は「確認の要否の判定と main の印の検査はゲートの方針にあたり、X-10 では session に暫定で置く (data-model §1)。isolation charter の In scope を書き換えるので、責務の割り当てを AD-066 Decision 2 に書き、PR のレビュー (改定手順 2。AD-066 を accepted にする) で人間が承認する」
  2. plan.md:152 の「読むだけ」を `:154` と同じ内容にそろえる
  3. 夜の規則の下で、承認を PR のレビューまで待つのが妥当か迷うなら、`.needs-input.md` で 1 問だけ聞く
- **根拠**: AGENTS.md「gate の原則」(AskUserQuestion gated 確定) / session charter `:85` / isolation charter `:30-31` / ARCH-2
- **scope 根拠**: plan の文面で直せる

### [Medium] Principle III の改定文は Auto について「`autoModeSafe === true` は sandbox が有効という意味ではない」と認めるが、`bypassPermissions` の規則は同じ `autoModeSafe !== true` を条件にしたまま残る (M-101) (scope: feature) [new]

- **観察**:
  - data-model.md:211 (§8.1 の Statement の 1 文目) は「`autoModeSafe !== true` のランタイムで `bypassPermissions` を選択可能にしてはならない」とする。裏返すと、true のランタイムでは `bypassPermissions` を選べることになる
  - data-model.md:216 の「暫定の受け入れ」は「`autoModeSafe === true` は … sandbox を有効にしたことは表さない」と書くが、この段落が扱うのは Auto だけである
  - 今の時点で `bypassPermissions` を選ぶ経路は、AD-066 Decision 1 と項目 16 によって 0 件である。したがって今の実害は無い
- **同種事象探索**: `autoModeSafe !== true` のランタイムで `bypassPermissions` を data-model.md で検索して 3 件 (`:211`, `:266`, `:227` の plan-template の文)。どれも true のランタイムで sandbox が無効な場合の `bypassPermissions` に触れていない
- **リスク/影響**: I-3 が Constitution の文だけを根拠に読むと、sandbox を有効にしないまま、true のランタイムで `bypassPermissions` を出す設計を適合と判定できてしまう。改定は「true ≠ 隔離」を事実として認めたので、同じ事実が bypass にも当てはまる
- **推奨アクション**: §8.1 の「暫定の受け入れ」に次の 1 文を足す。「`bypassPermissions` は、I-3 で sandbox を有効にするまで、`autoModeSafe` の値によらず選択肢に出さない (AD-066 Decision 1)」
- **根拠**: Constitution Principle III / AD-066 Decision 1 / runtime charter `:113` / ARCH-1

### [Medium] プリセットを「版 2」と書いた session charter と glossary の 2 か所が、§11 の更新対象からまだ漏れている (M-001) (scope: feature) [unresolved from prev: gate M-011]

- **観察**:
  - `docs/domains/session/charter.md:144`: 「`presets.json` 版 2」
  - `docs/glossary.md:819`: 「`presets.json` 版 2、版 1 は読める」
  - data-model §11 の glossary の行 (`:265`) と session charter の行 (`:267`) は、どちらもこの 2 か所に触れていない
- **同種事象探索**: `版 2` を `docs/` (decisions を除く) で検索して 4 件。直すべきなのは上の 2 件。`charter.md:361` は 024 の記録、`roadmap.md:355` は X-6 の行なので残してよい
- **推奨アクション**: §11 に「版 3 (X-10。`auto` を含む)。版 1 / 2 は読める」を足す
- **根拠**: Principle XIV / ARCH-7

### [Medium] 「許可の 4 値」という日本語の名前が、`autoModeAllowed` の「許可」と衝突したまま残る (M-002) (scope: feature) [unresolved from prev: gate M-012]

- **観察**:
  - spec.md:73, :86、plan.md:28, :131、data-model.md:22, :25 は、どれも「許可の 4 値」を使っている
  - 型名は `SelectablePermissionMode` である
  - 「`autoModeAllowed` が false なのに、`auto` は許可の 4 値に入る」という読みにくい関係が残る
- **同種事象探索**: spec dir の `許可の 4 値` は 10 件以上 (spec / plan / data-model / contracts / tasks)
- **推奨アクション**: 「選べる 4 値」にそろえる。変えない場合は、glossary の新しい項の Counterexamples に「`autoModeAllowed` の『許可』とは別の語」と書く
- **根拠**: Principle XIV / ARCH-7

### [Low] isolation charter の Key concepts の autoModeSafe (`:87`) が §11 の更新対象に無い (L-101) (scope: feature) [new]

- **観察**:
  - `docs/domains/isolation/charter.md:87`: 「そのランタイムで無人実行を許してよいか」
  - §11 は glossary の autoModeSafe に「true は sandbox を使えるという意味で、有効にしたことではない」を足すが、isolation charter の同じ概念の行は直さない
- **同種事象探索**: `autoModeSafe\*\*:` を `docs/domains` で検索して 1 件 (`isolation/charter.md:87`)
- **推奨アクション**: §11 の isolation charter の行に、glossary と同じ注記を足す
- **根拠**: ARCH-7

### [Low] spec FR-011 の更新対象に isolation charter・`_overview`・prompts が書かれていない。data-model §11 はそれらを含む (L-102) (scope: feature) [new]

- **観察**:
  - spec.md:81 (FR-011) が挙げるのは glossary・session charter・roadmap・ui-coverage の 4 つだけである
  - data-model §11 と SH-011 は、これに加えて isolation charter・`_overview`・prompts も直す
- **同種事象探索**: `isolation/charter` を spec.md で検索して 0 件
- **推奨アクション**: FR-011 に「isolation charter (Auto の確認の暫定の持ち主)」を足すか、「data-model §11 の表のとおり」の参照形にする
- **根拠**: ARCH-2

### [Low] AD-066 の読み替え表が、AD-064 Decision 4 の「書き出しは版 2」を行として持たない (L-103) (scope: feature) [new]

- **観察**:
  - `docs/decisions/0064-…md:39` (Decision 4): 「書き出しは版 2」
  - AD-066 の表 (`:36`) は AD-042 の行に「版 2 は AD-064 Decision 4」と括弧で触れるだけで、読み替えの対象として挙げていない
  - plan.md:167 は「Decision 4 (版 1 の読み替え) は変えない」とする
- **同種事象探索**: `書き出しは版 2` を `docs/decisions` で検索して 1 件 (AD-064:39)
- **推奨アクション**: AD-066 の表の AD-042 の行に「AD-064 Decision 4 の書き出しの版 (2) を 3 にする。版 1 の読み替えは変えない」と明記する
- **根拠**: AD-031 / ARCH-3

### [Low] `needs-confirmation` と `auto-mode-unconfirmed` の違いが glossary に書かれていない (L-003) (scope: feature) [unresolved from prev: gate L-007]

- **観察**:
  - `docs/glossary.md:575` に `needs-confirmation` がある
  - §11 は Launch preflight reason に `auto-mode-unconfirmed` を足すだけで、2 つの違いを書いていない
- **同種事象探索**: `needs-confirmation` を glossary で検索して 1 件
- **推奨アクション**: SH-001 で、2 つの違いを 1 行で書く (前者は既定の Provider で起動するときの確認、後者は Auto の確認の印が欠けているとき)
- **根拠**: Principle XIV

### 前の Round の指摘の解決状況

本 reviewer の前の Round の ID と、gate の ID を並べて書く。

- **H-001 / gate H-004** (isolation charter と glossary の追随): **resolved from prev**
  - data-model §11 `:265-267` で直した
  - SH-011 `:79` に入った
  - AD-066 `:7` の affected_domains に isolation が入った
  - plan.md:137 に記録がある
- **H-002 / gate H-005** (読み替え表の 3 行): **resolved from prev**
  - AD-066 `:32`, `:34`, `:35` に足した
  - plan.md:165 に AD-015 を足した
- **H-003 / gate H-006** (Why / Bad の置き換え): **resolved from prev**
  - data-model §8.1 `:213-222` で直した
  - plan-template の行は `:227` で直した
- **H-004 / gate H-007** (proposed のままのマージ): **resolved from prev**
  - plan.md:328 (RK-01) を一本化した
  - SH-012 `:80` にマージの前の確認を足した
  - AD-066 `:76` に書いた
- **M-001 / gate M-011**: unresolved (上の M-001)
- **M-002 / gate M-012**: unresolved (上の M-002)
- **M-003** (KPI の計測経路): **resolved from prev** (§11 の isolation charter の行で KPI を FE-017 に合わせた)
- **L-001 / gate L-005** (P-1〜P-12 の誤記): **resolved from prev** (AD-066 `:14` が P-13 になった)
- **L-002 / gate L-006** (`amended` の日付): **resolved from prev** (§8.1 `:224` を「改定を入れる日」にした)
- **L-003 / gate L-007**: unresolved (上の L-003)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `ゲートの持ち主\|読むだけ\|暫定で置` (spec dir) | 6 | specs/026-…/plan.md:21, :137, :152, :154; data-model.md:34, :266 |
| M-101 | `autoModeSafe !== true\` のランタイムで \`bypassPermissions` (data-model) | 3 | specs/026-…/data-model.md:211, :227, :266 |
| M-001 | `版 2` (docs/, decisions を除く) | 4 (直すのは 2) | docs/domains/session/charter.md:144; docs/glossary.md:819 |
| M-002 | `許可の 4 値` (spec dir) | 10+ | spec.md:73, :86; plan.md:28, :131; data-model.md:22, :25 |
| L-101 | `autoModeSafe\*\*:` (docs/domains) | 1 | docs/domains/isolation/charter.md:87 |
| L-102 | `isolation/charter` (spec.md) | 0 | — |
| L-103 | `書き出しは版 2` (docs/decisions) | 1 | docs/decisions/0064-…md:39 |
| L-003 | `needs-confirmation` (glossary) | 1 | docs/glossary.md:575 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 4
- Round inheritance: resolved from 1: 7 (H-001, H-002, H-003, H-004, M-003, L-001, L-002) / unresolved: 3 (M-001, M-002, L-003) / new: 5 (H-101, M-101, L-101, L-102, L-103)
