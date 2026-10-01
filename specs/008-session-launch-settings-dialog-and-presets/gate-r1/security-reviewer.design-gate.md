# security-reviewer Review: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Reviewer**: security-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md

## 初回読了 viewpoint

- FR/SC: この bundle が影響するもの: FR-001/004/005 (起動 config、安全 3 値、X-1 起動の再利用、IPC checker)、FR-006/007 (fail-safe 解決)、FR-009/010/011 (preset、秘密非混入)、FR-012/013/014 (config-dir RuntimePath、assume-role helper 生成、制御文字拒否)、FR-017 (カタログ write/read 対称)。SC-003/005/006/007/009/010。
- touched files に該当する charter / Confirmation: session charter L98/L111 (preset に秘密を入れない)、provider charter L89 (一時資格はファイルに書かない)、L93-94 (RoleSessionName、helper 生成は X-4)、AD-036 §4 P1 / §5 / §6 + Confirmation、AD-039 D2/D3、AD-040 Decision 1-4 + Confirmation (query 直前 assert)、check.mjs 項目 6 (i) 単一リテラル / 項目 16。
- A. 認可 / 認証 / secret 管理: Critical:0 High:2 Medium:2 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:2 Medium:3 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner (セキュリティに関わる ADR 間の矛盾は A/B の中で扱った)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: 該当なし: security は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

X-4 は X-1 の `launchSession(folderId, runtimeId)` を広げて `launchSession(config)` (6 軸) にする。X-3 の `deriveEnv` を実際の起動に初めて配線し、helper settings を `buildQueryOptions` に通す。model / effort / 安全 3 値の権限モードを `query()` options に追加する。preset の JSON 永続化と、userData 上の aws-assume-role helper 生成も含む。見たのは既存のゲートで、IPC 送信元チェック (`ipc.ts:141-147` `isTrustedSender`)、`buildQueryOptions` (`session-core.ts:108-117`)、main→agents の launch メッセージ (`session-spawner.ts:65-67` と `sdk-agent-session.ts:163-183`)、起動 env (`launch-spec.ts:24-49`)、provider の検証器 (`validate.ts:236-369`)。それぞれ、設計が追加しようとしている新しい値と突き合わせた。

## Findings

### [High] 導出 env を wsl.exe の境界越しに Linux 側の claude へ届ける手段が未設計で、「最終 env denylist を通す」という記述と curated 資格情報キーが衝突している (H-001) (scope: feature)

- **観察**: `plan.md:128` と `tasks.md:25` は、deriveEnv の env を `RuntimeLaunchSpec.env` にマージし、「最終 denylist を通す」としている。一方で次の事実がある。
  - `launch-spec.ts:30` の `LAUNCH_ENV_DENY_PATTERN = /^(WSLENV|.*(API_?KEY|TOKEN|SECRET|PASSWORD)|AWS_.*)$/i` は、`derive-env.ts:56/60/73-75` が注入する curated キー (`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` / `AWS_PROFILE` / `AWS_REGION`) にそのまま一致する。
  - AD-036 §6 (L170-171) は、`ANTHROPIC_API_KEY` / `AWS_*` を起動 env の denylist に入れ、SC-006 で assert するとしている。
  - AD-015 §5 (L86-91) の実測表では、Windows 側の値が WSL 内に届いたのは `WSLENV` 経由だけ。`composeClaudeSpawn` (`session-core.ts:175-183`) は wsl.exe の env として `spec.env` しか渡さないので、`WSLENV` が無ければ curated キーは Linux 側の `claude` に届かない。
- **同種事象探索**: `WSLENV` を `src/` で検索して 20 件。すべて「含めない」側の定義かテスト (`launch-spec.ts:30`, `wsl-cli.ts:47`, `session-core.ts:170`, `derive-env.ts:40`, 各 test)。「届ける」側の設計は 0 件。
- **リスク/影響**: 設計どおりに作ると、どちらに転んでも問題になる。
  - (a) 最終 denylist が実際に動けば、api-key / oauth / aws-profile 方式の起動は資格情報なしで黙って失敗する。
  - (b) 実装者は、ADR で決まっていない回避策のどれかに流れやすい。`WSLENV` の再導入 (AD-036 §6 違反で、以後の denylist 保証が全部崩れる)、argv に `env KEY=VALUE` を入れる (Windows と Linux の両方でプロセスのコマンドラインに秘密が出て、同じユーザーの他プロセスや EDR から読める。CWE-214)、distro 内へのファイル書き出し (Principle VI と provider charter L89 に違反)。
  SC-009 の「passthrough が 0」も、何を測るのかが決まらない。
