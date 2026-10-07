# Design Gate: 計量と制限の表示 (O-4)

**Run**: 2026-10-04 (Round 1)
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 2 | 8 | 8 |
| po-reviewer | 0 | 3 | 8 | 2 |
| architecture-reviewer | 0 | 2 | 8 | 4 |
| security-reviewer | 0 | 0 | 6 | 1 |
| platform-boundary-reviewer | 0 | 1 | 4 | 2 |
| **Total (dedup)** | **0** | 7 | 18 | 12 |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし本 spec は未承認の判断 (U-1〜U-6)・proposed の AD-046 / AD-047・未マージの O-7 に依り、実装の最初に利用者の実機の作業 (SH-000) が要るので、/cl-implement には入らない。** High 7 件は gate の後に spec / data-model / plan / tasks / quickstart / AD-047 で手当てした。手当ては再レビューを受けていない

## High (dedup 後 7 件)

| ID | 内容 | 出所 | 手当て |
|---|---|---|---|
| H-01 | X-1 の FR-020 / US-4 AC6 (クレジット不足・rate limit は `provider-error`) を記録なしで上書き。根拠の「X-1 FR-030」は 005 spec に存在しない。クレジット不足の案内が消える | arch H-001 | 「X-1 FR-020 / US-4 AC6」に直した。AD-047 に「読み替える箇所」。assistant の `error` (列挙) を材料に足し、`billing` のキーで案内を保つ (data-model §1 / AC3a) |
| H-02 | task の進み具合のために task ごとの状態を持たせ、AD-044 Decision 6 に反する | arch H-002 | 既存の task の行の更新 (`opens: false`) にし、`meter` の `task-progress` と保持を消した (data-model §3 / FR-013) |
| H-03 | 権限モードの昇格を観測しても注意の見た目だけで、AD-041 の「昇格経路 0 件」との関係が無く、原因を「アプリの外」と決めつける | pb H-001 / arch M-007 / po M-006 | U-6 を足す (警告の帯 `role="alert"`、隔離の無いランタイムで文言を強める、強制は I-3)。文言を原因を断定しない形に。AC1a を P1 扱いに。昇格値は domain だけ (項目 16 に例外なし) |
| H-04 | 再ログインの導線の規則が spec と data-model で食い違う。認証切れの実機の形を誰も観察していない | analyze I1 / arch M-008 / sec M-005 / po M-004 | data-model §1 を正本に (`auth-failed` と `provider-error`)。`execution-error` / `api-error` の文言に「ログイン状態も確かめる」。実機の fixture を採る SH-000 (利用者) |
| H-05 | コンテキストの推定に result の `usage` (ターン内の往復の合算でありうる) を使い、100% を超えうる | po H-003 / analyze U1 | 最後の assistant のメッセージ (1 回の API 呼び出し) の usage に替えた。100% 超の表示、`/context` との比較を V-3 に (data-model §2 / §4) |
| H-06 | US-1 AC3 と data-model §1 で「`api_error_status` が無い」ときの理由が食い違う | po H-001 | AC3 を直し、無いときは汎用の `provider-error` |
| H-07 | SC-004 の E2E は計量を流さず何も測っていない | po H-002 / analyze C2 / arch M-006 | SC-004 を agents の単体 (偽の時計。並列・上限・取り消し) に絞り、E2E を計測経路から外した |

## Medium / Low (抜粋。全文は各トラックの raw output)

- 値の検証 (列挙の `Object.hasOwn`・`Map`・id の形・`modelId` の URL の資格情報の形・数の範囲と単位・`resetsAt` の Invalid Date・`models` の件数) を data-model §2 の正本に (sec M-001〜M-003 / arch L-003)
- 間引きの範囲 (task も)・セッションあたりの上限・取り消し (`dispose()` の後に `event` を送らない) (sec M-004 / pb M-004 / analyze E1)
- 連番と比較の基準は `run()` の closure、基準の初期値は起動の設定 (pb L-001 / analyze U4)
- `meters` を `close()` で捨てる・起動の設定に書き戻さない (pb M-003 / L-002)
- `Equal<…>` で SDK の列挙の値域を固定 (pb M-002)
- 行の組み立ては agents に置き過去ログの変換に足さない (arch M-002)、`isTerminalSystemEventStatus` の更新 (analyze U3)、`api-retry` の行の閉じ方 (analyze U3)
- 権限モードは「概要」だけ (O-7 §5 を保つ) (po M-001 / arch M-004 / analyze I2)、費用を中央のヘッダにも (po M-002)
- Quota banner の書式・`seven_day_overage_included` (po M-003 / analyze E2)、帯が無い Provider の 429 の文言 (po M-005)
- U-1 の範囲に session の操作 UI (arch M-001)、`errors` を出さないことを U-5 に (po L-001)
- O-6 との圧縮の関係 (arch M-003)、`receivedMessages` の基準 (arch M-005 / analyze D1)、状態通知の `reasonKey` の値の集合 (arch L-002 / analyze N1)、glossary (arch L-001 / analyze I5)、Tier A の `get_context_usage` の備考 (arch L-004)、経路の通しのテスト (po M-008)、`[P]` (analyze S1)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
