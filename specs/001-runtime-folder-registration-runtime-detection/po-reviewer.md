# po-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: po-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため (Read / Grep / Glob のみ)、
> reviewer の最終報告を pr-gate が保存した。

---

## 初回読了 viewpoint

**FR/SC**: 本 round で判定に使ったのは FR-009 / FR-033 / FR-035 / FR-041 / FR-044 / FR-047、
SC-002 / SC-003 / SC-004 / SC-005 / SC-008 / SC-009 / SC-011 / SC-013 / SC-014 / SC-016 / SC-017。
直近 3 コミット (`3acc803` / `ca6f2ce` / `cfec16b`) が触った範囲は **SC-008 / SC-009 / SC-017 と US-4** に集中する。

**touched files に該当する charter / Confirmation**:
- `docs/domains/runtime/charter.md` — `related_adrs` に AD-027 は無い。ただし AD-024 (同じ governance 系) も無く**前例と整合するため追随不要と判定**
- `.specify/memory/constitution.md` `## Existing violations summary` — `pnpm test:rules` 行が SC-008 / SC-009 の enumeration 記録 (下記 H-102)
- `docs/decisions/0027-...md` (AD-027, accepted) — `# Title` / `## Decision` / `## Consequences` を読了 (Confirmation 節は無い)

**viewpoint severity 集計**:

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲。AD-027 §5 が `__rulecheck__/service-io-import.ts` を実名で規則対象に入れた件は cat D/F
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲。**`.specify/memory/constitution.md:660-676` の enumeration が AD-027 後の実体とずれている点は H-102 の cascade に列挙したが、Constitution 改定手続きの判断は cat D として architecture-reviewer に渡す**
- E. User Story / SC / AC / UX: Critical:0 High:7 Medium:4 Low:2
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲 (本 round の H-004 は **SC-008 の達成主張**の側から見ており、規則の書き方には触れない)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: `a11y-reviewer` / `ux-reviewer` が code-gate iteration 2 で実施済み
- H. テスト / coverage / observability / regression: Critical:0 High:3 Medium:3 Low:1

**重複抑制の確認**: `.gate-verdict-code.json` の `iter1_must_fix_resolution` (MF-001〜MF-007 = resolved 6 / partially 1) と
`code-gate.md:76-82` の解消判定表を読了。MF-001〜MF-007 の**指摘行そのもの**は再指摘していない。
code-gate の viewpoint E は 2 iteration とも `該当なし: pr-gate 専任` であり、**PO 観点でコードを見たのは Round 1 が初回**である。

---

## スコープ要約

Round 2 の diff は 207 files / +41,799。Round 1 (199 files / +37,337) からの増分は
**pr-gate Round 1 の Critical 2 件に対する修正 3 コミットと AD-027 の起票**である。
`run.mjs` が「20 件同時展開 → 1 回検証」から「1 件 (+同伴) 展開 → 要る検出器だけ → 後始末」×21 回に変わり、
`#N` 期待が `[VIOLATE] #N` で照合されるようになった。`services-not-to-io` 規則と対応 fixture が 1 件増えて 21 件。
**この変更により SC-008 の群 (a) 全数検出は「初めて本当に測られた」状態になったが、同時に 2 つの新しい問題を生んだ** —
(1) 訂正前の「20/20 一致」記録が偽を含んでいたと確定したのに記録が 3 箇所で未訂正、
(2) 訂正直後の初回実行で 5 件の不一致が出て原因未特定のまま再実行値が採用されている。
Round 1 の High 8 / Medium 5 / Low 2 は**全件が実体として未解消**である (H-004 のみ状況が変化)。

---

## Round 1 指摘の 1 件ずつの判定

