import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginBoundaries from 'eslint-plugin-boundaries'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

/**
 * レイヤと依存規則の機械強制 (SH-011 / SH-012 / AD-023 §7 §8 / FR-035 / FR-036 / FR-038 / FR-041)。
 *
 * **ESLint は直接 import しか見ない。** 推移的な到達と `require()` は
 * dependency-cruiser (`.dependency-cruiser.js` / SH-013) が担当する。
 * どちらか一方では塞げないので両方必要である (AD-023 §7)。
 *
 * ルールが実際に発火することは `tests/rule-fixtures/` の fixture で検証する
 * (`pnpm test:rules`) — 設定しただけで発火しないルールは強制になっていない。
 */

/*
 * ── 禁止対象モジュールの定義 ──────────────────────────────────────────
 *
 * **1 つの定義を 2 つのルールに供給する。**
 * `boundaries/dependencies` は「解決後のモジュール」を見るので `node:` 接頭辞や
 * サブパスの綴りを網羅できる。`no-restricted-imports` は「import 文の文字列」を
 * 見るので解決器の設定に依存しない。
 *
 * 両方置く理由は実測に基づく: 解決器を設定するまで 44 件の依存が「未知」に落ち、
 * 許可行列が一切適用されていなかった。解決に依存する層だけでは穴が開く。
 * 定義を 1 箇所に集めているので 2 つのルールが食い違うことはない。
 */

/*
 * `*_SOURCES` は eslint-plugin-boundaries が報告する解決後の source。
 * **`node:` 接頭辞は剥がされない** (実測: `node:fs` は `source: 'node:fs'`)。
 * `*_SPELLINGS` は import 文に書ける綴りの全列挙 (`no-restricted-imports` 用)。
 */

/** パス操作の標準モジュール。 */
const PATH_SOURCES = ['path', 'node:path']
const PATH_SPELLINGS = [
  'path',
  'node:path',
  'path/posix',
  'path/win32',
  'node:path/posix',
  'node:path/win32'
]

/** プロセス起動の標準モジュール。 */
const SPAWN_SOURCES = ['child_process', 'node:child_process']
const SPAWN_SPELLINGS = SPAWN_SOURCES

/** プラットフォーム判定の標準モジュール。`os.platform()` 経路を塞ぐ。 */
const PLATFORM_SOURCES = ['os', 'node:os', 'process', 'node:process']
const PLATFORM_SPELLINGS = PLATFORM_SOURCES

/**
 * ネイティブモジュール。**未導入でもルールを先に置く** —
 * 導入した瞬間に `agents` / `domain` へ入り込むのを防ぐため (AD-010 / FR-041)。
 */
const NATIVE_MODULES = ['better-sqlite3', 'node-pty', 'keytar']

/**
 * `shadcn` / `assistant-ui add` が生成したファイル。**手で書いたコードではない。**
 *
 * 上流を再生成すると上書きされるので、体裁と厳格さのルールは掛けない
 * (掛けても次の `add` で戻り、上流との差分も読めなくなる)。
 * **レイヤ規則と禁止 import は掛け続ける** — こちらは上流の体裁ではなく
 * 本プロジェクトの不変条件だからである。
 * 整形の除外は `.prettierignore` に同じ集合で書いてある。
 */
const GENERATED_FILES = [
  'src/renderer/src/components/**/*.{ts,tsx}',
  'src/renderer/src/hooks/**/*.{ts,tsx}',
  'src/renderer/src/lib/**/*.{ts,tsx}'
]

/** パス操作の標準モジュールを import できる唯一の実装ファイル (Principle I / FR-025)。 */
const PATH_API_FILE = 'src/domain/runtime/path-api.ts'

/*
 * eslint-plugin-boundaries の要素パターンは**フォルダ**を指す。
 * ESLint の `files` は**ファイル**を指す。同じ集合を 2 表記で書く必要があるので、
 * 片方だけ直すと強制が食い違う。必ず並べて定義する。
 */

/**
 * `app` レイヤ。`src/main` 直下 (エントリ) と `src/main/app/` と `src/preload/` に分かれる
 * (AD-023 §1)。`src/main/infra` は先に `infra` として宣言するので取り込まれない。
 */
