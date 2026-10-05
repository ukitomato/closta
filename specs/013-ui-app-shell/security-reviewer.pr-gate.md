# security-reviewer レビュー: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06 (pr-gate Round 2)
**Reviewer**: security-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2

結論: Critical 0 / High 0 / Medium 0 / Low 4 (R1 から持ち越し 2・新規 2)。R1 の Medium 2 件は閉じた。R1 の後の修正 (7d46352..bb6f547) による新しいセキュリティの退行は見つからなかった。

## 初回読了 viewpoint

- FR/SC:
  - FR-001: CSP と `protocol.ts` は変えていない。Dialog の inline `<style>` の扱いは記録を訂正済み (spec.md:159 / research.md:49-53)。AppShell.tsx:26 だけ文言がずれている → L-101
  - FR-003 / FR-004: 入れ子の `AssistantRuntimeProvider`。過去ログの composer のテストを追加済み (AppShell.test.tsx:969-983) → M-002 は解消、前提の確認が弱い点は L-102
  - FR-007: `dismissLaunchNotice` と `useDialogReturnFocus` を追加
  - FR-008 / US-3 AC2 / SC-004: 秘密は unmount で消える。テストを追加済み (AppShell.test.tsx:865-885) → L-001 は解消、前提の確認が無い点は L-102
  - FR-012 / FR-014: AD-046 Decision 4 → L-004 は解消、L-005 は system-scope に移した
  - FR-015 / US-4 AC5: 双方向制御文字のテストは今も無い → L-002
  - FR-016 / SC-008: `listRuntimes` を待つ間も取得中。取得時刻 0 の通知は受けない
  - SC-001: `protocol.ts` と preload の差分は 0
- touched files に該当する charter / Confirmation: ui charter :54-60 (CSP の基線) → L-101。AD-025 §7 → L-101。AD-046 Decision 4 / Confirmation、訂正の節 (セキュリティの条件は変えていない) → L-004 / L-005。AD-038 D3 / D4 → H 節。Constitution Principle V → L-001 / L-102
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-025 §7 の CSP の条件は B で見た)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security-reviewer は G を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:3

## スコープ要約

R1 の後の修正は 53 files (+2294 -348)。src の変更は renderer だけで、main の変更は `src/main/index.ts:194-198` のコメントだけ。`src/preload/**`・`src/main/app/{ipc,window,protocol}.ts` は差分 0。依存も増えていない。

確かめた事実 (指摘にはしない):

1. スキップリンク (AppShell.tsx:53-63): クリックは `preventDefault` で止める。新しいウィンドウは `setWindowOpenHandler` が常に deny (window.ts:65-68)。ハッシュの遷移は同じ文書の中で `did-navigate` を起こさない
2. フォーカスの移動: `querySelector` / `getElementById` に渡す値は型付きの定数だけ。移動先は「設定」「新規起動」・開閉のボタン・タブ・`main` だけで、承認カードの許可 / 拒否のボタンに移る経路は無い。起動の受け付けで composer が取ったフォーカスは奪わない
3. store の操作: `dismissLaunchNotice` は起動中は何もせず `lastConfig` を残す。`watchedIdOf` は起動ダイアログの間も承認待ちを読み上げる方向に変わった (読み上げはフォルダの表示名と状態だけ)
4. 取得時刻 0 の通知を受けない処理: main 側で `fetchedAt` が書かれるのは `commit` (session-service.ts:551) だけで、初回の取得の後に 0 に戻る経路は無い。取り直し・登録の解除の結果を握りつぶす経路にはならない
5. `vi.mock('@/features/chat/useTranscript')`: 差し替えるのは取得の結果だけで、内側の provider (`isDisabled: true`) と Thread / composer は本物を描く。`toBeDisabled()` は入れ子の解決の退行を検出できる
6. R2 で足した行に `dangerouslySetInnerHTML` / `innerHTML` / `openExternal` / `window.open` / `localStorage` / `ipcRenderer` / `console.` / `eval(` / `createElement('style')` / `.style.` は 0 件。足した `title=` 属性は正規化・検証済みの値を属性として出すだけ

## R1 の指摘ごとの判定

| R1 ID | 判定 | 事実 |
|---|---|---|
| M-001 (Dialog の inline `<style>`) | **partially** (本 PR で直す分は解消、残りは持ち主付きで移した) | research.md:49-53 と spec.md:159 は事実どおりに訂正。E2E の違反の収集と nonce は roadmap の system-scope (1) に持ち主付きで登録。AppShell.tsx:26 の要約はずれている → L-101 |
| M-002 (過去ログの composer と外側の runtime) | **resolved** | AppShell.test.tsx:969-983。前提の確認と `sendPrompt` の確認が無い点は L-102 |
| L-001 (秘密を入れて閉じ、開き直すと空) | **resolved** | AppShell.test.tsx:865-885。閉じる前に値が入ったことを確かめていない点は L-102 |
| L-002 (U+202E のテスト) | **unresolved** (invoker が直さないと判断) | 防御は domain の入口と正規化で塞がれている。ただし tasks FE-042 は `[x]` のまま、テストは 0 件で記録が実際とずれている |
| L-003 (vitest-axe 0.1.0) | **unresolved** (予定) | PR の説明はまだ無い。`/cl-done` で確かめる |
| L-004 (OPT-panel の要約) | **resolved** | roadmap の OPT-panel の行と prompts に Decision 4 の条件をすべて書いた |
| L-005 (`webviewTag` を明示しない) | **resolved** (system-scope に登録) | roadmap の system-scope (2) |

