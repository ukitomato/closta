# Phase 1 Data Model: セッション列挙 (R-2)

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Date**: 2026-09-16

R-1 の data-model ([001 の data-model.md](../001-runtime-folder-registration-runtime-detection/data-model.md))
を前提とし、その上に**セッション側の値**を載せる。R-1 の型を再定義しない。

R-1 から使うもの: `NamespaceId` / `RuntimeDescriptor` / `PathMapping` / `VerifiedRunning` /
`HostPath` / `RuntimePath` / `WslUncPath` / `WorkspaceFolder` / `Location` /
`resolveFolderRuntime()` / 接頭辞照合 (`findLongestMatch` / `matchesAtSegmentBoundary`) /
パス API (`runtimePathOps` / `hostPathOps`)。

---

## 1. `EnumerationTarget` — 列挙対象

```text
EnumerationTarget
  key           : string                    **不透明な識別子**。IPC の引数と突き合わせに使う
  location      : Location                 所在 (windows | wsl:<D>)
  configDir     : HostPath | RuntimePath    所在の名前空間で表した config ディレクトリ
  origin        : 'default'                 由来。X-3 で 'provider' が増える
  label         : string                    表示用 (どの候補から来たか。例: ユーザ名)
```

### `key` の規則

- **不透明とする。** `configDir` の値・UNC 形式の文字列・ホームディレクトリのパスを
  **含んではならない** — 含めると、`EnumerationOutcomeDTO` 経由で config ディレクトリの
  実体パスが renderer に露出し、FR-042 と「不要な情報を境界に出さない」の双方に触れる
- 由来を復元できない形で生成し、**プロセスの寿命で安定させる** (`fetchMoreSessions` が跨ぐため)
- IPC 側は**既知の集合との完全一致**でのみ照合する。パスとして解釈しない
  (R-1 の `folderId` と同じ扱い)

### 不変条件

- `configDir` の名前空間は `location` と一致する (R-1 の `isNamespaceConsistent` と同じ規則)
- **`WslUncPath` を持たない。** UNC 形式は `infra` の内側でのみ組み立てる
  ([research.md](research.md) R-05 / FR-042)
- 1 つの所在に複数の `EnumerationTarget` がありうる (複数ユーザ。FR-011)。
  **1 つを暗黙に選ばない**
- 所在 `wsl:<D>` の `EnumerationTarget` を作れるのは、**実行中確認済みの値がある場合のみ**
  (FR-008 / R-08)

### 探索 (FR-010 / R-03)

```text
所在 windows  → ホストユーザの既定 config ディレクトリ 1 件 (FR-009)
所在 wsl:<D>  → 1. ホーム配下を浅く列挙 (実測 69 ms)
                2. 各候補 + /root について `.claude` の存在を確認
                3. 存在した候補すべてを EnumerationTarget にする
                4. 権限拒否・不在は「その候補の失敗 / 不在」として記録し、
                   所在全体を失敗にしない
```

---

## 2. `CwdOrigin` — 作業ディレクトリの出自

**由来 config ディレクトリの所在から名前空間を推定しない** (FR-016)。
値の形から判定する。実測でホスト側 1 つの config ディレクトリに 3 形式が混在した
([research.md](research.md) R-02)。

```text
CwdOrigin =
  | { kind: 'host';             path: HostPath }
  | { kind: 'wsl-from-unc';     path: RuntimePath; namespace: WslNamespaceId }
  | { kind: 'wsl-inherited';    path: RuntimePath; namespace: WslNamespaceId }
  | { kind: 'unknown-location'; raw: string }
  | { kind: 'undetected-distro'; raw: string; distroName: string }
  | { kind: 'absent' }
```

### 判定規則

