---
reviewer: architecture-reviewer
gate: pr-gate
round: 1
scope: default+adr-drift
---

# architecture-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: architecture-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Scope**: default (ARCH-1〜7) と ADR-drift (ARCH-3 の集中レビュー) を 1 本にまとめた

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003 / FR-005: `features/shell/{AppShell,Sidebar,CenterPane,CenterHeader}.tsx`
  - FR-004 / FR-006: `RunningSessionsProvider.tsx`、`useShellFocus.ts`、`stores/ui.ts` の `watchedIdOf`、`RunningSessionList.tsx`、`SessionAttentionAnnouncer.tsx`
  - FR-007: `LaunchDialogHost.tsx`、`LivePane.tsx` の `LaunchDialogContent`
  - FR-008 / FR-009: `SettingsDialog.tsx`、`SessionListScreen.tsx` の `seedFolderDraft` / `openSettings('folders')`
  - FR-010: `stores/ui.ts`、`stores/sessions.ts` の `selectionSeq`
  - FR-011: `e2e/support/launch.ts`、`e2e/*.spec.ts`、`perf/real-sessions.spec.ts`、基準画像 (main のまま)
  - FR-012: AD-046。FR-013: glossary・roadmap・ui charter・session charter・`_overview.md`・`ui-coverage.md`・`prompts.md`
  - FR-014 / FR-015: `RightPanel.tsx`、`panel-tabs.ts`、`OverviewTab.tsx`。FR-016: `useSessions.ts`
  - SC-001〜SC-008
- 該当する charter / Confirmation:
  - ui charter: In scope のシェル (:62-66)、業務ルール (:145)、Journey 4 (:121-124)、Cross-domain (:160-170)、Related Specs (:200-203)
  - session charter: Journey 3 (:104-106)、KPI「並列時の滑らかさ」(:144-152)、Cross-domain (:166-170)、Related Specs (:198-204)
  - `_overview.md`: Feature 帰属、判断根拠、M3、依存関係
  - AD-046: Decision 1〜6、Consequences (:38-44)、Confirmation (:52-55)
  - AD-025: 目標レイアウト (:244-277)、§4、§7。AD-024 #18 / AD-028 §5。AD-031 Decision 1
  - AD-038 D5 / Confirmation。AD-043 (X-5 FR-008)。AD-044 (XII)。AD-023 :380-381
  - Constitution VIII / XII / XIII / XIV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲。資格情報の経路は触っていない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲。`protocol.ts` は差分 0
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:4
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

本 PR は renderer の配置と遷移だけを変える。**accepted ADR の Decision 1〜6 に反する実装は見つからなかった。** ずれていたのは AD-046 の Consequences (:38) の文と実装の関係 (H-001) と、記録の不整合・欠け (M/L)。

**ui-coverage-reviewer への申し送り**: `docs/ui-coverage.md:169` の `session-state` の行は「実装済み: LiveSessionPane の状態」になったが、状態のラベルを描いているのはシェルの `CenterHeader`。

### code-gate から申し送られた 2 件への回答

- **L-103 (AD-046 :38 と例外 2 件)**: charter と `stores/ui.ts` への明記だけでは足りない (H-001)。AD-031 に従い AD-046 に日付つきの「訂正」節を足すのが最小の手当て。後続 ADR は要らない (Decision 1〜6 は変わらず、2 件の書き込みは同じ日に承認された spec FR-009 と plan FE-011 が求めていた)
- **M-007 (切り出しの持ち主) の記録**: roadmap :181-185 はほぼ事実どおり (行数 550 / 613 は実物と一致、`trackDerived` / `scheduleActivity`・行の部品・`SessionRowStatus` の置き場は不変)。plan :93 と session charter も事実と合う。欠けが 1 つ: `RunningSessionList` (`MonitorSummary`) が `stores/ui.ts` の focus と設定の開閉を読むようになった (M-001 に含めた)。roadmap の O-7 の行の進捗表示が古い (L-003)

## ADR-drift (ARCH-3 の集中レビュー)