- **推奨アクション**: AD-041 で資格情報の受け渡し経路を明示的に決める。候補は次の 3 つ。
  - (i) `WSLENV` を**実名の curated キーだけ**で組み、アプリ自身が生成する。親の `WSLENV` は引き続き denylist で落とす。AD-036 §6 の範囲を「passthrough の denylist」に限定する調停文を入れる。
  - (ii) api-key 系も helper 方式 (`apiKeyHelper`) に寄せ、env に秘密を載せない。
  - (iii) (i) と (ii) の併用。
  あわせて「最終 denylist」の対象を passthrough 分だけに限ると明記し、curated 分は実名の allowlist で別に検証すると書く。SC-009 は「curated キー ⊆ 実名 allowlist、それ以外の denylist 一致は 0」に書き換える。
- **根拠**: AD-036 §6、AD-015 §5、AD-039 D3、Principle V、CWE-214。
- **scope 根拠**: plan BE-006 と AD-041 (この feature で起票する) で直せる。

### [High] SDK が生成する argv は `wsl.exe ... --` の後ろで Linux シェルに解釈されるのに、X-4 はこの経路に renderer 由来の model / effort と helper パス入りの `--settings` を初めて流す。検証は制御文字の拒否だけ (H-002) (scope: feature)

- **観察**: `launch-spec.ts:102` の prefixArgs は `['--cd', cwd, '-d', distro, '--']` で、`--exec` を使っていない。`--` の後ろがデフォルトシェルに解釈されることを示す既存の実測は 2 つある。
  - AD-015 §5 (L84): `wsl.exe -- <cmd> 'C:\dev\closta'` でバックスラッシュが消える。シェルのエスケープ処理と同じ挙動。
  - AD-015 §7 (L110): `wsl.exe -- command -v claude` が動く。`command` はシェル組み込み。
  `session-core.ts:181` はこの後ろに `options.args` (SDK がオプションから生成する引数) を並べる。X-4 が新しく載せる値は以下。
  - `model`: `plan.md:119`, `tasks.md:22`
  - `effort` / `permissionMode`
  - `settings` (helper パスを含む JSON): `tasks.md:23`
  これらの検証は `checkLaunchConfig` の「形 + 安全 3 値 + 制御文字拒否」だけ (`plan.md:127`)。モデルカタログ側の `isValidModelCatalog` (`validate.ts:277`) も `isValidName` (非空・長さ・制御文字なし) しか見ないので、`;` / `$()` / バッククォート / `|` / `'` / `"` を含む model ID がそのまま通る。
- **同種事象探索**: `--exec|'-e'` を `src/**/*.ts` と `docs/decisions/*.md` で検索して 0 件 (起動 argv に `--exec` は無い)。`isValidName(e.id` は 1 件 (`validate.ts:277`)。
- **リスク/影響**: model ID (カタログの手入力 → preset → `launchSession(config)`) にメタ文字が入ると、WSL 内で任意コマンドが `canUseTool` を経ずに実行される (CWE-78)。悪意が無くても、`--settings` の JSON は引用符がシェルに剥がされて壊れる可能性が高い。SDK が各オプションを argv フラグとして渡しているかは、実装前に `sdk.d.ts` / `cli` で確認が必要。ここは設計段階の指摘なので High に留める。
- **推奨アクション**: 次の 3 点を併せて行う。
  - (1) model ID / inferenceProfileId の文字種を allowlist にする (例: `^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,127}$`、先頭の `-` は禁止)。同じ述語を `validate.ts` の `isValidModelCatalog`、`provider-record`、`checkLaunchConfig` で共有する (write/read 対称)。
  - (2) effort は `EffortLevel` の 5 値の enum 照合にする。
  - (3) AD-041 で、起動 argv を `wsl.exe ... --exec <claudePath> ...` (シェルを経由しない形) に変えることを検討する。platform-boundary と共同で決め、`command -v` の件がある AD-015 §7 との整合も取る。変えないなら、「`--` 以降は全要素がシェルメタ文字を含まない」ことを `launch-spec` と `decodeLaunchSpec` で assert する。
