# Implementation Plan: 計量と制限の表示 (O-4)

**Branch**: `014-ui-metering-and-limits` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-6 と AD-047 は 2026-10-05 に利用者が承認した。O-7 (PR #13)・O-3 (PR #14) がマージされた main の上に作る。2026-10-04 の版の plan は O-7 の設計段階の上で書いたので、本版で作り直した (行番号はすべて O-3 の後のもの。research R-01)。

## Summary

セッションスレッドで SDK の `result` / `assistant` / `rate_limit_event` / `system` (`init` の `permissionMode` だけ / `status` / `api_retry` / `thinking_tokens` / `task_progress`) / `tool_progress` を読み、失敗の理由のキー・`meter`・システムイベントの行に変えて renderer に届ける。renderer は稼働中のストアにセッションごとの最新の計量を持ち、シェルの中央のヘッダ (目盛り・Quota banner・権限モードの警告の帯)・右のペインの「使用量」のタブ・「概要」の現在の権限モード・transcript の行・tool の見出し・思考の印・task の行に出す。あわせて、O-7 と system-scope から預かった 4 つの義務 (タブのキーボード操作とテストの分割・ストアと行の切り出し・消えるボタンのフォーカス・Provider の表記) を閉じる。

- 失敗の理由は純関数 `classifyResultFailure` (data-model §1)。`classifyResult` (完了か失敗か) は変えない
- 計量は `SessionEvent` の `meter` (data-model §2)。許可リストのフィールドだけを読み、数・真偽・列挙・モデルの id・形を検証した tool の id だけを運ぶ。制御要求は呼ばない (AD-047 Decision 4)
- SDK のメッセージの分岐・行と計量の組み立て・間引きは SDK 非依存の `live-signals.ts` に置き、`sdk-agent-session.ts` は呼ぶだけ (research R-14)
- task の進み具合は既存の task の行の更新で、種類を消さないように `mergeSystemEvent` に合成の規則を 1 つ足す (data-model §3 / research R-06)
- ターン数はセッションスレッドが result を数え、拒否の件数は 2 行 (聞かれずに / SDK の記録) で出す (research R-08)

## Technical Context

- **Language/Version**: TypeScript (strict)。Electron 39 / React 19 ([docs/discovery.md](../../docs/discovery.md))
- **Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (読むメッセージの分岐を足すだけ。呼び出しは増やさない)、assistant-ui (`@assistant-ui/react` と registry の element)、zustand 5。**新しい npm の依存を足さない** (registry の element は source のコピー)
- **Storage**: なし (計量は renderer のメモリだけ。永続化しない)
- **Testing**: Vitest 5 (node / renderer の 2 project。component テストは vitest-axe)。偽の時計で間引きを測る。E2E は計量を流さないので計測経路にしない (既存の E2E は通す)
- **Target Platform**: Windows 11 の Electron (本番の CSP は `style-src 'self'`)
- **Project Type**: desktop-app
- **targets**: both (agents / domain と renderer。main と preload は変えない)
- **Performance Goals**: 間引きの対象は鍵 (tool・task・思考) ごとに 1 秒に 1 件以下、セッションあたり 1 秒に 20 件以下 (SC-004)。計量の更新でストアの `sessions` の参照を変えず、表示中の Thread を描き直さない (data-model §2)。tool の経過時間は tool ごとに購読する
- **Constraints**: 実行時に `<style>` を足さない (CSP)。会話由来の文字列・エラー文・パスを `meter` に入れない。`src/agents/` に昇格値の綴りを置かない (項目 16)。main / preload / IPC の差分 0 (SC-006)
- **Scale/Scope**: 稼働中は最大 10 本。間引きで同時に追う tool / task の鍵は 64 まで (休んだ鍵と取り消した鍵は外す。data-model §2)

### レイヤ

- **domain**
  - `src/domain/session/agent-session.ts` — `LaunchFailureReason` +8、`SessionEvent` の `meter`、`SESSION_EVENT_KINDS`、コメントの件数
  - `src/domain/session/meter.ts` (新設) — `MeterUpdate` と列挙の型、検証と復号 (`decodeMeterUpdate`)、SDK の値の正規化 (`toPermissionModeKey` / `toAssistantErrorKey` / `toRateLimit*` / 割合と時刻 / `toModelMeters` / `contextTokensOf`)。昇格値の綴りはここ
  - `src/domain/session/transcript-dto.ts` — category +3・status +3
  - `src/domain/session/system-event.ts` — `isTerminalSystemEventStatus` に `changed`、`mergeSystemEvent` の task の進み具合の合成、`detail` の符号化と復号 (`encodeRetryDetail` / `decodeRetryDetail` / `encodeTaskProgress` / `splitTaskDetail`)
- **agents**
  - `src/agents/session-core.ts` — `classifyResultFailure` (data-model §1)。コメントの根拠を「X-1 FR-020 / US-4 AC6」に直す
  - `src/agents/meter-throttle.ts` (新設) — 鍵ごと・セッションあたりの間引き、取り消し、後始末。時計と timer は注入
  - `src/agents/live-signals.ts` (新設) — `createLiveSignals({ launchPermissionMode, emit, clock })`。`onAssistant` / `onUser` / `onResult` (失敗の理由を返す) / `onSystem` / `onRateLimit` / `onToolProgress` / `dispose`。closure の状態は data-model §2
  - `src/agents/sdk-agent-session.ts` — switch の各分岐で `live-signals` を呼ぶ。`rate_limit_event` / `tool_progress` の分岐を足す。`fail('provider-error')` (`:536`) を `onResult` の返す理由に替える。`finish()` の最初で `dispose()`。`Equal<…>` で列挙の値域を SDK と固定
- **renderer**
  - 経路: `features/session/session-event-decoder.ts` (`meter`)、`running-session-store.ts` (`meters` の枝と `close()`)、`running-session-types.ts` (`SessionMeters`)、`useSessionMeters.ts` (新設。selector で 1 セッションの値を読む)、`running-sessions-view.ts` / `RunningSessionsProvider.tsx` (`runtimeAutoMode(runtimeId)`)
  - 切り出し (FR-018): `running-session-monitor.ts` (新設)、`RunningSessionRow.tsx` (新設)、`running-session-types.ts` / `labels.ts` / `session-view.ts` / `SessionAttentionAnnouncer.tsx`
  - session の表示: `labels.ts` (失敗の文言・短い理由・`isReloginFailure`・Provider)、`LivePane.tsx` (実行中の進み具合の context の供給・`data-live-pane`・FR-019)、`ApprovalCard.tsx` (変えないか、`onDecision` の呼び出し側で移す)、`focus-handoff.ts` (新設)
  - chat: `transcript-context.ts` (実行中の進み具合の context と、tool ごと・思考の購読の hook)、`labels.ts` (category・status・`detail`・権限モードの名前・思考・経過時間)
  - elements: `thread.aui.tsx` (`SystemEventRow` の 3 category・task の進み具合・思考の印 (2 つの footer)・composer の入力の印)、`tool-result-marks.tsx` (経過時間) と呼び出し側 6 か所 (`toolCallId` と結果待ちを渡す)
  - shell: `panel-tabs.ts` (`usage`)、`RightPanel.tsx` (FR-017)、`UsageTab.tsx` (新設)、`CenterHeader.tsx` (稼働中だけの `live` の props)、`ContextCostMeter.tsx` (新設)、`CenterBanners.tsx` (新設。権限モードの警告の帯と Quota banner)、`CenterPane.tsx` (`RunningCenter` が `live` を渡す)、`OverviewTab.tsx` (現在の権限モード)、`labels.ts`
  - `stores/ui.ts` (`PanelTabId` に `usage`)、`test-support/app-shell-harness.tsx` (新設。FR-017)
- **tests**: `tests/meter/meter-through.test.tsx` (新設。renderer の project で fixture → `live-signals` → port → decoder → ストア → DOM。SC-002)

### 既存の起点

research R-01 (コードの事実) と R-02 (SDK の型の事実) に行番号つきで書いた (2026-10-07 に読んだ)。

## Constitution Check

`.specify/memory/constitution.md` v1.4.0。

| Principle | 判定 | 根拠 |
|---|---|---|
| **I** (パス API) | N/A | パスを扱わない |
| **II** (プラットフォーム分岐) | N/A | 分岐を足さない |
| **III** (権限モード) | ✅ (U-6。2026-10-05 に承認) | 権限モードの選択肢は変えない (起動の設定・プリセットに書き戻さない)。安全 3 値の外のモードを観測したら原因を断定しない警告の帯 (AD-041 の「昇格経路 0 件」の逸脱の信号)。強制はしない (持ち主は I-3)。判定は domain の `isSafePermissionMode`。観測は `status` と各ターンの `init` の両方 (data-model §2)。隔離の文言はランタイムの表示用の `autoModeStatus` から導き (`autoModeAllowed` を表示に使わない。DTO の不変条件)、`unavailable` だけを「隔離なし」、`allowed` / `undetermined` は「このセッションの隔離をアプリは確かめていない」とする (セッションの隔離状態ではない暫定の文言。data-model §4)。`src/agents/` に昇格値の綴りを置かず、項目 16 に例外を足さない |
| **IV** (SDK 経由) | ✅ | 新しい SDK の呼び出しなし (`AGENT_SDK_ALLOWED_CALLS` の差分 0)。query の options のキー (AD-041 (g)) の差分 0。既に受けているメッセージの分岐を足すだけで、stream の自前パースをしない |
| **V** (資格情報を永続化しない) | ✅ | 永続化なし。`errors`・`compact_error`・`api_retry` の `error`・task の要約と説明・`permission_denials` の入力を運ばない (data-model §2 の許可リスト)。`modelId` は domain の `isValidModelId` と追加の 3 条件 (`//`・scheme の無い userinfo の形・`mayCarrySecret`) で落とす (data-model §2) |
| **VI** (永続環境を変えない) | N/A | 子プロセス・環境を変えない |
| **VII** (supervisor の Electron 非依存) | ✅ | agents の追加は SDK も Electron も import しない純粋なモジュール (`meter-throttle` / `live-signals`) と分岐だけ |
| **VIII** (日本語環境) | ✅ | 新しい文言は `labels.ts`。数と時刻の書式は `ja-JP`。composer の入力の振る舞いは変えない (フォーカスの行き先にするだけ。印の属性を足す)。全角の長い文言は 1 行に切り詰め、全文を `title` で読める |
| IX (main をブロックしない) | ✅ | `meter` は port を通り main を経由しない。状態通知 (`SessionStatusUpdate`) のフィールドの差分 0。間引きで renderer の負荷を上げない (SC-004) |
| X (正本は Claude Code) | ✅ | 表示は SDK のメッセージから導くだけ。計量は永続化しない |
| XI (観測可能な垂直スライス) | ✅ | 各 US は component テストで観測でき、経路は通しのテスト (SC-002)、実機の目視は quickstart V-4 |
| XII (ui-coverage) | ✅ | 対応表の `後続: O-4` の 10 行・F 節の 5 行 (と採った element の行)・D 節に `meter` の行を同じ PR で直す (FR-014) |
| XIII (element 優先) | ✅ | Cost meter / Quota banner / Context display / Thinking indicator を registry で先に確かめる。Context breakdown と Job progress は使わない理由を F 節に書く (research R-09) |
| XIV (glossary) | ✅ | 用語を先に glossary に足す。権限モードの表示名は 1 つの表 (research R-15)。Provider の表記を揃える (research R-13) |
| XV (多言語) | ✅ | 新しい文言は各 `labels.ts` (data-model §5)。コンポーネントへの直書きを増やさない |

**Domain charter の整合**: ui の In scope に「observability 系の表示」と「右のペインに足すタブ (O-4〜O-6)」(ui charter:75) がある。session のコードに手を入れる根拠は 2 つに分かれる。(1) U-1 (2026-10-05 承認) — session の契約 (失敗の理由のキー・`SessionEvent` の種類) と session の操作 UI (監視ビューの行の短い理由と再ログインの導線・稼働中のストアの `meters`)。稼働中のセッションを表示するための小さな読み取りの追加 2 つ (session の view の `RunningSessionsView.runtimeAutoMode(runtimeId)` (FE-040) と、`session/labels.ts` の `PERMISSION_MODE_LABELS` を chat の `PERMISSION_MODE_NAMES` から取る形 (research R-15)) も、U-1 の「session の操作 UI」の範囲と読む (2026-10-08 に利用者が決めた。design-gate R3 MG-09)。(2) spec「義務の扱い」(roadmap の system-scope の持ち主の記録) — FR-018 の行と派生値の切り出しと、FR-019 の消えるボタンのフォーカス (`focus-handoff.ts`・`LivePane` / `RunningSessionRow` の押下の処理)。U-1 の範囲は session charter と AD-047 に記録する (FR-016)。シェルは session のストアを読むだけで、ui charter の「面の状態」の例外 (シェルが session のストアの操作を呼ぶ 2 つ・session が面の状態を書く 2 つ) は増やさない。

**Phase 1 の後の見直し**: data-model と research の決定 (`live-signals` への分岐の集約・task の `detail` の合成・思考の印の置き場・拒否の 2 行・フォーカスを先に移す形) は上の表の判定を変えない。Complexity Tracking に書く違反は無い。

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI、transcript の表示、tool 出力の専用表示 (Reasoning を含む)、composer、`docs/ui-coverage.md` の維持、transcript の情報密度、Thread 検索・conversation map・**observability 系の表示**、アプリのシェル (O-7)。シェルの部品 (中央のヘッダ・右のペインのタブ) が SDK の emit を表示するときは、その行の割当にその部品を書き、表示を変える PR で対応表を直す (ui charter:73-76)。他 domain の操作 UI の中身は各 domain
- 業務ルール: element を優先し独自のトークンを増やさない (Principle XIII)、emit される情報に未表示を残さない (Principle XII)、日本語で破綻しない (Principle VIII)、長大スレッドは仮想化しアンカリングを壊さない
- 面の状態 (ui charter の Cross-domain dependencies): focus はシェル (`useShellFocus`) だけが書く。本 feature はタブの選択 (`setPanelTab`) をシェルの中で書くだけで、例外を足さない
- 関わる他 domain: `session` (失敗の理由のキー・`SessionEvent`・監視ビューの行・稼働中のストアの持ち主。U-1)、`isolation` (権限モードの可視化のポリシーとゲートの持ち主。本 feature は domain の `isSafePermissionMode` とランタイムの `autoModeStatus` で警告の帯を出すだけで、ポリシーと強制は I-3。帯の隔離の文言はセッションの隔離状態ではない暫定のもので、I-2 の隔離バッジが置き換える)

### Related ADRs

- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — 計量 (`meter`) と失敗の理由のキーを session の契約に足す: **accepted** (本 feature で起こし、2026-10-05 に承認) — 失敗の理由のキー (Decision 1)・`meter` (2)・行の経路 (3)・制御要求を呼ばない (4)・昇格を観測したとき (5)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェルを 3 面にする: accepted (O-7) — 置き場所の語 (Decision 6)。O-4〜O-6 の表示の候補は右のペインのタブになりうる (:43)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当と M3 の完了の条件: accepted — Tier A の `表示不要`・Hook / Background task の状態を保持しない (§6)
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を i18n リソース化しない: accepted — 文言は `labels.ts`
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 本文は port で main を経由しない・調停役スレッドは解釈しない: accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — 権限モードは安全 3 値・query の options のキーの固定 (g): accepted (変えない)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — X-1 のライブストリーム (FR-020 / US-4 AC6): accepted。本 feature は FR-020 の `provider-error` の範囲を読み替える (AD-047)
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool 表示: accepted — tool の見出しの印を共有する 6 つの表示
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) / [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — SDK の emit の棚卸しと element の実在確認: accepted — F 節の照合の相手
- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) §7 — CSP 基線: accepted — 実行時に `<style>` を足さない

