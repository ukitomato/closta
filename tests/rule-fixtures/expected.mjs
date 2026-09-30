/**
 * 依存規則の違反サンプルと**期待表** (SH-020 / SC-008 / SC-017)。
 *
 * **ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する。**
 * R-1 の実装中に、書いてあるのに 1 件も一致しないルール・評価されない設定・
 * 「未知」に落ちて判定を免れる依存が実測で 5 件見つかった (AD-025)。
 *
 * ## 2 群に分ける
 *
 * - **群 (a) ルールが直接見ている形** — import 文・識別子の直接参照
 * - **群 (b) 等価経路** — `require()` / 動的 import / 等価 API / 構文変形 /
 *   引数配列 / 型の偽造 / 文字列連結
 *
 * ## detector の意味
 *
 * | 値 | 検出器 |
 * |---|---|
 * | `eslint` | `eslint.config.mjs` (直接 import と許可行列) |
 * | `depcruise` | `.dependency-cruiser.js` (推移的到達 / `require()` / 循環) |
 * | `constitution` | `scripts/constitution/check.mjs` (許可リストと注記) |
 * | `typecheck` | TypeScript の型検査 |
 * | `none` | **どの機械検証も捕まえない** — SC-017 の追跡対象 |
 *
 * `none` を書けるようにしてあるのが要点である。
 * 捕まらない経路を「捕まる」と書くと、期待表そのものが嘘になる。
 */

/**
 * @typedef {object} Fixture
 * @property {string} file      サンプルの置き場 (このディレクトリからの相対)
 * @property {string} target    展開先 (リポジトリルートからの相対)
 * @property {'a'|'b'} group
 * @property {string} what      何を試しているか (日本語)
 * @property {readonly ('eslint'|'depcruise'|'constitution'|'typecheck'|'none')[]} detectors
 * @property {readonly string[]} [rules] 期待する規則名 / 項目 (`#N` は `[VIOLATE] #N` で照合)
 * @property {readonly string[]} [requires] **同伴サンプル。** 単独では違反が成立しない
 *   サンプルのために、同時に展開しなければならない他サンプルの `file` を挙げる。
 *   1 件ずつ検証する形 (run.mjs) で、循環や推移的到達を作るのに要る。
 */

