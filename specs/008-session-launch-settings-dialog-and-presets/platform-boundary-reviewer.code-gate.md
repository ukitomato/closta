# platform-boundary-reviewer Review: X-4 (code-gate iter3)

**Run**: 2026-09-30
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md

## 前回指摘の状況

| ID | 状態 | 確認箇所 |
|---|---|---|
| L-101 (項目 16 の迂回形: readonly 初期化子 / 複合代入 / class field / ラッパの後ろへの連結 / UNDETECTED_NOTES が無い) | **resolved**。iter2 で名指しした形はすべて塞がった。塞げない形も妥当に記録された。ただし残りの穴を L-201 に分けた | 下の 6 点で確認した |

L-101 の確認箇所:
- check.mjs:819 の `assignOp` を、計算キー / 代入 / 既定値・class field の 3 形に適用している (:825 / :828 / :829)。
- check.mjs:883 で、readonly の除外を「初期化子 `=` が無い」ときに絞った。
- check.mjs:777-795 に `wrapperCallCompletes` を足し、settings (:850) と permissionMode (:889) の両方に適用した。
- iter2 で名指しした形はすべて違反になった。scratchpad で同じ式を評価して確かめた。
  - `readonly permissionMode: M = E` / `private readonly …= E`
  - `.permissionMode ??=`
  - `static` / `#` の class field
  - 分割代入の既定値
  - `assertSafePermissionMode(x) && m` と、同じ行の `? :`
- fixture 3 本は、それぞれ期待の形で発火した。
  - readonly-initializer → 値位置
  - nullish-assignment → 代入
  - wrapper-chained → 値位置
- UNDETECTED_NOTES:
  - `UNDETECTED_NOTES['sdk-permission-mode-reflective']` (expected.mjs:533-550) は、why / mitigatedBy / nextFeature (I-3) / howToClose の 4 点を満たし、run.mjs:297 の必須要件を充足している。
  - regex で塞がない判断の理由 (データフローを追わないと誤検出と見逃しの両方が残る) も妥当である。
  - reflective fixture は、項目 16 の複製ではどの形でも 0 件だった。
  - tsc を tsconfig.node.json の options で、in-memory の仮想パス `src/agents/__rulecheck__/` に置いて評価し、診断 0 件を確かめた。src にはファイルを置いていない。
  - eslint.config.mjs には Reflect / defineProperty / fromEntries / `as unknown` を拾う規則が無い。したがって `none` の要件は満たすと見込める。eslint の実走は test:rules に委ねる。

## 修正で新たな穴が入ったかの検証

- **閉じ括弧の探索**: 次の形は正しく「完結」と判定し、誤検出しない。
  - 文字列内の括弧 `assertSafePermissionMode(f(')'))`
  - ネストした呼び出し `(g(h(x)))`
  - 改行してから `}`
- **ただし 2 つの形は誤る** (L-201 (a))。
  - 改行の後ろに続く演算子
  - 正規表現リテラルや入れ子テンプレートによる深さの誤算
- **class field 形の誤検出**: 次の形は拾わない。
  - `=== / == / !== / >=`
  - アロー `permissionMode => …`
  - 型内の `(m: M) => void`
- **意図どおり違反になる形**: `const permissionMode = assertSafePermissionMode(raw)` / `const settings = assertHelperSettings(raw)` / 引数の既定値。
  - check.mjs:813-815 のコメントが「値位置は素のキーでだけ書く」と明記しているので、方針どおりである。
  - ただし、変数宣言でもメッセージのラベルは「既定値 / class field形」になる。実害は無い。
- **readonly の判定窓**: 複数行の union 型 (初期化子なし)、`Extract<M, 'plan'>`、次のメンバーに `=` がある型は、どれも誤検出しない。
  - 誤検出になるのは、型の中の文字列に `=` がある場合 (`Lookup['a=b']`) だけである。これは作為的で、安全側に倒れる。
  - 逆に見逃す形があり、L-201 (b) に記載した。
