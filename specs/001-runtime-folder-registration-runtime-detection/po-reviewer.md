# po-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: po-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 1 (pr-gate) — design-gate の po-reviewer.md は round 4 として継承

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため
> (Read / Grep / Glob のみ)、reviewer の最終報告を pr-gate が保存したものである。

---

## 初回読了 viewpoint

**FR/SC**: 本 PR は FR-001〜FR-048 / SC-001〜SC-018 の**全件**が実装対象 (R-1 は feature 1 本 = リポジトリ全体)。
本 review が指摘に使ったのは FR-003 / FR-009 / FR-010 / FR-017 / FR-028 / FR-030 / FR-033 / FR-044 / FR-047、
SC-002 / SC-003 / SC-004 / SC-005 / SC-008 / SC-011 / SC-012 / SC-013 / SC-014 / SC-016 / SC-018。

**touched files に該当する charter / Confirmation**:
- `docs/domains/runtime/charter.md` — Mission / KPI (パス変換 100% / WSL 取りこぼし 0 / capabilities 正直表明) → SC-001 / SC-002 / SC-003
- `docs/domains/ui/charter.md` — Out of scope 追記 (他 domain の操作 UI は各 domain が持つ) → 4 画面構成に影響
- `docs/domains/session/charter.md` / `isolation/charter.md` — R-2 / I-3 への申し送り (本 review では繰り延べ明示性の確認に使用)
- `.specify/memory/constitution.md` Principle VIII Verification — SC-011 の唯一の自動検証経路が R-2 に繰り延べ済み

**viewpoint severity 集計**:

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲 (`shell.openExternal` に renderer 由来 URL が渡る経路を観察したが cat A/B のため報告しない)
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲 (`WslAvailability` の glossary 未登録は code-gate convention C-005 で既出)
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲
- E. User Story / SC / AC / UX: Critical:0 High:8 Medium:5 Low:2
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲 (code-gate iteration 2 で実施済み)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: `a11y-reviewer` / `ux-reviewer` が code-gate iteration 2 で実施済み。重複回避
- H. テスト / coverage / observability / regression: High:1 Medium:2 Low:0 (E と重複計上しない。H-004 / M-002 / M-003 が該当)

**重複抑制の確認**: `.gate-verdict-code.json` の `iter1_must_fix_resolution` (MF-001〜MF-007) と
`code-gate.md` の SHOULD_FIX 30 件 / CONSIDER 22 件を読了。MF-001〜MF-007 の**指摘行そのもの**は
再指摘していない。**code-gate の viewpoint E は `該当なし: pr-gate 専任` であり、
PO 観点でコードを見たのは本 round が初回である。**

---

## スコープ要約

R-1 は 199 files / +37,337 の「プロジェクト初期化 + `runtime` domain 最下層」であり、
US-1〜US-5 と FR-001〜FR-048 / SC-001〜SC-018 を 1 本で背負う。
機械検証 (lint / typecheck / depcruise / check:constitution / test 264 / test:rules 20) は全緑、
design-gate の po 指摘 4 件のうち **3 件は spec・実装・テストの 3 点で完全に閉じている**。
一方で、**SC の「計測経路」として spec 自身が指定した実機検証が `quickstart-results.md` で
打ち切られており、SC-002 / SC-003 / SC-011 / SC-014 は "達成" を主張する根拠が 0 件**である。
加えて **spec.md / tasks.md が実装と食い違ったまま残っている箇所が 2 つ** (FR-033 の chat Element、
FE-030 の「選択 UI」) あり、README は R-1 を "one completed feature" と宣言している。

---

## design-gate po-reviewer.md (round 4) の解消状況

| ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| C-001 | 到達可能エントリの登録解除導線が無い | **解消** | spec.md:318-324 で FR-017 を「解除操作は全エントリ / 勧める表示は `unreachable` だけ」に 2 層分解。US-2 AS-8 に「**到達可能なものを含む**」追加 (spec.md:104-105)。実装 `WorkspaceFoldersScreen.tsx` が全エントリに「登録を解除」を出し、`ResolutionScreen.test.tsx:339-360` が「`blocked` には解除を勧めないが解除操作は出る」を固定。**文面・実装・回帰テストの 3 点が揃っている** |
| C-002 | `path-not-mapped` × 停止中で「起動せよ」→ 黙って消える | **解消** | FR-028 に「解消手順の実行後 `unreachable` に確定したら消すと同時に理由を提示」追加 (spec.md:355-358)。US-3 AS-10 新設 (spec.md:156-158)。文言を断定から「**使えるかどうかが分かります**」へ (`labels.ts:36-42`)。`resolution.test.ts:329` + `ResolutionScreen.tsx:329-349` の `resolution-excluded` 枠 + test (a2) |
| H-001 | SC-008 の拘束句が 3 本にしか及ばない | **文面は解消 / 証拠は再発** | SC-008 に「該当する AC を 3 つだけ列挙する形にしない」が入り (spec.md:490-495)、quickstart V-4 に「AC-1〜AC-11 が名指す経路 → 全数検出」行が追加された。**しかし AC-2 の「ネイティブモジュール」半分に fixture が 0 件** → 下記 H-004 |
| M-001 | `probe-failed` が一覧画面に無い | **解消** | tasks.md:189 FE-010 に「**判定失敗 (再検出の導線つき)**」。`RuntimeListScreen.tsx:103,148-153` が `isFailed` を専用文と再判定/再検出導線で提示。quickstart V-1 に「判定失敗」行 (quickstart.md:65) |

**resolved 3 / partially 1 / unresolved 0。** round 4 の指摘が「移設」で終わった箇所は無い。

---

## 依頼された 6 点への判定

1. **US-1〜US-4 の価値**: US-1 / US-3 / US-4 は**成立している** (`resolution.test.ts` 38 ケースが 3 段判定の全セルを、`path-api.test.ts` が SC-001 の 12 ケースを、`test:rules` が 20 fixture を押さえている)。**US-2 だけが実装は在るが検証が空洞**で、UI 側 AC 14 本のうち自動テストがあるのは 3 本 (→ H-006)。US-3 は「選ぶ」という行為が実装に存在しない (→ M-005)。
2. **SC の計測**: SC-001 / SC-006 / SC-007 / SC-009 / SC-010 / SC-015 / SC-017 / SC-018 は **spec が定めた計測経路で達成済み**。**SC-002 / SC-003 / SC-011 / SC-014 は証拠 0 件** (H-001〜H-003, H-008)。SC-004 / SC-005 / SC-013 / SC-016 は**部分達成または計測経路のずれ** (M-001〜M-004)。SC-008 は**主張と証拠が食い違う** (H-004)。
3. **AC の自動/手動の切り分け**: US-1 / US-3 / US-4 は妥当。**US-2 は逃がしすぎ** — ネイティブダイアログと WSL 停止操作が要るものだけを手動に置くべきところ、重複登録・日本語表示・空状態・権限エラー・復元まで手動側に落ちている (H-006)。
4. **ChatScreen は SC-012 を満たすか**: **SC-012 の対象は `README.md` と `LICENSE` だけ**なので、chat 画面は SC-012 の違反にも適合にもならない。表現そのものは妥当と判定する (`isDisabled: true` で送信経路を閉じ、`role="note"` で送信**前**に告知し、nav ラベルが `会話 (準備中)`、`onNew` が黙って握り潰さず throw する — 4 点すべて「未実装を実装済みに見せない」側に寄っている)。**問題は spec 側**で、FR-033 は「本 feature では chat 用の Element を採用しない」、Assumptions は「UI は 3 画面」、tasks SH-007 は「**Element は採用しない**」のまま `[x]` である (→ H-005)。
5. **`ResolutionScreen` の「選ぶ」ボタン削除**: **US-3 の中核価値 (解決・越境明示・到達可能性 3 値) は損なわれていない**。判断自体は妥当 (`onClick` 無しの `<Button>` は偽の対話要素)。ただし **(a) 画面が「この組み合わせはこのまま選べます。」と選択可能性を断言しているのに選ぶ手段が無い**、**(b) tasks FE-030 は「組み合わせ選択 UI」のまま `[x]`**、**(c) FR-030「選択可能にしたまま」と US-3 AS-18「When 選ぶ」が検証不能な条項として残る** の 3 点が未整理 (→ M-005)。
6. **繰り延べの明示性**: spec の Out of Scope は I-3 / X-1 / I-1 / R-3 / X-3 / D-1 / OPT-mac を**明示できている**。`test:rules` の残余 2 件も `nextFeature` が必須化され R-2 / I-1 が割り当たっている (SC-017 達成)。**漏れは 1 件だけ** — 「導入手順文書を配布物から開く手段 → D-1」が `RuntimeListScreen.tsx:66-79` のコメントにしか無く、spec の Out of Scope に無い (→ H-007)。

