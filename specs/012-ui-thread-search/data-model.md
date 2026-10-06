# Data Model: Thread 検索と探す操作 (O-3)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。

## §1 検索語の一致 (`features/search/session-search.ts`)

`src/domain/session/match.ts` (cwd とフォルダの対応づけ) と名前がぶつからないよう `session-search.ts` とする。

| 段 | 規則 |
|---|---|
| 正規化 | `normalize(s) = compressSpaces(stripControls(s.normalize('NFKC').toLowerCase()))`。`stripControls` は C0 (U+0000-001F)・DEL・C1 (U+0080-009F)・双方向制御 (U+061C, U+200E-200F, U+202A-202E, U+2066-2069)・ゼロ幅 (U+200B-200D, U+2060, U+FEFF) を除く |
| 語 | 正規化した検索語を空白で区切る。空なら「絞り込まない」 |
| Thread search の対象 | 要約行の `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` と、**行が属するグループの見出しの文字列** (登録フォルダ → `folderLabels.nameOf(folderId)`、未登録 → 一覧の見出しと同じ導出 (`group.cwd?.value ?? group.cwdDisplay` を表示用に整えたもの)、保留 / 不明 → 見出しの文言)。見出しの導出は一覧と同じ関数を共有する。`null` は対象外。`cwd.value` (PathDTO) を直接は対象にしない |
| 一致 | 全語が、正規化したどれかの対象に**字面の部分一致** (`includes`)。検索語から `RegExp` を組まない |
| 並び | 入力の並びを保つ |

palette のセッションの候補は、一覧の要約行と稼働中のセッション (稼働中の一覧の行の表示名) の両方に同じ関数を当てる。同じ `sessionId` が両方にあれば稼働中の 1 件にまとめる。

### Thread search の空の状態

一覧の空の表示の優先順位 (`SessionListScreen.tsx:844-859`) に `search-empty` を足し、`filtered-out` より先に判定する (検索語があり、その結果 0 件のとき)。`search-empty` の操作は「検索と絞り込みをすべて解除」(語・所在・フォルダを戻す)。既存の `filtered-out` の文言とボタンは変えない。

### 畳まれたグループ

検索語があるとき、既定で畳まれているグループ (未登録) も一致した行を出す。区画の開閉の `useState` は書き換えず、表示の判定で「検索中は開いて描く」とする。語を消すと元の開閉で描く。

## §2 会話内検索の状態 (renderer。永続化しない)

```ts
interface ConversationSearchState {
  readonly open: boolean
  readonly query: string                 // 入力のまま。正規化は §1
  readonly hits: readonly SearchHit[]    // 本文の出現の並び (メッセージの並び → 本文の位置)
  readonly current: SearchHitKey | null  // 現在の一致。hits が空なら null
}
interface SearchHit { readonly messageIndex: number; readonly messageId: string; readonly occurrence: number }
type SearchHitKey = { readonly messageId: string; readonly occurrence: number }
```

### 入力 (本文の供給元)

`useConversationSearch(messages: readonly SearchableMessage[])`。`SearchableMessage = { id, role, texts: readonly string[] }` (`text` part の本文だけ)。

| 中央 | 供給元 |
|---|---|
| 過去ログ | `useTranscript` が返すメッセージ (ChatScreen の runtime に渡す前の配列) |
| 稼働中 | 稼働中のストアの表示中のセッションのメッセージ (`useLiveSession` が返す配列) |

中央のヘッダ (O-7) の検索のボタンとバーは、中央の本体と同じ供給元を context で受ける。

### 走査

- 対象: role が `user` / `assistant` のメッセージの `text` part の本文 (spec FR-004)
- 入力から 150ms 間引く。走査は間引きの後に 1 回
- メッセージの追加と、本文が変わったメッセージ (同じ id で `texts` が変わったもの。ストリーミング・送り直し) は、そのメッセージだけを走査し直して、そのメッセージの hits を置き換える。配列の同一性が変わった (過去ログの再取得) ときは全件を走査し直す
- `current` は `SearchHitKey` で持つ。走査し直しても同じキーが残っていればそれを指し続ける。消えたら一番近い前の一致へ

