# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
(code-gate iteration 1。前のレビューは design-gate R4 の `specs/012-ui-thread-search/platform-boundary-reviewer.design-gate.md` で、そこからの引き継ぎを各指摘に書いた)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002: Thread search の照合先 (PB-1)。行の鍵 `targetKey\0sessionId` (PB-2)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーの判定と Principle II (PB-7)
  - FR-007: palette の稼働中・過去の候補 (PB-2)
  - FR-009 / FR-010: `launchSession(config, origin)`。起動元は計測にだけ使い、権限ゲートの手前で config に混ざらない (PB-4)
  - FR-011〜FR-013: `launch-usage.json` / `getLaunchUsage` (PB-1 / PB-6)
  - FR-018: E2E の固定の索引 (PB-1 / PB-2)
  - SC-005 / SC-006
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる)、AD-004 (HostPath / RuntimePath)
  - AD-012 と runtime / isolation の charter は、本 diff では触れていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (起動元の厳密比較が未信頼入力の検証になっている件も同じ)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当 (`.bak` の扱いなど永続化の細部は database-reviewer)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

diff (base `73ebbc0`) のうち、本 reviewer が見たのは次の範囲。

- `.dependency-cruiser.js` と `scripts/constitution/allowlists.mjs`: 実名の一覧に `launch-usage-service` を足しただけ
- `eslint.config.mjs`: 手を入れた element 2 つに、意味論の規則を `error` で戻しただけ。規則を緩めてはいない
- IPC: `src/domain/capability.ts`・`src/preload/index.ts`・`src/main/app/ipc.ts`・`session-ipc.ts`
- 起動の利用記録: domain・store・service と `composition-root.ts`
- `e2e-capability.ts` の固定の索引
- renderer の起動元: `LaunchDialog.tsx` と稼働中のストア
- palette / 会話内検索のショートカット

PB ごとの結果は次のとおり。

- **PB-1**: 該当なし。名前空間を取り違える経路は無い。
  - 起動元は 2 値の列挙で、IPC を越えた後は `checkLaunchOrigin` で厳密に比べている (`src/main/app/session-ipc.ts:161`)。
  - `getLaunchUsage` は DTO を射影し直して返す (`session-ipc.ts` の `handleGetLaunchUsage`)。パスは境界を越えない。
  - store は `userDataDir: HostPath` を受け、`hostPathOps.join` でパスを組む (`src/main/infra/settings/launch-usage-store.ts:95,103,182`)。composition root はそこに `makeHostPath(app.getPath('userData'))` を渡している (`src/main/app/composition-root.ts:109,309`)。
  - Thread search は `cwd.value` を直接読まない。未登録のグループは `groupLabelOf` の表示文字列として照合する (`src/renderer/src/features/search/session-search.ts:57-68`)。
  - renderer の非テストのファイルに `namespace:` のオブジェクトリテラルは 0 件。
- **PB-2**: 該当なし。
  - 過去の候補は `rowKey` (`targetKey\u0000sessionId`。`src/domain/session/summary.ts:59`) で選ぶので、所在の違うインスタンスを取り違えない。
  - 稼働中の候補は cache せずに、毎回 `runtimeName` を引く (`session-search.ts:146-157`)。`runtimeName` は `runtimes.list` に依存し (`RunningSessionsProvider.tsx:55-62`)、`useMemo` の依存にも入っている (`CommandPalette.tsx:247`)。design-gate の L-004 は解消した。
  - `lastOrigin` は「前回の設定」と組の UI の値で、「今のランタイム」を 1 つ持つ状態ではない。
- **PB-3**: 該当なし。runtime の `capabilities` は変えていない。`src/domain/capability.ts` は IPC の `ClostaCapability` で、runtime の能力の表明とは別物。
- **PB-4**: 該当なし。
  - 起動元が `config` に混ざらない。service に渡るのは `config` だけ (`session-ipc.ts:162`)。
  - 8 通りの起動元 (preset / manual / 欠落 / 未知 5 種) で、service が `[CONFIG]` だけで 1 回呼ばれることをテストが固定している (`session-ipc.test.ts:486`)。
  - palette の「新規起動」は同じ起動ダイアログを開くだけ (`palette-commands.ts:296`)。起動ダイアログの外から起動する入口は増えていない。
  - `LaunchDialog.tsx:191,375` が決めるのは起動元だけで、権限モードの解決 (`resolveLaunchAxes`) には触れていない。
- **PB-5**: 該当なし。パスの変換を足していない。
- **PB-6**: 該当なし。
  - 書くのは、既存の settings の store と同じユーザデータディレクトリの `launch-usage.json` (と退避の `.bak`) だけ。
  - 子プロセス・docker・volume は使わない。E2E はメモリ内の fake に入れる (`e2e-capability.ts` の `recordLaunchUsage`)。
