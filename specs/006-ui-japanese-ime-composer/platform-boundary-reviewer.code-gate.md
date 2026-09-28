# platform-boundary-reviewer Review: X-2 日本語 IME composer (code-gate / platform-boundary track)

**Run**: 2026-09-29
**Reviewer**: platform-boundary-reviewer
**Gate**: code-gate
**Spec**: specs/006-ui-japanese-ime-composer/spec.md

## viewpoint coverage

- A. 認可/認証/secret: 該当なし: security-reviewer owner
- B. 入力検証/injection/CSP/暗号: 該当なし: security-reviewer owner (CSP/allowedOrigins 変更なし。screenshot spec は `style-src 'self'` を尊重し FontFace API で注入)
- C. 業務不変条件/Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution/ADR drift: Critical:0 High:0 Medium:0 Low:0 (Principle I/II/III/VI/VII と AD-003/004/012 を src 内で確認、侵食なし)
- E. User Story/SC/AC/UX: 該当なし: po-reviewer owner
- F. 命名/module/lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし
- H. テスト/coverage/regression: composer IME 回帰は `e2e/ime.spec.ts` の 3 経路が担保。composing ガードは非変換時 no-op で既存送信・isRunning 分岐を壊さない

## Findings

### [Medium] M-001 — E2E 実行コード群 (`e2e/**` / `playwright.config.ts`) が Constitution 検証の 3 層すべての外にあり、Principle VI/II の検査が構造的に届かない (scope: feature)

- **観察**: `e2e/support/launch.ts` は `_electron.launch` でプロセスを起こし、`node:path` を直接 import、`readFileSync` でホストファイルを読むが、`e2e/` と `playwright.config.ts` は 3 層すべてから外れる:
  - ESLint: `eslint.config.mjs` の ignore に `e2e/**` / `playwright.config.ts` を追加。`no-restricted-imports` は `files: ['src/**/*.{ts,tsx}']` scope で元から e2e 非対象
  - dependency-cruiser: `depcruise src` で src のみ。`not-to-test` 変更 (`^(specs|tests|e2e)`) は e2e を「依存先」として禁じるだけで source scan にはならない
  - check.mjs: `SCAN_ROOTS = ['src','scripts']` に e2e なし、`SCAN_FILES` に `playwright.config.ts` なし
- **リスク/影響**: 現状の `_electron.launch` は `SPAWN_CALL_PATTERNS` 非該当で実害はないが、将来 global-setup 等で `wsl.exe`/`docker`/OS フォント登録/`fc-cache`/パッケージ導入を足しても Principle VI 項目 1-7/9・Principle II 項目 8 が一切発火しない。AD-024 #5 が「除外はファイル単位、ディレクトリ除外禁止」と名指しで警告した形。
- **推奨**: (a) `SCAN_ROOTS` に `e2e`、`SCAN_FILES` に `playwright.config.ts` を加え、正当な用途 (node:path/win32 基準画像) は `EXCLUDED_FILES` にファイル単位で明示、または (b) e2e を scope 外とする根拠を ADR (AD-038 系) に明記し trail に残す。roadmap M-101 (verify.yml の SCAN_FILES 追随) と同系の follow-up。
- **根拠**: Principle VI/II Verification、AD-024 #5

## 検証済み・指摘なし (敵対的に確認)

- **E2E stub の production-inert 性 (最重要)**: ゲートは `!app.isPackaged && process.env.CLOSTA_E2E === '1'` (`src/main/index.ts`)。packaged 本番で `app.isPackaged===true` により到達不能。env 単独ゲートでなく `app.isPackaged` を AND (origins.ts E-H004 と一致)。`createE2eCapability` の呼び出しは 1 箇所のみ。`exposeInMainWorld` も 1 箇所のみで E2E 経路は preload を差し替えず `IpcDependencies` だけ差し替える = 単一 capability 境界 (FR-039) 不変
- **capabilities 虚偽表明なし**: fake runtime は `autoModeAllowed: false`/`autoModeStatus: 'unavailable'`/`sandboxKind: 'none'` と安全側で表明。Principle III のゲート無効化なし
- **プロセス起動**: `e2e-capability.ts` は `MessageChannelMain` のみ、`utilityProcess`/`fork`/`spawn` 不使用 → `PROCESS_SPAWN_MODULES` 非該当。かつ `src/main/app/` は SCAN_ROOTS 内で項目 7 が現に掛かる
- **パス型消失なし**: fake folder は `path: { namespace: 'wsl:E2E-Ubuntu', value: '/home/e2e/project' }` と namespace を正しく tag 付け。getTranscript は空返却で実ディレクトリ解決なし
- **永続環境なし**: フォントは repo 同梱を FontFace API + CSSOM で非永続注入。docker volume/apt/fc-cache/OS フォント登録なし
- **caller #3 (Principle IX) / #5 (CSP) / #6 (Principle VIII composer ガード)**: 自 owner scope 外 (architecture/security/ux-a11y に委ねる)。stub の合成 SessionEvent は production-inert・合成テキストのみ

## Verdict

- Critical: 0
- High: 0
- Medium: 1 (M-001)
- Low: 0