/** @type {readonly Fixture[]} */
export const FIXTURES = [
  /* ── 群 (a): ルールが直接見ている形 ─────────────────────────────── */
  {
    file: 'a-direct/domain-io-import.ts.fixture',
    target: 'src/domain/__rulecheck__/domain-io-import.ts',
    group: 'a',
    what: 'domain から I/O モジュールを直接 import する',
    detectors: ['eslint', 'depcruise'],
    rules: ['boundaries/dependencies', 'domain-not-to-io']
  },
  {
    file: 'a-direct/agents-electron-transitive.ts.fixture',
    target: 'src/agents/__rulecheck__/agents-electron-transitive.ts',
    group: 'a',
    what: 'agents から共通モジュール経由で electron に推移的に到達する',
    // eslint も `agents → app` の直接 import として捕まえる。
    // **推移的な到達そのものを見ているのは depcruise だけ**である。
    detectors: ['eslint', 'depcruise'],
    rules: ['agents-not-to-electron']
  },
  {
    file: 'a-direct/path-module-import.ts.fixture',
    target: 'src/main/app/__rulecheck__/path-module-import.ts',
    group: 'a',
    what: 'パス操作の標準モジュールを許可ファイル以外で import する',
    detectors: ['eslint', 'depcruise'],
    rules: ['no-restricted-imports', 'path-module-only-from-path-api']
  },
  {
    file: 'a-direct/unc-literal-outside-allowlist.ts.fixture',
    target: 'src/main/app/__rulecheck__/unc-literal-outside-allowlist.ts',
    group: 'a',
    what: '許可外モジュールが UNC 接頭辞リテラルを持つ (パス API を迂回した手組み)',
    detectors: ['constitution'],
    rules: ['#12']
  },
  {
    file: 'a-direct/agents-unc-api-call.ts.fixture',
    target: 'src/agents/__rulecheck__/agents-unc-api-call.ts',
    group: 'a',
    /*
     * 項目 13 には (a) リテラル / (b) API 呼び出し の 2 つの枝がある。
     * (a) は項目 12 が `agents` も対象に含むので既に覆われている。
     * **本サンプルは (b) を単独で発火させる** — リテラルを書かない。
     */
    what: 'agents が UNC を作る API を呼ぶ',
    detectors: ['constitution'],
    rules: ['#13']
  },
  {
    file: 'a-direct/platform-branch-unmarked.ts.fixture',
    target: 'src/main/app/__rulecheck__/platform-branch-unmarked.ts',
    group: 'a',
    what: '注記のないプラットフォーム分岐',
    detectors: ['constitution'],
    rules: ['#8']
  },
  {
    file: 'a-direct/docker-named.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/docker-named.ts',
    group: 'a',
    what: '許可外モジュールが docker を名指す',
    detectors: ['constitution'],
    rules: ['#4']
  },
  {
    file: 'a-direct/namespace-mixup.ts.fixture',
    target: 'src/main/app/__rulecheck__/namespace-mixup.ts',
    group: 'a',
    what: 'ホスト名前空間のパスをランタイム名前空間として扱う (名前空間の取り違え)',
    detectors: ['typecheck']
  },
  {
    file: 'a-direct/service-io-import.ts.fixture',
    target: 'src/main/app/__rulecheck__/service-io-import.ts',
    group: 'a',
    what: '状態を持つ調停クラスが I/O モジュールを直接 import する (AD-023 §5 / §7)',
    /*
     * **eslint は捕まえない** (実測)。`app` からの `node:crypto` 直接 import は
     * eslint 側では許可されている — `boundaries/dependencies` が絞っているのは
     * パス操作モジュールなどの一部であり、`crypto` は含まれない
     * (`composition-root.ts` が `node:crypto` を import して lint 0 件で通る)。
     * **この規則を見ているのは depcruise だけである。**
     */
    detectors: ['depcruise'],
    rules: ['services-not-to-io']
  },
  {
    file: 'a-direct/cycle-a.ts.fixture',
    target: 'src/domain/__rulecheck__/cycle-a.ts',
    group: 'a',
    what: '循環依存 (2 ファイル)',
    // 相手側が無いと循環にならない。
    requires: ['a-direct/cycle-b.ts.fixture'],
    detectors: ['depcruise'],
    rules: ['no-circular']
  },
  {
    file: 'a-direct/cycle-b.ts.fixture',
    target: 'src/domain/__rulecheck__/cycle-b.ts',
    group: 'a',
    what: '循環依存の相手側',
    requires: ['a-direct/cycle-a.ts.fixture'],
    detectors: ['depcruise'],
    rules: ['no-circular']
  },

  /* ── 群 (b): 等価経路 ───────────────────────────────────────────── */
  {
    file: 'b-equivalent/require-path.ts.fixture',
    target: 'src/main/app/__rulecheck__/require-path.ts',
    group: 'b',
    what:
      '`require()` でパス操作モジュールを取る。' +
      '**`no-restricted-imports` は import 文しか見ないので通り抜ける**',
    // `boundaries/dependencies` は `require` も依存として見るため eslint も捕まえる。
    detectors: ['eslint', 'depcruise'],
    rules: ['path-module-only-from-path-api']
  },
  {
    file: 'b-equivalent/dynamic-import-fs.ts.fixture',
    target: 'src/domain/__rulecheck__/dynamic-import-fs.ts',
    group: 'b',
    what: '動的 import で I/O モジュールを取る',
    detectors: ['eslint', 'depcruise'],
    rules: ['domain-not-to-io']
  },
  {
    file: 'b-equivalent/platform-os-api.ts.fixture',
    target: 'src/main/app/__rulecheck__/platform-os-api.ts',
    group: 'b',
    what: '等価なプラットフォーム判定 API (`os.platform()`)',
    detectors: ['eslint', 'constitution'],
    rules: ['no-restricted-imports', '#8']
  },
  {
    file: 'b-equivalent/platform-destructured.ts.fixture',
    target: 'src/main/app/__rulecheck__/platform-destructured.ts',
    group: 'b',
    what: '分割代入とブラケット記法によるプラットフォーム判定',
    detectors: ['constitution'],
    rules: ['#8']
  },
  {
    file: 'b-equivalent/wsl-args-array.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/wsl-args-array.ts',
    group: 'b',
    what: '環境を変えるサブコマンドを引数配列で構成する (`--import`)',
    /*
     * **`#1` を期待から外した。** 項目 1 は特権コマンド**文字列**の検査であり、
     * `--import` は `PRIVILEGED_COMMANDS_ALWAYS` / `_IN_SPAWN_CONTEXT` のどちらにも無い
     * (`allowlists.mjs` が「`--import` のような環境を変える引数は含めない」と書いているのは
     * 項目 2 の `WSL_ALLOWED_ARGS` の話である)。
     * 素の `#N` 照合では check.mjs の見出しが常に出るため誤って満たされていた (pr-gate Round 1 C-001)。
     */
    detectors: ['constitution'],
    rules: ['#3']
  },
  {
    file: 'b-equivalent/spawn-outside-allowlist.ts.fixture',
    target: 'src/main/app/__rulecheck__/spawn-outside-allowlist.ts',
    group: 'b',
    what: '許可外モジュールからのプロセス起動',
    detectors: ['eslint', 'constitution'],
    rules: ['no-restricted-imports', '#7']
  },
  {
    file: 'b-equivalent/forge-verified.ts.fixture',
    target: 'src/main/app/__rulecheck__/forge-verified.ts',
    group: 'b',
    what: '実行中確認済みの型を偽造する (brand を外から付ける)',
    detectors: ['typecheck']
  },
  {
    file: 'b-equivalent/ui-builtin-via-domain.ts.fixture',
    target: 'src/renderer/src/__rulecheck__/ui-builtin-via-domain.ts',
    group: 'b',
    what: 'ui から domain 経由で node builtin に推移的に到達する',
    // 経由する domain 側のサンプルが無いと推移的到達が成立しない。
    requires: ['a-direct/domain-io-import.ts.fixture'],
    detectors: ['depcruise'],
    rules: ['ui-not-to-core']
  },
  {
    file: 'b-equivalent/dto-namespace-swap.ts.fixture',
    target: 'src/main/app/__rulecheck__/dto-namespace-swap.ts',
    group: 'b',
    what: 'IPC 境界で `PathDTO.namespace` を付け替える (接頭辞の文字列剥がし)',
    detectors: ['typecheck']
  },

  /*
   * ── 群 (b) の残余 ─────────────────────────────────────────────────
   * **どの機械検証も捕まえない経路。** SC-017 の追跡対象であり、
   * 下の `UNDETECTED_NOTES` に理由と代替手段を必ず書く。
   */
  {
    file: 'a-direct/sdk-forbidden-call.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-forbidden-call.ts',
    group: 'a',
    what: '許可されていない Agent SDK の書き込み系 API を呼ぶ (`renameSession`。R-3 で getSessionMessages を許可に追加したため差し替え。AD-034 / SH-061)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-query-escalation-options.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-escalation-options.ts',
    group: 'a',
    what:
      'query() options に昇格キー (settings / allowDangerouslySkipPermissions) を混ぜる ' +
      '(正の構成 P1 を破る。項目14 は options リテラルのキーを見ない。X-1 / SH-010)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'a-direct/sdk-settings-unwrapped.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-settings-unwrapped.ts',
    group: 'a',
    what:
      'settings を assertHelperSettings ラッパを通さず直接リテラルで書く ' +
      '(AD-040。制約付き射影は検証済みラッパ経由のみ許可。settings を denylist から外しても穴を広げない証跡。X-3 / SH-001c)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-mutation-method.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-mutation-method.ts',
    group: 'b',
    what:
      'Query の mutation メソッド (setPermissionMode) を呼ぶ ' +
      '(正の構成 P3 を破る。項目14 は .method() を見ない。X-1 / SH-010)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'a-direct/principle-v-hardcoded-secret.ts.fixture',
    target: 'src/main/infra/settings/__rulecheck__/principle-v-hardcoded-secret.ts',
    group: 'a',
    what:
      '永続化層のソース (infra/settings) に既知プレフィクスの平文 API キー (sk-ant-…) を直書きする ' +
      '(Principle V。秘密は safeStorage 参照キーのみ。X-3 / SH-010)',
    detectors: ['constitution'],
    rules: ['#17']
  },
  {
    file: 'a-direct/sdk-forbidden-call-alias.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-forbidden-call-alias.ts',
    group: 'b',
    /*
     * **defense-in-depth (AD-034 §3 / contracts C-4 M-008 / SH-061)。**
     * 項目14 は許可外 binding の呼び出し形正規表現 (`renameSession(`) のみを見るため、
     * `const r = renameSession; r()` の再束縛は**捕まえない**。これは AD-034 §3 が明記した
     * 既知の限界であり、`detectors: ['none']` として列挙し UNDETECTED_NOTES に代替と塞ぐ feature を書く。
     */
    what: '許可外の Agent SDK 書き込み系 API を alias 経由で呼ぶ (`const r = renameSession; r()`。項目14 の呼び出し形検査を迂回)',
    detectors: ['none']
  },
  {
    file: 'a-direct/wsl-cli-in-session-layer.ts.fixture',
    target: 'src/main/infra/session/__rulecheck__/wsl-cli-in-session-layer.ts',
    group: 'a',
    what: 'R-2 のレイヤが WSL CLI レイヤを参照する (SC-003 / SH-082)',
    detectors: ['constitution'],
    rules: ['#15']
  },
  {
    file: 'a-direct/ui-dto-namespace-literal.ts.fixture',
    target: 'src/renderer/src/__rulecheck__/ui-dto-namespace-literal.ts',
    group: 'a',
    what: 'renderer が名前空間つきパス値 (`PathDTO`) を組み立てる (SH-054)',
    detectors: ['eslint'],
    rules: ['no-restricted-syntax']
  },
  {
    file: 'b-equivalent/ui-path-concat.ts.fixture',
    target: 'src/renderer/src/__rulecheck__/ui-path-concat.ts',
    group: 'b',
    what: 'ui でパス文字列を連結する (**import が発生しないので lint もグラフも掛からない**)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/reuse-verified-other-distro.ts.fixture',
    target: 'src/main/app/__rulecheck__/reuse-verified-other-distro.ts',
    group: 'b',
    what: '正規の確認済みの値を別ディストロに流用する (**型は通る。実行時検査で止める**)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/principle-v-unknown-shape-secret.ts.fixture',
    target: 'src/main/infra/settings/__rulecheck__/principle-v-unknown-shape-secret.ts',
    group: 'b',
    what:
      '既知プレフィクスに合致しない形の秘密値を永続化層のソースに書く ' +
      '(**item 17 は固定プレフィクスの grep。未知形式と runtime providers.json の値は静的に見えない**)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/distro-script-redirect.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/distro-script-redirect.ts',
    group: 'b',
    what:
      '出力系コマンドとリダイレクトでディストロ内に永続化する。' +
      '**別の定数を新しく作って標準入力へ流す**形で項目 6 を回避しようとする',
    detectors: ['constitution'],
    rules: ['#6']
  }
]

