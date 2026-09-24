# Code Gate: 所在をまたぐセッション列挙 (R-2)

**Spec**: [spec.md](spec.md) | **Verdict JSON**: `.gate-verdict-code.json`
**Run**: 2026-09-23
**Diff 範囲**: `3f60a41..HEAD` (8 コミット / 102 ファイル)
**Scope**: 84 ファイル (`.code-gate-scope.txt`)

**status**: **PASS** (Critical 0 / High 0)。MUST_FIX 6 件 + SHOULD_FIX 14 件をすべて対処。
**reviewer の再実行は未実施** — 実機確認をもって PASS とする人間判断による（下記）

---

## Tracks

| Track | 起動 | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- |
| `lint-agent` | ✓ | 0 | 0 | 0 | 0 |
| `test-agent` | ✓ | 0 | 3 | 3 | 2 |
| `convention-reviewer` | ✓ | 0 | 2 | 9 | 7 |
| `a11y-reviewer` | ✓ | **1** | 8 | 6 | 3 |
| `ux-reviewer` | ✓ | 0 | 7 | 8 | 4 |
| **合計** | | **1** | **20** | **26** | **16** |

**起動しなかった reviewer** (overlap 排除原則):
`security` / `architecture` / `po` / `platform-boundary` は pr-gate 専任。
`database-reviewer` は scope に migration / `.sql` が 0 件のため skip。

---

## Phase 0/1 で見つかった gate 自身の欠陥

**指摘の前に、この gate の入口が壊れていた。** 3 件はいずれも「検査が 0 件になっていることに
気付けない」形であり、`plan.md` が SH-091 について書いた
「違反が 0 件なのではなく**検査が 0 件**になる形」と同型である。

| ID | 内容 | 対処 |
| --- | --- | --- |
| **OD-001** | skill の Phase 3 が全 track の並列起動を指示するが、`npm run test:rules` は違反サンプルを `src/**/__rulecheck__/` へ**一時展開**する。並列に走った depcruise が展開物を拾い**誤って exit 1** になった (汚染時 161 modules / 639 deps、clean 160 / 638。差はちょうど fixture 1 件とその依存 1 件)。`run.mjs` のロックは同種の実行同士の排他しか持たず、外部の検出器を守らない | SKILL.md Phase 3 に「lint track と test track は直列」を明記 |
| **OD-002** | 負荷下で jsdom project の worker 起動が失敗し **4 ファイルが 0 件実行**になった。exit code は 1 だが **JSON reporter は `success: true` / `numFailedTests: 0`** を返す。JSON だけを読む自動判定はこれを緑として通す | SKILL.md に「判定は exit code を正とする」を明記 |
| **OD-003** | `touched-files.txt` の改行が **CRLF 31 行 + LF 54 行の混在**。Phase 1 の `comm -12` が CR 付きの 31 行を黙って落とし、**scope が 84 ではなく 54** になっていた | scope 計算に正規化を入れ、落ちた行を報告する形に変更。`touched-files.txt` を LF に統一 |

**さらに diff 範囲も誤りやすい形だった。** base ブランチ
`001-runtime-folder-registration-runtime-detection` が R-1 のマージ**前**のコミットを
指しているため、`git diff base...HEAD` は R-1 の squash を丸ごと含み **276 ファイル /
58,524 行**になる。R-2 の実体は `3f60a41..HEAD` の 102 ファイルである。
この点も SKILL.md に記録した。

---

## MUST_FIX (1 件) — 対処済み

### MF-001 [Critical] `ErrorState` の本文が light 既定で 2.91:1 (a11y C-001)

- **Where**: `src/renderer/src/components/assistant-ui/elements/error-state.tsx:78`
- **検証**: orchestrator が独立に検算した。`text-red-600` を alpha 0.6 で
  `bg-red-500/[0.06]` over white に合成すると相対輝度 **0.281** / 背景 **0.914** →
  **2.91:1**。WCAG AA は通常サイズ本文に 4.5:1 を要求し、`text-[13px]` は large text の
  例外に当たらない。見出し (`:77`) と再試行ボタン (`:85`) も **4.38:1** で届かない
