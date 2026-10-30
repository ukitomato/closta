# database-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: database-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC: FR-009 / FR-010 / FR-011 (プリセットの版 2・名前を保存しない・write/read 対称)、FR-014 (`launch-usage.json` を変えない)、FR-008 (名前は registry のメモリだけ。Principle X)。SC-004 (store の版 1 / 版 2 / 将来版)。
- touched files に該当する charter / Confirmation: session charter の「プリセットの保存・適用」。constitution Principle V (長期資格情報を永続化しない)。AD-042 Decision 4 (store の形を変える feature は版を上げ、読み替えは store の内側に置く)。AD-064 Decision 4 (`presets.json` 版 2)。AD-050 (gate の指摘の扱い)。
- 対象の永続化は JSON のみ。`presets.json` が `src/main/infra/settings/preset-record.ts` と `preset-store.ts` に当たる。SQL migration は存在しないので DB-7 は該当なし。

- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。DB-1 (器) の観点では指摘 0 件で、下の G に集計した
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:0 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

### DB 観点ごとの結論 (観察事実)

- **DB-1 (器)**: 該当する指摘なし。
  - `PresetLaunchConfig` は 9 キーで、値は folder id・runtime id・provider id・model id・effort・permissionMode・`additionalDirectoryIds`・`maxTurns`・`maxBudgetUsd` だけ。secret 実体やパスを置ける袋 (`Record<string, string>` など) は無い (`src/domain/session/launch-config.ts` の `PRESET_CONFIG_KEYS`)。
  - `sessionName` は `PresetLaunchConfig = Omit<SessionLaunchConfig, 'sessionName'>` で型から除かれている。書き込み側は `toPresetConfig` (`launch-config.ts` の diff 1600-1605) と `checkPreset` が `isValidPresetConfig` を使う形 (`validate.ts` の diff 2676-2678)。読み取り側は版 2 の `preset-record.ts:71` が同じ述語を使う。write/read が対称。
  - `sessionName` を持つ版 2 のレコードは `invalid-record` で退避される。これを `preset-record.test.ts` と `preset-store.test.ts` が確かめている。
  - `launch-usage.json` は変わっていない。`launch-usage-service.test.ts` の diff だけで、本体は無変更。
  - `src/main` のうち、`additionalDirectories` (変換後のパス) と `title` は `launch-preparation.ts:98-109` の `extraAxisOptions` から query options に載るだけで、永続化の経路には出ない。
- **DB-2 / DB-3 (後方互換・版)**
  - 版 1 は `isValidPresetConfigV1` (6 キーだけ許す) で検証し、allow-list のキーで組み直して `DEFAULT_EXTRA_AXES` で補う (`preset-record.ts:57-69`)。旧 key を読み残さず、新しい 3 軸の欠けで全件を捨てる経路もない。
  - 版 1 のファイルを読んだだけでは書き戻さない。最初の `save` で版 2 の全件を書く。`preset-store.test.ts` の diff 2973-3003 が検証している。
  - 将来版 (3 以上) は `schema-version-unknown` で退避され、mutation は `store-newer-version` で拒否される (`preset-store.ts:119-122`、`preset-service.ts:97`)。旧アプリが版 2 のファイルを開いた場合もこの経路に入るので、黙って欠けない (plan の RK-07 と一致)。
  - 版 0・数でない・欠けは `parse-failed` で退避する。
- **DB-4 (原子性)**: 保存は一意な temp ファイル + rename で、失敗時は temp を消す (`preset-store.ts:171-190`)。読み取り失敗 (ENOENT 以外) は空に倒さず mutation を拒否する。パース失敗・版不明・一部破損はいずれも上書き前に `.bak` へ退避する。024 で変更はない。保存先は `userDataDir` 配下のまま。
- **DB-5 (参照)**: `additionalDirectoryIds` は folder id の参照で、導出値やパスを永続化していない。参照先の登録が解除されても、適用のときに `resolveLaunchAxes` が項目単位で外して `directoryResets` で通知する (`launch-resolution.ts` の diff 1842-1863)。孤児の id を起動まで運ばない。
- **DB-6 (パス)**: パスは永続化していない。追加ディレクトリは不透明な folder id で持つ (U-2)。

