# architecture-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: architecture-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate)
**Mode**: default + `--scope adr-drift` の両方 (accepted ADR 全 28 件のうち AD-027 は新規に全文読了)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため、
> reviewer の最終報告を pr-gate が保存した。

## 初回読了 viewpoint

**本 round で読了したもの**: `reviewer-base.md` / Constitution v1.2.2 全文 (frontmatter + Principle I〜XV + Governance + Amendment trail + Existing violations summary) / **`docs/decisions/0027-*.md` 全文 (新規)** / AD-025 §9 + Open Questions / AD-023 §5 §7 §8 / AD-024 Open Questions + 訂正節 / `.dependency-cruiser.js` 全文 / `eslint.config.mjs` (禁止定義・boundaries policies・per-file override 節) / `scripts/rules/run.mjs` 全文 / `tests/rule-fixtures/expected.mjs` 全文 / `tests/rule-fixtures/a-direct/service-io-import.ts.fixture` / `src/main/app/{composition-root,folder-service}.ts` / `src/domain/workspace/registry.ts` / `scripts/constitution/allowlists.mjs` (SCAN_*) / `.github/workflows/verify.yml` / spec FR-034〜FR-037 / plan (Constitution Check・Complexity・実測メモ・追随表) / tasks / pr-gate.md Round 1 / 自身の Round 1 出力 / `docs/domains/runtime|ui|_overview` / `docs/glossary.md` / `docs/discovery.md`

**本 round で owner 範囲に触る FR / SC**

- FR-035 — AD-023 §7 の依存規則を **ESLint と dependency-cruiser の両方**で強制 → **H-201 (不適合。`services-not-to-io` は depcruise 片側のみ)**
- SC-008 / SC-009 — 違反サンプルの全数検出 / 通常検証は違反 0 件 → **H-202 (production 側 `from` セレクタの発火が未検証)** / M-204
- FR-041 相当 (許可リストの追加に ADR) / Principle VI の「除外はファイル単位、包含リストにしない」構造 → M-201
- FR-046 / Principle XIV → M-206 (Round 1 M-006 の継続)
- FR-015 (ブラウズセッション) の capability token → **H-204 (AD-027 §4 の副作用で生成契約が弱化)**
- Round 1 C-002 の対象 (AD-023 §5 / §7 の `services ✗→ I/O モジュール直接`) → **実質履行を確認。Critical は解消**

**touched files に該当する charter / Confirmation**

- `docs/decisions/0027-*.md` (新規 accepted) — Decision §1〜§5 / Consequences / Alternatives を全項照合 → H-201 / H-202 / H-203 / M-201 / M-202 / M-204 / M-205 / L-202
- `docs/decisions/0025-*.md` §9 + Open Questions — 逆方向リンク不在 → H-203
- `docs/decisions/0023-*.md` §5 §7 (God Service の歯止め / 2 ツールの役割分担) → H-201 / M-205
- `.specify/memory/constitution.md` Principle VI (包含リスト禁止の論拠) / Principle VIII → M-201 / H-001 (継続)
- `docs/domains/{runtime,ui,_overview}` / `docs/glossary.md` / `docs/discovery.md` → 継続指摘のみ (H-002 / M-001 / M-002 / M-006)

**viewpoint 集計** (新規分。継承分は「Round 1 継承」節で別掲)

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の owner 範囲。H-204 は capability token に触れるが、**指摘内容は「AD-027 §4 が導入した注入点の契約設計」**であり token 検証経路そのものではない (重複回避のため security 側に引き渡し可)
- B. 入力検証 / injection / 暗号: 該当なし: 同上
- C. 業務不変条件 / Charter drift / cross-domain invariant: Critical:0 High:0 Medium:1 Low:0 (M-203。charter / cross-domain invariant は Round 1 から変化なし)
- D. Constitution Principle drift / accepted ADR drift / layering: Critical:0 High:4 Medium:3 Low:2
- E. User Story 価値 / SC 計測可能性 / UX: 該当なし: `po-reviewer` / `ux-reviewer` の owner 範囲
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` の owner 範囲 (`.dependency-cruiser.js` の無名インライン配列は M-202 に**構造の論点としてのみ**含め、命名としては指摘しない)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: DB / HTTP API が存在せず、optional reviewer が code-gate で担当済み
- H. テスト戦略 / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1 (M-204 / L-201。自 owner 範囲 = 「機械強制そのものの検証経路」に限定)

**重複抑制の確認**: code-gate iteration 1 の MUST_FIX 7 件で resolved になった `path:line` は再指摘していません。Round 1 で他 reviewer が owner の領域 (convention の `GENERATED_FILES` / ux の unhandledrejection / platform-boundary の C-001 本体) には踏み込んでいません。**`scripts/rules/run.mjs` / `expected.mjs` は Round 1 C-001 (origin: platform-boundary) の修正対象ですが、本 round で私が触るのは「`services-not-to-io` の発火確認が成立しているか」= 私の C-002 の履行検証としてのみ**です (M-204 は例外で、SC-008 の検証機構全体に対する H カテゴリの新規観察です — platform-boundary 側と重なる場合は同氏に譲ります)。

## スコープ要約

Round 1 の Critical 2 件に対する修正コミット `cfec16b` / `ca6f2ce` を中心に、207 files / +41,799 の diff を再照合した。**私の Round 1 C-002 は substantive には履行されている** — `services-not-to-io` が `.dependency-cruiser.js:214-247` に存在し、`folder-service.ts` の `node:crypto` 直接 import は `deps.newId` 注入に置換され (`folder-service.ts:97` / `composition-root.ts:80`)、`tests/rule-fixtures/a-direct/service-io-import.ts.fixture` で発火が実測され、履行記録は新規 AD-027 に残された。**Critical は 0 件**である。残るのは (1) FR-035 が要求する 2 ツール強制の片側欠落、(2) 実名列挙という選択に伴う「production セレクタの発火が一度も確認されていない」残余、(3) AD-025 → AD-027 の逆方向リンク不在、(4) 違反形除去の副作用として capability token の生成契約が弱くなったこと、の 4 点である。**Round 1 の High 4 件 (H-001 〜 H-004) はいずれも HEAD で未対応**であり、実文で再確認した。

---

## caller の 5 つの問いへの直接回答 (要旨)

| 問い | 判定 |
|---|---|
| **(a)** 違反サンプルのパスを `from` に列挙したのは許容範囲か | **条件付きで許容**。「production 設定にテストパスを混ぜるな」という一般論より、AD-027 §5 の「列挙しないと発火を確かめられない」の方が本プロジェクトの原則 (AD-025 の結論) に沿う。**ただし現状の形は目的を半分しか達していない** — fixture は `__rulecheck__` 分岐だけを通し、**production の 2 実名が実際に `from` に一致することは一度も実証されていない**。「21/21 一致」は production 2 件について何も示さない (→ **H-202**) |
| **(b)** AD-027 の書き方は妥当か。AD-025 を in-place 改変せず新規 ADR で決着させた形は正しいか | **形は正しい**。pr-gate Round 1 の Suggested fix (3) と、プロジェクト自身の先例 (AD-025:65「AD-004 は immutable なので本文は変更せず、本 ADR を読み替えの根拠とする」/ AD-024 #13) の双方に一致する。私の Round 1 H-004 が批判した AD-024 の in-place 改変とは**逆の、望ましい**選択である。**残余は逆方向リンク** — AD-027 の frontmatter が `supersedes: []` のまま、AD-025 §9 の見出しは今も「**R-1 に対象が無い**」、その Open Question も `- [ ]` のままで、AD-025 から AD-027 への参照が 0 件 (→ **H-203**) |
| **(c)** `assert` / `util` / `events` の除外は `DOMAIN_PURE_CORE` と整合するか | **整合していない**。`DOMAIN_PURE_CORE` は 10 語 (`path` / `path/posix` / `path/win32` / `assert` / `util` / `url` / `querystring` / `string_decoder` / `buffer` / `events`)、services 側は 3 語。AD-027 §4 は「**同じ考え方**」と書くが集合は 7 語違い、差分の根拠がどこにも無い。方向は**厳しい側**なので現時点の実害は 0 件 (両ファイルに core import は 0)。問題は「同じ考え方」という記述を信じた後続者が `DOMAIN_PURE_CORE` を触って効かない、という経路 (→ **M-202**) |
| **(d)** 結線層 / Electron 境界を `from` に含めない判断は AD-023 §5 と整合するか | **整合している。指摘なし**。AD-023 §5 の分類は「状態を持たない規則 = 純粋関数 / **状態を持つ調停 = class**」であり、`composition-root.ts` は状態を持たず値を解決して返すだけ (`:39-135` を確認、`let` による可変状態 0)。`protocol.ts` の `node:fs/promises` は AD-025 §8 が実名で許した経路、`window.ts` / `index.ts` は Electron 境界。ただし AD-027 §4 の**書き方**は denylist 的 (「含めない」) で実装は allowlist なので、記述としては空転している (→ L-202) |
| **(e)** X-1 / X-3 / I-2 の Service 増加時の追随漏れリスク | **実在する。ただし Critical / High ではなく Medium**。申し送りは `.dependency-cruiser.js:224-225` と AD-027 Consequences の 2 箇所にあるが、**このプロジェクトが同種の残余に対して機械強制している追跡 (`expected.mjs` の `UNDETECTED_NOTES` の `nextFeature`。`run.mjs:264-273` が欠落を失敗にする) の外側に置かれている**。AD-027 が自ら却下した代替案 (「`app` レイヤ全体 + 実名例外」) は (a) と (e) を同時に解消する案であり、却下理由は AD-025 §9 の**字面**である (→ **M-201**) |

---

## Findings (新規)

### [High] FR-035 が要求する「ESLint と dependency-cruiser の両方」に対し、`services-not-to-io` は **直接 import の規則なのに depcruise 片側だけ**で実装されている (H-201) (scope: feature)

- **観察**:
  - `spec.md:377-380` FR-035 は「AD-023 §7 の依存規則 (**許可行列と禁止規則の全項目**) を … **ESLint** (編集時・直接 import) と **dependency-cruiser** (推移的依存・循環・`require()` 形式) の **両方**で強制しなければならない」と書く。
  - `services-not-to-io` は自身のコメントで「状態を持つ調停クラスから I/O モジュールへの**直接**依存」(`.dependency-cruiser.js:217`) と宣言し、`to` に `reachable` を持たない (`:239-246`) — **定義上、FR-035 が ESLint 側に割り当てた「編集時・直接 import」の規則である**。
  - にもかかわらず ESLint 側に対応する規則が無い。`expected.mjs:98-105` が実測としてそれを記録している — 「**eslint は捕まえない** (実測)。… **この規則を見ているのは depcruise だけである**」。fixture の `detectors` も `['depcruise']` の 1 つだけ (`:105`)。
  - 表現手段は既に存在する。`eslint.config.mjs:355-373` は per-file の `no-restricted-imports` override を **4 回**使っている (`files: [PATH_API_FILE]` / `files: [...APP_FILES, ...SECRETS_FILES]` / `files: RUNTIME_INFRA_FILES`)。同じイディオムで `files: ['src/main/app/folder-service.ts', 'src/main/app/runtime-store.ts']` に core モジュールの禁止を足せる (既存ヘルパは禁止を**外す** `without()` だけなので、足す側のヘルパ 1 本が要る)。
  - **AD-027 はこの論点を一言も扱っていない。** Decision §4 / §5 / Consequences / Alternatives considered の全文に `eslint` の語は 0 件 (`grep -c eslint docs/decisions/0027-*.md` → 1。それは `#3` の「eslint は `--format json`」= 別論点)。plan `:184` Complexity #1 が「片方だけにすると … **編集時のフィードバックが失われる** (グラフ検証のみ)」と自ら書いた状態が、この 1 規則で現実になっている。
