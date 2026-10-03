# Tasks: Thread 検索と探す操作 (O-3)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / main / preload、`[FE]` renderer、`[SH]` 横断 (docs・規則・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。targets=both の Backend / Frontend / Shared の区分はこのタグで示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC、一致の規則・検索の状態・palette の操作・記録の形・文言の正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書く。

**着手の条件**: **O-7 (spec 013) がマージされ、AD-045 / AD-046 が accepted になり、spec の U-1〜U-4 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合) → FE-010 / FE-020 / FE-030。BE-001 (domain の型) → BE / FE の他。SH-010 (roadmap ほか) は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-016): Thread search、会話内検索、Command palette、起動元 (preset / manual)、再利用率の記録
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-04): registry の `Command palette` / `Conversation search` / `Thread search` を実名で照合する。観点に「本番の CSP (`style-src 'self'`) の下で動くこと」を入れる。結果の正本は PR の説明、research と F 節の備考は写し
- [ ] **BE-001** [BE] `src/domain/session/launch-usage.ts` (+ test) — `LaunchOrigin`・`LaunchUsage` の型、足す・90 日の刈り込み・30 日の合計の純関数、固定のキー集合の検査 (data-model §4)

## US-1 — サイドバーの過去のセッションの区画を絞り込む (P1)

**Goal**: Thread search (spec FR-001 / FR-002)。

- [ ] **FE-010** [FE] [P] `features/search/match.ts` (+ test) — data-model §1 の正規化と AND の部分一致。テスト: 全角 / 半角・大文字 / 小文字・制御文字・双方向制御・ゼロ幅・複数語・`null` のフィールド・空白だけの語 (SC-001)
- [ ] **FE-011** [FE] `SessionListScreen.tsx` — 過去の区画の見出しの下に検索欄。所在・フォルダの絞り込みと AND。一致の件数、一致 0 は `filtered-out` に合流 (Empty state と語を消す操作)。語は `stores/sessions.ts` に (永続化しない)。IME の変換中の Enter / Esc は無視。テスト: US-1 の AC1〜AC6

## US-2 — 開いている会話の中を検索する (P1)

**Goal**: 会話内検索 (spec FR-003〜FR-005)。

- [ ] **FE-020** [FE] `features/chat/useConversationSearch.ts` / `ConversationSearchBar.tsx` / `search-highlight.ts` — data-model §2。中央のヘッダのボタンと Ctrl+F、150ms の間引き、追加分だけの走査、CSS Custom Highlight API の強調 (差し替え可能)
- [ ] **FE-021** [FE] `thread.aui.tsx` / transcript の context — `scrollToMessage(index)` (仮想化 / 非仮想化) と、検索中は最下部への追従を止める
- [ ] **FE-022** [FE] テスト — US-2 の AC1〜AC6、仮想化の範囲の外への移動、1,000 メッセージで走査 1 回 50ms 以内 (SC-002)、`text` part 以外を対象にしない (FR-004)、強調が DOM を書き換えない (要素の数が変わらない)

## US-3 — キーボードだけで操作を呼び出す (P2)

**Goal**: Command palette (spec FR-006 / FR-007)。

- [ ] **FE-030** [FE] `features/palette/commands.ts` / `CommandPalette.tsx` / `labels.ts` — data-model §3 の操作の表。O-7 の `AppShell` にマウント、`window` の keydown (capture) で Ctrl+K、IME の変換中は無視、閉じたら元の要素にフォーカス。セッションの候補の実行は 2 つのストアの選択 (O-7 の focus の書き手を通る)
- [ ] **FE-031** [FE] テスト — US-3 の AC1〜AC6、vitest-axe の違反 0 (SC-003)、候補 50 件の上限と並び

## US-4 — プリセットがどれだけ使われているかが分かる (P2)

**Goal**: 再利用率の計測経路 (spec FR-009〜FR-013)。

- [ ] **BE-040** [BE] `src/main/infra/settings/launch-usage-store.ts` (+ test) — data-model §4 の置き場・一時ファイルからの置き換え・`.bak` の退避・読めないときの扱い。`electron` を import しない
- [ ] **BE-041** [BE] `src/main/app/launch-usage-service.ts` (+ test) — 直列化、ローカルの暦日の計算 (main の時計)、書き込みの失敗を握りつぶす
- [ ] **BE-042** [BE] `capability.ts` / `preload/index.ts` / `validate.ts` / `ipc.ts` / `composition-root.ts` / `e2e-capability.ts` — `launchSession(config, origin?)`、`checkLaunchOrigin`、受け付け (`launching`) のときだけ await せずに記録、`getLaunchUsage` のチャネル。テスト: 未知・欠けた起動元で起動が拒否されず記録されない、拒否・失敗は記録しない、store が投げても起動の結果が変わらない (SC-005)
- [ ] **BE-043** [BE] `tests/ipc-channels.test.ts` (新設) — `IPC_CHANNELS` の集合を固定する (SC-006)
- [ ] **FE-040** [FE] `LaunchDialog.tsx` / `PresetPanel.tsx` — `applyPreset` で `preset` を覚え、開き直しで `manual`。プリセットの欄に直近 30 日の回数、記録無しは Empty state。テスト: US-4 の AC1〜AC5

## Polish / 記録

- [ ] **SH-003** [SH] **AD-045 の記録** (FR-014): AD-045 (proposed) は design で起こし済み。Constitution XV の字面の改定は accepted の後 (本 feature の PR か別の PR かは利用者が決める)
- [ ] **SH-010** [SH] **記録を追随させる** (FR-015 / FR-016): roadmap (O-3 の行・O-8 / O-9 の追加・system-scope の ADR の持ち主・`#o3-kpi-smoothness` の参照元の付け替え・切り出しの注記・D-1 の注記)、`_overview.md`、ui charter / session charter、`docs/ui-coverage.md` F 節 (4 element の使い道と、Activity graph / Heat graph / Message timing / Trace waterfall の O-9)、`docs/prompts.md`、`docs/discovery.md` (`launch-usage.json`)、`thread-list.aui.tsx:38` の注記、010 quickstart-results のリンク
- [ ] **SH-011** [SH] **検証** — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。quickstart V-1 / V-2。V-3 (実機の目視) は利用者に残す