- **なぜ Critical か**: 不足しているのは**復帰手段を書いている唯一の行**である。
  R-2 が `SessionListScreen.tsx:438` で 4 つ目の呼び出し元を新設しており、
  この分岐は IPC そのものが通らなかった場合の最後の出口である。
  色以外の手がかりが無いため回避手段がない
- **対処**: alpha を外し、**既存パレットの段を選び直した** (Principle XIII。
  独自トークンを足していない)。`red-700` / `dark:red-300`、`retrying` は `foreground/70`
- **確認**: light **2.91 → 5.89:1**、dark **3.07 → 9.71:1**、見出し **4.38 → 5.89:1**。
  4 呼び出し元すべてが同一部品経由なので 1 ファイルで cascade 全件が閉じた

---

## MUST_FIX へ昇格した High (人間判断 2026-09-23)

**skill の severity 翻訳は High を SHOULD_FIX とする。** それに従うと
**コントラスト 1 件だけ直せば gate は PASS する**。しかし orchestrator が実地に確認した
以下は機能欠陥であり、抱えたまま `reviewing` へ進めるべきものではない。
人間の判断で MUST_FIX へ昇格した。

### MF-002 [High→MUST] 所在で絞り込むと登録フォルダのセッションが全滅する (ux H-005)

- **Where**: `SessionListScreen.tsx` の `matchesLocation()`
- **検証**: `folder` / `unknown` グループは `location` を持たないため一律 `false` を返していた
  (`SessionGroupDTO` の `folder` variant は `folderId` / `boundary` / `sessions` のみ)。
  **この feature の中心価値は所在をまたぐ一覧**であり、その絞り込みが主役のデータを隠して
  「絞り込みに一致するセッションがありません。」と表示していた。FR-040 の意味が反転していた
- **さらにテストが不具合を制度化していた。** FR-032 #5 (絞り込み結果 0 件) のテストが
  「folder グループ (所在を持たない) は外れて 0 件になる」というコメントつきで、
  **この挙動を空状態の再現手段として使っていた**
- **対処**: **セッション単位**の絞り込みに変えた。`EnumerationOutcomeDTO.targetKey` →
  所在の索引を作り、`SessionSummaryDTO.targetKey` で行ごとに引く。
  区画を落とすのは中身が 0 件になったときだけ (見出しだけ残すと誤読させる)。
  `SessionSection` に `sessions` を持たせ、判別可能な合併型の中身を差し替えずに済む形にした
  (`rowKeys` と同じ順序・同じ長さという不変条件を doc に明記)
- **テスト**: 「所在で絞っても登録フォルダのセッションが残る」を追加。
  既存の FR-032 #5 テストは**理由が変わった**ので、コメントを実態に合わせた
  (Ubuntu 側が 0 件だから 0 件になる、という正しい理由で通る)

### MF-003 [High→MUST] 空状態 2 条件が実装上ほぼ到達不能 (ux H-003)

- **検証**: 画面レベルの `EmptyState` は `visible.length === 0` を条件にしていたが、
  `group.ts` は **`folder` グループを登録フォルダから必ず seed する** (FR-051)。
  登録フォルダが 1 件でもあれば区画は必ず 1 件以上になり、
  「セッション 0 件」と「全所在が未列挙」の 2 分岐は**実機で到達不能**だった。
  復旧の導線が一度も出なかった。**実機検証でもこの条件は踏まれていない**
  (SH-089 V-8 の「全所在が未列挙」は `wsl --shutdown` が要るため未実施)
- **緑のテストが到達不能な fixture に依存していた**: `index([])` (グループ 0) と
  登録フォルダ 1 件の組み合わせは `groupSessions()` が production では作らない
- **対処**: 判定を**索引の性質**に変えた。`allUnlisted` と「総件数 0」を
  `visible.length` と独立に評価し、区画一覧の**上**に説明バナーとして出す
  (区画は FR-051 のため残す)。絞り込み中と取得中は出さない
- **同梱 (ux M-003)**: `allUnlisted` の案内文が理由に関わらず「ディストロを起動して」
  だった。`permission-denied` などは起動しても直らず、所在ごとの行では理由別ヒントが
  出るため**同一画面に矛盾した指示が並んでいた**。理由の集合から文面を組む形にした
