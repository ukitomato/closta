# security-reviewer レビュー: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/013-ui-app-shell/spec.md

結論: Critical 0 / High 0 / Medium 3 / Low 2。

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 (renderer のみ・IPC 変更なし)、FR-008 / FR-009 (ProviderScreen の平文の秘密の入力フォームをダイアログに置く)、FR-010 (永続化しない)、FR-014 / FR-015 (タブの表・「概要」。新しい IPC なし。会話由来の文字列を表示)、FR-012 (AD-046 Decision 4 が AD-025 の別 WebContents・CSP 不変を引き継ぐ)、SC-001 / SC-004
- 該当 charter / Confirmation: ui charter:52-58 (CSP 基線は R-1)、AD-025:268-273、spec Dependencies:228
- A. 認可 / 認証 / secret / プロセス境界: Critical:0 High:0 Medium:1 Low:1
- B. 入力検証 / injection / XSS / CSP: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-025 の CSP 条件の引き継ぎは確認)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

コードで確かめた事実: 本番の BrowserWindow は `sandbox: true` / `contextIsolation: true` / `nodeIntegration: false` (`window.ts:53-55`)、`webviewTag` 指定なし。遷移は全面拒否 (`window.ts:65-81`)。CSP は `default-src 'none'`、本番の `style-src 'self'` (`protocol.ts:44-62`)。Provider の DTO は秘密を含まない (`domain/provider/dto.ts:5`)。`gitBranch` / `targetLabel` / `cwdDisplay` は境界で正規化済み (`build.ts:48`、`dto-mapper.ts:124,134`)。`SessionLaunchConfig` は秘密を含まない (`launch-config.ts:50-57`)。

## Findings

### [Medium] 取り込む element / 依存が本番 CSP (`style-src 'self'`) と両立するかを確かめる手順が tasks にない (M-001) (scope: feature)

- **観察**: research R-04 と tasks SH-002 は resizable (react-resizable-panels) を照合するが、CSP との両立が観点にない。本番の CSP は `style-src 'self'` (`protocol.ts:44-46,54`)。inline の `<style>` が弾かれた実例 (`e2e/support/launch.ts:22`、`e2e/README.md:23`)。react-resizable-panels はドラッグ中に `<style>` を head に差し込む実装を持つと理解している (要確認)
- **同種事象探索**: `react-resizable-panels|vaul` (package.json) 0 件。`securitypolicyviolation|CSP` (e2e/) 5 件、どれも回避の注記で違反検出は 0
- **リスク/影響**: パッケージ版でだけ静かに壊れ、`style-src` に `'unsafe-inline'` を足す圧力が生まれる (ui charter:52-58 / AD-025 §7 の基線を崩す方向)
- **推奨アクション**: (1) SH-002 の観点に「本番の CSP の下で動くこと」を足し、結果を research R-04 に書く (2) 合わない部品は CSSOM / `style` prop で自作するか採らない (3) 「CSP・配信は変えない」を FR か SC に昇格 (SC-001 に `protocol.ts` の差分 0)
- **根拠**: ui charter:52-58、AD-025 §7・:268-273、CWE-1021 / OWASP ASVS V14.4

### [Medium] 右のペインのタブの表が「DOM の中の中身」だけを前提にしており、外部コンテンツを載せるタブで境界が弱くなる余地を残す (M-002) (scope: feature)

- **観察**: data-model §4 の `PanelTab.Content` は DOM の中身しか表せない。AD-046 Decision 4 は `WebContentsView` / `<webview>` の両方を選択肢として引き継ぐ。主ウィンドウは `webviewTag` 無効 (`window.ts:50-56`)。`<webview>` は `webviewTag: true` を要し hardening が後退。`WebContentsView` は DOM より上に描かれ、全面のダイアログを開いても前面に残る (なりすましの余地)
- **同種事象探索**: `webviewTag|WebContentsView|<webview` (src/) 0 件
- **推奨アクション**: AD-046 に (a) 主ウィンドウの `webviewTag` を有効にしない・外部コンテンツは main が管理する `WebContentsView` (b) モーダルを開いている間は外部のビューを隠すか外す (c) renderer が報告する配置の矩形は main で検証、を書く。OPT-panel の登録の注記にも載せる。data-model §4 に「外部コンテンツのタブはこの `Content` で表さない」と 1 行
- **根拠**: AD-025:268-273、Electron Security Checklist、CWE-1021

### [Medium] US-4 AC5 (HTML として解釈しない) の検証に、悪意のある payload を流す観点が tasks にない (M-003) (scope: feature)

- **観察**: FE-042 は「AC1〜AC5」とだけ書く。先例 `pending-queue-notice.test.tsx:38`。「概要」と中央のヘッダは `gitBranch` / `targetLabel` / `cwdDisplay` / `modelId` / フォルダ名を出す
- **同種事象探索**: `dangerouslySetInnerHTML|innerHTML` (src/) 4 件、描画への使用 0
- **推奨アクション**: FE-042 に `<img src=x onerror=...>` を含む値で `img` 要素 0、U+202E を含む値が正規化済みで表示、を足す。FE-014 にも中央のヘッダの題について 1 行
- **根拠**: OWASP ASVS V5.3、CWE-79

### [Low] US-4 AC5 は「題」を挙げるが、data-model §5 の項目に題がなく、running 側で引き当てに失敗したときの表示も決まっていない (L-001) (scope: feature)

- **推奨アクション**: AC5 の題は中央のヘッダ側と明記するか §5 に題を足す。引き当て失敗時の表示を §5 に 1 行

### [Low] 設定のダイアログを閉じたら、中の画面を unmount することを明記していない (平文の秘密の寿命) (L-002) (scope: feature)

- **観察**: ProviderScreen は平文の秘密をローカル state に持つ (`ProviderScreen.tsx:92,167`)。plan は項目の切り替えの unmount だけを書く
- **推奨アクション**: FR-008 か plan に「閉じたら中の画面を unmount する (覚えるのは項目の id だけ)」。FE-031 に「閉じて開き直すと秘密の入力欄が空」
- **根拠**: Principle V、OWASP ASVS V8.3

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `react-resizable-panels\|vaul` (package.json) | 0 | 未導入 |
| M-001 | `securitypolicyviolation\|CSP` (e2e/) | 5 (違反の検出は 0) | e2e/composer-screenshot.spec.ts:11,34,37 / e2e/README.md:23,49 / e2e/support/launch.ts:22 |
| M-002 | `webviewTag\|WebContentsView\|<webview` (src/) | 0 | — |
| M-003 | `dangerouslySetInnerHTML\|innerHTML` (src/) | 4 (描画への使用 0) | ProviderScreen.tsx:27 / pending-queue-notice.test.tsx:38 / RunningSessionList.monitor.test.tsx:253,256 |
| L-002 | `forceMount\|keepMounted` | 0 | — |

## Verdict

- Critical: 0 / High: 0 / Medium: 3 / Low: 2