| ID | 内容 | 本 round の判定 | 根拠 (再確認した観察事実) |
|---|---|---|---|
| H-001 | SC-003 が AD-015 §8 の手動判定と未照合 | **未解消 (変化なし)** | `quickstart-results.md:86-89` の未実施リストに「2 (AD-015 §8 の手動判定との突き合わせ)」が残る。V-1 は「一部」のまま |
| H-002 | SC-011 の日本語表示に証拠 0 件 | **未解消 (変化なし)** | `ResolutionScreen.test.tsx:71` の `displayName` は依然 `'x'`。renderer テストで非 ASCII の利用者データを描く箇所は 0 件 |
| H-003 | SC-014 に証拠 0 件 | **未解消 (変化なし)** | `requestSingleInstanceLock` は `src/main/index.ts:28` の 1 件のみ。テストファイル内の出現は 0 件。`quickstart-results.md:123` は 2-9 を未実施のまま |
| H-004 | AC-2 のネイティブ半分に fixture 0 件 | **未解消 / 前提が変化** → 下記 **H-004 (R2)** に書き直す | FIXTURES は 21 件になったが `expected.mjs` に `native` / `better-sqlite3` / `node-pty` / `keytar` は 0 件。`agents-not-to-native` の対象は依然 0 |
| H-005 | chat 画面の spec drift (FR-033 / Assumptions / SH-007) | **未解消 (変化なし)** | `spec.md:374` / `spec.md:561` / `tasks.md:31` SH-007 が `[x]` のまま |
| H-006 | US-2 の UI 側 AC 14 本中 自動テスト 3 本 | **未解消 / 修正コストが下がった** | renderer テストは 3 ファイルのまま。**新事実**: AD-027 §4 で `folder-service` が `deps.newId` を受けるようになり、識別子を決定的に固定できる。AS-5 の service 側は **テスト 0 件のまま**だが、今なら決定的に書ける |
| H-007 | FR-009 / US-5 AS-5 の導線が実装に無い | **未解消 (変化なし)** | preload capability に文書を開くメソッドは 0 件。`openDependencyDoc` はコードベースに存在せず、`po-reviewer.md` の推奨案文中にのみ現れる |
| H-008 | SC-002 の 1 対 1 一致 / 列挙不能提示に証拠 0 件 | **未解消 (変化なし)** | renderer で非空 `enumerationIssues` を描くテストは 0 件。main 側は `runtime-store.test.ts:53,130` が押さえるが画面ではない |
| M-001 | SC-004 の `browse-step` / `browse-step-revalidate` 未計測 | **未解消 (変化なし)** | `quickstart-results.md:131-132` |
| M-002 | SC-005 の計測経路が spec 文言とずれ | **未解消 (変化なし)** | `quickstart-results.md:88` |
| M-003 | SC-013 / SC-016 の計測経路欠落 | **未解消 (変化なし)** | `quickstart-results.md:120-129`。`.bak` 0 件 / `location.protocol` 未確認 |
| M-004 | README の "one completed feature" / "packaging not set up" | **未解消 (変化なし)** | `README.md:9-11` / `README.md:30` が同一文面 |
| M-005 | 「このまま選べます」と選ぶ手段の不在 / FE-030 の `[x]` | **未解消 (変化なし)** | — |
| L-001 | `manual-checklist.md:328` の `今は選べない` | **未解消 (変化なし)** | 同文字列はコードベースに 1 件 (当該行) のみ |
| L-002 | 停止中カードの「再判定」常設 | **未解消 (変化なし)** | — |

**resolved 0 / unresolved 15 / 状況変化 2 (H-004 / H-006)。**

---

## 本 round で新たに依頼された 4 点への判定

### 1. SC-008 / SC-009 / SC-017 への影響

- **SC-008 の群 (a) 部分は「初めて実際に測られた」。** 1 件ずつ展開する形になったことで、`hits` に現れた検出器名がそのサンプルの話だと確定する。`#N` も `[VIOLATE] #N` で語境界つき照合になった。**改善であり、後退はない。**
- **ただし SC-008 / SC-009 の「達成」記録は訂正が必要である。** `wsl-args-array` の `#1` が構造的に常に真だったことが AD-027 §Context / §Decision 2 で確定したため、**「期待表と 20 件すべて一致」という記録は少なくとも 1 行が偽**だった。その記録が 3 箇所に未訂正で残る → **H-102**。
- **さらに、訂正後の値も再現していない。** AD-027 §Consequences 最終項が「1 件ずつに分けた直後の初回実行で 5 件の不一致が出たが、再実行では 21 件すべて一致し**再現しなかった**」「初回実行時は診断出力が無かったため事後に切り分けられない」と書いている。**SC-008 / SC-009 の唯一の証拠が、原因未特定の非決定性を 1 度示した測定である** → **H-101**。
- **SC-017 は変化なしで達成継続。** 残余 2 件は `detectors: ['none']` のまま、`nextFeature` (R-2 / I-1) と `howToClose` が `run.mjs:264-273` で必須検証されている。**むしろ証拠は強くなった** — `none` のサンプルだけは 4 検出器すべてを走らせる形が明文化された。

### 2. SC-017 の残余 2 件

`expected.mjs:217-230` で `detectors: ['none']`、`UNDETECTED_NOTES` に 4 点が揃っている。**SC-017 は達成のまま。指摘なし。**

### 3. AD-027 と US-5 (README / 文書の status 明示)

**README の追随は不要と判定する。**
`README.md:76-83` の Documentation 節は `docs/decisions/` を**ディレクトリとして**リンクしており、個々の ADR を列挙していない。ADR が 1 本増えても記述は陳腐化しない。`docs/domains/runtime/charter.md:7-16` の `related_adrs` にも AD-027 は無いが、**同じ governance 系の AD-024 も載っていない**ため前例と整合し、追随義務は無い。

**追随が要るのは別の 2 箇所である。**
- `spec.md:596-598` の Dependencies「**本 feature で起票する ADR**: AD-024 / AD-025」が**2 本のまま**。実際に起票されたのは AD-024 / AD-025 / **AD-026** / **AD-027** の 4 本である (AD-026 は Round 1 時点で既に漏れており、これは Round 1 の見落ちである)
- `tasks.md` に本 round の作業に対応する task が 1 件も無く、`SH-020` / `SH-021` / `SH-023` / `SH-048` の `[x]` は**訂正前の内容**を指している
→ **M-101** (H-005 と同型だが別事例)

なお、AD-027 §Consequences が X-1 / X-3 / I-2 へ出した申し送りは **ADR 本文にしか無い** → **L-101**。

### 4. `test:rules` の所要時間

**SC 違反ではない** (SC-004 の予算は 5 点とも UI / 判定側で、CI 時間の予算は spec に存在しない)。
**PO 観点では Medium 相当の問題として扱う** → **M-102**。理由は「遅い」ことではなく **(a) 所要時間がどこにも計測記録されていない**、**(b) AD-027 自身が用意した移行判断に閾値が無い**、**(c) `verify.yml` に `timeout-minutes` が無い**の 3 点で、H-101 の非決定性と組み合わさると「原因不明で赤くなり、再実行に長時間かかる検証」になる。US-4 の Why は「エディタ上と CI の両方で止まる」という開発者向け価値であり、ここが崩れると US-4 の価値が目減りする。

