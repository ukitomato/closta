# security-reviewer レビュー: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05 (pr-gate Round 1)
**Reviewer**: security-reviewer
**Spec**: specs/013-ui-app-shell/spec.md

結論: Critical 0 / High 0 / Medium 2 / Low 5。

## 初回読了 viewpoint

- FR/SC:
  - FR-001: CSP と `protocol.ts` は変えていない。取り込む部品は本番の CSP の下で動くものに限る → M-001
  - FR-003 / FR-004: 中央の切り替えと、入れ子の `AssistantRuntimeProvider` → M-002
  - FR-007: 起動ダイアログを Radix の Dialog にした → M-001
  - FR-008 / US-3 AC2 / SC-004: 設定のダイアログを unmount して、平文の秘密を残さない → L-001
  - FR-009: `seedFolderDraft` は main が返した PathDTO をそのまま運ぶだけ (`stores/ui.ts:40-45`)
  - FR-011: E2E と perf のハーネス (production-inert) → H 節
  - FR-012 / FR-014: AD-046 Decision 4 (外部コンテンツの境界)。`Content` は DOM の中に描くものだけ (`panel-tabs.ts:12-13`) → L-004 / L-005
  - FR-015 / US-4 AC5: IPC と preload は足していない。会話由来の文字列はテキストとして描く → L-002
  - FR-016: 既存の IPC (`listRuntimes` / `listSessions`) を順番に呼ぶだけ
  - SC-001: `protocol.ts` の差分 0。vitest-axe を足した → L-003
- touched files に該当する charter / Confirmation:
  - ui charter :53-60 (CSP の基線) → M-001
  - AD-025 :131-143 (§7)、:240-242、:268-273 → M-001 / L-004
  - AD-046 Decision 4 / 5 と Confirmation (SC-001〜SC-005) → L-001 / L-004 / L-005
  - AD-038 D3 / D4 と Confirmation :113-115 → M-001 / H 節
  - Constitution Principle V (平文の秘密の寿命) → L-001
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:0 Low:3
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:1 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-025 §7 の CSP 条件は B で確認した)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security-reviewer は G を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

renderer だけの変更 (93 files)。main の変更は `src/main/index.ts:192-197` のコメントだけ。`src/preload/**`・`src/main/app/ipc.ts`・`window.ts`・`protocol.ts` は diff stat に無い。

確かめた事実 (指摘にはしない): 追加行に `dangerouslySetInnerHTML` / `innerHTML` / `style={` / `.style.` / `createElement('style')` / `href=` / `openExternal` / `window.open` / `localStorage` / `ipcRenderer` / `console.*` は 0 件。secret のパターンは 1 件で誤検出 (`task_progress`)。`stores/ui.ts` は永続化しない。`BrowserWindow` は `sandbox: true` / `contextIsolation: true` / `nodeIntegration: false` のまま。承認カードと中央のヘッダは同じ `view.live` から描く。

design-gate の自分の指摘の引き継ぎ: M-002 は AD-046 Decision 4 と `panel-tabs.ts:12-13` で解消 (要約は L-004)。M-003 は `img` の payload は解消、双方向制御文字のテストが無い (L-002)。L-001 は解消。L-002 は unmount は実装、AC どおりのテストが無い (L-001)。M-001 は新しい依存は増えていない、ただし既存の Dialog の振る舞いを見ていない (M-001)。

## Findings

### [Medium] シェルの主な経路に置いた Radix の Dialog が、開くたびに本番の CSP が弾く inline の `<style>` を差し込む。記録には「CSP に触れない」と書いてあり、E2E はこの違反を検出しない (M-001) (scope: feature)

