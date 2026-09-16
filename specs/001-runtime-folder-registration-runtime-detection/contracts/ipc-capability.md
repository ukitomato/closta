# Contract: preload が公開する単一 capability

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Store**: [workspace-store.md](workspace-store.md)

## 原則 (AD-023 の Electron セキュリティ要件)

| #   | 規則                                                              | 本 feature での扱い                                                                                                                      |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `contextIsolation` / `sandbox` を有効、`nodeIntegration` を無効   | FR-039                                                                                                                                   |
| 2   | ストリームは MessagePort で運ぶ                                   | **R-1 にストリームは存在しない** (X-1 で導入)                                                                                            |
| 3   | データのみのプロトコル                                            | DTO 節                                                                                                                                   |
| 4   | preload は**単一 capability** を公開。生の IPC ハンドルを渡さない | FR-039                                                                                                                                   |
| 5   | main 側で送信元とペイロードを**すべて未信頼として検証**           | 検証節                                                                                                                                   |
| 6   | `file://` ではなくカスタムプロトコルで配信し CSP を絞る           | FR-040。**アプリ内での登録に限り、OS へのプロトコル関連付け API を呼ばない** (レジストリを書くため Constitution Principle VI に抵触する) |

## 公開するメソッド

すべて非同期。戻り値は plain object のみ。

### ランタイム

| メソッド                  | 出力                                                                             | 対応 FR         |
| ------------------------- | -------------------------------------------------------------------------------- | --------------- |
| `listRuntimes()`          | `{ runtimes: RuntimeDescriptorDTO[]; enumerationIssues: EnumerationIssueDTO[] }` | FR-001 / FR-002 |
| `refreshRuntimes()`       | `listRuntimes()` と同じ形                                                        | FR-010          |
| `probeRuntime(runtimeId)` | `RuntimeDescriptorDTO \| { error: 'distro-not-running' }`                        | FR-007 / FR-010 |

`listRuntimes()` は**キャッシュを返す**。未検出なら走査を開始し、
capabilities が未判定の descriptor を先に返す (SC-004 の 3 秒制約)。
確定は `onRuntimesChanged` で通知する。

`refreshRuntimes` / `probeRuntime` / `beginBrowse` は、**同時実行を 1 本に束ねる**。
実行中の要求があるあいだの追加要求は、新しいプロセス起動を伴わずに既存結果へ合流させる。
FR-010 の「確認の回数を利用者の操作回数に比例させない」は main 側の設計指針ではなく
**境界で強制する制約**である — renderer は未信頼であり (AD-023)、
「利用者の明示操作である」ことを呼び出し側の申告で信じることはできない。

`browseDirectory` が返す `entries` には**件数上限を設ける**。
超過は `too-many-entries` を返す。`/mnt/c/Windows/WinSxS` のような巨大ディレクトリは
structured-clone の応答サイズと SC-004 の 300 ms 予算の双方を壊す。

`probeRuntime` は利用者の明示操作であり、main 側は毎回実行状態を取り直す。
停止中なら**プロセスを起動せず** `{ error: 'distro-not-running' }` を返す。
`refreshRuntimes` は実行状態を一括で 1 回だけ確認する
([runtime-detection.md](runtime-detection.md) C-1)。

### 作業フォルダ

| メソッド                         | 出力                                                                                          | 対応 FR                  |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| `listFolders()`                  | `{ folders: WorkspaceFolderDTO[]; restoreIssues: RestoreIssuesDTO }`                          | FR-014 / FR-017 / FR-019 |
| `beginBrowse(location)`          | `{ token } \| { error: BrowseError }`                                                         | FR-015                   |
|                                  | **所在 `windows` は常に `unsupported-location` を返す** (host の入口は `pickHostFolder` のみ) |                          |
| `browseDirectory(token, target)` | `{ cwd, parent, entries } \| { error: BrowseError }`                                          | FR-015                   |
| `pickHostFolder()`               | `WorkspaceFolderDraftDTO \| null`                                                             | FR-013                   |
| `registerFolder(draft)`          | `{ ok: true; folder } \| { ok: false; reason; existing }`                                     | FR-013 / FR-016          |
| `unregisterFolder(id)`           | `{ ok: boolean }`                                                                             | FR-017                   |

**`listFolders()` が `restoreIssues` を返す**のは、FR-019 と SC-013 が要求する
「復元できなかった件数と理由を**利用者に**提示する」を成立させるためである。

**`registerFolder` が重複を弾くときは既存エントリを `existing` として返す。**
US-2 AC-5 は「重複登録されず、**既存エントリが選択状態になる**」ことを要求する。
`reason` だけを返すと renderer が既存エントリを特定できず、
正規化 (ドライブレターの大小・末尾セパレータ) を renderer 側で再実装するほかなくなる。
`reason` が重複以外のときは `existing` は `null`。

