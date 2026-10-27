# platform-boundary-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-27
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (権限モードを安全 3 値に閉じる。項目 16 の包みの backstop)、FR-005 / FR-006 (setModel を必ず引数ありで呼ぶ)、FR-010 / FR-011 (改名。`CLAUDE_CONFIG_DIR` の env を固定し、`dir` を渡さない)、FR-017 (AD-062 と allowlists / rule fixture)、SC-001 / SC-002 / SC-004、SC-009 (WSL UNC 越しの書き込み)
- touched files に該当する charter / Confirmation: isolation charter の「権限モードのゲート」と Principle III、runtime charter の「capabilities の正直な表明」(変更なし)、Constitution Principle I / II / III / VI / VII、AD-062 Confirmation (項目 14 / 16 の fixture)、AD-034 決定 2 / 3 (AD-062 が読み替える)、AD-028 (UNC の受け渡し)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

023 は、動いているセッションの権限モードを安全 3 値の中で切り替える機能 (`Query.setPermissionMode`)、モデルを Provider のカタログの中で切り替える機能 (`Query.setModel`)、`renameSession()` で名前を付ける機能を足す。`renameSession()` は env を固定した短命の `utilityProcess` から呼ぶ。プラットフォーム境界で関わるのは次の 3 点。

- 権限ゲートの機械強制 (項目 16)。`QUERY_MUTATION_METHODS` を 22 から 20 に減らし、引数の包みを検査する形に変える
- SDK 呼び出しの許可リスト (項目 14)。`renameSession` を足し、値の import と動的 import の検査を新設する
- 改名の書き込み先。WSL では UNC の config ディレクトリになる

パスについては良い作りになっている。`dir` を渡さず、config ディレクトリ (列挙対象から `transcriptTarget` / `buildTranscriptEnv` の既存経路で決める) だけを渡すので、HostPath と RuntimePath を混ぜずに済む。指摘は、権限ゲートの型の層が弱くなる点と、新設する値 import 検査の穴に集中した。

### 固有観点

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 該当なし。改名の IPC が運ぶのは `sessionId` と名前だけで、会話の id と列挙対象は main の registry と退避の表から引く (contracts C-3 / data-model §6.1)。config ディレクトリは既存の `configDirEnvValue` で UNC の文字列にして env に入れるだけ (`src/main/infra/session/config-dir.ts:92-94`、`:134-139`)。`dir` はホストのパスとして正規化されるので WSL の作業ディレクトリを表せないが、research R-06 が理由を挙げて渡さないことにしている。`liveTranscriptTargetKey` はランタイムの名前空間で候補を絞る (`src/main/app/resume-service.ts:144`)。会話の id は UUID なので、別の config ディレクトリを選んでも書き込みは「見つからない」で失敗するだけで、別の transcript には書かない
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。待ちの表は `requestId` をキーに世代も持つ (data-model §4.2)。改名の子は要求ごとに 1 つ起こす (C-5)。モデルの検証は、その行の起動時の Provider と今の Provider の一覧を引く。「今のランタイム」を module スコープに持つ設計は無い
- **PB-3 (capabilities の虚偽表明)**: 該当なし。`capabilities` の表明にも `isAutoModeAllowed` にも触れない。実行中の選択肢は安全 3 値 (`dontAsk` を含む。isolation charter:105 で制限対象外) に固定され、どのランタイムでも capability に依らない
- **PB-4 (権限ゲートの迂回)**: M-001 で指摘する。新しい入口 (IPC `closta:setSessionPermissionMode`) は、main の検証・decoder・呼ぶ直前の assert の 3 段で閉じている。再開時は元の起動設定 (起動時に検証済み) に戻るので、昇格の経路にはならない (U-8)。ただし `queryHandle` の型を広げるので、tsc の層が弱くなる
- **PB-5 (多段パス変換の欠落)**: 該当なし。docker endpoint を使わない。WSL の変換は既存の `toUnc` の 1 回 (RuntimePath から UNC の HostPath へ) だけで、往路と復路の非対称も無い (子は `{ ok }` しか返さない)
- **PB-6 (実質的な永続環境の構築)**: 該当なし。書き込むのは、既にある `<id>.jsonl` に足す custom-title の 1 行だけ。research R-01 によると SDK は O_APPEND で追記し、ファイルが無ければ例外を投げて新しく作らない。Principle IV が `renameSession()` を名指しで認めており、`rename-spawner.ts` を `PROCESS_SPAWN_MODULES` に足すのも AD-062 Decision 4 という ADR を伴う。volume / `--restart` / パッケージ導入 / `~/.bashrc` への書き込みは無い
- **PB-7 (lint ルール自体の網羅性)**: M-002 で指摘する。`agents-not-to-core` は確認した。今の agents の標準モジュールの import は `sdk-agent-session.ts:1-2` と `supervisor.ts:1` だけで (Grep で 3 件)、`detectProcessBuiltinModuleCalls: true` (`.dependency-cruiser.js:340`) があるので fixture の `getBuiltinModule` 形も依存グラフに見える。research R-11 の主張はこの点で成り立つ

