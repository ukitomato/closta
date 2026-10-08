# platform-boundary-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2 (code-gate iter 2。HEAD `8aed1db`、base `44ce810`)

## 初回読了 viewpoint

- FR/SC (本 reviewer の担当範囲で影響を受けるもの):
  - FR-003: `init` から読むのは `permissionMode` だけ (`src/agents/live-signals.ts:366-370`)。PB-1
  - FR-005: `meters.permissionMode` は `config` / `lastConfig` / プリセットに書き戻さない (`running-session-store.ts:177-178`)。PB-4
  - FR-010 / US-4 AC1a: 帯の隔離の文言は `autoModeStatus` から作る (`CenterBanners.tsx:71-76`、`RunningSessionsProvider.tsx:64-70`)。PB-3 / PB-4
  - FR-015 / AD-047 Decision 5 と訂正 #3: 昇格値の綴りは domain と renderer の文言の表にだけ置き、`src/agents/` には置かない (項目 16)。PB-7
  - SC-002 / SC-004 / SC-006: iter 1 から変化なし (`8aed1db` は agents / domain / main / preload に触れていない)
- 該当する charter / Confirmation:
  - isolation charter `:30-33` / `:41` / `:101-104` / `:119` / `:145`
  - runtime charter `:113-114`
  - Constitution Principle I `:372` / III `:450` / VII `:603-610`
  - AD-003 Decision Outcome `:42-46`、AD-004 Decision、AD-047 Decision 5 `:37` / Confirmation `:57-60` / 訂正 #3 `:78-85` / 追記 `:89`
  - `eslint.config.mjs:557-573`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外 (コントラストの修正は a11y-reviewer の範囲)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

iter 1 (`fc3a5fc`) の後に入った修正コミットは `8aed1db` だけで、pr-gate R1 の H-001 / H-002 / M-002 への対応。中身は次のとおり。

- `thread.aui.tsx`: 思考の印の className に `text-muted-foreground` を足した
- `CenterBanners.tsx`: 帯の 2 か所で `text-destructive` を `text-red-700 dark:text-destructive` に替えた
- `LivePane.progress.test.tsx`: class のテストを 1 つ足した
- AD-047: 末尾に 1 行の追記 (`:89`。Decision 4 / 5 の番号の注記)
- spec dir の gate の成果物

`eslint.config.mjs` の差分は iter 1 と同じ (`:561-567` で hooks の番人を戻す block に `tool-result-marks.tsx` を足しただけ)。`scripts/` / `.dependency-cruiser.js` の差分は 0。

この修正はどれもプラットフォーム境界に触れない。
- パス・ランタイムの識別子・`capabilities`・権限モードの判定点は変わっていない。`CenterBanners.tsx` の判定 (`:66-67`、`:72-76`、`:86`) は文字が同じで、変わったのは className の文字列だけ
- AD-047 の追記は番号の読み方の注記で、Decision 5 の中身 (強制しない・項目 16 に例外を足さない) は変えていない

iter 1 の本 reviewer の指摘 5 件 (M-001 / L-001 から L-004) は、HEAD でどれも直っていない。下で Read と Grep で確かめた結果を書く。新しく見つけた指摘は 0 件。

## Findings

### [Medium] quickstart の「形の控え方」がアプリの起動と条件を揃えていない (名前空間・`--permission-mode`・`--exec`)。V-4 は今も未実施 (M-001。iter 1 から未解決) (scope: feature)

- **観察**:
  - `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md:43` は「同じ `CLAUDE_CONFIG_DIR`」としか書いていない
  - `:44` は `claude -p "<短い依頼>" --output-format stream-json --verbose` のままで、`--permission-mode` も `wsl.exe --cd … -d … --exec` も無い。iter 1 から字面は変わっていない
  - `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart-results.md:52-68` では V-4 が「未実施」で、10 項目すべてが「未確認」。この手順は V-4 の前に使われる
- **同種事象探索**: quickstart.md で `CLAUDE_CONFIG_DIR|--permission-mode|--exec|wslpath|RuntimePath` を検索して 2 件 (:43, :52)。`--exec`・`wslpath`・`RuntimePath` は 0 件
- **リスク/影響**:
  - 画面に出るのは host 側の `HostPath | WslUncPath` (Provider の `configDir`) である。これを distro のシェルにそのまま写すと、AD-004 の名前空間の取り違えが人の手を介して起きる
  - `--permission-mode` を渡さないと、CLI は利用者の `defaultMode` で動く。Principle III / AD-041 (a) のゲートの外で tool が動きうる
