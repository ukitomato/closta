# Contract: セッション一覧の IPC (単一 capability への追加)

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **R-1 の contract**: [../../001-runtime-folder-registration-runtime-detection/contracts/ipc-capability.md](../../001-runtime-folder-registration-runtime-detection/contracts/ipc-capability.md)

R-1 が固定した規則をそのまま引き継ぐ。**新しい経路を作らず、既存の単一 capability に追加する**
(FR-043)。R-1 の contract に書かれた原則 (送信元検証・データのみのプロトコル・
参照キー方式・パスの名前空間の規則) は再掲しない。

---

## 追加するメソッド

| メソッド | 出力 | 対応 FR |
| --- | --- | --- |
| `listSessions()` | `SessionIndexDTO` | FR-004 / FR-033 / FR-037 |
| `refreshSessions()` | `SessionIndexDTO` | FR-033 / FR-035 |
| `fetchMoreSessions(targetKey, offset)` | `SessionIndexDTO` | FR-038 |

### `listSessions()` は**キャッシュを返す**

R-1 の `listRuntimes()` と同じ形にする。

- キャッシュが空なら取得を開始し、**先頭ページを待って返す** (`complete: false`)
- 全件が揃った時点で `onSessionsChanged` で通知する (research R-06)
- キャッシュがあれば**即座に返す** (SC-008 の 100 ミリ秒)
- **自動で再取得しない** (FR-033)。ポーリングもファイル監視もしない

### `refreshSessions()` は利用者の明示操作

- 実行状態を R-1 の経路で取り直してから列挙対象を決める (FR-007 / FR-008)
- 結果は**キャッシュを置き換える** (FR-035)。マージしない
- 同時実行は 1 本に束ねる ([session-enumeration.md](session-enumeration.md) C-6)

### `fetchMoreSessions()` の戻り値は 3 分岐する

| `targetKey` | 応答 |
| --- | --- |
| **未知** | 現在のキャッシュをそのまま返す (新しい情報を与えない) |
| **既知だが所在が停止中** | 実行状態を取り直したうえで、当該 `EnumerationOutcome` を `distro-not-running` に更新したキャッシュを返す。**UNC アクセスもプロセス起動も 0 件** |
| **既知かつ実行中** | 追加取得を行う (`truncated: true` の対象に限る) |

**停止中の分岐を明示するのは、SC-002 / SC-010 が検証したい経路がここだからである。**
停止中の所在も `EnumerationOutcome` として `key` を持つ行になる
([../data-model.md](../data-model.md) §6) ため、「既知の `key` + 停止中」を
main 側ハンドラの直接呼び出しで踏める。

### 並べ替えと絞り込みは renderer で行う

`SessionIndexDTO` は**最終更新の新しい順**で返す (FR-039)。
所在とフォルダによる絞り込み (FR-040) は renderer 側で行う —
絞り込みのたびに IPC を往復させると SC-008 の再表示予算を壊し、
main 側に表示状態を持たせることになる。

---

## 通知 (main → renderer)

| イベント | 用途 |
| --- | --- |
| `onSessionsChanged` | 全件取得の完了、所在ごとの失敗の確定、`refreshSessions` の結果の反映 |

購読解除は preload が返す**トークン**で行う。renderer からコールバック関数を渡さない
(R-1 と同じ)。

`onFoldersChanged` (R-1) を受けたときは、**再列挙せずに対応づけだけをやり直す** —
登録フォルダが増減しても正本 (config ディレクトリ) は変わらないため、
セッションの取得をやり直す理由がない (FR-033)。
対応づけは `domain` の純粋関数であり、キャッシュ済みの `SessionSummary` に対して再適用できる。

---

## DTO

**`src/domain/session/dto.ts` に置く。** preload と renderer の双方が `domain` から import する
(R-1 と同じ。preload に置くと `ui → app` になる)。

