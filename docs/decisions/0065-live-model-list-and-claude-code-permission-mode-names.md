---
status: accepted
date: 2026-10-29
id: AD-065
deciders: ukitomato
tags: [ui, session, sdk, permission, i18n, constitution]
affected_domains: [ui, session]
supersedes: []
superseded-by: []
---

# AD-065: 既定の Provider のモデルの一覧を `Query.supportedModels()` で聞き、権限モードの名前を Claude Code の表記にそろえる

本 ADR は O-13 ([spec 025](../../specs/025-ui-live-session-fixes/spec.md)) の plan で起こした。方針は spec の U-3 (一覧は Claude Code に聞く) と U-4 (名前は Claude Code の英語の表記、説明は付けない) で、2026-10-29 に利用者が対話で決めた。Constitution の Exceptions を改めるかどうかは plan に任された。本 ADR はその決定と、先行の決定のどこを読み替えるかだけを書く。規則の詳細は [data-model.md](../../specs/025-ui-live-session-fixes/data-model.md)、IPC は [contracts/ipc-live-models.md](../../specs/025-ui-live-session-fixes/contracts/ipc-live-models.md)、調査は [research.md](../../specs/025-ui-live-session-fixes/research.md) が正本である。

## Context

- [AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P3 は「`Query` のメソッドは `interrupt()` だけを呼ぶ」とした。これを [AD-062](0062-live-session-permission-mode-model-and-rename.md) が読み替え、`interrupt()`・`setPermissionMode`・`setModel` の 3 つを許した。AD-062 Decision 2 は「モデルの実行時の変更を、そのセッションの Provider のカタログの値に閉じて許す」とした。そのため既定の Provider (`providerId: null`) のセッションでは、モデルを変える経路が無い (023 U-10 で後続に回した項目。今の持ち主は O-13)
- `Query.supportedModels(): Promise<ModelInfo[]>` は、動いている Claude Code が選べると答えるモデルの一覧を返す。`sdk-agent-session.ts` では「呼ばない読み取り」(`QueryUnusedReadMethod`) に分類している。この分類は呼び出しを禁じない (項目 16 の対象外) が、AD-036 §4 P3 と AD-062 の「呼ぶのは 3 つだけ」には入っていない。`docs/ui-coverage.md` E 節の `list_models` の行は「表示不要: モデルの一覧は Provider のモデルカタログから出す」としている
- Constitution Principle XV は「UI labels: 日本語を第一言語とする」と定める。権限モードの名前は今、Closta 独自の日本語の名前と説明 (`PERMISSION_MODE_NAMES` / `PERMISSION_MODE_DESCRIPTIONS`) で出している。そのため Claude Code の CLI で覚えた名前 (`Manual` / `Plan` / `Don't Ask` …) と結びつかない。利用者は「Claude Code の表記に追従し続ける」ことを選んだ (spec Clarifications)
- Principle XV の Exceptions には先例が 2 件ある (AD-024 #12 のリポジトリ表層文書と、AD-045 Decision 3 の `target-finder.ts`)。どちらも Constitution の本文に足す形をとった

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-036 §4 P3 / AD-062 Decision 1〜3 (`Query` で呼ぶのは `interrupt` / `setPermissionMode` / `setModel` の 3 つ) | `supportedModels()` の読み取りを足して 4 つにする (Decision 1)。変更系のメソッド (`QueryMutationMethod` の 20) は今どおり呼ばない |
| AD-062 Decision 2 (モデルはそのセッションの Provider のカタログの値に閉じる) | Provider のあるセッションは今どおりカタログの値に閉じる。既定の Provider のセッションに限り、そのセッションで最後に受け取った `supportedModels()` の一覧の値に閉じる (Decision 2) |
| `docs/ui-coverage.md` E 節 `list_models` (表示不要: カタログから出す) | `実装済み: 既定の Provider のセッションのモデルの選択の候補` に書き直す (Decision 1) |
| Constitution Principle XV「UI labels: 日本語を第一言語とする」 | 権限モードの名前だけは Claude Code の表記の英語をそのまま使い、説明を付けない。Exceptions に 1 項を足す (Decision 3 / 4) |

## Decision

1. **`Query.supportedModels()` を、既定の Provider のセッションのモデルの一覧の取得に限って呼ぶ。**
   - **経路**: renderer → main の検証済み IPC (`listSessionModels`) → セッションスレッドの制御 (`SessionControl` の `list-models`)。結果は message `models-result` で、セッションスレッド → 調停役スレッド → main と返す (AD-062 Decision 6 の `control-result` と同じ形)
   - **main が受け付ける条件**: Provider が null のセッションで、`liveSettingBlocker('model', …)` が `busy` 以外で通るときだけ。つまり最初の応答の前 (`launching`) と `claude` が止まった後には呼ばない
   - **呼ぶ側の閉じ方**: 呼べるのは `sdk-agent-session.ts` の `queryHandle` だけ。`Query` の分類に「呼ぶ読み取り」(`QueryLiveReadMethod = 'supportedModels'`) を新しく立て、`QueryUnusedReadMethod` から外す。`queryHandle` の型の `Pick` にも足す
2. **既定の Provider のセッションで、モデルの変更を「最後に受け取った一覧」に閉じる。**
   - **一覧の作り方**: セッションスレッドは `ModelInfo` を `{ id: value, displayName, supportedEffortLevels }` に写し、モデルカタログと同じ検査 (`isValidModelEntry`) を通す。外れた項目は捨て、重複は除き、64 件 (`MAX_CATALOG_MODELS`) で切る
   - **main の保持**: main はその一覧を稼働中の行 (`Entry.liveModels`) に持つ。永続化しない。起動の effort で絞る (`switchableModels`。Provider のカタログと同じ規則)
   - **`setModel` の検証**: 既定の Provider のセッションの `setModel` は、`liveModels` を effort で絞った集合にある id だけを通す。SDK に送る値はその id である (inference profile の写しは無い)
   - **送る前の検査**: セッションスレッドでは、送る値も起動の `model` と同じ文字種の検査を通す (AD-062 Decision 2 のまま)
3. **権限モードの名前は Claude Code の CLI の表記 (`title`) の文字列をそのまま使う。説明は付けない。**
   - **名前の対応**: `default` = `Manual`、`plan` = `Plan`、`dontAsk` = `Don't Ask`、`acceptEdits` = `Accept edits`、`bypassPermissions` = `Bypass Permissions`、`auto` = `Auto`
   - **照合の記録**: 照合したのは Claude Code 2.1.312 である。名前の表 (`features/chat/labels.ts` の `PERMISSION_MODE_NAMES`) は 1 か所に置き、照合した版を同じファイルの定数で持つ
   - **追従の手順**: Claude Code / Agent SDK の版を上げるときは `docs/ui-coverage.md` の「SDK を上げたときの手順」で見直す
   - **日本語のまま残すもの**: Closta が付ける「不明なモード」(`unknown`) と、名前を囲む文 (帯・transcript の行・選択の見出し) は日本語のままである
   - **選べる値は変えない**: AD-062 の安全 3 値のまま。昇格の値の名前は、帯と transcript の行で読むためだけにある
4. **Constitution Principle XV の Exceptions に、権限モードの名前の項を足す (1.4.0 → 次の MINOR)。**
   - **MINOR とする理由**: 指針に例外を足す改定で、これまで適合していた状態を違反にしない (AD-045 の改定と同じ扱い)
   - **改定手順**: 1 = 本 ADR、2 = O-13 の PR で architecture-reviewer を交えた人間のレビュー (AD-045 の先例どおり PR の中で行う)、3 = MINOR、4 = Amendment trail、5 = 既存違反の enumeration
   - **版番号**: O-12 が持ち越した Principle XII の改定 (022 U-12) が先にマージされれば、本改定の版はその次になる

## Consequences

- `IPC_CHANNELS` が 1 つ増え (`listSessionModels`)、`SessionControl` は 9 種類になる。supervisor の message の種類が 1 つ増える (`models-result`)。`LIVE_SETTING_FAILURES` (AD-062 で集合を固定) は変えない。一覧の失敗は既存の理由 (`not-running` / `not-ready` / `session-ended` / `timeout` / `rejected` …) で返す
- 一覧は Claude Code の答えで、Closta はその中身を保証しない。項目が検査で落ちたときは黙って捨てる。数だけはログに出す (値は出さない)
- 一覧はセッションごとに main のメモリにあり、再開・再起動で消える。再開したセッションでは、最初の応答の後にもう一度聞く
- 権限モードの名前は、Claude Code が表記を変えても Closta の版を上げるまで古いままになる。照合の版の定数がその差を示す
- 起動ダイアログの権限モードの説明 (`PERMISSION_MODE_DESCRIPTIONS`) を外す。モードの意味は Claude Code の文書で引く (利用者の決定。U-4)
- transcript の「権限モードが変わった」の行・警告の帯・「概要」のタブの名前も同じ表から読むので英語になる。囲む文は日本語のまま

## Alternatives

- **既定の Provider に Closta が固定の別名の一覧 (`sonnet` / `opus` / `haiku`) を持つ**: Claude Code の版や契約で選べるモデルが変わり、外れた値を送ると `setModel` が失敗する。利用者が退けた (spec Clarifications)
- **一覧をセッションスレッドが `init` の直後に必ず取りに行って送る (push)**: Provider のカタログを持つセッションでも呼ぶことになる。一覧を見ないセッションにも呼び出しが増える。renderer が選択を出したときに 1 回聞く (pull) 方が呼ぶ回数が少なく、AD-062 の要求と結果の照合の形に揃う
- **権限モードの名前を日本語に訳して Claude Code の名前を括弧で添える**: 利用者が退けた (「Claude Code に追従し続ける」ため、訳の側を持たない。U-4)
- **Constitution を改めずに ADR だけで例外にする**: Principle XV の本文と食い違ったまま残る。ux-reviewer の i18n の観点が毎回この名前を指摘する。先例 2 件はどちらも本文の Exceptions に足した

## Confirmation

- `sdk-agent-session.test.ts` (または同等の単体) で確かめる
  - `list-models` の制御で `supportedModels()` が 1 回だけ呼ばれる
  - 検査で落ちた項目・重複・65 件目が捨てられる
  - 呼び出しが失敗したときと、ハンドルが無いときは `models: null` を返す
- `session-launch-service` の単体で確かめる
  - Provider があるセッションの `listSessionModels` は `invalid-value` を返す
  - `launching` では `not-ready` を返す
  - 一覧の外の id と effort の外の id は `setModel` が `invalid-value` で拒み、制御を送らない
- `tests/docs/query-mutation-methods.test.ts` の 20 は変わらない。型の網羅 (`queryMethodsAreClassified`) が新しい分類を含んで通る
- 名前の表の単体で、6 値が Claude Code 2.1.312 の `title` と一致することと、照合の版の定数を固定する
- Constitution の改定の差分に Sync Impact Report・Amendment trail・版の 3 か所が揃う
- 025 quickstart V-1 / V-2 で記録する: 既定の Provider のセッションで一覧が出ること、選んだモデルで次の応答が返ること
