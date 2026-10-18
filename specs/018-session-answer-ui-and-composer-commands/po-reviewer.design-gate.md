# po-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-17T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: この feature が実装するのは FR-001〜FR-004 (US-1)、FR-005〜FR-011 (US-2)、FR-012〜FR-014 (US-3)、FR-015 (US-4)、FR-016〜FR-017 (記録) である。SC-001〜SC-010 は全部が対象。R1 の後に変わったのは次の箇所。
  - U-8 / U-9 を足した (spec.md:50-51, :94-95)
  - US-2 AC5 を書き換え、AC8 を足した (spec.md:148, :151)
  - US-1 AC3 / AC5 に「答えた」の定義と空白の規則を足した (spec.md:127, :129)
  - FR-002 / FR-008 を書き換えた (spec.md:216, :225)
  - SC-003 に経路を通すテストを足した (spec.md:260)
- touched files に該当する charter / Confirmation:
  - session charter の In scope (`canUseTool` の permission 往復の配管、セッション状態の管理)
  - session charter の Journey 2 手順 4・Journey 3 手順 2
  - AD-052 Confirmation (SC-001 / SC-002・V-3)
  - AD-053 Confirmation (SC-003 / SC-004 / SC-010・V-3)。Decision 6 に U-8 を追記
  - ui charter の composer slash commands
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。検証の述語は、UX が壊れる面だけを E で扱った
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-053 Decision 6 の文言も architecture-reviewer に任せる
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:5 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 の指摘を直した設計一式 (spec / plan / tasks / data-model / contracts / quickstart) を見直した。主な変更点は次のとおり。
- URL の Elicitation: リンクを押すことを `accept` とし、その時点でカードを外す (U-8)
- main の検証: `content` を省略でき、あるときは 0〜32 キー。agents の registry が要求の形 (mode / openable / fields) を持つ (data-model §3 / §4、contracts C-1' / C-5')
- 全部が任意の form: 何も入れずに送れる (`{}`)。未入力の任意の項目はキーごと省き、真偽は常に送る (US-2 AC8、data-model §3「form の値の組み立て」)
- `AskUserQuestion`: 「答えた」を定義した。renderer / main / agents の 3 段で、前後の空白を除いて 1 コードポイント以上という同じ規則を使う (US-1 AC3 / AC5、data-model §1)
- 検証の述語: domain に置き、3 段が同じ関数を呼ぶ (U-9)
- テスト: URL の accept が renderer → main → agents を通る通しのテストを足した (FE-023)。BE-021 / BE-024 に C-5' / C-1' の表の全行を足した

確かめたのは、R1 の Critical / High が文面の上で解けたかと、直した部分に新しい UX の穴が無いかである。

## Findings

### R1 から解けたもの

- **R1 C-001 (URL の accept が main / agents で落ちる): resolved from prev**
  - main は `content` の省略を通す (data-model.md:137-139、contracts/session-answer-boundary.md:12, :20)
  - agents は registry の `{mode: 'url', openable: true}` で content を捨てて `{action: 'accept'}` を返す (data-model.md:160-165、contracts:74-77)
  - spec の側は AC5 (spec.md:148) と FR-008 (spec.md:225)
- **R1 H-001 (URL の流れ・カードの閉じ方・ボタンの文言): resolved from prev**
  - U-8 (spec.md:94) で、リンクが accept を兼ね、`elicitation_complete` ではカードを外さないと決めた
  - 文言は Clarifications (spec.md:106) と `ELICITATION_LABELS` (data-model.md:240) で揃っている
  - Edge Cases の spec.md:199-200 も揃っている
- **R1 H-002 (任意の項目を空にした form): resolved from prev**
  - US-2 AC8 (spec.md:151)、data-model.md:141-150
  - キーの件数を 0〜32 にした (data-model.md:137)
  - テストは FE-021 (tasks.md:56) と BE-020 (tasks.md:44)
- **R1 H-003 (空白だけの回答が黙って拒否になる・「答えた」が未定義): resolved from prev**
  - 規則は US-1 AC3 / AC5 (spec.md:127, :129)、FR-002 (spec.md:216)、data-model.md:31, :35-40
  - 負例は BE-010 / BE-011 / BE-013 / FE-011 (tasks.md:25, :27, :31, :35) にある
- **R1 H-004 (URL の accept を通しで確かめるテストが無い): resolved from prev**
  - FE-023 (tasks.md:59) が URL の場合と空の form の場合を renderer → main → agents でつなぐ。依存の規則に掛かったら段ごとに分ける、という逃げ道が書いてある
  - `tests/meter/meter-through.test.tsx:43-44` は既に `src/agents/` を import している。`src/main/app/session-ipc.ts` は electron を import していない (import は :1-16)。dependency-cruiser の対象は `src` だけ (quickstart.md:25)。このため 1 本でつなぐ形は実現できる見込みが高い

### [Medium] リンクを押すと accept は送られるが、ブラウザが本当に開いたかはどのテストも確かめない (M-006) (scope: feature) [new]

- **観察**:
  - U-8 の設計: リンクの `onClick` で「既定の動作を止めずに」`respondElicitation(…, 'accept')` を呼び、カードを外す (tasks.md:55、spec.md:94)
  - FE-021 のテスト (tasks.md:56) が確かめるのは 3 点だけ: `href` が `openUrl` であること、押すと accept が content なしで呼ばれること、カードが外れること
  - FE-023 (tasks.md:59) も capability の偽物から先の経路しか通さない
  - 既定の動作が止まっていないことを見るテストは無い。たとえば `preventDefault` していないこと、anchor の新しいウィンドウの要求が `setWindowOpenHandler` → `openExternalIfHttp` に届くことである
  - 開くことを確かめるのは quickstart V-3 #6 (quickstart.md:47) の実機の目視だけで、plan.md:218 (RK-04) は「起こせなければ未確認」としている
