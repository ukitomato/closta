# Design Gate: セッション列挙 (R-2)

**Run**: 2026-09-17 (round 1)
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze (aborted) / po-reviewer / architecture-reviewer / security-reviewer / platform-boundary-reviewer

## Verdict

| Track | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| analyze | — | — | — | — |
| po-reviewer | 1 | 9 | 8 | 3 |
| architecture-reviewer | 3 | 4 | 6 | 0 |
| security-reviewer | 1 | 5 | 6 | 2 |
| platform-boundary-reviewer | 2 | 10 | 5 | 2 |
| **Total (raw)** | **7** | **28** | **25** | **7** |
| **Total (dedup)** | **7** | **23** | **21** | **7** |

**Status**: FIX_REQUIRED (round 1 時点) → **round 2 の結果は下記「Round 2」節を正とする**
**Next**: Critical 7 件と DTO に影響する High を修正済み。round 2 で確認した

### analyze track について

Track A (analyze) は **35 分走った時点で停止した (`status: aborted`)**。
理由は「**レビュー中に bundle が変わった**」ことである — round 1 の他 4 トラックの
Critical 修正を先に適用したため、analyze が読んでいた行番号と FR 番号が無効になった。
agent 自身も最後に同じ判断を報告している。

**analyze の観点 (FR / SC の被覆、識別子の整合) は round 2 で改めて測る。**
本 feature は FR を 48 → 51、SC を 14 → 16 に増やしており、
**番号の追加が参照側 (data-model / contracts / tasks / quickstart) に反映されているか**は
まさに analyze の担当である。空振りのまま PASS にしない。

## Critical (dedup 後: 7 件)

### C-001 — セッション 0 件の登録フォルダが一覧から消える [origin: po] — **fixed**

- **Where**: spec.md US-1 AC-9 / data-model.md §5 / tasks.md BE-015
- **Issue**: `SessionGroup` が 4 種ともセッション集合から導出される構造で、登録フォルダ一覧から
  seed する記述が無い。履歴 0 件の登録フォルダはグループを 1 件も生成せず画面から消える
- **Why critical**: R-1 で登録した直後の利用者が必ず通る経路。US-3 の Why が掲げた
  「セッションが消えたに見せない」原則が、所在単位では守られフォルダ単位では破れている
- **Fix**: FR-051 を追加 (グループの生成源は 登録フォルダ一覧 ∪ セッション由来)。
  FR-032 / SC-013 を 4 → 5 条件。data-model §5 に seed の不変条件。BE-015 の入力を 2 つに

### C-002 — `services-not-to-io` の `from` に `SessionService` を足す task が無い [origin: architecture + platform-boundary] — **fixed**

- **Where**: tasks.md Phase 7 / plan.md Related ADRs / `.dependency-cruiser.js:215-247`
- **Issue**: AD-027 Consequences と `.dependency-cruiser.js` のコメントが
  「`SessionService` を作るときは `from` に実名を足すこと」と明示しているのに、
  bundle に対応 task が 0 件。plan の Related ADRs に AD-027 自体が載っていなかった
- **Why critical**: AD-023 §5 が「God Service への唯一の歯止め」と呼ぶ規則が、
  `session` domain 最初の Service が生まれる瞬間に対象外のまま通る。
  **違反 0 件ではなく検査 0 件**であり、緑の CI と区別がつかない (AD-024 が名指した反パターン)
- **Fix**: SH-091 を追加 (実名追加 + 既存 fixture での発火確認)。
  plan の Related ADRs と spec の Dependencies に AD-027 を追加。SH-084 と同時実行に拘束

### C-003 — AD-025「UNC は `infra` の内側」への調停が最終 phase にあり、規則 1 が事実と違い、機械強制が 0 [origin: architecture + platform-boundary] — **fixed**

- **Where**: research.md R-05 / contracts/session-enumeration.md C-2 / tasks.md Dependencies
- **Issue**: 3 点。(a) 調停 ADR (SH-084) が Phase 7 にあり、反する設計の実装が 30 task 以上先行する。
  (b) 規則 1「UNC を組み立てるモジュールは `infra` の 1 箇所」は HEAD で既に成立していない
  (`wsl-fs.ts` が 1 件目、`config-dir.ts` は 2 件目。branding 自体は `domain` の `path-api.ts`)。
  (c) 代償の 4 規則に機械検証タスクが 1 件も無い
- **Why critical**: accepted ADR に反する設計が調停より先にコードになると
  「実装済みだから ADR を追認する」形になる。規則が機械強制を持たなければ
  R-3 / X-3 が破っても気付かない
