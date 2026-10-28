# a11y-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28
**Reviewer**: a11y-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC (UI 側に効くもの):
  - FR-003 / FR-007: ヘッダの今の値
  - FR-004: 失敗の 1 行
  - FR-009 / FR-010: 名前の入力と受け付けの条件
  - FR-013: 置き場所、押せない形と理由
  - SC-005: ヘッダのコンポーネントテスト
  - SC-006: E2E
  - US-1 AC1/2/4/5、US-2 AC1/2/4/6、US-3 AC1/3/4/5
- touched files に該当する charter / Confirmation:
  - `docs/domains/session/charter.md`: 中央のヘッダは表示中のセッションの状態を出す場所 (U-7)。
  - Constitution Principle VIII (IME の `isComposing` / 229) は `LiveSettingsControls.tsx:185-188` と `:297-307` で満たされている。
  - Principle XIII (独自の色を作らない): `text-destructive` / `text-muted-foreground` の既存トークンのみで、新しい色は無い。
  - 読んだ UI ファイル: `src/renderer/src/features/shell/LiveSettingsControls.tsx`、`CenterHeader.tsx`、`CenterPane.tsx`、`OverviewTab.tsx`、`LiveSettingsControls.test.tsx`、`shell-layout.ts`、`ContextCostMeter.tsx`、`src/renderer/src/assets/main.css` のトークン。
  - `reviewers.yml` の `exclude_patterns` にある vendored primitive には触れていない。
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外 (po-reviewer が担当)。AC の理由表示に関わる a11y 面だけ G の M-001 に記載
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲 (WCAG): Critical:0 High:2 Medium:2 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

023 は中央のヘッダ (`CenterHeader`) に次の 3 つを足した。

- 権限モードの `<select>` (`LiveSettingsControls.tsx:135`)
- モデルの `<select>` (`:53`)
- 見出しの隣の「名前を変更」ボタンと、1 行の入力 + 保存 / キャンセル (`:212`)

あわせて、ヘッダの下に失敗の 1 行 `LiveSettingError` (`:346`) と、概要のタブの「現在のモデル」行 (`OverviewTab.tsx:115-122`) を足した。

良い点 (観察事実):

- `aria-disabled` と `aria-describedby` の理由の結び付けがある。
- 見出しに `title` がある。
- IME の変換中は Enter / Escape を確定・取り消しに回している。
- 編集を閉じたときに開いたボタンへフォーカスを戻している (`:231-235`)。
- 入力に `aria-label` と `aria-invalid` がある。
- 色は既存トークンのみ。`--destructive` (light) は白地でおよそ 4.7:1、`--muted-foreground` は約 4.8:1 と概算した。
- アニメーションは無く、`lang` も触っていない。

問題は次の 2 つ。

- 既存のヘッダの行に収まらない幅を足した。
- native select の `onChange` で即座に副作用を起こしている。

## Findings

### [High] 中央のヘッダの行が最小幅 480px でも既定の 1100px のウィンドウでも溢れ、題が潰れて右端の操作が `main` の `overflow-hidden` で切れる (H-001) (scope: feature)