- **リスク/影響**:
  - 実装でうっかり `preventDefault` するか、外し方の順序を誤ると、こうなる: accept は MCP サーバーに届き、カードと承認待ちは消えるが、ブラウザは開かない
  - サーバーは手続きの完了を待ち続け、利用者には開き直す口が無い (L-003)
  - しかも全部のテストが緑のまま出荷される。US-2 の URL の流れの主な価値が、自動では守られない
- **推奨アクション**: FE-021 のテストに、リンクの click event が `defaultPrevented === false` であることの検査を足す。あわせて、accept を送る処理が anchor の既定の動作より先にカードを DOM から外さないことか、外しても既定の動作が成り立つことを、jsdom で観察できる形で書く。main の側は、`window.ts` の `setWindowOpenHandler` が http(s) の URL で `openExternalIfHttp` を呼ぶ正例を、navigation-policy か window の単体に足す (RK-08 は負例しか求めていない。plan.md:222)
- **根拠**: spec US-2 AC5 / U-8、SC-003 の計測経路
- **scope 根拠**: 本 feature の tasks (FE-021 / FE-023) で直せる

### [Medium] agents の側で断った Elicitation が利用者に見えない。待ちの上限 4 が spec に無い (M-001) (scope: feature) [unresolved from prev]

- **観察**: `ELICITATION_MAX_PENDING = 4` を超えた要求は黙って decline になる (data-model.md:180、contracts:80)。spec の Clarifications と Assumptions には、この上限も、利用者に何を見せるかも無い (spec.md:105 にあるのは文字列と件数の上限だけ)
- **推奨アクション**: R1 と同じ。棚卸しで扱う (AD-050)

### [Medium] 最初のプロンプトの前は slash command の候補が出ないことが spec に無い (M-002) (scope: feature) [unresolved from prev]

- **観察**: US-3 AC4 (spec.md:168) と Edge Cases (spec.md:191-207) に、最初のプロンプトの前 (init が届く前) の限界が書かれていない
- **推奨アクション**: R1 と同じ

### [Medium] 書きかけの回答や form の値が、セッションを切り替えると消えることが決まっていない (M-003) (scope: feature) [unresolved from prev]

- **観察**: 入力の値はカードの component の state だけに持つ (data-model.md:195-196)。spec の Edge Cases には、切り替えたときの振る舞いが無い
- **推奨アクション**: R1 と同じ

### [Medium] 「編集して再試行」で戻す文が、拒否された文と同じだと言える根拠が無い (M-004) (scope: feature) [unresolved from prev]

- **観察**: 戻す文は「拒否の行より前の最も近い `user-*`」から選ぶ (data-model.md:215)。quickstart V-3 #11 (quickstart.md:52) は、拒否された入力と戻った文が同じかを今も記録しない
- **推奨アクション**: R1 と同じ

### [Medium] US-1 AC2 の「Claude の次の応答が回答を前提に進む」は判定が主観になる (M-005) (scope: feature) [unresolved from prev]

- **観察**: spec.md:126 の Then に残っている。括弧書きの「tool_result に回答が入る」が記録できる事実だが、主観の句も Then に並んでいる。SC-001 (spec.md:258) も AC1〜AC5 をそのまま引いている
- **推奨アクション**: R1 と同じ

### [Low] accept の後にカードが外れると、URL をアプリの中から開き直せない (L-003) (scope: feature) [new]

- **観察**: U-8 は、手続きを済ませずに閉じたときの回復を MCP サーバーの側に任せている (spec.md:94)。カードを外した後に URL が残る場所は無い。`elicitation_complete` の行は完了のときにしか出ない (spec.md:149)
- **補足**: middle click (auxclick) で開いたときは `onClick` が発火しない。ブラウザは開くが accept は送られず、カードが残る。利用者がもう一度押せば回復できるので害は小さいが、どこにも書かれていない
- **推奨アクション**: 意図した設計であることを Out of Scope か Edge Cases に 1 行書く

### [Low] Elicitation を待つセッションも、監視ビューでは「承認待ち」と出る (L-001) (scope: feature) [unresolved from prev]

### [Low] User Story の価値が charter の KPI に紐付いていない (L-002) (scope: feature) [unresolved from prev]

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-006 | `手続きに進む\|URL.{0,30}送る\|fields: null.{0,40}accept\|1〜32\|キーが 1` (spec_dir *.md) | 7 | data-model.md:111 (スキーマの項目数で、content の件数ではない) / :193 / :240、contracts:76、spec.md:94 / :106 / :148、tasks.md:46 / :56。URL のリンクを押したときに既定の動作が保たれることを確かめるテストの記述は 0 件 |
| (R1 C-001 の解消の確認) | `fields: null.{0,40}accept` | 1 | contracts:76 (form の `fields: null` だけを decline にする。URL は registry の `mode` で分けている。data-model.md:160-165) |

## Verdict

- Critical: 0
- High: 0
- Medium: 6
- Low: 3
- Round inheritance: resolved from 1: 5 (C-001 / H-001 / H-002 / H-003 / H-004) / unresolved: 7 (M-001〜M-005 / L-001 / L-002。Medium と Low は AD-050 により棚卸しで扱う) / new: 2 (M-006 / L-003)