- **推奨アクション**: `:43-44` を次の形に直す。
  - `CLAUDE_CONFIG_DIR` にはランタイムの中から見たパスを渡す (必要なら `wslpath -u` で変換する)
  - 実行は `wsl.exe --cd <cwd> -d <distro> --exec env CLAUDE_CONFIG_DIR=<RuntimePath> <claudePath> -p "<依頼>" --permission-mode <default|plan|dontAsk> --model <id> --output-format stream-json --verbose` の形にする
  - 依頼は tool を要さないものにする (または `plan` を使う)
- **根拠**: AD-004 / Principle I、Principle III / AD-041 (a) (e) (f)
- **scope 根拠**: 本 feature の spec 文書。design-gate MG-14 から持ち越している

### [Low] O-4 の暫定の隔離の文言のルールが isolation charter に記録されていない (L-001。iter 1 から未解決) (scope: feature)

- **観察**:
  - 対応のルールは ui の `C:\dev\closta\src\renderer\src\features\shell\CenterBanners.tsx:71-76` (`isolationSentence`) にある
  - `C:\dev\closta\docs\domains\isolation\charter.md:41` は「隔離状態の可視化ポリシー」を In scope に置いている。しかし `:145` の Related Specs は「未着手」のまま
  - charter は本 PR の touched files に入っていない
- **同種事象探索**: isolation charter で `O-4|autoModeStatus|014` を検索して 0 件。対応を組むコードは 1 か所 (`CenterBanners.tsx:72-76`)
- **リスク/影響**: I-3 が `SAFE_SANDBOX_KINDS` を移したり seccomp を織り込んだりしたとき、帯の「隔離がありません」の意味が黙って変わりうる。持ち主の charter を読むだけでは、その影響に気づけない
- **推奨アクション**: isolation charter の Related Specs か Open Questions に 1 行足す (O-4 が暫定の文言を `autoModeStatus` から出している。I-2 / I-3 で置き換える)。コードは変えない
- **根拠**: isolation charter `:41` / ui charter `:84` / AD-047 Decision 5
- **scope 根拠**: FR-016 (記録の追随) で直せる

### [Low] 項目 16 の昇格値の denylist が、SDK に固定した `PERMISSION_MODE_KEYS` とつながっていない (L-002。iter 1 から未解決) (scope: feature)

- **観察**:
  - `C:\dev\closta\scripts\constitution\allowlists.mjs:435` は手書きの `['bypassPermissions', 'acceptEdits', 'auto']` のまま
  - domain の `src/domain/session/meter.ts:23-31` は、`sdk-agent-session.ts:97-99` の `Equal<…>` で SDK の値域に固定されている。しかし allowlists.mjs の denylist と domain の値域を突き合わせるテストが無い
- **同種事象探索**: specs 以外で `PERMISSION_MODE_ESCALATION_VALUES` を検索して 3 件 (allowlists.mjs:435 / check.mjs:52, 875)。`tests/` と `*.test.ts` では 0 件
- **リスク/影響**: SDK が昇格モードを足したとき、domain と renderer の表は tsc で追随させられる。項目 16 の backstop だけが古いまま残る。実際の門は `SafePermissionMode` 型と `assertSafePermissionMode` なので、今の実害は無い
- **推奨アクション**: 次の等式を固定するテストを 1 つ足す。`PERMISSION_MODE_KEYS.filter(k => k !== 'unknown' && !isSafePermissionMode(k))` を並べ替えたもの = `PERMISSION_MODE_ESCALATION_VALUES` を並べ替えたもの
- **根拠**: PB-7 / Principle III / AD-041 (a)
- **scope 根拠**: 本 feature が `PERMISSION_MODE_KEYS` と `Equal<…>` を足したので、つなぐ場所ができた

### [Low] 昇格の観測を記録しないことが I-3 への申し送りに書かれていない (L-003。iter 1 から未解決) (scope: feature)

- **観察**: `C:\dev\closta\docs\roadmap.md:388` の「O-4 から」は、(1) 強制の要否と (2) 隔離の文言が暫定であることの 2 つだけを書いている。昇格の観測 (帯・行・`meters.permissionMode`) は renderer のメモリにしか残らず `close()` で消えるが、この点は書かれていない
- **同種事象探索**: roadmap.md で `昇格の観測|観測を記録|メモリだけ` を検索して 0 件
- **リスク/影響**: AD-041 の「昇格経路 0 件」から外れたことが、いつ・何回起きたかを後から確かめられない。I-3 が強制の要否を決める材料は、V-4 #5 (未確認) の手作業だけになる
- **推奨アクション**: roadmap:388 の (1) に「O-4 は昇格の観測を記録しない (renderer のメモリだけ)。強制の要否を決めるときに観測点を足すかも決める」を足す
- **根拠**: AD-041 Consequences / AD-047 Decision 5
- **scope 根拠**: docs/roadmap.md は本 PR の touched file

### [Low] 一覧はあるがセッションのランタイムがその一覧に無い場合に、`undetermined` に倒すことのテストが無い (L-004。iter 1 から未解決) (scope: feature)

