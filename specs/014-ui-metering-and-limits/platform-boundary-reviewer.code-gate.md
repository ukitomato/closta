# platform-boundary-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- FR/SC (本 reviewer の担当範囲で影響を受けるもの):
  - FR-001 / FR-002: `classifyResultFailure` の理由が状態通知の `reasonKey` で main を通る。main / preload の差分は 0 (quickstart-results.md:30)
  - FR-003: `meter` は許可リストのフィールドだけを読む。`init` から読むのは `permissionMode` だけ (`src/agents/live-signals.ts:366-370`)。PB-1
  - FR-005: `meters.permissionMode` を `config` / `lastConfig` / プリセットに書き戻さない (`running-session-store.ts:177-178`、テストは `CenterBanners.test.tsx:528-540`)。PB-4
  - FR-010 / US-4 AC1a: 警告の帯の隔離の文言は `autoModeStatus` から導く (`CenterBanners.tsx:70-75`、`RunningSessionsProvider.tsx:65-70`)。PB-3 / PB-4
  - FR-015 / AD-047 訂正 #3: 昇格値の綴りは domain (`meter.ts:23-31`) と renderer の文言の表だけに置き、`src/agents/` の非テストのファイルには 0 件 (Grep で確認)。項目 16
  - SC-002 (`init` の `cwd` などが 0 件)、SC-004 (`ended` の後の `event` が 0 件)、SC-006 (`PERMISSION_MODE_ESCALATION_VALUES` / `.dependency-cruiser.js` の差分 0)
- 該当する charter / Confirmation:
  - isolation charter `:30-33`、`:41` (可視化ポリシー)、`:101-104`、`:119`、`:145` (Related Specs)
  - ui charter `:84` (隔離状態の判定は isolation が持ち、ui は表示する)
  - Constitution Principle III `:450` / VII `:603-610`、AD-047 Decision 5 と訂正 #3、AD-003 (インスタンスは複数ありうる)、AD-004
  - `eslint.config.mjs:557-573` (今回の差分)、`scripts/constitution/check.mjs:773-933` (項目 16)、`allowlists.mjs:435`、`.dependency-cruiser.js:180-202,292-300`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`modelId` / `toolUseId` の検証もそちら)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

code-gate の対象 (`.code-gate-scope.txt` の 88 ファイル) のうち、プラットフォーム境界に関わる次の部分を読んだ。

- 起動のきっかけになった `eslint.config.mjs` の差分: `tool-result-marks.tsx` を、hooks の番人を戻す block に足しただけ
- 新しい agents のモジュール 2 つ (`live-signals.ts` / `meter-throttle.ts`) と、`sdk-agent-session.ts` への配線
- domain の `meter.ts`
- renderer で権限モードと隔離の文言を扱うところ (`CenterBanners` / `RunningSessionsProvider` / `running-sessions-view` / `CenterPane` / `OverviewTab` / `LaunchDialog`)

本 reviewer の design-gate R3 の指摘のうち、次の 2 件はコードとテストで解消されていた。
- L-004: `init` に `permissionMode` が無いときは何も送らない (`live-signals.ts:245`、`live-signals.test.ts:831`)
- L-002: `dispose` の後は何も送らない。終了の後に timer が発火しない (`meter-throttle.ts:206-247`、`live-signals.test.ts:895-901`、`sdk-agent-session.test.ts:661`)

残っているのは次の 3 件。
- M-001 (quickstart の手順)
- L-003 (I-3 への申し送り)
- arch の MG-12 (isolation charter に記録が無い)。本 reviewer の C の担当に当たる

新しく見つけたのは 2 件で、どちらも Low。
- 項目 16 の denylist が SDK に固定した列挙とつながっていない
- ランタイムが一覧から消えた場合のテストが無い

## Findings

### [Medium] quickstart「形の控え方」が、アプリの起動と条件を揃えないまま残っている。名前空間・`--permission-mode`・`--exec` の 3 点。V-4 は利用者の未実施の作業で、この手順を案内している (M-001) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md:43` は今も「同じ `CLAUDE_CONFIG_DIR`」としか書かない。:44 は今も `claude -p "<短い依頼>" --output-format stream-json --verbose` で、`--permission-mode` も `wsl.exe --cd … -d … --exec` も無い。design-gate R3 の pb M-001 (gate では MG-14。`design-gate.md:64`) から字面が変わっていない
  - Provider の `configDir` は `HostPath | WslUncPath` で持たれ、画面に出るのは host 側の値である。アプリが渡すのは `RuntimePath` に変換した値 (`C:\dev\closta\src\domain\provider\types.ts:98,113-114,149-153`)
  - `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart-results.md:52-55` は V-4 を「未実施」とし、形の控え方として本手順を指している。tasks SH-014 は、控えた形で data-model §1 / §2 / §4 を直す
