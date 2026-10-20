# platform-boundary-reviewer Review: Feature Specification: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Gate**: pr-gate (round 1。base 0ba52bd / head 7e5e1ba)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-014 と FR-016。SC-002 / SC-003 / SC-004 (単体の部分) / SC-005 / SC-006。FR-015 は charter と glossary の差分を確かめた
- touched files に該当する charter / Confirmation: runtime charter の Out of scope と Related ADRs / Specs。Constitution Principle I / II / III / VI / VII。AD-003、AD-004、AD-058 Decision 1 / 3 / 4 / 5 / 6 / 7 と Confirmation。AD-012 は該当なし
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲 (`.bak` の扱いなどは database-reviewer)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

- **PB-1**: cwd は `resolveFolderRuntime` の `namespace === 'host'` で照合 (`launch-preparation.ts`)。claude のパスは `makeHostPath` を通る (`launch-preparation.ts:143`)。永続化した上書きは `classifyClaudeExecutable` を通る (`win32-claude.ts`)。decoder は cwd と停止のパスを `makeHostPath` で検査。型が緩い箇所は 2 件 (M-001 / L-003)
- **PB-2**: Win32 の id は `host` の 1 つ。module スコープのキャッシュ無し。二分の既定は L-004
- **PB-3**: `createWin32Descriptor` は `fixedCapabilities(now)` のまま。locator の throw は `not-found`、設定が読めないときは `override-invalid` で安全側
- **PB-4**: `prepareWin32` は `config.permissionMode` (`SafePermissionMode`) を写すだけ。E2E が権限モード 3 つを固定
- **PB-5**: 該当なし
- **PB-6**: 永続化は userData の `runtime-settings.json` だけ
- **PB-7**: M-002 は直っていない。ESLint と `allowlists.mjs` の差分は注記だけで、ルールは緩めていない

## Findings

### [Medium] (持ち越し) `ConfigDirResolution.path` / `ResolvedCredential.configDirRuntimePath` が `HostPath | RuntimePath` に広がり、WSL の起動に HostPath が載っても tsc が止めない (M-001) (scope: feature)

- **観察**: `src/domain/provider/helper-path.ts:73`、`src/domain/provider/types.ts:154`、`src/main/app/provider-service.ts:308`。`derive-env.ts:113-114` は名前空間を見ずに `.value` を `CLAUDE_CONFIG_DIR` に入れる。
- **round 1 の追加事実**: 実行時の取り違えは `provider-service.test.ts:403-415` が検出する。code-gate の H-cov-001 は取り下げる。
- **推奨アクション**: 判別できる形にする。最小案は `deriveEnv` の WSL の経路で `namespace !== 'host'` を assert すること
- **根拠**: AD-004 / PB-1

### [Medium] (持ち越し) FR-014 の静的検査 `tests/win32/agents-literals.test.ts` は 2 つの綴りしか見ず、ディレクトリも再帰しない (M-002) (scope: feature)

- **観察**: `tests/win32/agents-literals.test.ts:13-20`。今の実装は適合している (`taskkill|System32|SystemRoot|/PID` は agents の本番コードで 0 件)。
- **推奨アクション**: 綴りを広げ、再帰で読む。可能なら `scripts/constitution/check.mjs` に載せる
- **根拠**: FR-014 / AD-058 Decision 1 / PB-7

### [Low] (持ち越し) decoder は停止のコマンドを末尾の名前だけで照合する (L-001) (scope: feature)

- `sdk-agent-session.ts` の `decodeWin32LaunchSpec`。AD-058 Decision 1 の指定どおりで drift ではない

### [Low] (持ち越し) agents の decoder が `WSLENV` / `WSL_UTF8` を正規表現のリテラルで持つ (L-002) (scope: feature)

- `sdk-agent-session.ts:370` 付近。domain の定数に寄せる

### [Low] `Win32RuntimeDescriptor.claudePath` が `string | null` で、HostPath の brand を検出の時点で剥がしている (L-003) (scope: feature)

- `win32.ts:30`、`descriptor.ts:43`。起動の時点で再 branding されるので実害無し

### [Low] ランタイムの種類の分岐が「win32 か、それ以外は WSL」の二分になり、前の fail-closed (`kind !== 'wsl'` → 到達不可) が既定で開く側に変わった (L-004) (scope: feature)

- `helper-path.ts:80`、`composition-root.ts:282`。`switch` + `assertNever` にするか `kind === 'wsl'` を明示する
- **根拠**: AD-003 / PB-2 / PB-3

## H (テスト / regression) の根拠

- PB-1: `provider-service.test.ts:403-415` / `:172-189`、fixture `src/domain/session/__fixtures__/win32-launch-spec.ts`
- PB-3 / PB-4: `wsl-detector.test.ts`、`e2e/launch-dialog.spec.ts`
- 停止の順番・1 回だけ・fallback・5 秒・パス非出力: `sdk-agent-session.test.ts:595-734`
- 観測点は理由のキーだけ
- 閉じるの後に木を止めない経路は無い (data-model §9.2)。穏当な `end` は AD-058 Decision 3 が「保証しない」と明記

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `HostPath \| RuntimePath` / `configDirRuntimePath` | 3 | helper-path.ts:73, types.ts:154, provider-service.ts:308 |
| M-002 | `taskkill\|System32\|SystemRoot\|/PID` (src/agents。テスト以外) | 0 | - |
| L-001 | `basename\(.*\)\.toLowerCase\(\) !==` | 1 | sdk-agent-session.ts |
| L-002 | `WSLENV` (src/agents。テスト以外) | 1 | sdk-agent-session.ts:370 付近 |
| L-003 | `readonly claudePath: string \| null` | 2 | descriptor.ts:43, workspace/__fixtures__/runtime.ts:14 |
| L-004 | `kind === 'win32' \?` (テスト以外) | 5 | composition-root.ts:282, dto-mapper.ts:54, :55, sdk-agent-session.ts:456, RuntimeListScreen.tsx:220 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Round inheritance (code-gate → pr-gate R1): 解消 1 (H-cov-001 取り下げ)、未解消 4 (M-001 / M-002 / L-001 / L-002)、新規 2 (L-003 / L-004)
