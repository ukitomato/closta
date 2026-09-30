# convention-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: code-gate (convention track) / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## Verdict
- Critical: 0 / High: 0 / Medium: 0 / Low: 3
- 命名規則・module 配置 (AD-023 5 レイヤ)・lint hookup のいずれも規約違反なし。残りは Low 3 件のみで gate をブロックしない。

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution / ADR drift / layering: 該当なし: architecture / platform-boundary owner (depcruise/eslint 機械強制 green)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:3
- G. optional reviewer 範囲: 該当なし: 本 track では optional reviewer 未 install
- H. テスト / coverage / observability / regression: Low:1

## CONV-1 lint 結果の受け取り
invoker から lint-agent JSON を受領。**exit_code=0**、`violations:[]`、`summary{errors:0,warnings:0}`。commands 5 本すべて exit 0。非ゼロ exit の Critical 経路には該当しない。translate すべき violation 0 件。

## Findings

### [Low] CONV-L-001 — plan/tasks の `normalizeDetectedCandidate` と実装 `normalizeDetectedCandidates` の単複ドリフト (scope: feature)
- **観察**: `detect.ts:52` の export は `normalizeDetectedCandidates` (複数形)。`plan.md:113` / `tasks.md` BE-002 は単数形。呼び出し側 `provider-service.ts:2,141` は複数形で整合。
- **影響**: spec/plan の識別子と実装が食い違うと X-4 実装者が単数形を grep して見つからずリネーム漏れと誤認。実害は将来の探索コストのみ。
- **推奨**: plan.md:113 / tasks.md BE-002 を複数形へ追随 (spec は参照形なので plan/tasks 側を直すのが最小)。配列を受けて配列を返すので複数形が正確。
- **根拠**: CONV-6

### [Low] CONV-L-002 — infra/provider の pure/IO 分離が `detect.ts`/`detector.ts` の 2 文字差に載っている (scope: feature)
- **観察**: `infra/provider/detect.ts` は純粋 (`detectCandidates`/`parseAwsProfiles`)、`detector.ts` は I/O (`createProviderDetector`、node:fs/promises)。既存 infra/runtime は `wsl-output.ts`(純粋)/`wsl-detector.ts`(I/O) と役割が読める別名。
- **影響**: import 取り違えが型エラーになりにくく pure/IO 判別しづらい。保守性の微低下のみ。なお `detect.ts` が domain/provider と infra/provider に併存する点は**違反でない** (reachability.ts / dto.ts 等 role-based 短名の namespace 重複は確立規約)。
- **推奨**: 純粋側を役割名 (candidates.ts 等) or I/O 側を provider-detector.ts に。強制ではない。

### [Low] CONV-L-003 — 実体を得た `src/main/infra/secrets/` に vestigial `.gitkeep` が残存 (scope: feature)
- **観察**: `src/main/infra/secrets/.gitkeep` が safe-storage.ts と同居。R-1 が空予約枠に置いた placeholder で、本 feature が最初の .ts を置いた時点で役目終了。
- **影響**: 実害なし。dead placeholder が「まだ予約枠か」と誤読させる程度。
- **推奨**: `.gitkeep` を削除 (任意)。

## lint hookup (CONV-3) — 指摘なし (観察事実)
新規モジュールはすべて検査 glob の内側:
- eslint (`files:['src/**/*.{ts,tsx}']`) 全対象。boundaries/elements に全新規ディレクトリ吸収、`no-unknown-files:error` green。
- typecheck: tsconfig.node (src/main+src/domain) / tsconfig.web (src/renderer/src) が全新規を包含。
- depcruise: src 全体 251 modules、`no-circular:error` green (循環依存 機械検査済)。
- 予約枠ルール初発火 green: `electron-only-from-app-and-secrets` (ELECTRON_ALLOWED に infra/secrets/) と eslint SECRETS_FILES が safe-storage.ts:1 の `import {safeStorage} from 'electron'` で初対象・green。
- `services-not-to-io` 実名追加 (SH-011) 履行: `.dependency-cruiser.js:252` の from に provider-service 追加・comment 更新。provider-service は import type のみで規則充足。
- check:constitution 17 項目に増加 (項目 17 = SH-010 が infra/settings/secrets を走査化)。ok 16 / 違反 0 / pending 1。
- domain 純粋性 (`domain-not-to-io`) 維持: domain/provider 7 本は @domain/相対 import のみ。dead export 走査で orphan なし。

## H (テスト/regression) — 自 owner 範囲
- **観測した coverage の穴 (Low)**: `infra/provider/detector.ts` (createProviderDetector = I/O) に専用 test 無し (`detect.test.ts` は純粋のみ)。`~/.aws/config` 読取失敗を null に落とす try/catch (detector.ts:64-69。SC-009 の核) が単体未保護。薄い glue だが SC-009「破損スキップ」の I/O 層が未テスト (純粋 parseAwsProfiles は test 済、po が SC-009 owner)。
- **regression**: `session-core.ts` の buildQueryOptions 改変は session-core.test.ts が同 PR で更新済。命名/配置観点の既存破壊なし。
