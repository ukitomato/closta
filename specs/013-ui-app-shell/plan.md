# Implementation Plan: アプリのシェル (O-7)

**Branch**: `013-ui-app-shell` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**未承認の判断を含む** (spec の U-1〜U-5)。本 plan は design-gate までの成果物で、利用者の承認まで実装に入らない。

## Summary

上部の 7 つのタブをやめ、サイドバー・中央・右のペインの 3 面にする (AD-046 proposed)。各画面の中身は変えず、置き場所と遷移だけを変える。

- 面の状態を `stores/ui.ts` に 1 つ (data-model §1)。選んだ行の id は今の 2 つのストアのまま、中央に出すものを `focus` で決める
- 稼働中の thread list の runtime の provider をシェル全体に上げる (research R-03)
- サイドバーは 4 つの区画 (data-model §3)、右のペインはタブの表と「概要」(§4 / §5)、設定は全面のダイアログ
- E2E の nav の手順を「新規起動」に直す。基準画像は変えない

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / assistant-ui / Tailwind ([docs/discovery.md](../../docs/discovery.md))
- **targets**: frontend だけ (main / preload / domain / agents を変えない)
- **レイヤ** (renderer):
  - `stores/ui.ts` — `SCREENS` 系を面の状態に置き換える
  - `features/shell/` (新設) — `AppShell.tsx` (3 面の配置と畳み)、`Sidebar.tsx`、`CenterPane.tsx` (focus に応じた中身と中央のヘッダ)、`RightPanel.tsx` と `panel-tabs.ts`、`OverviewTab.tsx`、`SettingsDialog.tsx`、`labels.ts`
  - `features/session/` — `SessionScreen.tsx` を 3 つに分ける: `RunningSessionsProvider.tsx` (runtime の provider)、サイドバーの稼働中の区画 (今の `RunningSessionList`)、中央の実行中のペイン (今の `LiveSessionPane`・`Launching`)。起動ダイアログは `launchOpen` のダイアログに移す。`SessionNavBadge` は区画の見出しへ
  - `features/session-list/SessionListScreen.tsx` — 一覧の部分をサイドバーで使える形に (画面の見出しと `max-w-3xl` の外枠を外す)。`setScreen('chat')` → `focus = 'past'`、`setScreen('folders')` → 設定を「作業フォルダ」で開く
  - `features/chat/ChatScreen.tsx` — 中央の本体として使う。密度の切り替えを中央のヘッダへ
  - `App.tsx` — `AppShell` を描くだけにする。`useRunningSessionStoreWiring()` と `SessionAttentionAnnouncer` は残す
  - `e2e/support/launch.ts` / `e2e/launch-dialog.spec.ts` — nav の「セッション起動」→ サイドバーの「新規起動」
- **既存の起点**: research R-02

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I / II / IV / V / VI / VII / IX / X | N/A | renderer の配置だけを変える。IPC・永続化・プロセスを変えない |
| III (権限ゲート) | ✅ | 起動ダイアログ (選べない選択肢を出さない) の中身を変えない |
| VIII (日本語環境) | ✅ | 新しい文言は `features/shell/labels.ts`。長い日本語の題・フォルダ名はサイドバーと概要で 1 行に切り詰める (component テスト)。composer は変えない。基準画像 (composer の領域) を変えない |
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
- Scope: assistant-ui の Elements、transcript の表示、`docs/ui-coverage.md`、transcript の密度。**シェル (面の配置と遷移) を本 feature で足す (未承認 U-2)**。他 domain の操作 UI (一覧・登録・選択画面) の中身は各 domain
- Principle (domain): 見た目の判断を先送りしない

### Related ADRs

- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) — 作業フォルダが所在を持つ: accepted — 「目標レイアウト」節 (3 ペイン。採用には ADR を要する)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — アプリのシェルを 3 面にする: **proposed** (本 feature で起こした。未承認)
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
| 2 | AD-024:182,198 / AD-028:184 / constitution:165,1031 / 002 plan:168,388 / 003 plan:28 | Principle VIII (B) の延期条件「目標レイアウト ADR が accepted」 | **注記** — 本 feature は (B) の範囲を変えない (composer の領域の基準画像のまま)。AD-046 が accepted になった時点で条件が満たされることを roadmap の E2E / 検証基盤の項目に注記する |
| 3 | `folder-service.ts:55` | 目標レイアウトは Browser / PR Webview を別 WebContents で持つ | **該当なし** — 右のペインの Browser は OPT-panel。注記はそのまま正しい |
| 4 | `App.tsx:16` / `stores/ui.ts:9` | FE-001 アプリシェル (R-1) | **受ける** — 注記を O-7 / AD-046 に直す |
| 5 | glossary:485,949 | 「サイドバー」は位置の説明に限る | **受ける** — 面の名前として定義し直す (FR-013) |
| 6 | ui charter:114 / session charter:99 | 監視ビュー = セッション画面のサイドバー | **受ける** — 「シェルのサイドバーの稼働中の区画」に直す |
| 7 | ui-coverage.md F 節 (Thread list sidebar / Settings / Empty state / Assistant sidebar / Chat panel) | 未使用・「アプリの画面構成と合わない」 | **受ける** — 使うものの使い道を直す。Assistant sidebar / Chat panel の備考は新しいシェルで読み直す |
| 8 | roadmap の O-3〜O-6 の行 | 依存は O-2 | **受ける** — 依存に O-7 を足す。O-4〜O-6 に右のペインのタブの候補を注記 |

## 実装方針

### 面の状態

`stores/ui.ts` を data-model §1 に置き換え、型検査で今の `screen` の参照をすべて洗い出して直す。`seedFolderDraft` は設定を「作業フォルダ」で開く。

### provider の持ち上げ

`SessionScreen` の `AssistantRuntimeProvider` (稼働中の thread list の runtime。`useRunningThreadList` / `useLiveSession` / `useLiveRuntime`) を `RunningSessionsProvider` に切り出し、`AppShell` の全体を包む。`LiveSessionPane` は中央の本体、`RunningSessionList` はサイドバーの区画で、同じ provider の内側にある。過去の一覧と `ChatScreen` は自分の provider を内側に持つ。

### シェル

`AppShell` は 3 面を横に並べ、§2 の幅と畳みを持つ。幅の監視は `ResizeObserver` (ウィンドウの幅) で、自動の畳みは状態の変化として 1 回だけ起こす。分割の element は registry を先に確かめる。

### 設定のダイアログ

左に 4 項目とテーマ、右に今の 4 画面。項目の切り替えで画面を unmount してよい (今の画面も切り替えで unmount している)。閉じたら「設定」のボタンにフォーカスを戻す。

### 起動ダイアログ

`launchOpen` で開くダイアログに `NewSessionDialog` を載せる。起動中 (`launch.phase === 'launching'`) はダイアログの中で `Launching` を出し、受け付けられたら閉じて `focus = 'running'`。拒否・失敗はダイアログの中に今どおり出す。

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
| RK-04 | 設定の画面がダイアログの中で幅が足りず崩れる | ダイアログは全面 (左の項目 + 右の画面の `max-w-3xl`)。今の画面の外枠と同じ幅を保つ |
| RK-05 | 自動で畳む処理がウィンドウのサイズの変化のたびに状態を揺らす | 閾値を割った瞬間に 1 回だけ畳み、利用者の操作を優先する (data-model §2) |

## Project Structure

```
docs/decisions/0046-app-shell-layout.md                 (新設。proposed)
src/renderer/src/App.tsx
src/renderer/src/stores/ui.ts (+ test)
src/renderer/src/features/shell/AppShell.tsx / Sidebar.tsx / CenterPane.tsx / RightPanel.tsx / panel-tabs.ts / OverviewTab.tsx / SettingsDialog.tsx / labels.ts (+ tests) (新設)
src/renderer/src/features/session/SessionScreen.tsx → RunningSessionsProvider.tsx / LivePane.tsx (分割)
src/renderer/src/features/session/RunningSessionList.tsx / SessionNavBadge.tsx
src/renderer/src/features/session-list/SessionListScreen.tsx
src/renderer/src/features/chat/ChatScreen.tsx
src/renderer/src/components/assistant-ui/elements/ (registry から取り込む element があれば)
e2e/support/launch.ts / e2e/launch-dialog.spec.ts
docs/glossary.md / docs/roadmap.md / docs/domains/{ui,session}/charter.md / docs/domains/_overview.md / docs/ui-coverage.md / docs/prompts.md
```