- **同種事象探索**:
  - `.dependency-cruiser.js` の本プロジェクト規則 **11 件**を 1 件ずつ ESLint 側の有無で照合 → ESLint に対応物が無いのは **`no-circular` / `services-not-to-io` の 2 件**。`no-circular` は「循環」であり FR-035 が明示的に depcruise 側に割り当てた項目 (`:379`) なので対象外。**FR-035 が ESLint 側に割り当てた「直接 import」で片側しか無いのは `services-not-to-io` の 1 件のみ。**
  - `grep -nE "^      (files|const)" eslint.config.mjs` / `grep -n "no-restricted-imports" eslint.config.mjs` → per-file override **4 件** (`:357` / `:362` / `:366` / `:371`)。`grep -nE "folder-service|runtime-store|service" eslint.config.mjs` → **0 件**。
  - `grep -rn "services-not-to-io" .` → **4 件** (`.dependency-cruiser.js:215` / `expected.mjs:106` / `AD-027:97,134`)。ESLint 側 **0 件**。
- **リスク/影響**:
  1. **FR-035 は MUST であり、「全項目」を明示している。** 1 項目が片側実装であることは FR の未達である。Round 1 C-002 は「ルールが 0 本」だったので、これは前進だが FR の要求には到達していない。
  2. **編集時フィードバックが無い。** X-1 の `SessionService` を書く実装者は、`node:fs` を import してもエディタで何も言われず、CI (または `pnpm depcruise`) まで気付けない。AD-023 §5 が「God Service への唯一の歯止め」と呼んだ規則が、最も効く時点 (書いている最中) で沈黙する。
  3. `.gate-verdict-code.json` の `lint: 0 violations` は本規則について何も示さない — Round 1 C-002 の指摘構造 (「違反 0 件か検査 0 件か区別できない」) が、depcruise から ESLint へ**場所を移して残っている**。
- **推奨アクション** (最小):
  1. `eslint.config.mjs` に override 1 ブロック (6〜8 行) を足す。`const SERVICE_FILES = ['src/main/app/folder-service.ts', 'src/main/app/runtime-store.ts']` を定義し、`{ files: SERVICE_FILES, rules: { 'no-restricted-imports': ['error', <core の綴り全列挙から assert/util/events を除いたもの>] } }`。綴り集合は既存の `*_SPELLINGS` と同じ形で作れる。
  2. `expected.mjs:105` の `detectors` を `['eslint', 'depcruise']` に、`rules` に `'no-restricted-imports'` を足す。**これで「両ツールで発火する」が実測される。**
  3. AD-027 に 1 行追記できない (accepted) なら、**この 1 点だけは AD-027 の Consequences に含まれるべきだった残余**として `plan.md` の Post-design re-check か次 round の pr-gate.md に記録する。
- **根拠**: spec FR-035 `:377-380` / AD-023 §7 のツール表 `:343-346` / AD-023 §5 `:302-309` / plan Complexity #1 `:184` / `expected.mjs:98-105` / `eslint.config.mjs:355-373`
- **scope 根拠**: `eslint.config.mjs` / `expected.mjs` はいずれも touched files。feature 内で閉じる。
- **Critical にしなかった理由**: (1) 規則は depcruise 側で**実際に発火する**ため「検査 0 件」ではない。(2) **pr-gate Round 1 の Suggested fix (私自身の推奨アクション 1) が depcruise 1 ルールしか求めていなかった** — 実装者はゲートの指示どおりに直した。自分の推奨の不足を根拠に Critical へ格上げするのは convergence rules の趣旨に反する。

---

### [High] `from` の実名列挙が **production 側 2 件の発火を一度も検証していない** — fixture は `__rulecheck__` 分岐だけを通る (H-202) (scope: feature)

**caller の問い (a) への回答本体。**

- **観察**:
  - `from.path` は 2 つの独立した枝の alternation である (`.dependency-cruiser.js:234-238`):
    `'^src/main/app/(folder-service|runtime-store)[.]ts$' + '|^src/main/app/__rulecheck__/service-io-import[.]ts$'`
  - fixture の展開先は `src/main/app/__rulecheck__/service-io-import.ts` (`expected.mjs:95`)。したがって `pnpm test:rules` が確かめるのは **第 2 の枝**だけである。**第 1 の枝 (production の 2 実名) は、発火経路として一度も通されていない。**
  - 通せる余地も無い。`folder-service.ts` / `runtime-store.ts` の core import は現在 **0 件** (`grep "from '(node:|fs|path|child_process|os|crypto)" src/main/app/` → `composition-root.ts:1` と `protocol.ts:1` の 2 件のみ、どちらも `from` の対象外)。つまり第 1 の枝は**構造的に発火しえない**。
  - これは他の規則と性質が違う。`path-module-only-from-path-api` / `domain-not-to-io` / `agents-not-to-electron` はいずれも `from` がディレクトリ指定または `pathNot` であり、**fixture が通る枝と production コードが通る枝が同一**である。`services-not-to-io` だけは 2 つの枝が交わらない。
  - 結果として AD-027 §5 の主張 (「列挙しないと『ルールはあるが発火を確かめていない』状態になり、C-001 と同じ病になる」`:119-120`) は**半分しか達成されていない**。確かめられたのは「規則が存在し、`to` セレクタが `node:crypto` を捕まえ、depcruise がこの綴りの exact-path 正規表現を評価する」ことである。確かめられていないのは「`folder-service` / `runtime-store` という**綴りが現実のモジュールパスに一致する**」ことである。
  - 一致すること自体は目視で確認できる (両ファイルは実在し、綴りも一致する)。**したがってこれは Round 1 C-002 のような「ルール不在」ではない。** 問題は、Round 1 の C-001 / C-002 がともに「目視で正しく見えるが実際には効いていなかった」事象であり (AD-025 の 5 件 / `^electron($|/)` が 1 件も一致しなかった実測 `.dependency-cruiser.js:60-64`)、**このプロジェクトは「目視で正しい」を根拠にしないと自ら決めている**ことである。