- **根拠**: CWE-78、AD-015 §5/§7、Principle III (承認を経ない実行)。
- **scope 根拠**: validate.ts / provider-record / launch-spec はこの feature の touched files。

### [High] assume-role helper のパラメータ (role ARN / region / profile) に入力元も write/read 対称の検証器も無い。テンプレート埋め込みも項目 6 (i) の単一リテラル制約と衝突する (H-003) (scope: feature)

- **観察**: `types.ts:56` の aws-assume-role の `CredentialRef` は `{source, helperPath}` だけで、ARN / region / profile を持たない。`validate.ts:296-297` も `isStr(c.helperPath)` しか見ていない (制御文字を許す。これが X-3 から持ち越した SEC-L-201)。それなのに `plan.md:124` / `tasks.md:60` は「検証済みパラメータを埋める」と書くだけで、フィールドの追加、登録 IPC、`provider-record` の読み取り検証のタスクが無い。拒否の仕方も「制御文字・シェルメタ文字を拒否」という denylist 方式。加えて `check.mjs:279-283` の項目 6 (i) は「定数が単一のリテラルであること。連結すれば検査が通ってしまう (R-08)」を要求しており、テンプレートへの埋め込みは連結そのもの。SH-011 の「置換部の扱いを 3 点検査に合わせる」(`tasks.md:67`) は、この検査を緩める方向にしか読めない。
- **同種事象探索**: `awsCredentialExportPath|helperPath` で `src/domain/provider/types.ts:49,54,56,121` と `validate.ts:297` と `provider-service.ts:277`。ARN / region の検証器は 0 件。
- **リスク/影響**: パラメータは providers.json から来る。providers.json は /mnt/c 経由で WSL 側から書き換えられる (H-004 参照)。これが検証されないままシェルスクリプトの本文になると、コマンドインジェクションになるか、攻撃者が用意した role / profile で資格情報を取得させられる。項目 6 を緩めると、PROBE_SCRIPT 側の機械保証も一緒に弱くなる。
- **推奨アクション**: 次の 3 点。
  - (1) 型にフィールドを追加し、`checkProviderDraft` / `checkProviderPatch` / `provider-record` の 3 箇所で同じ allowlist 正規表現を使う。例: ARN `^arn:aws[a-z-]*:iam::\d{12}:role/[\w+=,.@/-]{1,512}$`、region `^[a-z]{2}(-[a-z]+)+-\d{1,2}$`、profile `^[A-Za-z0-9._-]{1,64}$`、RoleSessionName `^[\w+=,.@-]{2,64}$`。
  - (2) テンプレートにはパラメータを埋めない。スクリプトは**固定の単一リテラル**のまま (項目 6 を変えない)、パラメータは同じディレクトリの非実行データファイル (1 行 1 値) か位置引数で渡し、スクリプト内では必ず `"$1"` の形で引用して `eval` しない。
  - (3) SH-011 の文言を「項目 6 は変更しない」に改める。
- **根拠**: CWE-78 / CWE-20、X-3 SEC-M-001 (write/read 対称)、check.mjs 項目 6 (i)。
- **scope 根拠**: BE-031/032/033 と SH-011 はこの feature の範囲。

### [High] userData に生成する helper の完全性 (改竄 / symlink / TOCTOU) の設計が無い。helper は Claude Code が canUseTool を経ずに、セッション中に何度でも実行する (H-004) (scope: feature)

