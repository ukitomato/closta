# architecture-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-17
**Reviewer**: architecture-reviewer (design-gate Track C)
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Round**: 1

## 初回読了 viewpoint

読了済み: `.claude/agents/reviewer-base.md` / `.specify/memory/constitution.md` (v1.2.2 全文) / `docs/domains/session/charter.md` / `docs/domains/_overview.md` / `docs/glossary.md` / `docs/decisions/` accepted 27 件のうち AD-002 / 007 / 010 / 015 / 016 / 021 / 023 / 024 / 025 / 027 を全文、残りは見出し + Decision Outcome / spec.md / plan.md / tasks.md / research.md / data-model.md / quickstart.md / contracts 2 件 / checklists/requirements.md / R-1 実装 (`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` / `check.mjs` / `tests/rule-fixtures/expected.mjs` / `src/main/infra/fs/wsl-fs.ts` / `src/domain/runtime/path-api.ts` / `src/main/app/composition-root.ts`)。

**本 PR で実装/影響される FR / SC (architecture 観点)**

- FR-001 / FR-005 / FR-006 / FR-007 / FR-008 — 列挙経路の拘束
- FR-009 〜 FR-015 — 列挙対象の解決。FR-009 の解決手段が設計に無い (M-001)
- FR-016 〜 FR-018 — 出自判定 (AD-025 のセッション側拡張)
- FR-019 〜 FR-024 — 対応づけ (R-1 の判定表再利用は適合)
- FR-041 〜 FR-045 — IPC 境界とレイヤ。FR-042 が C-002 の中心
- SC-002 / SC-003 / SC-004 / SC-010 / SC-014 / SC-001

**viewpoint 別 severity 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: 同上 (検証表の発火不能は H-003 で D 側)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:2 Low:0
- D. Constitution / ADR drift / layering: Critical:3 High:3 Medium:4 Low:2
- E. User Story / SC / UX: 該当なし: `po-reviewer` の Owner 範囲
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲 (規則の欠落は D 側で扱う)
- G. DB / API / a11y / perf: 該当なし: 永続化なし (FR-036) / optional reviewer 範囲
- H. テスト / coverage / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

R-2 は R-1 が固定した 5 レイヤ (AD-023) の上に `src/domain/session/` と `src/main/infra/session/` を新設し、`src/agents/` に**プロジェクト初の実体**を置く。設計自体は R-1 の判定表・パス API・`VerifiedRunning` 契約をよく再利用しており「同じ規則を 2 箇所に持たない」姿勢は一貫している。**問題は設計の中身ではなく、accepted ADR と Constitution が R-2 に課している履行義務の取りこぼしと、新たに導入する妥協 (UNC を `agents` へ渡す / E2E を作らない) の上流への還流経路である。**

## Findings

### [Critical] `services-not-to-io` の `from` に `session-service.ts` を追加する task が無い — AD-027 が R-2 に課した履行義務の取りこぼし (C-001) (scope: feature)

- **観察**:
  - tasks.md:95 が `src/main/app/session-service.ts` を新設する。これは AD-023 §5 が「状態を持つ調停」の**実名筆頭**として挙げた `SessionService` そのものであり、tasks の記述 (キャッシュ / 2 段取得 / 束ね / 対応づけの適用) は「状態を持ち I/O をインタフェース経由で扱うクラス」の定義に完全に合致する。
  - `.dependency-cruiser.js:215-247` の `services-not-to-io` は `from` を `^src/main/app/(folder-service|runtime-store)[.]ts$` の実名 2 件に固定しており、同ルールのコメント `:224-225` が「**X-1 の `SessionService` / X-3 の `ProviderService` / I-2 の `ContainerService` を作るときは、ここに実名を足すこと**」と明示している。
  - AD-027 Consequences `:131-134` が同旨を accepted ADR として固定している。
  - **tasks.md / plan.md のどこにも `services-not-to-io` への追加タスクが無い。** Phase 7 の SH-080〜SH-090 は allowlist / 書き込み系 SDK API / `wsl.exe` / depcruise の `agents` 到達を扱うが、`services-not-to-io` は 1 行も無い。
  - さらに plan.md:38-47 の Related ADRs 表に **AD-027 が載っていない**。spec の Dependencies にも無い。実装者が AD-027 に到達する経路が bundle 内に存在しない。
  - AD-027 は履行時期を X-1 と想定していたが、**R-2 が `SessionService` を先に作る**。
- **同種事象探索**:
  - `services-not-to-io|session-service|SessionService` (node_modules 除く) → **31 件**。specs/002 内は 4 件 (新設側) で、**規則側への追随は 0 件**
  - `services-not-to-io` を specs/002 内で検索 → **0 件**
  - 規則側の要求は 4 件: `.dependency-cruiser.js:215,224` / `docs/decisions/0027-...:97,133-134`
  - **R-1 の pr-gate で既に予告されていた**: `specs/001-.../architecture-reviewer.md:192` が「`services-not-to-io` → 0 件 (tasks / roadmap / charter に申し送りなし)」を観察し `:199` で「tasks.md に前提タスクとして `from` への追加と fixture 1 件を立てる」を推奨。**R-2 の bundle はこの推奨を受け取っていない。**
  - 追随対象候補: tasks.md:91 の `session-enumerator.ts` (プロセスハンドル / 同時数上限 / 束ねという状態を持つ) → 1 件。含めるかの判断自体が行われていない
