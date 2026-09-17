# platform-boundary-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-17
**Reviewer**: platform-boundary-reviewer (Track E)
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Round**: 1

## 初回読了 viewpoint

**読了**: `.claude/agents/reviewer-base.md` / `.specify/memory/constitution.md` v1.2.2 (I / II / III / VI / VII) /
AD-003・AD-004・AD-010・AD-015・AD-025 の `# Title` + `## Decision` + `## Consequences` /
`docs/domains/runtime/charter.md` 全文 / `docs/domains/isolation/charter.md` 全文 /
spec.md (FR-001〜FR-048 / SC-001〜SC-014 / Assumptions / Out of Scope 全節) / plan.md / tasks.md /
research.md (R-01〜R-10) / data-model.md (§1〜§10) / quickstart.md (V-1〜V-8) /
contracts/session-enumeration.md / contracts/ipc-session-list.md /
R-1 実装: `src/domain/runtime/{path-types,namespace,path-api,verified-running,dto,interfaces}.ts` /
`src/domain/workspace/{folder,resolution,dto}.ts` / `src/main/infra/fs/wsl-fs.ts` /
`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/{allowlists,check}.mjs` /
`tests/rule-fixtures/expected.mjs`

**本 PR で実装/影響される FR / SC (本 reviewer の担当範囲に限る)**