| # | 条件 | 結果 |
| --- | --- | --- |
| 1 | 値が無い / 空 | `absent` |
| 2 | `\\wsl.localhost\<D>\...` 形式 かつ `<D>` が検出済み | `wsl-from-unc` (UNC → `RuntimePath` に変換) |
| 3 | `\\wsl.localhost\<D>\...` 形式 かつ `<D>` が未検出 | `undetected-distro` |
| 4 | ドライブレター始まり | `host` |
| 5 | `/` 始まり かつ 由来 config の所在が `wsl:<D>` | `wsl-inherited` (`<D>` を継承) |
| 6 | `/` 始まり かつ 由来 config の所在が `windows` | `unknown-location` |
| 7 | 上記以外 (相対パス等) | `unknown-location` |

### 不変条件

- **#2 の変換に必要な「生の UNC 文字列を解析する関数」は R-1 に存在しない。**
  `makeWslUncPath(namespace, raw)` は名前空間識別子を**引数に要求する**ため、
  生文字列からディストロ名を得る手段が無ければ呼べない。
  したがって本 feature は **R-1 のパス API 側に解析関数を 1 つ追加する** —
  `parseWslUncPath(raw): PathResult<{ distroName, path: WslUncPath }>` を
  パス操作の標準モジュールを import してよい**唯一の実装ファイル**に置く。
  **`domain/session` は文字列操作で `\\wsl.localhost\` を剥がさない**
  (R-1 が「境界での再 branding」として繰り返し塞いだ形)。
  解析関数は接頭辞の**大小差**と legacy 形式 (`\\wsl$\`) の扱いもここで一元的に決める (M-005 / M-002)
- **出自判定の純粋関数は `RuntimePath` を生成しない。** 生成 (branding) はパス API の側にあり、
  `domain/session` は解析結果を受け取るだけとする。
  この分離により、`ui` が判定関数を呼んでも**名前空間つきパス値を合成できない**
- **#3 と #6 を混ぜない。** 前者は「どのディストロかは分かるが、そのディストロが今ない」、
  後者は「どのディストロか分からない」であり、利用者に示すべきことが違う (US-1 AC-8)
- **#6 で所在を推測しない。** 同じ `/home/y/p` は複数のディストロに存在しうる (AD-025)
- 判定は**純粋関数**であり I/O を持たない。入力は (値, 由来 config の所在, 検出済みディストロ名の集合)
- 判定関数は `domain` に置くが、**`ui` からは到達できない。**
  UNC の解析にパス API (`src/domain/runtime/path-api.ts`) を使い、
  同ファイルは `node:path` を import するため、`.dependency-cruiser.js` の
  `ui-not-to-core` (**推移的**到達の禁止) が renderer からの import を error にする。
  **これは制約ではなく望ましい性質である** — `ui` が判定関数経由で
  名前空間つきパス値を合成する経路が構造的に存在しなくなる。
  renderer は DTO の `originKind` (参照キー) を読んで表示を分岐する

---

## 3. `SessionSummary` — セッションの要約行

**各項目に表示先を割り当てる** (Principle XII / FE-048)。`SDKSessionInfo` の 10 項目に
未割当を残さないことを、この表そのもので示す (O-2 の `docs/ui-coverage.md` の先行素材)。

```text
SessionSummary
  sessionId     : string                 UUID
  summary       : string | null          SDK の要約 (空でありうる)
  firstPrompt   : string | null          代替表示の第 2 候補 (FR-047)
  customTitle   : string | null          代替表示の第 1 候補 (FR-047)
  lastModified  : number | null          epoch ms
  createdAt     : number | null
  fileSize      : number | null
  gitBranch     : string | null
  tag           : string | null
  origin        : CwdOrigin              §2
  source        : SessionSource          §3.1
  targetKey     : string                 由来 EnumerationTarget の **不透明鍵** (§1)。
                                         行の同一性と R-3 の本文取得がこれを使う
  targetLabel   : string                 由来 EnumerationTarget の label (FR-011)