- **観察**: `DialogContent` は毎回 `DialogOverlay` を描き (`components/ui/dialog.tsx:57-58`)、Overlay は `RemoveScroll` で包まれ (`@radix-ui/react-dialog/dist/index.mjs:116`)、既定の `removeScrollBar: true` で `RemoveScrollBar` → `styleSingleton` が `document.createElement('style')` を head に足す (`react-style-singleton/dist/es2015/singleton.js:5-11,24-25`)。nonce は `get-nonce` に値があるときだけで、src に `setNonce` の呼び出しは無い。本番の CSP は `style-src 'self'` (`protocol.ts:40,54`)。O-7 の前は Dialog は削除の確認と添付にしか使われていなかったが、本 PR で設定と起動の入口になった。記録 (spec.md:159、research.md:48、AppShell.tsx:24) は「両立する」と書く。E2E に CSP の違反を集める仕組みは無い
- **同種事象探索**: `components/ui/dialog` の import 4 件 (`WorkspaceFoldersScreen.tsx:16` / `LaunchDialogHost.tsx:4` / `SettingsDialog.tsx:6` / `attachment.aui.tsx:34`)。`createElement('style')` は react-style-singleton の dist に 4 件
- **リスク/影響**: CSP は弾けているので今は穴ではない。ただし違反が黙って出続け、記録が「両立する」と書いているので、次の人が `'unsafe-inline'` で直す方向に押される (AD-025:240-242 と ui charter:53-60 の基線を崩す)。後続が inline の style を差し込む依存を足しても気づけない。失うのはスクロールバーの幅の補正と body の overflow の固定の CSS だけと見ている (実行時の確認はしていない)
- **推奨アクション**: (1) research R-04 と spec FR-001 の注記を事実に直す (「既存の Dialog (Radix) は開くたびに react-remove-scroll-bar の `<style>` を差し込み、本番の CSP がそれを弾く。失うのは scroll-lock の CSS だけ。CSP を緩めて通さない」)。(2) `e2e/support/launch.ts` の `launchApp` に `page.addInitScript` で `securitypolicyviolation` を集める処理を足し、既知の 1 種 (`style-src-elem`。Dialog の scroll-lock) だけであることを E2E で確かめる。(3) 違反を消すには nonce の配信で `protocol.ts` を変える必要があり、FR-001 の範囲外。やるなら別 spec か ADR
- **根拠**: AD-025 §7・:240-242、ui charter:53-60、AD-038 D4、OWASP ASVS V14.4、CWE-1021
- **scope 根拠**: 主張を書いた記録と、検出を足す `e2e/support/launch.ts` は本 PR の touched files

### [Medium] 過去ログの composer が、外側の稼働中の runtime の下でも無効のままであることを確かめるテストが無い (plan RK-02 の transcript 側。tasks FE-014 は [x]) (M-002) (scope: feature)

- **観察**: 外側の provider (`AppShell.tsx:34`) は `PastCenter` → `ChatScreen` まで包む。外側の runtime は稼働中のセッションを選んでいれば composer が有効 (`RunningSessionsProvider.tsx:152`)、送信は稼働中のセッションへ行く (`:159-166`)。過去ログは内側に `isDisabled: true` の runtime を持つが、内側の provider を張るのは取得に成功した分岐だけ (`ChatScreen.tsx:123`)。`AppShell.test.tsx:197` の `getTranscript` は解決しない Promise を返すので、シェルのテストでは内側の Thread と composer が一度も描かれない
- **同種事象探索**: `ChatScreen` が取得に成功した状態を外側の provider の下で描くテストは 0 件。E2E は `listSessions` が空を返すので通らない
- **リスク/影響**: 入れ子の解決が退行したとき、「読み取り専用」の過去ログの composer が外側の runtime に結び付き、入力が選択中の稼働中のセッションへプロンプトとして送られうる。検出するテストが無い
- **推奨アクション**: `AppShell.test.tsx` に 1 本足す。稼働中の行を選び、過去の行を選び、transcript を描かせ (handshake を返すか `useTranscript` を `vi.mock`)、中央の `textbox 'Message input'` が disabled で、入力しても稼働中のセッションの `messages` が増えず `sendPrompt` も呼ばれないことを確かめる
- **根拠**: plan RK-02、ChatScreen の FR-014、Principle III、CWE-441
- **scope 根拠**: `AppShell.test.tsx` は touched file

### [Low] US-3 AC2 の「閉じて開き直すと Provider の秘密の入力欄が空」をそのまま確かめるテストが無い (L-001) (scope: feature)

- **観察**: `AppShell.test.tsx:539-562` は Esc で閉じると `settings-section` が DOM から消えることだけを見る。秘密を入れて閉じて開き直し、`provider-secret` が空であることは見ていない
- **推奨アクション**: 設定 → プロバイダで `provider-secret` に値を入れ、Esc で閉じ、開き直して値が `''` であることを確かめる
- **根拠**: Constitution Principle V、FR-008、OWASP ASVS V8.3

### [Low] US-4 AC5 の双方向制御文字の観点 (tasks FE-042「U+202E を含む値が正規化済みの値で出る」) を確かめるテストが無い (L-002) (scope: feature)

- **観察**: シェルのテストの XSS の観点は `img` の payload だけ (`AppShell.test.tsx:384-391` / `:629-641`)。正規化は domain が持つ (`src/domain/session/build.ts:45-49,73`)
- **推奨アクション**: domain の変換を通した値 (U+202E を含むブランチ名など) で、`right-panel` と `center-header` の textContent に U+202E が含まれないことを確かめる
- **根拠**: OWASP ASVS V5.3、CWE-451、design-gate R1 security M-003