- **同種事象探索**: `CLAUDE_CONFIG_DIR|--permission-mode|--exec|wslpath|RuntimePath` (quickstart.md) は 2 件 (:43, :52)。`--exec`・`wslpath`・`RuntimePath` の記述は 0 件
- **リスク/影響**:
  - 画面の UNC / Windows のパスを distro のシェルに写すと、相対パスとして扱われる。認証の無い別の設定ディレクトリが作業フォルダの下にできる (AD-004 / Principle I の名前空間の取り違えが、人の手を介して起きる)
  - `--permission-mode` が無いので、CLI は利用者の `permissions.defaultMode` で動く。アプリの安全 3 値のゲート (AD-041 (a) / Principle III) の外で、作業フォルダに対して tool が動きうる
  - login shell を通ると `.bashrc` の鍵や PATH 上の別の claude が効く。控えた形がアプリの経路と違うものになり、それを正として data-model を「直す」ことになる
- **推奨アクション** (quickstart.md の「形の控え方」:43-44 だけを直す):
  - 手順 1: `CLAUDE_CONFIG_DIR` には**ランタイムの中から見たパス**を渡す。画面の値は写さず、必要なら `wslpath -u` で変換する
  - 手順 2: `wsl.exe --cd <cwd> -d <distro> --exec env CLAUDE_CONFIG_DIR=<RuntimePath> <claudePath> -p "<依頼>" --permission-mode <default|plan|dontAsk> --model <id> --output-format stream-json --verbose` の形にする。`<claudePath>` は probe が解決するのと同じ絶対パス (AD-041 (f))
  - 依頼は tool を要さないもの (または `--permission-mode plan`) にする
- **根拠**: AD-004 / Principle I、Principle III / AD-041 (a) (e) (f)、runtime charter (名前空間)
- **scope 根拠**: 本 feature の spec 文書。code-gate の scope ファイルには入っていないが、design-gate から持ち越した未解消の Medium で、V-4 の前に直す必要がある

### [Low] O-4 の暫定の隔離の文言のルールが isolation charter に記録されていない。ルールは ui のコードにある (L-001) (scope: feature)

- **観察**:
  - 「`unavailable` → 隔離なし、それ以外 → 確かめていない」の対応は ui の `C:\dev\closta\src\renderer\src\features\shell\CenterBanners.tsx:70-75` (`isolationSentence`) にある
  - isolation charter `C:\dev\closta\docs\domains\isolation\charter.md:41` は「何をもって『隔離されている』と表示するかの定義」を isolation の In scope に置く。`:145` の Related Specs は「未着手」のまま
  - ui charter `C:\dev\closta\docs\domains\ui\charter.md:84` は「判定は isolation、ui は表示」とする
  - 部分的には手当て済み: glossary (`C:\dev\closta\docs\glossary.md:1068-1076`。Domain に「ポリシーとゲートは isolation (I-3)」) と、roadmap の I-2 / I-3 の行 (`C:\dev\closta\docs\roadmap.md:387,388`) に暫定であることが書かれた
- **同種事象探索**: `隔離|isolation|autoModeStatus` (ui charter) は 3 件 (:84, :156, :173)。isolation charter に O-4・`autoModeStatus` の記述は 0 件。対応を組むコードは 1 か所 (`CenterBanners.tsx:71`)
- **リスク/影響**: I-3 が `SAFE_SANDBOX_KINDS` を移したり seccomp を `autoModeSafe` に織り込んだりすると、帯の「隔離がありません」の意味が黙って変わりうる。ポリシーの持ち主の charter だけを読む人には、それが見えない (arch の design-gate MG-12 と同じ事象。dedup の対象)
- **推奨アクション**: isolation charter の Related Specs か Open Questions に 1 行足す。例: 「O-4 (ui) が権限モードの警告の帯で暫定の隔離の文言を出す。入力は runtime の `autoModeStatus`。I-2 / I-3 で隔離の可視化ポリシーを定めたら置き換える」。コードは変えない
- **根拠**: isolation charter :41 / ui charter :84 / AD-047 Decision 5
- **scope 根拠**: 本 feature の記録の追随 (FR-016) で直せる

### [Low] 項目 16 の昇格値の denylist が、SDK に固定した `PERMISSION_MODE_KEYS` とつながっていない (L-002) (scope: feature)

- **観察**:
  - `C:\dev\closta\src\agents\sdk-agent-session.ts:97-99` の `Equal<Exclude<PermissionModeKey,'unknown'>, SdkPermissionMode>` が、domain の `C:\dev\closta\src\domain\session\meter.ts:23-31` を SDK の値域に固定した。SDK の版を上げて権限モードが増えれば、tsc が落ちて meter.ts を直させる
  - 一方で、項目 16 が `src/agents/` で締め出す綴りは手書きの `C:\dev\closta\scripts\constitution\allowlists.mjs:435` (`['bypassPermissions','acceptEdits','auto']`) で、両者をつなぐテストが無い