```

### 表示先の割り当て (FE-048 / Principle XII)

**`SDKSessionInfo` の 10 項目に未割当を残さない。** 実装時に確認した結果である
(`src/renderer/src/features/session-list/SessionListScreen.tsx`)。

| `SDKSessionInfo` の項目 | 表示先 | 備考 |
| --- | --- | --- |
| `customTitle` | 行の表題 | 代替表示の**第 1 候補** (FR-047) |
| `summary` | 行の表題 | 第 2 候補 |
| `firstPrompt` | 行の表題 | 第 3 候補 |
| `sessionId` | 行の表題 (先頭 8 文字) | **最後の手段**。上の 3 つがすべて空のときだけ |
| `lastModified` | 行の表題 (識別子と併記) / **並び順** | 既定の並びは最終更新の新しい順 (FR-039) |
| `createdAt` | 行の詳細「開始 &lt;時刻&gt;」 | |
| `gitBranch` | 行の詳細「ブランチ &lt;名前&gt;」 | |
| `tag` | 行の詳細「タグ &lt;値&gt;」 | |
| `fileSize` | 行の詳細 (1024 進で丸めた大きさ) | バイト数をそのまま出さない |
| `cwd` | グループ見出し (未登録) / 行の詳細 (出自の種別) | **変換済みの値か表示用文字列だけ** (FR-042) |

**`SDKSessionInfo` に無いが表示するもの**: `programmatic` / `worktree` (FR-029。
取得手段は design-gate L-002 の解決を参照)、`targetLabel` (FR-052)、
正規化の痕跡 (FR-049。切り詰めと制御文字の除去を別々に示す)。

**実装時に 4 項目 (`createdAt` / `gitBranch` / `tag` / `fileSize`) が未割当だった。**
FE-048 はこれを見つけるための task であり、確認だけで記録を残さないと
O-2 が `docs/ui-coverage.md` を作るときにやり直しになる。

### 不変条件

- **transcript の本文 (メッセージ列 / tool 出力) を含まない** (FR-044 / SC-011)。
  **ただし `summary` / `firstPrompt` / `customTitle` は会話由来の逐語文字列を含みうる** —
  SDK の定義は `firstPrompt` を "First meaningful user prompt in the session." とし、
  `summary` も要約が無ければ最初のプロンプトを返す。**「要約だから安全」と扱わない**
- **境界のサイズ制御は main の責務、表示のための省略は `ui` の責務** (FR-049)。
  会話由来文字列は IPC 境界を越える前にバイト長上限で切り詰め、
  制御文字・双方向制御文字を除去し、**切り詰め・除去が起きたことを payload 上で示す**
- `sessionId` は表示に使ってよいが、**要約の代替としてのみ** (FR-047)
- **行の同一性は `(targetKey, sessionId)` の組で定義する。** 同一 UUID が 2 つの config
  ディレクトリに現れうる (履歴のコピー。spec の Edge Case)。`sessionId` だけを鍵にすると
  一覧に見分けのつかない 2 行が並び、選択が一意に決まらず R-3 で別の会話が開く。
  `cwdKey` が (所在, 正規化済みパス) の組を採っているのと同じ規則
- `lastModified` / `createdAt` / `fileSize` は**有限の安全整数**であることを検証する。
  満たさない値は「不明」に落とし、**行を落とさない**。並び順の端に置く
- **これらの値は config ディレクトリ由来 = アプリ外のプロセスが書いた未信頼入力である。**
  R-1 が renderer 発の値に掛けている拘束 (制御文字 / 長さ / 文字種) を、
  **方向が逆になっても外さない**

### 3.1 `SessionSource` — 由来

```text
SessionSource
  programmatic : boolean    SDK / daemon 由来 (実測で 269 件中 40 件)
                            **取得手段は SDK に区別子が無いため research の項目で確定させる**
  worktree     : boolean    git worktree 配下の作業ディレクトリ
```

**落とさずに区別する** (FR-029)。落とすと、Closta 自身が将来起動するセッション (X-1 以降) が
一覧から消える。

---

## 4. `FolderMatch` — 登録フォルダとの対応づけ

```text
FolderMatch =
  | { kind: 'folder';  folderId: string; boundary: Boundary; matchedPrefix: string }
  | { kind: 'pending'; reason: PendingReason }
  | { kind: 'unregistered'; cwdKey: string }
  | { kind: 'unknown';  reason: UnknownReason }

