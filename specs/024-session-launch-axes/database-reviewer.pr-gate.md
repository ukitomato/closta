# database-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: database-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: pr-gate Round 1 (system scope)

## 初回読了 viewpoint

- FR/SC: FR-009 / FR-010 / FR-011 (プリセットの版 2・名前を保存しない・write/read 対称)、FR-008 (名前は registry のメモリだけ)、FR-014 (`launch-usage.json` を変えない)。SC-004 (store の版 1 / 版 2 / 将来版)、SC-006 の `launch-usage.json` キー不変。
- touched files に該当する charter / Confirmation: Constitution Principle V (secret の実体を永続化しない)。AD-064 Decision 4 と Confirmation の `preset-store.test.ts` (版 1 の読み替え・版 2 の往復・名前を持つレコードの拒否・将来版の退避)。AD-042 Decision 4 (版を上げ、読み替えは store の内側に置く)。session charter のプリセットの項。
- 永続化は JSON のみ。対象は `presets.json` で、`src/main/infra/settings/preset-record.ts` と `preset-store.ts`、それと共有する述語 `src/domain/session/launch-config.ts`。SQL migration は無いので DB-7 は該当なし。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。器の観点 (DB-1) では指摘 0 件で、G に集計した
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-064 Decision 4 との整合は G の DB-2/3 で確認した (実装は ADR のとおり)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:0
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

### DB 観点ごとの観察結果

- **DB-1 (器)**: 指摘なし。
  - `PRESET_CONFIG_KEYS` は 9 キーで、値は id 参照・enum・数だけ (`launch-config.ts:89-99`)。`Record<string,string>` のような何でも入る袋も、secret の実体を置けるフィールドも無い。
  - `sessionName` は `PresetLaunchConfig = Omit<SessionLaunchConfig,'sessionName'>` (`launch-config.ts:69`) で型から外れている。
  - `fromPresetRecord` は 9 キーの allow-list で書き出す (`preset-record.ts:103-120`)。読み取りは `isValidPresetConfig` で、`sessionName` を持つ版 2 のレコードは `invalid-record` になる (`preset-record.ts:70-71`)。
  - IPC の `checkPreset` も同じ述語を使う (`validate.ts:533`)。write/read は対称。
- **DB-2 / DB-3 (後方互換・版)**: 指摘なし。
  - 版 1 は `isValidPresetConfigV1` で 6 キーだけを許す。allow-list のキーで組み直し、新しい 3 軸を既定で補う (`preset-record.ts:57-69`)。必須フィールドの追加で全件を捨てる経路は無い。
  - 3 以上の版は `schema-version-unknown` で退避し (`preset-store.ts:119-122`)、service は mutation を `store-newer-version` で拒否する (`preset-service.ts:97,128`)。
  - 数でない・0・欠けは `parse-failed` で退避する。
  - 旧アプリが版 2 を開いたときも、旧アプリの `schemaVersion !== 1` の判定が同じ退避の経路に入る (base の `preset-store.ts:115-120`)。版 2 の原文は上書きされず、黙って欠けない。再度アップグレードすれば戻る。plan RK-07 / AD-064 Consequences の受け入れ範囲。
  - 版 1 を読んだだけでは書き戻さない。最初の `save` で版 2 の全件を書く (`preset-store.ts:171-190`)。AD-064 Decision 4 は「退避も書き戻しもしない」と決めており、実装はこれに一致する。
- **DB-4 (原子性・破損耐性)**: 024 は `save` / `load` のエラー経路を変えていない。
  - 保存は一意な temp + rename で、失敗時は temp を消す。読み取り失敗 (ENOENT 以外) は空に倒さず mutation を拒否する。パース失敗・版不明・一部破損は上書き前に `.bak` へ退避する。
  - 保存先は `userDataDir` 配下のまま。
- **DB-5 (参照・導出値)**: `additionalDirectoryIds` は folder id の参照で、パスや導出値を永続化していない。参照先の登録が解除されても、適用のときに `resolveLaunchAxes` が項目単位で外して通知する。孤児の id を起動まで運ばない。
- **DB-6 (パス)**: パスは永続化していない (U-2。不透明な folder id)。
- **DB-7**: 該当なし (SQL 無し)。

### H の根拠 (テストと観測点)

- `preset-record.test.ts` と `preset-store.test.ts` の追加テストが上の経路を直接検出する。
  - 版 1 の 6 軸補完 (`.pr-gate.diff:5864`)
  - 版 1 が新しい軸のキーを持てば拒否 (`:5872`)
  - 版 1 の形を版 2 として読むと拒否 (`:5885`)
  - 版 1 のファイルを退避せず・書き込まずに読む (`:6058`)
  - 版 1 を読んだ後の最初の save で版 2 の全件を書く (`:6076`)
  - 版 2 の往復で 9 キーを失わない (`:6090`)
  - `sessionName` を持つ版 2 の拒否と退避 (`:6104`)
  - 版 3 の退避 (`:6117`)
- `launch-usage.json` が変わらないことは `launch-usage-service.test.ts` (`:5411`) がキー列で pin している。
- 既存の store の振る舞い (read-failed・parse 失敗・temp 掃除) は、本 PR で `preset-store.ts` の差分が版の判定と `toPresetRecord` の引数だけなので変わっていない。
- 観測点は `ensureLoaded` の `console.warn` (件数・理由キー・退避パスだけ。名前や値を出さない) で足りる。

## スコープ要約

pr-gate の system scope (`src/main/infra/settings/**`) として、`presets.json` の版 2 化に関わる範囲を見た。対象は `preset-record.ts`、`preset-store.ts`、`preset-service.ts` の型と直列化、`launch-config.ts` の述語 (9 キー / 版 1 の 6 キー / 追加ディレクトリ・上限の値域)、`validate.ts` の `checkPreset`、spec / data-model §6 / AD-064 Decision 4 との対応。code-gate の verdict は `must_fix_findings` が空で、除外する項目は無かった。code-gate 時の database-reviewer の Low 2 件 (版 1 の原文の退避なし・`DEFAULT_EXTRA_AXES` の共有配列) は、後者は `preset-record.ts:68` で上書き済み、前者は ADR が明示的に決めた挙動なので、再報告しない。観察事実として Critical / High / Medium / Low のいずれにも当たる経路は見つからなかった。

## Findings

該当なし: 永続化スキーマとして、secret を置ける器・既存ファイルを壊す変更・設定を黙って捨てる経路・非原子的な書き込みは、観察されなかった (上の DB 観点ごとの観察結果と根拠の行を参照)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| — | (指摘なし。参考) `PRESET_SCHEMA_VERSION\|SUPPORTED_PRESET_SCHEMA_VERSIONS\|presets\.json` (非テスト src) | 版の参照は store と record の 2 ファイルだけ | preset-store.ts:10,11,119,124,174 / preset-record.ts:27,30 (他の store・export / import 経路は無い) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: 該当なし (Round 1)
