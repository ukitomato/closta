# a11y-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30
**Reviewer**: a11y-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004、SC-001: composer の周りの選択。
  - FR-008〜FR-009、SC-003: 権限モードの名前。
  - FR-011〜FR-013、SC-004: 停止ボタンと Esc。
  - FR-014〜FR-015、SC-005: 右のパネル。
  - FR-016〜FR-018、SC-006: `/resume` の選ぶ画面。
  - SC-007: IME と基準画像。
  - FR-005〜FR-007 の main / agents の部分は a11y の範囲外 (UI に出る理由の文言だけ見た)。
- touched files に該当する charter / Confirmation:
  - `docs/domains/ui/charter.md`
  - ADR-0065 の Confirmation
  - Constitution VIII (日本語入力)、XII、XIII (a11y の Manual 検証者)、XV (日本語第一。例外を足す改定)
  - AD-037 (IME の onKeyDown 未上書き)
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外 (po-reviewer が担当)
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:1 Medium:2 Low:2
- H. テスト / coverage / observability / regression: High:0 Medium:1 Low:0

## スコープ要約

見た UI ファイル: `LiveSettingsControls.tsx` / `LivePane.tsx` / `ResumePickerDialog.tsx` (`src/renderer/src/features/session/`)、`RightPanel.tsx` / `UsageTab.tsx` (`src/renderer/src/features/shell/`)、`thread.aui.tsx` の `ComposerAction`。`button.tsx` と `command-palette.tsx` も読み、vendored の `components/ui/**` は対象外にした。

良い点 (検証済み):
- composer の選択は native `<select>` で、`aria-label` / `aria-describedby` / `aria-disabled` があり、Tab の順が見た目の順と一致する。
- キー操作の変更は保留し、Enter か blur で 1 回だけ確定する (WCAG 3.2.2)。確定の後は composer にフォーカスを戻す。
- tablist は roving tabindex と矢印キー・Home / End に対応している。
- `/resume` の選ぶ画面は Radix Dialog で、焦点の閉じ込めと Esc がある。
- 色の対比は問題ない。
- Esc の単体テストは変換中・非実行中・候補の popover・composer の外を押さえている。
- `lang="ja"` は `src/renderer/index.html:7` にある。

Critical は 0 件。

## Findings

### [High] 停止ボタンの className の typo で `size-7` が効かず、送信ボタンより大きくなる (H-001) (scope: feature)

- **観察**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861` に `className="aui-composer-cancelsize-7 rounded-full"` がある。元の `aui-composer-cancel size-7 rounded-full` の空白が脱落している。
- **リスク/影響**: `size="icon"` の `size-9` (36px) が残り、送信ボタン `size-7` (28px) と差し替えのたびに composer の行が伸び縮みする。FR-011「場所は今と同じ」と SC-007 に反する。`aui-composer-cancel` のフックも失われる。36px は WCAG 2.5.8 を満たすので a11y 上の害ではなく視覚的な回帰。テストは寸法を見ないので検出できない。
- **同種事象探索**: `cancelsize|aui-composer-cancel` で 3 件 (typo は 1 件): `thread.aui.tsx:861` (typo) / `thread.aui.tsx:864` (正常) / `.pr-gate.diff:5683-5684`。
- **推奨アクション**: `className="aui-composer-cancel size-7 rounded-full"` に直す。`composer-escape.test.tsx` に `size-7` を含み `cancelsize` を含まない確認を足す。
- **根拠**: spec FR-011 / SC-007。
- **scope 根拠**: 本 PR が変更した行。

### [Medium] 権限モードの英語名に `lang="en"` が無い (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/chat/labels.ts:379-387` の英語名を `LiveSettingsControls.tsx:273,278` / `LaunchDialog.tsx:759` / `CenterBanners.tsx:94` / `OverviewTab.tsx:105,112` / `thread.aui.tsx:1155-1157` が `lang` なしで描く。
- **同種事象探索**: renderer の `*.tsx` で `lang=` は 0 件。
- **リスク/影響**: WCAG 3.1.2。日本語の読み上げ音声が英語名を日本語の規則で読みうる。
- **推奨アクション**: `<option lang="en">` / `<span lang="en">` を検討。大きいなら a11y の Manual 検証の記録に対象外と残す。
- **根拠**: WCAG 3.1.2 / Constitution XV (AD-065 Decision 4)。
- **scope 根拠**: 本 PR が英語名を導入した。

