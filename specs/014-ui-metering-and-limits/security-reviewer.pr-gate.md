# security-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00 (pr-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC: FR-001 (`errors` / `result` の文字列を運ばない)・FR-002・FR-003 (`meter` の許可リストと値の検証)・FR-004 (行は `message` の経路で、`name` は '')・FR-005 (永続化しない)・FR-006 / FR-009 (範囲外の数と時刻)・FR-007 / FR-011 (エラー文を出さない)・FR-010 (`init` から読むのは `permissionMode` だけ)・FR-012 / FR-013 (間引き・上限・鍵の寿命)・FR-019 (固定のセレクタ)・SC-002・SC-004・SC-006
- touched files に該当する charter / Confirmation:
  - AD-047 の Confirmation (SC-001 / SC-002 / SC-006、状態通知のフィールドの差分 0) と訂正節 #2 (形を検証した `toolUseId`)
  - ui charter「Electron 特有の配線」(CSP 基線 AD-025 §7)
  - Constitution V (資格情報を永続化しない・ログに混ぜない)
  - diff に `src/main` / `src/preload` / `package.json` / `pnpm-lock.yaml` は 0 件。このため SEC-2 / SEC-3 / SEC-4 / SEC-5 / SEC-8 (アプリの依存) の対象は無い
  - pr-gate の範囲 (`.pr-gate-scope.txt`) は code-gate が外した開発ツールの設定 (`.claude/settings.json`・`.mcp.json`・`.codegraph/`・`.serena/`。commit dc9ef2e) を含むので、これも見た
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:1 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。権限モードのゲートと隔離の文言は platform-boundary-reviewer の PB-4
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (中身は下の「H. テストと regression」)

## スコープ要約

O-4 は agents に `live-signals.ts` と `meter-throttle.ts` を足し、SDK のメッセージのうち許可リストのフィールドだけを読む。読んだ値は domain の `meter.ts` (agents と decoder が同じ関数を使う) で検証し、`SessionEvent` の `meter` と O-2 のシステムイベントの行として port で renderer に送る。境界の骨格は実装でも保たれている。

- 列挙は `Object.create(null)` の表と `Object.hasOwn` で照合する (`meter.ts:146-154`、`session-core.ts` の `classifyResultFailure`、`chat/labels.ts:106,124`、`shell/labels.ts:126`)
- decoder は検証した値だけで object を組み直す (`meter.ts:342-381`)
- `errors`・`compact_error`・`api_retry.error`・task の要約、`init` の `cwd` / `apiKeySource` は読まない (`live-signals.ts`)
- 描画はテキストノードだけ。新しいファイルに `dangerouslySetInnerHTML` / `style=` / `<style>` / `href` / `fetch` は 0 件
- セレクタは固定の文字列だけ (`focus-handoff.ts:19-27`)。`finish()` は最初に `dispose()` を呼ぶ (`sdk-agent-session.ts:381`)
- 追加した行に `console.*` は 0 件。秘密の形の文字列はテストの fixture 1 件 (`sk-ant-api03-abcdef`) だけ

design-gate R3 の security 指摘のうち 2 件は手当て済み。
- M-001 (間引きの鍵の寿命): `meter-throttle.ts:166-187` とテスト `meter-throttle.test.ts:250,265,313,324` で閉じた
- L-002 (registry の取り込み): diff に依存の変更が無く、`thinking-indicator.tsx` に危険な sink が無いことを確かめた

残りは 3 件が未対応のまま (M-002 / L-001 / L-002)、L-003 も未対応、新規が 1 件 (M-001。開発ツールの設定の commit)。

## Findings

### [Medium] 共有の設定として commit した Claude Code の設定が、PATH で解決する版の固定の無い外部の実行ファイル `codegraph` を、プロンプトのたびに起動する。codegraph の MCP の tool も全部を確認なしで許可する。`.codegraph/.gitignore` を commit したので、CLAUDE.md の「`.codegraph/` が無ければ使わない」という opt-in の条件が、どの clone でも成り立ってしまう (M-001) (scope: feature)

