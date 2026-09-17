# security-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-17
**Reviewer**: security-reviewer (design-gate Track D)
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Round**: 1

## 初回読了 viewpoint

読了済: spec.md / plan.md / tasks.md / research.md / data-model.md / quickstart.md / contracts 2 件 / `.specify/memory/constitution.md` v1.2.2 / `docs/decisions/0007` `0023` `0025` 全文 / R-1 の `contracts/ipc-capability.md` `src/main/app/ipc.ts` `validate.ts` `measure.ts` `src/preload/index.ts` `src/domain/runtime/namespace.ts` `path-types.ts` `path-api.ts` / `scripts/constitution/allowlists.mjs` `check.mjs` / `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (公開 export 全数 + `SDKSessionInfo` / `ListSessionsOptions`)。

**security 観点が影響を受ける FR / SC**: FR-003 / FR-013 / FR-006 / FR-007 / FR-008 / FR-014 / FR-016〜018 / FR-027 / FR-036 / FR-041〜045、SC-002 / SC-003 / SC-004 / SC-010 / SC-011 / SC-014。

**viewpoint 集計**

- A. 認可 / 認証 / RLS / secret 管理: Critical:1 High:3 Medium:1 Low:0
- B. 入力検証 / injection / XSS / 暗号: Critical:0 High:3 Medium:4 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: Owner は `architecture-reviewer`
- D. Constitution / ADR drift: 該当なし: Owner は `architecture-reviewer` (H-004 で AD-025 に触れるが severity 判定は security 面に限定)
- E. User Story 価値 / SC 計測可能性 / UX: 該当なし: Owner は `po-reviewer`
- F. 命名 / module 配置 / lint hookup: 該当なし: Owner は `convention-reviewer`
- G. DB / API / a11y / perf: 該当なし: DB を持たない (FR-036)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

新設される攻撃面は (a) 単一 capability への IPC 3 メソッド + 通知 1、(b) 列挙対象ごとの短命 `utilityProcess` と環境変数 `CLAUDE_CONFIG_DIR`、(c) **config ディレクトリの内容 (他プロセスが書いた JSONL メタデータ) が新しい未信頼入力源として renderer まで届く経路**、(d) WSL ディストロ内の全ユーザホームを UNC で浅く列挙する探索、の 4 つ。実コードは未着手であり、以下はすべて spec / contract / data-model の**文面上の不整合と拘束の欠落**として指摘する。

良く塞がれている点も記録する — `CLAUDE_CONFIG_DIR` に renderer 由来の文字列を渡す API を作らない方針、`listSessions({ dir })` を採らず全件列挙にした判断、停止中所在への発行を「実行中確認済みの値」ゲートで塞ぐ方針、`utilityProcess` が既に `check.mjs` の `SPAWN_CALL_PATTERNS` にあり許可リスト追加が ADR 必須になる形。**「任意ファイル列挙への昇格」は FR-009 と `dir` 不使用の 2 つで塞がれており、renderer から列挙対象を指定できる経路は bundle 中に 0 件である。**

## Findings

### [Critical] 一覧 payload の `firstPrompt` は「要約」ではなく会話本文そのものであり、FR-044 / SC-011 が契約 DTO と矛盾する (C-001) (scope: feature)

- **観察**:
  - FR-044 (spec.md:344-345) は「一覧の payload に **transcript の本文を含めてはならない**。要約とメタデータに限る」
  - `SessionSummaryDTO` (contracts/ipc-session-list.md:85) は `summary` / `firstPrompt` / `customTitle` を renderer に渡す
  - data-model.md:108-109 は不変条件として「`summary` / `firstPrompt` は **SDK が返す要約であり、会話全文ではない**」と主張する
  - **この主張は SDK の型定義と食い違う。** `sdk.d.ts:5414-5417` は `firstPrompt?: string` を **"First meaningful user prompt in the session."** と定義する。要約ではなく**利用者が入力したプロンプト本文の逐語**である。`summary` (:5398-5401) も "custom title, auto-generated summary, **or first prompt**" であり、要約が無いセッションでは逐語プロンプトが入る。R-2 は要約が空の行で `firstPrompt` を代替表示に使うと定めている (FR-047 / BE-016) ため、**逐語プロンプトが表示される経路は主経路である**
  - さらに data-model.md:111 は「**表示文字列を切り詰めない。** 切り詰めは `ui` の責務」とする一方、SC-011 (spec.md:419) の計測経路は「スキーマ検証 + **1 行あたりのサイズ上限**」。**上限を掛ける主体が存在しない** — main が切り詰めれば data-model §3 違反、切り詰めなければ SC-011 の後半が測れない
  - 対象データの性質は AD-007 Consequences が「会話全文とソースコード断片であり**個人情報を含みうる**」「保持期限・削除経路が未定義」と blocking gap として明記している当のもの
- **同種事象探索**: `firstPrompt|customTitle|切り詰め|サイズ上限` in specs/002 → **8 件**。`firstPrompt` in src/ → **0 件** (未実装)。会話由来文字列を payload に載せる項目は **6 件** (`summary` / `firstPrompt` / `customTitle` / `gitBranch` / `tag` / `rawCwd`)
- **リスク/影響**: FR-044 / SC-011 は AD-007 の blocking gap を R-2 に持ち込まないための**唯一の露出面制御**である (FR-036 と対)。その制御が (a) 事実に反する前提の上に立ち、(b) SC-011 のスキーマ検証を字義どおり実行すると `firstPrompt` が検出されて**必ず不合格になるか検査者が恣意的に合格にする**かの二択になり、(c) 長さ上限の主体が矛盾で決まらないため無制限の会話由来文字列が IPC 境界と renderer メモリ、さらに R-3 以降の UI 状態に流れる。design-gate 段階で FR と contract が正面衝突しており、実装後は「SC-011 は緑」という誤った合格記録が残る
- **推奨アクション**:
  1. **FR-044 を事実に合わせて書き直す** — 「列挙 API が返すメタデータ項目に限る。うち `summary` / `firstPrompt` / `customTitle` は会話由来の逐語文字列を含みうることを明示し、それ以外の本文 (メッセージ列 / tool 出力) を取得も転送もしない」。SC-011 の計測も「`getSessionMessages` / `getSubagentMessages` の呼び出し 0 件 + DTO のフィールド集合が許可リストと一致」に変える (H-001 と併せて塞ぐ)
  2. **長さ上限の主体を 1 箇所に決める** — main 側 (`session-service.ts`) で 6 項目にバイト長上限を掛けて切り詰め、切り詰めたことを示すフラグを DTO に持たせる (R-1 の `too-many-entries` と同型)。data-model.md:111 は「表示のための省略は `ui`、境界のサイズ制御は main」に改める
  3. data-model.md:108-109 の根拠記述を sdk.d.ts の定義に合わせて訂正する。**誤った事実の上に立った不変条件は、実装者が SDK を読み直さない限り検出できない**
- **根拠**: FR-044 / SC-011 / AD-007 Consequences / Principle V の露出面の考え方 / CWE-200 / OWASP ASVS V8.3
- **scope 根拠**: feature

---

### [High] 「呼んではならない SDK API」の一覧に本文を読む公開 API が 1 つも入っていない (H-001) (scope: feature)

- **観察**: contracts C-4 の禁止 API は 7 つですべて書き込み・状態変更系。SH-081 / SC-004 も同様。`sdk.d.ts` の公開 export は関数 **17 件** + クラス **2 件**。**書き込み・状態変更を伴う公開 API の追加漏れは 0 件** (依頼の観点 8 への回答: 7 つで網羅)。しかし**列挙プロセスに置いてはならない読み取り API が 4 件**未指定 — `getSessionMessages` (:807 transcript 本文) / `getSubagentMessages` (:844) / `listSubagents` (:1057) / `getSessionInfo` (:777)。加えて `resolveSettings` (:3041) は資格情報解決設定を含む Claude Code 設定を読み、`createSdkMcpServer` (:521) / `tool` (:8998) は MCP サーバ実体を作る
- **同種事象探索**: これら識別子 in specs/002 → **2 件**のみ (research.md:273 / contracts:173。どちらも「R-3 で扱う」という将来の言及。**R-2 での禁止としては 0 件**)。`claude-agent-sdk` in src/ → **0 件**
- **リスク/影響**: C-001 と組み合わさる。FR-044 / SC-011 の実効性は payload スキーマだけで測られており、**列挙プロセスが本文を読んで `summary` に詰め直す実装を機械検証が 1 つも止められない**。SH-081 は書き込み形しか走査せず、SC-004 の前後比較は読み取りでは差分が出ない。R-3 が「同じ列挙プロセス方式に載る」以上、この禁止リストは差分の基準線になるべきだが基準線が書き込み系しか持たない
- **推奨アクション**: C-4 を 2 表に分ける。(i) 副作用禁止 7 件、(ii) **R-2 で呼んではならない読み取り API**: `getSessionMessages` / `getSubagentMessages` / `listSubagents` / `getSessionInfo` / `resolveSettings` / `createSdkMcpServer` / `tool` / `InMemorySessionStore`。SH-081 の走査対象を広げ、**許可側を 1 件 (`listSessions`) に固定する形に反転**するほうが構造的に強い (allowlists.mjs の思想と一致)。`src/agents/` 配下で SDK から import してよい識別子を allowlist 定数にし ADR 無しで広げられない形にする
- **根拠**: FR-001 / FR-003 / FR-044 / SC-004 / SC-011 / Principle IV / AD-007 / allowlists.mjs / CWE-200
- **scope 根拠**: feature

---

### [High] 列挙プロセスの環境変数最小化に FR も SC もテストも無く、`utilityProcess` の既定は親環境の継承である (H-002) (scope: feature)

- **観察**: 「親環境を継承させない」は contracts:86-88 / plan.md:121-123 / tasks.md:92 の**散文 3 箇所にしかない**。FR **0 件** (FR-014 は「書き換えない」であって「継承させない」ではない) / SC **0 件** / テスト task **0 件** / `check.mjs` の 11 項目に環境の検査 **0 件** (Principle V の `bad_pattern_grep` は SQL カラム型と `console.log(... env ...)` のみ)。Electron の `utilityProcess.fork` は `options.env` 省略時に `process.env` を継承する。**与えるべき変数の許可リストも未定義**のため、Windows で子 Node が動くのに必要な変数を調べる段で `{ ...process.env, CLAUDE_CONFIG_DIR }` に倒れる確率が高い
- **同種事象探索**: 環境継承に言及する行 **3 件**。FR / SC / test task / 検証項目はいずれも **0 件**
- **リスク/影響**: plan は Principle V のゲートを**この 1 行の散文だけで [x] にしている**。X-3 で Provider の資格情報が main の環境に入ったとき、継承したままの列挙プロセスに流れ込み、SDK は環境変数から資格情報を解決しうる。R-2 時点では実害は無いが、**「最初から経路を作らない」という plan の主張が検証されない形で残る**
- **推奨アクション**: (1) FR を 1 本 (「列挙プロセスに与える環境変数は明示した許可リストのみとし、親環境を継承してはならない」)。(2) SC を 1 本 (「`env` に許可リスト外のキーが 0 件。計測経路: 起動関数のユニットテストで `env` のキー集合を assert」— **`env` を組み立てる純粋関数を分離すれば I/O なしで測れる**)。(3) 許可リストを C-2 に実名で書き、追加に ADR を要する形にする。(4) BE-025 に対応するテスト task を追加
- **根拠**: Principle V (NON-NEGOTIABLE) / AD-011 / contracts C-2 / CWE-214
- **scope 根拠**: feature

---

### [High] SC-010 の「検証表の各行」は、表の 2〜3 行に対して構造的に成立しない (H-003) (scope: feature)

- **観察**: SC-010 は「検証表の各行について不正入力が拒否されることが示される。行を 3 つだけ列挙する形にしない」とし、計測経路を「main 側ハンドラを直接呼ぶユニットテスト」と指定する。しかし表 8 行のうち
  - `:154` **`CLAUDE_CONFIG_DIR` に渡す値** — 契約自身が「『検証』ではなく『経路の不在』で満たす」と書く。**渡すべき不正入力が存在しない**
  - `:155` **セッション識別子** — 「本 feature では受け取らない」。同上
  - `:151` **`refreshSessions` の呼び出し** — 拒否ではなく回数の性質
  つまり 8 行中 **3 行**が SC-010 の計測方法では測れない
- **同種事象探索**: 表を全数確認し測れない行 **3 件** / 測れる行 **5 件**。R-1 の同種 14 行には「経路の不在」で満たす行が **0 件**であり、**この形は R-2 で初めて現れる**
- **リスク/影響**: 「経路の不在」は本 feature で最も重要な security property (`listSessions` が任意パスのファイル一覧を返す道具に変わらないこと) であるにもかかわらず、**それを守る機械検証が 1 つも割り当てられていない**。SC-010 が「各行」と書いてあることで gate は誤った合格記録を得る。R-3 が同じ列挙プロセス方式に本文取得を載せるとき、この行が最初に破られる
- **推奨アクション**: 表を「入力の検証」と「経路の不在 (構造)」の 2 節に分け後者に別の計測経路を割り当てる。具体的には (a) `EnumerationTarget` を `infra` の factory 経由でしか作れなくし、列挙プロセスの起動関数の引数型を `EnumerationTarget` に固定する。(b) `check.mjs` に項目を足し **`CLAUDE_CONFIG_DIR` という文字列リテラルが現れてよいモジュールを許可リスト 1 件に絞る**。(c) SC-010 を「表の**検証節**の各行」に限定し、経路の不在は別 SC で測る
- **根拠**: SC-010 / FR-043 / AD-023 セキュリティ要件 5 / contracts:163-166 / AD-025 Consequences
- **scope 根拠**: feature

---

### [High] UNC 形式の生 cwd を `domain` の純粋関数で branding する設計が、`ui` からの再 branding 経路を開き SH-054 の lint 対策を迂回する (H-004) (scope: feature)

- **観察**:
  - research R-05 規則 1 は「UNC 形式を組み立てるモジュールは `infra` の 1 箇所に限る」、`:180-182` は「UNC が現れる範囲は `infra` の 1 モジュールと `agents` の 1 行に限定される」と結論する
  - ところが data-model.md:69 (判定規則 #2) は、**セッションの生 cwd が UNC 形式のとき `domain` の純粋関数が UNC → `RuntimePath` に変換する**と定める。`:78-79` は「`fromUnc()` を使う。文字列操作で剥がさない」とするが、`path-api.ts:159` の `fromUnc(target: WslUncPath)` は **branded な `WslUncPath` を引数に取る**。生文字列から作るには `<D>` を抽出して `uncNamespace(D)` を作り `makeWslUncPath()` を呼ぶしかない。**これは「UNC 形式の組み立て」そのものであり、R-05 規則 1 と AD-025 Consequences の双方に反する場所 (`src/domain/session/cwd-origin.ts`) で行われる**
  - さらに data-model.md:84 は「判定関数は `domain` に置き **`ui` からも呼べる**」と明記し contracts C-3 も補強する
  - DTO は `rawCwd` (UNC 文字列を含みうる生値) を renderer に渡す。契約は「`PathDTO` の形を与えないことで再 branding の経路を作らない」と書くが、**`ui` が同じ `domain` 関数を `rawCwd` に対して呼べば `RuntimePath` が得られる**
  - この経路は SH-054 の ESLint ルール (オブジェクトリテラル禁止) を**素通りする** — 関数の戻り値だからである。R-1 が `ui-path-concat` の残余を R-2 に割り当てた目的が、同じ feature の別の設計判断で無効化される
- **同種事象探索**: `fromUnc` in src/ → **3 件**。UNC の出現範囲を規定する記述 **4 箇所**あり、**data-model.md:69 だけが `domain` での UNC 組み立てを要求している** (矛盾 1 件)
- **リスク/影響**: (a) UNC の正規化規則が `infra` と `domain` の 2 箇所に分かれ、per-distro 名前空間の一致検証を迂回する形が生まれる。(b) renderer が `domain` 関数経由で名前空間つきパス値を合成できるため、FR-042 が「文字列としては出さないが renderer 側で復元できる」状態になる。(c) SH-054 の対策が不完全なまま「R-1 の残余を塞いだ」と記録される
- **推奨アクション**: 3 案から 1 つを選び ADR に記録する。
  1. **出自判定を 2 段に分ける** — `domain` の純粋関数は「形の分類と `<D>` の**文字列としての抽出**」まで、`RuntimePath` への変換は `infra` / `app` が `fromUnc()` で行う。`ui` は分類結果 (enum) と表示用の生値しか得ない。**推奨** (AD-025 §4 の「`ui → domain` は型と純粋関数まで」も、純粋関数が**パス値を作らない**なら矛盾しない)
  2. 判定関数を `ui` から呼べないものとして扱い depcruise で強制する
  3. UNC → `RuntimePath` 変換を `agents` 側で行い C-3 を改める (R-05 規則 2 と衝突するため規則の改定を ADR に書く)
  いずれの案でも SH-054 に「**`domain` のパス値生成関数を `src/renderer/` から呼ぶことの禁止**」を足し違反サンプルを加える
- **根拠**: research R-05 規則 1 / AD-025 Consequences / FR-042 / R-1 の「境界を越えた直後の再 branding」/ CWE-20
- **scope 根拠**: feature (**AD-025 drift としての格付けは `architecture-reviewer` の owner 範囲**。本 reviewer は再 branding 経路という security 面に限って High とした)

---

### [High] config ディレクトリ由来の未信頼入力が検証表に 1 行も無い (H-005) (scope: feature)

- **観察**: 検証表 8 行は**すべて renderer 発の入力**。R-2 が新たに取り込む**もう一つの未信頼入力源 — アプリ外の `claude` が書いた config ディレクトリの内容 —** に対する行は **0 件**。この入力は次の形で境界を越える。
  - `cwd` (生文字列) → 出自判定 → `<D>` 抽出 → 名前空間の合成 (H-004) → 登録フォルダとの接頭辞照合
  - `summary` / `firstPrompt` / `customTitle` / `gitBranch` / `tag` / `rawCwd` → **長さ無制限・文字種無制限のまま** renderer へ。spec.md:208 は「要約が空 / 極端に長い / **改行や制御文字を含む**」を edge case と認識しているが、扱いは SC-009 の「行が識別可能」だけで**正規化も上限も規定が無い**
  - 対照的に R-1 は renderer 発の値に NUL / 制御文字 / 長さ上限 / セパレータ制約を全経路に掛けている (`validate.ts`)。**方向が逆になった途端に拘束が消えている**
  - `namespace.ts:26-34` は「この値は (a) プロセス起動の引数 (b) UNC パスの成分 (c) 名前空間識別子の 3 箇所へ同時に流れ込む。『検出済みの名前に一致すること』は恒真であり文字種を何も制約しない」と、まさにこの教訓を残している。R-2 は新しい入力源を増やしたのにこの教訓を適用した記述が無い
- **同種事象探索**: `未信頼` in specs/002 → **4 件** (すべて renderer を未信頼とする文脈)。config ディレクトリ由来を未信頼として扱う記述 **0 件**。DTO に載る config 由来の文字列 **6 件** + 数値 **3 件**
- **リスク/影響**:
  1. **UI スプーフィング** — `rawCwd` / `summary` に双方向制御文字 (U+202E 等) や改行を含めると、「未登録フォルダ」グループの表示が登録済みフォルダのパスに見える形に偽装できる。FR-026 の登録導線はこの表示を見て利用者が押すため**誤ったパスを登録させる**経路になる (登録値自体は `PathDTO` なので任意パスにはならないが、判断は誤らせられる)
  2. **サイズ** — 1 セッションの JSONL が最大 25 MB で `firstPrompt` に極端に長い値が入りうる。上限が無く structured-clone の応答サイズが膨らむ (R-1 が `too-many-entries` を設けた理由と同型)
  3. **数値** — `lastModified` が未来 / 0 / 欠落しうることは認識されているが**有限な安全整数かの検証が未規定**。NaN / Infinity が並べ替えと描画に流れる
- **推奨アクション**: 検証表に「**列挙結果 (config ディレクトリ由来) の正規化**」節を足す。文字列 6 項目: バイト長上限で切り詰め、C0 / C1 制御文字と双方向制御文字をエスケープまたは除去、切り詰め・除去をフラグで示す。数値 3 項目: 有限な安全整数。満たさなければ `null` に落として「時刻不明」(行は落とさない)。`cwd` から抽出した `<D>`: `isValidDistroName()` を**抽出直後に**通す。対応テストを BE-012 / BE-027 に追加し SC-010 の対象に含める
- **根拠**: FR-043 / AD-023 セキュリティ要件 5 / R-1 の `validate.ts` / `namespace.ts:26-34` / CWE-20 / CWE-1007 / OWASP ASVS V5.1
- **scope 根拠**: feature

---

### [High] ディストロ内の全ユーザのホームを列挙し、他ユーザの会話由来文字列を 1 画面に集約する判断が、露出面として評価されていない (H-006) (scope: feature)

- **観察**: data-model §1 の探索手順と FR-011 は「ホーム配下を浅く列挙 → 各候補 + `/root` について `.claude` を確認 → **存在した候補すべてを `EnumerationTarget` にする**」「見つかったすべてを対象とし 1 つを暗黙に選んではならない」と定める。research の実測は `linuxbrew` / `yukiyamato` の 2 ユーザを列挙している。結果として、**アプリは当該ディストロの全 Linux ユーザの会話履歴 (要約・逐語プロンプト・作業ディレクトリ・git ブランチ) を読み取り 1 つの一覧に集約して表示する**。由来は `targetLabel`「表示用の短い識別 (**ユーザ名など**)」として示されるだけ。spec / plan / research のいずれにも**この集約が持つ露出面の評価、利用者への開示、対象ユーザを絞る選択肢の記述が 0 件**
- **同種事象探索**: `複数ユーザ|/root|linuxbrew|targetLabel` in specs/002 → **10 件**。いずれも探索手順と失敗の扱いの文脈で、**露出面として論じた箇所 0 件**。ホスト側については spec.md:469 が「ホストユーザ 1 名分とする」と明示的に絞っており、**WSL 側だけ絞りが外れている**非対称がある
- **リスク/影響**: 権限境界は越えていない (UNC 経由で読めるのは Windows 利用者が既に読めるもの。`/root` は実測で Access denied)。したがって権限昇格ではないが (a) OS の ACL が許すだけで**アプリが能動的に他人の会話を収集・集約・表示する**形になり、AD-007 が blocking gap としたデータの取り扱いが本人以外の分にまで及ぶ。(b) ディストロ内のユーザ名一覧が renderer に出る (軽度の情報開示)。FR-036 によりディスクには残らないため被害は表示に留まるが、**判断が明示されていないため I-1 でミラー (SQLite) が入った瞬間に他ユーザの会話がホスト側 DB に書かれる**
- **推奨アクション**: いずれかを `[USER]` 確定として spec に明記する。(i) **現行ユーザに対応するホームのみを既定対象とし、他ユーザの候補は「対象外として件数だけ示す」**(明示操作で含める)。(ii) 現行どおり全ユーザを対象とするが **Assumptions に露出面の評価を 1 段落で書き、UI に由来ユーザを常時表示することを FR 化**し、I-1 へ「他ユーザ由来のセッションはミラー対象外」という申し送りを残す。あわせて spec.md:469 との非対称の理由を書く
- **根拠**: AD-007 Consequences / Constitution 未解決の Principle 候補 #1 / FR-011 / FR-036 / CWE-359
- **scope 根拠**: feature

---

### [Medium] `targetKey` の生成規則が定義されておらず、config ディレクトリの実体パスが renderer に出る実装に倒れうる (M-001) (scope: feature)

- **観察**: `targetKey` は `EnumerationOutcomeDTO` の項目として renderer に渡り `fetchMoreSessions` の引数になる。検証は「既知の列挙対象のキーに完全一致。文字列を config ディレクトリのパスとして解釈しない」のみで、**キーをどう作るかは bundle のどこにも無い** (`EnumerationTarget` に `key` 相当の項目が無い)。一方で同契約は「config ディレクトリの実体パスは渡さない」「`targetLabel` に UNC やホームの完全パスを渡すと FR-042 と『不要な情報を境界に出さない』の両方に触れる」と念を押している
- **同種事象探索**: `targetKey` in specs/002 → **4 件**。生成規則を述べる行 **0 件**。R-1 の `folderId` は `isValidFolderId` と生成規則を持つ
- **リスク/影響**: 「`configDir` の値をそのままキーにする」が最も自然な実装であり、そうすると UNC パスが renderer に露出して FR-042 に抵触する。**1 行書くだけで塞げる欠落**
- **推奨アクション**: data-model §1 に `key: string` を足し「**不透明な識別子**とする。`configDir` の値・UNC 形式・ホームのパスを含んではならない。由来を復元できない形で生成しプロセス寿命で安定させる」と規定する
- **根拠**: FR-042 / contracts:130-137 / R-1 の `folderId` / CWE-200
- **scope 根拠**: feature

---

### [Medium] 停止中所在に対する `fetchMoreSessions` の期待結果が contract と quickstart で食い違い、SC-010 の該当行が検証できない (M-002) (scope: feature)

- **観察**: contracts:36-38 は「未知の `targetKey` は**現在のキャッシュをそのまま返す**」、`:152` は「停止中は `distro-not-running` を返す」。quickstart V-4 は停止中 `targetKey` で「**拒否され**」ることを確認せよと書く。さらに停止中の所在に対しては**列挙対象の探索自体が発行されない**ため、**停止中ディストロの `targetKey` はそもそもキャッシュ中に存在しない可能性が高い**
- **同種事象探索**: 停止中所在の拒否に言及する箇所 **5 件**。期待結果が 2 通りに割れている箇所 **1 組**
- **リスク/影響**: SC-002 後半と SC-010 の「停止中の所在」行は**実際には「未知のキー」経路しか踏めない**可能性が高く、「停止中でも UNC アクセスもプロセス起動もしない」という最重要の性質が意図した経路では 1 度も検証されないまま緑になる
- **推奨アクション**: (i) 停止中の所在も `EnumerationOutcomeDTO` に `status: 'failed' / reasonKey: 'distro-not-running'` の行として**必ず現れる** (= `targetKey` を持つ) ことを data-model §6 に明記する。(ii) 契約の戻り値を「未知のキー → キャッシュ / 既知だが停止中 → `distro-not-running` を反映したキャッシュを返し、プロセス起動と UNC アクセスを 0 件」と 2 分する。(iii) quickstart V-4 の期待をそれに合わせる
- **根拠**: SC-002 / SC-010 / FR-007 / FR-008 / research R-08
- **scope 根拠**: feature

---

### [Medium] プロセス起動の増幅に逐次方向の上限が無い (M-003) (scope: feature)

- **観察**: C-6 は「同時要求の束ね」と「同時プロセス数の上限」を定めるが**逐次の連打に対する制約が無い**。「プロセス起動の回数を renderer の呼び出し回数に比例させない」とあるが束ねは並行要求にしか効かない。1 プロセスあたり冷えた状態で 2,171 ms、列挙対象は 2〜8。`fetchMoreSessions` は `offset` を変えるたびに新しい列挙を要する
- **同種事象探索**: `上限|束ね` in contracts → **6 件**。逐次連打を制約する記述 **0 件**。R-1 も同型だが、**プロセス起動コストが `wsl.exe` 1 回から 2.2 秒 × 対象数に増えている**
- **リスク/影響**: renderer は未信頼である。侵害された renderer (または UI のバグ) が `refreshSessions` / `fetchMoreSessions` を逐次に呼び続けると UNC I/O を伴う子プロセスを無制限に起こせる。同時数上限があるためホストは飽和しないが、ディストロの 9p サーバへ継続的な負荷を掛けられる
- **推奨アクション**: C-6 に「**同一列挙対象に対する連続要求の最小間隔 (クールダウン)**」と「1 回の `fetchMoreSessions` が起こすプロセスは 1 対象分に限る」を足し、`offset` の上限値を実名で決める。BE-029 のテストに上限超過と連打の 2 ケースを追加
- **根拠**: AD-023 (renderer は未信頼) / contracts:151 / CWE-770
- **scope 根拠**: feature

---

### [Medium] C-5 の「SIGTERM → SIGKILL」は `utilityProcess` の API に存在せず、確実終了の手段が未定義 (M-004) (scope: feature)

- **観察**: C-5 は「プロセスを確実に終了させる (SIGTERM → SIGKILL)」と定め BE-025 も同じ。しかし実行単位は `utilityProcess` であり、Electron の `UtilityProcess` が持つのは引数なしの `kill(): boolean` のみでシグナルを選べない。`child_process` なら選べるが `check.mjs` の項目 7 と AD-023 の構成から外れる
- **同種事象探索**: `SIGTERM|SIGKILL|kill` in specs/002 → **2 件** / in src/ → **0 件** (R-1 に前例なし)
- **リスク/影響**: UNC I/O でハングした子プロセスが `kill()` の戻り値を確認せず放置されると、孤児プロセスが UNC ハンドルを保持し続ける。契約が API と一致していないため実装者が `process.kill(pid, 'SIGKILL')` に倒れる可能性があり、それは項目 7 の許可リスト外の経路になる
- **推奨アクション**: C-5 を実 API に合わせる — 「タイムアウト時に `kill()` を呼び、**戻り値と `exit` イベントの到着を待つ。一定時間内に `exit` が来なければ記録して監視対象から外す**」。加えて「アプリ終了時 (`before-quit`) に生存中の列挙プロセスをすべて `kill()` する」。BE-025 のテストで「タイムアウト後に `exit` が観測されること」を assert
- **根拠**: contracts C-5 / AD-023 / CWE-772
- **scope 根拠**: feature

---

### [Medium] UNC 形式の受理面が 1 綴りに限定されており、research 自身の実測と食い違う (M-005) (scope: feature)

- **観察**: data-model 判定規則 #2 / #3 は UNC を「`\\wsl.localhost\<D>\...` 形式」とのみ定義し、`UNC_PREFIX` も完全一致・ディストロ名照合も大小を区別する完全一致。一方 research.md:28-30 は同じ config ディレクトリに対して `//wsl.localhost/...` / `\\wsl.localhost\...` / `\\wsl$\...` の **3 綴りすべてが成立する**ことを実測し、`:71-72` は「小文字のドライブレターも混ざっていた」= cwd は**利用者がその時入力した綴りのまま記録される**ことを示す
- **同種事象探索**: `wsl\$|wsl\.localhost` in specs/002 + src/domain/ → **11 件**。`\\wsl$\` 綴りに言及するのは research.md:30 の 1 件のみで判定規則・FR-017・SC-005 のいずれも触れていない (**被覆漏れ 2 綴り + 大小差**)
- **リスク/影響**: 誤りは安全側に倒れる (`\\wsl$\` は `unknown-location`、`//wsl.localhost/` は `/` 始まりなので #5 / #6) ため所在の誤帰属は起きない。ただし SC-005 は「全パターンで正しい」と主張しており**主張と被覆が食い違う**。加えて `//wsl.localhost/<D>/...` が由来 config `wsl:<D>` 側に現れると `wsl-inherited` として実在しない POSIX パスとして扱われ、3 つ目の誤りになる
- **推奨アクション**: 判定規則に行を足す — 「`\\wsl$\<D>\` および `//wsl.localhost/<D>/` 形式も UNC として扱う (正規化してから合流)」か「**本 feature は `\\wsl.localhost\` 綴りのみを UNC と認め、他は `unknown-location` として明示的に扱う**」。後者なら SC-005 に但し書きを付け BE-012 に 2 綴りを追加して**意図した分類であることを固定する**。大小を区別することも明記
- **根拠**: FR-016 / FR-017 / SC-005 / research R-01 / AD-025 §2
- **scope 根拠**: feature

