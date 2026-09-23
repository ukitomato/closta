# PR Gate Round 1: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-23
**Base**: `main` (`origin/HEAD` が指す `001-...` は R-1 の feature ブランチでマージ前を指しており、
使うと diff が 276 ファイルに膨らむ。R-1 の squash `3f60a41` を含むのは `main` で、`main...HEAD` = R-2 そのもの)
**Diff stat**: 120 files, +20,012 -65
**Reviewers**: `security` / `architecture` / `po` (feature scope) + `platform-boundary` / `a11y` / `ux` (system scope)
**Round inheritance**: 該当なし (Round 1)

---

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | **2 (dedup 後 1 クラスタ)** | — | 2 | **2** | 0 |
| High | 29 | — | 29 | 29 | 0 |
| Medium | 36 | — | 36 | 36 | 0 |
| Low | 21 | — | 21 | 21 | 0 |

**Status**: **`FIX_REQUIRED`**
**Next**: コード修正 + `/cl-pr-gate` 再実行 (Round 2)。`--defer-remaining` は撤廃済 (pure hard gate)。

### Track 別

| Track | scope | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| `security-reviewer` | feature | **1** | 3 | 3 | 3 |
| `architecture-reviewer` | feature | 0 | 4 | 5 | 3 |
| `po-reviewer` | feature | 0 | 6 | 6 | 3 |
| `platform-boundary-reviewer` | system | **1** | 7 | 5 | 2 |
| `a11y-reviewer` (Round 2) | system | 0 | 5 | 9 | 5 |
| `ux-reviewer` (Round 2) | system | 0 | 4 | 8 | 5 |

**起動しなかった reviewer**: `lint-agent` / `test-agent` / `convention-reviewer` は code-gate 専任
(overlap 排除原則)。`database-reviewer` / `openapi-contract-reviewer` は該当ファイル 0 件。
`api-performance-reviewer` は registry に不在。

**code-gate verdict との重複**: `suppressed_by_code_gate` は **0 件**。
3 reviewer が `.gate-verdict-code.json` の `must_fix_findings[].where` を除外リストとして
明示的に使ったと宣言しており、同一箇所を同一観点で再指摘したものは無い。

---

## Critical (Round 1)

### C-001 — 作業ディレクトリ由来の値が未検査のまま境界を越える [origin: security / architecture / platform-boundary]

**3 つの reviewer が独立に同じ場所へ到達した。** security は正規化の欠落を、
architecture は正規化 + UNC 露出を、platform-boundary は UNC 露出を Critical として挙げた。
dedup 後は 1 クラスタである。

- **Where**:
  - `src/domain/session/cwd-origin.ts:73` / `:100` — `display: raw`
  - `src/domain/session/build.ts:38-42` — 正規化は 5 項目のみ
  - `src/domain/session/normalize.ts:27` — `PATH_DISPLAY_MAX_BYTES` (参照 0 件)
  - `src/domain/validation.ts:32` — `hasControlCharacter` が双方向制御文字を通す
  - `src/main/app/dto-mapper.ts:78,79,145` — 無加工で DTO へ

- **Issue**: 「config ディレクトリの内容は未信頼入力である」という FR-049 / contracts 節 C の拘束が、
  会話由来の文字列 5 項目には配線され、**パスに関わる 3 項目
  (`cwd.value` / `cwdDisplay` / `targetLabel`) には配線されていない**。
  そのために用意された `PATH_DISPLAY_MAX_BYTES` は**参照 0 件で死んでいる**。
  さらに双方向制御文字を落とすフィルタ (`normalize.ts` の `isRemovable`) と、
  登録・永続化の入口で使われるフィルタ (`hasControlCharacter`) が別系統で、
  **弱い側がパスに当たっている**。
  加えて `parseWslUncPath` が失敗した UNC 文字列が `display: raw` として境界を越える。

