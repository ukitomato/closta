/**
 * 検証の許可リストと定数の**正本** (SH-014 / FR-036 / FR-037 / FR-041 / research R-08)。
 *
 * **追加には ADR を要する。** Constitution 側はこのファイルを参照する形にしてある
 * (固定値を Principle 本文に埋め込むとレイヤ構成の変更で必ず食い違う。R-08)。
 *
 * ここに書くのは「許してよいものの列挙」だけである。**禁止側を列挙しない** —
 * 環境を変える操作は数が多く、列挙漏れが必ず生じる (R-08 Rationale)。
 */

/** 検証対象。`src/` と `scripts/` に加えビルド構成を含める (FR-037)。 */
export const SCAN_ROOTS = ['src', 'scripts']

/**
 * 検証対象に含めるビルド構成ファイル。
 * 本 feature がプロジェクトで初めて作るもので、実行されるが `src/` の外にある。
 */
export const SCAN_FILES = [
  'package.json',
  'electron.vite.config.ts',
  'electron-builder.yml',
  'eslint.config.mjs',
  '.dependency-cruiser.js'
]

/** 走査する拡張子。 */
export const SCAN_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  /*
   * **`.html` を含める。** renderer の入口 HTML は meta タグで CSP を宣言できる。
   * 拡張子を落としていたため、scaffold 由来の 2 つ目の CSP 定義を検証項目 10 が
   * **一度も見ていなかった** (実測)。AD-025 §7 は「開発用の CSP 定義も走査対象に含め、
   * 除外リストへ移さない」と定めている。
   */
  '.html'
]

/**
 * 除外は**ファイル単位の明示リスト**とする (FR-037)。
 * ディレクトリ単位で除外すると、そこに後から実行可能コードが増えたときに
 * 検証が構造的に届かなくなる。
 *
 * 唯一のディレクトリ除外は違反サンプル置き場である。これは**ルール検証ランナーが
 * 検査対象へ展開する入力**であり通常検証のスコープ外という位置づけによる
 * (SC-009 が「違反サンプルを保持したまま違反 0 件」を要求するため)。
 */
export const EXCLUDED_FILES = []

/**
 * **検証の定義そのものを書いているファイル。**
 *
 * 許可リストと照合パターンは、性質上禁止語そのものを含む。
 * これを文字列リテラル走査 (項目 1 / 3 / 4 / 5) の対象にすると、
 * 定義を書いた瞬間に全部が違反になり検証が成立しない。
 *
 * **除外はこの 2 ファイルと、リテラル走査の項目 (1 / 3 / 4 / 5) に限る。**
 * プロセス起動 (項目 7)・プラットフォーム分岐 (項目 8)・関連付け API (項目 9)・
 * CSP (項目 10)・ナビゲーション拒否 (項目 11) は**これらのファイルにも掛かる** —
 * ここは「定義」ではなく「実行されるコード」だからである (FR-037)。
 *
 * 掛け続けられるのは、それらの項目が名前の出現ではなく**呼び出し形**を見ているため。
 * 名前一致で判定していた実装では、`setWindowOpenHandler` をアプリから消しても
 * ここに書いた定数の値が存在確認を満たしてしまっていた (実測で見つけた穴)。
 */
export const SELF_DEFINITION_FILES = [
  'scripts/constitution/allowlists.mjs',
  'scripts/constitution/check.mjs'
]

/** 違反サンプル置き場。通常検証のスコープ外 (SC-009 / SH-020)。 */
export const RULE_FIXTURES_DIR = 'tests/rule-fixtures'

/* ── 項目 1: 特権コマンド ───────────────────────────────────────────── */

/**
 * 特権コマンドと環境を変えるパッケージ操作のうち、**他の意味で使いようがない名前**。
 * どのファイルに現れても違反とする。引数配列の 1 要素として現れる形も捕捉する。
 */
export const PRIVILEGED_COMMANDS_ALWAYS = [
  // Linux
  'sudo',
  'doas',
  'pkexec',
  'apt-get',
  'dpkg',
  'pacman',
  'zypper',
  'systemctl',
  'chroot',
  'usermod',
  'useradd',
  'groupadd',
  'visudo',
  // Windows
  'runas',
  'regedit',
  'regedit.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'schtasks',
  'schtasks.exe',
  'netsh',
  'netsh.exe',
  'wmic',
  'wmic.exe',
  'bcdedit',
  'bcdedit.exe',
  'dism',
  'dism.exe',
  'winget',
  'winget.exe',
  'choco',
  'choco.exe',
  'scoop',
  'reg.exe',
  'sc.exe',
  'net.exe'
]