---

### [Medium] 列挙プロセスの stderr / ログ経路に、開発判定を注入する構造が指定されていない (M-006) (scope: feature)

- **観察**: C-5 は「stderr は開発ビルドのログにのみ残す」とだけ書く。R-1 の `measure.ts:1-11` は同じ要求に対し「**`electron` を import せず、開発ビルドかどうかは composition root が真偽値で注入する**」という構造を明示し、出力内容も計測点名と経過時間だけに絞っている。R-2 にはこの構造の指定が無い。列挙プロセスの stderr に載りうるのは SDK の例外メッセージ (config の UNC 完全パス = **ディストロ名 + Linux ユーザ名**)、`ENOENT` 等のパス付きエラー、JSONL のパース失敗箇所。SC-014 の計測は設定ディレクトリのファイルだけを見ており**ログ経路を見ていない**
- **同種事象探索**: `console\.(log|error|warn|debug)` in src/ → **1 件** (measure.ts:86、開発ビルドのみ)。`crashReporter` → **0 件** (現時点でダンプ経路は無い)。ログ内容を規定する行 **1 件**
- **リスク/影響**: 現時点の実害は「開発ビルドの端末出力に UNC パスとユーザ名が出る」程度。ただし規定が 1 行しか無いため `console.error(err)` が入ると**会話由来文字列がそのまま出力される**。Principle V は「ログへの混入も禁止」を NON-NEGOTIABLE とするが `bad_pattern_grep` は届かない
- **推奨アクション**: C-5 に「列挙プロセスの stderr / 例外は、**開発ビルド判定を注入された 1 つの関数を経由してのみ出力する** (R-1 の `measure` と同じ構造)。出力してよいのは `targetKey` (不透明) / `reasonKey` / 経過時間に限り、**config のパス・cwd・`summary` / `firstPrompt` を出力しない**」を足す。SC-014 の計測経路に「開発ビルドのログ出力に会話由来文字列が 0 件」を加える
- **根拠**: Principle V / `measure.ts:1-11` の先例 / AD-007 / CWE-532
- **scope 根拠**: feature