- **観察**:
  - `CenterHeader.tsx:149-151` の行は `flex ... gap-3 px-4` で `flex-wrap` が無い。
  - 023 が足した要素はすべて縮まない。
    - 権限モード: `LiveSettingsControls.tsx:149` の `label` が `shrink-0`
    - モデル: `:71` の `label` が `shrink-0` で select は `max-w-48` (192px) まで広がる
    - 名前を変更: `:266` のボタンが `shrink-0`
  - 既存の `ContextCostMeter.tsx:41`、`TranscriptDensityToggle.tsx:25`、状態 `CenterHeader.tsx:175` も `shrink-0`。縮むのは題 (`min-w-0 truncate`) と補足だけ。
  - 幅の見積もり。
    - 中央の保証幅は `shell-layout.ts:16` の `centerMin` = 480px で、padding を除くと内側は約 448px。
    - 既定のウィンドウ 1100px (`window.ts:45`) では 1100−280−320 = 500px で、内側は約 468px。
    - 12px の和文で見積もると、023 が足した分は約 450px (権限モード 約165 + モデル 約230 + 名前を変更 約60)。
    - 既存の固定幅の分は 約400px 超 (密度の切り替え 約230 + 検索 約30 + 状態 約50 + 目盛り 約100)。
    - 合計は内側の幅を大きく超える。題と補足は幅 0 まで縮み、残りが右に溢れる。
  - 親の `main` は `overflow-hidden` (`CenterPane.tsx:62`) なので、溢れた右端 (目盛り・会話内検索のボタン・密度の切り替え) は切れる。
  - `main` の `min-w-0 flex-1` により中央が広がらない。
  - 溢れを検出するテストは無い。`LiveSettingsControls.test.tsx` は jsdom で幅を測らない。`e2e/live-session-settings.spec.ts` は Playwright の `click` (自動でスクロールする) しか使わず、`toHaveScreenshot` も `scrollWidth` の比較も無い。
- **同種事象探索**: `flex-wrap|overflow-x` を `src/renderer/src/features/shell` (テスト除く) で Grep し 2 件 (`CenterPane.tsx:157` は空状態の操作、`SettingsDialog.tsx:66`)。ヘッダの行には無し。`centerMin` の参照は `shell-layout.ts` 内の 2 件のみで、ヘッダの幅の検査は 0 件。
- **リスク/影響**:
  - 稼働中のセッションの題が見えなくなる。「どのセッションか」をヘッダでも示すという CenterPane.tsx:78-80 の設計意図が崩れる。
  - 023 以前から使えていた会話内検索のボタンと密度の切り替えが視覚的に切れる。Tab で到達すると `overflow-hidden` の `main` が横にスクロールされ、ヘッダの見え方が崩れる。
  - WCAG 1.4.10 Reflow / 2.4.7 Focus Visible (切れた位置でフォーカスが見えない) / 2.1.1 に関わる。デスクトップアプリでも 480px はアプリが保証すると宣言した幅。
- **推奨アクション**:
  - ヘッダの行を折り返せる形にする。例: `CenterHeaderRow` の外側に `flex-wrap` を付けて、`LiveSettingsSlot` と名前の編集を 2 行目に回す。または実行中の設定を別の行に分ける。
  - select の `max-w-48` を縮める (`min-w-0` + `truncate`)。
  - 題 (`h2`) には最小幅を持たせて 0 まで潰さない。
  - `centerMin` (480px) で `header.scrollWidth <= header.clientWidth` と、題・密度の切り替えの `toBeInViewport` を見る e2e か component の検査を足す。
- **根拠**: WCAG 1.4.10 / 2.4.7、A11Y-2 (全 interactive 要素が到達可能)、CenterPane.tsx:78-80 の設計意図
- **scope 根拠**: touched files (`CenterHeader.tsx`、`LiveSettingsControls.tsx`) で直接修正できる。

### [High] 閉じた native `<select>` に矢印キーを押すたびに `onChange` が走り、そのたびに実セッションの設定を変える (H-002) (scope: feature)

- **観察**:
  - 権限モード `LiveSettingsControls.tsx:157-161` とモデル `:79-83` は、`onChange` で確定の段階なしに `onSelectPermissionMode(mode)` / `model.onSelect(id)` を呼ぶ。この呼び出しが `setPermissionMode` / `setModel` の実呼び出しになる (`running-session-store.ts:989,1001`)。
  - Windows の Chromium (Electron) では、閉じた `<select>` にフォーカスして Up / Down を押すと、値が即座に変わって `change` が発火する。ポップアップを開く (Alt+Down / Space) 必要は無い。この挙動はブラウザの標準で、コードからではなく既知の仕様からの推論。
  - `LiveSettingsControls.test.tsx` は `userEvent.selectOptions` だけを使い、矢印キーでの操作を検査していない (`:72` `:314`)。
