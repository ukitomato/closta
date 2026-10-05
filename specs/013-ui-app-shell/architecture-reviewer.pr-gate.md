---
reviewer: architecture-reviewer
gate: pr-gate
round: 2
scope: default+adr-drift
---

# architecture-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: architecture-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2
**Scope**: default (ARCH-1〜7) と ADR-drift (ARCH-3 の集中レビュー) を 1 本にまとめた

## 初回読了 viewpoint

- FR/SC (R1 の後の修正が触れたもの): FR-006 / SC-002 (`watchedIdOf` が `launchOpen` も見る)、FR-007 (`LaunchDialogHost` の `dismissLaunchNotice` とフォーカス、`useShellFocus` の失敗の close)、FR-008 / FR-009 (設定のダイアログ)、FR-001 / FR-002 / FR-014 (スキップリンク・開閉ボタン・`useCollapseFocus`)、FR-016 / SC-008 (`useSessions` の取得中と取得時刻 0)、FR-012 / SC-006 (AD-046 の訂正の節、accepted への追随)、FR-013 (記録)
- touched files に当たる charter / Confirmation: ui charter In scope :62-69・Cross-domain :163-175、session charter Cross-domain :166-171・Related Specs :203-206、AD-046 Consequences :38・訂正 :57-69・Confirmation :52-55、AD-031 Decision 1、AD-024 / AD-036 の訂正の先例、AD-025 §4 / §7、AD-038 D5、AD-043、AD-044、AD-023、X-4 spec US-1 AC7、Constitution XIV・Governance の優先順位
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`protocol.ts` は PR 全体で差分 0)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:3

## スコープ要約

R1 の後の修正は renderer の負の経路と a11y の手当て、記録の追随が中心。domain・agents・preload・main/app の差分は 0。**accepted ADR の Decision に反する変更は見つからなかった。AD-046 に足した訂正の節は AD-031 の規則に合っている。** 新しく見つかったのは、R1 の修正が入れた 2 つの振る舞いの変更 (シェルが session のストアの起動の状態を書く / 「見ているセッション」の定義) が上位の記録に追随していないこと。

## Round 1 の指摘の判定

| R1 ID | 判定 | 確かめた事実 |
|---|---|---|
| H-001 | **resolved** | AD-046 :57-69 に日付つきの訂正の節。Decision 1〜6 は差分 0。形の不足は L-102 |
| M-001 | **partially** | ui charter と session charter に読み取りを書いた。roadmap の「O-7 が変えたもの」に `MonitorSummary` が `stores/ui.ts` を読むことが無い (M-101 にまとめた)。ui charter :168 の文言が不正確 (L-101) |
| M-002 | **resolved** | roadmap :130-133 と O-3 の行に持ち主 |
| M-003 | **resolved** | quickstart-results に 2 回分の値。O-3 の行から参照 |
| M-004 | **resolved** | reviewers.yml の ui-coverage-reviewer に shell と LivePane |
| L-001 | **resolved** | glossary に OS のシェルとの区別。roadmap の O-6 は「Bash の Background task」 |
| L-002 | **resolved** | F 節が research R-04 を引き、R-2 plan の約束を閉じたと書く |
| L-003 | **resolved** | roadmap の O-7 の行。V-3 の記録の粒度は L-105 |
| L-004 | **resolved** (追跡) | roadmap system-scope (6) |
| L-005 | **resolved** | ui charter の In scope が枠と中身に分かれた |
| L-006 | **unresolved** | 持ち越し |
| L-007 | **unresolved** (CI 待ち) | 持ち越し |
| L-008 | **resolved** | roadmap の perf の ADR 化の項目に追記 |

## ADR-drift (R1 の後の修正の差分に対して)

| ADR | 照合した対象 | 結果 |
|---|---|---|
| AD-046 Decision 1〜6 | スキップリンク、開閉ボタン、設定の外側の押下、件数の印、起動ダイアログの名前、tablist の 0 件 | 違反なし |
| AD-046 訂正 (:57-69) | AD-031 Decision 1 | **合っている**。形の不足は L-102 |
| AD-046 Decision 4 | `prompts.md:312` の OPT-panel の起動文 | 「すべてに従う」と書きながら 1 項目欠ける → L-103 |
| AD-046 Confirmation | V-3 は記録済み。SC-003 は CI 待ち | L-105 / L-007 |
| AD-025 §4 / §7 | renderer → domain の import は増えていない。CSP は緩めていない | 違反なし |
| AD-038 D5 | 基準画像の差分 0 | 違反なし |
| AD-043 | provider / wiring の寿命 | 違反なし |
| AD-044 | ui-coverage-reviewer の発火条件、F 節の「SDK の外」 | 違反なし (AD-044 は F 節の使い道の語の集合を閉じていない) |
| AD-023 | 本番コードの feature → shell の逆向き import | 0 件 |

