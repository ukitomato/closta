# ux-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割 / 023)

**Run**: 2026-10-28
**Reviewer**: ux-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC (UX に関わるもの): FR-003 / FR-004 / FR-007 (今の値と失敗の 1 行)、FR-010 (名前の受け付けと送信の保留)、FR-013 (ヘッダに置き、押せない形と理由を出す)、FR-016 (対応表の照合)。US-1 AC4/AC5、US-2 AC4/AC6、US-3 AC3/AC4/AC5。SC-005 (ヘッダのコンポーネントテスト)、SC-006 (E2E)。
- touched files に該当する charter / Confirmation: `docs/domains/session/charter.md` (Journey 4 の「モデルを選び直せる」を実行中にも広げる)。UI は `src/renderer/src/features/shell/{LiveSettingsControls,CenterHeader,CenterPane}.tsx`、`src/renderer/src/features/session/{labels,running-session-store}.ts`、`src/renderer/src/features/shell/OverviewTab.tsx`。このリポジトリには i18n のリソースファイルが無い。文言は `labels.ts` に日本語で集約する方針で、本 PR もそれに従っている。
- この PR で UX が破られた箇所は、主に UX-3 (loading)、UX-2 (error state)、UX-7 (information architecture)。UX-5 (破壊的操作の確認) は該当なし。削除や取り消せない操作は無く、改名は再度の改名で戻せる。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。UX 側の入力検証の表示は G で扱う
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。FR-013 に関わる UX の指摘 (H-001) は G に集約した
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (empty・error・loading・form・i18n): Critical:0 High:1 Medium:4 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

023 は、動いているセッションの権限モード・モデル・名前を中央のヘッダ (`CenterHeader` → `LiveSettingsControls` / `EditableSessionTitle` / `LiveSettingError`) から変更できるようにする。操作を受け付けるかどうかは domain の `liveSettingBlocker` で決め、main と renderer が同じ関数を使う。押せない行では native の `<select>` と「名前を変更」ボタンに `aria-disabled` を付け、理由を `title` と sr-only の要素で伝える。失敗はヘッダの下に 1 行、種別だけで出す。

良い点は次のとおり。
- 名前の編集は IME の変換中の Enter を確定せず、Escape で取り消し、閉じたらフォーカスを戻す。
- 名前の規則は main と同じ純関数で検査する。
- 文言は `labels.ts` に集約されている。
- 安全 3 値の外の現在値は、選べない項目として出る。

一方で、押せない状態が見た目で区別できない (H-001)。読み込み中・失敗・実行中の待ちの扱いが粗い (M-001〜M-003、M-005)。ヘッダが過密になる (M-004)。以上を指摘する。対象は `.pr-gate-scope.txt` の UI ファイルで、vendored primitive は指摘していない。Critical に当たる経路 (error state の欠如、取り返しのつかない操作の確認欠如) は観察していない。

## Findings

### [High] 押せない状態が見た目で区別できない。理由は hover の `title` か sr-only にしか出ない (H-001) (scope: feature)

- **観察**: `src/renderer/src/features/shell/LiveSettingsControls.tsx:73-86` (モデル)、`:151-163` (権限モード)、`:259-270` (「名前を変更」) は、押せないときに `aria-disabled` と `title` を付けるだけで、見た目を変えない。`className` に `aria-disabled:` や `opacity` の指定が無い。理由の要素 (`:103-107`、`:176-180`) は `sr-only` で、画面には出ない。`onChange` / `onClick` は内部で no-op にしているだけである。
- **同種事象探索**: `aria-disabled:|\[aria-disabled` を `src/renderer/src` と `*.css` / `*.html` で探して 0 件。`aria-disabled` を `<select>` に付けて見た目を変えない箇所は 3 件 (`LiveSettingsControls.tsx:76`、`:154`、`:263`)。`components/ui/button.tsx:7` の `disabled:opacity-50` は native の `disabled` にだけ効き、`aria-disabled` には効かない。同じ `aria-disabled` を使う `SessionListScreen.tsx:573` は枠線とアイコンの減光で押せない見えを補っている。本 PR にはその補いが無い。
- **リスク/影響**: 次のような場面で、押せる見た目の選択肢が反応しない。
  - 既定の Provider (null) のセッションでは、モデルの選択は恒久的に押せない (U-10)。既定の Provider は最も普通の構成である。
  - 終わった行、失敗した行、`launching` の行の権限モード。
  - 実行中のターンの間の「名前を変更」(`turn-running`)。

  利用者が選択肢を開いて選ぶと、値が元に戻るだけで何も起きない。理由が分かるのは `title` を数秒 hover したときだけである。spec FR-013 の「押せない形で出す」と US-1 AC5 / US-2 AC6 / US-3 AC3 の「理由つきで押せない」に対し、「押せない」が視覚的に伝わらず、「理由つき」も sr-only と hover のみである。
