# security-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-10
**Reviewer**: security-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (MCP の見出しと URI の要約)、FR-003 (2 段の振り分けと `Object.hasOwn`)、FR-004 (承認カード)、FR-005 (`AskUserQuestion` を読み取り専用で表示)、FR-006 (結果は平文)、FR-007 / FR-008 (未信頼の構成を `meter` で運ぶ、合流の規則)、FR-010 (`output` / `error` を通さない)、FR-011 (P3 と `keyof Query` の網羅)、FR-013 (O-10 のセキュリティ上の制約)、SC-001 / SC-002 / SC-005
- touched files に該当する charter / Confirmation: ui charter (tool 出力の専用表示)、AD-048 Decision 2 / 3 / 5、AD-036 Decision 4 / §4 P3、AD-041 (e)(g)、AD-035 Decision 1、AD-047 Decision 2
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:2 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

前回からの改訂 (a894690) は design-gate R2 の H-01 から H-03 と M-03 への対応。IPC・preload・main・BrowserWindow・spawn・`shell.openExternal` は今回も変わらない (SC-005、plan.md:31)。そのため SEC-2 / SEC-3 / SEC-5 / SEC-7 に新しい経路はない。`keyof Query` の網羅 (tasks.md:86) で SDK の版上げで変更系のメソッドが黙って通る穴は型で塞がれる (持ち主は platform-boundary)。

**前回 (R2) の security の 6 件は、6 件すべてがこの設計に反映されていない。** spec / data-model / tasks / research / plan を `M-101|M-102|M-103|CWE|host|answers|assistant-ui@|間引` で Grep したが、手当てした跡も、採らない理由の記録もない。design-gate R2 の集約では M-09 / M-10 / M-11 / L-16 / L-17 / L-18 に当たる。新しい指摘は 1 件。

## Findings

### [Medium] 承認カードと transcript の補助見出しが、前方一致するサーバーが複数あっても「推定」の印を付けずに最長一致のサーバーへ帰属させる (M-101) (scope: feature) [unresolved from prev: R2 M-101 / gate M-09]

- **観察**: data-model.md:18 は今も「`rest` が `<s>__` で始まる `s` がちょうど 1 つ最長」なら `inferred: false`。spec.md:108 (AC4) が推定の印を付けるのは「同じ長さで複数に一致」するときだけ。tasks.md:45 (FE-010) と tasks.md:52 (FE-014) のテストは「`a` と `a__b` の両方があるとき `a__b` › `c` に確定」を期待値として固定。SDK はサーバー名と tool 名を `[a-zA-Z0-9_-]` に正規化するので (data-model.md:70)、サーバー `a` の tool `b__c` は `mcp__a__b__c` になり、名前からはどちらのサーバーか決まらない
- **同種事象探索**: `ちょうど 1 つ最長|最長一致` で 4 件 (data-model.md:18, spec.md:108, tasks.md:45, tasks.md:52)
- **リスク/影響**: 名前の衝突した (または悪意のある) サーバー `a` の tool が、別のサーバー `a__b` の tool のように確定の見出しで承認カードに出る (CWE-451)。生の名前は 1 行目に残るので (data-model.md:33) Critical ではない
- **推奨アクション**: `knownServers` のうち 2 つ以上が前方一致したら、長さに関わらず `inferred: true` にする。直す箇所は data-model §1 の表の 2 行目、spec AC4、FE-010 / FE-014 のテストの期待値
- **根拠**: AD-048 Decision 5 (分けた見出しは補助)、CWE-451
- **scope 根拠**: data-model §1 / FE-010 / FE-014 の範囲

### [Medium] URI の要約が host を無条件に出す。独自の scheme では authority に任意の文字列が入るが、秘密の形の検査は最後のパスの要素にしか掛からない (M-102) (scope: feature) [unresolved from prev: R2 M-102 / gate M-10]

