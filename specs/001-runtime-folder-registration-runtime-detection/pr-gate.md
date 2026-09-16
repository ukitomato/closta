# PR Gate Round 2: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Base**: `main` (HEAD の祖先。diverge なし)
**Diff stat**: +41,799 / -183 over 207 files
**Reviewers**: security, architecture (default + adr-drift), po, platform-boundary, database, a11y, ux (**7 並列**)
**Round inheritance**: Round 1 findings (Critical: 2, High: 19) を引継ぎ

## Verdict

| Severity | This round | Resolved from R1 | New in R2 | Net (dedup 後) | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | **0** | **2** | 0 | **0** | 0 |
| High | 40 (raw) | 0 | 40 | **33** | 0 |
| Medium | 54 (raw) | 0 | — | **51** | 0 |
| Low | 37 (raw) | 0 | — | **32** | 0 |

**Status**: **PASS (Critical = 0)**

**Next**: `/cl-done specs/001-runtime-folder-registration-runtime-detection`

**Round 1 の Critical 2 件はいずれも解消した。** 判定は**指摘した本人**が行っている。

| Round 1 Critical | origin | 判定 | 判定根拠 |
|---|---|---|---|
| C-001 `test:rules` の照合が構造的に常に真 | platform-boundary | **resolved** | 同 reviewer が実測で確認 — 基準状態で `[VIOLATE]` が **0 行**、`wsl-args-array` 単独展開で `[VIOLATE] #3` + `#7` が出て `#1` / `#2` は `ok` のまま (訂正が実態と一致)、`docker-named` → `#4`、`platform-*` → `#8`。**7 件 / 8 トークンの `#N` 恒真と 8 トークンの規則名相互充足はどちらも解消** |
| C-002 `services ✗→ I/O` 規則の不在 | architecture | **resolved** | 同 reviewer が 4 点を確認 — 規則が `.dependency-cruiser.js:214-247` に存在 / `folder-service.ts` の `node:crypto` が `deps.newId` 注入に置換 / fixture で発火を実測 / 履行記録が AD-027 に残り **AD-025 の in-place 改変が無い**。platform-boundary も独立に発火を実測 (`error services-not-to-io: ... → crypto`) |

**PASS は「指摘が無い」ことを意味しない。** Round 1 の 60 件は **1 件も解消しておらず**、新規 33 件が加わった。
下記「convergence の予兆」を必ず読むこと。

### track 別の内訳

| Reviewer | Critical | High | Medium | Low | Round 1 からの継承 |
|---|---|---|---|---|---|
| security | 0 | 2 | 5 | 5 | resolved 0 / unresolved 10 / new 2 |
| architecture | **0 (C-002 解消)** | 8 | 11 | 5 | resolved 1 / unresolved 13 / new 11 |
| po | 0 | 10 | 7 | 3 | resolved 0 / unresolved 15 / new 5 |
| platform-boundary | **0 (C-001 解消)** | 7 | 6 | 9 | resolved 1 / unresolved 12 / new 10 |
| database | 0 | 4 | 8 | 4 | resolved 0 / unresolved 12 / new 4 |
| a11y | 0 | 5 | 11 | 6 | resolved 0 / unresolved 17 / new 5 |
| ux | 0 | 4 | 6 | 5 | resolved 0 / unresolved 12 / new 3 |
| **合計 (raw)** | **0** | **40** | **54** | **37** | resolved **2** / unresolved **91** / new **40** |

---

## convergence の予兆 (Phase 2 は N>=4 のみ発火だが、記録する)

`convergence: { resolved_from_prev: 2, new_in_round: 33, unresolved: 58 }`

**R2 は `resolved (2) < new (33)` である。** skill の定義では

```
convergence_failure := (R[N].resolved < R[N].new) AND (R[N-1].resolved < R[N-1].new)
```

