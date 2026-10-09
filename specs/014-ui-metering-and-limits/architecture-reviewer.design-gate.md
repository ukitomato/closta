# architecture-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T00:00:00+09:00 (design-gate R3)
**Reviewer**: architecture-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 3 (前回 = R2。`design-gate.md.20261007T184052` と、R2 の時点の本ファイル)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-019 / SC-001〜SC-007 をすべて読んだ。本 reviewer が主に見たもの:
  - FR-003 / FR-010 / FR-013 / FR-014 / FR-015 / FR-016 / FR-018 / FR-019
  - SC-002 / SC-005 / SC-006 / SC-007
- touched files に該当する charter と Confirmation:
  - ui charter: In scope :44-76、Out of scope :78-93 (:83 隔離状態の判定)、業務ルール :146-155、KPI :157-168、Cross-domain :170-189
  - session charter: Out of scope :56-66、業務ルール :130-141、Cross-domain :181-192、Related Specs :206-243
  - isolation charter: :41-43 (可視化ポリシー・SAFE_SANDBOX_KINDS)、:89-93、:119
  - `_overview.md`: 帰属 :100-101、Cross-domain invariants :140-156
  - glossary: :184、:423-428 (Isolation badge)、:479、:689-694 (SafePermissionMode)、:936
  - ADR:
    - AD-047 の Decision 1〜5・Consequences・Confirmation
    - AD-031 の Decision 1 と訂正 1・2
    - AD-046 の Decision 4・6、Consequences :43、訂正 :57-72
    - AD-044 の Decision 1・3・6
    - AD-041 (a)(c)(g)、AD-043 の Decision 2・6、AD-034、AD-045 の Decision 2
    - AD-020 の危険度表、AD-019 :33,:39、AD-025 §7、AD-035、AD-037 D1
  - Constitution: III〜V と IX〜XV の文言の解釈 (I / II / III / VI / VII の実装上の遵守は platform-boundary-reviewer の担当)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`modelId` の検証の正本の一本化も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:4 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / a11y / ux reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1。内容は次の 3 つ。
  - AD-047 の訂正節を確かめる手順が無い (L-206)
  - M-202 にテストが無い (C に数えた)
  - observability は RK-14 で決着し、FR-018 の回帰は既存のテストを書き換えずに通す方針で守られる

## スコープ要約

2026-10-08 に直した design (spec / plan / data-model / research / quickstart / tasks) を、R2 の指摘と照らして読んだ。

R2 の High (HG-01) は、次の手当てで解消した。

- AD-047 に日付つきの訂正節を足すと利用者が決めた (2026-10-08)。plan の ADR 節 #1〜#3 と SH-013 がそれを持つ
- spec の U-3 / :43 / FR-003 と plan :12 を、設計の字面に直した
- 実機の形を観測する手段 (前回の M-104 / HG-02) は quickstart の「形の控え方」(アプリの外の CLI) と plan RK-14 (アプリの中の観測点は足さない。判断は roadmap に残す) で閉じた

一方、前回の Medium と Low の 6 件は、文書に手が入っていない。

新しく見つかったのは次の 3 系統である。

- 訂正 #3 (昇格値の置き場) の根拠が、観察できる記録と合っていない
- HG-06 の手当てで入った隔離の文言の規則は、isolation domain の可視化ポリシーにあたる。isolation charter に記録が無い
- 字面の残り・用語・検証手順の小さい漏れ

ARCH-6 (config / env) は該当なし (新しい env のキー・feature flag・設定ファイルは無い)。

ARCH-5 は `_overview.md` の invariants (III / IV / V / VII / IX / X / XII) と照合した。違反は無い。

- `meter` は port を通り、main を経由しない
- 永続化しない
- agents は SDK 非依存の 2 モジュールだけを足す
- 対応表は同じ PR で直す
- quickstart の CLI の手順はアプリの外で、`src/` に stream の解析を足さない

| 前回の ID (gate の ID) | 判定 | 今回の ID |
|---|---|---|
| H-101 (HG-01) | resolved from prev (字面の残り 2 か所は L-204) | — |
| M-101 (MG-05) | unresolved from prev | M-201 |
| M-102 (MG-01) | unresolved from prev | M-202 |
| M-103 (MG-13) | unresolved from prev | M-203 |
| M-104 (HG-02) | resolved from prev | — |
| L-101 | unresolved from prev | L-201 |
| L-102 | unresolved from prev | L-202 |
| L-103 | unresolved from prev | L-203 |