| ADR | 照合した対象 | 結果 |
|---|---|---|
| AD-046 Decision 1〜6 | ランドマーク、サイドバー 4 区画、中央 3 状態と中央のヘッダ、タブの表と既定で畳む、`Content` は DOM だけ、設定は全面のダイアログで閉じると unmount、語彙 | 違反なし |
| AD-046 Consequences | :38 の「session のコンポーネントは面の状態を書かない」 | **H-001** |
| AD-046 Confirmation | V-3 (実機の目視) | 未実施。追跡が無い → **L-003** |
| AD-025 §4 / §7 | ui → domain は型と純粋関数だけ。CSP 不変、inline style なし | 違反なし |
| AD-025 目標レイアウト / R-2 plan :167-169 | 左のペインの素材 `thread-list-sidebar` | 照合して不採用 (research R-04)。ADR を引く箇所がずれている → **L-002** |
| AD-024 #18 / AD-028 §5 | (B) の延期条件は満たされた | 全画面の基準画像の持ち主が無い → **M-002** |
| AD-031 | 訂正節の規則 | H-001 の推奨はこの規則に従う |
| AD-038 D5 / Confirmation | 基準画像の更新は PR で承認。CI の e2e が緑 | 基準画像は main のまま (D5 違反なし)。CI の結果は未記録 → **L-007** |
| AD-043 (X-5 FR-008) | `useRunningSessionStoreWiring` は App の寿命。provider は面の切り替えで外れない | 違反なし |
| AD-044 | シェルは XII の対象外 (ui charter :64-65)。`後続` の ID は不変 | 違反なし。発火条件の死角 → **M-004** |
| AD-023 :380-381 | 「ui の内部構成は規約を課さない。M3 で肥大したら再検討」 | 再検討の契機に当たる → **L-004** |
| AD-037 / AD-034 / AD-035 / AD-036 / AD-041 / AD-019 / AD-033 / AD-020 / AD-001 | composer のガード、transcript の取得経路、起動の経路、権限モードの表示 | 違反なし |
| AD-002〜018, 021, 022, 026, 027, 029, 030, 032, 039, 040, 042 | main / agents / domain / infra の決定 | 該当なし: 差分はこれらの層に及ばない |

## Findings

### [High] AD-046 Consequences (:38) は「session のコンポーネントは面の状態を書かない」と例外なしで書くが、実装には session の一覧から設定の開閉を書く経路が 2 つあり、例外は下位の文書にしか書かれていない (H-001) (scope: feature)

- **観察**: `0046-app-shell-layout.md:38`。実装の書き込みは `SessionListScreen.tsx:196,238` (`seedFolderDraft`。`settings: { open: true, section: 'folders' }`) と `:715,1028` (`openSettings('folders')`)。例外を書いているのは ui charter :166-170 と `stores/ui.ts:13-16` だけ。この 2 件は design の時点で spec FR-009 / plan :25 / tasks FE-011 が決めており、:38 の文は採択の時点で同じ日に承認された要件と食い違っていた
- **同種事象探索**: 面の状態の setter を shell・stores/ui の外 (テスト外) で Grep して **2 件** (`SessionListScreen.tsx:238` / `:1028`)。focus を書くのは `useShellFocus.ts` だけで session の側は **0 件**。読み手は `RunningSessionList.tsx:151-155` と `SessionAttentionAnnouncer.tsx:28`
- **リスク/影響**: accepted ADR は charter より上位で、AD-046 は O-3〜O-6 の置き場所の語彙の正本。AD-046 だけを読む後続は `SessionListScreen` を ADR 違反と判断するか、charter の例外を広げて読む。AD-031 は事実の誤りを ADR 自身の訂正節で直すよう求めている
- **推奨アクション**: (最小案) AD-046 の末尾に「訂正 (2026-10-05 / O-7 pr-gate R1)」節を足す (focus を書くのはシェルだけ、session のコンポーネントは見ているセッションを導くために focus と設定の開閉を読む、設定を「作業フォルダ」で開く 2 導線だけは過去のセッションの一覧が設定の開閉を書く、Decision 1〜6 は変えない)。charter は運用上の正本として残し、訂正節を参照させる。(作り変える案) `SessionListScreen` に callback の props を持たせ `Sidebar` から渡す
- **根拠**: AD-046 :38、AD-031 Decision 1、Constitution の改定手順・Governance の優先順位
- **scope 根拠**: AD-046 は本 PR で起こしたファイル

