# platform-boundary-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-14 | **Round**: 4

## 初回読了 viewpoint

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` (本 round 並走)
- B. 入力検証 / injection / 暗号: 該当なし: 同上
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0 — Out of scope 侵犯は観察されず。`isAutoModeAllowed()` の `runtime` 側配置は I-3 での移管が AD-025 / SH-043 に紐付いている
- D. Constitution / ADR drift: Critical:1 High:1 Medium:0 Low:0 (Principle I / VI、AD-004、SC-005 に関わる境界)
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer`
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0 — ルール自体の穴 (PB-7) を再点検したが新規の穴は観察されず。round-3 M-001 は FR-037 / SH-014 で閉じ、`tests/rule-fixtures/` のスコープ外化は SC-017 で追跡対象として明示されている
- G / H: 該当なし

## スコープ要約

本 round は「round-3 の修正が次の穴を作っていないか」に絞り、(1) `target` ベースの `browseDirectory`、(2) `unc:<distro>` 名前空間、(3) ディストロを保持する実行中確認済みの値 — の 3 つについて、**宣言された防御をすべて満たしたまま禁止された効果が起きる経路**を探した。結果、(2)(3) の識別子粒度は閉じているが、**「どのディストロか」は閉じても「どの名前空間種別か」と「いつ確認したか」が閉じていない**。前者は browse → 登録 → 永続化の往路で `unc:<D>` と `wsl:<D>` を入れ替え可能にし、後者は SC-005 の「起動 0 件」を検証不能にする。

## Findings

### [Critical] `browseDirectory` が返す `PathDTO` の名前空間が未定義で、`unc:<D>` → `wsl:<D>` の変換ホップが browse → `registerFolder` → 永続化の経路から欠落している (C-001)

- **観察**: `contracts/ipc-capability.md:79` は `cwd` / `parent` / 各 `DirEntryDTO.path` を「完成した `PathDTO`」として返すと定めるが、**その `namespace` が `unc:<D>` なのか `wsl:<D>` なのかを述べる行が bundle に存在しない**。経路の両端は確定している — `contracts/runtime-detection.md:141,144` は WSL 側列挙を UNC 経由とし「確認済みの値のディストロ識別子と **UNC 値の名前空間識別子 (`unc:<distro>`)** の一致を検証する」と書き、`contracts/workspace-store.md:28` と `quickstart.md:67` は登録される値を `{ "namespace": "wsl:Ubuntu-26.04", "value": "/home/u/repo" }` (POSIX) としている。`data-model.md:258` は所在 `wsl:<D>` のとき `path` が識別子 `wsl:<D>` の `RuntimePath` であることを要求する。**browse の出力と登録の入力のあいだに 1 ホップの変換が必ず要るが、誰がどこで行うかを定めた記述が 0 件**。変換関数自体は BE-005 に存在するが、browse フローでの呼び出し点は BE-043 / BE-046 のいずれにも書かれていない。
  さらに、この曖昧さを検出しうる唯一の入口検査である `contracts/ipc-capability.md:165` の `target` 検証が **`of` の名前空間識別子を「トークンが表すディストロと一致すること (= ディストロ名まで)」としか定めていない**。`unc:D` と `wsl:D` は**どちらも通過する**。
