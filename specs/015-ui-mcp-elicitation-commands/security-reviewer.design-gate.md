# security-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-09
**Reviewer**: security-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (MCP の見出しと URI の要約)、FR-003 (2 段の振り分け、`Object.hasOwn`)、FR-004 (承認カード)、FR-005 (`AskUserQuestion` の読み取り専用の表示)、FR-006 (平文の結果)、FR-007 / FR-008 (未信頼の構成を `meter` で運ぶ)、FR-010 (`auth_status` / `plugin_install` の `output` / `error` を通さない)、FR-011 (項目 16 の P3)、FR-013 (O-10 のセキュリティの制約)、SC-001 / SC-002 / SC-005
- touched files に該当する charter / Confirmation: ui charter (tool 出力の専用表示)、AD-048 Decision 2 / 3 / 5 と Confirmation (SC-002 / SC-005)、AD-036 Decision 4 / §4 P3、AD-041 (e)(g)、AD-035 Decision 1、AD-047 Decision 2
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:2 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

この feature は IPC・preload・main・BrowserWindow・spawn・`shell.openExternal` を変えない (SC-005、plan Constraints)。このため SEC-2 / SEC-3 / SEC-5 / SEC-7 の新しい経路はありません。SDK の新しい呼び出しも無く、`Query` のメソッドは `interrupt` だけのままで、P3 の denylist は 17 個に広がります。

R1 の 11 件はすべて設計に反映されていることを確かめました。
- H-001: 承認カードは生の名前を出す (data-model §1、FE-014)
- M-001: URI は WHATWG URL で読み、userinfo / query / hash を捨てる。末尾はファイル名らしい形のときだけ出す
- M-002: BE-010 で過去ログの tool 名を無害化する。今のコードで `src/domain/session/transcript.ts:233` は生の `b.name`、`src/domain/session/live-message.ts:61` は `sanitizeBody` を通していることを確かめた
- M-003: 集計に `Map` を使い、prototype のキーのテストを置く
- M-004: 「未信頼の文字列」の文言、allowlist の正規表現、Cc / Cf / Zl / Zp の除去
- M-005: U-7 で印を出さない
- M-006: 注記を出す (§6)
- M-007: 各タスクにテストの観点がある
- L-001: SH-002 に不採用の条件がある
- L-002: FR-013 に O-10 の制約がある
- L-003: 結果は `<pre>` の平文

今回の新しい指摘は 3 系統です。
- 承認カードの補助見出しが、曖昧なサーバー名を確定したように出す
- URI の要約の host を検査していない
- 間引かない `commands` の送信に流量の上限が無い

担当外の観察 (採点外): tasks.md:39 (BE-010) が `src/agents/live-message.ts:61` を指しているが、実体は `src/domain/session/live-message.ts:61`。

## Findings

### [Medium] 承認カードの補助見出しが、前方一致するサーバーが複数あっても「推定」の印を付けずに最長一致のサーバーへ帰属させる (M-101) (scope: feature)

- **観察**: data-model.md:18 は「`rest` が `<s>__` で始まる `s` がちょうど 1 つ最長」なら `inferred: false` とする。サーバー `a` と `a__b` があるとき `mcp__a__b__c` は `a__b` › `c` に確定する。しかし SDK はサーバー名・tool 名を `[a-zA-Z0-9_-]` に正規化するので、サーバー `a` が tool `b__c` を公開すれば同じ `mcp__a__b__c` になる。どちらのサーバーの tool かは名前からは決まらない。tasks.md:48 (FE-014 のテスト) はこのケースで「補助の見出しが最長一致」になることを固定している。spec.md:108 (AC4) が推定にするのは「同じ長さで複数に一致」のときだけ
- **同種事象探索**: `ちょうど 1 つ最長|最長一致` で 4 件 (data-model.md:18、spec.md:108、tasks.md:41、tasks.md:48)
- **リスク/影響**: 承認カードは承認の唯一の経路 (`ApprovalCard.tsx:6`)。悪意のある (または名前の衝突した) MCP サーバー `a` が、信頼されたサーバー `a__b` の tool のように確定の見出しで出せる。生の名前は 1 行目に残る (AD-048 Decision 5) ので Critical ではないが、補助見出しが誤った確信を与える (CWE-451)
- **推奨アクション**: `knownServers` のうち前方一致するものが 2 つ以上あれば、長さに関わらず `inferred: true` にする。せめて承認カードでは「サーバーを特定できません」を出す。transcript の見出しでも同じ扱いにする。data-model §1 の表の 2 行目、spec AC4、FE-010 と FE-014 のテスト (`a` と `a__b` の両方があるケース) を書き換える
- **根拠**: AD-048 Decision 5 (分けた見出しは補助)、CWE-451、Constitution III
- **scope 根拠**: data-model §1 と FE-010 / FE-014 の範囲

