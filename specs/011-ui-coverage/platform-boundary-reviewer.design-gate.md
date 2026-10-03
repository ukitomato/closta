# platform-boundary-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-003 / SC-001 / SC-002 (項目 21。PB-7)、FR-007 / FR-008 / FR-011 / SC-003 / SC-004 (agents の分岐と結果待ちの Map。PB-2、AD-043)、FR-014 / SC-006 (ファイル名の取り出し。PB-1)、FR-006 / SC-007 (reviewer の組み込み)
- touched files に該当する charter / Confirmation: AD-043 Decision 2 / 7、AD-034 Decision 1、Principle I / VII。runtime / isolation の charter と AD-003 / AD-004 / AD-012 は touched files に該当しない
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

対応表と項目 21、agents の 3 つの追加 (`user` の tool_result、system の Hook / task、結果待ちの Map)、送り直しによる結果の配送、transcript の密度、直近の活動の要点、reviewer の組み込み、Constitution の PATCH。ランタイム・branded path・capability・権限モード・子プロセス・IPC / preload には触れない (PB-3 / PB-5 / PB-6 は該当なし)。

## 固有観点

- **PB-1**: 該当なし: `HostPath` / `RuntimePath` を生成・復元・永続化しない。`summarizeToolInput` は表示のために末尾を切り出すだけで、`/` と `\` の両方で区切るのでプラットフォーム分岐にならない (前例 `WorkspaceFoldersScreen.tsx:574`)。task の `output_file` は読まない。過去ログの取得は既に `includeSystemMessages: true`
- **PB-2**: 1 Worker = 1 セッション (`sdk-agent-session.ts:257`) で、renderer の upsert も sessionId ごと。Map の置き場所が未定 → L-001
- **PB-3**: 該当なし: capabilities / autoModeSafe に触れない
- **PB-4**: 該当なし: `permissionMode` の注入経路は不変。監視ビューの行から承認する導線は無い。tool_result の分岐は `canUseTool` に戻らない
- **PB-5**: 該当なし
- **PB-6**: 該当なし: 子プロセス・ボリューム・ホストのファイルへの書き込みを足さない。密度は永続化しない。`coverage.mjs` は読み取り専用の純関数
- **PB-7**: 新設の domain モジュールは boundaries のディレクトリ単位の要素に入り、dependency-cruiser の `agents-not-to-electron` / `agents-not-to-native` が引き続き塞ぐ。項目 21 の pending が広い → M-003

## Findings

### [Medium] RK-02 (送り直しの負荷) の手当てに挙げた E2E は、送り直しの経路を通らない (M-001) (scope: feature)

- **観察**: E2E のセッションは main の偽物 `e2e-capability.ts` が作り、text のメッセージしか出さない (:172、:187)。`sdk-agent-session.ts` を通らないので送り直しは起きない。SC-004 / V-3 で `src/main` の差分は 0 件なので、本 feature で E2E 側を変えられない
- **同種事象探索**: RK-02 / 負荷 E2E の言及 3 件 (plan.md:169、quickstart.md:20、tasks.md:87)。`e2e-capability.ts` の `kind: 'message'` 2 件 (text のみ)
- **リスク/影響**: RK-02 が検証されないまま「確かめた」と記録されうる
- **推奨アクション**: RK-02 の手当てから E2E を外し明記する。BE-024 に有界性の観点 (N 個の tool_use に N 個の結果で送り直しが N 以下、各回の payload が上限内、256 件を超えたら古いものを捨てて `result:<id>`)。renderer は FE-012 で同じ id の更新で行が増えないこと。実負荷は quickstart V-4 に
- **根拠**: AD-043 Decision 2、Principle IX、spec SC-003

### [Medium] SC-004 / V-3 の境界の計測が調停役スレッドを含まない (M-002) (scope: feature)

- **観察**: 計測は `git diff --name-only main...HEAD -- src/preload src/main` だけ。AD-043 Decision 2 の調停役スレッドのモジュール (`supervisor.ts` / `supervisor-core.ts` / `supervisor-protocol.ts` / `transport.ts`) はこの diff の外
- **リスク/影響**: 実装中に調停役のプロトコルに新しい kind を足しても V-3 は緑のまま
- **推奨アクション**: V-3 と SH-092 の diff の対象に 4 つのファイルを足す。BE-024 に「`post` に渡す kind は `status` / `event` / `ended` / `child-exited` のまま」を足す
- **根拠**: AD-043 Decision 2 / AD-034 Decision 1 / spec SC-004

### [Medium] 項目 21 の pending の条件が広く、検査が届かないまま CI が緑になりうる (M-003) (scope: feature)

- **観察**: plan / tasks は「SDK が入っていなければ pending」。check.mjs は pending を終了コード 0 で通す (:1310-1315)。`.d.ts` が版上げで移った・対応表や roadmap が無い場合の判定が無い。既存の項目の pending は「未実装の対象」に限る
- **リスク/影響**: SDK の `.d.ts` の配置が変わった時点で「検査していないのに緑」になり、AD-020 の「型が増えたら CI が落ちる」が黙って外れる
- **推奨アクション**: 項目 21 は pending を持たず、5 つの入力ファイルのどれかが無ければ violation にする。BE-012 / BE-011 に観点を足す
- **根拠**: Constitution VI Verification「pending を ok に混ぜない」(constitution.md:507-509)、AD-020 Decision 1

### [Low] 結果待ちの Map の置き場所と、空の `toolCallId` の扱いが決まっていない (L-001) (scope: feature)

- **推奨アクション**: data-model §3 に「Map は `run()` の closure に置く (`permissions` と同じ寿命)」。`toolCallId === ''` の tool_use は結果待ちに登録しない。BE-024 に観点

### [Low] 監視ビューの観測点 `receivedMessages` の意味が、送り直しと event の行で変わる (L-002) (scope: feature)

- **推奨アクション**: data-model に「`receivedMessages` は送り直しと event の行も数える」と書き、O-1 の data-model §1 に注記する (FR-015)。区別が要るなら別の観測点に

### [Low] 結果待ちの上限が件数だけで、セッションスレッドのヒープ上限との関係が書かれていない (L-003) (scope: feature)

- **観察**: 最悪 256 × (200KB + 200KB) ≈ 100MB。ヒープ上限は 1024MB (`supervisor.ts:22,49`)
- **推奨アクション**: data-model §3 に見積もりとヒープ上限との比を 1 行書く

## 他の owner への申し送り (指摘数には含めない)

- `task_updated` は `skip_transcript` を持たない (`sdk.d.ts:5632-5649`) → 捨てた task が後続で現れうる
- `local_bash` の task の `description` にはコマンドの文字列がそのまま入りうる。FR-014 で外した引数 (秘密) が event の行の `name` から出る経路になる → security
- `exit_code` の扱いの食い違い (research.md:52 と data-model.md:63)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `負荷 E2E\|multi-session\|RK-02` / `kind: 'message'` (e2e-capability.ts) | 3 / 2 | plan.md:169、quickstart.md:20、tasks.md:87 / e2e-capability.ts:172,187 |
| M-002 | `git diff --name-only main...HEAD -- src/preload src/main` | 2 | quickstart.md:18、tasks.md:87 |
| M-003 | 項目 21 の入力と pending の条件 / `pending(` (check.mjs) | 2 / 8 | plan.md:127、tasks.md:29 / check.mjs:162,242,251,269,417,943,1027 |
| L-001 | `^let ` (sdk-agent-session.ts) / `toolCallId: typeof` | 2 / 1 | sdk-agent-session.ts:260,263 / live-message.ts:55 |
| L-002 | `receivedMessages` (src) | 7 | running-session-store.ts:120,259 ほか |
| L-003 | `BODY_MAX_BYTES\s*=\|maxOldGenerationSizeMb` | 2 | sanitize-body.ts:12、supervisor.ts:49 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