- **src/agents の実コード**: 非テストの 7 ファイル (enumerate-sessions / enumerate / protocol / read-transcript / sdk-agent-session / session-core / transport) すべてで、項目 16 の複製は 0 件だった。誤検出は無い。
- **forward-env.ts:113-120**: `as const satisfies readonly CredentialEnvName[]` は要素の型を狭めたまま、部分集合を型で保証している。`MethodSpecificForwardKey` (:122) もリテラル union のままである。forward-env.test.ts:133 のテストも部分集合を pin している。transport 名は domain に漏れていない。**問題なし。**

## 初回読了 viewpoint

- FR/SC: AD-041 (a) の Confirmation (項目 16 の fixture 発火) と SC-017 (未検出経路の記録) について、iter3 の差分を再読した。
- touched files に該当する charter / Confirmation: AD-041 (a)、Principle III。
- A. 認可 / 認証 / secret 管理: 該当なし。owner は security-reviewer。
- B. 入力検証 / injection / CSP / 暗号: 該当なし。owner は security-reviewer。
- C. 業務不変条件 / Charter drift: 該当なし。iter3 の差分は、scripts / tests と domain/provider の型注釈に閉じている。runtime / isolation charter の Out of scope は侵犯していない。
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0。Principle III の load-bearing gate (buildQueryOptions の型と assert、decoder の isSafePermissionMode) は無傷である。
- E. User Story / SC / AC / UX: 該当なし。owner は po-reviewer。
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1 (L-201)。
- G. optional reviewer 範囲: 該当なし。optional reviewer ではない。
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。
  - 新 fixture 3 本 + none 1 本は expected.mjs:310-346 に登録されている。
  - test:rules の全体実行はまだで、pr-gate / CI に委ねる。
  - L-201 の形には fixture が無い。推奨アクションに含めた。

## スコープ要約

- 静的に読んだもの: check.mjs:758-918 (項目 16)、scan.mjs:73-120、run.mjs:175-324、expected.mjs:225-346 / :445-551、新 fixture 4 本と既存 4 本、forward-env.ts:113-129。
- scratchpad の node スクリプトで評価したもの:
  - 項目 16 と同じ式を、29 形の探査ケース、src/agents の実コード 7 ファイル、fixture 8 本に対して評価した。
  - TypeScript API の in-memory program で、reflective fixture と optional field 形が型として正しいかを確かめた。
- 実行していないもの: src 配下への展開、wsl.exe、eslint。

## Findings

### [Low] 項目 16 の迂回がまだ成立する。改行を挟んだ三項演算子 (prettier が出す形)、optional の class field、readonly の判定窓が途中で打ち切られる形 (L-201) (scope: feature)

- **観察**: check.mjs:777-895 と同じ式を node で評価すると、次の形は検出 0 件になる。
  - **(a) ラッパの後ろに改行を挟んだ連結**:
    - 例: `permissionMode: assertSafePermissionMode(x)\n    ? ELEVATED\n    : SAFE` と `assertSafePermissionMode(x)\n  ?? ELEVATED`。
    - check.mjs:791 の `/^[ \t]*(?:[,};)\r\n]|$)/` は、改行を「完結」と扱い、次の行を見ない。
    - 同じ行の `? :` は違反になる。そのため、prettier が長い三項演算子を `?` を行頭に置く形へ折り返すと、それまで違反だった行が合格に変わる。本リポジトリの整形器が迂回形を生成しうる。
    - 同じ関数には 2 つ目の穴もある。正規表現リテラル内の `)` (`pick(/\)/, x)`) と入れ子テンプレート (`` `${`),`}` ``) は深さを誤算させる。そのうえ、許容する後続文字に `)` と `;` が入っているため、誤算した位置で「完結」が成立してしまう。オブジェクトリテラルの値の直後に `)` や `;` が来る正当な構文は無いので、この 2 文字は迂回を助けるだけである。
  - **(b) readonly の判定窓の打ち切り**:
    - 例: `readonly permissionMode: Extract<M, S> = ELEVATED` / `readonly permissionMode: { a: M }['a'] = ELEVATED` / `readonly permissionMode:\n    | A\n    | B = ELEVATED`。
    - check.mjs:883 の `/^[^;,}\n]*=(?![=>])/` は、型の中の `,` / `}`、または改行で窓を閉じる。そのため、後ろにある初期化子を見ない。
  - **(c) optional の class field**:
    - 例: `class C { permissionMode?: M = ELEVATED }` と `readonly permissionMode?: M = ELEVATED`。
    - modeRe (:878 `permissionMode\s*:`) と、既定値・class field 形 (:829 `permissionMode\s*=`) は、どちらも間の `?` を許さない。
    - この形は型として正しい。in-memory の tsc で診断 0 件を確かめた。
    - iter2 で本 reviewer が名指ししなかった形である。
