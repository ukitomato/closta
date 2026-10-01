# security-reviewer Review: X-4 (pr-gate round 3)

**Run**: 2026-10-01
**Reviewer**: security-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC:
  - FR-013 / FR-014: forwardKeys、転送禁止キー、制御文字の拒否。Round 3 の主な対象 (L-101 / L-102 の修正)。
  - FR-005 / FR-006: main の起動前段で理由キーへ正規化する部分。`distro-not-running` を追加した経路 (platform-boundary L-401 の修正)。
  - FR-009 / FR-010 周辺: providers.json の読み込みで出る issues の DTO 拡張 (`wholeFileUnreadable` / `storeNewerVersion`)。
  - SC-007: forwardKeys だけが届くこと。
- touched files に該当する charter / Confirmation:
  - AD-041 (e) 2 / 3。3 は本文に畳み込まれており、`docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:89-95` に実名・prefix の列挙、`NODE_EXTRA_CA_CERTS` を禁止しない理由、「denylist は代表例を塞ぐもの」が書かれています。
  - AD-042 Decision 4 (レコードを丸ごと退避)。
  - Principle V / CWE-532 (ログ・メッセージに値を出さない)。
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (AD-041 本文は、自分の指摘が解決したかを確かめる根拠として読んだだけ)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: database / a11y / ux reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (根拠は下の「H の所見」)

## スコープ要約

Round 2 の修正のうち、security に関わる差分を読み直しました。

- `src/domain/provider/forward-env.ts`: 禁止集合の追加と削除、コメント。
- `forward-env.test.ts` と `src/main/infra/runtime/launch-spec.test.ts`: it.each の更新と、許可側のテスト。
- `src/main/infra/runtime/launch-spec.ts`: `composeLaunchEnv` の最終層での拒否。変更はありませんが、新しい集合がここに効くことを確かめました。
- `src/main/app/launch-preparation.ts:111-116`: `distro-not-running` を返す分岐。
- `providerLoadIssues` の DTO 拡張: `src/domain/provider/dto.ts:27-33`、`src/main/app/provider-service.ts:117-177`、`src/main/app/ipc.ts:368-370`、`src/preload/index.ts:71`、`src/renderer/src/features/provider/labels.ts:56-61`、`ProviderScreen.tsx:305-311`。

依頼にあった 4 つの観点の結果:

1. **正当なキーを誤って拒否していないか**:
   - 追加した実名 9 個 (`forward-env.ts:65-73`) と prefix `NPM_CONFIG_` (`:96`) は、導出キーとも passthrough allowlist とも重なりません。これは `forward-env.test.ts:105-133` で固定されています。
   - `ANTHROPIC_BASE_URL` / `HTTPS_PROXY` / `NO_PROXY` / `MY_FLAG` の許可テストも残っています (`:96`)。
   - 起動時の `composeLaunchEnv` は、導出キーを `isDerivationForwardKey` で除外しています (`launch-spec.ts:106`)。そのため、導出による正当な起動が壊れる経路はありません。
   - 実害が出うるのは次の場合に限られます。X-3 時代のレコードが `BROWSER` や `NPM_CONFIG_REGISTRY` などを extraEnv に持っていると、AD-042 Decision 4 によって Provider ごと退避されます。これは Round 2 の L-102 で認識済みとして記録した構えと同じです。手掛かりとして、退避の表示 (`ProviderScreen.tsx:305-311`) が今回のファイル単位とレコード単位の区別つきで残ります。新しい指摘にはしません。
2. **`NODE_EXTRA_CA_CERTS` の解除で別の迂回経路が開いていないか**:
   - 解除されたのはこのキー 1 つだけです。`NODE_TLS_REJECT_UNAUTHORIZED` は禁止のままです (`forward-env.ts:63`、テストは `forward-env.test.ts:100-103`)。
   - 値の検証は従来どおり掛かります。登録時は `isValidExtraEnv` (`forward-env.ts:212-213`) が長さ・制御文字・Windows パスの形を拒否し、起動時は `launch-spec.ts:111` が制御文字を拒否します。
   - WSLENV のフラグは `/u` だけで、パスは変換されません (`launch-spec.ts:116`、テストは `launch-spec.test.ts:235-240`)。
   - wsl.exe 側 (Windows) の env にも値は入りますが、wsl.exe は Node ではないので効きません。
   - `NODE_OPTIONS` は禁止のままなので、`--use-openssl-ca` などの組み合わせで信頼ストアを差し替える経路も閉じています。
   - 信頼ストアに関わる他の変数 (`SSL_CERT_FILE` など) は、以前から禁止集合にありません。今回の解除で新しくできた経路ではないので、指摘にはしません。この領域の根本対策は、AD-041 本文 (`:95`) にある X-7 の allowlist 化の検討です。
3. **`providerLoadIssues` の DTO 拡張で情報が漏れていないか**:
   - 新しいフィールドは真偽値 2 つで、どちらも store の理由キーから導出されます (`provider-service.ts:129-133`)。
   - パス・Provider 名・値・理由キーの文字列は renderer に渡りません。DTO の JSDoc (`dto.ts:20-26`) の「件数だけ」も守られています。
   - チャンネルは固定で、引数はありません (`preload/index.ts:71`)。handler は `handle()` 経由なので、送信元の検証 (`isTrustedSender`) は Round 2 と同じく掛かります (`ipc.ts:368`)。
   - renderer は固定文言を JSX のテキストとして描画します (`labels.ts:56-61`)。
   - main のログ (`provider-service.ts:136-139`) は件数・理由キー・退避パスで、前の round から変わっていません。