---

## Findings

### [High] SC-003 の「手動実行した AD-015 §8 の判定結果と一致する」が一度も照合されていない (H-001) (scope: feature)

- **観察**: SC-003 (spec.md:469-471) は「`capabilities` の表明が、**同一ホストで手動実行した AD-015 §8 の判定結果と一致する**」ことを求め、計測経路を「Vitest + quickstart」と定めている。`quickstart.md:70` の手順 2 が唯一の照合ステップだが、`quickstart-results.md:86-89` は未実施項目として「**2 (AD-015 §8 の手動判定との突き合わせ)**」を明記している。V-1 の状態は「一部」。Vitest 側 (`wsl-detector.test.ts` / `wsl-output.test.ts`) はフィクスチャ文字列のパースを固定しているだけで、**実ホストの実際の依存状況と表明値が一致することは示していない**。
- **同種事象探索**: `grep -rn "AD-015" specs/.../quickstart-results.md` で **2 件** (計測条件と Open Question への参照のみ)。照合結果を記した行は **0 件**。`grep -rln "bubblewrap" src/**/*.test.ts` で実ホスト照合を行うテストは **0 件**。
- **リスク/影響**: SC-003 は `runtime` charter の KPI「`capabilities` を正直に表明する」の唯一の測定手段である。FR-003 は「能力がないものを『ある』と表明してはならない」を課すが、**表明が正しいかを一度も外部基準と突き合わせていない**。probe スクリプトの解釈が 1 箇所ずれていても全緑で通る。とくに FR-005 の「WSL interop 由来の実行ファイルを存在扱いしない」は fixture でしか検証されておらず、実 PATH での挙動は未確認である。
- **推奨アクション**: `manual-checklist.md` 1-2 を実施し、同ホストで `wsl -d <D> -- sh -c '<AD-015 §8 の判定>'` を手で走らせて表明値と並べた表を `quickstart-results.md` に残す。**所要は 1 ディストロ 5 分程度**で、実ホストは既に条件を満たしている (`Ubuntu-26.04` が Running)。実施できないなら SC-003 の文言を「Vitest フィクスチャとの一致」に**下げて** spec を改訂し、実ホスト照合を R-2 に割り当てる。**どちらかを選ぶこと** — 現状は「一致する」と書いたまま測っていない。
- **根拠**: SC-003 / FR-003 / FR-005、`docs/domains/runtime/charter.md` KPI、AD-015 §8
- **scope 根拠**: `quickstart-results.md` は本 PR の touched file。spec 改訂も本 PR 内で可能

### [High] SC-011 の「UI 上でそのまま表示される」に証拠が 0 件 — 日本語フォルダ名を描く renderer テストが無く、quickstart 側も未実施 (H-002) (scope: feature)

- **観察**: SC-011 (spec.md:500-502) は「日本語・非 ASCII を含むフォルダ名とディストロ名が **UI 上でそのまま表示される**」を要求し、計測経路を「Vitest のフィクスチャ + quickstart」と定める。Vitest 側で日本語を扱うのは `src/domain/workspace/registry.test.ts:57,67` (値の保持)、`src/main/infra/settings/folder-store.test.ts:103` (永続化の復元)、`src/main/infra/runtime/wsl-output.test.ts:72` (ヘッダのデコード) の 3 件で、**いずれも UI を描いていない**。renderer 単体テストは 3 ファイル (`ResolutionScreen.test.tsx` / `ChatScreen.test.tsx` / `tests/setup/harness.test.tsx`) で、`ResolutionScreen.test.tsx:73` の `displayName` は `'x'` である。quickstart 側は `quickstart-results.md:118` が「**用意した `確認用 フォルダ 日本語` が未登録**」と記録している。
- **同種事象探索**: `grep -rn "日本語\|確認用\|非 ASCII" src/renderer/**/*.test.tsx` で **1 件** — `ResolutionScreen.test.tsx:182` の `it('...解消手順が日本語で出る')` で、これは**固定ラベルの訳出**の確認であり利用者データの表示ではない。**利用者由来の非 ASCII 文字列を renderer に流して描画を確認するテストは 0 件**。`grep -rn "displayName" src/renderer/**/*.test.tsx` の値は `'x'` のみ。
- **リスク/影響**: R-1 の主要利用環境は日本語 Windows であり、登録フォルダ名は**利用者が最初に目にする自分のデータ**である。Constitution Principle VIII (NON-NEGOTIABLE) の Verification は「日本語を含むスクリーンショット比較」を R-2 の E2E に繰り延べており、**R-1 で日本語表示を守る仕組みは SC-011 だけ**である。それが未計測だと、切り詰め・エスケープ・`break-all` の崩れが誰にも気付かれないまま R-2 の E2E まで残る。`WorkspaceFoldersScreen.tsx` はフォルダ名を `key={entry.path.value}` と併せて扱うため、非 ASCII が絡む退行は静かに起きる。
- **推奨アクション**: **renderer 単体テスト 1 ケースで閉じる**。`ResolutionScreen.test.tsx` の `install()` に `displayName: '確認用 フォルダ 日本語'` / `distroName: 'マイ ディストロ'` を与えた fixture を足し、`WorkspaceFoldersScreen` と `RuntimeListScreen` で `getByText` が完全一致することを確認する (切り詰めが起きれば落ちる)。あわせて `manual-checklist.md` 2-2 を実施する。
- **根拠**: SC-011 / FR-047、Constitution Principle VIII (Statement「全角混在時のレイアウト崩れを許容しない」)、US-2 AS-11、US-1 AS-10
- **scope 根拠**: `ResolutionScreen.test.tsx` は本 PR の touched file (新規)

### [High] SC-014 (単一インスタンス / 永続化ファイルの更新時刻不変) に証拠が 1 件も無い (H-003) (scope: feature)

