# Phase 1 Data Model: フォルダ登録とランタイム検出 (R-1)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

すべての型は **`src/domain/`** に置く。`domain` は I/O を持たず、
`infra` / `ui` / `app` から参照される (AD-023 §3)。

本ファイルは**エンティティ・フィールド・不変条件**を定める。
型の実装手段 (brand の実現方法、標準ライブラリの選択など) は実装で決める。

---

## 1. パスの名前空間

扱う名前空間は **3 つ**である。1 つの型に 2 つを同居させない。

| 名前空間 | 型 | 識別子の粒度 | 形式 | 例 |
|---|---|---|---|---|
| ホスト (Windows ドライブ) | `HostPath` | `host` (唯一) | ドライブレター形式 | `C:\dev\closta` |
| ランタイム内部 | `RuntimePath` | `wsl:<distro>` (**ディストロごと**) | POSIX | `wsl:Ubuntu-26.04` の `/mnt/c/dev/closta` |
| WSL への UNC 経路 | `WslUncPath` | `unc:<distro>` (**ディストロごと**) | `\\wsl.localhost\<distro>\...` | — |

```
NamespaceId = 'host' | `unc:${string}` | `wsl:${string}`   // I-1 で container:*、OPT-mac で direct:* が増える
```

**ランタイムの名前空間識別子は `RuntimeDescriptor.id` である** (§4)。
`Win32Runtime` の識別子は `host` であり、**そのランタイムから見たパスは `HostPath` そのもの**である。
`RuntimePath` はホスト以外のランタイム名前空間を表す型であり、`Win32Runtime` はこれを持たない。

### 不変条件

- 3 つの型は相互に代入できない (FR-021)
- **`RuntimePath` と `WslUncPath` は名前空間識別子を実行時に保持する。** 型による静的な弁別には
  頼らない — 識別子はディストロ検出の結果として実行時に決まる値であり、静的な型として扱えないため