/**
 * 同じく特権コマンドだが、**普通の英単語と衝突する名前**。
 *
 * `net` / `sc` / `reg` / `mount` / `su` は語としてありふれており、
 * どこに現れても違反にすると誤検出が続いて出力が読まれなくなる。
 * そこで**プロセス起動 API を持つファイルに現れた場合だけ**違反とする。
 *
 * これで穴は開かない。プロセス起動 API を使えるモジュールは項目 7 が
 * 許可リストに絞っており、起動できない場所でコマンド名を書いても実行されない。
 * **2 つの項目が噛み合って初めて塞がる形**である。
 */
export const PRIVILEGED_COMMANDS_IN_SPAWN_CONTEXT = [
  'su',
  'apt',
  'yum',
  'dnf',
  'rpm',
  'apk',
  'snap',
  'mount',
  'reg',
  'sc',
  'net',
  'dd'
]

/* ── 項目 2: `wsl.exe` に渡す引数 ──────────────────────────────────── */

/**
 * `wsl.exe` に渡してよい引数。**これ以外を渡す実装は違反**。
 * `--import` / `--install` / `--set-default` のような環境を変える引数は含めない。
 */
export const WSL_ALLOWED_ARGS = [
  '-l',
  '--list',
  // 名前だけを返す列挙。**contracts C-2 が名前の正本として要求する形**である
  // (列整形・翻訳の影響を受けない)。
  '-q',
  '--quiet',
  '-v',
  '--verbose',
  '--all',
  '--running',
  '-d',
  '--distribution',
  '-u',
  '--user',
  '--exec',
  '--',
  '--cd'
]

/* ── 項目 3 / 4 / 7: モジュール許可リスト ─────────────────────────── */

/** `wsl.exe` を名指してよいモジュール。 */
export const WSL_CALLER_MODULES = ['src/main/infra/runtime/wsl-cli.ts']

/** docker CLI を名指してよいモジュール。**R-1 では空** (R-08 項目 4)。 */
export const DOCKER_CALLER_MODULES = []

/**
 * プロセス起動 API を使ってよいモジュール。
 *
 * | モジュール | 何を起動するか |
 * |---|---|
 * | `src/main/infra/runtime/wsl-cli.ts` | `wsl.exe` のみ (項目 3 が別途縛る) |
 * | `scripts/rules/run.mjs` | 検証器そのもの — eslint / depcruise / この検証スクリプト / tsc |
 * | `scripts/build/package.mjs` | `electron-builder` のみ |
 *
 * **後者は AD-024 #5 で検証スコープを `scripts/` へ広げた帰結である。**
 * 検証器を起動するランナーは、起動しなければ仕事にならない。
 * ここを除外リストで逃がすと、`scripts/` 配下が構造的に検査から外れる。
 *
 * 許可したのは**項目 7 だけ**である。項目 1 (特権コマンド文字列)・
 * 項目 3 (`wsl.exe` を名指せるモジュール)・項目 4 (docker) は引き続き掛かるので、
 * このファイルから環境を変える操作を起動すれば別の項目が捕まえる。
 */