### Glossary excerpt

- **FailureReason (起動系)**: セッション起動 + 実行時失敗の理由キー (X-1)。10 種。参照キーで訳出は `ui`。本 feature で「起動とターンの失敗」に改め、18 種にする (FR-016)
- **System event row (システムイベントの行)**: transcript の中で Hook / Background task を 1 つにつき 1 行で示す表示 (O-2)。同じ id の後続は `mergeSystemEvent` で合成し、行の無い id への更新は捨てる。本 feature で category (API の再試行・コンテキストの圧縮・権限モード) と task の進み具合を足す
- **Shell (シェル)**: サイドバー・中央のヘッダ・中央の本体・右のペインのタブ・設定のダイアログ。後続 feature は表示の置き場所をこの語で書く (AD-046 Decision 6)
- **Approval card**: `canUseTool` の応答 UI。本アプリの心臓部 (FR-019 の行き先の 1 つ)
- **Provider**: 認証方式・設定ディレクトリ・モデルカタログを含む登録可能なエンティティ。日本語表記の行が無い (research R-13 で足す)
- **Running session list (稼働中セッション一覧 / 監視ビュー)**: サイドバーの稼働中の区画に置く session の操作 UI。行の形は session が持つ
- 新しく足す (FR-016): 計量 (meter)、Quota banner、コンテキストの使用量の推定、失敗の理由の各キー、権限モードの警告の帯