- **観察**: SC-014 (spec.md:510-511) は「アプリを 2 回起動したとき、2 つ目が既存ウィンドウに合流し、**永続化ファイルの更新時刻が変化しない**」を要求する。実装は `src/main/index.ts:28` の `app.requestSingleInstanceLock()` と `:35` の `second-instance` ハンドラのみ。`quickstart-results.md:123` は「**2-9 再起動での復元 / 単一インスタンス (SC-013 / SC-014)**」を未実施として挙げている。
- **同種事象探索**: `grep -rn "requestSingleInstanceLock\|second-instance" --glob '!node_modules/**'` で **2 件、いずれも `src/main/index.ts`**。テストファイル内の出現は **0 件**。`grep -rn "SC-014" src/` で **0 件** — コード側に SC-014 を名指す箇所すら無い。**SC-014 は自動テストにも実機記録にも存在しない唯一の SC である。**
- **リスク/影響**: 「更新時刻が変化しない」は単なる体裁ではなく、**2 つ目のインスタンスが永続化ファイルを上書きして登録フォルダを失わせないこと**の保証である (FR-019 の退避と組み合わさる)。多重起動は spec 自身が Edge Case に挙げており (spec.md:255)、デスクトップアプリでは日常的に起きる。ロック取得前にストアを初期化する順序になっていれば、**2 つ目の起動で登録が全消しになりうる**。現状その順序が正しいことを示すものが何も無い。
- **推奨アクション**: (1) `manual-checklist.md` 2-9 を実施して `LastWriteTime` を記録する (所要 3 分)。(2) 加えて `src/main/index.ts` のロック取得とストア初期化の順序をユニットテストで固定する — `requestSingleInstanceLock` を注入可能にすれば「`false` のとき `composition-root` が走らない」ことは Vitest で書ける。**(1) だけでは退行を検出できない**ので (2) を推奨する。
- **根拠**: SC-014 / FR-020 / FR-019、spec.md:255 Edge Case「アプリの多重起動」
- **scope 根拠**: `src/main/index.ts` は本 PR の touched file

### [High] SC-008 が「全数検出」と宣言する US-4 AC-2 の「ネイティブモジュール」半分に違反サンプルが 0 件 (H-004) (scope: feature)

- **観察**: US-4 AC-2 (spec.md:195-196) は「`agents` レイヤのファイルが **`electron` やネイティブモジュール**に推移的に依存する → 止まる」であり、SC-008 (spec.md:490-495) は「**US-4 の AC が「止まる」と明記する経路は群 (a) / (b) の別を問わずすべて全数検出される。AC-1 〜 AC-11 が名指す経路すべてがこれにあたり、未検出を許容しない**」と拘束する。`tests/rule-fixtures/expected.mjs:49-58` の fixture は `agents-electron-transitive.ts.fixture` 1 件のみで、`what` は「agents から共通モジュール経由で **electron** に推移的に到達する」。**ネイティブモジュール側の fixture が存在しない。** `code-gate.md:180-181` の convention H-001 が同じ欠落を iteration 1 から継続指摘しており、iteration 2 でも未解消である。
- **同種事象探索**: `ls tests/rule-fixtures/{a-direct,b-equivalent}/` で **20 件**。`grep -rn "native\|ネイティブ" tests/rule-fixtures/expected.mjs` で **0 件**。`grep -rn "agents-not-to-native" .dependency-cruiser.js` → ルールは**存在する**が、それを発火させる入力が 0 件。同種構造 (ルールは在るが fixture が無い) を全 20 fixture と AC-1〜AC-11 で照合した結果、**該当は AC-2 の 1 件のみ** (AC-3 は `ui-builtin-via-domain`、AC-4 は `require-path`、AC-5 は `platform-destructured` + `platform-os-api`、AC-6 は `docker-named`、AC-7 は `wsl-args-array`、AC-8 は `spawn-outside-allowlist`、AC-9 は `distro-script-redirect`、AC-10 は `namespace-mixup`、AC-11 は `cycle-a/b` で被覆済み)。
- **リスク/影響**: SC-008 は `expected.mjs:224-225` で「**AC-1 〜 AC-11 が名指す経路は SC-008 の全数検出対象であり、ここには入らない**」と明言し、SC-017 の残余リストから意図的に除外している。つまり AC-2 のネイティブモジュール半分は「全数検出できた」と主張されている一方、**検出も未検出も記録されていない第 3 の状態にある**。`pnpm test:rules` が 20/20 一致で緑になるのは、**そもそも問い合わせていないから**である。Principle VII (`supervisor` = `src/agents/` は Electron / ネイティブ非依存) は NON-NEGOTIABLE であり、その唯一の発火確認手段がここである。plan.md:276-292 が「**設定しただけでは効かない**」を 5 例も実測して記録した feature で、対象 0 件のルールが 1 本残るのは自己矛盾である。
- **推奨アクション**: `tests/rule-fixtures/a-direct/agents-native-transitive.ts.fixture` を 1 件足し、`expected.mjs` に `detectors: ['depcruise'], rules: ['agents-not-to-native']` で登録する。ネイティブ依存の実体は既に `node_modules/@anthropic-ai/claude-agent-sdk-win32-x64` があるので、これを推移的に掴む共通モジュール経由の fixture が書ける。**実装済みルールの発火確認だけなので追加コストは 1 ファイル**であり、`code-gate.md:217` の「fixture を 4〜6 件足して 20 → 25 件に」の最小部分にあたる。
- **根拠**: SC-008 / SC-017 / US-4 AC-2 / FR-035、Constitution Principle VII、`expected.mjs:224-225`
- **scope 根拠**: `tests/rule-fixtures/**` は本 PR の touched file

### [High] FR-033 / Assumptions「UI は 3 画面」/ tasks SH-007「Element は採用しない」に反して chat 画面を出荷しており、spec.md が改訂されていない (H-005) (scope: feature)

- **観察**: spec.md:433-435 の FR-033 は「続けて assistant-ui の公式 CLI で design system を導入する。**本 feature では chat 用の Element を採用しない**」。spec.md:561 の Assumptions は「**本 feature の UI は 3 画面**。transcript 表示は R-3」。tasks.md:31 の SH-007 は「assistant-ui の公式 CLI で design system を導入する。**Element は採用しない** (FR-033)」で **`[x]` が付いている**。実装は `src/renderer/src/features/chat/ChatScreen.tsx` が `@assistant-ui/react` の `AssistantRuntimeProvider` / `useExternalStoreRuntime` と `thread.aui.tsx` (runtime-connected Element) を載せ、`App.tsx:18-23` / `stores/ui.ts:11` が **4 画面目**として nav に常設している。方針変更は plan.md:231-238 (SH-008 の実測) と AD-025 に「**人間判断により「最初から Element も入れ、チャットの runtime / backend は繋がない」方針を採った**」として記録されている。**spec.md と tasks.md だけが追随していない。**
- **同種事象探索**: `grep -rn "chat\|Chat\|会話\|Thread\|assistant-ui" specs/.../tasks.md` で **1 件** (SH-007。内容は「Element は採用しない」)。`grep -rn "3 画面\|4 画面" specs/.../{spec,plan}.md` で **2 件** (spec.md:561 / plan.md:96 「画面 3 つ」)、**どちらも 3 のまま**。`grep -rn "chat" specs/.../spec.md` で **1 件** (FR-033 の「chat 用の Element を採用しない」)。つまり **chat 画面を要求・許可する FR / US / SC / task は 1 件も存在しない**。
- **リスク/影響**: (a) **spec.md は「何を満たすか」の SSoT** であり、そこに「採用しない」と書かれたものが出荷物に入っている。以後の gate / reviewer は spec を読んで判定するため、同じ指摘が round を越えて再燃し続ける (design-gate の po-reviewer は spec しか見なかったためこれを検出できなかった)。(b) 4 画面目は**どの SC の測定対象でもない** — `ChatScreen.test.tsx` の 2 ケースは Constitution Principle VIII のために書かれたもので、SC 由来ではない。(c) tasks.md の `[x]` が「やっていないこと」に付いている。(d) `code-gate.md:161` の ux H-003 (英語 `How can I help you today?` が主見出しに出る) は、この画面が**どの FR-047 対象範囲にも属していない**ことから生じている。
- **推奨アクション**: **実装を戻す必要はない** (人間判断済み・AD-025 に記録済み・表現は honest)。**spec 側を実体に合わせる**:
  1. FR-033 を「design system を導入する。**chat 用 Element は導入するが、runtime / backend を繋がない**。繋ぐのは R-3 / X-1」に改める
  2. Assumptions の「UI は 3 画面」を「4 画面 (うち 1 つは未接続の告知画面)」に、plan.md:96 の「画面 3 つ」も同時に
  3. tasks.md SH-007 の本文を実施内容に書き換える (`[x]` の意味を回復させる)
  4. **FR-047 の適用範囲に chat 画面を明示的に含めるか、明示的に外すかを決める** — 現状は宙に浮いており ux H-003 がそこから出ている