- **Fix**: SH-084 を Phase 1 に前倒し (BE-023 / BE-025 の前提に)。
  規則 1 を**実名リスト方式**に書き直し (research / contracts の両方)。
  SH-093 で機械検証 2 本 + 違反サンプルを追加

### C-004 — Constitution と AD-024 が R-2 を名指す前提を満たさないのに、追随先に入っていない [origin: architecture] — **fixed**

- **Where**: plan.md 上流 SSoT の追随 / `.specify/memory/constitution.md:443,740` / AD-024 #18
- **Issue**: 「(A)(B) は R-2 の E2E 基盤に相乗りする」は Constitution の **active な本文 2 箇所**と
  AD-024 の 3 箇所にある。`[USER]` 判断で E2E を M4 後に送ったのに、
  追随先が charter 1 箇所しか計画されていない (8 件中 1 件)
- **Why critical**: Principle VIII は NON-NEGOTIABLE であり、Constitution 自身が
  「accepted ADR と同等の権威」「食い違えば Constitution を正とする」と宣言している。
  下位の charter だけ直すと、次に Principle VIII を見る X-2 の設計者が「R-2 で載ったはず」と誤読する
- **Fix**: plan の追随表に Constitution と読み替え ADR の 2 行。SH-092 (v1.2.3 PATCH) を追加。
  人間承認項目に「Constitution PATCH の採否」を追加。申し送りを 4 件 → 6 件に改め、
  **棚卸しを grep で機械化する手順**を plan に明記

### C-005 — `firstPrompt` は SDK 定義上「会話本文の逐語」であり FR-044 / SC-011 と矛盾する [origin: security] — **fixed**

- **Where**: spec.md FR-044 / SC-011 / contracts/ipc-session-list.md DTO / data-model.md §3
- **Issue**: data-model が「`summary` / `firstPrompt` は SDK が返す要約であり会話全文ではない」を
  不変条件として置くが、`sdk.d.ts` は `firstPrompt` を
  "First meaningful user prompt in the session." と定義している。**要約ではなく逐語**。
  要約が空の行では `firstPrompt` を代替表示に使う設計なので、逐語が出る経路は主経路。
  加えて長さ上限の主体が矛盾 (data-model は「切り詰めない」、SC-011 は「サイズ上限」)
- **Why critical**: FR-044 / SC-011 は AD-007 の blocking gap (会話全文は個人情報を含みうる、
  保持期限が未定義) を R-2 に持ち込まないための**唯一の露出面制御**。
  それが事実に反する前提の上に立っており、SC-011 を字義どおり実行すると必ず不合格になるか
  検査者が恣意的に合格にするかの二択になる
- **Fix**: FR-044 を「メタデータ項目に限る。ただし 3 項目は逐語を含みうる」に書き直し。
  FR-049 (正規化と長さ上限、境界のサイズ制御は main の責務) を追加。
  SC-011 を「呼び出し 0 件 + DTO のフィールド集合が許可リストと完全一致」に。
  SC-015 (正規化の境界値) を追加。data-model §3 の不変条件を SDK 定義に合わせて訂正

### C-006 — 列挙プロセスの起動が `VerifiedRunning` ゲートの外にある [origin: platform-boundary] — **fixed**

- **Where**: spec.md FR-008 / contracts/session-enumeration.md C-1
- **Issue**: FR-008 が「ディストロ内の**ファイルアクセス**」だけをゲート対象にしており、
  **列挙プロセスの起動**が外れている。プロセスの起動自体が UNC アクセスを引き起こす
- **Why critical**: 停止中の所在に対して UNC を開く子プロセスが飛び、SC-002 が成立しない。
  R-1 が SC-005 で確立した「アプリは停止中ディストロを起動しない」が R-2 で破れる
- **Fix**: FR-008 に「**および当該所在を対象とする列挙プロセスの起動**」を追加し、
  ゲートを 3 つの入口 (探索 / 起動 / 追加取得) すべてに掛けることを明記。
  contracts C-1 に入口の表を追加。BE-025b / BE-025c を追加

### C-007 — `rawCwd` が UNC 形式の文字列を IPC 境界に載せる [origin: platform-boundary + security] — **fixed**

- **Where**: contracts/ipc-session-list.md DTO / spec.md FR-042
- **Issue**: contract が「`rawCwd` は表示専用の生値」として **UNC 形式の文字列を境界に出すことを
  明文で認めていた**。FR-042 と AD-025 に反する。加えて `domain` の判定関数を `ui` から呼べる
  設計のため、`rawCwd` を渡せば名前空間つきパス値を renderer 側で再構成できた
  (SH-054 の ESLint ルールは関数の戻り値をすり抜ける)
