# architecture-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: architecture-reviewer (default mode)
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-019 をすべて実装しています (US-1〜US-4 の失敗の理由・meter・Quota banner・使用量・進み具合と、預かった義務 FR-017〜FR-019)。SC-001〜SC-007 はすべて影響を受けます。D の観点で特に見たのは FR-003 / FR-004 / FR-010 / FR-014 / FR-015 / FR-016 と SC-002 / SC-005 / SC-006 です。
- touched files に該当する charter / Confirmation:
  - ui charter: Scope の「アプリのシェル」、Cross-domain dependencies の「面の状態」と「依存される domain」(:174)、KPI「表示網羅」、Related Specs
  - session charter: Key concepts (:119-138)、Cross-domain dependencies (:195-203)、Related Specs (:254-262)
  - `_overview.md`: 帰属の判断根拠 (:102-104)、Cross-domain invariants (III / IV / IX / XII)
  - AD-047 Confirmation: SC-001 / SC-002 / SC-006 と、状態通知のフィールドの差分 0
  - AD-041 Confirmation: `QUERY_OPTION_KEYS` の pin、項目 16
  - AD-044 Confirmation: 項目 21
  - AD-046 Decision 4 / 6 (右のペインのタブの表、置き場所の語彙)
  - AD-043 Decision 2 / 6、AD-034 (port、main を経由しない)
  - AD-031 Decision 1 (訂正節の規則)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (meter の値の検証は security が見る)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (code-gate で CONV M-001〜L-007 として出ている)
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage / database の各 optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-4 は計量と制限の表示の feature です。session の契約を 2 点広げます (`LaunchFailureReason` 10 → 18、`SessionEvent` に `meter` を足して 7 → 8)。agents には SDK 非依存の `live-signals.ts` / `meter-throttle.ts` を足し、renderer にはシェルの帯・目盛り・使用量のタブ・transcript の行を足します。あわせて O-7 と system-scope から預かった 4 つの義務を閉じます。

レイヤと境界の確認結果:

- main / preload / IPC の差分は 0 です。`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS`・`allowlists.mjs` は変えていません。
- 昇格値の綴りは `src/agents/` に 0 件です。置き場は `src/domain/session/meter.ts:23-31` と `features/chat/labels.ts:95-96` だけで、AD-047 訂正 #3 のとおりです。
- `PERMISSION_MODE_LABELS` は `Record<SafePermissionMode, string>` のままで、Principle III の選択肢は増えていません。
- シェルが面の状態に書くのは `setPanelTab` / `setPanelCollapsed` だけで、session のコンポーネントは focus を書きません (ui charter の「面の状態」のとおり)。
- domain の依存の向き (session → provider: `meter.ts:1`) は `_overview.md` の依存の図に沿っています。
- 項目 21 は ok で、`後続: O-4` の行は対応表に 0 件です。

前の段から引き継いだもの:

- design-gate R3 の MG-11 (訂正 #3): AD-047 :83-85 に「2026-10-08 に利用者が書き誤りと判断した」と記録されたので、人間の判断で閉じたものとして扱います。
- MG-09 (U-1 の範囲): plan :78 と session charter :254-262 に利用者の決定が記録されています。
- MG-12 (isolation charter への記録): code-gate の PB L-001 と同じ事象なので、重ねて出していません。
- 本 PR の diff には O-4 と関係のない chore のコミット `dc9ef2e` が入っています。pr-gate の scope には入っているので、M-003 で扱います。

## Findings

### [Medium] UI の「ターン数」が 2 つの別の数を指している。使用量のタブは「アプリが受けた result の数」、失敗の理由は「SDK の往復の数の上限」(M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/labels.ts:185` の `usageTurns: 'ターン数'` は、使用量のタブに `lastTurn.turns` を出します。これはセッションスレッドが result を数えた値です (data-model §4、research.md:90)。
  - `src/renderer/src/features/session/labels.ts:44` の `'max-turns': 'ターン数の上限に達したため止まりました。'` と `:94` の `'ターン上限'` は、SDK の `error_max_turns` の訳です。こちらの上限は `num_turns`、つまり「1 ターンの中のモデルの往復の数」です (research.md:38)。
  - glossary も同じ語を両方に使っています: `docs/glossary.md:373` (`max-turns` (ターン数の上限)) と `:569` (`turn` (… ターン数 …))。どちらが何かを定める項目はありません。
  - design-gate R3 の MG-10 (arch M-203) が手当てされないまま残っています。
- **同種事象探索**: `ターン数|ターン上限` を `src/renderer/src/features/**/labels.ts` と `docs/glossary.md` で検索して 6 件。labels.ts:185 / session/labels.ts:44,94 / glossary.md:184,373,569。
- **リスク/影響**: 同じセッションで、使用量のタブに「ターン数 3」、失敗の表示に「ターン数の上限に達した」と出ることがあります。利用者は 3 回で上限に当たったと読みますが、実際の上限は往復の数です。同じ語が 2 つの概念を指しており、Principle XIV の Ubiquitous Language の趣旨に反します。
- **推奨アクション**: どちらか一方の語を替えてください。例えば失敗の理由を「モデルの往復の回数の上限」(短い理由は「往復上限」) にするか、使用量のタブを「受けたターン」にします。glossary に「Turn (ターン)」の項目を足し、Counterexamples に `num_turns` (往復の数) との違いを書きます。data-model §5 の文言の表も同じ PR で直してください。
- **根拠**: Constitution Principle XIV / ARCH-7 / research R-08
- **scope 根拠**: labels.ts の 2 つ、glossary、data-model はどれも本 PR の touched files です。

### [Medium] AD-047 の Decision の並びが 1・2・3・5・4 で、Markdown で表示すると Decision 4 と 5 が入れ替わる。参照は全部ソースの番号に依っている (M-002) (scope: feature)

- **観察**:
  - `docs/decisions/0047-session-meter-and-failure-reasons.md` の :34-38 は `1.` `2.` `3.` `5.` (権限モードの昇格を観測したとき) `4.` (制御要求を呼ばない) の順に並んでいます。
  - CommonMark では番号付きリストの番号は最初の項目のものだけが使われ、続く項目の番号は無視されます。そのため GitHub の表示では「4. 権限モードの昇格…」「5. 制御要求を呼ばない」になります。
  - 一方、参照はどれもソースの番号です。「Decision 4 = 制御要求を呼ばない」を指すのは `docs/ui-coverage.md:196,197,199,262` と `docs/glossary.md:230`、「Decision 5 = 昇格」を指すのは `docs/glossary.md:1079` と `docs/roadmap.md:388` です。AD-047 の訂正節 :62,69,78 自身も同じです。
  - design-gate R3 の analyze S2 (Low。並び) に対する追加の事実は、表示で番号が逆転することです。
- **同種事象探索**: 複数行の `^5\. [^\n]*\n4\. ` を `docs/decisions` で検索して 1 件 (AD-047:37-38 だけ)。参照側は `AD-047 … Decision [45]` を docs で検索して 7 行 (上に列挙したもの)。
- **リスク/影響**: 表示された ADR を読むと、ui-coverage の E 節の `表示不要` の根拠 (Decision 4) が昇格の警告の決定を指して見えます。逆に glossary の警告の帯の根拠 (Decision 5) は制御要求の決定を指して見えます。AD-031 の判断基準「読み手が同じ決定に至るか」を、表示の段で崩しています。
- **推奨アクション**: どちらにするかは人間が決めてください。
  - (a) AD-047 が main に入るのは本 PR が初めてです (diff :288-292 の new file)。AD-041 の先例 (:31「main に入る前のものなので Decision 本文に畳み込んだ」) にならい、文言を変えずに 2 行の順を入れ替えます。
  - (b) Decision の本文に触れないなら、2026-10-08 の訂正節に 1 行足します: 「Decision はソースの番号で参照する。ソースは 1・2・3・5・4 の順に並び、Markdown の表示では 4 と 5 が入れ替わって見える」。
- **根拠**: AD-031 Decision 1 / AD-041 :31 / ARCH-3
- **scope 根拠**: AD-047 は本 PR の touched files (新規ファイル) です。

### [Medium] O-4 と関係のない chore のコミット `dc9ef2e` が feature の PR に入っている。共有の設定にプロンプトごとのプロセス起動を足し、`.codegraph/` の有無という条件を常に真にしている (M-003) (scope: feature)

- **観察**: `.pr-gate-scope.txt:1-6` に次の 6 ファイルがあります: `.claude/CLAUDE.md`、`.claude/settings.json`、`.codegraph/.gitignore`、`.mcp.json`、`.serena/.gitignore`、`.serena/project.yml`。どれも touched-files.txt に無く、O-4 と無関係です (code-gate.md:8 も scope から落としています)。具体的には次の 3 点です。
  - (a) `.claude/settings.json` (diff :30-40) が `UserPromptSubmit` の hook `codegraph.cmd prompt-hook` を足しています。プロンプトのたびにプロセスを起こす形です。これはルートの CLAUDE.md の最優先の規則「このマシンではプロセスを起こさない」と、`docs/discovery.md:129-131` (1 回の spawn に 400〜2,400ms) に反します。さらに `.cmd` は Windows でしか動かず、ローカルに入れた実行ファイルに依存します。個人の環境に依存する設定の置き場は `.claude/settings.local.json` と決まっています (`docs/discovery.md:506`)。
  - (b) `.codegraph/.gitignore` (diff :43-53) をコミットしたため、どの clone にも `.codegraph/` ディレクトリができます。すると `.claude/CLAUDE.md` (diff :15) の「If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision」は常に成り立たず、この条件が意味を失います。
  - (c) `.mcp.json` の `alwaysLoad: true` により、どのセッションでも `codegraph` が PATH にあることが前提になります。
- **同種事象探索**: pr-gate の scope と touched-files の差を数えて、この 6 件 (ほかの差は本 spec dir の設計文書)。ルートの `.gitignore` で `codegraph|serena|\.mcp` を検索して 0 件。
- **リスク/影響**: O-4 をマージすると、レビューの対象外の環境設定が main に入ります。主の開発機ではプロンプトごとに数秒の遅れが常に加わり、CodeGraph を使うかを決める条件も壊れます。
- **推奨アクション**: `dc9ef2e` を別の chore の PR に分けてください。分けない場合の最小案は次の 3 つです: hook を `.claude/settings.local.json` に移す。`.codegraph/.gitignore` をコミットせず、ルートの `.gitignore` に `/.codegraph/` を足す。`.claude/CLAUDE.md` の条件を「索引がある (`.codegraph/` にデータベースがある)」に改める。利用者が自分で入れたコミットなので、採否は人間の判断です。
- **根拠**: CLAUDE.md「このマシンではプロセスを起こさない」/ docs/discovery.md:129-137,506 / ARCH-6 / Principle XI の Why (1 feature = 1 branch = 1 spec)
- **scope 根拠**: 本 PR の diff に入っていて、このブランチの中で外すか直すかできます。

### [Low] `fail()` が `failure` を `state: error` より先に送るようになった。agents と renderer の間のイベントの順の契約が変わったのに、契約の文書に書かれていない (L-001) (scope: feature)

- **観察**:
  - `src/agents/sdk-agent-session.ts:349-356` で、`emit({ kind: 'failure' })` が `transition({ kind: 'fail' })` の前に移りました。
  - `fail()` を呼ぶのは 4 か所 (:444 / :454 process-crashed、:578 ターンの失敗、:620 stream-protocol-error) なので、X-1 からある失敗の順も変わります。
  - renderer はこの順を前提にしています (:351-352 の注記。読み上げが状態の変化の時点で `failureReason` を読む)。
  - しかしこの順は 014 data-model §1 / §2、AD-047、005 data-model:71 (`failure` の定義)、session charter の「失敗の理由のキー」(:119-123) のどこにも書かれていません。
- **同種事象探索**: `sdk-agent-session.ts` で `\bfail\(` を検索して 4 件 (:444, :454, :578, :620)。
- **リスク/影響**: 後続 (X-6 の resume / fork など) が `fail()` を通らずに失敗を送ると、読み上げから理由が黙って抜けます。契約がコードのコメントにしか無いためです。
- **推奨アクション**: data-model §1 と session charter の `LaunchFailureReason` の項に 1 行足してください: 「`failure` は `state: error` より先に送る (renderer は失敗に入った時点で理由を読む)」。
- **根拠**: AD-047 Decision 1 / session charter Key concepts / ARCH-5
- **scope 根拠**: data-model と session charter は本 PR の touched files です。

### [Low] glossary の漏れが 2 つ。観測した権限モードの `PermissionModeKey` の項目が無い。「中央のヘッダ」の定義が O-4 の目盛りと帯を含まない (L-002) (scope: feature)

- **観察**:
  - `PermissionModeKey` (6 値 + `unknown`。`src/domain/session/meter.ts:23-32`) は glossary に 0 件です。起動で選べる `SafePermissionMode` だけが載っていて (`docs/glossary.md:741`)、2 つの区別が用語として書かれていません。design-gate R3 の L-205 / LG-04 が残っています。
  - `docs/glossary.md:966` の「中央のヘッダ」の定義は、題・フォルダ・状態・密度しか挙げていません。O-4 はヘッダの行の目盛り (`CenterHeader.tsx:108`) と、行と検索のバーの間の帯 (`CenterHeader.tsx:63-69`) を足しました。それなのに Quota banner (:603) と権限モードの警告の帯 (:1070) の項目は、定義の無い場所「中央のヘッダの下」を使っています。AD-046 Decision 6 は「glossary の正本はこの語の集合に揃える」と定めています。
- **同種事象探索**: `docs/glossary.md` で `PermissionModeKey` を検索して 0 件。「中央のヘッダの下」の使用は glossary.md:603,1070 の 2 件。
- **推奨アクション**: `PermissionModeKey (観測した権限モード)` の項目を足し、Counterexamples に「起動の選択肢ではない (SafePermissionMode と別)」と書いてください。「中央のヘッダ」の定義に「稼働中だけ、行の右に目盛り、行と会話内検索のバーの間に帯」を足します。
- **根拠**: Principle XIV / AD-046 Decision 6 / ARCH-7
- **scope 根拠**: glossary は本 PR の touched files です。

### [Low] session の操作 UI が ui (chat) の文言の表に依存するようになったのに、ui charter の「依存される domain: なし」と session charter の Cross-domain dependencies が追随していない (L-003) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/labels.ts:8` が `@/features/chat/labels` の `PERMISSION_MODE_NAMES` を import するようになりました。起動ダイアログの選択肢の表示名の出所が chat の表に移ったことになります。
  - session から chat への import は前からもありました: `running-session-store.ts:12` (`chat/convert`)、`session-event-decoder.ts:9` (`chat/transcript-guard`)、`LivePane.tsx:11-15` (`chat/transcript-context`)。
  - ところが `docs/domains/ui/charter.md:174` は「依存される domain: なし（最上層）。ただし `stores/ui.ts` …」のままです。`docs/domains/session/charter.md:195-201` も、ui から読むものとして `stores/ui.ts` しか挙げていません。O-4 の記録は session charter の Related Specs (:254-262) にしかありません。
  - design-gate R3 の L-202 が残っています。
- **同種事象探索**: `features/session` の非テストのファイルで `from '@/features/chat/` を検索して 4 件 (上に列挙したもの)。このうち本 PR で増えたのは labels.ts:8 の 1 件です。
- **推奨アクション**: ui charter :174 と session charter :195 の Cross-domain dependencies に 1 行ずつ足してください: 「session の操作 UI は chat の文言の表 (`PERMISSION_MODE_NAMES`)・transcript の変換・context を読む」。あるいは、表示名の表を session と chat の両方から読める中立の置き場に移します。
- **根拠**: ui charter Cross-domain dependencies / session charter Cross-domain dependencies / ARCH-2
- **scope 根拠**: どちらの charter も本 PR の touched files です。

### [Low] accepted の AD-041「記録 1」が結果を `provider-error` と書いているが、AD-047 の「読み替える箇所」に入っていない (L-004) (scope: feature)

- **観察**:
  - `docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:176` には、Windows の loopback を指す `ANTHROPIC_BASE_URL` は「接続できず、provider-error になる」とあります。
  - O-4 の後、`provider-error` になるのは状態・subtype・assistant の `error` のどれにも当たらないときだけです (`src/agents/session-core.ts` の `classifyResultFailure` の最後、data-model §1 の最後の行)。`error_during_execution` で届けば `execution-error` になります。
  - AD-047 の「読み替える箇所」(:26-30) が挙げるのは X-1 の spec / data-model、glossary、AD-044 だけです。
  - 接続の失敗が実際にどの形で届くかは誰も観察していません (plan RK-06)。
- **同種事象探索**: `docs/decisions` で `provider-error` を検索して 4 件。AD-041:176、AD-047:19,28,34。
- **推奨アクション**: quickstart V-4 #1 の観察の対象に、AD-041 記録 1 の経路 (loopback の `ANTHROPIC_BASE_URL`) を足してください。もしくは roadmap の O-4 の行の「V-4 で確かめていない項目」に 1 行足します。違う理由のキーになると分かったら、AD-041 に AD-031 の「訂正」節を足します (事実の訂正)。
- **根拠**: AD-031 Decision 1 / AD-047「読み替える箇所」/ ARCH-3
- **scope 根拠**: quickstart と roadmap は本 PR の touched / scope に入っています。AD-041 そのものは触りません。

### [Low] `fail()` の順の変更を固定するテストが、result の失敗の経路だけを通っている (L-005) (scope: feature)

- **観察**: 順を見るテストは `src/agents/sdk-agent-session.test.ts:564-570` と `:777-798` の 2 つです。どちらも result の失敗 (`fail(failureReason)`、:578) の経路だけを通ります。同じ `fail()` を通る process-crashed (:444 / :454) と stream-protocol-error (:620) の経路では、`failure` が `state: error` より先に届くことを確かめていません。
- **同種事象探索**: sdk-agent-session.test.ts で `order).toEqual` を検索して 2 件 (:569, :798)。どちらも result の経路です。
- **リスク/影響**: L-001 の契約が、関数の中の行の順だけで守られています。後で `fail()` を経路ごとに分けると、テストが緑のまま読み上げから理由が抜けます。
- **推奨アクション**: 子の異常終了 (`process-crashed`) の経路で、`['failure', 'state']` の順を確かめる it を 1 つ足してください。
- **根拠**: reviewer-base の H (全 reviewer の義務) / L-001
- **scope 根拠**: テストのファイルは本 PR の touched files です。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `ターン数\|ターン上限` (renderer の labels.ts と glossary) | 6 | src/renderer/src/features/shell/labels.ts:185 / src/renderer/src/features/session/labels.ts:44,94 / docs/glossary.md:184,373,569 |
| M-002 | 複数行の `^5\. [^\n]*\n4\. ` (docs/decisions) / `AD-047 … Decision [45]` (docs の参照側) | 1 | docs/decisions/0047-session-meter-and-failure-reasons.md:37-38 / 参照 7 行: docs/ui-coverage.md:196,197,199,262 / docs/glossary.md:230,1079 / docs/roadmap.md:388 |
| M-003 | pr-gate の scope と touched-files の差 (設定ファイル) / ルートの `.gitignore` で `codegraph\|serena\|\.mcp` | 6 | .claude/CLAUDE.md / .claude/settings.json / .codegraph/.gitignore / .mcp.json / .serena/.gitignore / .serena/project.yml (.gitignore は 0) |
| L-001 | `\bfail\(` (sdk-agent-session.ts) | 4 | src/agents/sdk-agent-session.ts:444,454,578,620 |
| L-002 | `PermissionModeKey` (docs/glossary.md) / 「中央のヘッダの下」(glossary) | 2 | (PermissionModeKey は 0) / docs/glossary.md:603,1070 |
| L-003 | `from '@/features/chat/` (features/session の非テスト) | 4 | running-session-store.ts:12 / session-event-decoder.ts:9 / labels.ts:8 / LivePane.tsx:11-15 |
| L-004 | `provider-error` (docs/decisions) | 4 | docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:176 / docs/decisions/0047-session-meter-and-failure-reasons.md:19,28,34 |
| L-005 | `order).toEqual` (sdk-agent-session.test.ts) | 2 | src/agents/sdk-agent-session.test.ts:569,798 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 5
