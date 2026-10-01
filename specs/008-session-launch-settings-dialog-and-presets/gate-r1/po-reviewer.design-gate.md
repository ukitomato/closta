# po-reviewer Review: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Reviewer**: po-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜017 (FR-017 は番号順の外、spec.md:109) / SC-001〜010。bundle に contracts/ data-model / quickstart / research は無い (Glob で spec/plan/tasks の 3 ファイルのみ確認)
- touched charter / Confirmation: session charter の Mission、Journey 2 (charter.md:72-78)、業務ルール (charter.md:110-113)、KPI「依存解決の正しさ」(charter.md:127)・「再利用率」(charter.md:128)。AD-016 (越境警告は閾値なし・受け入れ条件)、AD-020 §3/§4 (`dontAsk` は安全。拒否は黙って起きるため表示が要る)。glossary の SessionLaunchConfig (glossary.md:524-528) と Preset (glossary.md:372-374)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。プリセットに秘密値が混入しない件 (SC-003) は E の計測経路の観点でだけ扱った
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (FR-014 の制御文字拒否は B に属する)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。charter 規則の UX 上の帰結だけを E で扱った
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-041 の調停内容は人間が決定済み)
- E. User Story / SC / AC / UX: Critical:0 High:4 Medium:7 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: po の担当範囲外 (empty state の文言や見た目は ux-reviewer の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

X-4 は、6 軸 (フォルダ / WSL ランタイム / Provider / モデル / effort / 安全な 3 つの権限モード) を選ぶ起動ダイアログ、名前付きプリセット、純粋関数による依存解決と既定値へのリセット通知、AD-016 の越境警告、X-3 からの繰越 (到達可能性で絞った Provider 選択、モデルカタログの UI と手入力編集、config-dir の RuntimePath 変換、RoleSessionName 付きの assume-role helper 生成) を加え、すべて X-1 の単一起動に配線する。US-1 と US-2 が P1、US-3 と US-4 が P2。tasks は SH / BE / FE と E2E (SH-022)、quickstart (SH-023) に分かれている。

## Findings

### [High] KPI「再利用率」を US-2 の目的に掲げているのに、SC も計測経路もログを出すタスクも無い (H-001) (scope: feature)

- **観察**: spec.md:53 は US-2 の目的を「KPI『再利用率』の対象」としている。charter.md:128 はこの KPI を「プリセット経由の起動が、全軸を手で選ぶ起動を上回る — 計測経路: ローカル利用ログ」と定義している。一方、SC-001〜010 (spec.md:155-164) に再利用率を扱うものは無い。plan.md / tasks.md にも、起動のたびに起動元 (プリセット / 手選択) を記録するログやメトリクスのタスクが無い (tasks.md:35-46 の US-2 は永続化・IPC・パネルだけ)
- **同種事象探索**: KPI「依存解決の正しさ」(charter.md:127, E2E) は SC-002 と SH-022 に繋がっている。繋がっていない KPI は再利用率の 1 件だけ
- **リスク/影響**: US-2 の価値が届いたかどうかを、リリース後に判定する手段が無い。後から計測を入れると、それまでの期間の比較基準が失われる
- **推奨アクション**: SC-011「起動のたびに `launchSource: 'preset' | 'manual'` (ほかに適用後のリセット有無) をローカル利用ログに 1 行記録する」を追加し、BE タスク (session-launch-service で記録) と単体 assert を足す。この段で計測しないと決めるなら、Out of Scope に「再利用率の計測は <feature-ID> へ」と書き先を明記する
- **根拠**: charter.md:128 / PO-2
- **scope 根拠**: spec と tasks で直せる

### [High] フォルダとランタイムの「既定」に意味が無いのに、両軸に既定を置き「削除済みフォルダは既定に戻す・起動はブロックしない」と書いている (H-002) (scope: feature)

- **観察**: FR-001 (spec.md:106) は「どの軸にも『既定 (指定しない = Claude Code に任せる)』を置く」としている。Edge Case (spec.md:93) は「適用したプリセットの Provider / フォルダが削除済み → 無効軸を既定に戻して通知。起動をブロックしない」としている。しかし X-1 の起動には作業フォルダと実行中と確認済みの WslRuntime が必須である (glossary.md:289-290 の LaunchInput)。フォルダに「Claude Code に任せる」既定は存在しない。さらに BE-001 (tasks.md:20) の facts は Provider・カタログ・effort だけで、フォルダやランタイムが存在するか・停止中かを持たない。ランタイムの停止 (spec.md:94) についても、Provider の到達性は書かれているが、ランタイム軸そのものと起動ボタンがどう振る舞うかが書かれていない
- **同種事象探索**: `既定` を spec.md 内で検索すると、依存解決は FR-006/011 と Edge 93/98 の 4 箇所。どれもフォルダとランタイムが既定を取れない点に触れていない
- **リスク/影響**: US-2 の AC2 (spec.md:60) を満たす実装が定まらない。「起動をブロックしない」を守ると無効な起動になり、FR-006 の fail-safe と両立しない
- **推奨アクション**: 既定を持てるのは provider / model / effort / 権限モードの 4 軸に限ると明記する。プリセットのフォルダ削除・ランタイム削除・ランタイム停止は「未選択に戻し、起動を不可にして理由を示す」AC に分ける。BE-001 の facts にフォルダとランタイムの存在・実行状態を加える
- **根拠**: FR-001 / FR-006 / spec.md:93 / PO-3・PO-4
- **scope 根拠**: spec と tasks で直せる

### [High] Provider が「既定」に戻ったとき何で起動するかが書かれておらず、利用者が意図しないアカウントや課金先で黙って起動する経路がある (H-003) (scope: feature)

- **観察**: 削除された Provider や到達できない Provider は「既定に戻して通知・起動をブロックしない」(spec.md:60, 93, 115)。一方 BE-006 (tasks.md:25) は `buildLaunchEnv(process.env)` を `providers.deriveEnv(providerId, runtimeId)` に置き換えるが、`providerId = 'default'` のときにどの env や資格情報で起動するかは spec にも plan にも無い。US-2 は「プリセットを選ぶだけで全軸を復元して起動する」(spec.md:51) としているので、適用してそのまま起動する流れでは、リセット通知を読む前に起動しうる
- **同種事象探索**: `default` Provider の意味を spec.md と plan.md で検索して 0 件。「既定 (Claude Code に任せる)」の文言は spec.md:106 だけ
- **リスク/影響**: たとえば業務用 Bedrock のプリセットで Provider が削除されていた場合、既定の資格情報 (個人の subscription など) でそのまま起動しうる。通知は出るが、起動を止めないため取り返しがつかない。charter の Mission である「起動条件を正しく再現する」に反する
- **推奨アクション**: (a) Provider が既定のときの env 導出を FR として定義する (X-1 と同じ既定 env か、など)。(b) プリセット適用で provider 軸がリセットされたら、起動前に利用者の確認を必須にする AC を足す。model / effort のリセットは通知だけでよいなど、軸ごとに扱いを分ける
- **根拠**: FR-006 / FR-011 / BE-006 / PO-4
- **scope 根拠**: spec と tasks で直せる

### [High] SC-007 と US-4 AC3 は plan R-01 が不成立でも単体テストだけで PASS 扱いになり、不成立時の代替が spec に無い (H-004) (scope: feature)

- **観察**: plan.md:153 の R-01 (高) は「`/mnt/c` 経由で helper を実行できなければ、生成は後続へ回す」としている。tasks.md:74 の SH-023 と tasks.md:81 も「不成立なら BE-031/032 を後続へ繰越」としている。一方 spec の FR-013 (spec.md:128)・SC-007 (spec.md:161)・US-4 AC3 (spec.md:89) は無条件の要求で、SC-007 の計測経路は「helper 生成の単体テスト」だけである
- **同種事象探索**: `R-01` は plan.md:153 と tasks.md:74,81 の 3 件。spec.md は 0 件
- **リスク/影響**: helper が実機で動かなくても SC-007 は緑になり、aws-assume-role の Provider で起動できないまま完了扱いになる。逆に後続へ繰越した場合は、spec の FR と SC が未達のまま残る
- **推奨アクション**: SC-007 の計測経路に「quickstart で helper が live 発火し、CloudTrail で RoleSessionName を観測」を加える。spec の Assumptions に R-01 の分岐 (不成立なら FR-013 と SC-007 を後続の <ID> へ移し、X-3 のユーザ供給 helper パスを維持する) を書く
- **根拠**: plan.md:153 / SC-007 / PO-2
- **scope 根拠**: spec で直せる

### [Medium] X-3 繰越の参照 ID (FE-010 / BE-013) が 008 の tasks.md の同じ番号と衝突し、BE-013 は X-3 で完了済み (M-001) (scope: feature)

- **観察**: spec.md:107 (FR-002 の「FE-010」)、spec.md:108 (FR-003 の「BE-013」)、spec.md:169 (「FE-010 / BE-013 / BE-020」) は X-3 のタスク ID である。しかし 008 の tasks.md では FE-010 が PresetPanel (tasks.md:46)、BE-013 が preset IPC (tasks.md:43)、BE-020 が launch-resolution テスト (tasks.md:52) で、別物を指す。また X-3 の BE-013 は ✅ で完了している (007 tasks.md:94-96)。X-4 へ繰り越されたのはカタログ UI で、それは X-3 の FE-010 の中身である (007 tasks.md:96,100-101)
- **リスク/影響**: 繰越を追跡できない。「X-3 の BE-013 を実装」と読むと完了済みの作業を指してしまう
- **推奨アクション**: `X-3 FE-010` のように spec 番号を前に付けて書く。FR-003 の出典は「X-3 FE-010 (カタログ面) / X-3 SC-007」に直す。BE-020 繰越は FR-013 に明示して紐付ける
- **根拠**: 観点 4 / PO-3

### [Medium] SC-008 は既存の越境判定をテストするだけで、新たに作る警告 UI (FE-020) と「起動をブロックしない」の検証が無い (M-002) (scope: feature)

- **観察**: SC-008 の計測経路は「越境判定 (AD-016 消費) の単体テスト」(spec.md:162) だが、判定は既存の `resolveFolderRuntime` (spec.md:74) で、本 feature では新設しない。新たに足すのは FE-020 (tasks.md:53) の警告表示と、警告が起動をブロックしないことで、これを検証するタスクが SH-020 / SH-022 に無い
- **推奨アクション**: SC-008 の計測経路を「越境の組み合わせで警告が表示され、起動ボタンが有効のまま」の renderer 単体か E2E に差し替え、SH-022 に 1 ケース足す
- **根拠**: AD-016:97 (受け入れ条件) / PO-2

### [Medium] `dontAsk` で承認カードが出ないときの分かりやすさが、plan R-03 で「受け入れ条件に含める」とされながら AC に無い (M-003) (scope: feature)

- **観察**: plan.md:155 (R-03) は「受け入れ条件に含める」と書くが、spec の US-1 AC3 (spec.md:46) は選択肢に 3 つの値が並ぶことしか検証しない。tasks は FE-004 (tasks.md:33) の文言追加だけである。AD-020 §4 (0020:114) は「何が拒否されたか分からないと使えない」としている (拒否の表示経路は `useLiveSession.ts` に既にある)
- **推奨アクション**: AC を足す。「Given `dontAsk` で起動、When 事前承認の無い tool が呼ばれる、Then 承認カードは出ず、自動拒否が理由付きで transcript に表示される」。選択時に意味を説明する文言が出ることも AC にする
- **根拠**: AD-020 §3/§4 / PO-3・PO-6

### [Medium] 起動が拒否・失敗したときの出口 (復旧の流れ) が AC に無い (M-004) (scope: feature)

- **観察**: BE-006 (tasks.md:25) は「`deriveEnv` が null なら理由キーで起動拒否」、US-4 AC2 (spec.md:88) は「fail-closed で null」とするが、利用者に何が見えるか (理由・次の一手) の AC が無い。plan R-02 (plan.md:154) の「誤入力の effort を SDK が拒否したら、失敗理由を表示」も spec に無い。単一セッション規則 (実行中に起動ダイアログを開いた場合) の振る舞いも書かれていない
- **推奨アクション**: US-1 か US-4 に AC を足す。deriveEnv が null のとき・SDK が effort を拒否したとき・既に 1 セッション実行中のときそれぞれで、表示する理由キーと、ダイアログが入力を保ったまま戻ることを書く
- **根拠**: PO-6 (出口の明示) / PO-4

### [Medium] 空の状態とプリセット名の異常な入力が書かれていない (M-005) (scope: feature)

- **観察**: 空のカタログだけは spec.md:98 で扱っている。次が書かれていない。Provider が 0 件、または全件到達不可のときの Provider 軸。登録フォルダ 0 件、実行中の WSL ランタイム 0 件のときのダイアログ。プリセット 0 件のときの PresetPanel。プリセット名が空・重複・極端に長い・制御文字を含むとき。同名での保存が上書きか別件か (FR-009 (spec.md:121) は保存・一覧・適用・削除だけで、更新が無いのに `updatedAt` (plan.md:116) で並べる)
- **推奨アクション**: Edge Cases に列挙し、`checkPreset` (tasks.md:43) の上限と重複時の方針 (上書き確認か拒否か) を FR-009 に書く
- **根拠**: PO-4

### [Medium] charter Journey 2 の「上限」とセッション名を「後続 feature」へ回したが、行き先の ID が無い (M-006) (scope: feature)

- **観察**: charter.md:77 の Journey 2 step 3 は「上限」を選択対象に含み、glossary.md:527 にもある。spec.md:182 は「追加ディレクトリ / 上限 / セッション名 → 後続 feature」とだけ書き、宛先 ID が無い。人間が明示的に繰越を決めたのは追加ディレクトリ・capability 承認・Win32・退避 UI の 4 つで、「上限」はここに含まれない (spec.md:147)
- **リスク/影響**: 上限 (コストやターン数の上限) は、プリセットで定型起動する利用者が保存したい値の筆頭で、X-5 の並列化で重要度が上がる。宛先が無いと追跡から落ちる
- **推奨アクション**: 上限とセッション名の宛先 feature ID を roadmap に登録して spec.md:182 に書く。charter の Journey 2 にも「X-4 時点で上限は未対応」と注記する (FR-015 の追随範囲に含める)
- **根拠**: charter.md:77 / PO-5

### [Medium] Provider を切り替えるとモデルカタログが切り替わる UI (US-1 AC2 / FR-003) に SC と E2E が無い (M-008) (scope: feature)

- **観察**: SC-010 (spec.md:164) はカタログの永続化の対称性、SC-002 は純粋関数でのリセットを扱う。「Provider を選ぶと、その Provider のカタログに切り替わって表示される」ことを計測する SC が無い。SH-022 (tasks.md:73) の E2E も到達性とリセットだけである。この UI は X-3 の FE-010 から繰り越された中核部分 (007 tasks.md:96)
- **推奨アクション**: SC-001 か SC-002 の計測経路に「Provider を切り替えるとモデル選択肢が差し替わる E2E」を加える
- **根拠**: 観点 4 / PO-2

### [Medium] (H) renderer 側の単体テストのタスクが無く、P1 のプリセット保存と適用に E2E が無い (M-007) (scope: feature)

- **観察**: US-1 の Independent Test (spec.md:40) は「除外理由の表示を renderer 単体 + E2E で確認」としているが、FE-001 / FE-003 / FE-010 / FE-020 (tasks.md:30-53) にテストの記述が無い。SH-020 (tasks.md:71) は SC 単位の Vitest (主に domain と main) である。US-2 (P1) は永続層の単体と quickstart (tasks.md:74) だけで、ダイアログでの保存 → 適用 → リセット通知 → 起動の E2E が無い。ProviderScreen のモデル編集 (FR-017) の UI テストも無い
- **推奨アクション**: FE ごとに renderer 単体を足す (除外理由の表示・リセット通知・安全 3 値だけが出ること・カタログ編集)。SH-022 にプリセットの保存と適用の E2E を 1 本足す
- **根拠**: reviewer-base の H 必須 / PO-3

### [Low] US-3 (P2) の依存解決は P1 の US-1 と US-2 が既に前提にしており、優先度の切り方が実態と合わない (L-001) (scope: feature)

- **観察**: 依存解決の本体 BE-001 は US-1 に置かれている (tasks.md:20)。US-2 AC2 (spec.md:60) も US-3 に依存する。FR-006 は charter の不変条件である。P2 で実質的に残るのは越境警告 (FE-020) と BE-020 の境界値テストだけになる
- **推奨アクション**: US-3 を「越境警告と依存解決の境界値の網羅」と言い直すか、依存解決を P1 に含めると明記する
- **根拠**: PO-5

### [Low] SC-003 の計測経路に「security-reviewer」が入っている。人によるレビューは再実行できる計測ではない (L-002) (scope: feature)

- **観察**: spec.md:157
- **推奨アクション**: 計測経路は単体 assert だけにし、レビューは補助として別に書く (`check.mjs` 項目 17 の走査を加えてもよい)

### [Low] (H) 「実行中セッションは Provider の編集や削除の影響を受けない」という Edge Case にテストが無い (L-003) (scope: feature)

- **観察**: spec.md:97 はこの Edge Case を定義しているが、tasks.md の SH-020 と SH-022 に対応するケースが無い
- **推奨アクション**: 起動後に Provider を削除しても、起動時の env スナップショットが変わらないことを fake launcher の単体で 1 ケース確認する

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | 再利用率 / launchSource (spec/plan/tasks) | 1 (spec.md:53 の言及のみ。SC やタスクは 0 件) | spec.md:53, charter.md:128 |
| H-002 | 既定 (spec.md の依存解決部分) | 4 | spec.md:93, 98, 115, 123 |
| H-003 | 既定 Provider の env 導出の定義 | 0 | — |
| H-004 | R-01 | 3 (spec.md では 0 件) | plan.md:153, tasks.md:74, tasks.md:81 |

(Critical は 0 件なので cascade_enforce による降格の対象は無い)

## Verdict

- Critical: 0
- High: 4
- Medium: 8
- Low: 3