## Findings

### [Medium] U-1 の承認の範囲より広く session のコードに手を入れるのに、plan は全部を「U-1 で承認された例外」と書いている。ui charter と session charter の記録も足りない (M-201) (scope: feature)

**unresolved from prev** (R2 M-101 / gate MG-05)

- **観察**:
  - `plan.md:78` は今も「監視ビューの行の短い理由・稼働中のストアの `meters`・行と派生値の切り出し」を「U-1 で承認された例外」とする。U-1 の字面 (`spec.md:66`) が対象にするのは、次の 2 つだけである。
    - session の契約
    - 監視ビューの行の短い理由と再ログインの導線・稼働中のストアの `meters`
  - U-1 の外にある session の変更:
    - FR-018 の切り出し (`spec.md:236-239`。FE-001〜FE-003)
    - FR-019 のフォーカスの移動。`features/session/focus-handoff.ts` を新設し、`LivePane` / `RunningSessionRow` の押下の処理・`data-live-pane`・見出しの `tabIndex` に手を入れる (`data-model.md:269-284` / `tasks.md:128`)
    - session の view の新しい API `RunningSessionsView.runtimeAutoMode` (`plan.md:43` / `:213` / `tasks.md:105`)。HG-06 の手当てで、隔離の文言の入力にもなった
    - `PERMISSION_MODE_LABELS` を chat の表から取る形 (`research.md:149` / `tasks.md:105`)
  - FR-018 / FR-019 の持ち主の根拠は、roadmap の system-scope の記録 (`spec.md:55-56`。「義務の扱い」の表) であって U-1 ではない。
  - SH-013 の記録の範囲:
    - session charter (`tasks.md:143`) に足すのは、キー・`meter`・`meters` と「U-1 の範囲・FR-018 の切り出し」だけ。FR-019・`runtimeAutoMode`・表示名の出所は無い
    - ui charter (`tasks.md:144`) は Related Specs と Provider の表記だけ。先例の O-3 は、例外を ui charter の In scope (`ui charter:54-59`) と session charter の Related Specs (`session charter:233-240`) に 1 つずつ書いている
- **同種事象探索**:
  - `U-1 で承認|U-1 の範囲`: 3 件 (plan.md:78 / plan.md:235 / tasks.md:143)
  - `runtimeAutoMode`: 3 件 (plan.md:43 / plan.md:213 / tasks.md:105)
  - `focus-handoff`: 7 件 (data-model.md:271 / tasks.md:128 / plan.md:45,133,225,326 / research.md:115)
- **リスク/影響**:
  - domain をまたぐ変更の承認の範囲 (AGENTS.md「domain の分割は人間が承認する」) が、実際の変更より狭く読める。
  - charter は domain の境界の正本である。例外が載らないので、次の feature は「ui は session の操作 UI を触らない」(ui charter Out of scope :86-93) と読む。
  - `runtimeAutoMode` は runtime の能力を session の view を通して shell に渡す経路で、どの charter にも載らない。
- **推奨アクション**:
  1. `plan.md:78` の根拠を 2 つに分ける。
     - U-1: 契約・行の短い理由と導線・`meters`
     - spec の「義務の扱い」(roadmap の system-scope の持ち主の記録): FR-018 / FR-019
     - `runtimeAutoMode` と `PERMISSION_MODE_LABELS` の取り方も実名で書く。U-1 の外にあたるなら、利用者の確認に回す。
  2. SH-013 の session charter の項目に、FR-019 (消える前にフォーフォーカスを移す・印 2 つ)・`RunningSessionsView.runtimeAutoMode`・`PERMISSION_MODE_LABELS` の出所を足す。
  3. SH-013 の ui charter の In scope に、O-3 と同じ形で「O-4 の例外 (U-1。2026-10-05 承認)」の段落を足す。
- **根拠**: AGENTS.md「gate の原則」/ ui charter Out of scope / O-3 の charter の記録の先例 / ARCH-2
- **scope 根拠**: plan / tasks と、SH-013 が触る 2 つの charter で閉じる