### [Low] 新しい devDependency の vitest-axe 0.1.0 は vitest 0.17 向けに作られた版で、vitest 5 との互換を保証していない (L-003) (scope: feature)

- **観察**: `vitest-axe@0.1.0` (devDependencies は vitest ^0.17.0、peer は上限無しの `vitest >=0.16.0`)。新しい推移的な依存は `axe-core@4.13.0` / `chalk@5.6.2` / `lodash-es@4.18.1` (integrity 付き。chalk は悪性の 5.6.1 ではない)。install script は無く、`allowBuilds` にも足していない。使うのは `AppShell.test.tsx:4,307` だけで bundle に入らない
- **推奨アクション**: PR の説明に SEC-8 の確認結果を書く。`results.violations` だけを使っている事実も書く (互換の問題が出たら `axe-core` を直接呼ぶ形に置き換えられる)
- **根拠**: OWASP A06:2021、AD-023

### [Low] OPT-panel の要約 (roadmap / prompts) は AD-046 Decision 4 の境界のうち一部しか書いておらず、「モーダルの間は隠す」と「配置の矩形を main で検証する」が抜けている (L-004) (scope: feature)

- **観察**: `docs/roadmap.md:315` と `docs/prompts.md:312` は「`webviewTag` を有効にしない・`WebContentsView`・CSP を緩めない」だけ
- **リスク/影響**: モーダルの間に隠すことを落とすと、ダイアログの上に外部コンテンツが重なりなりすましの余地。矩形の検証を落とすと外部のビューが主ウィンドウ全体を覆える
- **推奨アクション**: 2 か所に「モーダル (設定・起動・承認) を開いている間は外部のビューを隠すか外す、renderer が報告する配置の矩形は main で検証する」を足すか、「AD-046 Decision 4 の条件すべてに従う」と ADR を参照する形にする
- **根拠**: AD-046 Decision 4、AD-025:268-273、Electron Security Checklist、CWE-1021

### [Low] AD-046 Decision 4 の「主ウィンドウの `webviewTag` を有効にしない」が `webPreferences` で明示されておらず、機械でも確かめていない (L-005) (scope: system)

- **観察**: `window.ts:50-56` の `webPreferences` は `sandbox` / `contextIsolation` / `nodeIntegration` だけで、`webviewTag` は Electron の既定 (false) に頼る。機械で確かめているものは 0 件
- **推奨アクション**: `webviewTag: false` を明示し、`webPreferences` を検査する単体テストか Constitution 検証の項目を足す。`window.ts` は touched files の外なので、roadmap の system-scope (E2E / 検証基盤) に持ち主を付けて登録する
- **根拠**: AD-046 Decision 4、AD-023、Electron Security Checklist #12

## H 節

- 既存の境界は退行していない (preload / ipc / window / protocol の差分 0。新しい IPC 0 件)
- production-inert: `launchApp` の stub のゲートは不変。perf は `openLaunchDialog` だけを import し `launchApp` を呼ばない
- XSS: `img` の payload は中央のヘッダと「概要」で確認。双方向制御文字は L-002
- secret の寿命: unmount の代わりの確認はある。AC どおりは L-001
- 入れ子の provider での入力の宛先: テストが無い (M-002)
- observability: CSP の違反を集める観測点が無い (M-001 の推奨アクション 2)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `components/ui/dialog` (src/ の import) | 4 | WorkspaceFoldersScreen.tsx:16 / LaunchDialogHost.tsx:4 / SettingsDialog.tsx:6 / attachment.aui.tsx:34 |
| M-001 | `createElement\('style'\)` (react-style-singleton/dist) | 4 | es2015/es2019/es5 singleton.js / index.js |
| M-001 | `setNonce\|get-nonce` (src/ と e2e/) | 0 (無関係な名前 2 件) | LaunchDialog.tsx:183,332 |
| M-001 | `securitypolicyviolation\|pageerror\|Content Security Policy` (e2e/) | 0 | — |
| M-002 | 過去ログの Thread を外側の provider の下で描くテスト | 0 | — |
| L-001 | `provider-secret` | 3 (シェルのテストは 0) | ProviderScreen.tsx:169 / ProviderScreen.test.tsx:74,83,99 |
| L-002 | `202[A-Ea-e]\|206[6-9]\|bidi\|双方向` (features/shell) | 0 | — |
| L-003 | `vitest-axe\|axe-core` | 3 | package.json:80 / AppShell.test.tsx:4,307 |
| L-004 | `OPT-panel` (roadmap / prompts) | 4 | roadmap.md:268,315 / prompts.md:307,309 |
| L-005 | `webviewTag` (src/) | 1 (注記だけ) | panel-tabs.ts:13 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 5

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