- **PB-7**: M-001 と L-002 が残る。新しいモジュールは既存の規則の範囲に入っている。
  - `src/renderer` は boundaries の `ui` (`eslint.config.mjs:254`)。
  - `coreRe` はサブパス (`fs/promises`) まで一致する (`.dependency-cruiser.js:26`)。
  - quickstart-results の Constitution 検証は ok 20 / pending 1 (#5) と書き分けており、pending を ok に混ぜていない。

design-gate から引き継いだ 6 件の今の状態は次のとおり。

- 解消: L-002 (`cwd.value` のテスト。`session-search.test.ts:109-128` が登録フォルダと未登録を分けて確かめる)、L-004 (稼働中の候補の cache)
- 実装で一部解消: L-001 → 本 round の L-001、L-005 → 本 round の L-003
- 未解消: M-001 → M-001、L-003 → L-002

## Findings

### [Medium] Principle II の検査 (項目 8) が今も renderer の `navigator.*` を見ていない。本 feature は、アプリ全体で効く修飾キーのショートカットを renderer に初めて入れた (M-001) (scope: system)

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:566-581` の `PLATFORM_BRANCH_PATTERNS` に `navigator.platform` / `navigator.userAgent` / `navigator.userAgentData` は無い。本 diff はこのファイルの `WSL_FREE_DIRECTORIES` (`:502-503`) だけを変えた。
  - 項目 8 (`C:/dev/closta/scripts/constitution/check.mjs:382-401`) は上の式でしか一致を取らない。
  - 本 feature は `window` の keydown (capture) で Ctrl+K (`C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:38-46`, `:85-89`) と Ctrl+F (`C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:48-56`) を受ける。
  - 今の実装は OS を判定していない (`!event.metaKey` で Cmd を除くだけ)。違反は無い。
  - roadmap の system-scope (5) (`C:/dev/closta/docs/roadmap.md:185-186`) の持ち主は今も「項目 8 の持ち主に送る」のままで、feature の名前が無い。
- **同種事象探索**:
  - `navigator|userAgent` (scripts/constitution): 0 件
  - `navigator\.(platform|userAgent)` (リポジトリ全体。node_modules を除く): src に 0 件。docs と review の文書だけ 3 件
  - `navigator|userAgent|platform` を制限する ESLint の規則: 0 件 (`no-restricted-globals` / `no-restricted-properties` の設定が無い)
  - `metaKey` (src/renderer): 2 件 (`CommandPalette.tsx:43` / `ConversationSearchProvider.tsx:53`)。どちらも否定の条件で、OS は判定していない
- **リスク/影響**:
  - Principle II の Automated (正本) は「等価な API を含む」と書く。renderer の等価な経路が抜けているので、renderer では `existing_violations: 0` が遵守の証拠にならない。
  - 本 feature で修飾キーのショートカットの前例ができた。「macOS では Cmd」を `navigator.platform` で分ける変更は、この 2 か所に最も入りやすい。入っても項目 8 は素通りする。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足し、`__rulecheck__` の違反サンプルで発火を確かめる。検出の式を足すだけで許可リストは増やさないので、ADR は要らない。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - `/\bnavigator\s*\[\s*['"\`](platform|userAgent|userAgentData)['"\`]\s*\]/`
  - 本 PR で足さないなら、roadmap (5) に持ち主の feature の名前を書く。
- **根拠**: Constitution Principle II (Verification)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本 (`scripts/constitution/allowlists.mjs` の項目 8 の節) は本 feature の対象範囲の外で、穴は本 feature より前からある。追加の事実は無いので severity は design-gate のまま

### [Low] 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。plan と allowlists の注記は「新しいファイルは判断を強制される」と書くが、事実と違う (L-002) (scope: system)

- **観察**:
  - 本 feature の新しいファイルは 2 つの一覧に足してある。`WSL_FREE_DIRECTORIES` (`C:/dev/closta/scripts/constitution/allowlists.mjs:503`) と `services-not-to-io` の `from` (`C:/dev/closta/.dependency-cruiser.js:254`)。
  - ただし項目 15 は、一覧に無いファイルを `continue` で黙って飛ばす (`C:/dev/closta/scripts/constitution/check.mjs:753`)。
  - それでも次の 2 か所は、新しいファイルが判断を強制されるかのように書いている。
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:478`「新規ファイルは列挙されていないので、追加時に判断を強制される」
    - `C:/dev/closta/specs/012-ui-thread-search/plan.md:234`「新しいファイルに判断を強制する形」
  - `services-not-to-io` の `from` も実名で固定されている。足し忘れたファイルは黙って規則の外に出る。
- **同種事象探索**:
  - `判断を強制`: 2 件 (`allowlists.mjs:478` / `plan.md:234`)
  - 一覧に無いファイルを飛ばす処理: 1 か所 (`check.mjs:753`)
- **リスク/影響**:
  - 今回は task (BE-042) が足したので覆われている。覆っているのは task の 1 行で、規則ではない。
  - 注記を字面どおりに読んだ次の feature は「強制される」と信じて足し忘れる。そうなると「検査したから通った」と「検査していないから通った」が区別できなくなる。
- **推奨アクション**:
  - (feature) `plan.md:234` の括弧を「実名列挙。一覧に無いファイルは検査されないので、新しい app のモジュールは本 task で足す」に直す。
  - (system) 次のどちらかにする。
    - 項目 15 に網羅の検査を足す。「`src/main/app/*.ts` (テストを除く) は、一覧か明示の除外リストに載っていること」
    - `allowlists.mjs:478` の注記を事実に合わせる
  - (system) `services-not-to-io` も同じ扱いにする。
- **根拠**: Constitution Principle VI Verification (除外はファイル単位の明示リスト、報告は ok / violation / pending の 3 状態)、AD-025 §9、PB-7
- **scope 根拠**: 規則の本体は本 feature の対象範囲の外。plan の字面だけは本 feature で直せる。design-gate L-003 (gate L-25) から未解消

### [Low] Ctrl+K / Ctrl+F の修飾キーの判定は正しく実装されたが、テストでも文書でも固定されていない (L-001) (scope: feature)

- **観察**:
  - 実装の判定式は `ctrlKey && !altKey && !shiftKey && !metaKey` で、`key` は `'k' | 'K'` / `'f' | 'F'` と比べる (`C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:38-46`、`C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:48-56`)。OS を判定せず、AltGr (`ctrlKey && altKey`) も除く。design-gate L-001 の推奨どおりの形になった。
  - テストには、この式を固定するケースが無い。
    - `CommandPalette.test.tsx:267-273` の `ctrlK()` は `ctrlKey: true` だけを渡す。
    - renderer のテストで `metaKey` / `altKey` を渡すケースは 0 件。
  - spec / plan / tasks / data-model / research / quickstart にも、この判定式は書かれていない。
- **同種事象探索**:
  - `metaKey|altKey|AltGr|shiftKey` (src/renderer の `*.test.tsx`): 1 件。`ConversationSearch.test.tsx:449` の Shift+Enter (IME) で、修飾キーの除外とは関係が無い
  - `ctrlKey|metaKey|altKey|AltGr|OS を判定` (012 の 6 文書): 0 件
- **リスク/影響**:
  - 「macOS では Cmd も」と `ctrlKey || metaKey` に緩める変更や、OS で分ける変更が入っても、どのテストも落ちない。M-001 の穴と重なり、その変更を機械では検出できない。
  - AltGr+K / AltGr+F の文字入力を奪う回帰も検出できない。
- **推奨アクション**:
  - `CommandPalette.test.tsx` と `ConversationSearch.test.tsx` に、次の負例を 1 つずつ足す。どれも「開かない」かつ「`preventDefault` しない」を確かめる。
    - `{ key: 'k', metaKey: true }` (Meta だけ)
    - `{ key: 'k', ctrlKey: true, altKey: true }` (AltGr 相当)
    - `{ key: 'k', ctrlKey: true, shiftKey: true }`
  - data-model §2 / §3 に次の 1 行を置く。「修飾キーは `ctrlKey && !altKey && !shiftKey && !metaKey` で判定する。renderer で OS を判定しない。macOS の Cmd は OPT-mac で決める」。
- **根拠**: Constitution Principle II、AD-003 Decision Outcome
- **scope 根拠**: 本 feature のテストと data-model で直せる。design-gate L-001 (gate L-23) の実装側は解消し、テストと文書が残った

### [Low] E2E の固定の索引の鍵は、domain の関数を使わずに文字列で組まれている。`sessionTargetKeys` は空のまま (L-003) (scope: feature)

- **観察**:
  - 行の `targetKey` と outcomes の対応、`cwd` の名前空間は、design-gate L-005 の推奨どおり揃った (`C:/dev/closta/src/main/app/e2e-capability.ts` の `e2eSessionIndex`)。
    - WSL の行: `namespace: runtimeId`
    - Windows の行: `namespace: 'host'`
    - outcomes: 所在ごとに 1 つずつ
  - ただし鍵は、テンプレート文字列で手で組んでいる (`e2e-capability.ts:121-122` の `` `${input.runtimeId}#0` `` / `'host#0'`)。domain の `enumerationTargetKey(location, ordinal)` (`C:/dev/closta/src/domain/session/target.ts:41-43`) は使っていない。
  - `sessionTargetKeys` は `() => []` のまま (`e2e-capability.ts:556`)。この E2E では、過去の行の `getTranscript` は `isKnownTargetKey` で必ず弾かれ、`transcript-read-failed` になる (`C:/dev/closta/src/main/app/session-ipc.ts:104-106`)。
  - 固定の索引のテストは無い (`src/main/app/e2e-capability*.test.ts` は 0 件)。
- **同種事象探索**:
  - `#\$\{` (src。鍵の組み立て): 2 件。本番の `target.ts:42` と、E2E の `e2e-capability.ts:121`
  - `sessionTargetKeys` (src/main): 本番 `composition-root.ts:341` / E2E `e2e-capability.ts:556`
- **リスク/影響**:
  - 今の `e2e/sidebar-screenshot.spec.ts` は過去の行を開かない。いま壊れる経路は無い。
  - 後で palette や Thread search から過去の行を開く E2E を足すと、中央の transcript の取得が理由の分からないまま失敗する。
  - 鍵の書式 (`enumerationTargetKey`) を変えると、E2E の鍵だけが古いまま残る。所在の絞り込みで行が落ち、基準画像が黙って変わる。
- **推奨アクション**:
  - `wslTarget` / `hostTarget` を `enumerationTargetKey({ kind: 'wsl', distroName }, 0)` / `enumerationTargetKey({ kind: 'windows' }, 0)` で作る。
  - `sessionTargetKeys` は、その 2 つの鍵を返すようにする。
  - 固定の索引の単体テストを 1 つ足す。「各行の `targetKey` が `outcomes` のどれかの鍵と一致し、`sessionTargetKeys()` にも入っている」。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: 本 feature の touched file (`e2e-capability.ts`) で直せる。design-gate L-005 (gate L-31) の対応と名前空間の部分は解消し、鍵の作り方と `sessionTargetKeys` が残った

## H (テスト / regression) の所見

- **PB-4 の回帰の根拠**: `C:/dev/closta/src/main/app/session-ipc.test.ts` の次の 3 つが、起動元が起動の可否と設定に漏れないことを固定している。
  - `:486`: どの起動元でも、service は `[CONFIG]` だけで 1 回呼ばれ、拒否されない
  - `:516`: 拒否・失敗した起動は記録しない
  - `:542`: 記録が reject しても、同期で投げても、終わらなくても、結果は `launching`
- **SC-006**: `C:/dev/closta/src/domain/capability.test.ts` が `IPC_CHANNELS` の集合を固定する。境界の広がりを機械で検出できる。
- **PB-2**: 稼働中の候補の照合を、ランタイムの名前の関数で確かめるテストはある (`session-search.test.ts:191-213`)。ランタイムの一覧が変わった後の再描画を確かめる component テストは無い。cache を持たない構造で担保していると読んだ。
- **L-001 / L-003**: 今は検出できるテストが無い。推奨のとおり負例と単体を足すこと。
- **M-001**: 検出の式が無い。違反サンプル (`__rulecheck__`) と一緒に足すこと。
- **観測点**: 記録の失敗は `[launch-usage-store]` の接頭辞で、理由キーと errno のコードだけを出す (`C:/dev/closta/src/main/app/launch-usage-service.ts`)。パスも値も出さない。切り分けには足りる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\|userAgent` (scripts/constitution) / `navigator\.(platform\|userAgent)` (repo, src) / `metaKey` (src/renderer) | 0 / 0 (src) / 2 | allowlists.mjs:566-581 (検出の式)、check.mjs:382-401、CommandPalette.tsx:43、ConversationSearchProvider.tsx:53、roadmap.md:185-186 |
| L-002 | `判断を強制` / 一覧に無いファイルを飛ばす処理 | 2 / 1 | allowlists.mjs:478、plan.md:234、check.mjs:753、.dependency-cruiser.js:254 |
| L-001 | `metaKey\|altKey\|AltGr\|shiftKey` (renderer `*.test.tsx`) / `ctrlKey\|metaKey\|altKey\|AltGr\|OS を判定` (012 の 6 文書) | 1 (関係なし) / 0 | ConversationSearch.test.tsx:449、CommandPalette.test.tsx:267-273、CommandPalette.tsx:38-46、ConversationSearchProvider.tsx:48-56 |
| L-003 | `#\$\{` (src) / `sessionTargetKeys` (src/main) / `e2e-capability*.test.ts` | 2 / 2 / 0 | target.ts:42、e2e-capability.ts:121-122、e2e-capability.ts:556、composition-root.ts:341、session-ipc.ts:104-106 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- design-gate R4 の 6 件の引き継ぎ: 解消 2 (L-002 / L-004) / 一部解消 2 (L-001 → L-001、L-005 → L-003) / 未解消 2 (M-001 → M-001、L-003 → L-002) / 新しい指摘 0。追加の事実が無いので、severity はどれも design-gate のまま。