- **Why critical**: 「表示専用だから」という例外を認めると、AD-025 の規則が文面上だけのものになる
- **Fix**: `rawCwd` を廃し `cwdDisplay` (所在を伴わない安全な表示用文字列) に。
  出自ごとに何を入れるかの表を contract に追加。FR-042 に「表示用の生値としても出さない」を明記。
  data-model §2 で**判定関数が `RuntimePath` を生成しない**形に分離し、
  UNC の解析を R-1 のパス API 側の `parseWslUncPath()` に移す (BE-010b)

## High (dedup 後: 23 件) — 対応状況

`[USER]` 判断により **DTO / contract に影響する High を本 round で修正**し、
残りは実装中に拾う。

### 修正済み (13 件)

| # | 指摘 | 対応 |
| --- | --- | --- |
| H-001 | SC-002 の計測経路が実行不能 (所在を取る IPC が無い) [po + arch + sec] | 計測経路を Vitest ベースに。`wsl -l -v` は補助へ降格 |
| H-002 | SC-004 の API 列挙が contracts より 2 件少ない [po] | 参照形 (「C-4 の 2 表の各行」) に変更 |
| H-003 | Principle VII 後半 (単独起動 / stdio) の担保が無い [arch + pb] | contracts C-1 に規則、SH-094 を追加 |
| H-004 | 本文を読む SDK API が禁止リストに無い [sec] | C-4 を 2 表に分割 (表 2 = 読み取り API 8 件)。許可 1 件方式を明記 |
| H-005 | 環境変数の許可リストが FR / SC / テストに無い [sec] | FR-050 / SC-016 / contracts C-2 の表 / BE-025・BE-025c |
| H-006 | SC-010 の「各行」が 3 行で成立しない [sec + arch] | 検証表を A/B/C の 3 節に分割し節ごとに計測経路を割当 |
| H-007 | config ディレクトリ由来の未信頼入力が表に無い [sec] | 節 C を新設。FR-049 / SC-015 / data-model §3 |
| H-008 | `targetKey` の生成規則が無い [sec + pb] | data-model §1 に `key` と不透明性の規則 |
| H-009 | `SessionSummaryDTO` に `targetKey` が無く R-3 が着手できない [po] | DTO に `targetKey` を追加。C-8 に「DTO 変更を伴わない」と明記 |
| H-010 | 同一 UUID が 2 config に現れる Edge Case が未処理 [po] | 行の同一性を `(targetKey, sessionId)` と定義 (data-model §3) |
| H-011 | `ui-path-concat` の残余を SH-055 が誤って閉じる [arch + pb] | SH-055 を 2 分割。`UNDETECTED_NOTES` に残し `nextFeature` を付け替え |
| H-012 | `PendingReason` が R-1 の `BlockedReason` と不整合 [pb] | 3 値を R-1 に揃え、`path-not-mapped` を除外した理由を明記 |
| H-013 | `onRuntimesChanged` 未処理でメモ化が解けない [pb] | メモ化に無効化キー。§4 / §7 に規則 |
| H-014 | 生 UNC からディストロ名を取る API が R-1 に無く実装不能 [pb] | BE-010b で `parseWslUncPath()` を追加 |
| H-015 | `hostTarget()` に引数が無くホーム取得経路が無い [arch + pb] | `hostTarget(hostHome)` に変更し注入を明記 |

### 未対応 — 実装中に拾う / 人間判断が要る (8 件)

| # | 指摘 | 扱い |
| --- | --- | --- |
| H-016 | **他ユーザのホームを集約する判断の露出面評価が無い** [sec] | **人間判断が要る** (下記) |
| H-017 | charter KPI の計測経路を満たせない feature が緩める [arch] | **人間承認項目に登録済み** (再開条件と持ち主 feature) |
| H-018 | 「区別可能に示される」の観測条件が無く対応 SC も無い [po] | 実装中。FE-044 の全値網羅テストで代替可能 |
| H-019 | US-2 の中核価値 (登録導線) に対応する SC が無い [po] | 実装中。FE-053 で代替可能 |
| H-020 | US-4 が P2 だが必須 SC-008 が US-4 に依存 [po] | 実装順序で吸収 (BE-070 を US-1 の後すぐに置く) |
| H-021 | SC-008 の予算が research 内部で 3 倍ぶれる | 実装中に実測し直す。700 件は外挿値である旨は記録済み |
| H-022 | 再取得で失敗した所在の前回結果が消える [po] | 実装中。`data-model` §7 の stale 表現で吸収 |
| H-023 | `agents-not-to-*` が npm 内部を辿らず SDK 導入後は何も示さない [pb] | SH-083 の受け入れ条件に含める |

