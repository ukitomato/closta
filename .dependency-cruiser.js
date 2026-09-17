/** @type {import('dependency-cruiser').IConfiguration} */

/*
 * 依存グラフの検証 (SH-013 / AD-023 §7 / FR-035)。
 *
 * **ESLint と役割が違う。** ESLint は直接 import しか見ない。
 * ここでしか塞げないものが 3 つある。
 *   1. **推移的な到達** — `agents` が共通モジュール経由で `electron` に届く経路
 *   2. **`require()` 形式** — `no-restricted-imports` は import 文しか見ない
 *   3. **`process.getBuiltinModule()`** — `detectProcessBuiltinModuleCalls` で捕まえる
 *
 * `depcruise --init oneshot` の生成物を土台に、雛形の解説コメントを削り、
 * 本プロジェクトの規則 (末尾の「本プロジェクトの規則」節) を足した形である。
 */

const { builtinModules } = require('node:module')

/*
 * **Node 標準モジュールの一覧は `node:module` の `builtinModules` を正本にする。**
 * 手で列挙すると Node の更新で漏れが出る。漏れはそのまま強制の穴になる。
 *
 * `reachable: true` (推移的到達) のルールは `path` / `pathNot` しか受け取らない —
 * `dependencyTypes: ['core']` と併記すると設定が schema 違反で落ちる。
 * そのため到達判定用には正規表現を組み立てる必要がある。
 */
const coreRe = (names) => `^(node:)?(${names.join('|')})($|/)`

/** `_` 始まりの内部モジュールを除いた全標準モジュール。 */
const ALL_CORE = builtinModules.filter((name) => !name.startsWith('_'))

/**
 * `domain` に置いてよい標準モジュール。**純粋な文字列・データ操作だけ。**
 * `path` を含めるのは、パス API の実装が `domain` にあり、
 * それが `path.win32` / `path.posix` の純粋な文字列操作であるため (AD-004 / FR-025)。
 * この allowlist 以外の標準モジュールへの到達は I/O とみなす。
 */
const DOMAIN_PURE_CORE = [
  'path',
  'path/posix',
  'path/win32',
  'assert',
  'util',
  'url',
  'querystring',
  'string_decoder',
  'buffer',
  'events'
]

/** `electron` の import を許す 2 箇所 (AD-023 §8)。 */
const ELECTRON_ALLOWED =
  '^(src/main/app/|src/main/index[.]ts$|src/preload/|src/main/infra/secrets/)'

/** パス操作の標準モジュールを import できる唯一の実装ファイル (Principle I / FR-025)。 */
const PATH_API = '^src/domain/runtime/path-api[.]ts$'

/** パス操作の標準モジュール。接頭辞の有無とサブパスを含む。 */
const PATH_MODULES = '^(node:)?path(/|$)'

/*
 * **npm パッケージはグラフ上では `node_modules/<name>/...` として現れる。**
 * `^electron($|/)` のように書くと 1 件も一致せず、ルールが黙って死ぬ
 * (実測で確認した — `node_modules` 接頭辞を付けるまで発火しなかった)。
 */
const npmRe = (names) => `^(node_modules/)?(${names.join('|')})(/|$)`

/** `electron` 本体。 */
const ELECTRON = npmRe(['electron'])

/** ネイティブモジュール。未導入でもルールを先に置く (AD-010 / FR-041)。 */
const NATIVE_MODULES = npmRe(['better-sqlite3', 'node-pty', 'keytar'])