- **根拠**: FR-033 / FR-047 / spec.md:561 Assumptions / tasks.md:31 SH-007、plan.md:231-238、AD-025、Constitution Principle VIII
- **scope 根拠**: spec.md / tasks.md / `ChatScreen.tsx` はすべて本 PR の touched file

### [High] US-2 の UI 側 AC 14 本のうち自動テストが 3 本しか無く、残りを quickstart に逃がしたうえで quickstart が打ち切られている (H-006) (scope: feature)

- **観察**: US-2 (spec.md:87-117) の Acceptance Scenario は 14 本。renderer 単体テストで押さえられているのは **AS-1 (空状態、`ResolutionScreen.test.tsx:326-336`)、AS-6 / AS-7 (3 値の区別と解除の勧め方、`:339-378`)、AS-14 の一部 (復元失敗の件数表示、`:244-267`)** の 3 本相当のみ。残る **AS-2 / AS-3 (登録フロー)、AS-4 (階層移動の体感即時)、AS-5 (重複 → 既存エントリが選択状態)、AS-9 / AS-10 (停止中ディストロの導線)、AS-11 (日本語表示)、AS-12 (権限エラー)、AS-13 (再起動での復元)** は `quickstart.md` V-2 / `manual-checklist.md` 2-1〜2-12 にのみ存在し、`quickstart-results.md:113-130` が「**実施者の判断で打ち切った**」として 2-2 / 2-4 / 2-5 / 2-6 / 2-8 / 2-9 / 2-10 / 2-11 / 2-12 を未実施と記録している。実施できたのは「フォルダ 2 件の登録まで」(`:95`)。
- **同種事象探索**: 全 renderer テストファイルを列挙 (`ResolutionScreen.test.tsx` / `ChatScreen.test.tsx` / `tests/setup/harness.test.tsx` の **3 ファイル / 21 ケース**、うち ChatScreen 2)。`WorkspaceFoldersScreen` を描く `render()` は **`ResolutionScreen.test.tsx` 内の 4 ケースのみ**。`FE-021` (フォルダブラウザ) を描くテストは **0 件**。`grep -rn "duplicateOfId" src/renderer/**/*.test.tsx` で **0 件** — AS-5 の「既存エントリが選択状態になる」は `useFolders.ts:160-165` / `WorkspaceFoldersScreen.tsx:500` に実装があるが**テストが 1 件も無い**。US-1 / US-3 / US-4 の AC を同様に照合すると、自動テスト率は US-1 が 7/10、US-3 が 17/18、US-4 が 11/12 で、**US-2 だけが 3/14 と外れている**。
- **リスク/影響**: US-2 は P1 であり「**所在を先に選ばせることが越境判定を構造的に決定可能にする**」という R-1 の設計上の要 (spec.md:78-82) を担う。その受け入れ条件の 8 割が、実施されなかった手動手順にしか存在しない。とくに **AS-5 (重複登録時に既存エントリを選択状態にする)** は design-gate round 3 の M-001 で指摘され、round 4 で「contract と quickstart で振る舞いは拘束済み」として報告を見送られた項目である — その quickstart が実施されなかったため、**round 3 の指摘は最終的にどこでも検証されていない**。`quickstart-results.md:139-140` 自身が「R-2 は US-1〜US-3 に依存する。US-2 / US-3 の実機確認がこの状態のまま R-2 に進むなら R-2 の plan で前提として明示する必要がある」と書いており、負債は認識されているが**移送先が確保されていない**。
- **推奨アクション**: 手動でしか不可能なもの (ネイティブダイアログ = AS-2 の前半、別窓での WSL 停止 = AS-9 / 有効期間、エクスプローラでの削除 = AS-14) と、**preload スタブで自動化できるもの**を分ける。後者は 5 ケースで閉じる:
  1. AS-5 — `registerFolder` が `{ ok: false, reason: 'duplicate', existing }` を返したとき `highlighted` が付く
  2. AS-9 — `beginBrowse` が `distro-not-running` を返したとき起動 + 再検出の導線が出る
  3. AS-11 — 日本語 `displayName` がそのまま描かれる (H-002 と同じケースで兼用可)
  4. AS-12 — `browseDirectory` が `permission-denied` を返したとき日本語で出て前階層に戻れる
  5. AS-13 — `listFolders` が 2 件返したとき一覧が 2 件になる (復元の renderer 側)
  残る手動分は `manual-checklist.md` のまま実施するか、**R-2 の plan に前提として明示的に移送する** (現状どちらも未確定)。
- **根拠**: US-2 AS-1〜AS-14 / SC-013 / SC-011 / FR-016 / FR-018、Constitution Principle XI (観測可能な振る舞い)、`quickstart-results.md:136-142`
- **scope 根拠**: renderer テストと `quickstart-results.md` はいずれも本 PR の touched file

### [High] FR-009 / US-5 AS-5 の「導入手順文書への導線」が実装に存在せず、繰り延べ先が spec のどこにも無い (H-007) (scope: feature)