### [Medium] 間引きの鍵の寿命が決まっていない。task の鍵は外れる規則が無く、tool の鍵も「保留を捨てる」だけで追跡の枠を空けるかが書かれていない (M-202) (scope: feature)

**unresolved from prev** (R2 M-102 / gate MG-01)

- **観察**:
  - FR-013 (`spec.md:212`) は「task ごとの状態をセッションスレッドにも renderer にも持たない (AD-044 Decision 6)」と書く。
  - 一方で `data-model.md:110-113` の間引きは次のとおりである。
    - 鍵 `tool:<toolUseId>` / `task:<taskId>` ごとに保留の値を持つ
    - 同時に追う鍵は 64 まで。超えた新しい鍵の更新は捨てる
    - 取り消しは「保留を捨てる」だけ (tool の結果・assistant・result・`finish()`)
    - 鍵を追跡の集合から外す規則は、tool にも task にも無い
  - 行が作られるのは `is_backgrounded === true` の task だけ (`src/domain/session/system-event.ts:129`) である。ところが `task_progress` は前景の subagent の tool ごとにも届く (`research.md:68`)。行の無い task の更新も、鍵の枠と 20 件/秒の枠を使う。
  - BE-041 のテスト (`tasks.md:111`) は「65 個目の鍵を捨てる」だけで、枠が空くことのテストは 0 件である。
- **同種事象探索**:
  - `task:<taskId>|同時に追う|64 まで|65 個目`: 6 行 (plan.md:28 / data-model.md:110,112 / tasks.md:110,111 ほか同じ行の重複)
  - `寿命|忘れる|鍵を外`: 0 件 (近い字面は取り消しの data-model.md:113 だけ)
- **リスク/影響**:
  - 長いセッションで異なる tool / task の id が 64 に達すると、tool の経過時間 (US-4 AC3) と背景の task の進み具合 (US-4 AC5) が、セッションの終わりまで黙って出なくなる。
  - FR-013 の字面と data-model §2 が食い違ったまま実装に入る。
- **推奨アクション**:
  1. data-model §2 に鍵の寿命を書く。例:「保留があるか、最後の送信から 1 秒以内の鍵だけを追い、それ以外は忘れる。取り消しは鍵も外す」。
  2. FR-013 を「task の状態 (実行中・完了など) を持たない。間引きの 1 秒以内の保留は除く」と言い換える。
  3. 行の無い task の更新も 20 件/秒の枠を使うことを §2 に書く。
  4. BE-041 にテストを足す。
     - 64 個の鍵が 1 秒以上静かになった後に、新しい鍵が通る
     - 取り消した tool の鍵が枠を空ける
- **根拠**: AD-044 Decision 6 / AD-047 Decision 3 / spec FR-013 / H (この指摘を検出するテストが無い)
- **scope 根拠**: data-model §2・FR-013・tasks BE-041 で閉じる

### [Medium] 「ターン」に 2 つの意味がある。失敗の理由の「ターン数の上限」はモデルとの往復の数、使用量のタブの「ターン数」はアプリが受けた result の数 (M-203) (scope: feature)

**unresolved from prev** (R2 M-103 / gate MG-13)

- **観察**:
  - `max-turns` の全文「ターン数の上限に達したため止まりました」(`data-model.md:216`) と短い理由「ターン上限」(`:224`) が受けるのは、SDK の `error_max_turns` である。この上限は `num_turns`、つまり「1 ターンの中のモデルの往復の数」(`research.md:38`) に対するものである。
  - 一方、使用量のタブの「ターン数」(`data-model.md:185` / `:237`) は、アプリが受けた result の数である (`research.md:90`)。
  - spec の中でも同じ語が混ざる。
    - `spec.md:165` (Edge Cases「費用もターン数も 0」) と `:182` (FR-001「ターン数の上限」) は往復の意味
    - `spec.md:32` / `:126` / `:134` / `:204` は result の数の意味
  - glossary の「ターン数」(`docs/glossary.md:184`) は X-6 の上限 (SDK の maxTurns)。「Turn」の項目は無い。SH-001 (`tasks.md:15`) の追加の一覧にも入っていない。
