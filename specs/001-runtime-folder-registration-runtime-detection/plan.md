# Implementation Plan: フォルダ登録とランタイム検出 (R-1)

**Branch**: `001-runtime-folder-registration-runtime-detection` | **Date**: 2026-09-14 | **Spec**: [spec.md](spec.md)

## Domain Context

### Charter reference

- **Domain**: `runtime` ([charter](../../docs/domains/runtime/charter.md))
- **Mission**: Claude Code プロセスを「どこで」「どうやって」起動するかを抽象化し、
  ホストと実行環境のあいだのパス名前空間と能力差を吸収する
- **本 feature が満たす In scope**: `AgentRuntime` インタフェース / ランタイムの検出 /
  `capabilities` の**表明** / パス型と多段変換 / 作業フォルダの登録と到達可能性 /
  パッケージング (SPIKE-13 第 1 段階まで)
- **本 feature が満たさない In scope** (charter 側を改める):
  - **docker endpoint の判別** → `isolation` (I-1)。`_overview.md` は I-1 を `isolation` に
    割り当てており charter と食い違っている
  - **`AgentRuntime` の起動契約** → `session` (X-1)。本 feature は `descriptor` と `path` まで
  - **配布 (署名・自動更新・NOTICE)** → D-1
- **charter の Out of scope で修正が要るもの**: 「画面表示 → `ui` domain」。
  他 3 domain の charter は「element 選定と見た目」と狭く書いており、`runtime` だけが広い。
  本 feature は renderer に 3 画面を持つため、同じ粒度に揃える
- **charter の Open Question のうち本 feature で決着するもの**:
  「フォルダ × ランタイムの越境判定」「停止中ディストロの扱い」。
  **AD-015 / AD-016 側の同一 Open Question も同時に閉じる**

### Related ADRs

| ADR | 本 feature への影響 |
|---|---|
| [AD-003](../../docs/decisions/0003-runtime-abstraction-by-transport.md) | `AgentRuntime` はシングルトンでなく検出結果から生成される値。複数インスタンスが存在しうる |
| [AD-004](../../docs/decisions/0004-branded-path-types.md) | パス名前空間を型で分離。**型と API の両方が**多段変換を表現できる必要がある |
| [AD-009](../../docs/decisions/0009-unpack-native-binaries-from-asar.md) | ネイティブ再ビルドは `electron-builder install-app-deps` |
| [AD-012](../../docs/decisions/0012-docker-control-via-cli.md) | 多段変換が必要になる根拠。R-02 に拡張点を残す |
| [AD-013](../../docs/decisions/0013-node-and-electron-versioning.md) | `tsconfig` の `target` / `lib` を Electron 同梱 Node に合わせる。CI は Active LTS 基準 |
| [AD-015](../../docs/decisions/0015-wsl-access-strategy.md) | ファイル読みは UNC 直読み / `wsl.exe` は約 1.5 秒でループ内禁止 / UTF-8 要求 / マッピングはマウントオプションが正本 / 引数のバックスラッシュは消える / sandbox は実地判定 |
| [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) | 越境時にディレクトリ走査が約 800 倍。**選択不可にせず**明示して推奨を案内する |
| [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) | element 総数 202、59 要素が未分類。「存在しない」の断定には実名照合が要る |
| [AD-023](../../docs/decisions/0023-application-architecture.md) | 5 レイヤ / インタフェースは `domain` 側 / ESLint と dependency-cruiser の**両方** / Electron セキュリティ要件を全面採用 |

### Glossary

`AgentRuntime` / `capabilities` / `autoModeSafe` / `HostPath` / `RuntimePath` / `supervisor`。
本 feature での追加・修正は [data-model.md](data-model.md) §10 を参照。

## Summary

R-1 は**プロジェクトの初期化と `runtime` domain の最下層**を同時に立てる。

1. 公式 CLI で骨格を作り、AD-023 の 5 レイヤとセキュリティ要件をその差分として載せる
2. WSL ディストロを検出し、AD-015 §8 の実地判定で `capabilities` を表明する。
   停止中ディストロは起動せず、**実行状態の確認を経た値しか受け取れない型**で入口を閉じる