- FR-006 / FR-007 / FR-008 — `wsl.exe` 不使用・ディストロ非起動・実行中確認済みの値のゲート
- FR-010 / FR-011 / FR-012 — UNC 経路での config ディレクトリ探索
- FR-013 — config ディレクトリの作成・変更の禁止 (Principle VI)
- FR-016 〜 FR-018 — 出自 5 分類。所在を推測しない (AD-025)
- FR-019 〜 FR-024 — 登録フォルダとの対応づけ。R-1 のパス API / `resolveFolderRuntime` 経由 (Principle I)
- FR-041 / FR-042 / FR-043 — データのみの IPC / UNC を境界に出さない / 単一 capability
- FR-045 — 列挙プロセスは Electron API とネイティブモジュールに非依存 (Principle VII)
- SC-002 / SC-003 / SC-004 / SC-005 / SC-014 — 起動 0 件 / `wsl.exe` 0 件 / 読み取り専用 / 出自判定 / 非永続化

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` In scope 「パスの名前空間を分離する branded type と、**多段を含むパス変換**」— C-002 / H-006 / M-003 が該当
- 同 業務ルール「パス操作は `domain` が公開するパス API を経由する」— H-006 が該当
- 同 業務ルール「プラットフォーム分岐は `src/main/infra/runtime/` の内側に閉じる」— H-010 が該当
- 同 業務ルール「supervisor は Electron とネイティブモジュールに依存しない」— H-001 / H-008 が該当
- `docs/domains/isolation/charter.md` — R-2 は権限モードを扱わないため Confirmation 該当なし
- AD-025 §9「最初の調停クラスで `services ✗→ I/O` の `from` を実名定義する」— H-002 が該当
- AD-025 申し送り「プロセス起動モジュールを許可リストに ADR で追加」— tasks SH-080 / SH-084 で処理済み (指摘なし)

**viewpoint severity 集計**

- A. 認可 / 認証 / RLS: 該当なし: 本 reviewer の Owner matrix 外。`security-reviewer` に委ねる
- B. 入力検証 / injection / 暗号: 該当なし: 本 reviewer の Owner matrix 外。`security-reviewer` に委ねる (IPC 未信頼入力の表は contracts/ipc-session-list.md に存在する)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:1 Low:1 (`runtime` charter のパス変換所有権に対する侵犯のみ。他 domain の charter drift は `architecture-reviewer`)
- D. Constitution / ADR drift: Critical:2 High:7 Medium:3 Low:1 (Principle I / II / VI / VII と AD-004 / AD-010 / AD-015 / AD-025 に限る。Principle III は R-2 が権限モードを扱わないため対象外)
- E. User Story / SC / AC / UX: 該当なし: 本 reviewer の Owner matrix 外。`po-reviewer` / `ux-reviewer` に委ねる
- F. 命名 / module / lint hookup: Critical:0 High:2 Medium:1 Low:0 (PB-7 のルール網羅性のみ。命名規約と module 配置は `convention-reviewer`)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 本 reviewer の Owner matrix 外。各 optional reviewer に委ねる
- H. テスト / coverage / observability / regression: 該当なし: 本 reviewer の Owner matrix 外。`test-agent` / `po-reviewer` に委ねる (ただし H-008 は「検証が構造的に何も示さない」点を lint hookup として F で扱う)

## スコープ要約

R-2 は `session` domain の最初の feature であり、プラットフォーム境界の観点では **R-1 が型と構造で閉じた 3 つの境界に、いずれも新しい穴を開ける feature** である。(1) `VerifiedRunning` による WSL ファイルアクセスのゲート — R-2 は `utilityProcess` + `CLAUDE_CONFIG_DIR` という**ゲートを構造的に通れない 2 本目の UNC アクセス経路**を追加する。(2) UNC 形式の `infra` 封じ込め — `SessionSummaryDTO.rawCwd` が UNC 文字列を IPC 境界に載せることを contract が明文で認めている。(3) `src/agents/` の Electron 非依存 — 本 feature が最初の実体を置くが、親子通信の手段が未定義であり、`utilityProcess` の既定経路はグローバル参照のためどの検出器にも見えない。加えて R-1 が `tests/rule-fixtures/expected.mjs` に残した 2 件の未検出残余のうち、`ui-path-concat` は R-2 で塞がれるが等価回避形が残り、`reuse-verified-other-distro` は「入口が 1 つだから」という延期理由が R-2 で失効するのに `nextFeature: I-1` のまま放置されている。

## Findings

### [Critical] 列挙プロセスの UNC アクセスが `VerifiedRunning` ゲートの外にあり、FR-008 と contract が矛盾している (C-001) (scope: feature)

- **観察**: `specs/002-session-cross-folder-session-enumeration/spec.md:239` の FR-008 は「ディストロ内のファイルアクセスは、**実行中確認済みの値に対してのみ**発行しなければならない。値と対象が同じディストロを指すことを検証する (R-1 の `VerifiedRunning` の契約)」と無条件に定めている。ところが `contracts/session-enumeration.md:27-37` の `SessionEnumerator` は

  ```ts
  export interface SessionEnumerator {
    enumerate(request: EnumerationRequest): Promise<EnumerationResult>
  }
  export interface EnumerationRequest {
    readonly target: EnumerationTarget
    readonly scope: ...
    readonly timeoutMs: number
  }
  ```

  であり、`verified: VerifiedRunning` も `now: number` も受け取らない。同ファイル `:12-24` の `EnumerationTargetFinder.wslTargets(descriptor, verified, now)` だけが確認済みの値を要求している。**探索 (軽い) にはゲートがあり、列挙 (重い) にはゲートが無い。**
- **観察 (R-1 側の契約)**: `src/main/infra/fs/wsl-fs.ts:43-53` の `checkAccess()` は「**期限の検査を先に行う。** 失敗検知に依存すると、停止中ディストロを起動して成功した場合に検知が発火しない」とコメントし、`checkNotExpired` を UNC アクセスの直前に置いている。TTL は `src/domain/runtime/verified-running.ts:25` の `BROWSE_SESSION_TTL_MS = 30_000` である。R-2 の列挙は research R-06 の実測で 1 対象あたり約 2.2 秒 (プロセス起動 + import + 列挙)、`Scale/Scope` (plan.md:99) は列挙対象 2〜8 を想定しており、探索から最後の列挙プロセス起動までが 30 秒を超えうる。**R-1 が明示的に閉じた「期限内に実体が停止した窓」が、期限検査を持たない経路として再び開く。**
- **観察 (型で止められない)**: `VerifiedRunning` は `src/domain/runtime/verified-running.ts:14-22` の brand つき型であり、プロセス境界 (`utilityProcess` の argv / env) を渡れない。`contracts/session-enumeration.md` C-2 の起動引数は config ディレクトリ / 所在識別子 / scope の 3 つのみ。したがって**ゲートは spawn の直前に `app` レイヤで掛けるしかない**が、`SessionEnumerator` の署名がそれを型で要求していないため、実装者が忘れても tsc も lint も何も言わない。C-5 の「所在が停止中 → プロセスを起動しない」と ipc contract:152 の検証表行は**手続きの約束**であって、R-1 が「『呼ばない』という約束ではなく、確認を経た値しか受け取れない型で表す」(`verified-running.ts:6-8`) と決めた形式ではない。
- **同種事象探索**: `grep -rn "VerifiedRunning|実行中確認済み" specs/002-session-cross-folder-session-enumeration/` で **14 件**。うち列挙プロセス経路に掛かるものは **0 件** (`contracts/session-enumeration.md:16,21` = `wslTargets` の引数、`data-model.md:8,32,327` = 参照、`spec.md:27,239,241,497` = 要件文、`tasks.md:79,82` = target-finder、`quickstart.md:187` = トラブルシュート、`contracts/ipc-session-list.md:153` = 検証表、`checklists/requirements.md:45` = 用語)。
  `grep -rn "VerifiedRunning" src/` で R-1 の**入口**は `src/domain/runtime/interfaces.ts:39` (`WslProbe.probe`) / `:122` (`WslFileSystem.listDirectory`) / `:125` (`WslFileSystem.exists`) の **3 関数 / 2 モジュール**。R-2 は `wslTargets` を 4 つ目の入口として足す一方、5 つ目の経路 (spawn) をゲート外に置く。
- **リスク/影響**: (a) 停止中ディストロへの UNC アクセスを発行しうる経路が型で塞がれず、SC-002 (起動を伴う操作 0 件) の根拠が「実装者が忘れないこと」に落ちる。(b) 期限切れの確認済みの値で列挙が走る窓が、R-1 の 30 秒 TTL の外に新設される。(c) `fetchMoreSessions` はキャッシュ済み `EnumerationTarget` を鍵に再列挙するため、初回列挙から任意時間が経過した後に呼ばれうる — この経路に TTL 検査が無いことが最も直接的な実害経路である。
- **推奨アクション**:
  1. `EnumerationRequest` に `readonly verified: VerifiedRunning` と `readonly now: number` を追加し、`所在 wsl:<D>` の列挙が**確認済みの値なしには型として構成できない**形にする (`EnumerationTarget` の location が `windows` のときは不要なので、`EnumerationRequest` を所在で判別する union にするのが素直である)。
  2. `SessionEnumerator` の実装 (`src/main/app/session-enumerator.ts`) の入口で `checkVerified(verified, target.configDir.namespace, now)` を呼ぶことを contract C-1 の規則表に 1 行として追加する。`wsl-fs.ts:43` の `checkAccess` と同じく、**spawn の前に期限を検査する**ことを明記する。
  3. tasks.md BE-025 に「確認済みの値の検査を spawn 前に行う」を、BE-027 に「期限切れの確認済みの値で列挙要求が拒否される」テストを追加する。
  4. `fetchMoreSessions` について、キャッシュ済み target の再利用時に**確認済みの値を取り直す**ことを ipc contract の `fetchMoreSessions` 節に明記する (現状は「`targetKey` が既知の列挙対象に一致しない場合はキャッシュを返す」しか書かれておらず、一致した場合の再検証が書かれていない)。
- **根拠**: spec FR-008 / SC-002、`src/domain/runtime/verified-running.ts:5-11, 45-55`、`src/main/infra/fs/wsl-fs.ts:22-26, 43-53`、Constitution Principle VI、`docs/domains/runtime/charter.md` 業務ルール「検出は停止中のディストロを起動しない」、AD-015 Open Questions (R-1 で決着した項)
- **scope 根拠**: `contracts/session-enumeration.md` と `tasks.md` は本 feature の touched files であり、interface 署名の変更で直接修正できる

---

### [Critical] `rawCwd` が UNC 形式の文字列を IPC 境界に載せることを contract が明文で認めており、FR-042 と AD-025 に反する (C-002) (scope: feature)

- **観察**: `specs/002-session-cross-folder-session-enumeration/spec.md:339` の FR-042 は「**UNC 形式のパスを IPC 境界に出してはならない**。パスは所在の名前空間で表す (AD-025)」と無条件に定める。`contracts/ipc-session-list.md:120-124` は

  > **UNC 形式は境界を越えない** (FR-042)。`wsl-from-unc` の `cwd` は `{ namespace: 'wsl:<D>', value: '/home/...' }` に変換済みである。
  > **`rawCwd` には UNC 形式の文字列が入りうるが、これは表示専用の生値であり、パスとしては扱わない**

  と書いている。**前段と後段が矛盾している。** `data-model.md:60` の `{ kind: 'undetected-distro'; raw: string; distroName: string }` から分かるとおり、未検出ディストロの出自は**定義上 UNC 生値**であり、その表示のために `rawCwd` を渡すのだから「入りうる」ではなく「必ず入る」。AD-025 の Consequences は「**UNC 形式は `infra` の内側に閉じる。** 列挙・登録・永続化の経路が渡すパスは所在の名前空間で表す」であり、「表示専用なら例外」という留保を置いていない。
- **観察 (「PathDTO の形を与えないから安全」が成立しない)**: contract は「`PathDTO` の形を与えないことで、パス API を迂回した再 branding の経路を作らない」と主張する。しかし `src/domain/runtime/dto.ts:26-29` の `PathDTO` は `{ namespace: NamespaceId; value: string }` の 2 フィールドであり、renderer は境界から受け取った正規の `PathDTO` を 1 つ持っていれば

  ```ts
  const forged = { ...group.path, value: group.rawCwd! }   // namespace は正規、value は生値
  await window.closta.registerFolder({ location: group.location!, path: forged, displayName })
  ```

  で再 branding できる。この形は (a) `tests/rule-fixtures/expected.mjs` の `dto-namespace-swap` (detectors: `['typecheck']`) を通り抜ける — `namespace` は正規の `NamespaceId` のままだから型が通る、(b) tasks SH-054 が新設する「`namespace` プロパティを持つオブジェクトリテラルを禁じる」ルールも通り抜ける — スプレッドされたオブジェクトリテラルに `namespace` プロパティは現れない。**contract が挙げた唯一の根拠 (`PathDTO` の形を与えない) が、スプレッド 1 つで無効になる。**
- **観察 (受け皿が実在する)**: `src/domain/workspace/dto.ts:29-33` の `WorkspaceFolderDraftDTO` は `{ location, path: PathDTO, displayName }` であり、R-2 の FR-026 / tasks FE-051 がまさにここへ値を渡す。UNC 生値が `wsl:<D>` の namespace を付けて `registerFolder` に届くと、`\\wsl.localhost\...` という値が `RuntimePath` として登録されうる (`makeRuntimePath` は `\` を `forbidden-character` で弾くので main 側で落ちるが、**落ちる理由が偶然であって設計ではない** — `unknown-location` の POSIX 生値なら `makeRuntimePath` を通過する)。
- **同種事象探索**: `grep -rn "rawCwd|rawName|raw:" .` (node_modules 除外) で **39 件**。うち **IPC 境界を渡る生のパス文字列**は `rawCwd` の **1 種類のみ** (`contracts/ipc-session-list.md:80, 88, 113, 122` / `tasks.md:64`)。先例として引かれている `rawName` (`src/domain/runtime/dto.ts:81` / `src/main/app/runtime-store.ts:88` / `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:231-232`) は**ディストロ名であってパスではない**ため、FR-042 / AD-025 の対象外であり先例にならない。`data-model.md:59-60` の `raw: string` は `domain` 内部の値で境界を越えない。**IPC 境界に生のパス文字列を載せる箇所は R-1 に 0 件、R-2 が最初の 1 件である。**
- **リスク/影響**: (a) AD-025 の「UNC は `infra` の内側」という不変条件が、accepted ADR の文面と食い違う形で R-2 の contract に上書きされる。一度 DTO に載ると後続 feature (R-3 の transcript 表示 / X-1 の起動) が同じ形を踏襲し、「表示専用」という但し書きは型に残らないため必ず剥がれる。(b) 上記スプレッド経路により、`ui` がパス API を迂回して任意の値を所在つきパスとして main に返す道が開く。
- **推奨アクション**:
  1. **`rawCwd` を UNC 形式に対して使わない。** `undetected-distro` の表示に必要なのは「どのディストロを指しているか」と「そのディストロが見つからないこと」であり、UNC 完全パスではない。`{ kind: 'undetected-distro'; distroName: string; displayPath: string }` のように**ディストロ名と、UNC 接頭辞を取り除いた POSIX 部分**に分けて渡せば FR-042 を破らずに同じ表示ができる (この分解は `infra` / `domain` 側で行う)。
  2. FR-042 に例外を設けるなら **spec.md 側を改め、ADR (SH-084) で AD-025 の Consequences を明示的に読み替える**。contract だけで実質的に緩めない。
  3. `rawCwd` を残す場合は、`originKind` との相関を型で固定する (`SessionSummaryDTO` を `originKind` で判別する union にし、`host` / `wsl-from-unc` / `wsl-inherited` では `rawCwd` フィールドが**存在しない**形にする)。現状の `cwd: PathDTO | null; rawCwd: string | null` は 4 通りの状態を許し、そのうち 2 通りは data-model が禁じている。
  4. `SessionGroupDTO.unregistered` の `path: PathDTO | null` / `location: LocationDTO | null` も同様。data-model §4 第 0 段により `unregistered` に落ちる出自は `host` / `wsl-from-unc` / `wsl-inherited` の 3 つだけで、いずれも所在とパスが確定する。**`null` を許す型が、UI に「`rawCwd` を代わりに使う」分岐を書かせる。** 非 null に固定すること。
- **根拠**: spec FR-042 / FR-019 / FR-021、AD-025 Consequences「UNC 形式は `infra` の内側に閉じる」、AD-004 (branded path types) を一般化した AD-025 §2、Constitution Principle I、`docs/domains/runtime/charter.md` Key concepts「**3 名前空間**であり、WSL 側の識別子はディストロ粒度で持つ」
- **scope 根拠**: `contracts/ipc-session-list.md` の DTO 定義は本 feature の touched files

---

### [High] 列挙プロセスと親の通信手段が未定義で、`utilityProcess` の既定経路 (`process.parentPort`) は Electron API であり、どの検出器にも見えない (H-001) (scope: feature)

- **観察**: `grep -rn "parentPort|stdio|標準入出力|MessagePort" specs/002-session-cross-folder-session-enumeration/` で **0 件**。plan.md:204-205 / contracts C-1 / C-3 / tasks BE-023 / BE-024 のいずれも、列挙プロセスが結果を親へ返す**手段**を定めていない。research R-04 は「`utilityProcess` を起動して結果を構造化データで返して終了させる」とだけ書く。
- **観察**: `utilityProcess` の子が親と話す既定経路は `process.parentPort` (MessagePortMain) であり、**これは Electron が子プロセスの `process` グローバルに注入する Electron API である**。`node dist/agents/enumerate-sessions.js` として単独起動すると `process.parentPort` は `undefined` になる。AD-010 の Decision は「`node dist/supervisor.js` として単体起動でき、**標準入出力経由でプロトコルを話せる形に保つ**」であり、Constitution Principle VII (NON-NEGOTIABLE) がこれを受けている。
- **観察 (検出器が構造的に見られない)**: `eslint.config.mjs:328-334` の `electron` 禁止も `.dependency-cruiser.js:179-193` の `agents-not-to-electron` / `agents-not-to-native` も、**import / require を見るルール**である。`process.parentPort` は import を伴わないグローバル参照なので 1 件も一致しない。`.dependency-cruiser.js:312` の `detectProcessBuiltinModuleCalls` が捕まえるのは `process.getBuiltinModule()` だけである。したがって tasks SH-083 が「`electron` / `better-sqlite3` / `node-pty` への推移的到達が 0 であること」を確認しても、**Principle VII について何も示さない**。これは Constitution が Principle VIII について書いている「`bad_pattern_grep` は本 Principle の番人ではない。`existing_violations: 0` は遵守を意味しない」と同じ形である。
- **リスク/影響**: `src/agents/` の最初の実体が、Principle VII を「lint が緑だから守られている」という形で満たしたことにされる。X-5 (supervisor 分離) が同じディレクトリに来たとき、先例として `parentPort` が踏襲される。
- **推奨アクション**:
  1. contracts/session-enumeration.md C-2 / C-3 に「**親子の通信は標準入出力 (行区切り JSON) で行う。`process.parentPort` を使わない**」を規則として明記し、`utilityProcess.fork` に `stdio: 'pipe'` を指定することを BE-025 の受け入れ条件にする。
  2. tasks SH-083 に「`src/agents/enumerate-sessions.ts` を `node out/...` で直接起動し、argv + env + stdin/stdout だけで 1 回の列挙が完走することを確認する」を追加する。**これが Principle VII / AD-010 の唯一の実効的な検証である。**
  3. `scripts/constitution/allowlists.mjs` に `AGENTS_FORBIDDEN_GLOBALS = ['process.parentPort', 'process.electronBinding']` 相当の項目を足し、`src/agents/` 配下で呼び出し形を走査する検証項目を新設する (R-1 が項目 9 で `setAsDefaultProtocolClient` に対して行ったのと同じ形)。
- **根拠**: spec FR-045、AD-010 Decision、Constitution Principle VII、AD-023 §6、`eslint.config.mjs:20-31` (「ESLint は直接 import しか見ない」)、`.dependency-cruiser.js:3-13`
- **scope 根拠**: contracts / tasks / allowlists は本 feature の touched files (plan.md:231 が allowlists の更新を予定している)

---

### [High] AD-025 §9 が R-2 に課した義務 (`services-not-to-io` の `from` 実名定義) が bundle のどこにも現れていない (H-002) (scope: feature)

- **観察**: `.dependency-cruiser.js:215-247` の `services-not-to-io` は

  ```js
  from: { path: '^src/main/app/(folder-service|runtime-store)[.]ts$' + '|^src/main/app/__rulecheck__/service-io-import[.]ts$' }
  ```

  と `from` を実名固定しており、コメントは「**X-1 の `SessionService` / X-3 の `ProviderService` / I-2 の `ContainerService` を作るときは、ここに実名を足すこと**」と明記している。AD-025 §9 は「対象が無いルールを書いて『強制した』とは言えない。最初の調停クラス (状態を持ち I/O をインタフェース経由で扱うクラス) を作る feature で、`from` セレクタを実名で定義する」と決めている。
- **観察**: plan.md:208-211 は `src/main/app/session-service.ts` (キャッシュ / 2 段取得 / 束ね / 対応づけの適用) と `src/main/app/session-enumerator.ts` (`utilityProcess` の起動と結線) を新設する。前者は**まさに「状態を持ち I/O をインタフェース経由で扱うクラス」**である。
- **同種事象探索**: `grep -rn "services-not-to-io|§9" specs/002-session-cross-folder-session-enumeration/` で **0 件**。plan.md の「上流からの申し送り」4 件 (#1 `ui-path-concat` / #2 `src/agents/` / #3 `PROCESS_SPAWN_MODULES` / #4 E2E) にも、`## 上流 SSoT の追随` の表 (plan.md:320-329) にも、tasks.md Phase 7 (SH-080 〜 SH-090) にも無い。**ルールのコメントが名指した義務が、対象を作る feature で discharge されない。**
- **リスク/影響**: `SessionService` が `node:fs` を直接掴んでも `services-not-to-io` は 1 件も一致しない。AD-025 が「書いてあるのに評価されないルールを 5 件実測した」と記録したのと**同じ病が、その ADR が名指した場所で再発する**。しかも `pnpm depcruise` は「違反 0」と報告するため、Existing violations summary の数値が誤った安心を与える。
- **推奨アクション**: tasks.md Phase 7 に SH-091 として「`.dependency-cruiser.js` の `services-not-to-io` の `from` に `session-service` を追加する (`session-enumerator.ts` は `utilityProcess` を起動する結線層なので、コメントの除外方針 — 結線層は含めない — に従って対象外とするなら、その判断をコメントに明記する)」を追加する。あわせて `tests/rule-fixtures/` の `service-io-import` fixture が `session-service.ts` に対しても発火することを `expected.mjs` の期待表で確認する (AD-027 の 1 件ずつ展開方式)。
- **根拠**: AD-025 §9、`.dependency-cruiser.js:215-247` のコメント、AD-027 (ルールは発火で確認する)、Constitution「Existing violations summary」節の留保
- **scope 根拠**: `.dependency-cruiser.js` と `tasks.md` は本 feature で触る対象 (plan.md:231 が同種の許可リスト更新を既に計画している)

