# Tasks: MCP・プラグイン・コマンドの表示 (O-5)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents / scripts、`[FE]` renderer、`[SH]` 横断。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いは spec の FR / SC、名前の解き方・承認カード・構成の許可リストと形の検査と送るかの判定・タブ・行・注記・対応表の書き換え先・文言は data-model、方式の理由は research。

**着手の条件**: O-7 (013。PR #13) と O-4 (014。PR #15) はマージ済み。AD-046 / AD-047 / AD-048 の accepted と spec の U-1〜U-7 の承認は 2026-10-05 に済み。2026-10-09 の spec の載せ直しの後、本ファイルは /cl-tasks で作り直す (下は古い参照だけを直した版)。

**順序の制約**: SH-001 → コード。SH-002 → FE-021 (照合の結果で構成のタブを作るか決める)。BE-001 → BE / FE の他。SH-010 は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — MCP の tool の表示、セッションの構成 (`SessionInitReport`。Counterexample「SessionLaunchConfig とは別物」)、O-10
- [ ] **SH-002** [SH] [P] element の照合 — registry の MCP の tool の呼び出し・MCP server panel・Question flow の element を実名で照合。不採用の条件: 本番の CSP の下で動かない・生の HTML / iframe / `frame-src` を要る・遠隔の取得・操作のボタンの配線。結果の正本は PR の説明、F 節の使い道を決める
- [ ] **BE-001** [BE] `session-init-report.ts` (+ test。新設) と O-4 の `meter.ts` — `init-report` / `commands` の型、読むフィールドだけの入力型、許可リスト (data-model §2)、形の検査の定数 (agents と decoder で共有)。テスト: 通さないフィールド (`cwd`・`path`・`apiKeySource`・`betas`・`capabilities`・`aliases`) に目印の値を入れて出力に 0 件、allowlist の外 (制御文字・tag 文字 U+E0000〜・U+2028・空白入り・`//`・長い名前)、`version` の形、件数とバイト数の上限、`status: '__proto__'` / `constructor`、説明の Cc / Cf / Zl / Zp

## US-1 — MCP の tool の呼び出しと Claude からの問いが読める (P1)

- [ ] **BE-010** [BE] [P] `transcript.ts:233` (+ test) — 過去ログの tool 名を実行中と同じ無害化に。U+202E を含む `mcp__a__b` の fixture
- [ ] **FE-010** [FE] [P] `mcp-tool-name.ts` (+ test。新設) — data-model §1 の各行 (最長一致・推定・分けられない名前・組み込みの 4 tool・非 MCP の名前 `mcp_x` / `MCP__a__b` / `xmcp__a__b`)、URI の要約 (`https://u:p@h/x`・`postgres://user:pw@db/t`・`?access_token=`・`#frag`・読めない URI)
- [ ] **FE-011** [FE] `mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` (新設) と `tool-registry.aui.tsx` (+ test。新設) — 2 段の振り分け、見出し・閉じた入力・平文の結果、`AskUserQuestion` の問い・選択肢・回答。テスト: US-1 の AC1〜AC5 と AC7・Edge Cases の分けられない名前 (過去ログと実行中の fixture)、既存の 8 つの名前の振り分けが変わらない、`constructor` / `toString` / `__proto__` の名前で ToolFallback
- [ ] **FE-012** [FE] `ApprovalCard.tsx` (+ test) — MCP の生の名前 (切り詰めない・等幅・`break-all`) と補助の見出し、`AskUserQuestion` の注記。テスト: US-1 の AC6 / AC8、200 文字の tool 名が DOM に全文、サーバー `a` と `a__b` の曖昧なケース、MCP でない tool のカードが今のまま

## US-2 — セッションの構成が分かる (P1)

- [ ] **BE-020** [BE] O-4 の `live-signals.ts` (+ test) と `sdk-agent-session.ts` — `init` / `commands_changed` → `meter` (送るかの判定は値の全体、送ったときだけ基準を更新、`meter` の上限に掛けない)。`init.permissionMode` の扱い (O-4) は変えない。入力型の代入可能性と `McpStatusKey` の `Equal<…>`。SDK の import 文は 1 つ。テスト: 状態だけ変わった 2 回目の `init` が送られる、同じ長さの別のモデルが送られる、同じ内容は送られない、O-4 の権限モードの比較のテストが変わらず通る
- [ ] **FE-020** [FE] decoder の 2 種類の検証 (負例: 形の外れ・257 件・`status: '__proto__'`・型の違い)、稼働中のストアの `meters` の `initReport` / `commands` (後勝ち・`Map`・O-4 の保持の規則)
- [ ] **FE-021** [FE] タブの表 (`panel-tabs.ts`) と `PanelTabId` に `config`、`PanelTab.attention`、`ConfigTab`、畳んだ帯の印 (data-model §3)。テストは `RightPanel.tabs.test.tsx` の側 (`AppShell.test.tsx` に足さない)。テスト: US-2 の AC1〜AC7、サーバー名 `constructor` / `toString` / `hasOwnProperty` / `__proto__` の集計、`omitted` の表示
- [ ] **FE-022** [FE] 経路の通しのテスト (O-4 の `tests/meter/meter-through.test.tsx` の形) — `init` の fixture → `meter` → decoder → ストア → DOM。通さないフィールドの目印が DOM に 0 件、2 つのセッションで混ざらない、状態だけが変わった 2 回目の `init` が DOM まで届く (SC-002)

## US-3 — 認証とプラグインの出来事が分かる (P2)

- [ ] **BE-030** [BE] `sdk-agent-session.ts` の最上位の `auth_status` と `system` の `plugin_install` の分岐 (連番は closure)、O-4 の `live-signals.ts` / `system-event.ts` (+ test) — category `auth` / `plugin` と status `authenticating`、`HOOK_OUTCOMES` の照合を `Object.hasOwn` に。`output` / `error` を通さない。過去ログの変換に足さない (回帰テスト)
- [ ] **FE-030** [FE] `SystemEventRow` の `auth` / `plugin`。テスト: US-3 の AC1〜AC5

## 境界の検査

- [ ] **BE-040** [BE] `scripts/constitution/allowlists.mjs` の `QUERY_MUTATION_METHODS` に 11 のメソッド (spec FR-011 / AD-048 Decision 2)、`tests/rule-fixtures/sdk-query-mcp-control.ts.fixture` (`.setMcpServers(` / `.mcpServerStatus(`) と期待表。項目 16 が発火すること (SC-005)

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-012〜FR-015) — `docs/ui-coverage.md` を data-model §5 のとおりに (経路の列を含む)。項目 21 で割当先が O-5 の行が 0、O-10 が 4 行。roadmap に O-10 の行 (範囲・依存・domain (U-1)・2 つの ADR の義務と制約 (FR-013))、O-5 の行 (依存 O-4・題から Elicitation を外す)、O-8 の行の (c) の観測点の注記、system scope の記録に「項目 16 の P3 を正の形に」「項目 14 のすべての import 文・再 export・動的 import」と composer の 2 項目の持ち主 (spec「義務の扱い」)。`_overview.md` (Feature 帰属の表・帰属の判断根拠・Milestone の M3 の列)、ui charter (Related Specs・Open Questions の Tier C の答え・In scope の composer の持ち主)、session charter (`meter` の種類と未信頼の文字列の区分)、`docs/prompts.md` (O-10)、AD-047 に AD-048 への参照の訂正節 (spec FR-014。Q1 の回答による。本文は書き換えない)
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。V-1 / V-2。V-3 (実機) は利用者に残す
