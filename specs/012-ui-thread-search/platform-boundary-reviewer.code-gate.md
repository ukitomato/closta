# platform-boundary-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 3 (code-gate iteration 3。前回は `specs/012-ui-thread-search/platform-boundary-reviewer.code-gate.md` (iter 2、HEAD ddc052e))

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search の照合先 (PB-1) と行の鍵 `targetKey\0sessionId` (PB-2)
  - FR-003 / FR-006: Ctrl+F / Ctrl+K の修飾キーの判定と Principle II (PB-7)
  - FR-007: palette の稼働中と過去の候補。所在が複数あるときの区別 (PB-2 / AD-003)
  - FR-009 / FR-010: `launchSession(config, origin)`。起動元が権限ゲートと `config` に混ざらないか (PB-4)
  - FR-011〜FR-013: `launch-usage.json` / `getLaunchUsage` (PB-1 / PB-6)
  - FR-018 / SC-008: E2E の固定の索引と基準画像 (PB-2 / PB-6)
  - SC-002 (iter 3 で触れた `virtualization.test.tsx` は R-3 SC-003 の仮想化テストで、012 の SC-002 が前提にしている仮想化の性質)
  - SC-005 / SC-006
- touched files に当たる charter / Confirmation:
  - Constitution Principle I / II / III / VI / VII
  - AD-003 Decision Outcome (インスタンスは複数ありうる)、AD-004 (HostPath / RuntimePath)
  - runtime / isolation の charter、AD-012、`src/agents/` は本 diff で触れていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`checkLaunchOrigin` の厳密比較も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

diff の範囲は `7bdb271..737e118` (scope は 97 ファイル)。iter 2 の後の差分 `ddc052e..737e118` を `git diff --stat` で確かめた。7 ファイルが変わっていて、src の変更は `src/renderer/src/features/chat/virtualization.test.tsx` の 3 行だけだった (`:104` にコメントを足し、`:124` で `it(..., 20_000)` の timeout を指定)。残りの 6 ファイルはどれも `specs/012-ui-thread-search/` の gate 出力と `touched-files.txt`。

本 reviewer の担当のファイルは、iter 2 から 1 つも変わっていない。前回の指摘の拠り所を Grep / Read で読み直し、どれも同じ行にあることを確かめた。

- `allowlists.mjs:566`、`check.mjs:388,753`
- `CommandPalette.tsx:41,43`、`ConversationSearchProvider.tsx:51,53`
- `palette-commands.ts:161,187,218`
- `group-label.ts:51`、`SessionListScreen.tsx:148,150`、`session-search.ts:14`
- `e2e-capability.ts:121,122,556`
- `plan.md:234`

前回の 6 件は、追加の事実が無いまま残っている。

PB ごとの結果 (iter 3 の差分):

