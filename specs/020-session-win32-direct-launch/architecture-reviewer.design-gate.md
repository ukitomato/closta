# architecture-reviewer Review: Feature Specification: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-20T12:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-006 はすべてこの feature の範囲。architecture の観点で重いのは次のとおり。
  - FR-009 / SC-005: 判定と起動の一致。round 1 の修正で data-model §6.4 と §8 の extraEnv の表が足された
  - FR-008: Win32 の許可リストと、Provider が上書きしてよいキー
  - FR-014: agents が Windows 固有のリテラルを持たないこと
  - FR-015: 記録先
  - FR-016 / SC-006: WSL の振る舞いを変えないこと
- touched files に該当する charter / Confirmation:
  - session charter (X-8 の項)
  - runtime charter (`docs/domains/runtime/charter.md:148` Related ADRs / `:163` Related Specs)
  - provider charter (KPI「到達可能性判定の正しさ」)
  - `_overview.md` の帰属の判断根拠
  - AD-036 §3 / §6、AD-018 §3 / §4、AD-043 Decision 5、AD-041 (e) / (h)、AD-025「X-1 へ」、AD-031
  - AD-058 (proposed) の Decision 1 / 5 と Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: `runtime-settings.json` のスキーマは database-reviewer、文言は ux-reviewer が見る
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0
  - H-101 の検出漏れは、BE-011 / BE-041 / FE-040 のテストが誤った期待値を固定している点にある。これは H-101 の cascade 先に含めたので、ここでは別の件として数えない
  - round 1 の M-003 (SC-005 の表の extraEnv の行) は data-model §8 と BE-040 で解消した

## スコープ要約

round 1 からの変化は 4 点ある。
- **判定の側の述語**: data-model §6.4 で、`assessReachability` にランタイムの種類ごとの transport の禁止キーの述語を注入した。AD-058 Decision 5 も同じ内容に直した
- **上書きしてよいキー**: §6.1 にネットワークの 4 キー (`WIN32_PROVIDER_OVERRIDABLE_KEYS`) を置いた。この 4 キーは Provider の値がホストの値に勝つ
- **停止の引数の正本**: domain の定数 `WIN32_TREE_STOP_ARGS` にした
- **`windowsHide`**: `Win32LaunchSpec` に載せ、FR-014 を「agents は渡された値を検査して実行するだけ」に絞った

layering は AD-036 §3 / §8 と AD-023 に揃っており、`makeForbiddenForwardKey` は大文字小文字を区別せずに照合する (`src/domain/provider/forward-env.ts:110-113`)。round 1 の H-001 / M-003 は解消した。残る問題は 2 つ。
- round 1 の修正で入った「上書きしてよいキー」が、名前空間に依存するパスの値 (`NODE_EXTRA_CA_CERTS`) を含んでいる
- FR-014 / AD-058 Decision 1 の「agents はリテラルを持たない」と、§5.2 の decoder の規則が食い違っている

## Findings

### [High] `NODE_EXTRA_CA_CERTS` を「Provider が上書きしてよいキー」にしたので、Win32 では Provider の WSL のパスがホストの正しい Windows のパスを上書きする。到達可能と出て起動も通るのに、社内 CA が効かなくなる (H-101) (scope: feature) [new]

- **観察**:
  - `data-model.md:234-237` (§6.1) は、`NODE_EXTRA_CA_CERTS` を `WIN32_PROVIDER_OVERRIDABLE_KEYS` に入れて「Provider の値がホストの値に勝つ」とする。理由は「WSL の起動では Provider の値がそのまま届く」である。`data-model.md:323` (§8) は win32 × `NODE_EXTRA_CA_CERTS` を「`reachable` / 通り、Provider の値がホストの値に勝つ」と期待値にしている。`AD-058:45` (Decision 5) も同じ内容
  - 一方、登録時の検証は extraEnv の値が Windows のパスの形なら拒否する (`src/domain/provider/forward-env.ts:213` の `isWindowsPathValue`)。導出も同じ値で `null` を返す (`src/domain/provider/derive-env.ts:71`)
  - したがって、保存済みの Provider の `NODE_EXTRA_CA_CERTS` の値は、必ず WSL の中の POSIX のパス (例 `/usr/local/share/ca-certificates/corp.pem`) である
  - Win32 の `claude.exe` (Node) は、この値を現在のドライブ基準の `\usr\local\...` として読む。ファイルが無いので、追加の CA は読まれない (Node は警告を出して続ける)
  - `research.md:133-134` は、Win32 ではホストの env が社内 CA の唯一の出所だと書いている。§6.2 の重ね方では、ホストの正しい値 (Windows のパス) を Provider の WSL のパスが消してしまう
  - `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` の値は URL とホスト名の並びで、名前空間に依らない。問題になるのは `NODE_EXTRA_CA_CERTS` だけである