- **リスク/影響**: AD-023 §5 が「God Service への**唯一の歯止め**」と呼び AD-027 が Critical の是正として実名定義した規則が、**最も効くべき瞬間 (`session` domain 最初の Service が生まれる瞬間) に対象外のまま**になる。`session-service.ts` が `node:fs` を直接 import しても lint も depcruise も CI も何も言わない。AD-024 が名指した反パターン「違反が 0 件なのではなく検査が 0 件になる。これは『合格』と見分けがつかない」の再発であり、AD-027 が閉じた穴の**同一箇所での再オープン**。SH-090 (全通過) は緑のまま通る。
- **推奨アクション**:
  1. Phase 7 に task 追加: 「`.dependency-cruiser.js` の `services-not-to-io` の `from` に `^src/main/app/session-service[.]ts$` を追加する」。`session-enumerator.ts` を含めるか否かを**明示的に判断し理由を残す**
  2. 受け入れ条件に「追加後に `pnpm test:rules` が既存 fixture (`service-io-import.ts.fixture`) で引き続き発火すること」(実名列挙は綴り誤りで黙って死ぬ。AD-025 Consequences (d))
  3. plan の Related ADRs 表に **AD-027** を追加し「本 feature に履行義務がある ADR」と明記。spec の Dependencies にも 1 行
  4. SH-084 の ADR の Consequences に「R-2 で `SessionService` が生まれたため AD-027 の想定 (X-1) より 1 feature 早く履行した」を記録
- **根拠**: AD-027 §4 + Consequences (accepted) / AD-025 §9 / AD-023 §5 §7 / Constitution Governance / reviewer-base「accepted ADR drift = Critical」
- **scope 根拠**: feature

---

### [Critical] AD-025「UNC は `infra` の内側に閉じる」に反する設計を採りながら、調停 ADR が最終 phase にあり、代償の 4 規則に機械強制が 0 件で、規則 1 は HEAD で既に成立していない (C-002) (scope: feature)

- **観察**:
  - AD-025 Consequences `:181` (accepted) — 「**UNC 形式は `infra` の内側に閉じる。**」
  - research.md:158-183 (R-05) と contracts C-2 が、UNC 形式の config ディレクトリを `agents` へ環境変数で渡す設計を採る。research 自身が `:163` で「**字義どおりには反する**」と認めている
  - 代償の 4 規則に**機械検証タスクが 1 つも無い**。Phase 7 の SH-081 / SH-082 / SH-083 はどれも UNC の封じ込めを見ない。BE-020 の「share 配下への封じ込め」はモジュール内部の単体テストであり「組み立てが 1 箇所に限られている」ことは検証しない。規則 1 / 2 / 3 はすべて**レビュー依存**
  - **規則 1 は HEAD で既に成立していない。** UNC 値の生成は `src/domain/runtime/path-api.ts:137` の `toUnc()` (+ `path-types.ts:62` の `UNC_PREFIX` / `:129` の `makeWslUncPath`) にあり **`domain`** である。生文字列として取り出している `infra` は `src/main/infra/fs/wsl-fs.ts:67-70` の `toUncValue()` で**既に 1 箇所ある**。R-2 の `config-dir.ts` は **2 箇所目**。tasks.md:75 と contracts:76 の「唯一 / 1 箇所に限る」は書いた時点で事実と食い違う
  - **順序が逆である。** tasks の Dependencies では ADR 起票 (SH-084) が Phase 7 = 最終 phase にあり、BE-023 / BE-025 はその 30 task 以上前。Constitution の改定手順は「ADR で議論を記録 → 人間レビュー」を先に置く。SH-080 は「SH-084 と同時に行う」と明記されているのに、**AD-025 本体との調停はその拘束を受けていない**
- **同種事象探索**:
  - `toUnc|fromUnc|UncPath|wsl\.localhost` in src/ → **33 件**。UNC 値を**文字列として materialize** している production は `wsl-fs.ts:68` の **1 件**のみ。**R-2 が 2 件目を作る**
  - specs/002 内で UNC 規則を宣言している箇所 4 文書。**機械で確かめる task は 0 件**
  - Phase 7 の検証 task 11 件中 UNC 封じ込めを対象にするもの **0 件**