- **同種事象探索**: `ターン数|ターン上限` (014 の文書): 19 件。意味が衝突するのは次の 3 組。
  - data-model.md:216,224 (往復) と :185,237 (result の数)
  - spec.md:165,182 (往復) と :32,126,134,204 (result の数)。tasks.md:93 / quickstart.md:29 も result の数
  - glossary.md:184 (往復)
- **リスク/影響**:
  - 使用量のタブのターン数が小さいのに「ターン数の上限で止まった」と出る。利用者は同じ数だと読む。
  - Principle XIV の「同じ語を同じ概念に使う」に反する。
- **推奨アクション**:
  1. SH-001 に「Turn (ターン)」を足す。
     - 定義: プロンプト 1 つから、その `result` まで (`turn.turns` が数える単位)
     - Counterexamples: SDK の `num_turns` / `maxTurns` / `error_max_turns` が数えるのはモデルとの往復
  2. `max-turns` の全文と短い理由を往復の語に改める (例:「モデルとの往復の回数の上限に達したため止まりました」/「往復上限」)。`spec.md:165` / `:182` も同じ語にそろえる。
  3. glossary :184 にも往復の注記を足す。
- **根拠**: Constitution Principle XIV / ARCH-7
- **scope 根拠**: glossary (SH-001) と data-model §5 で閉じる

### [Medium] 訂正 #3 (昇格値の綴りの置き場) の根拠「採択の時点で設計に既にあった」が、観察できる記録と合っていない。AD-031 の「何を書いたか」で判定すると、決定の変更に読める (M-204) (scope: feature)

**new**

- **観察**:
  - `plan.md:252` は、3 つの差について「どれも採択 (2026-10-05) の時点で設計に既にあった」とする。#1 / #2 には記録の裏付けがある。
    - #1 は R1 H-05 (2026-10-04)
    - #2 は R1 security M-002 の `toolUseId`
  - #3 は記録と合わない。
    - 採択の前の観察できる記録は R1 の手当ての字面だけで、そこには「昇格値は domain だけ (項目 16 に例外なし)」(`design-gate.md.20261004T063000:29`) とある。これは AD-047 Decision 5 (`docs/decisions/0047-session-meter-and-failure-reasons.md:37`) と同じ字面である。
    - renderer の表 `PERMISSION_MODE_NAMES` を決めたのは research R-15 (`research.md:146-151`) で、research は 2026-10-07 に書いたもの (`research.md:3`)。
    - plan 自身も「今の renderer に昇格値の綴りは 0 件で、本 feature が初めて置く」と書く (`plan.md:258`)。
  - 予定している訂正の字面 (`plan.md:263`) は、綴りを置いてよい場所を {domain} から {domain、renderer の表示名} に広げる。
    - AD-031 の訂正 2 (`0031:36-42`) は、判定の対象を「何を書いたか」とする。境目は「読み手が同じ決定に至るか」(`0031:102`)。
    - AD-047:37 を読んだ人は「renderer に昇格値の綴りを置かない」と結論する。訂正の後は「置いてよい」になる。
  - 利用者は 2026-10-08 に、3 つとも訂正として扱うと決めた (`plan.md:260` / `research.md:151` / `spec.md:220`)。本指摘はその判断を覆すものではない。指摘するのは次の 2 点である。
    - plan が #3 に付けた根拠が、観察できる記録と合わない
    - 訂正節の作業 (`tasks.md:148`) は発見の経緯 (R2 HG-01 / HG-04) だけを書き、採択の時点の設計を示す根拠を書かない
  - 先例の AD-046 の訂正 (`0046:57-60`) は、同じ日に承認した spec の FR-009 / plan の FE-011 を根拠に挙げている。
- **同種事象探索**: `時点で設計に既にあった|書き誤り|domain だけ` で 7 件。
  - plan.md:252,258,263 / research.md:151 / spec.md:73 / AD-047:37 / design-gate.md.20261004T063000:29
  - 採択の時点の設計にあったことを示す根拠は 0 件
- **リスク/影響**:
  - pr-gate の ADR-drift モードは、訂正節を AD-031 の「何を書いたか」で読む。根拠が無いまま「domain だけ」を「agents に置かない」に読み替える節は、決定の変更が訂正節に書かれた形に見え、毎 round 同じ指摘が出る。
  - 後の読み手は、「domain だけ」が意図だったのか誤記だったのかを確かめられない。