で、最小発火は **Round 4** である。R2 単独では halt しない。
ただし **R3 でも同じ比率が続けば R4 で halt する**。R2 で新規が 33 件出た主因は次の 2 つで、
どちらも「Critical を潰した修正が新しい観察面を開いた」形である。

1. **Round 1 で未起動だった `a11y` / `ux` を本 round で起動した** — 2 track で新規 8 件 (逸脱の解消による増分)
2. **Critical 2 件の修正そのものが新しい指摘を生んだ** — 下記「本 round の修正が生んだ指摘」8 件

**したがって R3 は「新規を増やさず既存を減らす」round にする必要がある。**
Round 1 の 60 件のうち **「測っていないだけ」が 6 件、文書 1〜3 行で閉じるものが 20 件以上**ある
(各 reviewer の最小修正セットを参照)。

---

## Critical (Round 2)

**0 件。**

全 7 track が独立に Critical 0 と判定した。cascade_enforce による降格は **0 件**
(降格候補となる Critical がそもそも無い)。severity 格上げも **0 件** — 全 reviewer が
「前 Round で High だったものを Critical にしていない」ことを明記している。

Critical としなかった判断が特に注目に値するもの 3 件:

- **ux H-001** (`useFolders` の reject 受け皿 0 件) — 「操作を完了できない = サービス停止か」を実装で検証し、
  **`aria-busy` は `disabled` を付けないため主要操作が完了できる / `閉じる` が常時押せる / データを壊さない**
  の 3 点で Critical を否定。`reviewer-base.md` の「defensive coding 提案は High 上限」に従った
- **po H-004** (SC-008 の AC-2 ネイティブ半分に fixture 0 件) — AD-027 が「ルールはあるが発火を確かめていない」に
  病名を与えた点は追加事実だが、**`src/agents/` が `.gitkeep` 1 ファイルのみ**で実害経路が成立しない
- **a11y N-003** (`bad_pattern_grep` が実測 2 件で `existing_violations: 0` が偽) — metadata の誤りだが
  **AD-024 #18 と Constitution v1.2.2 は同期しており ADR drift ではない**

---

## 本 round の修正が生んだ指摘 (8 件) — **最も重要な節**

Critical 2 件の修正 (`ca6f2ce` / `cfec16b` / AD-027) が、**それ自身で新しい指摘を 8 件生んだ**。
複数の reviewer が独立に同じ面を指摘しており、**dedup 後も 5 件が残る**。