/**
 * `none` の各件について、**なぜ機械で捕まらないか** /
 * **何が代わりに守っているか** / **次にどの feature で塞ぐか**を記録する (SC-017)。
 *
 * ここを空にしてはならない。捕まらない経路を列挙せずに
 * 「全数検出」と言うと、検証の主張そのものが嘘になる。
 *
 * **`nextFeature` は必須である。** 理由と代替手段だけを書くと、
 * 残余が「書いてあるから許された状態」として無期限に残る。
 * 塞ぐ feature を指名しておけば、その feature の設計時に必ず再訪される。
 *
 * どちらも **R-1 の AC が名指していない経路**である。
 * AC-1 〜 AC-11 が名指す経路は SC-008 の全数検出対象であり、ここには入らない。
 */
export const UNDETECTED_NOTES = {
  'sdk-forbidden-call-alias': {
    why:
      '項目14 (check.mjs) は `AGENT_SDK_ALLOWED_CALLS` に無い binding の**呼び出し形正規表現** ' +
      '(`(?<![.\\w])renameSession\\s*\\(`) だけを見る。`const r = renameSession; r()` の再束縛や ' +
      '`(await import(...)).renameSession()` の動的 import は、`renameSession(` の形にならないため素通しする ' +
      '(AD-034 §3 が明記した限界)。',
    mitigatedBy:
      '第一防御は**書き込みを起こす IPC が存在しないこと** (FR-001。renderer から到達できる SDK 書き込み経路が無い)。' +
      '第二防御 (allowlist) の直接呼び出し形は `sdk-forbidden-call` サンプルで発火を維持している。' +
      'alias/dynamic-import の迂回はこの第二防御では捕まらないが、第一防御で実害経路は塞がれている。',
    nextFeature: 'X-4',
    howToClose:
      '**X-1 で確認 (SH-010): 本 alias サンプルは X-1 では塞がない。** X-1 が広げたのは起動 (`query`) と ' +
      '権限往復の呼び出し面であり、項目 16 (正の構成の backstop) で **query() options のキー**と ' +
      '**`Query` の `.method()` 昇格**という別クラスを塞いだ。書き込み系 API (`renameSession` 等) は X-1 では ' +
      '**一切 import も呼び出しもしない** (正の構成: 許可は `query`/`listSessions`/`getSessionMessages` の 3 件のみ) ため、' +
      'binding 追跡の denylist は不要のまま残った。**書き込み系 API を実際に使う feature (改名/削除 = X-4 以降) の時点で、' +
      '項目14 に binding レベル denylist を足し (`const alias = renameSession` の再束縛と `import()` 経由を検出)、' +
      '本 alias サンプルが `constitution` で発火するよう `detectors` を更新する。**'
  },
  'ui-path-concat': {
    why: 'パス文字列の連結は import を伴わないので、import を見る lint も依存グラフも掛からない。',
    mitigatedBy:
      'renderer は main が返した完成パスだけを使う設計にし (FR-025)、' +
      'IPC が返す型を `PathDTO` に固定している。連結した文字列は名前空間を持たないため、' +
      '境界を渡ろうとすると main 側の検証 (`isValidPathDTO`) で落ちる。' +
      '**R-2 (SH-054) で `namespace` プロパティを持つオブジェクトリテラルの組み立てを ' +
      '`src/renderer/` 内で禁じた** (`no-restricted-syntax`。発火は ' +
      '`ui-dto-namespace-literal` サンプルで確認済み)。' +
      '**残る連結経路は依然として機械検証されない** — 既存の `PathDTO` を spread して ' +
      '`value` だけを差し替える形は `namespace` のリテラルを持たないため新ルールに掛からない。' +
      '**この fixture はテンプレート文字列の連結であり、新ルールでは発火しない** (実体を確認済み)。' +
      '構造で塞げていない残余は renderer 単体テストとレビューが担う。',
    nextFeature: 'X-4',
    howToClose:
      'R-2 (SH-054) で `namespace` リテラルの組み立ては塞いだ。**残るのは既存の DTO を ' +
      'spread して `value` を差し替える経路**であり、これは `namespace` のリテラルを ' +
      '持たないため構文では見分けられない。' +
      '**X-1 で確認 (SH-011): 新たなパス連結経路は生じなかった** — 起動は `session.launch({folderId, runtimeId})` の ' +
      '**不透明 id** を送るだけで、renderer はパス文字列を組み立てない。cwd の RuntimePath 変換は main 側 ' +
      '(`composition-root` の `resolveCwd` / domain の `prefix-match`) が capability 戻り値の `PathDTO` から行う。' +
      'したがって繰り越す。**X-4 (起動設定ダイアログ) で追加ディレクトリのパス入力が renderer に生じるため、' +
      'その時点で「IPC へ渡す `PathDTO` は capability 戻り値由来の参照に限る」を型 (branded な不透明型) で強制する。**'
  },
  'principle-v-unknown-shape-secret': {
    why:
      'item 17 (check.mjs) は `src/main/infra/settings/**` `src/main/infra/secrets/**` の**本体ソース**の ' +
      '文字列リテラルを、既知プロバイダの**固定プレフィクス** (sk-/AKIA/ghp_/glpat-/xox…-/AIza/PEM) の grep で見る。' +
      'したがって (a) プレフィクスに合致しない未知形式の秘密や、(b) **利用者が runtime に持ち込み ' +
      '`providers.json` へ永続される値**は、ソース静的検査の射程外で捕まえられない。',
    mitigatedBy:
      'runtime の第一防御は **`scanExtraEnvForSecrets` (domain/provider/secret-scan)** で、既知プレフィクスに加え ' +
      '**高エントロピー blob (40 文字級)** も見て、`provider-record` (BE-004) が永続前に該当 `extraEnv` を登録拒否する。' +
      '第二防御は **SC-002 の単体テスト** (JSON・ログに秘密値が現れないことを表明) と **security-reviewer** の監査。' +
      'item 17 が担うのは「開発者がソースにキーを直書きする事故」の一点で、runtime 値は上記が守る。',
    nextFeature: 'X-4',
    howToClose:
      '**X-3 で確認 (SH-010): item 17 は固定プレフィクスのソース grep であり、これ以上は踏み込まない。** ' +
      'runtime 値の秘密混入は `scanExtraEnvForSecrets` のエントロピー閾値 + 登録拒否 + SC-002 が load-bearing。' +
      '**自由入力の秘密経路が増える X-4 (起動設定ダイアログで helper パス・extraEnv の手入力が renderer に生じる) の時点で、' +
      'IPC 境界の入力検証 (`checkProviderDraft`) に秘密値スキャンを一段追加し、拒否理由を UI に返す形で射程を広げる。' +
      'ソース側の固定プレフィクス grep はそのままでも十分 (直書き事故の一点しか担っていない)。**'
  },
  'reuse-verified-other-distro': {
    why:
      '`VerifiedRunning` は正規の生成物であり、別ディストロに渡しても型は通る。' +
      '型は「確認を経たか」を表すが「どのディストロについてか」を型では表せない — ' +
      'ディストロ名は実行時に発見される文字列であり、リテラル型に落とせない。',
    mitigatedBy:
      '値が対象ディストロの識別子を保持し、`infra` の入口が `checkVerified` で' +
      '一致を検証する (contracts C-3)。検証は `wsl-detector.test.ts` と ' +
      '`runtime-store.test.ts` が呼び出し回数で確認している。',
    nextFeature: 'I-1',
    howToClose:
      'I-1 で endpoint 抽象が入り、確認済みの値が対象とするものが' +
      'ディストロだけでなくなる。**入口の数が増えるこの時点で、' +
      '「`VerifiedRunning` を引数に取る `infra` の公開関数は `checkVerified` を呼ぶ」を' +
      '機械で検査する**。これは型では無理だが構文としては検査できる。' +
      '**R-1 で書かないのは入口が 1 つしかなく、ルールが目視と等価なためである。**'
  }
}