- **観察**: FR-009 (spec.md:291-292) は「不足している必須依存の名前と、**導入手順を記載した文書への導線**を案内しなければならない」。US-5 AS-5 (spec.md:235-236) は「**Given** 必須依存が不足しているランタイム、**When** 案内の導線を**たどる**、**Then** 導入手順を記載した文書の該当箇所に**到達する**」。実装 `RuntimeListScreen.tsx:80-84` が出すのは「導入手順: プロジェクトの `docs/runtime/wsl-sandbox-dependencies.md` にある「bubblewrap」の節」という**プレーンテキスト**であり、リンクでもボタンでもない。同ファイル :70-75 のコメントが自ら「**リポジトリ相対パスはパッケージ済みアプリの利用者が辿れる形でもない。開く手段は capability に持たせていない** — IPC 面を広げないという判断で、**送出形態での到達性は D-1 (配布) の課題として残している**」と書いている。**その D-1 繰り延べは spec.md の Out of Scope に無い** (spec.md:583 の D-1 項目は「署名つきインストーラの配布、自動更新、第三者依存の NOTICE」のみ)。
- **同種事象探索**: `grep -rn "openExternal\|openPath\|shell\." src/` で **4 件、すべて `src/main/app/window.ts:13,47,48,64`** (`setWindowOpenHandler` と `will-navigate` の外部委譲)。**renderer から文書を開ける経路は 0 件** — `src/preload/index.ts:26-45` の capability は 11 メソッドで、文書・URL・パスを開くものは 1 つも無い。`grep -rn "D-1" specs/.../spec.md` で **3 件** (:583 配布 / :558 NOTICE / :559 public 化)、**文書到達性に言及するものは 0 件**。`tests/docs/dependency-anchors.test.ts` はアンカーが**文書ファイル内に実在すること**しか確認しておらず、利用者が到達できることは検証していない。
- **リスク/影響**: (a) US-5 AS-5 は「たどる → 到達する」と書かれており、**実装上たどれない以上この AC は達成不能**である。V-7 が「通過」とされているのは quickstart V-7 の行が「導入手順文書 | 実在し、capabilities の導線が指すアンカーに到達する」と**文書側だけを見る文言**になっているためで、AC と検証項目が食い違っている。(b) FR-009 は「アプリ自身がインストールを行ってはならない」の代償として導線を義務づけた条項である。導線が機能しないと、**利用者は不足依存の名前だけを渡されて放り出される** — sandbox が使えない = 無人実行が使えないという R-1 の主要な行き止まりで、次の一手が示されない。(c) `shell.openExternal` は既にアプリ内に存在するため「IPC 面を広げない」判断は選択であって制約ではない。
- **推奨アクション**: 次のいずれかを選び、**選んだことを spec に書く**:
  - (i) capability に `openDependencyDoc(anchor)` を 1 本足す。引数は `DEPENDENCY_DOC_ANCHORS` のキーに完全一致するものだけを受理する enum とし、main 側で `shell.openPath` に解決する (未信頼入力は列挙値 1 つに閉じるので IPC 面の拡大は最小)。`electron-builder.yml` は `docs/` を除外していないため同梱物から解決できる
  - (ii) 文書内容の該当節を capability 経由で**文字列として**返し、アプリ内で表示する
  - (iii) R-1 では到達性を持たないと決め、**spec の Out of Scope に「導入手順文書への到達手段 (アプリ内からの開封) → D-1」を追記**し、**US-5 AS-5 を「文書の位置と該当節名が提示される」に書き換える**
  **(iii) が最小案だが、AC の書き換えを伴うため spec 改訂が必須である。**現状はどれも行われていない。
- **根拠**: FR-009 / FR-048 / US-5 AS-5 / spec.md:566-585 Out of Scope、quickstart.md:200、`docs/domains/runtime/charter.md`「`capabilities` を正直に表明する」
- **scope 根拠**: `RuntimeListScreen.tsx` / `src/preload/index.ts` / spec.md はすべて本 PR の touched file

### [High] SC-002 の「`wsl -l -v` と 1 対 1 で一致」と「列挙不能を理由つきで提示」のどちらにも証拠が無い (H-008) (scope: feature)

- **観察**: SC-002 (spec.md:465-468) は charter KPI であり「ホストに存在する WSL ディストロを取りこぼさない。一覧が `wsl -l -v` と 1 対 1 で一致する。**文字種制約を満たさない名前は「列挙不能」として理由つきに提示され、この 1 対 1 の対象に含まれる**」を要求する。`quickstart.md:59,66` が計測経路で、`manual-checklist.md` 1-1 がその手順。`quickstart-results.md:86-87` は「**1 (一覧の目視内容)**」を未実施として記録し、V-1 の状態は「一部」。`quickstart-results.md:11-16` の表はホストの `wsl -l -v` 出力 (4 ディストロ) を載せているが、**アプリの一覧と並べた照合表は無い**。列挙不能側は `RuntimeListScreen.tsx:226-240` に実装があるが、`ResolutionScreen.test.tsx:83` の `runtimeList()` ヘルパは `enumerationIssues: []` 固定である。
- **同種事象探索**: `grep -rn "enumerationIssues" src/renderer/**/*.test.tsx` で **1 件**、`[]` 固定の fixture 宣言のみ。**非空の `enumerationIssues` を描くテストは 0 件**。`grep -rn "1 対 1\|1対1" specs/.../quickstart-results.md` で **0 件**。`wsl-output.test.ts` は UTF-16LE / CRLF / 翻訳ヘッダ / 空白入り名のパースを押さえているが、**「ホストに実在する 4 件が画面に 4 件出る」ことを示す記録は 0 件**。
- **リスク/影響**: SC-002 は `runtime` charter の KPI そのもので、US-1 の価値 (「このホストで Claude Code を動かせる場所が一覧で示される」) の唯一の測定手段である。取りこぼしは**沈黙する故障**であり、利用者は「そのディストロは使えないのだ」と誤解する。とくにホストには `wsl-vpnkit` / `podman-machine-default` という**用途が特殊な 2 件**が実在し、これらが出ているかどうかは目視でしか分からない。列挙不能側は SC-002 が「**黙って落とさない**」を明示的に要求した条項であり、実装はあるのに発火確認が無い (H-004 と同じ構造)。
- **推奨アクション**: (1) `manual-checklist.md` 1-1 を実施し、`wsl -l -v` の出力とアプリ一覧を**並べた表**を `quickstart-results.md` に残す (所要 2 分。アプリは既に起動確認済み)。(2) 非空 `enumerationIssues` を渡す renderer テスト 1 ケースを足し、「一覧に出せなかったディストロ」枠に `rawName` と理由が出ることを固定する。
- **根拠**: SC-002 / FR-001 / FR-002 / US-1 AS-1 / AS-10、`docs/domains/runtime/charter.md` KPI
- **scope 根拠**: `quickstart-results.md` / renderer テストはいずれも本 PR の touched file

### [Medium] SC-004 の 5 予算のうち 2 つ (`browse-step` / `browse-step-revalidate`) が未計測で、US-2 AS-4 を拘束するものが無くなっている (M-001) (scope: feature)

- **観察**: SC-004 (spec.md:472-476) は 5 つの予算を定める — 初回描画 3s / probe バッチ 4s / キャッシュ再表示 100ms / **階層移動 300ms** / **有効期間をまたぐ 1 手 2s**。`quickstart-results.md:57-63` が記録したのは前 3 つで、`:131-132` が「**`browse-step` / `browse-step-revalidate` の実測値は取得していない。SC-004 の 4 つの予算のうちフォルダブラウザの階層移動だけが未計測**」と明記している。
- **同種事象探索**: `grep -rn "browse-step" specs/.../quickstart-results.md` で **2 件、どちらも未計測の申告**。`grep -rn "browse-step" src/main/app/measure.ts` で計測点は**実装済み**。US-2 AS-4「階層移動ごとに待たされることなく、体感上即時に応答する」を拘束する SC は **SC-004 のこの 1 行だけ** (他に該当 0 件)。
- **リスク/影響**: AD-015 が「`wsl.exe` は 1 回約 1.5 秒」を実測しており、FR-010 の「確認回数をディストロ数および操作回数に比例させてはならない」が破れると**階層移動ごとに 1.5 秒待つ**。これは US-2 の体験を単独で壊す退行であり、`quickstart.md:214` のトラブルシューティングにも「フォルダブラウズが階層ごとに待たされる → 階層移動のたびに実行状態を確認している」として載っている。計測点は実装済みなので、**測っていないだけ**である。
- **推奨アクション**: `manual-checklist.md` 2-3 (3 階層下りる) と 2-6 (35 秒放置して 1 手) を実施し `[measure]` の値を記録する。**所要 5 分**で、他の未実施項目に比べて最も費用対効果が高い (実装済みの計測点があり、fixture 作成も WSL 操作も不要)。
- **根拠**: SC-004 / FR-010 / US-2 AS-4、AD-015
- **scope 根拠**: `quickstart-results.md` は本 PR の touched file

### [Medium] SC-005 の計測経路の後半が spec の文言 (「IPC を直接呼んで拒否される」) と実際の証拠 (main store のユニットテスト) でずれている (M-002) (scope: feature)