- **同種事象探索**:
  - `.dependency-cruiser.js` の本プロジェクト規則 11 件について「fixture が通る枝 = production が通る枝」かを照合 → **不一致は `services-not-to-io` の 1 件のみ**。他 10 件は `^src/domain/` / `^src/agents/` / `^src/renderer/` / `pathNot` のいずれかで、fixture も production も同じ枝を通る。
  - `grep -rn "__rulecheck__" .dependency-cruiser.js eslint.config.mjs scripts/ .gitignore` → **production 設定に `__rulecheck__` を書いているのは `.dependency-cruiser.js:237` の 1 件のみ** (他は `run.mjs:58` の `SANDBOX_DIR` 定義と後始末ガード `:139-141`)。**先例のない形である。**
  - `grep -rnE "from '(node:|fs|path|child_process|os|crypto)" src/main/app/` → **2 件** (`composition-root.ts:1` / `protocol.ts:1`)。いずれも `from` の対象外 = production 枝は発火 0。
- **リスク/影響**:
  1. `folder-service.ts` を分割・改名する変更 (400 行超なので現実的。X-1 で `SessionService` を切り出す際が最有力) が入ったとき、**`from` の第 1 枝が黙って死ぬ**。`test:rules` は 21/21 一致を報告し続ける — fixture 枝が生きているため。これは AD-024 が名指した「違反が 0 件なのではなく検査が 0 件」の再発形である。
  2. production 設定が**テスト成果物のパス名に結合**している。fixture 名を変えると `from` の第 2 枝が死に、`test:rules` が落ちる (fail-loud なので実害は小。→ L-202)。
- **推奨アクション** (最小案から):
  1. **最小 (テスト 1 本)**: `from` の第 1 枝が現実のファイルに一致することを単体テストで固定する。`.dependency-cruiser.js` を `require` して `forbidden.find(r => r.name === 'services-not-to-io').from.path` を取り出し、(a) `src/main/app/folder-service.ts` / `src/main/app/runtime-store.ts` が `existsSync` で実在し、(b) 正規表現が両パスに一致することを assert する。**8 行程度で、綴り誤りと改名の両方を落とす。** 加えて (c)「`src/main/app/*.ts` のうち可変状態 (`let` / `new Map`) を持つモジュールが `from` に列挙されていること」まで書ければ (e) の追随漏れも同時に閉じられる (→ M-201 の推奨 2 と同一作業)。
  2. **構造で閉じる案**: AD-027 が却下した代替 (`from` を `^src/main/app/` にして例外を実名で抜く) に移る。fixture 枝と production 枝が同一になるので本指摘と M-201 が同時に消える。ただし AD-027 は accepted なので、移るなら新規 ADR が要る。**今 round では推奨しない** (1 で足りる)。
- **根拠**: AD-027 §5 `:113-120` / AD-025 §9 `:168-174` / `.dependency-cruiser.js:60-64` (「1 件も一致せず黙って死ぬ」の自己記録) `:234-238` / `expected.mjs:94-107` / AD-024 Context (「違反が 0 件なのではなく検査が 0 件」) / `run.mjs:14` (「ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」)
- **scope 根拠**: `.dependency-cruiser.js` / `tests/rule-fixtures/` は touched files。

---

### [High] AD-027 が AD-025 §9 の結論と Open Question を置き換えたのに、**逆方向のリンクが 1 本も無い** — `supersedes: []` / AD-025 の見出しは今も「R-1 に対象が無い」/ Open Question は `- [ ]` (H-203) (scope: feature)

**caller の問い (b) への回答本体。**

- **観察**:
  - AD-027 frontmatter `:7` は **`supersedes: []`** である。一方 Decision §4 は AD-025 §9 の結論 (「R-1 に対象が無い」) を事実として否定し (Context `:39-59`)、Consequences `:131-134` は「**AD-025 §9 の Open Question「`services` に当たる調停クラスをどのレイヤに置くか」を閉じる。調停は `app` に置く**」と宣言する。**関係を宣言しておきながら frontmatter が「何も置き換えていない」と述べている。**
  - AD-025 側は無変更である (accepted / immutable として正しい)。その結果:
    - `docs/decisions/0025-*.md:168` の見出しは今も **「### 9. AD-023 §7 の `services ✗→ I/O モジュール直接` は R-1 に対象が無い」**。
    - `:304-305` の Open Question は **`- [ ]`** (未閉鎖) のまま。
    - AD-025 の References `:309-317` に **AD-027 は無い**。`superseded-by` フィールドも無い。
  - **AD-025 だけを読んだ後続者は「対象が無い」を accepted の結論として受け取る。** これは AD-027 が「定義変更で逃げる形になる」として明示的に却下した立場 (`:160-163`) そのものであり、ADR グラフを片方向にしたことで却下した案が読める状態になっている。
  - プロジェクトには先例と手段の両方がある。(1) AD-015 `:217` `:222-223` / AD-016 `:107` `:114` は **Open Question の `- [ ]` → `- [x]` を in-place で閉じ、閉鎖理由を書く**形をとっており、plan `:25` がその作業を宣言している (私の Round 1 H-004 でも「Decision を変えない閉鎖は許容」と区別した)。(2) MADR 4.0.0 の `superseded-by` / `supersedes` フィールドが frontmatter に用意されている。**どちらも使われていない。**
  - AD-027 は他の参照先にも登録されていない。`grep -rn "AD-027\|0027-" --glob '!**/0027-*'` → **1 件** (`touched-files.txt:32`)。plan の Domain Context ADR 表 (`:30-39`)・`plan.md:244` の「AD-025 では次を記録する」節・tasks・spec・`_overview.md`・Constitution・`.dependency-cruiser.js` のコメント (AD-025 §9 / AD-023 を引くが AD-027 は引かない `:217-225`)・`expected.mjs`・`run.mjs` のいずれにも **0 件**。`docs/decisions/` に索引ファイルは存在しない (`Glob docs/decisions/*` → ADR 27 本のみ、README なし) ので、索引側で吸収する経路も無い。
- **同種事象探索**:
  - `grep -n "supersedes\|superseded-by" docs/decisions/*.md` → 全 28 本が両フィールドを持ち、**値が入っているものは 0 件**。つまり本プロジェクトで ADR 間の置き換え関係が frontmatter に書かれた例は 1 件も無く、AD-027 が最初の該当ケースである (= 規約が未確立。私の Round 1 H-004 推奨 4「訂正経路を 1 箇所に明文化する」が未実施であることの帰結)。
  - `grep -n "対象が無" docs/decisions/0025-*.md` → **1 件** (`:168` 見出し。本文 `:170-174` も同趣旨)。
  - `grep -n "^- \[ \]" docs/decisions/0025-*.md` → **2 件** (`:302` `app` の `node:fs` / `:304` 調停クラスの置き場)。**後者は AD-027 が閉じたと宣言している当のもの。**
  - `grep -rn "AD-027\|0027-"` (本体除く) → **1 件** (`touched-files.txt:32`)。
- **リスク/影響**:
  1. **ADR が 2 つの結論を同時に持つ。** これは私の Round 1 H-004 が AD-024 について指摘した事象と**同型で、場所が ADR 内から ADR 間に移ったもの**である。R-1 の PR が「accepted ADR の記述矛盾」を 2 件持つことになる。
  2. **X-1 の実装者が AD-025 §9 を根拠に「まだ対象が無い」と判断しうる。** AD-027 の申し送り (「X-1 の `SessionService` を作るときは `from` に実名を足す」) は AD-027 を読まないと届かず、AD-027 へのリンクは repo 全体で 0 件である。(e) のリスクを増幅する。
  3. Constitution 改定手順 step 1 (「ADR で議論を記録」) と Governance (`:717-738`) は ADR を決定の SSoT と位置づけている。SSoT の**到達可能性**が担保されないと、記録の価値が git log に落ちる。
- **推奨アクション** (最小。すべて accepted ADR の Decision を変えない操作):
  1. **AD-027 の frontmatter を `supersedes: [AD-025#9]` (または既存綴りに合わせた形) に直す** — 1 行。AD-027 は本 round で新規に起票されたものであり、**frontmatter のメタデータ訂正は Decision の改変ではない**ので immutable 原則に触れない。
  2. **AD-025 `:304` の Open Question を `- [x] ~~…~~ — AD-027 §4 で決着 (調停は `app`、I/O はインタフェース経由で注入)` に閉じる** — AD-015 / AD-016 で確立した先例と同一形式。Decision Outcome は触らない。
  3. AD-025 の References に AD-027 を 1 行足す (または `superseded-by` に記載)。**§9 本文は書き換えない** — 読み替えの根拠が AD-027 側にあることが分かれば足りる。
  4. `.dependency-cruiser.js:220` の「**`from` は実名で列挙する** (AD-025 §9)」に AD-027 §4 / §5 を併記する (1 語)。`expected.mjs` の該当 fixture コメントも同様。**設定ファイルから決定へのリンクが AD-025 だけを指していると、上の 1〜3 を直しても読者が古い方へ誘導される。**
  5. Round 1 H-004 推奨 4 (訂正経路の規約を 1 箇所に明文化) は本件で**2 例目**になった。`docs/decisions/README.md` を 1 本立てて「(a) 事実誤認の訂正は新規 ADR + `supersedes` / (b) Open Question の閉鎖のみ in-place で `- [x]`」の 2 規約を書くのが最も安い。