---

## Findings

### [High] SC-008 / SC-009 の唯一の証拠が、原因未特定の非決定性を示した測定であり、再現確認の記録が ADR 本文以外に無い (H-101) (scope: feature)

- **観察**: `docs/decisions/0027-...md:139-144` が「**原因を特定できなかった事象が 1 件ある。** 1 件ずつに分けた直後の初回実行で 5 件の不一致が出たが、再実行では 21 件すべて一致し**再現しなかった**」「初回実行時は診断出力が無かったため事後に切り分けられない」と記録している。採用された値は**再実行側**である。`run.mjs:345-349` の `exit:<code>/<bytes>` 出力と `:356-360` の `code === null` 分離は**この事象への事後対応**として入ったものであり、**当該 5 件が何だったかは今も不明**である。
- **同種事象探索**: `grep -rn "21 件|21/21" specs/ docs/ .specify/` → **AD-027 の 2 行 (`:130`, `:140`) のみ**。`quickstart-results.md` / `docs/discovery.md` / `.specify/memory/constitution.md` / `code-gate.md` のいずれにも 21 件の記録は **0 件**。`grep -rn "再現しなかった|flaky|非決定" specs/ docs/` → **1 件 (AD-027:140)**。つまり **SC-008 / SC-009 の現在の達成値は、1 つの ADR の Consequences 節にある 1 行だけが根拠**である。
- **リスク/影響**: (a) SC-009 は「lint・型検査・依存グラフ検証・Principle 検証スクリプトを実行して**違反 0 件**で完了する」であり、SC-008 は「群 (a) のすべてが検出される (全数検出)」である。**どちらも「毎回そうなる」ことを含意する**。1 度不一致を出して原因が分からない測定器は、この含意を支えられない。(b) `verify.yml:81-82` が CI の 1 ステップとして `pnpm test:rules` を回すため、**同じ非決定性が PR ごとに現れうる**。US-4 の価値は「止まってほしい」だが、理由不明で赤くなる検証は「再実行すれば通る」学習を生み、**AD-024 が名指した反パターン「違反が 0 件なのではなく検査が 0 件になる」の再来**になる。(c) pr-gate Round 1 が Critical にした C-001 は「発火を確かめられない」ことだった。**確かめられるようにはなったが、確かめた結果が安定していない**。
- **推奨アクション**: 次の 2 つを行い、**どちらも記録に残す**。
  1. `pnpm test:rules` を **連続 3 回**回して 21/21 が 3 回続くことを `quickstart-results.md` の V-4 に書く (所要は下記 M-102 の計測と兼用できる)。1 回でも不一致が出たら `exit:<code>/<bytes>` 行を添えて記録する — **診断出力を入れた目的はこれである**
  2. `expected.mjs` / `run.mjs` に「本検証は非決定性を 1 度示しており、現在の診断出力はその切り分けのために入っている」ことを 1 行残す。AD-027 は accepted で immutable なので **ADR を書き換えるのではなく、実行側の docstring と quickstart 記録に降ろす**
  - 併せて、`run.mjs:224` の非 `#` 規則照合が依然「全出力横断の部分一致」である点は、**同伴サンプル 3 件を増やすときに再訪する**ことが ADR に書かれている。PO としては increase しないことを条件に受け入れる。
- **根拠**: SC-008 / SC-009 / US-4 AC-12 / FR-035、AD-027 §Decision 3 / §Consequences、AD-024
- **scope 根拠**: `run.mjs` / `expected.mjs` / `quickstart-results.md` はすべて本 PR の touched file

### [High] SC-008 / SC-009 の達成記録が「違反サンプル 20 件 / 期待表と全件一致」のまま 3 箇所に残っており、そのうち 1 行は偽と確定している (H-102) (scope: feature)

- **観察**: AD-027 §Context:33-37 が「`wsl-args-array` は `--import` を捕まえる意図で `#1` を期待していたが、項目 1 は特権コマンド**文字列**の検査であり `--import` はどちらの許可リストにも無い。**それでも「20/20 一致」が報告されていた**」と確定させた。訂正は `expected.mjs:169-177` で入っている (`rules: ['#3']`)。**にもかかわらず、その「20/20 一致」を SC の達成根拠として引用している記録が未訂正で残る**:
  - `specs/.../quickstart-results.md:158` — 「`pnpm test:rules` — **期待表と 20 件すべて一致**」(V-4 = 「通過」の根拠)。同じ表の `:157` は `pnpm test` を **245 passed** と書いており、これも code-gate iteration 2 の実測 264 とずれている
  - `docs/discovery.md:147` — 「`pnpm test:rules` が **20 件**の違反サンプルを展開して期待表と突き合わせる」/ `:160` — 「期待表と**全件一致** (20 件)」/ `:159` — 「`pnpm test` | 11 files / **213 passed**」
  - `.specify/memory/constitution.md:671` — 「`pnpm test:rules` (違反サンプル **20 件**の発火確認) | 期待表と**全件一致**」/ `:675` — 「**20 件**の違反サンプルを検査対象へ展開して**期待した検出器が実際に発火すること**を毎回確かめる」。同じ enumeration 表の `:668` は depcruise を「114 modules / 395 dependencies」、`:670` は `pnpm test` を「11 files / 213 passed」と書いている
