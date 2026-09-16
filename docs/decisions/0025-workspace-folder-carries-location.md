---
status: accepted
date: 2026-09-15
id: AD-025
deciders: ukitomato
tags: [domain-model, path, enforcement, ui]
supersedes: []
superseded-by: []
---

# AD-025: 作業フォルダは所在を伴う値として扱い、パス型モデルを 3 名前空間に一般化する

## Context

R-1 (フォルダ登録とランタイム検出) の設計中に、既存 ADR の前提が 3 点で足りないことが分かった。

1. **[AD-004](0004-branded-path-types.md) は 2 brand (`HostPath` / `RuntimePath`) を前提にしている。**
   R-1 は WSL への UNC 経路 (`\\wsl.localhost\<distro>\...`) を第 3 の名前空間として扱う必要がある。
   さらに `\\wsl.localhost\Ubuntu\` と `\\wsl.localhost\Debian\` は**別のファイルシステム**であり、
   `RuntimePath` を 1 つの brand にすると `Ubuntu` のパスを `Debian` のランタイムに渡せてしまう
2. **作業フォルダを「パス」として登録すると所在が失われる。**
   同じ `/home/y/p` が `wsl:Ubuntu` と `wsl:Debian` の両方に存在しうる。
   越境判定 (AD-016 の性能崖) も到達可能性も、所在が分からなければ決められない
3. **[AD-023](0023-application-architecture.md) は「パス変換は `AgentRuntime` の内側」と述べ、
   AD-004 は「`runtime.path` を経由」と述べている。** R-1 のパス API は `domain` にあり、
   `ui` からも接頭辞照合を呼ぶ。どちらの ADR とも字義どおりには一致しない

加えて、実装を通して**既存 ADR の「検証済み事実」が 2 件成立しないこと**、
および **FR-040 の CSP 要件が公式の dev フローと両立しないこと**を実測した。
これらも同じ feature 由来なので本 ADR にまとめる。

## Decision

### 1. 作業フォルダは所在を伴う値として登録する

`WorkspaceFolder` を**所在で判別する union** とする。

```ts
type WorkspaceFolder = WindowsWorkspaceFolder | WslWorkspaceFolder
```

所在 (`Location`) は `{ kind: 'windows' }` または `{ kind: 'wsl', distroName }` である。
重複判定のキーは `(所在, 正規化済みパス)` の組とする (FR-016)。

**名前空間の照合は 1 つの純粋関数に集約する** (`isNamespaceConsistent`)。
所在とパスの名前空間が食い違うレコードは復元しない (FR-019)。

越境判定と到達可能性は **所在 × ランタイム × マッピング**の表で決める。
X-4 (コンテナ) と I-1 (2 ホップ) は同じ表を拡張する。

### 2. パス型モデルを 3 名前空間 + 実行時識別子に一般化する

| 型 | 名前空間識別子 | 例 |
|---|---|---|
| `HostPath` | `host` | `C:\dev\closta` |
| `RuntimePath` | `wsl:<distro>` | `/home/y/p` |
| `WslUncPath` | `unc:<distro>` | `\\wsl.localhost\Ubuntu\home\y\p` |

**識別子はディストロ粒度で保持する。** `unc:` を per-distro にするのは、
`\\wsl.localhost\<distro>\` が distro ごとに別のファイルシステムだからである。

**`NamespaceId` からディストロ成分を取り出してよいのは `isSameDistro(a, b)` 1 箇所に限る。**
比較は完全一致とする — 部分一致で書くと `Ubuntu` が `Ubuntu-26.04` に当たる。

**AD-004 はこのモデルの特殊例として読み替える。** AD-004 は immutable なので本文は変更せず、
本 ADR を読み替えの根拠とする。

### 3. AD-004 と AD-023 のパス変換責務を調停する

**「`AgentRuntime` の内側」は公開 API 面を指す。** 実装の置き場所を指すのではない。

- ランタイム名前空間の操作は `AgentRuntime.path` として公開する
- **ホスト名前空間の操作と接頭辞照合は、同じモジュール群の別の公開面**とする
- 標準モジュール (`node:path`) を直接 import してよいのは**実装ファイル 1 つ**に限る

この読み替えは Constitution Principle I の Statement にも反映した ([AD-024](0024-constitution-verification-paths.md) #14)。

### 4. `ui → domain` は型と副作用のない純粋関数まで

`ui` は `domain` から**型と純粋関数だけ**を取る。越境判定や接頭辞照合のような
表示に必要な規則は `ui` からも呼びたいため、`domain` を参照させる。

**この制約は列挙では守れないので構造で守る。**
`domain` から I/O モジュールへの到達を**推移的に**禁止することで
(`.dependency-cruiser.js` の `domain-not-to-io`)、
`ui` が `domain` から取れるものが純粋なものだけになる。
あわせて **`ui` から node builtin への推移的到達**も禁止する (`ui-not-to-core` / FR-035)。

接頭辞照合を標準モジュールに依存しない別モジュール (`workspace/prefix-match.ts`) に
置いているのはこのためである。

### 5. 安全側解釈は `runtime` が持ち、sandbox 種別の定義は I-3 で `isolation` に移す

`autoModeSafe` は 3 値 (`true` / `false` / `unknown`) とし、**allowlist で導出する**。
`SAFE_SANDBOX_KINDS` に載っている種別だけを安全とみなす。
denylist にすると、未知の種別が安全側に倒れる。

判定は**単一の関数** (`isAutoModeAllowed`) に集約する。
表示用の 3 値 (`autoModeStatus`) は別関数とし、**生の `autoModeSafe` を IPC 境界に流さない** —
`unknown` は JavaScript で truthy であり、renderer 側で真偽判定すると誤る。

**「安全とみなす sandbox 種別」の定義は I-3 で `isolation` domain に移す。**
R-1 の時点では `runtime` が持つ。

### 6. AD-023 の検証済み事実の訂正 (R-1 実装時に実測)

**(a) 「`@electron-toolkit/preload` は sandbox 下でも動く」は成立しない。**

electron-vite は preload の外部依存を `require("@electron-toolkit/preload")` として残す。
`sandbox: true` の preload では module 解決ができず `module not found` になる。

AD-023 の検証は「8 秒間 stderr 無しで生存」だったが、
**preload のエラーは renderer コンソールに出るため stderr に現れない。**
検証条件が弱すぎて見落としていた。

R-1 は preload を単一 capability に置き換え、`electron` のみを require する形にした。
`out/preload/index.js` の require が `require("electron")` 1 件だけであることを確認した。

**(b) `npx assistant-ui@latest init` は electron-vite プロジェクトで動かない。**

フレームワーク検出に失敗する (`We could not detect a supported framework`)。
現行の assistant-ui に独立した design system パッケージは無く
(`@assistant-ui/styles` は retired)、styling は registry から copy される element に付随する。

したがって FR-033 の「公式 CLI で design system を導入する。Element は採用しない」は
字義どおり成立しない。**人間判断により「最初から Element も入れ、チャットの runtime /
backend は繋がない」方針を採った。**
公式が Vite 向けに案内する手動セットアップ
(`components.json` + Tailwind v4 + path alias → `add`) を使う。

### 7. FR-040 の CSP 要件の訂正 (同)

「`unsafe-inline` を開発時も禁じる」は公式の dev フローと両立しない。
`@vitejs/plugin-react` の React Refresh preamble と Vite client がインライン script / style を使い、
禁じると開発ビルドが `@vitejs/plugin-react can't detect preamble` で起動しない。