- **`WslUncPath` の識別子は、値に埋め込まれたディストロ名と一致していなければならない。**
  `\\wsl.localhost\<distro>\` の `<distro>` と識別子の `<distro>` は同一である
- 生の値から直接キャストしない。生成関数を通し形式検証を経る。
  `RuntimePath` / `WslUncPath` の生成には**名前空間識別子を必須引数として要求する**
- `HostPath` はドライブレターを大文字に正規化し、末尾セパレータを除去する
- `RuntimePath` は末尾セパレータを除去し、`.` / `..` を解決済みとする
- **同一名前空間の保証は型では行わない。** パス変換 API が入口で検証する (§7)
- **どの型の値も、NUL と制御文字を含まない。** `RuntimePath` の値は
  **パスセパレータとして `/` のみを使い、バックスラッシュを成分に含まない**。
  POSIX 意味論ではバックスラッシュは通常の文字であり `.` / `..` の解決規則が発火しないため、
  含んだまま UNC 形式へ変換すると**値が字面で示す位置とは別の位置に解決される**
- **UNC 形式への変換は、合成後に再正規化し、結果が対象ディストロの share 配下に
  収まることを検証する。** 収まらなければ変換不能を返す

> **UNC 名前空間をディストロごとに分ける**のは、`\\wsl.localhost\<distro>\` が
> ディストロごとに別のファイルシステムを指すためである。単一の `unc` にすると
> §7 の識別子一致検証が UNC の脚で常に真になり、別ディストロのパスを取り違える経路が
> 型でも検証でも塞がらない (FR-021 / US-3 AC-15)。
> AD-004 の 2 brand モデルはこの 3 名前空間モデルの特殊例として読み替える (AD-025 に記録)。

---

## 2. `PathMapping`

**2 つの名前空間のあいだの対応**。

| フィールド | 説明 |
|---|---|
| `from` / `to` | 変換元・変換先の名前空間識別子 |
| `entries` | 接頭辞のペアの配列 (例: `C:\` ↔ `/mnt/c`) |
| `acquiredAt` | 取得時刻 |

### 不変条件

- **取得元はマウントオプションが示すドライブ対応**である (AD-015 §6)。
  特定のマウント位置を決め打ちせず、ファイルシステム種別でフィルタもしない (FR-024)
- 照合は**パスセグメント境界**で行う。文字列の前方一致では
  `/mnt/cdrom` が `/mnt/c` に一致し、マウント位置が `/c` になる構成では
  `/certs` や `/dev` まで誤変換の対象になる
- 複数の entry が一致した場合は**最長の接頭辞**を採る
- `entries` に現れない接頭辞は**変換不能**。推測で対応を作らない
- **`from === to` の変換は恒等**であり `entries` を参照しない。`Win32Runtime` の `host` → `host` が
  これにあたる。**`Win32Runtime` は `PathMapping` を持たない** — 空の `entries` を持つ mapping を
  与えると、上の規則によりすべての Windows パスが変換不能になる
- **probe が完了するまで未取得**である (§4 の状態遷移)。停止中ディストロはもとより、
  実行中でも判定前・判定中・判定失敗のあいだは取得されていない。この状態を型で表現する
- **`entries` の各要素は、ホスト側がドライブレター形式、ランタイム側が `/` 始まりの絶対 POSIX
  接頭辞であり、NUL・制御文字・バックスラッシュを含まない。** 満たさない要素があれば
  **マッピングの取得失敗として `probeState: failed` に倒す** — 部分的に欠けた状態にしない。
  `entries` が空の場合も未取得として扱う
- `compose(a, b)` は `a.to === b.from` のときのみ成立し、同じ照合規則に従う (FR-026)

ドライブレターを鍵に固定しないのは、I-1 の 2 ホップ目 (WSL → コンテナ) が
**両端にドライブを持たない**ためである (AD-012)。

---

## 3. `Capabilities`

ランタイムが提供する能力。**表明するもの**である。

| フィールド | 値域 | 説明 |
|---|---|---|
| `probeState` | `idle` / `probing` / `done` / `failed` | 判定の進行状態 |
| `sandbox` | `none` / `bubblewrap` / `unknown` | 隔離機構の種別。`container` は I-1 で追加 |
| `autoModeSafe` | `true` / `false` / `unknown` | 無人実行を許してよいか |
| `seccompFilter` | `present` / `absent` / `unknown` | **R-1 では常に `unknown`** (FR-006) |
| `missingDependencies` | `{ name, docAnchor }[]` | 不足している必須依存と、導入手順文書のアンカー。**コマンド文字列を持たない** (FR-009) |
| `probedAt` | timestamp / `null` | **capabilities を確定させた時刻**。実地判定を行わないランタイム (`Win32Runtime` / 実行中 WSL1) も確定時にこれを設定する |

`name` と `docAnchor` はいずれも**閉じた値の集合**とし、互いに 1 対 1 で対応する。
`docAnchor` は `docs/runtime/wsl-sandbox-dependencies.md` (FR-048) のアンカーを指す。
スクリプト出力が未知の名前を返した場合は**判定失敗として扱う** — ランタイム内部の
出力由来の文字列を UI へ直達させない。

### 判定規則 (AD-015 §8)

| ランタイム | `probeState` | `sandbox` | `autoModeSafe` |
|---|---|---|---|
| `Win32Runtime` | `done` | `none` (固定) | `false` (固定) |
| `WslRuntime` (WSL1、実行中) | `done` | `none` (実地テストなし) | `false` |
| `WslRuntime` (WSL1、停止中) | `idle` | `unknown` | `unknown` |
| `WslRuntime` (**バージョン不明**) | `failed` | `unknown` | `unknown` |
| `WslRuntime` (WSL2、停止中) | `idle` | `unknown` | `unknown` |
| `WslRuntime` (WSL2、実行中、未判定) | `idle` / `probing` | `unknown` | `unknown` |
| `WslRuntime` (WSL2、実行中、判定完了) | `done` | 実地判定の結果 | 下記 |
| `WslRuntime` (判定失敗・出力不完全) | `failed` | `unknown` | `unknown` |

**WSL2 実行中の実地判定** (すべて満たしたときのみ `sandbox: bubblewrap`):

1. `bwrap` が存在する — **解決パスが当該ディストロの Windows マウント配下でないこと**
2. `socat` が存在する — 同上
3. 非特権 user namespace の作成が制限されていない
4. 実際に user namespace を作成できる

**実行中の WSL1 でも `pathMapping` は取得する。** FR-004 が実地テストを免除するのは
sandbox 判定の 4 項目であって、パス変換のマッピングではない。マッピングが無いと
所在 `windows` のフォルダを一切解決できない (§8 第 2 段)。WSL1 に対する 1 回の呼び出しは
マッピングの取得だけを行い、capabilities は固定値を採る。

**判定 1 / 2 の除外条件は当該ディストロのマウントマッピングを基準に判定する** (FR-005)。
WSL は既定で Windows の PATH を Linux 側に追加するため `command -v socat` が
Windows 側の実行ファイルを返しうるが、**マウント位置は設定で変更できるため
特定のパスを条件に書いてはならない**。マッピングは同じ判定呼び出しで取得済みであり、
追加の I/O は生じない。**このため判定はマッピングを確定させてから行う** (順序制約)。

seccomp フィルタは任意であり `sandbox` の可否に影響させない (FR-006)。

### `autoModeSafe` の導出

**安全とみなす sandbox 種別の allowlist** に含まれ、**かつ判定が完了している**ときのみ `true`。
判定が完了していない・判定時刻が無い・種別が不明のいずれでも `unknown` を返す。
`false` は「判定したうえで安全でない」ことの表明であり、未判定と区別する (FR-003)。

```
判定済み = probeState === 'done' && probedAt !== null && sandbox !== 'unknown'