- **同種事象探索**: `browseDirectory|DirEntryDTO|beginBrowse|UNC 経由|unc:` で **25 件**。うち **browse 出力の `namespace` 値を特定する記述 0 件**、**`unc:<D>` ↔ `wsl:<D>` 変換の呼び出し点を browse フローに割り当てる記述 0 件**、`target.of` を `NamespaceId` 完全一致で照合すると読める記述 **0 件**。
- **リスク/影響**: US-2 AC-3 の実装が 2 通りに分岐し、**どちらも設計の防御を満たしたまま壊れる**。
  (a) UNC 値をそのまま返す場合 — renderer は `cwd` を `WorkspaceFolderDraftDTO.path` に載せる以外にできることがなく、`registerFolder` の `isNamespaceConsistent()` が `unc:D ≠ wsl:D` で弾く。**WSL 側フォルダを一切登録できず** FR-014 / SC-013 が成立しない。
  (b) 回避のため IPC ハンドラか renderer で `\wsl.localhost\<D>` 接頭辞を剥がして `wsl:D` を貼り直す場合 — これは round-3 C-001 が塞いだ「境界を越えた直後の再 branding」そのものであり、**BE-005 の変換 API (識別子必須引数 + 値との一致検証) を迂回する**。迂回の形が文字列操作であるため SH-012 にも SH-013 にも `tsc` にも掛からない (`PathDTO` は plain object で brand が既に退化している)。`WslUncPath` の「識別子と埋め込みディストロ名の一致」は**生成時に一度しか効かず**、剥がした後の値には適用されない。結果、`wsl:A` のタグを持つ B のパスが再び作れる — round-3 C-002 で塞いだ取り違えが、**名前空間の粒度ではなく種別の側から復活する**。
  下流への波及: 第 3 段は「パスが当該ディストロの Windows マウント配下か」を接頭辞照合で判定する。UNC 文字列は `/mnt/c` と決して一致しないため、誤って `wsl:D` を貼られた UNC 値は**常に `native`** と判定され、AD-016 の性能崖の警告 (FR-029 / FR-031 / SC-006) が出ない。X-1 がこの値を cwd にすれば存在しないディレクトリを指す。
- **推奨アクション**: browse 節に **「`cwd` / `parent` / `DirEntryDTO.path` の `namespace` は常に `wsl:<D>` とする。UNC 形式は `infra/fs` の内側に閉じ、IPC 境界を越えない」**を明記する (逆に `unc:<D>` を採るなら `registerFolder` 側に変換点を置き `isNamespaceConsistent()` の引数を workspace-store と揃える。**どちらでもよいが、決めずに両方の契約に整合させることはできない**)。`target` 検証を「`of.namespace` が**トークンの名前空間識別子と完全一致**すること (種別まで)」に強める。BE-043 / BE-046 に変換ホップの所在を 1 行で書く。違反サンプル群 (b) に「IPC 境界で `PathDTO.namespace` を付け替える」を追加。
- **根拠**: Principle I / FR-021 / FR-025 / FR-019 と `contracts/ipc-capability.md:79,165` の未定義。AD-004 / AD-012。

### [High] 実行中確認済みの値の「有効期間」に上限も、期限内の実体停止への扱いも無く、SC-005 の「起動 0 件」が設計上も計測上も担保されない (H-001)

