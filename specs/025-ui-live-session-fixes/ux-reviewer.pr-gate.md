# ux-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30
**Reviewer**: ux-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: UX の観点で当たるのは FR-001〜FR-003 (composer の周りの選択)、FR-005〜FR-007 (一覧の理由つき押せない状態)、FR-008〜FR-010 (権限モードの名前)、FR-011〜FR-013 (停止と Esc)、FR-014〜FR-015 (右のパネル)、FR-016〜FR-018 (`/resume` の選ぶ画面)。SC-001 / SC-004 / SC-005 / SC-006 / SC-007 も当たる。
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md`、AD-065 (権限モード名の Principle XV 例外)。AD-037 (IME) と 018 FR-014 (focus) は composer 周りの変更に当たる。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当で UX 観点の対象外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当で UX 観点の対象外
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。UX 完成度の指摘は G に集計した
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当。H-001 の className の綴り誤りは UX 上の実害 (ボタンの大きさ) として G に置いた
- G. optional reviewer 範囲 (empty / error / loading / consistency): Critical:0 High:2 Medium:2 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

diff の UI 側では、モデルと権限モードの select をヘッダから composer 左の群へ移した。既定 Provider 向けの `supportedModels` の一覧は loading / failed / ready の 3 状態で理由を出す。権限モード名は Claude Code の英語表記にした。停止ボタンは outline にし、Esc で止める。右のパネルのタブは横スクロール化し、使用量は `dd` を nowrap にした。`/resume` の選ぶ画面 (Dialog + CommandPalette) を足した。

UX-2 / UX-3 は、一覧の失敗理由 11 種を文言の表で出し分け、読み込み中も文言を出している。UX-5 に当たる削除系の操作は無い。Esc の停止は spec が決めた仕様で、change-of-context には当たらない。

指摘は 2 件の High と 2 件の Medium が中心で、どれもこの PR の touched files 内で直せる。

## Findings

### [High] 停止ボタンの className が `aui-composer-cancelsize-7` に連結し、size-7 が落ちている (H-001) (scope: feature)

- **観察**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861` が `className="aui-composer-cancelsize-7 rounded-full"` になっている。diff 5684 行目で、元の `aui-composer-cancel size-7 rounded-full` から空白が抜けた。`src/renderer/src/components/ui/button.tsx` の `size="icon"` は `size-9` なので、停止ボタンは 36px になる。同じ場所の送信ボタン (`thread.aui.tsx:837`) は `size-7` (28px) のまま。
- **同種事象探索**: `aui-composer-cancel` を `src` で Grep して 2 件 (`thread.aui.tsx:861` が誤り、`:864` は icon 側で正常)。`aui-composer-cancel` を参照する CSS・E2E・テストの selector は 0 件。同様の連結ミスは diff 内の他の className では見つからなかった。
- **リスク/影響**: 生成の開始と停止で、送信ボタンから停止ボタンへ切り替わるたびに右下のボタンが 28px から 36px に膨らむ。composer の行の高さと位置がずれる。FR-011 の「場所は今と同じ」と US-3 AC1 の「同じ場所に出る」に反する。タップ先も変わり、停止を控えめにするという意図と逆に大きく見える。
- **推奨アクション**: `aui-composer-cancel size-7 rounded-full` に直す。`composer-escape.test.tsx` に停止ボタンの `size-7` (または `aui-composer-cancel` クラス) の確認を足す。
- **根拠**: spec FR-011 / US-3 AC1、UX-9 (送信ボタンとの一貫性)。
- **scope 根拠**: 本 PR で編集した行。

### [High] `/resume` の選ぶ画面は、検索で 0 件になっても「このフォルダに過去のセッションはありません」と出す (H-002) (scope: feature)

- **観察**: `src/renderer/src/features/session/ResumePickerDialog.tsx:111` の `loading` は `all.length === 0` で決まる。同 `:147` は `loading ? loading : RESUME_PICKER_LABELS.empty` の 2 択になっている。`all` は絞り込む前の全件、`rows` は検索語で絞った後の件数。検索語で 0 件になると `commands.length === 0` になり、`command-palette.tsx:283` が `empty` を出す。その文言は `labels.ts:486` の「このフォルダに過去のセッションはありません」(`RESUME_PICKER_LABELS.empty`)。
- **同種事象探索**: `EmptyState` を使う 0 件表示で filter と初回を分けているかを `src/renderer/src/features` で確認した。`features/shell/CommandPalette.tsx:185-188` は `paletteNone` + `paletteNoneHint` で、この画面だけが区別していない。他にこの形の 0 件表示は 0 件。
- **リスク/影響**: セッションが 2 件あるフォルダで「xyz」と打つと、セッションが 1 件も無いと表示する。誤った情報で、利用者は再開できる過去のセッションが消えたと誤解する。UX-1 の「初回 vs フィルタ結果 0 件の区別」を満たさない。
- **推奨アクション**: `all.length > 0 && rows.length === 0` のときは「『{query}』に合うセッションがありません」のような別文言を出す。検索語を直す案内も添える。`ResumePickerDialog.test.tsx` に、検索で 0 件になったとき全件 0 件の文言と違うことを確かめるテストを足す。
- **根拠**: UX-1。spec US-5 AC4 は「同じフォルダに過去のセッションが無い」場合だけを想定し、検索 0 件は範囲外。
- **scope 根拠**: touched file の `ResumePickerDialog.tsx` で直せる。

