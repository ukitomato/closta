# platform-boundary-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/021-session-resume/spec.md
**Phase**: design-gate Round 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-008 を全部読んだ。本 reviewer の担当範囲で影響を受けるのは次のとおり。
  - FR-004 / SC-002: `resume` の UUID 検査を 3 か所で行う。`--resume` を argv で `wsl.exe --exec` に通す。
  - FR-005 / SC-003: 過去の行のランタイム・フォルダ・Provider の決め方。名前空間の突き合わせがある。
  - FR-008 / FR-014: 起動ゲートと WSL / Win32 の起動の値の組み立てを共有する。Principle II に関わる。
  - FR-012: AD-034 の経路で読む列挙対象を決める。configDir の名前空間に関わる。
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII。
  - AD-004 (branded path)。
  - runtime charter Out of scope (`docs/domains/runtime/charter.md:46-59`)。
  - AD-059 Confirmation (draft)。
  - AD-058 (Win32 の起動。`resolveFolderRuntime` stage1 の `unc-cwd-unsupported`)。
  - `.dependency-cruiser.js` の `ui-not-to-core` / `services-not-to-io`。
  - `scripts/constitution/allowlists.mjs` の `WSL_FREE_DIRECTORIES` (項目 15) と `tests/docs/wsl-free-coverage.test.ts`。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (UUID 検査の 3 か所は PB-5 の argv の観点でだけ確かめた)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-9 は過去の行・終了した行・失敗した行から、Agent SDK の `resume` で会話を再開できるようにする。

- 会話の id: セッションスレッドが最初の `system/init` で受け取り、`conversation` メッセージで main に送る。main は registry と退避の表に持ち、永続化しない。
- 新しい IPC が 4 つ、`QUERY_OPTION_KEYS` は 11 から 12 キーになる。`LAUNCH_FAILURE_REASONS` に `resume-failed` を足す。
- 過去の行の軸の解決: domain に新設する純関数 `resolvePastResumeAxes` (`src/domain/session/resume.ts`) が決める。
- 起動: 今の `prepareLaunch` を通し、options に `resume` を足すだけ。WSL / Win32 の起動の値の組み立てには分岐を足さない。

本 reviewer は次の点を見た。

- 境界をまたいでパスの名前空間を保てているか: 列挙対象の所在と、行の cwd の出自の所在。
- ランタイムの単一インスタンス仮定がないか。
- 権限ゲートの入口が増えていないか。
- 実名リスト方式の規則に穴がないか。

## Findings

### [High] 過去の行の軸の解決で、ランタイムは列挙対象 (config ディレクトリ) の所在から、フォルダは行の cwd の出自の所在から取っている。2 つが一致するかを確かめていない (H-001) (scope: feature)

- **観察**:
  - `specs/021-session-resume/data-model.md:147` の段 1 は、ランタイムを**列挙対象の所在**から決める (`windows` → `host`)。
  - 段 2 は `matchFolder({ origin, ... })` を使う (`data-model.md:148-152`)。`src/domain/session/match.ts:108-118` の `matchFolder` は、**行の cwd の出自** (`originLocation(input.origin)`) の名前空間でランタイムを引いて照合する。
  - `src/domain/session/cwd-origin.ts:36-37` は、この 2 つを「由来 config ディレクトリの所在。**セッションの所在とは別物である**」と明記している。
  - `cwd-origin.ts:12-13` には実測の記録がある: ホストの 1 つの config ディレクトリに「Windows 形式 30 / POSIX 形式 6 / **UNC 形式 7**」が混ざっていた。UNC 形式の cwd は `wsl-from-unc` に分類され、名前空間は `wsl:<D>` になる (`cwd-origin.ts:93-150`)。
- **何が起きるか**:
  1. ホストの列挙対象 (`hostHome/.claude`) に、cwd が `\\wsl.localhost\D\home\y\p` の行があるとする。
  2. 段 1 はランタイムを `host` に決める。段 2 は `wsl:D` の名前空間で WSL のフォルダ `/home/y/p` に対応づけ、`matchedPrefix === originPath(origin).value` (どちらも変換後の POSIX 値) も通る。
  3. 結果は `ok: true`、組み合わせは { WSL のフォルダ × Win32Runtime }。ダイアログは押せる「再開」を出す。
  4. 起動すると `prepareWin32` の `resolveFolderRuntime` stage1 が `unc-cwd-unsupported` を返す (`src/domain/workspace/resolution.ts:119-126`)。答えは汎用の `invalid-config` になる (`src/main/app/launch-preparation.ts:130-137`)。
