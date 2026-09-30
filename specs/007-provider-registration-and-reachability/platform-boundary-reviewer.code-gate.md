# platform-boundary-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: code-gate (platform-boundary track) / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## Verdict
- Critical: 0 / High: 2 / Medium: 1 / Low: 2
- いずれも feature scope。Critical なし (全 finding は deriveEnv が IPC 非露出・launch 未配線のため現時点 live path なし)。ただし H-001/H-002 は X-4 の launch 配線で live 化する隔離境界の穴。

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: runtime/isolation charter Out of scope 侵犯なし
- D. Constitution / ADR drift: Critical:0 High:2 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer 未 install
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約
configDir の IPC/JSON 往復での名前空間保存は堅牢 (DTO は `{namespace,value}`、main 側 `toConfigDir` が namespace で HostPath/WslUncPath を再 branding)。**PB-2(単一ランタイム仮定)/PB-3(capabilities 虚偽)/PB-6(永続環境構築)は該当なし** — profiles は per-runtimeId 参照で複数 distro 可、preload/capability/ipc/composition の 6 メソッド完全一致、safeStorage は OS キーチェーンで自前ファイル無し。指摘は env 導出 seam の RuntimePath/到達可能性の不変条件が完全には強制されていない点に集中 (いずれも現 live path なし、X-4 が継ぐ latent)。

## Findings

### [High] PB-H-001 — extraEnv 経由で `CLAUDE_CONFIG_DIR` に素の HostPath を注入でき RuntimePath 変換を迂回する (scope: feature)
- **観察**: `derive-env.ts:32-37` は extraEnv の非 denylist KEY を `env[key]=value` でそのまま複製。denylist (`launch-spec.ts:30` の `/^(WSLENV|.*(API_?KEY|TOKEN|SECRET|PASSWORD)|AWS_.*)$/i`) に **`CLAUDE_CONFIG_DIR` はどの分岐も一致しない**。よって `extraEnv:{CLAUDE_CONFIG_DIR:'C:\\Users\\y\\.claude'}` は `isDeniedEnvKey` 通過。config-dir 以外の source では後段 switch が触れず素の HostPath 残存。config-dir source でも `resolved.configDirRuntimePath===undefined` (composition-root.ts:283 の stub `()=>null` で現状常に undefined) なら `derive-env.ts:68` の if が false で上書きされず残存。
- **同種探索**: env に CLAUDE_CONFIG_DIR を書く経路は derive-env.ts:69 (config-dir 分岐、resolved から) と extraEnv spread(:34) の 2 つ。infra 側 `buildLaunchEnv` は厳格 allowlist で extraEnv を通さないため注入 locus は `deriveLaunchEnv` の 1 箇所。
- **影響**: FR-008/AD-036 §6/Principle I/AD-004 は「CLAUDE_CONFIG_DIR は選択 runtime の RuntimePath でなければならず、素の HostPath は WSL 内 `claude` が POSIX 解釈できず委譲経路が沈黙失敗」と定める。extraEnv は唯一の名前空間依存変数を無変換で通す穴。現 live path 無し (deriveEnv IPC 非露出) だが X-4 が deriveEnv を launch 配線した時点で live 化。SC-003 テストは config-dir 経路のみで迂回を検出しない。
- **推奨**: `deriveLaunchEnv` の extraEnv passthrough KEY denylist に `CLAUDE_CONFIG_DIR` (+ CLAUDE config 系) を加える、または config-dir の CLAUDE_CONFIG_DIR 注入を「必ず resolved から・extraEnv より後で無条件上書き」に。負例テスト 2 種を SC-003 に追加。
- **根拠**: Principle I / AD-004 / AD-036 §6 / FR-008 / SC-003

