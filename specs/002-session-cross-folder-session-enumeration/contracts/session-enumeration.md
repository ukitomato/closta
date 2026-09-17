# Contract: セッション列挙 (`agents` ↔ `domain` ↔ `infra`)

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Research**: [../research.md](../research.md)

## インタフェース (`src/domain/session/interfaces.ts`)

`domain` が宣言し、`infra` (探索) と `app` (プロセス生成) が実装する (AD-023 §3)。
**境界を越えるのは値であって手続きではない。**

```ts
/** 列挙対象の探索。UNC 経路の浅い列挙で完結する (FR-010)。 */
export interface EnumerationTargetFinder {
  /**
   * 所在 windows の既定 1 件。
   * **ホームディレクトリは注入で受け取る** — `src/main/infra/session/` は
   * `os` / `process` / `electron` のいずれも import できない (R-1 の許可行列)。
   * composition root が `app.getPath('home')` を解決して渡す
   * (R-1 が `userData` に対して採ったのと同じ形)。
   * 注入しないと `process.env.USERPROFILE` へ倒れ、**import が無いので lint も
   * 検証スクリプトも素通りしたまま Windows 前提の分岐が `infra/runtime/` の外に生える**。
   * **`wsl:<D>` 側と同じく `.claude` の存在を確認する** (design-gate M-001)。
   * 不在のディレクトリを `CLAUDE_CONFIG_DIR` に指すと、SDK がそれを作った場合に
   * FR-013 / Principle VI に触れる。対象を作らなければその経路が構造的に無くなる。
   */
  hostTarget(hostHome: HostPath): Promise<TargetDiscovery>
  /**
   * 所在 wsl:<D> の候補。**実行中確認済みの値しか受け取らない** (FR-008)。
   * `.claude` が無い候補は返さず、権限拒否は候補ごとの失敗として返す。
   */
  wslTargets(
    descriptor: WslRuntimeDescriptor,
    verified: VerifiedRunning,
    now: number
  ): Promise<TargetDiscovery>
}

/** 1 つの列挙対象に対する 1 回の列挙。実装は短命プロセスを起動する (research R-04)。 */
export interface SessionEnumerator {
  enumerate(request: EnumerationRequest): Promise<EnumerationResult>
}

export interface EnumerationRequest {
  readonly target: EnumerationTarget
  /** 先頭ページのみか全件か (research R-06)。 */
  readonly scope: { readonly kind: 'page'; readonly limit: number; readonly offset: number }
    | { readonly kind: 'all' }
  readonly timeoutMs: number
}

export type EnumerationResult =
  | { readonly ok: true; readonly sessions: readonly SessionSummary[]; readonly truncated: boolean }
  | { readonly ok: false; readonly reasonKey: FailureReason }
```

---

## C-1: 実行単位 — 列挙対象ごとに 1 つの短命プロセス

| 規則 | 理由 |
| --- | --- |
| 列挙対象 1 件につき 1 プロセスを起動し、結果を返して終了する | AD-021 §3 の短命プロセス方式。環境変数の書き換えを不要にする (FR-014) |
| main process では列挙しない | Principle IX / FR-005。1 所在あたり最大 1 秒近くかかる (research R-01) |
| プロセスの実体は `src/agents/` に置く | Agent SDK を呼ぶコードは `agents` (AD-023 §2) |
| `electron` / ネイティブモジュールを import しない | AD-010 / Principle VII / FR-045。**推移的到達も禁止** |
| 起動と結線は `app` が行う | AD-023 §1 |

**プロセスの寿命は「要求 1 回」である。** AD-023 §6 は `agents` を
「セッション開始〜終了」と定めているが、列挙はセッションに紐づかない。
**3 つ目の寿命**を持つことを ADR に記録する ([../research.md](../research.md) R-04)。

**失敗しても他の列挙対象に波及させない** (FR-030)。1 プロセス = 1 対象であるため、
クラッシュとタイムアウトの隔離が構造的に得られる。

### 実行中確認済みの値のゲートは「起動」にも掛かる (FR-008)

所在が `wsl:<D>` の列挙対象について、**`VerifiedRunning` を伴わずに次の 3 つを発行してはならない**。

| 入口 | 発行するもの |
| --- | --- |
| `wslTargets()` | UNC 経路のディレクトリ列挙 (候補探索) |
| **列挙プロセスの起動** | **UNC 経路の config ディレクトリを指す子プロセス** |
| `fetchMoreSessions` 由来の再列挙 | 同上 |

