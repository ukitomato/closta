# platform-boundary-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004: 許可の 4 値と、昇格の 2 値に移る経路が 0 件であること
  - FR-005 / FR-006 / FR-007: 確認を出す判定点と main の印
  - FR-008: true のランタイムでも「隔離されていない」と読める帯の文 (U-6)
  - FR-010: Principle III の改定
  - FR-012: プリセットで確認を省かない
  - SC-001 / SC-002 / SC-003 / SC-004
- touched files に該当する charter / Confirmation:
  - isolation charter: `:19` / `:30-31` / `:74` / `:87` / `:101` / `:127`
  - runtime charter: `:41` / `:49` (表明までが runtime、ゲートは isolation)
  - session charter: `:85`
  - Constitution Principle III: §8.1 の改定案
  - ADR: AD-003 / AD-015 §8、AD-066 (proposed) の Decision 2 / 3 / 4、Consequences、Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

Round 2 は前回の C-001 への利用者の回答 (spec U-6、2026-10-31) を受けた改訂を見た。回答の中身は次の 3 つである。
- true のランタイムでは確認を省くことをそのまま採る。これを受け入れたリスクとして記録する
- 手当ては文言だけにする。帯の文はどの `autoModeStatus` でも「隔離されていない」と読める文にする
- sandbox を有効にするかは I-3 で判断し直す

あわせて次の改訂も確かめた。
- H-001 (承諾の印の寿命)
- H-002 / H-004 (isolation charter の書き換えと、判定を session に暫定で置くこと)
- 再開の経路の印の配線

PB-1 / PB-5 / PB-6 は該当なし。
- PB-1: パスを扱わない。runtimeId は `HostPath` / `RuntimePath` ではない
- PB-5: docker endpoint に触れない
- PB-6: 新しく書くのは `presets.json` の版の番号だけ

PB-2 は該当なし。main は要求ごとに `runtimes.snapshot()` を読み、runtimeId で記述子を引く (data-model.md:79)。見つからなければ false で、確認を要する側に倒れる。単一インスタンスの仮定もキャッシュも無い。

## Round 1 からの引き継ぎ

- **C-001 (Critical): resolved from prev**
  - 利用者が U-6 (spec.md:36) でリスクを明示的に受け入れた。これは人間の判断であり、本 reviewer は覆さない
  - 指摘の核心は「true を隔離の中と読む」ことだった。この読みは次の箇所で一貫して除かれている
    - spec FR-005 (spec.md:75)、FR-008 (:78)、AC6 (:55)
    - data-model §1 (:33)、§4.2 (:87)、§9 (:246)
    - contracts (:9)
    - AD-066 Decision 2 (:44) と Consequences (:53)
    - Constitution の文案 §8.1 (data-model.md:216 の暫定の受け入れ、:222 の Bad の例)
    - quickstart V-5 (:43)
    - FE-010 / FE-015 のテスト (tasks.md:58, :68)
  - `隔離のある|隔離が分かった|隔離の中` を spec dir と AD-066 で Grep した。残っていたのは否定文、Alternatives の退けた案 (AD-066:62)、plan:216 の経緯の記述だけだった
- **H-001: resolved from prev**
  - data-model.md:152, :160-162 で、`autoAckRuntimeId` は次の 3 つの時点で `null` になり、mount のたびに `null` から始まる
    - プリセットを適用したとき
    - 権限モードを `auto` 以外にしたとき
    - ランタイムを変えたとき
  - tasks.md:64 (FE-013) に、回帰を捕まえるテストが 2 行足された
- **H-002: resolved from prev**
  - data-model §1 (:34) と §11 (:266-267) に、session に暫定で置くことと isolation charter の書き換えが入った。書き換えは In scope `:30-31`、Journey `:74`、業務ルール `:101`、KPI `:127`、Related Specs
  - AD-066 の affected_domains (:7) に isolation が入った
- **M-001: unresolved from prev**
- **M-002: unresolved from prev**
- **M-003: resolved from prev**
  - BE-010 の true の行は「U-6 の受け入れたリスクを固定する」と明記された (tasks.md:50)
  - 観測用のログの部分は security M-007 / po M-008 に重なるので、そちらに委ねる
- **L-001: unresolved from prev**

## Findings

### [Medium] main と renderer の capability のスナップショットがずれたとき、`auto-mode-unconfirmed` から回復できない (M-001) (scope: feature) [unresolved from prev]

