# Implementation Plan: アプリのシェル (O-7)

**Branch**: `013-ui-app-shell` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

spec の U-1〜U-5 と AD-046 は 2026-10-05 に利用者が承認した。

## Summary

上部の 7 つのタブをやめ、サイドバー・中央・右のペインの 3 面にする (AD-046 proposed)。各画面の中身は変えず、置き場所と遷移だけを変える。

- 面の状態を `stores/ui.ts` に 1 つ (data-model §1)。選んだ行の id は今の 2 つのストアのまま、中央に出すものを `focus` で決める。focus の書き手はシェルの 1 か所で、2 つのストアの選択の操作を購読する。読み上げと承認待ちのボタンは `watchedId` を共有する
- 稼働中の thread list の assistant-ui の runtime (`AssistantRuntimeProvider`。glossary の `AgentRuntime` ではない) の provider をシェル全体に上げる (research R-03)
- サイドバーは 4 つの区画 (data-model §3)、右のペインはタブの表と「概要」(§4 / §5。既定で畳む)、設定は全面のダイアログ (閉じたら中を unmount)
- 失敗したセッションを閉じたら起動ダイアログを前回の設定と理由つきで開く (X-4 US-1 AC7)。過去の区画の初回の取得はランタイムの一覧の後 (FR-016)
- E2E と perf の nav の手順を「新規起動」に直す。右を既定で畳むので composer の幅は今と同じで、基準画像は変えない

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / assistant-ui / Tailwind ([docs/discovery.md](../../docs/discovery.md))
- **targets**: frontend だけ (main / preload / domain / agents を変えない)
- **レイヤ** (renderer):
  - `stores/ui.ts` — `SCREENS` 系を面の状態に置き換える
  - `features/shell/` (新設) — `AppShell.tsx` (3 面の配置と畳み)、`Sidebar.tsx`、`CenterPane.tsx` (focus に応じた中身と中央のヘッダ)、`RightPanel.tsx` と `panel-tabs.ts`、`OverviewTab.tsx`、`SettingsDialog.tsx`、`useShellFocus.ts` (focus の書き手と `watchedId`。data-model §1)、`labels.ts`
  - `features/session/` — `SessionScreen.tsx` を 3 つに分ける: `RunningSessionsProvider.tsx` (assistant-ui の runtime の provider)、サイドバーの稼働中の区画 (今の `RunningSessionList`。`nav` を `section` に、`ThreadListNew` を外す)、中央の実行中のペイン (今の `LiveSessionPane`・`Launching`)。起動ダイアログは `launchOpen` のダイアログに移す。`SessionNavBadge` は区画の見出しへ。`SessionAttentionAnnouncer` と `nextAwaiting` は `watchedId` を受ける。`running-session-store` に選択の操作の通知 (`selectionSeq`) を足す
  - `features/session-list/` — `SessionListScreen.tsx` の一覧の部分をサイドバーで使える形に (画面の見出しと `max-w-3xl` の外枠を外す。data-model §3)。`setScreen('folders')` → 設定を「作業フォルダ」で開く。`useSessions.ts` の初回の取得を `listRuntimes()` の解決の後にする (FR-016)。`locationLabelOf` とグループの表示の関数を export する (「概要」と共有)
  - `features/chat/ChatScreen.tsx` — 中央の本体として使う。密度の切り替えを中央のヘッダへ
  - `App.tsx` — `AppShell` を描くだけにする。`useRunningSessionStoreWiring()` と `SessionAttentionAnnouncer` は残す
  - `e2e/support/launch.ts` / `e2e/launch-dialog.spec.ts` / `perf/real-sessions.spec.ts` — nav の「セッション起動」→ サイドバーの「新規起動」(locator はサイドバーに限る)。perf は CI で流さず、本 feature でも実行しない。perf の安全柵・出力は変えないので、roadmap の「実機計測ハーネスの ADR」の条件 (perf の安全柵・出力を変える) には当たらない