- **観察**: data-model.md:26-27 は今も「`protocol` と `host`」を常に出し、`mayCarrySecret`・英数字 20 文字・`^[A-Za-z0-9._-]{1,64}$` の検査は最後の要素だけに掛ける。research.md:62 自身が「サーバーの作者が決めるので形は保証されない」と書く。FE-010 のテスト (tasks.md:45) にも host の負例がない。`mayCarrySecret` は `src/domain/session/system-event.ts` にあり、`src/domain/session/meter.ts:252` でモデルの id に使われているので host にもそのまま掛けられる
- **同種事象探索**: `protocol` と `host` / `host も無ければ` で 2 件 (data-model.md:26, data-model.md:27)、テストは tasks.md:45 の 1 件
- **リスク/影響**: `x-api://sk-ant-…/readme.md` のように authority に置いたトークンが見出しに出る (CWE-200)。research R-07 の「秘密を見出しに出さない」が host では成り立たない
- **推奨アクション**: host にも同じ検査を掛ける (`mayCarrySecret` が false、英数字が 20 文字以上続かない、64 文字以下、`^[A-Za-z0-9.-]+$`)。外れたら `protocol` だけを出す。FE-010 に `foo://sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx/readme.md` と長い host の負例を足す
- **根拠**: spec Q3 (a) の推奨理由、research R-07、CWE-200
- **scope 根拠**: data-model §1 / FE-010 の範囲

### [Medium] `init-report` / `commands` に流量の上限が無い。内容が交互に変われば重複の抑止も効かず、1 件最大 64KB の送信が続く (M-103) (scope: feature) [unresolved from prev: R2 M-103 / gate M-11]

- **観察**: spec.md:164 (Edge Cases)、spec.md:189 (FR-007)、data-model.md:80、tasks.md:60-61 (BE-020 の「1 秒に 21 回以上の `init` でも間引かれない」) は変わっていない。抑止は「前回と同じ内容」だけ。AD-048 Decision 3 (`docs/decisions/0048-session-config-display-and-answer-ui-split.md:36`、accepted) も「AD-047 の `meter` の上限に掛けない」と書く
- **同種事象探索**: `間引|上限に掛けない` で 5 件 (spec.md:164, spec.md:189, data-model.md:80, tasks.md:60, tasks.md:61)。plan.md:10 と plan.md:130 にも同じ記述
- **リスク/影響**: `commands_changed` が届く頻度は MCP サーバーやプラグインの振る舞いで決まる。A と B を交互に送られると、64KB の meter が supervisor から main を経て renderer まで流れ続け、構成のタブを描き直し続ける (CWE-400 / Constitution IX)
- **推奨アクション**: `meter-throttle.ts` を使わない独自の合流を `live-signals.ts` の closure に置けば ADR に反しない。たとえば種類ごとに 250ms の窓で、窓の最後の値を必ず送る (trailing edge)。BE-020 のテストは「21 回でも最後の値が必ず届く・送る回数は窓の数以下」に替え、SH-020 に A / B を交互に送るケースを足す。採らないなら、その判断を plan の Risks に明記する
- **根拠**: CWE-400、Constitution IX、AD-048 Decision 3
- **scope 根拠**: data-model §2 / BE-020 の範囲

### [Low] 過去ログの入力にある `answers` を「選ばれた回答」と出すが、その値の出所を確かめていない (L-101) (scope: feature) [unresolved from prev: R2 L-101 / gate L-16]

- **観察**: spec.md:111、data-model.md:40、tasks.md:49-50、文言は data-model.md:168 の「選ばれた回答」。根拠は SDK の型の注記 (research.md:9) だけ。quickstart V-3 の確認項目 (tasks.md:107) にも、過去ログに `answers` が書き戻されるかは入っていない
- **同種事象探索**: `answers` で 4 件 (spec.md:111, data-model.md:40, tasks.md:49, tasks.md:50)
- **推奨アクション**: 確かめられるまでは文言を「入力に含まれる回答」にする。V-3 に確認項目を足し、SH-014 の「確かめられなかった項目」にも挙げる
- **根拠**: CWE-451

### [Low] SH-002 が `npx assistant-ui@latest add …` で版を固定せずに registry のコードを取り込む (L-102) (scope: feature) [unresolved from prev: R2 L-102 / gate L-17]