- **リスク/影響**: (a) accepted ADR に反する設計が調停 ADR の accepted より**先に**コードになる。gate の順序保証が崩れ「実装済みだから ADR を追認する」形になる。(b) 代償規則が機械強制を持たないため R-3 / X-3 が規則 2 を破っても気付かない。(c) 規則 1 の文面が事実と違うため、実装者は `wsl-fs.ts` を見つけた時点で「規則は既に破られている」と読むか「唯一」と誤記したまま進む。
- **推奨アクション**:
  1. **SH-084 を Phase 1 (または Phase 2 の前) に移す。** 「BE-023 / BE-025 は SH-084 の accepted を前提とする」を Dependencies に明記
  2. 規則 1 を事実に合わせる: 「**UNC 値を文字列として materialize してよいモジュールを実名で列挙する** (`wsl-fs.ts` / `config-dir.ts`)。組み立て (branding) は `path-api.ts` のパス API に限る」
  3. 規則 1 / 2 に機械検証を 1 本ずつ。規則 1: `check.mjs` に「`UNC_PREFIX` / `toUnc(` の呼び出しが許可モジュール実名リスト内」。規則 2: `src/agents/` 内に `UNC_PREFIX` / `\\wsl` リテラルと `toUnc` 呼び出しが 0 件。いずれも違反サンプルを添える
  4. ADR に「AD-025 Consequences の当該行を**読み替える**」と明記し、AD-004 → AD-025 の先例と同じ形式を採る (AD-025 を in-place 改変しない)
- **根拠**: AD-025 Consequences `:181` + §9 / AD-023 §2 §7 / Constitution Principle I Verification / 改定手順 1-2 / AD-027 §1
- **scope 根拠**: feature

---

### [Critical] AD-024 #18 と Constitution v1.2.2 Principle VIII が R-2 を名指す前提を満たさないのに、上流 SSoT 追随の対象に Constitution と AD-024 が入っていない (C-003) (scope: feature)

- **観察**:
  - AD-024 `:201` (accepted) — 「(A) と (B) はどちらも **R-2 の E2E 基盤に相乗りする。**」`:74` `:251` も同旨
  - `.specify/memory/constitution.md:443` (Principle VIII の Verification、**active な本文**) — 「どちらも R-2 の E2E 基盤に相乗りする。それまで本 Principle を守るのは Manual の 2 者と上記のテスト 1 本だけである。」`:740` も同旨
  - spec.md:440-446 / plan.md:301-316 は `[USER]` 確定として「E2E / CI 基盤は本 feature に含めない。M4 完了後に再検討」と決めた。判断の筋は AD-024 の延期条件に照らして**成立している**。問題は還流先
  - plan の「上流 SSoT の追随」表は charter / glossary / `_overview` / 新規 ADR / allowlists / rule-fixtures の 6 件。**`.specify/memory/constitution.md` と AD-024 が入っていない。** tasks も SH-086 〜 SH-088 だけで Constitution に触れる task が 0 件
  - 結果、R-2 完了後 **Constitution の active な本文に事実でない記述が 2 箇所残る**。Constitution は自ら「accepted ADR と同等の権威」「食い違う場合は Constitution を正とする」と宣言している
  - Constitution は既に `:710-713` で「Principle VIII の adoption metadata は別の改定 (v1.2.3 PATCH) が要る」と**未処理の改定を自認**しており、R-2 は同じ節に 3 件目の不整合を積む
- **同種事象探索**: `R-2 の E2E|計測経路: E2E|相乗り` → 上流文書側 **8 件** (constitution.md:40,443,740,792 / AD-024:74,201,251 / charter.md:111)。**plan の追随表がカバーするのは 8 件中 1 件。** 加えて `docs/discovery.md:229` が v1.2.2 で訂正済みの旧記述を保持 (既存 drift)
- **リスク/影響**: Principle VIII は AD-001 と PLAN.md §13.2 の根拠になっている NON-NEGOTIABLE。唯一の解消予定 (R-2) が消えるのに SSoT が「R-2 に相乗りする」と言い続けると、**次に Principle VIII を見る人 (X-2 の設計者) が「R-2 で載ったはず」と誤読する**。charter だけ直して Constitution を残すと、`_overview.md:118` の階層 (charter < Constitution) に対して**下位だけを直した**ことになる。
- **推奨アクション**:
  1. 「Principle VIII の延期先を R-2 から外す」ことを記録する ADR を起票 (SH-084 の (d) として相乗り可)。AD-024 は immutable なので読み替え根拠を新 ADR に置く
  2. Constitution を **PATCH (v1.2.3)** で改定する task を追加: `:443` / `:740` を「(A) は R-2 では発動しない (読み取り専用で `isDisabled: true` を外さない)。(B) の延期先は M4 完了後に再判断する」に改め、Amendment trail に 1 行
  3. plan の追随表に Constitution と読み替え ADR の 2 行を追加
  4. `docs/discovery.md:229` の旧記述を同時に直すか `system` scope として別 spec に送る判断を plan に書く
  5. Constitution 改定は**人間レビュー必須**。plan の「design-gate で人間承認が要る項目」に「Constitution v1.2.3 PATCH の採否」を追加
- **根拠**: AD-024 #18 / 延期条件 / Constitution Principle VIII Verification / Existing violations summary / Governance 優先順位 / 改定手順
- **scope 根拠**: feature

---

### [High] Principle VII の Statement 後半「単独起動でき、標準入出力経由でプロトコルを話せる」に対する担保が無い (H-001) (scope: feature)