const APP_PATTERNS = ['src/main', 'src/preload']
const APP_FILES = ['src/main/app/**/*.ts', 'src/main/index.ts', 'src/preload/**/*.ts']

/** `electron` の import を許す唯一の例外。`safeStorage` のため (AD-023 §8 / Principle V)。 */
const SECRETS_PATTERN = 'src/main/infra/secrets/**'
const SECRETS_FILES = ['src/main/infra/secrets/**/*.ts']

/** プラットフォーム判定とプロセス起動を許すレイヤ (Principle II / FR-036)。 */
const RUNTIME_INFRA_PATTERN = 'src/main/infra/runtime/**'
const RUNTIME_INFRA_FILES = ['src/main/infra/runtime/**/*.ts']

/**
 * `spawnClaudeCodeProcess` コールバックで WSL 起動を行う agents の session worker (X-1 / AD-036 §3)。
 * **spawn 主体は infra/runtime だけでなく、本 ADR がゲートするこの 1 ファイルも許す** (プロセス起動 API を
 * 実名で数える FR-036 の趣旨は保つ)。`wsl.exe` のリテラルは持たず (WSL_FREE_DIRECTORIES / 値で受ける) spawn のみ。
 */
const AGENT_SESSION_SPAWN_FILE = 'src/agents/sdk-agent-session.ts'

/**
 * X-5: supervisor の entry (調停役スレッドの結線。AD-043 Decision 1)。セッションスレッドを `worker_threads` の
 * Worker として起こす。子プロセスは起こさない (`child_process` は許さない)。
 */
const SUPERVISOR_ENTRY_FILE = 'src/agents/supervisor.ts'

/**
 * `worker_threads` を import してよいのは supervisor の entry とセッションスレッドの 2 ファイルだけ (X-5 / AD-043)。
 * **全レイヤで禁じ、2 ファイルだけを開ける** — `boundaries/dependencies` の全レイヤ禁止 policy と
 * `RESTRICTED_DEFAULT` (`no-restricted-imports`) の両方に載せ、2 ファイルで `without` する
 * (パス操作・プロセス起動と同じ形。code-gate convention M-001 / platform-boundary M-001)。
 * agents の中だけで絞ると app / infra で Worker を起こせ、項目 20 が見ない「式で組んだ options」の
 * env 注入が素通しになるためである。
 * ESLint が見るのは import 文と `require()` / 動的 import まで。`process.getBuiltinModule()` の形は
 * `.dependency-cruiser.js` の `worker-threads-only-from-entry` が塞ぐ (code-gate platform-boundary L-101)。
 * 調停役スレッドの本体 (`supervisor-core.ts`) は fake の Worker で試すため import しない。
 */
const WORKER_THREADS_SOURCES = ['worker_threads', 'node:worker_threads']
const WORKER_THREADS_SPELLINGS = WORKER_THREADS_SOURCES

const MSG_PATH = `パス操作は ${PATH_API_FILE} のパス API 経由で行う (Principle I / FR-025)`
const MSG_ELECTRON = 'electron の import は app レイヤと infra/secrets/ のみ (AD-023 §8)'
const MSG_SPAWN = 'プロセス起動は src/main/infra/runtime/ のみ (FR-036)'
const MSG_PLATFORM = 'プラットフォーム判定は src/main/infra/runtime/ のみ (Principle II / FR-036)'
const MSG_NATIVE = 'ネイティブモジュールは agents / domain で禁止 (AD-010 / FR-041)'
const MSG_WORKER_THREADS = `worker_threads は ${SUPERVISOR_ENTRY_FILE} と ${AGENT_SESSION_SPAWN_FILE} のみ (AD-043 Decision 1 / 7)`
const MSG_UI_NAMESPACE_LITERAL =
  'renderer は名前空間つきパス値を組み立てない。main が返した PathDTO を' +
  'そのまま渡すこと (Principle I / FR-025 / SH-054)'
const MSG_CORE =
  'Node.js 標準モジュールの直接 import は許可されたファイルだけ (FR-035 / FR-036 / FR-025)'