4. **`distro-not-running` の対応付けで、ログに値が混入していないか**:
   - 新しい分岐 (`launch-preparation.ts:111-116`) は `reject('distro-not-running')` を通るだけです。ログに渡るのは型が理由キーの union になっている文字列だけです (`:80-83`、`composition-root.ts:287`)。
   - テストで、呼び出し引数が `'distro-not-running'` で、`'needs-confirmation'` が呼ばれないことを固定しています (`launch-preparation.test.ts:252-279`)。
   - この分岐は拒否にしか倒れません (fail-closed)。確認なしで既定の Provider で起動する経路にはなりません。

## 前回指摘の判定

| ID | 判定 | 根拠 |
|---|---|---|
| L-101 | resolved | 推奨した実名 9 個と prefix `NPM_CONFIG_` がすべて入っています (`forward-env.ts:65-73,96`)。両方の it.each で固定されています (`forward-env.test.ts:80-91`、`launch-spec.test.ts:195-204`)。小文字の `npm_config_script_shell` は、述語 (大文字小文字を区別しない照合) と名前規則 (`forward-env.ts:34`) の両方で拒否されます。表現も推奨どおり弱められました。コード (`forward-env.ts:84-85`) と AD-041 (`:95`) の両方に「代表例を塞ぐもので、クラスを閉じない」と書かれ、X-7 で allowlist 化を検討するとあります |
| L-102 | resolved | `NODE_EXTRA_CA_CERTS` は `FIXED_FORBIDDEN_KEYS` から外れ、理由が `forward-env.ts:56-57` と AD-041 `:92` に書かれています。決定者は利用者です。許可のテストは domain と最終層の両方にあり (`forward-env.test.ts:100-103`、`launch-spec.test.ts:235-240`)、`NODE_TLS_REJECT_UNAUTHORIZED` の禁止は維持されています。Round 2 で付記した `MAX_EXTRA_ENV_KEYS` のコメントも直っています (`forward-env.ts:27-31`。「総量に上界を置く」と書かれ、Windows 32,767 の前提が除かれました) |

## Findings

該当なし: Round 2 の修正差分と、依頼にあった 4 つの観点で、新しい問題は観察されませんでした (上の「スコープ要約」と「前回指摘の判定」を参照)。

## H の所見 (担当範囲のテスト / regression / 観測)

- **テスト**:
  - 追加したキーは、domain (`forward-env.test.ts:80-91`) と最終層 (`launch-spec.test.ts:195-204`) の両方の it.each に入っています。
  - L-102 の解除は、許可側のテストと、`NODE_TLS_REJECT_UNAUTHORIZED` の禁止を同じケースで固定しています。
  - 気になる点が 1 つあります。導出キーと衝突しないことのテスト (`forward-env.test.ts:105-129`) は、`extraNames` / `extraPrefixes` を本体の配列から import せず、手で写しています。今後 `FIXED_FORBIDDEN_KEYS` に追加したとき、このテストへの追記を忘れると衝突を検出できません。ただし起動時の `composeLaunchEnv` は導出キーを実名で除外しているので (`launch-spec.ts:106`)、衝突しても起動が壊れることはなく、security 上の実害はありません。指摘にはしません。
- **regression**:
  - 禁止集合の変更は、`makeForbiddenForwardKey` の 1 つの実体 (`launch-spec.ts:72`) を通って、登録と起動の両方に効きます。注入点は composition-root の 1 箇所で変わっていないので、read と write の対称性は保たれます。
  - 33 キーのレコードが退避されることの境界テストは、`provider-store.test.ts` に追加されています (backend json database L-402)。
- **観測**:
  - `distro-not-running` / `needs-confirmation` / `invalid-config` はいずれも、理由キーだけが `[launch] rejected:` として 1 行に出ます。
  - 読み込みの失敗は `[provider-store]` の warn (件数・理由キー・退避パス) で追えます。値が混ざる経路はありません。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (L-101 確認) | `NODE_EXTRA_CA_CERTS\|MANPAGER\|NPM_CONFIG\|npm_config\|_JAVA_OPTIONS\|BROWSER` (src/) | 4 ファイル | src/domain/provider/forward-env.ts:56,65,67,73,82,96 / forward-env.test.ts:81-91,100-101,108-124 / src/main/infra/runtime/launch-spec.test.ts:195-204,235-240 |
| (DTO 確認) | `wholeFileUnreadable\|storeNewerVersion\|ProviderLoadIssues` (src/) | 10 ファイル | dto.ts:27-32 / provider-service.ts:117-177 / ipc.ts:146,368 / e2e-capability.ts:318-319 / ProviderScreen.tsx:305-308 / labels.ts:56 / useProviders.ts:144 ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: resolved from 2: 2 / unresolved: 0 / new: 0

関連ファイル:
- C:\dev\closta\src\domain\provider\forward-env.ts
- C:\dev\closta\src\domain\provider\forward-env.test.ts
- C:\dev\closta\src\main\infra\runtime\launch-spec.ts
- C:\dev\closta\src\main\infra\runtime\launch-spec.test.ts
- C:\dev\closta\src\main\app\launch-preparation.ts
- C:\dev\closta\src\main\app\launch-preparation.test.ts
- C:\dev\closta\src\main\app\provider-service.ts
- C:\dev\closta\src\domain\provider\dto.ts
- C:\dev\closta\src\main\app\ipc.ts
- C:\dev\closta\src\preload\index.ts
- C:\dev\closta\src\renderer\src\features\provider\labels.ts
- C:\dev\closta\src\renderer\src\features\provider\ProviderScreen.tsx
- C:\dev\closta\docs\decisions\0041-x4-launch-config-on-x1-launch-gate.md
