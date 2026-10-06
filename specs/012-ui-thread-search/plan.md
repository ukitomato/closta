# Implementation Plan: Thread 検索と探す操作 (O-3)

**Branch**: `012-ui-thread-search` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-6 と AD-045 は 2026-10-05 に利用者が承認した。O-7 (spec 013。PR #13) がマージされた main の上に作る。2026-10-04 の版の plan は O-7 の前の main の上で書いたので、本版で作り直した (行番号はすべて O-7 の後のもの)。

## Summary

セッション一覧の文字列の絞り込み (Thread search)、開いている transcript の会話内検索、Command palette、本 feature の空の状態を renderer の中で作る。session charter の KPI「再利用率」の計測経路として、起動元 (`preset` / `manual`) を起動の IPC に足し、main が日ごとの回数だけを `launch-usage.json` に持つ。i18n はリソース化しない (AD-045。accepted) とし、Constitution XV を MINOR で改める。O-7 の義務として過去の区画の並びを直し、サイドバーの領域の基準画像を足す。

- 一致の規則は 1 つの純関数の組 (data-model §1)。正規化は書記素ごと (半角カナと濁点を合成する。research R-02)
- 会話内検索は本文のデータで数え、id で移る navigator を transcript に足し、強調は CSS Custom Highlight API で DOM を書き換えずに掛ける。実行中の窓の外の一致は窓を広げて移る (data-model §2 / research R-03)
- palette はシェルの部品。registry の command-palette / conversation-search の element を先に確かめる (research R-04)。稼働中と過去の候補は id の名前空間が違うので結ばない (research R-07)
- 記録は domain の純関数・store・service の 3 つに分け、起動の応答を待たせない (data-model §4 / research R-05)
- roadmap に O-8 / O-9 を足し、O-3 の義務 (O-1 から) (2) を O-8 に移す (research R-01)

## Technical Context

- **Language/Version**: TypeScript (strict)。Electron 39 / React 19 ([docs/discovery.md](../../docs/discovery.md))
- **Primary Dependencies**: assistant-ui (`@assistant-ui/react` と registry の element)、zustand 5、`@tanstack/react-virtual`、Radix の Dialog (`components/ui/dialog`)。**新しい npm の依存を足さない** (registry の element は source のコピーで、依存を足すなら取り込みのときに確かめる)
- **Storage**: ユーザデータディレクトリの `launch-usage.json` (JSON 1 つ。90 日分の日ごとの回数)。それ以外は renderer の表示状態で永続化しない
- **Testing**: Vitest 5 (node / renderer の 2 project。component テストは vitest-axe)、Playwright + Electron の E2E (偽の capability。AD-038)
- **Target Platform**: Windows 11 の Electron (本番の CSP は `style-src 'self'`)
- **Project Type**: desktop-app
- **targets**: both (renderer と main / preload / domain)
- **Performance Goals**: 会話内検索は入力 1 回あたり全件の走査を間引きの後の 1 回以下にし、メッセージの追加・本文の変化では変わったメッセージだけを走査する (SC-002。1,000 メッセージの走査の時間は参考値)。起動の応答を記録の書き込みで待たせない (Principle IX)
- **Constraints**: 実行時に `<style>` を足さない (CSP)。IME の変換中のキーで動かない (Principle VIII)。過去の区画の最小の高さ 6rem と稼働中の区画の上限を変えない (O-1 SC-003)
- **Scale/Scope**: 過去の一覧は数百件 (実測で 1 所在 278 件・WSL 357 件)、transcript は数千メッセージ、稼働中は最大 10 本

### レイヤ

- **domain**: `src/domain/session/launch-usage.ts` (新設。`LaunchOrigin`・`checkLaunchOrigin`・`LocalDayKey`・足す / 刈り込む / 合計する純関数・`LaunchUsageSummaryDTO`)、`src/domain/capability.ts` (`launchSession(config, origin)`・`getLaunchUsage()`・`IPC_CHANNELS.getLaunchUsage`)
- **main**: `src/main/infra/settings/launch-usage-store.ts` (新設)、`src/main/app/launch-usage-service.ts` (新設。直列化・日付・読み込みの状態)、`session-ipc.ts` (`handleLaunchSession` の起動元の検証と「`launching` のときだけ await せずに記録」、`handleGetLaunchUsage`、`SessionIpcDeps` に `recordLaunchUsage` / `getLaunchUsage`)、`ipc.ts` (チャネルの登録だけ。`IpcDependencies` に同じ 2 つ)、`composition-root.ts` (配線)、`e2e-capability.ts` (記録と読み出しのメモリ内の fake・過去の一覧の固定の索引)
- **preload**: `src/preload/index.ts` (`launchSession` の第 2 引数・`getLaunchUsage`)
- **renderer**:
  - `features/search/` (新設) — `text-search.ts` (正規化・語・一致・位置の表)、`session-search.ts` (要約行と稼働中の行の対象)
  - `features/session-list/SessionListScreen.tsx` — 検索欄と AND の絞り込み、`search-empty`、区画の開閉の状態を上げる、並び (data-model §6)、過去の行のツールチップ
  - `features/chat/` — `conversation-search.ts` (走査の純関数)、`useConversationSearch.ts`、`ConversationSearchProvider.tsx` (状態・Ctrl+F・palette からの要求)、`ConversationSearchBar.tsx`、`search-highlight.ts`、`transcript-context.ts` (navigator)、`ChatScreen.tsx` (取得と本体を分ける)、`labels.ts` (検索と composer の文言)
  - `components/assistant-ui/elements/thread.aui.tsx` — navigator の登録 (`scrollToMessage`)・移るときに追従を切る・`data-message-id` / `data-search-text`・composer の名前と placeholder を文言の表から
  - `features/shell/` — `CommandPalette.tsx` / `palette-commands.ts` (新設)、`AppShell.tsx` (palette のマウント)、`CenterPane.tsx` (子の `RunningCenter` / `PastCenter` がそれぞれ検索の provider で中央のヘッダと本体を包む。`PastCenter` が `useTranscript()` を 1 回呼ぶ)、`CenterHeader.tsx` (検索のボタン)、`labels.ts`
  - `stores/ui.ts` — `paletteOpen`・`conversationSearchRequest`・`watchedIdOf` の条件
  - `features/session/` — `LaunchDialog.tsx` (起動元)、`LivePane.tsx` (`NewSessionDialog` が `lastOrigin` を渡す)、`PresetPanel.tsx` と `useLaunchUsage.ts` (新設。回数の表示)、`running-session-store.ts` / `running-session-types.ts` (`lastOrigin`・`launchOrigin`・`launch` の引数)、`RunningSessionsProvider.tsx` / `running-sessions-view.ts` (`launch` の引数・`revealMessage`)、`RunningSessionList.tsx` / `SessionAttentionAnnouncer.tsx` (`watchedIdOf` に渡す値)、`labels.ts`
  - `test-support/capability.ts` (stub)、`assets/main.css` (`::highlight()`)
- **E2E**: `e2e/ime.spec.ts` (2 ケース)、`e2e/sidebar-screenshot.spec.ts` (新設)、`e2e/support/launch.ts` / `multi-session.spec.ts` / `launch-dialog.spec.ts` (composer の locator)。`perf/real-sessions.spec.ts` は composer の locator の文字列だけ (実行しない。research R-06)

### 既存の起点

research R-02〜R-08 の「事実」に行番号つきで書いた (O-7 の後の main を 2026-10-06 に読んだ)。

## Constitution Check

`.specify/memory/constitution.md` v1.3.0。

| Principle | 判定 | 根拠 |
|---|---|---|
| **I** (パス API) | ✅ | パスを解決・分解しない。一致の対象は画面が描く表示用の文字列 (`groupLabelOf` の返り値・`cwdDisplay`) で、`cwd.value` を直接は読まない。`launch-usage.json` のパスは `hostPathOps.join` で組む (`preset-store.ts` と同じ) |
| **II** (プラットフォーム分岐) | ✅ | 分岐を足さない。ファイルの読み書きは `infra/settings` の store に閉じ、パスは composition root が `userData` から渡す (AD-023 §8)。ローカルの時差は composition root が注入する |
| **III** (権限モード) | ✅ | 起動元は計測にだけ使い、起動の可否・`SessionLaunchConfig`・権限モードに影響させない (spec FR-009 / FR-010。どの起動元でも起動の service に同じ引数で 1 回) |
| **IV** (SDK 経由) | N/A | SDK の呼び出し・query の options を変えない |
| **V** (資格情報を永続化しない) | ✅ | 記録は日付と 2 つの回数だけ。許可したキーしか出さない書き出しと固定のキー集合のテストで、識別子・秘密が構造上入らない (data-model §4)。ログは理由キーと errno のコードだけ (パスも出さない) |
| **VI** (永続環境を変えない) | N/A | 子プロセス・環境の変更を足さない。E2E の固定データもプロセスを起こさない |
| **VII** (supervisor の Electron 非依存) | N/A | `src/agents/` を変えない |
| **VIII** (日本語環境) | ✅ | 正規化は書記素ごとの NFKC で全角 / 半角・半角カナの濁点を吸収する。Ctrl+K / Ctrl+F・検索欄と検索のバーと palette の Enter / Esc / ↑↓ は変換中に反応せず `preventDefault` もしない (AD-037 の `isComposing` / 229)。composer の名前と placeholder を日本語にする (`ComposerPrimitive.Input` は差し替えない)。サイドバーの過去の区画の日本語の並びを基準画像で守る (FR-018)。E2E の IME のケースを 2 つ足す |
| IX (main をブロックしない) | ✅ | 記録は await せず、起動の応答を待たせない。検索は renderer の中 |
| X (正本は Claude Code) | ✅ | 検索は取得済みの要約行と本文を読むだけ。`launch-usage.json` はアプリ自身の計測で、セッションの正本ではない |
| XI (観測可能な垂直スライス) | ✅ | 各 US は component テストで観測でき、高さと基準画像は E2E、見た目は quickstart V-3 |
| XII (ui-coverage) | ✅ | SDK が emit する情報の表示を足さない (A〜E 節の差分 0)。F 節の使い道を同じ PR で直す (spec FR-015) |
| XIII (element 優先) | ✅ | `EmptyState` は既存。command-palette / conversation-search は registry の element を先に確かめ、採る条件を満たさなければ理由を F 節に書く。thread-search は R-2 のまとまりと合わないので使わず、理由を書く (research R-04) |
| XIV (glossary) | ✅ | 用語を先に glossary に足す (spec FR-016) |
| XV (多言語) | ⚠ 改定を伴う | 新しい文言は各 `labels.ts` (data-model §5)。AD-045 (accepted 2026-10-05) に合わせて XV を MINOR で改める (v1.3.0 → v1.4.0)。改定手順 2 (architecture-reviewer を交えた人間のレビュー) と 4 (Amendment trail) を本 feature の PR で踏む |

**Domain charter の整合**: ui の In scope に「Thread 検索、conversation map、observability 系の表示」がある。session の操作 UI (過去の区画の検索欄・プリセットの欄) と session の domain / main のモジュールに手を入れるのは U-5 で承認された例外で、ui / session charter に 1 行ずつ書く (spec FR-016)。

**Phase 1 の後の見直し**: data-model と research の決定 (書記素の正規化・navigator・窓を広げる操作・palette をシェルに置く・E2E の固定データ) は上の表の判定を変えない。Complexity Tracking に書く違反は無い。

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI、transcript の表示 (仮想スクロール・スクロールアンカリング)、composer (日本語 IME)、`docs/ui-coverage.md` の維持、transcript の情報密度、**Thread 検索・conversation map・observability 系の表示**、アプリのシェル (O-7)。他 domain の操作 UI (一覧・登録・選択画面) の中身は各 domain
- 業務ルール: element を優先し独自のトークンを増やさない (Principle XIII)、日本語で破綻しない (Principle VIII)、長大スレッドは仮想化しアンカリングを壊さない
- 面の状態 (ui charter の Cross-domain dependencies): focus はシェル (`useShellFocus`) だけが書く。シェルが session のストアの操作を呼ぶ例外は今は `dismissLaunchNotice` だけで、本 feature で palette のセッションの候補の実行 (`select` / `sessions.select`) を足す
- 関わる他 domain: `session` (KPI「再利用率」の持ち主・起動の IPC・過去の一覧とプリセットの欄の持ち主。spec U-2 / U-5)

### Related ADRs

- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の実在確認と Tier 分類: accepted — palette / 検索 / Empty state の element の出所
- [AD-023](../../docs/decisions/0023-application-architecture.md) — レイヤ構成と依存規則: accepted — 状態を持つ service は I/O を注入で受け (§5/§7)、store は `electron` を import せずパスは composition root が渡す (§8)
- [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) — Elements の導入コスト: accepted — transcript の仮想化 (会話内検索が描かれていない範囲に移る前提)
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の取得経路: accepted — 本文は port を通り main を経由しない (検索は renderer の中で閉じる)
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool 表示: accepted — Tool group / Reasoning の中は会話内検索の対象外 (spec FR-004)
- [AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) — IME の composer 挙動: accepted — `isComposing` の二重ガード。`ComposerPrimitive.Input` を差し替えない (名前と placeholder だけ変える)
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — E2E / スクリーンショットのハーネス: accepted — 偽の capability (D3)、同梱フォント、基準画像 (FR-018 の 1 枚と固定データ)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (h) — 繰越先の指名: accepted — 再利用率の計測経路を O-3 に指名
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当: accepted — F 節の使い道を同じ PR で直す
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を i18n リソース化しない: **accepted** (本 feature で起こし、2026-10-05 に承認) — XV の改定と直書きの基準線は本 feature の PR
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェルを 3 面にする: accepted (O-7) — 置き場所の語 (Decision 6)。palette の操作は「設定の項目を開く・新規起動・セッションを開く」(Consequences)
- [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5 — 持ち主のいない延期を残さない: accepted — O-8 / O-9 の登録と、残す英語のボタン名の持ち主

### Glossary excerpt

- **Shell (シェル)**: アプリの面の配置と遷移 (O-7)。サイドバー (稼働中の区画・**過去のセッションの区画**)・**中央のヘッダ**・**中央の本体**・右のペインのタブ・設定のダイアログ。面の状態は `stores/ui.ts` の 1 か所で、session のコンポーネントは書かない。「見ているセッション」(`watchedId`) は focus から導く
- **SessionSummary (セッション要約行)**: セッション一覧の 1 行。識別子 / 要約 / 最終更新 / 作成時刻 / 作業ディレクトリ / git ブランチ / タグ / 由来を持つ。transcript の本文を含まない。`summary` / `firstPrompt` / `customTitle` は会話由来の逐語を含みうる
- **TranscriptView (transcript 表示)**: 選んだセッションの過去メッセージを assistant-ui で仮想化描画する画面状態
- **Transcript density (transcript の情報密度)**: `comfortable` / `compact`。監視ビューの行の Density とは別の値
- **Composer (コンポーザ / 入力欄)**: `ComposerPrimitive.Input` を用い、変換確定の Enter を送信にしない。自前ガードを新設しない
- **Running session list (稼働中セッション一覧)**: この起動で開いたセッションの一覧。R-2 の (列挙の) セッション一覧とは別物
- **Preset (プリセット)**: 名前付きで保存された `SessionLaunchConfig`。資格情報の値を含まない
- **Launch notice (起動の告知)**: 起動ダイアログに出す直前の拒否の理由と前回の失敗。起動の初期値 (`launch.lastConfig`) は含まない。本 feature で、含まない初期値に `launch.lastOrigin` を足す (SH-001)
- 新しく足す (spec FR-016): セッションの検索 (Thread search)、会話内検索、Command palette、起動元 (preset / manual。数え方の正本は spec FR-009 / data-model §4「renderer の起動元」。前回の設定を変えずに起動し直した起動は前回の起動元を引き継ぐ)、起動の利用記録 (`LaunchUsage`。「ローカル利用ログ」「再利用率の記録」は Counterexamples)

## 上流からの申し送り

実行したもの (2026-10-06。Grep ツール (ripgrep) で実行。`node_modules` / `out` を除く。件数は本 plan を書き直す前の数):

```
# 1) spec_id
rg -n "012-ui-thread-search" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
    → 14 件。012 自身 (旧版の plan・gate の報告・spec) 11 件、ほか 3 件 (013 design-gate.md:50 / AD-045:23 / AD-046:21)
# 2) feature ID
rg -n "\bO-3\b"
    → 204 件 / 68 ファイル
       下表で処理: 98 件 (docs 40・PLAN.md 3・constitution 1・src 1・specs の spec / plan / tasks / research / data-model /
                     quickstart(-results) 53)
       該当なし (表の最終行): 012 自身の旧版 57 件・他 spec の gate の報告 49 件
# 3) 新設するモジュール名
rg -n "launch-usage|launchUsage|LaunchUsage|session-search|CommandPalette|command-palette|ConversationSearch|conversation-search|LaunchOrigin|getLaunchUsage|lastOrigin|paletteOpen"
    → 012 自身と .claude/skills/elements の element の説明だけ。既存のコードと名前は衝突しない
# 4) 実名リスト方式の規則 (新しいモジュールに追加の義務を課すもの)
.dependency-cruiser.js:252-256   services-not-to-io の from (状態を持つ app の service の実名)
scripts/constitution/allowlists.mjs:480-502   WSL_FREE_DIRECTORIES (app のモジュールの実名)
scripts/constitution/allowlists.mjs:452       SECRET_LITERAL_SCAN_DIRS (src/main/infra/settings/ をディレクトリで含む)
eslint.config.mjs:557-599        components/ 配下の手書きコードの strictness を戻すファイルの一覧
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:331 (O-3 の行) / 013 data-model:96,99 | 義務 (O-7 から) (i)〜(iv): 過去の区画の高さ・グループの region・全画面の基準画像・過去の行のツールチップ | **受ける** — FR-017 / FR-018 (data-model §6 / §7)。roadmap の字面に「義務の扱い」の結論を書く |
| 2 | roadmap:331 | 義務 (X-4 から): 再利用率の計測経路 | **受ける** — US-4 / FR-009〜FR-013 (data-model §4) |
| 3 | roadmap:331 | 義務 (O-1 から) (1): i18n リソース化の判断・`target-finder.ts` の 2 本 | **受ける** — FR-014 / AD-045 (accepted) |
| 4 | roadmap:331 (`#o3-kpi-smoothness`) | 義務 (O-1 から) (2) (a)〜(d) と O-7 での基準の変化の追記 | **送る** — O-8 (新規。research R-01)。アンカーを O-8 の行に移し、O-3 の検索欄で過去の区画の描画が変わることも基準の変化として並べる。参照元 (#5・#8・#13) を O-8 に直す |
| 5 | roadmap:224 | 実機計測ハーネスの ADR は「O-3 が先に着手したら O-3 が持つ」 | **送る** — O-3 は perf の安全柵・出力を変えない (composer の locator の文字列だけ。research R-06)。perf を変える O-8 が持つ。字面を直す |
| 6 | roadmap:128-133 | 全画面 (シェル) の基準画像を足すかは O-3 の design で判断する | **受ける** — サイドバーの過去の区画を 1 枚。全画面は撮らない (FR-018)。字面に結論 |
| 7 | roadmap:187 | system-scope の O-7 pr-gate R1 (7): composer の名前と placeholder が英語。持ち主 = O-3 | **受ける** — FR-014。字面に結論と、残る英語のボタン名の持ち主 (RK-08) を書く |
| 8 | roadmap:328 | O-1 の行「残した宿題は O-3 の義務 (O-1 から)」 | **送る** — O-8 を指すように直す |
| 9 | roadmap:239-247 | `running-session-store.ts` / `RunningSessionList.tsx` の切り出しは「O-3 の i18n リソース化の前に」。持ち主は「store に派生値を足すか、監視ビューの行を触る次の feature」 | **該当なし** — リソース化しない (AD-045 Consequences)。本 feature はストアに `lastOrigin` / `launchOrigin` (派生値ではない) と `launch` の引数を足し、`RunningSessionList` は `watchedIdOf` に渡す値を 1 つ足すだけで、派生値の追跡と行の部品を変えない。字面に AD-045 と「O-3 も当たらない」(変えたものの一覧) を注記する |
| 10 | roadmap:336,338,367 / PLAN.md:706 | D-1 の依存は O-3 | **該当なし** — 依存は変えない。D-1 の行に AD-045 の再検討の条件 (b) を注記する (AD-045 Confirmation) |
| 11 | roadmap:377 | OPT-panel は「O-3〜O-6 の後」 | **該当なし** — 変えない |
| 12 | `_overview.md`:62-63,103,114 / PLAN.md:702,729 / ui charter:213 | O-3 の題と M3 の範囲 | **受ける** — 題を「Thread 検索と探す操作」に、M3 に O-8 / O-9 を足す (範囲 O-1〜O-9)。PLAN.md は roadmap を指す注記だけ。ui charter の Related Specs に O-3 |
| 13 | session charter:151 | 滑らかさの残りの持ち主 = O-3 (`#o3-kpi-smoothness`) | **送る** — O-8 に直す (FR-016) |
| 14 | session charter:163-164 | KPI「再利用率」: 計測経路は O-3 が作る | **受ける** — 文言を U-6 の数え方に、計測経路をプリセットの欄と `launch-usage.json` に直す。計測経路の注記に、判定の期間 (プリセットの欄の直近 30 日)・最低件数と判定の時期を持たないこと・数える単位 (受け付けた起動の要求)・前回の設定を変えずに起動し直した起動は前回の起動元に数えることを書く (spec FR-009 / FR-010 / FR-016)。起動の利用記録は session の永続化層に置くと書く (U-5) |
| 15 | AD-041:148 | (h) O-3: 再利用率の計測経路 | **受ける** — #2 と同じ。AD-041 (accepted) は変えない |
| 16 | AD-045:15,23,34-36 | XV の改定は O-3 の PR・直書きの基準線を実装の最初に数えて Confirmation に記録・accepted は着手の条件 | **受ける** — 改定は本 PR (MINOR)。基準線は AD-045 の Consequences が定める追記として Confirmation に書く。着手の条件は満たした |
| 17 | AD-046:19,21,48 | O-3〜O-6 の置き場所・AD-045 の番号の経緯 | **該当なし** — 経緯の記録 |
| 18 | AD-046:42 | palette の操作は「設定の項目を開く・新規起動・セッションを開く」 | **受ける** — data-model §3 |
| 19 | AD-046:50 / 013 spec:58,261 | 稼働中と過去を 1 つの一覧に混ぜるかは O-3 の Thread search の後に再検討 | **受ける (閉じる)** — 混ぜない。palette が両方を候補にし、Thread search は過去の区画にある (FR-016)。013 の記述に結論を書く。AD-046 (accepted) は変えない |
| 20 | constitution:849 | i18n リソース化の要否は M3 (O-1〜O-3) までに判断する | **受ける** — XV を改める (FR-014) |
| 21 | `thread-list.aui.tsx:38` | 検索は O-3 | **受ける** — 注記を「Thread search は過去のセッションの区画 (`SessionListScreen`) の検索欄 (O-3)。element 内蔵の検索は使わない」に直す |
| 22 | ui-coverage.md:226,243,258,268,278,300,339,348 | F 節で O-3 に預けた 8 element | **受ける** — Command palette / Conversation search / Thread search / Empty state は本 feature の結論 (使わないものは理由) に、Activity graph / Heat graph / Message timing / Trace waterfall は O-9 に (FR-015) |
| 23 | prompts.md:253-257 | O-3 のプロンプト | **受ける** — 範囲に合わせて直し、O-8 / O-9 のプロンプトを足す |
| 24 | prompts.md:244-247 | O-7 は「O-3 の前」 | **該当なし** — 経緯の記録 |
| 25 | 002 spec:596 / 004 plan:18,163 / 013 spec:260,262 | Thread 検索 / observability / Command palette は O-3 | **受ける** — US-1〜US-3 |
| 26 | 002 spec:597 / 010 plan:119 | 大規模件数向けの描画最適化は必要なら O-1 / O-3 | **該当なし** — 一覧の仮想化は足さない。件数の多さは先に検索で絞る。要るかは O-9 の本文の横断検索の判断と合わせて見る (O-9 の行に書く) |
| 27 | 008 spec:396,415 / 008 plan:139,281 / 008 tasks:214,219 | 再利用率の計測経路は O-3 | **受ける** — #2 と同じ。008 (completed) は変えない |
| 28 | 010 spec:120,211 / 010 tasks:84,119 / 010 quickstart-results:53,66 | 滑らかさの宿題は O-3 | **送る** — #4 と同じ。010 (completed) の spec / tasks と quickstart-results:53 (経緯) は変えず、quickstart-results:66 のリンクだけ O-8 に直す |
| 29 | 010 spec:223 / 010 plan:54,109,180 / 010 tasks:109 / 010 research:68-70 | i18n の判断を O-3 に | **受ける** — #3 と同じ |
| 30 | 010 spec:276 | 一覧の並べ替え・絞り込み・検索は O-3 | **受ける (範囲を限る)** — 稼働中の一覧は palette の候補として探せる。稼働中の区画に検索欄は付けない (最大 10 件) |
| 31 | 011 spec:231 / 011 plan:159 / 011 research:121 / 011 data-model:143 / 011 tasks:34,108 | `receivedMessages` の注記を O-3 の義務 (2) に | **送る** — O-8 の行に注記ごと移す |
| 32 | 013 spec:33,39,47,50,172,219,246 / 013 plan:92 / 013 research:10-11 / 013 tasks:75 / 013 quickstart:12 / 013 quickstart-results:49 | O-7 を O-3 の前に置く・置き場所の語で書く・依存に O-7 | **受ける** — 置き場所を AD-046 Decision 6 の語で書いた (spec)。013 は変えない |
| 33 | 013 spec:210 / 013 plan:95 / 013 quickstart-results:14 | perf の手順を直したのを実機で確かめるのは義務 (2) を引き継ぐ feature・(2)(c) の比較の基準 | **送る** — O-8 (#4 と同じ) |
| 34 | 012 自身の旧版 (57 件) / 他 spec の gate の報告 (013・010・008・011 の `*-reviewer.*.md`・`pr-gate.md`・`design-gate.md`・`analyze.md`・verdict の json。49 件) / spec_id の 3 件 | 過去の review の記録・旧版の成果物 | **該当なし** — 記録は変えない。012 の旧版は本 plan・research・data-model・quickstart で置き換えた。旧版の tasks.md と design-gate の成果物は /cl-tasks と /cl-design-gate が作り直す |
| 35 | (grep 3) 実名リスト | 新しい app の service・新しい app のモジュール・取り込む element | **受ける** — `services-not-to-io` と `WSL_FREE_DIRECTORIES` に `launch-usage-service` を足す。取り込んだ element に手を入れたら eslint の一覧に足す (下の「機械強制の変更」) |

## 実装方針

### Thread search (US-1。data-model §1 / §6)

`features/search/text-search.ts` (正規化・語・一致) と `session-search.ts` (対象) を先に作り、単体で FR-002 の正規化の各規則を確かめる (SC-001)。`SessionListScreen` の `visible` の導出 (`SessionListScreen.tsx:787-797`) の最後に検索語の絞り込みを足す (区画の中の行を同じ添字で削る)。行ごとの正規化したフィールドは索引とフォルダの表示名が変わったときだけ作る。語・区画の開閉は `SessionListScreen` の state (開閉は `Section` から上げる)。空の表示の優先順位に `search-empty` を 2 番目に足す。並びは data-model §6: 検索欄を上端に固定し、取得時刻・列挙の結果・絞り込み・グループをスクロールの領域に入れる。`Outcomes` は `coverage === 'complete'` のとき 1 行に要約する。`Section` の `section` を `div role="group"` にし、見出しと開閉の中身の id を区画の鍵ではなく `useId()` から作る (data-model §6)。`ThreadListItemsByKey` に `renderTooltip` (行の題の全文) を渡す。

### 会話内検索 (US-2。data-model §2)

- 走査は `features/chat/conversation-search.ts` の純関数 (メッセージの object ごとの正規化の cache と、変わったメッセージだけの走査)。`useConversationSearch` が 150ms の間引きと `current` の維持を持つ
- `ConversationSearchProvider` は `CenterPane` には置かない。子の `RunningCenter` / `PastCenter` がそれぞれの中に置き、中央のヘッダ (`CenterHeader`) と本体を包む (data-model §2「本文の供給元」)。本文は子が持ち、React では値が子から親へ渡らないためである (`CenterPane.tsx:60-66, :135-168`)。`key` もそこで付ける (稼働中は `live.sessionId`、過去は `selectedRowKey`)
  - 過去は `PastCenter` が先頭 (`key` の外) で `useTranscript()` を 1 回呼び、結果を provider と transcript の本体の両方に渡す。`ChatScreen` を `useTranscript` を呼ぶ外側と本体に分け、本体を export する。単体の `ChatScreen` は今のまま動く
  - 稼働中は `RunningCenter` が、表示中のセッションのストアの `messages` (全件) と `reveal` (= `RunningSessionsView.revealMessage`) を props で渡す
- `CenterHeader` に検索のボタンを足し、開いたら中央のヘッダの下に `ConversationSearchBar` を出す (registry の conversation-search を採るならその部品で。research R-04)
- 移動: `transcript-context.ts` に navigator の context を足し、`thread.aui.tsx` の 2 つのパスが `scrollToMessage(id)` を登録する。移るときに `stickyRef` を切る。メッセージの root に `data-message-id`、text part の外側に `data-search-text`。要素は固定のセレクタ `'[data-message-id]'` で集めて `dataset.messageId === id` で照合し、外部由来の id を CSS セレクタの文字列に埋め込まない (`transcript-context.ts` の `findMessageElement` を移動と強調で共有する。data-model §2「メッセージの要素の引き方」)。窓の外は、provider が props で受けた `reveal(id)` の後にもう一度移る。`reveal` の実体は `RunningSessionsView.revealMessage(id)` (`RunningSessionsProvider` の `useLiveRuntime` に、そのメッセージまで窓を広げる操作を足す) で、`RunningCenter` (shell) が渡す。chat は session を import しない
- 強調: `search-highlight.ts` が描かれた text node に `Range` を作り、`CSS.highlights` の 2 つの名前に入れる。登録先を差し替えられる形にし、jsdom のテストは `Range` を検査する。`::highlight()` は `assets/main.css`
- Ctrl+F は provider の `window` の keydown (capture)。palette からの要求は `stores/ui.ts` の `conversationSearchRequest`

### Command palette (US-3。data-model §3)

`features/shell/palette-commands.ts` (操作の表と候補の組み立て。純関数) と `CommandPalette.tsx` (Dialog・combobox / listbox・Ctrl+K・フォーカスの戻り)。`AppShell` の `ShellLayout` にマウントする (`RunningSessionsProvider` の内側。稼働中の候補に要る)。`stores/ui.ts` に `paletteOpen` を足し、`watchedIdOf` を `!paletteOpen` で絞る (`RunningSessionList.tsx:154-156` の呼び出しに値を足す)。セッションの候補の実行は session のストアの選択の操作を呼ぶだけ (focus は `useShellFocus`)。Enter では操作を覚えて閉じ、`onCloseAutoFocus` の中で「開く前の要素へ戻す → 操作を実行する → 操作ごとの行き先へ移す」の順に行う (data-model §3「閉じた後のフォーカス」)。セッションの候補の行き先は中央で、`AppShell` の `focusCenter` を shell の中で共有する。候補の DOM の id は `useId()` と添字から作り、外部の値を id・IDREF・セレクタに入れない (data-model §2「外部由来の値と DOM の id・セレクタ」)。

### 再利用率 (US-4。data-model §4)

`launch-usage.ts` (domain) → `launch-usage-store.ts` (infra。`preset-store.ts` と同じ構え) → `launch-usage-service.ts` (app。直列化と読み込みの状態。`preset-service.ts` と同じ構え) → `session-ipc.ts` (`handleLaunchSession` の起動元と記録・`handleGetLaunchUsage`) → `ipc.ts` (登録だけ) → `composition-root.ts` / `e2e-capability.ts`。renderer は `LaunchDialog` が「このダイアログで適用したか」を持ち、初期値を data-model §4「renderer の起動元」の表で決める (前回の設定を初期値に出すときは、経路を問わず `lastOrigin` を初期の起動元にする。使うのは適用も軸の手での変更もせずに起動したときだけで、適用せずに軸を手で変えたら `manual`)。ストアは `lastOrigin` と稼働中のセッションの `launchOrigin` を持つ。`PresetPanel` は `useLaunchUsage()` で開いたときに 1 回読む。

### Empty state (FR-008)

既存の element `EmptyState` を、Thread search の一致 0 (`search-empty`。解除のボタン)・会話内検索の一致 0・palette の候補 0・記録無し / 読めないに使う (文言は data-model §5)。シェルの空の状態は O-7 のまま。

### 文言と i18n (FR-014)

実装の最初に、コンポーネントの中の日本語の直書きの件数を数えて AD-045 の Confirmation に記録する (数え方の grep と件数を書く)。composer の名前と placeholder を `features/chat/labels.ts` から取り、locator を E2E・component テスト・perf で直す (research R-06)。Constitution XV の改定 (MINOR。v1.4.0) と Amendment trail。

### 記録の追随 (FR-015 / FR-016)

glossary → roadmap (O-3 の行・O-8 / O-9 の追加 (`#o3-kpi-smoothness` のアンカーを O-8 へ)・system-scope の ADR の持ち主・(7) の結論・E2E / 検証基盤の項目の結論・切り出しの注記・D-1 の注記・O-9 の `createdAt` の注記) → `_overview.md` → charter 2 つ (ui: Related Specs・U-5 の例外・面の状態の例外。session: 再利用率・計測経路・起動の利用記録の置き場・滑らかさの持ち主・起動元) → `ui-coverage.md` F 節 (と凡例の書式) → prompts → discovery (`launch-usage.json` の置き場と消し方) → 013 spec (混ぜない) → 010 quickstart-results (リンク)。

### テスト

- 単体 (node): `launch-usage.ts` (足す・鍵の数での刈り込み・時計の先跳び (`addLaunch` → `prune` を跳んだ日で 2 回以上つなぐ) と戻り・30 日・暦日の検証)・store (固定のキー集合・将来版・日単位の不正・壊れた・読めない・退避の失敗・一時ファイルの後始末)・service (直列化・成功してからメモリ・読めないときの読み直し・跳んだ時計での 2 回以上の書き込み・ログに値とパスが出ない)・`handleLaunchSession` (どの起動元 (preset / manual / 欠落 / 未知) でも service に同じ引数で 1 回・`launching` のときだけ記録・記録が投げても結果が `launching`)・`IPC_CHANNELS` の集合の固定 (`src/domain/capability.test.ts`)
- 単体 (renderer): `text-search.ts` (正規化の各規則・書記素・長さの変わる文字の位置の表)・`conversation-search.ts` (走査の回数・`current` の維持)・`palette-commands.ts`
- component (vitest-axe): 過去の区画 (絞り込み・件数・`search-empty`・解除・開閉の保持・ランドマークの数・ツールチップ・要約の行・空白や `"` を含む区画の鍵でのグループの名前)、会話内検索 (件数・移動・端で戻る・仮想化の範囲の外・窓の外・閉じる・強調の `Range`・`"` `\` `]` やセレクタの断片を含む id・IME の変換中のキー)、palette (開閉・絞り込み・↑↓ Enter・閉じた後のフォーカス (閉じ方と操作ごと)・特殊文字を含む過去の行での `aria-activedescendant` と実行・モーダルの間は開かない・IME)、プリセットの欄 (回数・記録無し・読めない)、起動ダイアログ (起動元の表の各行)
- E2E: `ime.spec.ts` に 2 ケース (変換中の Ctrl+K で palette が開かず確定できる / 検索のバーで変換中の Enter で移らない)、`sidebar-screenshot.spec.ts` (基準画像と高さ)、既存の E2E の composer の locator

## ADR

新しい ADR は起こさない。

- AD-045 (accepted) の Consequences のとおり、XV の改定と直書きの基準線を本 feature の PR に含める
- 起動の IPC の入力の追加は計測用の任意の値で、AD-041 の起動ゲート (権限面・env・起動の設定) を変えない (U-2)
- `launch-usage.json` は settings の store と同じ置き場・書き方 (X-4) を継ぐ
- E2E の固定データと基準画像の追加は AD-038 の枠 (偽の capability・同梱フォント・承認済みの基準画像) の中

## 機械強制の変更

- `IPC_CHANNELS` の集合の固定テストを新設する (`src/domain/capability.test.ts`。今は無い。SC-006)
- `launch-usage` の書き出しのキー集合の固定テスト (SC-005)
- `.dependency-cruiser.js` の `services-not-to-io` の `from` に `launch-usage-service` を足す (AD-025 §9 の実名列挙。違反サンプルの置き場は今のまま)
- `scripts/constitution/allowlists.mjs` の `WSL_FREE_DIRECTORIES` に `src/main/app/launch-usage-service.ts` を足す (app のモジュールは実名で列挙し、新しいファイルに判断を強制する形。`:475-478`)
- 取り込んだ registry の element に手を入れたら、`eslint.config.mjs` の手書きの element の一覧 (`:557-599`) に足す
- reviewers.yml は変えない (`src/main/infra/settings/**` で database-reviewer が code-gate / pr-gate に起動される)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | registry の command-palette / conversation-search が採る条件 (役割・文言・IME・CSP) を満たさない | Radix の Dialog と既存の Button で作り、理由を F 節の備考に書く (research R-04)。取り込みは実装の最初の task にし、結果で作り方を決める |
| RK-02 | CSS Custom Highlight API の強調が markdown の描画とずれる | 件数は本文で数え、強調は描画の中で写せた出現だけに掛ける (data-model §2)。実機の目視 (quickstart V-3) |
| RK-03 | 仮想化の `scrollToIndex` が可変の高さで目標に止まらない | 描かれたら `scrollIntoView` で合わせ直す。component テストは目標の index が描かれる範囲に入ることを見る |
| RK-04 | 窓の外の一致に移ると窓が広がり、表示中のセッションの更新が重くなる (X-5 SC-003 の窓の理由) | 広げるのは利用者の移動のときだけで、「さらに表示」と同じ操作。窓を元に戻す操作は足さない (「さらに表示」と同じ) |
| RK-05 | 記録の書き込みの失敗が起動の応答を遅らせる・失敗させる | await しない。`record()` は reject せず、失敗は理由キーと errno のコードだけをログに出して捨てる (store が投げても起動の結果が `launching` のままのテスト) |
| RK-06 | `window` の capture の Ctrl+K / Ctrl+F が composer の IME の経路に割り込む | 変換中は何もしない (`preventDefault` もしない)。jsdom は発火順を再現しないので `e2e/ime.spec.ts` で確かめる |
| RK-07 | E2E の偽の capability が過去の一覧を返すようになり、既存の E2E の locator が過去の行にも当たる | 固定データの題を既存の locator (起動・composer・稼働中の行) と重ならない文にし、既存の E2E を通す。過去の区画を描く既存のテストの前提 (空の一覧) が無いことを最初に Grep で確かめる |
| RK-08 | composer の他のボタン (`Send message`・`Stop generating`・`Scroll to bottom`・音声入力) の名前が英語のまま残る | 本 feature は roadmap の (7) が名指す名前と placeholder だけを直す。roadmap の (7) の結論に「残りは composer を次に触る feature (O-5 と X-6 の早いほう。O-7 pr-gate R2 (1) と同じ持ち主)」と書く |
| RK-09 | 書記素ごとの正規化の費用 (数千メッセージ) | 正規化はメッセージの object ごとに 1 回で cache する。語の変化では `indexOf` だけ。1,000 メッセージの走査の時間を参考値として出す (SC-002) |
| RK-10 | 区画の開閉の状態を上げたことで、`SessionListScreen` の既存のテストの前提 (区画ごとの local state) が変わる | 開閉のテスト (未登録は既定で畳む・開く / 畳むの `aria-expanded`) を先に流し、同じ振る舞いのまま上げる |

## Project Structure

### Documentation (this feature)

```text
specs/012-ui-thread-search/
├── spec.md
├── plan.md              # 本ファイル
├── research.md          # R-01〜R-08
├── data-model.md        # §1〜§7 (IPC の形は §4。contracts/ は作らない — 境界は内部の IPC 1 チャネルと引数 1 つで、形の正本は §4 に置く)
├── quickstart.md        # V-1〜V-3
└── tasks.md             # /cl-tasks が作る
```

### Source Code (repository root)

```text
docs/decisions/0045-ui-labels-no-i18n-resources.md   (Confirmation に直書きの基準線)
.specify/memory/constitution.md                       (XV の改定。v1.4.0)
src/domain/session/launch-usage.ts (+ .test.ts)      (新設)
src/domain/capability.ts (+ capability.test.ts 新設)  (launchSession の第 2 引数・getLaunchUsage・IPC_CHANNELS)
src/main/infra/settings/launch-usage-store.ts (+ .test.ts)   (新設)
src/main/app/launch-usage-service.ts (+ .test.ts)    (新設)
src/main/app/session-ipc.ts (+ test) / ipc.ts / composition-root.ts / e2e-capability.ts
src/preload/index.ts
src/renderer/src/features/search/text-search.ts / session-search.ts (+ tests)   (新設)
src/renderer/src/features/session-list/SessionListScreen.tsx (+ test) / labels.ts
src/renderer/src/features/chat/conversation-search.ts / useConversationSearch.ts / ConversationSearchProvider.tsx /
    ConversationSearchBar.tsx / search-highlight.ts (+ tests)   (新設)
src/renderer/src/features/chat/ChatScreen.tsx / transcript-context.ts / labels.ts
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx / thread-list.aui.tsx (注記)
src/renderer/src/components/assistant-ui/elements/command-palette.tsx / conversation-search.tsx   (registry から。採るとき)
src/renderer/src/features/shell/CommandPalette.tsx / palette-commands.ts (+ tests)   (新設)
src/renderer/src/features/shell/AppShell.tsx / CenterPane.tsx / CenterHeader.tsx / labels.ts
src/renderer/src/stores/ui.ts (+ test)
src/renderer/src/features/session/LaunchDialog.tsx / LivePane.tsx / PresetPanel.tsx / useLaunchUsage.ts (新設) /
    running-session-store.ts / running-session-types.ts / RunningSessionsProvider.tsx / running-sessions-view.ts /
    RunningSessionList.tsx / SessionAttentionAnnouncer.tsx / labels.ts (+ tests)
src/renderer/src/test-support/capability.ts
src/renderer/src/assets/main.css                      (::highlight())
e2e/ime.spec.ts / e2e/sidebar-screenshot.spec.ts (新設) / e2e/support/launch.ts / e2e/multi-session.spec.ts /
    e2e/launch-dialog.spec.ts
perf/real-sessions.spec.ts                            (composer の locator の文字列だけ。実行しない)
.dependency-cruiser.js / scripts/constitution/allowlists.mjs / eslint.config.mjs (取り込んだ element に手を入れたとき)
docs/glossary.md / docs/roadmap.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md /
    docs/ui-coverage.md / docs/prompts.md / docs/discovery.md / PLAN.md
specs/013-ui-app-shell/spec.md                        (混ぜないの結論)
specs/010-session-monitoring-view/quickstart-results.md   (リンクだけ)
```

**Structure Decision**: 既存の Electron の 3 層 (`src/domain` / `src/main` + `src/preload` / `src/renderer`) のまま。renderer に `features/search/` を 1 つ足す (Thread search・palette・会話内検索が共有する正規化の置き場)。palette はシェル (`features/shell/`) に置く。

## Complexity Tracking

Constitution Check に正当化の要る違反は無い。