- **観察**: SC-005 (spec.md:477-483) の計測経路は「検証前後の `wsl -l -v` の比較 **+ 停止中ディストロの識別子で IPC を直接呼んで拒否されること**」。前半は達成済み (`quickstart-results.md:69-71`。`podman-machine-default` が 2 回の実行を通して Stopped)。後半 (`manual-checklist.md` 1-4 の DevTools から `window.closta.probeRuntime('wsl:Ubuntu-22.04')` 等を叩く手順) は `quickstart-results.md:88` が未実施と記録している。代替として `src/main/app/runtime-store.test.ts:201` 「停止中の識別子ではプロセスを起動せず `distro-not-running` を返す (SC-005)」と `:225` 「未知の識別子」が存在する。
- **同種事象探索**: `grep -rn "distro-not-running" src/**/*.test.ts` で **5 件** (`runtime-store.test.ts` 2 / `resolution.test.ts` 2 / `folder-service.test.ts` の別ディストロ拒否 1)。`validate.test.ts:186-213` が `beginBrowse` の所在検証を、`:170-184` が `runtimeId` の完全一致を押さえている。**IPC 境界 (`ipc.ts` のハンドラ) を直接呼ぶテストは 0 件** — 検証は `validate.ts` と `runtime-store.ts` の層で行われている。
- **リスク/影響**: 実質的な安全性は確保されている (プロセス起動の直前で止まる層がテストされている) ため機能上の穴は小さい。問題は**計測経路の主張と証拠が別物である**ことで、SC-005 を「達成」と書くと、次の feature (X-1 がプロセス起動を追加する) が「IPC 境界で拒否される」を既成事実として乗ってくる。実際に検証されているのは `runtime-store` 層である。
- **推奨アクション**: (a) `manual-checklist.md` 1-4 を実施する (所要 3 分。DevTools に 5 行貼るだけ)、または (b) SC-005 の計測経路を「**プロセス起動レイヤを差し替えたユニットテストで、停止中識別子に対して起動が発行されないこと**」に改訂して spec を実体に合わせる。**(a) を推奨** — X-1 が IPC 境界に起動契約を足すため、境界での拒否を一度は実機で見ておく価値がある。
- **根拠**: SC-005 / FR-007 / FR-010、AD-025 の X-1 申し送り
- **scope 根拠**: `quickstart-results.md` / spec.md は本 PR の touched file

### [Medium] SC-013 / SC-016 が計測経路の一部 (quickstart 側) を欠いたまま「通過」相当に扱われている (M-003) (scope: feature)

- **観察**: SC-013 (spec.md:506-509) の計測経路は「Vitest + renderer 単体テスト + **quickstart**」。Vitest (`folder-store.test.ts`) と renderer (`ResolutionScreen.test.tsx:244-267` の復元失敗件数) は通っているが、`quickstart-results.md:120-126` が 2-4 (重複登録) / 2-9 (再起動復元 + 単一インスタンス) / 2-10 (到達不可と解除) / 2-12 (破損 3 通り) を未実施とし、**「退避ファイル (`*.bak`) が 0 件」**を未実施の根拠として挙げている。SC-016 (spec.md:516-523) は「**開発ビルドとパッケージ済みビルドの双方で満たすこと**」を要求し計測経路に「配信プロトコルは開発者ツールでの確認」を含むが、`quickstart-results.md:38,229-231` が `location.protocol` 未確認と記録。パッケージ済みビルドは生成されたが**起動されていない** (`:191-199` はインストーラと asar 展開の静的確認のみ)。
- **同種事象探索**: `grep -rn "SC-013" specs/.../quickstart-results.md` で **6 件**、うち達成を記した行 **0 件**、未実施を記した行 **5 件**。`grep -rn "location.protocol" specs/.../quickstart-results.md` で **2 件、どちらも未確認の申告**。SC ごとに「計測経路のうち欠けている経路の有無」を全 18 SC で照合した結果、**欠落ありは SC-002 / SC-003 / SC-004 / SC-005 / SC-011 / SC-013 / SC-014 / SC-016 の 8 件**、完全達成は SC-001 / SC-006 / SC-007 / SC-008 (H-004 の 1 点を除く) / SC-009 / SC-010 / SC-012 (H 以下の指摘あり) / SC-015 / SC-017 / SC-018 の 10 件。
- **リスク/影響**: SC-013 の「**元データが退避される**」は FR-019 の中核で、**壊れたファイルを上書きする前に退避する**という一方向の操作である。ここが効いていなければ利用者の登録が失われる。退避の実装は `folder-store.ts` にあり Vitest で通っているが、**実ファイルシステム上で `.bak` が生成されたことは一度も観察されていない** (パス解決は `app` レイヤが注入するため、注入経路だけが未検証の穴になりうる)。SC-016 は「双方のビルドで」を明文で要求しており、パッケージ済みビルドを起動しない限り `app://` 配信と CSP ヘッダ注入の実地確認は成立しない。
- **推奨アクション**: SC-013 は `manual-checklist.md` 2-12 の (a) 1 通りだけでも実施して `.bak` の生成を確認する (所要 3 分。3 通り全部は不要 — 退避経路は共通)。SC-016 は `dist/win-unpacked/closta.exe` を 1 回起動して `location.protocol` を見る (所要 2 分)。**どちらも既に生成物が手元にある。**
- **根拠**: SC-013 / SC-016 / FR-019 / FR-040
- **scope 根拠**: `quickstart-results.md` は本 PR の touched file

### [Medium] README が R-1 を "one completed feature" と宣言し、packaging を "not set up" と書いている — どちらも現状と食い違う (M-004) (scope: feature)

- **観察**: `README.md:9-11` 「This repository currently contains **one completed feature** — runtime detection and workspace folder registration」。spec.md frontmatter は `status: reviewing` であり、pr-gate / done を通っていない。`quickstart-results.md:36` は V-3 を「未実施」、V-1 / V-2 / V-6 を「一部」と記録している。`README.md:30` 「**No installer.** The app runs from source; **packaging and signing are not set up**」。一方 `quickstart-results.md:191-196` は `pnpm build:win` が完走し `dist/closta-1.0.0-setup.exe` (約 176 MB) が生成され AD-026 に記録されたことを示し、**SC-010「インストーラ生成がエラーなく 1 回完走」はこの事実を根拠に達成扱いされている**。`electron-builder.yml` も `README.md:73` の `pnpm build:win` も存在する。
- **同種事象探索**: `grep -rn "completed\|not set up\|not implemented" README.md` で **5 件**。うち事実と食い違うのは **2 件** (:9 の完了宣言、:30 の packaging)。残る 3 件 (「No session support」「No chat」「No containers」) は正しい。**過大主張 (未実装を実装済みと書く) は 0 件** — SC-012 が直接禁じた形は成立していない。
- **リスク/影響**: (a) :9 は **gate が完了を判定する前に完了を宣言している**。`/cl-done` 前に README が「完了」と書いてあると、以後 status の陳腐化を検出する手掛かりが消える (US-5 の Why priority が「status 記述の陳腐化を防ぐ」ことである)。(b) :30 は**過小申告**で、SC-010 の達成根拠と正面から矛盾する。リポジトリ public 化 (D-1) 時に「packaging は未設定」と読んだ人が `pnpm build:win` を試して通ることになる。FR-044 は「**現在の実装 status を明示**しなければならない」を課しており、誤った status 記述はこの MUST に当たる。
- **推奨アクション**: :9 を「contains its first feature — ... — which is under review」に、:30 を「**No signed distribution.** `pnpm build:win` produces an unsigned NSIS installer (exercised once); signing, auto-update and third-party notices are not set up (D-1)」に改める。**2 行の書き換えで閉じる。**
- **根拠**: FR-044 / SC-012 / US-5 AS-2、spec.md frontmatter `status: reviewing`、`quickstart-results.md:191-199`、AD-026
- **scope 根拠**: `README.md` は本 PR の touched file