- **推奨アクション**: 3 か所に `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed` を足す (Tailwind の aria variant)。または native の `disabled` に切り替える。`aria-disabled` を残す理由は、フォーカスと理由の読み上げを保つためである。あわせて、押せない理由を `title` と sr-only だけでなく見える形で 1 つ以上出す。例えばモデルの選択の横に `text-muted-foreground text-xs` の短い注記を出す。テストに、押せないときの見た目のクラスの有無の検査を足す。
- **根拠**: spec FR-013 / US-1 AC5 / US-2 AC6 / US-3 AC3、UX-3 (feedback)、UX-9 (`SessionListScreen.tsx:573` との一貫性)。
- **scope 根拠**: touched files (`LiveSettingsControls.tsx`) で直接直せる。

### [Medium] モデルの選択が、Provider 一覧の読み込み中と読み込み失敗を「一覧がありません」と断定する (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/shell/CenterHeader.tsx:112-130` は `provider === null` を `available: false` にする。`useProviders()` の `loadState` (`loading` / `failed` / `ready`。`useProviders.ts:46`) は読んでいない。そのため、読み込み中も失敗も `LIVE_SETTING_LABELS.noModelList` (「この Provider にはモデルの一覧がありません」) の理由になる。`LiveSettingsControls.tsx:46` のコメントは「一覧の読み込み中」も `available=false` に含めている。同じ PR の `OverviewTab.tsx:117` は `providersLoading` を見て、読み込み中は行を出さない。
- **同種事象探索**: `providersLoading|loadState` を `src/renderer/src` で探すと、`OverviewTab.tsx` は見ており、`CenterHeader.tsx` は見ていない。
- **リスク/影響**: 起動直後の短い間、または一覧の取得に失敗したとき、Provider は登録済みなのに「一覧がありません」と誤った理由を見せる。利用者は設定の誤りだと解釈する。UX-3 (loading と空の区別) と UX-9 (同じ値の扱いが画面で違う) に反する。`useProviders` の `lastError` / `loadState` は、起動ダイアログでは区別して扱われている。
- **推奨アクション**: `LiveSettingsSlot` で `loadState` を読む。`loading` なら「読み込み中…」、`failed` なら「モデルの一覧を読み込めませんでした」、`ready` で一覧に無いときだけ `noModelList` を出す。`LiveModelSelect` に理由の種類を持たせる。

### [Medium] 失敗の 1 行が失敗の理由を潰し、次の行動を示さない (M-002) (scope: feature)

- **観察**: `running-session-store.ts:976-987` の `endSetting` は `ok` の真偽だけで `settingError` に種類 (`permission-mode` / `model` / `name`) を立てる。main が返す `LiveSettingFailure` 11 種 (`live-settings.ts:54-66`: `turn-running` / `timeout` / `write-failed` / `session-ended` ほか) は renderer で捨てられる。表示は `labels.ts:446-450` の「名前を変更できませんでした」の固定の 1 行である。この 1 行は spec の Clarifications で決めた文言と一致している。
- **同種事象探索**: `settingError` の書き込みは `running-session-store.ts:984` の 1 か所のみ。
- **リスク/影響**: UX-2 (失敗種別ごとの出し分け・recovery action) に反する。例えば次の失敗が、同じ文言で出る。
  - 利用者が「名前を変更」を開いた直後にターンが始まった (`turn-running`)。待てば再試行できる。
  - 書き込み失敗 (`write-failed`) / 期限切れ (`timeout`)。
  - セッションの終了 (`session-ended`)。再試行できない。

  利用者には再試行の可否も原因も分からない。
