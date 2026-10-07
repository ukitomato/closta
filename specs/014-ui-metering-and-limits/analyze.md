## Specification Analysis Report — 014-ui-metering-and-limits (Track A / design-gate R1)

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| I1 | Inconsistency | HIGH | FR-002・SC-001 / data-model §1 / FE-010 | spec は再ログインの導線を認証の失敗にだけ、data-model と FE-010 は `auth-failed` と `provider-error` の両方 | 揃える (知らない失敗にも案内するなら FR-002 / SC-001 を直す) |
| U1 | Underspec (計算式) | HIGH | data-model §4 目盛り / research R-04 | `usage` は主ループ・ターンごと (`sdk.d.ts:5363`) で、ターン内の往復を合算したものと読める。tool を何度も呼ぶターンで割合が大きく出すぎ 100% を超えうる | 実機か資料で確かめ、合算なら最後の API 呼び出しの usage を使うか上限で丸める。80% のテストも |
| U2 | Underspec | MEDIUM | data-model §1 `api-error` / §5 | 「HTTP {status}」の status はストアの `meter` にしかなく、`launchFailureLabel(reason)` 等は reason だけ | status が無いときの文言を決めるか経路を書く |
| U3 | Underspec | MEDIUM | data-model §3 `api-retry` / 011 data-model §2 | 再試行の行に終わりの状態が無く「結果不明」になる。`isTerminalSystemEventStatus` (system-event.ts:193) の更新がタスクに無い | 閉じる契機と終わりの status。BE-021 に更新とテスト |
| U4 | Underspec | MEDIUM | data-model §3 行の id | 連番を誰が持ち、いつ増やすかが無い。`toSystemEventMessage` は純関数 | セッションスレッドが持ち result で増やす |
| I2 | Inconsistency | MEDIUM | US-4 AC1・FR-010 / 013 data-model §5 | O-7 の中央のヘッダに権限モードは無い。足すと「概要と重ねない」に反する | 出す場所を 1 つにするか例外として記録 |
| U5 | Underspec | MEDIUM | data-model §4・§5 | 安全 3 値の外 (`acceptEdits` / `bypassPermissions` / `auto`) と `unknown` の文言が無い | §5 に 4 つ |
| C1 | Coverage | MEDIUM | SC-002「DOM に 0 件」 | DOM を走査するテストが無い | FE-020/021 に |
| C2 | Coverage | MEDIUM | SC-004 / plan RK-04 | E2E は計量を流さない (中身の無い合格) | agents の単体に絞るか偽の supervisor に流れを足す |
| U6 | Underspec | MEDIUM | research R-02 / data-model §1 | assistant の `error` (`SDKAssistantMessageError` の列挙) を分類の材料として検討していない | research に Alternatives として |
| E1 | Edge | LOW | data-model §2 間引き | tool の結果の後に溜めた `tool-elapsed` が来て表示が復活しうる | 結果を受けたら捨てる |
| E2 | Edge | LOW | data-model §4 limitType | `seven_day_overage_included` が無い | 1 行足すか明記 |
| I3 | Inconsistency | LOW | AD-047 Context | 「U-1〜U-3」で U-4 が抜け | 直す |
| I4 | Inconsistency | LOW | roadmap:256 | roadmap は `ResultTermination` の拡張と `errors` を前提 | SH-010 で記録 |
| I5 | Inconsistency | LOW | glossary:825 | システムイベントの行の定義が Hook / task に限られる | SH-001 で |
| D1 | Doc | LOW | running-session-store.ts:278 | 新しい行は `receivedMessages` に数えられる | data-model に注記 |
| S1 | Style | LOW | tasks.md | `[P]` の使用 0 件 | 付ける |
| N1 | Note | LOW | status-update.ts:24,39 | 状態通知の `reasonKey` の値の集合が 17 に広がる (main のコードの差分は 0) | AD-047 Consequences に 1 行 |

### コードと SDK の事実の照合

ずれ無し (`sdk-agent-session.ts:527-561`、`session-core.ts:326-354`、`agent-session.ts`、`labels.ts:16-79`、ui-coverage の 10 行と F 節 5 行、SDK の型)。`SessionEvent` は supervisor で絞られず decoder (`session-event-decoder.ts:52`) だけが見る。

### Coverage

FR-001〜FR-016 / SC-001〜SC-006 のすべてに task (I1・U1・U3・U4・I2・U5・C1・C2・I5 を備考)。

### Constitution Alignment

MUST の違反は無い。XII: Tier A の `get_context_usage` の `表示不要` は書式上は許される (妥当性は ui-coverage-reviewer)。

### Metrics

要件 22 / タスク 18 / カバー率 100% / 曖昧 6 / 重複 0 / **Critical 0** / High 2 / Medium 8 / Low 8
