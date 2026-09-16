---
status: accepted
date: 2026-09-14
id: AD-024
deciders: ukitomato
tags: [convention, enforcement, governance]
supersedes: []
superseded-by: []
---

# AD-024: Constitution の検証条件・Statement・用語を実装構成に合わせる

## Context

Constitution v1.1.0 は bootstrap 時に `PLAN.md` から起こしたもので、
**まだ存在しないディレクトリ構成を前提に検証条件が書かれていた**。

[AD-023](0023-application-architecture.md) が 5 レイヤ
(`app` / `ui` / `agents` / `infra` / `domain`) を決め、R-1 がそれを実装したことで、
Constitution が名指すディレクトリの多くが**実在しないパス**になった。

具体例を 3 つ挙げる。

- Principle VII の `bad_pattern_grep` は `src/supervisor/` を検査する。
  AD-023 は supervisor を `src/agents/` に置いた。**grep は常に空を返し、常に合格する**
- Principle I の検証は `--exclude-dir=runtime` でディレクトリ単位に除外する。
  R-1 のパス API は `src/domain/runtime/path-api.ts` の 1 ファイルに限定しており、
  ディレクトリ除外では `src/domain/runtime/` 配下すべてが免除される
- Principle II の検証も同じ `--exclude-dir=runtime` で、
  プラットフォーム分岐の許可先が `src/main/infra/runtime/` である実体と合わない

**検証条件が実在しないパスを指していると、違反が 0 件なのではなく検査が 0 件になる。**
これは「合格」と見分けがつかない。