- **推奨アクション** (最小案から):
  1. `plan.md:252` の 1 文を分ける。
     - #1 / #2 は採択の時点の設計にあった (根拠: R1 H-05 / R1 security M-002)
     - #3 は「2026-10-08 に利用者が、Decision 5 の意図は項目 16 の走査範囲 (`src/agents/`。`scripts/constitution/allowlists.mjs:363`) であり、『domain だけ』は書き誤りと判断した」と書く
     - 同じ根拠を、訂正節の #3 にも書く (誰が・いつ・何を根拠に)
  2. 2026-10-05 に承認した spec の字面に、昇格したモードの名前を出す表示 (U-6 の帯・US-4 AC1 の「{モード}」) があったなら、それを #3 の根拠に挙げる。
  3. どちらの根拠も示せず、規則の中身が変わると利用者が読むなら、#3 だけを小さな後続 ADR に置く (AD-031 Decision 1)。#1 / #2 は訂正節のままでよい。
- **根拠**: AD-031 Decision 1 と訂正 2 / Constitution 改定手順 1 / AD-047 Decision 5 / AD-046 の訂正の先例 / ARCH-3
- **scope 根拠**: plan の ADR 節と SH-013 の訂正節の中身で閉じる

### [Medium] 権限モードの警告の帯の隔離の文言 (HG-06 の手当て) は、isolation domain の可視化ポリシーにあたる。ui の data-model が暫定の規則を定めているのに、isolation charter に記録が無い (M-205) (scope: feature)

**new**

- **観察**:
  - `data-model.md:172-176` は、ランタイムの `autoModeStatus` から隔離の文言を決める。文言の正本は `:245`、作業は `tasks.md:105-106`、方針は `plan.md:213` にある。
    - `unavailable` → 「このランタイムには隔離がありません」
    - `allowed` / `undetermined` → 「このセッションの隔離をアプリは確かめていません」
  - 持ち主の記録はどれも isolation 側を指す。
    - isolation charter :41 は「隔離状態の可視化ポリシー — 何をもって『隔離されている』と表示するかの定義」を isolation の In scope に置く
    - glossary の Isolation badge (`docs/glossary.md:428`) は「`isolation`（判定）/ `ui`（表示）」
    - ui charter :83 は「隔離状態の判定 → isolation (本 domain はそれを表示する)」
  - 入力の側の事実:
    - `autoModeStatus` は `autoModeSafe = sandbox ∈ SAFE_SANDBOX_KINDS` から導かれる (`src/domain/runtime/capabilities.ts:72,85-90,165-169`)
    - `SAFE_SANDBOX_KINDS` は isolation が持ち、I-3 で runtime から移す (isolation charter :42-43)。seccomp を `autoModeSafe` に織り込むかも I-3 が決める (:92-93)
    - 予定の I-2 の隔離バッジは `sandboxKind` で分岐する (`src/domain/runtime/dto.ts:40-42`)。O-4 の帯とは入力が違う
  - 記録の範囲: SH-013 は暫定であることを roadmap の I-2 / I-3 の行に書き (`tasks.md:145`)、SH-001 は glossary に書く (`tasks.md:15`)。SH-013 の対象に isolation charter は無い。014 の文書で isolation charter に触れるのは、:119 の引用 (`data-model.md:175`) だけである。
- **同種事象探索**:
  - `unsafeModeNoIsolation|unsafeModeIsolationUnverified|隔離がありません`: 9 件 (data-model.md:173,174,245×3 / plan.md:213 / tasks.md:105×2,106)
  - SH-013 の isolation charter の編集: 0 件
- **リスク/影響**:
  - 隔離の文言の規則が、ポリシーの持ち主の charter の外にできる。
  - I-3 が `SAFE_SANDBOX_KINDS` を移すか seccomp を織り込むと、帯の「隔離がありません」の意味が黙って変わる。
  - I-2 のバッジ (`sandboxKind` 由来) と O-4 の帯 (`autoModeStatus` 由来) が、同じセッションについて別のことを言いうる。これは isolation charter :119「隔離されているかを利用者が推測する必要があってはならない」に反する。