- **Why critical**:
  `normalize.ts:33-36` が**この攻撃そのもの**を除去の理由として書いている —
  「`cwdDisplay` に `U+202E` を仕込むと、『未登録フォルダ』の行が登録済みフォルダのパスに見える形に偽装でき、
  **FR-026 の登録導線で利用者に誤った判断をさせられる**」。
  本 feature は `[USER]` 判断として **1 ディストロ内の全ユーザの `~/.claude` を読む**ので、
  「アプリ外のプロセスが書いた値」は**ホスト利用者以外が書ける値**を含む。
  その値が (1) 双方向制御文字つきで一覧に描かれ、(2) 利用者が判断して押す登録導線に現れ、
  (3) 登録すると `folder-store` の JSON へ**永続化される**。
  `[USER]` が全ユーザ集約を受け入れた際の代償「FR-036 によりディスクに残らないから実害は表示に留まる」が、
  この 1 経路で崩れている。長さ上限も無いため 5000 件 × 無制限長が 1 行の JSON として境界を通る。

- **orchestrator による検証**: **すべて確認済み**。
  `PATH_DISPLAY_MAX_BYTES` は定義 1 件・参照 0 件。`build.ts` は 5 項目のみ。
  `cwd-origin.ts:73,100` は `display: raw`。`isRemovable` は U+202E を落とし
  `hasControlCharacter` は落とさない。

- **Suggested fix**:
  1. `classifyCwd()` の入口で生の `cwd` を `normalizeText(raw, PATH_DISPLAY_MAX_BYTES)` に通し、
     **その結果から出自判定する**
  2. 除去・切り詰めの印を `CwdOrigin` に持たせ `foldMarks` に合流させる
  3. `target-finder.ts` の `label` にも正規化を掛ける
  4. **`domain/validation.ts` に双方向制御文字の述語を足し、`hasControlCharacter` を呼ぶ 4 箇所を移す** —
     移さないと塞いだ隣に同じ穴が残る
  5. 「UNC 接頭辞に一致するが解析できなかった値」に専用の分岐を設け、`display` に生値を載せない
  6. `dto-schema.test.ts:85` の assert を**手書き DTO ではなく `classifyCwd()` を通した値**に対して行う

- **Status in this round**: new

---

## High (Round 1) — 29 件

### 本 Round で対処する (人間判断 2026-09-23: 「Critical + 機能欠陥 + orchestrator の回帰」)

| ID | origin | Where | Issue |
|---|---|---|---|
| **security H-001** | security | `cwd-origin.ts:100` | `parseWslUncPath` 失敗時の UNC 文字列が `cwdDisplay` として境界を越える。FR-042 唯一の抜け道 |
| **security H-003** | security | `target-finder.ts:218` / `session-service.ts:526` | **`targetKey` の序数払い出しが 2 通り**。候補の一部が権限拒否だと**失敗行の key が別ユーザの対象と一致**する。`/root` の Access denied は実測済で、実機で最も起きやすい配置 |
| **architecture H-001 / H-002** | architecture | 同上 (C-001 と同クラスタ) | 正規化の未配線 / UNC 露出とそれを見る検査が実装を通らない |
| **platform H-001** | platform-boundary | `cwd-origin.ts:91-97` | **フォワードスラッシュ綴りの UNC** (`//wsl.localhost/-bad/...`) が解析失敗後に「POSIX 形式」として扱われ、**由来 config のディストロを継承して誤帰属**する |
| **platform H-002** | platform-boundary | `build.ts` / `dto-mapper.ts` | C-001 と同クラスタ (5 フィールドが無検査) |
| **platform H-003** | platform-boundary | `session-enumerator.ts:218-226` | **`handleExit` がワーカ同一性を見ない**。遅れて届く旧ワーカの `exit` が現行ワーカの参照を捨て、実行中の要求を巻き添えで失敗させ、`dispose()` でも殺せない孤児を残す (contracts C-5 違反) |
| **platform H-004** | platform-boundary | `session-enumerator.ts:272-280` | **timeout が crash に数えられる**。3 回でアプリ寿命のあいだ列挙が恒久停止。`ENUMERATION_TIMEOUT_MS` は SC-008 の全件予算と同値で、予算ちょうどの所在は必ず落ちる |
| **po H-001** | po | `group.ts:99,182-186` / `dto-mapper.ts:109` | **越境がセッション単位で判定されフォルダ単位に OR で畳まれる**。1 件でも越境があると全行が越境と読める |
| **ux H-201** | ux | `SessionListScreen.tsx:738-745` | 一部の所在が failed でも「セッションがまだありません」と断言する (前回 H-004 が索引レイヤで再発) |
| **ux H-202** | ux | `SessionListScreen.tsx:721-745` | `all-unlisted` だけ `complete` ガードが無く、**段階描画の途中で「どの所在も列挙できていません」が出る** |
| **ux H-203** | ux | `SessionListScreen.tsx:544-550` | 0 件区画の失敗理由を **`outcomes[0]`** で決めるため、別の所在の解消手順を出す |
| **ux H-204** | ux | `session-service.ts:710-717` | 「続きを取る」を 1 回押すと `truncated` が false に書き戻されて**導線が消え、件数が確定表記になる** |
| **a11y H-201** | a11y | `SessionListScreen.tsx:426` | **orchestrator の回帰**。`aria-disabled` 化の代償に付けた `opacity-50` が busy ラベルを **3.74:1** に落とし、`disabled` をやめた目的を打ち消している |
| **a11y H-202** | a11y | `thread-list.aui.tsx:197` | 行の選択が **1.04:1** のまま、しかも `hover` と同色。前回 H-008 の cascade 未完 |
| **a11y H-203** | a11y | `WorkspaceFoldersScreen.tsx:434` | **orchestrator の cascade 未完**。前回「ここも揃えよ」と明記された `disabled=` が 1 箇所残存 |
| **a11y H-204** | a11y | `button.tsx:13` | **orchestrator の cascade 漏れ**。`ring-destructive/20` (約 1.1:1) が base の `ring-ring` を上書きし、**undo の無い登録解除ボタンだけ**改善が届かない |
| **a11y H-205** | a11y | `error-state.tsx:59-83` | **MF-006 と同型の欠陥**。`key="retrying"` / `key="error"` の差し替えで**押した再取得ボタンごと消え**、フォーカスが body に落ちる。最も後戻りできない出口 |

