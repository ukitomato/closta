# security-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-29T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-005 / FR-006 / FR-007: 新しい IPC `listSessionModels`、`SessionControl` の `list-models`、WorkerMessage の `models-result`、`setModel` の既定の Provider の分岐。本 reviewer の主な対象
  - FR-016 / FR-017 / FR-018: `/resume` の横取り。既存の `resolvePastResume` IPC を再利用する
  - FR-001〜FR-004 / FR-008〜FR-015: renderer の配置と文言。security 上の入力経路は無い
  - SC-002 / SC-006: 上の経路の計測
- touched files に該当する charter / Confirmation:
  - ui charter には security 前提の記述が無い (Grep で 0 件)
  - AD-065 Decision 1 / 2 と Confirmation (`setModel` が一覧の外と effort の外を拒む・`models: null` の経路)
  - 既存の `ipc.ts:206-213` の `handle()` wrapper (`isTrustedSender`)
  - `validate.ts:447` の `checkSetModelArgs`
  - `supervisor-protocol.ts:121-124` / `:200-211`、`session-core.ts:487-496` (既存のデコーダ)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:1 Medium:1 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-065 の Exceptions 改定を含む)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

本 feature で新しく増える信頼境界は 2 つです。

- renderer → main: `listSessionModels(sessionId)`。既存の `handle()` wrapper で登録し、送り元は `isTrustedSender` で検査し、引数は UUID の述語で検査する
- Claude Code → セッションスレッド → 調停役 → main: `supportedModels()` の値を `models-result` で運ぶ

`setModel` の既定の Provider の分岐では、許可する値の集合を「main が最後に受け取った一覧」にします。`/resume` は既存の索引と既存の `resolvePastResume` IPC だけを使い、新しい IPC は増えません。preload の追加は `ipcRenderer.invoke` の名前つきの 1 本だけで、汎用のパススルーはありません。BrowserWindow / CSP / 子プロセス / `shell.openExternal` / 永続化 / 依存の追加はありません (plan「新しい依存は足さない」「新しいプロセスは起こさない」)。

## Findings

### [High] main 側の `models-result` の再検査が、セッションスレッドの出力の形と合わない。設計どおりに作ると一覧は常に空になる (H-001) (scope: feature)

- **観察**:
  - `specs/025-ui-live-session-fixes/data-model.md:35` は `normalizeLiveModels` について「セッションスレッドと main が同じ関数を使う」としている
  - 同じ節の規則 2 (`data-model.md:38`) は、入力を SDK の `ModelInfo` の形とみなし、「`value` が文字列でない要素は捨てる」として `value` → `id` に写す (§1.1 の表。`data-model.md:27`)
  - セッションスレッドは正規化した後の値、つまり `ModelEntry` の形 (`id` / `displayName` / `supportedEffortLevels`。`value` は無い) を `models-result` で送る (`data-model.md:111-112`、`contracts/ipc-live-models.md:49` の型 `readonly ModelEntry[] | null`)
  - それなのに main 側のデコーダは「配列なら `normalizeLiveModels` を通す」とある (`contracts/ipc-live-models.md:55`、`tasks.md:65` BE-022「配列なら `normalizeLiveModels`」)
- **同種事象探索**: `normalizeLiveModels` を `specs/025-ui-live-session-fixes` で検索し 13 件。main 側に当てる記述は `contracts/ipc-live-models.md:55`、`data-model.md:35`、`tasks.md:65` の 3 件。他はセッションスレッドの側か、定義・置き場所の記述
- **リスク/影響**: 書かれたとおりに作ると、main は `value` を持たない `ModelEntry` の要素をすべて捨てます。`Entry.liveModels` は常に `[]` になり、`listSessionModels` は `{ ok: true, models: [] }` を返し、選択は「Claude Code がモデルの一覧を返しませんでした」で押せないままです。FR-005 / US-2 AC1〜AC2 が満たせません。
  逆に、実装者がこれに気づいて main 側の検査を外すと、プロセス境界の再検査 (research R-02「main は受け取りの側でもう一度検査する」) が抜けます。どちらに転んでも設計の意図が崩れます。
- **推奨アクション**: main 側の検査を `ModelEntry` の形に対する述語にし、文書の 3 箇所を揃える。
  - `contracts/ipc-live-models.md:55`: 「配列なら各要素を `isValidModelEntry` で検査し、`inferenceProfileId` を持つ要素・重複・65 件目以降を捨てる」に直す。あるいは domain に `normalizeLiveModelEntries(raw: unknown)` (ModelEntry の形の入力用) を別に立て、`normalizeLiveModels` (ModelInfo の形の入力用) と分ける
  - `data-model.md:35`: 「同じ関数」の記述を、「同じ検査の規則 (`isValidModelEntry` / 64 件 / 重複) を共有する」に改める
  - `tasks.md:65` BE-022: テストに「セッションスレッドが出す形 (`id` を持ち `value` を持たない) の配列が main のデコーダを件数を保ったまま通る」を足す
- **根拠**: CWE-20 (入力検証の不備)。contracts と data-model の文面上の食い違いで、FR-005 が満たせなくなる (design-gate の緩和規則で Critical まで上げうる。ただし直接の影響は機能不全なので High とした)
- **scope 根拠**: 本 spec の contracts / data-model / tasks の中で直せる

### [Medium] 新しい `requestId` の検査が、既存の制御の UUID 検査より弱い (M-001) (scope: feature)