**改めた形**:

- `unsafe-inline` は**開発ビルドの `script-src` / `style-src` に限り**許す
- `unsafe-eval` は**両環境で禁じる**
- 緩和は **CSP を組み立てる 1 関数の dev 分岐にのみ**現れる
- **ゲートは `app.isPackaged`** とする — 環境変数で判定すると出荷物でも環境変数 1 つで有効化できる
- 開発用の CSP 定義も検証スクリプトの走査対象に含め、除外リストへ移さない

### 8. Node 標準モジュール禁止の適用範囲

FR-035 と AD-023 §7 が名指すのは `domain` / `agents` / `ui` である。
**全レイヤ禁止にすると規約より厳しくなる。**

`app` のカスタムプロトコルハンドラは同梱 renderer を読むため `node:fs/promises` を使う。
全レイヤ禁止にすると、これを例外で開ける形になる。**規約どおりの範囲に揃えた。**

結果として `app` は `node:fs` を直接使える。`infra` を OS 資源の境界とする
AD-023 §1 の建前とは緩い。

**本 ADR ではこの緩さを許す。** 理由は 2 つある。

- `app` は Electron の組み立て層であり、カスタムプロトコルの登録と応答は
  Electron API の一部である。ファイル読み出しを `infra` に移すと、
  プロトコル配管が 2 レイヤに割れて追いにくくなる
