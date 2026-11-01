# database-reviewer Review: 権限モードの Auto (起動と実行中) (026)

**Run**: 2026-11-01
**Reviewer**: database-reviewer (code-gate iter 3)
**Spec**: specs/026-session-live-auto-permission-mode/spec.md

## 初回読了 viewpoint

- FR/SC: FR-012 (プリセットに auto を保存・読み込み)、FR-003 (4 値の検査を write/read 対称に)、FR-007 (確認の印を永続化しない)、SC-002。
- touched files に該当する charter / Confirmation: AD-042 の schemaVersion 規則、AD-066 Decision 6 (presets.json を版 3 にする)、Constitution Principle V (秘密の実体を持たない)。
- 永続化に関係するのは `src/main/infra/settings/preset-record.ts` と `preset-store.ts` だけ。SQL と migration は存在しないので DB-7 は該当なし。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。DB-1 (器) は G で確認した。
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-042 と AD-066 Decision 6 の整合は G で確認した。
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当。
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

iter 2 からの差分は `tests/ui-coverage/item21.test.ts` の `beforeAll` に hookTimeout 120_000 を足しただけ (`.code-gate.diff:4998`)。永続化層には変更がない。`PRESET_SCHEMA_VERSION` は 3 (`preset-record.ts:31`)、`SUPPORTED_PRESET_SCHEMA_VERSIONS` は `[1, 2, 3]` (`:34`)。`autoModeAcknowledged` は `src/main/infra` に 0 件。保存キーは `id / name / config / updatedAt` のまま。DB-2 / DB-3 / DB-4 は iter 2 と同じ。Critical / High / Medium に当たる観察事実はなかった。

## Findings

### [Low] 古い @param 説明が版 3 に触れていない (L-001) (scope: feature) [unresolved from iter 2 L-001]

- **観察**: `src/main/infra/settings/preset-record.ts:44` の `@param version` は「版 2 は 9 キーの検証」のまま。
- **同種事象探索**: `版 2 は 9 キー` で 1 件 (`preset-record.ts:44`)。
- **推奨アクション**: 直さない (Low)。

### [Low] H: 版 3 のファイルで昇格モードを含むレコードを store レベルで確かめるテストが無い (L-002) (scope: feature) [unresolved from iter 2 L-002]

- **観察**: 版 3 の昇格モード拒否はレコード単位のテスト (diff `:2200-2204`) だけ。
- **同種事象探索**: `schemaVersion: 3` を書いて load するテストは 0 件。
- **推奨アクション**: 直さない (Low)。

### [Low] 版 3 の書き出しは auto を使わない利用者のファイルにも及ぶ (L-003) (scope: feature) [carried]

- **観察**: `preset-store.ts:174` は常に版 3 を書く。AD-066 Decision 6 / AD-042 の決定どおり。
- **同種事象探索**: `schemaVersion: PRESET_SCHEMA_VERSION` は 1 件 (`preset-store.ts:174`)。
- **推奨アクション**: 直さない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `版 2 は 9 キー` | 1 | `src/main/infra/settings/preset-record.ts:44` |
| L-002 | `schemaVersion: 3` を書いて load するテスト | 0 | 該当なし |
| L-003 | `schemaVersion: PRESET_SCHEMA_VERSION` | 1 | `src/main/infra/settings/preset-store.ts:174` |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved from iter 2: 0 / unresolved: 3 / new: 0