## Findings

### [Medium] `queryHandle` を `Pick<Query, 'setPermissionMode' | 'setModel'>` に広げると、間接の呼び出しが tsc を通るようになる (M-001) (scope: feature)

- **観察**
  - 今の型は `src/agents/sdk-agent-session.ts:456` の `Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>` で、`interrupt` 以外のメソッドはどの形でも型エラーになる
  - data-model.md:42 と tasks BE-007 はこれを `Pick<Query, 'interrupt' | 'setPermissionMode' | 'setModel'>` に広げる。SDK の `setPermissionMode(mode: PermissionMode)` は昇格値を含む全 6 値を受けるので、型は値を縛らない
  - 項目 16 の新しい包みの検査は、ドット呼び出し `.setPermissionMode(` と計算キーの形だけを見る (data-model.md:158)。分割代入 (`const { setPermissionMode } = queryHandle`)・`.call(` / `.apply(` / `.bind(`・変数のキーは、P3 の既知の限界と同じく射程外 (`scripts/constitution/check.mjs:942-944`、`tests/rule-fixtures/expected.mjs:932-946`)
  - plan.md:234 も「`setModel` の型は `model?: string` なので tsc は省略を許す。単体テストで確かめる」と書き、tsc の層が無いことを認めている
- **同種事象探索**: `Pick<Query` を `src/agents/sdk-agent-session.ts` で検索して 1 件 (`:456`)。`queryHandle` の代入は `:829` の 1 件。Query を保持する場所はここ 1 つ
- **リスク/影響**: spec.md:52 は昇格値に届かないことを「型・main の検証・agents の実行時 assert・項目 16 の backstop の 4 重」と書いている。ここで言う「型」は `SessionControl.mode` で、SDK を呼ぶ口の型ではない。間接の形で書かれると、呼ぶ直前の assert と項目 16 の 2 層が同時に外れる。そのとき残る歯止めは decoder の述語と、src/agents 内の昇格値リテラル禁止 (`check.mjs:890-896`) だけになる。値が SDK の報告のようにリテラルでない場所から来れば、リテラル禁止も効かない。今の設計にこの経路があるという観察は無いので、defense-in-depth として Medium とした
- **推奨アクション**: `Pick` で SDK の宣言をそのまま取らず、口の型を狭めて書く。
  ```ts
  let queryHandle:
    | ({
        interrupt(): Promise<void>
        setPermissionMode(mode: SafePermissionMode): Promise<void>
        setModel(model: string): Promise<void>
      } & AsyncIterable<SDKMessage>)
    | null = null
  ```
  SDK の `Query` は、引数の型が広いメソッドなのでこの型に代入できる (`:829` は通る)。こうすると、どの呼び出し形でも昇格値と `setModel()` の引数なしが tsc で落ちる。`assertSafePermissionMode` の戻り値の型が `SafePermissionMode` であることも確かめる。あわせて `UNDETECTED_NOTES['sdk-query-method-indirect']` の `mitigatedBy` (BE-001 で直す文) に、この型の狭めを緩和策として書く
- **根拠**: Constitution Principle III、AD-062 Decision 1、AD-036 §4 P3
- **scope 根拠**: 本 feature が直す `sdk-agent-session.ts` (BE-001 / BE-007) と data-model §3.1 で直せる

### [Medium] 項目 14 の新しい値 import の検査が、SDK のサブパスからの named import と re-export を見ない (M-002) (scope: feature)

- **観察**
  - 項目 14 の bindings は `import\s*\{([^}]*)\}\s*from\s*['"]` + `AGENT_SDK_PACKAGE` + `['"]` の正規表現で集める (`scripts/constitution/check.mjs:689-692`)。パッケージ名の直後に引用符を要求するので、`'@anthropic-ai/claude-agent-sdk/bridge'` のようなサブパスからの named import は bindings に入らない
  - 一方、名前空間 import の正規表現 (`check.mjs:680-682`) は閉じの引用符を要求しないのでサブパスも捕まえる。同じ検査の中で扱いが食い違っている
  - SDK の package.json の `exports` は `./bridge` / `./browser` / `./extract` を公開している。`bridge.d.ts:229` (`attachBridgeSession`)・`:363` (`createCodeSession`)・`:378` (`fetchRemoteCredentials`) のように、許可リストに無い値の API がある
  - `export { tagSession } from '@anthropic-ai/claude-agent-sdk'` / `export * from ...` の re-export を見る検査も無い。re-export された名前を別のファイルが相対パスで import すると、`src.code.includes(AGENT_SDK_PACKAGE)` の分岐 (`check.mjs:668`) にも入らない
  - research.md:60 と AD-062 Decision 5 (`0062-…md:40`) の新しい検査は、この bindings の上に組む (tasks BE-002)