- パス操作は `domain` のパス API 経由に縛られており (Principle I)、
  読み出し先は正規化後の同梱ディレクトリ配下に限定されている (FR-040)。
  **任意のパスを読める状態にはなっていない**

`infra` に寄せる必要が生じた場合 (例: 読み出し先が同梱ディレクトリ外に広がる) は
本 ADR を改める。

### 9. AD-023 §7 の `services ✗→ I/O モジュール直接` は R-1 に対象が無い

AD-023 §5 は UseCase レイヤを作らないと決めており、`services` に当たるディレクトリが存在しない。

**対象が無いルールを書いて「強制した」とは言えない。**
最初の調停クラス (状態を持ち I/O をインタフェース経由で扱うクラス) を作る feature で、
`from` セレクタを実名で定義する。

## Consequences

- `domain` に `runtime` と `workspace` の 2 つのサブディレクトリが立つ
- 判定 3 段 (到達可否 → 変換材料の有無 → 変換と越境) の**第 2 段の鍵は `pathMapping` の有無**であり、
  `probeState` ではない。実地判定が終わっていなくてもマッピングがあれば変換できる
- **UNC 形式は `infra` の内側に閉じる。** 列挙・登録・永続化の経路が渡すパスは所在の名前空間で表す。
  組み合わせの解決結果が返すパスは**ランタイムの名前空間**であり、この規則の対象外である
- `ui` から `domain` を参照させるため、`domain` の純粋性が**表示の前提**になる。
  `domain` に I/O が入った瞬間に `ui` のバンドルが壊れるため、
  推移的到達の禁止はグラフ検証で常時掛ける必要がある

### 依存規則の機械強制で実測した「設定しただけでは効かない」点

いずれも**書いてあるのに評価されない**形であり、発火確認をしなければ気付けなかった。
同じ罠を後続 feature が踏まないよう記録する。

| # | 事象 | 対応 |
|---|---|---|
| a | `eslint-plugin-boundaries` の `boundaries/dependencies` は `checkAllOrigins` が既定 `false` で、**外部パッケージと Node 標準モジュールの policy を一切評価しない** | `checkAllOrigins: true` を明示する |
| b | 解決器を**solution-style の root `tsconfig.json`** に向けると `files: []` のためどのファイルも属さず `paths` が引かれない。実測で `@/...` の **62 件**が「未知の依存」に落ち、許可行列が適用されていなかった | 参照先 project (`tsconfig.node.json` / `tsconfig.web.json`) を直接並べる |
| c | `flagAsExternal.unresolvableAlias` は既定 `true` で、**bundler は解決できるが解決器は解決できない綴り** (`@/../../main/app/ipc`) を「外部」に分類して許可行列をすり抜けさせる | `false` にして「未知」へ落とし `no-unknown-dependencies` で捕まえる |
| d | dependency-cruiser のグラフでは npm パッケージが `node_modules/<name>/...` として現れる。`^electron($\|/)` と書いたルールは 1 件も一致せず**黙って死んでいた** | `^(node_modules/)?electron(/\|$)` の形にする |
| e | dependency-cruiser の `reachable: true` (推移的到達) ルールは `path` / `pathNot` しか受け取らず、`dependencyTypes: ['core']` と併記すると設定が schema 違反で落ちる | 標準モジュールの一覧は `node:module` の `builtinModules` を正本にして正規表現を組む |

**結論として、ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する。**
違反サンプルと期待表 (`tests/rule-fixtures/`) とルール検証ランナー (SH-020 / SH-021) が
この確認を常時化する役割を持つ。

### その他の実測に基づく決定

- **prettier を markdown に掛けない。** (a) 表を**文字数**で揃えるため全角の表が等幅表示で崩れる。
  (b) markdown 内のコードフェンスも整形対象で、`semi: false` により ADR の TypeScript 例から
  セミコロンが消える。`.prettierignore` で `*.md` を除外した
- **Principle II の `platform-ok:` 注記は prettier で壊れる。**
  `if (process.platform !== 'darwin') { // platform-ok: ...` と書くと注記が次の行へ送られ、
  「同じ行」という例外条件を満たさなくなる。判定をいったん `const` に受けて注記をその行に置く。
  Constitution にもこの書き方を明記した (AD-024)
- **CLI 生成物 (`shadcn` / `assistant-ui add`) に体裁と厳格さのルールを掛けない。**
  次の `add` で上書きされ、上流との差分も読めなくなる。
  **レイヤ規則と禁止 import は掛け続ける** — こちらは上流の体裁ではなく本プロジェクトの不変条件。
  除外集合は `eslint.config.mjs` の `GENERATED_FILES` と `.prettierignore` に同じ内容で書く
- **検証スクリプト自身を検証対象から外さない。** 項目 9 / 11 を「名前の出現」で判定すると、
  許可リストに書いた定数の値が存在確認を満たしてしまい、アプリからハンドラを消しても検証が通る
  (実測で見つけた穴)。**呼び出し形**で判定することで、FR-037 の「`scripts/` も検証対象」を
  保ったまま塞げる。リテラル走査の項目 (1 / 3 / 4 / 5) だけは定義ファイル 2 つを除外する
- **`wsl` / `docker` の裸のコマンド名は 2 項目を噛み合わせて塞ぐ。**
  `wsl` は本プロジェクトのユビキタス言語でもある (`kind: 'wsl'` / `wsl:<distro>`) ため、
  無条件に違反にすると `domain` の型定義が全部引っかかる。
  `wsl.exe` は常に違反、裸の `wsl` は**プロセス起動の呼び出しがあるファイルでのみ**違反とし、
  起動そのものを検証項目 7 が許可リストに絞る

## 申し送り

### R-2 (セッション一覧) へ

- **停止中ディストロ内のセッションは R-2 の列挙対象外である。**
  R-1 は SC-005 で「検出のために停止中ディストロを起動しない」と決めた。
  利用者がディストロを起動して再検出した時点で対象になる
- **`session` が列挙用のプロセス起動モジュールを足すときは、
  FR-041 の許可リストに ADR で追加する**必要がある
  (`scripts/constitution/allowlists.mjs` の `PROCESS_SPAWN_MODULES`)

### R-3 / R-4 (UI 系) へ

renderer の配信プロトコル・CSP 基線・検証項目 10 は R-1 が `app` レイヤで固定する。
`ui` 系 feature がこれを超える指定を要する場合は、
**nonce / hash で `unsafe-inline` を用いずに満たすか、緩和を ADR で記録する。**

#### 目標レイアウト (2026-09-15 に人間から提示)

PLAN.md §1.1 は「Cursor の Agents View / VS Code の Agent View が出発点」と述べているが、
**具体的なレイアウトはどの文書にも書かれていなかった。** 口頭で示された目標を記録する。

3 ペインとする。

| ペイン | 内容 | 素材 |
|---|---|---|
| 左 | セッション / Workspace の選択 | assistant-ui の `thread-list-sidebar` element |
| 中央 | Chat | `thread` element (R-1 で導入済み) |
| 右 | Workspace / Panel。**ブラウザのタブのように切り替える** | Changes (差分) / PR の Webview / Terminal / Files (Explorer 兼 Editor) / Browser |

**この記録は「決定」ではなく「目標の共有」である。** 採用にあたっては ADR を要する。

R-1 との関係で分かっていることを 3 点挙げる。