- **観察**: `data-model.md:237` はブラウズについて「開始時に 1 回。以後**一定時間**は再利用する。ファイルアクセスが失敗したら即座に再確認する」と定め、`:239` は「有効期間を超えた値は使ってはならない」とする。**「一定時間」の上限値を定めた記述は bundle に無い**。同 `:229` と `research.md:104-105` は「WSL2 はアイドルのディストロを自動停止するため、キャッシュが『実行中』のまま実体が止まっている窓が**常時存在する**」と自ら認めている。`research.md:381` は**停止中ディストロへの UNC アクセスの副作用を「実測せずに済ませる。実行中確認済みに限定して問題自体を回避する」**としている。つまり、回避の前提が成り立たない唯一の区間が有効期間内であり、その区間で起こることは**未実測のまま**である。復旧規則が「アクセスが**失敗**したら再確認」である点が本質的で、UNC アクセスが停止中ディストロを**起動して成功する**なら復旧規則は発火しない。
- **同種事象探索**: `有効期間|一定時間|自動停止|アイドル` で **16 件**。**有効期間の上限値を定めた記述 0 件**、**期限内に実体が停止した場合の振る舞いを定めた記述 0 件**、**SC-005 の計測経路に時間経過ケースを含む記述 0 件** (quickstart はいずれも即時操作、SC-005 の計測経路は「停止中識別子で IPC を直接呼んで拒否されること」のみ)。
- **リスク/影響**: 次の列は設計の防御をすべて満たす — (1) `beginBrowse(<D>)` が `verifyRunning` を 1 回発行し `<D>` が `running`、(2) トークンと確認済みの値が生成される (識別子は一致)、(3) 利用者がダイアログを開いたまま離席し WSL2 が `<D>` をアイドル自動停止する (または別窓で `wsl --terminate`)、(4) 有効期間内に `browseDirectory` が呼ばれる。`token` は有効、値も期限内、識別子も一致 — **検証 3 項目すべてを通過する**。(5) UNC アクセスで `<D>` が起動する。SC-005 に反するが、**SC-005 の計測経路はこの経路を構造的に見ない**。Principle VI に対する唯一の残存経路であり、かつ **grep でも型でも見えない** (`wsl.exe` を呼ばないため FR-037 の (b)(c) に掛からず、UNC 文字列は許可リスト検査の対象外)。
- **推奨アクション**: (a) 「一定時間」に**上限値を数値で書く** (30 秒程度。SC-004 のブラウズ 300 ms 予算と `wsl.exe` の 1.5 秒は、階層移動ごとでなければ両立する)。(b) 復旧規則を「アクセスが失敗したら」から「**アクセス前に期限を検査し、期限切れなら `browse-session-expired` を返す (再確認は `beginBrowse` からに限る)**」に改め、失敗検知に依存させない。(c) SC-005 の計測経路に「ブラウズセッションを開いたまま所在ディストロを `wsl --terminate` し、有効期間を超えて階層移動を試みる → `browse-session-expired` が返り `wsl -l -v` が変化しない」を追加し quickstart V-2 に手順として書く。(d) `research.md:381` の Open Question を閉じないなら「有効期間内の実体停止時の副作用は未実測である」を残存リスクとして R-04 に明記し、上限値をその不確実性に見合う短さにする。
- **根拠**: Principle VI / SC-005 / FR-007 / FR-010。AD-015 §1 §2。`research.md` R-04。
- **Critical にしない理由**: 「有効期間内に実体が停止しうる」は round 2 / 3 で既に観察済みの事実であり、格上げには **UNC アクセスが停止中ディストロを実際に起動することの実測 (追加事実)** が要る。`research.md:381` はその実測を意図的に見送っている。reviewer-base の round 間 severity 格上げ制約に従い High に留める。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 |
|---|---|---|
| C-001 | `browseDirectory\ | DirEntryDTO\ | beginBrowse\ | UNC 経由\ | unc:` | 25 (browse 出力の namespace 特定 **0** / browse フローでの `unc:`↔`wsl:` 変換点 **0** / `target.of` を NamespaceId 完全一致で照合 **0**) |
| H-001 | `有効期間\ | 一定時間\ | 自動停止\ | アイドル` | 16 (上限値の定義 **0** / 期限内の実体停止時の振る舞い **0** / SC-005 計測経路の時間経過ケース **0**) |

## Verdict

- Critical: 1 / High: 1 / Medium: 0 / Low: 0
- Round inheritance: resolved from round 3: **7** (全件) / unresolved: **0** / new: **2**
- new 2 件はとも round-3 の修正が残した領域 — **C-001 は「誰が合成するか」を決めた結果「どの名前空間で返すか」が残り、H-001 は「どのディストロか」を束縛した結果「いつ確認したか」が残った**

## 意図的に報告しなかったもの

`security-reviewer` 担当の `target.name` の検査と引数インジェクション (本 round 並走)、件数表記・語句の揺れ、実装手段の不足、User Story / SC の文言、命名と module 配置、`tests/rule-fixtures/` のスコープ外化 (round-3 M-001 の修正として意図的かつ SC-017 で追跡)、Constitution の `bad_pattern_grep` が `src/isolation/` を指す drift (AD-024 #2 系として SH-017 が所有)、`probedAt` の鮮度 (I-3 へ明示移管済み)、`SAFE_SANDBOX_KINDS` の endpoint 検証条件 (R-1 に該当インスタンスが無く条件は既記載)。