### [Medium] URI の要約が host を無条件に出す。独自の scheme では host の位置に任意の文字列が入り、秘密の形の検査は最後のパスの要素にしか掛からない (M-102) (scope: feature)

- **観察**: data-model.md:26-27 は `protocol` と `host` を常に出し、`mayCarrySecret`・英数字 20 文字・長さの検査は「最後のパスの要素」だけに掛ける。WHATWG URL は特別でない scheme (`foo://<authority>/x`) でも authority を host として解く。research.md:60 が言うとおり、resource の URI の形は MCP サーバーの作者が決めるもので保証されない。FE-010 のテストの負例 (tasks.md:41) にも host の負例が無い
- **同種事象探索**: `` `protocol` と `host` `` / `host も無ければ` で 2 件 (data-model.md:26、data-model.md:27)。テスト側は tasks.md:41 の 1 件
- **リスク/影響**: `x-api://sk-ant-...../readme.md` のように authority にトークンを置く URI は、そのまま見出しに出る。R1 M-001 と spec 016 から申し送られた規則 (research R-07) の意図「秘密を見出しに出さない」が host では成り立たない (CWE-200)。設計段階で実害は観察できないので Medium とした
- **推奨アクション**: host にも最後のパスの要素と同じ検査を掛ける。`mayCarrySecret` が false、英数字が 20 文字以上続かない、長さの上限 (たとえば 64)、`^[A-Za-z0-9.-]+$` (IDN は punycode のまま)。外れたら `protocol` だけを出す。FE-010 のテストに `foo://sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx/readme.md` と、長い host の負例を足す
- **根拠**: spec Q3 (a) の推奨理由「秘密を出さない安全側の形」、research R-07、CWE-200
- **scope 根拠**: data-model §1 と FE-010 の範囲

### [Medium] `commands` (と `init-report`) を間引きの対象から外すが、流量の上限が無い。内容が交互に変われば重複の抑止も効かず、1 件 64KB の送信が無制限に続く (M-103) (scope: feature)

- **観察**: spec.md:163、data-model.md:79、tasks.md:57 は `init-report` / `commands` を O-4 の上限 (1 秒に 20 件) に掛けず、「1 秒に 21 回以上の `init` でも間引かれない」をテストで固定する。抑止は「前回と同じ内容」だけ。`commands_changed` はスラッシュコマンドの一覧が変わるたびに届く。MCP の prompt はスラッシュコマンドとして出るので、prompt の一覧の変化を繰り返し通知するサーバーがあると、届く頻度は第三者が決めることになる (推測を含む)
- **同種事象探索**: `間引かずに|間引かれない|上限に掛けない|掛けない` で 3 件 (spec.md:163、data-model.md:79、tasks.md:57)。FR-007 (spec.md:188) にも「O-4 の `meter` の上限に掛けない」がある
- **リスク/影響**: A と B を交互に送られると、supervisor から main を経由して renderer へ 64KB の meter が流れ続け、構成のタブを再描画し続ける (可用性。CWE-400)。「最新の値を落とすと二度と届かない」という間引かない理由 (spec.md:163) は、末尾で必ず送る合流 (trailing-edge coalescing) でも満たせる
- **推奨アクション**: 種類ごとに末尾で必ず送る合流を入れる。たとえば 250ms に 1 回までにして、窓の最後の値を必ず送る。spec の Edge Cases と FR-007 の「上限に掛けない」を「最新の値は落とさず、合流する」に書き換える。BE-020 のテストを「21 回で最後の値が必ず届く・送る回数は窓の数以下」に替え、SH-020 に A / B を交互に送るケースを足す
- **根拠**: CWE-400、Constitution IX (main をブロックしない)、AD-048 Decision 3 (件数とバイト数の上限の趣旨)
- **scope 根拠**: BE-020 / data-model §2 の範囲

