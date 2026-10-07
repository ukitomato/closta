# platform-boundary-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 3 (前回: design-gate R2 2026-10-07 / `design-gate.md.20261007T184052`。本 reviewer の R2 の生出力は H-001 / H-002 / L-001 / L-002 / L-003。gate では HG-05 / HG-06 と LG の pb 3 件)

## 初回読了 viewpoint

- FR/SC (本 reviewer の担当範囲で影響を受けるもの):
  - FR-001 / FR-002 — 失敗の理由のキーは状態通知の `reasonKey` として main を通る。フィールドは変わらず、main の差分は 0 (data-model.md:27)
  - FR-003 — `meter` は許可リストのフィールドだけを読む。`init` から読むのは `permissionMode` だけで、`cwd`・`plugins[].path` は読まない (data-model.md:67)。PB-1
  - FR-005 — `meters.permissionMode` を `config` / `lastConfig` / プリセットに書き戻さない (data-model.md:125)。PB-4
  - FR-010 / US-4 AC1 / AC1a — `status` と各ターンの `init` で権限モードを比べる。警告の帯の隔離の文言 (spec.md:152-153、data-model.md:141 / :172-176)。PB-3 / PB-4
  - FR-015 — AD-047 の訂正節 #3。昇格値の綴りを renderer の文言の表に置くこと (plan.md:258 / :263)。Principle III / 項目 16
  - SC-002 (`init` の `permissionMode` 以外のフィールドが 0 件)、SC-004 (`ended` の後の `event` が 0 件)、SC-006 (`QUERY_OPTION_KEYS` / `PERMISSION_MODE_ESCALATION_VALUES` の差分が 0)
  - quickstart V-4 #1 / #2 / #4 / #5 と「形の控え方」(アプリの外で claude を走らせる手順)。PB-1 / PB-4 / PB-6
- 該当する charter / Confirmation:
  - isolation charter `:30-33` 権限ゲート、`:41` 可視化ポリシー、`:101-104` 判定を 1 つの関数に集める、`:119` 隔離状態は一目で分かること
  - runtime charter `:108-110` パスの名前空間、`:113-114` capabilities を正直に表明し、確かめていないことを丸めない
  - AD-003 Decision Outcome `:42-44` (インスタンスは複数ありうる。シングルトンではない)
  - AD-004 / Principle I (Provider の `configDir` は `HostPath | WslUncPath`、起動時の値は `RuntimePath`。`src/domain/provider/types.ts:98,149-153`)
  - AD-041 (a) `:39-43`、(e) `:76-84`、(f) `:116-118`、Confirmation `:162,169`、記録 2 `:177`
  - AD-047 Decision 5 `:37`。SH-013 で訂正節を足す予定
  - Constitution Principle III `:450` / VII `:603-606`
  - `scripts/constitution/check.mjs` 項目 16 `:875-880,893-915`、`allowlists.mjs:363,435`、`.dependency-cruiser.js:193,200,207,298`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`modelId` の規則・`task_id` の形も同 reviewer)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

R2 の後に直した design (spec / plan / data-model / research / quickstart / tasks) を見直した。

R2 の High 2 件は解消されていた。
- **`init` も読む (R2 H-001 / HG-05)**: data-model §2 の許可リストに `system`/`init` の行が足された。読むのは `permissionMode` だけである。§3 は「`status` か `init` のどちらで先に見ても 1 回」になった。RK-09、BE-040 のテスト、ui-coverage の `init` の行の備考 (SH-012) も追随している
- **隔離の文言 (R2 H-002 / HG-06)**: `unavailable` だけを「隔離がありません」にし、`allowed` / `undetermined` は「このセッションの隔離をアプリは確かめていません」にした。この文言は暫定であると data-model §4・glossary (SH-001)・roadmap の I-2 / I-3 (SH-013) に書かれる

あわせて次のことを確かめた。
- 起動のダイアログの選択肢は domain の `SAFE_PERMISSION_MODES` から作られる (`LaunchDialog.tsx:616-618`)。そのため、renderer に昇格値を key にした表示名の表を置いても、昇格値が選べるようにはならない
- port はセッションが登録されるまで溜めておかれる (`running-session-store.ts:425-429`)。そのため、最初の `init` の `meter` が「`sessions[id]` が無いので捨てる」に当たることはない

