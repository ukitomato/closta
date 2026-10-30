# platform-boundary-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/024-session-launch-axes/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (追加ディレクトリの id → ランタイムのパスの変換、名前空間の検査) / FR-005 (main と agents の 2 段の検査) / FR-009 / FR-011 (プリセットに folder id を保存) / FR-012 (再開での依存解決) / SC-002 / SC-003 / SC-009 (WSL と Win32 での `--add-dir`)
- touched files に該当する charter / Confirmation: runtime charter の業務ルール「パス操作は domain が公開するパス API を経由する」(`docs/domains/runtime/charter.md:108`)、Principle I / III の Verification、AD-004 (branded path)、AD-064 Decision 2 と Confirmation、AD-016 (越境の警告)
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter の Out of scope に踏み込んでいない。session は `resolveFolderRuntime` を呼ぶだけで、到達判定・capabilities・endpoint を再定義していない (plan.md:97)
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: 該当なし: eslint / dependency-cruiser / `scripts/constitution` のルールと実名リストを変えない (plan.md:258, :206-209)。新しい 2 ファイルは既存の renderer の glob に入る。PB-7 で穴を探したが、renderer が folder id 以外を送る経路はない。main は id で引いた登録フォルダからパスを作るので、id の位置にパスの文字列が来ても `unregistered` で落ちる
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`SessionLaunchConfig` を 6 キーから 10 キーにする (`additionalDirectoryIds` / `maxTurns` / `maxBudgetUsd` / `sessionName`)。renderer は登録フォルダの id だけを送る。main は起動ゲートで依存解決をやり直したうえで、`resolveFolderRuntime` を使って各 id を選択ランタイムの名前空間のパスに変換する (WSL: `runtime.id`、Win32: `host`)。agents は値の形を確かめ直してから `additionalDirectories` に載せる。`presets.json` は版 2 に上げる。プラットフォーム境界の観点で見たのは 3 つの境界である。renderer から main へは folder id だけが渡り、パスの値は渡らない。main から agents への worker IPC では brand が落ちて素の string になる。agents から SDK を経て `claude` には `--add-dir` が argv で渡る。PB-2 / PB-3 / PB-4 / PB-6 には該当がない。指摘は PB-1 / PB-5 (agents での名前空間の再検査と、変換の前提) と Principle I (パスの規則の書き写し) に集まった。

## Findings

### [High] `buildQueryOptions` の追加ディレクトリの検査が、ランタイムの種類で分かれるのか「どちらかの形」なのか、設計文書の間で食い違っている。今の deps には種類を渡す欄がない (H-001) (scope: feature)

- **観察**:
  - `specs/024-session-launch-axes/research.md:98`: `buildQueryOptions` は「件数・重複・**どちらかの形**・…を assert し直し」とある。POSIX と Windows のどちらかの形なら通る、という意味になる
  - `specs/024-session-launch-axes/data-model.md:215` (§5.4): 「§5.3 と同じ規則を assert」とある。§5.3 (`:207`) は `kind` (Win32 なら `windows`、それ以外は `posix`) で検査を分ける
  - `specs/024-session-launch-axes/tasks.md:30` (BE-004 のテスト): 「`buildQueryOptions` に同じ負例を直接渡して throw」とある。この負例には「WSL の起動に Windows のパス」が含まれる
  - ところが今の `BuildQueryOptionsDeps` (`src/agents/session-core.ts:154-168`) には spec もランタイムの種類もない。BE-004 の記述にも、種類を deps に足す手順はない