### [Medium] ui charter の「依存される domain: なし (最上層)」が、O-7 が直下に足した「面の状態」の記述や実装と食い違っている。O-7 は session → `stores/ui.ts` の読み取りを新しく足した (M-001) (scope: feature)

- **観察**: ui charter :163「依存される domain: なし（最上層）」。session charter :168 は ui を挙げていない。`_overview.md:100-101` は `stores/ui.ts` を ui の持ち物と宣言した。`stores/ui.ts` を読む他 domain の画面: session (`RunningSessionList.tsx:24,151-155`。O-7 で新設、`SessionAttentionAnnouncer.tsx`、`SessionListScreen.tsx`)、runtime (`WorkspaceFoldersScreen.tsx:18,241-242`)。design-gate R1 M-001 の手当ては書き込みの規則だけで :163 を直していない。roadmap の「O-7 が変えたもの」にも `RunningSessionList` が `stores/ui.ts` を読む事実が無い
- **推奨アクション**: ui charter :163 に「`stores/ui.ts` は他 domain の操作 UI が読む (session は `watchedIdOf` で focus と設定の開閉を、runtime は `folderDraftSeed` を)。書くのは例外 2 件だけ」を足す。session charter :168 に「ui の `stores/ui.ts` の面の状態を読む」を足す。roadmap の一覧に `MonitorSummary` が読むことを足す
- **根拠**: ARCH-2 / ARCH-5、design-gate R1 architecture M-001

### [Medium] Principle VIII (B) の延期条件は AD-046 で満たされたが、「全画面の基準画像を足すか」は持ち主も契機も無いまま残った (M-002) (scope: feature)

- **観察**: `roadmap.md:128-130` と `plan.md:44` は「決めていない」とし持ち主を書いていない。延期の理由 (シェルが暫定) は AD-046 で消えた。新しく日本語が並ぶ面の検証は jsdom と V-3 だけ (V-3 は未実施)。AD-024 は jsdom を Principle VIII の Automated に数えない
- **推奨アクション**: roadmap :130 に持ち主と判断の契機を書く (例: 「O-3 の design で判断」または「本 E2E / 検証基盤 feature」)。または今決めて理由を残す
- **根拠**: Constitution Principle VIII、AD-024 #18、AD-028 §5、AD-046 Consequences :41

### [Medium] session charter の KPI「並列時の滑らかさ」の基準を O-7 が変えたのに、O-7 のビルドでの E2E の計測値が記録されていない (M-003) (scope: feature)

- **観察**: KPI の計測経路は E2E (`multi-session.spec.ts:189-197` の annotation に p95 / long task) と実機計測。O-7 は roadmap の O-3 の行に基準が変わったと書いたが、quickstart-results には合否しか無く annotation の値が無い (`p95|longTask|long task` を Grep して 0 件)
- **推奨アクション**: 最終ビルドで合格した multi-session の annotation (inputDelayP95・longTaskMax・long task の件数) と、閾値を超えた 1 回の値と条件を quickstart-results に記録し、roadmap の O-3 の行 (2)(c) から参照させる
- **根拠**: ARCH-2、session charter KPI、roadmap O-3 の義務 (2)

### [Medium] ui-coverage-reviewer の発火条件が `features/shell/**` を含まない。AD-046 は O-4〜O-6 の SDK 表示の置き場を右のペインのタブにした (M-004) (scope: feature)