- **同種事象探索**: `onChange=\{\(e\) =>` を `LiveSettingsControls.tsx` で 2 件 (`:79`、`:157`)。入力 (`:296`) は state の更新だけで副作用は無い。確定の段階を挟む select は 0 件。
- **リスク/影響**:
  - キーボードだけの利用者がモデルを 3 つ先へ送ると、通過した中間のモデルへ実際に `setModel` が走る (次の応答から効くので意図しない課金・品質の変化)。
  - 1 回目の `onChange` で `changing` が立つ。すると `aria-disabled` になり、2 回目以降の矢印は `if (reason !== null) return` (`:80` `:158`) で黙って捨てられる。React の controlled な値も変更が成功するまで戻るので、`default` → `dontAsk` のように 2 つ先へ矢印で進めない。
  - 結果として、キーボードだけの利用者は 1 つずつしか変えられず、通過した値が実際に適用される。
  - WCAG 3.2.2 On Input (設定の変更が利用者の予期しない動作を起こす) と 2.1.1 に関わる。
  - 権限モードの `dontAsk` は承認カードが出なくなる値なので、通過した値の適用の重さが大きい。
- **推奨アクション**:
  - 確定の操作を分ける。例: select の値はローカルの state に持ち、`onBlur` / Enter / 「適用」ボタンで 1 回だけ `onSelect` を呼ぶ。
  - または popup 型の部品 (Radix の Select / DropdownMenu など。`@/components/ui` に既存があればそれ。なければ listbox の popup) を使い、項目の確定でだけ発火させる。
  - `userEvent.keyboard('{ArrowDown}')` で、矢印の途中の値では `onSelect` が呼ばれないことを検査するテストを足す。
- **根拠**: WCAG 3.2.2 / 2.1.1、A11Y-2、A11Y-5
- **scope 根拠**: touched files (`LiveSettingsControls.tsx`) で直接修正できる。

### [Medium] 押せない状態の見た目が無く、理由が `title` (マウスの hover) と sr-only だけで、キーボードで見る利用者に出ない (M-001) (scope: feature)

- **観察**:
  - 権限モード `LiveSettingsControls.tsx:151-163`、モデル `:73-85`、名前を変更 `:259-270` は、押せない形を `aria-disabled` だけで表す。
  - `aria-disabled:` 系の class (opacity や cursor) は無く、押せる形と見た目が同じ。
  - 理由は `title` (hover のツールチップ) と `sr-only` の span (`:103-107`、`:176-180`、`:271-275`) にしか出ない。キーボードで focus した晴眼の利用者にはツールチップが出ない。
  - 保存・キャンセル側 (`:328-337`) は理由を可視で出している。
  - 押下は `if (blocker !== null) return` で黙って捨てる (`:238`)。
  - US-2 AC6 / US-3 AC3 は「理由つきで押せない」。
- **リスク/影響**:
  - 「応答の実行中は名前を変更できません」などの理由が見えない。押しても何も起きないように見える。
  - 色や形に頼らず状態を知らせる (WCAG 1.4.1 / 3.3.1 に近い) 観点。
- **推奨アクション**:
  - `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed` を足す。
  - 理由を `sr-only` ではなく可視の補足 (ヘッダの下の 1 行) か、focus で出るポップオーバーにする。
- **根拠**: A11Y-5 / A11Y-3、WCAG 1.4.1
- **scope 根拠**: touched files で直接修正できる。

### [Medium] 失敗の 1 行が、内容つきで後から差し込まれる `role="status"` で、リポジトリの失敗の通知の流儀 (`role="alert"`) とずれる (M-002) (scope: feature)

- **観察**:
  - `LiveSettingsControls.tsx:352-359` の `LiveSettingError` は `settingError === null` のとき `null` を返す。失敗のときに初めて `<p role="status">` を内容つきで描く。
  - フォーカスは select か入力に残る。
  - 同じリポジトリの失敗は `role="alert"` (`LaunchDialog.tsx:546,848,857`、`ProviderScreen.tsx:316`、`ModelCatalogEditor.tsx:134` など)、または常設の空の live region (`WorkspaceFoldersScreen.tsx:595` `<div role="status" aria-live="polite" className="empty:hidden">`) で出している。
