# Implementation Plan: Thread 検索と探す操作 (O-3)

**Branch**: `012-ui-thread-search` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-6 と AD-045 / AD-046 は 2026-10-05 に利用者が承認した。O-7 (spec 013) のマージの後に実装する。

## Summary

セッション一覧の文字列の絞り込み (Thread search)、開いている transcript の会話内検索、Command palette、空の状態の統一を renderer の中で作る。session charter の KPI「再利用率」の計測経路として、起動元 (`preset` / `manual`) を起動の IPC に足し、main が日ごとの回数だけを `launch-usage.json` に持つ。i18n はリソース化しないと AD-045 (proposed) に記録する。

- 一致の規則は 1 つの純関数 (data-model §1。research R-02)
- 会話内検索は本文のデータで数え、transcript に `scrollToMessage` を足し、強調は CSS Custom Highlight API で DOM を書き換えずに掛ける (R-03)
- palette は element を先に確かめ、Ctrl+K を IME の変換中に無視する (R-04)
- 記録は store / service / domain の純関数の 3 つに分け、起動の応答を遅らせない (R-05。data-model §4)
- roadmap に O-8 / O-9 を足し、O-3 の義務 (O-1 から) (2) を O-8 に移す (R-01)

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / assistant-ui / `@tanstack/react-virtual` ([docs/discovery.md](../../docs/discovery.md))
- **レイヤ**:
  - domain: `src/domain/session/launch-usage.ts` (新設。`LaunchOrigin`・記録の型・足す / 刈り込む / 合計する純関数)、`src/domain/capability.ts` (`launchSession` の第 2 引数・`getLaunchUsage` のチャネル)
  - main: `src/main/infra/settings/launch-usage-store.ts` (新設)、`src/main/app/launch-usage-service.ts` (新設。直列化と日付)、`session-ipc.ts` (`handleLaunchSession` で `checkLaunchOrigin` と「`launching` のときだけ await せずに記録」、`SessionIpcDeps` に `recordLaunchUsage` / `getLaunchUsage`、読み出しの handler の本体)、`ipc.ts` (チャネルの登録と port の transfer だけ。既存の分担 `session-ipc.ts:20-32`)、`composition-root.ts` (配線)、`e2e-capability.ts` (記録と読み出しのメモリ内の fake。ファイルに書かない)
  - preload: `index.ts` (`launchSession` の第 2 引数・`getLaunchUsage`)
  - renderer の起動元の経路: `LaunchDialog.tsx` (`applyPreset` で `preset`) → 起動の面 (O-7 の `NewSessionDialog`。`session.launch(config, origin)`) → `running-session-store.ts` の `launch(config, folderLabel, origin)` (`lastOrigin` を `lastConfig` と一緒に持つ) → capability の `launchSession(config, origin)`。型は `running-session-types.ts` (`SessionActions`)、テストの stub は `test-support/capability.ts`
  - renderer: `features/search/session-search.ts` (新設)、`features/session-list/SessionListScreen.tsx` (O-7 で過去の区画になった一覧に検索欄と AND の絞り込み)、`features/chat/` (会話内検索の hook・バー。中央のヘッダのボタン)、`components/assistant-ui/elements/thread.aui.tsx` (`scrollToMessage` と検索中の追従の停止)、`features/palette/` (新設。操作の表と palette)、`features/shell/AppShell.tsx` (O-7。palette のマウントと Ctrl+K)、`features/session/LaunchDialog.tsx` / `PresetPanel.tsx` (起動元・回数の表示)、本 feature の空の状態の 4 か所
