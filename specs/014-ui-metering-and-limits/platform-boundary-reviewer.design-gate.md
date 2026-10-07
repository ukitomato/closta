# platform-boundary-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2 (前回: design-gate R1 2026-10-04 / `design-gate.md.20261004T063000`)

## 初回読了 viewpoint

- FR/SC (本 reviewer の担当範囲で影響を受けるもの):
  - FR-001 / FR-002 — 失敗の理由のキーは状態通知の `reasonKey` として main を通る。`isLaunchFailureReason` が追随するので main の差分は 0 (`src/domain/session/status-update.ts:39`。main に `Record<LaunchFailureReason,…>` は無い)
  - FR-003 — `meter` は `emit` で文字列にされて調停役スレッドを通り、調停役は中身を解釈しない (`src/agents/sdk-agent-session.ts:300-301`)
  - FR-005 — `meters.permissionMode` を起動の設定やプリセットに書き戻さない (PB-4)
  - FR-010 / US-4 AC1a — U-6 の警告の帯 (Principle III の逸脱の信号)
  - SC-002 / SC-004 / SC-006
- 該当する charter / Confirmation:
  - isolation charter: `:30-33` 権限ゲート / `:41` 隔離状態の可視化ポリシー / `:119` 隔離状態は一目で分かること
  - runtime charter: `:113-114` capabilities を正直に表明し、確認していないことを `true` に丸めない
  - AD-003 Decision Outcome (複数インスタンス。`runtimeId` で引く)
  - AD-041 (a)、Consequences `:157`、Confirmation `:169`
  - AD-047 Decision 5
  - Principle III / VII
  - `scripts/constitution/check.mjs` 項目 16 / 18、`.dependency-cruiser.js` の agents 系の規則
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`modelId` の文字種の規則も同 reviewer)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

O-7 / O-3 の後の main に載せ直した O-4 の design (spec / plan / data-model / research / tasks / quickstart) を見た。

確かめた結果、次の点は守られている。
- 計量は port の上の `SessionEvent` の `meter` で運ばれ、main と調停役スレッドを経由しない。調停役は解釈しない
- 新設の agents のモジュール (`live-signals` / `meter-throttle`) は `run()` の closure に作る。ディレクトリの正規表現の規則 (`.dependency-cruiser.js:193,200,207` / `allowlists.mjs:363,481,483`) に自動で入る
- 昇格値の綴りは domain の `meter.ts` に置き、項目 16 に例外を足さない
- `meters.permissionMode` は起動の設定・プリセットに書き戻さない
- 隔離の文言は表示用の `autoModeStatus` を使い、`autoModeAllowed` を表示に使わない

R1 の指摘 7 件のうち 6 件は手当てされた。残る問題は Principle III の逸脱の信号 (U-6) の 2 点。
- **入力**: 権限モードを `status` の省略可能なフィールドだけから読み、SDK がターンごとに必ず送る `init` の `permissionMode` を読まない
- **文言**: 隔離の文言がランタイムの能力をセッションの隔離状態として扱っている

## Findings

### [High] U-6 の警告の帯 (AC1a / P1) が権限モードを `status` の省略可能な `permissionMode` だけから読み、SDK がターンごとに必ず送る `system/init` の `permissionMode` を読まない (H-001) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:65`: 許可リストで権限モードを読む行は `system` / `status` の `permissionMode` だけ。`init` の行が無い
  - `C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts:5467-5477`: `SDKStatusMessage.permissionMode?` は省略可能
  - 同 `:5479-5503`: `SDKSystemMessage` (`init`) は「各ターンの最初に、そのターンの他のどのメッセージよりも先に」送られ、`permissionMode: PermissionMode` は**必須**
  - `C:\dev\closta\specs\014-ui-metering-and-limits\plan.md:280` RK-09: `init` を比べるのは「`status` で届かなかったら O-5 の行に送る」の条件付き。確かめ方の V-4 #5 (`quickstart.md:32`) は `plan` → ExitPlanMode の安全な遷移 1 つを利用者が手で見るだけ
  - `C:\dev\closta\docs\ui-coverage.md:49`: `init` の行は Tier B で、根拠は「起動の設定は起動のダイアログで利用者が選んでいる」。この前提は U-6 が確かめようとしているものそのもの