---

### [High] R-1 の残余 `reuse-verified-other-distro` の延期理由が R-2 で失効するのに、`nextFeature: I-1` のまま放置されている (H-003) (scope: feature)

- **観察**: `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES['reuse-verified-other-distro']` は `nextFeature: 'I-1'` とし、`howToClose` に「**入口の数が増えるこの時点で**、『`VerifiedRunning` を引数に取る `infra` の公開関数は `checkVerified` を呼ぶ』を機械で検査する。これは型では無理だが構文としては検査できる。**R-1 で書かないのは入口が 1 つしかなく、ルールが目視と等価なためである**」と書いている。
- **観察**: R-2 は `src/main/infra/session/target-finder.ts` の `wslTargets(descriptor, verified, now)` を新設する (contracts/session-enumeration.md:12-24 / tasks BE-021)。**`VerifiedRunning` を引数に取る `infra` の公開関数が、別モジュールに 1 つ増える。** 延期の前提条件 (「入口が 1 つ」) は R-2 の時点で成立しない。さらに C-001 のとおり、列挙プロセス経路は `checkVerified` を呼べる形ですらない。
- **同種事象探索**: `grep -rn "VerifiedRunning" src/domain/runtime/interfaces.ts src/main/infra/` で現在の `infra` 公開入口は `WslFileSystem.listDirectory` / `WslFileSystem.exists` / `WslProbe.probe` の **3 件 / 2 モジュール**。R-2 で **4 件 / 3 モジュール**になる。`grep -rn "reuse-verified|UNDETECTED_NOTES" specs/002-.../` で **0 件** — bundle は本残余に一切言及していない。
- **リスク/影響**: tasks BE-022 が用意するのは「実行中確認済みの値の別ディストロ流用」の**ユニットテスト 1 本**であり、これは新設モジュールの実装が `checkVerified` を呼んだことを確認するだけで、「入口すべてが呼ぶ」ことを保証しない。残余が「書いてあるから許された状態」として無期限に残る — `expected.mjs` が「`nextFeature` は必須である。理由と代替手段だけを書くと、残余が無期限に残る」と自ら警告している状態そのものになる。
- **推奨アクション**:
  1. tasks.md Phase 7 に「`tests/rule-fixtures/expected.mjs` の `reuse-verified-other-distro` の `nextFeature` を再評価し、R-2 で閉じるか I-1 のままにするかを明記する」を追加する。
  2. R-2 で閉じるなら、`scripts/constitution/check.mjs` に項目 12 として「`VerifiedRunning` 型の引数を取る `src/main/infra/**` の export された関数は、本体に `checkVerified(` / `checkNotExpired(` / `checkSameTarget(` のいずれかの**呼び出し形**を含むこと」を追加する (`allowlists.mjs` に `VERIFIED_GATE_FUNCTIONS` を置く)。`expected.mjs` の `detectors` を `['none']` から `['constitution']` に移し、違反サンプルで発火を確認する。
  3. 閉じないなら、**R-2 で入口が増えた事実を `why` / `mitigatedBy` に追記する**。「入口が 1 つ」という理由を残したままにしない。
- **根拠**: `tests/rule-fixtures/expected.mjs` `UNDETECTED_NOTES`、R-1 SC-017、AD-027、Constitution「機械検証で捕まらない残余 (2 件)」節
- **scope 根拠**: `tests/rule-fixtures/expected.mjs` は plan.md:329 が本 feature で更新すると宣言している touched file

---

### [High] `PendingReason` が R-1 の `BlockedReason` から `distro-not-running` を落とし、`UnreachableReason` の `path-not-mapped` を誤って取り込んでいる (H-004) (scope: feature)

- **観察**: `data-model.md:136` は

  ```text
  PendingReason = 'capabilities-not-probed' | 'probe-failed' | 'path-not-mapped'
  ```

  と定義し、`:161-166` の第 2 段で「`blocked` → 保留候補にする (理由を保持)」「`unreachable` → 候補にしない (その f とは無関係)」と規定する。R-1 の実体は `src/domain/workspace/folder.ts:17-20`:

  ```ts
  export type UnreachableReason = 'foreign-distro' | 'unc-cwd-unsupported' | 'folder-missing' | 'distro-absent' | 'path-not-mapped'
  export type BlockedReason = 'distro-not-running' | 'capabilities-not-probed' | 'probe-failed'
  ```

  **`distro-not-running` は `BlockedReason` なのに `PendingReason` に無い。`path-not-mapped` は `UnreachableReason` なのに `PendingReason` にある。** 2 つの 3 値集合を取り違えている。