## スコープ要約

diff は 024 の全体 (domain / agents / main / renderer / docs) だが、本 reviewer が見るのは `presets.json` の版 2 化に関わる範囲に限る。具体的には `launch-config.ts` の述語、`preset-record.ts`、`preset-store.ts`、`preset-service.ts` の型、`validate.ts` の `checkPreset` / `checkResumeRequest`、`PresetPanel.tsx` の保存前変換。永続化スキーマとして Critical / High / Medium に当たる経路は見つからなかった。版の判定・版 1 の読み替え・write/read 対称・名前を保存しない点は、実装とテストの両方で確認できた。Low が 2 件ある。

## Findings

### [Low] 版 1 のファイルを版 2 に書き換える最初の save の前に、原文の退避を取らない (L-001) (scope: feature)

- **観察**: `src/main/infra/settings/preset-store.ts:171-190` の `save` は、読んだファイルの版に関係なく版 2 の全件で `presets.json` を置換する。`backup(raw)` を呼ぶのは parse 失敗・将来版・一部破損のときだけ (`:109`, `:113`, `:120`, `:130`, `:136`, `:162`)。版 1 を正常に読めた場合に原文を残す処理はない。テストの `expect(... .bak ...).toEqual([])` (`preset-store.test.ts` の diff 2988) も「退避しない」ことを仕様として固定している。
- **同種事象探索**: `backup\(raw\)` を `src/main/infra/settings` で Grep → preset-store.ts の 6 箇所。`provider-store` を含む他の store には版を上げる migration がまだ無いので、横展開の対象は無い。
- **リスク/影響**: 版 1 → 版 2 は新しい 3 軸を既定値で補うだけの無損失変換で、データを失う実害の経路は観察されていない。ただし移行後に旧バージョンのアプリへ戻すと、旧アプリは版 2 を将来版として退避するだけで読めない。版 1 の原文は復旧の手段として残らない。plan の RK-07 が受け入れた範囲。
- **推奨アクション**: 直さなくてよい。直す場合は、store が `load()` で版 1 を読んだことを覚え、最初の `save` の前に `backup(raw)` を 1 回だけ取る。
- **根拠**: DB-3 (移行前のバックアップ)。AD-042 Decision 4。
- **scope 根拠**: feature の touched files (preset-store.ts) で直接直せる。

### [Low] `DEFAULT_EXTRA_AXES.additionalDirectoryIds` が export された共有の可変配列である (L-002) (scope: feature)

- **観察**: `src/domain/session/launch-config.ts:119-122` で `DEFAULT_EXTRA_AXES = { additionalDirectoryIds: [], ... }` を export している。`preset-record.ts:67-68` は `...DEFAULT_EXTRA_AXES` の直後に `additionalDirectoryIds: []` で上書きして、共有参照が config に入るのを避けている。一方 `LaunchDialog.tsx:127` と `e2e-capability.ts:587` は上書きなしで spread している。型は `readonly string[]` なので、書き換えは型検査で止まる。
- **同種事象探索**: `\.\.\.DEFAULT_EXTRA_AXES` を非テストの `src` で Grep → 3 件 (`preset-record.ts:67`, `LaunchDialog.tsx:127`, `e2e-capability.ts:587`)。ほかに `app-shell-harness.tsx:260` がテスト補助にある。
- **リスク/影響**: 現時点で実際に配列を破壊的に変更するコードは無い。将来の混入に対する備えの話で、永続化の内容は変わらない。
- **推奨アクション**: `Object.freeze` するか、既定を作る関数にする。
- **根拠**: DB-5 (不変条件の保持)。
- **scope 根拠**: feature の touched files で直接直せる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `backup\(raw\)` (src/main/infra/settings) | 6 | preset-store.ts:109, :113, :120, :130, :136, :162 |
| L-002 | `\.\.\.DEFAULT_EXTRA_AXES` (非テスト) | 3 | preset-record.ts:67, LaunchDialog.tsx:127, e2e-capability.ts:587 |

Critical は 0 件なので、cascade_enforce の対象は無い。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
