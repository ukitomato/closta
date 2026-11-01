# platform-boundary-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Reviewer**: platform-boundary-reviewer (code-gate iter 3)
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 3

> iter 3: iter 2 からの差分は `tests/ui-coverage/item21.test.ts:114` の beforeAll timeout (120_000) だけ。beforeAll の中身と項目 21 の判定ロジックは不変で、PB-1〜PB-7 に関係しない。下の指摘はすべて iter 2 からの未解消 (resolved 0 / unresolved 5 / new 0)。M-001 の Grep は今回 3 件 (`session-launch-service.test.ts:808` の stub を含む)。

## 初回読了 viewpoint

- FR/SC:
  - FR-001/002: 4 つの値の型と選択肢 (`src/domain/session/launch-config.ts:37-51`)
  - FR-003: main・agents の decoder と assert (`sdk-agent-session.ts` decodeLaunchOptions、`session-core.ts` decodeSessionControl)
  - FR-004: 項目 16 と rule fixture
  - FR-005/006: `requiresAutoModeConfirmation` (`launch-config.ts:78`)
  - FR-007: main が承諾の印を検査する (`session-launch-service.ts:510-511` / `:575` / `:591` / `:655`)
  - FR-012: プリセット
  - SC-002 / SC-003
- touched files に該当する charter / Confirmation: Constitution Principle III v1.6.0、AD-066 (Decision 2 / 3)、AD-003、AD-024 #13、isolation charter の「権限モードのゲート」(X-10 では session に暫定で置く)、session charter の Out of scope
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer (IPC は `args[2] === true` だけを承諾とする。`session-ipc.ts` の 3 か所で確認済み)
- C. 業務不変条件 / Charter drift: 該当なし: isolation charter の差分は実装の置き場所 (`src/domain/session/launch-config.ts:78`, `src/main/app/session-launch-service.ts:510`) と一致する
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

前回 (pr-gate R1) からの修正を確認した。
- **H-002 (テンプレートリテラルの抜け)**: `scripts/constitution/check.mjs:919-923` がバッククォートの形も照合する。fixture 2 本を追加。`scan.mjs:73-103` の `splitCode` がコメントを空白にするため、誤発火は無い。`expected.mjs` の `mitigatedBy` も直された。
- **code-gate M-002 (プリセットの auto のテスト)**: 追加された (`LaunchDialog.test.tsx:2347` / `:2365`)。

ゲートの迂回 (PB-4) は無い。main への入口 3 つはどれも `autoUnconfirmed` を通る。renderer が `ack=true` を送る経路は `LaunchDialog.tsx:588-627` の `send` と `LivePane.tsx:353` だけ。runtimeId がずれても main の拒否 (安全側) にとどまる。E2E capability は `!app.isPackaged && CLOSTA_E2E==='1'` のときだけ配線される (`src/main/index.ts:103`)。PB-3: `composition-root.ts:315-318` は記述子が無ければ false を返す。PB-2: runtimeId キー。PB-1 / PB-5 / PB-6: 該当なし。

## Findings

### [Medium] main のゲートの入力 (`autoModeAllowed` の本番の closure) にテストが無い (M-001) (scope: feature) — 前回 code-gate M-001 が未解消
- **観察**: `src/main/app/composition-root.ts:315-318` の closure は `session-launch-service.ts:511` の唯一の入力だが、単体テストは stub だけ (`session-launch-service.test.ts:188`, `:303`, `:808`)。E2E は別実装 (`e2e-capability.ts:655`)。
- **同種事象探索**: `autoModeAllowed: \(runtimeId\)` で 2 件 (`composition-root.ts:315`, `e2e-capability.ts:655`)。
- **リスク/影響**: closure が退行しても、どのテストも落ちない (SC-003 の担保が本番経路で外れる)。
- **推奨アクション**: 名前付き関数に切り出し、4 ケースを単体テストする。
- **根拠**: Principle III、AD-024 #13、FR-007

### [Medium] main の印の検査を守るのは単体テストだけで、Constitution 検証・rule fixture の側に記録が無い (M-002) (scope: feature) — 前回 pr-gate M-001 が未解消
- **観察**: `session-launch-service.ts:575` / `:591` / `:655` を消しても、項目 16 も rule fixture も発火しない。`UNDETECTED_NOTES` にも記録が無い。
- **同種事象探索**: expected.mjs で 0 件。`autoUnconfirmed\(` で 3 件。
- **推奨アクション**: `UNDETECTED_NOTES` に記録し、I-3 に申し送る。
- **根拠**: Principle III の Verification、AD-066 Confirmation、FR-004

### [Low] 実行中の切り替えで、印の検査が `runtimeId` が無いときに素通りする形のまま (L-001) — 前回 code-gate L-001 が未解消
- **観察**: `session-launch-service.ts:654-655`。今は到達しない。
- **同種事象探索**: 1 件。

### [Low] 項目 16 の違反の文が `auto` について矛盾して読める (L-002) — 前回 code-gate L-002 が未解消
- **観察**: `scripts/constitution/check.mjs:925`。
- **同種事象探索**: 1 件。

### [Low] domain が `auto` を含む定数を公開しており、agents が添字 1 つで項目 16 と実行時 assert の両方をすり抜けられる (L-003) (new)
- **観察**: `launch-config.ts:40` の `SELECTABLE_PERMISSION_MODES` を agents から import して `[3]` で取れる。現時点で src/agents に該当は 0 件。
- **推奨アクション**: `UNDETECTED_NOTES` の `howToClose` に import 禁止案を足して I-3 に申し送る。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `autoModeAllowed: \(runtimeId\)` | 2 | src/main/app/composition-root.ts:315, src/main/app/e2e-capability.ts:655 |
| M-002 | `autoUnconfirmed\|印の検査\|auto-mode` (expected.mjs) | 0 | - |
| M-002 | `autoUnconfirmed\(` (src/main) | 3 | src/main/app/session-launch-service.ts:575, :591, :655 |
| L-001 | `runtimeId !== undefined &&` | 1 | src/main/app/session-launch-service.ts:655 |
| L-002 | 項目 16 の違反の文 | 1 | scripts/constitution/check.mjs:925 |
| L-003 | `SELECTABLE_PERMISSION_MODES\|isAutoPermissionMode` (src/agents) | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
- Round inheritance: resolved: 3 / unresolved: 4 / new: 1