- **同種事象探索**: `init` (014 の 6 文書) は 1 件 (`plan.md:280`)。`permissionMode` (sdk.d.ts) は 4 件 (`:91, :1844, :5471, :5503`)。agents で `init` を扱う分岐は 0 件 (`sdk-agent-session.ts:543-558` は `permission_denied` と Hook / task だけ)
- **リスク/影響**: 強制はしない (AD-047 Decision 5) ので、昇格を知らせるのはこの帯だけである。次の 2 つは `status` が出たときしか検知できない。
  - 起動の直後から安全 3 値の外で動いているセッション
  - `status` を伴わずにモードが変わる経路 (PermissionRequest hook の `setMode` など。利用者の settings は `settingSources` の既定で全部読まれる。`sdk.d.ts:2092`)

  SDK がターンごとに必ず送る報告は手元にあるのに使っていない。そのため P1 として扱う AC1a の網羅性が、実機の手作業 1 つの結果だけに懸かっている
- **推奨アクション**:
  - data-model §2 の許可リストに `system` / `init` の行を足す。読むのは `permissionMode` だけ。`cwd`・`plugins[].path`・`tools`・`mcp_servers`・`model` などは読まない (RuntimePath を運ばない。PB-1)。`status` と同じく `toPermissionModeKey` → `modeBaseline` と比べ、違えば `permission-mode` の meter と行を出す
  - plan の RK-09 を「`init` と `status` の両方で比べる」に直し、O-5 への条件付きの申し送りをやめる
  - BE-040 のテストに次を足す: `init` が起動時と同じモードなら何も送らない、`init` が昇格値なら meter と行が 1 つずつ、`status` の直後の同じモードの `init` では重複しない
  - `docs/ui-coverage.md:49` の備考に「`permissionMode` は O-4 が比較に使う (表示は権限モードの行)」と書く (SH-012)
- **根拠**: Constitution Principle III / AD-041 Consequences (昇格経路 0 件) / AD-047 Decision 5 / isolation charter `:119`
- **scope 根拠**: data-model §2・plan RK-09・tasks BE-040 は本 feature の文書で直せる