autoModeSafe = !判定済み                             ? 'unknown'
             : SAFE_SANDBOX_KINDS.includes(sandbox)  ? true
             :                                         false
```

**denylist (`sandbox !== 'none'`) で書いてはならない。** `unknown` に対して真になり、
判定に失敗したランタイムが「安全」と表明される。また値を追加するたびに判定が自動的に広がる。

**不変条件**:

- `probeState !== 'done'` / `sandbox === 'unknown'` / `probedAt === null` の
  いずれかなら `autoModeSafe` は必ず `unknown`
- 再判定を開始するときは `capabilities` を初期状態に戻してから `probing` に遷移する。
  **旧値を据え置かない**

**`probedAt` の鮮度は R-1 では扱わない。** キャッシュはアプリプロセスの寿命のあいだ有効であり
(spec `## Assumptions`)、アプリ外での依存の削除や設定変更は明示再検出まで反映されない。
`capabilities` をゲートの入力にするのは I-3 であり、**再判定の要否は I-3 が決める**
(spec `## Out of Scope`)。R-1 は無人実行のゲートを持たないため、
この未決が本 feature の振る舞いに影響する経路はない。

`SAFE_SANDBOX_KINDS` に I-1 で `container` を追加する際は、
**endpoint の到達性が検証済みであること**を追加条件として要求する。
種別の追記だけで安全判定を広げてはならない。この定義はいずれ `isolation` domain に移る (AD-025)。

### 安全側の解釈 (FR-008)

解釈は `domain` の純粋関数 **`isAutoModeAllowed(capabilities)`** に閉じ込める。
`probeState` / `autoModeSafe` / `sandbox` / `probedAt` を見る**唯一の判定点**である。

**生の値も再導出の素材も IPC 境界の外に出さない。** `unknown` は JavaScript で truthy であり、
`sandbox` を渡せば denylist 再導出が書けてしまう。DTO には判定結果と表示用ラベルだけを載せる
([contracts/ipc-capability.md](contracts/ipc-capability.md))。

---

## 4. `RuntimeDescriptor`

検出結果から生成されるランタイムの**値**。シングルトンではない (AD-003)。
**I/O も関数も持たないデータ**であり、そのまま IPC に載せられる。

| フィールド | 説明 |
|---|---|
| `id` | 名前空間識別子。`host` または `wsl:<distroName>`。I-1 で `container:<id>` が加わる |
| `kind` | `win32` / `wsl`。I-1 で `docker`、OPT-mac で `direct` が加わる |
| `distroName` | `kind === 'wsl'` のときのみ。空白を含みうるが、**バックスラッシュ・`/`・`:`・NUL・制御文字を含まず、先頭が `-` でないこと**。満たさない名前は descriptor を生成せず、**列挙不能として理由つきで一覧に出す** |
| `wslVersion` | `1` / `2` / `null`。`null` は**バージョン列挙から読めなかった**ことを表す |
| `state` | `running` / `stopped`。**キャッシュ値** (§5) |
| `isDefault` | 既定ディストロか |
| `capabilities` | §3 |
| `pathMapping` | §2。**probe 完了まで未取得**。`kind === 'win32'` は恒等のため持たない |
| `detectedAt` | 検出時刻。**表示用であり自動再検出のトリガーには使わない** (FR-010) |

`distroName` に文字種の制約を課すのは、この値が (a) プロセス起動の引数、
(b) UNC パスの成分、(c) 名前空間識別子の 3 箇所へ同時に流れ込むためである。
「検出済みの名前に一致すること」は**検出自身が出力元である以上恒真**であり、
文字種の制約を何も課さない。先頭の `-` を禁じるのはオプションとして解釈される経路を塞ぐため、
バックスラッシュを禁じるのは `wsl.exe` の引数処理がこれを消し (AD-015 §5)
別の実在ディストロ名に一致しうるためである。

**キャッシュキーには `id` を使う** (FR-011)。endpoint を持つランタイムでは
`id` に endpoint も含める (AD-015 Consequences。R-1 には該当がない)。