### [Medium] `ResolutionScreen` が「このまま選べます」と選択可能性を断言する一方で選ぶ手段が無く、tasks FE-030 は「選択 UI」のまま `[x]`。全対を逐次解決する設計にも予算が無い (M-005) (scope: feature)

- **観察**: `ResolutionScreen.tsx:96` が越境カードに「**この組み合わせはこのまま選べます。**」を出し、`:131` が `blocked` に「**今は使えません**」を出す。しかし `:125-130` のコメントどおり選択用の対話要素は無く、**どのカードも押せない**。tasks.md:283 は「FE-030 組み合わせ**選択** UI」、:289 は「FE-031 ... **越境でも選択可能**にする (FR-030 / SC-006)」で、どちらも `[x]`。FR-030 (spec.md:364) は「越境する組み合わせを**選択可能にしたまま**明示しなければならない」、US-3 AS-18 は「**When 選ぶ**、**Then** 選択は許可され...」で、いずれも「選ぶ」行為を前提にしている。`ResolutionScreen.test.tsx:208-219` は FR-030 の確認を「選択肢として現れ、『今は使えません』が付いていないこと」に読み替えており、判断の根拠はテストのコメントにしか残っていない。加えて `:189-197` は `for (folder) { for (runtime) { await resolveFolderRuntime() } }` の**逐次**ループで、plan.md:96 の Scale/Scope (登録フォルダ 〜50 / ディストロ 〜10) では **最大 500 回の直列 IPC 往復**になる。SC-004 はこの画面に予算を持たない。
- **同種事象探索**: `grep -rn "選べ\|選択" src/renderer/src/features/folder-runtime-resolution/` で **6 件**、うち**利用者が選択を確定できる操作は 0 件**。`grep -rn "resolveFolderRuntime" src/renderer/` で **2 件** (`ResolutionScreen.tsx:192` / `:236`)、どちらも全対ループ。`grep -rn "FE-030\|FE-031" specs/.../tasks.md` で **4 件**、いずれも「選択」を含む文言で `[x]`。
- **リスク/影響**: (a) 「このまま選べます」は**存在しない操作の存在を示唆する**文面で、`ChatScreen` が「入力はできません」と明示した方針と逆を向いている (同じ PR 内で honest さの基準が 2 つある)。(b) FR-030 / AS-18 は R-1 で検証不能な条項として残り、R-3 / X-1 が「R-1 で選択は通っている」と誤読しうる。(c) 500 回の直列往復は plan.md が想定した規模での実測が無い — `resolveFolderRuntime` は main 側の純計算なので致命的ではないが、**予算が定義されていないため遅くても検出されない**。US-3 の Independent Test は `domain` の純粋関数だけで確認する形なので、画面規模の問題はここでしか出ない。
- **推奨アクション**: (1) 文面を「この組み合わせは制限されていません」等の**事実の記述**に改める (選択の存在を示唆しない)。(2) tasks.md FE-030 / FE-031 の文言を「組み合わせの**解決結果一覧** UI」に直し、`[x]` の意味を回復させる。(3) FR-030 / US-3 AS-18 に「R-1 では『選択肢に現れ、制限表示が付かない』ことで満たす。選択の確定と永続化は X-1」の限定を spec に書く。(4) 解決ループに `Promise.all` かバッチ IPC 1 本を使う、または SC-004 に解決画面の予算を 1 行足す。**(1)〜(3) が本質で、(4) は任意。**
- **根拠**: FR-030 / US-3 AS-18 / SC-004 / tasks.md:283,289、plan.md:96、AD-016
- **scope 根拠**: `ResolutionScreen.tsx` / tasks.md / spec.md はすべて本 PR の touched file

### [Low] `manual-checklist.md` 3-2 の期待文言が実装のラベルと食い違っており、実施者が判定できない (L-001) (scope: feature)

- **観察**: `manual-checklist.md:328` は「A × `WSL: Ubuntu-26.04` の行が「**選べる**」(**`今は選べない`** になっていない) — FR-030」と書くが、実装のラベルは `ResolutionScreen.tsx:131` の「**今は使えません**」であり、`REACHABILITY_LABELS` (一覧側) は `blocked: '今は使えない'` (`labels.ts:24`)。`今は選べない` という文字列は**コードベースに存在しない**。
- **同種事象探索**: `grep -rn "今は選べない" --glob '!node_modules/**'` で **1 件、`manual-checklist.md:328` のみ**。逆に `grep -rn "今は使えません\|今は使えない" src/` で **2 件** (解決画面 / 一覧画面で**別の語尾**)。
- **リスク/影響**: チェックリストは実施者に渡す唯一の手順書であり (`quickstart-results.md:45`)、存在しない文字列を探させると「見つからない = 合格」とも「見つからない = 画面が違う」とも読める。V-3 が全項目未実施のまま残っている状況で、次に実施する人が最初に詰まる箇所である。
- **推奨アクション**: :328 を「「今は使えません」が付いていない」に直す。あわせて解決画面と一覧画面の語尾の差 (「使えません」/「使えない」) を揃えるか、意図した差なら理由を `labels.ts` に注記する。
- **根拠**: FR-047、`manual-checklist.md:328`、`ResolutionScreen.test.tsx:219` (テストは正しい文言を使っている)
- **scope 根拠**: `manual-checklist.md` は本 PR の touched file

### [Low] 停止中ディストロのカードに「再判定」ボタンが常設され、押しても画面上の状態が変わらない (L-002) (scope: feature)

- **観察**: `RuntimeListScreen.tsx:124-130` は `isProbing` が偽のとき**無条件に**「再判定」を出す。停止中ディストロ (`state: 'stopped'`) でも表示され、`runtime-store.ts:200` が `distro-not-running` を返す。`useRuntimes.ts:92` のコメントは「`distro-not-running` が戻り値でしか分からないので一覧を取り直す」と書いており、**結果として一覧が再取得されるだけで、押した人には何も起きていないように見える**。US-2 側では同じ状況に対して `manual-checklist.md:204` が「ボタンが**押せない**状態になっている」+ 起動 / 再検出の手順表示を期待しており、**画面間で扱いが揃っていない**。
- **同種事象探索**: `grep -rn "disabled" src/renderer/src/features/runtime-list/RuntimeListScreen.tsx` で **1 件** (`:192` の「再検出」ボタンのみ)。停止中を条件に UI を絞る箇所は **0 件**。
- **リスク/影響**: FR-007 / SC-005 は守られている (起動は発行されない) ため安全性の問題ではない。US-1 AS-1 が「停止中の capabilities は未判定と示される」までしか要求しておらず、**再判定操作の扱いを拘束する AC が無い**ため仕様の穴として残っている。code-gate の ux H-001 (`useFolders` の reject 受け皿) と同型だが**別ファイル・別フックであり、`useRuntimes` は 3 経路すべてに catch を持つ**ので再指摘ではない。
- **推奨アクション**: `state !== 'running'` のとき「再判定」を disabled にし、`blocked` と同じ「ディストロを起動する → ランタイムを再検出する」の手順を出す (文言は `RESOLUTION_STEP_LABELS` を再利用できる)。US-1 に AC を 1 本足すか、`FE-010` の表示対象に「停止中は再判定を提供しない」を明記する。
- **根拠**: US-1 AS-1 / FR-007 / FR-047、`manual-checklist.md:204` (US-2 側の期待)
- **scope 根拠**: `RuntimeListScreen.tsx` は本 PR の touched file

