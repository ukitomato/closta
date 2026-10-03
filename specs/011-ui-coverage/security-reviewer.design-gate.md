# security-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-007 (実行中の tool の結果。新しい本文経路)、FR-008 (Hook / BG。新しい本文経路)、FR-009 (event の行。新しい sink)、FR-010、FR-011 (プロセス境界)、FR-014 (要点。秘密の露出を減らす)、SC-003 / SC-004 / SC-006。他は security の論点が無いか小さい
- touched files に該当する charter / Confirmation: AD-034 Decision 1、AD-043 Decision 2 / 4、AD-041 (g) (`QUERY_OPTION_KEYS` の集合はリテラルで固定。変えるには ADR)、session charter、ui charter
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:1 Medium:0 Low:1
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:3 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-041 の options 集合は H-001 で security の観点からだけ扱う)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

会話由来の文字列の経路が 3 つ増える (実行中の tool の結果の送り直し、Hook / BG の `event`、直近の活動の要点)。`SessionEvent` の種類・IPC・preload・main は変えない。無害化は既存と同じ形 (`sanitizeBody` を agents で通し、renderer はテキストノード)。Hook の出力本文と task の `prompt` / `summary` / `output_file` を通さない許可リストは設計として成立している。詰め切れていないのは、SDK の Hook イベントの既定、過去ログに decoder が無いこと、`Bash` の要点のクォート、通す subtype の集合の食い違い。

## Findings

### [High] Hook イベントは SDK の既定では SessionStart / Setup しか出ない。全 Hook を出すには `QUERY_OPTION_KEYS` を変える必要があるが、設計が扱いを決めていない (H-001) (scope: feature)

- **観察**: `includeHookEvents` は `@default false`。true のときに全 Hook の `hook_started` / `hook_progress` / `hook_response` が出て、SessionStart と Setup は常に出る (`sdk.d.ts:1722-1731`)。現行の options 許可リストに `includeHookEvents` は無く (`session-core.ts:46-55`)、AD-041 (g) がこの集合をリテラルで固定し変えるには ADR を要るとする (`session-core.ts:44`、`0041:129`, `:161`)。spec US-2 AC3 と quickstart V-4 の 2 は一般の Hook を想定して読める。plan はこれに触れていない
- **同種事象探索**: `includeHookEvents|includePartialMessages|agentProgressSummaries` を src で 0 件、`includeHookEvents` を docs / specs / .specify の md で 0 件
- **リスク/影響**: AC3 を満たそうとすると、AD-041 が ADR を求める権限面の正の構成を変えることになる。足さなければ AC3 と V-4 は SessionStart / Setup だけで成立する。設計で決めずに実装に送ると、pin テストを書き換えて通す経路が開く
- **推奨アクション**: (a) 足さない — 表示される Hook は SessionStart / Setup だけと AC3・V-4・対応表 A 節の備考に書き、一般の Hook は後続に。(b) 足す — AD-041 の集合を改める ADR を起票し escalation-neutral を論証、pin テストを ADR の参照で更新
- **根拠**: AD-041 (g) / Constitution III・IV

### [Medium] 過去ログの経路には frame の decoder が存在しないが、FE-010 は「過去ログの frame の decoder」が `event` を検証する前提 (M-001) (scope: feature)

- **観察**: 過去ログの受け口は `frameEvent.data as TranscriptFrameDTO` のキャストだけ (`useTranscript.ts:111`, `:123`)。実行中の decoder も part は `typeof p.type === 'string'` しか見ない (`session-event-decoder.ts:28-37`)
- **同種事象探索**: frame を受けるのは `useTranscript.ts:106-127` の 1 か所。`decode\w*Frame|isTranscriptPart` は 0 件
- **リスク/影響**: 過去ログでは `event` の `status` / `category` が未検証のまま labels の参照キーになる (`constructor` などの prototype のキーで関数が React の子に渡る)。source は無害化済みなので多層防御の欠け
- **推奨アクション**: `isEventPart` を作り両方の経路で使う。過去ログの受け口に frame decoder か part 単位の検査を置く (置かないなら FE-010 から外し理由を書く)。labels の参照は `Object.hasOwn` か列挙の照合の後に
- **根拠**: CWE-20 / AD-043 Decision 2

### [Medium] `Bash` の要点「先頭の `NAME=value` を飛ばして最初の語」が、クォートした値の断片を出力する (M-002) (scope: feature)

- **観察**: data-model §4 / research R-07 は語の区切りを定めていない。`TOKEN="sk-ant-abc def" curl ...` を空白で区切ると、最初の語は `def"` (秘密の後半) になる。FE-031 は素朴な `TOKEN=secret` だけ
- **推奨アクション**: 先頭の代入の値にクォートかバックスラッシュがあれば tool 名だけにする。出す語は basename を取り `^[A-Za-z0-9._+-]{1,64}$` に合うときだけ出す。FE-031 に `TOKEN="a b" cmd` / `TOKEN='a b' cmd` / `A=1 B=2 cmd` / `FOO=a\ b cmd` / `/home/user/bin/tool` と、`sk-` / `ghp_` / `AIza` / `Bearer` が出ないことを足す
- **根拠**: CWE-200 / CWE-532 / O-1 security L-003 / Constitution V