ディストロの改名は**別の descriptor** として現れる。既存の登録フォルダは
**到達不可** (`distro-absent`) になる — 停止とは異なり、起動しても解消しない。

### 状態遷移

```
(未検出)
   │ 起動時の走査 / ユーザの明示再検出
   ▼
stopped / probeState=idle / capabilities 未判定 / mapping 未取得
   │ 利用者がアプリ外で起動 → 再検出
   ▼
running / probeState=idle
   │ 判定バッチ開始 (capabilities を初期状態に戻してから)
   ▼
probing
   │ 判定が完全な出力とともに完了
   ▼
done / capabilities 確定 / mapping 取得済み
   │ 判定中の停止・出力が不完全・非 0 終了・**呼び出しが期限内に完了しない**
   ▼
failed / capabilities 未判定
```

上の経路は **WSL2 の実地判定**のもの。次の 2 つは `probing` を経ずに `done` に入る。

| ランタイム | `done` に入る経路 |
|---|---|
| `Win32Runtime` | 検出と同時。capabilities は固定値、`pathMapping` は不要 (恒等)。**このとき `probedAt` を設定する** |
| `WslRuntime` (WSL1、実行中) | マッピング取得の 1 回の呼び出し後。capabilities は固定値 (FR-004)。**このとき `probedAt` を設定する** |

**固定値経路で `probedAt` を設定しないと、§3 の表の `autoModeSafe: false` 行は導出式から到達できない。**
導出式は `probedAt !== null` を「判定済み」の条件に含むため、設定しない限り `unknown` が返り、
AD-003 の Decision Outcome (「`Win32Runtime` は `autoModeSafe: false` として表明する」) と
`runtime` charter の KPI を満たせず、利用者には永久に「判定中」と表示される。

---

## 5. 実行状態の確認

`probe` と WSL 側ファイルアクセスは、**実行中であることを確認済みのディストロに対してのみ**
発行する (FR-007 / FR-015)。「呼ばない」という約束ではなく、**確認を経た値しか受け取れない型**で
表す。この型は実行状態を確認する関数の戻り値としてのみ生成され、**外部から組み立てられない**。

**確認済みの値は、どのディストロについての確認かを保持する。** 値を受け取る側 —
`probe` / UNC 経由のファイル列挙 / ブラウズセッション — は、**入口で
「値が保持する識別子」と「操作対象の識別子」の一致を検証する**。
一致検証が無いと、A について取った**正規の**確認済みの値で B を操作でき、
B が停止中なら UNC アクセスが B を起動して SC-005 が破れる。
偽造だけでなく正規の値の流用も塞ぐ必要がある。

`state` はキャッシュ値であり実体と乖離する (WSL2 はアイドルのディストロを自動停止する)。
一方で確認には `wsl.exe` の起動コスト (AD-015 実測 約 1.5 秒) がかかるため、
**確認の回数を操作回数に比例させてはならない** (FR-010)。有効期間を次のとおり定める。

| 用途 | 規則 |
|---|---|
| 判定バッチ | バッチ直前に**全ディストロ分をまとめて 1 回**確認し、バッチ中は共有する |
| 単発の再判定 (利用者の明示操作) | 毎回確認する |
| フォルダブラウズ | **ブラウズセッション**の開始時に 1 回。以後 **30 秒**を上限に再利用する |

有効期間を超えた値は使ってはならない。**期限の検査はファイルアクセスの前に行う** —
失敗を検知してから再確認する形にすると、UNC アクセスが停止中ディストロを
**起動して成功した**場合に検知が発火しない。期限切れの値は再確認せず破棄し、
ブラウズセッションの開始からやり直す。

上限を 30 秒とするのは、`wsl.exe` の固定コスト約 1.5 秒 (AD-015) と
SC-004 のブラウズ階層移動 300 ms の予算を両立させるためである。
階層移動ごとに確認しなければこの予算に収まる。

### 有効期間内に実体が停止する窓は残る

**この設計は「停止中ディストロが起動されることが 0 件」を保証しない。**
確認から次の操作までのあいだに WSL2 のアイドル自動停止や利用者の
`wsl --terminate` が起これば、期限内であっても値は実体と乖離する。
期限の検査は**期限切れ後にしか発火しない**ため、この窓は塞がらない。

窓を消す唯一の方法は操作ごとに確認を発行することだが、1 回 1.5 秒であり
SC-004 の 300 ms 予算とも FR-010 の「確認回数を操作回数に比例させない」とも両立しない。