- **同種事象探索**: `export\s*(\*|\{[^}]*\})\s*from\s*['"]@anthropic-ai/claude-agent-sdk` を `src` / `tests` / `scripts` で検索して 0 件。サブパスの import も 0 件。`tests/rule-fixtures/expected.mjs` に re-export を扱う fixture や注記は 0 件
- **リスク/影響**: AD-062 Decision 5 は、改名の IPC ができて AD-034 決定 3 の第一の担保が崩れる分を補うために置かれる。re-export を経由すると、`tagSession` / `deleteSession` / `forkSession` の値 import と呼び出しが、どのファイルの検査にも掛からない。サブパスも同じ形で抜けるので、Decision 5 が言う「値の import は許可の名前に限る」は閉じない。今これを使っているコードは 0 件なので、Medium とした
- **推奨アクション**: BE-002 で次の 3 つを行う。
  - (a) bindings の正規表現を `AGENT_SDK_PACKAGE + String.raw`(?:/[^'"]*)?['"]`` にし、サブパスも bindings に入れる。サブパスの値 import は許可外として扱う
  - (b) `export\s*(?:type\s*)?(?:\*|\{[^}]*\})\s*from\s*['"]` + `AGENT_SDK_PACKAGE` のうち `type` でないものを違反にする
  - (c) rule fixture を 2 つ足す。`a-direct/sdk-subpath-value-import` と `a-direct/sdk-reexport` で、どちらも `#14` で発火させる。足さない場合は、AD-062 Decision 5 の範囲外であることを `UNDETECTED_NOTES` に書く
- **根拠**: AD-062 Decision 5、AD-034 決定 3、Constitution Principle IV (Verification)
- **scope 根拠**: 本 feature が直す `check.mjs` 項目 14 と `tests/rule-fixtures/` (BE-002) で直せる

### [Low] 改名の失敗の原因が 1 つの理由とログ行に畳まれ、WSL の UNC 越しの失敗を見分けられない (L-001) (scope: feature)

- **観察**: data-model.md:141-145 の流れでは、列挙対象が決まらない・WSL の所在の検証が期限内でない (`transcriptTarget` の `distro-not-running`、`src/main/app/session-service.ts:769-776`)・子の `{ ok: false }`・期限切れ・子が結果を返さずに終わる、のすべてが `write-failed` と `[session] rename failed` の 1 行になる。renderer への理由も contracts:21 の `write-failed` 1 つ
- **同種事象探索**: `write-failed` を spec_dir で検索すると 4 ファイル (contracts:21、data-model:141-144、tasks BE-033 / BE-034)。どこにも原因の内訳は無い
- **リスク/影響**: RK-03・RK-05・V-6 の実機確認で、ログから原因を切り分けられない
- **推奨アクション**: ログに固定のキーで原因を足す (例: `[session] rename failed: target-unresolved | location-not-verified | child-rejected | timeout | child-exited`)。名前・会話の id・パスは今どおり出さない。戻り値の型を変える必要はない
- **根拠**: reviewer-base の H (observability)、plan RK-03 / RK-05
- **scope 根拠**: 本 feature の `session-rename-service.ts` (BE-034) で直せる

### H の補足 (テスト / 既存の振る舞い)

- M-001 を検出できるテストは計画に無い。型を狭めるなら、`// @ts-expect-error` で「昇格値を渡せない」「`setModel()` を引数なしで呼べない」ことを確かめる型テストを `sdk-agent-session.test.ts` に 1 つ置くとよい
- M-002 を検出できる fixture は無い (上の推奨アクション (c))
- 項目 14 に値 import の検査を足しても今のコードが違反にならないことは、research R-08 が 3 ファイルで確かめた。`agents-not-to-core` が今の import に当たらないことは、Grep で確かめた

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `Pick<Query` / `queryHandle\b.*[:=]` (src/agents/sdk-agent-session.ts) | 2 | src/agents/sdk-agent-session.ts:456, :829 |
| M-002 | `export\s*(\*\|\{[^}]*\})\s*from\s*['"]@anthropic-ai/claude-agent-sdk` (src, tests, scripts) | 0 | — (検査の正規表現は scripts/constitution/check.mjs:680-692) |
| L-001 | `write-failed` (specs/023) | 4 ファイル | contracts/ipc-live-session-settings.md:21, data-model.md:141-144, tasks.md BE-033 / BE-034 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