- **同種事象探索**: `grep -rn "20 件|20/20|test:rules" --glob '*.md'` → **34 行**。うち **(i) 現在も SC の達成根拠として読まれる記録は 3 ファイル / 7 行** (上記)、**(ii) gate / reviewer の履歴として残るべきもの 21 行** — **これらは訂正しない。ある時点の観察記録である**、**(iii) AD-027 自身の記述 6 行** (訂正の経緯として正しい)。`docs/verify-report.md` は **2026-09-12 の bootstrap 時点のスナップショット**で `test:rules` の記録を **0 件**しか持たない — **訂正対象ではない**。
- **リスク/影響**: (a) `quickstart-results.md` は spec が SC-008 / SC-009 / SC-017 の計測経路として指定した唯一の実施記録であり、**「通過」の判断がここに書かれた数字で行われる**。偽と確定した行を根拠にした「通過」は、`/cl-done` 後に「SC を満たした」という記録として残る。(b) `docs/discovery.md` は次回 bootstrap / 次 feature の reviewer が Tech Stack と検証手段を読む場所である。**20 件で止まった記録を読んだ reviewer は、21 件目の存在を知らずに「fixture は 20 件」を前提に判定する** — 本 round で私自身が Round 1 に「FIXTURES は 20 件のまま」と書いたのと同じ誤りが再生産される。(c) **SC-012 が禁じた「未実装を実装済みのように書く」の裏返し (検証していないものを検証したと書く) が spec 配下の記録で起きている**。
- **推奨アクション**: 記録を 3 箇所訂正する。**書き換えるべきは数字だけではない** — 偽だったという事実を残す。
  1. `quickstart-results.md:158` を「`pnpm test:rules` — **21 件すべて一致** (1 件ずつ展開する形へ改めた後の値。**改める前の「20 件すべて一致」は `wsl-args-array` の `#1` 期待が構造的に常に真だったため 1 行が偽だった** — AD-027)」に。`:157` の `pnpm test` を 264 に
  2. `docs/discovery.md:147,159,160` を 21 件 / 15 files / 264 passed に。`:147` に「**1 件ずつ展開して照合する** (AD-027)」を足す
  3. `.specify/memory/constitution.md:664-676` の enumeration 表を AD-027 後の条件で**再実行して**書き直す。**数字の転記だけで済ませない** — `services-not-to-io` の追加と `folder-service.ts` の `node:crypto` 除去で depcruise の modules / dependencies も変わっている。**この再実行と見出しの扱い (v1.2.3 への改定を伴うか) は Constitution 改定手続きの問題であり `architecture-reviewer` の判断を仰ぐ**
- **根拠**: SC-008 / SC-009 / SC-012 の精神 / FR-044、AD-027 §Context:33-37 / §Decision 2 / §Consequences:127-129、AD-024、reviewer-base.md:17
- **scope 根拠**: `quickstart-results.md` / `docs/discovery.md` / `.specify/memory/constitution.md` はいずれも本 PR の touched file

### [High] SC-008 が「全数検出」と宣言する US-4 AC-2 の「ネイティブモジュール」半分に違反サンプルが依然 0 件 (H-004 / Round 1 から継続) (scope: feature)

- **観察 (Round 1 から変化した点)**: FIXTURES は 21 件になり、AD-027 §Decision 5 は「**列挙しないと『ルールはあるが発火を確かめていない』状態になり、C-001 と同じ病になる**」と明記した。つまり **「規則があるのに発火を確かめていない」は本 feature 自身が病名を与えた状態である**。それにもかかわらず `.dependency-cruiser.js:188` の `agents-not-to-native` (および `eslint.config.mjs:336-343` の boundaries 規則) は**対象サンプルが 0 件のまま**であり、US-4 AC-2 の「`electron` **やネイティブモジュール**に推移的に依存する → 止まる」の後半が、SC-008 の「AC-1〜AC-11 が名指す経路すべて…未検出を許容しない」に対して**検出も未検出も記録されていない第 3 の状態**に留まる。
- **同種事象探索**: `grep -rn "native|ネイティブ|better-sqlite3|node-pty|keytar" tests/rule-fixtures/` → **0 件**。FIXTURES 21 件を AC-1〜AC-11 に再照合した結果、**未被覆は AC-2 のネイティブ半分の 1 件のみ**。`grep -rn "" src/agents/` → **`.gitkeep` 1 ファイルのみ**。
- **リスク/影響**: `src/agents/` が実質空であるため**現時点の実害は無い** (Critical にしない理由)。問題は主張の側である — SC-008 は「該当する AC を 3 つだけ列挙する形にしない」という**拘束を自分から追加した SC** であり、そこで名指した AC-2 の半分が空のまま「全数検出」と記録される。Principle VII は NON-NEGOTIABLE で、その発火確認手段はここしかない。
- **推奨アクション (Round 1 の推奨を訂正する)**: **Round 1 で私が書いた「`@anthropic-ai/claude-agent-sdk-win32-x64` を推移的に掴む fixture を書ける」は誤りである。** `NATIVE_MODULES` は `.dependency-cruiser.js:71` / `eslint.config.mjs:62` で **`better-sqlite3` / `node-pty` / `keytar` の 3 名**に限定されており、Agent SDK の win32 パッケージは対象外なので**規則は発火しない**。正しい手順は次のいずれか:
  1. `tests/rule-fixtures/a-direct/agents-native-transitive.ts.fixture` を足し `import 'better-sqlite3'` 等を経由させる。**3 パッケージは未導入なので `couldNotResolve` として解決される** — `npmRe` は素の module 名にも一致するため `agents-not-to-native` は発火するが、**同時に `not-to-unresolvable` と `no-non-package-json` も発火する**。`expected.mjs` の `rules` には 3 つとも書く
  2. 発火が `unresolvable` 経由であることを避けたいなら、**規則を「未導入でも先に置く」方針の妥当性ごと再検討し、`detectors: ['none']` + `UNDETECTED_NOTES` + `nextFeature`** で SC-017 の追跡対象に移す。**この場合は SC-008 の文言と衝突するため SC-008 の改訂が必須である**
  - **(1) を推奨する。** (2) は SC の書き換えを伴い、AD-027 §5 が示した「検証可能に保つほうを採る」判断と逆を向く。