### [Low] 過去ログの `AskUserQuestion` の入力にある `answers` を「選ばれた回答」と表示するが、その値の出所 (利用者の選択か、モデルが書いた入力か) を確かめていない (L-101) (scope: feature)

- **観察**: data-model.md:39 と spec.md:111 は、入力に `answers` があれば選ばれた選択肢として強調する。根拠は SDK の型の注記 (research.md:9) だけで、過去ログの `tool_use.input` に `updatedInput` が書き戻されるかは確かめられていない。モデルが自分の入力に `answers` を入れると、利用者が選んでいない回答が「選ばれた回答」と出る
- **同種事象探索**: `answers` で spec.md:111、data-model.md:39、tasks.md:46 の 3 件
- **推奨アクション**: quickstart V-3 に「過去ログの `tool_use.input` に `answers` が書かれるか」の確認を足す。確かめられるまでは文言を「入力に含まれる回答」にするか、tool_result 側の値だけを使う
- **根拠**: CWE-451

### [Low] SH-002 が `npx assistant-ui@latest add …` で版を固定せずに registry のコードを取り込む (L-102) (scope: feature)

- **観察**: tasks.md:16。取り込んだコードを採るかは照合で決め、新しい npm の依存は不採用の条件にしている。CLI と registry の版はどちらも固定していない
- **同種事象探索**: `assistant-ui@latest` で tasks.md:16 の 1 件 (この spec の中)
- **推奨アクション**: CLI の版を `package.json` の assistant-ui に合わせて固定する。取り込んだ差分 (生の HTML・`dangerouslySetInnerHTML`・`fetch`・`eval`) を Grep で確かめてから採るという手順を、SH-002 の不採用の条件に足す
- **根拠**: SEC-8、OWASP A08

### [Low] H: 上の指摘を検出するテストが無い。既存のテストの一部は、指摘した振る舞いを固定している (L-103) (scope: feature)

- **観察**: FE-014 (tasks.md:48) は M-101 の曖昧なケースで最長一致を期待している。BE-020 (tasks.md:57) は M-103 の「間引かない」を期待している。FE-010 (tasks.md:41) に host の負例が無い (M-102)。承認・無害化の既存の回帰は `session-core.test.ts:315-321` (双方向制御の tool 名) が守っていて、ApprovalCard の「MCP でない tool の DOM が今のまま」も FE-014 にある
- **推奨アクション**: M-101〜M-103 の推奨アクションに書いたテストに差し替える、または足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `ちょうど 1 つ最長\|最長一致` | 4 | data-model.md:18, spec.md:108, tasks.md:41, tasks.md:48 |
| M-102 | `` `protocol` と `host` `` / `host も無ければ` | 2 (+テスト 1) | data-model.md:26, data-model.md:27, tasks.md:41 |
| M-103 | `間引かずに\|間引かれない\|上限に掛けない` | 3 (+FR 1) | spec.md:163, data-model.md:79, tasks.md:57, spec.md:188 |
| L-101 | `answers` (表示) | 3 | spec.md:111, data-model.md:39, tasks.md:46 |
| L-102 | `assistant-ui@latest` | 1 | tasks.md:16 |
| L-103 | テストの期待値 | 3 | tasks.md:41, tasks.md:48, tasks.md:57 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
- Round inheritance: resolved from 1: 11 / unresolved: 0 / new: 6