### Round 2 へ送る (文書 / 検査体制)

| ID | origin | 内容 |
|---|---|---|
| security H-002 / architecture H-003 / platform H-007 | 3 track が収束 | **環境変数許可リストの正本**が contract 指定の `allowlists.mjs` に無く、ADR ゲートも検査項目も無い。SC-016 のテストは**同じ定数どうしの比較 (同義反復)** |
| platform H-005 | platform-boundary | `refreshSessions` に束ねもクールダウンも無く、**UNC 探索 I/O を無制限に発行できる**。AD-030 が上限の役割を与えた「待ち行列長の上限」も未実装 |
| platform H-006 | platform-boundary | **検証項目 14 が動的 `import()` / `require()` / サブパス import を素通り**させる (正規表現を再現して実測)。contracts C-4 はこの検査が FR-044 の実効性を単独で担うと明言している |
| architecture H-004 | architecture | `status: accepted` の ADR を in-place 修正した 3 件が AD-028 §2 自身の immutability 宣言と矛盾 (先例 2 件あり、規則側を実践に合わせる明文化を推奨) |
| po H-002 | po | SC-008 の「700 件で 10 秒」が**未達見込みのまま Out of Scope にも roadmap にも行き先が無い** |
| po H-003 | po | 先頭 50 件の合格が「**ホストに 50 件以上あること**」に依存。固定費のばらつき (約 200 ms) が余裕 (21〜159 ms) を上回る |
| po H-004 | po | SC-013 の「セッション 0 件」が**両方の計測経路をすり抜けている** (テスト 0 件 / 実機未実施) |
| po H-005 | po | US-1 / US-2 / US-3 の **AC 実機証跡が改修前 (2026-09-18)** のもので再実施されていない |
| po H-006 | po | charter KPI を緩めた代償の「**E2E 基盤の持ち主 feature**」が台帳に無い (SH-086 の受け入れ項目 4 が未履行) |

---

## Medium / Low (Round 1) — 36 / 21 件

各 reviewer の判断を尊重し、本 Round では対処しない。要点のみ記す。