- **別の組み合わせ**: UNC が `\\wsl.localhost\D\mnt\c\dev\closta` の場合、段 2 は D の pathMapping でホストのフォルダ `C:\dev\closta` に対応づく。{ ホストのフォルダ × Win32Runtime } は**起動できてしまう**。ところが、`claude` が記録した cwd の生値は UNC で、起動の cwd は `C:\dev\closta` になる。`<config-dir>/projects/<encoded-cwd>/` が別のディレクトリになるので、会話が見つからず `resume-failed` になる。
- **cwd の一致の確かめ方の問題**: cwd の一致 (`data-model.md:151`) は変換後の値を比べている。`claude` が transcript を探すときに使う生の cwd と、起動の cwd が同じ文字列かは確かめていない。
- **同種事象探索**: `列挙対象の所在|所在が \`windows\`|wsl-from-unc` で specs/021 を引いて 4 件。
  - `specs/021-session-resume/data-model.md:147`
  - `specs/021-session-resume/research.md:62`
  - `specs/021-session-resume/spec.md:184` (FR-005)
  - `specs/021-session-resume/spec.md:224` (SC-003)
  - どの箇所も出自の所在 (`wsl-from-unc` / `host` / `wsl-inherited`) と列挙対象の所在の一致に触れていない。tasks BE-001 のテスト表 (`tasks.md:24`) にもこの組み合わせは無い。
- **リスク/影響**:
  - FR-005 は「決まらなければ、理由と直し方を出して再開を拒否する」と求めているが、そうならない。再開できない組み合わせに押せる「再開」が出る。押すと、汎用の `invalid-config` か、起動後の `resume-failed` になる。
  - spec の「本 feature の位置づけ」は、軸を変えると同じ会話が見つからないので軸を変えさせない、と前提している。解決器そのものがその前提を破る組み合わせを作る。
  - 実在するデータ (UNC 7 件) で起きる。
- **推奨アクション**: data-model §3.1 の段 1 の前に段を 1 つ足す。
  - 行の cwd の出自が、列挙対象のランタイムで**生の値のまま起動の cwd になる形**のときだけ通す。所在 `windows` は `origin.kind === 'host'`、所在 `wsl:D` は `origin.kind === 'wsl-inherited'` で、かつ名前空間が一致するとき。
  - それ以外 (`wsl-from-unc` など) は理由のキーを足して拒否する (例: `cwd-foreign-form`)。`location-unknown` を流用してもよい。
  - 名前空間の比較は `locationNamespace(target.location)` と `isSameNamespace` で行う (L-002 と同じ直し方)。
  - BE-001 のテスト表に 3 行足す: (a) ホストの対象 × `wsl-from-unc` の行 (WSL のフォルダに対応づくもの)、(b) ホストの対象 × `wsl-from-unc` の行 (ホストのフォルダに対応づくもの、`/mnt/c` 経由)、(c) `wsl:D` の対象 × `wsl:E` の UNC の行。
  - research R-05 の「フォルダ」の項と spec FR-005 の文言も合わせて直す。
- **根拠**: Principle I の Why (名前空間を追跡できないと transcript ディレクトリの解決が壊れる)、AD-004、spec FR-005、`cwd-origin.ts:36-37`。
- **scope 根拠**: 本 feature で新設する `resolvePastResumeAxes` の判定表 (data-model §3.1) と、BE-001 のテストで直せる。

### [Medium] 新設の `resume.ts` は、renderer に渡す型と、パス API に届く純関数を同じモジュールに置いている。このままだと `ui → node:path` の推移的到達が成立する (M-001) (scope: feature)