残る問題は次の 3 種で、どれも High に届かない。
- **アプリの外で形を控える手順 (新規)**: R2 HG-02 の手当てとして足された手順が、アプリの起動と条件を揃えていない。名前空間・権限モード・`--exec` の 3 点が違う
- **`init` に `permissionMode` が無いとき (新規)**: 扱いが書かれていない
- **R2 から残る Low 3 件**

## Findings

### [Medium] quickstart「形の控え方」は、アプリの外の claude をアプリの起動と同じ条件で走らせない。名前空間・権限モード・`--exec` が違う (M-001) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md:43` は「同じ `CLAUDE_CONFIG_DIR`」を与えるよう書く。しかし Provider の `configDir` は `HostPath | WslUncPath` で持たれる (`C:\dev\closta\src\domain\provider\types.ts:98`)。利用者が見るのは host 側の値 (`configDirValue`、`:113-114`) である。アプリが実際に渡すのは、ランタイムの `RuntimePath` に変換した `configDirRuntimePath` (`:149-153`) で、画面には出ない。表示された値 (`\\wsl.localhost\<distro>\home\…\.claude` や `C:\…`) を distro のシェルに写すと、Claude Code はそれを相対パスとして扱う。作業フォルダの下に、認証の無い新しい設定ディレクトリができる
  - `quickstart.md:44` の手順 2 は `--permission-mode` を渡さない。一方で `:52` の `init` の行は「起動の設定 (`--permission-mode`) と同じ値か」を比べる。渡さなければ CLI は利用者の settings の `permissions.defaultMode` で動く。そのため `claude -p "<短い依頼>"` が、アプリの安全 3 値のゲート (AD-041 (a)) の外で、作業フォルダに対して tool を動かしうる
  - アプリは `wsl.exe --cd <cwd> -d <distro> --exec <claudePath>` で起動し、env は生成した `WSLENV` で渡す (`C:\dev\closta\docs\decisions\0041-x4-launch-config-on-x1-launch-gate.md:76-84,116-118`。記録 2 `:177`「`--exec` は login PATH を通さない」)。手順 1 は「同じランタイムの中で」としか書かない。distro の端末は login shell を通るので、`~/.bashrc` の `ANTHROPIC_API_KEY` / `CLAUDE_CODE_USE_BEDROCK` や PATH 上の別の `claude` が効きうる
- **同種事象探索**: `CLAUDE_CONFIG_DIR|--permission-mode|claude -p|--exec|login` (014 の 6 文書) は quickstart の 3 件 (`:43,44,52`)。どれも名前空間・`--exec`・`--permission-mode` の付与に触れていない。`configDir` (provider/types.ts) は 3 件 (`:98,114,153`)
- **リスク/影響**: 次の正本は、この手順で控えた形をもとに直すことになっている (tasks SH-014 `tasks.md:150-155`)。
  - data-model §1 の分類表 (RK-06)
  - §2 の値の検証 (RK-07)
  - §4 の主モデルの照合 (RK-15)
  - 権限モードの比較 (RK-09)

  条件がアプリの起動と違えば、違う形を正として data-model を「直す」ことになる。例:
  - #1: `.bashrc` の鍵が期限切れを隠す
  - #2: 別の claude が別の `modelUsage` のキーを出す

  また、アプリの権限ゲートの外で tool を動かせる CLI を走らせるよう、設計文書が案内している。R2 の HG-02 は「生の値を取る手段が無い」という High で、それを閉じたのがこの手順なので、手順の正確さがそのまま検証の正確さになる
- **推奨アクション** (quickstart.md の「形の控え方」だけを直す):
  - 手順 1: `CLAUDE_CONFIG_DIR` は**ランタイムの中から見たパス** (`/home/<user>/.claude`、Windows 側なら `/mnt/c/...`) を渡すと書く。Provider の画面の値 (UNC / Windows のパス) をそのまま写さないこと。必要なら `wslpath -u` で変換する
  - 手順 2: アプリと同じ経路で走らせる。例: `wsl.exe --cd <cwd> -d <distro> --exec env CLAUDE_CONFIG_DIR=<RuntimePath> <claudePath> -p "<依頼>" --permission-mode <起動の設定の値 (default / plan / dontAsk)> --model <id> --output-format stream-json --verbose`。`<claudePath>` はアプリが probe で解決するのと同じ絶対パス (AD-041 (f))
  - 依頼は tool を要さないものにする (または `--permission-mode plan`)。アプリの外の実行でファイルを変えないため
  - この実行は設定ディレクトリにセッションを 1 つ残し、過去のセッションの一覧 (R-2) に出る。利用者の操作なので Principle VI の違反ではないが、そのことを 1 行書く