- **根拠**: AD-027 `:7` `:39-59` `:97-120` `:131-134` `:160-163` `:168-176` / AD-025 `:168-174` `:304-305` `:309-317` / AD-015 `:217` `:222-223` / AD-016 `:107` `:114` / AD-024 #13 / Constitution 改定手順 `:147-155` + Governance `:717-738` / `reviewer-base.md` 「accepted 後 immutable な ADR」
- **scope 根拠**: `docs/decisions/0025-*.md` / `0027-*.md` はどちらも touched files。1〜4 は feature 内で閉じる。5 のみ out-of-scope 寄り (新規 governance 文書) だが 1〜4 だけで本指摘は閉じる。

---

### [High] 違反形の除去が **capability token の生成源を「8 文字以上の英数字」しか要求しない注入点**に移した (H-204) (scope: feature)

- **観察**:
  - AD-027 §4 `:108-111` は「違反形を注入に変えた。`folder-service.ts` の `randomUUID` **2 箇所 (フォルダ識別子とブラウズトークン)** を `deps.newId: () => string` に置き換え」と書く。**2 つの用途を 1 つの注入点に畳んだ**ことを ADR 自身が明示している。
  - 用途の性質は同じではない。
    - フォルダ識別子 (`folder-service.ts:212` `makeFolderId(newId)`) — **予測可能でよい**。`registry.ts:65-69` は形式 (`wf_` + 英数字 8〜24) だけを要求し、`registry.test.ts:115` は `() => 'abcdef0123456789abcdef0123456789'` という固定値で通す。
    - ブラウズトークン (`folder-service.ts:255` `const token = newId()`) — **予測不能でなければならない**。同ファイル `:269-272` が「トークンが無効・未知・他の送信元のもの・期限切れのいずれも `browse-session-expired` を返す。**どれなのかを教えない — トークンの存在有無が分かると総当たりの手掛かりになる**」と書いており、**コード自身がトークンを総当たり耐性のある秘密として扱っている**。
  - ところが注入点の契約にその要求が無い。`folder-service.ts:86-97` の docstring は「識別子の生成源」「**8 文字以上の英数字を返すこと**。`makeFolderId` が短すぎる値を拒否する」だけで、予測不能性・衝突耐性に一言も触れない。型は `() => string`。
  - 契約の弱さは既にテストで顕在化している。`folder-service.test.ts:125` が `const newId = (): string => \`testid${String(++idSeq).padStart(8,'0')}\`` を注入する — **連番**である。同じテストが `beginBrowse` の経路も通るため、**テストでは完全に予測可能なトークンが発行されている**。
  - production の結線は健全である (`composition-root.ts:80` `randomUUID().replace(/-/g,'')` = 32 桁 hex)。**現時点で実害のある経路は無い。** 併せて送信元束縛 (`:256` `senderId`) と TTL (`BROWSE_SESSION_TTL_MS`) が二重に効いている。
  - 仕様側にも要求が無い。`grep -nE "推測|乱数|ランダム|予測" spec.md data-model.md plan.md` → **3 件**、いずれも「所在を推測しない」の話でトークンとは無関係。`contracts/ipc-capability.md:221` の `token` 検証欄も「既知の有効なトークン / 有効期間内 / 発行元一致」であり、**発行側の性質**は規定していない。
- **同種事象探索**:
  - `grep -rn "newId" src/` → **6 箇所 / 3 ファイル** (`composition-root.ts:80` / `folder-service.ts:97,101,212,255` / `folder-service.test.ts:125,135`)。**セキュリティ性のある用途は `:255` の 1 件。**
  - `grep -rn "randomUUID\|node:crypto" src/` → **2 件** (`composition-root.ts:1,80`)。他に乱数源は無い。`Math.random` → `src/` 全体で **0 件**。
  - 同型 (「注入で差し替え可能になった秘密の生成源」) を他に探索: `grep -rnE "readonly (now|measure|newId|random)" src/` → 注入されている関数値は `now` / `measure` / `newId` / `runtimes` の 4 種。**秘密の生成に関わるのは `newId` のみ**。
- **リスク/影響**: (defense-in-depth。severity 表の「将来攻撃経路 / 二重防御提案の上限 = High」に該当し、Critical ではない)
  1. **契約が守りたい性質を述べていない。** X-1 が `SessionService` を作るとき `newId` を「識別子生成源」として同じ形で受け取るのが自然だが、その時点で「決定的にしたい」(テストのため) 動機と「予測不能にしたい」(capability token のため) 動機が同じ 1 つのポートに載る。AD-027 が「副産物としてテストから識別子を決定的に固定できるようになった」(`:112`) と肯定的に記録していることが、その混同を後押しする。
  2. R-1 は**最初の capability token を導入する feature**であり、ここで確立した形が R-2 以降の token (session token など) の雛形になる。
  3. `folder-service.ts:269-272` の「教えない」設計と、`:86-97` の「8 文字以上の英数字でよい」契約が同一ファイル内で食い違っている — Round 1 C-002 が指摘した「同じファイルの中で方針が割れている」の再発形である (対象が `node:fs` から乱数源に移った)。
- **推奨アクション** (最小案から。**実装を作り変えない**):
  1. **最小 (docstring 2 行 + 型名 1 つ)**: `FolderServiceDeps` の `newId` の docstring に「**ブラウズトークンの発行にも使う。暗号論的に予測不能な値を返すこと (`crypto.randomUUID` 等)。テストで連番を注入してよいのはトークンの秘匿性を前提にしないケースに限る**」を明記する。`composition-root.ts:74-80` のコメントにも同じ 1 行を置く。
  2. **より整合する案**: 用途を型で分ける — `newId: () => string` (識別子) と `newToken: () => string` (秘密) の 2 ポートにする。`composition-root.ts` では同じ `randomUUID` を両方に渡すだけなので差分は 3 行、`folder-service.test.ts` は連番を `newId` にのみ使い `newToken` には十分長い擬似乱数を渡す形になる。**AD-023 §5 の「Service はインタフェースを注入される」に沿ったまま、契約の意味を復元できる。**
  3. `contracts/ipc-capability.md:221` の `token` 行に発行側の要求 (「予測不能・十分な長さ」) を 1 行足し、`data-model.md` §5 と整合させる。
- **根拠**: AD-027 §4 `:108-112` / `folder-service.ts:86-97` `:212` `:255-256` `:269-272` / `composition-root.ts:80` / `folder-service.test.ts:125` / `registry.ts:60-69` / `contracts/ipc-capability.md:221` / AD-023 §5 `:302-309` / CWE-330 — **ただし現状の production 結線は適合しており、指摘対象は契約の記述である**
- **scope 根拠**: `src/main/app/folder-service.ts` / `composition-root.ts` / `contracts/` はすべて touched files。
- **owner の申し送り**: token の**検証**経路 (送信元束縛 / TTL / 情報非開示) は `security-reviewer` の owner 範囲であり本指摘は触れていない。重複と判定される場合は security 側に寄せてよい。本 reviewer が出す理由は、**この契約弱化が AD-027 §4 という ADR の決定によって導入された**ためである。

---

### [Medium] `from` の実名列挙が **Constitution Principle VI が禁じた「包含リスト」と同型**で、X-1 / X-3 / I-2 の追随漏れ残余が `nextFeature` 追跡の外にある (M-201) (scope: feature)

**caller の問い (e) への回答本体。**

- **観察**:
  - Constitution Principle VI Verification `:362-365` は「**除外はファイル単位の明示リストとし、ディレクトリ単位で除外してはならない — そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる**」と定める。`services-not-to-io` の `from` は逆向きの包含リストであり、**後から Service が増えたときに検証が構造的に届かない**という同じ失敗モードを持つ。
  - 追随の指示は 2 箇所にある — `.dependency-cruiser.js:224-225`「X-1 の `SessionService` / X-3 の `ProviderService` / I-2 の `ContainerService` を作るときは、ここに実名を足すこと」、AD-027 Consequences `:131-134` 同旨。**どちらも人間が読むことを前提にした散文であり、機械的な発火条件を持たない。**
  - このプロジェクトは同じクラスの残余に対して**機械強制を既に持っている**。`expected.mjs:243-256` は「`nextFeature` は必須である。理由と代替手段だけを書くと、**残余が「書いてあるから許された状態」として無期限に残る**」と定め、`run.mjs:264-273` が `why` / `mitigatedBy` / `nextFeature` / `howToClose` の欠落を**失敗として報告する**。SC-017 の追跡機構そのものである。
  - `services-not-to-io` の追随漏れ残余は、定義上この機構の対象になりうる (「機械検証で届かない範囲があり、塞ぐのは将来 feature」) のに、`UNDETECTED_NOTES` にも tasks にも roadmap にも登録されていない。
  - AD-027 が却下した代替案 (`:155-159`「`app` レイヤ全体に掛けて例外を実名で抜く。X-1 / X-3 / I-2 の Service が自動で対象に入るので**追随漏れが起きない**」) は、**本指摘と H-202 を同時に解消する案**である。却下理由は 2 つ挙がっており、(i)「AD-025 §9 が『`from` セレクタを実名で定義する』と明記」— これは**字面**であり、AD-025 §9 の趣旨は「**対象が無いルールを書いて『強制した』とは言えない**」= 対象の実在の要求である。ディレクトリ指定 + 実名例外でも対象 2 件は実在し、趣旨は満たす。(ii)「例外リストの初期メンバが 4〜6 件になる」— 妥当な工学的判断であり、**却下そのものは不合理ではない**。問題は代償 (本指摘 + H-202) が AD-027 に記録されていないことである (`:159` は「対象が増えた時点で再検討する余地はある」までで、追随漏れリスクの引き受け先を指定していない)。
