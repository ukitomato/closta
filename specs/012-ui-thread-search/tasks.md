# Tasks: Thread 検索と探す操作 (O-3)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / main / preload、`[FE]` renderer、`[SH]` 横断 (docs・規則・E2E・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。targets=both の Backend / Frontend / Shared の区分はこのタグで示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC、一致の規則・検索の状態と強調・palette の操作・記録の形と読み込みの扱い・文言の正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書く。

**着手の条件**: **O-7 (spec 013) がマージされるまで /cl-implement に入らない。** AD-045 / AD-046 の accepted と spec の U-1〜U-6 の承認は 2026-10-05 に済み。

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-010 / FE-020 / FE-030。BE-001 (domain の型) → BE / FE の他。SH-010 (roadmap ほか) と SH-003 (Constitution XV) は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-016): セッションの検索 (element 名は Thread search)、会話内検索、Command palette、起動元 (preset / manual)、起動の利用記録 (`LaunchUsage`。Counterexamples に「ローカル利用ログ」「再利用率の記録」)
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-04): registry の `Command palette` / `Conversation search` / `Thread search` を実名で照合する。観点に「本番の CSP (`style-src 'self'`) の下で動くこと」。結果の正本は PR の説明、research と F 節の備考は写し
- [ ] **BE-001** [BE] `src/domain/session/launch-usage.ts` (+ test) — data-model §4 の型と純関数 (`LaunchOrigin`・`checkLaunchOrigin` の厳密比較・`LocalDayKey`・`toLocalDayKey`・`addLaunch`・`prune` (基準日は今日と最も新しい日の早い方)・`sum30`・許可したキーだけを出す書き出し)。テスト: プロトタイプのキー (`'toString'`) を通さない、時計が戻る / 先に跳ぶ、暦として不正な日 (`2026-13-45`)、`Number.isSafeInteger` の外、固定のキー集合

## US-1 — サイドバーの過去のセッションの区画を絞り込む (P1)

**Goal**: Thread search (spec FR-001 / FR-002)。

- [ ] **FE-010** [FE] [P] `features/search/session-search.ts` (+ test) — data-model §1 の正規化と字面の部分一致。テスト: 全角 / 半角・大文字 / 小文字・制御文字・双方向制御・ゼロ幅・複数語・`null` のフィールド・空白だけの語・`.*` / `(a+)+` / `[` を含む語 (正規表現として解釈しない)・登録フォルダの表示名で一致 (SC-001)
- [ ] **FE-011** [FE] `SessionListScreen.tsx` — 過去の区画の見出しの下に検索欄。グループの見出しの導出を関数にして共有。所在・フォルダの絞り込みと AND。一致の件数、`search-empty` (語と絞り込みをすべて解除)、検索中は畳まれたグループも開いて描く。語は `stores/sessions.ts` に。IME の変換中の Enter / Esc は無視。テスト: US-1 の AC1〜AC6、未登録グループの中だけの一致、語だけで 0 件のときに解除で一覧が戻る、`filtered-out` の文言とボタンが変わらない

## US-2 — 開いている会話の中を検索する (P1)

**Goal**: 会話内検索 (spec FR-003〜FR-005)。

- [ ] **FE-020** [FE] `features/chat/useConversationSearch.ts` / `ConversationSearchBar.tsx` / `search-highlight.ts` — data-model §2 (入力の供給元 2 つ、中央のヘッダのボタンと Ctrl+F、150ms の間引き、変わったメッセージだけの走査、`current` をキーで保つ、2 つの位置の表で Range、範囲外は飛ばす、CSS Custom Highlight API は差し替え可能)。検索のバーの Enter / Shift+Enter / Esc は IME の変換中に反応しない。`main.css` に `::highlight()` の規則 (既存のトークン)
- [ ] **FE-021** [FE] `thread.aui.tsx` / transcript の context — `scrollToMessage(index)` (仮想化 / 非仮想化) と、検索中は最下部への追従を止める
- [ ] **FE-022** [FE] テスト — US-2 の AC1〜AC8、仮想化の範囲の外への移動、`text` part 以外を対象にしない (FR-004)、強調が DOM を書き換えない、**本文が伸びたときに件数が増え `current` が同じ一致を指す**、**`U+FDFA` / `㍿` / `İ` / ゼロ幅・双方向制御を含む本文で例外が出ず強調が元の一致の範囲に掛かる**、走査の関数の呼び出しの回数 (SC-002。時間は参考値として出力)

## US-3 — キーボードだけで操作を呼び出す (P2)

**Goal**: Command palette (spec FR-006 / FR-007)。