- **観察**: `plan.md:124` / `tasks.md:60,32` は「userData に LF で生成し、Provider ごとに 1 つを起動時に上書きする」(`plan.md:156` R-04) とだけ書いている。書き込みの原子性 (temp + rename)、既存 symlink の扱い、ファイル名の元になる id の検証、パーミッション、起動前の内容確認は、どれも書かれていない。userData は `/mnt/c/Users/<user>/AppData/Roaming/...` にあり、DrvFs 経由で distro 内の同じユーザーのプロセスから書ける。この「同じユーザーのプロセス」には当のセッションの Claude Code (Write / Bash ツール) や、同じ distro の別プロセスが含まれる。WSL 内のパーミッションは Windows ACL ではなく DrvFs のマウントオプションで決まる。R-01 (`plan.md:153`) は実行ビットにしか触れていない。awsCredentialExport は資格情報の期限が切れるたびに Claude Code が再実行するので、TOCTOU の窓はセッションの寿命全体になる。
- **同種事象探索**: userData へのスクリプト生成の先例を `DISTRO_SCRIPT_CONSTANTS` で見ると 1 件 (`allowlists.mjs:466` の PROBE_SCRIPT)。これは stdin で渡していてファイルを作らない。ファイル生成の先例は 0 件。
- **リスク/影響**: helper を書き換えられると、以後の資格情報取得 (stdout の一時資格) を横取りされるか、権限ゲートの外で任意コードを実行される。どちらも承認カードを経ない。symlink を置き換えられると、アプリの「上書き」が任意のファイルを書き潰す (CWE-59)。providers.json の id を細工されると、ファイル名で path traversal が起きる (CWE-22)。
- **推奨アクション**: 次の 5 点。
  - (1) 専用ディレクトリ `userData/helpers/` に、同じディレクトリ内の一意 temp → `rename` で書き込む (symlink を辿らない)。
  - (2) ファイル名に使う provider id を `^[0-9a-f]{32}$` で照合する (`composition-root.ts:288` の newId 形式)。
  - (3) 起動のたびに再生成し、settings には `/bin/sh '<RuntimePath>'` の形で渡して実行ビットに依存しない。
  - (4) 同じユーザーの WSL プロセスによる改竄は原理的に防げないので、その残存リスクを AD-041 に書き、推奨方式 (`api-key-helper` / `aws-credential-export` のユーザー管理 helper) との比較を記録する。
  - (5) R-01 の quickstart で DrvFs 上の mode (`stat`) を記録する。
- **根拠**: CWE-59 / CWE-22 / CWE-367、Principle III / V、provider charter L89。
- **scope 根拠**: BE-031/032 の範囲。

### [Medium] 起動 config の新しい値 (permissionMode / model / effort / settings) を main→agents 間で運ぶメッセージとその decoder が設計されていない (M-001) (scope: feature)

- **観察**: `session-spawner.ts:37` は `_input: LaunchInput` を捨てており、`:66` は `{kind:'launch', spec}` しか postMessage していない。`sdk-agent-session.ts:163-183` の `decodeLaunchSpec` も spec の 4 フィールドしか復元しない。BE-004 (`tasks.md:23`) は「buildQueryOptions に settings / model / effort を渡す」とだけ書き、境界を越えるメッセージの拡張と agents 側での再検証 (enum 照合・文字種) をタスクにしていない。
- **同種事象探索**: `kind: 'launch'` で `session-spawner.ts:66` の 1 件。
- **リスク/影響**: 実装者が spec.env に紛れ込ませたり、未検証の `unknown` を `as` でキャストしたりしやすい。permissionMode と settings は `buildQueryOptions` の assert が後段で止めるが、model / effort は agents 側に防御が無い。
- **推奨アクション**: launch メッセージに `options: {permissionMode, model?, effort?, settings?}` を明示フィールドとして足す。decoder は `isSafePermissionMode` / `isHelperSettings` / H-002 と同じ model 述語 / `EffortLevel` enum で再検証し、不正なら起動を拒否する。この項目を BE-004 に入れる。
- **根拠**: AD-040 Decision 2 (境界通過後に型保証を再確立する)、AD-036 §4 P1。

### [Medium] FR-006 の fail-safe が renderer の `resolveLaunchAxes` 頼みになっている。main 側の `checkLaunchConfig` は形しか見ない (M-002) (scope: feature)

- **観察**: `plan.md:127` の checkLaunchConfig は「6 軸の形 + 安全 3 値 + 制御文字」、`plan.md:134` は依存解決を renderer で行う。main 側で、model がカタログに含まれるか、effort がそのモデルの `supportedEffortLevels` に含まれるかを照合する記述は無い。providerId の到達可能性は `provider-service.ts:254` で再チェックされている。
- **同種事象探索**: `resolveLaunchAxes` は bundle 内だけで、main から呼ぶ記述は `tasks.md:42` (preset apply) の 1 件。
- **リスク/影響**: 未信頼の renderer (または改竄された preset) からの `launchSession(config)` で、カタログ外の model / 非対応の effort のまま起動できる。SC-002 の「無効値のまま起動 0 件」を main が保証しない。
- **推奨アクション**: `prepareLaunch(config)` の中で、最新の facts を使って `resolveLaunchAxes` を再実行する。reset が 1 件でもあれば、`rejected` にするか既定値へ戻して起動するかを決め、その理由キーを返す。