- **観察**: tasks.md:20。不採用の条件に「生の HTML / iframe」「遠隔の取得」はあるが、取り込んだ差分をどう確かめるか (Grep の手順) と CLI の版の固定は書かれていない
- **同種事象探索**: `assistant-ui@` で 1 件 (tasks.md:20)
- **推奨アクション**: CLI の版を `package.json` の assistant-ui に合わせて固定する。採る前に取り込んだ差分を `dangerouslySetInnerHTML|innerHTML|fetch\(|eval\(|new Function` で Grep する手順を SH-002 に足す
- **根拠**: SEC-8、OWASP A08

### [Low] 合流の規則で、名前が同じなら古い `commands` の説明と `argumentHint` を新しい `init-report` のコマンドに付ける。出所の違う同名のコマンドに古い説明が付きうる (L-104) (scope: feature) [new]

- **観察**: data-model.md:91 は説明を「出所に依らず最新の `commands` から名前で引く」とする。data-model.md:94 の例でも、`slashCommands` が変わった `init-report` の後に残った名前は説明を保つ。research.md:20 によれば SDK の `commands_changed` は「REPLACE their cached command list」
- **同種事象探索**: `名前で引く` で 4 件 (spec.md:130, spec.md:192, data-model.md:91, tasks.md:34)
- **リスク/影響**: 説明は無害化済みの平文なので injection は起きないが、構成のタブでコマンドの中身を取り違えさせる余地がある (CWE-451。表示だけなので Low)
- **推奨アクション**: 出所が `init-report` に替わったときは `commands` から引いた説明に「前回の一覧の説明」の印を付ける。または `init-report` の名前の集合が変わったときは次の `commands` まで説明を出さない。FE-001 / FE-021 にテストを 1 つ足す
- **根拠**: CWE-451、SDK の `commands_changed` の REPLACE の注記

### [Low] H: 上の指摘を検出するテストが無い。既存のテストの一部は指摘した振る舞いを期待値として固定している (L-103) (scope: feature) [unresolved from prev: R2 L-103 / gate L-18]

- **観察**: FE-010 / FE-014 (tasks.md:45, :52) が M-101 の曖昧なケースを「最長一致に確定」で固定。BE-020 (tasks.md:61) は M-103 の「間引かれない」を固定。FE-010 に host の負例がない (M-102)。L-104 のケースのテストもない。`keyof Query` の網羅 (tasks.md:86-87) と FE-001 の `__proto__` のテスト (tasks.md:35) は回帰の観測点になっている
- **推奨アクション**: M-101 から M-103 と L-104 の推奨アクションに書いたテストに差し替える、または足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `ちょうど 1 つ最長\|最長一致` | 4 | data-model.md:18, spec.md:108, tasks.md:45, tasks.md:52 |
| M-102 | `protocol と host` / `host も無ければ` | 2 (+テスト 1) | data-model.md:26, data-model.md:27, tasks.md:45 |
| M-103 | `間引\|上限に掛けない` | 5 (+plan 2) | spec.md:164, spec.md:189, data-model.md:80, tasks.md:60, tasks.md:61, plan.md:10, plan.md:130 |
| L-101 | `answers` | 4 | spec.md:111, data-model.md:40, tasks.md:49, tasks.md:50 |
| L-102 | `assistant-ui@` | 1 | tasks.md:20 |
| L-104 | `名前で引く` | 4 | spec.md:130, spec.md:192, data-model.md:91, tasks.md:34 |
| L-103 | テストの期待値 | 3 | tasks.md:45, tasks.md:52, tasks.md:61 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
- Round inheritance: resolved from 2: 0 / unresolved: 6 (M-101, M-102, M-103, L-101, L-102, L-103) / new: 1 (L-104)

注: R2 の security の 6 件は design-gate R2 の集約で M-09 / M-10 / M-11 / L-16 / L-17 / L-18 として挙がっていたが、改訂 a894690 は H-01 から H-03 と M-03 だけを扱っており、6 件には手当ても採らない理由の記録もない。M-103 を直すときは AD-048 Decision 3 に反しないよう `meter-throttle.ts` を使わない独自の合流にする。
