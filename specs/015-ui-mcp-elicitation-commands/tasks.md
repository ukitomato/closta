# Tasks: MCP・プラグイン・コマンドの表示 (O-5)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents、`[FE]` renderer、`[SH]` 横断。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いは spec の FR / SC、名前の解き方・構成の許可リストと形の検査・タブ・行・対応表の書き換え先・文言は data-model、方式の理由は research。

**着手の条件**: **O-7 (013) と O-4 (014) がマージされ、AD-046 / AD-047 / AD-048 が accepted になり、spec の U-1〜U-5 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 → コード。BE-001 → BE / FE の他。SH-010 は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — MCP の tool の表示、セッションの構成、O-10 (Claude Code からの問いに答える UI)
- [ ] **SH-002** [SH] [P] element の照合 — registry の MCP の tool の呼び出しの element、MCP server panel を実名で照合 (本番の CSP の下で動くこと)。結果の正本は PR の説明
- [ ] **BE-001** [BE] `session-config.ts` (+ test。新設) と O-4 の `meter.ts` — `config` / `commands` の型、許可リスト (data-model §2)、形の検査の定数 (agents と decoder で共有)。テスト: 通さないフィールド (`cwd`・`path`・`error`・`apiKeySource`・`betas`・`capabilities`・`aliases`) に目印の値を入れて出力に 0 件、制御文字・双方向制御・長い名前・`mayCarrySecret`・件数の超過・`__proto__` / `constructor` の状態、`version` の形

## US-1 — MCP の tool の呼び出しが読める (P1)

- [ ] **FE-010** [FE] [P] `mcp-tool-name.ts` (+ test。新設) — data-model §1 の各行 (`mcp__s__t`・`__` を含む tool 名・分けられない名前・組み込みの 4 tool・MCP でない名前)
- [ ] **FE-011** [FE] `mcp-tool-call.aui.tsx` (新設) と `tool-registry.aui.tsx` — 振り分け (表の照合を `Object.hasOwn` に)、見出し・閉じた入力・結果・画像 / resource の印・エラー・切り詰め。`ApprovalCard.tsx` の見出しも同じ関数。テスト: US-1 の AC1〜AC5 (過去ログと実行中の fixture)、`constructor` / `toString` / `__proto__` の名前で ToolFallback、resource の `uri` の `mayCarrySecret`

## US-2 — セッションの構成が分かる (P1)

- [ ] **BE-020** [BE] `sdk-agent-session.ts` — `init` / `commands_changed` → `meter` (前回と同じなら送らない。closure)。`Equal<…>` で MCP の状態の値域を固定
- [ ] **FE-020** [FE] decoder の 2 種類の検証、稼働中のストアの `meters` の `config` / `commands` (O-4 の保持の規則)
- [ ] **FE-021** [FE] O-7 の右のペインのタブの表に `config` と `ConfigTab`、畳んだ帯の注意の印 (data-model §3)。テスト: US-2 の AC1〜AC5、`omitted` の表示
- [ ] **FE-022** [FE] 経路の通しのテスト — `init` の fixture → `meter` → decoder → ストア → DOM。通さないフィールドの目印が DOM に 0 件、2 つのセッションで混ざらない (SC-002)

## US-3 — 認証とプラグインの出来事が分かる (P2)

- [ ] **BE-030** [BE] O-4 の `live-system-rows.ts` / `system-event.ts` (+ test) — category `auth` / `plugin` と status (data-model §4)。`output` / `error` を通さない。過去ログの変換に足さない (回帰テスト)
- [ ] **FE-030** [FE] `SystemEventRow` の `auth` / `plugin`。テスト: US-3 の AC1〜AC3

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-009〜FR-012) — `docs/ui-coverage.md` を data-model §5 のとおりに。項目 21 で割当先が O-5 の行が 0、O-10 が 4 行。roadmap に O-10 の行 (範囲と ADR の義務)、O-5 の行、`_overview.md` (Feature 帰属の表・帰属の判断根拠)、ui charter (Related Specs・Open Questions の Tier C を閉じる)、session charter (`meter` の種類)、`docs/prompts.md` (O-10)
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。V-1 / V-2。V-3 (実機) は利用者に残す