- **同種事象探索**:
  - `grep -rn "実名を足す\|実名で列挙\|ここに実名" .` → **3 件** (`.dependency-cruiser.js:225` / `AD-027:101,134`)。**tasks.md / roadmap.md / `_overview.md` / 各 charter に 0 件** (`grep -rn "services-not-to-io" docs/ specs/` → 0 件)。
  - `grep -n "nextFeature" tests/rule-fixtures/expected.mjs scripts/rules/run.mjs` → **6 件**。登録されている残余は **2 件** (`ui-path-concat` → R-2 / `reuse-verified-other-distro` → I-1)。**services の追随漏れは未登録。**
  - 包含リスト構造の同種事象: `scripts/constitution/allowlists.mjs:18-24` `SCAN_FILES` (5 件の包含リスト。Round 1 H-003 で指摘済・未対応) と `.dependency-cruiser.js:234-238` の `from` の **2 件**。`EXCLUDED_FILES = []` (`:56`) は空のままで、除外リスト方式への反転はどちらも未実施。
- **リスク/影響**:
  1. X-1 は `session` domain の最初の feature であり、`SessionService` は AD-023 §5 が実名で挙げた Service の筆頭である。その実装者が `.dependency-cruiser.js` を開く必然性は無い (レイヤ規則に触らない変更だから)。**AD-023 §5 が「唯一の歯止め」と呼んだ規則を、最も必要な瞬間に外した状態で新しい Service が生まれうる。**
  2. Round 1 H-003 (`SCAN_FILES` の包含リスト) と**同じ構造の指摘が 2 件目**になった。個別に直すのではなく「包含リストを使ってよい条件」を決める段階に来ている。
- **推奨アクション** (最小案から):
  1. **最小 (1 行 × 2)**: tasks.md に X-1 の前提タスクとして「`services-not-to-io` の `from` に `SessionService` を追加し fixture を 1 件足す」を立て、AD-025 の「### X-1 へ」節が担っている申し送り位置に対応するものを **AD-027 に無い分 pr-gate.md / plan.md の Post-design re-check に**記録する。
  2. **機械で閉じる案 (推奨)**: H-202 推奨 1 のテストを 1 段拡張し、「`src/main/app/*.ts` のうち**モジュールスコープの可変状態を持つ**ファイルが `from` に列挙されていること」を assert する。判定は「`let ` または `new Map(` / `new Set(` を含む」程度の構文近似で足りる (現在該当は `folder-service.ts` / `runtime-store.ts` の 2 件。`composition-root.ts` は 0 件、`measure.ts` / `ipc.ts` も要確認のうえ除外リストに実名で置く)。**これで「後から Service が増えたときに検証が届かない」が構造的に閉じる** — Principle VI が要求する「除外を実名で持つ」形になる。
  3. 2 を採らない場合、残余を `expected.mjs` の `UNDETECTED_NOTES` 同等の形で登録し、`nextFeature: 'X-1'` / `howToClose` を書く。**このプロジェクトが自ら定めた「残余の扱い」に合わせる。**
- **根拠**: Constitution Principle VI Verification `:362-368` / AD-027 `:97-101` `:131-134` `:155-159` / AD-025 §9 `:168-174` / `expected.mjs:243-256` / `run.mjs:264-273` / AD-023 §5 `:307-309` / SC-017
- **scope 根拠**: `.dependency-cruiser.js` / `tasks.md` / `tests/rule-fixtures/` は touched files。

---

### [Medium] `to` の除外集合 3 語が `DOMAIN_PURE_CORE` 10 語と 7 語違うのに、AD-027 は「同じ考え方」と述べている (M-202) (scope: feature)

**caller の問い (c) への回答本体。**

- **観察**:
  - AD-027 §4 `:105-106`「`assert` / `util` / `events` は純粋な補助として除外する (**`domain-not-to-io` が `DOMAIN_PURE_CORE` を除いているのと同じ考え方**)」。`.dependency-cruiser.js:242-244` のコメントも同文。
  - 実際の 2 集合:
    - `DOMAIN_PURE_CORE` (`:37-48`) = `path` / `path/posix` / `path/win32` / `assert` / `util` / `url` / `querystring` / `string_decoder` / `buffer` / `events` の **10 語**
    - services 側 (`:245`) = `assert` / `util` / `events` の **3 語** (インライン配列リテラル)
  - 差分 7 語 (`path` 系 3 / `url` / `querystring` / `string_decoder` / `buffer`) は services では**禁止**になる。方向は厳しい側であり、`path` 系が禁止なのは Principle I (許可ファイルは `path-api.ts` の 1 つだけ) と一致するので**むしろ正しい**。残る 4 語 (`url` / `querystring` / `string_decoder` / `buffer`) は `DOMAIN_PURE_CORE` が「純粋な文字列・データ操作だけ」(`:32`) として認めた語であり、services で禁止する根拠が示されていない。
  - 現時点の実害は 0 件 — 両ファイルの core import は 0 (H-202 の探索)。`Buffer` / `URL` はグローバルなので import 無しで使える。
  - 集合が名前を持たない点も差である。`DOMAIN_PURE_CORE` は docstring 付きの named constant、services 側は `filter` の中のインライン配列。**「同じ考え方」を主張する 2 つが、片方は正本として名前を持ち、片方は式の中に埋まっている。**
- **同種事象探索**:
  - `.dependency-cruiser.js` 内の許可 / 除外集合: `DOMAIN_PURE_CORE` (named, docstring 有) / `ELECTRON_ALLOWED` (named) / `PATH_API` (named) / `NATIVE_MODULES` (named) / `ALL_CORE` (named) / **services の 3 語 (無名、インライン)** → 無名は **1 件のみ**。
  - `grep -rn "DOMAIN_PURE_CORE" .` → **3 件** (`.dependency-cruiser.js:37,210,243`)。うち `:243` は**コメントからの参照**であり、`:245` の実コードは `DOMAIN_PURE_CORE` を使っていない。
  - Constitution Principle VI の `allowlist_source` (`:326`) が「正本。**追加には ADR を要する**」と定めるのは `scripts/constitution/allowlists.mjs` のみで、depcruise 側の許可集合は対象外 (これは drift ではない。念のため照合した)。
- **リスク/影響**: 後続者が「services でも `buffer` を使いたい」となったとき、AD-027 の「同じ考え方」を信じて `DOMAIN_PURE_CORE` に足す → **services 側は何も変わらない** (別の式だから) → 「設定を書いたのに効かない」が再生産される。これは AD-025 が実測で 5 件挙げ、AD-027 が閉じようとした症状そのものである。
- **推奨アクション** (最小):
  1. **最小 (3 行)**: `const SERVICE_PURE_CORE = ['assert', 'util', 'events']` を `DOMAIN_PURE_CORE` の直下に置き、docstring に「**`DOMAIN_PURE_CORE` より狭い。`path` 系は Principle I の許可ファイル 1 つに限るため、`url` / `querystring` / `string_decoder` / `buffer` は調停クラスに必要な実例が無いため含めない。必要が生じた時点でここに足す**」と書く。`:245` はこの定数を参照する。
  2. AD-027 は accepted なので本文は変えない。上記 docstring が「同じ考え方」の実体を説明する位置になる。
- **根拠**: AD-027 §4 `:105-106` / `.dependency-cruiser.js:31-48` `:210` `:240-246` / AD-025 Consequences `:187-202` / Constitution Principle I / Principle VI `allowlist_source`
- **scope 根拠**: `.dependency-cruiser.js` は touched file。

---

### [Medium] plan.md が **falsified された「R-1 に対象が無い」を保持**し、AD-027 への参照が spec / plan / tasks に 0 件 (M-203) (scope: feature)