**AD-046 の訂正の節は AD-031 に合っている**: (1) 種別は事実誤認の訂正 (:38 は採択の時点で同じ日に承認された FR-009 / FE-011 と食い違っていた。Decision 1〜6 は変わらず、読み手は同じ決定に至る) (2) 日付と経緯がある (3) 決定の変更を含まない (4) 先例 (AD-036 :106、AD-024 :213) と整合する。

## Findings

### [Medium] R1 の修正で、シェル (ui) が session のストアの起動の状態を書くようになった (`dismissLaunchNotice`)。X-4 US-1 AC7 の開き直しも「失敗のセッションを中央に出していたときだけ」になった。どちらも session の側の記録に無い (M-101) (scope: feature)

- **観察**: `running-session-store.ts:55-59` に公開の操作 `dismissLaunchNotice`、呼び出し元は shell の 2 件 (`LaunchDialogHost.tsx:39`、`useShellFocus.ts:42`)。R1 の時点では shell は session のストアを購読するだけだった。AC7 の開き直しは `ui.focus === 'running'` のときだけになった。記録があるのは data-model だけで、session charter の O-7 の項、roadmap の「O-7 が変えたもの」、ui charter の「面の状態」に無い。roadmap の行数 (613 / 550) は今の 632 / 552 と合わない
- **同種事象探索**: `dismissLaunchNotice` は src 3 ファイル + data-model 1 件、docs 0 件。shell から session のストアの操作を呼ぶ箇所は 2 件
- **リスク/影響**: 起動の流れを触る session の feature (X-6) や切り出しの持ち主が、起動の状態の書き手が session の外にもあること、AC7 の開き直しが ui の面の状態に依存することを知らずに変える。境界 (遷移のロジックは session の store の中) は保たれている。利用者の「O-7 は当たらない」の判断は覆らない
- **推奨アクション** (最小案。文書の追記だけ): session charter の O-7 の項に `dismissLaunchNotice` と AC7 の開き直しの条件を足す。roadmap の一覧に `dismissLaunchNotice` と `MonitorSummary` が `stores/ui.ts` を読むことを足し、行数を 632 / 552 に直す。ui charter の「面の状態」に「起動の告知を消す操作 (`dismissLaunchNotice`) だけは呼ぶ」を足す
- **根拠**: ARCH-2 / ARCH-5、ui charter Out of scope :73-74、X-4 spec US-1 AC7、R1 M-001

### [Medium] 「見ているセッション」の定義が、R1 の修正 (起動ダイアログを開いている間は見ていない扱い) に追随していない箇所が 3 つある。うち 1 つは glossary (M-102) (scope: feature)

- **観察**: 古い定義のまま: `glossary.md:855-856`、`session-view.ts:434-435` (`announcements` の doc)、`SessionAttentionAnnouncer.tsx:13` (規則の表)。実装はどれも `watchedIdOf` を通すので振る舞いは正しい
- **リスク/影響**: glossary は Ubiquitous Language の正本。後続が glossary の定義で読み上げ・件数のボタンを設計すると、R1 で直した不具合を作り直す
- **推奨アクション**: 3 か所を「設定のダイアログも起動ダイアログも開いていないとき」に直す。より良くは glossary を「定義は 013 data-model §1 の `watchedIdOf`」の参照にし、コードの 2 か所も `watchedIdOf` を指すだけにする
- **根拠**: Constitution XIV、ARCH-7、AD-046 Decision 6

### [Low] ui charter :168 の「書くのは下の『面の状態』の例外 2 件だけ」は、runtime の画面が `stores/ui.ts` を書く事実と合わない (L-101) (scope: feature)

- **観察**: `WorkspaceFoldersScreen.tsx:242,301,312` は `clearFolderDraftSeed` を呼ぶ (使い切りの受け渡しの受け手が消す)
- **推奨アクション**: :168 を「runtime は `folderDraftSeed` を読み、受け取ったら消す (`clearFolderDraftSeed`。使い切り)。面の状態を他 domain が書くのは下の例外 2 件だけ」に直す
- **根拠**: ARCH-2 / ARCH-5

### [Low] AD-046 の訂正の節の形の不足: 訂正した文 (:38) からの参照が無い。「`stores/ui.ts` はそこを参照する」が事実でない。規則の本文が 3 か所に写されている (L-102) (scope: feature)