export const PROCESS_SPAWN_MODULES = [
  'src/main/infra/runtime/wsl-cli.ts',
  'scripts/rules/run.mjs',
  'scripts/build/package.mjs',
  /*
   * セッション列挙の短命 `utilityProcess` を起こす (AD-028 §4)。
   *
   * **追加によって項目 1 / 3 / 4 / 5 が同ファイルに掛かる。**
   * 特に項目 3 (裸の `wsl`) の発火条件は「プロセス起動 API を持つファイル」であり、
   * `SPAWN_CALL_PATTERNS` は `utilityProcess` を含む。
   * したがって**トリガは本リストへの追加ではなく `utilityProcess` と書いた瞬間**である。
   * 回避策は設計で決めてある — このファイルに `'wsl'` の文字列リテラルを書かない。
   * 所在の判別は `Location` の値で行う。
   */
  'src/main/app/enumerator-spawner.ts',
  /*
   * transcript 取得の専用短命プロセスを起こす (R-3 / AD-034 決定 2 / C-2)。
   *
   * **`enumerator-spawner.ts` と別モジュールにする。** あちらは AD-030 の常駐プロセスを
   * postMessage+stdout で起こす前提であり、こちらは 1 要求ごとに env 固定で起こし、
   * `MessageChannelMain` の port を子へ transfer する (main を本文経路から外す)。
   * 常駐/短命の 2 つの寿命を 1 ファイルに混ぜない。
   */
  'src/main/app/transcript-spawner.ts',
  /*
   * X-1: セッション起動の per-session `utilityProcess` を起こす (AD-036 §3)。
   * transcript-spawner (per-request 短命) / enumerator-spawner (常駐) と別寿命なので新モジュール。
   */
  'src/main/app/session-spawner.ts',
  /*
   * X-1: agents の session worker。SDK の `spawnClaudeCodeProcess` コールバックで WSL 起動 spawn を行う
   * (AD-036 §3。`pathToClaudeCodeExecutable` だけでは wsl.exe 前置を注入できないため child spawn が要る)。
   * **`wsl.exe` のリテラルは持たない** (WSL_FREE_DIRECTORIES / 値で受ける)。ESLint 側の spawn 例外も
   * この 1 ファイルに限定して開ける (eslint.config.mjs の `agent-session-spawn` category)。
   */
  'src/agents/sdk-agent-session.ts'
]

/* ── 項目 12 / 13: UNC 形式の封じ込め (AD-028 §3) ─────────────────── */

/**
 * UNC 接頭辞の**文字列リテラル**を持ってよいモジュール (項目 12)。
 *
 * AD-025 は「UNC 形式は `infra` の内側に閉じる」と定めたが、
 * 実体は `domain` のパス API が UNC を組み立てている。AD-028 §3 はこれを
 * **「UNC のリテラルを持てる場所で線を引く」**形に読み替えた。
 *
 * | モジュール | 理由 |
 * |---|---|
 * | `src/domain/runtime/path-types.ts` | `UNC_PREFIX` の定義と `makeWslUncPath` の検証 |
 * | `src/domain/runtime/path-api.ts` | `toUnc` / `fromUnc` / `parseWslUncPath` の実装 |
 *
 * **「`toUnc()` を呼んでよいモジュール」の許可リストは作らない。**
 * `toUnc()` を呼ぶのは正規の経路であり (`infra/fs/wsl-fs.ts` が既にそうしている)、
 * 縛っても塞がる脅威が無い。塞ぐべきは **API を迂回した手組み** である (AD-028 §3)。
 */
export const UNC_LITERAL_MODULES = [
  'src/domain/runtime/path-types.ts',
  'src/domain/runtime/path-api.ts'
]

/**
 * UNC 接頭辞と見なす綴り。**3 綴りすべてを対象にする** —
 * 1 つだけ塞いでも別の綴りで手組みできる (research R-01 で 3 綴りの成立を実測)。
 */
export const UNC_LITERAL_PATTERNS = ['\\\\wsl.localhost\\', '\\\\wsl$\\', '//wsl.localhost/']

/**
 * テストは UNC リテラルを書いてよい (項目 12 の除外)。
 *
 * **解析器が 3 綴りを受理することを証明する場所がテストである。**
 * ここを禁じると規則そのものがテスト不能になる。テストは出荷物に入らない。
 * `CSP_DECLARATION_EXEMPT_SUFFIXES` と同じ考え方である。
 */
export const UNC_LITERAL_EXEMPT_SUFFIXES = ['.test.ts', '.test.tsx']

/**
 * UNC のリテラルと UNC API 呼び出しの**両方**を禁じる場所 (項目 13)。
 *
 * 列挙プロセスは受け取った値を SDK に渡すだけであり、UNC を扱わない
 * (AD-028 §3 の規則 2 の機械強制)。
 */
export const UNC_FORBIDDEN_IN = ['src/agents/']

/** UNC 値を作る API の名前。項目 13 が `UNC_FORBIDDEN_IN` 配下での呼び出しを禁じる。 */
/**
 * Agent SDK のパッケージ名 (R-2 / SH-081)。
 *
 * **Claude Code との通信は Agent SDK 経由に限る** (Principle IV / AD-002)。
 * ここを書き換えるだけで検査対象が変わる形にしておく。
 */