- **観察**:
  - `.claude/settings.json:24-35` が `UserPromptSubmit` の hook `"command": "codegraph.cmd prompt-hook"` (:30) を足した。この hook は、リポジトリを信頼して開いた全員の環境で、プロンプトのたびに走る
  - `:21` が `"mcp__codegraph__*"` を allow に足した。MCP のサーバを承認すると、codegraph の tool はすべて確認なしで呼べるようになる
  - `.mcp.json:5` は `"command": "codegraph"` で、絶対パスでも同梱物でもない (PATH で解決する)
  - `codegraph` は `package.json` に無く、`docs/discovery.md` にも無い。リポジトリ全体で `codegraph|serena` を Grep すると、該当は設定ファイル 3 つだけ。版の固定も導入の手順も無い
  - `.codegraph/.gitignore:4-5` (`*` / `!.gitignore`) を commit したので、どの clone にも `.codegraph/` のディレクトリができる。一方 `.claude/CLAUDE.md:4,9` は「`.codegraph/` があるなら grep の前に使え」「無ければ使うな — indexing is the user's decision」と書き、`:7` は shell の `codegraph explore` を "always works" とする。つまり opt-in の条件は常に真になる
  - 個人の設定の置き場の `.claude/settings.local.json` は既に gitignore されている (`.gitignore:58`)
  - この commit は O-4 の内容と関係が無く、touched-files.txt にも入っていない。code-gate も scope から外していた (`code-gate.md:8`)
- **同種事象探索**: リポジトリ全体 (`.codegraph/`・`.serena/`・`specs/`・`node_modules/` を除く) で `codegraph|serena` → 3 件 (`.claude/CLAUDE.md` / `.claude/settings.json` / `.mcp.json`)。`.claude/settings.json` の `"hooks"` → 1 件 (:24)。`.gitignore` の `settings\.local|\.mcp|codegraph|serena` → 1 件 (:58 settings.local.json だけ)
- **リスク/影響**: この PR を merge すると、clone して信頼した開発者の環境で次のことが起きる。
  - 起動されるのは PATH の先頭にある「`codegraph.cmd` という名前の何か」で、その出力はプロンプトの文脈に毎回入る
  - MCP のサーバも PATH で解決され、承認の後は全部の tool が確認なしになる
  - 版の固定も導入の手順も無いので、同じ名前の別のパッケージや別の版との区別がつかない
  - 本人の opt-in (`.codegraph/` の有無) という意図した条件は、commit した `.gitignore` によって無効になっている
  - 現時点で悪用は観察していない。開発環境の多層防御として Medium とする (CWE-427 / CWE-829)
- **推奨アクション** (最小の案から):
  1. 作り変えない最小の案: dc9ef2e をこの PR から外し、単独の chore PR にする (O-4 の review の範囲に入れない)
  2. 中身を残すなら、置き場所を分ける
     - hook と `mcp__codegraph__*` は `.claude/settings.local.json` (gitignore 済み) に移す
     - `.mcp.json` のサーバは local scope (`claude mcp add --scope local …`) にするか、共有に残すなら allow の wildcard を共有の設定から外す
  3. `.codegraph/.gitignore` は commit せず、ルートの `.gitignore` に `.codegraph/` を足す。こうすると `.claude/CLAUDE.md:9` の opt-in の条件が意図どおりに働く
  4. 共有として残す場合は、`docs/discovery.md` に導入の手順と版を書く
- **根拠**: SEC-7 (実行ファイルの解決が PATH 依存)・SEC-8 (版の固定の無い外部ツール)、CWE-427 / CWE-829、ユーザの方針「独自構成を勝手に作らない」(公式の導入手順を先に参照)
- **scope 根拠**: 本 PR の diff (commit dc9ef2e) にあり、この PR で外すか移すかで直せる。touched-files.txt には無いので、feature の設計文書の範囲ではない