したがって**残余として受け入れ、SC-005 をアプリ側の行為で測る形に定める** (spec SC-005)。
窓の幅は用途ごとに次のとおりであり、**幅を小さく保つことが唯一の緩和策**である。

| 用途 | 窓の幅 |
|---|---|
| 判定バッチ | バッチ全体の所要時間 (実測 約 3.2 秒) |
| フォルダブラウズ | **30 秒** (上限) |
| 単発の再判定 | 確認から発行までの 1 往復 |

---

## 6. `WorkspaceFolder`

利用者が登録した作業ディレクトリ。**所在は推測されず、登録時に明示的に選ばれる**。

| フィールド | 説明 |
|---|---|
| `id` | 内部識別子 |
| `location` | **所在**。`windows` または `wsl:<distroName>` |
| `path` | 所在の名前空間で表現されたパス |
| `displayName` | 既定はフォルダ名 |
| `reachability` | 一覧表示のための到達可能性。**§8 と同じ 3 値** (`reachable` / `unreachable` / `blocked`) (FR-017 / FR-027)。**永続化しない** |
| `registeredAt` | 登録日時 |

### 不変条件

- 所在が `windows` なら `path` は `HostPath`、`wsl:<D>` なら `RuntimePath` で
  **その名前空間識別子が `wsl:<D>` と一致する**
- この一致判定は `domain` の純粋関数 **`isNamespaceConsistent(location, path)`** に集約し、
  **IPC 境界と永続化境界の双方がこれを呼ぶ**。粒度を揃えないと、所在の種別だけが一致して
  ディストロ名が異なるレコードが片方だけ通過する
- **ディストロ名は検出時の表記をそのまま保持し、比較は完全一致で行う** (正規化しない)。
  `isNamespaceConsistent()` と名前空間識別子の比較は同じ規則に従う
- **`reachability` を 2 値に潰さない。** 所在ディストロが停止しているだけのエントリは
  `blocked` である。**解除操作そのものは `reachability` によらず全エントリに提供する** —
  制限すると FR-031 の越境案内 (旧エントリの登録解除を含む) が実行不能になる。
  制限してよいのは**解除を勧める表示** (推奨・強調・導線の優先提示) だけであり、勧めてよいのは
  `unreachable` — フォルダの消失・ディストロの消滅 — のときだけである (FR-017)。
  WSL2 のアイドル自動停止は日常的に起きるため、潰すと正常な登録を毎日削除させることになる
- `(所在, 正規化済みパス)` の組が一意 (FR-016)

### 一覧側の到達可能性の導出 (FR-017 / FR-027)

§8 の 3 段は **(フォルダ × ランタイム) の対**に対して定義される。一覧にはランタイム軸が無いため、
対ごとの結果をフォルダ 1 件に畳む規則が別に要る。**第 0 段を置き、そこで決まったら §8 を見ない。**

#### 第 0 段: フォルダ自体の存在 (ランタイムを見ない)

| 条件 | 判定 |
|---|---|
| 所在ディストロが検出結果に無い | **unreachable** (`distro-absent`) — 改名・削除。起動しても解消しない |
| 所在ディストロが `stopped` | **blocked** (`distro-not-running`) / steps: `start-distro`, `rescan-runtimes` |
| 所在 `windows` でパスが存在しない | **unreachable** (`folder-missing`) |
| 所在 `wsl:<D>` が `running` でパスが存在しない | **unreachable** (`folder-missing`) |
| 上記以外 | 第 1 段へ (§8 の対ごとの結果を下の規則で畳む) |

#### 畳み込み

検出済みランタイムのいずれかで `reachable` なら `reachable`、無ければ `blocked` があれば `blocked`、
いずれも無ければ `unreachable`。

#### 実在確認の制約

- **所在 `wsl:<D>` の実在確認は `infra/fs` 経由とし、実行中確認済みの値を持つときだけ発行する** (§5)。
  持たないときは実在確認を行わず、第 0 段の 2 行目 (`blocked`) で止める
- **確認済みの値を持たないときに `folder-missing` を出してはならない** —
  停止を削除と誤認させ、FR-017 の 2 層のうち「解除を勧める」側に誤って落とす
- 実在確認の回数は登録件数に比例するが、**`wsl.exe` の呼び出しは伴わない** (UNC 直読み。AD-015 §1)

`foreign-distro` / `unc-cwd-unsupported` / `path-not-mapped` は**ランタイムを指定しないと決まらない**ため、
一覧側の `unreachableReason` には現れない。

- **秘密情報のフィールドを持たない** (Constitution Principle V)

---

## 7. `AgentRuntime` とパス API

