# platform-boundary-reviewer Review: Feature Specification: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Gate**: code-gate (iter 1)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012, FR-014, FR-016、SC-002 / SC-003 / SC-004 (単体の部分) / SC-005 / SC-006
- touched files に該当する charter / Confirmation: runtime charter の Out of scope、Constitution Principle I / II / III / VI / VII の Verification、AD-003 (Win32Runtime は `autoModeSafe: false`、`fixedCapabilities` 不変)、AD-004 (HostPath と RuntimePath の分離)、AD-012: 該当なし (docker endpoint なし)
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-8 は `Win32Runtime` で `claude.exe` を直接起動する。`RuntimeLaunchSpec` を WSL / Win32 の和型にし、Win32 の起動の値・env の許可リスト・停止のコマンドは `src/main/infra/runtime/win32-launch.ts` で組む。agents は値を decoder で検査し、spawn して `taskkill /T /F /PID` で木ごと止める。

- PB-1: IPC / 永続化 / DTO の 3 境界で再 branding は正しい。ただし型を広げた穴が 1 件 (M-001)
- PB-2: Win32 の id は `host` で単一。module スコープのキャッシュなし
- PB-3: `createWin32Descriptor` は `fixedCapabilities(now)` のまま
- PB-4: 権限モードは安全 3 値に閉じている
- PB-5: 該当なし
- PB-6: 永続化は userData 配下の `runtime-settings.json` だけ
- PB-7: 結果は M-002 / L-002

## Findings

### [Medium] `ConfigDirResolution` / `configDirRuntimePath` を `HostPath | RuntimePath` に広げたため、WSL の起動で HostPath が `CLAUDE_CONFIG_DIR` に載っても tsc が止めなくなった (M-001) (scope: feature)

- **観察**: `src/domain/provider/helper-path.ts:73`、`src/domain/provider/types.ts:154`、`src/main/app/provider-service.ts:308`、`src/domain/provider/derive-env.ts:113-114`。実行時の網も無い。
- **リスク/影響**: 今は実害なし。将来の変更で WSL に HostPath が載っても tsc も実行時も通る (AD-004 が防ごうとした取り違え)。
- **推奨アクション**: 戻り値を kind で判別できる型にするか、`deriveEnv` の WSL 経路で `namespace !== 'host'` を assert。テストを足す。
- **根拠**: AD-004 / Principle I / PB-1

### [Medium] FR-014 の静的検査 `tests/win32/agents-literals.test.ts` は 2 つの綴りしか見ない (M-002) (scope: feature)

- **観察**: `tests/win32/agents-literals.test.ts:19-20` は `taskkill` と `'.exe'` だけ。`/T` `/F` `/PID`、`System32` 等、`.cmd` `.ps1`、引用符なしの綴りは検出されない。`readdirSync` は非再帰 (`:13`)。
- **同種事象探索**: src/agents (テスト以外) で 0 件。今の実装は適合している。
- **推奨アクション**: 検査対象を広げ、再帰化。可能なら `check.mjs` の項目に載せる。
- **根拠**: FR-014 / AD-058 Decision 1 / PB-7

### [Medium] M-001 の取り違えを検出するテストが見当たらない (H-cov-001) (scope: feature)

- **推奨アクション**: WSL × host configDir → `CLAUDE_CONFIG_DIR` が `/` で始まるテストを足す。
- **根拠**: reviewer-base H / AD-004

### [Low] decoder は停止のコマンドを basename だけで照合する (L-001) (scope: feature)

- `src/agents/sdk-agent-session.ts:376-382`。ADR が basename 比較を指定しているので drift ではない。

### [Low] agents の decoder が `WSLENV` / `WSL_UTF8` を正規表現リテラルで持つ (L-002) (scope: feature)

- `src/agents/sdk-agent-session.ts:370`。domain の定数に寄せる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `HostPath \| RuntimePath` | 3 | helper-path.ts:73, types.ts:154, provider-service.ts:308 |
| M-002 | `taskkill\|\.exe\|System32\|SystemRoot\|/PID` (src/agents) | 0 | - |
| H-cov-001 | WSL × host configDir assertion | 0 | - |
| L-001 | `basename\(.*\)\.toLowerCase\(\) !==` | 1 | sdk-agent-session.ts:379 |
| L-002 | `WSLENV` | 1 | sdk-agent-session.ts:370 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 2