### [Medium] 最初の応答の前、権限モードとモデルの両方が同じ理由の行を composer 内に 2 本出す (M-001) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:282-286` (権限モード) と `:192-196` (モデル) が、それぞれ `basis-full` の理由の行を出す。`LIVE_SETTING_LABELS.blocker['not-ready']` は「最初の応答の後に変更できます」で、新規のセッションでは必ず両方に出る。ただしモデルは `liveSettingBlocker('model', row)` を先に見るので、既定 Provider のときは同じ文言になる。
- **リスク/影響**: composer の下の操作行が、毎回の新規セッションの開始直後に 2 行ぶん (理由 2 本) 伸び、composer の高さが変わる。送信後に元に戻って画面が動く。SC-007 の基準画像の撮り方に影響しうる。
- **推奨アクション**: 理由は群で 1 本にまとめるか、`title` と `aria-describedby` だけにして常時表示しない。
- **根拠**: UX-7 (情報の詰め込み)。
- **scope 根拠**: touched file。

### [Medium] 既定 Provider の一覧の取得失敗から回復する手段が、select へのフォーカスだけで見えない (M-002) (scope: feature)

- **観察**: `LivePane.tsx` の `LiveComposerSettings` は、`onFocus: isLive && canAsk && phase === 'failed' ? onLoadLiveModels : undefined` で再取得する。画面には `LIVE_MODEL_LIST_FAILURE_LABELS` の理由 (例: `timeout` の「時間内に終わりませんでした」) が出るだけ。再取得できることを示す文言もボタンも無い。
- **リスク/影響**: UX-2 の recovery action が暗黙になる。利用者は、一覧の再取得はフォーカスを当てれば走ると知らない。aria-disabled の select にフォーカスを当てること自体が自然な操作ではないので、気付けない。
- **推奨アクション**: 失敗時の理由の文末に「選択をもう一度押すと再取得します」を足すか、再取得のボタンを理由の横に出す。
- **根拠**: UX-2 (recovery action)。
- **scope 根拠**: touched files。

### [Low] 省略された select の値は title で全文を見られない (L-001) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:173` の `max-w-36 truncate` で長いモデル名は切れる。`title` は理由があるときだけ付く (`:164`)。長いモデル名の読み上げは `aria-label` が「モデル」だけで、選択中の値は読まれる。ポインタでは全文が出ない。
- **推奨アクション**: 理由が無いときは `title={displayName}` を付ける。

### [Low] `/resume` の選ぶ画面で選んだ後、判定の待ち中に feedback が無い (L-002) (scope: feature)

- **観察**: `ResumePickerDialog.tsx:113-131` の `choose` は `resolving` で 2 度目を黙って捨て、待機中の表示を出さない。IPC は短いので実害は小さい。
- **推奨アクション**: `resolving` の間は一覧を `aria-busy` にするか、行を薄くする。

### [Low] 起動ダイアログから権限モードの説明が消え、`Don't Ask` の意味が画面から分からない (L-003) (scope: out-of-scope)

- **観察**: `LaunchDialog.tsx` で `permission-mode-description` の段落を外した。spec U-4 と AD-065 で利用者が決めた仕様。
- **リスク/影響**: `Don't Ask` は承認カードを出さずに事前承認だけで動く。名前だけでは安全側かどうかが読めない。
- **推奨アクション**: 本 PR では対応不要。マイルストーンの棚卸しで、title 属性などで補う案を扱う。

### [Medium] (H 観点) H-001 と H-002 を検出するテストが無い (M-003) (scope: feature)

- **観察**: `composer-escape.test.tsx` の「停止ボタンは outline で…」は `data-variant` だけを見る。className の連結ミスは検出できない。`ResumePickerDialog.test.tsx` の 0 件のテストは `indexOf(true, [])` の全件 0 件と、`loading` の 2 つだけで、検索 0 件が無い。
- **推奨アクション**: H-001 と H-002 の推奨アクションに書いたテストを足す。

### [Low] (H 観点) モデル一覧の取得失敗に観測点が無い (L-004) (scope: feature)

- **観察**: `LIVE_MODEL_LIST_FAILURE_LABELS` の理由は画面に出るだけで、log・metric の経路は diff 内で見つからなかった。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `aui-composer-cancel` を src で検索 | 2 | `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861` (誤り), `:864` (正常) |
| H-002 | 0 件表示の `EmptyState` で filter と全件 0 件を分けているか | 2 | `src/renderer/src/features/session/ResumePickerDialog.tsx:142-149` (分けない), `src/renderer/src/features/shell/CommandPalette.tsx:185-188` (分けている) |

## Verdict

- Critical: 0
- High: 2
- Medium: 3
- Low: 4
- Round inheritance: new: 9 (round 1)

H-001 と H-002 は、どちらも touched files 内の小さな修正で直る。