Constitution Principle I が要求するパス操作の経路。
`RuntimeDescriptor` (データ) に**パス API を束ねたインタフェース**が `AgentRuntime` である。

```
AgentRuntime = { descriptor: RuntimeDescriptor; path: RuntimePathOps }
```

`RuntimePathOps` が提供する操作: パスの結合・正規化・親ディレクトリ・基底名・等価判定、
ホスト名前空間との相互変換、UNC 形式との相互変換。
ホスト名前空間の操作は同じモジュールが別の名前で公開する。

### 規則

| 規則 | 根拠 |
|---|---|
| パス操作の標準モジュールを import してよいのは**このパス API の実装モジュール 1 つだけ** | Constitution Principle I / FR-025 |
| **すべての変換関数が入口で名前空間識別子の一致を検証する。** 不一致は変換不能を返す | 型では防げない (§1)。**別ディストロのパスを取り違える唯一の防御** |
| **`isSameDistro(a, b)`** — 種別を問わずディストロ成分の完全一致で判定する。**`NamespaceId` から成分を取り出してよい唯一の場所** | `wsl:<D>` と `unc:<D>` のように種別が異なる値どうしを比較する唯一の経路 (`infra/fs` の入口)。部分一致で書くと `Ubuntu` が `Ubuntu-26.04` に当たる |
| 実装モジュールは**ホスト名前空間とランタイム名前空間で異なる意味論**を使う。プラットフォームによって挙動が変わる API を使わない | Constitution Principle II。実行環境で結果が変わってはならない |
| 実装は純粋関数。`PathMapping` と名前空間識別子を引数で受け取る。I/O を持たない | AD-023 |
| `AgentRuntime` は `app` の composition root が `RuntimeDescriptor` から**都度組み立てる**。キャッシュするなら descriptor の更新で破棄する | 古いマッピングを掴み続けないため |
| `AgentRuntime` を IPC に載せない。IPC に載せるのは `RuntimeDescriptor` のみ | Electron IPC は structured-clone セマンティクス |

AD-004 の「変換の責務は `AgentRuntime` の内側」は**公開 API 面**を指し、
実装は AD-023 に従い `domain` の純粋関数に置く。この調停は AD-025 に記録する。

### `ui` から呼んでよい範囲

`ui → domain` は型と副作用のない純粋関数まで許す (AD-025)。
ただし **`ui` から node builtin に到達する経路を作ってはならない**。
パス API の実装モジュールは標準モジュールに依存するため、**`ui` はそこに到達してはならない**。

越境判定に必要な接頭辞照合は、**標準モジュールに依存しない別モジュール**に置き、
解決関数はそちらを使う。依存グラフ検証で `ui` からの推移的到達を禁止する (FR-035)。

---

## 8. `FolderRuntimeResolution`

組み合わせの解決結果。**純粋関数の戻り値**であり永続化しない。

| フィールド | 説明 |
|---|---|
| `reachability` | `reachable` / `unreachable` / `blocked` |
| `unreachableReason` | `unreachable` のときのみ |
| `blockedReason` | `blocked` のときのみ |
| `resolutionSteps` | `blocked` のとき、利用者が取るべき操作。**必ず 1 つ以上** |
| `boundary` | `native` / `cross` / `unknown` |
| `runtimePath` | 解決後のパス。**名前空間識別子を伴う**(ランタイムの `id`)。`blocked` / `unreachable` では `null` |
| `recommendation` | `cross` のとき必ず非 `null`。影響・推奨配置先・手順の 3 要素 |

```
UnreachableReason = foreign-distro | unc-cwd-unsupported | folder-missing | distro-absent
                  | path-not-mapped
BlockedReason     = distro-not-running | capabilities-not-probed | probe-failed
ResolutionStep    = start-distro | rescan-runtimes | wait-for-probe
CrossBoundaryStep = clone-to-suggested-location | register-new-folder | unregister-old-folder
```

### 3 値にする理由

「到達できない」と「一時的に解決できない」は利用者にとって別の状態である。
前者は選択肢から消してよいが、後者は**選択肢に出して解消手順を示さなければ利用者が詰まる**。
`WslRuntime` のアイドル自動停止も、起動直後および再検出中の判定未完了も日常的に起きるため、
これは例外経路ではない。

### 利用者向けメッセージの意図 (FR-047)

内部識別子をそのまま提示しない。