- **推奨アクション**: `settingError` を `{ kind, reason }` にして、`timeout` / `write-failed` は「もう一度お試しください」、`turn-running` は「応答が終わってからお試しください」のように短い補足を `LIVE_SETTING_LABELS.failure` に足す。固定文言の「1 行」の枠は崩さず、末尾に補足を足せばよい。

### [Medium] 変更中の視覚的な進行表示が無く、権限モードとモデルは選んだ値がいったん元に戻って見える (M-003) (scope: feature)

- **観察**: 権限モードとモデルの `<select>` は controlled で、値は `meters.permissionMode ?? configPermissionMode` と `currentModelId ?? modelId` から読む。選んだ値はその場では保持しない (`LiveSettingsControls.tsx:25-29` の規則。`CenterHeader.tsx:122-126`)。成功を待つ間 (`changing`) は、選んだ直後に表示が元の値に戻って見える。`changing` の表示は `aria-disabled` と、sr-only / title の「変更中です」だけである。
- **同種事象探索**: 「変更中」の見える表示は、改名の入力の中の `blocker` 文言 (`LiveSettingsControls.tsx:333-337`) だけ。選択 2 つには無い。
- **リスク/影響**: UX-3 (200ms を超える操作の feedback と optimistic update の rollback) に反する。値が一瞬戻り、その後に変わるため、連打や「効いていない」という誤解を招く。見た目が変わらないので、連打を防ぐ `changing` の無効化も目に見えない (H-001 と同じ原因)。
- **推奨アクション**: `changing` の間は選んだ値を表示に残す (pending 値) か、減光とスピナー、または「変更中…」の短い印を出す。

### [Medium] ヘッダの 1 行が過密で、狭い幅では題が潰れる、または行があふれる可能性がある (M-004) (scope: feature)

- **観察**: `CenterHeader.tsx:149-186` の 1 行は、題 (`min-w-0 truncate`)・「名前を変更」(`shrink-0`)・補足 (`truncate`)・状態 (`shrink-0`)・権限モード (`shrink-0`)・モデル (`shrink-0`、`max-w-48`)・コンテキストと費用の目盛り (`shrink-0`)・検索・密度を折り返しなしで並べる。編集中の `<form>` (`LiveSettingsControls.tsx:282`) も `shrink-0` で、入力 `w-40` と 2 つのボタンに加えて `nameRule` / `blocker` の文言 (どちらも `shrink-0`) を同じ行に置く。縮められるのは題と補足だけである。
- **リスク/影響**: UX-7 (情報の詰め込み)。中央のペインが狭いとき、題と補足が 0 幅近くまで切り詰められる。編集中に規則の文言が出ると、行があふれて目盛りや検索のボタンが押せなくなる恐れがある。観察は className からの推定で、幅は実測していない。このリポジトリの CI は画面が狭く、ウィンドウが縮むことが分かっている。この変更に対する狭い幅のテストは見つからなかった。
- **推奨アクション**: 行を `flex-wrap` にする。または設定の 2 つの選択を 2 段目に回す。編集中の注記 (`nameRule` / `blocker`) は入力の下の行に出す。

### [Medium] 改名の結果を待つ間、保留したプロンプトの表示や案内が無い (M-005) (scope: feature)

- **観察**: U-9 により、改名の結果 (最長 10 秒。spec U-9) が出るまで main が `send-prompt` を保留する。renderer の `sendPrompt` は `void capability().sendPrompt(sessionId, text)` で結果を返さない (`running-session-store.ts:1086`)。保留中であることを示す UI は、改名の入力の中の「変更中です」だけである。
- **リスク/影響**: UX-3。名前を保存して直後にプロンプトを送った利用者は、composer やヘッダでは「送れていない」ように見える。通常 0.4〜2.4 秒だが、期限までは 10 秒かかり得る。spec が「拒否はしない (composer に触れない)」と決めた結果としての残る穴である。
- **推奨アクション**: 保留中は、ヘッダの状態表示に「名前を保存しています…」を出す。または、保留したプロンプトの送信を行の状態に反映する。