### [High] PB-H-002 — `deriveEnv` が到達可能性を強制せず interface doc / contract C-1 の「到達不可は null」を満たさない (scope: feature)
- **観察**: `provider-service.ts:232-260` の `deriveEnv` は profile/runtime 未知でのみ null。**`assessReachability`/`splitByReachability` を一切呼ばない**。同ファイル:82-83 の interface doc は「到達不可/未知は null」、contracts C-1 は main 検証を「送信元+実在+到達可能性」と規定。
- **同種探索**: deriveEnv 内の reachability 呼び出し 0 件 (reachability は listReachable のみ)。deriveEnv テストは api-key 1 件のみで到達不可 null assert 無し。
- **影響**: 到達可能性は config-dir Provider の隔離境界 (別 distro/win32 からホスト ~/.claude 不可視。charter Journey 2)。deriveEnv が自己ガードを謳いつつ未実装のため、X-4 が文書化契約に依拠すると到達不可でも env 導出され、`resolveConfigDirRuntimePath` が null の経路で CLAUDE_CONFIG_DIR 欠落→ランタイム既定 config-dir へ沈黙フォールバック (別資格情報を掴む)。listReachable が一次ゲートのため defense-in-depth 層の欠落 (現 live path なし)。
- **推奨**: `deriveEnv` 先頭で `assessReachability !== 'reachable'` なら null (contract C-1 と整合)、または doc/contract を「到達可能性は listReachable が担保」に正直化。負例テスト追加。
- **根拠**: AD-025 / AD-039 §5 / contracts C-1 / SC-004 / isolation charter Journey 2

### [Medium] PB-M-001 — `ResolvedCredential.configDirRuntimePath` が data-model の `RuntimePath` でなく `string` 型で HostPath→RuntimePath 変換の tsc 保証が失われている
- **観察**: `types.ts:123` は `configDirRuntimePath?: string`、`provider-service.ts:42-45` の `resolveConfigDirRuntimePath` は `=> string | null`。data-model.md §4 は `configDirRuntimePath?: RuntimePath` (branded) と明記。branded 生成 (makeRuntimePath) を通す箇所無し。
- **影響**: HostPath/RuntimePath はともに `string & brand`。seam を string にすると X-4 の resolveConfigDirRuntimePath が誤って HostPath.value を返しても tsc が検出できない。data-model が branded にした意図 (境界直後に正しい型) が失われる。現 stub null で live path なし。
- **推奨**: `configDirRuntimePath?: RuntimePath` に戻し derive-env で `.value` を取り出す。resolveConfigDirRuntimePath の戻りも `RuntimePath | null` にし makeRuntimePath 経由を強制。
- **根拠**: AD-004 / data-model §4 / Principle I

### [Low] PB-L-001 — reachability が `classifyRawPath` を経ず namespace 直読みで distro を exact `===` 比較する
- **観察**: `reachability.ts:31-51` は `profile.configDir.namespace` を直読み、`distro === runtime.distroName` (exact) 判定。data-model §6 は classifyRawPath/parseWslUncPath 経由を規定。registration は canonicalDistroName を行わない。
- **影響**: `unc:UBUNTU-26.04` と検出済み `Ubuntu-26.04` が exact 不一致→同一 distro なのに unreachable 誤除外 (fail-closed で安全側)。現 UI は configDir を収集しないため UNC configDir 登録の live path 無し。
- **推奨**: distro 導出を data-model §6 の canonical 経路に一本化 or registration 時に綴りを検出済み集合へ寄せる。

### [Low] PB-L-002 — check.mjs 項目 17 の秘密リテラル走査が env へ秘密を構成するモジュールを対象外にしている
- **観察**: `allowlists.mjs:393` の `SECRET_LITERAL_SCAN_DIRS=['src/main/infra/settings/','src/main/infra/secrets/']`。`derive-env.ts`(env.ANTHROPIC_API_KEY 構成) と `provider-service.ts`(secrets.open 復号) は走査外。
- **影響**: derive-env.ts に `env.ANTHROPIC_API_KEY='sk-...'` 直書きしても項目 17 は捕捉しない。best-effort backstop であり runtime ガードは provider-record + SC-002 + security-reviewer 委譲済み。secret-scan.ts が意図的に secret regex を持つため domain/provider 単純追加は false positive リスク。
- **推奨**: 走査対象に app/provider-service.ts を追加 (secret-scan.ts は除外検討) or 対象外である旨を項目 17 note に明記して意図を固定。

## regression 評価
- `session-core.ts:38-45` の `QUERY_OPTION_KEYS` への `'settings'` 追加 + `buildQueryOptions` の `settings: assertHelperSettings(...)` (:115) は check.mjs 項目 16 の backstop と整合し AD-036 §4 P1 の昇格面締め出しを維持。`sdk-agent-session.ts:336-341` は settings を渡さず (assertHelperSettings(undefined)→undefined) 昇格経路 0 件を保つ。X-1 の権限ゲート回帰は破っていない。