- **観察**:
  - main は要求のたびに snapshot を読む (data-model.md:79)
  - renderer の判定の入力は手元の DTO の `autoModeAllowed` (data-model.md:151, :177)
  - `refetch` の行 (data-model.md:163) は `autoConfirm` を消すだけで、拒否を受けた後の扱いが無い
  - 次の 4 つのどこにも、`auto-mode-unconfirmed` を受けたら取り直すか確認を出し直すという規則が無い (`refetch|取り直` で Grep。拒否の後の規則は 0 件)
    - §6.2 / §6.3
    - contracts C-1 / C-3
  - 再判定の途中では、main は `beginProbing()` で `unknown` になる (`src/domain/runtime/capabilities.ts:108-110`)。このとき main 側の判定は false である。一方 renderer の DTO が true のまま残っていると、次の手順で同じ拒否が繰り返される
    1. renderer は確認を出さずに `ack=false` を送る
    2. main が `auto-mode-unconfirmed` で拒否する
    3. 文言 (data-model.md:243)「選び直して確認してください」に従って選び直しても、DTO が古いままなので確認は出ない
- **リスク/影響**: 安全側には倒れる。ただし利用者は、DTO が更新されるまで Auto に進めない
- **推奨アクション**: §6.2 / §6.3 に「`auto-mode-unconfirmed` を受けたら、そのランタイムを確認が要る側として扱い直す (または一覧を `refetch` する)」の行を 1 つ足す。FE-013 / FE-014 にテストを 1 行ずつ足す
- **根拠**: Constitution Principle III (安全側に倒れる判定)、runtime charter `:49`

### [Medium] 項目 16 の昇格の値のリテラル検査を、テンプレートリテラル `` `auto` `` で抜けられる (M-002) (scope: feature) [unresolved from prev]

- **観察**:
  - `scripts/constitution/check.mjs:919` は `'${value}'` と `"${value}"` の 2 つの形しか見ない
  - data-model §10 (:257) は「検査の形は変えない」としている
  - 026 では `assertSelectablePermissionMode` が `auto` を通す。そのため `` permissionMode: assertSelectablePermissionMode(`auto`) `` は次の 3 つをすべて通る。結果として、agents は main の印の検査を経ずに `auto` に上げられる
    - 包みの検査 (:942-947)
    - P1 の検査 (:919)
    - 実行時の包み
  - 一方、AD-066 Decision 3 (:45) と data-model §3.1 (:58) は「agents に `'auto'` を直書きさせない (項目 16 の P1 が落とす)」と書いている
- **同種事象探索**: `PERMISSION_MODE_ESCALATION_VALUES|'auto'` を eslint 設定 / dependency-cruiser / scripts / expected.mjs で検索して 3 件 (`check.mjs:53`, `:918`, `allowlists.mjs:515`)。別の層で防いでいる箇所は無い
- **推奨アクション**: 2 つを行う
  - `:919` に `` `\`${value}\`` `` の形を足す
  - fixture `a-direct/sdk-permission-mode-auto-template-literal` を新設し、§10 と BE-004 に載せる

  文字列の連結 (`'au' + 'to'`) は `UNDETECTED_NOTES` に限界として書く
- **根拠**: AD-066 Decision 3、Principle III / 項目 16 (PB-7)

### [Medium] isolation charter `:87` と `capabilities.ts:158` が、`autoModeSafe` / `isAutoModeAllowed` を U-6 より前の意味のまま説明している。§11 の書き換えの対象に入っていない (M-004) (scope: feature) [new]

- **観察**:
  - 旧い意味で説明している箇所が 2 つある
    - `docs/domains/isolation/charter.md:87`「**autoModeSafe**: そのランタイムで無人実行を許してよいか」
    - `src/domain/runtime/capabilities.ts:158`「ゲートの入力にするのは I-3。R-1 の判定点は未確定値の安全側解釈であってゲートではない」
  - 026 では `isAutoModeAllowed` を、X-10 でゲート (確認を省くか) の入力に使う。U-6 は true を「sandbox を使える。有効にしたことではない」と定義し直した (data-model.md:33)
  - ところが §11 (data-model.md:265-266) と SH-011 (tasks.md:79) が書き換えるのは次の箇所だけで、上の 2 つは含まれない
    - glossary: 末尾に注記を足すだけ。Definition `:71`「無人実行を許してよいか」は残る
    - isolation charter: `:30-31` / `:74` / `:101` / `:127` / `:145`
  - `capabilities.ts:15[0-9]|ゲートの入力にするのは` を spec dir で Grep して 0 件だった