- **同種事象探索**: `PERMISSION_MODE_ESCALATION_VALUES|PERMISSION_MODE_KEYS` (specs を除く) は 9 件 (allowlists.mjs:435 / check.mjs:52,875 / meter.ts:23,32,156 / meter.test.ts:11,143,156)。2 つを突き合わせるものは 0 件。前例として `tests/docs/wsl-free-coverage.test.ts` が allowlists.mjs を import している
- **リスク/影響**: SDK が新しい昇格モードを足すと、domain・renderer の表 (`Record<PermissionModeKey,…>`) は tsc で追随させられるが、項目 16 の backstop だけが黙って古いまま残る。実際の権限の門は allowlist (`assertSafePermissionMode` と `SafePermissionMode` 型) なので、今は実害が無い。backstop が弱まるだけである
- **推奨アクション**: 次の等式を固定するテストを 1 つ足す (`tests/docs/` か `meter.test.ts`): `PERMISSION_MODE_KEYS.filter(k => k !== 'unknown' && !isSafePermissionMode(k))` を並べ替えたものが `PERMISSION_MODE_ESCALATION_VALUES` を並べ替えたものと等しい
- **根拠**: Principle III / AD-041 (a) / PB-7 (ルールが SDK の変化に追随しない穴)
- **scope 根拠**: 本 feature が `PERMISSION_MODE_KEYS` と `Equal<…>` を新しく足したので、つなぐ場所ができた

### [Low] 昇格の観測を記録しないことが I-3 への申し送りに書かれていない (L-003。design-gate R3 から残る) (scope: feature)

- **観察**: `C:\dev\closta\docs\roadmap.md:388` (I-3 の行) の「O-4 から」は、(1) 強制の要否と (2) 隔離の文言が暫定であることだけを書く。昇格の観測 (帯・行・`meters.permissionMode`) は renderer のメモリにしか残らず、`close()` で消える。この点は書かれていない。roadmap:361 の RK-14 の判断も、扱うのは知らない形の失敗と、decoder が捨てた `meter` だけである
- **同種事象探索**: `昇格の観測|観測を記録|メモリだけ` (roadmap.md) は 0 件
- **リスク/影響**: AD-041 の「昇格経路 0 件」からの逸脱がいつ何回起きたかを後から確かめられない。I-3 が強制の要否を決める材料が、quickstart V-4 #5 の手作業だけになる
- **推奨アクション**: roadmap:388 の (1) に「O-4 は昇格の観測を記録しない (renderer のメモリだけ)。強制の要否を決めるときに観測点を足すかも決める」を 1 文足す。コードは変えない
- **根拠**: AD-041 Consequences / AD-047 Decision 5
- **scope 根拠**: docs/roadmap.md は本 PR の touched files

### [Low] 一覧があるのに、セッションのランタイムが一覧から消えた場合の `undetermined` への fallback をテストしていない (L-004) (scope: feature)

- **観察**: `C:\dev\closta\src\renderer\src\features\session\RunningSessionsProvider.tsx:65-70` は `runtimes.list?.runtimes.find(...)?.capabilities.autoModeStatus ?? 'undetermined'` で、安全側に倒している。`C:\dev\closta\src\renderer\src\features\shell\CenterBanners.test.tsx:488-504` が試すのは `allowed` / `undetermined` / 一覧が null (読み込み中) の 3 つだけ。「一覧はあるが `runtimeId` が無い」(再検出でディストロが消えた。AD-003 の複数インスタンス) の場合は無い
- **同種事象探索**: `runtimeList\(|'読み込み中'` (CenterBanners.test.tsx) は 6 件 (:457, :466, :480, :489, :490, :491)。消えたランタイムの場合は 0 件
- **リスク/影響**: 今の振る舞いは正しい。後で `find` の書き方を変えたときに、消えたインスタンスを `allowed` 扱いや例外に倒す退行を検出できない (PB-2 / PB-3)
- **推奨アクション**: `runtimeList('unavailable')` の `id` を別名 (`wsl:Debian`) にした一覧で、帯が「確かめていません」になる (「隔離がありません」と言わない) ことを `it.each` に 1 行足す
- **根拠**: AD-003 (インスタンスは複数ありうる) / runtime charter (確かめていないことを丸めない)
- **scope 根拠**: 本 feature のテストのファイル

### 固有観点の確認

- **PB-1**:
  - 該当なし: パスを型の境界の外へ運ぶ経路は無い。`init` から読むのは `permissionMode` だけで、`cwd`・`plugins[].path` は読まない (`live-signals.ts:366-370`)
  - 目印の値のテストがある (`live-signals.test.ts:861-893`、`tests/meter/meter-through.test.tsx:198`)
  - `test-support/app-shell-harness.tsx:76,99` は PathDTO のリテラルを組むが、import するのはテストだけ (Grep で確認)
  - 人の手を介した名前空間の取り違えは M-001