```
RestoreIssuesDTO   = { skipped: number; reasonKeys: RestoreIssueReason[]; backupPath: PathDTO | null }
RestoreIssueReason = parse-failed | schema-version-unknown | namespace-mismatch | invalid-path
                   | invalid-record
BrowseError        = distro-not-running | distro-unreachable | permission-denied
                   | not-found | path-too-long | browse-session-expired
                   | unsupported-location | too-many-entries
```

`reasonKeys` は参照キーであり、renderer が FR-047 に従って訳出する。
`EnumerationIssueReason` も同じ参照キー方式であり、**列挙できなかったディストロを黙って落とさない** —
落とすと SC-002 の「`wsl -l -v` と 1 対 1」が破れ、利用者は原因が名前だと気付けない。
`rawName` は表示専用であり、識別子としても引数としても使わない。

**所在によって経路が非対称であることは意図的である。** `windows` は `app` レイヤの
ネイティブダイアログ (`pickHostFolder`)、`wsl` は UNC 経由の列挙
(`beginBrowse` + `browseDirectory`) を使う (FR-013 / FR-015 / FR-038)。

**`beginBrowse` がブラウズセッションを開く。** main 側はここで実行状態を 1 回確認し、
トークンに紐づけて一定時間再利用する。`browseDirectory` はトークンを受け取り、
**階層移動ごとにプロセスを起動しない** (FR-010 / SC-004)。
期限切れまたはアクセス失敗時は `browse-session-expired` を返し、
renderer は `beginBrowse` からやり直す。

**パスの合成責務は main 側にある。** `browseDirectory` の `target` は
`{ kind: 'root' } | { kind: 'current'; of: PathDTO } | { kind: 'child'; of: PathDTO; name: string } | { kind: 'parent'; of: PathDTO }` であり、
**renderer はパス文字列を連結しない。子と親のパスは main 側の `domain` パス API が組み立て**、
`cwd` / `parent` / 各 `DirEntryDTO.path` として完成した `PathDTO` を返す。

**所在配下を列挙・登録・永続化する経路が渡すパスの名前空間は、常に所在のものとする。**
対象は `browseDirectory` の入出力 / `pickHostFolder` / `registerFolder` /
`WorkspaceFolderDTO.path` / workspace-store のオンディスク値である。

**`FolderRuntimeResolutionDTO.runtimePath` はこの規則の対象外**であり、別の規則に従う —
その名前空間は**ランタイムの `id`** であり (data-model §8 不変条件)、
**所在と一致しないことが越境セルの正常な結果**である
(所在 `windows` × `WslRuntime` は `{ namespace: 'wsl:<D>', value: '/mnt/c/...' }` を返す)。
ここを所在の名前空間へ「正規化」すると、POSIX 値に `host` のタグが付く —
**境界を越えた直後の再 branding** そのものになる。
`RestoreIssuesDTO.backupPath` は所在を持たず、常に `host` である。
UNC 形式 (`unc:<D>`) は `infra/fs` の内側に閉じ、**境界を越えない**。
列挙の実体は UNC だが、`infra/fs` が返した UNC 値は main 側のパス API で
`wsl:<D>` の `RuntimePath` に変換してから DTO に載せる。
この 1 ホップを契約に書かないと、実装は次のどちらかになる — (a) `unc:<D>` を返して
`registerFolder` の `isNamespaceConsistent()` が全件はじき **WSL 側フォルダを登録できない**、
(b) IPC ハンドラか renderer で UNC 接頭辞を文字列で剥がして `wsl:<D>` を貼り直す。
(b) は「境界を越えた直後の再 branding」であり、識別子必須引数と値との一致検証を持つ
変換 API を迂回する。迂回の形が文字列操作であるため lint も型検査も止められない。

`parent` は `PathDTO | null` とし、**現在地がルートなら `null`** を返す。
ルートに対する `{ kind: 'parent' }` は現在地をそのまま返す。

**期限切れからの復帰で利用者の現在地を失わせない。** `browse-session-expired` を受けた renderer は
`beginBrowse` をやり直し、**`{ kind: 'current'; of }` で同じ位置を再列挙する**。
「開始からやり直す」を字義どおりルートへ戻す実装にすると、深い階層を探している利用者は
期限ごとに振り出しに戻り、1 巡に上限を超える利用者は登録を完了できない。
この 1 手だけは実行状態の再確認を伴うため SC-004 の 300 ms 予算の対象外である (SC-004 の注記)。