- **観察**: Principle VII の Statement は 2 要求 — (1) Electron / ネイティブ非依存、(2) **`node dist/supervisor.js` として単独起動でき、標準入出力経由でプロトコルを話せる形を保つ**。plan.md:127-129 の Constitution Check VII は (1) だけを根拠にチェックを入れ、(2) に触れていない。contracts C-1 も同様。SH-083 も depcruise の推移的到達 (= (1)) だけ。
  - `src/agents/` は core モジュール禁止・`electron` 禁止のため、親との通信手段は実質 **`process.parentPort`** か **stdio** のどちらか
  - **`process.parentPort` は import を伴わないため ESLint の許可行列にも depcruise のグラフにも現れない。** Principle VII の Verification が自ら警告している形と同型 (`getBuiltinModule` は import として現れない)。`.dependency-cruiser.js:312` の `detectProcessBuiltinModuleCalls` は `parentPort` を見ない
  - BE-024 (`protocol.ts`) は**トランスポートを規定していない**
- **同種事象探索**: `parentPort|標準入出力|単独起動|stdio` in specs/002 → **0 件**。`単独起動` in docs/ .specify/ → 3 件
- **リスク/影響**: plan は「`src/agents/` の依存規則が**初めて対象を持つ**」ことを本 feature の価値として掲げている。最初の実体が `parentPort` に依存すると **AD-010 の目的 (1)「Electron を立てずにテストできる」(2)「AD-001 の後戻り可能性の担保」が最初の 1 本目で失われる**。機械検証はすべて緑のままなので「ルールが実コードに効いた」という主張が (1) についてのみ真で (2) について偽になる。
- **推奨アクション**: (1) contracts C-1 / C-2 に「列挙プロセスは stdio (または明示的に選んだ 1 経路) でプロトコルを話し、`node <entry> --config-dir=...` の形で単独起動できる」を追記。(2) tasks に「Electron 抜きの `node` で起動し標準入出力で 1 件の列挙が成立することを確認」を追加。(3) `parentPort` を許すなら `check.mjs` に検出項目を足すか `UNDETECTED_NOTES` に `nextFeature` つきで登録する。**列挙せずに「Principle VII は機械強制されている」と言わない。**
- **根拠**: Principle VII Statement + Verification (NON-NEGOTIABLE) / AD-010 / AD-023 §6 / AD-027 §1
- **scope 根拠**: feature

---

### [High] SH-055「`ui-path-concat` を `UNDETECTED_NOTES` から外す」は fixture の実体と矛盾し、実行すると SC-017 の残余台帳が後退する (H-002) (scope: feature)

- **観察**: fixture `ui-path-concat.ts.fixture` の実体は単なるテンプレート文字列連結であり、**`namespace` プロパティを持つオブジェクトリテラルを含まない**。SH-054 が追加するルール (「`namespace` プロパティを持つオブジェクトリテラルを禁じる」) は**発火しない**。にもかかわらず SH-055 は「`UNDETECTED_NOTES` から外し検出側へ移す」と指示している。`UNDETECTED_NOTES['ui-path-concat'].why` は「パス文字列の連結は import を伴わない」であり、残余の本体は「連結」であって「`namespace` リテラルの組み立て」ではない。`howToClose` が提案したルールは**残余の一部しか塞がない** — `{ ...receivedDto, value: receivedDto.value + '/sub' }` は `namespace` キーをリテラルで持たないためすり抜ける。
- **同種事象探索**: `ui-path-concat` → **5 件**。`UNDETECTED_NOTES` の他の 1 件は `nextFeature: 'I-1'` で R-2 の対象外。**R-2 が触る残余は 1 件のみ**で、その 1 件が不整合を持つ
- **リスク/影響**: SH-055 を字義どおり実行すると (a) fixture を書き換える → SC-017 の唯一の記録が消え `expected.mjs:243-256` が禁じた状態そのものになる、(b) 発火しないまま detectors を書き換える → `test:rules` が落ちて実装が止まる、のどちらか。設計時に決めるべき判断が実装時に押し出される。
- **推奨アクション**: SH-055 を 2 分割。(i) **新しい fixture を 1 件追加** (`ui-dto-namespace-literal.ts.fixture` 等) して新ルールの発火確認を担わせる。(ii) **`ui-path-concat` は `none` のまま残し**、`mitigatedBy` に「`namespace` リテラルの組み立ては SH-054 で塞いだ。残る連結経路は既存 DTO の spread + `value` 差し替え」を追記し `nextFeature` を R-3 以降に付け替える (**空にしない**)。plan の「構造で強制される」という主張を塞げる範囲に合わせて書き直す。
- **根拠**: `tests/rule-fixtures/expected.mjs:243-256` / AD-027 §1 / AD-025 Consequences / Constitution Existing violations summary
- **scope 根拠**: feature

---

### [High] SC-002 後半 / SC-010 の「停止中の所在」行を発火させる経路が contracts 上に存在しない (H-003) (scope: feature)