- **観察**:
  - `data-model.md:98` と `tasks.md:23` (BE-001) は、`ResumeSource` / `SessionResumeRequest` / `ResumeUnavailableReason` と `resolvePastResumeAxes` を `src/domain/session/resume.ts` に一緒に置く。
  - `resolvePastResumeAxes` は `matchFolder` と `resolveConfigDirPath` を使う。`src/domain/provider/helper-path.ts:3` は `@domain/runtime/path-api` を import しており、その先は `node:path` である。
  - これらの型は renderer 側でも使われる。
    - contracts C-1 / C-2 の `PastResumeDTO` / `SessionResumeHandshakeDTO` は `ResumeUnavailableReason` を使う。BE-014 は両方を `src/domain/capability.ts` に置く。`capability.ts` は renderer の 31 ファイルが import している。
    - renderer の `ResumeDialogState` (`data-model.md:327-335`) は `ResumeSource` を使う。
  - `.dependency-cruiser.js:343` は `tsPreCompilationDeps: true` (型だけの import も辿る) で、`ui-not-to-core` (`:302-309`) は推移的到達を禁じている。
  - 既存のコードは同じ理由で型を分けている: `src/domain/session/keys.ts`、`origin.ts` (`cwd-origin.ts:21-30`、`match.ts:20-28` の注記)。
- **同種事象探索**: `from '@domain/(capability|session/match|provider/helper-path)'` を `src/renderer` で引いて 31 件。全部 `@domain/capability` だった。renderer から match / helper-path を直接 import している箇所は 0 件。
- **リスク/影響**: 依存グラフの検査が code-gate で赤になり、置き場を直すやり直しが起きる。素通りする穴ではない (機械検出される) ので Medium とした。
- **推奨アクション**: 型と理由のキーの集合 (`ResumeSource` / `SessionResumeRequest` / `ResumeUnavailableReason` / `RESUME_UNAVAILABLE_REASONS`) は、パス API に依存しないモジュールに置く (例: `src/domain/session/resume-types.ts`。`keys.ts` / `origin.ts` と同じ形)。`resolvePastResumeAxes` だけを `resume.ts` に置く。data-model §2 / §3 と BE-001 / BE-014 の置き場を直す。
- **根拠**: Principle I (Verification: グラフ検証)、`.dependency-cruiser.js:302-309`、`match.ts:20-28`。
- **scope 根拠**: 新設ファイルの分け方なので本 feature で直せる。

### [Medium] 検査項目 15 (`WSL_FREE_DIRECTORIES`) の対象から `resume-service.ts` が外れても、気付く仕組みが無い。plan は「追加時に判断を強制される」と書いているが、そうなっていない (M-002) (scope: feature)

- **観察**:
  - plan 申し送り #15 (`plan.md:181`) は、「新しいファイルは追加時に判断を強制される」を根拠に `resume-service.ts` を実名で足すとしている。
  - 実際に対象の漏れを捕まえているのは `tests/docs/wsl-free-coverage.test.ts:59-64` だけで、拾うのは名前が `session*` / `enumerator*` のファイルに限られる。`resume-service.ts` はこの絞り込みに掛からない。
  - check.mjs 項目 15 (`scripts/constitution/check.mjs:767`) は、一覧に無いファイルを黙って飛ばす。
  - `services-not-to-io` (`.dependency-cruiser.js:252-256`) も実名の列挙で、漏れを検出するテストは無い。
- **同種事象探索**: `WSL_FREE_DIRECTORIES` をリポジトリ全体 (specs を除く) で引いて、使っているのは 3 か所。check.mjs:767、wsl-free-coverage.test.ts:41-76、eslint の注記。一覧が完全かを確かめているのは test の 1 か所だけで、名前の前方一致の条件付き。
- **リスク/影響**:
  - BE-012 が足しても、後の変更で消えたときに検出できない。
  - `resume-service.ts` は `transcriptService` と列挙のキャッシュを注入で受ける調停役で、`wsl.exe` を名指してはならない側にある。「違反が 0 件」ではなく「検査が 0 件」の状態になりうる (wsl-free-coverage.test.ts:10 が警告している病)。
- **推奨アクション**: BE-012 で次のどちらかを行う。
  - (a) `wsl-free-coverage.test.ts` の名前の絞り込みに `resume` を足す。
  - (b) `WSL_FREE_DIRECTORIES` に `src/main/app/resume-service.ts` があることを pin する `it` を足す。

  plan #15 の「追加時に判断を強制される」は「名前が `session*` / `enumerator*` のファイルだけ」に直す。