- **前提**: O-7 ([spec 013](../013-ui-app-shell/spec.md)) がマージされた main の上に作る。ブランチは今 `013-ui-app-shell` の上に積んである。下の「既存の起点」の行番号は O-7 の前の main のもので、O-7 の後に読み直す
- **既存の起点** (2026-10-04 の調べ):
  - `SessionListScreen.tsx:694-731` — 所在の絞り込み (`narrowToLocation`。:706。IPC を往復させない)。`:800` `filtering`、`:844-859` 空の表示の優先順位 (`filtered-out` を含む)、`:1036-1119` 画面の `EmptyState`
  - `thread.aui.tsx:170-187` — 40 件を超えると仮想化。`:316` `useVirtualizer`、`:337` 最下部への `scrollToIndex`。`:770` text part は `MarkdownText`
  - `ChatScreen.tsx:88-90,108-112` — transcript の 2 つの空の表示。`:117-119` 密度の切り替えのバー
  - O-7 の後: 面の状態は `stores/ui.ts` の `ShellState` (focus・設定・畳み・`launchOpen`)。focus の書き手は `features/shell/useShellFocus.ts` (013 data-model §1)。`SCREENS` / `setScreen` は無い
  - `capability.ts:122,196,199-216` — `launchSession` と `IPC_CHANNELS`。`preload/index.ts:58`。`ipc.ts:164-172,282-291` — 送信元の検査と起動の handler。`session-ipc.ts:137-144` — 形の検査。`session-launch-service.ts:187-202` — 受け付けと拒否
  - `preset-store.ts:74-178` / `preset-service.ts:51-56` — store の書き込みと直列化の型
  - `LaunchDialog.tsx:323-327` — `applyPreset`。`:347-355` — `launch`。`:395-399` — `PresetPanel`

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス名前空間) | ✅ | パスを解決しない。一致の対象は画面が描く表示用の文字列 (グループの見出し・`cwdDisplay`) だけで、`cwd.value` (PathDTO) を直接は使わない (Windows とディストロの名前空間を同じ平面で比べない)。`cwdDisplay` が非 null なのは所在の決まらない出自だけ (`SessionListScreen.tsx:386-392`) なので、登録フォルダは見出しの表示名で一致させる |
| II (プラットフォーム差を infra に閉じる) | ✅ | ファイルの読み書きは `infra/settings` の store に閉じる。パスは composition root が `userData` から渡す (AD-023 §8) |
| III (権限ゲート) | ✅ | 起動元は起動の可否と `SessionLaunchConfig` に影響させない (spec FR-009 / FR-010) |
| IV (SDK 経由) | N/A | SDK の呼び出し・query の options を変えない |
| V (資格情報非永続) | ✅ | 記録は日付と 2 つの回数だけ。固定のキー集合のテストで、識別子・秘密が構造上入らないことを守る (data-model §4) |
| VI (永続環境を構築しない) | N/A | 子プロセスを足さない |
| VII (supervisor Electron 非依存) | N/A | agents を変えない |
| VIII (日本語環境) | ✅ | 検索は NFKC で全角 / 半角を吸収する。Ctrl+K / 検索欄の Enter / Esc は IME の変換中に反応しない (X-2 の `isComposing` / 229) |
| IX (main をブロックしない) | ✅ | 記録の書き込みは await せず、起動の応答を待たせない。検索は renderer の中 |
| X (正本は Claude Code) | ✅ | 検索は既に取得した要約行と本文を読むだけ |
| XI (観測可能な垂直スライス) | ✅ | 各 US は component テストで観測でき、実機の目視は quickstart V-3 |
| XII (ui-coverage) | ✅ | SDK が emit する情報の表示を足さない (A〜E 節の差分 0)。F 節の element の使い道を同じ PR で直す (spec FR-015) |
| XIII (element 優先) | ✅ | `EmptyState` は既存の element。palette / 検索は registry の element を先に確かめる (research R-04) |
| XIV (glossary) | ✅ | 用語を先に glossary に足す (spec FR-016) |
| XV (Multi-language) | ⚠ 改定を伴う | 新しい文言は `labels.ts` (data-model §5)。リソース化しない判断は AD-045。AD-045 の accepted (/cl-implement の着手の条件) は 2026-10-05 に済み。Constitution XV の改定 (MINOR) は本 feature の PR に含める |

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements / Tool UI の実装、transcript の表示、`docs/ui-coverage.md` の維持、transcript の情報密度。セッションの起動ロジックと状態遷移は session
- 関わる他 domain: `session` (KPI「再利用率」の持ち主・起動の IPC。spec U-2)

### Related ADRs

- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の実在確認: accepted — palette / 検索 / Empty state の element の出所
- [AD-023](../../docs/decisions/0023-application-architecture.md) — アプリケーションアーキテクチャ: accepted — store は `electron` を import せず、パスは composition root が渡す (§8)
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の取得経路: accepted — 本文は port を通り main を経由しない (検索は renderer の中で閉じる)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (h) — 繰越先の指名: accepted — 再利用率の計測経路を O-3 に指名
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当: accepted — F 節の使い道を同じ PR で直す
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェルを 3 面にする: **accepted** (O-7。2026-10-05 に承認) — 置き場所の語彙
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を i18n リソース化しない: **accepted** (本 feature で起こし、2026-10-05 に承認)
- [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5 — 持ち主のいない延期を残さない (O-8 / O-9 の登録)

### Glossary excerpt

- **TranscriptView**: 選んだセッションの過去メッセージを assistant-ui で仮想化描画する画面状態
- **Density (情報密度)**: 監視ビューの行の密度 (O-1) と transcript の密度 (O-2) は別の設定
- **プリセット**: 起動設定の組を名前付きで保存したもの。長期資格情報の値を含めない
- 新しく足す: Thread search / 会話内検索 / Command palette / 起動元 / 起動の利用記録 (spec FR-016)

## 上流からの申し送り

```
# 1) spec_id
rg -n "012-ui-thread-search" docs .specify tests specs     → 0 件 (spec 自身を除く。新しい ID)
# 2) feature ID
rg -n "O-3\b" (node_modules を除く)                      → 130 件 / 49 ファイル
#    gate の報告 (specs/*/*-reviewer.*.md・design-gate・pr-gate・analyze) と本 spec を除いた 39 件を下表に割り当てる
# 3) 実名リスト方式のルール
#    eslint.config.mjs / .dependency-cruiser.js / scripts/constitution/allowlists.mjs に O-3 の名指しは 0 件。
#    新設の features/search・features/palette は renderer の既存のレイヤ規則に入る。新設の infra/settings の store は既存の settings の store と同じ規則
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | roadmap:255 (O-3 の行) | 義務 (X-4): 再利用率の計測経路 | **受ける** — US-4 / FR-009〜FR-013 |
| 2 | roadmap:255 | 義務 (O-1) (1): i18n リソース化の判断・`target-finder.ts` の 2 本 | **受ける** — FR-014 / AD-045 (proposed) |
| 3 | roadmap:255 / `#o3-kpi-smoothness` | 義務 (O-1) (2) (a)〜(d) | **送る** — O-8 (新規。R-01)。アンカーと参照元 (session charter:146・010 quickstart-results:66・roadmap:155) を O-8 に直す |
| 4 | roadmap:155 | 実機計測ハーネスの ADR は「O-3 が先に着手したら O-3 が持つ」 | **送る** — O-3 は perf を変えないので O-8 が持つ。字面を直す |
| 5 | roadmap:170-172 | `running-session-store.ts` の切り出しは O-3 の i18n リソース化の前に。持ち主は「store に派生値を足すか、監視ビューの行を触る次の feature」 | **該当なし** — リソース化しない (AD-045)。本 feature は store の `launch` に起動元の引数と `lastOrigin` を足すが、派生値ではなく行も触らないので切り出しの発動条件に当たらない。持ち主は roadmap の記録のまま。字面に AD-045 を注記する |
| 22 | 013 spec (Clarifications / Out of Scope) | 稼働中と過去を 1 つの一覧に混ぜるかは O-3 の後に再検討 | **受ける (閉じる)** — 混ぜない。palette が両方を候補にし、Thread search は過去の区画にある (FR-016) |
| 6 | roadmap:191-195 | Principle XV の棚卸し: `target-finder.ts` の 2 本を必ず含める | **受ける** — AD-045 Decision 3 |
| 7 | roadmap:289 / PLAN.md:706 | D-1 の依存は O-3 | **該当なし** — 依存は変えない。AD-045 の再検討の条件 (b) を D-1 の行に注記する |
| 8 | constitution:849 | i18n の要否は M3 までに判断 | **受ける (改定は accepted の後)** — FR-014 |
| 9 | session charter:146 | 滑らかさの残りの持ち主 = O-3 | **送る** — O-8 に直す (FR-016) |
| 10 | session charter:159 / AD-041:148 / 008 spec:396,415 / 008 plan:139,281 / 008 tasks:214,219 | 再利用率の計測経路は O-3 | **受ける** — charter:159 を計測経路の記述に直す。AD-041 (accepted) は変えない |
| 11 | ui charter:186 / `_overview.md`:62 / PLAN.md:702,729 | O-3 の題と M3 の範囲 | **受ける** — 題を「Thread 検索と探す操作」に、M3 の範囲に O-8 / O-9 を足す。PLAN.md は roadmap を指す注記だけ |
| 12 | ui-coverage.md:226,243,258,268,278,300,339,348 | F 節で O-3 に預けた 8 element | **受ける** — 4 つは使い道を本 feature の表示に、4 つ (Activity graph / Heat graph / Message timing / Trace waterfall) は O-9 に (FR-015) |
| 13 | prompts.md:244-248 | O-3 のプロンプト | **受ける** — 範囲に合わせて直し、O-8 / O-9 のプロンプトを足す |
| 14 | 010 spec:223 / research R-08 / plan:54,109 / tasks:109 | i18n の判断を O-3 に | **受ける** — #2 と同じ |
| 15 | 010 spec:120,211 / tasks:84,119 / quickstart-results:53,66 | 滑らかさの宿題は O-3 | **送る** — #3 と同じ。010 の spec / tasks (completed) は変えず、quickstart-results のリンクだけ直す |
| 16 | 010 spec:276 | 一覧の並べ替え・絞り込み・検索は O-3 | **受ける (範囲を限る)** — 稼働中の一覧は palette の候補として探せる。稼働中の一覧そのものに検索欄は付けない (最大 10 件) |
| 17 | 010 plan:119 / 002 spec:597 | 大規模件数向けの描画最適化は必要なら O-1 / O-3 | **該当なし** — 一覧の仮想化は足さない。Thread search で目当てを絞れるので、件数の多さの対処を先に検索で行う。必要になったら O-9 で見る (O-9 の行に書く) |
| 18 | 002 spec:596 / 004 plan:18,163 | Thread 検索 / observability は O-3 | **受ける** — US-1 / US-2 |
| 19 | 011 spec:231 / research:121 / plan:159 / data-model:143 / tasks:34,108 | `receivedMessages` の注記を O-3 の義務 (2) に | **送る** — O-8 の行に移す (注記ごと) |
| 20 | `thread-list.aui.tsx:38` | 検索は O-3 | **受ける** — 注記を「Thread search は `SessionListScreen` の検索欄 (O-3)」に直す |
| 21 | `.claude/agents/po-reviewer.md:33` | `PO-3` (観点の番号) | **該当なし** — feature ID ではない |

## 実装方針

### Thread search (US-1)

`session-search.ts` (data-model §1) を作り、`SessionListScreen` の区画の導出で既存の所在の絞り込みの後に当てる。対象にグループの見出しの文字列を入れるため、見出しの導出 (`folderLabels.nameOf` と未登録の見出し) を関数にして一覧と共有する。一致 0 件は新しい `search-empty` (data-model §1)。語は `stores/sessions.ts` に (永続化しない)。区画の開閉の `useState` は書き換えず、検索中は畳まれたグループも開いて描く。

### 会話内検索 (US-2)

`features/chat/useConversationSearch.ts` (data-model §2) と検索のバー。transcript の context に `scrollToMessage(index)` と `searching` を足し、`thread.aui.tsx` は `searching` の間は最下部への追従を止める。強調は `features/chat/search-highlight.ts` が描かれた DOM の text node に `Range` を作る。jsdom は `CSS.highlights` を持たないので、テストは `Range` の作成 (どの text node のどこか) を検査し、`CSS.highlights` は差し替え可能にする。

### Command palette (US-3)

`features/palette/commands.ts` (data-model §3) と `CommandPalette.tsx`。O-7 の `AppShell` にマウントし、`window` の keydown (capture) で Ctrl+K を受ける。IME の変換中は無視する。開く前の `document.activeElement` を覚えて閉じたら戻す。

### 再利用率 (US-4)

`launch-usage.ts` (domain。暦日の計算も純関数) → `launch-usage-store.ts` (infra) → `launch-usage-service.ts` (app。直列化と読み込みの状態) → `session-ipc.ts` (`handleLaunchSession` / 読み出し) → `ipc.ts` (登録だけ)。`LaunchDialog` は `applyPreset` を呼んだら `origin = 'preset'` を覚え、新しく開いたら `manual`。拒否・失敗の後に前回の設定で作り直すときは、ストアの `lastOrigin` を戻す。`PresetPanel` は `getLaunchUsage()` を開いたときに 1 回読み、`unreadable` は「記録を読めません」。

### Empty state

既存の element `EmptyState` を、検索の一致 0 (Thread search・会話内検索)・palette の候補 0・記録無しに使う。シェルの空の状態は O-7 が持つ。

### 記録の追随

glossary → roadmap (O-3 の行・O-8 / O-9 の追加・system-scope の ADR の持ち主・切り出しの注記・D-1 の注記) → `_overview.md` → charter 2 つ → `ui-coverage.md` F 節 → prompts → discovery (`launch-usage.json`)。Constitution XV の改定 (MINOR。AD-045 が accepted の後、本 feature の PR で。改定手順 2 / 4)。

## ADR

**AD-045「UI の文言を i18n リソース化しない」を proposed で起こした** (本 design の成果物)。accepted は利用者が行う。Constitution XV の改定 (PATCH) は accepted の後で、本 feature の PR に含めるか別の PR にするかは accepted の時点で利用者が決める。

ほかの決定は ADR を要しない: 起動の IPC の入力の追加は計測用の任意の値で、AD-041 の起動ゲート (権限面・env・起動の設定) を変えない。`launch-usage.json` は settings の store と同じ置き場・書き方 (X-4) を継ぐ。

## 機械強制の変更

- `IPC_CHANNELS` の集合の固定テストを新設する (今は無い。SC-006)
- `launch-usage` の記録のキー集合の固定テスト (SC-005)
- reviewers.yml: `src/main/infra/settings/**` で database-reviewer が code-gate / pr-gate に起動される (既存。変えない)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 仮採用した判断 (U-1〜U-4) が覆る | 2026-10-05 に利用者が推奨案どおり承認した。覆ったら spec を直して design-gate からやり直す |
| RK-02 | CSS Custom Highlight API の強調が markdown の描画とずれる | 件数は本文で数え、強調は描画の中の一致すべてに掛ける (research R-03)。実機の目視 (quickstart V-3) |
| RK-03 | registry の palette / 検索の element が assistant-ui の runtime を前提にしていて合わない | Radix の Dialog と listbox で作り、F 節の備考に理由を書く (R-04) |
| RK-04 | 仮想化の `scrollToIndex` が可変の高さで目標の位置に止まらない | 移動の後に要素が描かれたら `scrollIntoView` で合わせ直す。component テストは index が描かれる範囲に入ることだけを見る |
| RK-05 | 記録の書き込みの失敗が起動の応答を遅らせる | await しない。失敗は理由キーと errno のコードだけをログに出して捨てる (テストで、store が投げても起動の結果が `launching` のまま) |
| RK-06 | window の capture の Ctrl+K / Ctrl+F が composer の IME の経路に割り込む | 変換中は何もしない (`preventDefault` もしない)。`e2e/ime.spec.ts` に「変換中に Ctrl+K / Ctrl+F を押しても開かず、変換が確定できる」を 1 ケース足す (jsdom は発火順を再現しない) |
| RK-07 | 強調の位置が正規化でずれて例外を出す | data-model §2 の 2 つの位置の表と範囲の検査。長さの変わる文字のテスト |

## Project Structure

```
docs/decisions/0045-ui-labels-no-i18n-resources.md   (新設。proposed)
src/domain/session/launch-usage.ts (+ .test.ts)      (新設)
src/domain/capability.ts                              (launchSession の第 2 引数・getLaunchUsage)
src/main/infra/settings/launch-usage-store.ts (+ .test.ts) (新設)
src/main/app/launch-usage-service.ts (+ .test.ts)    (新設)
src/main/app/validate.ts / session-ipc.ts (+ test) / ipc.ts / composition-root.ts / e2e-capability.ts
src/renderer/src/features/session/running-session-store.ts / running-session-types.ts / (O-7 の) 起動の面
src/renderer/src/test-support/capability.ts
src/renderer/src/assets/main.css (`::highlight()` の規則)
e2e/ime.spec.ts (変換中の Ctrl+K / Ctrl+F の 1 ケース)
src/preload/index.ts
src/renderer/src/features/search/session-search.ts (+ .test.ts) (新設)
src/renderer/src/features/palette/commands.ts / CommandPalette.tsx / labels.ts (+ tests) (新設)
src/renderer/src/features/chat/useConversationSearch.ts / ConversationSearchBar.tsx / search-highlight.ts (+ tests) (新設)
src/renderer/src/features/chat/ChatScreen.tsx / labels.ts / transcript-context.ts
src/renderer/src/components/assistant-ui/elements/thread.aui.tsx / thread-list.aui.tsx (注記)
src/renderer/src/features/session-list/SessionListScreen.tsx / labels.ts
src/renderer/src/features/session/LaunchDialog.tsx / PresetPanel.tsx / labels.ts
src/renderer/src/stores/sessions.ts / features/shell/AppShell.tsx (O-7)
tests/ipc-channels.test.ts                            (新設。IPC_CHANNELS の集合の固定)
docs/glossary.md / docs/roadmap.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/ui-coverage.md / docs/prompts.md / docs/discovery.md / PLAN.md
specs/010-session-monitoring-view/quickstart-results.md (リンクだけ)
```