- **観察**: `reviewers.yml:164-178` の ui-coverage-reviewer の `auto_invoke_patterns` に `features/shell` は無い (a11y :47 と ux :94 にだけ足した)。右のペインのタブを SDK 表示の置き場にする決定は AD-046 Decision 4・ui charter :65-66・`panel-tabs.ts`・roadmap の O-4 の行にある。同じ理由で `elements/**` を明示で入れた先例がある (O-2 pr-gate R2 M-101)
- **推奨アクション**: ui-coverage-reviewer に `src/renderer/src/features/shell/panel-tabs.ts` と `src/renderer/src/features/shell/**/*.tsx` を足し、先例と同じ注記を付ける
- **根拠**: Constitution XII の Verification (Manual)、AD-046 Decision 4、AD-044、O-2 pr-gate R2 M-101

### [Low] 「シェル」を canonical term にしたが、OS のシェルの意味の既存の用法と区別していない (L-001) (scope: feature)

- **観察**: glossary の Shell の Counterexamples に OS のシェルとの区別が無い。既存の用法: `chat/labels.ts:56` (`local_bash: 'シェルのコマンド'`)、`roadmap.md:272` (「シェルの Background task」)、`glossary.md:598`、AD-015 :107 / AD-018 :117
- **推奨アクション**: Counterexamples に「OS のシェル (Bash・ログインシェルなど) とは別。アプリの面を指す文書では『アプリのシェル』と書く」を足す。roadmap :272 を「Bash の Background task」に直す
- **根拠**: Constitution XIV、ARCH-7

### [Low] ui-coverage F 節の Thread list sidebar の行が、AD-046 が決めていない element の選択を「AD-046」として引いている。R-2 が残した「ADR が accepted になったら寄せる」の約束の閉じ方が申し送りの表に無い (L-002) (scope: feature)

- **推奨アクション**: ui-coverage.md:338 の引用を「(O-7 research R-04。照合の正本は O-7 の PR の説明)」に直す。plan の申し送りの表に「002 plan:167-169 — 照合して不採用 (research R-04)」の行を足す。AD-046 の本文は変えない
- **根拠**: AD-025 目標レイアウト、Constitution XIII Exceptions、AD-031

### [Low] AD-046 の Confirmation (V-3 の実機の目視) が未実施で、roadmap に追跡が無い。roadmap の O-7 の行の進捗も古い (L-003) (scope: feature)

- **推奨アクション**: roadmap の O-7 の行を「design-gate R1 PASS / code-gate PASS / pr-gate …」にし、「V-3 (AD-046 Confirmation・SC-008 の実機。利用者) は completed にする前に quickstart-results に記録する」を足す
- **根拠**: AD-046 Confirmation、ARCH-3

### [Low] renderer の feature 間の向き (shell → 各 feature。逆は禁止) が機械で強制されていない。AD-023 の「M3 で肥大したら再検討」に当たる (L-004) (scope: system)

- **観察**: renderer の feature は 8 つになり、`features/shell` は 6 つの feature を束ねる上位の層。向きの規則はテスト用の面のコメントにしか無い。本番コードの逆向きは 0 件
- **推奨アクション**: depcruise に `features-not-to-shell` を足し違反サンプルも足す。あるいは AD-023 の再検討を roadmap の system-scope に登録する
- **根拠**: AD-023 Consequences、AD-027、ARCH-4

### [Low] ui charter の In scope の「設定と起動のダイアログ」が、中身の持ち主を区別していない (L-005) (scope: feature)

- **推奨アクション**: :62-64 を「設定と起動のダイアログの枠 (開閉・項目・フォーカスの戻り)。中身 (X-4 の `LaunchDialog`、ランタイム・作業フォルダ・プロバイダ・組み合わせの画面) は各 domain」に直す
- **根拠**: ARCH-2

### [Low] (H) 「focus を書くのは `useShellFocus` だけ」と「session は面の状態を書かない (例外 2)」に、破られたことを検出する手段が無い (L-006) (scope: feature)

- **観察**: `stores/ui.ts` は `setFocus` を公開の操作として export する。他の書き手が無いことを確かめるテスト・規則が無い。今の違反は 0 件
- **推奨アクション**: `setFocus` を公開面から外すか、`features/**` の `setFocus(` / `openSettings(` / `seedFolderDraft(` の出現箇所が許可したファイルに限られることを確かめるテストを足す
- **根拠**: H

