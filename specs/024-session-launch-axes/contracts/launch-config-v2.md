# Contract: 起動設定の 10 軸と presets.json 版 2 (024)

規則の形は [data-model.md](../data-model.md) が正本。本ファイルは境界 (renderer → main IPC・main → agents・ディスク) ごとに受け渡す値の形を固定する。

## C-1 renderer → main: `launchSession(config, origin)`

`config` は `SessionLaunchConfig` (data-model §1) の 10 キーを **全部** 持つ。

```json
{
  "folderId": "f-app",
  "runtimeId": "wsl:Ubuntu",
  "providerId": null,
  "modelId": null,
  "effort": null,
  "permissionMode": "default",
  "additionalDirectoryIds": ["f-lib"],
  "maxTurns": 30,
  "maxBudgetUsd": 2,
  "sessionName": "ログインの API 修正"
}
```

| 受けた値 | main の応答 |
|---|---|
| キーの欠け・未知のキー・形の外 (data-model §1.2) | `invalid-config` (`query()` を呼ばない) |
| 追加ディレクトリの id が未登録・このランタイムで変換できない (§4) | `invalid-config` |
| 上の全部を通る | 今の起動の流れ |

## C-2 renderer → main: `resumeSession(request)`

`request.config` は C-1 と同じ 10 キーで、**`sessionName` は `null` に限る**。`null` でなければ `invalid-config`。引き継ぐ 3 軸の照合 (021) は変わらない。

## C-3 renderer → main: `savePreset(name, config)`

`config` は `PresetLaunchConfig` (9 キー。`sessionName` を持たない)。`sessionName` のキーがあれば拒否 (`invalid-config`)。返す `PresetDTO.config` も 9 キー。

## C-4 main → agents: `LaunchQueryOptions`

| キー | 型 | 載る条件 |
|---|---|---|
| `additionalDirectories` | `string[]` (1〜10・重複なし) | 追加ディレクトリが 1 件以上 |
| `maxTurns` | 整数 1〜1000 | 上限あり |
| `maxBudgetUsd` | 0.01〜1000・小数 2 桁まで | 上限あり |
| `title` | 023 の名前の規則を通った文字列 | 名前あり (再開では載らない) |

- パスの形: WSL の起動は POSIX の絶対パス、Win32 の起動は `makeHostPath` が正規化したドライブ付きのパス (data-model §5.2)
- agents は受けた値を再検査し、外れれば起動しない (decode の失敗 / `buildQueryOptions` の throw)。エラーのメッセージに値を入れない

## C-5 agents → SDK: `query({ options })`

`buildQueryOptions` の戻り値のキーは `QUERY_OPTION_KEYS` (16) の部分集合である。新しい 4 キーは C-4 で載ったときだけ同名で載る。SDK はこれを次の経路で `claude` に渡す (research R-01)。

- `additionalDirectories` → CLI 引数 `--add-dir <path>` (1 件ずつ)
- `maxTurns` → `--max-turns`
- `maxBudgetUsd` → `--max-budget-usd`
- `title` → stdin の初期化の control request

## C-6 ディスク: `presets.json`

```json
{
  "schemaVersion": 2,
  "presets": [
    {
      "id": "…",
      "name": "共通ライブラリ付き",
      "config": {
        "folderId": "f-app",
        "runtimeId": "wsl:Ubuntu",
        "providerId": null,
        "modelId": null,
        "effort": null,
        "permissionMode": "default",
        "additionalDirectoryIds": ["f-lib"],
        "maxTurns": null,
        "maxBudgetUsd": 5
      },
      "updatedAt": "2026-10-29T00:00:00.000Z"
    }
  ]
}
```

| 読んだファイルの `schemaVersion` | 扱い |
|---|---|
| `1` | 各レコードの config を 6 キーで検証し、`additionalDirectoryIds: []`・`maxTurns: null`・`maxBudgetUsd: null` で補う。退避しない。書き戻さない |
| `2` | config を 9 キーで検証 (`sessionName` があれば `invalid-record`) |
| `3` 以上 | `schema-version-unknown`・退避 (今の規則) |
| それ以外 | `parse-failed`・退避 (今の規則) |

書き出しは常に `schemaVersion: 2`。

## C-7 `launch-usage.json`

変わらない (FR-014)。