| 値 | 伝えるべき内容 |
|---|---|
| `foreign-distro` | 別のディストロの中にあるため、このランタイムからは開けない |
| `unc-cwd-unsupported` | WSL の中にあるため、Windows のランタイムからは**開けない扱いにしている** |
| `folder-missing` | フォルダが見つからない。移動または削除された可能性がある |
| `distro-absent` | 登録時のディストロが見つからない。名前が変わった可能性がある |
| `path-not-mapped` | このドライブは選んだランタイムから見えない |
| `distro-not-running` | ディストロが停止している。**起動して再検出すると、この組み合わせを使えるかどうかが分かる** |
| `capabilities-not-probed` | ランタイムを調べている最中。**完了すると、この組み合わせを使えるかどうかが分かる** |
| `probe-failed` | ランタイムを調べられなかった。再検出すると試し直す |

### 判定順序 (FR-029)

**3 段を上から順に適用する。上の段で決まったら下の段を見ない。**

#### 第 1 段: 到達可否 — 所在 × ランタイム種別

**ランタイムの実行状態と probe の進行を見ない。** ここで `unreachable` になるものは
ディストロを起動しても解消しないためである。

| 所在 | `Win32Runtime` | `WslRuntime` (同一ディストロ) | `WslRuntime` (別ディストロ) |
|---|---|---|---|
| `windows` | 第 2 段へ | 第 2 段へ | 第 2 段へ |
| `wsl:<D>` | **unreachable** (`unc-cwd-unsupported`) | 第 2 段へ | **unreachable** (`foreign-distro`) |

`unc-cwd-unsupported` は **未検証を根拠にした安全側の既定**である。UNC パスを cwd とする
ネイティブ Windows プロセスの起動は AD-015 で検証されていない (spec `## Assumptions`)。
起動契約を持つ X-1 で検証し、可能ならこのセルを改める (research の申し送り表)。

#### 第 2 段: 変換材料の有無

第 1 段を通ったセルにのみ適用する。**分岐の鍵は `pathMapping` を持っているかどうか**であり、
`probeState` ではない。**`Win32Runtime` は恒等変換であり材料を要しない**ため常に第 3 段へ進む。

| ランタイム | `pathMapping` | 判定 |
|---|---|---|
| `Win32Runtime` | 不要 (恒等) | 第 3 段へ |
| `WslRuntime` | 取得済み | 第 3 段へ |
| `WslRuntime` / `state: stopped` | 未取得 | **blocked** (`distro-not-running`) / steps: `start-distro`, `rescan-runtimes` |
| `WslRuntime` / `running` かつ `probeState: idle` / `probing` | 未取得 | **blocked** (`capabilities-not-probed`) / steps: `wait-for-probe` |
| `WslRuntime` / `running` かつ `probeState: failed` | 未取得 | **blocked** (`probe-failed`) / steps: `rescan-runtimes` |

`blocked` のとき `boundary: unknown` / `runtimePath: null`。

**`probeState` を鍵にしてはならない。** capabilities の判定とマッピングの取得は同じ 1 回の
呼び出しで行うが (FR-023)、**両者は独立した成果物**である。WSL1 は実地判定を行わず
capabilities を固定値で表明する (FR-004) 一方、パス変換にはマッピングを要する。
`probeState` で分岐すると実行中の WSL1 が「材料あり」と誤判定され、
所在 `windows` のフォルダがすべて `path-not-mapped` として消える。

「実行中だがマッピング未取得」は例外経路ではない。`listRuntimes()` は SC-004 の 3 秒制約のため
**capabilities 未判定の descriptor を先に返す**
([contracts/ipc-capability.md](contracts/ipc-capability.md)) ため、
起動直後と再検出中は必ずこの状態を通る。

#### 第 3 段: 変換と越境

| 所在 | ランタイム | 条件 | 判定 |
|---|---|---|---|
| `windows` | `Win32Runtime` | — | reachable / **native** / `runtimePath` は恒等 (`host`) |
| `windows` | `WslRuntime` | 接頭辞がマッピングにある | reachable / **cross** |
| `windows` | `WslRuntime` | 接頭辞がマッピングに無い | **unreachable** (`path-not-mapped`) |
| `wsl:<D>` | `WslRuntime` (`<D>`) | パスが当該ディストロの Windows マウント配下**でない** | reachable / **native** / 恒等 |
| `wsl:<D>` | `WslRuntime` (`<D>`) | パスが当該ディストロの Windows マウント**配下** | reachable / **cross** / 恒等 |

`path-not-mapped` は、マッピングに現れないドライブ — 未マウントのドライブ、
ネットワークドライブ、UNC — を所在 `windows` として登録した場合に現れる
(spec Edge Case「ネットワークドライブ・UNC パスを所在 `windows` として登録する」)。
**`Win32Runtime` からは恒等で開けるため、到達不可になるのは `WslRuntime` と組んだときだけ**である。

