# po-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-16T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-007 (US-1 の時刻と所要時間), FR-008〜FR-011 (US-2 の地図), FR-012〜FR-013 (US-3 の帯), FR-014〜FR-016 (記録) / SC-001〜SC-006
- touched files に該当する charter / Confirmation: ui charter の Journey 1 (`charter.md:112-118`)・Journey 2 (`:120-125`)・In scope「conversation map」(`:61`)・不変条件「長大スレッドは仮想化する」(`:162`)・KPI (`:165-176`)。AD-051 (proposed) の Decision 2/5 と Confirmation、AD-046 Decision 4 (タブの表)
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer)
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:2 Low:3
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer)
- G. optional reviewer 範囲: 該当なし: po-reviewer の担当外 (optional reviewer)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-9 は、過去ログと実行中の変換で `createdAt` を埋め (U-2/U-3, AD-051 proposed)、中央にメッセージの時刻とターンの所要時間 (US-1, P1)、右のペインの新しいタブ「会話の地図」にターンの一覧 (US-2, P1)、その上端に活動の帯 (US-3, P2) を出す。DTO の形・IPC・preload は変えない。SC はどれも単体 / component テストと固定テストで真偽を決められる形になっている。U-1〜U-7 は夜間に仮で採ったもので、まだ承認されていない。PO の観点で見た穴は 3 つある。(1) 実行中の所要時間が、2 つの時計の差を黙って含みうる。(2) 地図が「どこで何が起きたか」を示すと言いながら、ターンが失敗したことや中断したことを印に出さない。(3) 過去ログで偽のターンが出る既知の限界が、spec の Edge Cases / Out of Scope に書かれていない。

## Findings

### [High] 実行中の所要時間が 2 つの時計の差を黙って含み、正の誤差を検出も抑止もしない (H-001) (scope: feature)

- **観察**:
  - 実行中のターンの始まりは renderer の送信時刻 (ホストの時計。`data-model.md:53`)。終わりは、最後のメッセージが assistant なら SDK の `timestamp` (Claude Code の時計。WSL で動くことがある。`data-model.md:48`)、システムイベントの行や tool の結果だけのメッセージなら受信時刻 (ホストの時計。`data-model.md:50-52`) になる。どちらになるかは、ターンの最後のメッセージの種類で決まる。
  - spec の手当ては「所要時間が負なら出さない」だけ (`spec.md:116`, `:159`、`data-model.md:87`)。AD-051 は Consequences で「小さくずれることがある」としているが (`0051-...md:39`)、「小さい」ことを示す根拠は無い。
  - US-1 の価値は「実行中の会話では『この応答にどれだけかかったか』を知る」と書かれている (`spec.md:104`)。
- **同種事象探索**: `所要時間が負` で spec / data-model / ADR / plan を確認した。手当ては負の値の抑止 (`spec.md:116`, `:159`、`data-model.md:87`、`0051-...md:33`)、記録は `plan.md:246` RK-03 だけで、正の誤差を扱う記述は 0 件。
- **リスク/影響**: WSL2 の時計はホストのスリープ復帰の後などに分単位でずれることがあり、本アプリが前提にする構成 (Windows ホスト + WSL の Claude Code。`plan.md:26`) でまさに起きる。正の方向にずれると、所要時間は誤った値のまま出続ける。同じ会話の中でも、ターンの最後のメッセージが assistant か行かで基準の時計が替わり、ターン同士で所要時間を比べられない。SC-002 のテストは偽の時計 1 つで回すので、この欠陥は検出されない。
- **推奨アクション** (最小案を先に):
  1. 最小案: 実行中の所要時間は、両端が同じ時計の値のときだけ出すと spec の AC に書く。たとえば実行中の `endedAt` は、ターンの中で受信時刻・送信時刻を持つメッセージ (行・結果だけのメッセージ・利用者の入力) の最後の値に限る。あるいは、実行中の assistant については表示の時刻 (SDK の値) と所要時間に使う値を分ける。後者は DTO のフィールドを足さずに済む範囲 (renderer の写しの中だけ) で可能か、plan で確かめる。
  2. それをしないなら、spec の Edge Cases と US-1 AC5 に「時計が正の方向にずれた分は所要時間に乗る。補正しない」と明記し、利用者に承認を求める項目 (U-3) に含める。あわせて quickstart V-3 の 4 に、SDK の `timestamp` と受信時刻の差の大きさを確かめる手順を足す。
- **根拠**: PO-2 (SC の計測の妥当性) / PO-3 (AC5 が負の場合しか定めていない) / ui charter Journey 2
- **scope 根拠**: spec の US-1 AC と data-model §2 の中で直せる

### [Medium] 地図の行がターンの失敗と中断を示さず、AC1 の「エラーの数」の意味が spec で決まっていない (M-001) (scope: feature)

- **観察**: Summary は「どこで何が起きたか」を読めるようにすると言う (`spec.md:26`)。しかし地図の行の「エラーの数」は tool の `isError` の数だけで (`data-model.md:90`)、境界の印は圧縮・作り直し・拒否の 3 つだけ (`data-model.md:91`)。O-4 の「ターンの失敗」(`glossary.md:369-374`) と、中断で終わったターン (ui charter Journey 2 step 4 `charter.md:125`) は行に現れない。US-2 AC1 (`spec.md:130`) は「エラーの数」がどのエラーかを定めておらず、正本の data-model だけが tool のエラーに絞っている。
- **リスク/影響**: 長い会話の中で「どのターンが失敗したか・止めたか」を探すのは、地図のいちばん自然な使い方である。利用者はエラー 0 の行を「問題なく終わった」と読み誤る。
- **推奨アクション**: US-2 AC1 を「tool の呼び出しのうちエラーの数」と書き直して、意味を spec で決める。あわせて、ターンの失敗と中断の印を足すか、Out of Scope に「ターンの失敗と中断の印は出さない」と理由つきで書くかのどちらかにする。
- **根拠**: PO-3 / PO-4
- **scope 根拠**: spec と data-model §2/§3 の中で直せる

### [Medium] 過去ログの圧縮の要約と `is_meta` の user の記録が偽のターンになることが、spec の Edge Cases / Out of Scope に書かれていない (M-002) (scope: feature)

- **観察**: research R-06 (`research.md:65`) と plan RK-05 (`plan.md:248`) は、`isCompactSummary` / `is_meta` の user の記録が 1 ターンに数えられることを既知の限界として扱っている。一方 spec の Edge Case「圧縮の後の会話 → 地図は記録に残るすべてのターンを出し、圧縮の境界の印を付ける」(`spec.md:163`) は、要約の本文が 1 行の「入力の先頭」として出ることに触れていない。Out of Scope (`spec.md:231-237`) にも無い。
- **リスク/影響**: 圧縮の後の会話や、スラッシュコマンドで meta の記録が挟まる会話では、利用者が入力していない文が「入力の先頭」として地図に出る。所要時間もそこで区切られる。US-2 の価値 (目当てのターンへ移る) が、過去ログの典型的な形で下がる。spec だけを読んで承認する人には、この限界が見えない。
- **推奨アクション**: spec の Edge Cases に「圧縮の要約・meta の記録は今の中央の表示と同じく本文を持つ利用者のメッセージとして 1 ターンに数える (既知の限界。見分けるには変換に値を通す必要があり、FR-005 の範囲外)」を足し、Out of Scope に後続の扱いを 1 行足す。
- **根拠**: PO-4 (plan では触れているので High にしない)
- **scope 根拠**: spec の文面の追記で済む

### [Medium] (H) 過去ログの時刻が黙って `null` に倒れたとき、それに気づく観測点もテストも無い (M-003) (scope: feature)

- **観察**: 時刻が無い・読めないときは黙って `null` に倒れ、表示は今と同じになる (`spec.md:113`、`0051-...md:38`)。気づく手段は、`docs/ui-coverage.md` の SDK を上げたときの手順の手作業 (`data-model.md:233`) と、quickstart V-3 の 1 の目視 (`quickstart.md:37`) だけ。BE-010 のテストは自前の fixture に `timestamp` を入れるので (`tasks.md:34`)、SDK の実装 (`sdk.mjs:134`) が `timestamp` を返さなくなっても緑のまま通る。
- **リスク/影響**: 依存は公開の型の外にある。それが SDK の更新で消えると、US-1 と US-3 の価値が過去ログで丸ごと消えるのに、CI は気づかない。利用者からの報告でしか分からない。
- **推奨アクション**: どちらか 1 つを足す。(a) 一時ディレクトリの JSONL の fixture を SDK の `getSessionMessages` に実際に読ませ、返りに `timestamp` が含まれることを固定する契約テスト (agents の単体の範囲。設定ディレクトリを環境変数で差し替えられるかは plan で確かめる)。(b) 過去ログの変換で、時刻を持たないメッセージの割合を開発ビルドの log に 1 行出す。
- **根拠**: reviewer-base H (observability / regression)、PO-2 (計測経路)
- **scope 根拠**: BE-010 のテストの追加で直せる

### [Low] 所要時間に承認待ちの時間が含まれることが spec で決まっていない (L-001) (scope: feature)

- **観察**: `lastTurnOpen` は `awaiting_permission` を busy に含む (`research.md:64`)。所要時間は始まりから最後のメッセージまでなので、承認カードを放置した時間も「所要」に入る。US-1 (`spec.md:104`) は「応答にどれだけかかったか」としか書かない。
- **推奨アクション**: US-1 AC4 か Key Entities の「ターン」に「承認待ちの時間を含む」と 1 句足す。
- **根拠**: PO-3

### [Low] 地図や帯から移ろうとして移り先が消えていたとき、利用者に何も返らない (L-002) (scope: feature)

- **観察**: Edge Case「移った先のメッセージが取り消された・上限で外れた → 移らず、地図の行も次の更新で消える」(`spec.md:165`)。押しても何も起きず、知らせも無い (PO-6 の失敗時の出口)。
- **推奨アクション**: 移れなかったことを `status` で読み上げるかどうかを決め、決めた結果を Edge Case に書く。読み上げないなら、その旨を明記する。
- **根拠**: PO-6

### [Low] User Story の価値が charter の KPI と結びついていない (L-003) (scope: feature)

- **観察**: US-1〜US-3 の Why (`spec.md:106`, `:124`, `:143`) は Journey に結びついているが、charter の KPI (`charter.md:165-176`) のどれとも結びついていない。KPI とのつながりは、plan の対応表 (項目 21) と自作率だけ (`plan.md:99`)。
- **推奨アクション**: 価値の計測を KPI に結ばないなら、少なくとも quickstart V-3 の 6〜9 の記録を、価値を判断する材料として roadmap に残すと明記する。
- **根拠**: PO-1

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `所要時間が負` / 正の誤差の扱い (spec / data-model / AD-051 / plan) | 負の抑止 4 件、正の誤差 0 件 | spec.md:116, :159; data-model.md:87; 0051-...md:33,39; plan.md:246 |
| M-001 | `エラーの数` | 定義 1 件 (tool だけ) | data-model.md:90; spec.md:130 |
| M-002 | `isCompactSummary` / `is_meta` | plan / research に 2 件、spec に 0 件 | research.md:65; plan.md:248 |
| M-003 | `timestamp` の契約テスト | 0 件 (fixture だけ) | tasks.md:34 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 3