- **根拠**: Principle VI (項目 15 の検査対象)、AD-024 #2 (Automated の正本は scripts/constitution)。
- **scope 根拠**: 本 feature の新設ファイルに付く規則の hookup。

### [Medium] BE-001 / BE-012 のテスト表に、名前空間をまたぐ組み合わせの行が無い (M-003) (scope: feature)

- **観察**: `tasks.md:24` (BE-001 のテスト) が回す内容は次のとおり。
  - 所在からランタイムを決める行は `windows` → `host` / `wsl` D → `wsl:D` の 2 つだけ。
  - 出自は `matchFolder` の結果の種類で分けるだけ。
  - 出自の種類 (`host` / `wsl-inherited` / `wsl-from-unc`) × 列挙対象の所在の行列は回さない。
  - 「WSL の所在 × Win32 のランタイム」の行は、列挙対象の所在しか見ていない。
- **同種事象探索**: H-001 と同じクエリ。tasks の該当は `tasks.md:24` / `:47` の 2 件。
- **リスク/影響**: H-001 を直しても、その行を守るテストが無いと退行を検出できない。SC-003 の「全組み合わせ」が、列挙対象の所在 × config ディレクトリ × cwd の 3 次元に、出自の種類という 4 次元目が抜けたまま合格になる。
- **推奨アクション**: H-001 の推奨アクションの (a)〜(c) の 3 行を BE-001 の表に足す。SC-003 の計測経路の文言にも「cwd の出自の種類」を足す。
- **根拠**: spec SC-003、reviewer-base H の規則。
- **scope 根拠**: 本 feature のテスト。

### [Low] 稼働中の行のレコードに入れる `targetKey` は、ホームディレクトリの候補一覧の中の位置 (序数) から作られている。その値を「読むたびに決め直さない」で持ち続ける (L-001) (scope: feature)

- **観察**:
  - `data-model.md:280` は、決めた `targetKey` を新しい `ConversationRecord` に保存して再利用する。
  - `targetKey` は `${namespace}#${ordinal}` で (`src/domain/session/target.ts:41-43`)、序数は `/home/*` + `/root` を名前でソートした一覧の位置 (`src/main/infra/session/target-finder.ts:314-337`)。
  - アプリを起動している間に、ソート順で手前に来るホームディレクトリが増えると序数がずれる。保存した `targetKey` が別のユーザの config ディレクトリを指すようになる。
- **同種事象探索**: `targetKey` を `data-model.md` で引くと、保存して再利用するのは §1.3 / §5 の 9 / §8.1 の 3 か所。
- **リスク/影響**: 会話の id は UUID なので、別のディレクトリで同じ id の記録を読む実害はほぼ無い。結果は読み取りの失敗 (FR-013 で縮退) になる。
- **推奨アクション**: レコードには `targetKey` ではなく所在と「Provider の configDir の有無」を持ち、読むときに §8.1 の (1)〜(3) を引き直す。または、序数がずれうることを research R-08 に限界として書く。
- **根拠**: AD-004 (名前空間の識別を不透明な鍵に潰した後の取り違え)。
- **scope 根拠**: data-model §8.1 の 1 段落。

### [Low] 段 1 の「所在 → ランタイムの id」の対応を、data-model に表で書き直している。runtime domain の `locationNamespace` / `isSameNamespace` を使う形にしていない (L-002) (scope: feature)

- **観察**:
  - `data-model.md:147` と `research.md:62` は、対応を `windows` → `host`、`wsl` D → `wsl:D` の表で書いている。
  - 同じ対応は既に `locationNamespace(location)` + `isSameNamespace(r.id, ns)` にある (`match.ts:116-117`。ディストロ名の大小の正規化を含む)。
  - data-model は「同じ表を 2 つ持たない」を runtimes の集合にしか当てていない。