- **観察**: SC-002 は「停止中の所在の識別子で IPC を直接呼んで**拒否されること**」を計測経路に挙げ、SC-010 は検証表の各行、最低でも「停止中の所在」を含むことを要求する。しかし renderer から所在を渡せる API が**無い** (3 メソッドは引数なし 2 + `targetKey` / `offset`)。同 contract は「renderer から config ディレクトリを指定できる API を作らない」「`CLAUDE_CONFIG_DIR` の行は『検証』ではなく『経路の不在』で満たす」と明記。`fetchMoreSessions` は「未知の `targetKey` はキャッシュをそのまま返す」= 拒否ではない。data-model:32-33 により**停止中ディストロの `targetKey` はそもそも存在しない**。quickstart V-4 は「拒否され」ることを確認する手順になっており **contract と食い違う**。
- **同種事象探索**: `distro-not-running` in specs/002 → **5 件**。うち**renderer から到達できる経路を伴うものは 0 件**。同型の行は `CLAUDE_CONFIG_DIR` の 1 行があるが、こちらは契約が「経路の不在で満たす」と**自覚的に書いている** — 差は自覚の有無
- **リスク/影響**: AD-025 §9 が確立し AD-027 が Critical として是正した論法「**対象が無いルールを書いて『強制した』とは言えない**」に検証表 1 行がそのまま当たる。SC-010 は全行主義なので、**発火しない行を残すと SC-010 自体が達成不能または空振り**。BE-061 は実装されるが renderer から検証できず quickstart V-4 の後半が実行不能。
- **推奨アクション**: (1) `fetchMoreSessions` の未知 `targetKey` への応答を `distro-not-running` / `unknown-target` の理由キーに変えて観測点にする、または「SC-002 後半は main 側ハンドラの直接呼び出し (Vitest) で測る」と書き換え、検証表のその行に `CLAUDE_CONFIG_DIR` 行と同じ注記を入れる。(2) quickstart V-4 後半を対応する形に直す。(3) 検証表に「この行が発火する経路」の列を足すことを検討
- **根拠**: AD-025 §9 / AD-027 §5 / spec SC-002 / SC-010 / contracts ipc / quickstart V-4
- **scope 根拠**: feature

---

### [High] charter KPI「列挙の網羅」の計測経路を、それを満たせない当の feature が書き換える — SSoT 引き下げの承認条件が bundle に無い (H-004) (scope: feature)

- **観察**: charter KPI「列挙の網羅」の計測経路は **E2E**。この KPI は「停止中ディストロを含めると達成する唯一の道が SC-005 違反になる」とわざわざ限定を書き込んだ慎重な 1 行。SC-001 は同じ KPI を引きながら計測経路を「Vitest + quickstart」に置き換え、SH-086 は charter 側に留保を付ける。すなわち **「KPI を満たせない feature が KPI の計測経路を緩める」** 形。`_overview.md:11-12` は「charter はゴールの粒度。詳細仕様と実装方針は spec の責務」と定めており方向が逆。quickstart の SC-001 手順は手動であり、自ら「踏めなかった行を記録する」と認めている = **開発ホスト 1 台の状態に依存し再現性が保証されない**。plan の Constitution Check「charter の整合」2 項目目は `[ ]` のままで人間承認に正しくエスカレーションしているが、**承認に必要な材料 (代替計測が KPI をどこまで担保するか / いつ E2E を載せるか) が bundle に無い**。
- **同種事象探索**: `計測経路: E2E` in docs/domains/ → **4 件** (session:111,115 / ui:130 / provider:94)。**E2E を計測経路とする KPI は全 domain で 4 件あり、延期すると 4 件すべてが計測不能のまま滞留する**
- **リスク/影響**: (a) M1 の完了判定は R-1〜R-4 で閉じるのに中核 KPI の計測手段が M4 完了後に先送り。(b) 留保先が charter 1 箇所なので、同じ延期が `ui` / `provider` charter に及ぶとき前例だけが残って条件が残らない。(c) charter は `status: needs-human-review` のままで、未レビュー文書を feature 都合で弱める形
- **推奨アクション**: (1) SH-086 の留保に**再開条件**を書く (「基盤が入った時点で E2E に戻す」)。(2) E2E 基盤を作る feature を roadmap / `_overview` に**名前付きで登録する** task を足す (「M4 完了後に再検討」だけでは持ち主がいない)。(3) SC-001 の達成判定に「踏めなかった行を Vitest フィクスチャで代替したことを `quickstart-results.md` に列挙する」を明記。(4) 人間承認の議題を具体化
- **根拠**: charter KPI / `_overview.md:11-12` / M1 の完了判定 / Constitution Governance
- **scope 根拠**: feature

---

### [Medium] `hostTarget()` の解決手段が設計に無く、R-1 の許可行列では `infra/session/` から `os` も `electron` も取れない (M-001) (scope: feature)