- **観察**:
  - `contracts/ipc-live-models.md:42` (C-8) は、セッションスレッドのデコーダが `requestId` について「空でない文字列であることだけを見る」としている。同じく `:54` (C-9 の main 側)、`tasks.md:63` BE-021、`tasks.md:65` BE-022 も「`requestId` が空でない文字列」
  - 既存の同じ種類の制御はすべて `isValidSessionId` (UUID の完全一致) で検査している。`src/agents/session-core.ts:489` / `:494` (`set-permission-mode` / `set-model`)、`src/agents/supervisor-protocol.ts:122` / `:203` (`control-result` の 2 つのデコーダ)、`session-core.ts:457` (elicitation)
  - contracts 自身も「`requestId` は main の `newRequestId` (UUID)」(`:41`) としている
- **同種事象探索**: `requestId が空でない文字列` に当たる記述が spec_dir に 4 件 (`contracts/ipc-live-models.md:42`, `:54`、`tasks.md:63`, `:65`)。既存のコードで `isValidSessionId(requestId)` / `isValidSessionId(record.requestId)` の形は 5 件 (上に列挙)
- **リスク/影響**: 内部のスレッド間の経路なので、今すぐの実害はありません。ただし同じ protocol の中で検査の強さが種類ごとに違う形が生まれ、長さの上限も無い文字列が待ちの表の鍵の照合に流れます。「023 の `set-*` と同じ」(`contracts:42`) という記述とも食い違っています。
- **推奨アクション**: C-8 / C-9 と BE-021 / BE-022 の記述を「`requestId` は `isValidSessionId` (UUID)」に揃える。テストの負例に「UUID でない文字列」を足す
- **根拠**: defense-in-depth。既存の protocol の検査の水準との一貫性
- **scope 根拠**: 本 spec の contracts / tasks の中で直せる

### [High] H-001 の食い違いを、計画されたテストのどれも検出できない (H-002) (scope: feature)

- **観察**:
  - 単体は層ごとに分かれている。BE-020 は `ModelInfo` の形の入力、BE-022 は「配列の中の形の外の要素が落ちて件数の差が分かる」(`tasks.md:66`)
  - セッションスレッドの出力をそのまま main のデコーダに通す結合の観点が、contracts の「テストの観点」(`contracts/ipc-live-models.md:80-90`) にも tasks にも無い
  - E2E (FE-021) は偽の capability (`e2e-capability.ts`) で main の service を通らない (`tasks.md:69` BE-024「e2e の偽は…固定の 2 件の一覧を返し」)
  - 実際に経路を通る確認は、quickstart V-1 の実機だけで、これは「未実施」でマージできる (`tasks.md:9`, `:127`)
- **同種事象探索**: `models-result` を `specs/025-ui-live-session-fixes/tasks.md` で検索し、テストの記述は BE-021 (`:64`) と BE-022 (`:66`) の 2 件。どちらも単独の層の検査で、層をまたぐ形の照合は 0 件
- **リスク/影響**: main 側の再検査の形が誤っていても (H-001)、CI はすべて緑になり、FR-005 が壊れたままマージされえます。main 側の検査を外す方向に直された場合も、それを検出するテストがありません。
- **推奨アクション**: BE-022 か BE-023 のテストに、次の観点を足す
  - `normalizeLiveModels(ModelInfo の形の配列)` の出力を、そのまま main 側のデコーダ (`decodeSupervisorEvent` の `models-result`) に渡すと件数が変わらないこと
  - 形の外 (`id` の文字種の外・未知のキー・`inferenceProfileId` つき) の要素は main 側で落ちること

  contracts の「テストの観点」にも同じ行を足す
- **根拠**: H の観点 (指摘を検出できるテストが存在するか)。SC-002「単体で一覧の取得・…・main の検証…を確かめ」
- **scope 根拠**: 本 spec の tasks / contracts の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `normalizeLiveModels` (spec_dir) | 13 (main 側に当てる記述は 3) | contracts/ipc-live-models.md:55, data-model.md:35, tasks.md:65 |
| M-001 | `requestId` が空でない文字列 (spec_dir) / `isValidSessionId(.*requestId` (src/agents) | 4 / 5 | contracts/ipc-live-models.md:42, :54, tasks.md:63, :65 / session-core.ts:457, :489, :494, supervisor-protocol.ts:122, :203 |
| H-002 | `models-result` (tasks.md のテスト記述) | 2 (層をまたぐ照合は 0) | tasks.md:64, :66 |

## Verdict

- Critical: 0
- High: 2
- Medium: 1
- Low: 0

確認して指摘に当たらなかった点です。

- **送り元の検査**: `listSessionModels` は `ipc.ts:206-213` の `handle()` wrapper で `isTrustedSender` を通す設計 (BE-025、SH-012 の Grep 確認) で、直接の `ipcMain.handle` を足さない
- **preload**: 名前つきの `invoke` の 1 本だけを足し、汎用のパススルーは無い
- **`setModel` の既定の Provider の分岐**: 未受信・一覧の外・effort の外を拒み、制御を送らない。セッションスレッドでも `isValidModelId` で検査し直す (`session-core.ts:494`)
- **`displayName`**: `isValidModelDisplayName` で長さの上限と制御文字を弾き、native の `<select>` にテキストとして描く。HTML として注入する経路は無い
- **ログ**: 件数だけを出し、モデルの値は出さない
- **`/resume` の正規表現**: `/^\/resume(?:\s|$)/u` は ReDoS の形ではない
- **選ぶ画面**: 選ぶ画面は既存の `resolvePastResume` の検査済みの IPC だけを通る