| # | 指摘 | severity | origin (独立に指摘した track) |
|---|---|---|---|
| 1 | **`newId` の契約が用途の強い側 (トークンの予測不能性) を要求していない** — `folder-service.ts:86-97` の docstring は「8 文字以上の英数字」のみ。フォルダ識別子 (予測可能でよい) とブラウズトークン (秘密) を 1 ポートに畳んでおり、`makeFolderId` の最低限の検査すら**トークン経路には掛かっていない**。`services-not-to-io` が `node:crypto` を恒久的に禁じたため担保をサービス内に戻す道も閉じた | High | **architecture H-204 + security M-005 + database M-008 + platform L-009 (4 track)** |
| 2 | **FR-035 が要求する「ESLint と dependency-cruiser の両方」に対し `services-not-to-io` は depcruise 片側のみ** — 規則自身が「**直接**依存」と宣言しており、FR-035 が ESLint 側に割り当てた区分である。表現手段 (per-file `no-restricted-imports` override) は既に 4 箇所で使われている。**FR-035 は MUST** | High | architecture H-201 |
| 3 | **`from` の production 枝 (実名 2 件) が一度も発火経路として通されていない** — fixture は `__rulecheck__` 枝だけを通る。11 規則のうち「fixture 枝 ≠ production 枝」はこの 1 件のみ。`folder-service.ts` を分割・改名すると**第 1 枝が黙って死ぬ**のに `test:rules` は 21/21 を報告し続ける | High | architecture H-202 |
| 4 | **AD-027 が AD-025 §9 の結論と Open Question を置き換えたのに逆方向リンクが 1 本も無い** — `supersedes: []` のまま / AD-025 §9 の見出しは今も「R-1 に対象が無い」/ Open Question は `- [ ]`。**AD-027 への参照は repo 全体で `touched-files.txt` の 1 件のみ**。AD-025 だけを読んだ後続者は覆された結論を accepted として受け取る | High | architecture H-203 |
| 5 | **`#1` の期待削除で `check.mjs` 項目 1 が無検証になった** — 訂正自体は正しいが、`#1` はこの 1 件しか期待していなかった。Principle VI の 11 項目中**確認あり 5 / pending 1 / 確認なし 5**。項目 2 / 5 / 6 は許可リスト方式のため**原理的にサンプルが届かない** (AD-027 §5 が `services-not-to-io` について自覚した構図を、これらには適用していない) | High | platform H-005 |
| 6 | **`#N` 照合が「基準状態でその項目が `VIOLATE` でない」ことに暗黙依存し、`run.mjs` はその前提を確立しない** — 基準に実違反が 1 件入った瞬間、その項目を期待する全サンプル (`#8` は 3 件) が恒真に戻る。**C-001 の再発経路** | High | platform H-006 |
| 7 | **SC-008 / SC-009 の唯一の証拠が、原因未特定の非決定性を 1 度示した測定である** — 「21 件一致」の記録は AD-027 の Consequences 1 行のみで、`quickstart-results.md` / `discovery.md` / `constitution.md` のいずれにも無い。`detectors: ['none']` の 2 件だけは**フレークが緑に倒れる** (hits が空 = 期待そのもの) | High | **po H-101 + architecture M-204 + platform M-007 / L-008** |
| 8 | **「20/20 一致」を SC 達成根拠として引用している記録が 3 ファイル / 7 行に未訂正で残り、うち 1 行は偽と確定** — `quickstart-results.md:158` / `discovery.md:147,159,160` / `constitution.md:671,675`。gate / reviewer の履歴 21 行は**訂正しない** (ある時点の観察記録) | High | **po H-102 + platform L-005** |

**1 と 7 / 8 の性質が違う点を明記する。** 1 は「修正がセキュリティ資産の担保を構造から契約文面へ降格させた」もので、
現状の結線は正しい CSPRNG なので実害 0。7 / 8 は「Critical を潰した修正が、Critical の根拠だった記録をそのまま残した」もので、
**`/cl-done` 後に「SC-008 / SC-009 を満たした」という記録が偽の行と再現しない測定の上に立つ**。

---

## High (Round 2) — dedup 後 33 件

### 重複統合 (Phase 6 / multi-reviewer dedup)

| 統合後 | 元の指摘 | 統合の根拠 |
|---|---|---|
| **H-A** `newId` 契約の強度 | architecture H-204 + security M-005 + database M-008 + platform L-009 | 同一の注入点に対する 4 track の独立指摘。architecture は ADR 決定として、security は CWE-330/340 として、database は `id` 一意性として、platform は境界契約の記述として。**最高 severity (High) に統合** |
| **H-B** FR-010 single-flight 不在 | security H-002 + platform H-001 | Round 1 と同じ統合 |
| **H-C** Principle VI 検証スコープに CI 定義が無い | architecture H-003(継承) + platform H-004(継承) | Round 1 と同じ統合 |
| **H-D** Principle VIII の `existing_violations: 0` | architecture H-001(継承) + a11y N-003 | a11y が**具体的な反例 2 件**を実測して追加事実を提供。severity は据え置き (High) |
| **H-E** chat 画面の spec drift | po H-005 + architecture H-002(継承) | Round 1 と同じ統合 |
| **H-F** test:rules の非決定性 | po H-101 + architecture M-204 (+ platform M-007 / L-008 は別facet として維持) | 「SC-008 の唯一の証拠が非決定性を示した」が本体 |
| **H-G** 「20 件」記録の未訂正 | po H-102 + platform L-005 | 同一事実 |
| **M-merged** AD-027 の申し送りが追跡機構の外 | architecture M-201 + po L-101 | 同一事実 (Medium に統合) |
| **M-merged** CI `timeout-minutes` 不在 | po M-102 + architecture L-201 | po 側が所要時間の未計測を含めて広い |
| **L-merged** `.bak` の単調増加 | platform L-004(継承) + database L-002 | 同一事実 |