- **同種事象探索**: 内容つきで後から差し込まれる `role="status"` は `LivePane.tsx:548,576`、`PresetPanel.tsx:193` など複数ある。ただし失敗の通知として `status` を使うのは本件 (`LiveSettingsControls.tsx:354`) だけ。
- **リスク/影響**:
  - 差し込みと同時に内容を持つ live region は、支援技術に読み上げられないことがある。
  - 操作 (権限モード・モデル・名前) の失敗を利用者が知る手段が実質的にそこしかない。
  - select の値は黙って元に戻るだけなので、読み上げられないと失敗に気づけない。
- **推奨アクション**: 失敗は `role="alert"` にする。または `role="status"` の空のコンテナを常設して中身だけ差し替える (`empty:hidden`)。
- **根拠**: A11Y-5 (`aria-live` で動的更新の通知)、WCAG 4.1.3 Status Messages
- **scope 根拠**: touched files で直接修正できる。

### [Medium] a11y の検査が jsdom の axe のみで、color-contrast を無効化し、キーボード・フォーカス・幅の検査が無い (M-003) (viewpoint: H) (scope: feature)

- **観察**:
  - `LiveSettingsControls.test.tsx:25` は `AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }` で contrast を見ない (jsdom の制約)。
  - フォーカスの戻り (`LiveSettingsControls.tsx:231-235`) を検査するテストは無い。
  - 矢印キーの操作 (H-002) と幅の溢れ (H-001) を検出するテストも無い。
- **同種事象探索**: `renderHeader` 系のテストで `toHaveFocus` を `LiveSettingsControls.test.tsx` で Grep し 0 件。
- **リスク/影響**: H-001 / H-002 のような a11y の回帰を CI が検出できない。contrast は目視 (概算の 4.7〜4.8:1) に頼っている。
- **推奨アクション**:
  - 編集の閉じた後の `toHaveFocus` を足す。
  - 矢印キーの検査と幅の検査 (H-001 / H-002 の推奨アクション) を足す。
  - contrast は Playwright (実ブラウザ) で見る。
- **根拠**: viewpoint H の規定

### [Low] 名前の編集中は見出し (`h2`) が DOM から消える (L-001) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:249-278` の `!editing` 分岐だけが `h2` を描く。編集中は `form` に置き換わり、見出しが無くなる。見出しで移動する利用者は編集中に中央の見出しを失う (CenterHeader.tsx:154-156 の「題は中央の見出し」の意図)。
- **推奨アクション**: 編集中も `h2` を描き、入力は隣に置く。

### [Low] 名前の規則の文言は `aria-describedby` でフォーカス時にしか読まれず、変更中の通知も無い (L-002) (scope: feature)

- **観察**:
  - `:328-332` の `nameRule` は入力が不正になった瞬間に差し込まれるが live region ではない。
  - 権限モード・モデルの変更中 (`changing`) は `aria-busy` も告知も無い。
  - 同じ理由の文言が `title` と `aria-describedby` に二重にある (`:78`、`:156`、`:265`)。
- **推奨アクション**:
  - `nameRule` を `role="alert"` にする。
  - 変更中は `aria-busy` を足す。

## 同種事象探索 cascade summary

Critical は 0 件のため cascade の必須対象は無い。High の探索結果を参考として記す。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `flex-wrap\|overflow-x` (shell 配下、テスト除く) | 2 (ヘッダの行には無し) | `CenterPane.tsx:157`、`SettingsDialog.tsx:66` |
| H-002 | `onChange=\{\(e\) =>` (`LiveSettingsControls.tsx`) | 2 (確定の段階を挟まない select) | `LiveSettingsControls.tsx:79`、`:157` |
| M-002 | `role="status"` (features、テスト除く) | 失敗の通知で使うのは本件のみ | `LiveSettingsControls.tsx:354` |

## Verdict

- Critical: 0
- High: 2
- Medium: 3
- Low: 2