---

### [Low] 購読解除の「トークン」という契約文言が R-1 の実装 (解除関数を返す) と食い違ったまま 3 メソッド目が乗る (L-001) (scope: feature)

- **観察**: contracts:54-55 は「購読解除は preload が返す**トークン**で行う (R-1 と同じ)」と再掲するが、R-1 の実装 `src/preload/index.ts:18-24` は**解除用のクロージャ**を返す。security 上の要件 (renderer のコールバックを main へ渡さない) は満たされている
- **リスク/影響**: 実害なし。ただし契約と実装の食い違いが 2 feature にまたがって固定されると X-1 以降で「トークン方式」を新規実装する誤りが起きうる
- **推奨アクション**: 「購読解除は preload が返す**解除関数**で行う。**renderer のコールバックは preload 内に留め main へ渡さない**」に改める (security 要件の本体は後半)
- **根拠**: AD-023 セキュリティ要件 4 / `src/preload/index.ts:18-24`
- **scope 根拠**: feature

---

### [Low] `SDKSessionInfo` に programmatic / worktree を示す項目が無く、FR-029 の区別手段が bundle 中に未記載 (L-002) (scope: feature)

- **観察**: `SessionSummaryDTO` は `programmatic` / `worktree` を持ち FR-029 が区別を必須にする。しかし `SDKSessionInfo` (sdk.d.ts:5393-5434) にこの 2 項目は無い。`includeProgrammatic` / `includeWorktrees` は**フィルタであって区別子ではない**。区別する手段は bundle のどこにも書かれていない
- **同種事象探索**: `programmatic|worktree` in specs/002 → **14 件**。取得手段を述べる行 **0 件**
- **リスク/影響**: security 上の直接の影響は無いが、素直な実装は**同じ列挙対象に対する 2 回の列挙 = プロセス起動 2 倍**になり M-003 と SC-008 の予算に効く
- **推奨アクション**: research に 1 項目足して取得手段を確定させる (2 回列挙 / `cwd` の `.claude/worktrees/` パターンからの導出 / SDK への要望)。2 回列挙なら C-6 の上限と SC-008 の予算を見直す
- **根拠**: FR-029 / sdk.d.ts:5393-5434 / SC-008
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `firstPrompt\|customTitle\|切り詰め\|サイズ上限` in specs/002 | **8** | data-model.md:94,95,108,111 / plan.md:145 / contracts/ipc-session-list.md:85 / spec.md:419 / tasks.md:59 |
| C-001 | `firstPrompt` in src/ | **0** (未実装) | — |
| C-001 | 会話由来文字列を payload に載せる DTO 項目 (全数確認) | **6** | ipc-session-list.md:85-88 |
| H-001 | `sdk.d.ts` の公開 export 全数 | **19** (関数 17 / クラス 2) | sdk.d.ts:17,521,578,709,730,748,777,807,844,905,942,1002,1057,2974,2985,3041,8812,8929,8998 |
| H-001 | うち C-4 の禁止リストに載っているもの | **7 / 19** (書き込み系の漏れ **0**。未指定の読み取り系 **4** + 3 + store 1) | getSessionMessages:807 / getSubagentMessages:844 / listSubagents:1057 / getSessionInfo:777 / resolveSettings:3041 / createSdkMcpServer:521 / tool:8998 / InMemorySessionStore:942 |
| H-001 | これら識別子 in specs/002 | **2** (いずれも将来の言及) | research.md:273 / contracts/session-enumeration.md:173 |
| H-002 | 「親環境を継承しない」に相当する行 | **3** (FR 0 / SC 0 / test task 0 / 検証項目 0) | plan.md:122 / contracts:86 / tasks.md:92 |
| H-003 | 検証表の行を全数確認 | **8 行中 3 行**が SC-010 の計測方法で測れない | ipc-session-list.md:151,154,155 |
| H-004 | `fromUnc` in src/ | **3** | interfaces.ts:69 / path-api.ts:147,159 |
| H-004 | UNC の出現範囲の規定 / それに反する記述 | 規定 **4** / 反 **1** | 反: data-model.md:69 (+ :84) |
| H-005 | `未信頼` in specs/002 | **4** (config 由来を未信頼とする行 **0**) | spec.md:341 / ipc-session-list.md:141,150 / session-enumeration.md:148 |
| H-005 | config 由来で DTO に載る無検証の値 | 文字列 **6** / 数値 **3** | ipc-session-list.md:84-90 |
| H-006 | `複数ユーザ\|/root\|linuxbrew\|targetLabel` in specs/002 | **10** (露出面として論じた箇所 **0**) | spec.md:192,193,449 / data-model.md:41,103 / research.md:103,105,111 / ipc-session-list.md:132,135 |
| M-001 | `targetKey` in specs/002 | **4** (生成規則 **0**) | ipc-session-list.md:17,93,149 / quickstart.md:112 |
| M-004 | `SIGTERM\|SIGKILL\|kill` in specs/002 / src/ | **2** / **0** | session-enumeration.md:137 / tasks.md:93 |
| M-005 | `wsl\$\|wsl\.localhost` in specs/002 + src/domain/ | **11** (`\\wsl$\` 言及 **1**、判定規則での被覆 **0**) | research.md:30 ほか |
| M-006 | `console\.(log\|error\|warn\|debug)` / `crashReporter` in src/ | **1** / **0** | measure.ts:86 |
| 観点 2 の反証 | renderer が config ディレクトリ / 列挙対象パスを指定できる経路 | **0 件** | 新設 IPC の引数は `targetKey` (完全一致) と `offset` (範囲検査) のみ。**任意パス列挙への昇格経路は現設計に存在しない** |
| 観点 6 の反証 | ディストロ名がプロセス起動引数・環境値へ流れる経路 | 新規経路 **2** | どちらも検出済み descriptor 由来で `makeWslUncPath`→`isValidDistroName` / `makeRuntimePath` を通る。**session 記録由来の抽出名だけが検証点未指定** (H-005) |

## Verdict

- Critical: 1
- High: 5
- Medium: 6
- Low: 2

**観点別まとめ**

1. **未信頼入力の十分性** — renderer 発の 3 入力は閉じているが、`targetKey` の生成規則が未定義 (M-001)、SC-010 の「各行」が 3 行で空洞 (H-003)、**config ディレクトリ由来という新しい未信頼入力クラスが表に 1 行も無い** (H-005)
2. **任意ファイル列挙への昇格** — **塞がれている (該当 0 件)**。FR-009 + `dir` 不使用 + renderer から config を渡す API を作らない。未登録フォルダの登録導線も R-1 の `checkFolderDraft` を通る。ただしその「経路の不在」を守る機械検証が未割当 (H-003)
3. **個人情報の露出面** — **最大の問題**。`firstPrompt` は SDK 定義上「会話本文の逐語」であり FR-044 / SC-011 と DTO が正面衝突 (C-001)。本文を読む SDK API が禁止リストに無い (H-001)。他ユーザ分まで集約する判断の評価が無い (H-006)
4. **永続化** — FR-036 / SC-014 は AD-007 の blocking gap の回避手段として**成立している**。残余はログ経路の規定不足 (M-006)。`crashReporter` は未設定
5. **子プロセスの環境** — 散文 3 箇所のみで FR / SC / テスト / 検証項目がすべて 0 件 (H-002)
6. **引数インジェクション** — 検出済み descriptor 由来の経路は `isValidDistroName` を通り**塞がれている**。session 記録から抽出するディストロ名だけが検証点未指定 (H-005)
7. **プロセス境界** — `utilityProcess` は既に spawn パターンに含まれ許可リスト追加が ADR 必須になる形で**良く設計されている**。preload の単一 capability も破らない。残余は終了手段の API 不一致 (M-004) と文言の食い違い (L-001)
8. **読み取り専用の担保** — **書き込み・状態変更を伴う公開 API の漏れは 0 件** (全 19 export を突合)。ただし本文を読む読み取り API 4 件が未指定 (H-001)

**Critical=1 のため design-gate は FIX_REQUIRED と判定されるべきである。** C-001 は spec の FR 文言・contracts の DTO・data-model の不変条件・SC の計測経路の 4 つを同時に触る必要があり、H-001 / H-005 と同じ箇所を修正するため一括で扱うことを推奨する。