module.exports = {
  forbidden: [
    // ── 雛形由来の一般規則 ────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: '循環依存。AD-023 §7 が禁じている。',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-orphans',
      comment: '誰からも参照されていないモジュール。使うか消すか、設定ファイルなら除外を足す。',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$',
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$'
        ]
      },
      to: {}
    },
    {
      name: 'no-deprecated-core',
      comment: '廃止された Node 標準モジュール。',
      severity: 'error',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: '^(?:punycode|domain|constants|sys|_linklist|_stream_wrap)$'
      }
    },
    {
      name: 'not-to-deprecated',
      comment: '廃止された npm パッケージ。',
      severity: 'warn',
      from: {},
      to: { dependencyTypes: ['deprecated'] }
    },
    {
      name: 'no-non-package-json',
      comment: 'package.json の dependencies に無い npm パッケージ。',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] }
    },
    {
      name: 'not-to-unresolvable',
      comment: '解決できない依存。**「解決できない」を許すとグラフに穴が開く。**',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: 'no-duplicate-dep-types',
      comment: 'dependencies と devDependencies の両方に載っているパッケージ。',
      severity: 'warn',
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ['type-only'] }
    },
    {
      name: 'not-to-test',
      comment: 'テスト・仕様置き場への依存。',
      severity: 'error',
      from: { pathNot: '^(specs|tests)' },
      to: { path: '^(specs|tests)' }
    },
    {
      name: 'not-to-spec',
      comment: 'テストファイルへの依存。',
      severity: 'error',
      from: {},
      to: { path: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$' }
    },
    /*
     * 雛形の `not-to-dev-dep` は**採らない**。
     *
     * 雛形は「出荷物が実行時に `node_modules` を参照する」前提で、
     * devDependencies への依存を error にしている。本プロジェクトでは
     * electron-vite が renderer / main / preload をバンドルし、`electron` 自体は
     * Electron ランタイムが提供するため、この前提が成り立たない
     * (公式 scaffold が `react` / `electron` を devDependencies に置くのはこのためである)。
     * 有効にすると `react` と `electron` の 32 件が常に出て、出力が読めなくなる。
     *
     * 実行時に `node_modules` に残っていなければならないものの管理は
     * electron-vite の外部化設定と electron-builder の `files` が担い、
     * その検証はインストーラ生成の通し確認 (FR-043) で行う。
     */
    {
      name: 'optional-deps-used',
      severity: 'info',
      from: {},
      to: { dependencyTypes: ['npm-optional'] }
    },
    {
      name: 'peer-deps-used',
      severity: 'warn',
      from: {},
      to: { dependencyTypes: ['npm-peer'] }
    },

    // ── 本プロジェクトの規則 (AD-023 §7 / FR-035) ─────────────────────
    {
      name: 'agents-not-to-electron',
      comment:
        '`agents` から `electron` への**推移的**到達 (AD-010 / AD-023 §7)。' +
        'supervisor は Electron 無しで動く必要がある。共通モジュール経由の間接依存も禁止。',
      severity: 'error',
      from: { path: '^src/agents/' },
      to: { path: ELECTRON, reachable: true }
    },
    {
      name: 'agents-not-to-native',
      comment: '`agents` からネイティブモジュールへの**推移的**到達 (AD-010 / FR-041)。',
      severity: 'error',
      from: { path: '^src/agents/' },
      to: { path: NATIVE_MODULES, reachable: true }
    },
    {
      name: 'agents-not-to-infra',
      comment: '`agents` は別プロセス。`infra` へは IPC 経由のみ (AD-023 §7)。',
      severity: 'error',
      from: { path: '^src/agents/' },
      to: { path: '^src/main/infra/' }
    },
    {
      name: 'domain-not-to-io',
      comment:
        '`domain` から I/O モジュールへの**推移的**到達 (AD-023 §7)。' +
        '`domain` は I/O を持たない。**パス操作モジュールは対象外** — ' +
        'パス API の実装が `domain` にあり、それは純粋な文字列操作である。',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: {
        path: coreRe(ALL_CORE.filter((name) => !DOMAIN_PURE_CORE.includes(name))),
        reachable: true
      }
    },
    {
      name: 'services-not-to-io',
      comment:
        '状態を持つ調停クラスから I/O モジュールへの**直接**依存 (AD-023 §5 / §7)。' +
        'これが `God Service` への唯一の歯止めである — 調停は I/O を' +
        'インタフェース経由で注入され、自分で取りに行かない。' +
        '**`from` は実名で列挙する** (AD-025 §9)。対象になるのは「状態を持ち I/O を' +
        'インタフェース経由で扱うクラス」であり、結線層 (`composition-root.ts`) や' +
        'Electron 境界 (`window.ts` / `protocol.ts` / `index.ts`) は含まない — ' +
        'そちらは I/O を解決して渡すのが役割である。' +
        'X-3 の `ProviderService` / I-2 の `ContainerService` を' +
        '作るときは、ここに実名を足すこと。' +
        '**R-2 で `SessionService` を追加した** (AD-027 Consequences の履行。' +
        '想定は X-1 だったが R-2 が先に調停クラスを作った)。' +
        '`session-enumerator.ts` は**含めない** — プロセスハンドルを持つが、' +
        '役割は子プロセスの生成と結線であり、`composition-root.ts` と同じ' +
        '「I/O を解決して渡す側」である。加えて本規則の `to` は `core` に限っており、' +
        '同ファイルが使う生成 API は `electron` 由来なので対象外である。' +
        '(**この注記に子プロセス生成 API の名前を書かない。** ' +
        '検証項目 7 は許可リスト外のファイルに現れた API 名を、' +
        'コメントか否かを問わず違反として拾う — 迂回を防ぐためにそう作られている)',
      severity: 'error',
      /*
       * **違反サンプルの置き場を明示的に含める。**
       * 他の規則は `from` がディレクトリ指定なので `__rulecheck__/` 配下の
       * サンプルを自然に拾うが、この規則は実名固定 (AD-025 §9) のため拾えない。
       * 列挙しないと「ルールはあるが発火を確かめていない」状態になり、
       * pr-gate Round 1 の C-001 と同じ病になる。
       */
      from: {
        path:
          '^src/main/app/(folder-service|runtime-store|session-service)[.]ts$' +
          '|^src/main/app/__rulecheck__/service-io-import[.]ts$'
      },
      to: {
        dependencyTypes: ['core'],
        /*
         * `assert` / `util` / `events` は純粋な補助であり I/O を持たない。
         * `domain-not-to-io` が `DOMAIN_PURE_CORE` を除いているのと同じ考え方である。
         */
        path: coreRe(ALL_CORE.filter((name) => !['assert', 'util', 'events'].includes(name)))
      }
    },
    {
      name: 'domain-not-to-electron',
      comment: '`domain` から `electron` への到達 (AD-023 §8)。',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: ELECTRON, reachable: true }
    },
    {
      name: 'path-module-only-from-path-api',
      comment:
        'パス操作の標準モジュールへの**直接**依存をパス API の実装 1 ファイルに限定する ' +
        '(Principle I / FR-025)。**`require()` 形式を塞げるのはこの層だけである。**',
      severity: 'error',
      from: { pathNot: PATH_API },
      to: { dependencyTypes: ['core'], path: PATH_MODULES }
    },
    {
      name: 'electron-only-from-app-and-secrets',
      comment:
        '`electron` への**直接**依存を `app` レイヤと `infra/secrets/` に限定する ' +
        '(AD-023 §8 / FR-038)。`require("electron")` も含めて塞ぐ。',
      severity: 'error',
      from: { pathNot: ELECTRON_ALLOWED },
      to: { path: ELECTRON }
    },
    {
      name: 'ui-not-to-core',
      comment:
        '`ui` から Node 標準モジュールへの**推移的**到達 (FR-035 が明示)。' +
        'renderer は preload 越しの capability だけを使う。',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: coreRe(ALL_CORE), reachable: true }
    },
    {
      name: 'ui-not-to-app',
      comment: '`ui` と `app` は別プロセス・別バンドル。IPC でのみ繋がる (AD-023 §7)。',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^(src/main/|src/preload/)' }
    },
    {
      name: 'app-not-to-ui',
      comment: '上と逆向き。`app` は `ui` を import しない (AD-023 §7)。',
      severity: 'error',
      from: { path: '^(src/main/|src/preload/)' },
      to: { path: '^src/renderer/' }
    }
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },

    /*
     * electron-vite の `?asset` / `?asarUnpack` は**ビルドツールの仮想モジュール**で
     * あって依存グラフの節点ではない。`enhanced-resolve` は `?query` を解決できないため、
     * 除外しないと `not-to-unresolvable` に落ちる。
     * **除外はこの綴りだけに限る** — ディレクトリ単位で除外するとグラフに穴が開く。
     */
    exclude: { path: '[?](asset|asarUnpack|modulePath)$' },

    /*
     * **`process.getBuiltinModule()` を import として検出する。**
     * これを入れないと標準モジュールの取得が構文上 import に見えない形で通る。
     */
    detectProcessBuiltinModuleCalls: true,

    // TypeScript のコンパイル前だけに存在する依存 (型 import) も辿る。
    tsPreCompilationDeps: true,

    /*
     * **root の `tsconfig.json` を指してはいけない。**
     * root は `files: []` の solution-style なのでどのファイルも属さず、`paths` が引かれない。
     *
     * **型検査用の設定をそのまま使わない** (R-2 / BE-025)。
     * `tsconfig.web.json` には `@agents/*` が無く (renderer が `agents` に到達しては
     * ならないので web 側に足すのは誤り)、`tsconfig.node.json` には `@renderer/*` が無い。
     * `depcruise src` は両方を同時に辿るため、**解決用にだけ全部を知っている設定**を使う。
     * 解決できることと到達してよいことは別であり、**到達の可否は上の規則が判定する** —
     * 解決に失敗すると `not-to-unresolvable` に落ち、
     * **本来検査したい規則が評価されないまま緑と赤が入れ替わる。**
     */
    tsConfig: { fileName: 'tsconfig.depcruise.json' },

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      /*
       * `@resources/...?asset` は electron-vite がビルド時に解決する仮想モジュールで、
       * tsconfig には載らない。**解決不能を許す代わりに別名を明示的に教える。**
       */
      aliasFields: [],
      extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.d.ts']
    },

    reporterOptions: {
      text: { highlightFocused: true }
    }
  }
}