- **同種事象探索**: Grep `どちらかの形|§5.3 と同じ規則|同じ負例を直接渡して` の対象は `specs/024-session-launch-axes/`。3 件見つかった (research.md:98 / data-model.md:215 / tasks.md:30)。`BuildQueryOptionsDeps` の欄を `src/agents/session-core.ts:154-168` で確かめたところ、種類を表す欄は 0 件だった
- **リスク/影響**: worker IPC を通ると、パスは brand を失った素の string になる (AD-004 の型が守れない穴)。2 段目を「どちらかの形」で実装すると、WSL の起動に `C:\work\lib` が来ても 2 段目は通す。POSIX ではこの値は相対パスとして解かれ、別の場所を指す。一方、data-model と tasks のとおりに実装しようとすると deps に種類が要るが、その設計がない。implementer は検査を弱めるか、設計にない deps の欄を足すかのどちらかを選ばされる。今は 1 段目 (decoder) が種類ごとに検査するので、実害には二重の不具合が要る。そのため上限を High とした
- **推奨アクション**: `BuildQueryOptionsDeps` に `launchDirectoryKind: LaunchDirectoryKind` を足す。値は呼び出し側 (`src/agents/sdk-agent-session.ts:841-852`) が `isWin32LaunchSpec(spec)` から決める。data-model §5.4 にこの欄を書き、research R-07 (`:98`) の「どちらかの形」を「`kind` に合う形」に直す。BE-004 の記述にも欄の追加を書く
- **根拠**: AD-004 (名前空間の分離)、AD-064 Decision 2 (「agents は WSL の起動では POSIX の絶対パス、Win32 の起動ではドライブ付きの正規化済みのパスだけを通す」)
- **scope 根拠**: 本 feature の data-model / research / tasks と `session-core.ts` で直せる

### [Medium] `isLaunchDirectoryValue('posix')` が `makeRuntimePath` の規則をパス API の外に書き写している。正規化の扱いも Windows 側と揃っていない (M-001) (scope: feature)

- **観察**: data-model §5.2 (`specs/024-session-launch-axes/data-model.md:199-202`) と research R-07 (`:96`) は、POSIX のパスの規則を `src/domain/session/agent-session.ts` に新しく実装すると決めている。理由は「namespace を agents は持たないので値の規則だけを写す」である。規則の中身は、`/` で始まる・`\` を含まない・`/` で分けた成分に `.` / `..` がない・制御文字がない・4096 文字以下で、正本の `src/domain/runtime/path-types.ts:106-121` (`makeRuntimePath`) と同じになる。もう一つの問題は正規化の扱いである。Windows 側は「正規化した値が `value` と同じ」ことまで求めるのに、POSIX 側はこれを求めていない。`makeRuntimePath` は `//` と末尾の `/` を正規化する (`:116-119`) ので、`/home//u/lib/` は POSIX 側の検査を通ってしまう
- **同種事象探索**: Grep `split\('/'\)|startsWith\('/'\)|includes\('\\\\'\)` を `src/` (テストを除く) で探した。パスの成分まで分けて調べる実装は `src/domain/runtime/path-types.ts:116` だけだった。形の一部だけを見る既存の検査は `src/main/app/validate.ts:96-97` と `src/agents/sdk-agent-session.ts:320,419` で、成分の分解はしていない
- **リスク/影響**: Principle I の lint は `node:path` の import しか見ないので、手で書いたパスの規則は機械的に拾えない。規則が 2 箇所に分かれると、`makeRuntimePath` を将来締めたとき (たとえば長さや文字種) に agents 側の検査だけが古いまま残る
- **推奨アクション**: `src/domain/runtime/path-types.ts` に、namespace を要らない値の検査 (例: `isNormalizedPosixRuntimeValue(raw)`) を公開する。`makeRuntimePath` もその関数を使う形にする。`isLaunchDirectoryValue('posix')` はそれを呼ぶだけにし、Windows 側と同じく「正規化した値と同じ」ことまで求める。data-model §5.2 と tasks BE-003 の記述も合わせて直す
- **根拠**: Constitution Principle I、`docs/domains/runtime/charter.md:108`、AD-004
- **scope 根拠**: 本 feature の data-model / tasks で直せる

### [Medium] AD-064 Decision 2 の安全の前提 (書き込みは今どおり承認を要する) を確かめるのが、手動の quickstart V-1 の 3 だけになっている (M-002) (scope: feature)