| Track | 主な Medium | 主な Low |
|---|---|---|
| security | `cwdKey` が NUL を含んで境界を越える / 停止中の経路が `checkLaunchAllowed` に到達しない (コメントと実装の食い違い) / 暖機だけの起動経路が SC-004・SC-014 の実測に含まれない | `undetected-distro` の `cwdDisplay` が契約と食い違う / stderr の出力経路が無い / 非 WSL UNC が display に乗る |
| architecture | contracts / `interfaces.ts` に AD-030 前の記述が残る / **Constitution の版表記が自己矛盾** (frontmatter 1.2.3 / 末尾 1.2.2) / 項目 15 の守り手が名前接頭辞に依存 / 要求の束ねが scope を見ない / `thread-list-sidebar` 逸脱の ADR 記録が未履行 | `platform-ok:` 注記 3 件が無効 / glossary に「未検出の所在」が無い / spawner の見出しコメントが訂正前のまま |
| po | FR-026 / FR-052 に SC が無い / SC-012 の quickstart が存在しない / 越境ラベルが R-1 と R-2 で食い違う / V-6 の判定が取り消されたまま / 停止中の解消手順が一文のみ | 表記の併存 / glossary frontmatter / folder 単位空状態の導線定義 |
| platform-boundary | `platform-ok:` 注記 3 件 / renderer が所在を**表示ラベル**で同定 (`Windows` で名前空間が潰れる) / 項目 15 の守り手が接頭辞依存 / `process.parentPort` の封じ込めがテキスト照合 1 ファイル分 / `isSameDistro` が種別を捨てる | depcruise に `ui-not-to-agents` が無い / `?modulePath` の除外で `app → agents` のエッジが消えた |
| a11y | 再取得の通知が無い / 絞り込み中も総件数を出す / 行の名前に 10 項目が入る / region ランドマークが区画数ぶん増える / **forced-colors で ring が消える** / `truncate` の全文到達 / skeleton の reduced-motion / `SourceLabel` の接頭語 / テストが `aria-current` と内容変化を守らない | `h3` 内 `div` / `aria-current` の二重 / 裸の数値 / skip link / 700 行すべてが Tab 停止点 |
| ux | 同じ理由・ヒント・ボタンが 3 層に並ぶ / `EmptyState` をバナーに流用 / 件数の判定軸が per-target には誤る / 行高が可変 / 絞り込み中の件数が 3 通り / 「続きを取る」の置き場所 / 「0 件以上 (取得中)」 / 新設分岐の半分がテスト無し | アンカー無しの参照 / `renderMeta` の線形探索 / busy ラベルの共有 / 最後の受け皿に操作が無い / チップに境界が無い |

---

## 再レビュー 2 track の継承 (code-gate iteration 1 → pr-gate Round 1)

| Track | resolved | partially resolved | unresolved | new |
|---|---|---|---|---|
| a11y | **11** (C-001 / H-001〜H-006 / M-001 / M-005 / L-001 と H-007 の 4/5) | 6 | 2 | 9 |
| ux | **4** (H-001 / H-003 / H-005 / M-003) | 5 | 9 | 17 |

**前回の指摘は概ね効いている。** a11y は「Critical 1 件と High 8 件のうち 7 件が完全に解消」と報告し、
`renderMeta` を context で渡した判断・`aria-controls` の相手を空にする形・`--ring` の変更の他画面への影響の
3 点を**「問題なし」と明示的に確認**した (ライブラリの `memo` 実装まで遡って検証している)。
ux も「前回の High 7 件は実装として届いている」と確認した。

**残っているのは 2 種類である** — cascade の未完と、**修正が持ち込んだ新しい経路**。
後者のうち a11y H-201 / H-204 / H-205 と a11y H-203 は orchestrator の作業に起因する。

---

## gate 実行上の記録

- **base の選定**: `origin/HEAD` が指す `001-...` は R-1 の feature ブランチであり、
  HEAD の祖先でもない (merge-base は `1198a95d`)。`main` を base とした。
- **未コミットの扱い**: pr-gate は `base...HEAD` を見るため、code-gate の修正 31 件を
  Phase 3 の前にコミットした (`455f12b`)。でなければ reviewer が修正前のコードを読む。
- **並列実行**: reviewer 6 件は並列で起動した。code-gate の OD-001 (lint track と test track の並列で
  検出器が誤発火する) は**検出器を実行する track が無いため該当しない** —
  全 reviewer に `npm run test:rules` / `depcruise` / `lint` を実行しないよう明示した。
- **read-only の制約**: reviewer は Write を持たないため、報告は hand-back で受け取り
  orchestrator が保存した。`po-reviewer.round1-pr.md` は design-gate 時のファイルと別名にしている。
