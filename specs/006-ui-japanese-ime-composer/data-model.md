# Data Model: 日本語 composer (X-2)

Phase 1。本 feature は frontend の composer state のみを扱う (永続層・DTO・IPC を新設しない)。
すべて **renderer のメモリ内 state** であり、境界 (IPC / 永続層 / ログ) に出さない (FR-008 / Principle V)。

## Entities

### Composer draft (下書き)

未送信の composer 入力テキスト。

| フィールド | 型 | 説明 |
|---|---|---|
| `text` | string | 未送信の入力テキスト (会話由来ペイロード) |
| (紐付け) | — | 単一セッション (X-1) の composer に 1 対 1。sessionId 鍵は X-5 の複数セッションで導入 |

- **配置**: feature 側 state (session state / zustand slice)。`useExternalStoreRuntime` の composer state の**外**に置く
  (runtime インスタンス紐付きだと Thread 再構成で失われるため。AD-037 §4(i)/(ii)。research R-03)。
- **不変条件**: メモリ内限定。**永続層・IPC・ログに出さない** (FR-008 / Principle V。会話由来文字列)。

### MessageQueueItem (キュー項目)

`running` / `awaiting_permission` 中に積まれた未送信入力。X-1 の in-memory セッションキュー
(`still_queued` / `cancelled`。X-1 FR-019) と対応する。

| フィールド | 型 | 説明 |
|---|---|---|
| `text` | string | 積まれた入力テキスト (会話由来) |
| `status` | `queued` \| `dispatched` \| `cancelled` | 状態。X-1 の `still_queued`(=queued) / `cancelled` と対応 |
| `enqueuedAt` | 時刻 | 積んだ順の保持 (FIFO) |

- **配置 (単一真実源)**: feature 側 state (下書きと同層) が **唯一の保持層 (single locus)**。X-1 の in-memory
  セッションキューを保持層として二重に経由しない (二重積み・二重 dispatch を作らない。design-gate H-1)。同時に in-flight
  となるのは dispatch 済みの 1 件のみ。表示は `QueueItemPrimitive` (Principle XIII)。
- **不変条件**: **enqueue 時に空 / 空白のみ・バイト長上限を検証し、空・超過は積まない** (FR-003。dispatch 時の遅延失敗を
  作らない。空扱いと対称。design-gate R2-M-003)。`isDisabled` (error/killed) 時は積めない (US-2 AC-5)。**キュー件数の上限
  到達時は新規積み込みを拒否し理由を提示** (最古破棄しない。上限値は plan。design-gate R2-M-001)。メモリ内限定
  (境界・ログに出さない)。**表示される `status` は実状態と一致する** (design-gate H-1)。

## State transitions

### draft のライフサイクル

```
(空) ──入力──▶ (下書きあり) ──Thread 再構成 (phase/isDisabled 変化)──▶ (下書きあり: 保持)  [FR-007 / SC-005]
             │
             ├──送信 (queue 追加 or 直接 send)──▶ (空)
             └──明示クリア──▶ (空)
```

### message queue のライフサイクル

```
composer 送信操作
  │
  ├─ runState = idle/done      ──▶ 直接 session.send (現ターン)               [X-1 既存経路]
  ├─ runState = running/awaiting_permission ──▶ MessageQueueItem(queued) を composer 側に保持  [FR-004 / SC-003]
  │        │
  │        ├─ 現ターン完了 (running→done/idle) ──▶ queued 先頭を dispatched にし session.send (次ターン)  [FR-005 / SC-004]
  │        ├─ 中断 (interrupt。セッション継続可) ──▶ 未 dispatch 項目は still_queued 残置 (次ターンで dispatch 可)  [FR-006]
  │        └─ error / crash / provider-error / 強制終了 (isDisabled 終端) ──▶ 未 dispatch 項目を cancelled にし
  │                reset / 再 launch で破棄 (永久 stranded にせず次セッションへ持ち越さない)。表示を実状態と一致 [FR-006 / SC-004]
  └─ runState = error/killed (isDisabled) ──▶ 新規に積めない (送信不能)                                     [US-2 AC-5]
```

- **保持は単一真実源 (composer 側 feature state)**。running 中は composer 側に積み、完了時に先頭 1 件のみ dispatch する
  (design-gate H-1)。
- **dispatch trigger**: 現ターン完了 (`running`→`done`/`idle`、`awaiting_permission` 解消後)。auto/manual の最終確定は
  research R-02 に従い実装で決める (既定は完了直後 auto dispatch)。
- **終端時の disposition**: **中断 (interrupt。セッション継続可)** は未 dispatch 項目を still_queued 残置 (次ターンで dispatch 可)。
  **error / crash / provider-error / 強制終了 (composer が isDisabled になる終端)** は未 dispatch 項目を cancelled にし、
  feature-state のキューを reset / 再 launch で破棄する (永久 stranded にせず、次セッションへ持ち越して誤 dispatch しない。
  Principle VIII。design-gate H-4/R2-M-002)。in-flight 1 件の中断結果は X-1 の interrupt-receipt / still_queued / cancelled の
  意味論を継承。
- **interrupt→steer はしない** (AD-036 に踏み込まない。FR-005)。

## 対応する SC / FR

| Entity / 遷移 | FR | SC |
|---|---|---|
| Composer draft の保持/クリア | FR-007 / FR-008 | SC-005 |
| MessageQueueItem の積み/次ターン dispatch/取消 | FR-004 / FR-005 / FR-006 | SC-003 / SC-004 |
| IME 非破壊 (composer 入力の送信抑止) | FR-001 | SC-001 |
