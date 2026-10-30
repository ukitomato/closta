# database-reviewer Review (code-gate iter 2): 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: database-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: code-gate iter 2 (pr-gate round 1 の修正後の再実行)

## 初回読了 viewpoint

- FR/SC: FR-009 / FR-010 / FR-011 (プリセット版 2・名前を保存しない・write/read 対称)、FR-008 (名前は registry のメモリだけ)、FR-014 (`launch-usage.json` 不変)。SC-004 (store の版 1 / 版 2 / 将来版)。
- 該当する charter / Confirmation: Constitution Principle V、AD-064 Decision 4、AD-042 Decision 4 (版を上げ、読み替えは store の内側)。
- 永続化は JSON のみ (`presets.json`)。SQL は無いので DB-7 は該当なし。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。DB-1 (器) は指摘 0 件で G に集計した。
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-064 Decision 4 と実装の整合は G の DB-2/3 で確認した。
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:0
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

### DB 観点ごとの観察結果

- **DB-1 (器)**: 指摘なし。
  - `PRESET_CONFIG_KEYS` は 9 キーで、値は id 参照・enum・数だけ (`src/domain/session/launch-config.ts:89-99`)。何でも入る袋も secret を置けるフィールドも無い。
  - `PresetLaunchConfig = Omit<SessionLaunchConfig,'sessionName'>` (`launch-config.ts:69`) で、名前は型から外れている。
  - `fromPresetRecord` は 9 キーの allow-list で書き出す (`src/main/infra/settings/preset-record.ts:103-120`)。
  - 読み取りは `isValidPresetConfig` が `sessionName` を持つレコードを拒否する (`preset-record.ts:71`, `launch-config.ts:204-208`)。
  - IPC の `checkPreset` も同じ述語を使う (`src/main/app/validate.ts:532-533`)。write/read は対称。
  - `handleSavePreset` は `checkLaunchConfig` を外して `checkPreset` だけにした (`src/main/app/session-ipc.ts:302`)。プリセット経路が名前を受け付けない方向に直っている。
- **DB-2 / DB-3 (後方互換・版)**: 指摘なし。
  - 版 1 は `isValidPresetConfigV1` で 6 キーだけを許し、allow-list のキーで組み直して新しい 3 軸を既定で補う (`preset-record.ts:57-69`)。`additionalDirectoryIds` は新しい配列で補う。
  - 3 以上の版は `schema-version-unknown` で退避する (`src/main/infra/settings/preset-store.ts:119-122`)。
  - 数でない・欠落・0 以下の版は `parse-failed` で退避する (`preset-store.ts:124-132`)。
  - 版 1 を読んだだけでは書き戻さない。最初の `save` で版 2 の全件を書く (`preset-store.ts:171-179`)。AD-064 Decision 4 に一致する。
  - 旧アプリが版 2 を開いたときは退避の経路に入る。plan RK-07 の受け入れ範囲。
- **DB-4 (原子性・破損耐性)**: 024 は `save` / `load` のエラー経路を変えていない。一意な temp + rename、失敗時 temp 削除、読み取り失敗は空に倒さない、上書き前に `.bak` 退避。
- **DB-5 (参照・導出値)**: `additionalDirectoryIds` は不透明な folder id の参照。登録解除時は `resolveLaunchAxes` が項目単位で外して通知する。
- **DB-6 (パス)**: パスは永続化していない (U-2)。
- **DB-7**: 該当なし (SQL 無し)。

### H の根拠 (テストと観測点)

- 版 1 の補完、版 1 に新しい軸のキーがあれば拒否、版 1 の読み取りで退避も書き込みもしないこと、版 1 読了後の最初の save で版 2 全件を書くこと、版 2 の往復で 9 キーを失わないこと、`sessionName` を持つ版 2 の拒否と退避、版 3 の退避を `preset-record.test.ts` と `preset-store.test.ts` が直接検出する。
- `launch-usage.json` のキーが変わらないことは `launch-usage-service.test.ts` が pin している。
- 観測点は service の `console.warn` (件数・理由キー・退避パスだけ) で足りる。

## スコープ要約

code-gate iter 2 として `.code-gate-scope.txt` のうち永続化に関わる範囲 (`preset-record.ts`、`preset-store.ts`、`preset-service.ts`、`launch-config.ts`、`validate.ts` の `checkPreset`、`session-ipc.ts` の `handleSavePreset`、`preset.ts`) を見た。pr-gate round 1 の修正で永続化スキーマと書き込み経路に新しい変更は入っていない。

## Findings

該当なし: secret を置ける器・既存ファイルを壊す変更・設定を黙って捨てる経路・非原子的な書き込みは観察されなかった。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| — | (指摘なし。参考) `isValidPresetConfig\|checkPreset\|checkLaunchConfig` (非テスト src) | 述語 1 つに集約 | `validate.ts:532-533` / `preset-record.ts:58,71` / `session-ipc.ts:302` |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: 前回の Low 2 件は解消済み / ADR 既定の挙動のため再報告しない。新規 0 件。