- **観察**:
  - `plan.md:300-303` は今も「**AD-023 §7 の `services ✗→ I/O モジュール直接` は R-1 に対象が無い** — AD-023 §5 が UseCase レイヤを作らないと決めており、`services` に当たるディレクトリが存在しない。**対象が無いルールを書いて『強制した』とは言えない**ので、最初の調停クラスを作る feature で `from` セレクタを実名で定義する」と書く。AD-027 Context `:44-51` は「**その feature は R-1 である**」「調停クラスが 2 つある」「違反形が既に 1 件入っていた」としてこの記述を否定した。
  - pr-gate Round 1 の Suggested fix (3) は「履行した事実を**新規 ADR か plan の Post-design re-check に記録する**」の二択を示し、実装は前者を採った。**選ばれなかった後者の側が、古い主張を保持したまま残っている。**
  - AD-027 への参照が feature 文書に 0 件 (H-203 の探索と同じ)。`plan.md:30-39` の Domain Context ADR 表にも、`plan.md:244` の「AD-025 では次を記録する」節にも、`tasks.md` にも無い。結果として **AD-027 に紐づく task ID が存在しない** — これは私の Round 1 H-002 が chat 画面について指摘した「tasks に 0 件でトレーサビリティが無い」と同じ形である。
  - `plan.md:100` が「Constitution v1.1.0 に基づく」のままである点は Round 1 M-004 として既出 (未対応)。
- **同種事象探索**:
  - `grep -rn "AD-027\|0027-"` (ADR 本体除く) → **1 件** (`touched-files.txt:32`)。
  - `grep -n "対象が無い" specs/001-*/plan.md` → **1 件** (`:300`)。`grep -rn "対象が無" specs/001-*/` → plan `:300` / spec 側 0 件。
  - `grep -nE "services|調停" specs/001-*/tasks.md` → **0 件**。AD-027 の決定 5 件 (§1〜§5) に対応する task ID は 0。
- **リスク/影響**: (a) plan.md は R-2 以降の plan の書式基準になる (AD-024 Consequences `:161-163` が警告した経路)。「対象が無いから書かない」の実例として**誤った先例**が残る。(b) `expected.mjs:272` の `UNDETECTED_NOTES` が「**対象の無いルールを書いて『強制した』とは数えない。AD-025 §9 と同じ扱い**」として `ui-path-concat` を R-2 に送る論拠に AD-025 §9 を引いている — §9 の結論が覆った以上、この論拠も「§9 の**趣旨**を引く」形に読み替える必要がある (実質は妥当なので文言のみ)。
- **推奨アクション**: (1) `plan.md:300-303` を「**AD-027 で決着。R-1 に調停クラスが 2 件あり、`from` を実名で定義した (§4) / 違反形は注入に置換した**」に差し替える (3 行)。(2) `plan.md:30-39` の ADR 表に AD-025 / AD-026 / AD-027 の 3 行を足す (本 feature が起票した 3 本がどれも表に無い)。(3) tasks.md に AD-027 の 5 決定に対応する事後タスク 1 本を立てる。(4) `expected.mjs:272` の「AD-025 §9 と同じ扱い」を「AD-025 §9 / AD-027 が確立した扱い」に 1 語直す。
- **根拠**: plan `:300-303` `:30-39` / AD-027 Context `:39-59` + Decision §4 / pr-gate.md `:63` Suggested fix (3) / `expected.mjs:272` / AD-024 Consequences `:161-163`
- **scope 根拠**: plan / tasks / `expected.mjs` はすべて touched files。

---

### [Medium] SC-008 を担保する唯一の機構に**再現しない不一致 5 件**が記録され、対応が「診断出力を足す」で閉じられている (M-204) (scope: feature)

- **観察**:
  - AD-027 Consequences `:139-144`「**原因を特定できなかった事象が 1 件ある。** 1 件ずつに分けた直後の初回実行で 5 件の不一致が出たが、再実行では 21 件すべて一致し**再現しなかった**。… 初回実行時は診断出力が無かったため事後に切り分けられない。決定 3 の診断出力はこの事象への対応である」。**記録は誠実である**。判定の対象は、その対応で SC-008 の主張が保たれるかである。
  - 決定 3 (`:90-95`) が足したのは `exit:<code>/<bytes>` の進捗出力と `code === null` の専用扱いである。これは**事後の切り分けを可能にする**が、(a) 実行を決定的にせず、(b) flaky に落ちたときの扱い (再実行の可否 / quarantine) を定めていない。
  - `test:rules` は CI の必須ステップである (`.github/workflows/verify.yml:81-82`)。**flaky な赤が出た場合の既定の行動は「再実行して緑にする」**であり、それは「緑が何も意味しない」= AD-025 / AD-027 が閉じようとした症状そのものに戻る経路である。
  - 非決定性の供給源は構造の中にある。`run.mjs:153-179` は 1 イテレーションあたり最大 5 プロセス (`npx eslint` / `npx depcruise` / `node check.mjs` / `npx tsc` × 2) を**並行に**起動し、21 イテレーションで **`npx` 起動が最大 ~60 回**になる。`npx` は毎回パッケージ解決を行い、Windows ランナー上ではファイルロック / AV スキャンの影響を受けやすい。`node_modules/.bin` を直接叩く (または vitest から API で呼ぶ) 形にすれば、この供給源は構造的に消える。
  - 併せて所要時間の問題がある (AD-027 自身が `:124-126` で認めている)。CI ジョブに `timeout-minutes` が無く (`verify.yml` 全文に 0 件)、既定 360 分になる (→ L-201)。
- **同種事象探索**:
  - `grep -rn "再現しな\|flaky\|再実行" docs/decisions/ scripts/ .github/` → **2 件** (`AD-027:140,143`)。**flaky の扱いを定めた記述は repo 全体で 0 件。**
  - `grep -n "npx" scripts/rules/run.mjs` → **5 件** (`:159` `:162` `:171` `:172` + `run()` の呼び出し形)。`grep -rn "node_modules/.bin" scripts/` → **0 件**。
  - `grep -n "timeout-minutes" .github/workflows/verify.yml` → **0 件**。
  - 同型 (「検証機構自身の信頼性」) を他に探索: `pnpm test` / `lint` / `depcruise` / `check:constitution` はいずれも単一プロセスで決定的。**非決定性が記録されているのは `test:rules` の 1 件のみ。**
- **リスク/影響**: SC-008 (「違反サンプルの全数検出」) と Constitution `:673-676` (「**『違反 0』だけでは足りない**。`pnpm test:rules` が … 期待した検出器が実際に発火することを毎回確かめる」) の両方が、この 1 機構に全依存している。機構が時々偽陰性 / 偽陽性を出すなら、依存している主張の強さがその分下がる。**現時点で観察されているのは「1 度不一致が出て再現しなかった」だけなので Critical / High ではない。**
- **推奨アクション** (最小):
  1. **最小 (2 行)**: `run.mjs` の `run()` を `npx <bin>` から `node_modules/.bin/<bin>` (Windows は `.cmd`) 直叩きに変える。`npx` のパッケージ解決 ~60 回が消え、所要時間も縮む。
  2. CI に `timeout-minutes: 30` 程度を置く (→ L-201 と同一作業)。
  3. **flaky の扱いを 1 行決める** — 「`test:rules` の赤は再実行で消えても緑と扱わない。原因が特定できるまで `pr-gate` を通さない」を AD-027 に書けない (accepted) ので、`run.mjs` の docstring か `docs/discovery.md` の検証節に置く。**再実行を許す運用を明文化しないことが、この機構の主張を守る最小の手段である。**
- **根拠**: AD-027 `:90-95` `:122-126` `:139-144` / `run.mjs:35-41` `:153-195` `:344-360` / `.github/workflows/verify.yml:78-82` / Constitution Existing violations summary `:664-676` / SC-008
- **scope 根拠**: `scripts/rules/run.mjs` / `verify.yml` は touched files。
- **owner の申し送り**: Round 1 C-001 の origin は `platform-boundary-reviewer` であり、`run.mjs` の照合ロジック自体はそちらの owner 範囲です。本指摘は「機構の非決定性が SC-008 の主張を弱める」という H カテゴリの観察に限定しており、照合ロジックの正しさには触れていません。重複と判定される場合は platform-boundary 側に寄せてよい。

---

### [Medium] `services-not-to-io` は **core モジュール直接**のみを見ており、「`infra` の実装を自分で取りに行く」経路は無検証 (M-205) (scope: feature)

- **観察**:
  - AD-023 §5 `:307-309` の趣旨は「**Service はインタフェースを注入され、`domain` の純粋関数を呼ぶだけにする。これが肥大化 (God Service) への唯一の歯止め**」である。§7 の行 `:340` は `services ─✗→ I/O モジュール直接   インタフェース経由を強制`。
  - 実装された規則は `to: { dependencyTypes: ['core'], path: coreRe(...) }` (`.dependency-cruiser.js:239-246`) であり、**Node 標準モジュールへの直接 import のみ**を見る。`folder-service.ts` が `../infra/fs/host-fs` の `createHostFileSystem` を**値として**直接 import して自分で構築する形 (= まさに「自分で取りに行く」) は捕まらない。`app → infra` は AD-023 の許可行列で許されているため、他のどの規則にも掛からない。
  - 現状は健全である。`folder-service.ts:31-32` は `infra` を **`import type` だけ**で参照している (`HostFileSystem` / `FolderStore` / `RestoreIssues`)。実体は全て `composition-root.ts:66-81` が注入する。**違反は 0 件。**
  - 表現手段は存在する。depcruise は `tsPreCompilationDeps: true` (`:315`) のため型 import もグラフに乗るが、`dependencyTypesNot: ['type-only']` で値依存だけを選べる。`from: <services>, to: { path: '^src/main/infra/', dependencyTypesNot: ['type-only'] }` が「Service は `infra` の実装を値として import しない」を表す。
  - AD-027 はこの残余に触れていない (`grep -n "infra" docs/decisions/0027-*.md` → **0 件**)。