- **リスク/影響**: isolation charter の用語の節と判定の唯一の関数の JSDoc が、「true = 無人実行してよい」「これはゲートではない」と言い続ける。改定後の Principle III の暫定の受け入れの段落 (data-model.md:216) と食い違う。I-3 で判定を移すときに、旧い意味を前提に読まれる
- **推奨アクション**: 次の 3 箇所を直す
  - §11 の isolation charter の行に `:87` の追記を足す (「true は sandbox を使えることで、Closta が有効にしたことではない (026 U-6)」)
  - glossary の Definition `:71` にも同じ限定を入れる
  - BE-001 に `capabilities.ts:158` の JSDoc の書き換えを足す (「X-10 から `requiresAutoModeConfirmation` の入力 (確認を省く側) に使う。AD-066 / U-6」)
- **根拠**: runtime charter `:41` / `:49`、isolation charter `:87`、Constitution Principle III (§8.1 の暫定の受け入れ)、AD-066 Decision 2

### [Low] e2e では renderer の DTO の `autoModeAllowed` と main の記述子が別々の手書きの値で、1 つの判定点を通っていない (L-001) (scope: feature) [unresolved from prev]

- **観察**: contracts C-6 (:56) は 2 つの値を別々に置いている
  - 偽のランタイムの DTO はリテラルの `autoModeAllowed: false` のまま (`src/main/app/e2e-capability.ts:511` 付近)
  - main 側は `knownRuntimes` の記述子から `isAutoModeAllowed` で作る

  片方だけを変えると、e2e の中で renderer と main の判定が黙ってずれる
- **推奨アクション**: e2e の DTO を `dto-mapper` から記述子を通して作るか、両者の一致を BE-012 のテストで固定する

### [Low] 項目 16 の P1 の違反の文言を「許可の 4 値 {…, auto} のみ」に直すと、`'auto'` を検出したときの文言が自分自身と矛盾する (L-002) (scope: feature) [new]

- **観察**:
  - data-model §10 (:257) は、違反の文言の「安全 3 値 {default, plan, dontAsk} のみ」を「許可の 4 値 {default, plan, dontAsk, auto} のみ」に替える。この文字列があるのは `check.mjs:921` の P1 の文言だけである
  - P1 は `PERMISSION_MODE_ESCALATION_VALUES` (`auto` を含む) で発火する
  - その結果、`'auto'` の直書きに対して「昇格値 "auto" が現れている (P1。許可の 4 値 {…, auto} のみ)」と出る
- **推奨アクション**: `:921` の文言を「agents に昇格の値と `auto` を直書きしない (値は main から届く。AD-066)」のように、何を禁じているかで書く

### [Low] 利用者が選んでいない `auto` の帯 (`UnsafeModeBanner`) は、`allowed` で「確かめていません」とだけ書き、隔離されているかもしれないと読める (L-003) (scope: feature) [new]

- **観察**:
  - §9 (data-model.md:246) は、Auto の帯で `UNSAFE_MODE_BANNER_LABELS` の隔離の文を共有しない理由に、この読み方を挙げている。しかし `UnsafeModeBanner` 自体の文は変えない (:248)
  - 一方、改定案の Bad の例 (:222) と暫定の受け入れの段落 (:216) は「Auto の帯」に限って書かれている
  - 利用者が選んでいない `auto` を true のランタイムで観測したときは、`UnsafeModeBanner` の `allowed` の文が出る
- **推奨アクション**: §9 か §8.1 に、`UnsafeModeBanner` は原因を断定しない帯なので U-6 の文言の制約の対象外である旨を 1 文書く。あるいは `allowed` の文に「sandbox は有効にしていない」を足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 (resolved) | `隔離のある\|隔離が分かった\|隔離の中` (spec dir, AD-066) | 9 (すべて否定文・退けた案・経緯) | data-model.md:33, :87, :222, :268 / spec.md:75 / contracts:9 / plan.md:216 / tasks.md:34 / AD-066:62 |
| M-001 | `refetch\|取り直` (plan / research / quickstart / data-model) | 1 (拒否の後の規則は 0) | data-model.md:163 |
| M-002 | `PERMISSION_MODE_ESCALATION_VALUES\|'auto'` (eslint / depcruise / scripts / expected.mjs) | 3 | scripts/constitution/check.mjs:53, :918; scripts/constitution/allowlists.mjs:515 |
| M-004 | `capabilities\.ts:15[0-9]\|ゲートの入力にするのは` (spec dir) | 0 | — |
| M-004 | `autoModeSafe` (isolation charter) | 4 | docs/domains/isolation/charter.md:30, :87, :88, :101 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
- Round inheritance: resolved from 1: 4 (C-001 / H-001 / H-002 / M-003) / unresolved: 3 (M-001 / M-002 / L-001) / new: 3 (M-004 / L-002 / L-003)