**プロセスの起動自体が UNC アクセスを引き起こす。** ゲートをファイルアクセスにだけ掛けて
起動に掛けないと、停止中の所在に対して UNC を開く子プロセスが飛び、SC-002 が成立しない。
値と対象が同じディストロを指すことを `isSameDistro()` で検証する。

### 単独起動できる形を保つ (Principle VII / AD-010)

Principle VII の Statement は「Electron / ネイティブ非依存」だけでなく
**「単独起動でき、標準入出力経由でプロトコルを話せる形を保つ」**を要求する。

- 列挙プロセスは **stdio でプロトコルを話し、`node <entry>` の形で単独起動できる**こと
- **`process.parentPort` を本体のロジックが直接触らない。** 触る場合は薄い adapter に分離し、
  本体は stdio と同じプロトコルを話す
- **`process.parentPort` は import を伴わないため ESLint にも依存グラフにも現れない。**
  「機械検証が緑だから Principle VII を守っている」とは言えない。
  Electron 抜きの `node` で 1 件の列挙が成立することをテストで確かめる

---

## C-2: 起動引数と環境

| 項目 | 渡し方 | 規則 |
| --- | --- | --- |
| config ディレクトリ | **環境変数 `CLAUDE_CONFIG_DIR`** | SDK がプロセス単位で読む唯一の経路 (research R-01) |
| | | 所在が `wsl:<D>` のときは **UNC 形式**。materialize は下記の実名リスト内に限る (research R-05) |
| 列挙対象の `key` | 起動引数 | 応答が正しい子から来たことの突き合わせに使う。**不透明であり経路を復元できない** |
| `scope` / `limit` / `offset` | 起動引数 | research R-06 |

### UNC 形式の扱い (research R-05 の 4 規則)

1. **UNC 値を文字列として materialize してよいモジュールを実名で列挙する** —
   現在は `src/main/infra/fs/wsl-fs.ts` と、本 feature が追加する
   `src/main/infra/session/config-dir.ts` の 2 件。
   **branding (組み立て) は `src/domain/runtime/` のパス API に限る。**
   「1 箇所に限る」と書くと HEAD の実体 (`wsl-fs.ts` が既に 1 件目) と食い違うため、
   `services-not-to-io` と同じ**実名リスト方式**を採る
2. 列挙プロセスは受け取った値を**そのまま SDK に渡すだけ**とする。結合・分解・正規化をしない
3. 列挙プロセスは**パス値に一切触らない**。作業ディレクトリは生の文字列のまま返し、
   判定と変換は `domain` が行う (AD-028 §3 の訂正)
4. UNC 形式を IPC 境界と永続化境界に出さない (FR-042)

**規則 2 を破ると AD-025 の「UNC は `infra` の内側」が実質的に崩れる。**
`agents` で UNC を組み立ててよいことにすると、UNC の正規化規則が 2 箇所に分かれる。

### 環境変数の最小化 (FR-050 / SC-016)

**親プロセスの環境をそのまま継承させない。** `utilityProcess.fork` は `env` を省略すると
`process.env` を継承するため、**明示的に許可リストだけを渡す**。

| 変数 | 用途 |
| --- | --- |
| `CLAUDE_CONFIG_DIR` | 列挙対象の指定 (唯一の必須) |
| Windows で Node の起動に要する最小集合 (`SystemRoot` / `TEMP` 等) | 子プロセスの実行 |

**許可リストの追加には ADR を要する。** `scripts/constitution/allowlists.mjs` に定数として置き、
黙って広げられない形にする。Provider の資格情報 (X-3 で入る) が流れ込む経路を最初から作らない
(Principle V)。

**`env` を組み立てる部分を純粋関数として分離する** — プロセスを実際に起こさずに
キー集合を assert できる形にする (SC-016)。

---

## C-3: 返す値

- **データのみ** (FR-041)。SDK のオブジェクト・コールバック・`AbortSignal` を返さない
- 作業ディレクトリは **`CwdOrigin` の判定前の生値 + 由来所在** を返し、
  判定は `domain` の純粋関数で行う ([../data-model.md](../data-model.md) §2)。
  **判定をプロセス側に置かない** — 1 箇所に集約する。
  判定関数は UNC の解析にパス API を使うため、**`ui` からは推移的到達禁止で届かない** —
  `ui` が判定関数経由で名前空間つきパス値を合成する経路は構造的に存在しない
- **transcript の本文を含めない** (FR-044 / SC-011)
- 件数上限に達したら `truncated: true` を返す。**黙って切らない** (FR-038)