- **R-1 の 3 画面 (ランタイム一覧 / 作業フォルダ / 組み合わせの解決) は Chat の並列ではない。**
  目標レイアウトでは設定・セットアップ面に当たる。R-1 は上部ナビの 4 画面として実装しているため、
  最初の UI 系 feature がシェルを組み替えることになる。
  R-1 の 3 画面自体は US-1 〜 US-3 の成果物なので作り直しではない
- **セッション一覧は `thread-list-sidebar` element として作る** (R-2)。
  自作リストを先に作ると Principle XIII (element 優先) と二重になる。
  同 element は runtime 接続型であり、thread list の runtime / adapter が前提になる
- **右ペインの Browser / PR Webview は R-1 の CSP を緩めてはならない。**
  R-1 は `default-src 'none'` + カスタムプロトコル配信 + 全ナビゲーション拒否
  (`will-navigate` / `setWindowOpenHandler`) で renderer を閉じている。
  外部コンテンツは**別の WebContents** (`WebContentsView` / `<webview>`) に、
  独立した partition と CSP で載せる。アプリ自身の CSP に外部 origin を足す形は採らない。
  **これを守らないと検証項目 10 / 11 (SC-016) が破れる**
- **Terminal タブは OPT-pty** (PLAN.md §10 / roadmap) であり、`node-pty` はネイティブモジュールである。
  Principle VII により `src/agents/` からは依存できない。main / `infra` 側に置く
- **Files (Explorer 兼 Editor) は R-1 のパス API と UNC 列挙の上に載る。**
  所在をまたぐ表示は AD-016 の性能崖を踏むため、越境の明示は R-1 の判定表を再利用する

### X-1 へ

所在 WSL × `Win32Runtime` の到達不可は「UNC を cwd にできない」の実証ではなく、
**未検証を根拠にした安全側の既定**である。X-1 が検証し、可能なら判定表を改める。

### I-3 へ

「安全とみなす sandbox 種別」の定義を `isolation` domain に移す。
R-1 の `SAFE_SANDBOX_KINDS` はその時点で移設対象になる。

## Alternatives considered

- **`RuntimePath` を 1 brand のままにする** — `Ubuntu` のパスを `Debian` のランタイムに
  渡せてしまう。R-2 の transcript ディレクトリ解決で実害が出る
- **UNC を `RuntimePath` の一形態として扱う** — `\\wsl.localhost\<distro>\` は distro ごとに
  別のファイルシステムであり、Windows の win32 セマンティクスで正規化される。
  POSIX セマンティクスの `RuntimePath` と同じ型にすると正規化規則が混ざる
- **作業フォルダをパス文字列だけで登録する** — 所在が失われ、越境判定も到達可能性も
  決められない。同じパスが複数の distro に存在しうる
- **`ui` に判定ロジックを複製する** — 表示と判定が二重定義になり、必ず食い違う

## Open Questions

- [ ] `app` が `node:fs` を直接使える緩さを、いつ `infra` に寄せるか。
      判断基準は「読み出し先が同梱ディレクトリ外に広がるかどうか」とする
- [ ] `services` に当たる調停クラスをどのレイヤに置くか。AD-023 §5 が UseCase レイヤを
      作らないと決めているため、`infra` の内側か `app` のどちらかになる

## References

- [AD-004](0004-branded-path-types.md) — branded path types (本 ADR が一般化する)
- [AD-003](0003-runtime-abstraction-by-transport.md) — トランスポート軸のランタイム抽象
- [AD-015](0015-wsl-access-strategy.md) — UNC 直読と sandbox 判定
- [AD-016](0016-cross-filesystem-performance-cliff.md) — 越境の性能崖
- [AD-023](0023-application-architecture.md) — レイヤ構成と依存規則 (§7 / §8 を補う)
- [AD-024](0024-constitution-verification-paths.md) — Constitution の実体合わせ
- `specs/001-runtime-folder-registration-runtime-detection/data-model.md` §1 / §2 / §6 / §8
- `specs/001-runtime-folder-registration-runtime-detection/contracts/runtime-detection.md` C-3