## Medium / Low

21 件 / 7 件。各 reviewer の出力に全文を保持している。
実装中および code-gate で拾う。**台帳を空にしない** — `quickstart-results.md` と
code-gate の入力として引き継ぐ。

## 人間承認が要る項目 (design-gate の出口条件)

1. charter の追記 3 点 (Journey 1 / In scope / KPI の留保と再開条件)
2. 起票する ADR 2 件 (列挙の実行単位と UNC の受け渡し / 作業ディレクトリの出自判定) の採否
3. **Constitution v1.2.3 PATCH の採否** (Principle VIII の延期先から R-2 を外す)
4. **charter KPI の計測経路を E2E から緩めることの可否と、E2E 基盤の持ち主 feature**
5. **WSL ディストロ内の全ユーザのホームを列挙対象にするかどうか** (H-016)
   — 現設計は `.claude` を持つ候補**すべて**を対象にし、他ユーザの会話由来文字列を
   1 画面に集約する。権限境界は越えていない (UNC で読めるものは Windows 利用者が既に読める) が、
   **アプリが能動的に他人の会話を収集・表示する**形になる。
   ホスト側は「ホストユーザ 1 名分」と絞っており**非対称**である。
   I-1 でミラー (SQLite) が入ると他ユーザの会話がホスト側 DB に書かれる

## Track raw outputs

| Track | 出力 |
| --- | --- |
| analyze | **aborted** (bundle が途中で変わったため停止。round 2 で再実行) |
| po-reviewer | [po-reviewer.md](po-reviewer.md) |
| architecture-reviewer | [architecture-reviewer.md](architecture-reviewer.md) |
| security-reviewer | [security-reviewer.md](security-reviewer.md) |
| platform-boundary-reviewer | [platform-boundary-reviewer.md](platform-boundary-reviewer.md) |

---

# Round 2 (差分確認)

**Run**: 2026-09-17
**Tracks**: analyze / architecture-reviewer の **2 本のみ**

**round 2 を 2 本に絞ったのは人間の指示による** — 「レビューコストが高すぎる。
スピード感をもって開発を進めたい」。全面レビューをやり直さず、
**round 1 の指摘がどう閉じたかの差分確認**に限定した。
security / po / platform-boundary の観点は round 1 の指摘を反映済みであり、
実コードが出る code-gate で再度掛かる。

## Verdict

| Track | Critical | High | Medium |
| --- | --- | --- | --- |
| analyze | 3 | 7 | 8 |
| architecture-reviewer | 1 | 3 | 7 |
| **Total (dedup)** | **3** | **9** | **13** |

**Status**: **PASS** (修正後 critical=0)
**Next**: `tasking → implementing`

### 人間判断 (2026-09-17)

| 項目 | 判断 |
| --- | --- |
| WSL 全ユーザのホームを列挙対象にするか (round 1 security H-016) | **全ユーザのまま。** かわりに (a) Assumptions に露出面の評価を `[USER]` として記録、(b) **FR-052** で由来ユーザの常時表示を要求、(c) I-1 へ「他ユーザ由来はミラー対象外」を申し送り。非対称を受け入れる理由は **WSL 側は既定ユーザを特定する手段が無い**こと (R-1 が保持せず `wsl.exe` は FR-006 で禁止) |
| 残る承認 5 件 (charter 追記 / ADR 2 件 / Constitution PATCH / KPI の緩和 / UNC の 2 本のリスト) | **一括で委任。** 各 task (SH-084 / SH-086 / SH-092 / SH-093) 実行時に内容を提示して確認を取る。**ADR は accepted 後 immutable であるため、SH-084 の起票前に UNC の 2 本のリストだけは必ず提示する** |

### round 2 の Critical 3 件 (dedup 後)

いずれも **round 1 の修正が一部の成果物にしか伝播していなかった**もので、
設計判断の欠陥ではなく**機械的な伝播漏れ**である。

| # | 指摘 | 修正 | 検証 |
| --- | --- | --- | --- |
| R2-C-001 | `cwdDisplay` 化が `SessionSummaryDTO` だけに当たり、`SessionGroupDTO.unregistered` に `rawCwd` が残った。**生 UNC が最も出やすい経路** | DTO / data-model §5 / BE-018 / SC-011 の 4 箇所を統一。出自別表を両 DTO に適用と明記 | `rawCwd` の残存は**禁止を述べる 2 行のみ** (grep 確認済み) |
| R2-C-002 | `PendingReason` が contracts = 旧 3 値 (`path-not-mapped` 込み)、data-model = 新 3 値。**IPC 境界を越える enum が SSoT 2 つで食い違う** | contracts を data-model の 3 値に揃え、除外理由を 1 行添えた | 両ファイルで一致 (grep 確認済み) |
| R2-C-003 | BE-018 が「`cwd` と `rawCwd` を分ける」と、C-007 が禁じた文言のまま。**DTO を最初に書く task** | `cwdDisplay` に書き換え、UNC 接頭辞禁止を受け入れ条件に | — |