- **推奨アクション**:
  1. SH-013 の対象に `docs/domains/isolation/charter.md` を足し、Related Specs か Open Questions に 1 項目を書く。内容は「O-4 (ui) が権限モードの警告の帯で暫定の隔離の文言を出す。入力は runtime の `autoModeStatus` (`SAFE_SANDBOX_KINDS` 由来)。I-2 の隔離バッジの可視化ポリシーが定義されたら置き換える (持ち主 I-2 / I-3)」。
  2. roadmap の I-3 の行の注記に、「`SAFE_SANDBOX_KINDS` を移す・seccomp を織り込むときは O-4 の帯の文言を見直す」を足す。
  3. glossary に足す「権限モードの警告の帯」の Domain を「ui (表示) / isolation (隔離の文言のポリシー。O-4 の暫定)」とする。
- **根拠**: isolation charter :41 / :119 / glossary Isolation badge / ui charter Out of scope :83 / ARCH-2 / ARCH-5
- **scope 根拠**: SH-013 / SH-001 が触る charter・roadmap・glossary で閉じる

### [Low] glossary に足す「Quota banner」が、registry の element を採るかの判断 (SH-002) より前に書かれ、element と自作の部品のどちらを指すかが決まらない (L-201) (scope: feature)

**unresolved from prev** (R2 L-101)

- **観察**:
  - SH-001 (`tasks.md:15`) は、SH-002 (`tasks.md:16-18`) が `elements-quota-banner` を採るかを決める前に、Quota banner を glossary に足す。
  - 採らないときは、既存の部品で作る (`research.md:110`)。
  - 先例の Thread search (`docs/glossary.md:936`) は、Counterexamples に「registry の element を使わない」と書いている。
- **同種事象探索**: element 名を表示の名前にする新しい用語は 1 件 (SH-001 の Quota banner)
- **リスク/影響**: 対応表の `実装済み: <element>` の名前と、glossary の用語が別のものを指しうる。
- **推奨アクション**: Quota banner を、置き場所と役割 (中央のヘッダの下の帯) で定義する。SH-002 の結論の後、SH-012 と同じ PR で Counterexamples に「registry の element を使う / 使わない」を足す。
- **根拠**: Principle XIV / ARCH-7
- **scope 根拠**: glossary の 1 項目

### [Low] session の起動ダイアログの文言の表が chat の表に依存するようになる。ui charter の「依存される domain」の記録が追随しない (L-202) (scope: feature)

**unresolved from prev** (R2 L-102)

- **観察**:
  - R-15 (`research.md:149`) で、`features/session/labels.ts` の `PERMISSION_MODE_LABELS` を `features/chat/labels.ts` の `PERMISSION_MODE_NAMES` から取る形にする。`session/labels.ts` は今は domain だけを import している (`session/labels.ts:1-6`)。
  - ui charter :173 は「依存される domain: なし (最上層)」と書く。session から chat への import は既に 3 件ある (`LivePane.tsx:11` / `running-session-store.ts:11` / `session-event-decoder.ts:8`)。
  - SH-013 の ui charter の作業 (`tasks.md:144`) は、ここに触れない。
- **同種事象探索**: `from '@/features/chat` (features/session の非テスト): 3 件。O-4 で 4 件目 (labels)
- **リスク/影響**: 起動ダイアログ (session) の文言の持ち主が ui の表に移ったことが、charter から読めない。
- **推奨アクション**: SH-013 で ui charter の Cross-domain dependencies に、session の操作 UI が `features/chat` を読むこと (既存の 3 件と O-4 の `PERMISSION_MODE_NAMES`) を足す。
- **根拠**: AD-023 §7 (依存の向き) / ui charter Cross-domain dependencies / ARCH-4
- **scope 根拠**: 新しい import の記録は本 feature で閉じる。既存の 3 件の追随は system scope

### [Low] KPI「自作率」の計測の材料 (照合した候補名) が、新しい自作の部品の一部で作られない (L-203) (scope: feature)

**unresolved from prev** (R2 L-103)

- **観察**:
  - ui charter の KPI「自作率」(`:168`) は、PR の説明を計測経路にする。
  - SH-002 (`tasks.md:16-18`) と R-09 (`research.md:101-108`) が照合するのは、Cost meter / Quota banner / Context display / Thinking indicator の 4 つと、使わない 2 つだけである。
  - 次の自作の表示は、照合する候補が書かれていない。
    - 権限モードの警告の帯 (FE-040)
    - task の行の進み具合と tool の経過時間の印 (FE-042 / FE-043)
  - 候補になりうるもの: AD-019 :33 / :39 の Agent status / Error state。`docs/ui-coverage.md:274` の Error state の行は、FailureBanner が自作である記録を持つ。