- **根拠**: SC-008 / SC-017 / US-4 AC-2 / FR-035 / FR-041、Constitution Principle VII、AD-027 §Decision 5 / §Alternatives、AD-025 §9
- **Round 間の扱い**: Round 1 と同じ **High**。格上げしない

### [High] SC-003 の「手動実行した AD-015 §8 の判定結果と一致する」が一度も照合されていない (H-001 / 変化なし) (scope: feature)

Round 1 の記述を維持する。本 round で再確認した事実は `quickstart-results.md:86-89` の未実施リストに「2 (AD-015 §8 の手動判定との突き合わせ)」が残っていること、V-1 が「一部」のままであること。**実ホスト照合を行うテストは 0 件。** 推奨アクションも変わらない (`manual-checklist.md` 1-2 の実施、または SC-003 を「Vitest フィクスチャとの一致」に下げて実ホスト照合を R-2 に割り当てる spec 改訂。**どちらかを選ぶ**)。

### [High] SC-011 の「UI 上でそのまま表示される」に証拠が 0 件 (H-002 / 変化なし) (scope: feature)

Round 1 の記述を維持。本 round で再確認: `ResolutionScreen.test.tsx:71` の `displayName` は `'x'`、renderer テストで利用者由来の非 ASCII を描く箇所は **0 件**、`quickstart-results.md:118` は未登録のままと記録。**renderer 単体テスト 1 ケースで閉じる**という推奨も変わらない。Constitution Principle VIII の日本語検証が R-2 の E2E に繰り延べられている以上、**R-1 で日本語表示を守るのは SC-011 だけ**である。

### [High] SC-014 に証拠が 1 件も無い (H-003 / 変化なし) (scope: feature)

Round 1 の記述を維持。本 round で再確認: `requestSingleInstanceLock` の出現は `src/main/index.ts:28` の **1 件のみ**、テストファイル内は **0 件**、`quickstart-results.md:123` の 2-9 は未実施。**SC-014 は自動テストにも実機記録にも存在しない唯一の SC である。**

### [High] US-2 の UI 側 AC 14 本のうち自動テストが 3 本しか無い (H-006 / 修正コストが下がった) (scope: feature)

Round 1 の記述を維持。**本 round の追加事実**: AD-027 §Decision 4 で `folder-service` が `deps.newId: () => string` を受ける形になり、`folder-service.test.ts:125` が `testid00000001` 形式で識別子を固定できるようになった。したがって Round 1 推奨の 5 ケースのうち **AS-5 (重複 → 既存エントリが選択状態)** は、service 層でも決定的に書ける。**現状その経路のテストは 0 件** (重複判定自体は `registry.test.ts:75-101` の domain 5 ケースで押さえられている)。**修正が安くなった分、放置の理由は弱くなった。**

### [High] FR-009 / US-5 AS-5 の「導入手順文書への導線」が実装に存在せず、繰り延べ先が spec のどこにも無い (H-007 / 変化なし) (scope: feature)

Round 1 の記述を維持。本 round で再確認: `openDependencyDoc` はコードベースに **0 件**。preload capability に文書・URL・パスを開くメソッドは無い。`spec.md:583` の D-1 項目は依然「署名つきインストーラの配布、自動更新、第三者依存の NOTICE」のみで、**文書到達性への言及は 0 件**。US-5 AS-5 は「たどる → 到達する」と書かれているため、**実装上たどれない以上この AC は達成不能**である。推奨は Round 1 の (i) / (ii) / (iii) から選び、**選んだことを spec に書く**こと。

### [High] SC-002 の「1 対 1 で一致」と「列挙不能を理由つきで提示」のどちらにも証拠が無い (H-008 / 変化なし) (scope: feature)

Round 1 の記述を維持。本 round で再確認: 非空 `enumerationIssues` を描く renderer テストは **0 件**。main 側は `runtime-store.test.ts:53,130` が通すが、**画面を描く確認は無い**。`quickstart-results.md` に「1 対 1」の照合表は **0 件**。

### [Medium] SC-004 の 5 予算のうち 2 つが未計測 (M-001 / 変化なし) (scope: feature)

Round 1 の記述を維持。`quickstart-results.md:131-132` が未計測と申告。US-2 AS-4 を拘束する SC はこの 1 行だけ。計測点は実装済みで、**測っていないだけ**である。