### [Medium] prepareLaunch の `env` は utilityProcess.fork の env も兼ねている。「buildLaunchEnv の代わりに deriveEnv」とすると、資格情報が agents worker のプロセス env に入る (M-003) (scope: feature)

- **観察**: `composition-root.ts:250-258` の `env` は、spec と fork の両方で使われる (`session-spawner.ts:43-44` `utilityProcess.fork(..., { env })`)。`tasks.md:25` は「`buildLaunchEnv(process.env)` の代わりに `providers.deriveEnv` を呼ぶ」と書いている。
- **同種事象探索**: `prep.env` は `session-launch-service.ts:93` の 1 件。
- **リスク/影響**: `ANTHROPIC_API_KEY` などが worker の `process.env` に入る。SDK や、worker から既定 env で起きる子プロセスに透過して、露出面が増える (Principle V、最小露出)。
- **推奨アクション**: fork の env は curated base (`buildLaunchEnv`) のまま固定し、導出 env は `spec.env` にだけ合流させる、と plan / BE-006 に明記する。「fork env に curated 資格情報キーが 0」の assert を SH-020 に追加する。

### [Medium] `plan` モードが持つモード遷移 (ExitPlanMode) を、昇格経路として評価していない (M-004) (scope: feature)

- **観察**: AD-036 §5 (L160-164) の SC-006(a) の全面列挙は、`default` から始まる前提で組まれている。X-4 はそこに `plan` を足す (`spec.md` FR-004) が、plan モードには ExitPlanMode の承認でモードが切り替わる経路が内蔵されている。その遷移先を確かめる記述は AD-041 の予定 (`plan.md:140`) に無い。P2 (`toPermissionResult` が `updatedPermissions` を出さない) で塞がれている見込みはあるが、確認した記録が無い。
- **同種事象探索**: `ExitPlanMode|exitPlan` を bundle 内で探して 0 件。
- **リスク/影響**: CLI が内部で `acceptEdits` などへ遷移する挙動を持っていた場合、SC-005 の「昇格モード 0 件」が実行時に破られる。
- **推奨アクション**: AD-041 の Confirmation に「SDK 0.3.270 で plan → ExitPlanMode 承認後の遷移先が `default` であり、P2 の下では昇格しない」ことの型または実機の確認を入れる。`system` / status メッセージで観測した permissionMode が安全 3 値の外なら、セッションを終了する監視も検討する。

### [Medium] preset の読み取り側の検証が、IPC 側の `checkLaunchConfig` と同じ述語で行われる設計になっていない (M-005) (scope: feature)

- **観察**: `plan.md:123` / `tasks.md:41` の preset-record は、キーの allowlist (id / name / config / updatedAt) までしか書いていない。config の値 (安全 3 値、id の文字種、model 述語) を読み取り時に検証する記述が無い。SC-010 の write/read 対称も models にしか適用していない (`spec.md` SC-010)。`supportedEffortLevels` についても、enum 照合・重複・件数上限を IPC 側と永続層で揃えることが明示されていない (`tasks.md:27`)。
- **同種事象探索**: `SEC-M-001` の対称パターンは `validate.ts:236,243,267,310` に 4 件。preset には 0 件。
- **リスク/影響**: presets.json は WSL 側から書き換えられる。IPC では通るが reload で消える、またはその逆の非対称が再発する (X-3 SEC-M-001 と同じ形)。apply で main から直接起動する実装にすると、IPC の検証を迂回する。
- **推奨アクション**: `checkLaunchConfig` の中身を domain の述語 (`isValidLaunchConfig`) に切り出し、`checkPreset` と preset-record の読み取りの 3 箇所で共有する。`supportedEffortLevels` は `EffortLevel` enum、重複なし、長さ ≤5 を 2 箇所共通にする。SC-010 の境界値テストの対象に preset を加える。

### [Medium] (H) 上記の指摘を検出するテストが SH-020 に無い (M-006) (scope: feature)