renderer に `{ name, isDirectory }` だけを返すと、階層移動のために renderer が
`親の value + セパレータ + name` を連結し `namespace` を自分で埋め直すことになる。
これは FR-025 を renderer で破る経路であり、**import が発生しないため
`no-restricted-imports` にもグラフ検証にも掛からない**。
合成結果は §1 の正規化規則を通らないため、FR-016 の重複判定も renderer の実装品質に依存してしまう。

### 解決

| メソッド                                    | 出力                         | 対応 FR         |
| ------------------------------------------- | ---------------------------- | --------------- |
| `resolveFolderRuntime(folderId, runtimeId)` | `FolderRuntimeResolutionDTO` | FR-027 / FR-029 |

## 通知 (main → renderer)

| イベント            | 用途                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `onRuntimesChanged` | 非同期に確定した capabilities の反映                               |
| `onFoldersChanged`  | 登録フォルダの到達可能性 (**3 値**) の変化の反映 (FR-017 / FR-027) |

購読解除は preload が返す**トークン**で行う。renderer からコールバック関数を main に渡さない。

## DTO

**DTO 型は `src/domain/<area>/dto.ts` に置く。** preload と renderer の双方が `domain` から
import する。preload (= `app` レイヤ) に置いて renderer が import すると `ui → app` になり
AD-023 §7 の `app ↮ ui` に抵触する。

branded type は境界を越えると退化するため、**パスは名前空間を明示して運ぶ**。

```
PathDTO      = { namespace: NamespaceId; value: string }
LocationDTO  = { kind: 'windows' } | { kind: 'wsl'; distroName: string }

CapabilitiesDTO = { probeState, sandboxKind, seccompStatus, missingDependencies,
                    probedAt, autoModeAllowed, autoModeStatus }

RuntimeDescriptorDTO = { id, kind, distroName, wslVersion, state, isDefault,
                         capabilities, hasPathMapping, detectedAt }

EnumerationIssueDTO  = { rawName: string; reasonKey: EnumerationIssueReason }
EnumerationIssueReason = invalid-name-charset

WorkspaceFolderDTO      = { id, location, path, displayName, reachability, unreachableReason,
                            blockedReason, resolutionSteps, registeredAt }
WorkspaceFolderDraftDTO = { location, path, displayName }
DirEntryDTO             = { name, isDirectory, path: PathDTO }   // namespace は常に所在のもの

FolderRuntimeResolutionDTO = { reachability, unreachableReason, blockedReason, resolutionSteps,
                               boundary, runtimePath, recommendation }
```

### renderer に渡してよい値

| 項目                       | 扱い                                                            | 理由                                                                                               |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `autoModeSafe` (生の 3 値) | **渡さない**                                                    | `unknown` は JavaScript で truthy であり、真偽判定が誤る                                           |
| `sandbox` (生の値)         | 渡す。ただし**名前は `sandboxKind` とし、表示の分岐にのみ使う** | 下記                                                                                               |
| `autoModeAllowed`          | 渡す。**ゲート判定にのみ使う**                                  | 未判定を `false` に潰すため、表示に使うと「判定していないものを『ない』と表明」してしまう (FR-003) |
| `autoModeStatus`           | 渡す。**表示にはこちらを使う**                                  | 3 状態を区別できる                                                                                 |
| `PathMapping` の中身       | **渡さない** (`hasPathMapping` のみ)                            | 変換は main 側の `domain` 純粋関数で行う                                                           |

**不変条件**: renderer は無人実行の可否を `autoModeStatus` / `autoModeAllowed` 以外から
導出してはならない。**`sandboxKind` から `autoModeSafe` 相当を再導出してはならない。**

`sandboxKind` は閉じた参照キー (`none` / `bubblewrap` / `unknown`。I-1 で `container` が加わる) であり、
renderer が FR-047 に従って訳出する。DTO 内の他の値 —
`probeState` / `seccompStatus` / `RestoreIssuesDTO.reasonKeys` /
`UnreachableReason` / `BlockedReason` — もすべて参照キー方式であり、ここだけ例外にしない。

訳出済みラベルだけを渡すと、`isolation` charter が業務ルールに掲げる
「**隔離状態は一目で分かること**」を満たす隔離バッジ (I-2) が、
**ローカライズ済み文字列の比較**でしか種別を分岐できなくなる。
I-1 で `container` が加わった時点で renderer 側の分岐が壊れるか、
DTO の後方非互換な変更が要る。R-1 は以降の全 feature が乗る DTO を固定する feature であるため、
ここで形を決める。

再導出の禁止は `autoModeStatus` / `autoModeAllowed` という**別のフィールド**を
唯一の判定入力に定めることで担保する。生の 3 値 `autoModeSafe` を渡さない判断は変えない。