- **根拠**: AD-004 / Principle I (名前空間)、AD-041 (a) (e) (f) と記録 2、Principle III、runtime charter `:108-110`
- **scope 根拠**: quickstart.md の字面で直せる

### [Low] `init` に `permissionMode` が無いときの扱いが書かれていない。`unknown` に倒すと、観測していない値を「アプリが選んでいない権限モードで動いています」と表明する (L-004) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:67`: `init` の行は「`permissionMode` が基準と変わったら … (`status` と同じ比較)」とだけ書く。`:87` は、列挙から外れたら `mode` は `unknown` とする。`:58` は「agents は `message.permissionMode` を `toPermissionModeKey` に渡すだけ」とする
  - `C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:104` (BE-040): 「`permissionMode` の無い `status` で何も送らない」のテストはあるが、`init` に無い場合のテストは無い
  - アプリが動かすのは利用者が入れた claude である。probe で解決したもので (AD-041 (f) `:116-117`、`C:\dev\closta\src\agents\sdk-agent-session.ts:493` の `pathToClaudeCodeExecutable`)、SDK 0.3.270 の型が前提にする版とは限らない。型が必須とするフィールド (`sdk.d.ts:5503`) が、版の違いで欠けうる
- **同種事象探索**: `permissionMode` の無い (014 の 6 文書) は 1 件 (`tasks.md:104`。`status` だけ)
- **リスク/影響**: `toPermissionModeKey(undefined)` → `unknown` と実装すると、毎ターンの最初に `permission-mode` の `meter` と行が出る。さらに `unsafeModeBanner`「アプリが選んでいない権限モード (「不明なモード」) で動いています」が全セッションに出る。
  - **誤った表明になる**: 観測できないことと、アプリが選んでいないモードで動いていることは違う (runtime charter `:113-114` の「確認していないことを丸めない」と同じ趣旨)
  - **信号が効かなくなる**: Principle III の逸脱の唯一の信号 (AD-047 Decision 5) が常時出る警告になり、利用者が気にしなくなる
- **推奨アクション**:
  - data-model §2 の `init` の行に次を書く: 「`permissionMode` が文字列でない (無い) ときは比べない (`status` と同じ)。文字列で列挙の外なら `unknown`」
  - BE-040 のテストに 2 つ足す: `init` に `permissionMode` が無いと何も送らない。知らない文字列なら `unknown` の `meter` と行が 1 つずつ出る
- **根拠**: Constitution Principle III / AD-047 Decision 5 / runtime charter `:113-114`
- **scope 根拠**: data-model §2 と tasks BE-040 の字面で直せる

### [Low] 項目 16 の昇格値の検査は引用符の 2 形しか見ない (L-001。R2 から残る) (scope: system)

- **観察**:
  - 照合は今も `'value'` と `"value"` の 2 形だけ (`C:\dev\closta\scripts\constitution\check.mjs:875-880`)。`UNDETECTED_NOTES` (`C:\dev\closta\tests\rule-fixtures\expected.mjs:821`) も変わっていない
  - feature 側では手当てされた。BE-004 (`tasks.md:47`) は「`src/agents/` の非テストのファイルに昇格値の綴りを書かない」と形を問わずに禁じ、`permissionMode` を値位置のキー・shorthand・分割代入で書かない規則 (`check.mjs:892-915`) にも合わせてある。`launchPermissionMode` の名前は `(?<![.\w])` (`:893`) と shorthand の正規表現 (`:911`) に当たらないので、誤検出も起きない
- **同種事象探索**: `` includes(`'${value}'`) `` (check.mjs) は 1 件 (`:876`)。`template|backtick|テンプレート` (expected.mjs の注記) は 1 件 (`:684`。別の fixture の話で、項目 16 の 2 形には触れない)
- **リスク/影響**: load-bearing gate は `SafePermissionMode` 型と `assertSafePermissionMode` なので、query の権限面は塞がれている。テンプレートリテラルや素のキーで書かれた綴りを検査が見逃す穴は、仕組みとして残る
- **推奨アクション**: feature では追加の作業は要らない。I-3 で項目 16 を作り直すときに、backtick の照合を足すか、`UNDETECTED_NOTES` に 1 項目足す
- **根拠**: Principle III / AD-041 (a) / PB-7
- **scope 根拠**: 規則の穴は既存で、本 feature の touched files の外にある