- **同種事象探索**:
  - `grep -rn "from '\.\./infra" src/main/app/` → **6 件**。うち `import type` でないもの = 値 import は **4 件**、すべて `composition-root.ts:8-12` (結線層。これが役割)。**調停クラス 2 件からの値 import は 0 件。**
  - `grep -n "dependencyTypesNot" .dependency-cruiser.js` → **1 件** (`:134` `no-duplicate-dep-types`)。type-only を使った規則は他に無い。
- **リスク/影響**: 「唯一の歯止め」が実際に塞いでいるのは core モジュール直接 import だけであり、God Service の主要経路 (`infra` の実装を自分で new する / sibling の `app` モジュール経由で I/O に届く) は開いている。`app` は `node:fs` を直接使える (AD-025 §8) ので、`folder-service.ts` が `./some-helper` (fs を使う) を import すれば実質的に I/O を取りに行ける。**現時点で違反 0 件なので Medium。**
- **推奨アクション**: (1) 上記 `dependencyTypesNot: ['type-only']` 版の規則を `services-not-to-io` の隣に 1 本足し、fixture 1 件で発火確認する。(2) 足さない場合は、**規則が塞いでいる範囲と塞いでいない範囲を `.dependency-cruiser.js:216-225` のコメントに明記する** — 「唯一の歯止め」という強い表現だけが残る形を避ける。
- **根拠**: AD-023 §5 `:302-309` / §7 `:340` / `.dependency-cruiser.js:214-247` `:315` / `folder-service.ts:31-34` / `composition-root.ts:8-12` / AD-025 §8 `:150-166`
- **scope 根拠**: `.dependency-cruiser.js` は touched file。

---

### [Low] CI に `timeout-minutes` が無いまま `test:rules` の検証回数が 20 倍になった (L-201) (scope: feature)

- **観察**: AD-027 Consequences `:124-126` が「**所要時間が伸びる。** 検証回数が 20 倍になる。… CI の所要時間に直接乗る」と認めている。`verify.yml` は `timeout-minutes` を持たず (全文 0 件) 既定 360 分、`matrix` は node 24 / 26 の 2 本 (`:36-41`)。1 イテレーションで `npx` 起動が最大 5 回 × 21 件 (M-204)。
- **同種事象探索**: `grep -rn "timeout" .github/` → **0 件**。`grep -n "steps:" -A 30 verify.yml` → ステップ 9 本、うち `test:rules` が最長になる見込み。
- **リスク/影響**: ハング時に 360 分 × 2 ジョブを消費する。実害は運用コストのみ。
- **推奨アクション**: `verify.yml` の `jobs.verify` に `timeout-minutes: 30` を 1 行。M-204 推奨 1 (npx 除去) と同時に入れる。
- **根拠**: AD-027 `:124-126` / `.github/workflows/verify.yml:28-45`
- **scope 根拠**: `verify.yml` は touched file。

### [Low] AD-027 §4 の「含めない」という記述が denylist を前提にしており、実装 (allowlist) では空転している + production 設定が fixture 名に結合 (L-202) (scope: feature)

- **観察**: AD-027 §4 `:103-104`「結線層 (`composition-root.ts`) と Electron 境界 (`window.ts` / `protocol.ts` / `index.ts`) は**含めない** — そちらは I/O を解決して渡すのが役割である」。実装の `from` は 2 実名 + fixture 1 件の**包含リスト**なので、列挙していないファイルは自動的に対象外であり、「含めない」という判断は設定上どこにも現れない。**判断そのものは正しい (問い (d) の回答どおり)** が、記述は実装と対応していない — 将来 `from` をディレクトリ指定に変える (M-201 推奨 2 / AD-027 が却下した代替) ときに初めて意味を持つ文である。
- 併せて `.dependency-cruiser.js:237` が fixture ファイル名 `service-io-import` に結合している。fixture を改名すると `from` の第 2 枝が死に、`test:rules` が落ちる (**fail-loud なので Low**)。
- **同種事象探索**: `grep -rn "__rulecheck__" .dependency-cruiser.js eslint.config.mjs` → **1 件** (`:237`)。他 10 規則は fixture 名に結合していない。
- **推奨アクション**: `.dependency-cruiser.js:227-233` のコメントに「**この `from` は包含リストである。列挙していないファイルは自動的に対象外** (AD-027 §4 の『含めない』は、ディレクトリ指定に移す場合の方針として読む)」を 1 行足す。fixture 名の結合は `expected.mjs` 側にも「この名前は `.dependency-cruiser.js:237` と対である」を 1 行書けば十分。
- **根拠**: AD-027 §4 `:103-104` / §5 `:113-120` / `.dependency-cruiser.js:227-238`
- **scope 根拠**: `.dependency-cruiser.js` / `expected.mjs` は touched files。

---

## Round 1 継承 — High 4 件の判定 (**4 件すべて未対応。実文で再確認**)

| ID | Round 1 の要求 | HEAD の実測 | 判定 |
|---|---|---|---|
| **C-002** (Critical) | `services-not-to-io` の追加 / `randomUUID` の注入 / fixture 1 件 / 履行記録 | `.dependency-cruiser.js:214-247` に規則あり ✓ / `folder-service.ts:97` `:212` `:255` + `composition-root.ts:80` で注入 ✓ / `tests/rule-fixtures/a-direct/service-io-import.ts.fixture` + `expected.mjs:94-107` で発火実測 ✓ / AD-027 で履行記録 ✓ / **AD-025 の in-place 改変なし** ✓ | **resolved (Critical 解消)**。残余は H-201 / H-202 / H-203 / H-204 / M-201 / M-202 / M-203 / M-205 / L-202 に分解して再掲 |
| **H-001** Principle VIII の `existing_violations: 0` が合格と見分けられない | metadata を `pending` 相当に改める (PATCH v1.2.3) + `bad_pattern_grep` 2 件の triage 記録 | Constitution frontmatter は **v1.2.2 のまま** (`:3`)。Principle VIII の Adoption metadata `:420-421` は `existing_violations: 0` / `violation_threshold: 0` のまま。`:699-706` の VIII 節に 3 状態の記述 0 件 | **unresolved**。severity 据え置き (**High**) |
| **H-002** chat 画面が FR-033 / charter に反して出荷されている | charter + spec + tasks への事後記録、または `features/chat/` を R-3 へ | `grep -cE "chat\|Chat\|Thread\|composer" tasks.md` → **0**。spec FR-033 / `[ASSUMED] 3 画面` 無変更。`App.tsx` 4 画面のまま | **unresolved**。severity 据え置き (**High**)。AskUserQuestion gated (domain 帰属) |
| **H-003** Principle VI / FR-037 の検証スコープに CI 定義が無い | `SCAN_FILES` に `.github/workflows/verify.yml` を追加 (1 行) | `allowlists.mjs:18-24` `SCAN_FILES` は **5 件のまま**。`:56` `EXCLUDED_FILES = []`。`grep -rn "github\|workflow" scripts/` → **0 件** | **unresolved**。severity 据え置き (**High**)。**M-201 で 2 例目の同型 (包含リスト) が出たため、反転の価値が上がった** |
| **H-004** AD-024 `:251` の 1 行訂正 + 項目数の不統一 | `:251` を訂正、項目数を 18 に統一、訂正経路の規約を明文化 | AD-024 `:249-251` は今も「**(A) は対象が無く**、(B) は R-2 の E2E 基盤に相乗りする」。`:53` = 18 件 / Constitution `:55` = 17 項目 / tasks `:85` `:415` = 17 項目 / plan `:190` の表 = 17 行 (無変更) | **unresolved**。severity 据え置き (**High**)。**H-203 で 2 例目 (AD 間のリンク欠落) が出たため、推奨 4 (訂正経路の規約化) の優先度が上がった** |

**Round 1 Medium / Low の再確認** (いずれも **unresolved**、severity 据え置き):