- **テスト**: 「登録フォルダの区画があっても未列挙の案内が出る」を、
  production が実際に作る形 (履歴 0 件の folder グループ + 全所在 failed) で追加

### MF-004 [High→MUST] 件数が `complete` 未確認で確定値として出る (ux H-002)

- **検証**: 区画見出しと所在行の件数が無条件に描かれていた。ヘッダだけが保護されていた。
  `data-model.md` §7 は「`partial` の間はグループ件数を確定値として見せない。
  『このフォルダのセッションは 3 件』と見せると誤りになる」と、この見せ方を明示的に禁じている。
  所在ごとに段階公開するため、**この窓は毎回の初回取得で必ず通る**
- **記録の不備も判明した**: `quickstart-results.md` SH-089 V-6 の
  「先頭ページ表示中にグループ件数を確定値として見せていない | 成立」という判定は、
  根拠が DTO 側の `complete: false` であり、**UI が確定値を描いている事実は確認していなかった**
- **対処**: `countText(count, complete)` を 1 箇所に置き、未確定時は
  「N 件以上 (取得中)」にした。`complete` を `Section` / `Outcomes` に渡す
- **テスト**: 「取得中は区画の件数を確定値として見せない」を追加

### MF-005 [High→MUST] `transport.ts` が未検証 (test track)

- **検証**: `transport.ts` の import は `./protocol` **だけ**で、`electron` は入っていない
  (`parentPort` は `process` から構造だけで取り出している)。
  つまり **Vitest の node 環境でそのまま読める** — 設定変更は要らない
- **orchestrator 自身の記述の誤りでもある**: AD-030 と `enumerator-spawner.ts` の
  コメントに「この形は単体テストの外にある」と書いたが、それが当てはまるのは
  `enumerator-spawner.ts` (`electron` と仮想モジュールを import する) だけである。
  **31 秒事故の原因そのもの (経路の選択と「受け取った経路で返す」) が、
  テストできる状態で未検証のまま放置されていた**
- **対処**: `stdioTransport` / `parentPortTransport` / `ParentPortLike` を export し
  (export した理由を doc に明記)、`src/agents/transport.test.ts` を **17 件**追加
- **発火を確認した** (AD-027 と同じ考え方): `parentPort` 経路の `write` を
  標準出力へ戻すと **3 件が落ち**、復元すると 17 件通る

### MF-006 [High→MUST] `disabled` が押下でフォーカスを奪う (a11y H-007)

- **検証**: 4 箇所が `disabled={loading}` を持っていた。キーボードで Enter した瞬間に
  **押している要素自身が disabled になってフォーカスが body に落ち**、取得後も戻らない。
  実測で先頭ページに 1.2〜2.0 秒かかるため、その間フォーカスも feedback も無い
- **同じ PR 内の方針と矛盾していた**: `WorkspaceFoldersScreen.tsx` が
  「**`disabled` にしない。** `disabled` は要素をタブ順から外すので、
  キーボード利用者はボタンに一度も到達せず、押せないことにも理由にも気付けない」と
  明文化している
- **対処**: `busyProps()` / `busyGuard()` を置き、4 箇所を `aria-disabled` +
  onClick 先頭のガードに変えた。`disabled=` は **0 件**になった
- **同梱 (ux M-004)**: 再検出ボタンに busy ラベル (「再検出しています…」) を与えた
  (他 2 画面の慣習に揃えた)
- **テスト**: 「取得中のボタンを `disabled` にせず `aria-disabled` で示す」を追加

---

## 修正後の機械検査 (すべて直列で実行)

| 検出器 | 結果 |
| --- | --- |
| `npm run lint` | **0 件** |
| `npm run typecheck` (node + web) | **0 件** |
| `npm run depcruise` | **違反 0 件** (163 modules / 649 dependencies) |
| `node scripts/constitution/check.mjs` | ok 14 / 違反 0 / **検査対象なし 1** (項目 15 の対象は 3 → **8** に拡張) |
| `npm run build` | 成功。列挙プロセスの単独起動も成立 (require は SDK 1 件 / electron 参照 0 / exit 0) |
| `npm test` | **31 ファイル / 597 件すべて通過** (当初 543 → +54) |
| `npm run test:rules` | **期待表と一致 26 件** |