### High 一覧 (33 件)

**本 round の修正が生んだもの (5)**: H-A `newId` 契約 / architecture H-201 FR-035 片側 / H-202 production 枝未発火 / H-203 AD-027 逆リンク / platform H-005 項目 1 無検証 / H-006 基準状態依存 / H-F 非決定性 / H-G 記録未訂正 — *上表のとおり dedup 後 8 → 一部 Medium 吸収で実質 8*

**Round 1 から未解消 (25)**:

| ID | 指摘 | origin |
|---|---|---|
| H-B | FR-010 の single-flight 不在 | security + platform |
| H-C | Principle VI 検証スコープに CI 定義が無い | architecture + platform |
| H-D | Principle VIII の `existing_violations: 0` (実測 2 件で偽) | architecture + a11y |
| H-E | chat 画面の spec drift (FR-033 / Assumptions / SH-007) | po + architecture |
| — | `shell.openExternal` に scheme 許可リストが無い | security H-001 |
| — | 判定結果の書き戻しが消えた/停止したディストロを復活させる | platform H-002 |
| — | 停止観測後も `verifiedCache` が無効化されない | platform H-003 |
| — | `NamespaceId` の内部構造に触れる実装が 2 件 | platform M-002(High) |
| — | AD-024 `:251` の 1 行訂正 + 項目数の不統一 | architecture H-004 |
| — | SC-003 / SC-011 / SC-014 / SC-002 に証拠 0 件 (4 件) | po H-001/002/003/008 |
| — | SC-008 の AC-2 ネイティブ半分に fixture 0 件 | po H-004 |
| — | US-2 の UI 側 AC 14 本中 自動テスト 3 本 | po H-006 |
| — | FR-009 / US-5 AS-5 の導線が実装に無い | po H-007 |
| — | `useFolders` の reject 受け皿 0 件 (**3 round 連続**) | ux H-001 |
| — | error boundary / `unhandledrejection` 0 件 | ux H-002 |
| — | 英語の chat UI が主見出し | ux H-003 |
| — | empty / loading / error が 2 画面で潰れ**正常系で毎回偽の文言** | ux H-004 (新規) |
| — | フォーカスリング約 1.5:1 | a11y H-001 |
| — | ブラウズ移動時のフォーカス喪失 | a11y H-002 |
| — | `--font-mono` に CJK フォールバックが無い | a11y N-001 (新規) |
| — | Principle VIII の Manual 検証が実体として空 | a11y N-002 (新規) |
| — | 同時 save がファイルを壊す / `skipped: 1` 誤報 / Principle V の Automated 検証不在 / `newId` の `id` 一意性 | database H-001/002/003/004 |

---

## 特に注意すべき 3 件 (severity 以外の理由で)

### 1. ux H-001 は **3 round 連続で未解消**

code-gate iteration 1 で MUST_FIX (MF-002)、iteration 2 で High、pr-gate Round 1 で High、Round 2 でも High。
修正は `useFolders.ts` の 5 経路に `try/catch` + `labels.ts` に 1 行で、**実装の作り変えを伴わない**。
ux reviewer は「gate は 3 iteration 連続で同一指摘が SHOULD_FIX のまま残っている事実を記録すべき」と述べている。**記録した。**

### 2. ux が自らの Round 1 推奨を**技術的に誤っていた**と訂正した