---

## 意図的に報告しなかったもの

- **code-gate iteration 1 の MUST_FIX 7 件 (MF-001〜MF-007)** — `.gate-verdict-code.json` の `iter1_must_fix_resolution` を読み、resolved / partially_resolved とされた箇所そのものは再指摘していない。MF-002 の残余 (`useFolders` の 5 経路) は ux H-001 として継続中であり ux の Owner 範囲
- **cat A / B (security)** — `window.ts:48,64` が renderer 由来 URL を `shell.openExternal` に渡す経路を観察したが `security-reviewer` の Owner 範囲
- **cat C / D** — `WslAvailability` の glossary 未登録 (convention C-005)、Constitution frontmatter (gate 内で修正済み)、AD-024 #18 の訂正はいずれも `architecture-reviewer` / `convention-reviewer` の範囲
- **cat F / G** — convention 26 件 / a11y 17 件 / ux 12 件は code-gate iteration 2 で実施済み。ux H-003 (chat 画面の英語見出し) は H-005 の**原因**としてのみ言及し、指摘としては重複計上していない
- **coverage provider 未インストール** — convention L-007 / test-agent で既出
- **`probe-batch` の余裕の薄さ (3,667 / 4,000)** — `quickstart-results.md:65-67` と AD-015 Open Question に記録済みで、予算は満たしている。振る舞いの欠陥ではない
- **書式・順序・件数表記の揺れ** — 参照の破れが無いものは不問

---

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `AD-015` (quickstart-results.md 内) | 2 (照合結果を記した行 **0**) | quickstart-results.md:66,172 |
| H-001 | 実ホスト照合を行うテスト | **0** | 該当なし |
| H-002 | `日本語\|確認用\|非 ASCII` (renderer テスト) | 1 (利用者データの表示確認 **0**) | ResolutionScreen.test.tsx:182 (固定ラベルの訳出) |
| H-002 | `displayName` (renderer テスト) | 3 (すべて `'x'`) | ResolutionScreen.test.tsx:73 他 |
| H-003 | `requestSingleInstanceLock\|second-instance` | 2 (テスト内 **0**) | src/main/index.ts:28,35 |
| H-003 | `SC-014` (src 配下) | **0** | 該当なし |
| H-004 | `native\|ネイティブ` (expected.mjs) | **0** | 該当なし |
| H-004 | AC-1〜AC-11 × 20 fixture の照合 | 未被覆 **1** (AC-2 のネイティブ半分) | tests/rule-fixtures/expected.mjs:49-58 |
| H-005 | `chat\|Chat\|会話\|Thread\|assistant-ui` (tasks.md) | 1 (「Element は採用しない」で `[x]`) | tasks.md:31 |
| H-005 | `3 画面\|画面 3 つ` | 2 (どちらも未改訂) | spec.md:561 / plan.md:96 |
| H-006 | renderer テストファイル総数 | 3 files / 21 cases (FE-021 を描くもの **0**) | ResolutionScreen.test.tsx / ChatScreen.test.tsx / tests/setup/harness.test.tsx |
| H-006 | `duplicateOfId` (renderer テスト) | **0** | 実装は useFolders.ts:160-165 / WorkspaceFoldersScreen.tsx:500 |
| H-007 | `openExternal\|openPath\|shell\.` (src 配下) | 4 (renderer から到達可能 **0**) | src/main/app/window.ts:13,47,48,64 |
| H-007 | preload capability のメソッド数 | 11 (文書を開くもの **0**) | src/preload/index.ts:26-45 |
| H-007 | `D-1` (spec.md) | 3 (文書到達性への言及 **0**) | spec.md:558,559,583 |
| H-008 | `enumerationIssues` (renderer テスト) | 1 (非空 fixture **0**) | ResolutionScreen.test.tsx:83 |
| H-008 | `1 対 1` (quickstart-results.md) | **0** | 該当なし |
| M-001 | `browse-step` (quickstart-results.md) | 2 (どちらも未計測の申告) | quickstart-results.md:131,132 |
| M-002 | `distro-not-running` (テスト) | 5 (IPC 境界を直接呼ぶもの **0**) | runtime-store.test.ts:201,225 / resolution.test.ts:139,372 / folder-service.test.ts:238 |
| M-003 | 全 18 SC × 計測経路の欠落照合 | 欠落あり **8** / 完全達成 **10** | SC-002/003/004/005/011/013/014/016 |
| M-004 | `completed\|not set up\|not implemented` (README) | 5 (事実と食い違い **2**) | README.md:9,30 |
| M-005 | `選べ\|選択` (folder-runtime-resolution 配下) | 6 (選択を確定できる操作 **0**) | ResolutionScreen.tsx:96,131 他 |
| L-001 | `今は選べない` | 1 (**manual-checklist.md のみ**) | manual-checklist.md:328 |
| L-002 | `disabled` (RuntimeListScreen) | 1 (停止中を条件に絞る箇所 **0**) | RuntimeListScreen.tsx:192 |

---

## Verdict

- **Critical: 0**
- **High: 8** (H-001 SC-003 / H-002 SC-011 / H-003 SC-014 / H-004 SC-008 / H-005 FR-033 spec drift / H-006 US-2 AC testability / H-007 FR-009 導線 / H-008 SC-002)
- **Medium: 5** (M-001 SC-004 / M-002 SC-005 / M-003 SC-013・SC-016 / M-004 README / M-005 US-3 選択)
- **Low: 2** (L-001 manual-checklist 文言 / L-002 停止中の再判定ボタン)
- **Round inheritance**: design-gate (round 4) から **resolved 3 / partially resolved 1 / unresolved 0 / new 15**

**Critical を 0 件とした根拠**: 本 round の指摘はすべて「**証拠の欠落**」「**文書と実体の食い違い**」「**検証不能な条項の残存**」であり、
`reviewer-base.md` の Critical 定義 (データ漏洩 / なりすまし / 権限昇格 / サービス停止 / accepted ADR drift) に該当する
観察事実は無い。到達可能性 3 値・3 段判定・越境案内・安全側解釈といった**利用者に実害が出る経路は
`resolution.test.ts` 38 ケースと `validate.test.ts` 40 ケースで押さえられている**。
design-gate で Critical だった C-001 / C-002 も実装・テストの両面で閉じている。

**pr-gate の判断材料**: High 8 件のうち **H-001 / H-002 / H-003 / H-008 / M-001 / M-003 は「測っていないだけ」で、
合計 30 分程度の手動実施と renderer テスト 2〜3 ケースで閉じる**。
**H-005 / H-007 / M-004 / M-005 は spec.md / tasks.md / README の改訂 (計 10 行程度) で閉じる。**
**H-004 は fixture 1 ファイル。** いずれも実装の作り直しを要さない。
ただし **SC-002 / SC-003 / SC-011 / SC-014 は charter KPI と NON-NEGOTIABLE Principle に直結しており、
証拠 0 件のまま `/cl-done` に進むと「SC を満たした」という記録が根拠なしに残る**。
最小案として、**この 4 件の実機確認 (`manual-checklist.md` 1-1 / 1-2 / 2-9 の 3 項目) と
spec.md の 2 箇所の改訂 (FR-033・US-5 AS-5 / Out of Scope) を done の前提条件にする**ことを推奨する。