### [Low] (H) composer の基準画像は本機で 1px の差で落ちる。合否は PR の CI で見るとしているが、その結果がまだ記録されていない (L-007) (scope: feature)

- **推奨アクション**: PR の CI の e2e job の結果を quickstart-results に記録してから `/cl-done` に進む。落ちた場合は CI の artifact から撮り直し利用者の承認を得る
- **根拠**: Principle VIII (B)、AD-038 D5 / Confirmation、SC-003

### [Low] perf が `e2e/support/launch.ts` (`CLOSTA_E2E` を立てる `launchApp` と同じモジュール) から import するようになったが、perf の ADR の宿題の「`e2e/support` の共有」に反映されていない (L-008) (scope: feature)

- **観察**: `perf/real-sessions.spec.ts:13` が `openLaunchDialog` を `../e2e/support/launch` から import する。perf の安全柵は保たれている
- **推奨アクション**: roadmap :162 に「O-7 で perf が `e2e/support/launch.ts` の `openLaunchDialog` も使うようになった」を足すか、`openLaunchDialog` / `runningRows` を `CLOSTA_E2E` に触れないモジュールに分ける
- **根拠**: roadmap「実機計測ハーネス (`perf/`) の ADR 化」、AD-038 D2

### H の観点 (担当範囲)

- 既存の振る舞いを壊していない根拠: X-5 FR-008 (`App.tsx:16` と E2E `multi-session` 4 passed)、X-4 US-1 AC7 (`AppShell.test.tsx:533`)、FR-016 の順序 (`SessionListScreen.test.tsx` の 2 件。実機は V-3)、composer の描画 (縦 1px のずれを除くと差 73 画素。CI は L-007)
- 自分の指摘を検出できるテスト: H-001 / L-006 は 0 件 (L-006 で提案)。M-001 / M-004 は文書と設定の整合。M-003 は E2E の annotation が観測点として既にあり記録だけが欠けている
- 観測点: `data-focus` 属性がある

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | 面の状態の setter (shell・stores/ui の外、テスト外) | 2 | SessionListScreen.tsx:238 / :1028 (focus を書く箇所は session 側 0 件) |
| M-001 | `useUiStore\|watchedIdOf` (shell・stores の外、テスト外) | session 3 ファイル / runtime 1 ファイル | RunningSessionList.tsx:24,151-155 / SessionAttentionAnnouncer.tsx:3,28 / SessionListScreen.tsx:20,196,715 / WorkspaceFoldersScreen.tsx:18,241-242 |
| M-002 | `全画面の基準画像` | 2 | roadmap.md:130 / plan.md:44 |
| M-003 | `p95\|longTask\|long task` (quickstart-results.md) | 0 | — |
| M-004 | `features/shell` (reviewers.yml) | 2 (ui-coverage-reviewer は 0) | reviewers.yml:47 / :94 |
| L-001 | `シェル` (OS のシェルの意味) | 5 + コード 2 | chat/labels.ts:56 / roadmap.md:272 / glossary.md:598 / 0015:107 / 0018:117 / wsl-cli.ts:13,209-210 |
| L-002 | `thread-list-sidebar\|threadlist-sidebar\|Thread list sidebar` (docs) | 4 + 1 | ui-coverage.md:338 / 0025:253,265 / 0046:15 / 002 plan.md:167-169 |
| L-003 | `V-3` (roadmap / quickstart-results) | roadmap 0 | quickstart-results.md:41 |
| L-004 | `from '@/features/shell` | 2 (本番の逆向き 0) | App.tsx:2 / running-sessions-harness.tsx:4 |
| L-006 | `setFocus(` (テスト外) | 6 (すべて useShellFocus.ts) | useShellFocus.ts |
| L-008 | `from '../e2e/support` (perf) | 2 | real-sessions.spec.ts:11 / :13 |

## Verdict

- Critical: 0
- High: 1 (H-001)
- Medium: 4 (M-001〜M-004)
- Low: 8 (L-001〜L-008)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
