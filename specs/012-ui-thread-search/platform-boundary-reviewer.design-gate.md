# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-06
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 4 (status=implementing での再実行。前回は R3 = `C:/dev/closta/specs/012-ui-thread-search/design-gate.md.20261006T212011`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002: Thread search の照合先と Principle I (L-002)、行ごとの cache の鍵 (L-004)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーと Principle II (M-001 / L-001)
  - FR-007: palette の稼働中の候補がランタイムの表示名を読む (L-004)
  - FR-009 / FR-010 (R4 で H-04 / M-13 に合わせて改めた): 起動元の 2 つの印、受け付けた要求を単位に数える。PB-2 / PB-4 で確かめた。指摘は無い
  - FR-011〜FR-013: `launch-usage.json`・`getLaunchUsage`。PB-1 / PB-6 で確かめた。指摘は無い
  - FR-018 / SC-008: E2E の固定の索引 (L-005)
  - SC-005 / SC-006
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる。プラットフォームの差は軸に持たない)
  - AD-004 Decision (HostPath / RuntimePath)
  - AD-023 §8 (store のパスは composition root が渡す)
  - AD-012 と runtime / isolation の charter には触れていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (外部由来の id を DOM の id / セレクタに入れる件 (gate M-25) も同じ)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (H-04 の KPI の偏りは po / architecture が持つ)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R3 の後に designer が直したのは、H-04 / M-13 / M-01 (利用者が回答) に当たる箇所だけだった。FR-009 / FR-010 / FR-016、US-4 AC8、data-model §4「renderer の起動元」、research R-05、tasks FE-040 が変わっている。どれも本 reviewer の担当の境界には触れていない。R3 で本 reviewer が挙げた 6 件 (gate の M-24 / L-23 / L-24 / L-25 / L-30 / L-31) は、spec / plan / tasks / data-model / research / quickstart のどこにも手当てが無い。6 件とも未解消で、新しい指摘は無い。観点ごとの結果は次のとおり。

**PB-1**: R4 で新たに境界を越えるものは無い。
- 起動元は 2 値の列挙で、`LiveSessionState.launchOrigin` は renderer の中に留まる。
- store は今も `createLaunchUsageStore(userDataDir: HostPath, …)` + `hostPathOps.join` で組む (`C:/dev/closta/specs/012-ui-thread-search/data-model.md:189`)。
- composition root は `makeHostPath(app.getPath('userData'))` を渡す (`C:/dev/closta/src/main/app/composition-root.ts:107`)。
- 残るのは L-005 だけ。

**PB-2**: H-04 の手当てで「軸を手で変えた」(`update` を通ったか) を新しい印にしたので、ここを確かめた。
- 「依存解決の自動の reset は数えない」の対象になる reset は、provider / model / effort の 3 軸だけ (`C:/dev/closta/src/domain/session/launch-resolution.ts:60`、`:120-145`)。ランタイムとフォルダの軸は自動では変わらない。
- 再検出 (`reevaluate`。`C:/dev/closta/src/renderer/src/features/session/LaunchDialog.tsx:339-345`) でインスタンスが消えても、自動で別のランタイムにすり替わり、それでも引き継いだ起動元で数えられる、という経路は無い。
- `lastConfig` / `lastOrigin` は「前回の設定」という UI の値で、「今のランタイム」を 1 つ持つ状態ではない。
- 新しい指摘は無く、R3 の L-004 が残る。

**PB-3**: 該当なし: `capabilities` を変えない。E2E の `fixedCapabilities` もそのまま。

**PB-4**: 該当なし: 権限ゲートを迂回する経路は無い。
- 起動元は計測にしか使わない。起動の service に渡るのは `config` だけ (`data-model.md:230`、BE-043 `tasks.md:95`)。
- 起動で選べる権限モードは `SAFE_PERMISSION_MODES` に限られる (`C:/dev/closta/src/domain/session/launch-config.ts:21-28`)。
- 2 つの印を足しても、初期値として前回の設定を出す経路は増えていない。どれも X-4 からある経路 (`LaunchDialog.tsx:178-180`)。