### [Low] `dispose()` の後に `on*` が呼ばれたら何もしない、という規則が正本に無い。異常終了の経路のテストも無い (L-002。R2 から残る。範囲を絞った) (scope: feature)

- **観察**:
  - 手当てされたもの:
    - data-model `:113`: 「`finish()` の最初 → 全部の保留と timer を捨てる」
    - plan `:244`: 「`dispose` の後に何も送らない」
    - BE-041 (`tasks.md:111`): 「全部を取り消した後に何も送らず timer が残らない」
    - BE-042 (`tasks.md:118`): 「`ended` の後の `event` が 0 件」
  - 残るもの:
    - 正本の data-model に「`dispose()` の後の `on*` は timer を張らない」が無い
    - 異常終了の経路で `finish()` を呼ぶのは `fatalSink` (`C:\dev\closta\src\agents\sdk-agent-session.ts:415-418`)。このとき stream のループ (`:508`) は `waitChildExit` の待ち (`:351-353`) の間も動き続ける。meter-throttle の timer の callback が投げた未捕捉の例外そのものが `fatalSink` を起こしうる
- **同種事象探索**: `finish()` の呼び出しは 4 件 (`sdk-agent-session.ts:417,462,482,572`)。ループが動いたまま呼ぶのは `:417` (fatalSink)
- **リスク/影響**: `ended` の直前 1 秒以内に `onToolProgress` が来ると、`ended` の後に `tool-elapsed` が出うる (SC-004 に反する)。調停役スレッドは `ended` を受けて Worker を止めるので、窓は狭い
- **推奨アクション**:
  - data-model §2 `:113` に「`dispose()` の後の `on*` は何もしない (timer を張らない・送らない)」を足す
  - BE-041 のテストに「`dispose()` の後の `onToolProgress` / `thinking` で timer が張られない」を足す
  - BE-042 の `sdk-agent-session.test.ts` に、異常終了の経路で `finish()` の待ちの間に `tool_progress` を流し、`ended` の後の `event` が 0 件であることを足す
- **根拠**: AD-043 (セッションスレッドの出口は 1 つ) / SC-004
- **scope 根拠**: data-model §2 と tasks BE-041 / BE-042 で直せる

### [Low] 昇格の観測を記録しないことが、I-3 への申し送りに書かれていない (L-003。R2 から残る) (scope: feature)

- **観察**:
  - SH-013 (`tasks.md:145`) が I-3 の行に書くのは「昇格を観測したときの強制の要否」と、隔離の文言が暫定であることだけ
  - RK-14 (`plan.md:295`) が扱うのは、知らない形の失敗と、decoder が捨てた `meter` の観測点である。昇格の観測 (帯・行・`meters.permissionMode`) は renderer のメモリにしか残らず、`close()` で消える (data-model `:125,129`)
- **同種事象探索**: `I-3` (tasks.md) は 2 件 (`:145` の 2 か所)。`RK-14` (plan.md) は 1 件 (`:295`)
- **リスク/影響**: AD-041 の「昇格経路 0 件」からの逸脱が、いつ・何回起きたかを後から確かめられない。I-3 が強制の要否を決める材料が、quickstart V-4 #5 の手作業だけになる
- **推奨アクション**: SH-013 の I-3 の行に「O-4 は昇格の観測を記録しない (renderer のメモリだけ)。強制の要否を決めるときに観測点を足すかを決める」を足す。コードは変えない
- **根拠**: AD-041 Consequences `:157` / AD-047 Decision 5
- **scope 根拠**: roadmap の字面の追加で足りる

### 固有観点の確認