- **観察**: contracts が `hostTarget(): EnumerationTarget` を引数なし・同期で宣言し data-model が「ホストユーザの既定 config ディレクトリ 1 件」とするが、解決手段がどこにも無い。`src/main/infra/session/` は `runtime-infra` ではないため `os` / `node:os` / `process` は禁止、`electron` も `app` と `infra/secrets/` のみ。R-1 の形は composition-root で `app.getPath('userData')` を解決して `infra` に**注入**する。BE-021 / BE-031 のどちらもホームディレクトリの受け渡しに触れていない。
- **同種事象探索**: `homedir|USERPROFILE|getPath\(` in src/ → **3 件** (すべて `userData`)。ホーム解決は **0 件** — R-2 が初めて必要とする
- **リスク/影響**: 実装時に lint で止まり、(a) `infra/session/` を `runtime-infra` 相当に緩める、(b) `process.env.USERPROFILE` をグローバル経由で書く (import が無いので lint を通り、`check.mjs` の `PLATFORM_BRANCH_PATTERNS` も `OS|OSTYPE` しか見ないため**素通りし Windows 前提の分岐が `infra/runtime/` の外に生える**) のどちらかに倒れる。(b) は Principle II の趣旨に実質的に反しながら機械検証を通る
- **推奨アクション**: `hostTarget(hostHome: HostPath)` (または生成時注入) に改め、composition-root で `app.getPath('home')` を解決して渡す形を BE-031 に明記する
- **根拠**: Principle I / II / `_overview.md` Cross-domain invariants / eslint.config.mjs / AD-023 §1 / R-1 の composition-root の先例
- **scope 根拠**: feature

### [Medium] AD-025 申し送りが名指した `thread-list-sidebar` から `thread-list` 系 + primitive 直組みへの読み替えが記録されていない (M-002) (scope: feature)

- **観察**: AD-025 申し送り (accepted) は「**セッション一覧は `thread-list-sidebar` element として作る** (R-2)」と実名指定する。bundle は「**thread-list 系** element を土台にする」と書き、実構成は `thread-list.aui.tsx` をコピーして primitive を直接組む。`thread-list-sidebar` という名前は bundle 内に 1 件も現れない。Principle XIII の Exceptions (「候補を**実名で照合**したうえで不適合」) は形式上満たしているが、**満たしていないのは「ADR が実名指定した element を別の element に替えたこと」の記録**。
- **同種事象探索**: `thread-list-sidebar` → **1 件** (AD-025:265)。`thread-list` in specs/002 → 6 件。**ADR が名指した綴りとの突き合わせが 0 件**
- **リスク/影響**: 両者は registry 上の別 element で、前者は目標レイアウト (左ペイン) を前提にした選択。黙って後者にすると、目標レイアウト ADR が accepted になったとき「R-2 は `thread-list-sidebar` を使ったはず」という前提で設計が積まれる
- **推奨アクション**: plan の Principle XIII の項に「AD-025 申し送りは `thread-list-sidebar` を名指したが、R-2 は上部ナビの 1 画面として実装するため `thread-list` 系を採る。目標レイアウト ADR が accepted になった時点で寄せる」を 2 行足し、ADR にも同じ 1 行を残す
- **根拠**: AD-025 申し送り / Principle XIII Exceptions + Verification
- **scope 根拠**: feature

### [Medium] `session-enumerator.ts` を `PROCESS_SPAWN_MODULES` に追加すると `check.mjs` 項目 3 (裸の `wsl`) が同ファイルに掛かる (M-003) (scope: feature)

- **観察**: `allowlists.mjs` / `check.mjs` は「裸の `wsl` / `net` / `sc` / `mount` は**プロセス起動 API を持つファイルに現れた場合だけ**違反」「**2 つの項目が噛み合って初めて塞がる**」と設計されている。`SPAWN_CALL_PATTERNS` は `/\butilityProcess\b/` を含むので `session-enumerator.ts` は `hasSpawnApi` が真になる。したがって同ファイルに `'wsl'` リテラルが 1 つでも現れると項目 3 が違反を出す。`WSL_CALLER_MODULES` は `wsl-cli.ts` の 1 件のみ。SH-080 は `PROCESS_SPAWN_MODULES` への追加だけを指示し噛み合わせに触れていない。`'wsl'` リテラルは所在判別の形で **21 ファイル**に存在し、BE-025 は「所在の識別子を起動引数に含める」ので同種の分岐が入る蓋然性は高い。
- **同種事象探索**: `'wsl'` in src/ → **21 ファイル**。「spawn 可能かつ `'wsl'` を含む」ファイルは現在 **0 件** — R-2 が最初の候補を作る
- **リスク/影響**: SH-090 の段階で初めて発覚すると SH-084 の ADR が既に accepted の可能性が高く、**2 本目の ADR を起こすか accepted ADR の in-place 改変という禁じ手に倒れる**
- **推奨アクション**: SH-084 の ADR に、spawn 可能にすることで新たに掛かる検証項目 (項目 1 / 3 / 4) を**列挙し必要な許可リスト追加を同時に決める**。所在の判別を `session-enumerator.ts` の外に出して**同ファイルに `'wsl'` を書かない**設計が最小の回避策であり、これも ADR に書く
- **根拠**: allowlists.mjs / check.mjs / Principle VI Verification (許可リスト追加には ADR) / AD-025 Consequences
- **scope 根拠**: feature

### [Medium] charter の In scope 1 行目が US-2 を含まないのに、SH-086 の追随は Journey 1 だけを対象にしている (M-004) (scope: feature)