---

## C-4: 呼んではならない SDK API (FR-003 / FR-013 / FR-044 / SC-004 / SC-011)

**許可されるのは `listSessions()` のみである。** 以下は禁止側の内訳であり、
**判定は「許可 1 件以外を禁じる」形で機械検証する** (禁止側の列挙は漏れる)。

### 表 1: 副作用を伴う API (状態変更)

| API | 理由 |
| --- | --- |
| `query()` | セッションを起動する (X-1) |
| `renameSession()` / `tagSession()` | config ディレクトリへ書き込む |
| `deleteSession()` | 正本を削除する |
| `importSessionToStore()` | store へ取り込む (I-1) |
| `forkSession()` | 分岐を作る (X-1 以降) |
| `startup()` | セッションを開始する |

### 表 2: R-2 で呼んではならない読み取り API

| API | 理由 |
| --- | --- |
| `getSessionMessages()` / `getSubagentMessages()` | **transcript の本文を読む** (R-3)。FR-044 の実効性はここで決まる |
| `listSubagents()` | subagent の走査 (R-4 以降) |
| `getSessionInfo()` | 単一セッションのメタデータ取得 (R-3 の入口) |
| `resolveSettings()` | Claude Code の設定を読む。**資格情報解決の設定を含む** (Principle V) |
| `createSdkMcpServer()` / `tool()` | MCP サーバの実体を作る |
| `InMemorySessionStore` | store 経由の列挙は I-1 (`@alpha`) |

**表 1 だけを検証すると FR-044 が守られない。** 列挙プロセスが本文を読んで
`summary` に詰め直す実装を、前後のファイル比較 (SC-004) は**読み取りなので検出できない**。

**行ってはならない操作**:

- config ディレクトリとその配下の作成・変更・削除
- `process.env` の書き換え (プロセス生成時に与える。FR-014)
- ディストロの起動を伴う操作 (`wsl.exe` の実行を含む。FR-006 / FR-007)
- ディスクへの結果の書き出し (FR-036 / SC-014)

### 検証方針

R-1 の Principle 検証と同じく、**名前の出現ではなく呼び出し形**で判定する
([../research.md](../research.md) R-07)。`import` しただけの名前や型注釈を違反にすると、
これらを正当に使う後続 feature (X-1 / O-1 / I-1) で検証が破綻する。

加えて quickstart で**前後のファイル一覧・サイズ・更新時刻の比較** (実測 8,487 件で差分 0) を行う。

---

## C-5: 失敗・タイムアウト・部分結果

| 事象 | 扱い |
| --- | --- |
| 所在が停止中 | **プロセスを起動しない。** 実行状態を取り直して `distro-not-running` (FR-007 / C-7) |
| `.claude` が無い | `no-history`。**失敗ではない** (FR-012) |
| 候補の権限拒否 | `permission-denied`。**その候補の失敗**であり所在全体を失敗にしない |
| UNC 経路が使えない | `wsl-unavailable`。**`wsl.exe` による代替列挙を用意しない** (AD-025 の決着) |
| 列挙中に実体が停止 | `stopped-midway`。取得済みの部分結果と理由の**双方**を返す (US-3 AC-6) |
| プロセスのクラッシュ | `enumeration-failed`。stderr の扱いは下記 |
| タイムアウト | `enumeration-failed`。`kill()` を呼び、**戻り値と `exit` の到着を待つ** |

**タイムアウトは列挙対象ごとに持つ。** 全体に 1 本だけ持つと、
1 つの遅い所在が他の結果を落とす。

### 終了手段は `utilityProcess` の実 API に合わせる

**`UtilityProcess` にシグナルを選べる API は無い** (引数なしの `kill(): boolean` のみ)。
「SIGTERM → SIGKILL」と書くと `child_process` へ倒れる実装を誘発し、
それは検証項目 7 の許可リスト外の経路になる。

- タイムアウト時は `kill()` を呼び、**戻り値と `exit` イベントの到着を確認する**。
  一定時間内に `exit` が来なければ記録して監視対象から外す
- **アプリ終了時 (`before-quit`) に生存中の列挙プロセスをすべて `kill()` する** —
  UNC ハンドルを掴んだ孤児を残さない

### stderr とログに出してよいもの (Principle V / FR-049)

**開発ビルド判定を注入された 1 つの関数を経由してのみ出力する** (R-1 の `measure` と同じ構造。
`electron` を import しない)。出力してよいのは **`key` (不透明) / `reasonKey` / 経過時間**に限る。

