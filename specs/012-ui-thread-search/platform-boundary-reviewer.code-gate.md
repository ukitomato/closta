# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2 (code-gate iteration 2。pr-gate R1 の修正の後に再実行。前回は `specs/012-ui-thread-search/platform-boundary-reviewer.code-gate.md`、その後に `platform-boundary-reviewer.pr-gate.md`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search の照合先 (PB-1)。行の鍵 `targetKey\0sessionId` (PB-2)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーの判定と Principle II (PB-7)
  - FR-007: palette の稼働中と過去の候補。複数の所在の区別 (PB-2 / AD-003)
  - FR-009 / FR-010: `launchSession(config, origin)`。起動元が権限ゲートと `config` に混ざらないか (PB-4)
  - FR-011〜FR-013: `launch-usage.json` / `getLaunchUsage` (PB-1 / PB-6)
  - FR-018 / SC-008: E2E の固定の索引と基準画像。iter 2 で CI のステップと基準画像が足された (PB-2 / PB-6)
  - SC-005 / SC-006
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる)、AD-004 (HostPath / RuntimePath)
  - 本 diff は runtime / isolation の charter、AD-012、`src/agents/` に触れていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`checkLaunchOrigin` による起動元の厳密比較も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (基準画像の承認の記録 V-4 の妥当性も po / architecture)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当 (placeholder の文言の長さは ux)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

diff の範囲は `7bdb271..ddc052e` (scope は 96 ファイル)。iter 1 の後の差分 (`9d98c39..ddc052e`) を重点的に見た。`git diff --stat` で 17 ファイル。コードとして変わったのは次の 3 つだけで、ほかは基準画像の png 1 枚と spec_dir の文書。

- `.github/workflows/verify.yml:166-172`: e2e job (`runs-on: windows-latest`) の最後に `e2e/sidebar-screenshot.spec.ts` のステップを足した
- `e2e/sidebar-screenshot.spec.ts:17,82-97`: 撮る前に、区画のスクロールの領域を DOM の `scrollTop` で送る。見出しと最初の行が `toBeInViewport({ ratio: 1 })` であることを確かめる
- `src/renderer/src/features/session-list/labels.ts:202-206`: placeholder の文字列を短くした

本 reviewer の担当のファイルは iter 1 から 1 つも変わっていない。`.dependency-cruiser.js` / `eslint.config.mjs` / `scripts/constitution/*` / `session-ipc.ts` / `e2e-capability.ts` / `launch-usage-*` / `composition-root.ts` / `preload/index.ts` / `capability.ts` / `LaunchDialog.tsx` / `running-session-store.ts` / `CommandPalette.tsx` / `ConversationSearchProvider.tsx` / `session-search.ts` / `palette-commands.ts` / `group-label.ts` / `SessionListScreen.tsx` は、どれも diff stat に出てこない。そのため前の 6 件はすべて同じ行に未解消のまま残っており、追加の事実も無い。

PB ごとの結果 (iter 2 の差分):

- **PB-1**: 該当なし。placeholder は固定の文字列で、E2E のスクロールは DOM の座標だけを使う。どちらもパスを扱わない。iter 1 からの L-005 は残っている。
- **PB-2**: 該当なし (新しい事象なし)。E2E は固定の索引をそのまま使い、「今のランタイム」を持つ状態は増えていない。iter 1 からの L-003 / L-004 は残っている。
- **PB-3**: 該当なし。追加の行に `capabilities` / `autoModeSafe` は無い。
- **PB-4**: 該当なし。起動の経路は変えていない。2 つ目の E2E は既存の起動ダイアログから 10 回起動するだけで、stub の capability を通る。
- **PB-5**: 該当なし。パスの変換を足していない。
- **PB-6**: 該当なし。
  - 新しいステップは使い捨ての CI ランナーで playwright を流すだけ。
  - E2E は `CLOSTA_E2E` の stub で動く (`e2e/support/launch.ts:14,31`)。起動の利用記録もメモリ内の fake に入る (`src/main/app/e2e-capability.ts:593-597`)。
  - フォントは FontFace で注入する (`sidebar-screenshot.spec.ts:70-80`)。スクロールは renderer の DOM の状態だけを変える (`:85-94`)。
  - volume / `--restart` / ホストへの設定の書き込み / OS へのフォント登録は 0 件。