export const AGENT_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk'

/**
 * SDK を import してよい場所。
 *
 * **AD-023 §2 は「Agent SDK を呼ぶコードは `agents` に置く」とディレクトリ単位で
 * 定めている。** ファイル単位にすると ADR より厳しい規則になり、
 * R-3 (本文取得) / X-1 (起動) がファイルを増やすたびに許可リストの更新が要る —
 * それは ADR が求めていない手間である。
 *
 * **どの API を呼べるかは別の許可リストが縛る** (`AGENT_SDK_ALLOWED_CALLS`)。
 * 置き場と呼べるものを 1 つのリストで兼ねさせない。
 */
export const AGENT_SDK_IMPORT_DIRECTORIES = ['src/agents/']

/**
 * 呼んでよい SDK の API (SH-081 / contracts C-4 / R-3 AD-034 C-4)。
 *
 * - `listSessions` — R-2 の列挙 (読み取り)
 * - `getSessionMessages` — R-3 の transcript 取得 (読み取り。AD-034)。呼ぶのは `src/agents/read-transcript.ts`
 * - `query` — X-1 のセッション起動 + stream + interrupt (AD-002 V1 / AD-036)。呼ぶのは `src/agents/sdk-agent-session.ts`
 *
 * **許可以外を禁じる形で検査する。** 禁止側を列挙すると必ず漏れる。
 * **書き込み系 API (`renameSession` / `tagSession` / `deleteSession` / `forkSession` /
 * `importSessionToStore`) は許可しない** — transcript は読み取り専用である (FR-001)。
 *
 * **判定は呼び出し形で行う。** import しただけの名前や型注釈を違反にすると、
 * これらを正当に使う後続 feature (X-1 / O-1 / I-1) で検証が破綻する (research R-07)。
 */
export const AGENT_SDK_ALLOWED_CALLS = ['listSessions', 'getSessionMessages', 'query']

/**
 * 権限ゲートの正の構成 (P1-P3) の **backstop** 検査対象 (contracts C-4 / SH-010 / AD-036 §4)。
 *
 * 正の構成そのものは `agents/session-core.ts` の `buildQueryOptions` (allowlist キーのみ) と
 * `toPermissionResult` ({behavior, message} のみ) が構造的に保証し unit test が守る。
 * 項目 16 は **SDK を保持するファイル (`AGENT_SDK_IMPORT_DIRECTORIES`) に昇格レバーが直に現れないこと**を見る。
 * 項目 14 が見ない「options リテラルのキー」と「`Query` の `.method()` 呼び出し」を捕まえる歯止めであり、
 * ここに挙げるのは「現れてはならない綴り」であって正の構成の代替ではない (正本は contracts C-4)。
 */

/** `query()` options に現れてはならない昇格キー (P1)。承認カード/権限モードを迂回するレバー。
 *
 * **`settings` は X-3 の [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) で
 * 本 denylist から外した** — helper 委譲 (`api-key-helper` / `aws-credential-export`) のため
 * 「2 キー限定の制約付き射影」に限り許すため。全面解禁ではなく、SDK 保持ファイルの `settings:` は
 * **必ず `assertHelperSettings(...)` を通す**ことを項目16 の専用検査が backstop で強制する (下記)。 */
export const QUERY_ESCALATION_OPTION_KEYS = [
  'extraArgs',
  'allowedTools',
  'disallowedTools',
  'permissionPromptToolName',
  'allowDangerouslySkipPermissions',
  'mcpServers'
]

/**
 * `settings` の値に現れてよいキー (AD-040 Decision 4)。helper 委譲の 2 キー限定射影。
 * 参照用の SSoT — 実際の positive 強制は型 (`HelperSettings`) と query 直前の実行時 assert
 * (`assertHelperSettings`) が担い、項目16 は grep backstop (変数形 `settings: someVar` の中身は見られない)。
 */
export const QUERY_SETTINGS_ALLOWED_KEYS = ['apiKeyHelper', 'awsCredentialExport']

/**
 * SDK 保持ファイルで `settings:` を許す**唯一の形** = ドメインの検証済みラッパ (AD-040)。
 * これ以外の `settings:` (リテラル/別変数) は昇格の疑いで項目16 が違反にする。
 */
export const SANCTIONED_SETTINGS_WRAPPER = 'assertHelperSettings'