- **同種事象探索**: src/agents (非テスト 7 ファイル) で、上の形は 0 件である。項目 16 の複製の出力も全ファイルで空だった。実害は無い。
- **リスク/影響**:
  - load-bearing gate は無傷なので Low とした。load-bearing gate とは、`SafePermissionMode` 型、buildQueryOptions の assert、decoder の isSafePermissionMode である。
  - ただし (a) は、整形の前後で判定が変わる。I-3 で昇格モードを三項演算子で切り替えるコードを書くと、prettier を通した時点で backstop が外れる。「綴りの退行検出」としても不安定である。
- **推奨アクション** (安い順):
  1. check.mjs:791 を `/^\s*(?:[,}]|$)/` にする。改行を越えて次の非空白を見るようにし、`;` と `)` は外す。これで (a) の 2 つの穴を両方塞げる。改行してから `}` が来る正当な形は通るままである。
  2. modeRe を `/(?<![.\w])permissionMode\s*\??\s*:/g` にし、既定値・class field 形も `key\s*\??` を許す形にする。これで (c) を塞げる。src/agents の型はすべて readonly 付きなので、誤検出は増えない。
  3. (b) は、窓を「括弧 `<>` `{}` `()` の深さ 0 で、`;` か空行まで」に広げる。`wrapperCallCompletes` と同じ深さ走査を流用できる。
     - 直さない場合は、(b) と正規表現リテラル / 入れ子テンプレートの誤算を `UNDETECTED_NOTES['sdk-permission-mode-reflective']` の why に追記する。
     - 同じ none fixture に 1 形加えるだけでもよい。
  4. fixture を 2 本足す。改行を挟んだ三項演算子と、`permissionMode?: M = v` である。
- **根拠**: PB-7 / Principle III / AD-041 (a) Confirmation / SC-017
- **scope 根拠**: scripts/constitution/check.mjs と tests/rule-fixtures/expected.mjs は、本 feature の touched files である。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | 項目 16 の複製 (settings / permissionMode の全形) を src/agents の非テストファイルに適用 | 0 | src/agents/enumerate-sessions.ts / enumerate.ts / protocol.ts / read-transcript.ts / sdk-agent-session.ts / session-core.ts / transport.ts (すべて空) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1

補足: 固有観点のうち、次の 4 つは該当なし。
- PB-2: iter3 の差分に、ランタイムの保持やキャッシュは無い。
- PB-4: 権限モードの入口は iter2 から変わっていない。変わったのは backstop の検査式だけである。
- PB-5: docker endpoint が無いので、多段変換は発生しない。
- PB-6: 差分は scripts / tests / preset-store / labels / forward-env で、永続環境を作るものは無い。preset-store の rename 失敗時の temp 削除は userData 内に閉じている。

関連ファイル:
- C:\dev\closta\scripts\constitution\check.mjs
- C:\dev\closta\scripts\constitution\scan.mjs
- C:\dev\closta\scripts\rules\run.mjs
- C:\dev\closta\tests\rule-fixtures\expected.mjs
- C:\dev\closta\tests\rule-fixtures\b-equivalent\sdk-permission-mode-readonly-initializer.ts.fixture
- C:\dev\closta\tests\rule-fixtures\b-equivalent\sdk-permission-mode-nullish-assignment.ts.fixture
- C:\dev\closta\tests\rule-fixtures\b-equivalent\sdk-permission-mode-wrapper-chained.ts.fixture
- C:\dev\closta\tests\rule-fixtures\b-equivalent\sdk-permission-mode-reflective.ts.fixture
- C:\dev\closta\src\domain\provider\forward-env.ts
- C:\dev\closta\src\domain\provider\forward-env.test.ts