**「検査対象なし 1」は合格ではない** — ツール自身がそう出力する。
項目 5 (docker のイメージ構築サブコマンド) は R-2 が docker を導入しないため
検査対象が存在しない。**設計どおりであり本 gate の blocker ではないが、
「15/15 ok」ではなく「14 ok + 1 未検証」として扱う。**

---

## SHOULD_FIX 14 件 — 人間判断により**すべて対処した** (2026-09-23)

当初は pr-gate へ送る方針だったが、**pr-gate に進む前に直す**という判断になった。
以下は対処内容である。

| ID | 対処 |
| --- | --- |
| **a11y H-001** | 鮮度の 1 行を `role="status" aria-live="polite"` で包み、一覧の器に `aria-busy` を付けた。**行ごとには付けない** — 700 件規模で読み上げが実用にならないため、通知はこの 1 行に集約する。`ThreadListSkeleton` の `role="status"` を行ごとから最外殻 1 箇所へ移し、**空だった通知内容**に `sr-only` の文字を入れ、骨組み行を `aria-hidden` にした |
| **a11y H-002** | 開閉ボタンに `aria-expanded` / `aria-controls` を付けた。**`hidden` で行を DOM に残す形は採らなかった** — 1 区画に数百件入りうる (実測 278 件) ため描画費用を払い続ける。`aria-controls` の相手は常に存在させ、中身だけを条件で描く (a11y reviewer も行数が多い場合はこれで 4.1.2 を満たすと明記している) |
| **a11y H-003** | `FilterChip` を作り、選択を **3 通り**で示した (`aria-pressed` / 太字 / `sr-only` の「（選択中）」)。2 つの群を `role="group"` + `aria-label` で包み、裸の `<span>絞り込み</span>` と区切りの `/` を `aria-hidden` にした |
| **a11y H-004** | 区画見出しを `<h3>` にし `<section aria-labelledby>` で名前を与えた。`ThreadListItemsByKey` に `role="list"`、行に `role="listitem"` を付けた。`WorkspaceFoldersScreen` の `<h2>` を `<h1>` に上げ (a11y M-005 同梱)、画面ごとの起点を揃えた |
| **a11y H-005 / ux H-001** | `ThreadListItemsByKey` に `renderMeta` を足し、**付帯情報を行の内側**に描くようにした。別ブロックの `<ul>` は削除。**context で渡している** — `ItemByIndex` は props を通さず、行ごとに component を作ると毎回の描画で再マウントして**フォーカスが飛ぶ**。行は自分の鍵を `s.threadListItem.id` から引ける。あわせて `aria-current` をフォーカス対象の Trigger 側へ移した (a11y M-001 同梱) |
| **a11y H-006** | `SeededDraft` が種を受け取ったときに表示名入力へ `focus()` するようにした。登録ボタンに `aria-describedby` で「押すと登録画面へ移動します」を添えた |
| **a11y H-008** | light の `--ring` を **2.62:1 → 4.83:1** にした (既存の `--muted-foreground` と同じ段。独自トークンを足していない)。dark は 4.12:1 で既に足りているため触らない。**トークンだけでは足りない** (alpha 0.5 を掛けると 1.94:1 に落ちる) ので `ring-ring/50` / `ring-foreground/20` の alpha を **8 箇所**で外した。行は `ring-1` → `ring-2`、**選択とフォーカスを同じ `bg-muted` で表す形をやめた** |
| **ux H-004** | `SectionEmpty` を作り 3 分岐にした — 取得中 / 所在が `failed` (理由 + 解消手順) / 履歴なし (導線つき。ux M-001 同梱)。区画に対応する所在は `outcomeForSection()` が決め、**決められないときは `null` を返して断言しない** |
| **ux H-006** | production が実際に作る形 (履歴 0 件の folder グループ + 全所在 failed) のテストを追加した。既存の `index([])` fixture は**残してある** — MF-003 で判定が索引の性質に変わったため、その fixture でも到達可能な経路を通るようになった |
| **ux H-007** | 打ち切られた対象に「続きを取る」を置き、`fetchMore(targetKey, count)` を繋いだ。テストで IPC の引数まで固定した |
| **convention H-001** | `WSL_FREE_DIRECTORIES` に R-2 の app レイヤ **5 ファイルを実名で**追加した (`composition-root.ts` は R-1 の正当な結線なので除外し、理由をコメントに残した)。**実名列挙なので fixture を置けない**ため、実ファイルに文字列を注入して**発火を確認**し (2 項目が VIOLATE)、継続的な担保として `tests/docs/wsl-free-coverage.test.ts` で対象の集合を固定した |
| **convention H-002** | 指示代名詞をやめ、`EnumerationTarget.location` と `CwdOrigin` を**実名で**書き分けた。正本が data-model の表であることも明記した |
| **test High (spawner)** | `EnumerationWorker.onLine` の doc に「**2 経路の両方を購読する義務**」と、それがテストの外にある理由を書いた。`tests/docs/spawner-channels.test.ts` (6 件) でソースのテキストを突き合わせて固定。**購読を外すと落ちることを確認済み** |
| **test High (enumerate-sessions)** | 論理を `src/agents/enumerate.ts` に分け、`listSessions` と `setConfigDir` を注入で受ける形にした。入口は SDK の import・env の綴り・`main()` だけを持つ。`enumerate.test.ts` を **17 件**追加し、6 つの不変条件を固定。**差集合の算術を壊すと落ちることを確認済み**。単独起動 (require は SDK 1 件 / electron 参照 0 / exit 0) も壊れていない |