### [Medium] 右のパネルを開き直したとき、選択中のタブが tablist の見える範囲の外に残りうる (M-002) (scope: feature)

- **観察**: `RightPanel.tsx:69-77` の `scrolledId` は `useRef(currentId)` で初期化され、選択が変わったときだけ `scrollIntoView` する。畳んで開き直すと `scrollLeft` は 0 に戻るが寄せは走らない。
- **リスク/影響**: 末尾側のタブを選んだまま畳み、開くと選択中のタブが右外に隠れる。`e2e/right-panel.spec.ts:46-60` は未検証。
- **同種事象探索**: `scrollIntoView` を `RightPanel.tsx` で 1 件 (`:76`)。
- **推奨アクション**: `collapsed` が `true` から `false` に変わったときも寄せる。
- **根拠**: WCAG 2.4.3 / 1.3.1。APG の Tabs pattern。

### [Low] 動的な状態が支援技術に通知されない (L-001) (scope: feature)

- **観察**: モデル一覧の読み込み中→選べる/失敗の遷移 (`LivePane.tsx:386-399`、`LiveSettingsControls.tsx:140-147,192-196`) と、`ResumePickerDialog.tsx:141-149` の読み込み中・`resolving` に live region が無い。
- **同種事象探索**: `role="status"|aria-live` は 2 ファイルで 0 件 (`role="alert"` は `ResumePickerDialog.tsx:159` に 1 件)。
- **推奨アクション**: 読み込み中の文言と空の状態を `role="status"` にする。
- **根拠**: WCAG 4.1.3。

### [Low] 選択の確定前の値が見た目では確定済みに見える (L-002) (scope: feature)

- **観察**: `useConfirmedSelect` (`LiveSettingsControls.tsx:74-126`) は、キーボードで開いた一覧をマウスで選んだ場合も `byKeyboard.current === true` のまま保留し、blur / Enter まで確定しない。
- **推奨アクション**: `onPointerDown` / `onMouseDown` で `byKeyboard.current = false` に戻す。
- **根拠**: WCAG 3.2.2。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `cancelsize\|aui-composer-cancel` | 3 (typo は 1) | `thread.aui.tsx:861,864` / `.pr-gate.diff:5683-5684` |
| M-001 | `lang=` (renderer の tsx。`index.html` を除く) | 0 | - |
| M-002 | `scrollIntoView` (`RightPanel.tsx`) | 1 | `RightPanel.tsx:76` |
| L-001 | `role="status"\|aria-live` (`ResumePickerDialog.tsx` / `LiveSettingsControls.tsx`) | 0 | - |

## 観点別の補足 (A11Y-1〜9)

- A11Y-1 / 2: 問題なし。A11Y-3: 新しい `outline-none` は無い。A11Y-4: 問題なし。A11Y-5 / 6: 問題なし。A11Y-7: 問題なし。A11Y-8: 新しいアニメーションは無い。A11Y-9: M-001 を参照。

## H (テスト / regression) の根拠

- Medium (H 該当): 寸法・見た目を検証するテストが無く H-001 を検出できない。M-002 の経路も未検証。
- `RightPanel.tabs.test.tsx`、`LiveSettingsControls.test.tsx`、`UsageTab.test.tsx`、`ResumePickerDialog.test.tsx` に axe の確認がある。Esc は `composer-escape.test.tsx` と `e2e/ime.spec.ts:208-237`。

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 2