**config ディレクトリのパス・作業ディレクトリ・`summary` / `firstPrompt` を出力しない。**
SDK の例外メッセージは UNC の完全パス (= ディストロ名 + Linux ユーザ名) を含みうるため、
**例外をそのまま流さず `reasonKey` に落としてから出す**。

---

## C-6: 同時実行と束ね

- 同じ列挙対象に対する要求が実行中のあいだ、**追加要求は新しいプロセスを起動せず既存結果に合流させる**
  (R-1 の `refreshRuntimes` / `beginBrowse` と同じ規則)
- **境界で強制する。** renderer は未信頼であり (AD-023)、
  「利用者の明示操作である」ことを呼び出し側の申告で信じられない
- 異なる列挙対象は**並行して実行してよい**。プロセスが分かれているためレースが起きない
  (AD-021 §3 が却下した環境変数の書き換えとは構造が違う)
- 同時プロセス数に上限を設ける。所在が多いホストで数十プロセスを同時に起こさない
- **逐次の連打にも上限を掛ける。** 束ねは並行要求にしか効かない。
  同一列挙対象への連続要求に**最小間隔 (クールダウン)** を設け、
  1 回の `fetchMoreSessions` が起こすプロセスを **1 対象分**に限る。
  renderer は未信頼であり (AD-023)、UI のバグでも侵害でも
  「UNC I/O を伴う子プロセスを無制限に起こす」経路を残さない

---

## C-7: `wsl.exe` の呼び出し回数 (FR-006 / SC-003)

| 経路 | 呼び出し |
| --- | --- |
| 列挙対象の探索 | **0 回** (UNC の浅い列挙。実測 69 ms) |
| セッションの列挙 | **0 回** (UNC 経路の config ディレクトリを SDK に渡す) |
| 実行状態の確認 | **R-1 の経路を使う。** R-2 は新たに呼ばない |

R-1 の `verifyRunning()` が返す値を受け取るだけであり、R-2 自身はプロセスを起動しない。
**この 1 行が SC-003 の「0 件」を成り立たせている。**

---

## C-8: 拡張点 (後続 feature への申し送り)

| feature | 拡張 |
| --- | --- |
| R-3 | `getSessionMessages()` による本文取得。**同じ列挙プロセス方式に載る** (config ディレクトリの指定が同じ問題を持つ)。**選択されたセッションの `targetKey` から列挙対象を引ける**ようにしてあるため、DTO の変更を伴わない |
| X-3 | `EnumerationTarget.origin` に `'provider'` が加わる。**集合の差し替えだけで済む形にしておく** (FR-015) |
| I-1 | `sessionStore` を渡した列挙経路。`@alpha` であるため SDK バージョンを固定してから (AD-021 §4)。**他ユーザ由来のセッションはミラー対象外とする** — R-2 は 1 ディストロ内の全ユーザを列挙対象にするが (FR-011 / `[USER]` 確定)、FR-036 によりディスクには残らない。ミラーが入ると他人の会話がホスト側 DB に書かれるため、ここで線を引く |
| O-1 | 実行中セッションの状態。**本 contract は過去セッションの静的な列挙に限る** |

---

## テスト戦略

| 対象 | 方法 |
| --- | --- |
| `CwdOrigin` の判定 | `domain` の純粋関数。**表の 7 行すべて**を網羅 (SC-005) |
| `FolderMatch` の判定 | `domain` の純粋関数。R-1 の `resolveFolderRuntime` を fake で与え、判定順序 4 段の全セルを網羅 |
| グループ分けと総数保存 | `Σ グループ件数 = 総数` を property として確認 (SC-006) |
| 列挙対象の探索 | `WslFileSystem` を差し替え、候補なし / `.claude` なし / 権限拒否 / 複数ユーザ を網羅 |
| 失敗の封じ込め | `SessionEnumerator` を差し替え、1 対象だけ失敗させて他が残ることを確認 (SC-007) |
| 副作用の禁止 | 呼び出し形の走査 (検証スクリプト) + quickstart の前後比較 (SC-004) |
| `wsl.exe` 0 件 | プロセス起動レイヤを差し替えた Vitest (SC-003) |
| 実データでの網羅 | quickstart。SDK 直接呼び出しの結果と識別子集合を突き合わせる (SC-001) |

**`SessionEnumerator` はインタフェースにする。** 実プロセスを起こさずに
グループ分けとエラー経路を検証するため (AD-023 §4 の「テストで差し替えたい」に該当)。
