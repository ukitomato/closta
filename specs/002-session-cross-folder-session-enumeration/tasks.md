---
description: 'Task list for R-2 セッション列挙'
---

# Tasks: セッション列挙 (R-2)

**Input**: [spec.md](spec.md) / [plan.md](plan.md) / [research.md](research.md) /
[data-model.md](data-model.md) / [contracts/](contracts/) / [quickstart.md](quickstart.md)

**Tests**: SC-001 / SC-003 〜 **SC-016** はテストまたは quickstart の実施そのものを受け入れ条件にしている。

## Format

`[ID] [P?] Description` — `BE` = Node / Electron 側、`FE` = renderer、`SH` = ツール / ドキュメント / 検証。
`[P]` は同 phase 内で並列実行可能 (別ファイル・依存なし)。

`## US-1` 〜 `## US-4` が spec の User Story に対応する。target 別の索引は末尾。

---

## Phase 1: Setup

- [x] SH-001 [P] `thread-list` 系 element を registry から追加する。
      - **済**: `npx assistant-ui@latest add thread-list` で追加 (周辺は `ui/input.tsx` の 1 件)。
        生成物は `components/` 直下に出るので、既存の
        `components/assistant-ui/elements/` へ移した
      - **除外集合は追記が要らなかった**: `GENERATED_FILES` は
        `src/renderer/src/components/**/*.{ts,tsx}`、`.prettierignore` は
        `src/renderer/src/components` を既に丸ごと覆っている。
        **レイヤ規則と禁止 import は掛かり続けることを確認済み**
        (`boundaries/elements` の `ui` に含まれ、緩和は体裁と返り値型だけ)
      生成物が要求する周辺 element (shadcn の sidebar 等) を確認し、
      `eslint.config.mjs` の `GENERATED_FILES` と `.prettierignore` の除外集合に
      **同じ内容で**追記する (AD-025 の「CLI 生成物に体裁と厳格さのルールを掛けない」)。
      **レイヤ規則と禁止 import は掛け続ける**
- [x] SH-002 `electron.vite.config.ts` に `agents` のエントリを追加し、
      `?modulePath` でバンドルされることを空実装で確認する (AD-023 の公式手順)
      - **済**: `@agents` 別名 (main の `resolve.alias` / `tsconfig.node.json` の `paths`) /
        `src/agents/enumerate-sessions.ts` の骨組み /
        `src/main/app/session-enumerator.ts` の `?modulePath` import /
        **lint と typecheck が通ること** (`?modulePath` がレイヤ検証をすり抜けないことを確認済み。
        `customSourcePatterns` の追加は不要だった) /
        `electron-vite` 5.0.0 が `modulePathPlugin` を main 設定に組み込み済みであること /
        `electron-vite/node` が `*?modulePath` の型を宣言しており tsconfig が既に取り込んでいること
      - **済 (BE-031 の結線後に確認)**: `out/main/enumerate-sessions-<hash>.js` が
        **3.61 kB で出力される**。`require` は `@anthropic-ai/claude-agent-sdk` の 1 件だけで、
        **`electron` は 0 件**。SDK は main バンドルの既定どおり外部化されるため、
        配布時に `node_modules` へ残す必要がある (D-1 の `files` 設定の対象)
- [x] SH-003 [P] `tsconfig.node.json` の `include` が `src/agents/**` を含むことを確認し、
      `pnpm build` が無改変で通ることを確認する

**Checkpoint**: `src/agents/` の空実装が `utilityProcess` として起動でき、ビルドが通る

---

## Phase 2: Foundational — `domain` の純粋関数と境界の型 (BLOCKING)

**この phase は I/O を一切持たない。** モックゼロでテストできることを確認する (AD-023 の Consequences)。

- [x] BE-010 `src/domain/session/target.ts` — `EnumerationTarget` と不変条件。
      **`WslUncPath` を持たせない**。所在と config ディレクトリの名前空間一致を
      R-1 の `isNamespaceConsistent()` で検証する (FR-009 / FR-011 / FR-015 / data-model §1)
