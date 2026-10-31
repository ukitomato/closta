---
status: proposed
date: 2026-10-29
id: AD-066
deciders: ukitomato
tags: [session, permission, isolation, constitution, constitution-check]
affected_domains: [session, ui, isolation]
supersedes: []
superseded-by: []
---

# AD-066: 権限モードの Auto を起動と実行中で選べるようにする — 隔離の無いランタイムでは確認を挟み、main が確認の印を必須にする

本 ADR は X-10 ([spec 026](../../specs/026-session-live-auto-permission-mode/spec.md)) の plan で起こした。spec の U-1〜U-5 は 2026-10-29 に、U-6 (design-gate C-001 への回答) は 2026-10-31 に利用者が承認した。plan の P-1〜P-13 ([research.md](../../specs/026-session-live-auto-permission-mode/research.md)) は本 ADR の決定の実装の選択である。規則の正本は [data-model.md](../../specs/026-session-live-auto-permission-mode/data-model.md) で、本 ADR は決定と読み替えだけを書く。**Constitution Principle III の改定を伴う** (1.5.0 → 1.6.0。MINOR。2026-10-30 に 025 (AD-065) の 1.5.0 のマージを受けて版を振り直した)。改定手順 2 (architecture-reviewer を交えた人間のレビュー) を 026 の PR で受けてから accepted にする。

## Context