function restrict(names, message) {
  return names.map((name) => ({ name, message }))
}

/** すべての `src/` ファイルに掛かる既定の禁止集合。レイヤ別 override で緩める。 */
const RESTRICTED_DEFAULT = {
  paths: [
    ...restrict(PATH_SPELLINGS, MSG_PATH),
    ...restrict(['electron'], MSG_ELECTRON),
    ...restrict(SPAWN_SPELLINGS, MSG_SPAWN),
    ...restrict(PLATFORM_SPELLINGS, MSG_PLATFORM),
    ...restrict(NATIVE_MODULES, MSG_NATIVE),
    ...restrict(WORKER_THREADS_SPELLINGS, MSG_WORKER_THREADS)
  ],
  // `electron/main` のようなサブパス経由の迂回を塞ぐ。
  patterns: [{ group: ['electron/*'], message: MSG_ELECTRON }]
}

/** 既定集合から一部の禁止を取り除いた集合を作る。 */
function without(excluded) {
  return {
    paths: RESTRICTED_DEFAULT.paths.filter((entry) => !excluded.includes(entry.name)),
    patterns: excluded.includes('electron') ? [] : RESTRICTED_DEFAULT.patterns
  }
}

export default defineConfig(
  // e2e/ は Playwright 専用 (別 tsconfig / 別 runner)。src の lint/型グラフに混ぜない (X-2 / AD-038 D2)。
  // `@playwright/test` は導入済みだが、e2e/ と perf/ を lint する設定は**まだ無い** (型検査だけ。roadmap の
  // E2E / 検証基盤 feature の項目)。perf/ (実機計測。CI では実行しない) も e2e/ と同じく src のグラフの外に置く
  // (O-1 / AD-038 D2 の類推)。perf が子プロセスを起こさないことは、当面レビューだけで守っている。
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'tests/rule-fixtures/**',
      'e2e/**',
      'playwright.config.ts',
      'perf/**',
      'playwright.perf.config.ts'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },

  // ── SH-011 / SH-012: 解決後のモジュールに対する許可行列 ─────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries: eslintPluginBoundaries },
    settings: {
      /*
       * **解決器を明示する。** 既定の node 解決器は `.ts` / `.tsx` と
       * tsconfig の `paths` を知らないため、`./App` や `@domain/...` が
       * すべて「未知の依存」に落ちる。**未知に落ちた依存は許可行列で判定されない**
       * ので、解決器の設定漏れはそのまま強制の穴になる。
       * `boundaries/no-unknown-dependencies` がその落下自体を error にしている。
       */
      'import/resolver': {
        typescript: {
          /*
           * **root の `tsconfig.json` を指してはいけない。**
           * root は `files: []` の solution-style なのでどのファイルも属さず、
           * `paths` が引かれない。実測では `@/...` の 62 件が解決できずに
           * 「未知」へ落ちた。参照先 project を直接並べる。
           */
          project: ['tsconfig.node.json', 'tsconfig.web.json'],
          // 上の理由で複数指定が正しい。「references でまとめよ」という助言は当たらない。
          noWarnOnMultipleProjects: true
        }
      },
      /*
       * ファイル単位の分類 (`boundaries/files`)。
       * 要素 (`boundaries/elements`) はフォルダを指すので、
       * **「このファイルだけ例外」という規則はこちらで表す。**
       */
      'boundaries/files': [
        { category: 'path-api', pattern: PATH_API_FILE },
        { category: 'runtime-infra', pattern: RUNTIME_INFRA_PATTERN },
        { category: 'agent-session-spawn', pattern: AGENT_SESSION_SPAWN_FILE },
        { category: 'supervisor-entry', pattern: SUPERVISOR_ENTRY_FILE },
        { category: 'secrets', pattern: SECRETS_PATTERN }
      ],
      /*
       * **先に一致した要素型が採用される。**
       * `src/main` には `app` と `infra` が同居するので (AD-023 §1)、
       * `infra` を先に宣言して `src/main` の `app` に吸われないようにする。
       */
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain' },
        { type: 'agents', pattern: 'src/agents' },
        { type: 'infra', pattern: 'src/main/infra' },
        { type: 'app', pattern: APP_PATTERNS },
        { type: 'ui', pattern: 'src/renderer' }
      ],
      'boundaries/flag-as-external': {
        /*
         * **解決できない別名を「外部」に逃がさない** (既定は `true`)。
         * 既定のままだと `@/../../main/app/ipc` のような、bundler は解決できるが
         * 解決器は解決できない綴りが「外部」に分類され、許可行列をすり抜ける。
         * `false` にすると「未知」に落ち `no-unknown-dependencies` が捕まえる。
         */
        unresolvableAlias: false,
        /*
         * electron-vite の `?asset` は**ビルドツールの仮想モジュール**であって
         * project のソースではない。別名で書くことを前提に、ここで明示的に
         * 「外部」と分類する (`electron.vite.config.ts` の `@resources` と対応)。
         */
        customSourcePatterns: ['@resources/**']
      }
    },
    rules: {
      /*
       * **後に書いた policy が前を上書きする。** 既定 `disallow` の下で
       * 「広い許可 → 狭い禁止 → さらに狭い許可」の順に並べる。
       */
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          /*
           * **`checkAllOrigins` は既定 `false` で、外部とコアの依存を一切見ない。**
           * 付け忘れると `electron` / Node 標準モジュールに対する policy が
           * 「書いてあるのに評価されない」死んだ設定になる (実測で確認した)。
           */
          checkAllOrigins: true,
          policies: [
            // (1) 外部パッケージは既定で許可する。react / zustand / assistant-ui など。
            { allow: { to: { module: { origin: 'external' } } } },

            // (2) AD-023 §7 のレイヤ行列。`domain` は誰も知らない。
            {
              from: { element: { type: 'domain' } },
              allow: { to: { element: { type: 'domain' } } }
            },
            // `agents` は別プロセス。`infra` へは IPC 経由のみ (AD-023 §7)。
            {
              from: { element: { type: 'agents' } },
              allow: { to: { element: { types: { anyOf: ['agents', 'domain'] } } } }
            },
            {
              from: { element: { type: 'infra' } },
              allow: { to: { element: { types: { anyOf: ['infra', 'domain'] } } } }
            },
            // `app` は結線するので全部知る。`ui` だけは別バンドルなので知らない。
            {
              from: { element: { type: 'app' } },
              allow: {
                to: { element: { types: { anyOf: ['app', 'agents', 'infra', 'domain'] } } }
              }
            },
            /*
             * `ui → domain` は「型と副作用のない純粋関数まで」(AD-025)。
             * **この制約は列挙では守れないので構造で守る** — `domain` から
             * I/O モジュールへの到達を推移的に禁止する (SH-013) ことで、
             * `ui` が `domain` から取れるものが純粋なものだけになる。
             */
            {
              from: { element: { type: 'ui' } },
              allow: { to: { element: { types: { anyOf: ['ui', 'domain'] } } } }
            },

            /*
             * (3) Node.js 標準モジュール。
             *
             * **禁止するレイヤを AD-023 §7 と FR-035 が名指す範囲に揃える。**
             * `domain` は I/O を持たない。`agents` は別プロセスで I/O を持たない。
             * `ui` は preload 越しの capability しか使わない (FR-035 が明示)。
             * `app` / `infra` は OS と接する側なので個別規則 (パス操作・プロセス起動・
             * プラットフォーム判定・`electron`・`worker_threads` (X-5)) だけで縛る。
             *
             * ここを全レイヤ禁止にすると規約より厳しくなり、`app` の
             * プロトコルハンドラのような正当な用途を例外で開ける羽目になる。
             */
            {
              from: { element: { types: { anyOf: ['app', 'infra'] } } },
              allow: { to: { module: { origin: 'core' } } }
            },
            {
              from: { element: { types: { anyOf: ['domain', 'agents', 'ui'] } } },
              disallow: { to: { module: { origin: 'core' } } },
              message: MSG_CORE
            },
            // パス操作・プロセス起動・プラットフォーム判定は**全レイヤ**で禁止し、
            // 許可ファイルだけを後続で開ける (Principle I / II / FR-025 / FR-036)。
            {
              disallow: {
                to: {
                  module: {
                    origin: 'core',
                    source: [...PATH_SOURCES, ...SPAWN_SOURCES, ...PLATFORM_SOURCES]
                  }
                }
              },
              message: MSG_CORE
            },
            // パス操作の標準モジュールはパス API の実装ファイルだけが触れる。
            {
              from: { file: { categories: 'path-api' } },
              allow: { to: { module: { origin: 'core', source: PATH_SOURCES } } }
            },
            // プラットフォーム判定とプロセス起動は `infra/runtime/` だけ。
            {
              from: { file: { categories: 'runtime-infra' } },
              allow: {
                to: {
                  module: {
                    origin: 'core',
                    source: [...SPAWN_SOURCES, ...PLATFORM_SOURCES]
                  }
                }
              }
            },
            /*
             * X-1: agents の session worker は `spawnClaudeCodeProcess` で WSL 起動 spawn を行う
             * (AD-036 §3 の訂正。この 1 ファイルに限る)。プロセス起動 (`child_process`) のみ許し、
             * プラットフォーム判定は許さない (platform 分岐は `infra/runtime/` に閉じる)。
             */
            {
              from: { file: { categories: 'agent-session-spawn' } },
              allow: { to: { module: { origin: 'core', source: SPAWN_SOURCES } } }
            },
            /*
             * X-5: `worker_threads` は**全レイヤ**で禁止し、セッションスレッドと supervisor の entry だけを
             * 後続で開ける (AD-043 Decision 1 / 7)。agents だけでなく app / infra も塞ぐ —
             * 上の (3) は app / infra に標準モジュールを許すので、ここで明示しないと素通しになる。
             * セッションスレッドは `parentPort` を、entry は `Worker` を使う。
             */
            {
              disallow: { to: { module: { origin: 'core', source: WORKER_THREADS_SOURCES } } },
              message: MSG_WORKER_THREADS
            },
            {
              from: { file: { categories: 'agent-session-spawn' } },
              allow: { to: { module: { origin: 'core', source: WORKER_THREADS_SOURCES } } }
            },
            {
              from: { file: { categories: 'supervisor-entry' } },
              allow: { to: { module: { origin: 'core', source: WORKER_THREADS_SOURCES } } }
            },

            // (4) `electron` は app レイヤと infra/secrets/ のみ (AD-023 §8)。
            {
              disallow: { to: { module: { origin: 'external', source: 'electron' } } },
              message: MSG_ELECTRON
            },
            {
              from: [{ element: { type: 'app' } }, { file: { categories: 'secrets' } }],
              allow: { to: { module: { origin: 'external', source: 'electron' } } }
            },

            // (5) ネイティブモジュールは `agents` / `domain` で禁止 (AD-010 / FR-041)。
            {
              from: { element: { types: { anyOf: ['agents', 'domain'] } } },
              disallow: {
                to: { module: { origin: 'external', source: NATIVE_MODULES } }
              },
              message: MSG_NATIVE
            }
          ]
        }
      ],
      // レイヤに属さない `src/` 配下のファイルを作らせない。行列の穴になる。
      'boundaries/no-unknown-files': 'error',
      // 解決できなかった依存を error にする。未知は判定されないため黙って通る。
      'boundaries/no-unknown-dependencies': 'error'
    }
  },

  // ── SH-012: import 文の文字列に対する禁止 (解決器に依存しない層) ──────────
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', RESTRICTED_DEFAULT] }
  },
  {
    // パス API の実装ファイル。**ここだけがパス操作の標準モジュールを import できる。**
    files: [PATH_API_FILE],
    rules: { 'no-restricted-imports': ['error', without(PATH_SPELLINGS)] }
  },
  {
    files: [...APP_FILES, ...SECRETS_FILES],
    rules: { 'no-restricted-imports': ['error', without(['electron'])] }
  },
  {
    files: RUNTIME_INFRA_FILES,
    rules: {
      'no-restricted-imports': ['error', without([...SPAWN_SPELLINGS, ...PLATFORM_SPELLINGS])]
    }
  },
  {
    // X-1: agents の session worker だけ `child_process` を import できる (AD-036 §3 の訂正)。
    // プラットフォーム判定 (`os`/`process`) は緩めない — spawn のみ。
    // X-5: セッションスレッドとして `worker_threads` (`parentPort`) も開ける (AD-043 Decision 1)。
    files: [AGENT_SESSION_SPAWN_FILE],
    rules: {
      'no-restricted-imports': ['error', without([...SPAWN_SPELLINGS, ...WORKER_THREADS_SPELLINGS])]
    }
  },
  {
    // X-5: supervisor の entry は `worker_threads` (`Worker`) だけを開ける。`child_process` は開けない。
    files: [SUPERVISOR_ENTRY_FILE],
    rules: { 'no-restricted-imports': ['error', without(WORKER_THREADS_SPELLINGS)] }
  },

  /*
   * ── renderer は名前空間つきパス値を組み立てない (SH-054 / Principle I / FR-025) ──
   *
   * **import を見る検証では塞げない領域である。** パスの合成は文字列操作であり
   * import を伴わないため、`no-restricted-imports` も依存グラフも掛からない
   * (R-1 が `ui-path-concat` として `UNDETECTED_NOTES` に記録した残余)。
   *
   * R-2 は **renderer が受け取ったパスを IPC へ返す最初の feature** である
   * (未登録フォルダからの登録。FE-051)。対象が現れたのでルールを置く —
   * **対象が無いルールを書いて「強制した」とは数えない** (AD-025 §9 / AD-027)。
   *
   * 塞ぐのは `{ namespace: ..., value: ... }` という**オブジェクトリテラルの組み立て**である。
   * 読み出し (`path.namespace`) は `MemberExpression` なので掛からない。
   * main が返した `PathDTO` をそのまま渡す形は影響を受けない。
   *
   * **テストは除く。** スタブした IPC に DTO を食わせるのが試験の方法であり、
   * ここを塞ぐと「renderer 単体で試す」という前提そのものが成立しない。
   * 残余の扱いは `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES` を見ること。
   */
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/**/*.test.{ts,tsx}', 'src/renderer/src/test-support/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ObjectExpression > Property[key.name="namespace"]',
          message: MSG_UI_NAMESPACE_LITERAL
        },
        {
          selector: 'ObjectExpression > Property[key.value="namespace"]',
          message: MSG_UI_NAMESPACE_LITERAL
        }
      ]
    }
  },

  /*
   * ── JavaScript のファイル ──────────────────────────────────────────
   * 検証スクリプトとツール設定は素の JavaScript である。
   * `explicit-function-return-type` は**構文として書けない**ので掛けない。
   * `.dependency-cruiser.js` は CommonJS で書くのがツールの規約なので
   * `no-require-imports` も外す (ESM にすると設定として読まれない)。
   */
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    files: ['.dependency-cruiser.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  eslintConfigPrettier,

  /*
   * ── CLI 生成物の緩和 ────────────────────────────────────────────────
   * `eslintConfigPrettier` より後に置く。`prettier/prettier` を無効にするのに
   * 順序が要る。**実際に出た指摘だけを列挙する** — 一括で無効にすると
   * 生成物に紛れた本当の問題も見えなくなる。
   */
  {
    files: GENERATED_FILES,
    rules: {
      'prettier/prettier': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react/prop-types': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-empty': 'off'
    }
  },
  /*
   * ── 緩和ゾーン内の手書きコードへ strictness を戻す (R-3 code-gate M-001 / M-002) ──
   * `GENERATED_FILES` は CLI 生成物を緩和するが、生成物ディレクトリに置いた**手書きコード**は
   * 緩和対象にしない。除外はファイル単位の明示リストで狭める (Principle XIII の
   * `theme_baseline_exclusions` と同方針)。緩和より後に置いて上書きする。
   */
  {
    // XSS 境界 (FR-020) の手書きコード。`lib/` に置くが full strictness を掛ける。
    files: ['src/renderer/src/lib/safe-url.ts', 'src/renderer/src/lib/safe-url.test.ts'],
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-empty': 'error'
    }
  },
  {
    // scaffold だが R-3 の仮想化 (回帰核) を足したので、依存配列の番人を戻す。
    // O-2 が手書きの `SystemEventRow` / `AssistantOrSystemEvent` を足したので、thread-list.aui.tsx と
    // 同じく ref と空の catch の番人も戻す (O-2 code-gate convention L-005)。
    // tool-result-marks.tsx は O-2 の手書きの印で、O-4 が経過時間の購読の hooks を足した (014 tasks FE-043 / SH-011)。
    // component でない `isTruncatedArgs` を export するので、`react-refresh/only-export-components` を戻す Tier A の一覧ではなく
    // hooks の番人だけを戻すこの block に入れる (2026-10-09 の決定)。
    // web-tool-heading.ts は O-6 の component でない関数だけを export するファイルなので、同じくここに入れる (016 tasks SH-012)。
    files: [
      'src/renderer/src/components/assistant-ui/elements/thread.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/tool-result-marks.tsx',
      'src/renderer/src/components/assistant-ui/elements/web-tool-heading.ts'
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/refs': 'error',
      'no-empty': 'error'
    }
  },
  {
    // scaffold だが X-5 / O-7 が手書きの hooks (`RowActionsContext` / `renderActions` / `RowOptionsContext`) を足した
    // (R-2 のセッション一覧も使う)。thread.aui.tsx と同方針で意味論の番人を戻す (code-gate convention M-003)。
    files: ['src/renderer/src/components/assistant-ui/elements/thread-list.aui.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/exhaustive-deps': 'error'
    }
  },
  {
    // R-4 の手書き Tier A 表示 (AD-035)。elements/ 配下だが CLI 生成物ではない (code-gate M-001)。
    // assistant-ui 準拠の整形 (double-quote / semicolon) は保つため `prettier/prettier` は戻さず、
    // 意味論の番人だけ戻す (thread.aui.tsx と同方針)。
    files: [
      'src/renderer/src/components/assistant-ui/elements/terminal-block.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/code-diff.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/todo-list.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/subagent.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/agent-plan.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx',
      // O-5 の手書きの表示 (MCP の tool と AskUserQuestion。015 tasks SH-011)
      'src/renderer/src/components/assistant-ui/elements/mcp-tool-call.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx',
      // O-6 の手書きの表示 (会話の境界・ファイルと検索・Web・計画。016 tasks SH-012)。
      // file-result-tree.tsx は registry の file-tree.tsx を写して変えた別ファイル (registry の複製は除外のまま)
      'src/renderer/src/components/assistant-ui/elements/transcript-boundary.tsx',
      'src/renderer/src/components/assistant-ui/elements/file-tool.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/file-result-tree.tsx',
      'src/renderer/src/components/assistant-ui/elements/web-tool.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/task-tool.aui.tsx',
      'src/renderer/src/components/assistant-ui/elements/tool-display-frame.tsx',
      // O-11 の markdown の本文の共有の部品 (019 tasks SH-012。agent-plan.aui.tsx から切り出した)
      'src/renderer/src/components/assistant-ui/elements/markdown-body.tsx'
    ],
    rules: {
      // `react/prop-types` は戻さない — TS が props を検証済みで、型別名 FC に false-positive を出す
      // (GENERATED_FILES がこれを off にしている理由そのもの)。意味論の番人だけ戻す。
      '@typescript-eslint/explicit-function-return-type': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'error',
      'no-empty': 'error'
    }
  },
  {
    // registry の element (`elements-conversation-search` / `elements-command-palette`) だが、O-3 が手を入れた
    // (conversation-search はスクロールバーの一致の印を外した。command-palette は option の DOM の id を添字で作り、
    // 中の絞り込みを外した。spec 012 SH-003 / FE-031 / research R-04)。手を入れた element なので、thread.aui.tsx と
    // 同方針で意味論の番人だけ戻す (上流の整形 (double-quote / semicolon) は保つ)。
    files: [
      'src/renderer/src/components/assistant-ui/elements/conversation-search.tsx',
      'src/renderer/src/components/assistant-ui/elements/command-palette.tsx'
    ],
    rules: {
      'react-hooks/refs': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'error',
      'no-empty': 'error'
    }
  }
)