- **同種事象探索**: `NODE_EXTRA_CA_CERTS` を specs/020/*.md と AD-058 で探した。設計の箇所は 7 件。
  - data-model.md:230, :235, :236, :323
  - research.md:133
  - tasks.md:39 (BE-011 のテスト「`NODE_EXTRA_CA_CERTS` を Provider が持つと Provider の値がホストの値に勝つ」)
  - tasks.md:83 (BE-041 の同じ期待)
  - AD-058:45 にもある
  - 値の形の制約の出所: src/domain/provider/forward-env.ts:185-187, :213、derive-env.ts:71
- **リスク/影響**:
  - TLS を検査する proxy の配下で使う Provider (round 1 で守ろうとした利用者) が、Win32 で選択肢に出て起動も通る。しかし API に届かない (証明書のエラー)
  - provider charter の KPI「到達可能性判定の正しさ」と、FR-009 / US-4 の「到達可能と出たのに起動で失敗することが無い」の趣旨に反する。判定の一致を env のキーの名前だけで見ていて、値の名前空間を見ていない
  - テスト (BE-011 / BE-041) がこの誤りを正しい振る舞いとして固定している
- **推奨アクション** (最小案を先に置く):
  - (a) 最小案: `WIN32_PROVIDER_OVERRIDABLE_KEYS` を `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` の 3 つにする。`NODE_EXTRA_CA_CERTS` は Win32 の transport のキーに戻す
    - ホストの値は許可リストで渡る
    - extraEnv に `NODE_EXTRA_CA_CERTS` を持つ Provider は、§6.4 で Win32 では到達不可になる
    - 理由の文言で、WSL の CA のパスは Win32 で使えないことを示す
  - (b) 別案: Win32 では Provider の `NODE_EXTRA_CA_CERTS` を重ねず、ホストの値を使う。ただし「黙って捨てない」(data-model §6.3) に反するので、採るなら利用者の判断が要る
  - どちらでも cascade 先を同じ変更で直す: data-model.md:234-238 / :323 / §11 の「4 キー」、AD-058:45、research.md:140-141、tasks.md:39 (BE-011 の pin を 3 キーにし、`NODE_EXTRA_CA_CERTS` は throw の側へ)、tasks.md:82-83 (BE-040 の SC-005 の行・BE-041)、tasks.md:85 (FE-040)、plan.md:20 / :58 / :238、tasks.md:15 (SH-001 の glossary の「ネットワークの 4 キー」)
- **根拠**:
  - provider charter KPI
  - spec FR-009 / US-4
  - AD-041 (e) の「判定と実行の一致」
  - `forward-env.ts:185-187` の「`/u` 転送はパス変換をしない」(値が名前空間に依存するという既存の前提)
- **scope 根拠**: round 1 の修正で入った data-model §6.1 / AD-058 Decision 5 の中で直せる

### [High] FR-014 と AD-058 Decision 1 は「agents は Windows 固有の値をリテラルで持たない」とするのに、§5.2 の decoder は agents の中に `taskkill.exe` と `.exe` のリテラルを持つ。ADR の Decision 1 の中でも食い違っている (H-102) (scope: feature) [new]

- **観察**:
  - `spec.md:184` (FR-014, MUST) と `plan.md:80` は「agents は…プラットフォームを判定せず、Windows 固有の値をリテラルで持たない」とする。`AD-058:31` (Decision 1) も「リテラルを持たない」と書く
  - ところが、同じ Decision 1 の末尾は「agents は `stop.command` の末尾の名前が `taskkill.exe` であることも検査する」としている
  - `data-model.md:204` (§5.2) は、agents の `decodeLaunchSpec` で basename を `taskkill.exe` と比べる。`:197` は `.exe` で終わることを agents で検査する。contracts C-4 (`ipc-win32-claude.md:65`) と tasks BE-010 (`tasks.md:36-37`) も同じ規則である
  - 停止の引数は、round 1 で domain の定数 `WIN32_TREE_STOP_ARGS` (`data-model.md:137`) に移した。同じ扱いが実行ファイルの名前には行われていない
- **同種事象探索**: `taskkill\.exe|\.exe\` で終わる` を specs/020 (round 1 の退避ファイルを除く) と contracts で探した。agents の検査に当たるのは 4 件: data-model.md:197, :204、contracts/ipc-win32-claude.md:65、tasks.md:37。AD-058:31 にもある。infra の組み立て (data-model.md:181) は FR-014 の許す側なので対象外
- **リスク/影響**: 書かれたとおりに作ると、FR-014 (MUST) の文面に反するコードになる。pr-gate で platform-boundary の指摘になる。正本が 2 つに割れる (infra の `hostPathOps.join(root, 'System32', 'taskkill.exe')` と agents の比較の文字列)
- **推奨アクション**:
  - `WIN32_TREE_STOP_ARGS` の隣 (`src/domain/session/agent-session.ts`) に `WIN32_TREE_STOP_COMMAND_NAME = 'taskkill.exe'` を置く。§5.1 の組み立てと §5.2 の検査の両方がこれを使う
  - `pathToClaudeCodeExecutable` の `.exe` の検査は、domain の `classifyClaudeExecutable(raw) === 'exe'` を呼ぶ形にする (round 1 の L-004 も同時に閉じる)
  - AD-058 Decision 1 の末尾を「`stop.command` の末尾の名前は domain の定数と比べる」に直す
  - cascade 先: data-model.md:197 / :204 / §11 の pin の行、contracts:65、tasks.md:27 (BE-003 の定数と pin)、:37 (BE-010)、:39 (BE-011)、AD-058:31
- **根拠**: spec FR-014、AD-058 Decision 1、Constitution Principle II (の spec 側の厳格化)
- **scope 根拠**: data-model §5 / §5.2 と BE-003 / BE-010 の中で直せる

### [Medium] `configDirRuntimePath` (RuntimePath という名前) に Win32 の HostPath を入れる。glossary の RuntimePath の定義と食い違う (M-001) (scope: feature) [unresolved from prev]

- **観察**: `data-model.md:317` は変わらず「名前は変えない。research R-08」である。`tasks.md:81` (BE-040) も同じ。`tasks.md:15` (SH-001) は RuntimePath の項を直す対象に入れていない。`src/domain/provider/derive-env.ts:48` / `:112` の注記「RuntimePath でなければならず」「素の HostPath を載せない」も直す対象に無い
- **推奨アクション**: round 1 と同じ。改名するか、SH-001 に RuntimePath の Counterexample を足し、derive-env.ts:48 / :112 の注記の修正を BE-040 に足す
- **根拠**: Principle XIV、AD-004

### [Medium] provider charter と `_overview.md` の帰属の判断根拠に記録が無い (M-002) (scope: feature) [unresolved from prev]

- **観察**:
  - `spec.md:185` (FR-015) と `tasks.md:89-94` (SH-010) の記録先は、session charter・runtime charter・`_overview.md` の状態・roadmap だけである
  - 今回の round で provider domain への変更が増えた: `assessReachability` に第 3 引数が加わり、extraEnv の衝突で到達不可になる (§6.4)
  - それでも `docs/domains/provider/charter.md` に `X-8|020` は 0 件
- **推奨アクション**: round 1 と同じ。SH-010 に provider charter の Related Specs と、`_overview.md` の帰属の判断根拠の 1 項を足す
- **根拠**: provider charter:134-141 の先例

### [Low] SH-010 / plan の runtime charter の行番号が逆で、frontmatter の更新も無い (L-001) (scope: feature) [unresolved from prev]

- **観察**:
  - `tasks.md:91` と `plan.md:111` は、今も「Related Specs (`:148`)・Related ADRs (`:163`)」としている
  - 実際は `docs/domains/runtime/charter.md:148` が `## Related ADRs`、`:163` が `## Related Specs` である
  - runtime charter の frontmatter の更新も書かれていない

### [Low] data-model §6.3 は「和集合の見直しは AD-058 Decision 5 に書く」としているが、Decision 5 に I-1 への申し送りが無い。AD-025 の「X-1 へ」は検証されないまま閉じる (L-002) (scope: feature) [unresolved from prev]

- **観察**:
  - `data-model.md:266` と `plan.md:184` は、AD-041 (h) の「I-1 で transport が増えたら和集合」の行き先を AD-058 Decision 5 に置く
  - しかし `AD-058:26` / `:45` は「登録時は広げない」と書くだけで、I-1 での見直しの持ち主を書いていない
  - `AD-058:27` は今も「検証の義務は X-8 で閉じる」

### [Low] FR-008 は許可リストの正本を「plan / ADR に 1 つ」とするが、実際の正本は data-model §6.1 (L-003) (scope: feature) [unresolved from prev]

- **観察**: `spec.md:173` は変わらない。`data-model.md:220` は「この表が正本」、`AD-058:24` は data-model §6.1 を参照している

### [Low] agents の decoder が `.exe` の形の判定を `classifyClaudeExecutable` と別に持つ (L-004) (scope: feature) [unresolved from prev]

- **観察**: `data-model.md:197` は変わらない。H-102 の推奨アクションで同時に閉じられる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `NODE_EXTRA_CA_CERTS` (specs/020/*.md, AD-058) | 7 | data-model.md:230, :235, :236, :323, research.md:133, tasks.md:39, tasks.md:83 (+ docs/decisions/0058…md:45) |
| H-101 | `isWindowsPathValue` (src/domain/provider) | 3 | forward-env.ts:185, :213, derive-env.ts:71 |
| H-102 | `taskkill\.exe\|\.exe\` で終わる` (specs/020, contracts。agents の検査の行) | 4 | data-model.md:197, :204, contracts/ipc-win32-claude.md:65, tasks.md:37 (+ docs/decisions/0058…md:31) |
| M-002 | `X-8\|020` (docs/domains/provider/charter.md) | 0 | — |
| L-001 | `^## Related` (docs/domains/runtime/charter.md) | 2 | :148 (Related ADRs), :163 (Related Specs) |

## Verdict

- Critical: 0
- High: 2
- Medium: 2
- Low: 4
- Round inheritance: resolved from 1: 2 (H-001, M-003) / unresolved: 6 (M-001, M-002, L-001, L-002, L-003, L-004) / new: 2 (H-101, H-102)
