---
status: proposed
date: 2026-10-29
id: AD-066
deciders: ukitomato
tags: [session, permission, isolation, constitution, constitution-check]
supersedes: []
superseded-by: []
---

# AD-066: 権限モードの Auto を起動と実行中で選べるようにする — 隔離の無いランタイムでは確認を挟み、main が確認の印を必須にする

本 ADR は X-10 ([spec 026](../../specs/026-session-live-auto-permission-mode/spec.md)) の plan で起こした。spec の U-1〜U-5 は 2026-10-29 に利用者が承認した。plan の P-1〜P-12 ([research.md](../../specs/026-session-live-auto-permission-mode/research.md)) は本 ADR の決定の実装の選択である。規則の正本は [data-model.md](../../specs/026-session-live-auto-permission-mode/data-model.md) で、本 ADR は決定と読み替えだけを書く。**Constitution Principle III の改定を伴う** (1.4.0 → 1.5.0。MINOR)。改定手順 2 (architecture-reviewer を交えた人間のレビュー) を 026 の PR で受けてから accepted にする。

## Context

- Closta の権限モードは起動・実行中とも安全 3 値 (`default` / `plan` / `dontAsk`) に閉じている ([AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (a)・[AD-062](0062-live-session-permission-mode-model-and-rename.md) Decision 1)。昇格の値 (`acceptEdits` / `auto` / `bypassPermissions`) とランタイムの capability に連動するゲートは M4 の I-3 に置いてきた
- 利用者は承認カードに毎回答えずに進められる `auto` (Claude Code の分類器が操作ごとに許可・拒否する) を、隔離 (I-1 / I-2) より先に、隔離の無い Win32Runtime でも使いたい (spec U-1〜U-3)
- Constitution Principle III は「`autoModeSafe !== true` のランタイムで Auto / `bypassPermissions` を選択可能にしてはならない」とし、Verification は「E2E で `Win32Runtime` 選択時に Auto / bypass が disabled」を求める
- [AD-020](0020-sdk-emitted-message-inventory.md) の危険度表は `auto` を「危険」とし、「`auto` では拒否が黙って起きる」ことを使う条件に挙げた。拒否の表示 (`SDKPermissionDeniedMessage`) は既に実装済み

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| Constitution Principle III (Statement・Examples・Verification) | `autoModeSafe !== true` のランタイムで選べてはならない対象から `auto` を外し、代わりに「起動・実行中とも毎回、明示の確認を挟み、main は確認の印の無い要求を拒否する」を要求にする。`bypassPermissions` の規則は変えない (Decision 2。新しい本文は data-model §8.1) |
| AD-062 Decision 1 (実行中の遷移は安全 3 値の中だけ・昇格の値への経路 0 件) | `auto` についてだけ置き換える。安全 3 値 ⇄ `auto` の遷移を許す。`acceptEdits` / `bypassPermissions` への経路 0 件は変えない (Decision 1) |
| AD-036 §5 (実行時に権限モードを変えない) / 005 SC-006(a) (初期オプションと実行時 `setPermissionMode` の双方で昇格の値への経路 0 件) | 経路 0 件の対象を `acceptEdits` / `bypassPermissions` に狭める。`auto` への経路は確認つきで 1 つ (Decision 1 / 2) |
| AD-041 (a) (起動の権限モードを安全 3 値の allowlist にし、`assertSafePermissionMode` で閉じる) | allowlist を許可の 4 値 (安全 3 値と `auto`) にし、包みを `assertSelectablePermissionMode` に替える (Decision 1 / 3)。capability に連動する昇格モードの提示 (AD-041 (c)) は I-3 のまま |
| AD-020 の危険度表 (`auto` = 危険) | 表は変えない。`auto` は危険な値のまま、確認と帯 (Decision 2 / 4) を条件に選べる値にする。「拒否が黙って起きる」は既存の拒否の表示で足りる (spec Assumptions) |
| [AD-059](0059-session-resume-query-option-and-conversation-id.md) Decision 3 (再開の最初の `init` が安全 3 値の外なら `resume-failed`) | 「安全 3 値、または起動で頼んだ値と同じ」なら通す。頼んでいない昇格は今どおり失敗 (Decision 5) |
| [AD-042](0042-provider-type-refinement-and-d4-lapse.md) の `schemaVersion` の規則 (列挙値を広げる store は版を上げる。例に I-3 の権限モードの拡張) | プリセットの `schemaVersion` を 1 → 2 にする (Decision 6) |
| AD-062 の `LIVE_SETTING_FAILURES` (集合を変えるには ADR が要る) | `auto-mode-unconfirmed` を足して 12 にする (Decision 2) |

## Decision

1. **起動と実行中で選べる権限モードを許可の 4 値 (`default` / `plan` / `dontAsk` / `auto`) にする。** domain に `SelectablePermissionMode` とその述語・包みを置き、main の検査・セッションスレッドの decoder・SDK に渡す直前の包みの 3 段をこちらに付け替える。安全 3 値の型は帯の条件のために残す。`acceptEdits` / `bypassPermissions` はどの段も通さない
2. **`isAutoModeAllowed` が false のランタイムで `auto` を選ぶときは、起動・実行中とも毎回、明示の確認を挟む。** 確認が要るかは domain の 1 つの関数 (`requiresAutoModeConfirmation`) で決め、入力は `isAutoModeAllowed` だけ (Principle III の単一の判定点)。renderer は承諾を要求の印 (IPC の 3 つ目の引数 `autoModeAcknowledged`) として載せ、**main は確認が要るのに印が無い要求を `auto-mode-unconfirmed` で拒否する** (起動・再開は `LaunchPreflightReason`、実行中は `LiveSettingFailure` に足す)。印は起動の設定に持たせない (プリセット・`lastConfig` で確認を省かない)。`isAutoModeAllowed` が true のランタイムでは確認を挟まない (隔離が分かったランタイムで確認を省くかの見直しは I-3)
3. **項目 16 の強さを保つ。** 許可の包み (`SANCTIONED_PERMISSION_MODE_WRAPPER`) を `assertSelectablePermissionMode` に替える。昇格の値の文字列リテラルの禁止 (`PERMISSION_MODE_ESCALATION_VALUES`) は `auto` を含む 3 値のまま残し、agents に `'auto'` を直書きさせない (値は main から届く)。`.setPermissionMode(assertSelectablePermissionMode('bypassPermissions'))` が発火する rule fixture を足す
4. **利用者が選んだ `auto` で動いている間は、中央のヘッダの下に Auto の帯を出す。** 「選んだ `auto`」と隔離の状態 (`autoModeStatus` の今の文言の規則) を書き、`role="note"` にして読み上げは切り替えのときの 1 回だけにする。利用者が選んでいないのに安全 3 値の外を観測したときは、今の権限モードの警告の帯 (原因を断定しない。`role="alert"`) のまま
5. **再開の init の検査を、起動で頼んだ値との比較に広げる。** 頼んだ `auto` が `auto` で戻るのは通し、頼んでいない昇格は `resume-failed` のまま。再開の初期値は `auto` を起動の既定に戻す (spec Edge Cases)
6. **プリセットの `schemaVersion` を 2 にする。** 読み込みは 1 と 2 を同じ述語で受け、書き出しは 2。古い版は 2 を `schema-version-unknown` として読まない

## Consequences

- 隔離の無いランタイムで、分類器が許可した操作はホストでそのまま実行される。Closta が手当てするのは「選ぶ前の確認」「動いている間の帯」「拒否の表示」の 3 つで、操作そのものは止めない (Principle III の改定の範囲)
- `IPC_CHANNELS`・`SessionControl` の種類・`QUERY_MUTATION_METHODS`・`SessionLaunchConfig` のキーは変わらない。3 つの IPC の引数が 1 つ増え、拒否の理由が 2 つの集合で 1 つずつ増える (起動の拒否の理由は 25)
- プリセットに `auto` を保存した後に古い版の Closta に戻すと、プリセットのファイル全体を読めない (`schema-version-unknown`)
- `auto` が使えない (アカウント・モデル・`disableAutoMode`) ときは、Claude Code が返す失敗を今の経路で出す。Closta は事前に判定しない
- I-3 は `acceptEdits` / `bypassPermissions`、sandbox の capability 判定、隔離が分かったランタイムでの確認の扱いを持ち続ける

## Alternatives

- **I-3 (隔離) を待つ** — 利用者が今いちばん欲しい機能を M4 まで止める (spec U-1 で退けた)
- **隔離のあるランタイムだけで `auto` を選べるようにする** — 今の主な利用 (Win32Runtime) で使えない (spec U-3 で退けた)
- **renderer の確認だけにする** — 検証済みの IPC を直接呼ぶ経路で確認を飛ばせる (spec FR-007)
- **`SessionLaunchConfig` に承諾を持たせる** — プリセット・`lastConfig` に承諾が残り、確認を省く経路になる (FR-012)
- **`auto` を `PERMISSION_MODE_ESCALATION_VALUES` から外す** — agents が `'auto'` を直書きでき、項目 16 が弱まる (FR-004)

## Confirmation

- main の単体テストで、`acceptEdits` / `bypassPermissions` / 不明な値の起動・再開・実行中の要求と、隔離の無いランタイムで印の無い `auto` の要求が拒否され、`prepareLaunch` / 制御が呼ばれないことを確かめる (026 SC-002 / SC-003)
- セッションスレッドの decoder と制御シンクの単体テスト、項目 16 の rule fixture (新設 1・差し替え 4) で、昇格の 2 値が届かないことを確かめる (SC-002)
- renderer の単体テストと E2E で、確認の出る・出ない (2 操作 / 1 操作)、取り消しで何も送らない、帯の出方と 1 回の読み上げを確かめる (SC-001 / SC-004)。Principle III の E2E (`e2e/launch-dialog.spec.ts`) を新しい Verification に書き直す
- 026 quickstart V-3 で、Win32Runtime で `auto` に切り替えた後の分類器の判断を実機で記録する (SC-005。行えなければ「未実施」)