### [Medium] 通すシステムメッセージの subtype の集合が、spec (正本) と data-model / research / tasks で食い違う (M-003) (scope: feature)

- **観察**: FR-008 は 8 つを届けるとし、フィールドも「など」と閉じていない。research R-04 / BE-024 は 3 つを送らない。`exit_code` は research で通す、data-model で通さない
- **リスク/影響**: `hook_progress` は stdout / stderr / output だけを中身に持つ型で、正本どおりに通すと空の行か出力本文を通す誘惑が生じる。SC-003 の基準が 2 通りに読める
- **推奨アクション**: FR-008 を data-model §2 に合わせ (5 つを変換、3 つは捨てて対応表で割当)、フィールドの正本は data-model §2 と参照する。`exit_code` は通さない方にそろえる
- **根拠**: CWE-213 / Constitution V

### [Medium] RK-02 (送り直しの負荷) の手当てとした負荷 E2E は tool を流さないので、送り直しの経路を通らない (M-004) (scope: feature)

- **観察**: RK-02 の手当ては multi-session の負荷 E2E だが、偽 supervisor は tool を流さない。`BODY_MAX_BYTES` は part ごとの上限で、N 個の tool_use のメッセージは 1 回で最大 N×(200KB + 200KB) になり、それを N 回送り直す
- **リスク/影響**: renderer の `JSON.parse` と upsert の量が N² で増える経路を観測するテストが無い。モデルの出力が N を決めるので可用性の入口になる
- **推奨アクション**: (a) BE-024 の単体に合計バイトの観点とメッセージ単位の合計上限、(b) 結果がそろうまで送り直しをまとめる、(c) 偽 supervisor に tool を流す負荷ケース (main に差分を出さない形が可能か先に確かめる) のどれか。RK-02 の手当てを観測できる手段に直す
- **根拠**: CWE-400 / AD-043 Decision 2

### [Low] `hook_name` が Hook のコマンド文字列を含まないことを確かめる手段が無い (L-001) (scope: feature)

- **推奨アクション**: quickstart V-4 の 2 に「`hook_name` の実際の値を記録し、コマンドを含まないことを確かめる」を足す。含むなら `hook_event` だけを出す

### [Low] task の説明 (第三者や model が決める文字列) が、アプリのシステム行と同じ見た目で描かれる (L-002) (scope: feature)

- **推奨アクション**: FE-010 で `name` を状態の文言と見た目で分ける。偽の状態文言を `name` に入れた component テストを足す (CWE-451)

### [Low] 状態を持たない変換では、`skip_transcript` の task の後続の `task_updated` を隠せない (L-003) (scope: feature)

- **観察**: `skip_transcript` は `task_started` と `task_notification` にしか無い (`sdk.d.ts:5562`, `:5623`)
- **推奨アクション**: セッションスレッドに隠す task の id の集合を上限付きで持つか、`task_updated` は先行する `task_started` の行があるときだけ送る。BE-024 に観点を足す

### [Low] element の registry の取り直し (R-08) の手段が決まっていない (L-004) (scope: feature)

- **推奨アクション**: SH-012 に「一覧は読み取りだけで取得する。CLI で component を add しない。package.json / lockfile の差分は 0」と書く (SEC-8)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `includeHookEvents\|includePartialMessages\|agentProgressSummaries` (src) / `includeHookEvents` (md) | 0 / 0 | sdk.d.ts:1722-1731, session-core.ts:44-55, 0041:129 |
| M-001 | `kind === 'messages'\|requestToken` / `decode\w*Frame\|isTranscriptPart` | 1 / 0 | useTranscript.ts:111, :123 |
| M-002 | `NAME=value\|TOKEN=secret\|先頭の語` (specs/011) | 3 | data-model.md:86, research.md:74, tasks.md:77 |
| M-003 | `hook_progress` / `exit_code` (specs/011) | 4 / 2 | spec.md:171, research.md:50, tasks.md:51 / research.md:52, data-model.md:63 |
| M-004 | `RK-02\|負荷 E2E` (specs/011) | 3 | plan.md:169, quickstart.md:20, tasks.md:87 |
| L-001 | `hook_name` (specs/011) | 3 | data-model.md:45, :62, :63 |
| L-002 | `description` (data-model.md) | 2 | data-model.md:45, :64 |
| L-003 | `skip_transcript` (specs/011) | 3 | data-model.md:64, :66, :68 |
| L-004 | `registry` (research / tasks) | 5 | research.md:80-81, tasks.md:14, :32 |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 4