- **観察**: charter の In scope 1 行目は「**登録フォルダを横断した**セッションの列挙」。US-2 (登録フォルダに紐づかないセッションの列挙) はこの文言の外側。plan は「Journey 1 は未登録フォルダを含んでいない。charter 側に追記が要る」と正しく検出しているが、追随対象を **Journey 1 に限定**しており In scope の文言に触れない。plan の Constitution Check「In scope に収まっている」は `[x]` のまま。
- **同種事象探索**: `登録フォルダを横断` → **4 件**。`_overview.md:50` は SH-088 で対応済み。**未対応は `charter.md:29` の 1 件**
- **リスク/影響**: charter は責務境界の SSoT。In scope に無い機能が spec 側だけで増えると、O-1 / X-1 が「未登録フォルダのセッションを扱うのは誰の責務か」を判断できない。**ゴール記述と旅程が食い違う charter** が残る
- **推奨アクション**: SH-086 に「In scope 1 行目を『登録フォルダを横断したセッションの列挙 (**登録の有無によらず config ディレクトリ配下の全件**…)』に改める」を追加。plan のチェックは In scope を改めるまで `[ ]` にして人間承認対象に含めるのが正直
- **根拠**: charter.md:29 / `_overview.md:11-12` / FR-004 / FR-025 / FR-026
- **scope 根拠**: feature

### [Medium] Principle XII の Automated Verification が対象不在で空振りしており、FE-048 に成果物が無い (M-005) (scope: feature)

- **観察**: Principle XII の Verification は「`docs/ui-coverage.md` の対応表に未割当行が存在しないこと」だが**ファイルは存在しない** (O-2 で作る)。`bad_pattern_grep` は存在しないファイルに 0 件を返すため `existing_violations: 0` は遵守を意味しない — Principle VIII と同じ空振り。plan はこれを回避するため「`SDKSessionInfo` の 10 項目すべてに表示先を割り当てる」を代替に置き FE-048 が「確認する」とするが、**確認結果を残す成果物が指定されていない**。
- **同種事象探索**: `ui-coverage` → **6 件**。ファイル実体 **0 件**
- **リスク/影響**: 10 項目割り当ては O-2 が作る対応表の**先行素材**。確認だけで記録が残らないと O-2 でやり直す (または漏れる)
- **推奨アクション**: FE-048 の成果物を決める — 最小案は data-model §3 の表に「表示先」列を足して 10 項目の割り当てを書く
- **根拠**: Principle XII / `_overview.md:80`
- **scope 根拠**: feature

### [Medium] AD-023 §6 に 3 つ目の寿命を足す ADR (SH-084 (a)) に「読み替え」の記録形式が指定されていない (M-006) (scope: feature)

- **観察**: AD-023 §1 の表と §6 は `agents` の寿命を「セッション開始〜終了」と定める。R-2 は「要求 1 回」を追加する。**ADR 起票で足りるか**への回答: 足りる — AD-025 §2 が「AD-004 は immutable なので本文は変更せず、本 ADR を読み替えの根拠とする」という形式を確立している。**ただし SH-084 は「(a) 寿命を追加する (AD-023 §6 の補足)」としか書いておらず、読み替え形式・`supersedes` の扱い・AD-023 のどの行を読み替えるかが指定されていない。** R-1 の pr-gate で「AD 間のリンク欠落」が指摘済みであり同じ失敗形の余地がある。併せて Principle IX の射程拡張 (plan.md:136-138) は方向が厳しくなる側なので違反ではないが、`src/agents/` に「supervisor ではないもの」が入る初回であることは ADR に残すべき事実。
- **同種事象探索**: `読み替え` in docs/decisions/ → **3 件** (すべて AD-025)。**規約としては未明文化**
- **推奨アクション**: SH-084 を具体化 — 「AD-023 §1 の寿命表と §6 を**読み替える**根拠として本 ADR を置く (AD-025 §2 の形式)。in-place 改変しない。`superseded-by` は変更しない (supersede ではなく補足)。References に AD-023 §1 / §6 を実名で挙げる」
- **根拠**: AD-023 §1 §6 (immutable) / AD-025 §2 の先例 / Principle IX
- **scope 根拠**: feature

## その他の観点の照合結果 (指摘に至らなかったもの)

照合した事実として記録する:

- **レイヤの向き (AD-023 §7)**: `domain/session` は I/O を持たず `domain/runtime` / `domain/workspace` のみに依存。`agents → domain` / `infra → domain` / `app → 全部` / `ui → domain` (dto.ts) はすべて許可行列内。`agents ↛ infra` は C-1 の「起動と結線は `app`」で守られ `agents-not-to-infra` が推移的に見る。`app ↮ ui` は両向きのルールあり。**列挙結果が `agents` → 親 → `app` → preload → `ui` と流れる経路はレイヤ規則に収まる**
- **AD-021 §3**: 環境変数を書き換えない方針が FR-014 / C-4 / R-04 で一貫。短命プロセス方式は AD-021 (a) そのもの
- **AD-015 §1/§2/§3**: `wsl.exe` 0 回 / UNC 主経路 / 再取得は明示操作。`fs.watch` を張らない理由も AD-015 の測定範囲に忠実
- **AD-007 / Principle X**: 置き換え / 取得時刻 / 非永続で一貫。blocking gap を持ち込まない
- **AD-002 / Principle IV**: `listSessions()` のみ。自前再帰列挙を明示的に却下
- **AD-016 / FR-023**: 越境を `Boundary` として保持し R-1 の判定表を再利用。表を 2 つ持たない
- **Principle V**: 親環境を継承させない方針は X-3 を先回りした適切な設計
- **Principle VI**: ディストロ内で何も実行しない / config 非改変
- **Principle XIV / glossary**: 2 つの「所在」を分ける判断は `Location` 項と整合。追加 6 用語に既存 canonical term との衝突なし
- **Cross-domain invariant**: `session → runtime` の依存方向に沿い、`runtime` の出力を**値として受け取る**形を守る。AD-025 の判定 3 段を `resolveFolderRuntime()` 経由でそのまま使う点は第 2 段の鍵が `pathMapping` の有無という AD-025 Consequences と一致。**FR-022 の 3 値は cross-domain invariant に適合**

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `services-not-to-io\|session-service\|SessionService` (node_modules 除く) | **31** (specs/002 側 4 / 規則側の要求 4 / R-1 gate 記録 20 超) | `.dependency-cruiser.js:215,224` / `docs/decisions/0027-...:97,133-134` / `tasks.md:95,98` / `plan.md:208,209` / `specs/001-.../architecture-reviewer.md:192,199` |
| C-001 | `services-not-to-io` in specs/002 | **0** | — |
| C-002 | `toUnc\|fromUnc\|UncPath\|wsl\.localhost` in src/ | **33** (文字列化する production は **1**) | `wsl-fs.ts:67-70` / `path-api.ts:137-159` / `path-types.ts:62,129` / `interfaces.ts:67,69` |
| C-002 | UNC 封じ込めを検証する task | **0** | tasks.md:194-224 |
| C-003 | `R-2 の E2E\|計測経路: E2E\|相乗り` | **8** (plan の追随表がカバーするのは **1**) | constitution.md:40,443,740,792 / AD-024:74,201,251 / charter.md:111 |
| H-001 | `parentPort\|標準入出力\|単独起動\|stdio` in specs/002 | **0** | — |
| H-002 | `ui-path-concat` | **5** | expected.mjs:218,258 / fixture:1-5 / plan.md:270 / tasks.md:155 |
| H-003 | `distro-not-running` in specs/002 | **5** (renderer 到達経路を伴うもの **0**) | contracts/session-enumeration.md:131 / ipc-session-list.md:152 / data-model.md:237 / tasks.md:166 / quickstart.md:109-115 |
| H-004 | `計測経路: E2E` in docs/domains/ | **4** | session:111,115 / ui:130 / provider:94 |
| M-001 | `homedir\|USERPROFILE\|getPath(` in src/ | **3** (home は **0**) | composition-root.ts:26,60 / folder-store.ts:50 |
| M-002 | `thread-list-sidebar` | **1** (specs/002 側 **0**) | AD-025:265 |
| M-003 | `'wsl'` in src/ / spawn 可能ファイルとの積 | **21 ファイル** / 積は **0** | R-2 の `session-enumerator.ts` が初の候補 |
| M-004 | `登録フォルダを横断` | **4** (未対応 **1**) | charter.md:29 (未対応) / `_overview.md:50` / spec.md:43 / plan.md:14 |
| M-005 | `ui-coverage` | **6** (ファイル実体 **0**) | constitution.md:544,548,559 / `_overview.md`:58,80 / plan.md:142 |
| M-006 | `読み替え` in docs/decisions/ | **3** (すべて AD-025) | 0025:26,66,75 |

## Verdict

- Critical: 3
- High: 4
- Medium: 6
- Low: 0

**design-gate の判定に対する所見**: Critical 3 件はいずれも **bundle 内の task 追加 / 順序変更 / 追随先の追加**で閉じられ、設計そのものの作り直しを要求しない。C-001 は tasks 1 件 + plan 1 行、C-002 は SH-084 の phase 移動 + 検証 task 2 件 + 規則 1 の文言修正、C-003 は Constitution PATCH task + 読み替え ADR + 追随表 2 行。**人間承認が要る項目は plan が挙げた 2 点に加えて、(3) Constitution v1.2.3 PATCH の採否、(4) charter KPI の計測経路を緩めることの可否と E2E 基盤の持ち主 feature、の 2 点を追加すべきである。**

**特に強く言いたい 1 点**: この bundle の弱点は設計判断の質ではなく、**「上流が R-2 を名指して要求していること」の棚卸しが不完全**なことである。plan は「R-2 を名指している上流の記述が 4 件ある。すべてここで処理を決める」と宣言したが、実際には AD-027 Consequences (C-001) と Constitution Principle VIII / AD-024 の本文 (C-003) が漏れており、棚卸し自体が不完全だった。棚卸しの手段を機械化する (例: `grep -rn "R-2\|SessionService\|services-not-to-io" docs/ .specify/` を Post-design re-check の手順として書く) ことを本 feature の成果物として検討する価値がある。