- **同種事象探索**: 照合の対象の表 1 件 (research R-09)。警告の帯の候補 0 件
- **リスク/影響**: Principle XIII Exceptions の「照合した候補名と不適合の理由」が PR にそろわず、KPI が 100% にならない。
- **推奨アクション**: SH-002 に、警告の帯と進み具合の印の候補 (Error state・Agent status など) の照合を足し、PR の説明と F 節の備考に書く。
- **根拠**: ui charter KPI「自作率」/ Constitution XIII Exceptions / ARCH-2
- **scope 根拠**: SH-002 の作業の範囲

### [Low] AD-047 Decision 2 の閉じた列挙 (「数・真偽・列挙・モデルの id だけ」) の字面が、spec の U-2 と plan に残っている (L-204) (scope: feature)

**new** (前回 H-101 の字面の残り)

- **観察**:
  - `spec.md:67` (U-2) は「数と列挙の値だけを運ぶ」と書く。U-3 には 2026-10-08 の訂正の注記がある (`spec.md:73`) が、U-2 には無い。設計は、モデルの id と形を検証した tool の id も運ぶ (`spec.md:190` / `data-model.md:55`)。
  - `plan.md:266` は「Decision 2 の『数・真偽・列挙・モデルの id だけを運ぶ』の中」と、訂正の前の字面で引く。
- **同種事象探索**: `モデルの id だけ|数と列挙の値だけ` で 3 件 (spec.md:67 / plan.md:257 / plan.md:266)。plan.md:257 は差の表の中で ADR を引いたものなので、直す対象ではない
- **リスク/影響**: pr-gate の ADR-drift モードや security-reviewer が、U-2 の字面と `toolUseId` を照合して食い違いを挙げ直す。
- **推奨アクション**:
  - `spec.md:73` の注記に「U-2 の『数と列挙の値』は、モデルの id と形を検証した tool の id を含む (FR-003 / data-model §2)」を 1 行足す
  - `plan.md:266` の引用を、訂正の後の字面 (「… tool の id」まで) に直す
- **根拠**: AD-047 Decision 2 と予定の訂正 #2 / ARCH-3
- **scope 根拠**: spec と plan の 2 行

### [Low] domain に足す `PermissionModeKey` (観測した権限モード。6 値 + `unknown`) が glossary に無い。`SafePermissionMode` (起動で選べる 3 値) との区別が用語として書かれない (L-205) (scope: feature)

**new**

- **観察**:
  - `data-model.md:49` と BE-001 (`tasks.md:38`) は、`src/domain/session/meter.ts` に `PermissionModeKey` (昇格値を含む 7 値) を置く。R-15 (`research.md:149`) は、その 7 値に表示名を付ける。
  - glossary の `SafePermissionMode` (`docs/glossary.md:689-694`) と `LaunchInput` (`:479`) は、「昇格 3 値は型で持てない (正の構成)」とする。
  - SH-001 (`tasks.md:15`) の追加の一覧に、観測した権限モードの用語は無い。
- **同種事象探索**: `PermissionModeKey` を定義・使う箇所は data-model.md:49,57 / tasks.md:38,46 / plan.md:272 ほか。glossary の項目は 0 件
- **リスク/影響**: 「選べる権限モード」と「観測した権限モード」の 2 つの型が同じ session の domain に並ぶのに、用語が分かれない。起動の側に 7 値の型を使う取り違えを、文書の上で防げない (Principle III の正の構成)。
- **推奨アクション**: SH-001 で、「Observed permission mode (観測した権限モード。`PermissionModeKey`)」を足すか、`SafePermissionMode` の Counterexamples に 1 行足す。内容は「実行中に観測したモード (`PermissionModeKey`。O-4) は 7 値で、表示と比較にだけ使い、起動の設定に書き戻さない」。
- **根拠**: Principle XIV / ARCH-7
- **scope 根拠**: glossary の 1 項目

### [Low] AD-047 の訂正節が「足すだけ」で、Decision と Consequences の本文を書き換えていないことを確かめる手順が無い (L-206) (scope: feature)

