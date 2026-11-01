# database-reviewer Review (pr-gate Round 1, system scope): 権限モードの Auto (起動と実行中) (026)

**Run**: 2026-11-01
**Reviewer**: database-reviewer (pr-gate R1)
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-012 (プリセットに auto を保存・読み込み)、FR-003 (4 値の検査を write/read 対称に)、FR-007 (確認の印を永続化しない)、SC-002。
- charter / Confirmation: AD-042 の schemaVersion 規則、AD-066 Decision 6 (presets.json を版 3 にする)、Principle V、session charter の権限モードの規則。
- 永続化の対象は `src/main/infra/settings/preset-record.ts` と `preset-store.ts` だけ。SQL / migration は存在しない (DB-7 は該当なし)。
- code-gate の database-reviewer の Low 4 件は再報告しない。
- A. 認可 / 認証 / secret 管理: 該当なし。security-reviewer の担当。DB-1 (器) は G で確認した。
- B. 入力検証 / injection / CSP / 暗号: 該当なし。security-reviewer の担当。
- C. 業務不変条件 / Charter drift: 該当なし。architecture-reviewer の担当。
- D. Constitution / ADR drift: 該当なし。architecture-reviewer の担当。AD-042 と AD-066 Decision 6 の整合は G で確認した。
- E. User Story / SC / AC / UX: 該当なし。po-reviewer の担当。
- F. 命名 / module / lint hookup: 該当なし。convention-reviewer の担当。
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:0
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

永続化に関係する変更は `presets.json` だけ。`src/main/infra` の非テストコードで `permissionMode` を扱うのは `preset-record.ts:70,83,117` だけ。`lastConfig` は renderer のメモリ上の状態で永続化しない (`running-session-store.ts:207,840,876`)。`autoModeAcknowledged` は `SessionLaunchConfig` / `PresetLaunchConfig` / `RECORD_KEYS` / `fromPresetRecord` の allow-list のいずれにも無い。

### DB-1 (器 / Principle V)

保存キーの allow-list は `id / name / config / updatedAt` のまま (`preset-record.ts:24,49`)。`permissionMode` は 4 値の enum。秘密の実体を置ける場所は増えていない。

### DB-2 / DB-3 / DB-4

- `SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2, 3]` (`preset-record.ts:34`)。旧ファイルが parse 失敗で全件を失う経路は無い。
- 書き出しは版 3。版 2 の旧アプリは `schema-version-unknown` として退避し (`preset-store.ts:119-122`)、`preset-service.ts:73,97` が `store-newer-version` で保存を拒否する。版を上げたのは旧アプリが `auto` のレコードを読み捨てて消す経路を断つためで妥当。
- 版 4 以上は退避する (`preset-store.test.ts:281`)。
- 書き込みは一時ファイルと rename の原子置換 (`preset-store.ts:171-190`)。
- 版 3 でも `acceptEdits` / `bypassPermissions` は `isValidPresetConfig` が落とす (`preset-record.test.ts:34-38`)。

### DB-5 / DB-6

同じ事実を 2 箇所に書く形は無い。確認の承諾は永続化しない。参照は id のまま。

## Findings

Critical / High / Medium は無し。

### [Low] 旧アプリへのダウングレードの扱いが ADR に書かれていない (L-101) (scope: system)

- **観察**: `docs/decisions/0066-auto-permission-mode-with-confirmation.md:48` は版 2 の Closta が 3 を読まないとだけ書き、旧アプリに戻したときにプリセット一覧が空に見え保存も拒否される見え方と復旧手順は書かれていない。ファイルは退避されて無傷で残る。
- **同種事象探索**: `schema-version-unknown|store-newer-version` (src/main/app、非テスト) で 3 件 (`provider-service.ts:146,205,240`、`preset-service.ts:73,97`)。既存の規約と同型。
- **推奨アクション**: 直さない (Low)。マイルストーンの棚卸しで判断。
- **根拠**: DB-3。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `schema-version-unknown\|store-newer-version` (src/main/app、非テスト) | 3 | `src/main/app/provider-service.ts:146,205,240`、`src/main/app/preset-service.ts:73,97` |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