### [Medium] SC-005 の計測経路の後半が spec 文言と証拠でずれている (M-002 / 変化なし) (scope: feature)

Round 1 の記述を維持。

### [Medium] SC-013 / SC-016 が計測経路の一部を欠いたまま「通過」相当に扱われている (M-003 / 変化なし) (scope: feature)

Round 1 の記述を維持。`quickstart-results.md:126` の「退避ファイル (`*.bak`) が 0 件」/ `:129` の `location.protocol` 未確認はいずれもそのまま。**なお本 round の SC 計測経路の欠落照合を再実行した結果、欠落ありは Round 1 と同じ 8 件。SC-008 / SC-009 は「経路は通ったが記録が偽を含む」という別の状態に移った** (→ H-102)。

### [Medium] README が R-1 を "one completed feature" と宣言し packaging を "not set up" と書いている (M-004 / 変化なし) (scope: feature)

Round 1 の記述を維持。`README.md:9-11` / `:30` の文面は同一。spec.md frontmatter は `status: reviewing` のまま。**2 行の書き換えで閉じる。**

### [Medium] `ResolutionScreen` の「このまま選べます」と選ぶ手段の不在 / FE-030 の `[x]` (M-005 / 変化なし) (scope: feature)

Round 1 の記述を維持。

### [Medium] spec.md の「本 feature で起票する ADR」が 2 本のまま (実際は 4 本)、かつ本 round の作業に対応する task が tasks.md に 1 件も無い (M-101) (scope: feature)

- **観察**: `spec.md:596-598` Dependencies「**本 feature で起票する ADR**: AD-024 / AD-025」。実際に起票されたのは **AD-024 / AD-025 / AD-026 / AD-027** の 4 本である。また `tasks.md` の US-4 / Polish 区画 (`:302` SH-020 / `:314` SH-021 / `:317` SH-022 / `:322` SH-023 / `:377` SH-048) はすべて `[x]` だが、**本文は 1 件も改訂されておらず**、SH-021 は「サンプルを一時的に検査対象へ展開」(一括展開時代の記述)、SH-023 は「改定後の条件で実測する」(AD-027 前の数値)、SH-048 は「quickstart の V-1〜V-7 を実機で通し、結果を記録する」(偽を含む記録) を指している。`grep -rn "pr-gate|Round" tasks.md` → **0 件**。
- **同種事象探索**: `grep -rn "AD-02[4-7]" specs/001-.../spec.md` → **AD-024 / AD-025 の 2 件のみ**。`grep -rn "AD-027|0027-" --glob '!node_modules/**'` → **3 件** (ADR 自身 2 行 + `touched-files.txt:32`)。**AD-027 を参照する spec / plan / tasks / charter / roadmap / README は 0 件。**
- **リスク/影響**: (a) `spec.md` は「何を満たすか」の SSoT。そこに載っていない ADR が 2 本ある状態は、H-005 と**同じ構造の 2 例目**である。(b) `tasks.md` の `[x]` は「実施した内容」を指さないと、**次 feature が「R-1 で何をやったか」を tasks から読めない**。SH-021 の `[x]` は現在の `run.mjs` ではなく破棄された設計を指している。(c) US-5 の Why は「status 記述の陳腐化を防ぐ」であり、**同じ陳腐化が spec / tasks 側で起きている**。
- **推奨アクション**: 3 行で閉じる。
  1. `spec.md:596-598` を「AD-024 / AD-025 / **AD-026** / **AD-027**」に
  2. `tasks.md` SH-021 の本文を「**1 件ずつ展開して検証する** ランナー (AD-027)」に、SH-023 / SH-048 に「AD-027 後に再実測が必要」を付す
  3. pr-gate Round 1 対応分を `tasks.md` に **SH-051** として 1 行足し `[x]` にする
- **根拠**: `spec.md:34,596-598` / `tasks.md` / US-5 Why / FR-044 の精神、AD-026 / AD-027
- **scope 根拠**: `spec.md` / `tasks.md` はいずれも本 PR の touched file

### [Medium] `test:rules` の所要時間がどこにも計測されておらず、AD-027 が用意した移行判断に閾値が無い。CI job に `timeout-minutes` も無い (M-102) (scope: feature)

- **観察**: AD-027 §Consequences:124-126 が「所要時間が伸びる。検証回数が 20 倍になる。**CI の所要時間に直接乗る**」と書き、§Alternatives:148-154 が「(JSON 化は) **所要時間が問題になった時点でこちらへ移る**」と移行条件を置いている。**しかし所要時間の実測値はどこにも記録されていない** — `quickstart-results.md` の V-4 表にも `docs/discovery.md:151-160` の実測値表にも `test:rules` の秒数は無い。したがって「問題になった時点」を判定する基準が存在しない。`.github/workflows/verify.yml:81-82` は `pnpm test:rules` を 1 ステップで回すが、**job / step に `timeout-minutes` が無い**。
- **同種事象探索**: `grep -rn "timeout-minutes" .github/` → **0 件**。`test:rules` で秒数・分数を伴う行 → **0 件**。SC-004 の 5 予算に CI / 検証時間の項は **0 件** — **SC-004 違反ではない**。
- **リスク/影響**: (a) H-101 の非決定性と組み合わさると「**原因不明で赤くなり、再実行に長時間かかる検証**」になる。US-4 の Why は開発者価値であり、フィードバック時間が延びると `[x]` 済みの US-4 の価値が目減りする。(b) `timeout-minutes` が無いため、検出器の 1 つが応答しない場合 GitHub 既定の 6 時間まで占有する。`run.mjs` は `finally` で後始末するが、**強制終了時には走らない**。つまり**タイムアウトで打ち切られた場合、違反サンプルが作業ツリーに残り SC-009 が静かに破れる**経路がある (開始時 `cleanup()` で次回は回復する)。(c) 移行判断に閾値が無いため、AD-027 の Alternatives は「いつまでも移らない」側に倒れる — SC-017 の `nextFeature` 必須化で塞いだのと同型の穴である。
- **推奨アクション**:
  1. `pnpm test:rules` の所要時間を 1 回計測し (H-101 の連続 3 回実行と兼用)、`quickstart-results.md` の V-4 表に秒数を記録する
  2. `verify.yml` の job に `timeout-minutes` を置く。**打ち切られた場合に作業ツリーが汚れる経路があることを `run.mjs` の docstring に 1 行足す**
  3. AD-027 は accepted なので ADR は書き換えず、**閾値を `expected.mjs` か `run.mjs` の docstring に降ろす**