- **観察**:
  - 倒し先の実装は `C:\dev\closta\src\renderer\src\features\session\RunningSessionsProvider.tsx:65-69` で、iter 1 から変わっていない
  - `C:\dev\closta\src\renderer\src\features\shell\CenterBanners.test.tsx` の `runtimeList(...)` は、どの呼び出しも同じ id の 1 件だけを返す (`:416`)。試しているのは `unavailable` / `allowed` / `undetermined` / 一覧が null の 4 つ (`:479-504`)
- **同種事象探索**: CenterBanners.test.tsx で `runtimeList|Debian` を検索して 9 件 (:416, 457, 466, 480, 489, 490, 530, 543)。別の id の一覧は 0 件
- **リスク/影響**: 後で `find` を変えて「先頭や既定のランタイムを引く」形にしたとき、その退行 (AD-003 の単一インスタンス仮定、PB-2 / PB-3) を検出できない
- **推奨アクション**: `it.each` に 1 行足す。id を別名 (`wsl:Debian`) にした `unavailable` の一覧を渡し、帯が「確かめていません」になること (「隔離がありません」と言わないこと) を確かめる
- **根拠**: AD-003 Decision Outcome `:42-44` / runtime charter `:113-114`
- **scope 根拠**: 本 feature のテストのファイル

### pr-gate R1 からの記録 (件数に入れない)

- pr-gate R1 の L-024 (本 reviewer の pr-gate L-001。本 reviewer の起動条件に、本 PR が足した判定点が入っていない) は未解決
- `C:\dev\closta\.specify\spec-gate\reviewers.yml:157-168` は R1 のときのまま
- pr-gate で出た指摘なので、code-gate の件数には入れない

### 固有観点の確認

- **PB-1**: 該当なし。`8aed1db` はパスにも DTO にも IPC にも触れていない。iter 1 で確かめた経路 (`init` からは `permissionMode` だけを読む。目印の値のテストがある) は変わっていない
- **PB-2**: 該当なし (新しい事象は無い)。`8aed1db` は module スコープの状態を足していない。消えたインスタンスのテストが無い件は L-004
- **PB-3**: 該当なし。`capabilities` の表明は変わっていない。帯は今も 3 値の `autoModeStatus` だけを読み、`unavailable` 以外を楽観側に丸めない (`CenterBanners.tsx:72-76`)
- **PB-4**: 該当なし。判定 `mode === null || isSafePermissionMode(mode)` (`CenterBanners.tsx:67`) と、書き戻さないことのテスト (`CenterBanners.test.tsx:528-540`) は変わっていない。AD-047 の追記は Decision の中身を変えない
- **PB-5**: 該当なし。パスの変換も docker の endpoint も扱わない
- **PB-6**: 該当なし。子プロセス・ファイル・volume・環境を作るコードは足されていない
- **PB-7**:
  - `eslint.config.mjs` の差分は iter 1 と同じで、厳しさを戻す block (`:564-567`) にファイルを 1 つ足しただけ。既存のルールを緩めた箇所は 0 件
  - `scripts/constitution/` と `.dependency-cruiser.js` の差分は 0
  - 残っている穴は L-002 だけ

### H (本 reviewer の範囲のテストと退行)

- 指摘を検出できるテスト:
  - L-004 と L-002 は、それ自体がテストの欠けである
  - M-001 / L-001 / L-003 は文書の指摘で、テストでは検出できない
- 既存の振る舞いを壊していない根拠: `8aed1db` は境界の判定に触れていない。帯の隔離の文言は今も文字列のテスト (`CenterBanners.test.tsx:479-504`) が固定している。class だけの変更なので、このテストは書き換えられていない
- 観測点: 昇格の観測は renderer のメモリだけに残る (plan RK-14)。申し送りに書かれていない件は L-003

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `CLAUDE_CONFIG_DIR\|--permission-mode\|--exec\|wslpath\|RuntimePath` (quickstart.md) | 2 | quickstart.md:43, 52 |
| L-001 | `O-4\|autoModeStatus\|014` (isolation charter) | 0 | (isolation/charter.md:145 は「未着手」) |
| L-002 | `PERMISSION_MODE_ESCALATION_VALUES` (specs 以外) | 3 | allowlists.mjs:435 / check.mjs:52, 875 (tests では 0) |
| L-003 | `昇格の観測\|観測を記録\|メモリだけ` (roadmap.md) | 0 | — |
| L-004 | `runtimeList\|Debian` (CenterBanners.test.tsx) | 9 | CenterBanners.test.tsx:416, 457, 466, 480, 489, 490, 530, 543 (別の id は 0) |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 4
- Round inheritance: iter 1 から解決 0 / 未解決 5 (M-001, L-001, L-002, L-003, L-004) / 新規 0