**closure の確認方法**: round 2 の Critical はいずれも
「この名前 / この値が bundle に残っていないか」で判定できる性質であるため、
**grep による機械的確認を根拠とした** (fresh な reviewer pass は掛けていない)。
round 1 の Critical (設計の穴) とは判定の性質が違う。

### round 2 の High 9 件 — すべて修正済み

| # | 指摘 | 修正 |
| --- | --- | --- |
| R2-H-001 | **FR-049 / SC-015 / SC-011 に対応する task が 0 件** (C-005 の唯一の露出面制御が実装計画に無い) | BE-016b (正規化の純粋関数 + 境界値テスト) / BE-016c (DTO スキーマ許可リスト検査) を追加 |
| R2-H-002 | 「唯一のモジュール」が 4 箇所残存 (うち 1 つは同一ファイル内で矛盾)。Principle I の `[x]` が事実と違う根拠で付いていた | 4 箇所を実名リスト方式に統一 |
| R2-H-003 | SH-093 が materialize と branding の 2 概念を 1 本のリストに畳んでいた | **2 本のリスト**に分割し、正本を `allowlists.mjs` に指定。初期値を ADR に載せる |
| R2-H-004 | SH-092 の前提である読み替え ADR の起票 task が無い | SH-084 に (d) を追加 |
| R2-H-005 | round 1 の修正が plan / contracts で止まり tasks に伝播していない 6 件 | BE-018 / BE-020 / BE-024 / BE-025 / SH-086 に反映。SH-094 を US-1 Checkpoint へ前倒し |
| R2-H-006 | `hostTarget(hostHome)` の注入が tasks に無い | BE-021 / BE-031 に追記 |
| R2-H-007 | SH-081 が禁止側 API を実名列挙しており C-4 の「許可 1 件方式」に反する | 許可リスト方式に書き換え、API 名を task から落とした |
| R2-H-008 | quickstart V-8 が 4 条件のまま | 5 条件 + FR-051 の 3 件確認を追加 |
| R2-H-009 | **quickstart に round 1 の修正が 1 箇所も入っていない** (`wsl -l -v` が SC-002 の判定根拠のまま / 起動ゲートを踏まない / V-5 に読み取りの注記が無い) | V-4 / V-5 を修正。補助確認であることを明記し、起動 0 件の手順を追加 |

### round 2 の Medium 13 件 — すべて修正済み

Dependencies の ASCII 図と依存行 / SC 上限 (SC-014 → SC-016) / 「R-1 の SC-017」の明示 /
fixture 実パス / `SessionSummary` への `targetKey` 追加 / `parseWslUncPath` の実パス名指し /
`thread-list-sidebar` の読み替え記録 / `'wsl'` リテラル回避 / FE-048 の成果物 (表示先列) /
読み替え ADR の形式指定 / 申し送り件数 4 → 6 / 番号の並び順の明記 / runtime charter の追随 task。

### reviewer から得られた有用な確認 (指摘ではないもの)

- **`parseWslUncPath()` を `src/domain/runtime/path-api.ts` に置く判断は Principle I に抵触しない** —
  `node:path` を import するファイルは 1 件のままで増えない。
  ただし**解析自体は `node:path` を必要としないため、`path-types.ts` に置いても
  lint は発火しない**。実パスの名指しが必要 (反映済み)
- **検証項目 3 (裸の `wsl`) の発火トリガは許可リスト追加ではなく、
  `session-enumerator.ts` が `utilityProcess` と書いた瞬間**である。
  許可リストに入れても項目 3 は掛かり続ける (BE-025 に回避策を反映済み)
- **`services-not-to-io` の `to` は `dependencyTypes: ['core']`** であり、
  `utilityProcess` (= `electron`) は該当しない。`session-enumerator.ts` を
  `from` に含めるかは真に judgement call であり、先送りで足りる

## Round 2 の raw outputs

| Track | 出力 |
| --- | --- |
| analyze | [analyze.round2.md](analyze.round2.md) |
| architecture-reviewer | [architecture-reviewer.round2.md](architecture-reviewer.round2.md) |