- **根拠**: US-4 Why / SC-009 / AD-027 §Consequences:124-126 / §Alternatives:148-154、`run.mjs:307-313`、`verify.yml:78-82`
- **scope 根拠**: `verify.yml` / `run.mjs` / `quickstart-results.md` はいずれも本 PR の touched file

### [Low] AD-027 の X-1 / X-3 / I-2 への申し送りが ADR 本文にしかなく、roadmap にも charter にも無い (L-101) (scope: feature)

- **観察**: AD-027 §Consequences:131-134 が履行条件を出している。`grep -rn "services-not-to-io" --glob '*.md'` → **AD-027 の 3 行のみ**。`docs/roadmap.md` / `docs/domains/session/charter.md` / `docs/domains/isolation/charter.md` / spec の Out of Scope のいずれにも **0 件**。
- **同種事象探索**: 同種の申し送りを全数確認した結果、**転記されているもの 3 件**、**ADR 本文にしか無いもの 1 件** (本件)。
- **リスク/影響**: 実害は小さい。ただし R-1 は「`nextFeature` を必須にしないと残余が『書いてあるから許された状態』で残る」という判断を SC-017 で自ら下した feature であり、**同じ論法をこの申し送りに適用していない**のは一貫性の欠けである。
- **推奨アクション**: `docs/roadmap.md` の X-1 / X-3 / I-2 の行に「`services-not-to-io` の `from` に実名を足す (AD-027)」を 1 行ずつ足す。ADR は書き換えない。
- **根拠**: AD-027 §Consequences:131-134、SC-017 の `nextFeature` 必須化の論法、AD-025 §9

### [Low] `manual-checklist.md:328` の期待文言が実装のラベルと食い違う (L-001 / 変化なし) (scope: feature)

Round 1 の記述を維持。`今は選べない` はコードベースに **1 件 (当該行) のみ**。

### [Low] 停止中ディストロのカードに「再判定」が常設され、押しても画面上の状態が変わらない (L-002 / 変化なし) (scope: feature)

Round 1 の記述を維持。

---

## 意図的に報告しなかったもの

- **code-gate iteration 1 の MUST_FIX 7 件** — `code-gate.md:76-82` の解消判定表を読み、指摘行そのものは再指摘していない。MF-002 の残余は ux H-001 として継続中で ux の Owner 範囲
- **`run.mjs:224` の非 `#` 規則照合が全出力横断の部分一致である残余** — AD-027 §Consequences:135-138 が自ら残余として記録済み。**発火確認機構の設計は `platform-boundary-reviewer` の Owner 範囲**
- **`.specify/memory/constitution.md` の版と改定手続き** — enumeration 表の数値ずれは H-102 に含めたが、v1.2.3 として再発行すべきかは cat D で `architecture-reviewer` の判断
- **`services-not-to-io` の `from` を実名 2 件に限る設計判断 / `__rulecheck__` を選択子に列挙する副作用** — AD-027 §4 / §5 で人間判断済み。cat D / F
- **`docs/verify-report.md`** — 2026-09-12 の bootstrap 時点スナップショットで `test:rules` の記録を持たない。**訂正対象ではない**
- **cat A / B / C / F / G** — それぞれの Owner 範囲