- **観察 (実害経路)**: `src/domain/workspace/resolution.ts:140-151` の `stage2` は、変換材料が無くディストロが停止中のとき `blocked('distro-not-running', ['start-distro','rescan-runtimes'])` を返す。この状態は日常的に起きる — `folder.ts:110-112` が「WSL2 のアイドル自動停止は日常的に起きる」と書いている。ホスト側 config ディレクトリに UNC 形式で記録されたセッション (research R-02 の実測 7 件) は、そのディストロが停止していても**出自は確定する** (`wsl-from-unc`) ので第 2 段まで進む。そこで `blocked('distro-not-running')` が返るが、`PendingReason` に対応する値が無い。実装者は (a) `probe-failed` に丸める (US-3 AC-1 の「起動と再検出の導線」が消える)、(b) 独断で enum を足す (data-model と乖離)、のどちらかを選ぶことになる。
- **観察 (逆方向)**: `path-not-mapped` は `resolution.ts:165, 168` で `unreachable('path-not-mapped')` として返る。第 2 段の規則に従えば「候補にしない (その f とは無関係)」になるので、`PendingReason` の `path-not-mapped` は**到達不能な enum 値**である。同時に、変換材料はあるがそのパスがマッピング配下に無いフォルダ (例: WSL にマウントされていないドライブ上の登録フォルダ) は黙って「無関係」として落ち、FR-022 が要求する「保留」として提示されない。
- **同種事象探索**: `grep -n "Reason" src/domain/workspace/folder.ts` で R-1 の 3 値カテゴリは `Reachability` / `UnreachableReason` / `BlockedReason` の 3 つ。R-2 の `data-model.md:136-137` が新設するのは `PendingReason` / `UnknownReason` の 2 つ。両者の写像表は bundle のどこにも無い (`grep -rn "BlockedReason|UnreachableReason" specs/002-.../` で **0 件**)。
- **リスク/影響**: R-1 が「2 値に潰さない」ために費やした 3 値設計が、R-2 の境界で不可逆に潰れる。FR-022 の「保留と未登録を区別する」は守られても、**保留の理由が正しく運ばれない**ため US-3 AC-1 の導線が出ない。
- **推奨アクション**: data-model §4 に **R-1 の `Reachability` × (`UnreachableReason` | `BlockedReason`) から `FolderMatch` への完全な写像表**を追加する。少なくとも `PendingReason` に `distro-not-running` を加え、`path-not-mapped` を `PendingReason` から外すか、第 2 段の規則を「`unreachable('path-not-mapped')` は保留候補に回す」と例外的に定める (後者なら `UnreachableReason` の 5 値それぞれの行き先を明記する)。tasks BE-013 / BE-014 の受け入れ条件に「R-1 の理由キー全値に対する行き先が定義されている」を足す。
- **根拠**: spec FR-022 / FR-023、`src/domain/workspace/folder.ts:15-22`、`src/domain/workspace/resolution.ts:140-151, 163-175`、AD-025 Consequences「判定 3 段の第 2 段の鍵は `pathMapping` の有無であり `probeState` ではない」、`docs/domains/runtime/charter.md` Key concepts「Reachability: 到達可能性の 3 値」
- **scope 根拠**: data-model.md / tasks.md は本 feature の touched files

---

### [High] `onRuntimesChanged` が未処理で、対応づけ保留が解けない。`resolveFolderRuntime` のメモ化に無効化キーが無い (H-005) (scope: feature)

- **観察**: `grep -rn "onRuntimesChanged|runtimesChanged" specs/002-session-cross-folder-session-enumeration/` で **0 件**。`src/preload/index.ts:42` に `onRuntimesChanged` が実在し、R-1 の `contracts/ipc-capability.md:142` はその用途を「**非同期に確定した capabilities の反映**」と定めている。R-2 の `contracts/ipc-session-list.md:57-60` は `onFoldersChanged` の扱い (再列挙せず対応づけだけやり直す) だけを定め、`onRuntimesChanged` に触れていない。
- **観察**: `src/domain/workspace/resolution.ts:149` は「`idle` / `probing`。**起動直後と再検出中は必ずここを通る** (例外経路ではない)」とコメントし、`blocked('capabilities-not-probed')` を返す。spec.md:211 の Edge Cases も「変換材料 (`PathMapping`) が未取得のまま一覧を開く — **起動直後と再検出中に必ず通る状態であり、例外経路として扱わない**」と書いている。つまり **起動直後に一覧を開けば、WSL 所在のセッションは全部 `pending` になるのが正常動作**である。
- **観察**: FR-033 は自動再取得を禁じる。`onRuntimesChanged` で再対応づけを行う規定が無い以上、probe 完了後も `pending` のままとなり、解消するには利用者が「再取得」を押して**全所在の再列挙 (SC-008 の予算で最大 10 秒)** を走らせるしかない。しかも `data-model.md:190-193` は「`resolveFolderRuntime()` の呼び出しは **(登録フォルダ × 所在) でメモ化する**」と定めるが、**メモの無効化条件が書かれていない**。所在は probe の前後で同じ `wsl:<D>` なので、キーが変わらない。再取得してもメモが残っていれば `blocked` が返り続ける。
- **同種事象探索**: `grep -rn "メモ化|invalidat|無効化" specs/002-.../` → `data-model.md:190` の 1 件のみ、無効化への言及 **0 件**。R-1 側の先例: AD-015 Consequences「ランタイム検出結果のキャッシュが必須になる。**キャッシュのキーにはディストロ名と endpoint を含める** ([AD-003](0003) の複数インスタンス原則)」— R-2 のメモ化キーは所在のみで、**ランタイムの世代 (`detectedAt` / `probedAt` / `hasPathMapping`) を含まない**。
- **リスク/影響**: (a) FR-022 の「保留」が事実上の袋小路になる。(b) AD-003 の複数インスタンス原則に沿ったキャッシュキーになっていないため、ディストロが停止→起動→再検出された場合 (同名で別の `detectedAt` を持つ descriptor) に古い判定が残る。(c) 逆方向 — 検出済みディストロが消えた後もメモが `reachable` を返しうる。
- **推奨アクション**:
  1. `contracts/ipc-session-list.md` の通知節に `onRuntimesChanged` の行を追加し、「**再列挙せず対応づけだけをやり直す** (`onFoldersChanged` と同じ扱い)」と定める。正本 (config ディレクトリ) は変わらないので FR-033 に反しない。
  2. `data-model.md:190` のメモ化キーを **(登録フォルダ id, 所在, `RuntimeDescriptor.detectedAt`)** とするか、`RuntimeDescriptor` の集合を差し替えた時点でメモを丸ごと捨てることを明記する。
  3. tasks BE-026 / BE-027 に「`onRuntimesChanged` を受けて `pending` が `folder` に遷移すること」「メモが descriptor の世代交代で無効化されること」のテストを追加する。
- **根拠**: spec FR-022 / FR-033、`src/domain/workspace/resolution.ts:140-151`、`src/preload/index.ts:42`、R-1 `contracts/ipc-capability.md:142`、AD-003 (複数インスタンス原則)、AD-015 Consequences
- **scope 根拠**: contracts / data-model / tasks は本 feature の touched files

---

### [High] 生の UNC 文字列からディストロ名を取り出す API が R-1 に存在せず、data-model §2 の不変条件「文字列操作で剥がさない」が実装不能である (H-006) (scope: feature)