- **既存の起点**: research R-02

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I / II / IV / V / VI / VII / IX / X | N/A | renderer の配置だけを変える。IPC・永続化・プロセスを変えない |
| III (権限ゲート) | ✅ | 起動ダイアログ (選べない選択肢を出さない) の中身を変えない |
| VIII (日本語環境) | ✅ | 新しい文言は `features/shell/labels.ts`。長い日本語の題・フォルダ名はサイドバーと概要で 1 行に切り詰める (component テスト)。composer は変えない。右のペインを既定で畳むので、既定のウィンドウの幅で中央は 780px、composer は上限 704px のままで基準画像は変わらない (data-model §2)。変わったら撮り直し、人間の見た目の承認を quickstart-results に記録する |
| XI (観測可能な垂直スライス) | ✅ | 各 US は component テストと E2E で観測でき、見た目は quickstart V-3 |
| XII (ui-coverage) | ✅ | SDK が emit する情報の表示を足さない (A〜E 節の差分 0)。F 節の使い道 (Thread list sidebar / Settings / Empty state) を同じ PR で直す |
| XIII (element 優先) | ✅ | thread-list-sidebar・Settings・Empty state・resizable を registry で先に確かめる (research R-04) |
| XIV (glossary) | ✅ | シェル・サイドバー・中央のヘッダ・右のペイン・設定のダイアログを先に glossary に足す |
| XV (Multi-language) | ✅ | 文言は `labels.ts` |

Constitution 自体の変更なし。AD-024 / AD-028 の Principle VIII (B) の延期条件「目標レイアウト ADR が accepted」は、AD-046 が accepted になると満たされる (X-2 が composer の領域で (B) を既に CI に載せている。全画面の基準画像を足すかは本 feature で決めない)。

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する
- Scope: assistant-ui の Elements、transcript の表示、`docs/ui-coverage.md`、transcript の密度。**シェル (面の配置と遷移) を本 feature で足す (U-2)**。他 domain の操作 UI (一覧・登録・選択画面) の中身は各 domain
- Principle (domain): 見た目の判断を先送りしない

### Related ADRs

- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) — 作業フォルダが所在を持つ: accepted — 「目標レイアウト」節 (3 ペイン。採用には ADR を要する)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェルを 3 面にする: **accepted** (本 feature で起こし、2026-10-05 に承認)
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — supervisor とセッションスレッド: accepted — 稼働中の接続は画面の寿命と切り離す (X-5 FR-008)
- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の実在確認: accepted
- [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) / [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5 — Principle VIII (B) の延期条件に目標レイアウト ADR が入っている

### Glossary excerpt

- **稼働中セッション一覧**: `RunningSessionList` / 監視ビュー。「サイドバー」は位置の説明に限る (今の定義。本 feature で面の名前として定義し直す)
- **TranscriptView**: 選んだセッションの過去メッセージを仮想化描画する画面状態
- **Density (情報密度)**: 監視ビューの行の密度と transcript の密度は別の設定

## 上流からの申し送り

```
# 1) spec_id
rg -n "013-ui-app-shell"               → 0 件 (本 spec と AD-046 を除く。新しい ID)
# 2) feature ID と主題
rg -n "\bO-7\b"                        → 0 件 (新しい ID。本 spec と AD-046 を除く)
rg -n "目標レイアウト|最初の UI 系 feature|FE-001" (docs / PLAN.md / src / e2e / constitution / specs の spec・plan)
                                       → 30 件。下表に割り当てる (src の FE-001 は X-3 / X-4 / X-5 の tasks の ID で、R-1 の FE-001 ではないものを除く)
# 3) 実名リスト方式のルール
#    eslint.config.mjs / .dependency-cruiser.js / scripts/constitution/allowlists.mjs に App.tsx・stores/ui.ts の名指しは無い
#    (tasks の最初に Grep で確かめる)。新設の features/shell は renderer の既存のレイヤ規則に入る
```

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 1 | AD-025:244-277 | 目標レイアウト。採用には ADR。最初の UI 系 feature がシェルを組み替える | **受ける** — AD-046 (proposed)。右のペインの Browser / PR Webview の CSP の条件は AD-046 Decision 4 で引き継ぐ |
| 2 | AD-024:182,198 / AD-028:184 / constitution:165,1031 / 002 plan:168,388 / 003 plan:28 | Principle VIII (B) の延期条件「目標レイアウト ADR が accepted」。採択時に基準画像の撮り直しになる | **受ける** — 撮り直しが要るなら持ち主は本 feature。右を既定で畳むことで composer の幅を保ち、撮り直しを避ける (data-model §2)。変わったら撮り直して人間の承認を記録する (FR-011)。AD-046 の accepted で延期条件が満たされることを roadmap の E2E / 検証基盤の項目に注記する。全画面の基準画像を足すかは本 feature で決めない |
| 3 | `folder-service.ts:55` | 目標レイアウトは Browser / PR Webview を別 WebContents で持つ | **該当なし** — 右のペインの Browser は OPT-panel。注記はそのまま正しい |
| 4 | `App.tsx:16` / `stores/ui.ts:9` | FE-001 アプリシェル (R-1) | **受ける** — 注記を O-7 / AD-046 に直す |
| 5 | glossary:485,949 | 「サイドバー」は位置の説明に限る | **受ける** — 面の名前として定義し直す (FR-013) |
| 6 | ui charter:114 / session charter:99 | 監視ビュー = セッション画面のサイドバー | **受ける** — 「シェルのサイドバーの稼働中の区画」に直す |
| 7 | ui-coverage.md F 節 (Thread list sidebar / Settings / Empty state / Assistant sidebar / Chat panel) | 未使用・「アプリの画面構成と合わない」 | **受ける** — 使うものの使い道を直す。Assistant sidebar / Chat panel の備考は新しいシェルで読み直す |
| 8 | roadmap の O-3〜O-6 の行 | 依存は O-2 | **受ける** — 依存に O-7 を足す。O-4〜O-6 に右のペインのタブの候補を注記 |
| 9 | roadmap:163-172 | `running-session-store.ts` / `RunningSessionList.tsx` の切り出しの持ち主は「store に派生値を足すか、監視ビューの行を触る次の feature」 | **該当なし** — (design の時点の判断。実装は下の追記) 本 feature は行の部品と派生値を変えない (`nav` → `section`・`ThreadListNew` を外す・選択の操作の通知)。roadmap に「O-7 は当たらない」と注記する。**実装の追記 (code-gate convention M-007)**: 実装では共通の行の部品 `thread-list.aui.tsx` に選択の強調の有無と押下の通知を、`nextAwaiting` に「見ているセッション」の引数を足した。roadmap が名指す行の部品と派生値の追跡は変えていないので、利用者が「当たらない」のままと決めた (USER 決定 2026-10-05) |
| 10 | `useSessions.ts:71-77` / `src/main/index.ts:192-196` | セッション一覧は起動直後に取らない (ランタイム検出の後) | **受ける** — FR-016。コメントを新しい前提 (区画は常時マウント、初回の取得は `listRuntimes()` の後) に直す |
| 11 | `perf/real-sessions.spec.ts:189,191` / roadmap O-3 の義務 (2)(c) | 実機計測は nav から起動する。行の切り替えの計測 | **受ける** — 手順を直す (FR-011)。(2)(c) の計測の基準が新しいシェル (focus の切り替え) で変わる注記を roadmap に |
| 12 | glossary:389-390 / session charter:101,194 | 没入ビュー = セッション画面のペイン。ナビの件数 | **受ける** — FR-013 |
| 13 | OPT-pty (roadmap:298 / `_overview.md`:76 / AD-025:274) | Terminal タブは OPT-pty | **受ける** — OPT-panel から Terminal を外す (FR-013) |

## 実装方針

### 面の状態

`stores/ui.ts` を data-model §1 に置き換え、型検査で今の `screen` の参照をすべて洗い出して直す (`SessionAttentionAnnouncer.tsx:28`・`RunningSessionList.monitor.test.tsx:244-291` を含む)。`seedFolderDraft` は設定を「作業フォルダ」で開く。focus の書き手は `useShellFocus` の 1 か所で、`running-session-store` の選択の操作の通知 (`selectionSeq`) と `stores/sessions.ts` の選択を購読し、data-model §1 の表のとおりに focus と `launchOpen` を決める。session のコンポーネントは面の状態を書かない。

### provider の持ち上げ

`SessionScreen` の `AssistantRuntimeProvider` (稼働中の thread list の assistant-ui の runtime。`useRunningThreadList` / `useLiveSession` / `useLiveRuntime`) を `RunningSessionsProvider` に切り出し、`AppShell` の全体を包む。`LiveSessionPane` は中央の本体、`RunningSessionList` はサイドバーの区画で、同じ provider の内側にある。過去の一覧と `ChatScreen` は自分の provider を内側に持つ。

### シェル

`AppShell` は 3 面を横に並べ、§2 の固定の幅と畳みを持つ (幅のドラッグは入れない。依存を足さない)。幅の監視は `ResizeObserver` (ウィンドウの幅) で、自動の畳みは状態の変化として 1 回だけ起こす。

### 設定のダイアログ

左に 4 項目とテーマ、右に今の 4 画面。項目の切り替えと閉じたときに中の画面を unmount する (Provider の画面の平文の秘密を残さない。覚えるのは項目の id だけ)。閉じたら開いた元の要素にフォーカスを戻す。

### 起動ダイアログ

`launchOpen` で開くダイアログに `NewSessionDialog` を載せる。起動中 (`launch.phase === 'launching'`) はダイアログの中で `Launching` を出し、閉じられない。受け付けられたら閉じて `focus = 'running'` (`useShellFocus` が起動の受け付けの選択を受ける)。拒否・失敗はダイアログの中に今どおり出す。失敗したセッションを閉じたら `launchOpen = true` にし、ダイアログは `lastConfig` と `previousFailure` を出す (X-4 US-1 AC7)。

### 過去の区画の初回の取得

`useSessions.ts` の初回の `listSessions()` を、`listRuntimes()` の解決の後に直列化する (`runtime-store.list()` は未検出なら検出を待ってから返す)。区画が常時マウントでも、R-2 の「検出より先に列挙しない」を保つ。main は変えない。

### テスト

- シェルの component テスト (US-1〜US-4 の AC。vitest-axe)
- 既存の component テストのうち、`setScreen` / 画面の ID を使うものを直す
- E2E は nav の手順だけ直し、CI で流す (stub。夜間に実行してよい)

## ADR

**AD-046「アプリのシェルを 3 面にする」を proposed で起こした** (本 design の成果物)。accepted は利用者が行う。AD-025 (accepted) は変えない。

## 機械強制の変更

なし。画面の ID の残りは型検査と grep (quickstart V-1) で見る。

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 未承認の判断 (U-1〜U-5) が覆る (とくに右のペインの幅・設定をダイアログにする) | design-gate で止める。見た目は実機の目視 (quickstart V-3) で利用者が決める |
| RK-02 | 入れ子の `AssistantRuntimeProvider` で、過去の一覧・transcript の hook が外側の runtime を拾う | 過去の一覧と transcript の component テストを、外側に稼働中の provider がある形で流す |
| RK-03 | provider の持ち上げで、稼働中の接続の寿命 (X-5 FR-008) が変わる | `useRunningSessionStoreWiring` は App に残し、provider は runtime の購読だけを持つ。`multi-session.spec.ts` (E2E) を流す |
| RK-04 | 設定の画面がダイアログの中で、過去の一覧が 280px のサイドバーの中で、幅が足りず崩れる | ダイアログは全面 (左の項目 + 右の画面の `max-w-3xl`)。過去の一覧は外枠と見出しを外し、残りは折り返しで収める (data-model §3)。component テストで長い日本語のフォルダ名を流す。実機の見た目は quickstart V-3 |
| RK-05 | 自動で畳む処理がウィンドウのサイズの変化のたびに状態を揺らす | 閾値を割った瞬間に 1 回だけ畳み、利用者の操作を優先する (data-model §2) |
| RK-06 | 過去の区画の常時マウントで、ランタイム検出の前に列挙が走る (WSL の所在が「未検出」になりキャッシュに残る) | FR-016 / 上の「過去の区画の初回の取得」。component テストで順序を確かめ、実機は quickstart V-3。E2E は `listSessions` が空を返すので検出できない |
| RK-07 | 右のペインを既定で畳んでも、帯の 40px の分で composer の基準画像が変わる | 中央 780px で composer は上限 704px のまま (data-model §2)。変わったら撮り直して人間の承認を記録する (FR-011) |

## Project Structure

```
docs/decisions/0046-app-shell-layout.md                 (新設。2026-10-05 accepted)
src/renderer/src/App.tsx
src/renderer/src/stores/ui.ts (+ test)
src/renderer/src/features/shell/AppShell.tsx / Sidebar.tsx / CenterPane.tsx / RightPanel.tsx / panel-tabs.ts / OverviewTab.tsx / SettingsDialog.tsx / useShellFocus.ts / labels.ts (+ tests) (新設)
  (実装で足した: CenterHeader.tsx (中央のヘッダ) / LaunchDialogHost.tsx (起動ダイアログ) / useAutoCollapse.ts / shell-layout.ts (面の幅))
src/renderer/src/features/session/SessionScreen.tsx → RunningSessionsProvider.tsx / running-sessions-view.ts / LivePane.tsx (分割)
src/renderer/src/features/session/RunningSessionList.tsx / SessionNavBadge.tsx / SessionAttentionAnnouncer.tsx / session-view.ts / running-session-store.ts (選択の操作の通知) / labels.ts
src/renderer/src/features/session-list/SessionListScreen.tsx / useSessions.ts / group-label.ts (新設) / rows.ts
src/renderer/src/test-support/running-sessions-harness.tsx (新設。X-5 の 2 ペインのテストの観点を保つ面)
src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx (注記)
src/renderer/src/features/chat/ChatScreen.tsx
src/renderer/src/components/assistant-ui/elements/ (registry から取り込む element があれば)
src/main/index.ts (注記だけ)
e2e/support/launch.ts / e2e/launch-dialog.spec.ts / e2e/README.md
perf/real-sessions.spec.ts (手順だけ。実行しない)
docs/glossary.md / docs/roadmap.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/ui-coverage.md / docs/prompts.md
```