Round 1 の H-002 推奨「`App.tsx` を error boundary で包む」は **`ChatScreen.tsx:53` の `throw` を捕まえない** —
React の error boundary は render / lifecycle / constructor の例外のみを捕まえ、**イベントハンドラ内の例外は捕まえない**。
`ChatScreen.test.tsx:43` が `expect(() => fireEvent.keyDown(...)).not.toThrow()` と同期的に観測している形が
その証拠である。**解消条件は「error boundary を置いた」ではなく `unhandledrejection` / `error` リスナを置いたこと。**
この訂正なしに Round 1 の推奨を実装すると「対処した」記録だけが残って白画面は残る。

### 3. po が自らの Round 1 推奨を**事実誤認**として訂正した

Round 1 H-004 の「`@anthropic-ai/claude-agent-sdk-win32-x64` を推移的に掴む fixture を書ける」は**誤り**。
`NATIVE_MODULES` は `better-sqlite3` / `node-pty` / `keytar` の **3 名実名**に限定されており Agent SDK は対象外。
正しい手順は `import 'better-sqlite3'` 等を経由させ、`expected.mjs` に
`agents-not-to-native` / `not-to-unresolvable` / `no-non-package-json` の**3 規則を書く**形である。

---

## Phase 6: code-gate finding との重複 suppress

**`suppressed_by_code_gate` は 0 件である。**

7 reviewer すべてが `.gate-verdict-code.json` と `code-gate.md` を読み、code-gate iteration 1 の
MUST_FIX 7 件で resolved になった `path:line` を再指摘しなかった。

境界事例 2 件はいずれも **origin が異なる**ため suppress せず新規計上した (skill Phase 6 の規定どおり)。

- security H-001 (`window.ts:47-50` / `:64`) — MF-004 (CSP 宣言箇所の移設) と同一ファイルだが、
  指摘は `openExternal` の scheme 検証欠落
- ux H-001 / H-002 — MF-002 由来だが「解消済みと判定された箇所」ではなく
  **推奨アクションの未実施部分と cascade 漏れ**

## viewpoint coverage

| cat | 内容 | 結果 |
|---|---|---|
| A | 認可 / 認証 / RLS / secret | Critical:0 High:1 Medium:2 Low:1 (security) |
| B | 入力検証 / injection / XSS / 暗号 | Critical:0 High:1 Medium:3 Low:4 (security) |
| C | 業務不変条件 / Charter drift | Critical:0 High:3 Medium:3 Low:1 (platform + architecture) |
| D | Constitution / ADR drift | Critical:0 High:6 Medium:4 Low:2 (architecture + platform + database + a11y) |
| E | User Story / SC / AC / UX | Critical:0 High:11 Medium:10 Low:7 (po + ux) |
| F | 命名 / module / lint hookup | Critical:0 High:2 Medium:3 Low:7 (platform。命名は code-gate の convention 専任) |
| G | DB / 永続化 / a11y / perf | Critical:0 High:6 Medium:15 Low:8 (database + a11y) |
| H | テスト / coverage / observability | Critical:0 High:6 Medium:8 Low:2 (po + database + a11y + architecture) |

**欠落カテゴリなし。** 全 7 track が A-H を全件記入した。

## Round 1 の逸脱を解消した

Round 1 では `a11y-reviewer` / `ux-reviewer` を「UI 無変更」を根拠に非起動とし、逸脱として記録した。
**本 round で両者を起動した。** 両 reviewer は前提 (直近 3 コミットが `src/renderer/` を触っていない) を
**独立に検証して正しいと確認**したうえで、前回 findings の再掲を避けて pr-gate scope の新規に注力した
(a11y は前回 17 findings の `path:line` を HEAD で全件突き合わせて 17/17 一致を確認、
ux は前回参照した 6 + 4 箇所の行番号一致を確認)。