### [Medium] `tool-registry.aui.tsx:36` が tool 名を prototype を持つ object から引いている。名前が `__proto__` / `constructor` / `hasOwnProperty` / `valueOf` のとき描画が例外を投げ、ErrorBoundary が無いので renderer 全体が落ちる。design-gate で勧めた手当ても roadmap の記録も無いまま merge される (M-002) (scope: system)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx:22` は object リテラル、`:36` は `TOOL_DISPLAY[props.toolName] ?? ToolFallback` で、design-gate R3 (MG-13) の時点から変わっていない
  - 名前はどの経路でも形を検証せずに届く。過去ログは `src/domain/session/transcript.ts:233` (`b.name` をそのまま)、実行中は `src/domain/session/live-message.ts:61` (`sanitizeBody` だけ)
  - 各名前での振る舞い:
    - `__proto__`: 部品が `Object.prototype` (関数でない object) になり、React が "Element type is invalid" を投げる
    - `constructor`: `Object(props)` が object を返し、"Objects are not valid as a React child" を投げる
    - `hasOwnProperty` / `valueOf`: `this` が undefined のまま呼ばれて TypeError を投げる
  - renderer に ErrorBoundary は 0 件
  - O-4 は同じディレクトリの 6 つの表示と `tool-result-marks.tsx` に手を入れた (FE-043)。それでも、design-gate が勧めた「FE-043 で取り込む」も「roadmap の system-scope に持ち主つきで記録する」も行われていない
- **同種事象探索**:
  - `components/assistant-ui/elements` で `TOOL_DISPLAY|Object\.hasOwn` → 3 件。守られていないのは `tool-registry.aui.tsx:22,36`、守られているのは `tool-fallback.aui.tsx:332`
  - `src/renderer` で `ErrorBoundary|componentDidCatch|getDerivedStateFromError` → 0 件
  - `docs/roadmap.md` で `tool-registry|TOOL_DISPLAY` → 0 件
  - 本 PR が足した表の引き方は守られている: `chat/labels.ts:106,124` / `shell/labels.ts:126` / `meter.ts:153` / `session-core.ts` (`classifyResultFailure`) は `Object.hasOwn`。`CenterBanners.tsx:93` / `OverviewTab.tsx:111` の `PERMISSION_MODE_NAMES[mode]` は、decode 済みの列挙の値で引く
  - elements のテストで prototype のキー → 0 件
- **リスク/影響**: モデルが宣言されていない tool の名前 (prompt injection で誘われたものを含む) で `tool_use` を出すと、表示が白くなる。並べた全部のセッションの表示がまとめて落ち、過去ログにもその名前が残るので、そのセッションを開くたびに落ちる。実害の再現は観察していないので Medium に据え置く
- **推奨アクション**:
  - `tool-registry.aui.tsx:36` を 1 行で直す: `Object.hasOwn(TOOL_DISPLAY, props.toolName) ? TOOL_DISPLAY[props.toolName] : ToolFallback`
  - 上の 4 つの名前で `ToolFallback` になることを component テストで確かめる
  - この PR で直さないなら、roadmap の system-scope に持ち主 (次に `tool-registry.aui.tsx` を触る feature) と一緒に記録する。Thread を ErrorBoundary で囲むかは別の判断として同じ記録に残す
- **根拠**: SEC-4 / SEC-6 (外部由来の値を信頼しない)、CWE-1321 / CWE-248、014 data-model §2「文言の表も `Object.hasOwn` で引く」、design-gate R3 MG-13
- **scope 根拠**: `tool-registry.aui.tsx` は touched files の外 (system)。1 行の修正なので、FE-043 の延長として取り込むのが最も安い

### [Low] touched file の `system-event.ts:118` が、Hook の `outcome` を prototype を持つ表から引いている (L-001) (scope: feature)