| ID | 再確認の実測 |
|---|---|
| M-001 `_overview.md` の Principle II 行に `platform-ok` 例外なし | `grep -rn "platform-ok" docs/domains/` → **0 件** |
| M-002 `discovery.md` の「R-1 時点の実測値」が陳腐化 | `discovery.md:157` `:159` = 114 modules / 395 deps / 11 files 213 passed のまま (HEAD は 118 / 416 / 15 files 264 passed) |
| M-003 `resolution.ts` が ui 到達不可なのに記述なし | `grep -n "ui から import できない" plan.md src/domain/workspace/resolution.ts` → **0 件** |
| M-004 plan `:100` が v1.1.0 / `:113` VIII 行が「composer は X-2」 | 両方無変更 |
| M-005 `ChatScreen.test.tsx` ケース 2 が `isComposing` を立てていない | `grep -rn "isComposing" src/` → **0 件** |
| M-006 glossary に `FolderRuntimeResolution` / `VerifiedRunning` / `PathDTO` の canonical 見出しなし | `grep -c` → **1 件** (Round 1 と同値) |
| L-001 AD-024 の項目数 18 / 17 | `:53` = 18、他 4 箇所 = 17 (無変更) |
| L-002 plan が「charter 側を改める」と宣言した 3 件のうち 2 件が残置 | `runtime/charter.md:36` / `:41` ともに In scope に残る |
| L-003 FR-001 の「ホスト OS の判定はランタイム実装の内側」に対応する判定が 0 件 | `grep -c` → **0 件** (申し送りコメント未追加) |

---

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-002 (解消確認) | `grep -rn "services-not-to-io" .` | **4** | `.dependency-cruiser.js:215` / `expected.mjs:106` / `AD-027:97,134` |
| C-002 (解消確認) | `grep -rnE "from '(node:\|fs\|path\|child_process\|os\|crypto)" src/main/app/` | **2** (調停クラスから **0**) | `composition-root.ts:1` (結線層。`from` 対象外) / `protocol.ts:1` (AD-025 §8 が許可) |
| H-201 | depcruise の本プロジェクト規則 11 件を ESLint 側の有無で照合 | ESLint 対応物なし **2** / うち FR-035 違反 **1** | `services-not-to-io` (`.dependency-cruiser.js:215`)。`no-circular` は FR-035 が depcruise 側に割り当て |
| H-201 | `grep -nE "folder-service\|runtime-store\|service" eslint.config.mjs` | **0** | — (ESLint 側にルール不在) |
| H-201 | `grep -n "no-restricted-imports" eslint.config.mjs` (per-file override) | **4** | `:357` / `:362` / `:366` / `:371` (同イディオムで表現可能) |
| H-202 | 11 規則について「fixture が通る枝 = production が通る枝」を照合 | 不一致 **1** | `.dependency-cruiser.js:234-238` (2 枝が交わらない) |
| H-202 | `grep -rn "__rulecheck__" .dependency-cruiser.js eslint.config.mjs` | **1** | `.dependency-cruiser.js:237` (production 設定に test path。先例なし) |
| H-203 | `grep -rn "AD-027\|0027-"` (ADR 本体除く) | **1** | `touched-files.txt:32` のみ (plan / tasks / spec / 他 ADR / 設定に **0**) |
| H-203 | `grep -n "supersedes\|superseded-by" docs/decisions/*.md` | 28 本すべて保有 / **値入り 0** | `AD-027:7` `supersedes: []` |
| H-203 | `grep -n "^- \[ \]" docs/decisions/0025-*.md` | **2** (うち 1 は AD-027 が閉じたと宣言) | `0025-*.md:302` / **`:304`** |
| H-203 | `grep -n "対象が無" docs/decisions/0025-*.md` | **1** | `0025-*.md:168` (見出し。本文 `:170-174`) |
| H-204 | `grep -rn "newId" src/` | **6** (秘密用途 **1**) | `composition-root.ts:80` / `folder-service.ts:97,101,212,255` / `folder-service.test.ts:125,135` |
| H-204 | `grep -rn "randomUUID\|Math.random" src/` | **2** / **0** | `composition-root.ts:1,80` |
| H-204 | `grep -nE "推測\|乱数\|ランダム\|予測" spec.md data-model.md plan.md` | **3** (token 無関係) | `data-model.md:76,309` / `spec.md:443` |
| M-201 | `grep -rn "services-not-to-io" docs/ specs/` | **0** | — (tasks / roadmap / charter に申し送りなし) |
| M-201 | `grep -n "nextFeature" expected.mjs run.mjs` | **6** (登録残余 **2**) | `ui-path-concat` → R-2 / `reuse-verified-other-distro` → I-1。services は未登録 |
| M-201 | 包含リスト構造の同種事象 | **2** | `allowlists.mjs:18-24` (Round 1 H-003) / `.dependency-cruiser.js:234-238` |
| M-202 | `grep -rn "DOMAIN_PURE_CORE" .` | **3** (`:243` はコメント) | `.dependency-cruiser.js:37,210,243` — `:245` は別式 |
| M-202 | `.dependency-cruiser.js` 内の許可 / 除外集合の名前付き有無 | 無名 **1** / 名前付き 5 | `:245` のインライン配列 |
| M-203 | `grep -n "対象が無い" specs/001-*/plan.md` | **1** | `plan.md:300` (falsified) |
| M-203 | `grep -nE "services\|調停" specs/001-*/tasks.md` | **0** | — (AD-027 に対応する task ID なし) |
| M-204 | `grep -rn "再現しな\|flaky\|再実行" docs/decisions/ scripts/ .github/` | **2** (扱いの定義 **0**) | `AD-027:140,143` |
| M-204 | `grep -n "npx" scripts/rules/run.mjs` | **5** (最大 ~60 回 spawn) | `:159` `:162` `:171` `:172` |
| M-205 | `grep -rn "from '\.\./infra" src/main/app/` | **6** (値 import **4**、すべて結線層) | `composition-root.ts:8-12`。調停 2 件は `import type` のみ (`folder-service.ts:31-32`) |
| M-205 | `grep -n "dependencyTypesNot" .dependency-cruiser.js` | **1** | `:134` のみ (type-only 除外の規則は未使用) |
| L-201 | `grep -rn "timeout" .github/` | **0** | `verify.yml:28-45` |
| H-001 (継承) | `grep -n "existing_violations" .specify/memory/constitution.md` + VIII 節 | 13 / 3 状態適用 **0** | `:420` `:699-706` (無変更) |
| H-003 (継承) | `grep -rn "github\|workflow" scripts/` | **0** | `allowlists.mjs:18-24` (無変更) |
| H-004 (継承) | `grep -n "対象が無" docs/decisions/0024-*.md` | 3 (未追随 **1**) | `0024-*.md:251` (無変更) |

## Verdict

**新規 (Round 2)**

- Critical: **0**
- High: **4** (H-201 / H-202 / H-203 / H-204)
- Medium: **5** (M-201 〜 M-205)
- Low: **2** (L-201 / L-202)

**Round 1 からの継承**

- Critical: resolved **1** (C-002) / unresolved **0**
- High: resolved **0** / unresolved **4** (H-001 / H-002 / H-003 / H-004。すべて実文で未対応を確認、severity 据え置き)
- Medium: unresolved **6** (M-001 〜 M-006)
- Low: unresolved **3** (L-001 〜 L-003)

**合計 (本 round 時点で open)**

- Critical: **0**
- High: **8**
- Medium: **11**
- Low: **5**
- Round inheritance: **resolved from Round 1: 1 (C-002) / unresolved: 13 / new: 11**

**severity 格上げは 0 件。** 前 Round で High だったものを Critical にしていない。新規 High 4 件はいずれも本 round の修正コミット (`cfec16b` / `ca6f2ce`) と新規 ADR (AD-027) によって初めて観察可能になった事実に基づく。

---

## 最小修正セット (推奨順)

1. **H-203** — AD-027 frontmatter `supersedes` を埋める (1 行) + AD-025 `:304` の Open Question を `- [x]` で閉じる (先例どおり) + AD-025 References に 1 行 + `.dependency-cruiser.js:220` の参照に AD-027 を併記。**4 箇所すべて 1 行以下。accepted ADR の Decision を一切変えない。**
2. **H-201** — `eslint.config.mjs` に override 1 ブロック (6〜8 行) + `expected.mjs` の `detectors` / `rules` を更新。FR-035 の MUST が閉じる。
3. **H-202** — `.dependency-cruiser.js` の `from` が実在ファイルに一致することを確かめる単体テスト 1 本 (8 行)。**M-201 推奨 2 まで書けば (e) も同時に閉じる。**
4. **H-003** (継承) — `SCAN_FILES` に CI 定義 1 行。**M-201 と合わせて「包含リストを除外リストへ反転する」を 1 度で片付ける価値が出た。**
5. **H-004** (継承) — AD-024 `:251` の 1 行訂正 + 項目数統一。**H-203 推奨 5 (訂正経路の規約化) と同時に。**
6. **H-001** (継承) — Principle VIII metadata を `pending` に (PATCH v1.2.3。M-005 の文言修正を同梱)。
7. **H-204** — `newId` の docstring 2 行 (最小) か `newToken` への分離 3 行。
8. **M-201 〜 M-205 / M-001 〜 M-006 / L-201 / L-202 / L-001 〜 L-003** — いずれも 1〜3 行の文書 / 設定修正。
9. **H-002** (継承) — **人間判断が要る唯一の項目** (AskUserQuestion gated。domain 帰属の変更)。

**1〜8 はいずれも実装の作り変えを伴わない。** 7 のみコード 3 行。
