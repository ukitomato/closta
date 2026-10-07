# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2
(pr-gate。scope: system。起動の理由は `.dependency-cruiser.js` が `**/.dependency-cruiser.*` に一致したこと。前の Round の出力は `specs/012-ui-thread-search/platform-boundary-reviewer.pr-gate.round1.md`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search の照合先 (PB-1) と行の鍵 `targetKey\0sessionId` (PB-2)。Round 2 で変わったのは placeholder の文言だけ (`src/renderer/src/features/session-list/labels.ts:202-206`)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーの判定と Principle II (PB-7)。Round 2 では変わっていない
  - FR-007: palette の稼働中の候補と過去の候補。複数の所在の区別 (PB-2 / AD-003)。Round 2 では変わっていない
  - FR-009 / FR-010: 起動元が権限ゲートと `config` に混ざらないか (PB-4)。Round 2 では変わっていない
  - FR-011〜FR-013: `launch-usage.json` (PB-1 / PB-6)。Round 2 では変わっていない
  - FR-018 / SC-008: E2E の固定の索引と基準画像 (PB-2 / PB-6)。**Round 2 の差分の主な対象** (CI のステップ、撮る前のスクロール、基準画像のコミット)
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる。シングルトンではない)
  - AD-004 (HostPath / RuntimePath)
  - runtime / isolation の charter、AD-012、`src/agents/` には、Round 1 でも Round 2 でも触れていない
  - 規則のファイル (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**`) は `9d98c39..a4c37a8` で変わっていない。`git diff --stat` の 23 ファイルで確かめた
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (基準画像の承認を利用者の夜間の指示で済ませた扱い `quickstart-results.md` V-4 も、AD-038 D5 の解釈として po / architecture の担当)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当 (placeholder の字数と 280px の幅は ux / a11y の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

Round 1 から Round 2 までのコードの差分 (`9d98c39..a4c37a8`。gate の成果物を除く) は次の 7 ファイル。Round 1 の C-001 (サイドバーの E2E が CI で流れていなかった件) を直すための変更である。

- `.github/workflows/verify.yml:171-172`: e2e job (`runs-on: windows-latest`、`:115`) の最後に `e2e/sidebar-screenshot.spec.ts` を流すステップを足した
- `e2e/sidebar-screenshot.spec.ts:84-97`: 撮る前に、ページの中で区画のスクロール位置 (`scrollTop`) を送る。その後、最初のグループの見出しと最初の行が欠けずに見えることを `toBeInViewport({ ratio: 1 })` で確かめる
- `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png`: 新しい基準画像
- `src/renderer/src/features/session-list/labels.ts:202-206`: placeholder の文言を短くした
- `vitest.config.ts`: node と renderer の両 project に testTimeout 20s を付けた。code-gate iter 3 の platform-boundary-reviewer が見ている
- `specs/012-ui-thread-search/data-model.md` (§5 の文言の表と §7) / `quickstart-results.md` / `touched-files.txt`

Round 1 の 6 件の指摘の対象ファイルは、どれも変わっていない。`allowlists.mjs` / `check.mjs` / `CommandPalette.tsx` / `ConversationSearchProvider.tsx` / `palette-commands.ts` / `session-search.ts` / `group-label.ts` / `SessionListScreen.tsx` / `e2e-capability.ts` / `plan.md` / `tasks.md` はいずれも `--stat` に出てこない。`data-model.md` の変更行は `:319` 付近と `:396` 付近だけで、L-004 が指す `:192` と L-005 が指す `:41` には及んでいない。Grep で各箇所を取り直し、Round 1 と同じ状態であることを確かめた。

PB ごとの結果 (Round 2 の差分について):

- **PB-1**: 該当なし。差分はパスを組まず、変換もしない。E2E の固定の索引 (`e2e-capability.ts:115-180`) も変わっていない
- **PB-2**: 該当なし。新しいキャッシュもシングルトンも無い
- **PB-3**: 該当なし。`capabilities` / `autoModeSafe` に触れていない
- **PB-4**: 該当なし。起動の経路と権限モードに触れていない
- **PB-5**: 該当なし。パスの変換を足していない
- **PB-6**: 該当なし
  - 新しい CI のステップは、使い捨ての `windows-latest` のランナーで Playwright を流すだけである
  - spec の追加は、ページの中の `scrollTop` の代入と表示の確認だけ (`sidebar-screenshot.spec.ts:85-94`)
  - フォントは今までどおり FontFace + CSSOM で当て、OS には登録しない (`:70-80`)
  - volume / `--restart` / イメージの派生 / ホームディレクトリへの書き込みは足していない
- **PB-7**: 規則のファイルは変わっていない (invoker の CI の記録とも一致する)。Round 1 の M-001 / L-002 は未解消のまま
  - 基準画像の `-win32` の接尾辞は Playwright が自動で付ける (既存の `composer-fullwidth-win32.png` と同じ形)。e2e job は `windows-latest` で走る (`verify.yml:115`) ので、基準画像の名前と実行環境は合っている
  - 項目 8 の走査の対象は `src/` のアプリのコードで、テストの道具が付ける接尾辞は Principle II の対象ではない
  - `e2e/*.spec.ts` は 5 本あり、`verify.yml` の `playwright test` のステップも 5 本になった (Glob 5 件 / Grep 5 行)。これを機械で確かめる検査は無く、Round 1 で system follow-up になっている。Principle I / II / III / VI / VII の lint ではないので、本 reviewer の PB-7 には入れない

## Findings

### [Medium] Principle II の検査 (項目 8) が今も renderer の `navigator.*` を見ていない。本 feature は、アプリ全体で効く修飾キーのショートカットを renderer に初めて入れた (M-001) (scope: system)

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:566-581` の `PLATFORM_BRANCH_PATTERNS` には `process.*` / `os.*` / `process.env.OS` しか無い。同ファイルで `navigator|userAgent` を Grep すると 0 件。
  - 項目 8 (`C:/dev/closta/scripts/constitution/check.mjs:382-401`) は、このパターンだけで照合する。
  - 本 feature は Ctrl+K と Ctrl+F を `window` の capture で受ける。
    - Ctrl+K: `C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:40,43`
    - Ctrl+F: `C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:50,53`
  - 今の実装は OS を判定しておらず、違反は無い。
- **Round 2 の状態**: 未解消。規則のファイルも上の 2 ファイルも `9d98c39..a4c37a8` で変わっていない。追加の事実は無い。
- **同種事象探索**:
  - `navigator\s*\.\s*(platform|userAgent|userAgentData)|navigator\s*\[` (src): 0 件
  - `no-restricted-globals|no-restricted-properties` (eslint.config.mjs): 0 件
  - `ctrlKey|metaKey` (renderer の features の非テストのコード): 4 件 (`CommandPalette.tsx:40,43` / `ConversationSearchProvider.tsx:50,53`)
- **リスク/影響**:
  - Principle II の Automated (正本) は「等価な API を含む」と書いている。それなのに renderer の等価な経路を見ていない。renderer では `existing_violations: 0` が遵守の証拠にならない。
  - 「macOS では Cmd」を `navigator.platform` で分ける変更は、上の 2 か所に最も入りやすい。入っても項目 8 は素通りする。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足し、`tests/rule-fixtures/` に違反サンプルを 1 つ置いて、検査が発火することを確かめる。許可リストは増やさないので ADR は要らない。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - ブラケット記法の形
  - 本 PR で足さないなら、`docs/roadmap.md` の system-scope (5) に持ち主の feature の名前を書く。
- **根拠**: Constitution Principle II (Verification)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本は本 feature の対象範囲の外にあり、穴は本 feature より前からある。severity は Round 1 のまま

### [Low] palette の過去の候補は、補足にグループの表示しか出さない。複数の所在 (Windows と WSL のディストロ) にある同じフォルダ・同じ題の行を見分けられない (L-004) (scope: feature)

- **観察**:
  - 過去の候補の補足 (`detail`) は `groupLabelOf(section.group, folderName, row.session)` だけである (`C:/dev/closta/src/renderer/src/features/shell/palette-commands.ts:211-218`)。
  - 稼働中の候補は、補足にランタイム名を出す (`palette-commands.ts:177-187`)。
  - `group-label.ts:19-21` は、登録フォルダのグループが複数の所在のセッションを含みうると明記している。
  - palette の一致の対象 (`session-search.ts:57-68`) には、所在の名前が入らない。
  - 設計の正本も同じ形である (`specs/012-ui-thread-search/data-model.md:192`)。
- **Round 2 の状態**: 未解消。`palette-commands.ts` は変わっておらず、Grep で `detail` の組み立てが同じ 2 か所 (`:177`, `:218`) にあることを確かめた。追加の事実は無い。
- **同種事象探索**:
  - `detail|groupLabelOf|locationIndexOf` (`palette-commands.ts`): `locationIndexOf` は 0 件。`detail` の組み立ては 2 件 (`:177-187`, `:218`)
  - `locationIndexOf` の使用 (renderer の非テストのコード): 2 件 (`SessionListScreen.tsx:994` / `OverviewTab.tsx:118`)
- **リスク/影響**:
  - AD-003 のとおり、`WslRuntime` はディストロごとに複数ある。Windows と WSL で同じ登録フォルダを使うと、補足の同じ候補が所在の数だけ並び、どれがどの所在か分からない。
  - 選択そのものは `rowKey` で正しく区別される (`palette-commands.test.ts:268-285`)。実害は、読み取り専用の過去ログを誤って開くことに限られる。
- **推奨アクション**:
  - 補足を「グループの表示 · 所在」にする (`locationIndexOf(index.outcomes)` を `PalettePastSource` に渡す)。
  - data-model §3 の `:192` を同じ PR で直す。
  - `targetKey` が `wsl:Ubuntu#0` と `host#0` で、題もフォルダも同じ 2 行が、補足で区別されることを確かめるテストを 1 つ足す。
- **根拠**: AD-003 Decision Outcome、PB-2
- **scope 根拠**: 本 feature の touched files (`palette-commands.ts` / `data-model.md`) で直せる。severity は Round 1 のまま

### [Low] 「Thread search は `cwd.value` を直接は読まない (Principle I)」という主張は、未登録の区画では字面どおりにしか成り立たない。見出しの文字列が `group.cwd.value` そのもので、テストはそれを区別できない (L-005) (scope: feature)

- **観察**:
  - 未登録の区画の見出しは `group.cwd?.value ?? group.cwdDisplay` である (`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:51`)。
  - サイドバーも同じ式を自分で持っている (`C:/dev/closta/src/renderer/src/features/session-list/SessionListScreen.tsx:148,150`)。
  - Thread search はこの見出しを一致の対象に入れる (`session-search.ts:67`)。
  - それでも次の 4 か所は「`cwd.value` を直接は読まない」と書く。
    - `C:/dev/closta/src/renderer/src/features/search/session-search.ts:14`
    - `specs/012-ui-thread-search/data-model.md:41`
    - `specs/012-ui-thread-search/plan.md:56`
    - `specs/012-ui-thread-search/tasks.md:29`
  - テストの fixture の未登録の区画は、`cwd.value` と `cwdDisplay` が同じ値になっている (`session-search.test.ts:66-70`)。
- **Round 2 の状態**: 未解消。上のファイルはどれも変わっていない。Grep `cwd\.value|cwd\?\.value` の結果は Round 1 と同じだった。追加の事実は無い。
- **同種事象探索**:
  - `cwd\?\.value` (renderer の session-list の非テストのコード): 3 件 (`group-label.ts:51` / `SessionListScreen.tsx:148,150`)。workspace-folders 画面の 2 件 (`WorkspaceFoldersScreen.tsx:466,573`) は登録の画面で、検索とは関係ない
  - 「`cwd.value` を直接は読まない」という主張: 4 件 (上の列挙)
- **リスク/影響**:
  - パスの解決も再 branding もしていないので、Principle I の違反ではない。
  - ただし plan の Constitution Check とテストの名前が、実際には無い不変条件を主張している。
  - 見出しの導出が 2 か所にあるので、片方だけを変えると、表示と検索の対象が黙ってずれる。
- **推奨アクション**:
  - 4 か所の主張を事実に直す。例:「行の `cwd` は読まない。未登録の区画は、見出しに描く `group.cwd.value` (main が変換した表示用のパス) の文字列で一致する」。
  - 未登録の区画で `cwd.value` と `cwdDisplay` を別の値にしたケースをテストに足す。
  - `SessionListScreen.tsx:148,150` を `groupLabelOf` の呼び出しに替え、導出を 1 か所にする。
- **根拠**: Constitution Principle I、AD-004、PB-1
- **scope 根拠**: 本 feature の touched files で直せる。severity は Round 1 のまま

### [Low] 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。plan と allowlists の注記は「新しいファイルは判断を強制される」と書くが、事実と違う (L-002) (scope: system)

- **観察**:
  - 項目 15 は、一覧に無いファイルを `continue` で黙って飛ばす (`C:/dev/closta/scripts/constitution/check.mjs:753`)。
  - それでも次の 2 か所は、新しいファイルが判断を強制されるかのように書いている。
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:478`「新規ファイルは列挙されていないので、追加時に判断を強制される」
    - `C:/dev/closta/specs/012-ui-thread-search/plan.md:234`「新しいファイルに判断を強制する形」
  - `services-not-to-io` の `from` も実名で固定している (`.dependency-cruiser.js:245-256`)。
- **Round 2 の状態**: 未解消。`allowlists.mjs` / `check.mjs` / `.dependency-cruiser.js` / `plan.md` はどれも変わっていない。Grep `判断を強制` は同じ 2 件だった。追加の事実は無い。
- **同種事象探索**:
  - `判断を強制`: 2 件 (`allowlists.mjs:478` / `plan.md:234`)
  - 一覧に無いファイルを飛ばす処理: 1 か所 (`check.mjs:753`)
- **リスク/影響**: 注記を字面どおりに読んだ次の feature は、一覧への足し忘れも検査で落ちると信じる。そうなると、Principle VI の 3 状態の趣旨 (「検査したから通った」と「検査していないから通った」を区別する) が崩れる。
- **推奨アクション**:
  - (feature) `plan.md:234` の括弧書きを「実名列挙。一覧に無いファイルは検査されない」に直す。
  - (system) 次のどちらかにする。
    - 項目 15 と `services-not-to-io` に網羅の検査を足す。`src/main/app/*.ts` のうちテスト以外が、一覧か明示の除外リストのどちらかに載っていること、を確かめる。
    - `allowlists.mjs:477-478` の注記を事実に合わせる。
- **根拠**: Constitution Principle VI Verification、AD-025 §9、PB-7
- **scope 根拠**: 規則の本体は本 feature の対象範囲の外にある。severity は Round 1 のまま

### [Low] Ctrl+K / Ctrl+F の修飾キーの判定は正しく実装されたが、テストでも文書でも固定されていない (L-001) (scope: feature)

- **観察**:
  - 判定式は `ctrlKey && !altKey && !shiftKey && !metaKey` である (`CommandPalette.tsx:38-46` / `ConversationSearchProvider.tsx:48-56`)。
  - renderer の features の `*.test.tsx` で `metaKey|altKey|shiftKey` を Grep すると 1 件しか無い (`ConversationSearch.test.tsx:449`)。これは Enter + Shift の IME のケースで、Ctrl+K / Ctrl+F の修飾キーの除外を確かめるものではない。
- **Round 2 の状態**: 未解消。上のファイルも関係するテストも変わっていない。追加の事実は無い。
- **同種事象探索**: `metaKey|altKey|shiftKey` (renderer の features の `*.test.tsx`) は 1 件。修飾キーの除外を確かめるケースは 0 件
- **リスク/影響**: `ctrlKey || metaKey` に緩める変更や、OS で分ける変更が入っても、どのテストも落ちない。M-001 と重なって、機械では検出できない。AltGr+K / AltGr+F の文字入力を奪う回帰も検出できない。
- **推奨アクション**:
  - 次の負例を、`CommandPalette.test.tsx` と `ConversationSearch.test.tsx` に 1 つずつ足す。どれも「開かない」かつ「`preventDefault` しない」を確かめる。
    - `{ key: 'k', metaKey: true }`
    - `{ key: 'k', ctrlKey: true, altKey: true }`
    - `{ key: 'k', ctrlKey: true, shiftKey: true }`
  - data-model §2 / §3 に、判定式と「renderer で OS を判定しない」を 1 行で書く。
- **根拠**: Constitution Principle II、AD-003 Decision Outcome
- **scope 根拠**: 本 feature のテストと data-model で直せる。severity は Round 1 のまま

### [Low] E2E の固定の索引の鍵は、domain の関数を使わずに文字列で組まれている。`sessionTargetKeys` は空のまま (L-003) (scope: feature)

- **観察**:
  - 鍵を `` `${input.runtimeId}#0` `` / `'host#0'` と手で組んでいる (`C:/dev/closta/src/main/app/e2e-capability.ts:121-122`)。domain の `enumerationTargetKey` (`src/domain/session/target.ts:41-43`) は使っていない。
  - `sessionTargetKeys: () => []` のままである (`e2e-capability.ts:556`)。
  - `e2e-capability*.test.ts` は 0 件。
- **Round 2 の状態**: 未解消。`e2e-capability.ts` は変わっていない。追加の事実 (リスクを下げる方向) がある。
  - Round 2 で CI がこの spec を流すようになった (`verify.yml:171-172`)。invoker の記録では、run 37565959731 (= a4c37a8) で成功している。
  - その結果、鍵の書式が変わって所在の絞り込みで行が落ちた場合、`toHaveCount(4)` (`e2e/sidebar-screenshot.spec.ts:64`) と基準画像の比較が CI で落ちる。Round 1 に書いた「基準画像が黙って変わる」経路は、黙ってはいなくなった。
  - 残るリスクは次の 2 つ。
    - 落ちた原因が鍵の手組みにあると分かりにくいこと。
    - `sessionTargetKeys` が空なので、過去の行を開く E2E を後で足すと transcript の取得が理由不明で弾かれること。
  - severity は Low のまま。
- **同種事象探索**:
  - `#\$\{` (src。鍵の組み立て): 2 件 (本番 `target.ts:42` / E2E `e2e-capability.ts:121`)
  - `sessionTargetKeys` (src/main): 本番の `composition-root.ts` と E2E の `e2e-capability.ts:556` の 2 か所
- **リスク/影響**: 上の「Round 2 の状態」のとおり。
- **推奨アクション**:
  - 鍵を `enumerationTargetKey({ kind: 'wsl', distroName }, 0)` / `enumerationTargetKey({ kind: 'windows' }, 0)` で作る。
  - `sessionTargetKeys` がその 2 つの鍵を返すようにする。
  - 単体テストを 1 つ足す。各行の `targetKey` が `outcomes` の鍵と一致し、`sessionTargetKeys()` にも入っていることを確かめる。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: 本 feature の touched file (`e2e-capability.ts`) で直せる

## H (テスト / regression) の所見

- **Round 2 の差分が既存の振る舞いを壊していない根拠**:
  - アプリのコードの変更は `labels.ts` の文字列 1 つだけ。他は CI の設定、E2E、vitest の timeout、設計文書である。
  - code-gate iter 3 (HEAD 397d5f1): test track 2266 passed / 0 failed。lint track の 6 detectors はすべて exit 0。
  - invoker が観測した CI の run 37565959731 (a4c37a8 = Round 2 の HEAD) では、`verify (node 24)` と e2e job の 6 ステップ (サイドバーの区画を含む) がすべて success。`verify (node 26)` の failure は、PR #10 以来 allow-failure として扱われている。
- **規則の検証**: 規則のファイルは Round 1 から変わっていないので、Round 1 の 64/64 一致がそのまま当たる。本 reviewer は検証の runner を流していない。
- **PB-6 の回帰の根拠**: E2E のフォントは FontFace による注入のままで、OS には登録しない (`sidebar-screenshot.spec.ts:70-80`)。新しい CI のステップは使い捨てのランナーで流れ、本機では流さない (quickstart-results の記録)。
- **PB-4 の回帰の根拠**: 起動元が `config` と起動の可否に漏れないことは、Round 1 に挙げたテスト (`session-ipc.test.ts:476-548` / `LaunchDialog.test.tsx:1281-1285`) が今も固定している (ファイルは変わっていない)。
- **検出できるテストが無いもの**: L-001 (修飾キーの負例)、L-003 (固定の索引の鍵の単体)、L-004 (補足で所在を区別すること)、L-005 (未登録の区画の見出しの由来)。M-001 は検出のパターンそのものが無い。
- **観測点**: 記録の失敗は `[launch-usage-store]` の接頭辞付きで、理由キーと errno だけを出す (`src/main/app/launch-usage-service.ts`)。Round 2 で変わっていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\s*\.\s*(platform\|userAgent\|userAgentData)\|navigator\s*\[` (src) / `no-restricted-globals\|no-restricted-properties` (eslint.config.mjs) / `ctrlKey\|metaKey` (renderer features 非テスト) | 0 / 0 / 4 | allowlists.mjs:566-581、check.mjs:382-401、CommandPalette.tsx:40,43、ConversationSearchProvider.tsx:50,53 |
| L-004 | `detail\|groupLabelOf\|locationIndexOf` (palette-commands.ts) / `locationIndexOf` (renderer 非テスト) | 2 / 2 | palette-commands.ts:177-187,211-218、SessionListScreen.tsx:994、OverviewTab.tsx:118、data-model.md:192 |
| L-005 | `cwd\?\.value` (session-list 非テスト) / 「cwd.value を直接は読まない」の主張 | 3 / 4 | group-label.ts:51、SessionListScreen.tsx:148,150、session-search.ts:14,67、data-model.md:41、plan.md:56、tasks.md:29 |
| L-002 | `判断を強制` / 一覧に無いファイルを飛ばす処理 | 2 / 1 | allowlists.mjs:478、plan.md:234、check.mjs:753 |
| L-001 | `metaKey\|altKey\|shiftKey` (renderer features `*.test.tsx`。修飾キーの除外) | 0 | CommandPalette.tsx:38-46、ConversationSearchProvider.tsx:48-56、ConversationSearch.test.tsx:449 (Enter + Shift の IME のケースで対象外) |
| L-003 | `#\$\{` (src) / `sessionTargetKeys` (src/main) / `e2e-capability*.test.ts` | 2 / 2 / 0 | target.ts:42、e2e-capability.ts:121-122,556、composition-root.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- Round inheritance: resolved from 1: 0 / unresolved: 6 (M-001 / L-001 / L-002 / L-003 / L-004 / L-005) / new: 0。どの指摘も対象ファイルが `9d98c39..a4c37a8` で変わっていない。格上げする追加の事実は無いので、severity はすべて Round 1 のまま。L-003 だけは、CI が sidebar の spec を流すようになったことでリスクの一部 (黙って変わる経路) が下がった。Round 2 の差分 (verify.yml / sidebar-screenshot.spec.ts / 基準画像 / labels.ts / vitest.config.ts) には、プラットフォーム境界の新しい事象は無い。