- [x] BE-010b **`src/domain/runtime/path-api.ts` に `parseWslUncPath(raw)` を追加する** —
      生の UNC 文字列からディストロ名と `WslUncPath` を取り出す。
      `makeWslUncPath` は名前空間識別子を引数に要求するため、**これが無いと BE-011 が実装できない**。
      接頭辞の**大小差**と legacy 形式 (`\\wsl$\`) の扱いもここで一元的に決める。
      **パス操作の標準モジュールを import してよい唯一の実装ファイルに置く** (Principle I)
- [x] BE-011 `src/domain/session/cwd-origin.ts` — 作業ディレクトリの出自判定。
      **判定表 7 行をそのまま実装する**。UNC の解析は BE-010b を呼び、
      **文字列操作で接頭辞を剥がさない**。
      **判定関数は `RuntimePath` を生成しない** (branding はパス API 側。
      `ui` から呼んでも名前空間つきの値を合成できない形にする)
      (FR-016 / FR-017 / FR-018 / data-model §2)
- [x] BE-012 `cwd-origin.test.ts` — 判定表 7 行 + UNC 形式で未検出のディストロ +
      小文字ドライブレター + 末尾セパレータ + 相対パス + 空文字列 (SC-005)
- [x] BE-013 `src/domain/session/match.ts` — `FolderMatch` の 4 段判定。
      **R-1 の `resolveFolderRuntime()` を注入で受け取る** (自前で越境判定を書かない)。
      照合は `matchesAtSegmentBoundary()` を使い最長一致を採る。
      **(登録フォルダ × 所在) でメモ化する** (FR-019 〜 FR-024 / data-model §4)
- [x] BE-014 `match.test.ts` — 判定順序 4 段の全セル。
      直接一致 / 越境経路 (`/mnt/c/...` ↔ 所在 `windows`) / 前方一致の共存 (最長一致) /
      同じパスが 2 ディストロ / 変換材料なし (保留) / 未登録 / 出自 5 分類 (SC-005)
- [x] BE-015 `src/domain/session/group.ts` + `group.test.ts` — 4 種のグループへのまとめ。
      **入力は (登録フォルダ一覧, セッション集合) の 2 つ**とし、
      **`folder` グループを登録フォルダ一覧から seed する** (FR-051)。
      **`Σ グループ件数 = 総数` を property として検証する** (SC-006)。
      テストに「登録フォルダ 3 件 / セッション 0 件 → `folder` グループ 3 件」を含める
      (FR-022 / FR-025 / FR-028 / FR-051 / SC-013)
- [x] BE-016 [P] `src/domain/session/summary.ts` — 代替表示の規則
      (要約 → 最初のプロンプト → 識別子と時刻)。**表示のための省略は `ui` の責務** (FR-047 / data-model §3)
- [x] BE-016b `src/domain/session/normalize.ts` + テスト — **会話由来文字列の正規化** (FR-049)。
      バイト長上限での切り詰め / C0・C1・双方向制御文字の除去 / `normalized` フラグの算出 /
      数値 (`lastModified` / `createdAt` / `fileSize`) の有限安全整数検証。
      **境界値を全数でテストする** (SC-015)。**プロセスも I/O も要らない純粋関数として分離する** —
      `firstPrompt` は SDK 定義上「会話本文の逐語」であり、ここが唯一の露出面制御である
- [x] BE-016c `src/domain/session/dto-schema.test.ts` — **DTO のフィールド集合が許可リストと
      完全一致する**ことを検査する (SC-011)。`SessionSummaryDTO` と `SessionGroupDTO` の
      **各 variant**。項目が増えたら落ちる形にし、**表示用の生値を運ぶフィールドが
      `cwdDisplay` の 1 種類だけであること**も同時に固定する
- [x] BE-017 [P] `src/domain/session/interfaces.ts` — `EnumerationTargetFinder` /
      `SessionEnumerator` / `EnumerationRequest` / `EnumerationResult`
      ([contracts/session-enumeration.md](contracts/session-enumeration.md))
- [x] BE-018 [P] `src/domain/session/dto.ts` — `SessionIndexDTO` 一式。
      **`cwd` (変換済み `PathDTO`) と `cwdDisplay` (所在を伴わない安全な表示用文字列) を分ける。
      `rawCwd` という名前は使わない** — 生の UNC 文字列を境界に出さないため (FR-042 / C-007)。
      **`SessionSummaryDTO` と `SessionGroupDTO` の `unregistered` variant の両方**に
      同じ規則を掛ける ([contracts/ipc-session-list.md](contracts/ipc-session-list.md))

**Checkpoint**: `domain` のテストが I/O なしで全通過し、`domain ⇢ I/O` の到達が 0

---

## US-1: 登録フォルダを横断して一覧される (P1)

### 列挙の経路 (BE)

- [x] BE-020 `src/main/infra/session/config-dir.ts` — config ディレクトリの組み立てと
      子プロセスへの受け渡し。**branding も UNC の綴りの知識も `src/domain/runtime/` の
      パス API に任せ、自前で組み立てない**。share 配下への封じ込め検査は
      **パス API 側の責務**であり、ここで二重化しない (FR-006 / FR-042)。
      併せて `CLAUDE_CONFIG_DIR` のリテラルと環境変数の許可リストもここに置く。
      **訂正**: 初版は「UNC 値を materialize してよい実名リストの 2 件目」と位置づけていたが、
      [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §3 が
      **そのリストを作らないと決めた** (`toUnc()` を呼ぶこと自体が正規の経路であり、
      縛ると「正しい API を使うのに ADR が要る」形になる)。強制されるのは
      `UNC_LITERAL_MODULES` と `UNC_FORBIDDEN_IN` の 2 本で、`config-dir.ts` は
      **どちらにも載らない** = リテラルを持たず API を呼ぶ側である
- [x] BE-021 `src/main/infra/session/target-finder.ts` — UNC 経路の**浅い列挙**で候補を探索する。
      **`hostTarget(hostHome: HostPath)` の形でホームを受け取る** —
      本モジュールは `os` / `process` / `electron` のいずれも import できない (R-1 の許可行列)。
      注入しないと `process.env.USERPROFILE` へ倒れ、**import が無いので lint も
      検証スクリプトも素通りする**。
      R-1 の `WslFileSystem` を使い、**実行中確認済みの値に対してのみ発行する**。
      ホーム配下 + `/root` を候補とし、`.claude` の存在で絞る (FR-008 / FR-010 / FR-011 / FR-012)
- [x] BE-022 `target-finder.test.ts` — 候補 0 件 / `.claude` 不在 / 権限拒否 /
      複数ユーザ / 実行中確認済みの値の別ディストロ流用 (FR-011 / FR-012 / SC-007)
- [x] BE-023 `src/agents/enumerate-sessions.ts` — 列挙プロセス本体。
      **Agent SDK を呼ぶ唯一の場所**。`listSessions()` のみを使い、
      受け取った config ディレクトリ値を**そのまま渡す** (結合・分解・正規化をしない)。
      `electron` / ネイティブモジュールを import しない
      (FR-001 / FR-003 / FR-013 / FR-014 / FR-045 / contracts C-2 / C-4)
- [x] BE-024 [P] `src/agents/protocol.ts` — 親子間のデータのみプロトコル。
      **トランスポートは stdio (行区切り JSON 等) とする。`process.parentPort` を使う場合は
      本体から分離した薄い adapter 経由に限り、本体は stdio と同じプロトコルを話す**
      (Principle VII Statement 後半 / AD-010。`parentPort` は import を伴わないため
      ESLint にも依存グラフにも現れず、**機械検証が緑でも守れていない**形になりうる)。
      **UNC 形式を返さない**。作業ディレクトリは生値 + 由来所在で返し、
      出自判定は `domain` の純粋関数に任せる (contracts C-1 / C-3)
- [x] BE-025 `src/main/app/session-enumerator.ts` — 起動方針と結線。
      **Electron 境界を `src/main/app/enumerator-spawner.ts` に分離した** —
      `electron` を import したモジュールは Vitest の node 環境で読み込めず、
      スタブを置けば「モックゼロで書ける」(AD-023 §1) が崩れるため。
      `PROCESS_SPAWN_MODULES` の実名も差し替えた (AD-028 §4 の訂正)。
      **注入の窓のメソッド名に `spawn` を使わない** — 検証項目 7 はプロセス起動 API を
      **名前の文字列**で探すため、同名のメソッドで発火する (実測)。`launch` にした。
      **`env` を組み立てる部分を純粋関数として分離し、許可リスト外のキーを 0 件にする**
      (FR-050 / SC-016。プロセスを起こさずに assert できる形にする)。
      列挙対象ごとの timeout、`kill()` の戻り値と `exit` の確認、`before-quit` での一括終了、
      同時プロセス数の上限、**逐次連打のクールダウン**、同じ対象への要求の**束ね**
      (Principle V / contracts C-5 / C-6)。
      **所在の判別に `'wsl'` の文字列リテラルを書かない** — `utilityProcess` と書いた時点で
      検証項目 3 (裸の `wsl`) の発火条件を満たすため、リテラルを置くと違反になる。
      判別は `Location` の値で行い、文字列は `domain` / `config-dir.ts` 側に置く
- [x] BE-025b **起動の入口に実行中確認済みの値のゲートを掛ける** (FR-008 / SC-002)。
      **`EnumerationRequest` に `verified` / `now` を載せて型で表した** —
      「起動前に確かめる」という約束ではなく、値が無ければ起動できない形にする。
      config ディレクトリ探索・列挙プロセスの起動・追加取得の**3 つの入口すべて**。
      **プロセスの起動自体が UNC アクセスを引き起こす**ため、
      ファイルアクセスにだけ掛けると停止中の所在に子プロセスが飛ぶ
- [x] BE-025c `env` 組み立て関数と起動ゲートのユニットテスト (SC-016 / SC-002)
- [x] BE-026 `src/main/app/session-service.ts` — キャッシュ / 2 段取得 / 対応づけの適用 /
      再取得での**置き換え** / 取得時刻の保持。**ディスクに書かない**
      (FR-030 〜 FR-038 / data-model §7)
- [x] BE-027 `session-service.test.ts` — 1 所在の失敗が他を消さないこと (SC-007) /
      再取得で消えたセッションが消えること (SC-012) / `partial` から `complete` への遷移 /
      `onFoldersChanged` で**再列挙せず対応づけだけをやり直す**こと
- [x] BE-028 `src/main/app/ipc.ts` と `validate.ts` に追記 —
      `listSessions` / `refreshSessions` / `fetchMoreSessions` と
      `targetKey` / `offset` の検証。**検証は `validate.ts` に集約する**
      (FR-043 / contracts の検証表)
- [x] BE-029 IPC の検証テスト — **検証表の各行**について不正入力が拒否されること。
      preload をスタブせず main 側ハンドラを直接呼ぶ (SC-010)。
      **ハンドラ本体を `src/main/app/session-ipc.ts` に切り出した** —
      `ipc.ts` は `ipcMain` を import するため Vitest の node 環境で読み込めず、
      検証関数だけを試すと**ハンドラがその検証関数を呼んでいるか**が
      検査されないまま残る (= 表の各行を測ったことにならない)
- [x] BE-030 [P] `src/preload/index.ts` に追記 — 単一 capability に 3 メソッドと
      `onSessionsChanged` を追加する。**生の `ipcRenderer` を渡さない** (FR-043)
- [x] BE-031 `composition-root.ts` で結線し、`measure` の計測点を置く
      (先頭ページ / 全件 / キャッシュヒット。SC-008)。
      **`app.getPath('home')` を `makeHostPath()` 経由で `hostTarget` に注入する**
      (R-1 が `userData` を `folder-store` に注入しているのと同じ形。BE-021)

### 一覧の表示 (FE)

- [x] FE-040 `src/renderer/src/stores/sessions.ts` — external store (Zustand)。
      **選択 ID を store に一元化する** (component local state に持たない)
- [x] FE-041 `src/renderer/src/runtime/thread-list-adapter.ts` —
      `ExternalStoreThreadListAdapter`。`threadId` / `threads` を store から供給し、
      **`onRename` / `onArchive` / `onUnarchive` / `onDelete` / `onSwitchToNewThread` を
      配線しない** (読み取り専用。FR-003)。`onSwitchToThread` のみ配線する
- [x] FE-042 `features/session-list/useSessions.ts` — IPC 呼び出しと `onSessionsChanged` の購読。
      **`onFoldersChanged` では再列挙しない** (contracts ipc)
- [x] FE-043 `features/session-list/SessionListScreen.tsx` —
      **行の指定は位置ではなく鍵で行う。** `ThreadListPrimitive.ItemByIndex` は位置で
      行を指すが、外部ストアの `threads` を差し替えても runtime への反映は同じ描画では
      終わらないため、呼び出し側が持つ位置を渡すと範囲外を指して
      `useClientLookup: key "undefined" not found` で**画面全体が落ちる** (実測)。
      位置への変換は element が runtime の現在値に対して行う。
      グループごとのセクション + `ThreadListPrimitive` による行。
      **element 内蔵の日付グルーピングと検索を使わない**。
      グループ分けは `s.threads.threadItems` を selector の外で変換する (Principle XIII / plan の UI 構成)
- [x] FE-043b **由来候補 (ユーザ) を一覧上で常時識別できるようにする** (FR-052) —
      1 ディストロ内の全ユーザ分を集約するため、
      **どのユーザの履歴を見ているかが分からない状態を作らない**。
      `targetLabel` を行またはグループ見出しに出す
- [x] FE-044 [P] `features/session-list/labels.ts` — 参照キーの訳出。
      `FailureReason` / `PendingReason` / `UnknownReason` / `CwdOriginKind` / `Boundary` の
      **全値**を網羅する (FR-046)
- [x] FE-045 コピーした `thread-list.aui.tsx` から **rename / archive / delete /
      New conversation の操作を外す**。外した理由をコメントに残す (FR-003 / Principle XIII)
- [x] FE-046 `SessionListScreen.test.tsx` — 日本語・絵文字・制御文字を含む要約 (SC-009) /
      要約が空の行の代替表示 (FR-047) / 取得時刻の表示 (FR-034) /
      worktree と programmatic の区別 (FR-029)
- [x] FE-047 [P] ナビゲーションに「セッション一覧」を追加する (R-1 の 3 画面に 1 画面加える)
- [x] FE-048 `SDKSessionInfo` の 10 項目すべてに表示先を割り当て、
      **実装時に 4 項目 (`createdAt` / `gitBranch` / `tag` / `fileSize`) が
      未割当だった。** 行の詳細に出し、[data-model.md](data-model.md) §3 に
      「表示先の割り当て」表として記録した。
      **[data-model.md](data-model.md) §3 の `SessionSummary` 表に「表示先」列として記録する**
      (Principle XII。割り当てない項目を残さない)。
      **確認だけで記録を残さないと O-2 が `docs/ui-coverage.md` を作るときにやり直しになる**

**Checkpoint**: 実機で両所在のセッションが 1 画面に並び、SC-001 の突き合わせが通る。
**加えて SH-094 (Electron 抜きの `node` での単独起動) をここで通す** —
Phase 7 まで先送りすると `protocol.ts` を `parentPort` 前提で書いてから気付くことになり、
SH-084 を前倒しした理由 (「調停より先にコードにしない」) と同じ順序問題を踏む

---

## US-2: 未登録フォルダのセッションを見つける (P1)

- [x] FE-050 未登録グループの表示 — 作業ディレクトリごとにまとめ、**既定で畳む** (FR-025)
- [x] FE-051 登録の導線 — 所在とパスを初期値として R-1 の登録操作に渡す。
      **アプリが自動で登録しない**。**実在確認を行わない** (FR-026 / FR-027)
- [x] FE-052 「作業フォルダ不明」グループ — `cwd-absent` / `location-unknown` /
      `distro-undetected` の理由を区別して示す (FR-028)
- [x] FE-053 テスト — 総数保存の UI 側確認 / 登録導線が値を渡すだけであること /
      未登録グループが畳まれていること (SC-006 / FR-026)
- [x] SH-054 **ESLint ルールを追加する** — `src/renderer/` 内で `namespace` プロパティを持つ
      オブジェクトリテラルを禁じる。R-1 の残余 `ui-path-concat` を塞ぐ
      (plan の「上流からの申し送り」#1)
- [x] SH-055 **新しい違反サンプルを 1 件追加**する (`ui-dto-namespace-literal` 等) —
      新ルールの発火確認はこちらが担う。`expected.mjs` の検出側に登録する
- [x] SH-055b **`ui-path-concat` は `UNDETECTED_NOTES` に残す。**
      `mitigatedBy` に「`namespace` リテラルの組み立ては SH-054 で塞いだ。
      残る連結経路 (既存 DTO の spread + `value` 差し替え) は依然として機械検証されない」を追記し、
      `nextFeature` を付け替える。**空にしない** — 空にすると **R-1 の SC-017** の台帳が後退する。
      **既存 fixture はテンプレート文字列の連結であり新ルールでは発火しない** (実体を確認済み)

**Checkpoint**: 未登録フォルダから登録に進め、再取得でグループが移動する

---

## US-3: 列挙できない所在を理由つきに知る (P1)

- [ ] BE-060 所在ごと・候補ごとの失敗の封じ込めと理由キーの確定。
      **`no-history` と `failed` を混ぜない** (FR-012 / FR-027 / FR-028 / data-model §6)
- [ ] BE-061 停止中の所在の拒否 — **実行状態を取り直してから**拒否し、
      UNC アクセスもプロセス起動も行わない (FR-007 / SC-002 / research R-08)
- [ ] BE-062 [P] 部分結果と失敗理由の同時返却 (`stopped-midway`。US-3 AC-6)
- [ ] FE-063 所在ごとの状態表示 — 未列挙 / 履歴なし / 失敗 を区別し、
      **起動と再検出の導線**を添える。R-1 の `error-state` / `empty-state` element を使う
      (FR-029 / FR-032 / Principle XIII)
- [ ] FE-064 テスト — 1 所在が失敗しても他の一覧が欠落 0 件で描画されること (SC-007) /
      **空状態 5 条件**すべてで導線が出ること (**登録フォルダ単位のセッション 0 件**を含む。SC-013)

**Checkpoint**: `wsl --terminate` した所在が理由つきに示され、他の所在の一覧が残る

---

## US-4: 件数が多くても目的のセッションに辿れる (P2)

- [ ] BE-070 2 段取得 — 先頭ページを返してから全件を取得し、`onSessionsChanged` で通知する。
      `truncated` と `fetchMoreSessions` を実装する (FR-037 / FR-038 / research R-06)
- [ ] FE-071 段階的描画 — `complete: false` のあいだ**グループ件数を確定値として見せない**
      (data-model §7)
- [ ] FE-072 並び順の既定 (最終更新の新しい順) と所在 / フォルダによる絞り込み。
      **絞り込みで IPC を往復させない** (FR-039 / FR-040 / contracts ipc)
- [ ] FE-073 テスト — 700 件規模のスタブで先頭描画と追加取得 / 絞り込み結果 0 件の空状態
- [ ] SH-074 SC-008 の計測 — 先頭 50 件 2 秒 / 全件 10 秒 / キャッシュヒット 100 ミリ秒。
      **温まった dev サーバで 2 回目以降の値を採る** (quickstart V-6)

---

## Phase 7: 検証と上流 SSoT の追随

**SH-084 (ADR 起票) だけは Phase 1 に前倒しする** — 下の Dependencies を参照。
accepted ADR に反する設計を、調停 ADR より先に実装しないため。

- [x] SH-080 `scripts/constitution/allowlists.mjs` の `PROCESS_SPAWN_MODULES` に
      列挙プロセスの起動モジュールを追加する。**ADR (SH-084) の起票と同時に行う**
      (AD-025 の申し送り / plan #3)
- [ ] SH-081 検証スクリプトに項目を追加する — **許可リスト方式で検査する**。
      `@anthropic-ai/claude-agent-sdk` からの import と呼び出しが
      **`listSessions` の 1 件だけ**であることを確認する。
      **禁止側の API 名を task に列挙しない** — 列挙すると
      [contracts/session-enumeration.md](contracts/session-enumeration.md) C-4 の表に
      行を足したときに task 側が古くなる (SC-004 が「SC 側で部分列挙しない」と定めたのと同じ理由)。
      **名前の出現ではなく呼び出し形で判定する** (SC-004 / SC-011 / research R-07)
- [ ] SH-082 `wsl.exe` 起動 0 件の検証 — プロセス起動レイヤを差し替えた Vitest と
      検証スクリプトの走査 (SC-003)
- [ ] SH-083 dependency-cruiser が `src/agents/` の**実コード**に対して発火することを確認する。
      `electron` / `better-sqlite3` / `node-pty` への推移的到達が 0 であること
      (Principle VII / AD-010 / plan #2)
- [x] SH-084 ADR 起票 — **列挙の実行単位と UNC の受け渡し**。
      (a) `agents` に「要求 1 回」の寿命を追加する。
      **AD-023 §1 の寿命表と §6 を「読み替える」根拠として本 ADR を置く**
      (AD-025 §2 が AD-004 に対して採った形式)。**in-place 改変しない。
      `superseded-by` は変更しない (supersede ではなく補足)。References に AD-023 §1 / §6 を実名で挙げる**
      (b) UNC を列挙プロセスへ渡す 4 規則 (AD-025 との調停)。
      **規則 1 の 2 本のリスト (`UNC_BRANDING_MODULES` / `UNC_MATERIALIZE_MODULES`) の
      初期値を本 ADR に載せる** (SH-093)
      (c) プロセス起動モジュールの許可リスト追加 (SH-080)。
      **`session-enumerator.ts` が `utilityProcess` と書いた時点で検証項目 3 (裸の `wsl`) が
      掛かる**ため、新たに掛かる項目 (1 / 3 / 4) と必要な許可リスト追加を列挙する
      (d) **Principle VIII / AD-024 #18 の延期先から R-2 を外す読み替え根拠**。
      AD-024 は immutable なので本 ADR に置く。**SH-092 (Constitution PATCH) の前提**であり、
      これが無いと immutable な ADR の記述を ADR 無しで無効化する形になる
- [x] SH-085 [P] ADR 起票 — **作業ディレクトリの出自判定**。
      1 つの config ディレクトリに 3 形式が混在する実測と、
      AD-025 の「所在を推測しない」をセッション側へ拡張する根拠
- [x] SH-086 `docs/domains/session/charter.md` を追随させる (plan の「上流 SSoT の追随」表の全行)。
      1. Journey 1 に**未登録フォルダ**を加える
      2. **In scope 1 行目**を「登録の有無によらず config ディレクトリ配下の全件」に改める
         (Journey だけ直すとゴール記述と旅程が食い違う)
      3. KPI「列挙の網羅」の計測経路に **M4 完了後に再検討する**旨の留保と、
         **再開条件**「E2E 基盤が入った時点で計測経路を E2E に戻す」を書く
      4. **E2E 基盤の持ち主 feature を `docs/roadmap.md` に名前付きで登録する**
         (「M4 完了後に再検討」だけでは持ち主がいない)
      5. `related_specs` に本 spec を追加する
- [x] SH-087 [P] `docs/glossary.md` に 6 用語を追加する (data-model §10)。
      **Session / transcript の項に「一覧は要約とメタデータのみ」を追記する** (FR-048)
- [x] SH-088 [P] `docs/domains/_overview.md` の R-2 行に
      「全件列挙 + 未登録フォルダ」「読み取り専用」を明示する。
      あわせて **`docs/domains/runtime/charter.md` の `related_specs` に本 spec を追加**し、
      **`_overview.md` の R-1 行**にパス API の拡張 (BE-010b) を 1 行添える —
      本 feature は R-1 の `runtime` domain を拡張するため
- [ ] SH-089 quickstart を実施し、結果を `quickstart-results.md` に記録する。
      **V-3 の出自 6 パターンのうち実機で踏めなかった行を明記する** (SC-001 〜 **SC-016**)
- [ ] SH-090 `lint` / `typecheck` / `depcruise` / `check:constitution` / `test` /
      `test:rules` を全通過させる (違反サンプルを保持したまま)
- [x] SH-091 **`.dependency-cruiser.js` の `services-not-to-io` の `from` に
      `^src/main/app/session-service[.]ts$` を追加する** (AD-027 Consequences / AD-025 §9)。
      `session-enumerator.ts` を含めるか否かを**明示的に判断しコメントに理由を残す**。
      受け入れ条件: 追加後に既存 fixture
      (`src/main/app/__rulecheck__/service-io-import.ts`) で
      **引き続き発火すること** (実名列挙は綴り誤りで黙って死ぬ)。**SH-084 と同時に行う**
- [x] SH-092 **`.specify/memory/constitution.md` を v1.2.3 (PATCH) に改定する** —
      Principle VIII の Verification と Existing violations summary の
      「R-2 の E2E 基盤に相乗りする」を事実に改め、Amendment trail に 1 行。
      **人間レビュー必須** (Constitution 改定手順)。読み替え ADR と同時に行う
- [x] SH-093 **UNC 封じ込めの機械検証を入れる** (research R-05 規則 1 / 2)。
      **リストは 2 本に分ける** — materialize と branding は別概念であり、
      1 本に畳むとパス API 自身が違反になるか、逆に区別が消える。
      正本は `scripts/constitution/allowlists.mjs` に置く
      (`WSL_CALLER_MODULES` / `PROCESS_SPAWN_MODULES` と同じ形。追加には ADR を要する)。
      - `UNC_BRANDING_MODULES` — `toUnc` / `makeWslUncPath` を呼んでよいモジュール
        (`src/domain/runtime/` のパス API とそのテスト)
      - `UNC_MATERIALIZE_MODULES` — UNC 値を文字列として取り出してよいモジュール
        (`src/main/infra/fs/wsl-fs.ts` / `src/main/infra/session/config-dir.ts`)
      - `src/agents/` 内に UNC 接頭辞リテラルと `toUnc` 呼び出しが **0 件**であること
      **両リストの初期値を SH-084 の ADR に載せる** (Principle VI: 許可リスト追加には ADR)。
      違反サンプルを 1 件ずつ添える (AD-027 §1: ルールは発火で確認する)
- [x] SH-094 **列挙プロセスが Electron 抜きの `node` で単独起動でき、
      標準入出力で 1 件の列挙が成立することを確認する** (Principle VII Statement 後半 / AD-010)。
      `process.parentPort` を使う場合は薄い adapter に分離し、本体は stdio を話す
      - **結果**: [quickstart-results.md](quickstart-results.md) V-0。
        ホストと **WSL (UNC 経路)** の双方で成立。バンドルは `electron` を 0 件 require し、
        環境変数は許可リストの 3 つだけで動く。`parentPort` は使っていない。
        併せて H-021 (SC-008 の予算の再測定) を同ファイルに記録した

**Checkpoint**: 全 SC の計測経路が実行済みで、上流文書と spec の食い違いが 0

---

## Dependencies

```text
Phase 1 (SH-001 〜 SH-003)
   ↓
Phase 2 (BE-010 〜 BE-018)   ← BLOCKING。ここが済むまで US の実装に入らない
   ↓
US-1 BE (BE-020 → BE-021 → BE-023 → BE-025 → BE-026 → BE-028 → BE-031)
   ↓                                    ↘
US-1 FE (FE-040 → FE-041 → FE-042 → FE-043)
   ↓
US-2 (FE-050 〜 FE-053) ─ SH-054 / SH-055 は FE-051 の後
US-3 (BE-060 〜 FE-064)   ← US-1 の BE 経路に依存
US-4 (BE-070 〜 SH-074)   ← US-1 完了後
   ↓
Phase 7 (SH-080 〜 SH-094。ただし SH-084 は Phase 1 に前倒し)
```

- **BE-011 は BE-010b に依存する** (生の UNC を解析する関数が無いと実装できない)
- **BE-013 は BE-011 に依存する** (出自が決まらないと対応づけに入れない)
- **BE-026 は BE-013 / BE-015 / BE-016b に依存する** (対応づけ・グループ分け・正規化を適用する側)
- **BE-025b / BE-025c は BE-025 の直後**に置く (ゲートと `env` を後付けにしない)
- **BE-016c (DTO スキーマ検査) は BE-018 の直後**に置く (定義と検査を離さない)
- **SH-055b は SH-054 / SH-055 と同時**に行う (台帳の更新を後回しにしない)
- **SH-084 (ADR 起票) は Phase 1 に前倒しする。** BE-023 / BE-025 は **SH-084 の accepted を
  前提とする** — accepted ADR (AD-025) に字義どおり反する設計を、調停 ADR より先に
  コードにしない。「実装済みだから ADR を追認する」形を避ける
- **SH-084 / SH-080 / SH-091 / SH-093 は同時に行う** (許可リストとルールを ADR 無しで広げない)。
  SH-084 の ADR には、`session-enumerator.ts` を spawn 可能にすることで新たに掛かる
  検証項目 (裸の `wsl` / `docker` / 曖昧名) と必要な許可リスト追加を**列挙する**
- **SH-086 / SH-092 は design-gate の人間承認を要する** (上流 SSoT と Constitution の改定)

## 並列化の指針

- Phase 2 の `[P]` 付き 4 件 (BE-016 / BE-017 / BE-018 と BE-012) は別ファイルで独立
- US-1 の BE と FE は **BE-028 / BE-030 の DTO 確定後**に並行できる
- Phase 7 のドキュメント系 (SH-085 / SH-087 / SH-088) は相互に独立

---

## Target 別索引

### Backend (`src/domain/session/` / `src/main/` / `src/agents/`)

BE-010 〜 BE-018 (foundational) / BE-020 〜 BE-031 (US-1) / BE-060 〜 BE-062 (US-3) /
BE-070 (US-4)

### Frontend (`src/renderer/`)

FE-040 〜 FE-048 (US-1) / FE-050 〜 FE-053 (US-2) / FE-063 / FE-064 (US-3) /
FE-071 〜 FE-073 (US-4)

### Shared (ツール / 検証 / ドキュメント / ADR)

SH-001 〜 SH-003 (setup) / **SH-084 (ADR 起票。Phase 1 に前倒し)** /
SH-054 / SH-055 / SH-055b (lint ルールと違反サンプル) / SH-074 (計測) /
SH-080 〜 SH-094 (検証と上流追随。**SH-091 services-not-to-io / SH-092 Constitution PATCH /
SH-093 UNC 封じ込め / SH-094 単独起動** は design-gate round 1 で追加)