下 2 行が分かれるのは、フォルダブラウザが「所在配下のみを辿る」ため
利用者が Windows マウント配下のフォルダを所在 `wsl` として登録できることによる。
実体は Windows 側ファイルシステムであり AD-016 の性能崖に乗る。
判定に必要なマッピングは `RuntimeDescriptor` が保持しており追加 I/O はない。

### 順序を固定する理由

実行状態を到達可否より先に見ると、**起動しても使えない組み合わせに
「起動して再検出せよ」と案内する**ことになる。所在 `wsl:<A>` のフォルダと
停止中の `WslRuntime(<B>)` がこれにあたり、案内に従って起動すると第 1 段で
`unreachable` (`foreign-distro`) になり選択肢から消える。
利用者は無駄な環境操作をしたうえで行き止まりに着く。

### 不変条件

- `unreachable` の組み合わせは**選択肢に現れない** (FR-028)
- **`blocked` は選択肢に現れる。** 必ず `resolutionSteps` を 1 つ以上伴う
- `cross` でも**選択可能**。選択不可にしてはならない (FR-030 / AD-016 §2)
- `cross` のとき `recommendation` の 3 要素はすべて非空 (FR-031)
- `unreachableReason` と `blockedReason` は同時に非 `null` にならない
- **`blocked` から解消手順を実行した結果 `unreachable` に確定した組み合わせは、
  選択肢から消すと同時に理由を提示しなければならない** (FR-028)。
  `blocked` の段階ではマッピングが無いため第 3 段を先取りできず、
  「起動して再検出せよ」と案内したうえで `path-not-mapped` に落ちる列が必ず残る。
  黙って消すと、利用者は環境操作を行ったうえで理由も次の操作も無い状態に着く
- `runtimePath` が非 `null` のとき、その名前空間識別子は**ランタイムの `id` と一致する**。
  `Win32Runtime` では `host`、`WslRuntime` では `wsl:<D>` になる

---

## 9. エンティティ関係

```
RuntimeDescriptor ──┐                    app/composition-root
  (データ。IPC 可)   │                          │ descriptor ごとに都度組み立てる
                    ├──► resolve(...) ──  AgentRuntime { descriptor, path }
WorkspaceFolder ────┘   純粋関数・builtin 非依存       │
  (location, path)         │                        ▼ 標準モジュールはここだけ
                           ▼                   パス API 実装モジュール
                  FolderRuntimeResolution
```

`resolve()` は I/O を持たず node builtin にも到達しないため、**レイヤ規則上は** `ui` から呼べる。
ただし **R-1 では実際の呼び出しを main 側に置く** — 第 3 段が `PathMapping` の接頭辞照合を要し、
その中身は境界外に出さないと決めている ([contracts/ipc-capability.md](contracts/ipc-capability.md))。
renderer は `resolveFolderRuntime` の結果 DTO を描くだけである。
接頭辞照合を標準モジュール非依存の別モジュールに置くのは、
**`ui` が `domain` を型以外で参照しうる経路を builtin 非依存に保つため**であり、
「`ui` が `resolve()` を呼ぶ」ことを前提にしたものではない。

---

## 10. Glossary への反映 (FR-046)

**追加**: `Location` (所在) / `WorkspaceFolder` / `RuntimeDescriptor` / `PathMapping` /
`Cross-boundary` (越境) / `Reachability` (3 値) / `WslUncPath` /
**`Browse session` (ブラウズセッション)** — WSL 側フォルダ列挙のために実行状態の確認を
再利用する期間 (30 秒上限)。**Claude Code の `Session` (1 会話) とは別概念**であり、
UI 文言ではフォルダ参照側であることが分かる表現を用いる

**既存項目の修正**:

- `AgentRuntime` — 「検出結果から生成される値」から「**`descriptor` と `path` を持つインタフェース**」へ。
  「値」にあたるのは `RuntimeDescriptor` である
- `autoModeSafe` — 3 値に改め、判定は `isAutoModeAllowed()` を唯一の経路と定める。
  **`docs/domains/isolation/charter.md` の 2 箇所と AD-020 も同じ前提で書かれている**ため、
  charter は追随させ、immutable な ADR は AD-024 の読み替え対象に含める
- `capabilities` — `probeState` / `seccompFilter` / `missingDependencies` / `probedAt` を追加
- `supervisor` — 実ディレクトリが `src/agents/` であることを明記

**Detected synonyms への追加**: 「所在 / ロケーション / 置き場所 → 所在」「supervisor / agents」