- [ ] **FE-030** [FE] `features/palette/commands.ts` / `CommandPalette.tsx` / `labels.ts` — data-model §3 の操作の表。O-7 の `AppShell` にマウント、`window` の keydown (capture) で Ctrl+K、IME の変換中とモーダルのダイアログの間は何もしない (`preventDefault` もしない)、閉じたら元の要素にフォーカス。セッションの候補の実行は 2 つのストアの選択 (O-7 の focus の書き手を通る)。稼働中と同じ id の過去の行はまとめる
- [ ] **FE-031** [FE] テスト — US-3 の AC1〜AC6、vitest-axe の違反 0 (SC-003)、候補 50 件の上限と並び、モーダルが開いている間に Ctrl+K で開かない、palette が開いている間の Ctrl+F
- [ ] **SH-020** [SH] `e2e/ime.spec.ts` — 「composer で変換中に Ctrl+K / Ctrl+F を押しても palette と検索が開かず、変換が確定できる」を 1 ケース足す。既存の 3 経路が緑のままであること (SC-002 / SC-003)

## US-4 — プリセットがどれだけ使われているかが分かる (P2)

**Goal**: 再利用率の計測経路 (spec FR-009〜FR-013)。

- [ ] **BE-040** [BE] `src/main/infra/settings/launch-usage-store.ts` (+ test) — `createLaunchUsageStore(userDataDir: HostPath, now, fs?)`、パスは `hostPathOps.join`、`electron` を import しない。data-model §4 の読み込みの結果の表。テスト (fs を差し替える): 将来版で記録しても本体が変わらない、日単位の不正で他の日が残り退避する、退避の writeFile が投げたら本体が変わらない、rename の失敗で `.tmp` が 0 件
- [ ] **BE-041** [BE] `src/main/app/launch-usage-service.ts` (+ test) — 直列化、読み込みの状態 (`storeNewerVersion` / `readFailed` で読み直す / 読み込み済みは再読しない)、成功してからメモリを差し替える (失敗した 1 回は捨てる)、`[launch-usage-store]` の `console.warn` (理由キーと errno のコードだけ)。テスト: 読めないと記録なしを `getLaunchUsage` で区別する
- [ ] **BE-042** [BE] `capability.ts` / `preload/index.ts` / `session-ipc.ts` / `ipc.ts` / `composition-root.ts` / `e2e-capability.ts` — `launchSession(config, origin?)`、`handleLaunchSession` で `checkLaunchOrigin` と `launching` のときだけ await せずに記録、`getLaunchUsage` (引数を取らない) の handler の本体は `session-ipc.ts`、`ipc.ts` は登録と port の transfer だけ。E2E の配線は記録と読み出しのメモリ内の fake。テスト (`session-ipc.test.ts`): 起動元が preset / manual / 欠落 / 未知のどれでも `deps.launchSession` が同じ引数で 1 回だけ呼ばれ拒否されない、未知・欠落は記録しない、拒否・失敗は記録しない、記録が投げても結果が変わらない (SC-005)
- [ ] **BE-043** [BE] `tests/ipc-channels.test.ts` (新設) — `IPC_CHANNELS` の集合を固定する。全チャネルが `handle()` (送信元の検査) 経由で登録される (信頼できない送信元で rejected) (SC-006)
- [ ] **FE-040** [FE] 起動元の経路 — `LaunchDialog.tsx` (`applyPreset` で `preset`、新しく開いたら `manual`) → O-7 の起動の面 → `running-session-store.ts` の `launch(config, folderLabel, origin)` と `lastOrigin` (`running-session-types.ts`) → capability。`test-support/capability.ts` の stub。`PresetPanel.tsx` に直近 30 日の回数・記録なし・読めない。テスト: US-4 の AC1〜AC6 (適用後に軸を変えてもプリセット、拒否の後に前回の設定で起動し直してもプリセット、origin が capability まで届く)

## Polish / 記録

- [ ] **SH-010** [SH] **記録を追随させる** (FR-015 / FR-016): roadmap (O-3 の行・O-8 / O-9 の追加と O-9 の session の契約の注記・system-scope の ADR の持ち主・`#o3-kpi-smoothness` の参照元の付け替え・切り出しの注記・D-1 の注記)、`_overview.md`、ui charter (Thread search の例外・Related Specs)、session charter (KPI「再利用率」の文言 (U-6) と計測経路・起動の利用記録の置き場 (U-5)・滑らかさの持ち主)、`docs/ui-coverage.md` F 節 (4 element の使い道と使い道の書式・Activity graph / Heat graph / Message timing / Trace waterfall の O-9)、`docs/prompts.md`、`docs/discovery.md` (`launch-usage.json`)、`thread-list.aui.tsx:38` の注記、010 quickstart-results のリンク、013 spec の「1 つの一覧に混ぜるか」に結論 (混ぜない)
- [ ] **SH-003** [SH] **Constitution XV を改める** (FR-014。AD-045 が accepted の後): MINOR。XV の字面を AD-045 に合わせ、Sync Impact Report と Amendment trail、改定手順 2 (architecture-reviewer を交えた人間のレビュー)。直書きの基準線 (今ある件数) を数えて AD-045 に書く
- [ ] **SH-011** [SH] **検証** — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。quickstart V-1 / V-2。V-3 (実機の目視。本番ビルドで) は利用者に残す