**PB-5**: 該当なし: パスの変換を足さない。

**PB-6**: 該当なし: 永続環境を作らない。
- 置き場は、既存の settings の store と同じアプリのユーザデータディレクトリ。
- 子プロセスも docker も起こさない。
- E2E の fake はファイルに書かない (`data-model.md:275`)。

**PB-7**: M-001 と L-003 が引き続き残る。新しいモジュールは既存の規則の範囲に入る。
- `src/renderer` は boundaries の `ui` (`C:/dev/closta/eslint.config.mjs:254`)。
- `src/domain/session/` は `WSL_FREE_DIRECTORIES` にディレクトリ単位で載っている (`C:/dev/closta/scripts/constitution/allowlists.mjs:483`)。
- `launch-usage-service` は BE-042 で、`services-not-to-io` の実名列挙 (`C:/dev/closta/.dependency-cruiser.js:254`) と `WSL_FREE_DIRECTORIES` に足す。

## Findings

### [Medium] Principle II の検査が renderer の等価な経路 `navigator.*` を見ていない。本 feature は renderer で初めて、アプリ全体で効く修飾キーのショートカットを書く (M-001) (scope: system) [unresolved from prev (R3 M-001 / gate M-24)]

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:564-579` の `PLATFORM_BRANCH_PATTERNS` は R3 から変わっていない。`navigator.platform` / `navigator.userAgent` / `navigator.userAgentData` は入っていない。
  - 項目 8 (`C:/dev/closta/scripts/constitution/check.mjs:382-401`) は `src` 全体を 1 行ずつ走査する (`:387-388`)。それでも上の式には一致しない。
  - `C:/dev/closta/eslint.config.mjs` に `navigator` を制限する規則は 0 件。`PLATFORM_SOURCES` (`:55`) が塞ぐのは `os` / `process` の import だけ。
  - 本 feature は、`window` の keydown (capture) で Ctrl+F / Ctrl+K を受ける (`C:/dev/closta/specs/012-ui-thread-search/data-model.md:153,183`)。`src` の `ctrlKey|metaKey` は 0 件で、前例が無い。`src` の `navigator` は 5 件あるが、どれも `navigator.clipboard` (`use-copy-to-clipboard.ts:15,19` / `components/image.tsx:106,107,117`)。
  - roadmap の system-scope (5) (`C:/dev/closta/docs/roadmap.md:183-184`) の持ち主は今も「項目 8 の持ち主に送る」で、feature の名前が無い。
- **同種事象探索**:
  - `navigator|userAgent` (`scripts/constitution`): 0 件
  - `navigator` (`eslint.config.mjs`): 0 件
  - `ctrlKey|metaKey|navigator\.(platform|userAgent)|userAgentData` (`src`): 0 件
  - `PLATFORM_BRANCH_PATTERNS` の定義: 1 か所 (`allowlists.mjs:564`)
- **リスク/影響**:
  - Principle II の Verification (Automated。正本) は「等価な API と構文変形を含む」と宣言している。renderer の等価な経路が抜けているので、renderer では `existing_violations: 0` が遵守の証拠にならない。
  - 「macOS では Cmd」を `navigator.platform` で分ける書き方が最も手近で、項目 8 を素通りする。本 feature は、その書き方が最初に現れやすい箇所を作る。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足し、`__rulecheck__` の違反サンプルで発火を確かめる。検出の式を足すだけで許可リストは足さないので、ADR は要らない。本 feature の PR に含めてもよい。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - `/\bnavigator\s*\[\s*['"\`](platform|userAgent|userAgentData)['"\`]\s*\]/`
  - 本 feature で入れないなら、roadmap (5) の持ち主に feature の名前を書く (AD-028 §5)。
  - あわせて L-001 で、本 feature の範囲ではこの経路を使わないと data-model に固定する。
- **根拠**: Constitution Principle II (Verification)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本 `scripts/constitution/` は touched files の外。穴は本 feature より前からある。severity は R3 のまま (追加事実なし)

### [Low] data-model が Ctrl+K / Ctrl+F の修飾キーの判定式を決めていない (L-001) (scope: feature) [unresolved from prev (R3 L-001 / gate L-23)]

- **観察**:
  - 次の箇所は「Ctrl+F」「Ctrl+K」と書くだけで、判定の式を決めていない。R4 の改訂でもここは変わっていない (行番号は spec の加筆でずれた)。
    - spec Edge Cases (`C:/dev/closta/specs/012-ui-thread-search/spec.md:196-197`)
    - FR-003 (`:228`) / FR-006 (`:241`, `:243`)
    - data-model §2 (`data-model.md:153`) / §3 (`:183`)
    - research R-04 (`research.md:63`)
  - 決まっていないのは次の 3 点。
    - `event.ctrlKey` だけで判定するのか、`ctrlKey || metaKey` か
    - Shift / Alt を一緒に押したときを除くか。Windows の AltGr は `ctrlKey && altKey` として届くので、除かない式は配列によって AltGr+K / AltGr+F の文字入力を奪う
    - `event.key` を大文字と小文字のどちらで比べるか
  - plan の Principle II の行 (`plan.md:57`) は「分岐を足さない」と書くが、それを守る形 (renderer で OS を判定しない) は書いていない。
  - テストの観点 FE-026 (`tasks.md:66`) / FE-032 (`:78`) にも、判定式を固定する項目が無い。
- **同種事象探索**: 012 の 6 文書で `ctrlKey|metaKey|修飾キー|Cmd|OPT-mac|navigator\.|altKey|AltGr` は 0 件。`Ctrl\+(K|F)` は 25 件 (spec 8 / plan 6 / tasks 6 / data-model 3 / research 1 / quickstart 1) で、どれも判定式を書いていない。
- **リスク/影響**: macOS の Cmd を気にした実装者が renderer で OS を判定すると、Principle II の違反が M-001 の穴を通って入る。
- **推奨アクション**:
  - data-model §2 / §3 に次の 1 行を置く:「修飾キーは `event.ctrlKey && !event.altKey && !event.metaKey` で判定し、`event.key.toLowerCase()` で比べる (対象は Windows。plan の Target Platform)。renderer で OS を判定しない。macOS の Cmd は OPT-mac で決める」。
  - FE-026 / FE-032 に、決めた式を固定する観点を 1 つずつ足す (例:「`metaKey` だけでは開かない」「Ctrl+Alt+K では開かない」)。
- **根拠**: Principle II、AD-003 Decision Outcome
- **scope 根拠**: 本 feature の data-model / tasks で直せる。AltGr の観察は論拠を補うもので、severity は R3 のまま

### [Low] FE-002 のテスト「`cwd.value` にだけある語で一致しない」が、未登録グループの見出し (`groupLabelOf` は `group.cwd?.value` を返す) と両立しない (L-002) (scope: feature) [unresolved from prev (R3 L-002 / gate L-24)]

- **観察**:
  - unregistered のとき、`groupLabelOf` は `group.cwd?.value ?? group.cwdDisplay ?? null` を返す (`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:51`)。data-model §1 (`data-model.md:39,41`) は、この見出しを照合の対象に入れている。
  - 次の 2 か所は R3 から変わっていない。
    - tasks FE-002 (`tasks.md:27`): 行の種別を限らずに「`cwd.value` にだけある語で一致しない (Principle I)」と書く。
    - spec FR-001 (`spec.md:210`): 「パス (`cwd.value`) を直接の対象にしない (名前空間を混ぜない)」と書く。
  - data-model §1 (`:41`)・research R-02 (`research.md:24`)・plan (`plan.md:56`) は、「`groupLabelOf` が返す表示用の文字列として入る」と正しく書いている。
- **同種事象探索**: `cwd\.value` (012 の 6 文書) は 5 件: `data-model.md:41` / `plan.md:56` / `research.md:24` / `spec.md:210` / `tasks.md:27`
- **リスク/影響**:
  - 未登録の行でこのテストを書くと落ちる。
  - テストを通すために見出しを照合の対象から外すと、未登録グループで US-1 AC1 が壊れる。
  - 理由に挙げた「名前空間を混ぜない」も実装の判断を誤らせる。照合は表示文字列への部分一致で、パスの操作 (Principle I の対象) ではない。
- **推奨アクション**:
  - FE-002 のテストを「登録フォルダの行で、行の `cwd.value` にだけある語 (表示名に無い語) では一致しない」に限る。
  - 「未登録の行は、見出し (変換済みのパス) にある語で一致する」を足す。
  - spec FR-001 の括弧を data-model §1 と同じ字面に揃える。
- **根拠**: Principle I、AD-004
- **scope 根拠**: 本 feature の spec / tasks で直せる

### [Low] palette の稼働中の候補で、正規化の cache の鍵にランタイムの一覧が入っていない (L-004) (scope: feature) [unresolved from prev (R3 L-004 / gate L-30)]

- **観察**:
  - 次の 3 か所は R3 から変わっていない。どれも cache の鍵を「索引とフォルダの表示名」とする。
    - data-model §1 (`data-model.md:43`)
    - plan (`plan.md:180`)
    - FE-002 (`tasks.md:26`。範囲は稼働中の対象を含む `session-search.ts` 全体)
  - 稼働中の対象には、ランタイムの表示名が入る (`data-model.md:53`)。
  - その表示名は `runtimeName(id)` が引く (`C:/dev/closta/src/renderer/src/features/session/RunningSessionsProvider.tsx:54-61`)。この関数は次の値を返し、どれも `runtimes.list` (検出の結果) で変わる。
    - `runtimes.list === null` なら `''`
    - 一覧に無ければ `SESSION_NAME_FALLBACKS.runtime`
    - それ以外は `distroName`
- **同種事象探索**: `変わったときだけ` (012 の 6 文書) は 3 件: `data-model.md:43` / `plan.md:180` / `tasks.md:26`
- **リスク/影響**:
  - 再検出でディストロが消えたり改名されたりした後も、cache にした古い名前で一致が続く。
  - そのとき行は fallback の文言を描くので、一致した文字列と描いた文字列がずれる (AD-003: インスタンスは検出の結果から作られる値)。
  - 稼働中は最大 10 本で、起こるのは稼働中に再検出した場面に限られる。
- **推奨アクション**: data-model §1 に次のどちらかを書く。あわせて FE-002 に「ランタイムの一覧が変わると、稼働中の行の照合がその一覧の名前に従う」を足す。
  - 「cache は過去の行だけ。稼働中の対象は cache しない」
  - 「稼働中の対象の cache の鍵に `runtimes.list` を含める」
- **根拠**: AD-003 Decision Outcome、PB-2
- **scope 根拠**: 本 feature の data-model / tasks で直せる

### [Low] 実名列挙の規則に網羅の検査が無く、plan の「新しいファイルに判断を強制する形」は事実と違う (L-003) (scope: system) [unresolved from prev (R3 L-003 / gate L-25)]

- **観察**:
  - `C:/dev/closta/specs/012-ui-thread-search/plan.md:232` は今も「app のモジュールは実名で列挙し、新しいファイルに判断を強制する形。`:475-478`」と書く。
  - 実際の項目 15 (`C:/dev/closta/scripts/constitution/check.mjs:753`) は、列挙に無いファイルを `continue` で黙って飛ばす。
  - `services-not-to-io` の `from` (`C:/dev/closta/.dependency-cruiser.js:254`) も 6 件の実名で固定されている。`src/main/app/*-service.ts` の 6 件のうち、`transcript-service.ts` は入っていない。
- **同種事象探索**: `判断を強制` は 2 件 (`allowlists.mjs:478` / `plan.md:232`)。glob `src/main/app/*-service.ts` は 6 件 (folder / session / transcript / preset / provider / session-launch)
- **リスク/影響**:
  - 本 feature の新しいファイルは BE-042 (`tasks.md:92`) で両方の列挙に足すので、覆われる。
  - ただし覆っているのは task の 1 行で、規則ではない。plan の字面のまま読むと、次の feature は「強制される」と信じて足し忘れる。
- **推奨アクション**:
  - (feature) plan の括弧を「(実名列挙。列挙に無いファイルは検査されないので、新しい app のモジュールは本 task で足す)」に直す。
  - (system) 次のどちらかにする。
    - 項目 15 に網羅の検査を足す:「`src/main/app/*.ts` (テストを除く) は列挙か明示の除外に載っていること」
    - `allowlists.mjs:477-478` の注記を事実に合わせる
  - (system) `services-not-to-io` も同じ扱いにする。
- **根拠**: Constitution Principle VI Verification (除外はファイル単位の明示リスト。「検証したから通った」と「書いていないから通った」を区別する)、AD-025 §9、PB-7
- **scope 根拠**: 規則の本体は touched files の外。plan の字面だけは本 feature で直せる

### [Low] E2E の固定の索引が、2 つの所在の行の `targetKey` と `outcomes` の対応、`cwd` の名前空間を決めていない (L-005) (scope: feature) [unresolved from prev (R3 L-005 / gate L-31)]

- **観察**:
  - data-model §7 (`C:/dev/closta/specs/012-ui-thread-search/data-model.md:336-350`) が決めるのは、グループごとの行数 (`:342-346`)・題・「`outcomes` は全部 `ok` で `complete: true`」(`:348`) だけで、R3 から変わっていない。
  - 固定の索引は、所在の違う 2 つの登録フォルダに行を作る (`C:/dev/closta/src/main/app/e2e-capability.ts:324-341`)。
    - `fakeFolderDto`: WSL `E2E-Ubuntu`。`namespace: runtimeId`、`runtimeId = wslNamespace(distro)` (`:240-241`)
    - `fakeWinFolderDto`: Windows。`namespace: 'host'`
  - 決まっていないのは次の 3 点。
    - 行の `targetKey` と、所在ごとの `EnumerationOutcomeDTO` の対応
    - 未登録グループと行の `cwd` (`PathDTO`) の名前空間
    - `sessionTargetKeys` (今は `() => []`。`:396`) をその鍵に合わせるか
  - renderer は、所在を `targetKey` から outcomes を経て引く (`group-label.ts:24-30`)。
- **同種事象探索**: `sessionTargetKeys|targetKey|outcomes` (012 の 6 文書) は 4 件 (`data-model.md:287,332,348` / `tasks.md:41`)。どれも、固定の索引の鍵と所在の対応を決めていない。
- **リスク/影響**:
  - 対応を決めないと、基準画像 (FR-018) は所在をまたぐ一覧 (AD-003 の複数のインスタンス) を表さないまま固定されうる。所在が 1 つだけ、あるいは鍵が outcomes に無くて所在の絞り込みで行が落ちる、という形が考えられる。
  - 後で過去の行を開く E2E を足すと、transcript の取得が黙って失敗する (`session-ipc.ts:92-94`)。
  - 今の SH-010 は行を開かないので、いま壊れる経路は無い。
- **推奨アクション**:
  - data-model §7 に次の 3 行を足す。
    - 「所在ごとに outcome を 1 つ (WSL `E2E-Ubuntu` と Windows)。各行の `targetKey` は、その所在の outcome の鍵」
    - 「行と未登録グループの `cwd` は、所在の名前空間 (`wslNamespace(distro)` / `host`)」
    - 「`sessionTargetKeys` は固定の索引の鍵を返す」
  - BE-010 (`tasks.md:37`) に、鍵と outcomes の対応を確かめる単体を 1 つ足す。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: 本 feature の data-model / tasks で直せる

## H (テスト / regression) の所見

- **PB-4 の回帰**: BE-043 の `session-ipc.test.ts` (`tasks.md:95`) が次を確かめる。R4 の 2 つの印は renderer の起動元だけを変え、この前提を崩していない。
  - どの起動元 (preset / manual / 欠落 / 未知) でも、`deps.launchSession` が `config` だけで 1 回呼ばれる
  - 記録が reject しても、同期で投げても、結果が `launching` のまま
- **FE-040**: `SessionLaunchConfig` が起動元で変わらないことを確かめる (`tasks.md:98`)。起動元が起動の設定と権限モードに漏れないことの回帰の検査になる。
- **SC-006**: `IPC_CHANNELS` の集合を固定するテストを新設する (`tasks.md:96`)。境界の広がりを機械で検出できる。
- **M-001 / L-001**: 今は検出できるテストも検査も無い。推奨のとおり、検出の式の違反サンプルと、判定式を固定するテストを足すこと。
- **L-002**: テストの書き方そのものの問題。
- **L-004**: ランタイムの一覧が変わったときの照合のテストが無い。
- **L-005**: 固定の索引の鍵と outcomes の対応を確かめるテストが無い。
- **観測点**: 記録の失敗は、`[launch-usage-store]` の接頭辞で理由キーと errno のコードだけを出す。パスと退避先は出さない (`data-model.md:267`)。障害の切り分けに足りる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\|userAgent` (scripts/constitution) / `navigator` (eslint.config.mjs) / `ctrlKey\|metaKey\|navigator\.(platform\|userAgent)\|userAgentData` (src) | 0 / 0 / 0 | — (検出式は allowlists.mjs:564-579、項目 8 は check.mjs:382-401、記録は roadmap.md:183-184。参考: src の `navigator` 5 件はすべて clipboard。use-copy-to-clipboard.ts:15,19 / image.tsx:106,107,117) |
| L-001 | `ctrlKey\|metaKey\|修飾キー\|Cmd\|OPT-mac\|navigator\.\|altKey\|AltGr` (012 の 6 文書) / `Ctrl\+(K\|F)` (同) | 0 / 25 | spec.md:196-197,228,241 / data-model.md:153,183 / research.md:63 ほか |
| L-002 | `cwd\.value` (012 の 6 文書) | 5 | data-model.md:41 / plan.md:56 / research.md:24 / spec.md:210 / tasks.md:27 |
| L-003 | `判断を強制` (012 の文書 + scripts/constitution) / glob `src/main/app/*-service.ts` | 2 / 6 | allowlists.mjs:478 / plan.md:232 / folder-, session-, transcript-, preset-, provider-, session-launch-service.ts |
| L-004 | `変わったときだけ` (012 の 6 文書) | 3 | data-model.md:43 / plan.md:180 / tasks.md:26 |
| L-005 | `sessionTargetKeys\|targetKey\|outcomes` (012 の 6 文書) | 4 | data-model.md:287,332,348 / tasks.md:41 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- Round inheritance: resolved from 3: 0 / unresolved: 6 / new: 0
  - 未解消: M-001 (gate M-24)・L-001 (gate L-23)・L-002 (gate L-24)・L-003 (gate L-25)・L-004 (gate L-30)・L-005 (gate L-31)
  - R4 の design の改訂は H-04 / M-13 / M-01 の箇所だけで、上の 6 件の該当箇所は変わっていない。severity は R3 のまま (L-001 に AltGr の観察を足したが、論拠の補強で格上げはしない)
  - R4 の改訂 (起動元の 2 つの印・受け付けた要求を単位に数える) を PB-1 / PB-2 / PB-4 で確かめた。プラットフォーム境界の新しい指摘は無い。根拠: 自動の reset は provider / model / effort だけ (`launch-resolution.ts:60`)。起動元は `config` と権限モードに入らない (`launch-config.ts:21-28`)