/** `Query` の mutation メソッド。呼んでよいのは `interrupt` のみ (P3)。 */
export const QUERY_MUTATION_METHODS = [
  'setPermissionMode',
  'setMcpPermissionModeOverride',
  'applyFlagSettings',
  'updateSettings',
  'setModel',
  'setMaxThinkingTokens'
]

/**
 * `permissionMode` に現れてよいのは**安全 3 値** (`default` / `plan` / `dontAsk`。AD-041 (a))。
 * **danger mode の昇格値を締め出す** (FR-013 / SC-006(a) / X-4 SC-005)。
 * `bypassPermissions` / `acceptEdits` / `auto` (無人実行) を含める。`plan` / `dontAsk` は AD-020 の危険度表で
 * 「安全」であり昇格ではないため含めない。capability 連動の昇格モードは I-3。
 */
export const PERMISSION_MODE_ESCALATION_VALUES = ['bypassPermissions', 'acceptEdits', 'auto']

/**
 * SDK 保持ファイルで値位置の `permissionMode:` を許す**唯一の形** = ドメインの実行時 assert (AD-041 (a))。
 * これ以外 (リテラル / 別変数 / shorthand `{ permissionMode }`) は項目16 が違反にする。型位置
 * (`readonly permissionMode:` / 型名が続く宣言) は対象外。
 */
export const SANCTIONED_PERMISSION_MODE_WRAPPER = 'assertSafePermissionMode'

/**
 * Principle V (資格情報を永続化しない) の**ソース側 backstop** (X-3 / SH-010 / security H-004)。
 *
 * 永続化層と秘密モジュールのソースに**平文の秘密リテラル**が現れないことを見る (開発者が誤ってキーを
 * ハードコードするのを止める)。**利用者の runtime `providers.json` に永続された秘密値は静的検査できない** —
 * その runtime ガードは `provider-record`/`provider-service` の extraEnv 値スキャン (BE-004) + SC-002 の
 * 単体テスト + security-reviewer が担う (捕まらない経路の正直な列挙。AD-024 #9 / AD-027)。
 */
export const SECRET_LITERAL_SCAN_DIRS = ['src/main/infra/settings/', 'src/main/infra/secrets/']