- **PB-1**: `init` から読むのは `permissionMode` だけで、`cwd`・`plugins[].path` は読まない (data-model.md:67)。BE-040 は目印の値で 0 件を確かめる (tasks.md:104)。quickstart も `cwd`・パスを控えない (quickstart.md:45)。穴は、人の手を介して渡る `CLAUDE_CONFIG_DIR` の名前空間だけ → M-001
- **PB-2**: 該当なし。理由:
  - `live-signals` / `meter-throttle` は `run()` の closure に作る (data-model.md:92)
  - renderer は sessionId をキーに持つ
  - 隔離の文言は、ランタイムの一覧を `runtimeId` で引く (`RunningSessionsProvider.tsx:57-59` と同じ形。引けなければ `undetermined`)
  - port はセッションが登録されるまで溜めるので、最初の `init` の `meter` は捨てられない (`running-session-store.ts:425-429`)
- **PB-3**: ランタイムの capabilities の表明は変えない。`unavailable` は「判定が済み、sandbox が安全の種別に無い」場合だけである (`capabilities.ts:85-90,165-169`)。なので「このランタイムには隔離がありません」は正直な表明である。`meter` 側で観測していない値を表明しうる点は L-004
- **PB-4**: 起動のダイアログの選択肢は `SAFE_PERMISSION_MODES` から作られ (`LaunchDialog.tsx:616-618`)、安全 3 値だけであることを既存のテストが固定している (`LaunchDialog.test.tsx:207`)。renderer の `PERMISSION_MODE_NAMES` に昇格値の key を置いても、選べる入口にはならない。書き戻しは無い (data-model.md:125、FE-040 のテスト)。アプリの外で CLI を走らせる案内は M-001
- **PB-5**: 該当なし。パスの変換を扱わない
- **PB-6**: アプリのコードは、子プロセス・ファイル・環境を変えない。quickstart の手作業でセッションが 1 つ残る点は、M-001 の推奨に注記した
- **PB-7**: 新しい agents のモジュールは、ディレクトリの正規表現の規則 (`.dependency-cruiser.js:193,200,207`) と項目 16 の走査範囲 (`allowlists.mjs:363`) に自動で入る。`supervisor` で始まらず、`worker_threads` も使わない (`:298`)。項目 16 の `permissionMode` の形の検査は、`launchPermissionMode` を誤検出しない。残る穴は L-001

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `CLAUDE_CONFIG_DIR\|--permission-mode\|claude -p\|--exec\|login` (014 の 6 文書) | 3 | quickstart.md:43, 44, 52 |
| M-001 | `configDir` (src/domain/provider/types.ts) | 3 | types.ts:98, 114, 153 |
| L-004 | `permissionMode` の無い (014 の 6 文書) | 1 | tasks.md:104 (`status` だけ) |
| L-001 | `` includes(`'${value}'`) `` (check.mjs) | 1 | check.mjs:876 |
| L-001 | `template\|backtick\|テンプレート` (expected.mjs) | 1 | expected.mjs:684 (項目 16 とは無関係) |
| L-002 | `finish()` の呼び出し (sdk-agent-session.ts) | 4 | sdk-agent-session.ts:417, 462, 482, 572 |
| L-003 | `I-3` (tasks.md) / `RK-14` (plan.md) | 2 / 1 | tasks.md:145 / plan.md:295 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 4
- Round inheritance:
  - R2 から解消 2 件:
    - H-001 (HG-05) → data-model.md:67, 141、plan.md:290 (RK-09)、tasks.md:104 (BE-040)、tasks.md:140 (SH-012 の `init` の行の備考)
    - H-002 (HG-06) → data-model.md:172-176, 245、spec.md:153、tasks.md:105-106 (FE-040)、tasks.md:145 (SH-013)、tasks.md:15 (SH-001)
  - 未解消 3 件:
    - L-001 (system。feature 側は BE-004 で手当て済み)
    - L-002 (一部解消。正本の規則と異常終了の経路のテストに絞った)
    - L-003
  - 新規 2 件: M-001 / L-004

関連ファイル:
- C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md
- C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md
- C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md
- C:\dev\closta\specs\014-ui-metering-and-limits\plan.md
- C:\dev\closta\src\domain\provider\types.ts
- C:\dev\closta\src\agents\sdk-agent-session.ts
- C:\dev\closta\src\domain\runtime\capabilities.ts
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\renderer\src\features\session\running-session-store.ts
- C:\dev\closta\scripts\constitution\check.mjs
- C:\dev\closta\tests\rule-fixtures\expected.mjs
- C:\dev\closta\docs\decisions\0041-x4-launch-config-on-x1-launch-gate.md
- C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts
