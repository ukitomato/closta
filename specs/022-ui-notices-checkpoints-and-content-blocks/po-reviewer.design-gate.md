# po-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-22T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-009 はすべて本 feature の範囲。US-1 (FR-001〜FR-006) / US-2 (FR-006・FR-010) / US-3 (FR-007〜FR-009・FR-011) / US-4 (FR-012) / 照合 (FR-013〜FR-015) / 記録 (FR-016・FR-017)
- touched files に該当する charter / Confirmation: ui charter の Mission「emit する情報のすべてに専用表示」と KPI「表示網羅」(charter.md:45-46, :180-182)、業務ルール Principle XII / XIII / VIII (charter.md:169-174)。AD-049 Decision 3 / 6、AD-044 Decision 4 (AD-060 で読み替え)、AD-056 Decision 1
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲 (伏せ字・URL の scheme 制限は B / A で見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (glossary の語の衝突は E の AC の読み違いとして M-004 に入れた)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:4 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage は optional reviewer が見る
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

Claude Code が送ってくるのに今は捨てている Tier B の知らせ 6 種と `files_persisted` を、O-2 のシステムイベントの行として transcript に出す。あわせて、`server_tool_use` / `web_search_tool_result` を ServerToolCall と Sources で、`user/document` を File で、専用の表示が無いブロックを「知らないブロックの印」で出す。過去ログは判別子が読めれば実行中と同じ行にし、読めなければ今の本文に戻す。対応表の B 節は `@anthropic-ai/sdk` の union と機械照合する (AD-060)。境界 (SessionEvent・QUERY_OPTION_KEYS・meter・IPC) は広げない。PO の観点では、SC はほぼ boolean で評価でき、計測経路も書いてある。一方で、FR-011 の「実行中と過去ログの両方で捨てない」が data-model / research の設計 (実行中の user と、過去ログの subagent の user のブロックは読まない) と食い違っている。empty state と通知の多さへの手当ても書かれていない。

## Findings

### [High] FR-011 / SC-004 は「実行中と過去ログの両方で捨てない」と言うが、設計は user 側のブロックを実行中と subagent の過去ログで読まない (H-001) (scope: feature)

- **観察**: `spec.md:194` の FR-011 は「専用の表示を持たない content block は、実行中と過去ログの両方で、捨てずに種類の名前の 1 行の印を出さなければならない」。`spec.md:232` の SC-004 は「B 節の各行のブロックの fixture を流すと、どのブロックも専用の表示か印のどちらかになる (0 件で消えるブロックが無い)」。これに対して設計側は次のとおり読まない経路を残している:
  - `data-model.md:147`「実行中の user のメッセージは今どおり tool_result だけを読む … user の `unsupported-block` と `file` は過去ログだけで出る」
  - `data-model.md:148`「過去ログの subagent の user の記録は今どおり tool_result だけを読む」
  - `research.md:135`「user の印は過去ログだけ」
  - B 節の user の行はすべて経路が「過去ログ」(`data-model.md:254-269`)
- **同種事象探索**: `applyUserMessage|実行中の user` で 2 件 (`data-model.md:147`、`research.md:135`)。`tool_result だけを読む` は data-model に 2 件 (`:147`、`:148`)
- **リスク/影響**: 実行中の user のメッセージや subagent の user の記録に `document` / `search_result` などが入ると黙って消える。消えた時点で FR-011 の文面に違反する。SC-004 の計測 (`tasks.md:52` BE-030「B 節の 33 行のブロックを表で回し」) は domain の関数の単体なので、経路の手前で捨てられる分を検出できない。SC-004 は通っても FR-011 は破れている状態になりうる
- **推奨アクション**: 次のどちらかに揃える。(a) FR-011 を「assistant のブロックは実行中と過去ログの両方、user のブロックは過去ログの主ループだけ (実行中の user と subagent の user は tool_result だけを読む。O-11 U-11)」に直し、捨てる経路を範囲外 (`spec.md:250-258`) に明記する。(b) 経路を足して FR-011 の文面どおりにする。SC-004 の計測経路は「経路ごと (実行中 assistant / 過去ログ assistant / 過去ログ user) の表」と書き、BE-031 / BE-032 のテストにも同じ表を入れる
- **根拠**: Constitution Principle XII、charter.md:171-172「emit される情報に未表示のものを残さない」、PO-4 / PO-2
- **scope 根拠**: spec / data-model / tasks の中で直せる

### [Medium] 検索の結果が 0 件のとき (`content: []`) の表示が決まっていない (M-001) (scope: feature)

- **観察**: `data-model.md:142` では、`content` が配列なら `{kind: 'web-search', sources, omitted}` になる。空の配列のときの扱いは spec の Edge Cases (`spec.md:165-173`)・data-model §2.5 (`:182-183`)・FE-030 のテスト (`tasks.md:58`) のどこにも無い。Grep (`空の配列|結果が無い|0 件の結果|sources.*空|空の一覧|結果なし`) でも empty state の定義は 0 件だった
- **リスク/影響**: 結果 0 件の検索が、中身の無い開閉要素として出るか、何も出ないかが未定になる。「検索したが何も見つからなかった」が利用者に伝わらない
- **推奨アクション**: Edge Cases に「結果が 0 件 → 『検索の結果はありません』の 1 行 (文言は labels.ts)」を足し、FE-030 の component テストに 0 件の fixture を足す
- **根拠**: PO-4 (empty state)

### [Medium] 読み上げの対象が spec の AC と data-model で違う (`mirror_error`・`files_persisted` の失敗) (M-002) (scope: feature)

- **観察**: spec で読み上げを決めているのは `notification` の `priority` だけ (`spec.md:88`、AC5 `spec.md:109`)。data-model §1.6 (`data-model.md:97`, `:100`)、research `:153`、FE-010 (`tasks.md:31-32`) は `mirror-error` と `files-persisted` の `failed` も読み上げる。spec の FR / AC / Clarifications にこの 2 つの読み上げは無い
- **リスク/影響**: 振る舞いの正本 (spec) に無い挙動がテストで固定される。spec の AC からテストを 1:1 で導けない
- **推奨アクション**: spec の Clarifications の読み上げの項に「`mirror_error` と `files_persisted` の失敗は読み上げる」を足し、US-1 / US-2 に AC を 1 つずつ足す (SC-001 / SC-002 の計測経路は今のままでよい)
- **根拠**: PO-3

### [Medium] `files_persisted` の失敗が複数あるとき、2 件目以降の理由が出ないことが spec に無い (M-003) (scope: feature)

- **観察**: FR-004 (`spec.md:184`) は本文の対象に `files_persisted.failed[].error` (全件) を挙げている。US-2 AC1 (`spec.md:124`) は「失敗の理由は伏せ字つき」。data-model §1.5 (`data-model.md:88`) では `detail` に入るのは `failed[0].error` だけである
- **リスク/影響**: 失敗が 2 件以上あると、どのファイルがなぜ失敗したかが最初の 1 件しか分からない。しかも省いたことを示す印が無い
- **推奨アクション**: FR-004 / AC1 を「最初の失敗の理由だけを出す (件数は別に出す)」に直すか、理由の省略を示す文言 (「ほか N 件の失敗」) を足す。BE-011 に失敗 2 件の fixture を足す
- **根拠**: PO-3 / PO-4

### [Medium] 用語「知らせ」が glossary の Informational notice と衝突している (M-004) (scope: feature)

- **観察**: glossary は「知らせ」を `informational` 専用の日本語表記にしている (`docs/glossary.md:514`, `:519`)。spec は US-1 の題「Claude Code からの知らせが分かる」(`spec.md:95`)、US-4 の「知らせ・拒否・…」(`spec.md:151`)、FR-004 の「知らせの本文」(`spec.md:184`) で、FR-002 の 7 種を指して「知らせ」を使っている。新しい語「知らせの類」は SH-001 で足す予定 (`tasks.md:15`)
- **リスク/影響**: AC を読む人が「知らせ」を `informational` だけと取るか 7 種と取るかで、テストの範囲が変わる
- **推奨アクション**: spec 本文で 7 種を指すところを「知らせの類」に揃え、「知らせ」は `informational` だけに使う
- **根拠**: Principle XIV、PO-3

### [Medium] 毎ターン届きうる行 (`tool_use_summary`・`active_goal`・`notification`) で transcript が読みにくくなることへの手当てが無い (M-005) (scope: feature)

- **観察**: plan RK-06 (`plan.md:246`) 自身が「毎ターン届く」と認めている。手当ては「控えめの見た目・読み上げない」だけで、多ければ利用者に返す (spec の範囲の外) としている。spec の範囲外 (`spec.md:250-258`) にも、まとめる・畳む規則を持たないことが明示されていない
- **リスク/影響**: Tier B の表示のために Tier A の本文 (応答・tool) を読む体験が落ちうる。Journey 2 (charter.md:133-138) の妨げになる
- **推奨アクション**: 範囲外に「知らせの類の行の集約・非表示の設定」を明記し、V-1 の記録の項目に「1 ターンあたりの行の数」を足す (計測できる形で利用者に返す)
- **根拠**: PO-4 / PO-6

### [Medium] SC-004 の単体はブロックの関数だけを回し、経路の手前で捨てられる分を検出できない (M-006) (scope: feature)

- **観察**: BE-030 のテスト (`tasks.md:52`) は `content-blocks.ts` の関数に 33 行を流す。BE-031 / BE-032 のテスト (`tasks.md:54`, `:56`) には B 節の表で回す項目が無い
- **リスク/影響**: H-001 の食い違いや、将来 switch に経路が増えたときに出るブロックの欠落を、テストが検出できない
- **推奨アクション**: BE-031 (過去ログ) と BE-032 (実行中) にも、経路ごとに B 節の表で回すテストを足す (H-001 で決めた経路の範囲で)
- **根拠**: SC-004 の計測経路、PO-2 (H 観点)

### [Low] `memory_recall` で `http://` の path がファイル扱いになる (L-001) (scope: feature)

- **観察**: Edge Cases (`spec.md:166`) は「https の URL → host だけ」。data-model §1.4 (`data-model.md:80`) は `https://` 以外をファイルとみなし、`pathTail` を通す
- **リスク/影響**: `http://` の URL の末尾 (path の部分) が名前の列に出る。害は小さい
- **推奨アクション**: 分類を `/^https?:\/\//i` に揃えるか、http を対象外と Edge Cases に書く
- **根拠**: PO-4

### [Low] 知らないブロックの印と `mirror_error` の行に、利用者が次に取れる行動の案内が無い (L-002) (scope: feature)

- **観察**: 印の文言は「表示に対応していないブロック ({type})」だけ (`spec.md:91`)。`mirror_error` の行も「記録の同期に失敗しました」だけ (`spec.md:87`)
- **リスク/影響**: 内容を見るには Claude Code で開けばよい、などの出口が分からない (Tier B なので影響は小さい)
- **推奨アクション**: 必要なら文言に「Claude Code で確認できます」を添える
- **根拠**: PO-6 (recovery flow)

### [Low] 知らないブロックの種類を開発者が集計する観測点が無い (L-003) (scope: feature)

- **観察**: 印は DOM の 1 行だけで、どの `type` がどれだけ届いたかを残す log / 対応表への還流は、V-3 の手動の記録 (`quickstart.md:37`) だけである
- **リスク/影響**: SDK を上げたときに専用の表示を作るべきブロックの優先度を判断する材料が残らない
- **推奨アクション**: 当面は quickstart の記録で足りる。将来の課題として棚卸しに残す
- **根拠**: H (observability)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `applyUserMessage\|実行中の user` (spec_dir) | 2 | specs/022-ui-notices-checkpoints-and-content-blocks/data-model.md:147, specs/022-ui-notices-checkpoints-and-content-blocks/research.md:135 |
| H-001 | `tool_result だけを読む` (data-model) | 2 | data-model.md:147, data-model.md:148 |
| M-001 | `空の配列\|結果が無い\|0 件の結果\|sources.*空\|空の一覧\|結果なし` (spec_dir) | 0 (empty state の定義として) | tasks.md:57 は「空の URL」の行で、0 件の結果の扱いではない |
| M-002 | `読み上げ\|mirror-error\|failed だけ` (research) | 2 | research.md:65, research.md:153 |
| M-004 | `知らせ` (glossary) | 5 | docs/glossary.md:482, :514, :726, :732, :1190 |

## Verdict

- Critical: 0
- High: 1
- Medium: 6
- Low: 3