- **観察**: `tasks.md:71` の SH-020 に、次のテストが入っていない。
  - (a) model / effort にシェルメタ文字を入れた負例 (H-002)
  - (b) 拡張した launch メッセージの decoder の負例 (M-001)
  - (c) main 側の再解決 (M-002)
  - (d) fork env に資格情報が 0 (M-003)
  - (e) preset の読み取り側で昇格モードを拒否 (M-005)
  - (f) helper の symlink / id traversal の負例 (H-004)
  - (g) curated env が Linux 側に届くことの実機確認 (H-001。quickstart)
- **同種事象探索**: 該当なし (テストはまだ無い)。
- **推奨アクション**: 上の (a)〜(g) を SH-020 / SH-023 に列挙する。既存の regression として、`session-core.test.ts` の `permissionMode: 'default'` 固定の assert と X-1 SC-006(a) の「`dontAsk` 経路 0」のテストは、BE-003 で削るのではなく「安全 3 値外は throw」に置き換える形で残す。

### [Low] preset 名は新しい自由入力なのに、plan #17 は「自由入力を増やさない」を理由に `principle-v-unknown-shape-secret` を発火しないと判断している (L-001) (scope: feature)

- **観察**: `plan.md:88` と `tasks.md:46` (保存時の名前入力)。
- **推奨アクション**: 判断の理由を「名前は表示用で起動に使わない」に書き換える。名前には表示名と同じ `isValidDisplayName` を適用する。

### [Low] quickstart で helper を live 発火させる記録手順に、stdout (STS の一時資格) の記録禁止が無い (L-002) (scope: feature)

- **観察**: `tasks.md:74` の SH-023、`plan.md:153` の R-01。
- **推奨アクション**: quickstart-results.md に、helper の stdout / `aws sts` の出力を貼らないことを明記する。記録するのは RoleSessionName (CloudTrail 側) と exit code だけにする。prepareLaunch / deriveEnv の周辺で env / spec を log に出さないことも、同じ場所に書いておく (AD-039 D3)。

### [Low] 新しい IPC (listPresets / savePreset / removePreset) の登録方法と id 照合が明示されていない (L-003) (scope: feature)

- **観察**: 送信元チェックは `ipc.ts:141-147` の `handle()` ラッパーに集約されている (`ipcMain.handle` の直呼びは 0 件で、現状は健全)。`tasks.md:43` は handler の形を指定していない。
- **推奨アクション**: 新しい channel も必ず `handle()` 経由で登録する。`removePreset` は `unregisterFolder` (`ipc.ts:207-209`) と同じく既知 id との完全一致で照合する。session-ipc と同じ形の、Vitest で直接呼べる handler 分離にする。

### [Low] 軸の「既定」を表す sentinel と providerId が衝突しうる (L-004) (scope: feature)

- **観察**: `plan.md:112` の「各軸 `'default'` 可」。providers.json を改竄すると `id: 'default'` を作れる。
- **推奨アクション**: 既定値は `null` などの別の型で表す。または provider id を読み取り時に `^[0-9a-f]{32}$` で照合する。

### [Low] (H) 起動拒否の理由キーの観測点 (L-005) (scope: feature)

- **観察**: 起動を拒否する理由が増える (deriveEnv null、assert throw、decoder 拒否、再解決 reset) が、どれを理由キーとして区別して返すかが `tasks.md:25` 以外に書かれていない。
- **推奨アクション**: `LaunchFailureReason` に `provider-unavailable` / `invalid-config` などを追加する。throw の message に値 (パスや model) を含めない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `WSLENV` (src/) | 20 | launch-spec.ts:27-30, wsl-cli.ts:47,136, session-core.ts:170, derive-env.ts:40-41, agent-session.ts:86, 各 test。届ける側は 0 |
| H-002 | `--exec\|'-e'` (src, decisions) / `isValidName(e.id` | 0 / 1 | validate.ts:277 |
| H-003 | `helperPath\|awsCredentialExportPath` | 6 | types.ts:49,54,56,121, validate.ts:297, provider-service.ts:277 |
| H-004 | `DISTRO_SCRIPT_CONSTANTS` | 1 | allowlists.mjs:466 (ファイル生成の先例 0) |
| M-001 | `kind: 'launch'` | 1 | session-spawner.ts:66 |
| M-003 | `prep.env` | 1 | session-launch-service.ts:93 |
| M-005 | `SEC-M-001` (validate.ts) | 4 | validate.ts:236,243,267,310 |

## Verdict

- Critical: 0
- High: 4
- Medium: 6
- Low: 5