- **PB-1**: 該当なし。テストの timeout の定数で、パスを扱わない。`launch-usage-store.ts:3` が `hostPathOps` だけを import していることも確かめ直した (ホスト名前空間で一貫している)。
- **PB-2**: 該当なし。ランタイムの状態も、キャッシュの鍵も足されていない。
- **PB-3**: 該当なし。`capabilities` / `autoModeSafe` に触れていない。
- **PB-4**: 該当なし。起動の経路は変わっていない。
- **PB-5**: 該当なし。パスの変換を足していない。
- **PB-6**: 該当なし。jsdom の単体テストの timeout で、永続化も環境の変更もしない。
- **PB-7**: 規則のファイル (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/`) は変わっていない。timeout は OS ごとに変えず、20_000 の定数にしている。このため Principle II の対象になる分岐は増えていない。

## Findings

### [Medium] Principle II の検査 (項目 8) は今も renderer の `navigator.*` を見ていない。一方で本 feature は、アプリ全体の修飾キーのショートカットを renderer に初めて入れた (M-001) (scope: system)

- **観察**:
  - `C:/dev/closta/scripts/constitution/allowlists.mjs:566-577` の `PLATFORM_BRANCH_PATTERNS` には、`process.*` / `os.*` / Electron の等価 API しか無い。`navigator.platform` / `userAgent` / `userAgentData` は無い。
  - 項目 8 は、この式でしか一致を取らない (`C:/dev/closta/scripts/constitution/check.mjs:388`)。
  - Ctrl+K は `C:/dev/closta/src/renderer/src/features/shell/CommandPalette.tsx:38-46` で、Ctrl+F は `C:/dev/closta/src/renderer/src/features/chat/ConversationSearchProvider.tsx:48-56` で受ける。どちらも OS を判定していないので、今は違反ではない。
- **同種事象探索**:
  - `navigator|userAgent` (`scripts/constitution`): 0 件
  - `metaKey|altKey` (`src/renderer`): 4 件 (`CommandPalette.tsx:41,43` / `ConversationSearchProvider.tsx:51,53`)。どれも否定の条件
- **リスク/影響**:
  - 「macOS では Cmd」を `navigator.platform` で分ける変更は、上の 2 か所に最も入りやすい。入っても項目 8 は素通りする。
  - そのため、renderer で `existing_violations: 0` は遵守の証拠にならない。
- **推奨アクション**:
  - (system) `PLATFORM_BRANCH_PATTERNS` に次の 2 つを足し、違反サンプルを 1 つ置いて発火を確かめる。
    - `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData|oscpu)\b/`
    - `/\bnavigator\s*\[\s*['"\`](platform|userAgent|userAgentData)['"\`]\s*\]/`
  - 本 PR で足さないなら、roadmap の system-scope (5) に持ち主の feature の名前を書く。
- **根拠**: Constitution Principle II (Verification「等価な API を含む」)、AD-003 Decision Outcome、PB-7
- **scope 根拠**: 規則の正本は本 feature の範囲の外にあり、穴は本 feature より前からある。追加の事実が無いので severity は据え置く。

### [Low] palette の過去の候補は、補足にグループの表示しか出さない。所在が違う (Windows と WSL のディストロ) 同名・同題の行を見分けられない (L-004) (scope: feature)

- **観察**:
  - 過去の候補は `detail: groupLabelOf(section.group, folderName, row.session)` (`C:/dev/closta/src/renderer/src/features/shell/palette-commands.ts:218`)。稼働中の候補はランタイム名を出す (`:187`)。
  - 設計の正本も「補足: グループの表示」のまま (`C:/dev/closta/specs/012-ui-thread-search/data-model.md:192`)。
- **同種事象探索**: `detail:` (`palette-commands.ts`): 4 件 (`:65` 型、`:161` 操作、`:187` 稼働中、`:218` 過去)
- **リスク/影響**:
  - AD-003 のとおり、所在は複数ありうる。同じ「題 · フォルダ名」の候補が所在の数だけ並ぶ。
  - 実害は、読むだけの過去ログで違う行を開くことに限られる。選ぶ対象そのものは `rowKey` で区別されている。
- **推奨アクション**:
  - 補足を「グループの表示 · 所在」にする。`data-model.md:192` も同じ PR で直す。
  - `targetKey` だけが違う 2 行の補足が違うことを確かめるテストを 1 つ足す。
- **根拠**: AD-003 Decision Outcome、PB-2
- **scope 根拠**: touched file で直せる。pr-gate R1 から未解消で、追加の事実は無い。

### [Low] 「Thread search は `cwd.value` を直接は読まない (Principle I)」という主張は、未登録の区画では字面どおりにしか成り立たない (L-005) (scope: feature)

- **観察**:
  - 未登録の区画の見出しは `group.cwd?.value ?? group.cwdDisplay` から作られる (`C:/dev/closta/src/renderer/src/features/session-list/group-label.ts:51`)。サイドバーも同じ式を自分で持っている (`C:/dev/closta/src/renderer/src/features/session-list/SessionListScreen.tsx:148,150`)。
  - 一方で `C:/dev/closta/src/renderer/src/features/search/session-search.ts:14` は「`cwd.value` (PathDTO) を直接は読まない」と書く。`data-model.md` / `plan.md` / `tasks.md` も同じ主張をしている。
- **同種事象探索**: `cwd\??\.value` (renderer の features。テストを除く): 6 件。本件に当たるのは 3 件 (`group-label.ts:51`、`SessionListScreen.tsx:148,150`)。`WorkspaceFoldersScreen.tsx:466,573` は検索と関係が無い。
- **リスク/影響**:
  - 名前空間の取り違えではない。ただ、文書とテスト名が、実際には無い不変条件を主張している。
  - 見出しの導出が 2 か所にあるので、片方だけを変えると、画面の表示と検索の対象が黙ってずれる。
- **推奨アクション**:
  - 主張を事実に合わせる。
  - `cwd.value` と `cwdDisplay` が違う未登録の区画の fixture を足す。
  - `SessionListScreen.tsx:148,150` を `groupLabelOf` に寄せて、導出を 1 か所にする。
- **根拠**: Constitution Principle I、AD-004、PB-1
- **scope 根拠**: touched files で直せる。pr-gate R1 から未解消で、追加の事実は無い。

### [Low] 実名で列挙する規則 (項目 15 / `services-not-to-io`) に網羅の検査が無い。それでも注記は「新しいファイルは判断を強制される」と書く (L-002) (scope: system)

- **観察**:
  - 項目 15 は、一覧に無いファイルを `continue` で黙って飛ばす (`C:/dev/closta/scripts/constitution/check.mjs:753`)。
  - それでも次の 2 か所は「判断を強制」と書く。
    - `C:/dev/closta/scripts/constitution/allowlists.mjs:478`
    - `C:/dev/closta/specs/012-ui-thread-search/plan.md:234`
- **同種事象探索**: `判断を強制` (scripts + plan): 2 件 (上の 2 か所)。一覧に無いファイルを飛ばす処理: 1 件 (`check.mjs:753`)
- **リスク/影響**: 次の feature が足し忘れると、「検査して通った」と「検査せずに通った」を区別できなくなる。
- **推奨アクション**:
  - (feature) `plan.md:234` を事実に直す。
  - (system) 次のどちらかにする。
    - 項目 15 に網羅の検査を足す (`src/main/app/*.ts` が、一覧か明示の除外リストのどちらかに載っていること)
    - `allowlists.mjs:478` の注記を直す
- **根拠**: Constitution Principle VI Verification、PB-7
- **scope 根拠**: 規則の本体は範囲の外。design-gate から未解消で、追加の事実は無い。

### [Low] Ctrl+K / Ctrl+F の修飾キーの判定は、テストでも文書でも固定されていない (L-001) (scope: feature)

- **観察**:
  - 判定式は `ctrlKey && !altKey && !shiftKey && !metaKey` (`CommandPalette.tsx:38-46` / `ConversationSearchProvider.tsx:48-56`)。
  - テストには、修飾キーを除外することを確かめるケースが無い。
- **同種事象探索**: `metaKey|altKey` (`src/renderer`): 4 件で、どれも非テストのコード。テストのファイルには 0 件。
- **リスク/影響**:
  - `ctrlKey || metaKey` に緩める変更や、OS で分ける変更が入っても、どのテストも落ちない (M-001 と重なる)。
  - AltGr の文字入力を奪う回帰も検出できない。
- **推奨アクション**:
  - 負例を 3 つ足す: `metaKey` だけ / `ctrlKey + altKey` / `ctrlKey + shiftKey`。どれも「開かない」と「`preventDefault` しない」を確かめる。Ctrl+F も同じ。
  - data-model §2 / §3 に判定式を 1 行書く。
- **根拠**: Constitution Principle II、AD-003 Decision Outcome
- **scope 根拠**: テストと data-model で直せる。code-gate iter 1 から未解消で、追加の事実は無い。

### [Low] E2E の固定の索引の鍵は、domain の関数を使わずに文字列で組まれている。`sessionTargetKeys` は空のまま (L-003) (scope: feature)

- **観察**:
  - 鍵は `C:/dev/closta/src/main/app/e2e-capability.ts:121` の `` `${input.runtimeId}#0` `` と、`:122` の `'host#0'` で手で組んでいる。
  - `sessionTargetKeys: () => []` のまま (`:556`)。
- **同種事象探索**: `sessionTargetKeys|#0\`|'host#0'|enumerationTargetKey` (`e2e-capability.ts`): 3 件 (`:121,122,556`)。`enumerationTargetKey` は 0 件。
- **リスク/影響**: palette や Thread search から過去の行を開く E2E を後で足すと、`isKnownTargetKey` に弾かれて、理由が分からないまま失敗する。
- **推奨アクション**:
  - 鍵を `enumerationTargetKey(...)` で作り、`sessionTargetKeys` がその 2 つを返すようにする。
  - 単体テストを 1 つ足す。
- **根拠**: AD-003 Decision Outcome、AD-004、PB-1 / PB-2
- **scope 根拠**: touched file で直せる。code-gate iter 1 から未解消で、追加の事実は無い。

## H (テスト / regression) の所見

- **iter 3 の変更 (`virtualization.test.tsx:104,124`)**:
  - 判定はマウント数 (`largeRows === smallRows` / `< 100`) で、timeout を上げても合否の条件は変わらない。
  - timeout は OS ごとに変えない定数なので、テストの側にプラットフォームの分岐も増えていない。
  - 担当の範囲で、検出力が落ちるものは無い。
- **既存の振る舞いを壊していない根拠**: iter 3 で担当の範囲のファイルは 1 つも変わっていない (`git diff --stat ddc052e..737e118`)。PB-4 の回帰を固定するテストもそのまま残っている。
  - `session-ipc.test.ts`: 起動元 8 通りのどれでも、service は同じ config で呼ばれる。
  - `LaunchDialog.test.tsx`: 設定のキーは 6 軸だけ。
- **L-001 / L-003 / L-004 / L-005**: 検出できるテストが無い。推奨のとおり、負例・単体テスト・fixture を足すこと。
- **M-001**: 検出の式が無い。違反サンプルと一緒に足すこと。
- **観測点**: 記録の失敗は `[launch-usage-store]` の接頭辞で出し、出すのは理由キーと errno だけ。iter 3 では変わっていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `navigator\|userAgent\|PLATFORM_BRANCH_PATTERNS` (scripts/constitution) / `metaKey\|altKey` (src/renderer) | 0 (navigator) / 4 | allowlists.mjs:566、check.mjs:388、CommandPalette.tsx:41,43、ConversationSearchProvider.tsx:51,53 |
| L-004 | `detail:` (palette-commands.ts) | 4 | palette-commands.ts:65,161,187,218、data-model.md:192 |
| L-005 | `cwd\??\.value` (renderer の features。テストを除く) | 6 (本件に当たるのは 3) | group-label.ts:51、SessionListScreen.tsx:148,150、session-search.ts:14 |
| L-002 | `判断を強制` / 項目 15 の skip | 2 / 1 | allowlists.mjs:478、plan.md:234、check.mjs:753 |
| L-001 | `metaKey\|altKey` (renderer のテスト) | 0 | CommandPalette.tsx:38-46、ConversationSearchProvider.tsx:48-56 |
| L-003 | `sessionTargetKeys\|#0\`\|'host#0'\|enumerationTargetKey` (e2e-capability.ts) | 3 | e2e-capability.ts:121,122,556 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- Round inheritance:
  - 前の round から解消したもの: 0
  - 未解消: 6 (M-001 / L-001 / L-002 / L-003 / L-004 / L-005)
  - 新しい指摘: 0
  - severity はどれも前の round のまま。担当の範囲のコードが変わっておらず、追加の事実が無いため。
  - iter 3 の差分 (`virtualization.test.tsx` の timeout) に、プラットフォーム境界の新しい事象は無い。