- **PB-7**: 規則のファイル (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/`) は iter 2 で変わっていない。M-001 / L-002 は残っている。基準画像の接尾辞 `-win32` は Playwright の既定の命名で、`runs-on: windows-latest` と一致する。プロダクトのコードの OS 分岐ではないので、Principle II の対象ではない。

## Findings

### [Medium] Principle II の検査 (項目 8) が今も renderer の `navigator.*` を見ていない。本 feature は、アプリ全体で効く修飾キーのショートカットを renderer に初めて入れた (M-001) (scope: system)

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:566` から始まる `PLATFORM_BRANCH_PATTERNS` には `process.*` / `os.*` / `process.env.OS` しか無い。`navigator.platform` / `userAgent` / `userAgentData` は無い。
  - 項目 8 (`C:/dev/closta/scripts/constitution/check.mjs:382-401`) は、この式でしか一致を取らない。
  - Ctrl+K は `C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:38-46` で、Ctrl+F は `C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:48-56` で受ける。どちらも OS を判定していないので、今は違反ではない。
  - roadmap の system-scope (5) (`C:/dev/closta/docs/roadmap.md:185-186`) の持ち主は、今も feature の名前が無い。
- **同種事象探索**:
  - `navigator|userAgent` (`scripts/constitution/*.mjs`): 0 件
  - `metaKey|altKey` (src/renderer): 4 件 (`CommandPalette.tsx:41,43` / `ConversationSearchProvider.tsx:51,53`)。どれも否定の条件
  - ESLint の `no-restricted-globals` / `no-restricted-properties`: 0 件 (前の round の結果。設定ファイルは iter 2 で変わっていない)
- **リスク/影響**:
  - Principle II の Automated (正本) は「等価な API を含む」と書く。renderer では `existing_violations: 0` が遵守の証拠にならない。
  - 「macOS では Cmd」を `navigator.platform` で分ける変更は、上の 2 か所に最も入りやすい。入っても項目 8 は素通りする。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足す。あわせて違反サンプルを 1 つ置き、発火を確かめる。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - `/\bnavigator\s*\[\s*['"\`](platform|userAgent|userAgentData)['"\`]\s*\]/`
  - 本 PR で足さないなら、roadmap (5) に持ち主の feature の名前を書く。
- **根拠**: Constitution Principle II (Verification)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本は本 feature の範囲の外で、穴は本 feature より前からある。追加の事実が無いので severity は前の round のまま

### [Low] palette の過去の候補は、補足にグループの表示しか出さない。複数の所在 (Windows と WSL のディストロ) にある同じフォルダ・同じ題の行を見分けられない (L-004) (scope: feature)

- **観察**:
  - 過去の候補の `detail` は `groupLabelOf(section.group, folderName, row.session)` だけ (`C:/dev/closta/src/renderer/src/features/shell/palette-commands.ts:211-218`)。一方、稼働中の候補はランタイム名を出す (`:176-187`)。
  - `group-label.ts:19-21` は「登録フォルダは複数所在のセッションを含みうる」と明記している。
  - 設計の正本も「補足: グループの表示」のまま (`C:/dev/closta/specs/012-ui-thread-search/data-model.md:192`)。
  - 選ぶ対象は `rowKey` で正しく区別されている (`palette-commands.test.ts:268-285`)。
- **同種事象探索**:
  - `detail:` (`palette-commands.ts`): 3 件 (`:161` 操作、`:187` 稼働中、`:218` 過去)
  - `location|targetLabel|originKind` (palette の 2 ファイル): 0 件 (前の round の結果。ファイルは iter 2 で変わっていない)
- **リスク/影響**: AD-003 のとおり、所在は複数ありうる。同じ「題 · フォルダ名」の候補が所在の数だけ並び、どれがどの所在かを見分けられない。実害は、読むだけの過去ログで誤った行を開くことに限られる。
- **推奨アクション**:
  - 補足を「グループの表示 · 所在」にする (`locationIndexOf(index.outcomes)` を渡す)。`data-model.md:192` も同じ PR で直す。
  - `targetKey` だけが違う 2 行が補足で区別されることを確かめるテストを 1 つ足す。
- **根拠**: AD-003 Decision Outcome、PB-2
- **scope 根拠**: touched file (`palette-commands.ts` / `data-model.md`) で直せる。pr-gate R1 L-004 から未解消で、追加の事実は無い

### [Low] 「Thread search は `cwd.value` を直接は読まない (Principle I)」という主張は、未登録の区画では字面どおりにしか成り立たない (L-005) (scope: feature)

- **観察**:
  - 未登録の区画の見出しは `group.cwd?.value ?? group.cwdDisplay` から作られる (`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:51`)。サイドバーも同じ式を自分で書いている (`C:/dev/closta/src/renderer/src/features/session-list/SessionListScreen.tsx:148,150`)。
  - 一方で `C:/dev/closta/src/renderer/src/features/search/session-search.ts:14` は「`cwd.value` (PathDTO) を直接は読まない」と書く。`data-model.md:41` / `plan.md:56` / `tasks.md:29` も同じ主張で、iter 2 では変わっていない。
  - fixture の未登録の区画は `cwd.value` と `cwdDisplay` が同じ値で、見出しの由来を区別できない (`session-search.test.ts:66-70`)。
- **同種事象探索**: `cwd\??\.value` (renderer の features。テストを除く): 6 件。本件に当たるのは 3 件 (`group-label.ts:51`、`SessionListScreen.tsx:148,150`)。残りの `WorkspaceFoldersScreen.tsx:466,573` は検索と関係が無い
- **リスク/影響**: Principle I の違反ではなく、名前空間を取り違えることもない。ただ、パスの値が検索の対象にならないという、実際には無い不変条件を文書とテスト名が主張している。見出しの導出が 2 か所にあるので、片方だけを変えると表示と検索の対象が黙ってずれる。
- **推奨アクション**:
  - 4 か所の主張を事実に合わせる。
  - テスト名を「登録フォルダの行の `cwd.value` にだけある語では一致しない」に直す。
  - `cwd.value` と `cwdDisplay` が違う未登録の区画のケースを足す。
  - `SessionListScreen.tsx:148,150` で `groupLabelOf` を呼び、導出を 1 か所にする。
- **根拠**: Constitution Principle I、AD-004、PB-1
- **scope 根拠**: touched files で直せる。pr-gate R1 L-005 から未解消で、追加の事実は無い

### [Low] 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。plan と allowlists の注記は「新しいファイルは判断を強制される」と書くが、事実と違う (L-002) (scope: system)

- **観察**:
  - 項目 15 は、一覧に無いファイルを `continue` で黙って飛ばす (`C:/dev/closta/scripts/constitution/check.mjs:753`)。
  - それでも次の 2 か所は「判断を強制」と書く。
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:478`
    - `C:/dev/closta/specs/012-ui-thread-search/plan.md:234`
  - `services-not-to-io` の `from` も実名で固定されている (`C:/dev/closta/.dependency-cruiser.js:254`)。
- **同種事象探索**:
  - `判断を強制`: 2 件 (上の 2 か所)
  - 一覧に無いファイルを飛ばす処理: 1 か所 (`check.mjs:753`)
- **リスク/影響**: 今は task (BE-042) の 1 行が覆っているだけで、規則が覆っているわけではない。注記を信じた次の feature が足し忘れると、「検査して通った」と「検査せずに通った」を区別できなくなる。
- **推奨アクション**:
  - (feature) `plan.md:234` の括弧を事実に直す。
  - (system) 次のどちらかにする。`services-not-to-io` も同じ扱いにする。
    - 項目 15 に網羅の検査を足す: `src/main/app/*.ts` (テストを除く) が、一覧か明示の除外リストに載っていること
    - `allowlists.mjs:478` の注記を事実に合わせる
- **根拠**: Constitution Principle VI Verification、AD-025 §9、PB-7
- **scope 根拠**: 規則の本体は範囲の外。design-gate L-003 → code-gate L-002 → pr-gate L-002 と未解消で、追加の事実は無い

### [Low] Ctrl+K / Ctrl+F の修飾キーの判定は正しく実装されたが、テストでも文書でも固定されていない (L-001) (scope: feature)

- **観察**:
  - 判定式は `ctrlKey && !altKey && !shiftKey && !metaKey` (`CommandPalette.tsx:38-46` / `ConversationSearchProvider.tsx:48-56`)。
  - テストの `ctrlK()` は `ctrlKey: true` しか渡さない (`CommandPalette.test.tsx:267-273`)。修飾キーの除外を確かめるケースは 0 件。
  - 012 の設計文書にも、この判定式は書かれていない。
- **同種事象探索**:
  - `metaKey|altKey` (src/renderer): 非テストのコードに 4 件だけ。テストには 0 件
  - 012 の 6 文書: 0 件 (iter 2 の data-model の変更は §5 / §7 だけで、§2 / §3 は変わっていない)
- **リスク/影響**: `ctrlKey || metaKey` に緩める変更や、OS で分ける変更が入っても、どのテストも落ちない。M-001 と重なって、機械では検出できない。AltGr の文字入力を奪う回帰も検出できない。
- **推奨アクション**:
  - 負例を 3 つ足す: `{key:'k', metaKey:true}` / `{key:'k', ctrlKey:true, altKey:true}` / `{key:'k', ctrlKey:true, shiftKey:true}`。どれも「開かない」と「`preventDefault` しない」を確かめる。Ctrl+F も同じ。
  - data-model §2 / §3 に判定式を 1 行書く。
- **根拠**: Constitution Principle II、AD-003 Decision Outcome
- **scope 根拠**: テストと data-model で直せる。code-gate L-001 から未解消で、追加の事実は無い

### [Low] E2E の固定の索引の鍵は、domain の関数を使わずに文字列で組まれている。`sessionTargetKeys` は空のまま (L-003) (scope: feature)

- **観察**:
  - 鍵は手で組んでいる: `C:/dev/closta/src/main/app/e2e-capability.ts:121` の `` `${input.runtimeId}#0` `` と `:122` の `'host#0'`。`enumerationTargetKey` (`src/domain/session/target.ts:41-43`) は使っていない。
  - `sessionTargetKeys: () => []` のまま (`e2e-capability.ts:556`)。
  - 固定の索引の単体テストは 0 件。
  - **iter 2 での状況の変化 (コードは同じ)**: このステップは CI で流れるようになり (`.github/workflows/verify.yml:171-172`)、基準画像もコミットされた (`e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png`)。そのため、鍵の書式がずれても基準画像が「黙って変わる」ことはもう無い。`sidebar-screenshot.spec.ts:64` の `toHaveCount(4)` か、画像の比較で落ちる。ただし落ちたときの原因は分かりにくいままである。
- **同種事象探索**:
  - `sessionTargetKeys|#0\`|'host#0'|enumerationTargetKey` (`e2e-capability.ts`): 3 件 (`:121,122,556`)。`enumerationTargetKey` は 0 件
- **リスク/影響**: palette や Thread search から過去の行を開く E2E を後で足すと、`isKnownTargetKey` に弾かれて transcript の取得が理由の分からないまま失敗する。
- **推奨アクション**:
  - 鍵を `enumerationTargetKey(...)` で作り、`sessionTargetKeys` はその 2 つを返す。
  - 単体テストを 1 つ足す:「各行の `targetKey` が `outcomes` の鍵と `sessionTargetKeys()` の両方に入っている」。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: touched file (`e2e-capability.ts`) で直せる。code-gate L-003 から未解消。iter 2 の CI 化で、リスクのうち「黙って変わる」の部分だけが消えた。severity は Low のまま

## H (テスト / regression) の所見

- **既存の振る舞いを壊していない根拠**: iter 2 で担当範囲のファイルは 1 つも変わっていない (`git diff --stat 9d98c39..ddc052e` で src の変更は `labels.ts` の文字列の定数だけ)。PB-4 の回帰を固定するテストもそのまま残っている。
  - `session-ipc.test.ts`: 起動元 8 通りのどれでも service は `[CONFIG]` だけで呼ばれる。記録するのは受け付けた起動だけ。記録が失敗しても結果は `launching`
  - `LaunchDialog.test.tsx:1281-1285`: 設定のキーは 6 軸だけ
- **FR-018 の E2E の範囲 (PB-2)**:
  - コミットされた基準画像 (279×361) に写るのは、最初のグループ「E2E Project」(WSL の 3 行) だけ。Windows のグループと未登録の区画は写らない。
  - 2 つの outcome の `targetLabel` はどちらも `'e2e'` (`e2e-capability.ts:193,203`)。
  - したがってこの基準画像では、所在の表示の回帰 (行と outcome の対応の取り違え) を検出できない。FR-018 の目的 (日本語の描画) からは外れるので、指摘にはしない。所在のラベルの対応は単体テストが担う前提と読んだ (`SessionListScreen.test.tsx` に `targetLabel` が 9 件。本 round では中身を精査していない)。
- **L-001 / L-003 / L-004 / L-005**: 検出できるテストが無い。推奨のとおり、負例・単体テスト・fixture を足すこと。
- **M-001**: 検出の式が無い。違反サンプルと一緒に足すこと。
- **観測点**: 記録の失敗は `[launch-usage-store]` の接頭辞で、理由キーと errno だけを出す (`src/main/app/launch-usage-service.ts`)。iter 2 では変わっていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\|userAgent` (scripts/constitution) / `metaKey\|altKey` (src/renderer) | 0 / 4 | allowlists.mjs:566、check.mjs:382-401、CommandPalette.tsx:41,43、ConversationSearchProvider.tsx:51,53、roadmap.md:185-186 |
| L-004 | `detail:` (palette-commands.ts) | 3 | palette-commands.ts:161,187,218、group-label.ts:19-21、data-model.md:192 |
| L-005 | `cwd\??\.value` (renderer の features。テストを除く) | 6 (本件に当たるのは 3) | group-label.ts:51、SessionListScreen.tsx:148,150、session-search.ts:14 |
| L-002 | `判断を強制` / 項目 15 の skip | 2 / 1 | allowlists.mjs:478、plan.md:234、check.mjs:753、.dependency-cruiser.js:254 |
| L-001 | `metaKey\|altKey` (renderer のテスト) | 0 | CommandPalette.test.tsx:267-273、CommandPalette.tsx:38-46、ConversationSearchProvider.tsx:48-56 |
| L-003 | `sessionTargetKeys\|#0\`\|'host#0'\|enumerationTargetKey` (e2e-capability.ts) | 3 | e2e-capability.ts:121,122,556、target.ts:41-43、verify.yml:171-172、sidebar-screenshot.spec.ts:64 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- Round inheritance:
  - 前の round から解消したもの: 0
  - 未解消: 6 (M-001 / L-001 / L-002 / L-003 は code-gate iter 1 から、L-004 / L-005 は pr-gate R1 から)
  - 新しい指摘: 0
  - severity はどれも前の round のまま。担当範囲のコードが変わっておらず、追加の事実が無いため。L-003 だけはリスクの記述を iter 2 の CI 化に合わせて狭めた。
  - iter 2 の差分 (`verify.yml` / E2E のスクロール / placeholder / 基準画像) には、プラットフォーム境界の新しい事象は無い。