/** 平文秘密の綴り (既知プロバイダのキー接頭辞 + PEM)。domain/provider/secret-scan.ts の runtime 版と同種。 */
export const SECRET_LITERAL_PATTERN =
  /(sk-[A-Za-z0-9_-]{16}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{16}|glpat-[A-Za-z0-9_-]{16}|xox[baprs]-[A-Za-z0-9-]{10}|AIza[A-Za-z0-9_-]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

/**
 * `wsl.exe` を新たに呼ばないことの検査対象 (SH-082 / SC-003)。
 *
 * **R-2 が追加したレイヤ**を名指しする。R-2 は実行状態の確認に
 * R-1 の `verifyRunning()` を使うだけであり、自分では `wsl.exe` を起動しない
 * (contracts C-7。この 1 行が SC-003 の「0 件」を成り立たせている)。
 */
/**
 * `wsl.exe` と WSL CLI を参照してはならないディレクトリとファイル (項目 15)。
 *
 * **R-2 の `app` レイヤを実名で足してある** (code-gate iteration 1 / convention H-001)。
 * 初版はディレクトリ 3 件だけで `src/main/app/` を一度も見ていなかった。
 * ところが contracts C-7 の「R-2 は `wsl.exe` を新たに呼ばない」を実際に守る責任があるのは
 * **`session-service.ts`** である (R-1 の `verifyRunning` を注入で受け取る側)。
 * **違反が 0 件だったのではなく、検査が 0 件だった** —
 * plan.md が SH-091 について書いた形と同じである。
 *
 * **`src/main/app/` をディレクトリごと足さない。**
 * `composition-root.ts` は R-1 の検出器を結線するため `wsl.exe` 系の語を正当に持つ。
 * `services-not-to-io` と同じ**実名列挙**にして、新しいファイルが黙って対象外に
 * ならないようにする (新規ファイルは列挙されていないので、追加時に判断を強制される)。
 */
export const WSL_FREE_DIRECTORIES = [
  'src/agents/',
  'src/main/infra/session/',
  'src/domain/session/',
  'src/main/app/session-service.ts',
  'src/main/app/session-ipc.ts',
  'src/main/app/session-enumerator.ts',
  'src/main/app/enumerator-spawner.ts',
  'src/main/app/dto-mapper.ts',
  // R-3: transcript 取得は read-only で wsl.exe を起こさない。起動点も含めて検査対象に入れる
  // (現状 wsl-free。pr-gate platform-boundary M-001)。
  'src/main/app/transcript-service.ts',
  'src/main/app/transcript-spawner.ts',
  // X-1: 起動系の app モジュール。wsl.exe を名指さない (argv は infra/runtime の RuntimeLaunchSpec を値で受ける)。
  'src/main/app/session-launch-service.ts',
  'src/main/app/session-spawner.ts',
  // X-4: プリセットの取り回しと起動前段。wsl.exe を名指さない (起動 argv は infra/runtime の
  // buildRuntimeLaunchSpec を注入で受ける。tasks SH-011 / code-gate convention H-001)。
  'src/main/app/preset-service.ts',
  'src/main/app/launch-preparation.ts'
]

export const UNC_API_NAMES = [
  'toUnc',
  'fromUnc',
  'makeWslUncPath',
  'parseWslUncPath',
  /* pr-gate Round 4 / 不変条件 1。綴りの判定を 1 関数に畳んだので、これが唯一の入口である。 */
  'classifyRawPath'
]

/** docker のイメージ構築サブコマンド。許可モジュール内に現れてはならない (項目 5)。 */
export const DOCKER_BUILD_SUBCOMMANDS = ['build', 'buildx', 'commit', 'import', 'load', 'push']

/* ── 項目 6: ディストロ内で実行するスクリプト ─────────────────────── */

/**
 * ディストロ内で実行するスクリプトを保持する定数の**識別子**と、その定義ファイル。
 *
 * **不変条件 (ADR レビューが担保する。機械検証されない)**:
 * - ディストロ内に永続的な変更 (ファイル・パッケージ・OS 設定) を残さない。
 *   プロセス寿命で消える一時資源の生成は許す
 * - 標準入力を読まない
 *
 * 「読み取りのみ」と書かないのは、AD-015 §8 の判定 4 が user namespace を
 * 実際に作成するためである (contracts/runtime-detection.md C-3)。
 */
export const DISTRO_SCRIPT_CONSTANTS = [
  { file: 'src/main/infra/runtime/probe-script.ts', identifier: 'PROBE_SCRIPT' }
]

/**
 * 項目 6 (iii): スクリプト内に現れてよいコマンド形。
 * **コマンド名の許可リストではなく、スクリプト全体を定数に固定したうえでの追加検査**である
 * — 出力系コマンドとリダイレクトの組み合わせで永続的な変更を残せるため (R-08)。
 */
export const DISTRO_SCRIPT_ALLOWED_FORMS = [
  'command -v',
  'test -',
  'unshare',
  'cat /proc/',
  'echo',
  'printf',
  'exit'
]

/** 項目 6 (iii): スクリプト内に現れてはならない形。リダイレクトによる書き込み。 */
export const DISTRO_SCRIPT_FORBIDDEN_FORMS = ['>', '>>', 'tee', 'dd ', 'install ', 'mkdir', 'touch']

/* ── 項目 8: プラットフォーム分岐 ─────────────────────────────────── */

/**
 * プラットフォーム分岐を書いてよいディレクトリ。**実名で定義する** (FR-036)。
 * Constitution Principle II の `--exclude-dir=runtime` は AD-023 のレイヤ構成に
 * 存在しないディレクトリを指しており、そのままでは使えない (R-08 Rationale)。
 */
export const PLATFORM_BRANCH_DIRS = ['src/main/infra/runtime/']

/**
 * プラットフォーム判定に使える式。**等価な API と構文変形を含める** (FR-036)。
 * 識別子の直接参照だけでは足りない。
 */
export const PLATFORM_BRANCH_PATTERNS = [
  // 直接参照
  /\bprocess\s*\.\s*platform\b/,
  // ブラケット記法
  /\bprocess\s*\[\s*['"`]platform['"`]\s*\]/,
  // 分割代入
  /\{[^}]*\bplatform\b[^}]*\}\s*=\s*process\b/,
  // 等価な標準 API
  /\bos\s*\.\s*platform\s*\(/,
  /\bos\s*\.\s*type\s*\(/,
  /\bos\s*\[\s*['"`](platform|type)['"`]\s*\]/,
  // Electron の等価 API
  /\bprocess\s*\.\s*(getSystemVersion|arch)\s*\(/,
  // Node の定数
  /\bprocess\s*\.\s*env\s*\.\s*(OS|OSTYPE)\b/
]

/** 注記。`platform-ok:` を**同じ行**に書く (Constitution v1.1.0 / Principle II)。 */
export const PLATFORM_OK_MARKER = 'platform-ok:'

/* ── 項目 9: OS へのプロトコル関連付け ────────────────────────────── */

/**
 * OS へのプロトコル関連付け API。**呼び出しが 0 件であること** (SC-016 後段 / R-13)。
 * レジストリを書くため Principle VI に抵触する。項目 1 では捕捉できない —
 * これは Electron の API 呼び出しであり、コマンド文字列として現れないからである。
 */
export const PROTOCOL_ASSOCIATION_APIS = [
  'setAsDefaultProtocolClient',
  'removeAsDefaultProtocolClient',
  'isDefaultProtocolClient',
  'setUserTasks',
  'setLoginItemSettings',
  'addRecentDocument'
]

/* ── 項目 10: CSP ─────────────────────────────────────────────────── */

/** CSP を組み立てる関数を持つファイル。**開発用の定義も走査対象に含める** (FR-040)。 */
export const CSP_FILES = ['src/main/app/protocol.ts']

/**
 * CSP を宣言しているとみなす標識。
 *
 * **`CSP_FILES` 以外のどこにも現れてはならない** (項目 10 の (e))。
 * 列挙した場所だけを検査する形では、**別の場所に 2 つ目の CSP があっても気付けない** —
 * scaffold 由来の `index.html` の meta タグが実際にそうなっており、
 * 出荷ビルドでも `unsafe-inline` を許したまま項目 10 は ok を返し続けていた。
 */
export const CSP_DECLARATION_MARKERS = ['default-src']

/**
 * 項目 10 の (e) の対象外。
 *
 * **ヘッダ名 (`Content-Security-Policy`) は標識にしない。** ヘッダを **設定する** 側
 * (`window.ts` / `protocol.ts`) は正当な消費者であり、宣言者ではない。
 * 標識を `default-src` (ポリシー本体の先頭 directive) に絞れば、
 * 「ポリシーそのものを書いている場所」だけが残る。
 *
 * テストはポリシーを **assert する** ために本体を持つので除く。
 * 出荷物に入らず、かつ `protocol.test.ts` は項目 10 が守る内容を検証する側である。
 */
export const CSP_DECLARATION_EXEMPT_SUFFIXES = ['.test.ts', '.test.tsx']

/** FR-040 が要求する directive 集合。**すべて現れること**。 */
export const CSP_REQUIRED_DIRECTIVES = [
  "default-src 'none'",
  'script-src',
  'style-src',
  'img-src',
  'connect-src',
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'"
]

/** CSP に現れてはならない形。`unsafe-inline` は dev 分岐に限るため別扱いにする。 */
export const CSP_FORBIDDEN_ALWAYS = ['unsafe-eval']

/** `unsafe-inline` を許す directive。これ以外に現れてはならない (FR-040 / SC-016)。 */
export const CSP_UNSAFE_INLINE_ALLOWED_DIRECTIVES = ['script-src', 'style-src']

/** dev 緩和のゲート。環境変数で判定してはならない (FR-040)。 */
export const CSP_DEV_GATE_EXPRESSION = 'app.isPackaged'

/* ── 項目 11: ナビゲーション拒否と origin 定数 ───────────────────── */

/** `window.open` を拒否するハンドラ。存在すること (FR-040 / SC-016)。 */
export const WINDOW_OPEN_HANDLER = 'setWindowOpenHandler'

/** トップレベル遷移を拒否するイベント。 */
export const NAVIGATION_GUARD_EVENT = 'will-navigate'

/**
 * 許可する origin の集合を返す関数。**定義は 1 箇所だけであること** (FR-039)。
 * 複数箇所で組み立てると、片方だけ緩めた状態が作れる。
 */
export const ALLOWED_ORIGINS_FUNCTION = 'allowedOrigins'
export const ALLOWED_ORIGINS_FILE = 'src/main/app/origins.ts'