---

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `21 件\|21/21` (specs / docs / .specify) | **2 (どちらも AD-027 内)** | docs/decisions/0027-...:130,140 |
| H-101 | `再現しなかった\|flaky\|非決定` (specs / docs) | **1** | docs/decisions/0027-...:140 |
| H-102 | `20 件\|20/20\|test:rules` (`*.md` 全体) | 34 行 — **要訂正 7 / 履歴 21 / ADR 自身 6** | quickstart-results.md:157,158 / discovery.md:147,159,160 / constitution.md:671,675 |
| H-102 | `test:rules` (docs/verify-report.md) | **0** (訂正対象外) | 該当なし |
| H-004 | `native\|ネイティブ\|better-sqlite3\|node-pty\|keytar` (tests/rule-fixtures/) | **0** | 該当なし |
| H-004 | FIXTURES 21 件 × AC-1〜AC-11 の再照合 | 未被覆 **1** (AC-2 のネイティブ半分) | expected.mjs:52-61 / .dependency-cruiser.js:188 |
| H-004 | `src/agents/` の実ファイル | **1 (`.gitkeep` のみ)** | src/agents/.gitkeep |
| H-001 | 実ホストで AD-015 §8 を照合するテスト | **0** | 該当なし |
| H-002 | renderer テストの `displayName` 値 | 1 (`'x'`) | ResolutionScreen.test.tsx:71 |
| H-003 | `requestSingleInstanceLock\|second-instance` | 2 (テスト内 **0**) | src/main/index.ts:28,35 |
| H-006 | `duplicate` (`*.test.ts*` 全体) | 6 (**domain のみ**。service / renderer は **0**) | registry.test.ts:75-101 / folder-store.test.ts:150 |
| H-007 | `openDependencyDoc` (リポジトリ全体) | 1 (**私の Round 1 推奨文のみ**。実装 0) | po-reviewer.md:152 |
| H-008 | 非空 `enumerationIssues` を描く renderer テスト | **0** | ResolutionScreen.test.tsx:83 / harness.test.tsx:26 |
| M-101 | `AD-02[4-7]` (spec.md) | 2 (AD-026 / AD-027 は **0**) | spec.md:596-598 |
| M-101 | `AD-027\|0027-` (リポジトリ全体) | 3 (ADR 自身 2 + touched-files.txt 1) | docs/decisions/0027-...:4,11 / touched-files.txt:32 |
| M-101 | `pr-gate\|Round` (tasks.md) | **0** | 該当なし |
| M-102 | `timeout-minutes` (.github/) | **0** | 該当なし |
| M-102 | `test:rules` の秒数記録 (docs / specs) | **0** | 該当なし |
| L-101 | `services-not-to-io` (`*.md`) | 3 (**すべて AD-027 内**。roadmap / charter は 0) | docs/decisions/0027-...:97,101,133 |
| L-001 | `今は選べない` | 1 (**manual-checklist.md のみ**) | manual-checklist.md:328 |

---

## Verdict

- **Critical: 0**
- **High: 10** (H-101 測定の非決定性 / H-102 SC-008・SC-009 記録の未訂正 / H-004 AC-2 ネイティブ fixture / H-001 SC-003 / H-002 SC-011 / H-003 SC-014 / H-006 US-2 AC / H-007 FR-009 導線 / H-008 SC-002 / H-005 chat spec drift)
- **Medium: 7** (M-101 spec・tasks の ADR / task 追随 / M-102 所要時間と CI timeout / M-001 SC-004 / M-002 SC-005 / M-003 SC-013・SC-016 / M-004 README / M-005 US-3 選択)
- **Low: 3** (L-101 AD-027 の申し送り / L-001 manual-checklist 文言 / L-002 停止中の再判定)
- **Round inheritance**: Round 1 から **resolved 0 / unresolved 15 / new 5** (H-101 / H-102 / M-101 / M-102 / L-101)。状況変化 2 件 (H-004 は前提が変わり推奨アクションを訂正、H-006 は修正コストが低下)

**Critical を 0 件とした根拠**: 本 round の新規 3 件はいずれも「**記録と実体の食い違い**」「**測定の再現性の欠如**」「**判断基準の不在**」であり、`reviewer-base.md` の Critical 定義に当たる観察事実は無い。**H-004 を Critical に格上げしなかった理由を明記する** — AD-027 §Decision 5 が「ルールはあるが発火を確かめていない」を C-001 と同じ病と名付けた点は追加事実だが、`src/agents/` は `.gitkeep` 1 ファイルのみで**現時点で実害のある経路が成立しない**。severity 禁則に従い High に留める。pr-gate Round 1 の Critical 2 件は、**機構としては解消している** — 1 件ずつ展開する形と `[VIOLATE] #N` 照合、`services-not-to-io` の実名定義と fixture の 3 点が揃っている。

**pr-gate の判断材料**:

1. **Round 1 の High 8 / Medium 5 / Low 2 は 1 件も手が入っていない。** うち **H-001 / H-002 / H-003 / H-008 / M-001 / M-003 は「測っていないだけ」**で、合計 30 分程度の手動実施と renderer テスト 2〜3 ケースで閉じる。**H-005 / H-007 / M-004 / M-005 は spec.md / tasks.md / README の改訂 (計 10 行程度)。**
2. **本 round の新規は「今回の修正が生んだ記録の負債」である。** H-102 (記録 3 箇所の訂正) と H-101 (連続 3 回の実行記録) は**合わせて 20 分程度**で閉じ、閉じないと **「SC-008 / SC-009 を満たした」という記録が、偽と確定した行と再現しない測定の上に立つ**。Round 1 の Critical を潰した修正が、Critical の根拠だった記録をそのまま残している状態である。
3. **H-004 の推奨は Round 1 から変わった。** `NATIVE_MODULES` は 3 パッケージ実名なので Agent SDK では発火しない。fixture 1 件 + `expected.mjs` に 3 規則を書く形が正しい。
4. **最小案として `/cl-done` の前提条件に置くべきもの**: (a) H-102 の記録訂正 3 箇所、(b) H-101 の連続実行記録、(c) `manual-checklist.md` 1-1 / 1-2 / 2-9 の実施 (SC-002 / SC-003 / SC-014 は charter KPI と NON-NEGOTIABLE Principle に直結する)、(d) spec.md 3 箇所の改訂。**いずれも実装の作り直しを要さない。**