- **観察**: AD-064 Decision 2 は「書き込みは今どおり権限モードと承認で決まる」とし、research R-02 (`research.md:28`) もそう主張している。これを確かめる経路は quickstart V-1 の 3 (`quickstart.md:17`) と plan RK-02 (`plan.md:271`) だけである。しかも spec の「合否の扱い」(`spec.md:236-239`) では、V-1 を「未実施」と書いたままマージしてよい。AD-064 Confirmation (`docs/decisions/0064-…md:63`) も、実機で記録するのは読み取りの振る舞いだけで、書き込みが承認を経ることは確かめる項目に入っていない
- **同種事象探索**: Grep `書き込みは承認カード|書き込みが承認なしで` を `specs/024-session-launch-axes/` と `docs/decisions/0064-*.md` で探した。quickstart.md:17 / plan.md:271 / tasks.md:101 の 3 件で、どれも手動の確認か、当たったら利用者に返すという記録だった。自動テストの経路は 0 件
- **リスク/影響**: `additionalDirectories` は AD-041 (g) の escalation-neutral の外にあるキーで、読み替えの根拠は Decision 2 にある。その根拠の半分 (書き込み) が確かめられないままマージに入りうる。Principle III に近い性質の不変条件で、壊れたときに検出する仕組みがない
- **推奨アクション**: (a) AD-064 Confirmation の考え方に沿って、V-1 の 3 (書き込みが承認を経ること) を「未実施ならマージ後の最初の実機で必ず行う」項目として roadmap の X-6 の行に明記する (SH-010)。(b) 自動で確かめられる部分は単体テストで固定する。具体的には、`buildQueryOptions` の出力に `additionalDirectories` があっても `permissionMode` が安全 3 値のまま変わらず、`settings` に `permissions` が入らないことを BE-004 のテストに足す
- **根拠**: AD-064 Decision 2 / Confirmation、AD-041 (g)、Principle III
- **scope 根拠**: 本 feature の tasks / quickstart で直せる

### [Low] data-model §4.2 の `resolveAdditionalDirectories` の引数の型が `RuntimeDTO` になっているが、`resolveFolderRuntime` が受けるのは `RuntimeDescriptor` である (L-001) (scope: feature)

- **観察**: `specs/024-session-launch-axes/data-model.md:149` は `runtime: RuntimeDTO` と書いている。しかし `resolveFolderRuntime` が受ける `ResolveInput.runtime` は `RuntimeDescriptor` で (`src/domain/workspace/resolution.ts:102-105`)、第 2 段は `pathMapping` で分岐する (`:140-151`)。起動ゲートが持っている値も descriptor である (`src/main/app/launch-preparation.ts:47`)
- **同種事象探索**: Grep `RuntimeDTO` を `specs/024-session-launch-axes/` で探し、1 件 (data-model.md:149)
- **リスク/影響**: tsc で検出されるので実害はない。ただ、DTO に詰め替えてから渡すような実装に誘導しかねない
- **推奨アクション**: `runtime: RuntimeDescriptor` に直す
- **根拠**: AD-004、AD-003 (descriptor は値)
- **scope 根拠**: data-model の 1 行で直る

### [Low] WSL の段の「作業フォルダの cwd が通った起動では PathMapping は確定している」という前提が、どこにも書かれていない結合に依っている (L-002) (scope: feature)

- **観察**: data-model §4.2 の 1 つ目の箇条 (`data-model.md:161`) がこの前提を置いている。しかし WSL 所在のフォルダの cwd は、`resolveCwd` が mapping を見ずに返す (`src/main/app/composition-root.ts:559`)。一方 `resolveFolderRuntime` は WSL 所在のフォルダでも、`pathMapping === null` なら第 2 段で `blocked` を返す (`src/domain/workspace/resolution.ts:140-151`)。今この前提が成り立っているのは、probe が `claudePath` と `pathMapping` を同時に埋め、同時に null に戻すからにすぎない (`src/main/infra/runtime/wsl-detector.ts:225,233`、`src/main/app/runtime-store.ts:107-110`)
- **同種事象探索**: Grep `claudePath` を `src/main` (テストを除く) で探した。2 つの値の結合は runtime-store.ts:107-110 の 1 箇所で、その不変条件を固定するテストの記述はなかった
- **リスク/影響**: この結合が崩れると、WSL 所在の追加ディレクトリだけが `invalid-config` で拒否される。作業フォルダは同じ条件で起動できるので、原因が見えにくい
- **推奨アクション**: BE-011 のテストに、「WSL の descriptor で `pathMapping: null` かつ `claudePath` あり」のときの期待 (拒否する) を 1 行足す。data-model §4.2 の前提にも、この結合に依っていることを書く
- **根拠**: AD-004、PB-5 (変換の前提の明示)
- **scope 根拠**: 本 feature のテストと data-model で直せる