## 上流からの申し送り

実行したもの (2026-10-07。Grep ツール (ripgrep) で実行。`node_modules` / `out` を除く):

```
# 1) spec_id
rg -n "014-ui-metering-and-limits" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
    → 12 件。014 自身 10 件 (旧版の plan と gate の報告・spec)、ほか 2 件 (AD-047:15 / 016 の旧版の
      platform-boundary-reviewer.design-gate.round2.md:200)
# 2) feature ID
rg -n "\bO-4\b"
    → 142 件 / 51 ファイル
       014 自身: 46 件 / 11 ファイル (表の #27)
       残り 96 件 / 40 ファイル: docs 32 (8)・.specify 4 (2)・.claude 1・e2e 1・tests 9・src 5 (5)・
                                specs の 004 / 011 / 012 / 013 44 (22)
# 3) 新設するモジュール名 (014 自身を除く)
rg -n "meter-throttle|live-signals|running-session-monitor|RunningSessionRow|UsageTab|CenterBanners|ContextCostMeter|
       MeterUpdate|classifyResultFailure|focus-handoff|PermissionModeKey|LiveProgress|useSessionMeters|SessionMeters|
       PERMISSION_MODE_NAMES|app-shell-harness"
    → 8 ファイル。roadmap:242,246 と 010 tasks:34 / 010 convention-reviewer.code-gate.md:44 (切り出しの提案の名前)、
      AD-047:34 (classifyResultFailure)、016 の旧版の gate の報告 2 ファイル (MeterUpdate)、012 の .code-gate.diff /
      .pr-gate.diff (roadmap の写し)。src のコードと名前は衝突しない
# 4) 実名リスト方式の規則 (新しいモジュールに追加の義務を課すもの)
eslint.config.mjs:557-615                   components/ の手書きの element の strictness を戻すファイルの一覧
.specify/spec-gate/reviewers.yml:42-64,92-114  a11y / ux の auto_invoke_patterns (手書きの element は実名で足す)
.specify/spec-gate/reviewers.yml:173-199    ui-coverage-reviewer の auto_invoke_patterns (SDK のメッセージを変換するモジュール)
scripts/constitution/allowlists.mjs:480-504 WSL_FREE_DIRECTORIES (src/agents/ と src/domain/session/ をディレクトリで含む)
scripts/constitution/allowlists.mjs:269-277 COORDINATOR_THREAD_MODULE_PATTERN (src/agents/ の supervisor* は調停役スレッド)
scripts/constitution/allowlists.mjs:363,435 AGENT_SDK_IMPORT_DIRECTORIES / PERMISSION_MODE_ESCALATION_VALUES (項目 16)
.dependency-cruiser.js:292-299             worker-threads-only-from-entry (worker_threads は 2 ファイルだけ)
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:346 (O-4 の行) | 右のペインのタブの候補 (Context display・Cost meter)・タブのテストを `AppShell.test.tsx` に足さず `test-support/` に分ける・2 つ目のタブで矢印キーと roving tabindex・対応表の割当 (失敗の理由は `ResultTermination` を広げる・X-1 FR-030 を保つ) | **受ける** — US-1〜US-4 / FR-008 / FR-017。差は roadmap の字面に書く (FR-016): `ResultTermination` は広げず理由のキーを足した・`errors` は運ばない・FR-030 は FR-020 の誤り・Context display は中央のヘッダの目盛り、Cost meter は使用量のタブ |
| 2 | roadmap:240-261 | system-scope「`running-session-store.ts` の切り出しと、行の状態の型の置き場」(1)〜(3)。持ち主 = store に派生値を足すか、監視ビューの行を触る次の feature | **受ける** — FR-018 (data-model §7 / research R-11)。字面に「O-4 が持った」と切り出した後の行数 (O-7・O-3 と同じ書き方) を書く |
| 3 | roadmap:205-217 | system-scope O-7 pr-gate R2 (2) 押したボタンが自分ごと消える。持ち主 = 監視ビューの行を触る次の feature | **受ける** — FR-019 (data-model §8 / research R-10)。字面に直し方 (各部品で先に移す) を書く |
| 4 | roadmap:218-221 | system-scope O-7 pr-gate R2 (3)「Provider」と「プロバイダ」。持ち主 = provider の文言を次に触る feature | **受ける** — FR-016 (research R-13)。字面に結論を書く |
| 5 | roadmap:173-179 / :196-204 / :233-239 | `runtime-store.ts` の single-flight・composer のフォーカスの奪取・直近の活動の不可視文字 | **該当なし** — spec「義務の扱い」の最終行のとおり (変えないもの) |
| 6 | roadmap:349 (O-8 の (c)) | 観測点 `receivedMessages` の基準の変化を並べる | **受ける (注記)** — `meter` は数えない、本 feature の新しい行は数える (data-model §2) を O-8 の (c) に足す |
| 7 | roadmap:348 (O-6 の行) / ui-coverage:51 (`compact_boundary`) | コンパクション境界の専用 element (実行中を含む) | **送る** — O-4 の `compaction` の行は進み具合、O-6 は区切り。統合するか並べるかの判断を O-6 の行に書く (data-model §3) |
| 8 | roadmap:373 (I-3 の行) / AD-041 (a) | 権限モードのゲート・昇格経路 0 件 | **送る** — 昇格を観測したときの強制の要否を I-3 の行に書く (U-6 / AD-047 Decision 5) |
| 9 | roadmap:134 / e2e/sidebar-screenshot.spec.ts:19 / 012 spec:93,312 / 012 research:123 | 全画面の基準画像を撮らない理由 (O-4〜O-6 が右のペインと中央のヘッダを変える) | **該当なし** — O-4 は基準画像を取り直さない。サイドバー (FR-018 の切り出しは見た目を変えない) と composer の shell (入力の印の属性だけ) の見た目を変えない |
| 10 | roadmap:352 | O-4〜O-6 は O-2 で足した | **該当なし** — 経緯の記録 |
| 11 | ui-coverage:48,52,53,62,67,69,77 | A 節の 7 行 | **受ける** — `実装済み` (FR-014)。`result` の備考に「`errors` は出さない (U-5)」「`num_turns` (1 ターンの往復の数) は出さない」「`permission_denials` は件数」 |
| 12 | ui-coverage:195,196,198 | E 節の 3 行 | **受ける** — `表示不要` (U-3)。Tier A の `get_context_usage` の備考に推定で実装済み・カテゴリ別の内訳は出さない・AD-047 Decision 4 |
| 13 | ui-coverage:261,262,264,288,315 (と :340 Thinking indicator・:175 D 節 launch-failure) | F 節の 5 行と、採った element の行、D 節 | **受ける** — 使い道を本 feature の表示に。Context breakdown / Job progress は `未使用` と理由 (research R-09)。D 節に `meter` の行を足し (`SessionEvent` の種類と D 節の行を 1:1 に保つ)、launch-failure の備考に理由のキーが 18 になったことを書く |
| 14 | constitution:57 | 項目 21 の件数 (O-4 10) | **該当なし** — Sync Impact Report の記録。数は検査の出力が正本で、本 feature は Constitution を改めない |
| 15 | prompts.md:224 | Cost meter / Quota banner / Context display → O-4 | **受ける** — 範囲のとおり |
| 16 | `_overview.md`:64,100 | O-4 の範囲と domain `ui` | **受ける** — 範囲は変えない。帰属の判断根拠に「O-4 は session の契約の拡張を伴う (U-1 / AD-047)」を 1 行足す |
| 17 | ui charter:75,216,227 | 右のペインのタブの割当の書き方・O-4 が本 domain に属する | **受ける** — Related Specs に O-4。:72 の「プロバイダ」を Provider に |
| 18 | AD-046:43 | O-4〜O-6 の表示の候補は右のペインのタブになりうる。各 feature の design で決める | **受ける** — Cost meter は使用量のタブ、Context display は中央のヘッダの目盛り (右のペインを畳んでいても見える。US-3 AC2)。AD-046 (accepted) は変えない |
| 19 | AD-044:19,103 / AD-047:15,24,55 | 後続 feature の割当・本 feature の ADR | **該当なし** — 記録のとおり |
| 20 | 005 spec:181,207,341-344 / 005 data-model:156 / `sdk-agent-session.ts:529` / `session-core.ts:324,333` / `session/labels.ts:80` | クレジット不足・rate limit などは `provider-error`。コメントの根拠「V-11 / FR-030」 | **読み替える** — AD-047 の「読み替える箇所」。005 の正本に AD-047 への参照を置く。コードのコメントを「X-1 FR-020 / US-4 AC6」に直す |
| 21 | src: `stores/ui.ts:25` / `panel-tabs.ts:9` / `RightPanel.tsx:22-23` / `OverviewTab.tsx:82` / `shell/labels.ts:80` | 後続のタブ・矢印キーの義務・実行中の権限モードの変化は O-4 | **受ける** — `PanelTabId` に `usage`。コメントを済んだ形に直す |
| 22 | 013 data-model:134 / 013 spec:31,33,124,219,259 / 013 research:11 / 013 plan:92 / 013 tasks:75 | 「起動時の」見出しと実行中の変化は O-4 (`status`)・右のペインのタブの候補 | **受ける** — FR-010 (「現在の権限モード」の行)・FR-008。013 は変えない |
| 23 | 013 code-gate.md:46 / 013 convention-reviewer.code-gate.md:133 / :66 | タブのテストの分割 (M-008) / `LaunchPanel` の名前 | **受ける** (:46 / :133) — FR-017 (research R-12)。:66 は **該当なし** (シェルの部品の名前で、本 feature は触れない) |
| 24 | 012 architecture-reviewer.design-gate.md:252 | 後続が中央のヘッダに表示を足すときの、検索のバーとの帰属 | **受ける** — 帯はヘッダの行と検索のバーの間に置き、`CenterHeader` が並びを持つ (data-model §4) |
| 25 | 012 architecture-reviewer.pr-gate.md:129,177 / 012 po-reviewer.pr-gate.md:195 | 基準画像の承認の扱い・面の状態の例外の数・稼働中の区画の上限 | **該当なし** — 基準画像を取り直さない (#9)。面の状態の例外を増やさない (Domain charter の整合)。サイドバーの区画の高さを変えない |
| 26 | 011 の spec・plan・research・tasks・quickstart-results・gate の報告 / 004 data-model:48 / .claude/agents/ui-coverage-reviewer.md:29 / .specify/spec-gate/reviewers.yml:52,102,194 / tests/ui-coverage/coverage.test.ts (9) | O-4 の範囲を決めた経緯・reviewer の参照・合成の fixture | **該当なし** — 経緯の記録と合成の fixture。ただし reviewers.yml の注記「新しい手書きの element を足したらここにも足す」は「機械強制の変更」で受ける |
| 27 | 014 自身 (46 件) / spec_id の 10 件 | 旧版の plan・research・data-model・quickstart・tasks と design-gate の報告 | **置き換え** — 本 plan・research・data-model・quickstart で置き換えた。旧版の tasks.md と design-gate の成果物は /cl-tasks と /cl-design-gate が作り直す |
| 28 | 016 の旧版の gate の報告 (spec_id 1 件・`MeterUpdate` 2 ファイル) | O-6 の旧版の design は O-4 の `MeterUpdate` に `retraction` を足し、`close()` での後始末に O-4 の `meters` を引く | **該当なし** (別ブランチの O-6 の旧版。roadmap の記録では O-6 は main に載せ直す) — `MeterUpdate` を判別子の union にし、decoder は知らない `type` を捨てる (data-model §2)。`close()` の削除に `meters` を入れる |
| 29 | (grep 3) roadmap:242,246 / 010 tasks:34 / 010 convention-reviewer.code-gate.md:44 / AD-047:34 | 切り出しの名前 (`running-session-monitor.ts` / `RunningSessionRow.tsx`)・`classifyResultFailure` | **受ける** — 同じ名前で作る |
| 30 | (grep 4) 実名リスト | 手を入れる element・SDK のメッセージを変換する新しい domain のモジュール・新しい agents のモジュール | **受ける** — 「機械強制の変更」。`src/agents/` と `src/domain/session/` はディレクトリで `WSL_FREE_DIRECTORIES` に入るので足すものは無い。新しい agents のモジュールは `supervisor` で始めず、`worker_threads` を import しない |

**spec の書き足し (本 plan で)**: FR-018 の (2) は `announcements` の戻り値を変えるので、その単体だけは書き換えずに通せない。FR-018 と SC-007 の「既存のテストを書き換えずに通る」に、この例外を書き足した (research R-11)。

## 実装方針

### 順序

1. **FR-018 の切り出し** (振る舞いを変えないコミット。`meters` より前)。既存のテストを流して緑を確かめる
2. **domain** (型・検証・合成の規則・固定テスト)
3. **agents** (`classifyResultFailure` → `meter-throttle` → `live-signals` → `sdk-agent-session` の配線)
4. **renderer の経路** (decoder → ストアの `meters` → `useSessionMeters` → 通しのテスト)
5. **registry の照合** (research R-09。採るかで以降の部品の作り方が決まるので、表示の最初に行う)
6. **表示** (失敗の文言 → 中央のヘッダ → 使用量のタブと FR-017 → 概要 → transcript の行 → tool と思考 → FR-019 → Provider の表記)
7. **記録** (対応表 → glossary → charter → roadmap → 005 → `_overview.md` → prompts)

### 失敗の理由 (US-1。data-model §1)

`classifyResultFailure` を `session-core.ts` に足し、表の各行の fixture で単体を書く (SC-001)。`live-signals` の `onResult` が `lastAssistantError` と result から理由を返し、`sdk-agent-session.ts` の `case 'fail'` がその理由で `fail()` する。`resultAction` は変えない。renderer は全文・短い理由 (`Record` なので足し忘れは tsc が落とす)・`isReloginFailure` を直す。監視ビューの行の短い理由と読み上げは、切り出した後の `RunningSessionRow.tsx` が同じ表から引く。

### 計量の経路 (US-2〜US-4。data-model §2)

- domain の `meter.ts` に検証と正規化を置き、agents の組み立てと renderer の decoder が同じ関数を使う
- `live-signals.ts` は data-model §2 の closure の状態を持ち、§2 の許可リストのフィールドだけを読む。`emit` は `sdk-agent-session.ts` の既存の `emit` (文字列化して調停役スレッドへ) を注入する。間引きは `meter-throttle.ts` に任せ、`finish()` の最初で `dispose()`
- decoder の `case 'meter'` は `decodeMeterUpdate` を通し、外れたら捨てる
- ストアは `meters` の枝を `patch()` を通さずに書く (data-model §2「renderer の保持」)。`close()` で消す
- 表示の部品は `useSessionMeters(sessionId, selector)` で必要な値だけを選ぶ

### 行の組み立て (data-model §3)

`live-signals` が再試行・圧縮・権限モードの行と task の進み具合の更新を作り、既存の `message` の経路で送る。`detail` の符号化は domain の関数。`mergeSystemEvent` に task の進み具合の合成を足し、ストアの合成 (`running-session-store.ts:129-140`) は変えない。`SystemEventRow` は category ごとにアイコンと `detail` の描き方を分け、task の行は `splitTaskDetail` で種類と進み具合を並べる。

### 中央のヘッダ (US-2 / US-3 / US-4 AC1a。data-model §4)

`CenterHeader` に稼働中だけの `live` の props (`sessionId`・`runtimeId`・起動の設定のモデル)を足し、行の右に `ContextCostMeter`、行と検索のバーの間に `CenterBanners` (権限モードの警告の帯 → Quota banner) を描く。過去の会話は `live` を渡さないので何も出ない (稼働中と過去で別々に直さない。`CenterHeader.tsx:15` の規則)。隔離の文言は `RunningSessionsView.runtimeAutoMode(runtimeId)` (ランタイムの一覧の `autoModeStatus`。読み込み中・引けないは `undetermined`) から。`unavailable` だけ「隔離がありません」、`allowed` / `undetermined` は「このセッションの隔離をアプリは確かめていません」(data-model §4)。

### 右のペイン (US-3 / FR-017。data-model §4・§6)

`panel-tabs.ts` に `usage` (`UsageTab`) を 1 行足し、`PanelTabId` を広げる。`RightPanel` の tablist に `onKeyDown` と roving tabindex を入れる。`AppShell.test.tsx` の共通の setup を `test-support/app-shell-harness.tsx` に移し (`vi.mock` は各ファイルに残す)、タブのテストは `RightPanel.tabs.test.tsx`、使用量のタブのテストは `UsageTab.test.tsx` に置く。「概要」は `meters.permissionMode` が起動時と違うときだけ「現在の権限モード」の行を足す。

### transcript の進み具合 (US-4。data-model §4)

`LivePane` の `LiveSessionPane` が、ストアの購読から作る安定した値 (tool の id ごとの経過時間と思考のトークンを引き、購読できるもの) を `features/chat/transcript-context.ts` の context で Thread に渡す (`TranscriptSettledContext` と同じ形。chat は session を import しない)。`ToolResultMarks` は `toolCallId` と結果待ちを受け、結果待ちの間だけ自分の tool の経過時間を `useSyncExternalStore` で購読して出す。思考の印は 2 つの viewport の footer (`thread.aui.tsx:248-261` / `:536`) の composer の上に置く。過去ログには context が無いので出ない。

### フォーカス (FR-019。data-model §8)

`focus-handoff.ts` の 2 つの関数 (行を閉じた後の行き先・composer) を、5 つの押下の処理が消える操作の**前**に呼ぶ。composer の入力に `data-composer-input`、`LiveSessionPane` の根に `data-live-pane`、稼働中の区画の見出しに `tabIndex={-1}` を足す。`useFocusRescue` (O-7) は変えない。

### Provider の表記 (FR-016。research R-13)

`SETTINGS_SECTION_LABELS.providers` と `LAUNCH_EMPTY_STATE_LABELS.noProviders` を「Provider」に。テストの期待値 (`AppShell.test.tsx`・`palette-commands.test.ts`) を同じコミットで直す。glossary に日本語表記を足す。

### 記録の追随 (FR-014〜FR-016)

- `docs/ui-coverage.md`: A 節 7 行を `実装済み: <element> (実行中)`・経路「実行中」、E 節 3 行を `表示不要`、F 節 (と採った element の行) の使い道、D 節に `meter` の行と launch-failure の備考。`init` の行 (`:49`。割当は O-5 のまま) の備考に「`permissionMode` は O-4 が権限モードの比較に使う (表示は権限モードの行と警告の帯)」。項目 21 で割当先が O-4 の行が 0
- `docs/glossary.md`: 計量 (meter)・Quota banner・コンテキストの使用量の推定・失敗の理由の各キー・権限モードの警告の帯 (隔離の文言はセッションの隔離状態ではない暫定のものと 1 行)。「FailureReason (起動系)」を「起動とターンの失敗」(18 種) に。「システムイベントの行」の定義に 3 category と task の進み具合 (data-model §3 を Ref に)。Provider の日本語表記と Detected synonyms。:912 の「プロバイダ」
- session charter: Key concepts か業務ルールに失敗の理由のキー (再ログインの導線は data-model §1)・`meter` (運ぶ値の範囲は data-model §2)・稼働中のストアの `meters` (永続化しない)。Related Specs に「O-4 (ui)」(U-1 の範囲・切り出し・KPI の計測には使わない)
- ui charter: Related Specs に O-4。:72 の Provider
- roadmap: O-4 の行 (#1 の差と結論。完了までに確かめられなかった quickstart V-4 の項目)、O-6 の行 (#7)、O-8 の (c) (#6)、I-2 / I-3 の行 (#8。I-3 は強制の要否、I-2 / I-3 の両方に「O-4 の警告の帯の隔離の文言は暫定で、ランタイムの `autoModeStatus` から導く (`unavailable` 以外は『確かめていない』)。セッションの隔離状態 (隔離バッジ) が定義されたら置き換える」)、system-scope の 3 項目 (#2〜#4) の結論
- AD-047 に日付つきの訂正節 (ADR 節の #1〜#3。2026-10-08 に利用者が決定)
- 005 spec の FR-020 / US-4 AC6 / Edge と data-model §6 に AD-047 への参照 (005 の他は変えない)
- `_overview.md` の帰属の判断根拠 (#16)、`docs/prompts.md` (#15)

### テスト

- 単体 (node): `classifyResultFailure` (data-model §1 の各行と、どれも完了にならない)・`meter.ts` (検証の各規則・`__proto__`・長い id・URL と scheme の無い userinfo (`u:p@h/m`) の資格情報の形の `modelId` を落とす・`[1m]` 付きと `_` を含む `modelId` を落とさない・`resetsAt: 1e300`・知らない `type`)・`mergeSystemEvent` (task の進み具合の合成・種類が残る・行の無い task は捨てる・Hook と他の category は今のまま)・`isTerminalSystemEventStatus`・`detail` の符号化と復号・`transcript.ts` が新しい subtype から行を作らない・`meter-throttle` (偽の時計。鍵ごと 1 秒 1 件・並列の tool N 個の合計 20 件/秒・64 の上限・鍵が休んだ後と取り消しの後に 65 個目が通る・20 件を超えた保留が古い順に送られ飢えない・取り消し・`dispose` の後に何も送らない)・`live-signals` (許可リストの外のフィールドに目印の値を入れ、emit した `SessionEvent` の文字列に 0 件・主ループの assistant だけ・形の外れた `task_id` で送らない・0 に倒した result・`turns`・拒否の重複を除く数・権限モードの基準 (`status` と `init` の両方で比べ、同じモードを 2 回送らない。`init` の `permissionMode` 以外のフィールドを読まない)・再試行と圧縮の行の開閉)・`sdk-agent-session.test.ts` (配線: 429 の失敗で `rate-limited`・`ended` の後に `event` が 0 件)・固定テスト (`SESSION_EVENT_KINDS` 8・`LAUNCH_FAILURE_REASONS` 18・category と status の集合)
- 単体 (renderer): decoder (`meter` の各 `type` と外れ)・ストア (`meters` の更新・閉じた id は捨てる・`close()`・思考を assistant で消す・`turn` で tool を空に・tool が 64 を超えたら更新の古いものから落とす・`sessions` の参照が変わらない・`receivedMessages` を数えない)・`labels` (全理由に全文と短い理由・`isReloginFailure`)・`attentionTransitions`
- component (vitest-axe): 失敗の表示 (理由ごとの文言と再ログインの導線)、監視ビューの行の短い理由、Quota banner (3 状態・解除の時刻の有無・割合の有無・超過分)、権限モードの警告の帯 (`unavailable` で隔離なし、`allowed` / `undetermined` で「確かめていない」)、中央のヘッダの目盛り (80%・100% 超・`contextWindow` 0・過去は出ない・主モデルの照合の 3 段)、使用量のタブ (項目・空の状態 3 つ・2 つのセッションが混ざらない)、「概要」の現在の権限モード、`SystemEventRow` (3 category と task の進み具合)、tool の経過時間 (結果の後に消える)、思考の印、タブのキーボード (§6)、FR-019 の 5 か所
- 通し (`tests/meter/meter-through.test.tsx`): fixture → `live-signals` → `JSON.stringify` → 偽の port → decoder → ストア → DOM。目印の値が DOM に 0 件、2 つのセッションの値が混ざらない (SC-002)
- E2E: 足さない (計量を流す偽の supervisor を作らない。SC-004 の計測経路は agents の単体)。既存の E2E と基準画像を通す

## ADR

新しい ADR は起こさない。AD-047 (accepted) の範囲で作る。AD-047 の字面と設計の間に次の 3 つの差がある (design-gate R2 HG-01 / HG-04)。どれも採択 (2026-10-05) の時点の設計に既にあった。根拠は項目ごとに次のとおり (AD-047 の訂正節にも同じ根拠を書く。tasks SH-013)。

- #1 / #2: 採択の前の design-gate R1 の手当て。#1 は R1 H-05 (コンテキストの推定の材料を最後の assistant の usage に替えた)、#2 は R1 security M-002 (`toolUseId` の形の検証)
- #3: 採択の時点の設計は、renderer に昇格値を key にした表示名を置いていた。記録は承認の commit `c89b423` (2026-10-05。branch `014-ui-metering-and-limits-old`) の data-model.md:178 (§5 の chat の文言の表「権限モードの名前」) と spec.md:134 (US-4 AC1「権限モードが {モード} に変わりました」)。同じ版の data-model.md:76 の「昇格値のリテラルは domain の `meter.ts` だけに置き」は agents と対比した字面で、§5 の表と食い違っていた。AD-047 Decision 5 の「domain だけ」と、R1 の手当ての記録の「昇格値は domain だけ」(design-gate.md.20261004T063000:29) は、この :76 の字面から来ている。2026-10-08 に利用者が、これを書き誤りと判断した (design-gate R3 MG-11)

| # | AD-047 の字面 | 設計 | 変わらない決定 |
|---|---|---|---|
| 1 | Decision 4 (`:38`) と Consequences (`:48`) は Context display の材料を result の値 (`usage` を含む) とする | 主ループの最後の assistant の入力側の usage を、result の `modelUsage` の `contextWindow` で割る。result の `usage` は読まない (data-model §2 / research R-04) | 制御要求を呼ばない |
| 2 | Decision 2 (`:35`) は運ぶ値を「数・真偽・列挙・モデルの id だけ」とする | `tool-elapsed` は形を検証した tool の id (`toolUseId`) も運ぶ (data-model §2)。同じ Decision 2 が `tool_progress` を間引いて運ぶと定めており、運ぶには tool の id が要る | 会話由来の文字列・エラー文・パスを運ばない |
| 3 | Decision 5 (`:37`) は「昇格値のリテラルは domain だけに置く」とする | renderer の `features/chat/labels.ts` の `PERMISSION_MODE_NAMES` が昇格値を key にした表示名を持つ (data-model §5 / research R-15)。今の renderer のコードに昇格値の綴りは 0 件で、コードとして置くのは本 feature が初めて (設計には採択の時点からあった。上の #3 の根拠)。`src/agents/` には置かない | Constitution 検証の項目 16 に例外を足さない |

- **2026-10-08 に利用者が、3 つとも訂正として扱うと決めた** (AD-031 Decision 1。読み手が同じ決定に至る)。tasks SH-013 で AD-047 に日付つきの「訂正」節を 1 つ足し、次の 3 項目と、各項目の根拠 (上の 2 つの箇条) と、「決定 (制御要求を呼ばない・会話由来の文字列・エラー文・パスを運ばない・項目 16 に例外を足さない) は変えない」を書く。Decision と Consequences の本文は書き換えない
  - #1: Decision 4 と Consequences の Context display の材料は、主ループの最後の assistant の 1 回の API 呼び出しの入力側の usage と、result の `modelUsage[].contextWindow` である。result の `usage` は読まない (ターン内の往復の合算でありうる)
  - #2: Decision 2 の運ぶ値には、形を検証した tool の id (`tool-elapsed` の `toolUseId`) を含む。同じ Decision 2 が `tool_progress` を間引いて運ぶと定めており、tool の id なしでは成り立たない
  - #3: Decision 5 の「昇格値のリテラルは domain だけに置く」は、「`src/agents/` (項目 16 の走査範囲) に置かない。値域は domain、表示名は renderer の文言の表に置く」の書き誤りである
- spec U-3 の字面も同じ日に #1 と同じ形に直した (決定は変えない)
- task の進み具合の `detail` の合成 (data-model §3) は Decision 3 (既存の行の更新・part の形を変えない) の中の符号化で、`TRANSCRIPT_PART_FIELDS` は変わらない
- ターン数と拒否の件数の数え方 (research R-08) は Decision 2 の「数・真偽・列挙・モデルの id だけを運ぶ」の中

## 機械強制の変更

- `SESSION_EVENT_KINDS` (8) と `LAUNCH_FAILURE_REASONS` (18) の固定テストを直す。`SYSTEM_EVENT_CATEGORIES` (5) / `SYSTEM_EVENT_STATUSES` (14) の固定テスト (無ければ足す)
- `meter` の許可リストのテスト (SDK の fixture の許可リストの外のフィールドに目印の値を入れ、`SessionEvent` と DOM に 0 件。SC-002)
- `sdk-agent-session.ts` の `Equal<…>` で `PermissionModeKey` (`unknown` を除く)・`RateLimitStatus`・`RateLimitType`・`AssistantErrorKey`・失敗の subtype の値域を SDK と固定する
- Constitution 検証の項目 16 に例外を足さない (昇格値の綴りは domain と renderer だけ)。項目 21 は既存の検査がそのまま効く
- `eslint.config.mjs` の手書きの element の一覧 (`:582-598`) に、本 feature が hooks を足す `tool-result-marks.tsx` を足す。registry から取り込んで手を入れた element も同じ一覧 (か `:605-614` の registry の element の一覧) に足す
- `.specify/spec-gate/reviewers.yml`: ui-coverage-reviewer の対象に `src/domain/session/meter*.ts` を足す (SDK のメッセージを変換する domain のモジュール)。取り込んだ registry の element は、手を入れたら a11y / ux の `auto_invoke_patterns` に、入れなければ `exclude_patterns` に実名で足す (`:52-53` の注記)
- `scripts/constitution/allowlists.mjs` と `.dependency-cruiser.js` は変えない (#30)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 判断 (U-1〜U-6)・AD-047 が覆る | 2026-10-05 に利用者が推奨案どおり承認した |
| RK-02 | `rate_limit_event` は claude.ai のサブスクリプションでだけ届き、Bedrock / API キーの Provider では Quota banner が出ない | 出ないのが正しい (届いた event だけで描く)。429 の失敗の文言は帯を参照しない。quickstart V-4 #2 |
| RK-03 | コンテキストの推定が subagent・圧縮でずれる | 「推定」と明示。カテゴリ別の内訳は AD-047 の再検討の条件 |
| RK-04 | 高頻度のメッセージで renderer の負荷が上がる | 間引き・上限・取り消し (data-model §2)。agents の単体 (偽の時計) で回数を固定する。表示は tool の id ごとに購読する。E2E は計測経路にしない |
| RK-05 | SDK の版で subtype・列挙が増える | 知らないものは `provider-error` / `unknown`。`Equal<…>` で値域を固定し、版を上げたら tsc が落ちる |
| RK-06 | 認証切れ・課金のエラーが実際にどの形 (subtype / `api_error_status` / assistant の `error`) で届くかを誰も観察していない (X-1 の V-11 は実機で deferred) | 実機の形を確かめるまで `execution-error` / `api-error` の文言に「ログイン状態も確かめる」を添え、知らない形は再ログインの導線のある `provider-error` に倒す。quickstart V-4 #1 で利用者が形を控え (アプリの外の CLI で、数と列挙だけ。quickstart「V-4 の形の控え方」)、違えば data-model §1 を直す (実機の操作は利用者の作業。tasks SH-014) |
| RK-07 | `utilization` の値域 (0〜1 か 0〜100) と `resetsAt` の単位が型に書かれていない | data-model §2 の検証で両方を受け、範囲外は null。quickstart V-4 #4 で生の値を控え (アプリの外の CLI)、違えば data-model §2 を直す (SH-014) |
| RK-08 | コンテキストの推定が `/context` とずれる | 主ループの 1 回の API 呼び出しの入力側を使う。V-4 #3 の結果を `quickstart-results.md` に書き、±10% を超えたら data-model §2 (`contextTokensOf`) と §4 (主モデルの照合) を見直す (SH-014) |
| RK-09 | 権限モードの変化が `status` で届かない (`status` の `permissionMode` は省略可能)。起動の直後から安全 3 値の外で動く・`status` を伴わずに変わる (hook の `setMode` など) | `init` (各ターンの最初に必ず届き、`permissionMode` は必須。research R-02) と `status` の両方を `modeBaseline` と比べる (data-model §2 / §3)。`init` から読むのは `permissionMode` だけ。V-4 #5 で実機の順を確かめる |
| RK-10 | task の `detail` の合成の形 (先頭の改行) が過去ログ・Hook の行に漏れる | `oneLine` が改行を残さないことと、Hook と他の category の合成が今のままであることを単体で固定する。復号できない `detail` は種類だけで描く |
| RK-11 | FR-018 の切り出しで監視ビューの振る舞いが変わる | 切り出しを最初の別のコミットにし、既存のテストを書き換えずに通す (例外は `announcements` の単体だけ。research R-11) |
| RK-12 | registry の element が採る条件 (文言・CSP・役割) を満たさない | 既存の `Badge` / `Button` と文字の体裁で作り、照合した候補名と理由を PR の説明と F 節に書く (research R-09)。照合は表示の最初の task |
| RK-13 | フォーカスを先に移した後で、消える操作が効かなかった (例: 承認の応答の送信の失敗) | 承認・取り消し・閉じるはストアの中で同期に進み、失敗しても composer にフォーカスがあるのは無害。押した要素にフォーカスがあるときだけ移す |
| RK-14 | アプリの中に、知らない形の失敗 (`provider-error` に倒れたもの)・検証で落ちた値 (decoder が捨てた `meter`) を後から知る観測点が無い。agents に記録の出力は 0 件で、Worker の標準出力は読み捨てる (AD-043 Decision 6) | **本 feature では足さない。** 足すには、運ぶ値 (数と列挙だけ)・出す条件 (開発ビルドだけ)・出し先の設計が要り (Principle V)、表示の feature の範囲を広げる。実機の形は quickstart V-4 のアプリの外の手順で確かめる。完了までに確かめられなかった V-4 の項目と、本番の観測点が要るかの判断は roadmap の O-4 の行に残す (SH-013) |
| RK-15 | `modelUsage` のキーと起動の設定のモデル id の形が合わず (alias・`[1m]`)、主モデルに別のモデル (subagent・圧縮) を選んで割合を誤る | `modelId` の検証を起動の設定と同じ `isValidModelId` にし (`[1m]` を落とさない)、照合は完全一致 → 末尾の `[…]` を外して一致 → 出力トークン最多の 3 段 (data-model §4)。V-4 #2 / #3 でキーの形を控える |

## Project Structure

### Documentation (this feature)

```text
specs/014-ui-metering-and-limits/
├── spec.md
├── plan.md              # 本ファイル
├── research.md          # R-01〜R-15
├── data-model.md        # §1〜§8 (`meter` の形と許可リストは §2。contracts/ は作らない — 境界は SessionEvent の種類 1 つで、
│                        #  形の正本は §2 に置く)
├── quickstart.md        # V-1〜V-4
└── tasks.md             # /cl-tasks が作る (旧版は置き換えられる)
```

### Source Code (repository root)

```text
src/domain/session/agent-session.ts (+ agent-session.test.ts / agent-session.kinds.test.ts)
src/domain/session/meter.ts (+ .test.ts)                     (新設)
src/domain/session/transcript-dto.ts / system-event.ts (+ tests) / transcript.system-event.test.ts
src/agents/session-core.ts (+ test)
src/agents/meter-throttle.ts (+ .test.ts)                    (新設)
src/agents/live-signals.ts (+ .test.ts)                      (新設)
src/agents/sdk-agent-session.ts (+ test)
src/renderer/src/features/session/session-event-decoder.ts / running-session-store.ts / running-session-types.ts /
    running-session-monitor.ts (新設) / useSessionMeters.ts (新設) / running-sessions-view.ts /
    RunningSessionsProvider.tsx / RunningSessionList.tsx / RunningSessionRow.tsx (新設) / session-view.ts /
    SessionAttentionAnnouncer.tsx / LivePane.tsx / focus-handoff.ts (新設) / labels.ts (+ tests)