## 未信頼入力の検証 (main 側)

**送信元とペイロードの双方を検証する** (AD-023 のセキュリティ要件 5 / FR-039)。
片方だけでは要件を満たさない。

| 入力                                                  | 検証                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **送信元 (全メソッド共通)**                           | `event.senderFrame` が**登録済みカスタムプロトコル origin の main frame** であること。不一致は応答せず破棄する。R-1 のウィンドウ構成では frame は 1 つだが、これを書かないと X-1 以降がこの土台に乗る                                                                                                                                                                                          |
| **`location.distroName` (全経路)**                    | data-model §4 の文字種制約を満たすこと。**列挙・永続化の読み戻し・IPC のすべてで確認する** — 列挙経路だけに置くと、永続化ファイル由来の値が制約を迂回する                                                                                                                                                                                                                                      |
| **すべてのパス値 (`PathDTO.value`)**                  | NUL と制御文字を含まないこと。**ランタイム名前空間の値はセパレータとして `/` のみを使い、バックスラッシュを成分に含まないこと**。長さ上限を超えないこと                                                                                                                                                                                                                                        |
| `runtimeId` (`probeRuntime` / `resolveFolderRuntime`) | 既知の descriptor の識別子に**完全一致**すること。文字列をそのままプロセス起動の引数に渡さない                                                                                                                                                                                                                                                                                                 |
| `runtimeId` (`probeRuntime`)                          | さらに実行状態を取り直して `running` を確認できること。できなければ `distro-not-running` を返し**プロセス起動も WSL 側アクセスも行わない**                                                                                                                                                                                                                                                     |
| **`location` (`beginBrowse`)**                        | `kind === 'wsl'` のとき所在から識別子を構成し、**検出済み descriptor に完全一致**することを確認したうえで実行状態を確認する。**`kind === 'windows'` は常に拒否する** (`unsupported-location`)。host 側の入口はネイティブダイアログ (`pickHostFolder`) だけであり、ここを開けると**利用者の明示同意を経ずにホストファイルシステムを列挙できる**                                                 |
| **`path` (`registerFolder`、所在 `windows`)**         | **renderer の主張をそのまま受理する** (`## Assumptions` に記録)。ピッカー由来であることは要求しない。ただし**到達可能性の実在確認は登録済みエントリに限る** — 任意パスの存在を問い合わせる経路を作らない                                                                                                                                                                                       |
| **`location` (`registerFolder`)**                     | `kind === 'wsl'` のとき**検出済み descriptor に一致する**こと。存在しない所在で任意個のエントリを作れないようにする                                                                                                                                                                                                                                                                            |
| **`displayName` (`registerFolder`)**                  | 長さ上限内であり制御文字を含まないこと                                                                                                                                                                                                                                                                                                                                                         |
| **`token` (`browseDirectory`)**                       | 既知の有効なトークンであり、有効期間内であること。**発行した送信元と一致すること**。期限の検査は**ファイルアクセスの前**に行い、期限切れは `browse-session-expired` を返して破棄する (data-model §5)                                                                                                                                                                                           |
| **`target` (`browseDirectory`)**                      | `of.namespace` が**トークンの名前空間識別子と完全一致**すること — ディストロ名だけでなく**種別まで** (`unc:<D>` を `wsl:<D>` として受け付けない)。`name` は `/` とバックスラッシュ・NUL・制御文字を含まず、`.` / `..` **そのもの**でなく、長さ上限内であること (`.git` のような先頭ドットは許す)。**`target` から実パスを組み立てるのは main 側**であり、renderer が組んだ文字列を受け取らない |
| **実行中確認済みの値**                                | UNC 列挙を発行する前に、**値が保持するディストロ識別子と操作対象の識別子が一致する**こと。偽造だけでなく**正規の値の別ディストロへの流用**も止める (data-model §5)                                                                                                                                                                                                                             |
| `path`                                                | 所在の名前空間の形式に合致すること。相対参照を解決した結果が所在のルート配下に収まること。**解決は所在の名前空間の意味論で行う**                                                                                                                                                                                                                                                               |
| `path` と `location`                                  | `domain` の `isNamespaceConsistent()` を通ること (**ディストロ名まで一致**)。**同じ関数を永続化側も呼ぶ** ([workspace-store.md](workspace-store.md))                                                                                                                                                                                                                                           |
| `folderId`                                            | 既知の登録エントリに一致すること                                                                                                                                                                                                                                                                                                                                                               |

識別子やディストロ名を検証せずにプロセス起動の引数に渡すとコマンド引数インジェクションの
経路になる。引数配列で渡し、検出済みの名前に一致することを必ず確認する。