### [Low] `resolveFolderRuntime` の IPC が「成功したが値は null」を返したときの扱いが、追加ディレクトリについて決まっていない (L-003) (scope: feature)

- **観察**: research R-05 の表 (`research.md:61-69`) が扱うのは、取得中・`blocked`・`unreachable`・`cross`・IPC の失敗の 5 つで、「成功したが値は null」は扱っていない。既存の hook はこれを `ready` / `value: null` として返す (`src/renderer/src/features/session/LaunchDialog.tsx:180,191`)。そして E2E の偽の capability は常に null を返す (`src/main/app/e2e-capability.ts:695`)。FE-012 の E2E はこの経路を通る
- **同種事象探索**: Grep `resolveFolderRuntime: async \(\) => null` を `src/` で探し、1 件 (e2e-capability.ts:695)
- **リスク/影響**: 実装によっては、追加ディレクトリを選んだときに E2E で起動が保留されたまま、あるいは警告が出ないまま進む
- **推奨アクション**: R-05 の表と FE-010 に、「`ready` で値が null は IPC の失敗と同じ扱い (注記を出し、起動は許す)」を 1 行足す
- **根拠**: AD-016 (越境の警告の正本は DTO の `boundary`)
- **scope 根拠**: 本 feature の research / tasks で直せる

### H の観点 (自分の担当範囲)

- H-001 は、BE-004 のテストを推奨アクションのとおりに直せば、「WSL の起動に Windows のパス」を 2 段目で検出できるテストになる。今のままだと、このテストは実装できない
- 起動ゲートの名前空間の検査 (BE-011) は単体テストで固定されている。未登録・別のディストロ・mapping なし・名前空間の不一致を見る。E2E (FE-012) の `prepareLaunch` は偽物で (`e2e-capability.ts:636-649`)、変換は通らない。変換の自動検証は BE-011 だけになる
- 観測点: 拒否は `logRejection` に理由のキーとして記録される (`invalid-config`)。ただし「追加ディレクトリの変換で落ちた」のか「作業フォルダで落ちた」のかは、ログからは区別できない。理由のキーを増やさないのが本 spec の方針 (data-model §0) なので、指摘にはしない

PB-2 (単一インスタンスの仮定): 該当なし。解決結果 DTO のキャッシュのキーには folder id とランタイムの id が入っている (`LaunchDialog.tsx:167-168`)。依存解決の §2.3 の段 3 は、選んだランタイムの `distroName` を項目ごとに比べている。
PB-3 (capabilities の虚偽表明): 該当なし。capabilities と `autoModeSafe` の決定に触れていない。
PB-4 (権限ゲートの迂回): 該当なし。権限モードは安全 3 値のままで、プリセット・再開・やり直すのどの経路でも `permissionMode` の検証を変えていない (`checkResumeRequest` は `checkLaunchConfig` を通した後に `sessionName` を見るだけ)。
PB-6 (実質的な永続環境の構築): 該当なし。`--add-dir` は読み取りの範囲を渡すだけで、利用者の環境に書き込まない。`presets.json` はアプリのデータである。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `どちらかの形\|§5.3 と同じ規則\|同じ負例を直接渡して` (specs/024) / `BuildQueryOptionsDeps` に種類を表す欄 | 3 / 0 | research.md:98, data-model.md:215, tasks.md:30 / src/agents/session-core.ts:154-168 |
| M-001 | `split\('/'\)\|startsWith\('/'\)\|includes\('\\\\'\)` (src, テストを除く) | 成分を分解するのは 1 件 | src/domain/runtime/path-types.ts:116 (既存の部分的な検査: src/main/app/validate.ts:96-97, src/agents/sdk-agent-session.ts:320,419) |
| M-002 | `書き込みは承認カード\|書き込みが承認なしで` | 3 | quickstart.md:17, plan.md:271, tasks.md:101 |
| L-001 | `RuntimeDTO` (specs/024) | 1 | data-model.md:149 |
| L-002 | `claudePath` (src/main, テストを除く) の結合 | 1 | src/main/app/runtime-store.ts:107-110 |
| L-003 | `resolveFolderRuntime: async \(\) => null` | 1 | src/main/app/e2e-capability.ts:695 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 3
