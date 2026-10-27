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
    what: '許可されていない Agent SDK の書き込み系 API を呼ぶ (`tagSession`。R-3 で getSessionMessages を、023 で renameSession を許可に追加したため差し替え。AD-034 / AD-062 / SH-061)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-list-subagents-outside.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-list-subagents-outside.ts',
    group: 'a',
    what: '`listSubagents` を read-transcript.ts 以外で呼ぶ (AD-055 Decision 1)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-get-subagent-messages-outside.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-get-subagent-messages-outside.ts',
    group: 'a',
    what: '`getSubagentMessages` を read-transcript.ts 以外で呼ぶ (AD-055 Decision 1)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-second-import-statement.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-second-import-statement.ts',
    group: 'a',
    what: '2 つ目の import 文で `getSubagentMessages` を import して呼ぶ (1 つ目は許可の `query`)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-alias-to-allowed-name.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-alias-to-allowed-name.ts',
    group: 'a',
    what: '`getSubagentMessages as getSessionMessages` と許可名に alias して呼ぶ',
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
    file: 'a-direct/sdk-permission-mode-unwrapped.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-unwrapped.ts',
    group: 'a',
    what:
      '値位置の permissionMode を assertSafePermissionMode ラッパを通さず書く ' +
      "(AD-041 (a)。値は安全値 'plan' で昇格値リテラル検査には掛からない — 新 backstop 単独で発火する証跡。X-4 / SH-010)",
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-shorthand.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-shorthand.ts',
    group: 'b',
    what: 'shorthand の { permissionMode } で渡す (`permissionMode:` の綴りが現れない等価形。X-4 / SH-010)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-constant.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-constant.ts',
    group: 'b',
    what:
      'domain から import した大文字の定数で permissionMode を渡す ' +
      '(昇格値リテラルが現れない。旧版は大文字識別子を型位置とみなして素通しした。X-4 code-gate platform-boundary M-001)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-computed-key.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-computed-key.ts',
    group: 'b',
    what: "計算キー { ['permissionMode']: m } で渡す (`permissionMode:` の綴りが現れない等価形。X-4 code-gate platform-boundary M-001)",
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-assignment.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-assignment.ts',
    group: 'b',
    what: 'options を組んだ後で `.permissionMode =` を代入する (オブジェクトリテラルのキーが現れない等価形。X-4 code-gate platform-boundary M-001)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-readonly-initializer.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-readonly-initializer.ts',
    group: 'b',
    what: '`readonly permissionMode: T = v` の初期化子で値を入れる (旧版は readonly を型位置とみなして除外した。X-4 code-gate platform-boundary L-101)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-nullish-assignment.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-nullish-assignment.ts',
    group: 'b',
    what: '複合代入 `.permissionMode ??=` で値を入れる (旧版の代入形は `??` / `||` / `&&` の付く `=` に一致しなかった。X-4 code-gate platform-boundary L-101)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-wrapper-chained.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-wrapper-chained.ts',
    group: 'b',
    what: 'ラッパの後ろに `&&` で別の値を連結する (`assertSafePermissionMode(x) && m`。旧版はラッパで始まるかしか見なかった。X-4 code-gate platform-boundary L-101)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-permission-mode-reflective.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-permission-mode-reflective.ts',
    group: 'b',
    /*
     * **項目 16 の綴り検査の限界。** キー名が識別子として現れない形は regex では塞がない
     * (code-gate X-4 platform-boundary L-101)。UNDETECTED_NOTES に理由・代替・塞ぐ feature を書く。
     */
    what:
      '計算キーの変数形・連結形 / `Reflect.set` / `Object.defineProperty` / `Object.fromEntries` で permissionMode を載せる ' +
      '(キーの綴りが現れない。項目 16 の regex では塞がない)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/sdk-query-mutation-method.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-mutation-method.ts',
    group: 'b',
    what:
      'Query の mutation メソッド (setMaxThinkingTokens) を呼ぶ ' +
      '(正の構成 P3 を破る。昇格値を含めず P3 だけで発火する形。項目14 は .method() を見ない。' +
      'X-1 / SH-010 / O-5 BE-040。023 で setPermissionMode から差し替え。AD-062 Decision 1)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-set-permission-mode-unwrapped.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-set-permission-mode-unwrapped.ts',
    group: 'b',
    what: '`q.setPermissionMode(mode)` を `assertSafePermissionMode` の包みなしで呼ぶ (AD-062 Decision 1)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-set-permission-mode-wrapper-escape.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-set-permission-mode-wrapper-escape.ts',
    group: 'b',
    what: '`q.setPermissionMode(assertSafePermissionMode(a) || b)` — 包みが閉じてから別の値が続く (AD-062 Decision 1)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-mcp-control.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-mcp-control.ts',
    group: 'b',
    what:
      'Query の MCP の操作のメソッド (reconnectMcpServer) を呼ぶ ' +
      '(AD-048 Decision 2 で P3 の列挙に足した名前。昇格値・昇格キーを含めない。O-5 BE-040)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-updated-input.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-updated-input.ts',
    group: 'b',
    what:
      'agents の非テストのコードに入力の書き換えのキー (updatedInput) を直に綴る ' +
      '(AskUserQuestion の許可は domain の toAskUserQuestionResult だけが組む。AD-052。他の #16 の綴りを含めない。O-10 BE-012)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-read-file.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-read-file.ts',
    group: 'b',
    what:
      'Query の readFile を呼ぶ (AD-049 Decision 6 で P3 の列挙に足した名前。他の #16 の綴りを含めない。016 BE-040)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-background-tasks.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-background-tasks.ts',
    group: 'b',
    what: 'Query の backgroundTasks を呼ぶ (P3 の列挙の名前を単独で確かめる。016 BE-040)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-reload-output-styles.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-reload-output-styles.ts',
    group: 'b',
    what: 'Query の reloadOutputStyles を呼ぶ (P3 の列挙の名前を単独で確かめる。016 BE-040)',
    detectors: ['constitution'],
    rules: ['#16']
  },
  {
    file: 'b-equivalent/sdk-query-computed-key.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-query-computed-key.ts',
    group: 'b',
    what:
      "Query の mutation メソッドを計算キー q['reloadPlugins']() で呼ぶ " +
      '(`.reloadPlugins(` の綴りが現れない等価形。O-5 BE-040 / design-gate R3 M-11)',
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
     * **023 (AD-062 Decision 5) で塞いだ。** 項目14 が許可外の名前の**値の import** を違反にするので、
     * `const r = tagSession; r()` の再束縛は import の時点で発火する (AD-034 §3 が明記した限界を閉じた)。
     */
    what: '許可外の Agent SDK 書き込み系 API (`tagSession`) を alias 経由で呼ぶ (`const r = tagSession; r()`。値の import の検査で発火)',
    detectors: ['constitution'],
    rules: ['#14']
  },
  {
    file: 'a-direct/sdk-rename-session-outside.ts.fixture',
    target: 'src/agents/__rulecheck__/sdk-rename-session-outside.ts',
    group: 'a',
    what: '`renameSession` を `rename-session.ts` 以外で呼ぶ (AD-062 Decision 4。呼べるファイルの表の外)',
    detectors: ['constitution'],
    rules: ['#14']
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
  },

  /*
   * ── X-5 (SH-010): 項目 18 / 19 / 20 ──────────────────────────────
   * 項目 18・19 は**呼び出しでなく参照で数える**ので、参照渡し・ブラケット・分割代入・`.call` の 4 形を
   * 1 件ずつ置き、それぞれ単独で発火することを確かめる (design-gate R2 platform-boundary)。
   * 項目 18 のサンプルは調停役スレッドの置き場 (`src/agents/` 配下の `supervisor*.ts`) に展開する。
   */
  {
    file: 'a-direct/supervisor-json-parse-reference.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-json-parse-reference.ts',
    group: 'a',
    what: '調停役スレッドのモジュールが JSON の parse を参照渡しする (`Reflect.apply(JSON.parse, …)` / 別名の関数値。SC-002 / AD-043 Decision 2。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#18']
  },
  {
    file: 'b-equivalent/supervisor-json-parse-bracket.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-json-parse-bracket.ts',
    group: 'b',
    what: "調停役スレッドのモジュールが `JSON['parse']` で取る (`JSON.parse` の綴りが現れない等価形。X-5 / SH-010)",
    detectors: ['constitution'],
    rules: ['#18']
  },
  {
    file: 'b-equivalent/supervisor-json-parse-destructure.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-json-parse-destructure.ts',
    group: 'b',
    what: '調停役スレッドのモジュールが `const { parse } = JSON` で取る (以後は裸の `parse()`。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#18']
  },
  {
    file: 'b-equivalent/supervisor-json-parse-call.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-json-parse-call.ts',
    group: 'b',
    what: '調停役スレッドのモジュールが `JSON.parse.call(…)` で呼ぶ (`JSON.parse(` の呼び出し形にならない。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#18']
  },
  {
    file: 'b-equivalent/coordinator-helper-json-parse.ts.fixture',
    target: 'src/agents/__rulecheck__/coordinator-helper-json-parse.ts',
    group: 'b',
    /*
     * **項目 18 は置き場を見るだけで、どのスレッドで評価されるかは見ない。** 調停役スレッドの本体が import する
     * 別名の helper の `JSON.parse` は掛からない。UNDETECTED_NOTES に理由・代替・塞ぐ feature を書く。
     */
    what: '調停役スレッドの本体が import する別名の helper で本文を `JSON.parse` する (置き場が `supervisor*.ts` でないので項目 18 の対象外)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/supervisor-json-parse-multi-alias.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-json-parse-multi-alias.ts',
    group: 'b',
    what: '`JSON` を多段の別名に代入してから parse を呼ぶ (`const codec = builtin = JSON; codec.parse()`。項目 18 は別名を追わない)',
    detectors: ['none']
  },
  {
    file: 'a-direct/pid-kill-reference.ts.fixture',
    target: 'src/main/app/__rulecheck__/pid-kill-reference.ts',
    group: 'a',
    what: '許可外モジュールが process の kill を参照渡しする (`Reflect.apply(process.kill, …)` / 別名の関数値。許可は 0 件。AD-043 Decision 5。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'b-equivalent/pid-kill-bracket.ts.fixture',
    target: 'src/main/app/__rulecheck__/pid-kill-bracket.ts',
    group: 'b',
    what: "許可外モジュールが `process['kill'](pid)` で呼ぶ (`process.kill` の綴りが現れない等価形。X-5 / SH-010)",
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'b-equivalent/pid-kill-destructure.ts.fixture',
    target: 'src/main/app/__rulecheck__/pid-kill-destructure.ts',
    group: 'b',
    what: '許可外モジュールが `const { kill } = process` で取る (以後は裸の `kill()`。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'b-equivalent/pid-kill-call.ts.fixture',
    target: 'src/main/app/__rulecheck__/pid-kill-call.ts',
    group: 'b',
    what: '許可外モジュールが `process.kill.call(process, pid)` で呼ぶ (`process.kill(` の呼び出し形にならない。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#19']
  },
  /*
   * `node:process` からの import 形 (code-gate platform-boundary M-002)。置き場は `node:process` の import を
   * ESLint に許されている `src/main/infra/runtime/` — グローバルの `process` を経ずに kill を取れる唯一の層である。
   */
  {
    file: 'b-equivalent/pid-kill-named-import.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/pid-kill-named-import.ts',
    group: 'b',
    what: "`import { kill } from 'node:process'` で取る (以後は裸の `kill()`。`process` の綴りが kill の前に現れない。X-5 code-gate platform-boundary M-002)",
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'b-equivalent/pid-kill-namespace-import.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/pid-kill-namespace-import.ts',
    group: 'b',
    what: "`import * as proc from 'node:process'` の別名からブラケットで取る (`proc['kill'](pid)`。X-5 code-gate platform-boundary M-002)",
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'b-equivalent/pid-kill-default-import.ts.fixture',
    target: 'src/main/infra/runtime/__rulecheck__/pid-kill-default-import.ts',
    group: 'b',
    what: "`import proc from 'process'` の別名から分割代入で取る (`const { kill } = proc`。X-5 code-gate platform-boundary M-002)",
    detectors: ['constitution'],
    rules: ['#19']
  },
  {
    file: 'a-direct/worker-share-env.ts.fixture',
    target: 'src/agents/__rulecheck__/worker-share-env.ts',
    group: 'a',
    what: 'Worker と env を `SHARE_ENV` で共有する (options は変数なので `SHARE_ENV` の出現だけで発火する。AD-043 Decision 7 / Principle V。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#20']
  },
  {
    file: 'b-equivalent/worker-env-key.ts.fixture',
    target: 'src/agents/__rulecheck__/worker-env-key.ts',
    group: 'b',
    what: '`new Worker(` の第 2 引数のオブジェクトリテラルに `env` キーで env を注入する (`SHARE_ENV` を使わない等価形。X-5 / SH-010)',
    detectors: ['constitution'],
    rules: ['#20']
  },
  /*
   * 調停役スレッドでの `process.env` の書き換えと `workerData` (code-gate platform-boundary L-002)。
   * 置き場は項目 18 と同じ調停役スレッドのモジュールの形 (`src/agents/` 配下の `supervisor*.ts`)。
   */
  {
    file: 'a-direct/supervisor-env-assignment.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-env-assignment.ts',
    group: 'a',
    what: "調停役スレッドのモジュールが `process.env.X =` / `process.env['X'] ??=` で env を書き換える (env 未指定の Worker に複製される。AD-043 Decision 7。X-5 code-gate platform-boundary L-002)",
    detectors: ['constitution'],
    rules: ['#20']
  },
  {
    file: 'b-equivalent/supervisor-env-object-assign.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-env-object-assign.ts',
    group: 'b',
    what: '調停役スレッドのモジュールが `Object.assign(process.env, …)` で env をまとめて書き換える (代入形にならない等価形。X-5 code-gate platform-boundary L-002)',
    detectors: ['constitution'],
    rules: ['#20']
  },
  {
    file: 'b-equivalent/supervisor-worker-data.ts.fixture',
    target: 'src/agents/__rulecheck__/supervisor-worker-data.ts',
    group: 'b',
    what: '調停役スレッドのモジュールが起動指示を `workerData` で Worker に渡す (options はリテラルだが `env` キーを持たない。X-5 code-gate platform-boundary L-002)',
    detectors: ['constitution'],
    rules: ['#20']
  },
  /*
   * `worker_threads` の import の許可表 (code-gate convention M-001 / platform-boundary M-001 / M-003)。
   * 項目 20 が見ない「式で組んだ options」の代替防御は「Worker を起こせる場所を ESLint が 2 ファイルに限る」ことなので、
   * その前提が 2 表記 (`boundaries/dependencies` と `no-restricted-imports`) の両方で agents と app の両方に効くことを固定する。
   */
  {
    file: 'a-direct/agents-worker-threads-outside-entry.ts.fixture',
    target: 'src/agents/__rulecheck__/agents-worker-threads-outside-entry.ts',
    group: 'a',
    what: 'agents の許可外ファイルが `node:worker_threads` を import する (許可は supervisor.ts / sdk-agent-session.ts の 2 ファイル。AD-043 Decision 1 / 7)',
    detectors: ['eslint'],
    rules: ['boundaries/dependencies', 'no-restricted-imports']
  },
  {
    file: 'a-direct/app-worker-threads-import.ts.fixture',
    target: 'src/main/app/__rulecheck__/app-worker-threads-import.ts',
    group: 'a',
    what: 'app レイヤが `node:worker_threads` を import する (app / infra は標準モジュールを許されるが `worker_threads` は全レイヤで禁止。AD-043 Decision 7)',
    detectors: ['eslint'],
    rules: ['boundaries/dependencies', 'no-restricted-imports']
  },
  {
    file: 'b-equivalent/app-worker-threads-via-get-builtin-module.ts.fixture',
    target: 'src/main/app/__rulecheck__/app-worker-threads-via-get-builtin-module.ts',
    group: 'b',
    what: 'app レイヤが `process.getBuiltinModule()` で `node:worker_threads` を取る (ESLint は import 文の層だけを見る。code-gate platform-boundary L-101)',
    detectors: ['depcruise'],
    rules: ['worker-threads-only-from-entry']
  },
  {
    file: 'b-equivalent/worker-env-via-expression.ts.fixture',
    target: 'src/agents/__rulecheck__/worker-env-via-expression.ts',
    group: 'b',
    what: 'Worker の options を変数で組んで `env` を渡す (構築子は注入で受け `worker_threads` を import しない。項目 20 は第 2 引数のオブジェクトリテラルしか見ない)',
    detectors: ['none']
  },
  {
    file: 'b-equivalent/agents-builtin-via-get-builtin-module.ts.fixture',
    target: 'src/agents/__rulecheck__/agents-builtin-via-get-builtin-module.ts',
    group: 'b',
    what: 'agents が `process.getBuiltinModule()` で Node 標準モジュールを取る (023 で `agents-not-to-core` を足して依存グラフが捕まえる。BE-030)',
    detectors: ['depcruise'],
    rules: ['agents-not-to-core']
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
      '構造で塞げていない残余は renderer 単体テストとレビューが担う。' +
      '**O-2 / O-6 は本文のパスを表示のためだけに切る (パスの末尾の取り出し)。名前空間を持つ値を作らず、IPC に戻さない** ' +
      '(AD-049 Decision 5)。',
    nextFeature: 'X-6',
    howToClose:
      '**X-4 で確認 (SH-012): 追加ディレクトリ軸は X-6 に繰り越した** (AD-041 (h)) ため、X-4 でも renderer にパス入力は生じない ' +
      '(起動設定は不透明 id のみ)。追加ディレクトリのパス入力を足す X-6 へ付け替える。' +
      'R-2 (SH-054) で `namespace` リテラルの組み立ては塞いだ。**残るのは既存の DTO を ' +
      'spread して `value` を差し替える経路**であり、これは `namespace` のリテラルを ' +
      '持たないため構文では見分けられない。' +
      '**X-1 で確認 (SH-011): 新たなパス連結経路は生じなかった** — 起動は `session.launch({folderId, runtimeId})` の ' +
      '**不透明 id** を送るだけで、renderer はパス文字列を組み立てない。cwd の RuntimePath 変換は main 側 ' +
      '(`composition-root` の `resolveCwd` / domain の `prefix-match`) が capability 戻り値の `PathDTO` から行う。' +
      'したがって繰り越す。**X-1 時点では X-4 (起動設定ダイアログ) で追加ディレクトリのパス入力が renderer に生じると見込み、' +
      'その時点で「IPC へ渡す `PathDTO` は capability 戻り値由来の参照に限る」を型 (branded な不透明型) で強制するとしていた。' +
      'X-4 は追加ディレクトリ軸を X-6 に繰り越したため、この強制も冒頭のとおり X-6 へ付け替えた。**' +
      '023 で確かめた: 当たらない (名前はパスではなく、パスの入力を足さない。X-6 の後続のまま)。'
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
    nextFeature: 'X-7',
    howToClose:
      '**X-4 で確認 (SH-012): 発火しない。** X-4 が足した自由入力はプリセット名 (表示用で起動に使わない)・' +
      'モデル ID と inference profile ID (文字種 allowlist で拘束)・対応 effort (enum の allowlist で拘束) で、秘密を持つ欄ではない。helper の生成 (roleArn 等の登録欄) は X-7 に繰り越した ' +
      '(AD-041 (h)) ため、資格情報まわりの登録欄を増やす X-7 へ付け替える。' +
      '**X-3 で確認 (SH-010): item 17 は固定プレフィクスのソース grep であり、これ以上は踏み込まない。** ' +
      'runtime 値の秘密混入は `scanExtraEnvForSecrets` のエントロピー閾値 + 登録拒否 + SC-002 が load-bearing。' +
      '**X-3 時点では、自由入力の秘密経路が増える X-4 (起動設定ダイアログで helper パス・extraEnv の手入力が renderer に生じる) の時点で、' +
      'IPC 境界の入力検証 (`checkProviderDraft`) に秘密値スキャンを一段追加し、拒否理由を UI に返す形で射程を広げると見込んでいた。' +
      'X-4 ではこれを足していない — service 層のスキャン (`provider-service` の register / update と `provider-record` の read 側が ' +
      '`scanExtraEnvForSecrets` を呼び、`secret-in-extraenv` を理由キーで UI に返す) が X-3 (H-09) から既に在るため。' +
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
  },
  'coordinator-helper-json-parse': {
    why:
      '項目 18 (check.mjs) は**置き場を見るだけで、どのスレッドで評価されるかは見ない**。対象は `src/agents/` 配下の ' +
      '`supervisor*.ts` (`supervisor-protocol.ts` を除く) であり、調停役スレッドの本体がそれ以外の名前の helper を import して ' +
      '本文に `JSON.parse` を適用しても、helper の置き場が対象外なので掛からない。import グラフを辿ってスレッドごとの ' +
      '到達集合を求めない grep の限界である (X-5 / SH-010 / AD-043 Decision 2)。',
    mitigatedBy:
      '第一防御は**型**: 調停役スレッドが扱う本文は `OpaqueBody` であり、中身を読む API を持たない (AD-043 Decision 2)。' +
      '第二防御は BE の単体テスト (`supervisor-core.test.ts`。本文の payload を中継したときに文字列のまま出口へ渡ること) と、' +
      'デコーダを `supervisor-protocol.ts` 1 ファイルに集めた構成 (その他の `supervisor*.ts` は項目 18 が 0 件を守る)。',
    nextFeature: 'X-6',
    howToClose:
      'fork / resume 等の制御行を足して調停役スレッドの import が増える X-6 の時点で、項目 18 の対象を ' +
      '「置き場の形」から「`supervisor.ts` から静的に到達するモジュール集合 (dependency-cruiser の到達判定) のうち ' +
      '`supervisor-protocol.ts` 以外」に広げ、本サンプルが `constitution` で発火するよう `detectors` を更新する。' +
      '**X-5 で到達判定にしないのは、調停役スレッドの import が少なく、置き場の検査と目視が等価なためである。**' +
      '023 で確かめた: 当たらない (`control-result` の decoder は `supervisor-protocol.ts` に置き、調停役スレッドの import は増えない)。'
  },
  'supervisor-json-parse-multi-alias': {
    why:
      "項目 18 (check.mjs) は `JSON` の `parse` を**綴り**で数える (直接参照 `JSON.parse` / ブラケット `JSON['parse']` / " +
      '分割代入 `const { parse } = JSON`)。`const codec = JSON; codec.parse(x)` のような**多段の別名代入は拾わない** — ' +
      '別名の束縛を追うにはデータフロー解析が要り、grep backstop の射程外である (X-5 / SH-010)。',
    mitigatedBy:
      '`coordinator-helper-json-parse` と同じ — `OpaqueBody` 型 (中身を読む API が無い) と BE の単体テスト。' +
      'さらに別名代入は `JSON` を値として持ち回す不自然な形であり、code-gate の platform-boundary-reviewer が ' +
      '調停役スレッドの差分で `JSON` の出現を確認する。',
    nextFeature: 'X-6',
    howToClose:
      'X-6 で調停役スレッドの import が増える時点で、項目 18 に「調停役スレッドのモジュールで `JSON` を値として ' +
      '(メンバアクセス以外の位置で) 参照することを違反にする」規則を足し、本サンプルが `constitution` で発火するよう ' +
      '`detectors` を更新する。**X-5 で足さないのは、別名を追う規則はデータフローを追わないと誤検出と見逃しの両方が残り、' +
      '`OpaqueBody` 型 + 単体テストと等価にならないためである。**' +
      '023 で確かめた: 当たらない (decoder は `supervisor-protocol.ts` に置き、調停役スレッドの import は増えない)。'
  },
  'worker-env-via-expression': {
    why:
      '項目 20 (check.mjs) は `src/` の `SHARE_ENV` の出現と、`new Worker(` の**第 2 引数のオブジェクトリテラル**の ' +
      '深さ 0 の `env` キーを見る。**式で組んだ options** (`new Worker(entry, options)` の変数・関数の戻り値・' +
      '`{ ...opts }` の spread) は中身がリテラルとして現れないので見えない (X-5 / SH-010 / AD-043 Decision 7)。',
    mitigatedBy:
      'Worker を起こすのは `src/agents/supervisor.ts` の 1 箇所だけで、ESLint が `worker_threads` の import を**全レイヤで**禁じ、' +
      'supervisor の entry とセッションスレッドの 2 ファイル (`supervisor.ts` / `sdk-agent-session.ts`) だけを開けている — ' +
      '`boundaries/dependencies` の全レイヤ禁止 policy (`supervisor-entry` / `agent-session-spawn` の category で開ける) と ' +
      '`no-restricted-imports` (`RESTRICTED_DEFAULT` から 2 ファイルだけ `without`) の 2 表記で、発火は ' +
      '`agents-worker-threads-outside-entry` / `app-worker-threads-import` サンプルが固定する。' +
      'import 文を経ない `process.getBuiltinModule("node:worker_threads")` は dependency-cruiser の ' +
      '`worker-threads-only-from-entry` が同じ 2 ファイル以外で塞ぐ (`app-worker-threads-via-get-builtin-module` サンプル)。' +
      'したがって本サンプルの形が出荷物に現れ得るのは、(a) 許可された 2 ファイルの中で options を式で組む形と、' +
      '(b) 本サンプルのように Worker の構築子を注入で受ける形 (import が無いので ESLint に掛からない) に限られる。' +
      '(a) の唯一の箇所は options をリテラルで書いており (`resourceLimits` のみ)、項目 20 の検査がそのまま効く。' +
      '(b) は調停役スレッドで起こす前に `process.env` を書き換える経路を項目 20 が別に塞いでいる (書き換えと `workerData` は 0 件)。' +
      '資格情報は最初の message でだけ渡す構成 (AD-043 Decision 7) と security-reviewer の監査が代替する。',
    nextFeature: 'X-6',
    howToClose:
      'Win32Runtime の直接起動を足す X-6 で Worker の起こし方が増える場合は、その時点で ' +
      '「`new Worker(` の第 2 引数はオブジェクトリテラルに限る (式は違反)」を項目 20 に足し、本サンプルが ' +
      '`constitution` で発火するよう `detectors` を更新する。**X-5 で足さないのは、起こす箇所が 1 つでリテラルで書かれており、' +
      '式を禁じる規則が目視と等価なためである。**' +
      '023 で確かめた: 当たらない (Worker を起こす箇所を足さない。改名は Worker ではなく短命の `utilityProcess`)。'
  },
  'sdk-permission-mode-reflective': {
    why:
      '項目 16 (check.mjs) は SDK 保持ファイルに現れる `permissionMode` / `settings` の**綴り**を regex で見る。' +
      "計算キーの変数形 (`{ [K]: m }`)・連結形 (`['permission' + 'Mode']`)、`Reflect.set(o, 'permissionMode', m)`、" +
      "`Object.defineProperty(...)`、`Object.fromEntries([['permissionMode', m]])` はキーが識別子・キー位置として現れないため、" +
      '綴りの検査では見分けられない (データフローを追わない grep backstop の限界。code-gate X-4 platform-boundary L-101)。',
    mitigatedBy:
      'load-bearing gate は **`buildQueryOptions` (session-core.ts) の allowlist キーだけで options を組む正の構成**と、' +
      '**`SafePermissionMode` 型 + `assertSafePermissionMode` の実行時 assert** である (AD-041 (a))。' +
      'query() に渡る permissionMode は必ずこの経路を通り、unit test (session-core.test.ts) が守る。' +
      '起動 decoder 側も `isSafePermissionMode` で安全 3 値以外を拒否する。項目 16 は綴りの退行検出に過ぎない。',
    nextFeature: 'I-3',
    howToClose:
      'capability 連動の昇格モードを足す I-3 の時点で、項目 16 を綴りの grep から **options を組む経路の構造検査** ' +
      '(query() の options 引数が `buildQueryOptions(...)` の戻り値であることを見る) に置き換え、' +
      '本サンプルが `constitution` で発火するよう `detectors` を更新する。**X-4 で regex を足さないのは、' +
      '変数形・反射 API はデータフローを追わないと誤検出と見逃しの両方が残り、正の構成 (allowlist + 型 + assert) と等価にならないためである。**'
  },
  /*
   * サンプルを置かない記録 (O-5 BE-040 / design-gate R3 M-11)。P3 の検出が追わない形を 1 項目にまとめる。
   */
  'sdk-query-method-indirect': {
    why:
      '項目 16 の P3 (check.mjs) は SDK 保持ファイルの `Query` の mutation メソッドを**呼び出しの綴り**で見る ' +
      '(ドット呼び出し `.m(` / `?.m(` と計算キー `[\'m\'](` / `["m"](` / テンプレートリテラルのキー)。' +
      '分割代入 (`const { reconnectMcpServer } = q`)・`.reconnectMcpServer.call(` / `.apply(`・変数のキー (`q[k](`) は ' +
      '`.m(` の形にならず、束縛を追うにはデータフロー解析が要るため grep backstop の射程外である。',
    mitigatedBy:
      '`Query` を持つのは `src/agents/sdk-agent-session.ts` の `queryHandle` 1 つで、呼ぶのは `interrupt()` と実行中の設定の 2 つ ' +
      '(`setPermissionMode` / `setModel`。AD-062。AD-036 §4 P3 の読み替え)。`Query` の自前のメソッドは同ファイルの型の網羅で `interrupt`・変更系 (`QueryMutationMethod`)・' +
      '呼ばない読み取り (`QueryUnusedReadMethod`) に分類され、SDK の版上げでの増減は tsc が落とす。' +
      '**この分類は呼び出しを禁じない** — `QueryUnusedReadMethod` の 7 個の呼び出しは項目 16 の検査の対象外で、' +
      '`close` は `promptQueue.close()` と綴りが衝突するため denylist に足せない。AD-047 Decision 4 が呼ばないと決めた ' +
      '`getContextUsage` / `usage_EXPERIMENTAL…` は変更系と同じ denylist に入れた。denylist の集合は ' +
      '`tests/docs/query-mutation-methods.test.ts` が `QUERY_MUTATION_METHODS` と union の一致で固定する。' +
      '間接の呼び出しは code-gate の platform-boundary-reviewer が agents の差分で確認する。',
    nextFeature: 'system scope (項目 16 の持ち主。O-5 SH-012 で roadmap の system scope に記録)',
    howToClose:
      '項目 16 の P3 を正の形 (`interrupt` 以外の `Query` のメソッドの参照を違反にする) に置き換え、' +
      "`queryHandle` の型を `Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>` に絞る (015 research R-06 Alternatives)。" +
      '型で絞れば分割代入・`.call`・変数のキーも tsc が落とす。**O-5 で行わないのは spec FR-011 が正の形を持ち主に送ると決めたためである。**'
  }
}