**new**。H の観点。

- **観察**:
  - SH-013 (`tasks.md:148`) は、「Decision と Consequences の本文は書き換えない」とする。
  - 検証の手順 (SH-014 `tasks.md:150` / quickstart V-1 `quickstart.md:5-12`) には、`docs/decisions/0047-*.md` の差分を見る項目が無い。
- **同種事象探索**: quickstart の V-1〜V-3 の中で `docs/decisions/` を対象にする行: 0 件
- **リスク/影響**: accepted の ADR の決定を書き換えたときに、検出するのが人の目だけになる (ARCH-3 で High 以上にあたる事象)。
- **推奨アクション**: quickstart V-1 に 1 行足す。「`git diff main...HEAD -- docs/decisions/0047-session-meter-and-failure-reasons.md` が追加の行だけ (日付つきの訂正節) で、Decision 1〜5 と Consequences の行に削除・変更が 0」。SH-014 の確認の対象に含める。
- **根拠**: AD-031 Decision 1 / 本 reviewer の ARCH-3 / H (検出の手段)
- **scope 根拠**: quickstart と SH-014 の 1 行

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-201 | `U-1 で承認\|U-1 の範囲` | 3 | plan.md:78 / plan.md:235 / tasks.md:143 |
| M-201 | `runtimeAutoMode` | 3 | plan.md:43 / plan.md:213 / tasks.md:105 |
| M-201 | `focus-handoff` | 7 | data-model.md:271 / tasks.md:128 / plan.md:45,133,225,326 / research.md:115 |
| M-202 | `task:<taskId>\|同時に追う\|64 まで\|65 個目` | 6 行 | plan.md:28 / data-model.md:110,112 / tasks.md:110,111 |
| M-202 | `寿命\|忘れる\|鍵を外` | 0 (鍵を外す規則) | 近い字面は data-model.md:113 (保留の取り消し) だけ |
| M-203 | `ターン数\|ターン上限` (014 の文書) | 19 | 衝突: data-model.md:185,216,224,237 / spec.md:32,126,134,165,182,204 / tasks.md:93 / quickstart.md:29。glossary.md:184 |
| M-204 | `時点で設計に既にあった\|書き誤り\|domain だけ` | 7 | plan.md:252,258,263 / research.md:151 / spec.md:73 / AD-047:37 / design-gate.md.20261004T063000:29 |
| M-205 | `unsafeModeNoIsolation\|unsafeModeIsolationUnverified\|隔離がありません` | 9 | data-model.md:173,174,245 / plan.md:213 / tasks.md:105,106 |
| M-205 | `isolation charter\|domains/isolation` (SH-013 の編集の対象) | 0 | 引用だけ: data-model.md:175 |
| L-201 | glossary に足す element 名 | 1 | tasks.md:15 (先例 glossary.md:936) |
| L-202 | `from '@/features/chat` (features/session の非テスト) | 3 | LivePane.tsx:11 / running-session-store.ts:11 / session-event-decoder.ts:8 (+ research.md:149 で 1 件増える) |
| L-203 | 照合の対象の表 | 1 | research.md:101-108 |
| L-204 | `モデルの id だけ\|数と列挙の値だけ` | 3 | spec.md:67 / plan.md:257 (ADR を引いた行) / plan.md:266 |
| L-205 | glossary の `PermissionModeKey` / 観測した権限モード | 0 | 定義: data-model.md:49 / tasks.md:38 |
| L-206 | quickstart V-1〜V-3 の `docs/decisions/` | 0 | quickstart.md:5-20 |

## Verdict

- Critical: 0
- High: 0
- Medium: 5
- Low: 6
- Round inheritance:
  - resolved from 2: 2 (H-101 / M-104)
  - unresolved: 6 (M-101→M-201 / M-102→M-202 / M-103→M-203 / L-101→L-201 / L-102→L-202 / L-103→L-203)
  - new: 5 (M-204 / M-205 / L-204 / L-205 / L-206)
  - 未解消の 6 件は、R2 から重大度を変えていない (追加事実なし)
  - M-204 は R2 HG-04 (High) の後継ではない。利用者の判断 (2026-10-08) の後の、根拠の字面についての新しい指摘である
  - M-205 は HG-06 の手当てで入った規則から生じた