Medium 26 件 / Low 16 件は各 reviewer のファイルに残した
(`a11y-reviewer.md` / `ux-reviewer.md` / `convention-reviewer.md`)。
うち a11y M-001 / M-003 / M-004 / M-005 と ux M-001 / M-003 / M-004 は
上記の修正に**同梱**した (同じ箇所を触るため、矛盾した状態を残さないため)。

---

## reviewer の再実行について — **未実施** (人間判断 2026-09-23)

**skill の Phase 5 TAIL は修正後の reviewer 再起動を求めているが、実施していない。**

5 track の 1 巡に約 45 分の実時間がかかる。機械検査 6 種はすべて直列で再実行して緑であり、
追加したテスト 54 件のうち 4 系統は**壊れた不変条件で発火することまで確認した**。
そのうえで「reviewer の再起動は省き、実機確認をもって PASS とする」という判断になった。

### 実機確認 (2026-09-23 / `dev15.log`)

| 計測点 | 実測 | 予算 | 判定 |
| --- | --- | --- | --- |
| `list-sessions-first-rows` | **1,274 ms** | 2,000 ms | ok |
| `list-sessions-all-location` (3 所在) | 100 / **8,245** / 0 ms | 10,000 ms | すべて ok |
| ログ中のエラー | **0 件** | — | — |

`first-rows` (1,274 ms) が `list-sessions-verify` (1,380 ms) より先に出ており、
「ホスト先出し」も保たれている。

### 残る限界 (記録して残す)

**計測ログは main 側の健全性しか示さない。**
以前 assistant-ui の不具合を踏んだときは、**main は動いて画面だけが空**になった。
行の描画が正しいことの根拠は、**操作者が画面を開いて問題を報告しなかったこと**である。

**reviewer の目で見た新規の指摘は確認していない。**
MF-002 / MF-003 と a11y H-001〜H-008 は `SessionListScreen.tsx` と
`thread-list.aui.tsx` の構造を変えている。
a11y / ux の観点で新しい指摘が出る可能性は残る — **pr-gate の
`a11y-reviewer` / `ux-reviewer` (system scope) がこの diff を見る**ので、
そこが実質的な再確認になる。

---

## Verdict

**`PASS`** — `status` を `implementing → reviewing` へ遷移させる。

| 項目 | 値 |
| --- | --- |
| iteration | 1 |
| MUST_FIX (当初) | 1 → **0** (MF-001) |
| MUST_FIX (昇格) | 5 → **0** (MF-002〜006) |
| SHOULD_FIX | 14 → **0** (すべて対処) |
| Critical / High (残) | **0 / 0** |
| Medium / Low (残) | 26 / 16 (各 reviewer ファイルに記録) |
| cascade demotions | 0 |
| reviewer 再実行 | **未実施** (上記の限界つき) |