### [Low] 名前の入力の規則 (1〜100 文字、改行不可) が、違反するまで見えない (L-001) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:287-310` の入力には placeholder も helper text も無く、規則の文言 (`nameRule`) は不正な入力のときだけ出る。`maxLength` も無い。UX-4 の「input format hint」。
- **推奨アクション**: placeholder に「1〜100 文字」と入れる。

### [Low] 改名を取り消しても、前の失敗の 1 行が残る (L-002) (scope: feature)

- **観察**: `settingError` は次の変更の開始 (`beginSetting` / `running-session-store.ts:972`) でしか消えない。改名に失敗し、「キャンセル」(`LiveSettingsControls.tsx:322`) か Escape (`:303-306`) で閉じても、「名前を変更できませんでした」は残る。
- **推奨アクション**: 編集を閉じるときか、開くときに `settingError` が `name` ならクリアする。

### [Low] Provider が既定 (null) のセッションの理由文言が実態と合わない (L-003) (scope: feature)

- **観察**: 既定の Provider のセッションでも理由は「この Provider にはモデルの一覧がありません」(`labels.ts:445`) になる。このセッションには Provider が無い。spec の US-2 AC6 は同じ文言を指定している。
- **推奨アクション**: 既定の Provider の場合だけ「既定の Provider ではモデルを切り替えられません」を出す。文言の変更は spec の変更を伴う (後続で可)。

## 同種事象探索 cascade summary

Critical は 0 件。参考として High の探索を記録する。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `aria-disabled:\|\[aria-disabled` (`src/renderer/src`、`*.css`、`*.html`) | 0 | (見た目を変える指定は無い)。`aria-disabled` を付けて見た目を変えない箇所は `LiveSettingsControls.tsx:76`、`:154`、`:263` |
| M-001 | `providersLoading\|loadState` (`src/renderer/src`) | 見ている: `OverviewTab.tsx:117`。見ていない: `CenterHeader.tsx:112-130` | `useProviders.ts:46` |
| M-002 | `settingError` の書き込み | 1 | `running-session-store.ts:984` |

## Verdict

- Critical: 0
- High: 1
- Medium: 6 (M-001〜M-005 と H 節の M-006)
- Low: 3
- Round inheritance: new: 10 (Round 1)

### H の補足 (Medium 1 件。検出できるテストが無い)

- Medium (M-006): H-001、M-001、M-003、M-004 を検出できるテストが無い。`LiveSettingsControls.test.tsx` は `aria-disabled` 属性と説明文の有無しか見ない (`:76-93`、`:264-265`)。読み込み中の Provider (`loadState`) の分岐、見た目の無効化、狭い幅のレイアウトは検査していない。`providerId: null` の検査 (`:327-332`) は、読み込み中ではなく恒久的に押せない場合だけを見る。E2E (`e2e/live-session-settings.spec.ts`) は成功の経路のみで、失敗・押せない・読み込み中の画面は見ない。H-001 と M-001 の修正に合わせて、見た目のクラスと読み込み中の文言のテストを足す。
- 既存の振る舞い: 過去の会話 (`live` なし) にはどの操作も描かない検査があり (`LiveSettingsControls.test.tsx:175-180`、`:275-278`)、既存画面への影響は抑えられている。ヘッダの下の失敗の 1 行は、失敗が無いとき何も描かず、帯や検索のバーの並びを変えない。
- 観測点: 失敗はユーザー向けに種類だけを出す。原因の `reason` は M-002 で潰れるため、利用者も開発者も renderer 側からは特定できない。名前はログに出さない (spec FR-009 のとおり)。

> gate 注記: reviewer 原文の Verdict は「Medium: 5」「new: 9」だったが、本文に M-006 を別に挙げているため、集約では Medium 6 として数えた。