さらに R-1 の完了によって、**検証条件ではなく Principle 本文そのもの**が
事実と食い違う箇所が 4 つ生じる (#14 〜 #17)。
Governance は「Principle と ADR が食い違う場合は Constitution を正とする」と定めているため、
本文を改めない限り、正しい実装が NON-NEGOTIABLE 違反として
`/cl-code-gate` / `/cl-pr-gate` で再燃し続ける。

ディレクトリを Constitution の記述に合わせて改名する案は AD-023 に反する
(公式 scaffold の構成から外れると、以後のアップデート手順とコミュニティの知見が当てにならない)。
実装側だけを直すと SSoT と実装が食い違ったまま残る。
**そのため Constitution 側をまとめて改定する。**

## Decision

Constitution を **v1.2.0** に改める。MINOR である理由は「Principle の追加・削除ではなく、
検証条件と本文の実体合わせ」であり、
ただし **#13 / #14 が NON-NEGOTIABLE Principle (III / I) の改定にあたる**ため
既存違反の enumeration を伴う。

### 改定項目 (18 件)

| # | 対象 | 現在 | 改定後 |
|---|---|---|---|
| 1 | VII | `src/supervisor/` を検査 | `src/agents/` を検査。推移的依存はグラフ検証が見ることを明記 |
| 2 | VII | `require()` 形式のみ | import / require の両形式。**Automated の正本を lint + グラフ検証に移す** |
| 3 | VI | docker の許可先が `src/isolation/` | **モジュール許可リスト**。正本は検証スクリプト内の定数。**追加には ADR を要する** |
| 4 | VI | 特定サブコマンドの決め打ち | `wsl.exe` に渡す引数の**許可リスト** |
| 5 | VI | 検証スコープが `src/` のみ | ビルド構成 (scripts / CI / パッケージング設定) を含める。特権コマンド一覧に Windows 側を追加 |
| 6 | IX | `--exclude-dir=supervisor` | `src/agents/` に読み替える |
| 7 | I | ディレクトリ名での除外 | 許可ファイル方式。**Automated の正本を lint + グラフ検証に移す** |
| 8 | II | ディレクトリ名での除外 (`src/domain/runtime/` も免除される) | **許可ディレクトリを実名で限定**し、Automated の正本を検証スクリプトに移す |
| 9 | V | 検証が SQL のカラム型に依存 | 設定ファイルも対象に含める。`reviewers.yml` の `database-reviewer` の発火条件に設定層を追加 |
| 10 | XIII | 特定の設定ファイルを参照。かつ `bad_pattern_grep` がそのままでは実行できない | 下記「SH-008 の実測」の 3 点を反映する |
| 11 | XIII | Exceptions が「存在しないこと」の記載を要求 | 「存在しない**か、候補を実名で照合したうえで不適合である**こと」に改める |
| 12 | XV | Exceptions 節が無い | リポジトリ表層文書 (README 等) は英語、内部文書は日本語を SSoT とする Exceptions を追加 |
| 13 | III / 用語 | `autoModeSafe === false` を前提 | 「`!== true`」に改め、判定を単一の関数に定める。`supervisor` と `src/agents/` の対応を定義し、immutable な ADR は読み替え対象として列挙する |
| 14 | I (Statement) | 「パス操作は**すべて `runtime.path` を経由する**」 | 「パス操作は `domain` が公開するパス API を経由する。ランタイム名前空間の操作は `AgentRuntime.path` として公開し、**ホスト名前空間の操作と接頭辞照合は同モジュール群の別の公開面**とする。標準モジュールを直接 import してよいのは実装ファイル 1 つに限る」に改める |
| 15 | XI (Exceptions) | 「R-1 のような基盤 feature は UI を持たないが、パス変換のユニットテストという観測可能な振る舞いを持つ」 | 「基盤 feature が UI を持つ場合を含め、**観測可能な振る舞いが 1 つ以上あれば足りる**」に改める |
| 16 | XIV (本文) | 「`docs/glossary.md` は**未作成のため**、glossary 作成時に付録 A を一次素材とする」 | 「未作成」を削り、現行 glossary を参照する形に改める |
| 17 | 未解決 Principle 候補 #2 | 「配布物のライセンス表記 — `LICENSE` / `NOTICE` が不在」 | 自プロジェクトの `LICENSE` を解消済みとし、**残余 (第三者依存の `NOTICE`) を D-1 に限定**する |
| 18 | VIII (Verification) | 「**CI が未構築のため** Automated 側は実行不能」 | CI は SH-022 で構築した。実行不能の理由を実体に改める — (A) composer は描画されるが**送信経路を閉じている** (下の「訂正」節)、(B) スクリーンショット比較は R-2 の E2E 基盤に相乗りする。下の「Principle VIII の Automated 検証を R-1 でどこまで載せるか」が内訳と延期条件を定める |

### #14 〜 #17 を同時に扱う理由

いずれも**本 feature の完了と同時に Constitution 本文の記述が事実と食い違う**箇所であり、
検証条件だけを直しても閉じない。

- **#14**: 設計側が `runtime.path` を経由しないパス操作を 3 経路持つ
  (ホスト名前空間の操作 / `infra/settings` のパス組み立て / `ui` から呼ぶ接頭辞照合)。
  Statement を改めないと Governance により NON-NEGOTIABLE 違反として再燃する
- **#15**: renderer 3 画面を持つ R-1 が Exceptions の反例そのものになる
- **#16**: `docs/glossary.md` は既に存在する
- **#17**: `LICENSE` は R-1 で追加済みである

### 検証の正本を grep から移す

#2 / #7 / #8 が共通して述べているのは、**`bad_pattern_grep` を正本にしないこと**である。

grep は 3 つの理由で正本になり得ない。

1. **ディレクトリ名での除外は粒度が粗い。** R-1 のパス API は 1 ファイル単位の許可である
2. **`require()` と等価 API を見られない。** `process.getBuiltinModule('child_process')` は
   import として現れない
3. **推移的依存を見られない。** `agents` が共通モジュール経由で `electron` に届く経路は
   grep では追えない (AD-023 §7 が dependency-cruiser を要求している理由)

改定後の Automated 欄は次を正本とする。**grep は補助と位置づける。**

| Principle | Automated の正本 |
|---|---|
| I | `eslint.config.mjs` の `no-restricted-imports` + `boundaries/dependencies` / `.dependency-cruiser.js` の `path-module-only-from-path-api` |
| II | `scripts/constitution/check.mjs` 項目 8 |
| V | `scripts/constitution/check.mjs` (設定ファイルを走査対象に含む) |
| VI | `scripts/constitution/check.mjs` 項目 1 〜 7 / 9 |
| VII | `eslint.config.mjs` (`agents` レイヤの許可行列) / `.dependency-cruiser.js` の `agents-not-to-electron` / `agents-not-to-native` |
| IX | `.dependency-cruiser.js` の `agents-not-to-infra` |

### 許可リストの正本は検証スクリプト内の定数とする

#3 / #4 が求めるものである。正本は `scripts/constitution/allowlists.mjs` に置き、
**追加には ADR を要する** (FR-041)。Constitution 側はこのファイルを参照する形にする。

固定値を Principle 本文に埋め込むと、レイヤ構成が変わるたびに本文の改定が必要になり、
今回と同じ drift が再発する。

### Principle II の例外注記に「整形器が動かさない位置」を加える

v1.1.0 が追加した `platform-ok:` 注記は「**`process.platform` と同じ行の末尾**」を条件としている。
R-1 の実装時に、prettier が

```ts
if (process.platform !== 'darwin') { // platform-ok: ...
```

の注記を次の行へ送ることを実測した。**整形をかけた瞬間に例外が成立しなくなる。**

そのため Principle II の「例外の書き方」に次を補う。

> 判定をいったん変数に受け、**その行**に注記を置く。
> `if` の条件式に直接書くと整形器が注記を次の行へ送り、例外として認められなくなる。

```ts
const isMac = process.platform === 'darwin' // platform-ok: <理由>
if (!isMac) { ... }
```

### SH-008 の実測 (2026-09-14。#10 の内訳)

R-1 の Phase 1 で assistant-ui を実際に導入して判定した。

| # | 観察 | 対応 |
|---|---|---|
| a | `grep -rnE "--color-\|colors:\s*\{\|spacing:\s*\{" src/ tailwind.config.*` は **`grep: unknown option` で失敗する**。パターンが `--` で始まるため grep がオプションとして解釈する | `-e` を付けるか `--` セパレータを置く。Principle VI #2 は `grep -rn -- "--import" src/` と正しく書かれており、**XIII だけの取りこぼし**である |
| b | 修正して実行すると **23 件ヒットする**。全件が `src/renderer/src/assets/main.css` の **assistant-ui / shadcn 標準テーマ**であり、`npx assistant-ui@latest create -t minimal` の生成物を写したもの。**独自トークンの追加ではない** | 検証条件を「標準テーマの写しを除いた追加分」に限定する。除外はファイル単位の明示リストとする (FR-037 の既定に合わせる) |
| c | `tailwind.config.*` は**存在しない**。Tailwind v4 は CSS 内 (`@theme inline`) で設定する | grep の対象を `src/` 配下の CSS に改める |

## Consequences

- **Constitution v1.2.0 になる。** `## Sync Impact Report` と改定履歴に本 ADR を記録する。
  **#18 だけは v1.2.1** — CI 構築 (SH-022) を待って決まる項目であり、
  v1.2.0 の時点では「CI が未構築」という記述が事実だった
- **#13 / #14 は NON-NEGOTIABLE の改定**であり、既存違反の enumeration を伴う。
  R-1 時点ではいずれも 0 件である (パス API と capability 判定はどちらも
  改定後の条件を満たす形で実装済み)
- 上流 SSoT の追随が必要になる。plan.md「上流 SSoT の追随」の表に列挙してある。
  とくに **`.claude/agents/` 配下**は、gate を実行する reviewer 自身が旧条件で判定するため、
  charter だけ直しても I-3 のゲートが素通りする
- **`.specify/templates/plan-template.md` と `PLAN.md`** の `runtime.path` 表記も追随が必要。
  放置すると R-2 以降の全 plan が旧文言で Constitution Check を行い、
  `PLAN.md` は次の bootstrap 素材として旧文言を再流入させる
- 検証の正本がスクリプトに移るため、**スクリプト自身の検証が必要**になる。
  `tests/rule-fixtures/` の違反サンプルとルール検証ランナー (SH-020 / SH-021) がその役割を担う
- **#5 の帰結として `scripts/rules/run.mjs` が項目 7 (プロセス起動) に引っ掛かった。**
  検証器を起動するランナーは、起動しなければ仕事にならない。
  除外リストで逃がすと `scripts/` 配下が構造的に検査から外れるため、
  `PROCESS_SPAWN_MODULES` に実名で加え、**何を起動するかを許可リスト側に表で書いた**。
  許可したのは項目 7 だけであり、項目 1 / 3 / 4 は引き続き掛かる

### Principle VIII の Automated 検証を R-1 でどこまで載せるか (SH-022)

CI を立てた (`.github/workflows/verify.yml`) ので「CI が未構築だから実行不能」という
これまでの説明は使えなくなった。改めて内訳ごとに決める。

Principle VIII の Automated は 2 つある。

| 内訳 | R-1 に載せるか | 理由 |
|---|---|---|
| (A) composer の IME テストケースが E2E に存在すること | **載せない (送信経路を閉じた)** | composer は描画されるが `isDisabled: true` で送信経路が閉じている。チャットの runtime / backend は繋いでいない ([AD-025](0025-workspace-folder-carries-location.md) #6 (b))。下の「訂正」節を参照 |
| (B) 日本語を含むスクリーンショット比較が CI に存在すること | **載せない (延期)** | 基準画像を撮る対象のシェルが暫定である。目標レイアウトの ADR が未採択のまま撮ると、採択時に全数撮り直しになる |

**(A) は「未実装」ではなく「送信経路を閉じた」である。** 対象そのものは存在するので、
AD-025 #9 の「対象が無い」扱いは当たらない。閉じてあることを回帰テストで固定したうえで、
E2E が無い段階の IME テストを「載せた」と数えない (下の「訂正」節)。

**R-1 の CI が日本語について実際に見ているものは無い。**
renderer 単体テストは jsdom で日本語ラベルを描画するが、jsdom は
フォントも字幅もレイアウトも持たない。これを Principle VIII の Automated に数えるのは
検証したことにならないので数えない。

#### 延期条件

- **(A)**: composer の**送信経路を開ける**最初の feature (R-2) で、E2E 基盤と同時に載せる。
  `ChatScreen` から `isDisabled: true` を外す変更が入った時点で本項は必須になる
- **(B)**: 次の 2 つが**両方**揃った時点で載せる。片方だけでは撮り直しが確定する
  1. 目標レイアウト (AD-025 「目標レイアウト」節) が ADR として accepted になっていること
  2. Electron を CI で起動する E2E 基盤が存在すること (= (A) の基盤)

したがって **(A) と (B) はどちらも R-2 の E2E 基盤に相乗りする。**
R-1 で先行して基盤だけ作らないのは、比較対象の画面が入れ替わるからである。

#### この間 Principle VIII を何が守るか

Manual の 2 者 (`ux-reviewer` / `a11y-reviewer`) と、送信経路が閉じたままであることを
固定する `ChatScreen.test.tsx` の 2 ケースである (下の「訂正」節)。
後者は Principle VIII そのものの検証ではなく、**検証対象が発生していないことの保証**である。
**Automated が 0 であることを Constitution の Verification に明記する** —
「CI 未構築のため実行不能」という書き方は CI がある今では誤りであり、
放置すると「CI が緑なら Principle VIII も見ている」と読める。

## 訂正: R-1 に composer は存在する。根拠は「対象が無い」ではなく「送信経路を閉じた」

本 ADR の初版と Constitution v1.2.1 は、Principle VIII の Automated (A) を R-1 で
載せない根拠を「**R-1 に composer が無い**」と書いた。これは事実ではない。

`src/renderer/src/features/chat/ChatScreen.tsx` は `Thread` を mount し、
`components/assistant-ui/elements/thread.aui.tsx` が `ComposerPrimitive.Input` を描画する。
**composer は最初から画面に出ている。**

誤認が実害を持つのは、Principle VIII が NON-NEGOTIABLE だからである。
検証免除が成立しない前提に乗ったまま X-1 でモデルに繋ぐと、
**一度も検証していない送信経路**が本番の経路になる。
`bad_pattern_grep` は送信が `@assistant-ui/react` の内側で起きるため 0 件を返し続け、
`isComposing` ガードがリポジトリに 1 件も無いことを示さない。

**正しい根拠はこうである。** R-1 の composer は `useExternalStoreRuntime` に
`isDisabled: true` を渡して**送信経路を閉じてある**。到達しないはずの `onNew` は
黙って握り潰さず `throw` する。したがって R-1 に「検証していない送信経路」は無い。

この前提は文章ではなく `src/renderer/src/features/chat/ChatScreen.test.tsx` が守る。
入力が無効であること、変換確定直後の Enter が送信経路に届かないことの 2 ケースである。
`isDisabled` が外れた瞬間にここが落ちる。

Constitution は v1.2.2 でこの訂正を反映した。

## Alternatives considered

- **ディレクトリを Constitution の記述に合わせて改名する** — AD-023 に反する。
  公式 scaffold の構成から外れると、以後のアップデート手順が当てにならなくなる
- **実装側だけを直す** — SSoT と実装が食い違ったまま残る。
  Governance により Constitution が正なので、正しい実装が違反として再燃し続ける
- **Principle ごとに個別の ADR を起こす** — 17 件はすべて「AD-023 のレイヤ構成確定に伴う
  実体合わせ」という 1 つの原因から出ている。分けると改定の理由が追えなくなる

## Open Questions

- [x] ~~Principle VIII の Automated 検証 (日本語スクリーンショット比較) を
      R-1 の CI にどこまで載せるか~~ — 上の「Principle VIII の Automated 検証を
      R-1 でどこまで載せるか」で決着。(A) は対象が無く、(B) は R-2 の E2E 基盤に相乗りする
- [ ] 検証項目の `pending` (検査対象が未実装) が残っている間の gate の扱い。
      R-1 時点では項目 2 / 5 / 6 が該当する

## References

- [AD-023](0023-application-architecture.md) — レイヤ構成と依存規則
- [AD-010](0010-supervisor-runs-standalone.md) — supervisor の単独起動可能性
- [AD-012](0012-docker-control-via-cli.md) — 引数配列でコマンドを構成する形
- [AD-025](0025-workspace-folder-carries-location.md) — 本 feature のもう 1 つの ADR
- Constitution v1.1.0 Principle I / II / III / V / VI / VII / IX / XI / XIII / XIV / XV
- `specs/001-runtime-folder-registration-runtime-detection/research.md` R-08
- `scripts/constitution/allowlists.mjs` — 許可リストの正本