```text
SessionIndexDTO = {
  groups:    SessionGroupDTO[]
  outcomes:  EnumerationOutcomeDTO[]
  fetchedAt: number
  complete:  boolean
}

SessionGroupDTO =
  | { kind: 'folder';       folderId: string; boundary: Boundary; sessions: SessionSummaryDTO[] }
  | { kind: 'pending';      location: LocationDTO; reasonKey: PendingReason; sessions: [...] }
  | { kind: 'unregistered'; cwdKey: string; cwd: PathDTO | null; cwdDisplay: string | null;
                            location: LocationDTO | null; sessions: [...] }
  | { kind: 'unknown';      reasonKey: UnknownReason; sessions: [...] }

SessionSummaryDTO = {
  sessionId: string; targetKey: string          // 由来列挙対象への不透明な参照 (R-3 が使う)
  summary: string; firstPrompt: string | null; customTitle: string | null
  lastModified: number | null; createdAt: number | null; fileSize: number | null
  gitBranch: string | null; tag: string | null
  cwd: PathDTO | null; cwdDisplay: string | null; originKind: CwdOriginKind
  programmatic: boolean; worktree: boolean; targetLabel: string
  normalized: { truncated: boolean; controlCharsRemoved: boolean }   // FR-049
}

EnumerationOutcomeDTO = {
  location: LocationDTO; targetKey: string; targetLabel: string
  status: 'ok' | 'no-history' | 'failed'; reasonKey: FailureReason | null
  count: number; truncated: boolean; fetchedAt: number
}

CwdOriginKind  = host | wsl-from-unc | wsl-inherited | unknown-location
               | undetected-distro | absent
PendingReason  = distro-not-running | capabilities-not-probed | probe-failed
                 // R-1 の BlockedReason と同じ 3 値。`path-not-mapped` は含めない —
                 // 判定第 2 段で「そのフォルダとは無関係」に落ちるため保留に到達しない
UnknownReason  = cwd-absent | location-unknown | distro-undetected
FailureReason  = distro-not-running | wsl-unavailable | permission-denied
               | path-too-long | stopped-midway | enumeration-failed
```

`Boundary` / `LocationDTO` / `PathDTO` は R-1 の DTO をそのまま使う。

### `cwd` と `cwdDisplay` を分ける理由

| 項目 | 何を持つか | 使い道 |
| --- | --- | --- |
| `cwd` | **所在の名前空間に変換済みのパス** (`PathDTO`)。所在が決まらない場合は `null` | 対応づけ済みの表示、登録導線への受け渡し |
| `cwdDisplay` | **表示専用の安全な文字列**。所在が決まらない値のために持つ | `unknown-location` / `undetected-distro` の**表示** |

**所在が決まらない値に `PathDTO` を作らない。** `namespace` を埋められないためであり、
埋めると「所在を推測しない」(FR-018) を DTO の形で破ることになる。

**`cwdDisplay` に UNC 形式の生値を入れてはならない** (FR-042)。
「表示専用だから」という理由で UNC を境界に出すと、AD-025 の
「UNC は `infra` の内側」が**文面上だけの規則になる**。次の形で渡す。

| 出自 | `cwd` | `cwdDisplay` |
| --- | --- | --- |
| `host` / `wsl-from-unc` / `wsl-inherited` | 変換済み `PathDTO` | `null` (`cwd` で足りる) |
| `undetected-distro` | `null` | **ディストロ名 + 変換後の POSIX パス**。UNC 接頭辞は載せない |
| `unknown-location` | `null` | 記録されていた POSIX パス (所在を伴わない) |
| `absent` | `null` | `null` |

`undetected-distro` の分解 (ディストロ名と配下パス) は `infra` のパス API が行い、
**renderer は再合成しない**。これにより、`ui` が `cwdDisplay` から名前空間つきの値を
作り直す経路が残らない。

**この表は `SessionSummaryDTO` と `SessionGroupDTO` の `unregistered` variant の
両方に掛かる。** `unregistered` は定義上「対応づかなかった作業ディレクトリ」であり、
`undetected-distro` / `unknown-location` が**最も集まる場所** = 生 UNC が最も出やすい経路である。
**片方だけを `cwdDisplay` にすると、塞いだ穴の隣に同じ穴が開いたままになる。**
表示用の生値を運ぶフィールドは DTO 全体で `cwdDisplay` の 1 種類に統一し、
`rawCwd` という名前は使わない。

### 正規化の結果を DTO で示す (FR-049)

`summary` / `firstPrompt` / `customTitle` / `gitBranch` / `tag` / `cwdDisplay` は
**config ディレクトリ由来の未信頼入力**であり、main 側でバイト長上限の切り詰めと
制御文字の除去を通す。`normalized` はそれが起きたことを示す
(**利用者に「元の値はもっと長い」ことを伝えるため**。R-1 の `too-many-entries` と同型)。

### renderer に渡さない値