結果として **a11y が新規 High 3 件 / ux が新規 High 1 件**を出した。
とくに **ux H-004 (empty / loading / error が 2 画面で潰れ、正常系で毎回偽の文言が出る)** は
前回見落とされていたもので、**異常系の H-001〜H-003 より発生頻度が高い**。
Round 1 の逸脱判断 (「UI が変わっていないから省略してよい」) は**結果的に誤りだった**。

## 次のアクション

**`/cl-done` に進める (Critical = 0)。** ただし各 reviewer が `/cl-done` の前提条件として挙げたものがある。

**po / a11y が「記録せずに通すことに反対する」と明示した 2 件**:

1. **po**: H-102 の記録訂正 3 箇所 + H-101 の連続 3 回実行記録 (合わせて 20 分程度)。
   閉じないと「SC-008 / SC-009 を満たした」という記録が**偽と確定した行と再現しない測定の上に立つ**
2. **a11y**: Principle VIII について**観察証拠 0 件**のまま進むなら、その事実を `pr-gate.md` に
   逸脱として記録すること — **記録した** (下記)

### 逸脱として記録: Principle VIII の観察証拠が 0 件である

Constitution Principle VIII (NON-NEGOTIABLE) の Statement は 3 節ある —
(i) IME 変換確定時の誤送信 / (ii) フォント崩れ / (iii) 全角混在時のレイアウト崩れ。

- **(i)** は `ChatScreen.test.tsx` の 1 assertion (`toBeDisabled()`) が覆う。
  ただし a11y の指摘どおり**表示名欄が R-1 で唯一の生きた IME 入力面**であり、そこは覆っていない
  (暗黙送信の経路が無いことは実測で確認済み)
- **(ii) (iii)** は Automated (B) が延期、Manual が打ち切りで**検証 0 件**。
  `manual-checklist.md` にキーボード / スクリーンリーダ / IME の項目が **0 件**、
  日本語表示の目視 2 項目は `quickstart-results.md:33,118` が未実施と記録
- 加えて **Manual に名指しされた 2 者は source reviewer** であり、
  フォント崩れとレイアウト崩れは**原理的に観察できない** — (ii)(iii) については履行不能な割り当てである
- a11y N-001 (`--font-mono` に CJK フォールバックが無い) が**まさにその死角で生じた実コードの欠陥**である

**この状態で `/cl-done` に進むなら、Principle VIII は「守られている」ではなく「確かめていない」と読むこと。**

### R3 に向けた優先順 (各 reviewer の最小修正セットの統合)

1. **a11y N-001** — `main.css:46` の 1 行。Principle VIII の ✗ Bad 例に該当し SC-011 の表示経路そのもの
2. **ux H-004** — `ResolutionScreen` に loading / failed の 2 段 (既存部品のみ、~15 行)。**正常系で毎回出る偽の文言**
3. **ux H-001** — `useFolders` の 5 経路に `try/catch` (**3 round 連続**)
4. **architecture H-203** — AD-027 `supersedes` + AD-025 Open Question を `- [x]` + References 1 行 (**4 箇所すべて 1 行以下**)
5. **po H-102 / H-101** — 記録訂正 3 箇所 + 連続 3 回実行の記録
6. **platform H-005 / H-006** — 項目 1 の fixture 1 件 + 基準状態の assert
7. **architecture H-201** — `eslint.config.mjs` に override 1 ブロック (FR-035 の MUST)
8. **H-A** — `newId` の docstring 2 行、または `newToken` への分離 3 行
9. **a11y H-001 / H-002**、**database H-001** (直列化。ux H-001 / platform H-001 と同じ根)

**構造変更を伴うのは FR-010 の single-flight (H-B) と database H-001 の直列化のみ**で、
これは 1 つの機構で **3 面 (H-B / database H-001 / register の lost update)** に効く。
残りはいずれも数行〜数十行の文書・設定・テスト修正である。