3. 作業フォルダを所在つきで登録し、**パス変換・到達可能性・越境**を解決する
4. 依存規則を ESLint と dependency-cruiser の両方で強制し、Principle I / II / VI / VII を
   **許可リスト方式**で機械検証できる状態にする
5. README と LICENSE を置き、インストーラを 1 回通して SPIKE-13 第 1 段階を済ませる

技術的な要点は 2 つ。

- **`wsl.exe` を呼ぶ回数を O(1) に保つ** — 固定コストが約 1.5 秒あり、
  ディストロ数にも利用者の操作回数にも比例させられない
- **名前空間を境界の外でも失わない** — 型・IPC・永続化の 3 箇所で一貫させる

## Technical Context

**Language/Version**: TypeScript (strict)。実行時の言語機能は Electron 同梱 Node が決める (AD-013)。
ビルドツールはホスト Node の Active LTS

**Primary Dependencies**: Electron / electron-vite / Vite / React / Zustand (renderer のみ) /
assistant-ui (design system のみ) / Agent SDK (**依存として入れるのみ**) / electron-builder /
ESLint + `eslint-plugin-boundaries` / dependency-cruiser / Vitest + Testing Library / Playwright (骨格のみ)

**Storage**: 登録フォルダはユーザデータ配下の JSON ([contracts/workspace-store.md](contracts/workspace-store.md))。
**ディレクトリのパスは `app` レイヤが解決し `infra` に注入する** (FR-038)。
SQLite は R-2 以降。検出結果はメモリ上のキャッシュ

**Testing**: Vitest (`domain` はモックゼロ) / `infra` は出力のフィクスチャ /
**preload をスタブした renderer 単体テスト** / Playwright は骨格のみ。CI ランナーは Windows

**Target Platform**: Windows 11 + WSL2。`Win32Runtime` と `WslRuntime`。
macOS / Linux は OPT-mac、コンテナは I-1

**Project Type**: desktop-app (main + preload + renderer。utilityProcess は X-5)

**Performance Goals**: SC-004 のとおり。**開発ビルドが計測値をログ出力し、目視で判定しない**

**Constraints**:

- `wsl.exe` は 1 回約 1.5 秒。呼び出し回数を入力サイズにも操作回数にも比例させない
- `wsl.exe` の引数はバックスラッシュを消す。スクリプトは標準入力で渡す
- WSL 内のファイル読み取りは UNC 経由
- UTF-8 出力を要求する。改行は CRLF。ヘッダと状態文字列はロケール依存
- マウントマッピングはマウントオプションが正本。種別でフィルタしない
- main process をブロックしない (Principle IX)

**Scale/Scope**: WSL ディストロ 〜10 / 登録フォルダ 〜50 / 画面 3 つ

## Constitution Check

`.specify/memory/constitution.md` v1.1.0 に基づく。

**NON-NEGOTIABLE**