## Findings

### [Low] AppShell.tsx の規則の表だけが、CSP に弾かれて失われる CSS を「スクロールバーの幅の補正だけ」と書いており、他の 3 つの記録と食い違う (L-101) (scope: feature)

- **観察**: `AppShell.tsx:26` は「失うのはスクロールバーの幅の補正だけ」。research.md:51 は「スクロールバーの幅の補正と body の overflow の固定」、spec.md:159 と roadmap.md:164 は「scroll-lock の CSS だけ」。実体 (`react-remove-scroll-bar/dist/es2015/component.js:13`) は `body[data-scroll-locked] { overflow: hidden !important; ... }` と余白の補正
- **同種事象探索**: `失うのは` で対象 4 件。ずれているのは AppShell.tsx:26 だけ
- **推奨アクション**: research R-04 と同じ文言にするか、参照の形にする
- **根拠**: AD-025 §7、ui charter:54-60、OWASP ASVS V14.4

### [Low] R1 の指摘に応えて足した 2 本の負の経路のテストが、前提 (秘密を入れたこと・外側の composer が有効なこと) を確かめておらず、条件が変わると黙って空振りする (L-102) (scope: feature)

- **観察**: `AppShell.test.tsx:872-875` は `fireEvent.change` の後に値が入ったことを確かめない。`:975-979` は稼働中を選んだ時点で外側の composer が有効であることを確かめない。`:980-982` は `messages.length` だけを見る (Harness が `sendPrompt` の mock を公開していない)
- **推奨アクション**: (1) 値が `'sk-plain'` になったことを確かめる (2) 稼働中を選んだ時点で外側の composer が `toBeEnabled()` (3) Harness に `sendPrompt` の mock を出し `not.toHaveBeenCalled()` を確かめる
- **根拠**: Constitution Principle V、plan RK-02、CWE-441

### [Low] (R1 から持ち越し) US-4 AC5 の双方向制御文字をシェルで確かめるテストが無く、tasks FE-042 は完了のまま (L-002) (scope: feature)

- **推奨アクション**: 最小の案は FE-042 の文言を「双方向制御文字は domain の正規化と入口の検査が持つ (`build-normalize.test.ts:68` / `validation.ts`)。シェルは DTO の値をテキストとして描くだけ」に直すこと。テストを足すなら ChatScreen.test.tsx:435 と同じ形で 1 本
- **根拠**: OWASP ASVS V5.3、CWE-451

### [Low] (R1 から持ち越し) vitest-axe 0.1.0 の SEC-8 の確認結果が、まだ PR の説明に書かれていない (L-003) (scope: feature)

- **推奨アクション**: `/cl-done` で PR の説明に確認結果 (推移的な依存・install script が無いこと・使うのは `results.violations` だけ) を書く
- **根拠**: OWASP A06:2021、AD-023

## H 節

- 既存の境界は退行していない (preload / ipc / window / protocol の差分 0。新しい IPC 0 件)
- production-inert: `e2e/support/launch.ts` の変更は locator の手順だけ。`CLOSTA_E2E` のゲートは不変
- 入れ子の provider での入力の宛先・秘密の寿命: テストで解消。前提の確認は L-102
- スキップリンク: 遷移を止めることのテストは無いが、止め損ねても main の規則で無害
- observability: CSP の違反を集める観測点は roadmap の system-scope (1) に持ち主付きで登録済み

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `失うのは` | 5 (対象 4。ずれは 1) | AppShell.tsx:26 (ずれ) / research.md:51 / spec.md:159 / roadmap.md:164 |
| L-102 | `toBeEnabled` / `sendPrompt` / `provider-secret` (AppShell.test.tsx) | 2 (composer は 0) / 1 (スタブだけ) / 2 | AppShell.test.tsx:306,309 / :220 / :872,883 |
| L-002 | `202[A-Ea-e]\|206[6-9]\|bidi\|双方向` (features/shell) | 0 | — |
| (確認) | `href=` (src/renderer/src) | 2 | components/file.tsx:229 / AppShell.tsx:54 |
| (確認) | `fetchedAt` (session-service.ts) | 4 | session-service.ts:189,286,551,619 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved from 1: 4 (M-002 / L-001 / L-004 / L-005) / partially: 1 (M-001) / unresolved: 2 (L-002 / L-003) / new: 2 (L-101 / L-102)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