- **PB-2**:
  - module スコープの可変状態は 0 件 (Grep で確認)。`live-signals` / `meter-throttle` は `run()` の closure に作る (`sdk-agent-session.ts:1013-1022` の差分)
  - renderer は `sessionId` (`useSessionMeters.ts:22-24`) と `runtimeId` (`CenterPane.tsx` の差分で `live.state.config.runtimeId`) で引く
  - 消えたインスタンスのテストの穴は L-004
- **PB-3**:
  - ランタイムの capabilities の表明は変えない
  - 隔離の文言は表示用の 3 値 (`capabilities.ts:149,165-169`) から作る。`allowed` / `undetermined` / 未取得は「確かめていない」に倒し、楽観側に丸めない (`CenterBanners.tsx:71-75`)
  - `autoModeAllowed` を読まないことは、値を食い違わせたテストで確かめている (`CenterBanners.test.tsx:434-436`)
- **PB-4**:
  - 起動の選択肢は `SAFE_PERMISSION_MODES` から作る (`LaunchDialog.tsx:616-620`)
  - `PermissionModeKey` (昇格値を含む) を使うのは表示と観測だけ。起動の設定・`lastConfig`・プリセットへの経路は 0 件 (Grep で確認。`CenterBanners.test.tsx:528-540`)
  - `buildQueryOptions` には `SafePermissionMode` 型が掛かり、`PermissionModeKey` は代入できない
  - アプリの外で CLI を走らせる案内は M-001
- **PB-5**: 該当なし: パスの変換と docker の endpoint を扱わない
- **PB-6**: 該当なし: 子プロセス・ファイル・環境・ボリュームを作らない。計量は renderer のメモリだけで永続化しない (`stores/ui.ts` の差分は型 1 行)
- **PB-7**:
  - `eslint.config.mjs:564-573` の差分は、緩めたルールを戻す block にファイルを 1 つ足すだけ。`boundaries/dependencies` と `no-restricted-imports` は今までどおり `src/**` 全体に掛かる。既存のルールを緩めた箇所は 0 件
  - 新しい agents のモジュールが import するのは domain だけ (Grep で確認)。`supervisor*` で始まらず、`worker_threads` も使わないので、`.dependency-cruiser.js:200,298` の範囲に自動で入る
  - 項目 16 は `launchPermissionMode` を誤検出しない (`(?<![.\w])` の後読み)
  - 新しい穴は L-002 だけ。項目 16 が引用符の 2 形しか見ない件 (design-gate L-001、system) は変わらず、本 PR では再掲しない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `CLAUDE_CONFIG_DIR\|--permission-mode\|--exec\|wslpath\|RuntimePath` (quickstart.md) | 2 | quickstart.md:43, 52 |
| L-001 | `隔離\|isolation\|autoModeStatus` (ui charter) | 3 | ui/charter.md:84, 156, 173 |
| L-001 | isolation charter の O-4 / `autoModeStatus` の記述 | 0 | (isolation/charter.md:145 は「未着手」) |
| L-002 | `PERMISSION_MODE_ESCALATION_VALUES\|PERMISSION_MODE_KEYS` (specs を除く) | 9 | allowlists.mjs:435 / check.mjs:52, 875 / meter.ts:23, 32, 156 / meter.test.ts:11, 143, 156 |
| L-003 | `昇格の観測\|観測を記録\|メモリだけ` (roadmap.md) | 0 | — |
| L-004 | `runtimeList\(\|'読み込み中'` (CenterBanners.test.tsx) | 6 | CenterBanners.test.tsx:457, 466, 480, 489, 490, 491 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 4

関連ファイル:
- C:\dev\closta\eslint.config.mjs
- C:\dev\closta\src\agents\live-signals.ts
- C:\dev\closta\src\agents\meter-throttle.ts
- C:\dev\closta\src\agents\sdk-agent-session.ts
- C:\dev\closta\src\domain\session\meter.ts
- C:\dev\closta\src\renderer\src\features\shell\CenterBanners.tsx
- C:\dev\closta\src\renderer\src\features\shell\CenterBanners.test.tsx
- C:\dev\closta\src\renderer\src\features\session\RunningSessionsProvider.tsx
- C:\dev\closta\scripts\constitution\allowlists.mjs
- C:\dev\closta\scripts\constitution\check.mjs
- C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md
- C:\dev\closta\specs\014-ui-metering-and-limits\quickstart-results.md
- C:\dev\closta\docs\domains\isolation\charter.md
- C:\dev\closta\docs\roadmap.md