| | 判定 | 根拠 |
|---|---|---|
| **I. パス操作は `runtime.path` 経由** | ⚠ | `domain` がパス API を公開し (FR-025)、標準モジュールの import を実装モジュール 1 つに限定する。ESLint と dependency-cruiser の両方で強制。**ただし Statement の「すべて `runtime.path` を経由」が設計と食い違う** — ホスト名前空間の操作・`infra/settings` のパス組み立て・`ui` から呼ぶ接頭辞照合の 3 経路は `AgentRuntime.path` を通らない (Complexity #2、AD-024 **#14**) |
| **II. プラットフォーム分岐は `runtime/` の内側** | ✅ | scaffold 由来の 2 箇所に注記。検証は等価な API と構文変形も対象とし、許可ディレクトリを実名で定義する (FR-036) |
| **III. 権限モードは capability に従う** | ✅ 該当 (表明側) | ゲートは I-3 だが `_overview.md` の invariant 表は `runtime` を含む。安全側解釈を単一の判定点に集約する (FR-008) |
| **IV. 通信は Agent SDK 経由** | N/A | 本 feature は Claude Code と通信しない |
| **V. 長期資格情報を永続化しない** | ✅ 該当 (条件付き適合) | Statement が「設定ファイル」を名指しており、R-1 は最初の設定ファイル層を作る。保存フィールドを allow-list で固定する (FR-019) |
| **VI. 永続環境を構築・変更しない** | ✅ | 停止中ディストロを型で起動できなくする / 依存を導入せず案内に留める / 越境時に移動しない。検証は許可リスト方式 (FR-037) |
| **VII. supervisor は Electron / ネイティブ非依存** | ⚠ | 検証条件に drift。Complexity #2 |
| **VIII. 日本語環境で破綻しない** | ✅ 該当 | composer は X-2。該当は日本語を含む名前の表示と出力デコード (SC-011)。**CI 構築時期の再確認条件が本 feature で発火する** |

**Standard**

| | 判定 | 根拠 |
|---|---|---|
| **IX. main をブロックしない** | ✅ | 判定と列挙は非同期。検証条件に drift あり (Complexity #2) |
| **X. セッションの正本はアプリ外** | N/A | セッションを扱わない |
| **XI. 垂直スライス** | ✅ | US-1 / US-2 / US-3 が観測可能。Exceptions が「R-1 は UI を持たない」と述べており事実と食い違う (Complexity #2、AD-024 **#15**) |
| **XII. 未表示情報を残さない** | N/A | `docs/ui-coverage.md` は O-2。対象は **Claude Code が emit する情報を表示する feature** であり、本 feature は emit 情報を表示しない (「UI 系 feature」という未定義語に依存させない) |
| **XIII. assistant-ui を優先** | ⚠ Exceptions 該当 | Complexity #4 |
| **XIV. Ubiquitous Language** | ✅ | 用語の追加と既存項目の修正を行う (data-model §10) |
| **XV. 多言語規約** | ⚠ | README を英語にする。Exceptions 節が存在しない。Complexity #3 |

## Project Structure

公式 scaffold が生成する `src/main` / `src/preload` / `src/renderer` を土台とし、
5 レイヤはその中と追加する 2 ディレクトリで表現する (AD-023)。**ディレクトリ名を作り替えない。**

```text
src/
├── main/
│   ├── index.ts                  app: エントリ。注記が入る 2 箇所 + 単一インスタンス制限
│   ├── app/                      app: Electron の組み立てと結線。electron 許可箇所
│   │   ├── window.ts             ウィンドウ / カスタムプロトコル登録 / CSP
│   │   ├── ipc.ts                データのみのプロトコル。未信頼入力の検証
│   │   ├── folder-picker.ts      所在 windows 用のネイティブダイアログ
│   │   └── composition-root.ts   Electron 由来の値を解決し infra / domain に注入
│   └── infra/                    infra: OS 資源との境界。electron を import しない
│       ├── runtime/              検出。プロセス起動とプラットフォーム分岐の許可ディレクトリ
│       ├── fs/                   UNC 経由の列挙
│       ├── settings/             JSON 永続化
│       └── secrets/              (空。electron import の例外枠。X-3 で使う)
├── preload/                      app: 単一 capability を公開
├── renderer/src/                 ui
│   ├── stores/                   Zustand
│   ├── features/{runtime-list,workspace-folders,folder-runtime-resolution}/
│   ├── components/assistant-ui/  registry から copy した element の実体 (自作しない)
│   │   ├── elements/             element + 共有トークン surfaces.tsx
│   │   └── utils/                element が相対 import する補助
│   ├── components/               自作の共有コンポーネント
│   ├── lib/utils.ts              shadcn 規約の `cn`
│   └── assets/main.css           Tailwind v4 + shadcn 標準テーマ
├── agents/                       (空。tsconfig / lint / dep-cruiser の対象としてのみ)
└── domain/                       I/O なし
    ├── runtime/                  パス型 / パス API 実装 / capabilities / インタフェース / DTO
    └── workspace/                作業フォルダ / 名前空間照合 / 接頭辞照合 / 解決 / DTO

scripts/constitution/             Principle II / VI の許可リスト検証
tests/rule-fixtures/              依存規則の違反サンプルと期待表
eslint.config.mjs / .dependency-cruiser.cjs / electron.vite.config.ts / electron-builder.yml
tsconfig.json / tsconfig.node.json / tsconfig.web.json / LICENSE / README.md
docs/runtime/wsl-sandbox-dependencies.md      sandbox 依存の導入手順 (FR-048)
```

**Structure Decision**: `domain` と `agents` を `src/` 直下に追加し、tsconfig の `include` を
それぞれ拡張する。

- **パス操作の標準モジュールは `domain/runtime` のパス API 実装 1 ファイルに限る。**
  ディレクトリ制限だけでは、制限の外でパス合成を要するモジュールが実装不能になる
- **接頭辞照合は `domain/workspace` の別モジュールに置く。** 解決関数は `ui` から呼べる必要があり、
  標準モジュールに依存させられない
- **DTO は `domain` に置く。** preload に置いて renderer が import すると `ui → app` になる
- Constitution の grep はディレクトリ**名**で一致するため、ESLint / dependency-cruiser の
  ファイル限定とは同じ境界を指さない。**Automated の正本を lint とグラフ検証に移し、
  grep は補助と位置づける** (AD-024)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **#1 依存規則の検証ツールを 2 つ使う** | ESLint は直接 import しか見ず CommonJS の `require()` も対象外。推移的経路と `require()` はグラフ検証でしか塞げない | 片方だけにすると、規約が検証可能な制約にならない (ESLint のみ) か、編集時のフィードバックが失われる (グラフ検証のみ) |
| **#2 Constitution の検証条件・Statement・用語が AD-023 のレイヤ構成および本 feature の実体とずれている** | 下表の 17 件。**本 feature でディレクトリ構成が確定するため、放置すると各ルールが存在しないディレクトリを指し続ける** | ディレクトリを改名する案は AD-023 に反する。実装側だけ直すと SSoT と実装が食い違ったまま残る。**AD-024 でまとめて改定する** |
| **#3 README を英語で書く** | 外部 OSS としての体裁を最初のコミットから持たせる (`docs/prompts.md`) | Principle XV に `Exceptions` 節が無く、逸脱を記録する手段がない。**AD-024 で Exceptions を追加し逸脱ではなく規約にする** |
| **#4 UI コンポーネントを自作する** | assistant-ui は会話 UI の element 集合であり、本 feature の 3 画面は会話ではない | AD-019 は 59 要素が未分類と明記しており**不在の確認は構造的に未完了**である。「存在しない」と断定せず、一覧・状態表示に転用しうる候補を実名で照合して不適合理由を PR に残す。Principle XIII の Exceptions 文言もこの形に合わせて改める (AD-024 #11) |
| **#5 R-1 を分割しない** | 依存規則の機械強制は単体で観測可能な振る舞いを持たず Principle XI に反するため初期化と同居させるほかない。README / LICENSE は「最初のコミットから体裁を持たせる」が要件そのもの | R-1a / R-1b に割る案は自然な切れ目だが、`_overview.md` と `roadmap.md` の feature 表の更新と ID 再採番を伴い、得られるのは PR の粒度だけ。**代わりに「US-3 完了時点で R-2 に着手してよい」を明記して直列待ちを避ける** |

### #2 の内訳 (AD-024)

`docs/decisions/0024-constitution-verification-paths.md` でまとめて改める。

| # | 対象 | 現在 | 改定後 |
|---|---|---|---|
| 1 | VII | `src/supervisor/` を検査 | `src/agents/` を検査。推移的依存はグラフ検証が見ることを明記 |
| 2 | VII | `require()` 形式のみ | import / require の両形式。**Automated の正本を lint + グラフ検証に移す** |
| 3 | VI | docker の許可先が `src/isolation/` | **モジュール許可リスト**。正本は検証スクリプト内の定数。**追加には ADR を要する** |
| 4 | VI | 特定サブコマンドの決め打ち | `wsl.exe` に渡す引数の**許可リスト** |
| 5 | VI | 検証スコープが `src/` のみ | ビルド構成 (scripts / CI / パッケージング設定) を含める。特権コマンド一覧に Windows 側を追加 |
| 6 | IX | `--exclude-dir=supervisor` | `src/agents/` に読み替える |
| 7 | I | ディレクトリ名での除外 | 許可ファイル方式。**Automated の正本を lint + グラフ検証に移す** |
| 8 | **II** | ディレクトリ名での除外 (`src/domain/runtime/` も免除される) | **許可ディレクトリを実名で限定**し、Automated の正本を検証スクリプトに移す |
| 9 | V | 検証が SQL のカラム型に依存 | 設定ファイルも対象に含める。`reviewers.yml` の `database-reviewer` の発火条件に設定層を追加 |
| 10 | XIII | 特定の設定ファイルを参照。**かつ `bad_pattern_grep` がそのままでは実行できない** | 下記「SH-008 の実測」の 3 点を反映する |
| 11 | XIII | Exceptions が「存在しないこと」の記載を要求 | 「存在しない**か、候補を実名で照合したうえで不適合である**こと」に改める |
| 12 | XV | Exceptions 節が無い | リポジトリ表層文書 (README 等) は英語、内部文書は日本語を SSoT とする Exceptions を追加 |
| 13 | III / 用語 | `autoModeSafe === false` を前提 | 「`!== true`」に改め、判定を単一の関数に定める。`supervisor` と `src/agents/` の対応を定義し、immutable な ADR は読み替え対象として列挙する |
| 14 | **I (Statement)** | 「パス操作は**すべて `runtime.path` を経由する**」 | 「パス操作は `domain` が公開するパス API を経由する。ランタイム名前空間の操作は `AgentRuntime.path` として公開し、**ホスト名前空間の操作と接頭辞照合は同モジュール群の別の公開面**とする。標準モジュールを直接 import してよいのは実装ファイル 1 つに限る」に改める |
| 15 | **XI (Exceptions)** | 「**R-1 のような基盤 feature は UI を持たない**が、パス変換のユニットテストという観測可能な振る舞いを持つ」 | 「基盤 feature が UI を持つ場合を含め、**観測可能な振る舞いが 1 つ以上あれば足りる**」に改める |
| 16 | **XIV (本文)** | 「`docs/glossary.md` は**未作成のため**、glossary 作成時に付録 A を一次素材とする」 | 「未作成」を削り、現行 glossary を参照する形に改める |
| 17 | **未解決 Principle 候補 #2** | 「配布物のライセンス表記 — `LICENSE` / `NOTICE` が不在」 | 自プロジェクトの `LICENSE` を解消済みとし、**残余 (第三者依存の `NOTICE`) を D-1 に限定**する |

#14 〜 #17 は、いずれも**本 feature の完了と同時に Constitution 本文の記述が事実と食い違う**箇所である。
#14 は設計側が `runtime.path` を経由しないパス操作を 3 経路持つ (ホスト名前空間の操作 /
`infra/settings` のパス組み立て / `ui` から呼ぶ接頭辞照合) ため、Statement を改めないと
Governance「Principle と ADR が食い違う場合は Constitution を正とする」により
NON-NEGOTIABLE 違反として code-gate / pr-gate で再燃する。
#15 は renderer 3 画面を持つ本 feature が Exceptions の反例そのものになる。

#### SH-008 の実測 (2026-09-14。#10 の内訳)

R-1 の Phase 1 で assistant-ui を実際に導入して判定した。

| # | 観察 | 対応 |
|---|---|---|
| a | `grep -rnE "--color-\ | colors:\s*\{\ | spacing:\s*\{" src/ tailwind.config.*` は **`grep: unknown option` で失敗する**。パターンが `--` で始まるため grep がオプションとして解釈する | `-e` を付けるか `--` セパレータを置く。Principle VI #2 は `grep -rn -- "--import" src/` と正しく書かれており、**XIII だけの取りこぼし**である |
| b | 修正して実行すると **23 件ヒットする**。全件が `src/renderer/src/assets/main.css` の **assistant-ui / shadcn 標準テーマ**であり、`npx assistant-ui@latest create -t minimal` の生成物を写したもの。**独自トークンの追加ではない** | 検証条件を「標準テーマの写しを除いた追加分」に限定する。除外はファイル単位の明示リストとする (FR-037 の既定に合わせる) |
| c | `tailwind.config.*` は**存在しない**。Tailwind v4 は CSS 内 (`@theme inline`) で設定する | grep の対象を `src/` 配下の CSS に改める |

あわせて **`npx assistant-ui@latest init` は electron-vite プロジェクトで動かない** (フレームワーク検出に失敗) ことを実測した。
現行の assistant-ui に独立した design system パッケージは無く (`@assistant-ui/styles` は retired)、
styling は registry から copy される element に付随する。したがって FR-033 の
「公式 CLI で design system を導入する。Element は採用しない」は字義どおり成立しない。
**人間判断により「最初から Element も入れ、チャットの runtime / backend は繋がない」方針を採った。**
手順は公式が Vite 向けに案内する手動セットアップ (`components.json` + Tailwind v4 + path alias → `add`) である。
この読み替えは AD-025 に記録する。

**version bump**: #8 の一部と #11 / #12 / #13 / #14 / #15 は**指針の実質的な拡張**にあたるため **MINOR**。
検証条件のみの改定 (#1〜#7 / #9 / #10) と事実追随 (#16 / #17) は PATCH。
**両者を含むため MINOR (v1.2.0) とする。**
#13 は NON-NEGOTIABLE の強化にあたるため、改定手順の「既存違反 enumeration」が発火する。

**AD-025** では次を記録する。

- 作業フォルダは**所在を伴う値**として登録し、越境判定と到達可能性を所在 × ランタイム ×
  マッピングで決める (X-4 / I-1 が同じ表を拡張する)
- **AD-004 の 2 brand モデルを 3 名前空間 + 実行時識別子に一般化する。**
  AD-004 はその特殊例として読み替える
- **AD-004 と AD-023 のパス変換責務の調停** — 「`AgentRuntime` の内側」は公開 API 面を指す
- **`ui → domain` は型と副作用のない純粋関数まで。ただし node builtin に到達させない**
- **安全側解釈は `runtime` が持つが、「安全とみなす sandbox 種別」の定義は I-3 で `isolation` に移す**
- **AD-023 の検証済み事実の訂正 (R-1 実装時に実測)** — 2 件。
  (a) 「`@electron-toolkit/preload` は sandbox 下でも動く」は**成立しない**。
  electron-vite は preload の外部依存を `require("@electron-toolkit/preload")` として
  残すため、`sandbox: true` の preload では `module not found` になる。
  AD-023 の検証は「8 秒間 stderr 無しで生存」だったが、**preload のエラーは
  renderer コンソールに出るため stderr に現れず**、検証が弱すぎて見落とされていた。
  R-1 は preload を単一 capability に置き換え `electron` のみを require する形にした。
  (b) `npx assistant-ui@latest init` は electron-vite プロジェクトで**フレームワーク検出に失敗する**。
  独立した design system パッケージは存在せず (`@assistant-ui/styles` は retired)、
  styling は registry から copy される element に付随する。
  公式が Vite 向けに案内する手動セットアップ (`components.json` + Tailwind v4 + path alias → `add`) を採った
- **FR-040 の CSP 要件の訂正 (同)** — 「`unsafe-inline` を開発時も禁じる」は
  公式の dev フローと両立しない (React Refresh preamble がインライン script)。
  開発ビルドの `script-src` / `style-src` に限り許し、`unsafe-eval` は両環境で禁じる形に改めた
- **R-3 / R-4 への申し送り** — renderer の配信プロトコル・CSP 基線・検証項目 10 は R-1 が
  `app` レイヤで固定する。`ui` 系 feature がこれを超える指定を要する場合は、
  **nonce / hash で `unsafe-inline` を用いずに満たすか、緩和を ADR で記録する**
- **X-1 への申し送り** — 所在 WSL × `Win32Runtime` の到達不可は「UNC を cwd にできない」の
  実証ではなく**未検証を根拠にした安全側の既定**である。X-1 が検証し、可能なら判定表を改める
- **R-2 への申し送り** — (a) 停止中ディストロ内のセッションは R-2 の列挙対象外である。
  利用者がディストロを起動して再検出した時点で対象になる (SC-005 の帰結)。
  (b) `session` が列挙用のプロセス起動モジュールを足すときは、
  **FR-041 の許可リストに ADR で追加する**必要がある
- **依存規則の機械強制で実測した「設定しただけでは効かない」点 (SH-011 〜 SH-014)** —
  いずれも**書いてあるのに評価されない**形であり、発火確認をしなければ気付けなかった。
  同じ罠を後続 feature が踏まないよう記録する。
  (a) `eslint-plugin-boundaries` の `boundaries/dependencies` は `checkAllOrigins` が
  既定 `false` で、**外部パッケージと Node 標準モジュールの policy を一切評価しない**。
  (b) 解決器 (`eslint-import-resolver-typescript`) を**solution-style の root `tsconfig.json`**
  に向けると、`files: []` のためどのファイルも属さず `paths` が引かれない。
  実測で `@/...` の 62 件が「未知の依存」に落ち、許可行列が適用されていなかった。
  参照先 project を直接並べる。
  (c) 同プラグインの `flagAsExternal.unresolvableAlias` は既定 `true` で、
  **bundler は解決できるが解決器は解決できない綴り** (`@/../../main/app/ipc`) を
  「外部」に分類して許可行列をすり抜けさせる。`false` にして「未知」へ落とし
  `no-unknown-dependencies` で捕まえる。
  (d) dependency-cruiser のグラフでは npm パッケージが `node_modules/<name>/...` として
  現れる。`^electron($|/)` と書いたルールは 1 件も一致せず**黙って死んでいた**。
  (e) dependency-cruiser の `reachable: true` (推移的到達) ルールは `path` / `pathNot` しか
  受け取らず、`dependencyTypes: ['core']` と併記すると設定が schema 違反で落ちる。
  標準モジュールの一覧は `node:module` の `builtinModules` を正本にして正規表現を組む
- **Node 標準モジュール禁止の適用範囲 (SH-011)** — FR-035 と AD-023 §7 が名指すのは
  `domain` / `agents` / `ui` である。全レイヤ禁止にすると規約より厳しくなり、
  `app` のカスタムプロトコルハンドラ (`node:fs/promises` で同梱 renderer を読む) を
  例外で開ける形になる。**規約どおりの範囲に揃えた。**
  結果として `app` は `node:fs` を直接使える — `infra` を OS 資源の境界とする
  AD-023 §1 の建前とは緩い。**この緩さを許すか `infra` に寄せるかは AD-025 で決める**
- **AD-023 §7 の `services ✗→ I/O モジュール直接` は R-1 に対象が無い** —
  AD-023 §5 が UseCase レイヤを作らないと決めており、`services` に当たる
  ディレクトリが存在しない。**対象が無いルールを書いて「強制した」とは言えない**ので、
  最初の調停クラスを作る feature で `from` セレクタを実名で定義する
- **prettier を markdown に掛けない (SH-015)** — 実測で 2 つの害が出た。
  (a) 表を**文字数**で揃えるため全角の表が等幅表示で崩れる。
  (b) markdown 内のコードフェンスも整形対象で、`semi: false` により
  ADR の TypeScript 例からセミコロンが消える。`.prettierignore` で `*.md` を除外した
- **Principle II の `platform-ok:` 注記は prettier で壊れる (SH-014)** —
  `if (process.platform !== 'darwin') { // platform-ok: ...` と書くと
  prettier が注記を次の行へ送り、**同じ行**という例外条件を満たさなくなる。
  判定をいったん `const` に受けて注記をその行に置く形にした。
  AD-024 で Principle II の例外の書き方に「整形器が動かさない位置に置く」を補う
- **CLI 生成物 (`shadcn` / `assistant-ui add`) に体裁と厳格さのルールを掛けない (SH-015)** —
  次の `add` で上書きされ、上流との差分も読めなくなる。
  **レイヤ規則と禁止 import は掛け続ける** — こちらは上流の体裁ではなく本プロジェクトの不変条件。
  除外集合は `eslint.config.mjs` の `GENERATED_FILES` と `.prettierignore` に同じ内容で書く
- **検証スクリプト自身を検証対象から外さない工夫 (SH-014)** — 項目 9 / 11 を
  「名前の出現」で判定すると、許可リストに書いた定数の値が存在確認を満たしてしまい、
  アプリからハンドラを消しても検証が通る (実測で見つけた穴)。
  **呼び出し形**で判定することで、FR-037 の「`scripts/` も検証対象」を保ったまま塞げる。
  リテラル走査の項目 (1 / 3 / 4 / 5) だけは定義ファイル 2 つを除外する
- **`wsl` / `docker` の裸のコマンド名は 2 項目を噛み合わせて塞ぐ (SH-014)** —
  `wsl` は本プロジェクトのユビキタス言語でもある (`kind: 'wsl'` / `wsl:<distro>`) ため、
  無条件に違反にすると `domain` の型定義が全部引っかかる。
  `wsl.exe` は常に違反、裸の `wsl` は**プロセス起動の呼び出しがあるファイルでのみ**違反とし、
  起動そのものを項目 7 が許可リストに絞る形にした。`net` / `sc` / `reg` などの
  ありふれた語の特権コマンドも同じ扱いにしてある
- **Constitution 検証の結果は 3 状態で報告する (SH-014)** — `ok` / `violation` /
  **`pending` (検査対象がまだ存在しない)**。`pending` を `ok` に混ぜると
  「まだ書いていないから通った」が「検証したから通った」と区別できなくなる。
  R-1 の現時点では項目 2 / 5 / 6 が `pending` である

### 上流 SSoT の追随 (#2 と同時に行う)

| 対象 | 内容 |
|---|---|
| `docs/domains/runtime/charter.md` | Out of scope の「画面表示」を他 charter と同じ粒度に / In scope から docker endpoint を `isolation` へ / KPI を WSL 側と docker 側に分割 / Key concepts の `AgentRuntime`・`capabilities` 定義 / 業務ルールのパス API 表記 / 閉じた Open Question の訂正 |
| `docs/domains/isolation/charter.md` | `autoModeSafe === false` を前提とする 2 箇所 (**I-3 のゲートが素通りするため着手前に必須**) |
| `docs/domains/_overview.md` | Cross-domain invariants のパス API 表記 / R-1 行の実体 (初期化・CI・UI を含む) |
| `docs/glossary.md` | data-model §10 のとおり |
| `docs/discovery.md` / `docs/prompts.md` | Tech Stack の「detected: none」/ `supervisor` を実ディレクトリとして参照している箇所 |
| `docs/roadmap.md` | R-1 行と SPIKE-13 の状態 / R-2 の依存を「R-1 の US-1〜US-3 完了」に細分 |
| `docs/domains/session/charter.md` | KPI「WSL ディストロ内の config ディレクトリを Windows 側から取りこぼさず列挙できる」に **「実行中のディストロについて」の限定**を加える。R-1 が SC-005 で停止中ディストロを起動しないと決めたため、停止中ディストロ内のセッションは R-2 では原理的に列挙できない (**R-2 着手前に必須**) |
| `docs/domains/ui/charter.md` | **Out of scope に「他 domain の操作 UI は各 domain が持つ」を追加**し Principle XII の持ち主を明確にする。**In scope は触らない** — 実体は「Electron 特有の配線（preload / IPC **越しの**ストリーミングブリッジ）」であり既に限定済みで、基盤そのものを掲げてはいない。あわせて配信プロトコル・CSP 基線・検証項目 10 が `ui` 系 feature を拘束することと、緩和の手続き (nonce / hash か ADR) を追記する |
| `.claude/agents/` 配下 | Principle の条件式・ディレクトリ名を本文に持つ箇所 (`autoModeSafe === false` → `!== true`、`src/supervisor/` → `src/agents/`)。**gate を実行する reviewer 自身が旧条件で判定すると、charter だけ直しても I-3 のゲートは素通りする** |
| `.specify/templates/plan-template.md` / `PLAN.md` | Constitution Check のチェック項目と本文にある `runtime.path` 表記 (AD-024 #14)。放置すると R-2 以降の全 plan が旧文言で Constitution Check を行い、`PLAN.md` は次の bootstrap 素材として旧文言を再流入させる |

## Post-design re-check

| 項目 | 到達条件 |
|---|---|
| VII / IX (検証条件の drift) | AD-024 #1 / #2 / #6 が accepted になり、`src/agents/` に対するルールが実装されること |
| **I (Statement の drift)** | AD-024 **#14** が accepted になり、`.specify/templates/plan-template.md` と `PLAN.md` の表記が追随すること |
| **XI (Exceptions の drift)** | AD-024 **#15** が accepted になること |
| **XIV / 未解決候補 #2 (事実の追随)** | AD-024 **#16 / #17** が accepted になること |
| XIII | AD-024 #10 / #11 で検証条件と Exceptions 文言が追随し、Complexity #4 の照合結果が PR に記載されること |
| XV | AD-024 #12 で Exceptions が追加されること |
| charter 整合 | charter の In scope / Out of scope / KPI / Key concepts が更新されること |

上記はいずれも本 feature のタスクで閉じる。設計上の未解決事項は残っていない。