- **観察**: `src/domain/session/system-event.ts:76-80` は object リテラル、`:118` は `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` で、design-gate R3 (sec L-001) から変わっていない。O-4 はこのファイルに符号化・復号・合成を足した (`:220-328`) が、この行には触れていない。`outcome: 'constructor'` だと `status` が `Object` 関数になる。実行中の経路では `JSON.stringify` でキーが落ち、renderer の guard が part を捨てるので、Hook の行が消える
- **同種事象探索**: `src/domain/session` で `HOOK_OUTCOMES` → 2 件 (:76,118)。テストで `outcome: '(constructor|__proto__)'` → 0 件。同じファイルの `STATUS_SET` (:68) は `Set` で守られている
- **推奨アクション**: `Object.hasOwn(HOOK_OUTCOMES, m.outcome) ? HOOK_OUTCOMES[m.outcome] : 'unknown'` に替える。`system-event.test.ts` に `outcome: 'constructor'` / `'__proto__'` で `unknown` になるテストを足す
- **根拠**: CWE-1321、014 data-model §2「値の検証」
- **scope 根拠**: touched file の中で直せる

### [Low] `modelId` の userinfo を落とす正規表現 `/^[^/]*:[^/]*@/` が、パスワードに `/` を含む形 (`u:ab/cd@h/m`) を通す (L-002) (scope: feature)

- **観察**: `src/domain/session/meter.ts:132` は design-gate R3 (LG-02) の正規表現のままである。`u:ab/cd@h/m` は次の 4 条件をどれも通る。
  - `isValidModelId` (`model-catalog.ts:26` の文字種) を満たす
  - `//` を含まない
  - 2 つ目の `[^/]*` が `/` を越えられないので、USERINFO_SHAPE に当たらない
  - `mayCarrySecret` (`system-event.ts:48-51`) は false を返す

  通った値は使用量のタブのモデルごとの内訳に出る (`UsageTab.tsx:150-152`。テキストと `title`)。評価の順は直っている (`meter.ts:252`。`isValidModelId` の 128 文字の上限が先に効き、バックトラックは抑えられる)
- **同種事象探索**: `USERINFO_SHAPE` → 2 件 (`meter.ts:132,252`)。テストの fixture は `u:p@h/m` だけで、パスワードに `/` を含む形 → 0 件 (`meter.test.ts:115-116,178-179,256` / `meter-through.test.tsx:559`)
- **リスク/影響**: 表示はローカルだけで、永続化もログもしない。起動の設定も同じ述語 (`isValidModelId`) で同じ値を受けるので、本 PR が新しく広げる面は小さい。Low とする
- **推奨アクション**: 条件を「`@` より前に `:` がある」(`/^[^@]*:[^@]*@/`) に替える。Vertex の `model@date` (`:` が無い) と Bedrock の ARN (`@` が無い) は変わらず通る。`meter.test.ts` に `u:ab/cd@h/m` (落とす) を足す
- **根拠**: CWE-200 / CWE-532、014 spec SC-002、AD-047 Decision 2
- **scope 根拠**: touched file (`meter.ts`) の中で直せる

### [Low] quickstart の「形の控え方」が API キーを環境変数で与えるよう指示するのに、キーをコマンドラインに書かない注意が無い。V-4 は未実施で、これから利用者がこの手順を踏む (L-003) (scope: feature)