- **観察**: `data-model.md:78-79` は「**#2 の変換は R-1 の `fromUnc()` を使う。** 文字列操作で `\\wsl.localhost\` を剥がしてはならない (R-1 が『境界での再 branding』として繰り返し塞いだ形)」と定める。tasks BE-011 も同じ。
- **観察**: R-1 の `fromUnc` の署名は `src/domain/runtime/interfaces.ts:69` の `fromUnc(path: WslUncPath): PathResult<RuntimePath>` であり、**`WslUncPath` を要求する**。`WslUncPath` を作れるのは `src/domain/runtime/path-types.ts:129` の `makeWslUncPath(namespace: UncNamespaceId, raw: string)` だけで、`namespace` を**先に知っていること**が前提である。`src/domain/runtime/namespace.ts:62-72` の `distroOf()` は private で、「**本モジュールが `NamespaceId` の内部構造に触れてよい唯一の場所である**」と明記されており、入力は `NamespaceId` であって生の UNC 文字列ではない。**生の文字列 `\\wsl.localhost\Ubuntu-26.04\home\y\p` からディストロ名を取り出す公開 API は R-1 に 1 つも無い。**
- **観察 (回避策が片方しか成立しない)**: 検出済みディストロ集合をループして `makeWslUncPath(uncNamespace(d), raw)` を試す形なら `path-types.ts:138-141` の埋め込みディストロ一致検査を利用して名前空間を特定でき、規則 #2 (`wsl-from-unc`) は文字列操作なしに実装できる。しかし **規則 #3 (`undetected-distro`) は原理的にこの方法では実装できない** — `data-model.md:60` の `{ kind: 'undetected-distro'; raw: string; distroName: string }` は**検出済み集合に無いディストロ名**を出力として要求しており、候補との照合では得られない。FR-017 の「該当ディストロが検出済みの集合に無い場合は『未検出の所在』として提示する」を満たすには、**生の文字列から `<D>` を切り出すほかない**。
- **同種事象探索**: `grep -rn "fromUnc|makeWslUncPath|parseUnc" .` (node_modules 除外) で **16 件**。生の文字列から UNC を解析する関数 (`parseUnc` 相当) は **0 件**。R-2 の bundle にもその新設タスクは **0 件** (BE-011 は「R-1 の `fromUnc()` を使う」としか書いていない)。
- **リスク/影響**: 実装者は `cwd-origin.ts` (`domain/session`) に `raw.slice(UNC_PREFIX.length).split('\\')[0]` 相当を書くことになる。これは (a) data-model 自身の不変条件違反、(b) `namespace.ts` が宣言した「唯一の場所」の破壊、(c) `runtime` charter の In scope「パスの名前空間を分離する branded type と、多段を含むパス変換」の `session` domain による侵犯、の 3 つを同時に起こす。しかも**この形を止める検出器は存在しない** — 文字列操作なので lint も型も掛からない (`ui-path-concat` が `detectors: ['none']` である理由と同じ構造)。
- **推奨アクション**:
  1. `src/domain/runtime/path-types.ts` (または `namespace.ts`) に **`parseUncPath(raw: string): { namespace: UncNamespaceId; path: WslUncPath } | null`** を新設する。これが生の UNC 文字列を解析してよい唯一の場所であり、`\\wsl.localhost\` の大小無視・legacy `\\wsl$\` 形式・`isValidDistroName` による文字種検査をここに集約する (M-002 も同時に解決する)。
  2. tasks.md Phase 2 に BE-019 として上記の新設を追加し、**`src/domain/session/` からは呼ぶだけ**にする。data-model §2 の不変条件を「`parseUncPath()` → `fromUnc()` の 2 段を使う」に改める。
  3. plan.md の「上流 SSoT の追随」に `runtime` domain 側への追加であることを記録する (所有は `runtime` charter)。
- **根拠**: `src/domain/runtime/interfaces.ts:69`、`src/domain/runtime/path-types.ts:129-148`、`src/domain/runtime/namespace.ts:59-72`、spec FR-017 / FR-021、Constitution Principle I、`docs/domains/runtime/charter.md` In scope / 業務ルール、AD-025 §2
- **scope 根拠**: `runtime` charter の所有物への追加が必要だが、R-2 が最初の利用者であり本 feature の tasks で追加できる (feature)

---

### [High] SH-054 の新 ESLint ルールには等価な回避形が残り、`ui-path-concat` の残余を塞いだことにならない (H-007) (scope: feature)

- **観察**: tasks SH-054 / plan.md:279-282 は「`src/renderer/` 内で **`namespace` プロパティを持つオブジェクトリテラル**を禁じる ESLint ルール」を新設し、「これで `ui` が `PathDTO` を組み立てられないことが構造で強制される」と主張する。`tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES['ui-path-concat'].howToClose` も同じ形を指名している。
- **観察 (回避形)**: `PathDTO` は `src/domain/runtime/dto.ts:26-29` の `{ namespace: NamespaceId; value: string }` の 2 フィールドである。次はいずれも `namespace` プロパティを持つオブジェクトリテラルを含まない:
  - **スプレッドによる `value` 差し替え**: `{ ...dtoFromIpc, value: concatenated }` — 正規の `namespace` を保ったまま値だけ差し替える。**C-002 の `rawCwd` と直結する最も現実的な経路**であり、`dto-namespace-swap` fixture (`detectors: ['typecheck']`) も通り抜ける
  - **computed key**: `{ ['name' + 'space']: ns, value }`
  - **段階的構築**: `const p = {} as PathDTO; Object.assign(p, { value })` / `const k = 'namespace'; const p = { [k]: ns, value }`
  - **配列/タプル経由**: `Object.fromEntries([['namespace', ns], ['value', v]]) as PathDTO`
  - さらに本来の残余である**パス文字列の連結そのもの** (`` `${base}/${name}` ``) は、この新ルールでは一切検出されない。`UNDETECTED_NOTES['ui-path-concat'].why` が言う残余は「連結」であって「`PathDTO` の組み立て」ではない。**塞ごうとしている対象がずれている。**
- **同種事象探索**: `grep -rn "namespace:" src/renderer/` で現存 **5 件** (`ResolutionScreen.test.tsx:70, 99, 109, 112, 252`) — いずれも R-1 のテストフィクスチャであり、新ルールは初日からこの 5 件に当たる (M-004 参照)。`grep -rn "\.\.\." src/renderer/src/features/` によるスプレッド利用の網羅は本 review の範囲外だが、**新ルールがスプレッド形を見ないことは規則の定義から確定する**。
- **リスク/影響**: R-1 の SC-017 が追跡していた残余が「R-2 で塞いだ」と記録されて `UNDETECTED_NOTES` から外れる (tasks SH-055 がまさにそれを行う) が、実際には主要な回避形が残る。**残余リストから外れることが最大の害である** — 以後どの feature も再訪しない。
- **推奨アクション**:
  1. ルールの定義を「`namespace` プロパティを持つオブジェクトリテラル」から **「`PathDTO` / `WorkspaceFolderDraftDTO` 型の位置に、IPC 由来の値をそのまま渡す以外の式を書けない」** に寄せる。現実的には (a) `namespace` キーを含むオブジェクト式 (リテラル / computed / スプレッド後の `value` 上書き) を禁じる、(b) `as PathDTO` / `satisfies PathDTO` を `src/renderer/` で禁じる、の 2 本立てにする。
  2. **`tests/rule-fixtures/` の違反サンプルに回避形を最低 4 件足す** — スプレッド `value` 差し替え / computed key / 型アサーション / 文字列連結。文字列連結は引き続き `detectors: ['none']` のままでよい。
  3. SH-055 で `ui-path-concat` を `UNDETECTED_NOTES` から**丸ごと外さない**。塞げた形と塞げなかった形を分け、後者に新しい `nextFeature` を割り当てる (`expected.mjs` の「`nextFeature` は必須である」に従う)。
  4. 実効的な追加防御として、main 側 `validate.ts` で `registerFolder` のパス値に対し「**その値が直前に main が返した `PathDTO` の集合に含まれること**」を検査する案も検討する (R-1 の `BrowseTargetDTO` が採った「renderer はパスを連結しない。親子は main が組み立てる」と同じ考え方)。
- **根拠**: `tests/rule-fixtures/expected.mjs` `UNDETECTED_NOTES['ui-path-concat']`、`src/domain/runtime/dto.ts:26-29`、`src/domain/workspace/dto.ts:29-33`、AD-025 Consequences「ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」、AD-027
- **scope 根拠**: `eslint.config.mjs` / `tests/rule-fixtures/` は plan.md:229-230 が本 feature で触ると宣言している

---

### [High] `agents-not-to-electron` / `agents-not-to-native` は npm パッケージの内部を辿らないため、Agent SDK が入った時点で Principle VII について何も示さなくなる (H-008) (scope: feature)

- **観察**: `.dependency-cruiser.js:298` は `doNotFollow: { path: ['node_modules'] }` である。`agents-not-to-electron` (`:179-186`) / `agents-not-to-native` (`:188-193`) は `reachable: true` の推移的到達ルールだが、**`node_modules` の内側を辿らない以上、npm パッケージ経由の到達は計算されない**。
- **観察**: R-2 は `src/agents/enumerate-sessions.ts` に `@anthropic-ai/claude-agent-sdk` 0.3.270 を import する (plan.md:79 / tasks BE-023)。これは **`src/agents/` が持つ最初の npm 依存**である。`eslint.config.mjs:239-240` の policy (1) は外部パッケージを既定で許可しており、policy (5) が禁じるのは `better-sqlite3` / `node-pty` / `keytar` の**直接 import** 3 件のみである。SDK が内部でネイティブ addon や Electron 固有 API に依存していても、**ESLint も dependency-cruiser も検出しない**。
- **観察**: tasks SH-083 は「dependency-cruiser が `src/agents/` の**実コード**に対して発火することを確認する。`electron` / `better-sqlite3` / `node-pty` への推移的到達が 0 であること」としている。上記より、この確認は**構造的に必ず 0 を返す** — Principle VII / AD-010 が本当に問うている「Electron 同梱 Node とホスト Node の `NODE_MODULE_VERSION` 差で単独起動が壊れないか」(AD-013) を測っていない。
- **同種事象探索**: `grep -n "doNotFollow|node_modules" .dependency-cruiser.js` で **1 件** (`:298`)。同じ構造の穴を持つ他のルール: `domain-not-to-io` (`:202-213`) と `ui-not-to-core` (`:274-281`) も `reachable: true` であり、npm パッケージ経由の core モジュール到達を見ない。ただし `domain` / `ui` には現在 npm 依存が少なく、**R-2 が `agents` に最初の重い npm 依存を入れる点で影響が最大**である。
- **リスク/影響**: 「`pnpm depcruise` 違反 0」という報告が Principle VII について何も保証しないまま、Constitution の Existing violations summary に計上される。Constitution が Principle VIII について書いた「CI が緑であることは本 Principle について何も示さない」と同じ形の留保が、Principle VII 側にも必要になる。
- **推奨アクション**:
  1. tasks SH-083 の受け入れ条件を **「`node out/agents/enumerate-sessions.js` (ホストの素の Node) が 1 回の列挙を完走する」** に置き換える。これが AD-010 の Decision をそのまま測る唯一の方法であり、npm 依存の内部まで実効的に検証できる (H-001 の推奨 2 と同じタスクに統合できる)。
  2. `scripts/constitution/check.mjs` に「`src/agents/` から到達する npm パッケージの `package.json` に `gypfile` / `binary` / `install` スクリプトが無いこと」を検査する項目を追加する案も検討する (ネイティブ addon の静的検出)。
  3. `.dependency-cruiser.js:298` に「**このルールは npm パッケージの内部を見ない。`agents` の Electron / ネイティブ非依存は単独起動の実行確認で測る**」というコメントを追加し、AD-025 の Consequences 表 (a〜e) と同じ形で「書いてあるのに効かない」欄に記録する。
- **根拠**: `.dependency-cruiser.js:179-193, 298`、`eslint.config.mjs:238-240, 336-343`、AD-010 Decision / Rationale、AD-013、Constitution Principle VII Verification、AD-025 Consequences (d) (「`^electron($|/)` は 1 件も一致せず黙って死んでいた」と同型の問題)
- **scope 根拠**: `tasks.md` SH-083 と `.dependency-cruiser.js` は本 feature の touched files

---

### [High] `targetKey` の組成規則がどこにも定義されておらず、ディストロ粒度の保証も config ディレクトリパスの非露出も担保されない (H-009) (scope: feature)

- **観察**: `contracts/ipc-session-list.md:93-95` の `EnumerationOutcomeDTO` は `targetKey: string` を持ち、`:17` の `fetchMoreSessions(targetKey, offset)` の引数になり、`:149` の検証表は「**既知の列挙対象のキーに完全一致**すること。文字列を config ディレクトリのパスとして解釈しない」と定める。しかし `data-model.md:15-23` の `EnumerationTarget` は `location` / `configDir` / `origin` / `label` の 4 項目で、**`key` を持たない**。組成規則は bundle のどこにも書かれていない。
- **観察 (衝突経路)**: FR-011 / data-model §1 は「1 つの所在に複数の `EnumerationTarget` がありうる (複数ユーザ)」と定め、research R-03 の実測でも `linuxbrew` / `yukiyamato` の 2 候補があった。`targetKey` を `location` だけから導くと同一所在の複数候補が衝突し、`fetchMoreSessions` が別ユーザの config ディレクトリの続きを返す。`label` (ユーザ名) を混ぜても、**2 つのディストロに同名ユーザが存在する構成 (実運用では普通) で衝突する** — AD-025 §2 の「識別子はディストロ粒度で保持する」および `namespace.ts:84-87` の「部分一致で書いてはならない — `Ubuntu` について取った確認済みの値が `Ubuntu-26.04` への操作を通す」と同じ罠である。
- **観察 (逆の失敗)**: 衝突を避けるために `configDir.value` を含めると、`wsl:<D>` 所在の `configDir` は `RuntimePath` なので UNC ではないものの、**同 contract の `:132` が「config ディレクトリの実体パス」を「renderer に渡さない値」として明示している**規則に反する。
- **同種事象探索**: `grep -rn "targetKey" specs/002-.../` で **5 件** (`contracts/ipc-session-list.md:17, 36, 94, 149` / `quickstart.md:112`)、組成の定義 **0 件**。同種の合成キーの先例: `src/domain/workspace/folder.ts:99-101` の `folderKey(folder)` は `` `${locationNamespace(folder.location)}\u0000${folder.path.value}` `` であり、**所在 (ディストロ名を含む) を必ず含む**。`data-model.md:211` は `cwdKey` について「R-1 の `folderKey` と同じ作り」と書いているが、`targetKey` については何も書いていない。
- **リスク/影響**: (a) 複数ディストロ / 複数ユーザ環境で `fetchMoreSessions` が別の列挙対象の続きを返し、セッションが所在をまたいで混ざる (US-1 AC-3 の「所在ごとに別のグループとして現れ、セッションが混ざらない」が破れる)。(b) パスを含める実装を選ぶと config ディレクトリパスが renderer に露出する。
- **推奨アクション**: `data-model.md` §1 に `targetKey` の組成を明記する。推奨は **`folderKey` と同じ作りの不透明キー** — すなわち `(locationNamespace, configDir.value, origin)` の組から導く**プロセス内一意のハンドル (連番 / UUID)** を main 側のテーブルで保持し、DTO にはハンドルだけを載せる。これで衝突 (ディストロ粒度が保たれる) と露出 (パスを渡さない) の両方を同時に閉じられる。`contracts/ipc-session-list.md:149` の検証行を「既知のハンドル集合に含まれること」と読める形に直す。tasks BE-010 / BE-028 に反映する。
- **根拠**: spec FR-011 / FR-042、`contracts/ipc-session-list.md:17, 94, 132, 149`、`src/domain/workspace/folder.ts:99-101`、AD-003 (複数インスタンス原則)、AD-025 §2「識別子はディストロ粒度で保持する」
- **scope 根拠**: data-model / contracts は本 feature の touched files

---

### [High] `hostTarget()` が引数を持たず、ホームディレクトリの入手経路が存在しない。成立する実装はレイヤ規則違反か検出器の穴を通る (H-010) (scope: feature)

- **観察**: `contracts/session-enumeration.md:13-14` の `hostTarget(): EnumerationTarget` は**引数を取らない**。`data-model.md:38` は「所在 windows → ホストユーザの既定 config ディレクトリ 1 件」とする。実装先は `src/main/infra/session/` (plan.md:198-201) である。
- **観察 (すべての入手経路が塞がれている)**:
  - `node:os` の `homedir()` — `eslint.config.mjs:55` の `PLATFORM_SOURCES` に `os` / `node:os` が含まれ、`:295-307` が全レイヤで禁止、`:313-324` が `src/main/infra/runtime/**` のみ許可。`src/main/infra/session/` からは import できない
  - `electron` の `app.getPath('home')` — `.dependency-cruiser.js:51-52` / `eslint.config.mjs:326-334` により `app` レイヤと `infra/secrets/` のみ
  - `process.env.USERPROFILE` — グローバル参照なので **ESLint の `no-restricted-imports` にも `boundaries` にも掛からない**。`scripts/constitution/allowlists.mjs:279` の `PLATFORM_BRANCH_PATTERNS` は `/\bprocess\s*\.\s*env\s*\.\s*(OS|OSTYPE)\b/` しか見ないので、**`check.mjs` 項目 8 も素通りする**。つまり**最も書きやすく、最も Windows 決め打ちで、どの検出器にも見えない経路だけが空いている**
- **観察 (R-1 の先例)**: `src/main/app/composition-root.ts:60` が `makeHostPath(app.getPath('userData'))` で `HostPath` を作り、`src/main/infra/settings/folder-store.ts:54` の `createFolderStore(userDataDir: HostPath, ...)` に**注入**している。R-1 はこの形を確立済みである。`hostTarget()` の引数なし署名はこの形に反する。
- **同種事象探索**: `grep -rn "homedir|getPath\(|USERPROFILE|userData" src/` で **13 件**、すべて `app.getPath('userData')` → `HostPath` 注入の 1 パターン。`os.homedir()` / `process.env.USERPROFILE` の使用は現状 **0 件**。R-2 がこのパターンを崩す最初の feature になる。
- **リスク/影響**: (a) Principle II の「プラットフォーム分岐は `src/main/infra/runtime/` の内側」が、検出器に見えない形で `src/main/infra/session/` に漏れる。plan.md:114-116 の Constitution Check II「本 feature は新たなプラットフォーム分岐を持たない」は、この点を検討していない。(b) plan.md:89 が「WSL 不在のホストでも動作すること」と書いているが、`%USERPROFILE%` 決め打ちは Windows 以外で静かに壊れる。
- **推奨アクション**:
  1. `hostTarget(hostHome: HostPath): EnumerationTarget` に署名を変更し、`app.getPath('home')` から `makeHostPath()` を経て `composition-root.ts` で注入する (R-1 の `createFolderStore` と同じ形)。tasks BE-021 / BE-031 に反映する。
  2. `scripts/constitution/allowlists.mjs` の `PLATFORM_BRANCH_PATTERNS` に **`/\bprocess\s*\.\s*env\s*\.\s*(USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA)\b/`** を追加する。これは R-2 が作る穴であり、本 feature で塞ぐのが筋である。違反サンプルを `tests/rule-fixtures/b-equivalent/` に足す。
- **根拠**: `contracts/session-enumeration.md:13-14`、`eslint.config.mjs:54-56, 295-324`、`scripts/constitution/allowlists.mjs:259-283`、`src/main/app/composition-root.ts:60-64`、`src/main/infra/settings/folder-store.ts:50-54`、Constitution Principle II、`docs/domains/runtime/charter.md` 業務ルール
- **scope 根拠**: contracts / tasks / allowlists は本 feature の touched files

---

### [Medium] ホスト側の列挙対象だけ存在確認が無く、存在しない config ディレクトリに `CLAUDE_CONFIG_DIR` を向けたときの SDK の挙動が未確認である (M-001) (scope: feature)

- **観察**: `data-model.md:37-43` の探索手順は、`wsl:<D>` については「`.claude` の存在を確認 → 存在した候補すべてを `EnumerationTarget` にする」と定めるが、`windows` については「ホストユーザの既定 config ディレクトリ 1 件 (FR-009)」とだけ書き、**存在確認を課していない**。
- **観察**: research R-07 の前後比較 (8,487 ファイルで差分 0) は、**既に存在する** WSL 側 config ディレクトリに対する実測である。`CLAUDE_CONFIG_DIR` が存在しないディレクトリを指したときに SDK が `mkdir -p` 相当を行うか (行うなら FR-013「config ディレクトリおよびその配下を作成・変更してはならない」と Principle VI に抵触する) は測られていない。research R-01 が確認した SDK 側の実装事実も「`readdir` / `stat` / `open` で読むだけ」であり、**ディレクトリ不在時の分岐には触れていない**。
- **リスク/影響**: Claude Code を一度も使っていない Windows ホストで一覧を開くと、アプリが `%USERPROFILE%\.claude` を作る可能性がある。件数としては 1 ディレクトリだが、「アプリは環境を作らない」という Principle VI / AD-008 の立て付けそのものに触れる。SC-004 の前後比較は config ディレクトリ**配下**を見るので、ディレクトリ自体の新規作成は検出されない。
- **推奨アクション**: (1) `hostTarget()` にも `.claude` の存在確認を課し、不在なら `no-history` として扱う (`wsl` 側と対称にする。これで列挙プロセスが存在しないディレクトリを指すことが構造的に無くなる)。(2) quickstart V-5 に「**config ディレクトリごと存在しない状態**で一覧を開き、ディレクトリが作られないこと」を 1 行足す。
- **根拠**: spec FR-012 / FR-013 / SC-004、research R-01 / R-07、Constitution Principle VI、AD-008
- **scope 根拠**: data-model / contracts / quickstart は本 feature の touched files

---

### [Medium] legacy UNC 形式 (`\\wsl$\`) と UNC 接頭辞の大小差が出自判定から漏れる (M-002) (scope: feature)

- **観察**: `data-model.md:69-70` の判定規則 #2 / #3 は `\\wsl.localhost\<D>\...` 形式だけを対象とする。`src/domain/runtime/path-types.ts:62` の `UNC_PREFIX = '\\\\wsl.localhost\\'` に対し `:136` は `raw.startsWith(UNC_PREFIX)` の**完全一致**、`:141` は埋め込みディストロ名の**完全一致**である。
- **観察**: AD-015 §1 は「legacy の `\\wsl$\` も同等の性能だが、新しい `\\wsl.localhost\` を使う」と述べる (アプリが**書く**側の話)。しかし R-2 が**読む**のは Claude Code / 利用者が過去に記録した値であり、research R-01 の測定表 (`research.md:30`) 自体が `\\wsl$\Ubuntu-26.04\home\<user>\.claude` が有効に機能することを示している。Windows のエクスプローラや古いツールは `\\wsl$\` を生成する。UNC はファイルシステム上も大小を区別しない。
- **リスク/影響**: `\\wsl$\Ubuntu\home\y\p` を cwd とするセッションは判定規則 #7 (「上記以外」) に落ち、`unknown-location` として「作業フォルダ不明」グループに入る。**所在が特定できる値を特定できないものとして扱う**ため FR-017 に反し、SC-005 の出自判定の網羅性と US-1 AC-5 が破れる。安全側 (誤帰属はしない) には倒れているので Critical ではないが、research R-02 の実測が 1 ホストのサンプルであること (`## Assumptions` の留保) を踏まえると、他ホストで顕在化する確度は低くない。
- **推奨アクション**: H-006 で提案する `parseUncPath()` に (a) `\\wsl.localhost\` と `\\wsl$\` の両方、(b) 接頭辞の大小無視、(c) ディストロ名の照合は `isValidDistroName` + 検出済み集合との**完全一致** (大小を無視しない — `namespace.ts:84-87` の部分一致禁止と同じ理由で、名前の同一性判定は緩めない)、を集約する。data-model §2 の判定表に legacy 形式の行を足し、tasks BE-012 のテストケースに追加する。
- **根拠**: spec FR-017 / SC-005、`src/domain/runtime/path-types.ts:62, 129-148`、AD-015 §1、research R-01 (`research.md:30`) / R-02
- **scope 根拠**: data-model / tasks は本 feature の touched files

---

### [Medium] research R-05 規則 1「UNC を組み立てるモジュールは `infra` の 1 箇所に限る」が実体と一致しておらず、そのまま ADR に固定されようとしている (M-003) (scope: feature)

- **観察**: `research.md:174` / `contracts/session-enumeration.md:76` の規則 1 は「UNC 形式を組み立てるモジュールは `infra` の 1 箇所に限る」。tasks BE-020 は `src/main/infra/session/config-dir.ts` を「**UNC 形式を組み立てる唯一のモジュール**」と呼び、SH-084 でこれを ADR に記録する予定である。
- **観察 (実体)**: UNC 形式を実際に**組み立てている**のは `src/domain/runtime/path-api.ts:137-157` の `runtimePathOps.toUnc()` であり、`domain` にある (`makeWslUncPath` も `path-types.ts:129`)。`infra` 側の `src/main/infra/fs/wsl-fs.ts:66-70` はコメントで「**UNC パスの組み立ては自分で行わない。パス API の戻り値を受け取るだけ**」と明記しており、既に**組み立てていない消費者が 1 つ存在する**。R-2 の `config-dir.ts` は **2 つ目の消費者**になる。
- **リスク/影響**: (a) 「1 箇所」と書いた ADR が accepted になると immutable になり、実体 (組み立ては `domain`、消費は `infra` に複数) と恒久的に食い違う。(b) この規則は AD-025 の「UNC は `infra` の内側」に対する**唯一の調停根拠**として提示されているのに、規則自体が対象を誤って指しているため機械検証に落とせない (「`infra` の 1 モジュール」を検査するルールを書いても、組み立て元は `domain` にあるので 1 件も一致しない — AD-025 Consequences (d) と同型)。
- **推奨アクション**: SH-084 の ADR で規則 1 を **「UNC 形式を**組み立てる**のは `src/domain/runtime/path-api.ts` の `toUnc()` のみ。UNC 値を**保持・消費してよい**のは `src/main/infra/**` の列挙モジュールに限り、実名で列挙する」** と書き換える。実名列挙にすれば `scripts/constitution/check.mjs` に「`\\\\wsl.localhost` / `\\\\wsl$` を含む文字列リテラル、および `toUnc(` の呼び出しが許可リスト外に現れないこと」という検証項目を追加でき、機械検証できる形になる (`WSL_CALLER_MODULES` と同じ構造)。
- **根拠**: `research.md:171-182`、`contracts/session-enumeration.md:74-82`、`src/domain/runtime/path-api.ts:137-157`、`src/main/infra/fs/wsl-fs.ts:22-26, 66-70`、AD-025 Consequences「UNC 形式は `infra` の内側に閉じる」および同 (d)、`docs/domains/runtime/charter.md` In scope
- **scope 根拠**: research / contracts / 起票予定 ADR は本 feature の成果物

---

### [Medium] SH-054 の新ルールが R-1 の既存 renderer テスト 5 件に当たるが、除外の設計が bundle に無い (M-004) (scope: feature)

- **観察**: `grep -rn "namespace:" src/renderer/` で **5 件** — `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.test.tsx:70, 99, 109, 112, 252`。いずれも `{ namespace: 'host', value: 'C:\\dev\\x' }` の形のテストフィクスチャである。tasks SH-054 の規則をそのまま `src/renderer/**` に掛けると初日から 5 件の違反が出る。加えて R-2 自身が FE-046 / FE-053 / FE-064 で `SessionIndexDTO` (内部に `PathDTO` を含む) のフィクスチャを作る renderer テストを新設する。
- **観察**: `eslint.config.mjs` の既存の緩和は `GENERATED_FILES` (`:73-77`) のみで、テストファイル向けの override は存在しない。最も安直な解は `files: ['src/renderer/**/*.test.tsx']` で off にすることだが、これは `scripts/constitution/allowlists.mjs:47-56` が明記する「除外は**ファイル単位の明示リスト**とする。ディレクトリ単位で除外すると、そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる」に反するパターン (グロブ単位の一括除外) である。
- **リスク/影響**: 設計されていない除外が実装時に場当たりで入り、以後 renderer のテストファイルが構造強制の外に置かれる。テストから `PathDTO` を組み立てられること自体は許容できるが、**それを「設計上の判断」として記録するか「lint を通すための緩和」として入れるかで、後続の扱いが変わる**。
- **推奨アクション**: tasks SH-054 の記述に除外方針を明記する。推奨は (a) 緩和ではなく **`src/domain/session/__fixtures__/` に `PathDTO` を作るテストヘルパを置き、renderer テストはそれを import する** (R-1 が `src/domain/workspace/__fixtures__/runtime.ts` で既に採っている形)、(b) それでも残る箇所は `eslint-disable-next-line` を**行単位**で置き理由を書く。どちらもディレクトリ/グロブ単位の除外を避けられる。
- **根拠**: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.test.tsx:70, 99, 109, 112, 252`、`eslint.config.mjs:73-77`、`scripts/constitution/allowlists.mjs:47-56`、Constitution Principle I Verification「ディレクトリ単位の除外は使わない (AD-024 #7)」、`src/domain/workspace/__fixtures__/runtime.ts`
- **scope 根拠**: `eslint.config.mjs` / `tasks.md` は本 feature の touched files

---

### [Medium] `PROCESS_SPAWN_MODULES` への追加に対して、引数と環境の許可リスト (項目 2 相当) が用意されていない (M-005) (scope: feature)

- **観察**: `scripts/constitution/allowlists.mjs:208-212` の `PROCESS_SPAWN_MODULES` は現在 3 件で、うち `wsl-cli.ts` については**項目 2 (`WSL_ALLOWED_ARGS`) と項目 3 (`WSL_CALLER_MODULES`) が引数とバイナリ名を別途縛っている**。`allowlists.mjs:204-206` はこの構造を「許可したのは項目 7 だけである。項目 1 / 3 / 4 は引き続き掛かるので、このファイルから環境を変える操作を起動すれば別の項目が捕まえる」と説明している。
- **観察**: tasks SH-080 は `session-enumerator.ts` を `PROCESS_SPAWN_MODULES` に足す。しかし起動対象は `?modulePath` でバンドルされた自前のスクリプトであり、項目 3 (`wsl.exe`) / 項目 4 (`docker`) のどちらにも該当しない。**「このモジュールが起動してよいのは自前の列挙プロセスだけである」を縛る項目が存在しない。** 同時に `check.mjs:84-96` の `SPAWN_CALL_PATTERNS` は `utilityProcess` / `spawn` / `execFile` などを区別せず、許可リストに載ったファイルは**全パターンについて丸ごと検査対象外**になる (`check.mjs:190-192` の `if (PROCESS_SPAWN_MODULES.includes(src.file)) continue`)。
- **リスク/影響**: 許可リストに 1 行足すことで、そのモジュールは任意のプロセス起動 API を無検査で使えるようになる。R-1 が `wsl-cli.ts` に対しては 2 重に縛ったのに、R-2 の新モジュールは 1 重になる。
- **推奨アクション**: SH-084 の ADR に「`session-enumerator.ts` が起動してよいのは `utilityProcess` による自前エントリのみ」を規則として書き、`check.mjs` に項目 12 として「`session-enumerator.ts` 内に `spawn` / `execFile` / `exec` / `fork` の呼び出し形が現れないこと (`utilityProcess.fork` のみ許す)」を追加する。あわせて「`CLAUDE_CONFIG_DIR` 以外の環境変数を子に渡さない」(contracts C-2 の環境最小化) を機械検査できる形 — 環境オブジェクトを単一のリテラルとして定義し、項目 6 (`DISTRO_SCRIPT_CONSTANTS`) と同じ「単一リテラル + 内容検査」で見る — にすることを検討する。
- **根拠**: `scripts/constitution/allowlists.mjs:157-215`、`scripts/constitution/check.mjs:84-96, 186-200`、AD-025 申し送り「プロセス起動モジュールを許可リストに ADR で追加する」、Constitution Principle VI Verification 項目 2 / 3 / 7、contracts/session-enumeration.md C-2「環境変数の最小化」
- **scope 根拠**: `allowlists.mjs` は plan.md:231 / tasks SH-080 が本 feature で触る対象

---

### [Low] BE-020 が `toUnc()` の share 封じ込め検査を二重化する (L-001) (scope: feature)

- **観察**: tasks BE-020 は `config-dir.ts` について「パス API 経由で組み立て、**share 配下への封じ込めを検証する**」とする。`src/domain/runtime/path-api.ts:146-155` の `toUnc()` は既に `win32.normalize()` 後に `shareRoot` 配下であることを検査し、外れれば `outside-share` で失敗する。
- **リスク/影響**: 同じ不変条件が 2 箇所に分かれると、R-1 のコメント (`path-api.ts:145-149`) が説明する正規化の意図が片方だけ更新されて drift する。AD-025 が「`ui` に判定ロジックを複製する — 表示と判定が二重定義になり、必ず食い違う」として却下したのと同型。
- **推奨アクション**: BE-020 の記述を「`toUnc()` の `PathResult` を受け取り、`ok: false` (特に `outside-share`) を失敗理由として伝播する」に改める。封じ込め検査そのものを再実装しない。
- **根拠**: `src/domain/runtime/path-api.ts:137-157`、Constitution Principle I、AD-025 Alternatives considered
- **scope 根拠**: tasks.md は本 feature の touched files

---

### [Low] `cwdKey` が NUL 区切りの合成文字列として IPC 境界を渡る (L-002) (scope: feature)

- **観察**: `data-model.md:211` は「`cwdKey` は (所在, 正規化済みパス) の組 (R-1 の `folderKey` と同じ作り。重複判定の規則を 2 つ持たない)」とする。`src/domain/workspace/folder.ts:99-101` の `folderKey` は `` `${locationNamespace(folder.location)}\u0000${folder.path.value}` `` であり、**U+0000 を区切りに使う**。`contracts/ipc-session-list.md:80` はこれを `cwdKey: string` として renderer に渡す。
- **リスク/影響**: (a) `folderKey` は R-1 では main プロセス内の重複判定キーとして設計された値であり、IPC 境界を渡ることを想定していない。(b) NUL を含む文字列は React の `key` / DOM 属性 / ログ出力で扱いが処理系依存になる。(c) 所在とパスを連結した文字列を renderer が持つことは、H-007 のスプレッド再 branding の材料を 1 つ増やす。
- **推奨アクション**: `cwdKey` を renderer に渡す用途 (グループの同一性判定 / React key) に限るなら、H-009 と同様に**不透明なハンドル**にする。main 側の重複判定には `folderKey` 相当を使い続け、DTO には露出させない。少なくとも区切り文字を NUL 以外にする。
- **根拠**: `src/domain/workspace/folder.ts:99-101`、`data-model.md:211`、`contracts/ipc-session-list.md:80`、`src/domain/runtime/path-types.ts:65-71` (制御文字を禁じる `hasForbiddenCharacter`)
- **scope 根拠**: data-model / contracts は本 feature の touched files

---

## 固有観点 (PB-1 〜 PB-8) の走査結果

| 観点 | 結果 |
|---|---|
| **PB-1** IPC / 永続化境界でのパス型の消失 | **C-002** (`rawCwd` が UNC を境界に載せる / `PathDTO \| null` が null 分岐を招く)、**H-007** (スプレッドによる再 branding)、**L-002** (`cwdKey`)。永続化については FR-036 / SC-014 により列挙結果はディスクに書かれないため、SQLite / 設定ファイル経由の型消失は**該当なし** |
| **PB-2** ランタイムの単一インスタンス仮定 | **H-005** (メモ化キーにランタイム世代が無い / `onRuntimesChanged` 未処理)、**H-009** (`targetKey` にディストロ粒度の保証が無い)。グローバル変数 / シングルトンによる「現在のランタイム」保持は bundle に**該当なし** — `SessionIndex` は所在ごとの配列で構成されており、`wsl:<D>` / `unc:<D>` のディストロ粒度は data-model §1 / §8 で保たれている |
| **PB-3** `capabilities` の虚偽表明 | **該当なし**: R-2 は `capabilities` を表明せず、`resolveFolderRuntime` 経由で消費するだけである。安全側解釈に関する最も近い問題は **H-004** (3 値の写像欠落) で、これは虚偽表明ではなく理由キーの欠落なので D に計上した |
| **PB-4** 権限ゲートの迂回 | **該当なし (Principle III の意味では)**: plan.md:117 のとおり R-2 は権限モードを扱わない。ただし「ゲート」を FR-008 の実行中確認済みの値と読むなら **C-001** が該当し、こちらは D に計上した |
| **PB-5** 多段パス変換の欠落 | **H-006** (生 UNC → `WslUncPath` → `RuntimePath` の第 1 段に API が無い)、**M-002** (legacy UNC 形式)。往路と復路の対称性については、data-model §4 第 2 段が R-1 の `resolveFolderRuntime` を単一の変換エンジンとして再利用する設計になっており、**表を 2 つ持たない点は妥当**である (指摘なし)。docker endpoint の 2 ホップは本 feature の範囲外 (I-1) |
| **PB-6** 実質的な永続環境の構築 | **M-001** (ホスト側 config ディレクトリの存在確認欠落)。`docker volume` / `--restart` / ディストロ内へのパッケージ導入 / `~/.bashrc` 書き込みは **0 件** — research R-01 の決定 (Windows 側プロセスから UNC 経路で読むだけ) により、ディストロ内では何も実行されない。これは構造的な担保であり、FR-006 / SC-003 の「`wsl.exe` 不使用」も `contracts/session-enumeration.md` C-7 の「R-1 の経路を使い R-2 自身はプロセスを起動しない」で構造的に成立している (**指摘なし。良い設計である**) |
| **PB-7** lint ルール自体の網羅性 | **H-002** (`services-not-to-io` の `from` が新クラスを含まない = 1 件も一致しないルール)、**H-007** (新ルールの等価回避形)、**H-008** (`doNotFollow: node_modules` により推移的到達が評価されない)、**H-010** (`process.env.USERPROFILE` が項目 8 の穴)、**M-004** (除外設計の欠落)、**M-005** (許可リスト追加に対する対の縛りが無い)。`tasks.md` SH-090 が `test:rules` を全通過させると書いているが、上記より**通過が示す範囲は狭い** |
| **PB-8** プラットフォーム分岐の閉じ込め | **H-010**。それ以外では、所在による分岐 (`Location` の値による分岐) と `process.platform` による分岐の区別は plan.md:114-116 / data-model §2 で正しく保たれており、`src/main/infra/session/` に新たな `process.platform` 相当を置く設計にはなっていない |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `VerifiedRunning\|実行中確認済み` (bundle) | 14 件 / うち列挙プロセス経路 **0 件** | `contracts/session-enumeration.md:16,21` `data-model.md:8,32,327` `spec.md:27,239,241,497` `tasks.md:79,82` `quickstart.md:187` `contracts/ipc-session-list.md:153` `checklists/requirements.md:45` |
| C-001 | `VerifiedRunning` (src/ の infra 公開入口) | 3 関数 / 2 モジュール | `src/domain/runtime/interfaces.ts:39,122,125` (実装 `src/main/infra/fs/wsl-fs.ts:73,115` / `src/main/infra/runtime/wsl-detector.ts:172`) |
| C-002 | `rawCwd\|rawName\|raw:` (repo, node_modules 除外) | 39 件 / うち **IPC を渡る生パス文字列は `rawCwd` の 1 種類のみ** | `contracts/ipc-session-list.md:80,88,113,122` `tasks.md:64`。先例 `rawName` はディストロ名 (`src/domain/runtime/dto.ts:81` `src/main/app/runtime-store.ts:88` `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:231-232`) でありパスではない |
| H-001 | `parentPort\|stdio\|標準入出力\|MessagePort` (bundle) | **0 件** | — |
| H-002 | `services-not-to-io\|§9` (bundle) | **0 件** | ルール本体は `.dependency-cruiser.js:215-247` |
| H-003 | `reuse-verified\|UNDETECTED_NOTES` (bundle) | **0 件** | 残余の定義は `tests/rule-fixtures/expected.mjs` |
| H-004 | `BlockedReason\|UnreachableReason` (bundle) | **0 件** | R-1 の定義は `src/domain/workspace/folder.ts:17-20` |
| H-005 | `onRuntimesChanged\|runtimesChanged` (bundle) | **0 件** | 実在は `src/preload/index.ts:42`、用途定義は R-1 `contracts/ipc-capability.md:142` |
| H-006 | `fromUnc\|makeWslUncPath\|parseUnc` (repo) | 16 件 / うち生文字列を解析する API **0 件** | `src/domain/runtime/interfaces.ts:69` `src/domain/runtime/path-types.ts:129` `src/domain/runtime/path-api.ts:159` ほか |
| H-007 | `namespace:` (src/renderer/) | 5 件 (すべてテスト) | `ResolutionScreen.test.tsx:70,99,109,112,252` |
| H-008 | `doNotFollow\|node_modules` (.dependency-cruiser.js) | 1 件 | `.dependency-cruiser.js:298` |
| H-009 | `targetKey` (bundle) | 5 件 / 組成の定義 **0 件** | `contracts/ipc-session-list.md:17,36,94,149` `quickstart.md:112` |
| H-010 | `homedir\|getPath(\|USERPROFILE\|userData` (src/) | 13 件 / すべて `app.getPath('userData')` → `HostPath` 注入 | `src/main/app/composition-root.ts:60-64` `src/main/infra/settings/folder-store.ts:50-54,56,62,68,157` |
| M-002 | `wsl\$` (repo) | 3 件 (すべて文書) | `docs/decisions/0015-wsl-access-strategy.md:38,51` `research.md:30`。コード上の対応 **0 件** |

## Verdict

- Critical: 2
- High: 10
- Medium: 5
- Low: 2

**最も優先して解消すべき 3 件**: C-001 (`SessionEnumerator` に `VerifiedRunning` を型で要求する) / C-002 (`rawCwd` から UNC を排し、`SessionSummaryDTO` を `originKind` の判別 union にする) / H-001 (列挙プロセスの通信手段を標準入出力に固定し、単独起動で検証する)。この 3 件はいずれも **interface / DTO の署名変更**で閉じられるため、実装着手前 (Phase 2 の BE-017 / BE-018 より前) に確定させる必要がある。

**design-gate の人間承認項目 (plan.md:361-362) への追加提案**: SH-084 の ADR が固定しようとしている research R-05 の 4 規則は、規則 1 が実体と食い違い (M-003)、規則 4 が contract 本文と矛盾している (C-002)。**ADR 起票前に 4 規則を書き直すこと**を承認条件に含めるべきである。accepted 後は immutable になるため、この 1 点だけは順序が不可逆である。
