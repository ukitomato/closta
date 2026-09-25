# Research: transcript の基本表示 (R-3)

[plan.md](plan.md) Phase 0。設計判断の根拠を実測・公式ドキュメントで固める。
一次情報は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` と assistant-ui 公式 skill
(`.claude/skills/{primitives,runtime,markdown}/`)、および [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) / [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) / [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) / [AD-021](../../docs/decisions/0021-session-store-and-enumeration.md)。

## R-01 仮想化: `ViewportProvider` + `@tanstack/react-virtual`

**結論** (`.claude/skills/primitives/references/messages.md` §Virtualization / AD-033):
- 公式は「**マウント/更新がボトルネックのときだけ** `@tanstack/react-virtual` +
  `ThreadPrimitive.ViewportProvider` + `ThreadPrimitive.MessageByIndex`」を指示する
- 仮想スクローラは自前で scroll element を持つため `Viewport` ではなく `ViewportProvider` を使い、
  現行の auto-follow / measurement guard / run-start jump / `ScrollToBottom` を**その上で作り直す**
- 行は padding spacer 間の通常フローに置き `measureElement` で実測 → 測定済み高さが保たれジャンプしない
- R-3 は過去ログ (静的列) なので `MessageByIndex` で足りる。X-1 (末尾が伸びる) では `Unstable_MessageById` を再評価
- **両立**: 小規模スレッドでは仮想化の複雑性が回帰を生みうる (AD-033 但し書き)。閾値以下で非仮想パスに
  落とすかは実装時に測って決め、**小規模の非仮想パスにも既存スクロール挙動の回帰テストを付ける**

## R-02 Principle IX: main を本文データ経路から外す + 取得プロセスの env 分離

**問い**: 数 MB の `tool_result` を含む transcript を、main をブロックせず・env レースを起こさず renderer に届けるには。

**結論** (Constitution Principle IX / AD-031 Decision 2 / AD-023 / AD-021 §3 / AD-030 §3):

- **`JSON.parse` を避けるだけでは不十分** (design-gate platform-boundary/architecture 指摘)。
  utilityProcess の `parentPort` は **main** に繋がるため、`postMessage` した数 MB は main の V8 で
  **structured clone deserialize** され main を固める (AD-006 の実害)。「main を経由/中継」は誤り
- **正しい形**: main が `MessageChannelMain` を作り、port1 を取得プロセスへ (`child.postMessage(msg, [port1])`)、
  port2 を renderer へ (`webContents.postMessage(ch, null, [port2])`) transfer する。
  **本文は取得プロセス↔renderer 直通**で流れ、main は port ハンドルの橋渡しのみで payload に触れない。
  `getTranscript` invoke は status / port の受け渡し完了 / 軽量メタのみを返す
- **env レースの解消** (AD-021 §3 / AD-030 §3): R-2 の常駐プロセスは `CLAUDE_CONFIG_DIR` を
  **プロセス global の可変 env** に書き、直列 chain だけが安全性を担保している。本文を別チャネルで
  **並行**に流すと env を踏み合い別ディストロを読む。→ **transcript は target ごとに `CLAUDE_CONFIG_DIR` を
  起動時固定した専用 (短命) プロセス**で取得する (AD-021 の子プロセス方式に回帰)。共有可変 env を持たない
- **変換の実行場所**: 取得プロセス側で `domain` の純粋変換 (`SessionMessage[]`→`ThreadMessageLike[]`) を走らせ、
  結果 DTO を port に流す。main も renderer 描画スレッドも重い変換で塞がない
- `MessagePortMain` は transfer で受け取り、薄い adapter に閉じる (`electron` を import しなければ lint は緑。Principle VII)

**検証の正直化** (AD-031 Consequences): 「main で評価されない」を依存グラフで自動証明する検査は**現状存在しない**。
SC-007 は「port transfer 構造 (main が本文を受け取らない) + 手動レビュー」で担保し、**AD-031 が名指す
composition-root 到達集合検査は未構築のまま**とする。**その持ち主 feature を `docs/roadmap.md` に登録する**
(AD-031 が R-2 で確立した「持ち主のいない延期を残さない」規範)。SH-062 の Constitution PATCH は
この未構築を隠さず「structured clone 経路に移した。到達集合検査は依然未構築」と書く。

**トレードオフ**: 専用プロセスの spawn は AD-030 が計測した ~2.7s の起動費がかかる。transcript は
user 選択ごとの 1 回であり hot loop ではないため許容する (列挙の常駐化とは要件が違う)。実測を quickstart に記録。

## R-03 SDK 署名・型の裏取り (H-005)

**結論**: `sdk.d.ts` 0.3.270 を直読して確認 ([data-model.md](data-model.md) §1 に転記)。
- `getSessionMessages(sessionId, { dir, limit, offset, includeSystemMessages, sessionStore }): Promise<SessionMessage[]>`
- `dir` は **project dir であって config dir ではない** — plan の AD-021 帰属を訂正 (AD-021 は listSessions を立証)
- `sessionStore?` は **@alpha** — 本 feature は渡さない (ローカル FS 読み)。更新時の破壊的変更リスクを明記
- `SessionMessage = { type, uuid, session_id, message: unknown, parent_tool_use_id, parent_agent_id }`
- **確認済みバージョンを data-model §1 に刻む**。SDK 更新時に差分を見る

## R-04 markdown レンダラ: `MarkdownText` 継続 / Streamdown は X-1

**結論** (`.claude/skills/markdown/references/{markdown-text,streamdown}.md`):
- `MarkdownTextPrimitive` (現状) は remark-gfm + `smooth` + コードハイライトを持ち R-1 で配線済み。過去ログ表示に十分
- `StreamdownTextPrimitive` は block-aware streaming / **未完 markdown 修復** / `@streamdown/cjk` を持つが、
  修復が効くのは live ストリーム (X-1)。R-3 は `MarkdownText` を継続し Streamdown を X-1 で評価する
- **ただし XSS 境界は R-3 で固める** (§R-06) — 現行 `MarkdownText` が生 HTML を描画しない前提を契約に明記し、
  URL allowlist を課す (rehype-raw を足さない)

## R-05 tool_use ↔ tool_result の対応づけ

[data-model.md](data-model.md) §4 の規則。id で対応づけ位置に依存しない。孤児も欠落させず fallback。

## R-06 XSS / 本文サニタイザ (C-003 / H-001 の解消)

- **本文サニタイザ** ([data-model.md](data-model.md) §6): R-2 の `normalize` を本文に流用しない。
  改行/タブ保持・bidi/C1/危険 C0 除去・本文相応の上限・tool_result 切り詰め
- **XSS 境界** ([data-model.md](data-model.md) §7): 生 HTML 非描画・URL allowlist・CSP を最終防御線
- negative test (改行保持 / XSS payload / sessionId traversal) を tasks に課す (SC-005 / SC-006 / SC-008)

## R-07 取得単位: 全件か段階か

`getSessionMessages` は `limit` / `offset` を持つ。基本は全件取得。仮想化 (R-01) が描画コストを吸収するため
取得段階化は描画と独立に判断。専用プロセスの spawn 費 (R-02) と合わせ実測で決める。

## R-08 subagent / compact boundary

- subagent のネスト表示は R-4。R-3 は主セッションを対象とし混じる場合は fallback フラット (data-model §4)
- compact boundary は `includeSystemMessages: true` で取得し最小の区切り表示 (data-model §3 / FR-018)。
  返りうる system サブ種別を実名で割り当てる (data-model §3 の義務)

## 未解決 (実装で decide)

- 仮想化の非仮想パス閾値 (R-01) — 実測
- 取得の段階化の要否と専用プロセス spawn 費の許容範囲 (R-02/R-07) — 実測 (quickstart に記録)
- composition-root 到達集合検査の実装は**本 feature では作らない** — 持ち主 feature を roadmap に登録 (R-02)
