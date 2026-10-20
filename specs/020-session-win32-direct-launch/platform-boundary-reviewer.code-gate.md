# platform-boundary-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Gate**: code-gate iter 2 (reviewing からの再実行。base 0ba52bd / head c49190c)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-014, FR-016。SC-002 / SC-003 / SC-004 / SC-005 / SC-006。pr-gate R1 以降の変更は c49190c (renderer 表示と docs のみ) で境界に触れない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer 担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer 担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer 担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

PB-1〜PB-7 に新規の境界違反なし。PB-5 は docker endpoint 無しで該当なし。永続状態は userData の `runtime-settings.json` のみ。eslint.config.mjs / allowlists.mjs の差分はコメントのみでルールの緩和なし。

## Findings

### [Medium] (持ち越し) `ConfigDirResolution.path` が `HostPath | RuntimePath` に広がり、tsc が HostPath の WSL 起動流入を止めない (M-001)
- `helper-path.ts:73`, `types.ts:154`, `provider-service.ts:308`。実行時は `provider-service.test.ts:403-415` が捕捉。AD-004 / PB-1

### [Medium] (持ち越し) FR-014 の静的検査が 2 綴りのみで非再帰 (M-002)
- `tests/win32/agents-literals.test.ts:13-20`。現実装は準拠 (0 件)。FR-014 / AD-058 / PB-7

### [Low] (持ち越し) decoder が停止コマンドを末尾名だけで照合 (L-001)
- `sdk-agent-session.ts:379`。AD-058 Decision 1 どおり

### [Low] (持ち越し) agents decoder が `WSLENV` / `WSL_UTF8` を regex リテラルで持つ (L-002)
- `sdk-agent-session.ts:370`

### [Low] (持ち越し) `Win32RuntimeDescriptor.claudePath` が `string | null` で HostPath brand が落ちる (L-003)
- `win32.ts:30`, `descriptor.ts:43`。起動時に再 brand

### [Low] (持ち越し、件数増) runtime kind 分岐が「win32 以外は WSL」で fail open (L-004)
- `helper-path.ts:80`, `composition-root.ts:282`。c49190c で `LaunchDialog.tsx:558` / `:763` (表示文言のみ) が追加

## 同種事象探索 cascade summary

Critical は 0 件のため該当なし。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `HostPath \| RuntimePath` | 3 | helper-path.ts:73, types.ts:154, provider-service.ts:308 |
| M-002 | `taskkill\|System32\|SystemRoot\|/PID` (src/agents, 非 test) | 0 | - |
| L-001 | `toLowerCase\(\) !==` (src/agents) | 1 | sdk-agent-session.ts:379 |
| L-002 | `WSLENV` (src/agents, 非 test) | 1 | sdk-agent-session.ts:370 |
| L-003 | `readonly claudePath: string \| null` | 2 | descriptor.ts:43, workspace/__fixtures__/runtime.ts:14 |
| L-004 | `kind === 'win32'` (二値分岐, 非 test) | 7 | helper-path.ts:80, composition-root.ts:282, dto-mapper.ts:54-55, sdk-agent-session.ts:456, RuntimeListScreen.tsx:220, LaunchDialog.tsx:558/763 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Round inheritance: resolved 0 / unresolved 6 / new 0
