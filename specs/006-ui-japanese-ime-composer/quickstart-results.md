# Quickstart results: 日本語 composer (X-2)

`quickstart.md` V-1〜V-5 の判定記録。**自動検証 (E2E + component テスト) の結果**と、**人間 deferred の実機目視 / 基準画像承認の
状態**を分けて記す。実機 IME 操作・全角行送りの視覚承認は自動化不可のため人間が別途行う (AD-037 代償節)。

記録日: 2026-09-28 / 記録者: 自動検証は Claude (ローカル実走)、実機目視は **未実施 (人間 deferred)**。

## V-1 IME 変換確定の Enter が送信にならない

- **自動 (done)**: `e2e/ime.spec.ts` の (i) idle テストが「変換確定 Enter は送信されず、確定後 Enter で送信される」を検証。
  **local で緑** (Playwright + Electron。CDP `Input.imeSetComposition` → keyCode 229 → `Input.insertText`)。
  component も `src/renderer/src/features/session/ime-guard.test.tsx` (`fireEvent.keyDown isComposing:true`) で担保。
- **人間 deferred (pending)**: electron 39 実機 + OS IME (MS-IME 等) での確定 Enter の keydown タイミング目視。**未実施**。

## V-2 全角混在でレイアウトが崩れない / 行送りの見え

- **自動 (done)**: `e2e/composer-screenshot.spec.ts` が **緑**。同梱フォント Noto Sans JP (OFL。`e2e/fonts/NotoSansJP-Regular.ttf`)
  を **FontFace API + CSSOM で CSP を壊さず非永続注入** (アプリの `style-src 'self'` が inline `<style>` を禁じるため addStyleTag は
  使えず、実走で発覚して修正した)。基準画像 `e2e/composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` を生成・
  決定論的一致を確認。
- **客観レイアウト判定 (done。記録者=Claude が生成画像を目視検査)**: 全角・半角・絵文字混在の 3 行折返しで
  **水平あふれ 0 / 桁ずれ 0 / 要素崩れ 0**、textarea が行数に応じて伸長、行送り (line-height) 均等。**SC-002 の「崩れない」要件を満たす**。
- **人間 aesthetic sign-off (済)**: 実機の composer 実動と基準画像 `composer-fullwidth-win32.png` を確認したうえで承認された。
  - **承認者: ukitomato(プロジェクトオーナー。本セッションで承認)** / **承認日: 2026-09-29**
  - **承認根拠**: 全角・半角・絵文字混在の 3 行折返しで水平あふれ/桁ずれ/要素崩れが無く、行送り(line-height)と折返しの見えを composer の標準レイアウトとして妥当と判断。この行送り/折返しを基準画像として採用する。
  - **機械が測れない美観次元の判断** (po-L-001): 絵文字グリフの OS 差 (下記「既知の注意」) を許容範囲とみなす。全角と半角 (`ABC123`/`()[]!?`) が同一行に混じる際の字幅バランス・ベースライン揃いも目視で許容と判断した。次回フォント/行高を変える改定時はこの基準画像を撮り直す。
  - → **SC-002 は暫定扱いを解除**(承認済み)。
- **既知の注意 (絵文字の決定論)**: 絵文字 😀🎌 は同梱フォントでなく OS 絵文字フォントで描画されるため、**別 OS/別ランナーでは
  グリフが僅かに異なりうる**。基準画像は `-win32` 別 (Playwright がプラットフォーム別に命名) で CI は windows-latest のため一致する
  見込みだが、恒久的な決定論を厳格化したい場合は絵文字を除くか `maxDiffPixelRatio` (現 0.01) を調整する。

## V-3 実行中に次の入力を積める (message queue)

- **自動 (done)**: `e2e/ime.spec.ts` の (ii) running+queue テストが緑 (変換中 Enter が送信/積みに回らない)。
  積み挙動そのものは component (`queue-behavior.test.tsx`: 実行中送信→steer lane→完了で次ターン dispatch /
  `composer-queue.test.ts`: `isBusyRunState` で running・awaiting_permission を積む) で担保。
- **人間 deferred (pending)**: 実機での「積まれて見える → 現ターン完了後に次ターン送信」の目視。**未実施**。

## V-4 中断でキューが取り消される

- **自動 (done)**: `queue-behavior.test.tsx` (終端 clear() で未 dispatch 破棄) + `composer-queue.test.ts` /
  data-model の状態機械テストで still_queued / cancelled の disposition を担保 (T012/T015)。
- **人間 deferred (pending)**: 実機での中断時の残置/取消提示の目視。**未実施**。

## V-5 下書きが画面再構成をまたいで復元される

- **自動 (done)**: `src/renderer/src/features/session/draft-bridge.test.tsx` が再構成をまたぐ保持 + send/clear での空化を検証 (T020)。
- **人間 deferred (pending)**: 実機での error/killed 遷移をまたいだ下書き保持の目視。**未実施**。

## CI 検証 (自動)

- **IME E2E ジョブ**: `.github/workflows/verify.yml` の `e2e` job に authored。**ローカルで 3/3 緑** (idle / running+queue /
  変換中マウス送信)。既存ガードを殺す差分で落ちる回帰固定 (FR-012)。**未マージ (uncommitted) のため実 CI 実行はこれから**。
- **日本語スクリーンショット比較ジョブ**: 同 job にステップ authored。**同梱フォント + 基準画像 commit 済みで local 緑**。
  実 CI 実行はマージ後。

## まとめ

- **自動検証 (E2E 4/4 + component 1035 passed) は done。** IME E2E 3 本 (idle / running+queue / 変換中マウス送信) と
  日本語スクリーンショット比較 1 本が緑。変換中マウス送信の未確定送信を E2E が実検出し `thread.aui.tsx` の確定優先の最小処理で
  塞いだ (AC-6 / AD-037 D1(d))。スクショの CSP 衝突 (addStyleTag) も実走で発見し FontFace API に切り替えた。
- **V-2 aesthetic sign-off は取得済み** (2026-09-29 / ukitomato。上記 V-2 参照)。SC-002 の暫定扱いを解除。
- **残 (任意)**: V-1/3/4/5 の実機 IME 目視は自動 backstop (E2E 4/4 + component 1035) が全て緑で、利用者が実アプリを起動・操作済み。機能ブロッカーではない。