### 移動

`current` を前後に (端で反対の端へ)。移動のたびに transcript の `scrollToMessage(messageIndex)`。

### 強調

- 描かれているメッセージの DOM の text node を順に連結し、**元の文字列の各位置 → (text node, offset)** の表を作る
- 正規化は 1 文字 (code point) ずつ行い、**正規化後の各位置 → 元の文字列の位置** の表を作る (NFKC で伸びる文字・`toLowerCase` で伸びる文字・除去で消える文字を扱う)
- 一致の位置を 2 つの表で元の (text node, offset) に写し、`Range` を作る。`0 <= offset <= node.length` を満たさない位置は強調を飛ばす (例外を出さない)。text node をまたぐ一致も 2 つの表で扱える
- `CSS.highlights` の 2 つの名前 (`closta-search` / `closta-search-current`) に入れる。閉じたら両方を消す
- `::highlight(closta-search)` / `::highlight(closta-search-current)` の規則はバンドルされる CSS (`main.css`) に置き、既存のテーマのトークン (`--accent` / `--primary` など) を使う。実行時に `<style>` や `style` 属性を足さない
- 件数は本文の一致で数える。markdown の記号で描画の一致がずれたときは、描画の中で写せた一致だけを強調する

### 閉じる

セッションの切り替え・中央の未選択で閉じる。

## §3 Command palette の操作 (`features/palette/commands.ts`)

| id | 文言のキー | 使える条件 | 実行 |
|---|---|---|---|
| `launch:open` | 新しいセッションを起動 | 常に | O-7 の `launchOpen = true` |
| `settings:<section>` | 設定: {項目の名前} | 常に | O-7 の設定のダイアログをその項目で開く |
| `shell:sidebar` / `shell:panel` | サイドバー / 詳細を畳む・開く | 常に | O-7 の畳みを切り替える |
| `chat:search` | 会話内検索 | 中央に会話を出しているとき (O-7 の `focus !== 'none'`) | §2 を開く。開いていれば入力欄にフォーカス |
| `chat:density` | transcript の情報密度を切り替える | 同上 | O-2 の密度を切り替える |
| `session:<id>` | セッションの表示名 | §1 で一致 | 過去 → `sessions.select` / 稼働中 → 稼働中の行の `select`。O-7 の focus の書き手が中央を切り替える |

- 並び: 操作 → 稼働中のセッション → 一覧のセッション。最大 50 件
- 語が空のときは操作だけを出す
- Ctrl+K は `window` の keydown (capture)。`event.isComposing` / `keyCode === 229`、または `[aria-modal="true"]` の要素が開いているときは何もしない (`preventDefault` もしない)

## §4 起動の利用記録 (`LaunchUsage`。`launch-usage.json`)

置き場: ユーザデータディレクトリ。store は `createLaunchUsageStore(userDataDir: HostPath, now, fs?)` で、本体・一時ファイル・`.bak` のパスは `hostPathOps.join` で組む (既存の settings の store と同じ。AD-004 / AD-023 §8)。

```json
{ "schemaVersion": 1, "days": { "2026-10-04": { "preset": 3, "manual": 1 } } }
```

### 型と純関数 (`src/domain/session/launch-usage.ts`)

- `LaunchOrigin = 'preset' | 'manual'`。`checkLaunchOrigin(value)` は `value === 'preset' || value === 'manual'` の厳密比較で、それ以外は `null`
- `LocalDayKey` (brand)。作れるのは `toLocalDayKey(epochMs, tzOffsetMin)` と、読み込みの検証 (暦として正しい `YYYY-MM-DD`) だけ
- `addLaunch(usage, day, origin)`・`prune(usage, today)`・`sum30(usage, today)` は純関数。回数は `Number.isSafeInteger(n) && n >= 0`
- 刈り込みの基準日は `min(today, 記録の中の最も新しい日)`。その基準日から 90 日より前の日を消す (時計が先に跳んでも過去の記録を消さない)。30 日の合計は `today` を含む 30 暦日 (未来の日は入らない)

### 読み込みの結果