PendingReason = 'distro-not-running' | 'capabilities-not-probed' | 'probe-failed'
UnknownReason = 'cwd-absent' | 'location-unknown' | 'distro-undetected'
```

`Boundary` は R-1 の `'native' | 'cross' | 'unknown'` をそのまま使う (FR-023)。

### 判定順序 (FR-019 〜 FR-024)

**R-1 の `resolveFolderRuntime()` を変換エンジンとして再利用する。**
セッションの所在は R-1 のランタイム識別子と同じ空間にあるため、
「登録フォルダをそのランタイムから見たときのパス」を R-1 が既に計算できる。
**同じ表を 2 つ持たない。**

```text
第 0 段: 出自の判定 (§2)
  absent            → unknown('cwd-absent')
  unknown-location  → unknown('location-unknown')
  undetected-distro → unknown('distro-undetected')
  host / wsl-*      → 第 1 段へ (所在 L_s が確定する)

第 1 段: 所在 L_s に対応する RuntimeDescriptor を引く
  見つからない → unknown('distro-undetected')

第 2 段: 各登録フォルダ f について resolveFolderRuntime({ folder: f, runtime: L_s })
  reachable  かつ 変換後パスあり → 照合候補にする
  blocked                        → 保留候補にする (理由を保持)
  unreachable                    → 候補にしない (その f とは無関係)

第 3 段: 照合候補のうち、変換後パスが cwd の**セグメント境界で前方一致**する最長のもの
  一致あり → folder(f.id, r.boundary, 一致した接頭辞)
  一致なし かつ 保留候補あり → pending(最も強い理由)
  一致なし かつ 保留候補なし → unregistered(cwdKey)
```

### 順序を固定する理由

- **第 0 段を先に置く**のは、出自が確定しない値に対して登録フォルダの走査をしても
  結果が出ないためである。所在不明のセッションに対して「どの登録フォルダとも一致しなかった」と
  報告すると、**未登録と区別がつかなくなる** (FR-028)
- **第 2 段を R-1 に委ねる**のは、越境判定と到達可能性が
  [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) の
  「所在 × ランタイム × マッピング」の表で既に決まっているためである。
  R-2 がここを自前で判定すると、**同じ規則が 2 箇所に分かれて必ず食い違う**
- **第 3 段で保留を未登録より優先する**のは、保留が「今は決められない」であり、
  未登録が「決めた結果として対応がない」であるためである。
  保留を未登録として見せると、利用者は**登録済みのフォルダに対して再登録を促される**

### 不変条件

- 照合は `matchesAtSegmentBoundary()` を使う。**素の前方一致を使わない** —
  `/home/y/project2` が `/home/y/project` に一致する
- ドライブレターの大小と末尾セパレータの有無で結果が変わらない (FR-024 / SC-005)
- worktree の作業ディレクトリ (`<folder>/.claude/worktrees/<name>`) は
  **最長一致で親の登録フォルダに対応づく**。worktree であることは `SessionSource` が持つ
- `resolveFolderRuntime()` の呼び出しは **(登録フォルダ × 所在) でメモ化する**。
  セッション 1 件ごとに呼ぶと 700 件 × 10 フォルダで 7,000 回になる。
  実際に必要な組み合わせは所在の数 (3 程度) × フォルダ数だけである
- **メモ化には無効化キーを持たせる。** 入力は登録フォルダと `RuntimeDescriptor` であり、
  後者は capability 判定の完了で変わる (`pathMapping` が `null` → 実体)。
  `onRuntimesChanged` / `onFoldersChanged` を受けたら**メモ化を破棄して対応づけをやり直す** —
  破棄しないと「対応づけ保留」が永久に解けない
- **`PendingReason` は R-1 の `BlockedReason` と同じ 3 値にする** (`distro-not-running` /
  `capabilities-not-probed` / `probe-failed`)。R-1 が `unreachable` に分類している
  `path-not-mapped` を保留に混ぜない — **混ぜると「解消手順がある」と「対応が無い」が同居する**

---

## 5. `SessionGroup` — 一覧のまとまり

```text
SessionGroup =
  | { kind: 'folder';       folderId: string; boundary: Boundary; sessions: SessionSummary[] }
  | { kind: 'pending';      location: Location; reason: PendingReason; sessions: [...] }
  | { kind: 'unregistered'; cwdKey: string; cwd: RuntimePath | HostPath | null;
                            cwdDisplay: string | null; location: Location | null; sessions: [...] }
  | { kind: 'unknown';      reason: UnknownReason; sessions: [...] }
