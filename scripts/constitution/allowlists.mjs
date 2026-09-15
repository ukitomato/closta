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
  '.yaml'
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
  'scripts/build/package.mjs'
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
