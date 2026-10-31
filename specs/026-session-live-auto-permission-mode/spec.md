---
spec_id: 026-session-live-auto-permission-mode
domain: session
domain_selected_by: auto
targets: both
targets_selected_by: auto
status: drafting
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 権限モードの Auto (起動と実行中)

**Feature Branch**: `026-session-live-auto-permission-mode`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Live session の権限モードに Auto (`auto`) を追加する。起動の設定と実行中の composer の権限モードの選択の両方で Auto を選べる。"

## 本 feature の位置づけ

roadmap の **X-10** (2026-10-29 に利用者が承認して足した行)。M4 の I-3 から `auto` だけを隔離 (I-1 / I-2) より先に出す。主目的に ADR (AD-066) と Constitution Principle III の改定を含むので、規模の目安の例外に当たる (Phase 8.5)。025 (権限モードの選択を composer の周りに移し、表記を Claude Code に揃えた。AD-065) と 024 (`presets.json` を版 2 にした。AD-064) は 2026-10-29 に main にマージ済み (#32 / #33)。026 はその上の今の置き場所 (composer の左の群) と表記 (`Auto`) に `auto` を 1 つ足す (2026-10-30 の plan で載せ直した。plan の「設計後の見直し」)。

## 決定済みの事項

| ID | 決定 | 承認 |
|---|---|---|
| U-1 | roadmap に X-10 を足し、隔離より先に出す。I-3 には `acceptEdits` / `bypassPermissions`・sandbox の capability 判定・昇格モードの capability 連動のゲートを残す | 2026-10-29 利用者 |
| U-2 | 実行中の切り替えでも `auto` へ上げられる (安全 3 値 → `auto`、`auto` → 安全 3 値) | 2026-10-29 利用者 |
| U-3 | 隔離の無いランタイム (`isAutoModeAllowed` が false。Win32Runtime を含む) でも `auto` を選べる。Constitution Principle III を改定する (MINOR。適合と判定される状態を広げる改定) | 2026-10-29 利用者 |
| U-4 | `isAutoModeAllowed` が false のランタイムで `auto` を選ぶときは、起動・実行中とも毎回、明示の確認を挟む。true のランタイムでは挟まない | 2026-10-29 利用者 |
| U-5 | `auto` で動いている間は権限モードの警告の帯を常に出し、利用者が選んだ `auto` であることと隔離の状態を書いた文言にする。読み上げは切り替えたときの 1 回だけ。利用者が選んでいないのに安全 3 値の外になったときは今の帯のまま | 2026-10-29 利用者 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto を選んでセッションを回す (Priority: P1)

利用者は、承認カードに毎回答えずに Claude Code を進めたいとき、起動の設定で権限モードに Auto を選んで始めるか、動いているセッションの権限モードを Auto に切り替える。Auto では Claude Code の分類器が操作を都度許可・拒否する。隔離の無いランタイムでは、選ぶ前に「隔離が無く、分類器が許可した操作はホストでそのまま実行される」ことを確かめる確認が出る。Auto の間は中央のヘッダの下の帯で Auto で動いていることが分かり、いつでも安全 3 値に戻せる。

**Why this priority**: 利用者が今いちばん速く欲しい機能で、本 feature の唯一の Story。

**Independent Test**: E2E で、起動の設定で Auto を選んで起動し (確認を承諾)、帯に Auto の文言が出ることと、起動の要求に `auto` が載ることを確かめる。実行中の切り替えは、`default` で起動したセッションを Auto に切り替え (確認を承諾) て制御の経路に `auto` が流れ、確認を取り消すと何も流れないことを確かめる。

**Acceptance Scenarios**:

1. **Given** 隔離の無いランタイムのフォルダの起動の設定、**When** 権限モードに Auto を選ぶ、**Then** 確認が出て、承諾すると Auto が選ばれ、取り消すと前の値のまま
2. **Given** Auto を選んだ起動の設定、**When** 起動する、**Then** セッションは `auto` で始まり、中央のヘッダの下に Auto の帯が出る
3. **Given** `default` / `plan` / `dontAsk` で動いているセッション、**When** 権限モードの選択で Auto を選び確認を承諾する、**Then** セッションは止まらずに `auto` に変わり、帯が出て 1 回だけ読み上げられる
4. **Given** Auto で動いているセッション、**When** 安全 3 値のどれかに切り替える、**Then** 確認なしで変わり、帯が消える
5. **Given** 確認が出ている、**When** 取り消す、**Then** 権限モードは変わらず、制御の要求も起動も行われない
6. **Given** `isAutoModeAllowed` が true のランタイム、**When** Auto を選ぶ、**Then** 確認を挟まずに選ばれる
7. **Given** 選べる値の一覧、**When** 起動の設定と実行中の選択を開く、**Then** `acceptEdits` / `bypassPermissions` はどちらにも無い

### Edge Cases

- 確認を出している間にセッションが終わった — 確認を閉じ、要求を送らない
- 実行中の切り替えが失敗した (制御の結果が失敗) — 表示は前の値に戻し、帯は出さない。023 の失敗の表示を使う
- 帯が出る条件は「観測した権限モードが `auto`」で、利用者が選んだかは問わない。ただし利用者が選んでいないのに `auto` を観測した場合 (Closta の外の変更・Claude Code 側の切り替え) は、利用者が選んだ文言ではなく今の帯の文言 (原因を断定しない) を出す
- プリセットに `auto` を保存して読み込んだ — 起動の設定に Auto が入るが、確認は起動の前に出す (プリセットの読み込みで確認を省かない)
- 再開 (X-9) の初期値 — 権限モードは選び直せる軸なので、前のセッションが `auto` でも再開の初期値は起動の既定 (今の規則のまま)。`auto` を選び直すなら確認が出る
- ランタイムの capability が判定中 (`unknown`) — `isAutoModeAllowed` は false なので確認を挟む

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 起動の設定の権限モードの選択肢に `auto` (Auto) を足す。他の選択肢 (安全 3 値) は変えない。`acceptEdits` / `bypassPermissions` は足さない
- **FR-002**: 実行中の権限モードの選択肢に `auto` を足す。安全 3 値 ⇄ `auto` の遷移をすべて許す
- **FR-003**: main と session スレッドの値の検査は、起動・実行中とも「安全 3 値と `auto`」(以下、許可の 4 値) だけを通し、`acceptEdits` / `bypassPermissions` と不明な値を拒否する。拒否したときは SDK のメソッドを呼ばず、起動もしない
- **FR-004**: `acceptEdits` / `bypassPermissions` への遷移経路が起動・実行中とも 0 件であることを、Constitution 検証と rule fixture で今と同じ強さで保つ
- **FR-005**: `isAutoModeAllowed` が false のランタイムで `auto` を選ぶと、選択を確定する前に確認を出す (U-4)。確認の文には、隔離が無いこと・分類器が許可した操作はホストでそのまま実行されること・いつでも戻せることを書く。承諾で確定し、取り消しで前の値に戻す。true のランタイムでは確認を出さない
- **FR-006**: 確認の判定は `isAutoModeAllowed` だけを使う (Principle III の単一の判定点)。`autoModeSafe` の生の値や `=== false` で判定しない
- **FR-007**: 起動の要求の確認は renderer の確認だけに頼らない。renderer が確認の承諾を起動の要求に印として載せ、main は `auto` の起動の要求でランタイムの `isAutoModeAllowed` が false なのに印が無ければ拒否する。実行中の切り替えも同じ
- **FR-008**: 観測した権限モードが `auto` のとき、中央のヘッダの下に帯を出す (U-5)。利用者が Closta から選んだ `auto` なら「Auto で動いています」と隔離の状態 (今の `autoModeStatus` の文言の規則) を書いた文言、そうでなければ今の帯の文言。読み上げは帯が出たときの 1 回だけ
- **FR-009**: 新しい ADR (AD-066) を起こし、AD-062 Decision 1 の「昇格の値への実行中の遷移経路 0 件」を `auto` についてだけ置き換える。AD-036 §5・AD-041 (a)・005 SC-006(a)・AD-020 の危険度表 (`auto` = 危険) との関係を「読み替える箇所」の表に書く
- **FR-010**: Constitution Principle III を改定する (MINOR)。`autoModeSafe !== true` のランタイムで選べてはならない対象から `auto` を外し、代わりに「明示の確認を挟む」を要求にする。`bypassPermissions` の規則は変えない。Amendment trail に記録し、改定手順 2 のため PR は人間のレビューを待つ
- **FR-011**: `docs/glossary.md`・session charter・roadmap (X-10 / I-3) を新しい規則に合わせる。`docs/ui-coverage.md` の権限モードの行に変更があれば同じ PR で直す
- **FR-012**: プリセットに `auto` を保存・読み込みできる。読み込みで確認を省かない (起動の前に FR-005 の確認を出す)

### Key Entities

- **権限モードの許可の 4 値**: `default` / `plan` / `dontAsk` / `auto`。起動と実行中の両方で選べる値の集合。安全 3 値はその部分集合として残り、帯と確認の条件に使う
- **Auto の確認の承諾**: 起動の要求・実行中の切り替えの要求に載る印。隔離の無いランタイムでの `auto` の要求で main が必須にする

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 起動の設定と実行中の選択の両方で、Auto を選んでから `auto` で動くまでの利用者の操作が、隔離の無いランタイムでは 2 操作 (選ぶ・承諾する)、隔離のあるランタイムでは 1 操作 (E2E と単体テストで数える)
- **SC-002**: `acceptEdits` / `bypassPermissions` と不明な値の起動・実行中の要求の拒否率が 100% (main とセッションスレッドの単体テスト、項目 16 の rule fixture)
- **SC-003**: 隔離の無いランタイムで確認の承諾の印が無い `auto` の要求の拒否率が 100% (main の単体テスト)
- **SC-004**: Auto で動いている間、帯が出ている割合が 100%。読み上げは 1 回の切り替えにつき 1 回 (renderer の単体テストと E2E)
- **SC-005**: 実機 (quickstart) で、Win32Runtime のセッションを Auto に切り替えたあと、承認カードを出さずに Claude Code の分類器の判断で tool が実行・拒否されることを記録する (行えなければ「未実施」と書いてマージ)

## Assumptions

- 分類器の判断と拒否の表示 (`SDKPermissionDeniedMessage` → 拒否の表示) は既存のまま使う。AD-020 の「`auto` で拒否が黙って起きる」への対策は既存の拒否の表示で足りる
- `auto` の利用可否 (アカウント・モデルの条件) は Claude Code 側が判断する。Closta は選べるようにするだけで、使えなかったときは Claude Code の返す失敗を今の経路で出す
- 確認の文言・帯の文言は plan で決める ([ASSUMED: 文言は UI ラベルのポジティブリストで plan が決める])

## Out of Scope

- `acceptEdits` / `bypassPermissions` (M4 の I-3)
- sandbox・隔離の capability 判定の作り直し、隔離が分かったランタイムでの確認の扱いの見直し (I-3)
- 025 の権限モードの選択の移動と表記の変更
- 実行中に変えた権限モードをプリセット・再開の初期値に残すこと (AD-062 Consequences のまま)

## Dependencies

- 023 (AD-062) の実行中の権限モードの切り替えの経路 (`SessionControl` の `set-permission-mode`・`control-result`)。FR は継承し、値の集合だけを広げる
- 014 (O-4) の権限モードの警告の帯 (data-model §4)
- R-1 の `isAutoModeAllowed` / `autoModeStatus`