### [High] 警告の帯の隔離の文言が、ランタイムの能力 (`autoModeStatus`) をセッションの隔離状態として扱っている。主な開発ホストでは `allowed` になり、隔離の文言が出ない (H-002) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:169`: `autoModeStatus` が `unavailable` なら「隔離がありません」、`undetermined` なら「確かめられていません」を添え、`allowed` では何も添えない。spec `:70` / `:151` はこれを「隔離の無いランタイムでは文言を強める」と書く
  - `C:\dev\closta\src\domain\runtime\capabilities.ts:72,85-90,165-169`: `allowed` は「ランタイムに bubblewrap がある」ことしか意味しない
  - アプリがセッションで Claude Code の sandbox を有効にする経路は無い: `C:\dev\closta\src\agents\session-core.ts:46-55` の `QUERY_OPTION_KEYS` に `sandbox` が無く、`:142` の `settings` は helper の 2 キーに限られる。`src/agents` の `sandbox` は 0 件
  - `C:\dev\closta\docs\domains\runtime\charter.md:198-200`: 計測環境 (主な開発ホスト) は `sandbox: 'bubblewrap'` なので、ふつうの構成では `allowed` になる
  - 可視化の持ち主は I-2 (`docs\roadmap.md:372`「隔離可視化」)。O-4 からの申し送りは I-3 への「強制の要否」だけ (plan.md 申し送り #8)
- **追加事実 (R1 M-001 から High に上げる根拠)**:
  - (1) アプリは sandbox を有効にする経路を持たない (上記 `session-core.ts:46-55,142`)
  - (2) 主な開発ホストのランタイムは `allowed` を表明する (runtime charter `:199`)
  - (3) R1 の時点では対応づけが未確定だった。今回の data-model `:169` で、`allowed` には何も添えないと確定した

  R1 は「誰が決めるか」の指摘だったが、今回は「表示の意味が事実と違う」という観察事実である
- **同種事象探索**: `unsafeModeNoIsolation|unsafeModeIsolationUnknown|autoModeStatus|隔離の無いランタイム` (014) は 7 件 (`data-model.md:169,233`、`plan.md:64,91,213`、`spec.md:70,151`) と `tasks.md:105`。`sandbox` (src/agents) は 0 件
- **リスク/影響**: 帯が出るのは「アプリが選んでいない権限モード (例: すべて許可) で動いている」異常のときである。いちばん重い場面で、主な構成では「隔離がありません」が出ない。利用者は隔離されていると推測しうる。これは次の 2 つの規則に反する。
  - isolation charter `:119`「隔離されているかどうかを利用者が推測する必要があってはならない」
  - runtime charter `:113-114`「確認していないことは `unknown` として表明し、`true` に丸めない」

  セッションの隔離はアプリが確認していない (利用者の settings で sandbox が有効でも、アプリは観測しない)。その値を、ランタイムの能力の `true` で事実上「隔離あり」に丸めている
- **推奨アクション (最小)**:
  - data-model §4 `:169` を次のように直す: `unavailable` → `unsafeModeNoIsolation`。`allowed` / `undetermined` → 「このセッションの隔離をアプリは確かめていません」(`unsafeModeIsolationUnknown` の文言をセッションの主語に)
  - §5 `:233` の文言と FE-040 のテスト (`tasks.md:106` の「隔離の 3 状態の文言」) を、`allowed` でも「確かめていません」が出る形に直す
  - roadmap の I-2 の行 (`:372`) と I-3 の行に「O-4 の警告の帯の隔離の文言は暫定でランタイムの `autoModeStatus` から導く。セッションの隔離状態 (隔離バッジ) が定義されたら置き換える」を足す (SH-013)
  - glossary の「権限モードの警告の帯」に、隔離の文言はセッションの隔離状態ではないと 1 行書く
- **根拠**: isolation charter `:41` / `:119`、runtime charter `:113-114`、Principle III、AD-047 Decision 5 (原因を断定しない)
- **scope 根拠**: data-model §4 / §5、tasks FE-040 / SH-013 で直せる。isolation charter 本体は変えずに、roadmap への申し送りで足りる

### [Low] 項目 16 の昇格値の検査は引用符の 2 形しか見ない。O-4 は 6 値の権限モードを agents に通す最初の feature である (L-001) (scope: system)

- **観察**:
  - `C:\dev\closta\scripts\constitution\check.mjs:875-880`: 照合は `'value'` と `"value"` の 2 形だけ。テンプレートリテラル・素のオブジェクトキー (`{ bypassPermissions: … }`)・`case` に backtick で書く形は見ない
  - `C:\dev\closta\tests\rule-fixtures\expected.mjs:821-838` の `UNDETECTED_NOTES` は計算キーと反射 API だけを挙げ、この 2 形を挙げていない
  - plan `:64` / tasks BE-004 (`tasks.md:47`) は「`src/agents/` に昇格値の綴りを置かない」の担保を項目 16 に頼っている
- **同種事象探索**: `includes(\`'${value}'\`)` は 1 件 (`check.mjs:876`)。昇格値の引用符付きリテラル (src の非テスト) は 0 件
- **リスク/影響**: load-bearing gate は `SafePermissionMode` 型と `assertSafePermissionMode` であり (expected.mjs `:828-831`)、query の権限面は塞がれている。ただし O-4 の不変条件 (agents に綴りを置かない) は、この 2 形で書かれると黙って破れる
- **推奨アクション**: BE-004 の項目 16 の注記に「テンプレートリテラル・素のキーでも書かない (検査は引用符の 2 形しか見ない)」を足す。`UNDETECTED_NOTES` に 1 項目足すか、照合に backtick を足すのは I-3 の項目 16 の作り直しでまとめてよい
- **根拠**: Principle III / AD-041 (a) / PB-7
- **scope 根拠**: 規則の穴そのものは既存。本 feature で直せるのは tasks の注記だけ

### [Low] `dispose()` の後の呼び出しで間引きが再び動きうる。異常終了の経路のテストが無い (L-002) (scope: feature)

- **観察**:
  - `C:\dev\closta\src\agents\sdk-agent-session.ts:415-418`: `fatalSink` は stream のループが動いている間に `finish()` を呼ぶ
  - `:342-356`: `finish()` は子の exit を最大 2 回 × 3 秒待ってから `ended` を送る。待っている間もループはメッセージを処理しうる
  - data-model `:110` / tasks BE-041 (`:111`) は、`dispose()` の時点の保留と timer を捨てることしか定めていない。その後の `on*` を受けないことは定めていない
- **同種事象探索**: `finish()` の呼び出しは 4 件 (`sdk-agent-session.ts:417,462,482,572`)。ループの外から呼ぶのは 3 件
- **リスク/影響**: 異常終了の経路で、`ended` の後に `tool-elapsed` などの `event` が出うる (SC-004 の「`ended` の後の `event` 0 件」に反する)。renderer は閉じた id の meter を捨てるので、実害は小さい
- **推奨アクション**: `dispose()` で `disposed` の印を立て、以後の `on*` と timer を張る処理を何もしないようにする。BE-041 / BE-042 のテストに「`dispose()` の後に `onToolProgress` / `onSystem(thinking_tokens)` を呼んでも timer が張られず、何も送られない」を足す
- **根拠**: AD-043 (セッションスレッドの出口は 1 つ) / SC-004 / R1 M-004 の残り
- **scope 根拠**: data-model §2 と tasks BE-041 / BE-042 で直せる

### [Low] 昇格の観測は renderer のメモリにしか残らず、I-3 が強制の要否を決める材料が集まらない (L-003) (scope: feature)

- **観察**: 帯・行・`meters.permissionMode` はどれも永続化せず、`close()` で消える (data-model §2 `:113-128`)。状態通知のフィールドの差分は 0 (SC-006)。plan 申し送り #8 は I-3 に「強制の要否」だけを送る
- **同種事象探索**: `I-3` (plan.md) は申し送り #8 と Domain Context の 2 か所
- **リスク/影響**: 「昇格経路 0 件」(AD-041) の逸脱がいつ・何回起きたかを後から確かめる観測点が無い。I-3 の判断が実機の手作業 (V-4 #5) だけに依る
- **推奨アクション**: roadmap の I-3 の行に「O-4 は昇格の観測を記録しない (renderer のメモリだけ)。強制の要否を決めるときに観測点を足すかを決める」を足す (SH-013)。コードは変えない
- **根拠**: AD-041 Consequences / AD-047 Decision 5
- **scope 根拠**: roadmap の字面の追加で足りる

### 該当なしの固有観点

- **PB-1**: 該当なし。`meter` と失敗の理由のキーはパスを運ばない。H-001 で `init` を読むときは `cwd` / `plugins[].path` を読まないこと (推奨アクションに含めた)
- **PB-2**: 該当なし。`live-signals` / `meter-throttle` は `run()` の closure に作る (data-model `:89`)。renderer の保持は sessionId をキーにする。隔離の文言はランタイムの一覧を `runtimeId` で引き (`RunningSessionsProvider.tsx:59` と同じ形)、引けなければ `undetermined` になる
- **PB-3**: ランタイムの capabilities の表明は変えない。表明された能力の使い方は H-002
- **PB-5**: 該当なし。パスの変換を扱わない
- **PB-6**: 該当なし。子プロセス・ファイル・環境を変えない。計量を永続化しない
- **PB-7**: 新設のモジュールはディレクトリの正規表現で規則に入る。`supervisor` で始まらず、`worker_threads` も使わない。`tests/meter/` の通しのテストが agents を import するのは、規則の対象外の `tests/` からなので問題ない。穴は L-001

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `init` (014 の 6 文書) | 1 | plan.md:280 |
| H-001 | `permissionMode` (sdk.d.ts) | 4 | sdk.d.ts:91, 1844, 5471, 5503 |
| H-001 | agents の `init` の分岐 | 0 | sdk-agent-session.ts:543-558 (permission_denied と Hook / task だけ) |
| H-002 | `unsafeModeNoIsolation\|unsafeModeIsolationUnknown\|autoModeStatus\|隔離の無いランタイム` (014) | 8 | data-model.md:169, 233 / plan.md:64, 91, 213 / spec.md:70, 151 / tasks.md:105 |
| H-002 | `sandbox` (src/agents) | 0 | — (QUERY_OPTION_KEYS session-core.ts:46-55 に無い) |
| L-001 | `` includes(`'${value}'`) `` (check.mjs) | 1 | check.mjs:876 |
| L-001 | 昇格値の引用符付きリテラル (src の非テスト) | 0 | — |
| L-002 | `finish()` の呼び出し | 4 | sdk-agent-session.ts:417, 462, 482, 572 |
| L-003 | `I-3` (plan.md) | 2 | plan.md:91, 157 (申し送り #8) |

## Verdict

- Critical: 0
- High: 2
- Medium: 0
- Low: 3
- Round inheritance:
  - R1 から解消 6 件:
    - H-001 → U-6 / AD-047 Decision 5
    - M-002 → data-model §2 の `Equal` と項目 16
    - M-003 → FE-004 の `close()`
    - M-004 → data-model §2 の取り消し。残りは L-002
    - L-001 → closure の表
    - L-002 → 書き戻さない
  - 未解消 1 件: M-001 → H-002 (追加事実つきで High に上げた)
  - 新規 4 件: H-001 / L-001 / L-002 / L-003

関連ファイル:
- C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md
- C:\dev\closta\specs\014-ui-metering-and-limits\plan.md
- C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md
- C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts
- C:\dev\closta\src\agents\session-core.ts
- C:\dev\closta\src\agents\sdk-agent-session.ts
- C:\dev\closta\src\domain\runtime\capabilities.ts
- C:\dev\closta\scripts\constitution\check.mjs
- C:\dev\closta\tests\rule-fixtures\expected.mjs
- C:\dev\closta\docs\roadmap.md
- C:\dev\closta\docs\ui-coverage.md
