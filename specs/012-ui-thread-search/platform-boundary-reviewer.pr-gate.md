# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
(pr-gate Round 1。scope: system。起動理由は `.dependency-cruiser.js` の変更。前段は `specs/012-ui-thread-search/platform-boundary-reviewer.code-gate.md`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search の照合先 (PB-1)。行の鍵 `targetKey\0sessionId` (PB-2)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーの判定と Principle II (PB-7)
  - FR-007: palette の稼働中と過去の候補。複数の所在をどう区別するか (PB-2 / AD-003)
  - FR-009 / FR-010: `launchSession(config, origin)`。起動元が権限ゲートと `config` に混ざらないか (PB-4)
  - FR-011〜FR-013: `launch-usage.json` / `getLaunchUsage` (PB-1 / PB-6)
  - FR-018: E2E の固定の索引 (PB-1 / PB-2)
  - SC-005 / SC-006 / SC-008
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる。シングルトンではない)
  - AD-004 Decision (HostPath / RuntimePath)
  - 本 diff は runtime / isolation の charter、AD-012、`src/agents/` に触れていない
  - system scope の起動理由: `.dependency-cruiser.js` の `services-not-to-io`、`scripts/constitution/allowlists.mjs` の `WSL_FREE_DIRECTORIES`、`eslint.config.mjs` の element の厳格さを戻す block
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (起動元の厳密比較 `checkLaunchOrigin` が未信頼入力の検証になっている点も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当 (`.bak` の蓄積・fsync など永続化の細部は database-reviewer。サイドバーの基準画像の扱いは po / ux)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

diff は base `main...HEAD` (merge-base `7bdb271` / HEAD `9d98c39`) で、114 files、+14512 -437。

**code-gate の後にコードは変わっていない。** 担当範囲の 18 ファイルについて HEAD の blob SHA を `.gate-verdict-code.json` の `touched_files[].sha` と比べ、すべて一致した。比べたのは `.dependency-cruiser.js` / `eslint.config.mjs` / `allowlists.mjs` / `session-ipc.ts` / `e2e-capability.ts` / `launch-usage-service.ts` / `launch-usage-store.ts` / `composition-root.ts` / `preload/index.ts` / `capability.ts` / `LaunchDialog.tsx` / `running-session-store.ts` / `CommandPalette.tsx` / `ConversationSearchProvider.tsx` / `session-search.ts` / `palette-commands.ts` / session と ui の charter。そのため code-gate で出した 4 件は、すべて追加の事実が無いまま未解消で、severity も同じにした。本 round では、code-gate で深く見なかった 2 か所を追加で見た: palette の過去の候補と、Thread search の未登録の区画の照合先。

PB ごとの結果:

- **PB-1**: 名前空間を取り違える経路は無い。
  - 起動元は 2 値の列挙で、IPC を越えた後に厳密比較される (`src/main/app/session-ipc.ts:161`)。
  - `getLaunchUsage` は DTO を射影し直して返し (`session-ipc.ts:1669-1682` 相当の `handleGetLaunchUsage`)、パスは境界を越えない。
  - store は `userDataDir: HostPath` を受け、`hostPathOps.join` でパスを組む (`src/main/infra/settings/launch-usage-store.ts:95,103`)。
  - 未登録の区画の見出しについての文書とテストの主張は不正確 (L-005)。
- **PB-2**:
  - 過去の候補は `rowKey` で選ぶので、選ぶ対象は取り違えない (`src/renderer/src/features/shell/palette-commands.ts:219,303`)。
  - ただし表示には所在が無く、複数の所在の行を見分けられない (L-004)。
  - 稼働中の候補はキャッシュせず、`runtimeName` を毎回引く。
- **PB-3**: 該当なし。runtime の `capabilities` には触れていない (diff の追加行に `autoModeSafe` / `isAutoModeAllowed` は 0 件)。
- **PB-4**: 該当なし。
  - 起動の service に渡るのは `config` だけ (`session-ipc.ts:162`)。
  - palette の「新規起動」は起動ダイアログを開くだけ (`palette-commands.ts:115-118,260-261,296`)。
  - renderer から `launchSession` を呼ぶのは `running-session-store.ts:380` の 1 か所のまま。
  - diff の追加行で `permissionMode` が現れるのはテストだけ。
- **PB-5**: 該当なし。パスの変換を足していない。
- **PB-6**: 該当なし。
  - 書くのは、既存の 3 つの store と同じユーザデータディレクトリの `launch-usage.json` と、その `.tmp` / `.bak` だけ (`docs/discovery.md` の追記)。
  - docker / volume / `--restart` / 子プロセスは 0 件。
  - E2E はフォントを FontFace で注入し、OS には登録しない。
- **PB-7**: M-001 と L-002 が残っている。
  - 新しいファイルは、既存の規則の範囲に入っている。
    - `src/renderer/src/features/search/` は boundaries の `ui`。
    - `launch-usage-store.ts` は Principle V の項目 17 の `SECRET_LITERAL_SCAN_DIRS` の中。
    - `src/domain/session/launch-usage.ts` は `domain-not-to-io` と `WSL_FREE_DIRECTORIES` の `src/domain/session/` の中。
  - `services-not-to-io` に列挙された 7 つの名前は、すべて実在のファイルに一致した (Glob で 7/7)。
  - `src/main/app` のテスト以外で標準 I/O を import するのは `protocol.ts` / `composition-root.ts` / `e2e-capability.ts` だけ。一覧に無い状態を持つ service が I/O を直接 import している例は無い。
  - eslint の新しい block は `error` を戻すだけで、規則を緩めない。`GENERATED_FILES` が緩めるのは体裁の規則だけで、レイヤ規則と禁止 import は掛かり続ける (`eslint.config.mjs:64-72,530-541`)。
  - pending の扱い: quickstart-results は ok 20 / pending 1 (#5) と書き分けている。invoker の規則の検証は 64/64 一致。

## Findings

### [Medium] Principle II の検査 (項目 8) が今も renderer の `navigator.*` を見ていない。本 feature は、アプリ全体で効く修飾キーのショートカットを renderer に初めて入れた (M-001) (scope: system)

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:566-581` の `PLATFORM_BRANCH_PATTERNS` には、`process.*` / `os.*` / `process.env.OS` しか無い。`navigator.platform` / `navigator.userAgent` / `navigator.userAgentData` は無い。
  - 項目 8 (`C:/dev/closta/scripts/constitution/check.mjs:382-401`) は、この式でしか一致を取らない。`.tsx` も走査の対象なので、穴は式の側にある (`allowlists.mjs:27-45`)。
  - 本 feature は `window` の capture で Ctrl+K と Ctrl+F を受ける。
    - Ctrl+K: `C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:40,43`
    - Ctrl+F: `C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:50,53`
  - 今の実装は OS を判定していない。違反は無い。
  - roadmap の system-scope (5) (`C:/dev/closta/docs/roadmap.md:185-186`) は今も「項目 8 の持ち主に送る」のままで、feature の名前が無い。この穴は 001 R1 M-004 / 016 design-gate R2 L-105 / 012 design-gate / 012 code-gate で繰り返し指摘されている。
- **同種事象探索**:
  - `navigator\.|userAgent|getModifierState|metaKey|ctrlKey` (src): `navigator` は clipboard の 2 か所だけ (`hooks/use-copy-to-clipboard.ts:15,19`、`components/image.tsx:107,117`)。`navigator.platform` / `userAgent` は 0 件。`metaKey` は非テストのコードに 2 件 (上の 2 ファイル)
  - ESLint の `no-restricted-globals` / `no-restricted-properties` の設定: 0 件
- **リスク/影響**:
  - Principle II の Automated (正本) は「等価な API を含む」と書く。renderer の等価な経路が抜けているので、renderer では `existing_violations: 0` が遵守の証拠にならない。
  - 「macOS では Cmd」を `navigator.platform` で分ける変更は、この 2 か所に最も入りやすい。入っても項目 8 は素通りする。
  - Principle II の「ホスト OS の規約」の例外 (`platform-ok:`) は `process.platform` を前提に書かれており、renderer には正規の書き方が無い。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足し、`tests/rule-fixtures/` に違反サンプルを 1 つ置いて発火を確かめる。許可リストは増やさないので、ADR は要らない。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - `/\bnavigator\s*\[\s*['"\`](platform|userAgent|userAgentData)['"\`]\s*\]/`
  - 本 PR で足さないなら、roadmap (5) に持ち主の feature の名前を書く。候補は OPT-mac か、項目 8 を次に触る feature。
- **根拠**: Constitution Principle II (Verification)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本は本 feature の対象範囲の外で、穴は本 feature より前からある。追加の事実は無い (renderer に `navigator.platform` の利用は増えていない) ので、severity は code-gate のまま

### [Low] palette の過去の候補は、補足にグループの表示しか出さない。複数の所在 (Windows と WSL のディストロ) にある同じフォルダ・同じ題の行を見分けられない (L-004) (scope: feature)

- **観察**:
  - 過去の候補の補足 (`detail`) は `groupLabelOf` の結果だけである (`C:/dev/closta/src/renderer/src/features/shell/palette-commands.ts:211-218`)。登録フォルダの区画なら、フォルダの表示名だけになる。
  - 一方、稼働中の候補は補足にランタイム名を出す (`palette-commands.ts:176-182`)。
  - 登録フォルダのグループは、複数の所在のセッションを含みうる。`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:19-21` が「`folder` variant は `location` を持たない (登録フォルダは複数所在のセッションを含みうる)」と明記している。
  - サイドバーには所在の絞り込みがある (`SessionListScreen.tsx:993-1004`)。開いた後の「概要」も所在を出す (`OverviewTab.tsx:118,129`)。palette には絞り込みも所在の表示も無い。
  - Thread search と palette の一致の対象 (`session-search.ts:57-68`) には、所在の名前も `targetLabel` も入らない。palette でディストロの名前を打っても候補は絞れない。
  - 設計の正本も同じ形である (`specs/012-ui-thread-search/data-model.md:192`「補足: グループの表示」)。
  - 選択そのものは `rowKey` で正しく区別されている。`palette-commands.test.ts:268-285` が `wsl:Ubuntu#0` / `#1` の行で確かめている。
- **同種事象探索**:
  - `location|targetLabel|originKind` (`palette-commands.ts` / `CommandPalette.tsx`): 0 件
  - `locationIndexOf` の使用 (renderer の非テストのコード): 2 件 (`SessionListScreen.tsx:994` / `OverviewTab.tsx:118`)。palette は 0 件
  - `detail` の組み立て (`palette-commands.ts`): 2 件 (`:187` 稼働中・`:218` 過去)
- **リスク/影響**:
  - AD-003 のとおり、`WslRuntime` はディストロごとに複数ある。Windows と WSL から同じ登録フォルダで作業すると、palette には「題 · フォルダ名」が同じ候補が所在の数だけ並び、どれがどの所在か分からない。
  - 過去ログを読むだけなので、実害は誤った行を開くことに限られる。開いた後に「概要」で所在を確かめられる。
  - 稼働中の候補だけにランタイム名があるので、同じ palette の中で表示が非対称になる。
- **推奨アクション**:
  - `PalettePastSource` に `locationIndexOf(index.outcomes)` を渡し、補足を「グループの表示 · 所在」(例: `案件フォルダ · Ubuntu`) にする。data-model §3 の表の行 (`:192`) を同じ PR で直す。
  - 所在の名前を一致の対象に入れるかは、ここで決めて data-model §1 に書く。入れるなら、Thread search と同じ純関数に足す (FR-002 の「1 か所」を保つ)。
  - テストを 1 つ足す。題もフォルダも同じで、`targetKey` が `wsl:Ubuntu#0` と `host#0` の 2 行が、補足で区別されることを確かめる。
- **根拠**: AD-003 Decision Outcome (インスタンスは複数ありうる)、PB-2
- **scope 根拠**: 本 feature の touched file (`palette-commands.ts` / `data-model.md`) で直せる。新しい指摘。code-gate では選択の鍵だけを見て、表示は見ていなかった

### [Low] 「Thread search は `cwd.value` を直接は読まない (Principle I)」という主張は、未登録の区画では字面どおりにしか成り立たない。見出しの文字列が `group.cwd.value` そのもので、テストはそれを区別できない (L-005) (scope: feature)

- **観察**:
  - 未登録の区画の見出しは、`groupLabelOf` が `group.cwd?.value ?? group.cwdDisplay` を返す (`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:50-51`)。
  - サイドバーも同じ式を自分で書いて描いている (`C:/dev/closta/src/renderer/src/features/session-list/SessionListScreen.tsx:148,150`)。
  - Thread search はこの見出しを一致の対象に入れる (`C:/dev/closta/src/renderer/src/features/search/session-search.ts:67`)。したがって未登録の区画では、PathDTO の値の部分 (`home` / ユーザ名 / `mnt` など) がすべて一致の対象になる。
  - それでも次の 4 か所は「`cwd.value` を直接は読まない」と書く。
    - `session-search.ts:14`
    - `specs/012-ui-thread-search/data-model.md:41`
    - `specs/012-ui-thread-search/plan.md:56` (Constitution Check の I の行)
    - `specs/012-ui-thread-search/tasks.md:29`
  - `data-model.md:39` だけは「未登録は表示用のパス」と書いている。
  - テストの状態:
    - fixture の未登録の区画は `cwd.value` と `cwdDisplay` が同じ値で、見出しがどちらから来たかを区別できない (`session-search.test.ts:66-70`)。
    - 「cwd.value にだけある語では一致しない (Principle I)」(`:126-128`) が確かめるのは、登録フォルダの行 (S2) の `session.cwd` だけである。
- **同種事象探索**:
  - `cwd\?\.value` (renderer の非テストのコード): 3 件 (`group-label.ts:51`、`SessionListScreen.tsx:148,150`)。同じ導出が 2 か所にある
  - `cwd.value` を直接は読まない旨の主張: 4 件 (上の列挙)
- **リスク/影響**:
  - パスの解決や再 branding はしていないので、Principle I の違反ではない。名前空間の取り違えも起きない。照合は表示と同じ文字列の部分一致である。
  - ただし、テスト名と plan の Constitution Check が「パスの値は検索の対象にならない」という、実際には無い不変条件を主張している。この主張を前提にする判断 (O-9 の本文の横断検索、保存する情報の範囲の議論) が誤る。
  - 見出しの導出が 2 か所にあるので、片方だけを変える (例: `suggestedDisplayName` を見出しに出す) と、表示と検索の対象が黙ってずれる。今のテストではそれを検出できない。
- **推奨アクション**:
  - 主張を事実に直す。「行の `cwd` は読まない。未登録の区画は、見出しに描く `group.cwd.value` (main が変換した表示用のパス) の文字列で一致する」。直す先は `session-search.ts:14` / `data-model.md:41` / `plan.md:56` / `tasks.md:29`。
  - テストの名前を「登録フォルダの行の `cwd.value` にだけある語では一致しない」に直す。
  - 未登録の区画で `cwd.value` と `cwdDisplay` を別の値にしたケースを足し、見出しの文字列 (`cwd.value`) で一致することを固定する。
  - `SessionListScreen.tsx:148,150` で `groupLabelOf` を呼ぶようにして、導出を 1 か所にする。
- **根拠**: Constitution Principle I (主張の正確さ)、AD-004、PB-1
- **scope 根拠**: 本 feature の touched files (`session-search.ts` / `session-search.test.ts` / 設計文書) で直せる。新しい指摘。code-gate の PB-1 の記述も、同じ不正確さを含んでいた

### [Low] 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。plan と allowlists の注記は「新しいファイルは判断を強制される」と書くが、事実と違う (L-002) (scope: system)

- **観察**:
  - 本 PR は 2 つの一覧に `launch-usage-service` を足した。
    - `C:/dev/closta/.dependency-cruiser.js:254`
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:503`
  - 本 round の起動理由はこの変更である。ただし項目 15 は、一覧に無いファイルを `continue` で黙って飛ばす (`C:/dev/closta/scripts/constitution/check.mjs:753`)。
  - それでも次の 2 か所は、新しいファイルが判断を強制されるかのように書いている。
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:477-478`「新規ファイルは列挙されていないので、追加時に判断を強制される」
    - `C:/dev/closta/specs/012-ui-thread-search/plan.md:234`「新しいファイルに判断を強制する形」
  - `services-not-to-io` の `from` も実名で固定されている。規則の検証の違反サンプルは `__rulecheck__/service-io-import.ts` の 1 つだけ (`.dependency-cruiser.js:245-256`)。列挙した名前の書き間違いも、足し忘れも検出されない。
- **同種事象探索**:
  - `判断を強制`: 2 件 (`allowlists.mjs:478` / `plan.md:234`)
  - 一覧に無いファイルを飛ばす処理: 1 か所 (`check.mjs:753`)
  - 一覧の名前と実在のファイル: 7/7 が一致 (Glob)。今は書き間違いが無いことを手で確かめただけである
- **リスク/影響**:
  - 今回は task (BE-042) が足したので覆われている。覆っているのは task の 1 行で、規則ではない。
  - 注記を字面どおりに読んだ次の feature は、足し忘れても検査で落ちると信じる。そうなると「検査したから通った」と「検査していないから通った」が区別できなくなる (Principle VI の 3 状態の趣旨)。
- **推奨アクション**:
  - (feature) `plan.md:234` の括弧を「実名列挙。一覧に無いファイルは検査されないので、新しい app のモジュールは本 task で足す」に直す。
  - (system) 次のどちらかにする。
    - 項目 15 に網羅の検査を足す。「`src/main/app/*.ts` (テストを除く) は、一覧か明示の除外リストに載っていること」。あわせて、一覧の各名前が実在のファイルであることも確かめる。
    - `allowlists.mjs:477-478` の注記を事実に合わせる。
  - (system) `services-not-to-io` も同じ扱いにする。
- **根拠**: Constitution Principle VI Verification (除外はファイル単位の明示リスト、報告は ok / violation / pending の 3 状態)、AD-025 §9、PB-7
- **scope 根拠**: 規則の本体は本 feature の対象範囲の外。plan の字面だけは本 feature で直せる。design-gate L-003 → code-gate L-002 から未解消で、追加の事実は無い

### [Low] Ctrl+K / Ctrl+F の修飾キーの判定は正しく実装されたが、テストでも文書でも固定されていない (L-001) (scope: feature)

- **観察**:
  - 判定式は `ctrlKey && !altKey && !shiftKey && !metaKey` (`C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:38-46`、`C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:48-56`)。OS を判定せず、AltGr も除く。
  - テストには、この式を固定するケースが無い。
    - `CommandPalette.test.tsx:267-273` の `ctrlK()` は `ctrlKey: true` だけを渡す。
    - renderer のテストで `metaKey` / `altKey` を渡すケースは 0 件。
  - spec / plan / tasks / data-model / research / quickstart にも、この判定式は書かれていない。
- **同種事象探索**:
  - `metaKey|altKey|AltGr|shiftKey` (src/renderer の `*.test.tsx`): 修飾キーの除外を確かめるケースは 0 件
  - `ctrlKey|metaKey|altKey|AltGr|OPT-mac` (012 の 6 文書): 0 件
- **リスク/影響**:
  - 「macOS では Cmd も」と `ctrlKey || metaKey` に緩める変更や、OS で分ける変更が入っても、どのテストも落ちない。M-001 の穴と重なり、その変更を機械では検出できない。
  - AltGr+K / AltGr+F の文字入力を奪う回帰も検出できない。
- **推奨アクション**:
  - `CommandPalette.test.tsx` と `ConversationSearch.test.tsx` に、次の負例を 1 つずつ足す。どれも「開かない」かつ「`preventDefault` しない」を確かめる。
    - `{ key: 'k', metaKey: true }`
    - `{ key: 'k', ctrlKey: true, altKey: true }`
    - `{ key: 'k', ctrlKey: true, shiftKey: true }`
  - data-model §2 / §3 に次の 1 行を置く。「修飾キーは `ctrlKey && !altKey && !shiftKey && !metaKey` で判定する。renderer で OS を判定しない。macOS の Cmd は OPT-mac で決める」。
- **根拠**: Constitution Principle II、AD-003 Decision Outcome
- **scope 根拠**: 本 feature のテストと data-model で直せる。code-gate L-001 から未解消で、追加の事実は無い

### [Low] E2E の固定の索引の鍵は、domain の関数を使わずに文字列で組まれている。`sessionTargetKeys` は空のまま (L-003) (scope: feature)

- **観察**:
  - 鍵はテンプレート文字列で手で組んでいる (`C:/dev/closta/src/main/app/e2e-capability.ts` の `e2eSessionIndex`。`` `${input.runtimeId}#0` `` / `'host#0'`)。domain の `enumerationTargetKey(location, ordinal)` (`C:/dev/closta/src/domain/session/target.ts:41-43`) は使っていない。
  - 今の値は `locationNamespace` (`src/domain/workspace/folder.ts:73-75`) の結果と一致することを確かめた。
  - `sessionTargetKeys` は `() => []` のままである。この E2E では、過去の行の `getTranscript` は `isKnownTargetKey` で必ず弾かれる (`C:/dev/closta/src/main/app/session-ipc.ts:104-106` 相当)。
  - 固定の索引のテストは無い (`src/main/app/e2e-capability*.test.ts` は 0 件)。
- **同種事象探索**:
  - `#\$\{` (src。鍵の組み立て): 2 件。本番 `target.ts:42`、E2E `e2e-capability.ts` の `e2eSessionIndex`
  - `sessionTargetKeys` (src/main): 本番の `composition-root.ts` と E2E の `e2e-capability.ts` の 2 か所
- **リスク/影響**:
  - 今の `e2e/sidebar-screenshot.spec.ts` は過去の行を開かないので、壊れる経路は無い。
  - palette や Thread search から過去の行を開く E2E を後で足すと、中央の transcript の取得が理由の分からないまま失敗する。
  - 鍵の書式を変えると、E2E の鍵だけが古いまま残り、所在の絞り込みで行が落ちて基準画像が黙って変わる。
- **推奨アクション**:
  - 鍵を `enumerationTargetKey({ kind: 'wsl', distroName }, 0)` / `enumerationTargetKey({ kind: 'windows' }, 0)` で作る。
  - `sessionTargetKeys` は、その 2 つの鍵を返すようにする。
  - 単体テストを 1 つ足す。「各行の `targetKey` が `outcomes` のどれかの鍵と一致し、`sessionTargetKeys()` にも入っている」。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: 本 feature の touched file (`e2e-capability.ts`) で直せる。code-gate L-003 から未解消で、追加の事実は無い

## H (テスト / regression) の所見

- **回帰の根拠 (PB-4)**: 起動元が起動の可否と `config` に漏れないことを、次のテストが固定している。
  - `C:/dev/closta/src/main/app/session-ipc.test.ts`
    - `:476-494`: 起動元 8 通りのどれでも、service は `[CONFIG]` だけで 1 回呼ばれる
    - `:496-523`: 記録するのは受け付けた preset / manual のときだけ
    - `:525-531`: 形の不正な設定は起動も記録もしない
    - `:533-548`: 記録が reject しても、同期で投げても、終わらなくても、結果は `launching`
  - `C:/dev/closta/src/renderer/src/features/session/LaunchDialog.test.tsx:1281-1285`: capability に渡る設定のキーは 6 軸だけ (`permissionMode` を含む)。起動元は入らない
- **SC-006**: `C:/dev/closta/src/domain/capability.test.ts` が `IPC_CHANNELS` の集合を固定する。境界の広がりを機械で検出できる。
- **PB-2**: 選択の正しさ (`targetKey` の違う行を `rowKey` で区別する) は、`palette-commands.test.ts:268-285` が確かめている。表示の区別 (L-004) を確かめるテストは無い。
- **L-005**: 未登録の区画の fixture は `cwd.value` と `cwdDisplay` が同じ値で、見出しの由来と、表示と検索の一致を固定できていない。
- **L-001 / L-003**: 検出できるテストが無い。推奨のとおり、負例と単体を足すこと。
- **M-001**: 検出の式が無い。違反サンプルと一緒に足すこと。
- **既存の振る舞いを壊していない根拠**: code-gate の後にコードは変わっていない (担当範囲の 18 ファイルの blob SHA が一致)。したがって次の結果がそのまま当たる。
  - code-gate の test track: 2266 passed / 0 failed
  - lint track: depcruise / constitution-check / eslint がすべて exit 0
  - 本 round の invoker の規則の検証: 64/64 一致
- **観測点**: 記録の失敗は `[launch-usage-store]` の接頭辞で、理由キーと errno のコードだけを出す (`C:/dev/closta/src/main/app/launch-usage-service.ts:43,67,73,76,82,107`)。パスも値も出さない。切り分けには足りる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\.\|userAgent\|getModifierState\|metaKey\|ctrlKey` (src) / ESLint の `no-restricted-globals\|no-restricted-properties` | `navigator.platform\|userAgent` 0 件 (clipboard 4 件は対象外)、`metaKey` は非テストのコードに 2 件 / 0 件 | allowlists.mjs:566-581、check.mjs:382-401、CommandPalette.tsx:40,43、ConversationSearchProvider.tsx:50,53、roadmap.md:185-186 |
| L-004 | `location\|targetLabel\|originKind` (palette-commands.ts / CommandPalette.tsx) / `locationIndexOf` (renderer の非テスト) / `detail` の組み立て | 0 / 2 / 2 | palette-commands.ts:176-182,211-218、group-label.ts:19-21、SessionListScreen.tsx:994、OverviewTab.tsx:118,129、data-model.md:192 |
| L-005 | `cwd\?\.value` (renderer の非テスト) / 「cwd.value を直接は読まない」の主張 | 3 / 4 | group-label.ts:51、SessionListScreen.tsx:148,150、session-search.ts:14,67、data-model.md:41、plan.md:56、tasks.md:29、session-search.test.ts:66-70,109-111,126-128 |
| L-002 | `判断を強制` / 一覧に無いファイルを飛ばす処理 / 一覧の名前と実在のファイル | 2 / 1 / 7 件すべて実在 | allowlists.mjs:477-478、plan.md:234、check.mjs:753、.dependency-cruiser.js:252-256 |
| L-001 | `metaKey\|altKey\|AltGr\|shiftKey` (renderer の `*.test.tsx`。修飾キーの除外) / `ctrlKey\|metaKey\|altKey\|AltGr\|OPT-mac` (012 の 6 文書) | 0 / 0 | CommandPalette.test.tsx:267-273、CommandPalette.tsx:38-46、ConversationSearchProvider.tsx:48-56 |
| L-003 | `#\$\{` (src) / `sessionTargetKeys` (src/main) / `e2e-capability*.test.ts` | 2 / 2 / 0 | target.ts:42、e2e-capability.ts (`e2eSessionIndex` の `wslTarget` / `hostTarget`、`sessionTargetKeys: () => []`)、composition-root.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- code-gate からの引き継ぎ: 4 件とも未解消 (M-001 / L-001 / L-002 / L-003)。コードは code-gate の後に変わっておらず追加の事実も無いので、severity はどれも code-gate のまま。新しい指摘は 2 件 (L-004 / L-005)。どちらも本 feature の touched files で直せる Low。