```

### 不変条件

- **`folder` グループは登録フォルダ一覧から seed する** (FR-051)。セッションを後から流し込み、
  **`sessions` が空でもグループを落とさない**。セッション集合だけから導出すると、
  履歴の無い登録フォルダが画面から消える
- **4 種を 2 種に潰さない** (FR-022 / FR-025 / FR-028)
- `unregistered` は**作業ディレクトリごと**にまとめる。`cwdKey` は (所在, 正規化済みパス) の組
  (R-1 の `folderKey` と同じ作り。重複判定の規則を 2 つ持たない)
- `unregistered` は**登録の導線を持つ** (FR-026)。導線に渡すのは
  R-1 の登録操作が受け取る形 (所在 + パス) であり、**登録そのものは行わない**
- `unregistered` の作業ディレクトリに対して**実在確認をしない** (FR-027)
- `unknown` は理由を保持する。`cwd-absent` / `location-unknown` / `distro-undetected` を
  同じ文言で見せない
- **総数が保たれる**: `Σ 各グループの件数 = 取得したセッションの総数` (SC-006)

---

## 6. `EnumerationOutcome` — 所在ごとの成否

```text
EnumerationOutcome
  location    : Location
  targets     : TargetOutcome[]
  fetchedAt   : number              取得時刻 (FR-034)

TargetOutcome
  target      : EnumerationTarget
  status      : 'ok' | 'no-history' | 'failed'
  reasonKey   : FailureReason | null
  count       : number
  truncated   : boolean             上限で打ち切ったか (FR-038)

FailureReason =
  | 'distro-not-running'      停止中 (FR-007)
  | 'wsl-unavailable'         WSL 未インストール / 列挙不能
  | 'permission-denied'       権限拒否 (実測: /root)
  | 'path-too-long'
  | 'stopped-midway'          列挙中に実体が停止した
  | 'enumeration-failed'      その他
```

### 不変条件

- **停止中の所在も `EnumerationOutcome` として必ず現れる** (`status: 'failed'` /
  `reasonKey: 'distro-not-running'`)。`EnumerationTarget` を作れない所在についても
  **`key` と所在を持つ行を生成する** — 行が無いと (a) 利用者に「未列挙である」ことを示せず、
  (b) 「既知の `key` + 停止中」という SC-002 / SC-010 が検証したい経路が**踏めない**
- **`no-history` と `failed` を混ぜない** (FR-012)。config ディレクトリが無いことは
  失敗ではない。混ぜると、Claude Code を使っていないディストロが毎回エラーとして現れる
- 失敗は**所在ごと・候補ごとに閉じる** (FR-030)。1 件の失敗が他の結果を消さない
- `reasonKey` は**参照キー**であり、訳出は `ui` が行う (FR-031)。
  R-1 の `EnumerationIssue` / `WslAvailability` と同じ扱い
- `fetchedAt` は**必ず提示する** (FR-034 / SC-012)

---

## 7. `SessionIndex` — キャッシュ

```text
SessionIndex
  outcomes  : EnumerationOutcome[]
  groups    : SessionGroup[]
  fetchedAt : number
  complete  : boolean          全件取得が終わっているか (先頭ページ段階では false)
