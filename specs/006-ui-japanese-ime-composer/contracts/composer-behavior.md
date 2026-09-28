# Contracts: composer 挙動 + CI 検証 (X-2)

Phase 1。本 feature は外部 API を新設しない (frontend)。ここでの「契約」は **composer の観測可能な挙動契約**と、
**CI 検証の存在契約**である。各契約を FR / SC と対応づける (**規則の正本は spec.md の FR/SC。本表は参照形**)。

## C-1. IME 非破壊契約 (既存二重ガードを殺さない)

消費側 (`thread.aui.tsx` の `Composer` / `SessionScreen` の `LiveThread`) は assistant-ui の
`ComposerPrimitive.Input` の二重ガードを無効化しない。

- (a) `onKeyDown` で `preventDefault` しない / Enter を横取りしない
- (b) `submitMode` を既定 (`"enter"`) のまま使う
- (c) `ComposerPrimitive.Input` を独自 `<textarea>` に差し替えない
- (d) IME 変換中 (`isComposing`) のマウス送信ボタン押下でも未確定文字列を送信しない (US-1 AC-6。assistant-ui が同経路を
  抑止するか research R-05 で確認し、しない場合のみ確定優先の最小処理を足す = keydown 用の自前ガード新設ではない)

→ **FR-001 / FR-012**。検証: **SC-001** — IME E2E で確定 Enter 非送信を **(i) idle と (ii) running+queue 有効化後の
両状態**で assert (design-gate H-2)、静的検査で (a)(b)(c) が 0 件違反、(d) をマウス送信テストで assert。

## C-2. 全角混在レイアウト契約

全角・半角・絵文字混在で composer が水平あふれ・桁ずれ・要素崩れを起こさない。textarea は行数に応じ伸びる。

→ **FR-002**。検証: **SC-002** (日本語スクリーンショット比較が承認済み基準画像と一致。行送りの視覚的妥当性は人間 deferred = quickstart V-2)。

## C-3. message queue 契約 (実行中積み → 次ターン送信)

- **保持の単一真実源は composer 側 feature state** (X-1 の in-memory セッションキューを保持層として二重に経由しない。
  design-gate H-1)。同時に in-flight となるのは dispatch 済み 1 件のみ
- `running` / `awaiting_permission` 中の送信は `MessageQueueItem(queued)` として composer 側に積まれ `QueueItemPrimitive` で可視化される
- 現ターン完了で queued 先頭が `dispatched` になり、**同一セッションの次ターン**として `session.send` される (新規起動なし)
- **終端の disposition**: **中断 (`interrupt`。セッション継続可)** は未 dispatch 項目を `still_queued` 残置 (次ターンで dispatch 可)。
  **`error` / crash / `provider-error` / 強制終了 (isDisabled 終端)** は未 dispatch 項目を `cancelled` にし reset / 再 launch で破棄
  (永久 stranded にせず次セッションへ持ち越さない。design-gate H-4/R2-M-002)。**表示 `still_queued`/`cancelled` は実状態と一致する**
  (design-gate H-1)。in-flight 1 件の中断結果は X-1 の interrupt-receipt の意味論を継承
- `interrupt`→steer は発生しない (現ターンを中断して積んだ入力で steer しない)
- `isDisabled` (error/killed) のとき積めない。**enqueue 時に空・空白のみ・バイト長上限を検証し空/超過は積まない** (空扱いと対称。R2-M-003)。**上限件数到達時は積み込みを拒否し理由を提示** (最古破棄しない。上限値は plan。R2-M-001)
- **cancelled 項目テキストの再編集/復帰導線は本 feature 対象外** (提示のみ。R2-L-001)

→ **FR-004 / FR-005 / FR-006**。検証: **SC-003 / SC-004** (fake runtime/session の component・Vitest。各終端での disposition /
表示と実状態の一致 assert / 負例 interrupt→steer 0 件)。

## C-4. draft 契約 (画面再構成をまたぐメモリ保持)

- composer 下書きは `SessionScreen` の phase / `isDisabled` 変化による Thread 再構成をまたいで保持される
- 送信 / 明示クリアで空になる
- メモリ内限定 (永続層・IPC・ログに出さない)

→ **FR-007 / FR-008**。検証: **SC-005** (再構成を誘発する状態遷移を与えた component テスト)。

## C-5. CI 検証の存在契約 (Principle VIII Automated)

`verify` workflow に以下が存在し緑である:

- **IME E2E ジョブ**: `isComposing` 中の Enter が送信経路に届かず、確定後の 2 度目で送信される。**idle と running+queue 有効化後の
  両状態** + マウス送信で検証 (C-1 の回帰固定 = FR-012。既存ガードを殺す差分で落ちる)
- **日本語スクリーンショット比較ジョブ**: 全角混在 composer が基準画像と一致する (C-2)
- **credential-free / フォント同梱**: E2E は capability stub で有効 composer に到達し real 資格情報を CI に持ち込まない (H-3)。
  日本語フォントはリポジトリ同梱のみ (パッケージマネージャ導入なし。H-6)。技術・CI 統合・ガバナンスは AD-038 が正本
- **移設対象外を含めない**: スクロール安定 E2E / Principle IX 到達集合検査は載せない (roadmap L122-124 の deferred feature に残す)

→ **FR-009 / FR-010 / FR-011 / FR-012**。検証: **SC-006** (CI にジョブが存在し緑 + 移設対象外の非混入 + credential-free + 同梱フォント)。

## 契約 ↔ FR ↔ SC 対応表

| 契約 | FR | SC |
|---|---|---|
| C-1 IME 非破壊 | FR-001 / FR-012 | SC-001 |
| C-2 全角レイアウト | FR-002 | SC-002 |
| C-3 message queue | FR-004 / FR-005 / FR-006 | SC-003 / SC-004 |
| C-4 draft 保持 | FR-007 / FR-008 | SC-005 |
| C-5 CI 検証存在 | FR-009 / FR-010 / FR-011 / FR-012 | SC-006 |
| (用語) glossary 反映 | FR-013 | — (architecture/po-reviewer) |