- **観察**:
  - `specs/014-ui-metering-and-limits/quickstart.md:43` は「API キーの Provider なら同じ環境変数」と書くだけで、design-gate R3 (sec L-004 / MG-14 (4)) から変わっていない。`:28` (V-4 #1) は期限切れの API キーで行う手順である
  - `quickstart-results.md:52-68` では V-4 の 10 項目がすべて未確認で、この手順はまだ実行されていない
- **同種事象探索**: spec_dir の quickstart で `環境変数|ANTHROPIC_API_KEY|履歴|history` → 1 件 (:43)
- **リスク/影響**: `ANTHROPIC_API_KEY=sk-… claude -p …` や `export ANTHROPIC_API_KEY=sk-…` と打つと、WSL の distro のシェルの履歴に長期の資格情報が残る。アプリの外の手順書が、永続化の経路を作っている
- **推奨アクション**: 手順 1 に 1 行を足す。「キーをコマンドラインに書かない (シェルの履歴に残る)。`read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY` のように与え、終わったら `unset ANTHROPIC_API_KEY` する」
- **根拠**: Constitution V (長期資格情報を永続化しない)、CWE-312 / CWE-532
- **scope 根拠**: quickstart の字面の中で直せる

## H. テストと regression (担当範囲)

- **指摘を検出するテスト**: どの指摘にも、検出するテストが無い。
  - M-001: Constitution 検証と CI は `.claude/settings.json` の hook や `.mcp.json` を見ない
  - M-002 / L-001: prototype のキーのテストは 0 件 (elements と `system-event.test.ts`)
  - L-002: パスワードに `/` を含む userinfo の fixture が 0 件
  - L-003: 手順書なのでテストの対象外
- **既存の振る舞いを壊していない根拠** (確かめたもの):
  - diff に `src/main` / `src/preload` / `status-update.ts` / `package.json` / `pnpm-lock.yaml` が無い (SC-006。`quickstart-results.md:30`)
  - 通しのテストが、目印の値・`__proto__`・URL の資格情報の形の `modelId`・`resetsAt: 1e300`・余分なキーで 0 件と例外なしを見ている (`tests/meter/meter-through.test.tsx:551-617`)
  - `meter.test.ts:29` は prototype の 5 つのキーで検証する
  - `session-core.test.ts` は、どの失敗の分類も完了にならないことと、`__proto__` / `toString` の subtype が `provider-error` になることを見ている
  - 鍵の寿命・取り消し・`dispose` のテスト (`meter-throttle.test.ts:250-398`)
  - `fail()` は理由を `state: error` より先に送る順に変わった (`sdk-agent-session.ts` の diff)。`classifyResult` は変わっていない
  - code-gate の全件 2604 tests が緑
- **観測点**: 検証で落ちた `meter` や知らない形の失敗を後から知る観測点は、アプリの中に無い。足さない判断は RK-14 で受け入れられている。追加した行に `console.*` は 0 件で、Principle V (ログへの混入の禁止) と整合する

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `codegraph\|serena` (リポジトリ全体) / `"hooks"` (.claude/settings.json) / `settings\.local\|\.mcp\|codegraph\|serena` (.gitignore) | 3 | .claude/CLAUDE.md:4,7,9 / .claude/settings.json:21,24-35 / .mcp.json:5 / .gitignore:58 |
| M-002 | `TOOL_DISPLAY\|Object\.hasOwn` (elements) / `ErrorBoundary\|componentDidCatch\|getDerivedStateFromError` (src/renderer) / `tool-registry\|TOOL_DISPLAY` (docs/roadmap.md) | 3 | tool-registry.aui.tsx:22,36 (守られていない) / tool-fallback.aui.tsx:332 (守られている) / transcript.ts:233 / live-message.ts:61 |
| L-001 | `HOOK_OUTCOMES` (src/domain/session) / `outcome: '(constructor\|__proto__)'` (テスト) | 2 | system-event.ts:76,118 |
| L-002 | `USERINFO_SHAPE` / `u:ab/` (テストの fixture) | 2 | meter.ts:132,252 |
| L-003 | `環境変数\|ANTHROPIC_API_KEY\|履歴\|history` (quickstart.md) | 1 | quickstart.md:43 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
- design-gate R3 (security) からの持ち越し: 手当て済み 2 件 (M-001 間引きの鍵の寿命 → meter-throttle.ts:166-187 とテスト / L-002 registry の取り込み → 依存の差分 0・thinking-indicator.tsx に sink なし)、L-003 は評価の順だけ手当て済み。残り: MG-13 → M-002、sec L-001 → L-001、LG-02 → L-002、sec L-004 → L-003。新規: M-001 (開発ツールの設定の commit)。design-gate から severity を上げたものは無い