- **同種事象探索**: H-001 と同じクエリで 2 件 (`data-model.md:147`、`research.md:62`)。
- **リスク/影響**: 実装者がこの表を文字列の組み立てで書くと、ディストロ名の綴りの正規化 (`canonicalDistroName`) と食い違う。結果、実行中のディストロが `runtime-missing` に落ちうる。
- **推奨アクション**: 段 1 を「`locationNamespace(target.location)` と `isSameNamespace` で `runtimes` から引く (`matchFolder` 第 1 段と同じ関数)」と書き換える。
- **根拠**: runtime charter (名前空間の判定は runtime domain の関数)、`match.ts:14-18`。
- **scope 根拠**: data-model の 1 行。

## 担当観点ごとの結果

- **PB-1** (IPC・永続化の境界でパスの型が消える): H-001 と L-001 を参照。
  - DTO (C-1 / C-4) は不透明な id と理由のキーだけで、パスと configDir を含まない (`contracts/ipc-session-resume.md:25`, `:64`)。
  - 永続化するものは無い (Principle X)。
- **PB-2** (ランタイムの単一インスタンス仮定): 該当なし。
  - 単数で持つのは `host` だけで、これは型で単一 (`src/domain/runtime/descriptor.ts:36`)。WSL は `wsl:D` を鍵にした複数インスタンスのまま。
  - 退避の表と `inFlightConversations` の鍵は Closta の `sessionId` / 会話の UUID。「現在のランタイム」を持つグローバル変数やシングルトンは設計に無い。
- **PB-3** (`capabilities` の虚偽表明): 該当なし。capability の表明を変えない。Win32 の `claudeStatus` の判定は起動ゲート (`launch-preparation.ts:141-146`) をそのまま通る。
- **PB-4** (権限ゲートの迂回): 該当なし。
  - 再開の入口 (`resumeSession` の IPC、再開ダイアログでのプリセットの適用) はどれも `checkLaunchConfig` → `prepareLaunch` → `buildQueryOptions` の安全 3 値の assert を通る。
  - 安全 3 値は `default` / `plan` / `dontAsk` (`src/domain/session/launch-config.ts:21-25`) で、`autoModeSafe` に依存するモード (Auto / bypass) を含まない。
  - `already-running` は起動しないので、権限の状態を変えない。
- **PB-5** (多段のパス変換の欠落):
  - cwd の変換は今の `resolveCwd` / `resolveFolderRuntime` を共有し、段数は変わらない。
  - `--resume <uuid>` は SDK の args として `wsl.exe --exec` の後ろに付くだけで、UUID の検査が 3 か所にある (`data-model.md:24-32`)。
  - 生の cwd と起動の cwd の対称性は H-001 を参照。
- **PB-6** (実質的な永続環境の構築): 該当なし。追記するのは `claude` 自身で、既存の transcript に書く。ボリューム、`--restart`、ディストロへの書き込み、ホームへの設定ファイルの生成は設計に無い。
- **PB-7** (lint ルール自体の網羅性): M-001 と M-002 を参照。
  - 新設の `src/domain/session/resume.ts` は、ディレクトリ指定の `domain-not-to-io` / `WSL_FREE_DIRECTORIES` (`src/domain/session/`) の対象に自然に入る。
  - renderer の新設 2 ファイルは `ui-not-to-core` / `ui-not-to-app` の対象に入る。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `列挙対象の所在\|所在が \`windows\`\|wsl-from-unc` (specs/021) | 4 (+tasks 2) | data-model.md:147, research.md:62, spec.md:184, spec.md:224, tasks.md:24, tasks.md:47 |
| M-001 | `from '@domain/(capability\|session/match\|provider/helper-path)'` (src/renderer) | 31 | 全部 `@domain/capability` (例: src/renderer/src/features/session/LaunchDialog.tsx, running-session-store.ts) |
| M-002 | `WSL_FREE_DIRECTORIES` (specs を除く全体) | 3 か所で使用 | scripts/constitution/check.mjs:767, tests/docs/wsl-free-coverage.test.ts:41-76, eslint.config.mjs:106 |
| M-003 | H-001 と同じ | 2 | tasks.md:24, tasks.md:47 |
| L-001 | `targetKey` (data-model.md) | 3 | data-model.md §1.3 (:58), §5 の 9 (:206), §8.1 (:280) |
| L-002 | H-001 と同じ | 2 | data-model.md:147, research.md:62 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 2