| 項目 | 理由 |
| --- | --- |
| transcript の本文 / 会話内容 | FR-044 / SC-011 |
| `PathMapping` の中身 | 変換は main 側の `domain` 純粋関数で行う (R-1 と同じ) |
| config ディレクトリの実体パス | 一覧の表示に不要。**不透明な `targetKey`** と `targetLabel` (どの候補由来か) だけを渡す |
| SDK のオブジェクト / `AbortSignal` | FR-041 |

**`targetLabel` は表示用の短い識別 (ユーザ名など) とする。** UNC 形式や
ホームディレクトリの完全パスを渡すと、FR-042 と「不要な情報を境界に出さない」の
両方に触れる。

---

## 未信頼入力の検証 (main 側)

R-1 の検証表に**行を追加する**。既存の行 (送信元 / `distroName` / パス値の共通制約) は
そのまま適用される。

**表を 3 節に分ける。** 節ごとに計測経路が違うためであり、
混ぜると「不正入力を渡して拒否を確認する」テストが書けない行が表に紛れ込む。

### 節 A: renderer 発の入力 (不正入力を渡して拒否を確認できる)

| 入力 | 検証 |
| --- | --- |
| **送信元 (追加メソッド共通)** | R-1 と同じ。登録済みカスタムプロトコル origin の main frame であること |
| `targetKey` (`fetchMoreSessions`) | **既知の列挙対象のキーに完全一致**すること。文字列を config ディレクトリのパスとして解釈しない |
| `offset` (`fetchMoreSessions`) | 非負の安全な整数であり**実名で定めた上限内**であること。SDK に渡す前に検査する |
| **所在 (既知 `targetKey` の実行状態)** | 検出済み descriptor に完全一致し、実行状態を取り直して `running` であること。停止中は `distro-not-running` を返し、**UNC アクセスもプロセス起動も行わない** (FR-007 / FR-008 / SC-002) |
| **実行中確認済みの値** | UNC 列挙**と列挙プロセスの起動**の前に、値が保持するディストロ識別子と操作対象の識別子が一致すること (**別ディストロへの流用**も止める) |

**SC-010 が対象にするのはこの節の各行である。** 行を 3 つだけ列挙する形にしない。

### 節 B: 経路の不在で満たすもの (不正入力が存在しないため別の測り方をする)

| 項目 | どう満たすか | 計測経路 |
| --- | --- | --- |
| **`CLAUDE_CONFIG_DIR` に渡す値** | renderer から config ディレクトリを指定できる API を**作らない**。列挙プロセスの起動関数は `EnumerationTarget` 型のみを受け取る | `CLAUDE_CONFIG_DIR` の文字列リテラルが現れてよいモジュールを**許可リスト 1 件**に絞る検証項目 |
| **セッション識別子** | 本 feature では**受け取らない** | 新設 IPC の引数に識別子が無いことを DTO / 契約で固定 |
| **`refreshSessions` の連打** | 同時実行の束ね + クールダウン | 起動回数のユニットテスト (C-6) |

**「経路の不在」は本 feature で最も重要な性質である** — 指定できるようにすると
`listSessions` が**任意パスのファイル一覧を返す道具**に変わる。
**「検証できないから測らない」ではなく、別の計測経路を必ず割り当てる。**

### 節 C: config ディレクトリ由来の入力 (アプリ外のプロセスが書いた値)

**これも未信頼入力である。** R-1 が renderer 発の値に掛けている拘束を、
**方向が逆になったからといって外さない**。

| 項目 | 正規化 |
| --- | --- |
| `summary` / `firstPrompt` / `customTitle` / `gitBranch` / `tag` / `cwdDisplay` | バイト長上限で切り詰め、C0 / C1 / 双方向制御文字を除去。結果を `normalized` で示す (FR-049) |
| `lastModified` / `createdAt` / `fileSize` | 有限の安全整数であること。満たさなければ `null` (「不明」)。**行は落とさない** |
| 作業ディレクトリから抽出したディストロ名 | **抽出直後に `isValidDistroName()` を通す**。`undetected-distro` の表示にも使われるため、検証済みの値だけを持たせる |

**双方向制御文字を落とすのは表示上の偽装を防ぐためである。** `cwdDisplay` に U+202E を
仕込むと、「未登録フォルダ」の行が登録済みフォルダのパスに見える形に偽装でき、
FR-026 の登録導線で**利用者に誤った判断をさせられる** (登録される値自体は
`PathDTO` なので任意パスにはならないが、判断は誤らせられる)。