```

### 状態遷移

```text
              ┌──────────┐
              │  empty   │  起動直後
              └────┬─────┘
                   │ 一覧を開く (先頭ページ要求)
                   ▼
        ┌────────────────────┐
        │ partial (complete  │  先頭ページのみ。グループ分けは未確定
        │ = false)           │
        └────┬───────────────┘
             │ 全件要求の完了
             ▼
        ┌──────────┐   利用者の明示操作 (再取得)
        │ complete │ ─────────────────────────┐
        └────┬─────┘                          │
             │                                ▼
             │                        ┌────────────────┐
             └── 所在が一部失敗 ───▶ │ complete かつ   │
                                      │ 失敗つき        │
                                      └────────────────┘
```

- **`partial` の間はグループ件数を確定値として見せない** (FR-037 / R-06)。
  先頭ページには全件のうち新しいものしか含まれず、
  「このフォルダのセッションは 3 件」と見せると誤りになる
- 再取得は**置き換え**であり、マージしない (FR-035)
- **ディスクに書かない** (FR-036 / SC-014)
- **自動で遷移しない。** ポーリングもファイル監視もしない (FR-033 / R-10)
- **`onRuntimesChanged` は再列挙を起こさない**が、**対応づけのメモ化は破棄する** (§4 不変条件)。
  capability 判定の完了で `pathMapping` が現れた所在は、
  **再列挙なしに「保留」から `folder` / `unregistered` へ確定できる**

---

## 8. 整合の要点 — 由来 config の所在と出自の所在は別物

R-1 では「所在」は 1 つの意味しか持たなかった (登録フォルダがどこにあるか)。
R-2 では **2 つの所在**が同時に登場する。

| | 何を指すか | 決まり方 |
| --- | --- | --- |
| `EnumerationTarget.location` | **履歴がどこに保存されているか** | アプリが選ぶ (FR-009) |
| `CwdOrigin` の所在 | **セッションがどこで動いたか** | 記録された値から判定する (FR-016) |

**この 2 つは一致しない。** 実測では、ホスト側の履歴に
`\\wsl.localhost\Ubuntu-26.04\home\<user>\ags\ags-platform` で動いたセッションが 7 件あった。

混同すると次の誤りが出る。

- ホスト側の履歴にある WSL のセッションが、Windows のフォルダとして対応づけられる
  (`/home/...` を `C:\home\...` と解釈する形)
- WSL 側の履歴にある `/mnt/c/...` のセッションが、越境として扱われない

用語としても分ける。**「由来 config ディレクトリの所在」と「セッションの所在」を
同じ語で呼ばない** (Principle XIV / FR-048)。

---

## 9. エンティティ関係

```text
RuntimeDescriptor (R-1) ──┐
                          ├──▶ EnumerationTarget ──▶ SessionSummary ──▶ CwdOrigin
VerifiedRunning   (R-1) ──┘          │                     │
                                     ▼                     ▼
                              EnumerationOutcome      FolderMatch ◀── WorkspaceFolder (R-1)
                                     │                     │              +
                                     └────────┬────────────┘        PathMapping (R-1)
                                              ▼
                                        SessionGroup
                                              │
                                              ▼
                                        SessionIndex (キャッシュ)
```

---

## 10. Glossary への反映 (FR-048)

| 用語 | 定義の要点 | Domain |
| --- | --- | --- |
| **列挙対象 (`EnumerationTarget`)** | 所在と config ディレクトリの組。X-3 で Provider 由来が加わる | `session` |
| **作業ディレクトリの出自 (`CwdOrigin`)** | セッションの作業ディレクトリの値から判定した名前空間と所在。**由来 config ディレクトリの所在とは別物** | `session` |
| **セッション要約行 (`SessionSummary`)** | 一覧の 1 行。**transcript の本文を含まない** | `session` |
| **未登録フォルダ** | 登録フォルダに対応しない作業ディレクトリのまとまり。登録の導線を持つ | `session` |
| **対応づけ保留** | 変換材料が無く、登録フォルダとの対応を決められない状態。**未登録と区別する** | `session` |
| **所在不明** | 作業ディレクトリの記録からディストロを特定できない状態。**推測で埋めない** | `session` |

既存の **Session** / **transcript** の項には「一覧は要約とメタデータのみを扱い、
本文の取得は R-3」を追記する。
