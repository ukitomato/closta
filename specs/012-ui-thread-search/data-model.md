# Data Model: Thread 検索と探す操作 (O-3)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。

## §1 検索語の一致 (`features/search/match.ts`)

| 段 | 規則 |
|---|---|
| 正規化 | `normalize(s) = compressSpaces(stripControls(s.normalize('NFKC').toLowerCase()))`。`stripControls` は C0 (U+0000-001F)・DEL・C1 (U+0080-009F)・双方向制御 (U+061C, U+200E-200F, U+202A-202E, U+2066-2069)・ゼロ幅 (U+200B-200D, U+2060, U+FEFF) を除く |
| 語 | 正規化した検索語を空白で区切る。空なら「絞り込まない」 |
| Thread search の対象 | `SessionSummaryDTO` の `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` / `targetLabel`。`null` は対象外 |
| 一致 | 全語が、正規化したどれかのフィールドに部分一致 (AND) |
| 並び | 入力の並びを保つ |

palette のセッションの候補は、一覧の要約行と稼働中のセッション (稼働中の一覧の行の表示名) の両方に同じ関数を当てる。

## §2 会話内検索の状態 (renderer。永続化しない)

```ts
interface ConversationSearchState {
  readonly open: boolean
  readonly query: string                 // 入力のまま。正規化は §1
  readonly hits: readonly SearchHit[]    // 本文の出現の並び (メッセージの並び → 本文の位置)
  readonly current: number               // hits の index。hits が空なら -1
}
interface SearchHit { readonly messageIndex: number; readonly messageId: string; readonly occurrence: number }
```

- 対象: role が `user` / `assistant` のメッセージの `text` part の本文 (spec FR-004)
- 走査: 入力から 150ms 間引く。メッセージの追加では、追加分だけを走査して `hits` の末尾に足す (`current` は変えない)
- 移動: `current` を ±1 (端で反対の端へ)。移動のたびに transcript の `scrollToMessage(hits[current].messageIndex)`
- 強調: 描かれているメッセージの DOM の text node に、§1 の正規化で一致した範囲の `Range` を作り、`CSS.highlights` の 2 つの名前 (`closta-search` / `closta-search-current`) に入れる。閉じたら両方を消す
- セッションの切り替え・画面の離脱で閉じる

## §3 Command palette の操作 (`features/palette/commands.ts`)

| id | 文言のキー | 使える条件 | 実行 |
|---|---|---|---|
| `launch:open` | 新しいセッションを起動 | 常に | O-7 の `launchOpen = true` |
| `settings:<section>` | 設定: {項目の名前} | 常に | O-7 の設定のダイアログをその項目で開く |
| `shell:sidebar` / `shell:panel` | サイドバー / 詳細を畳む・開く | 常に | O-7 の畳みを切り替える |
| `chat:search` | 会話内検索 | 中央に会話を出しているとき (O-7 の `focus !== 'none'`) | §2 を開く |
| `chat:density` | transcript の情報密度を切り替える | 同上 | O-2 の密度を切り替える |
| `session:<id>` | セッションの表示名 | §1 で一致 | 過去 → `sessions.select` / 稼働中 → 稼働中の行の `select`。O-7 の focus の書き手が中央を切り替える |

- 並び: 操作 → 稼働中のセッション → 一覧のセッション。最大 50 件
- 語が空のときは操作だけを出す

## §4 起動の利用記録 (`launch-usage.json`)

置き場: ユーザデータディレクトリ (`app.getPath('userData')`)。

```json
{ "schemaVersion": 1, "days": { "2026-10-04": { "preset": 3, "manual": 1 } } }
```

| 項目 | 規則 |
|---|---|
| キーの集合 | 最上位は `schemaVersion` / `days` だけ。`days` のキーは `^\d{4}-\d{2}-\d{2}$`、値のキーは `preset` / `manual` だけ、値は 0 以上の整数 |
| 書き込み | 起動が受け付けられたとき (`launching`) だけ +1。書く前に、今日から 90 日より前の日を消す。一時ファイル (`launch-usage.json.<now>.<seq>.tmp`) に書いて置き換える。service が直列化する |
| 読み込みの失敗 | ENOENT → 空。parse の失敗・キーの集合の外・版の違い → `launch-usage.json.<now>.bak` に退避して空から始める。それ以外の読めない (権限など) → 空として扱い、書き込みもしない (元を壊さない) |
| 読み出し | `getLaunchUsage()` → `{ preset: number, manual: number, days: 30 }`。今日を含む 30 暦日の合計 |
| 入れないもの | セッション id・プリセットの id と名前・フォルダ・ランタイム・Provider・モデル・時刻・環境変数 (spec FR-011)。型と固定のキー集合のテストで守る |

`LaunchOrigin = 'preset' | 'manual'`。renderer の起動ダイアログが決める (spec FR-009)。main は `checkLaunchOrigin(value): LaunchOrigin | null` で検証し、`null` なら記録しない。

## §5 新しい文言 (正本。`labels.ts` に置く)

| 置き場 | キー | 文言 |
|---|---|---|
| session-list | `searchLabel` | セッションを検索 |
| session-list | `searchPlaceholder` | 題・要約・プロンプト・ブランチ・タグで探す |
| session-list | `searchCount(n)` | {n} 件が一致 |
| session-list | `searchClear` | 検索を消す |
| chat | `searchOpen` | 会話内を検索 |
| chat | `searchPosition(i, n)` | {i} / {n} |
| chat | `searchNone` | 一致する箇所はありません。 |
| chat | `searchNext` / `searchPrev` / `searchClose` | 次へ / 前へ / 検索を閉じる |
| palette | `paletteLabel` | コマンド |
| palette | `palettePlaceholder` | 操作やセッションを探す |
| palette | `paletteNone` | 一致する操作はありません。 |
| palette | `navTo(label)` | {label}へ移動 |
| palette | `launchOpen` | 新しいセッションを起動 |
| session | `usageTitle` | 直近 30 日の起動 |
| session | `usageCounts(p, m)` | プリセット {p} 回 / 手動 {m} 回 |
| session | `usageEmpty` | まだ記録がありません。 |

既存の空の文言 (`SessionListScreen` の 5 つ、稼働中の一覧、transcript の 2 つ) は変えない。