- Closta の権限モードは起動・実行中とも安全 3 値 (`default` / `plan` / `dontAsk`) に閉じている ([AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (a)・[AD-062](0062-live-session-permission-mode-model-and-rename.md) Decision 1)。昇格の値 (`acceptEdits` / `auto` / `bypassPermissions`) とランタイムの capability に連動するゲートは M4 の I-3 に置いてきた
- 利用者は承認カードに毎回答えずに進められる `auto` (Claude Code の分類器が操作ごとに許可・拒否する) を、隔離 (I-1 / I-2) より先に、隔離の無い Win32Runtime でも使いたい (spec U-1〜U-3)
- Constitution Principle III は「`autoModeSafe !== true` のランタイムで Auto / `bypassPermissions` を選択可能にしてはならない」とし、Verification は「E2E で `Win32Runtime` 選択時に Auto / bypass が disabled」を求める
- [AD-020](0020-sdk-emitted-message-inventory.md) の危険度表は `auto` を「危険」とし、「`auto` では拒否が黙って起きる」ことを使う条件に挙げた。拒否の表示 (`SDKPermissionDeniedMessage`) は既に実装済み

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| Constitution Principle III (Statement・Examples・Verification) | `autoModeSafe !== true` のランタイムで選べてはならない対象から `auto` を外し、代わりに「起動・実行中とも毎回、明示の確認を挟み、main は確認の印の無い要求を拒否する」を要求にする。`bypassPermissions` の規則は変えない。Why の「UI 上で選べてしまうこと自体が事故経路」と Bad の「選択は可能にしておき、起動時にエラー」は `bypassPermissions` に限り、Auto の起動の時点の確認はエラーではないと Examples に書く。`autoModeSafe === true` で確認を省くのは sandbox が有効でないことを承知のうえの暫定と書く (Decision 2。新しい本文は data-model §8.1) |
| AD-062 Decision 1 (実行中の遷移は安全 3 値の中だけ・昇格の値への経路 0 件) | `auto` についてだけ置き換える。安全 3 値 ⇄ `auto` の遷移を許す。`acceptEdits` / `bypassPermissions` への経路 0 件は変えない (Decision 1) |
| AD-036 §5 (実行時に権限モードを変えない) / 005 SC-006(a) (初期オプションと実行時 `setPermissionMode` の双方で昇格の値への経路 0 件) | 経路 0 件の対象を `acceptEdits` / `bypassPermissions` に狭める。`auto` への経路は確認つきで 1 つ (Decision 1 / 2) |
| AD-041 (a) (起動の権限モードを安全 3 値の allowlist にし、`assertSafePermissionMode` で閉じる) | allowlist を許可の 4 値 (安全 3 値と `auto`) にし、包みを `assertSelectablePermissionMode` に替える (Decision 1 / 3)。capability に連動する昇格モードの提示 (AD-041 (c)) は I-3 のまま |
| AD-020 の危険度表 (`auto` = 危険) | 表は変えない。`auto` は危険な値のまま、確認と帯 (Decision 2 / 4) を条件に選べる値にする。「拒否が黙って起きる」は既存の拒否の表示で足りる (spec Assumptions) |
| [AD-059](0059-session-resume-query-option-and-conversation-id.md) Decision 1 (再開は権限モードを変えない。権限モードは安全 3 値のまま) と Confirmation V-9 (実効の権限モードが選んだ安全 3 値のまま) | 再開の権限モードも許可の 4 値にする。`auto` は確認と印つき (Decision 2)。頼んでいない昇格は Decision 5 のとおり `resume-failed`。再開が会話の権限モードを勝手に変えない (escalation-neutral) の趣旨は変えない |
| [AD-059](0059-session-resume-query-option-and-conversation-id.md) Decision 3 (再開の最初の `init` が安全 3 値の外なら `resume-failed`) | 「安全 3 値、または起動で頼んだ値と同じ」なら通す。頼んでいない昇格は今どおり失敗 (Decision 5) |
| [AD-015](0015-wsl-access-strategy.md) Consequences (判定完了まで危険な権限モードを選択不可にしておく) | `bypassPermissions` は今どおり。`auto` は判定中 (`unknown`) も確認つきで選べる (`isAutoModeAllowed` が false なので確認が出る。Decision 2)。`autoModeSafe` が true になる条件 (§8。sandbox が使える) は変えない |
| [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (c) の前方注記 (昇格モードを足したら、プリセットを適用するたびに適用先ランタイムの capability で再検証する) | `auto` については、適用の時点ではなく起動を押した時点の確認で満たす (プリセットの適用で前の承諾を消し、起動の前に確認を出す。026 data-model §6.2)。`acceptEdits` / `bypassPermissions` を足すときの義務は I-3 に残す |
| [AD-042](0042-provider-type-refinement-and-d4-lapse.md) の `schemaVersion` の規則 (列挙値を広げる store は版を上げる。例に I-3 の権限モードの拡張) | プリセットの `schemaVersion` を 2 → 3 にする (版 2 は [AD-064](0064-launch-config-additional-directories-limits-and-title.md) Decision 4。Decision 6) |
| AD-062 の `LIVE_SETTING_FAILURES` (集合を変えるには ADR が要る) | `auto-mode-unconfirmed` を足して 12 にする (Decision 2) |
| [AD-065](0065-live-model-list-and-claude-code-permission-mode-names.md) Decision 3 の「選べる値は変えない: AD-062 の安全 3 値のまま。昇格の値の名前は帯と transcript の行で読むためだけにある」 | `auto` の名前 (`Auto`) は選択肢・確認・Auto の帯でも使う。名前の表 (`PERMISSION_MODE_NAMES`) の 1 か所から取り、説明を付けない規則は変えない (Decision 1 / 4) |
| [AD-047](0047-session-meter-and-failure-reasons.md) Decision 5 (権限モードの昇格を観測したら原因を断定しない警告の帯で知らせる) | 利用者が Closta から選んだ `auto` を観測したときは Auto の帯にする。選んでいないのに安全 3 値の外を観測したときは今の帯のまま。強制の要否の持ち主 (I-3) は変えない (Decision 4) |

## Decision

1. **起動と実行中で選べる権限モードを許可の 4 値 (`default` / `plan` / `dontAsk` / `auto`) にする。** domain に `SelectablePermissionMode` とその述語・包みを置き、main の検査・セッションスレッドの decoder・SDK に渡す直前の包みの 3 段をこちらに付け替える。安全 3 値の型は帯の条件のために残す。`acceptEdits` / `bypassPermissions` はどの段も通さない
2. **`isAutoModeAllowed` が false のランタイムで `auto` を選ぶときは、起動・実行中とも毎回、明示の確認を挟む。** 確認が要るかは domain の 1 つの関数 (`requiresAutoModeConfirmation`) で決め、入力は `isAutoModeAllowed` だけ (Principle III の単一の判定点)。renderer は承諾を要求の印 (IPC の 3 つ目の引数 `autoModeAcknowledged`) として載せ、**main は確認が要るのに印が無い要求を `auto-mode-unconfirmed` で拒否する** (起動・再開は `LaunchPreflightReason`、実行中は `LiveSettingFailure` に足す)。印は起動の設定に持たせない (プリセット・`lastConfig` で確認を省かない)。`isAutoModeAllowed` が true のランタイムでは確認を挟まない (spec U-6。2026-10-31 に利用者が design-gate C-001 への回答として採った)。**true は「そのランタイムで sandbox が使える」(bubblewrap のある WSL など) であって、「このセッションが隔離の中で動いている」ではない。** Closta は I-3 まで Claude Code の sandbox を有効にしない (`QUERY_OPTION_KEYS` にも settings の許可リストにも sandbox が無い) ので、確認を省いた `auto` のセッションも隔離されずに動く。これは受け入れたリスクで (下の Consequences)、手当ては文言だけ: 確認を出さない経路でも Auto の帯の隔離の文は「このセッションは隔離されていません」と書き、隔離されているかのように読める文を出さない (Decision 4)。全ランタイムで確認を出す案は採らなかった (Alternatives)。sandbox を有効にするか、確認を省き続けるかは I-3 で判断し直す。確認の要否の判定 (`requiresAutoModeConfirmation`) と main の印の検査はゲートの方針にあたるが、X-10 では `session` に暫定で置き、I-3 で `isolation` へ移す (isolation charter と session charter に書く)
3. **項目 16 の強さを保つ。** 許可の包み (`SANCTIONED_PERMISSION_MODE_WRAPPER`) を `assertSelectablePermissionMode` に替える。昇格の値の文字列リテラルの禁止 (`PERMISSION_MODE_ESCALATION_VALUES`) は `auto` を含む 3 値のまま残し、agents に `'auto'` を直書きさせない (値は main から届く)。`.setPermissionMode(assertSelectablePermissionMode('bypassPermissions'))` が発火する rule fixture を足す
4. **利用者が選んだ `auto` で動いている間は、中央のヘッダの下に Auto の帯を出す。** 「選んだ `auto`」と隔離の状態を書き、`role="note"` にして読み上げは同じセッションで切り替わったときの 1 回だけにする (live region はセッションごとに常に mount しておく)。隔離の文は `autoModeStatus` で選ぶが、どの値 (`allowed` を含む) でも隔離されていないと読める文にする (今の権限モードの警告の帯の隔離の文は共有しない。Decision 2)。利用者が選んでいないのに安全 3 値の外を観測したときは、今の権限モードの警告の帯 (原因を断定しない。`role="alert"`) のまま
5. **再開の init の検査を、起動で頼んだ値との比較に広げる。** 頼んだ `auto` が `auto` で戻るのは通し、頼んでいない昇格は `resume-failed` のまま。再開の初期値は `auto` を起動の既定に戻す (spec Edge Cases)
6. **プリセットの `schemaVersion` を 3 にする。** 版 1 の読み替え (AD-064) と版 2 は今のまま受け、版 3 は版 2 と同じ形 (権限モードの述語だけが許可の 4 値)。書き出しは 3。版 2 までしか知らない Closta は 3 を `schema-version-unknown` として読まない

## Consequences

- 隔離の無いランタイムで、分類器が許可した操作はホストでそのまま実行される。Closta が手当てするのは「選ぶ前の確認」「動いている間の帯」「拒否の表示」の 3 つで、操作そのものは止めない (Principle III の改定の範囲)
- **受け入れたリスク (spec U-6)**: `isAutoModeAllowed` が true のランタイム (bubblewrap のある WSL など) では、確認なしで `auto` になり、そのセッションも sandbox なしにディストロ (と `/mnt/c` から見えるホストのファイル) でそのまま動く。利用者は 2026-10-31 に、Closta が sandbox をまだ有効にしていないことを承知のうえでこれを採った。Constitution Principle III の改定文にも暫定の受け入れとして書く。I-3 への申し送り: sandbox を有効にするか、true のランタイムで確認を省き続けるかを判断し直す (roadmap の I-3 の行)
- `IPC_CHANNELS`・`SessionControl` の種類 (9)・`QUERY_MUTATION_METHODS`・`SessionLaunchConfig` のキー (10) は変わらない。3 つの IPC の引数が 1 つ増え、拒否の理由が 2 つの集合で 1 つずつ増える (起動の拒否の理由は 25)
- プリセットに `auto` を保存した後に古い版の Closta に戻すと、プリセットのファイル全体を読めない (`schema-version-unknown`)
- `auto` が使えない (アカウント・モデル・`disableAutoMode`) ときは、Claude Code が返す失敗を今の経路で出す。Closta は事前に判定しない
- I-3 は `acceptEdits` / `bypassPermissions`、sandbox の capability 判定、sandbox を有効にすること、`isAutoModeAllowed` が true のランタイムで確認を省き続けるかの判断、確認の判定 (`requiresAutoModeConfirmation`) を `isolation` へ移すことを持ち続ける

## Alternatives

- **I-3 (隔離) を待つ** — 利用者が今いちばん欲しい機能を M4 まで止める (spec U-1 で退けた)
- **隔離のあるランタイムだけで `auto` を選べるようにする** — 今の主な利用 (Win32Runtime) で使えない (spec U-3 で退けた)
- **I-3 で sandbox を実際に渡すまで、全ランタイムで確認を出す** (`requiresAutoModeConfirmation` を `mode` だけで決める。design-gate C-001 の最小案) — 利用者が 2026-10-31 に退け、U-4 の「true では挟まない」を残した (spec U-6)。代わりに文言で隔離されていないことを示す
- **「Closta が sandbox を有効にして起動した」を表す capability を足し、その値だけで確認を省く** — sandbox を有効にすること自体が I-3 の範囲
- **renderer の確認だけにする** — 検証済みの IPC を直接呼ぶ経路で確認を飛ばせる (spec FR-007)
- **`SessionLaunchConfig` に承諾を持たせる** — プリセット・`lastConfig` に承諾が残り、確認を省く経路になる (FR-012)
- **`auto` を `PERMISSION_MODE_ESCALATION_VALUES` から外す** — agents が `'auto'` を直書きでき、項目 16 が弱まる (FR-004)

## Confirmation

- main の単体テストで、`acceptEdits` / `bypassPermissions` / 不明な値の起動・再開・実行中の要求と、隔離の無いランタイムで印の無い `auto` の要求が拒否され、`prepareLaunch` / 制御が呼ばれないことを確かめる (026 SC-002 / SC-003)
- セッションスレッドの decoder と制御シンクの単体テスト、項目 16 の rule fixture (新設 1・差し替え 4) で、昇格の 2 値が届かないことを確かめる (SC-002)
- renderer の単体テストと E2E で、確認の出る・出ない (2 操作 / 1 操作)、取り消しで何も送らない、帯の出方と 1 回の読み上げを確かめる (SC-001 / SC-004)。Principle III の E2E (`e2e/launch-dialog.spec.ts`) を新しい Verification に書き直す
- 026 quickstart V-3 で、Win32Runtime で `auto` に切り替えた後の分類器の判断を実機で記録する (SC-005。行えなければ「未実施」)
- renderer の単体テストで、Auto の帯の隔離の文が `autoModeStatus` のどの値でも「隔離されていません」を含むことを確かめる (Decision 2 / 4。026 FE-010 / FE-015)
- 本 ADR を accepted にしてから 026 の PR をマージする (Constitution の改定手順 2。026 plan RK-01)