| 結果 | 扱い | service の状態 |
|---|---|---|
| ENOENT | 空 | 読み込み済み |
| 最上位の形が崩れている (parse の失敗・`schemaVersion` / `days` が無い・`days` がオブジェクトでない)・版が欠けている / 数値でない / 1 未満 | `.bak` に退避して空から | 読み込み済み |
| 日単位の不正 (鍵が暦日でない・値のキーの外・回数が不正) | その日だけ飛ばし、残りを読む。飛ばした日があれば退避する | 読み込み済み |
| 将来版 (`schemaVersion` が数値で 1 より大きい) | 退避し、**書き込まない** (`record()` は捨てる) | `storeNewerVersion` |
| 読めない (ENOENT 以外の I/O の失敗) | 書き込まない | `readFailed`。次の `record()` / `getLaunchUsage()` で読み直す |
| 退避 (`.bak`) の書き込みの失敗 | 読み込みを失敗として扱い、書き込まない | `readFailed` (読み直す) |

- 読み込み済みになったら再読しない (同じプロセスで `.bak` を何度も作らない。プロセスをまたぐ重複は X-6 の預かり)

### 書き込み

- 起動が受け付けられたとき (`launching`) だけ。`addLaunch` → `prune` → 一時ファイル (`launch-usage.json.<now>.<seq>.tmp`) に書いて置き換え。失敗したら一時ファイルを消す
- **書き込みが成功してからメモリを差し替える** (失敗した 1 回は捨てる)。service が直列化する
- 書き込みの失敗は起動の結果を変えない (await しない)

### 読み出し

`getLaunchUsage()` (引数を取らない) → `{ status: 'ok', preset: number, manual: number, days: 30 } | { status: 'unreadable' }`。`storeNewerVersion` / `readFailed` は `unreadable`。

### ログ

読み込みの結果 (退避・将来版・読めない) と書き込みの失敗を、`[launch-usage-store]` の接頭辞で、理由キーと errno のコードだけ `console.warn` に出す。値とパスは出さない (Principle V)。

### 入れないもの

セッション id・プリセットの id と名前・フォルダ・ランタイム・Provider・モデル・時刻 (日より細かいもの)・環境変数 (spec FR-011)。書き出しは許可したキーしか出さない関数を通し、固定のキー集合のテストで守る。

### E2E

E2E の配線 (`e2e-capability.ts`) の `recordLaunchUsage` はメモリ内の fake で、ファイルに書かない。`getLaunchUsage` は fake の値を返す。

## §5 新しい文言 (正本。`labels.ts` に置く)

| 置き場 | キー | 文言 |
|---|---|---|
| session-list | `searchLabel` | セッションを検索 |
| session-list | `searchPlaceholder` | 題・要約・プロンプト・ブランチ・タグ・フォルダで探す |
| session-list | `searchCount(n)` | {n} 件が一致 |
| session-list | `searchClear` | 検索を消す |
| session-list | `searchEmpty` | 読み込み済みのセッションに一致するものはありません。 |
| session-list | `searchEmptyReset` | 検索と絞り込みをすべて解除する |
| chat | `searchOpen` | 会話内を検索 |
| chat | `searchPosition(i, n)` | {i} / {n} |
| chat | `searchNone` | 一致する箇所はありません。 |
| chat | `searchNext` / `searchPrev` / `searchClose` | 次へ / 前へ / 検索を閉じる |
| palette | `paletteLabel` | コマンド |
| palette | `palettePlaceholder` | 操作やセッションを探す |
| palette | `paletteNone` | 一致する操作はありません。 |
| palette | `launchOpen` | 新しいセッションを起動 |
| palette | `settingsOpen(label)` | 設定: {label} |
| session | `usageTitle` | 直近 30 日の起動 |
| session | `usageCounts(p, m)` | プリセットを適用 {p} 回 / 適用なし {m} 回 |
| session | `usageEmpty` | まだ記録がありません。 |
| session | `usageUnreadable` | 記録を読めません。 |

既存の空の文言 (`SessionListScreen` の 5 つ、稼働中の一覧、transcript の 2 つ) は変えない。`search-empty` は新しい状態で、`filtered-out` を変えない。