- **推奨アクション**: :38 の末尾に「(下の『訂正』節)」を足す (AD-024 の先例と同じ)。`stores/ui.ts:13-16` を ui charter の参照に縮めるか、:69 から `stores/ui.ts` を外す。charter :171 はそのままでよく、ADR の訂正の節は事実の記録、運用で書き換えるのは charter の側、とどちらかに 1 文で書く
- **根拠**: AD-031 Decision 1、AD-024 の先例、ARCH-3

### [Low] `prompts.md` の OPT-panel の起動文が「AD-046 Decision 4 の境界のすべてに従う」と書きながら、「タブの表の `Content` では表さない」を欠く (L-103) (scope: feature)

- **推奨アクション**: 「外部コンテンツのタブはタブの表の `Content` では表さず、OPT-panel で種別を足す」を足すか、roadmap の OPT-panel の行の参照の形にする
- **根拠**: AD-046 Decision 4、ARCH-3

### [Low] 「取得時刻 0 = 未取得」が main と renderer の暗黙の取り決めになった。DTO にも roadmap の項目にも書かれていない (L-104) (scope: feature)

- **推奨アクション**: roadmap の (4) に「main を直したら `useSessions.ts` の取得時刻 0 の除外を外す。それまでは取得時刻 0 = 未取得は DTO に無い取り決め」を足す。DTO に注記するかは (4) の持ち主が決める
- **根拠**: ARCH-4 / ARCH-5

### [Low] (H) 持ち越し: 「focus を書くのは `useShellFocus` だけ」に、破られたことを検出する手段が無い (L-006) (scope: feature)

- **観察**: R1 と同じ。R1 の修正で `UiState` が export になった
- **推奨アクション**: R1 と同じ

### [Low] (H) 持ち越し: composer の基準画像の CI の結果が未記録 (L-007) (scope: feature)

- **推奨アクション**: PR の CI の e2e の結果を記録してから `/cl-done` (completed) に進む

### [Low] (H) AD-046 Confirmation の証跡 (V-3) が、どのコミットに対するものか特定できない (L-105) (scope: feature)

- **観察**: quickstart-results の V-3 は「pr-gate R1 の修正を含む作業ツリー」(2026-10-05) と書くが、コミットの記載が無い
- **推奨アクション**: V-3 の見出しに確かめたツリーのコミットを足し、その後に変えたファイルがあれば列挙する
- **根拠**: AD-046 Confirmation、ARCH-3、H

### H の観点 (担当範囲)

- M-101 の振る舞いは `AppShell.test.tsx:770,784` が確かめる。store 側の `dismissLaunchNotice` の単体テストは 0 件で、`launching` のときは何もしない分岐は通っていない
- M-102 の振る舞いは `ui.test.ts:52` と `AppShell.test.tsx:802` が確かめる。文書の揃え漏れを検出する手段は無い
- 既存の振る舞いを壊していない根拠: vitest 119 files / 1960 passed、E2E 11 passed (composer は L-007)、depcruise 違反 0、Constitution 検証 ok 20、逆向き import 0 件、基準画像の差分 0、V-3 全項目 OK

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `dismissLaunchNotice` | src 3 ファイル + data-model 1 件、docs 0 件 | running-session-store.ts:59,436 / LaunchDialogHost.tsx:39 / useShellFocus.ts:42 / data-model.md:48 |
| M-102 | `見ているセッション\|watchedId` (定義を文で書く箇所) | 9 (古いもの 3) | glossary.md:855-856 / session-view.ts:434-435 / SessionAttentionAnnouncer.tsx:13 |
| L-101 | `useUiStore` (shell・stores の外の書き込み) | 4 ファイル | SessionListScreen.tsx:202,248,730,1043 / WorkspaceFoldersScreen.tsx:242,301,312 / TranscriptDensityToggle.tsx:22 (ui) |
| L-102 | 訂正した箇所に印を置く先例 | AD-024 4 か所 / AD-036 2 か所 | 0046:38 (印なし) |
| L-103 | `OPT-panel` (prompts.md) | 1 | prompts.md:312 |
| L-104 | renderer で `fetchedAt` を 0 と判定 | 1 | useSessions.ts:93 / dto.ts:133 / session-service.ts:189 |
| L-006 | `setFocus(` (テスト外) | 6 (すべて useShellFocus.ts) | useShellFocus.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 2 (M-101, M-102)
- Low: 7 (L-101, L-102, L-103, L-104, L-105, 持ち越しの L-006, L-007)
- Round inheritance: resolved from 1: 10 / partially: 1 (M-001。残りは M-101 に統合) / unresolved: 2 (L-006, L-007) / new: 7 (M-101, M-102, L-101〜L-105)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