src/renderer/src/features/chat/transcript-context.ts / labels.ts (+ tests)
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx / tool-result-marks.tsx /
    terminal-block.aui.tsx / code-diff.aui.tsx / todo-list.aui.tsx / subagent.aui.tsx / agent-plan.aui.tsx /
    tool-fallback.aui.tsx (呼び出し側)
src/renderer/src/components/assistant-ui/elements/cost-meter.tsx / quota-banner.tsx / context-display.aui.tsx /
    thinking-indicator.tsx                                  (registry から。採るとき)
src/renderer/src/features/shell/panel-tabs.ts / RightPanel.tsx / RightPanel.tabs.test.tsx (新設) / UsageTab.tsx (新設) /
    CenterHeader.tsx / ContextCostMeter.tsx (新設) / CenterBanners.tsx (新設) / CenterPane.tsx / OverviewTab.tsx /
    labels.ts / AppShell.test.tsx (setup を harness に) / palette-commands.test.ts (期待値)
src/renderer/src/stores/ui.ts
src/renderer/src/test-support/app-shell-harness.tsx           (新設)
tests/meter/meter-through.test.tsx                            (新設)
eslint.config.mjs / .specify/spec-gate/reviewers.yml
docs/ui-coverage.md / docs/glossary.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md /
    docs/roadmap.md / docs/prompts.md
specs/005-session-launch-and-streaming/spec.md / data-model.md (AD-047 への参照だけ)
```

**Structure Decision**: 既存の 3 層 (`src/domain` / `src/agents` / `src/renderer`) のまま。main と preload は変えない。agents に SDK 非依存のモジュールを 2 つ足し (`live-tool-results.ts` と同じ構え)、`sdk-agent-session.ts` は配線だけを持つ形を保つ。表示はシェル (`features/shell/`) の部品と transcript の element に置き、session のストアの値は selector で読む。

## Complexity Tracking

Constitution Check に正当化の要る違反は無い。
