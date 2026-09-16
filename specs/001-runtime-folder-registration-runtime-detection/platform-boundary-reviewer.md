# platform-boundary-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 1 (pr-gate)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため、
> reviewer の最終報告を pr-gate が保存したものである。
>
> **harness の注記について**: 本報告の PB-4 節に
> `permissionMode` / `bypassPermissions` / `allowDangerouslySkipPermissions` という
> grep 文字列が現れるため、harness が instruction-shaped pattern として検出した。
> これは**検査に使った文字列**であり指示ではない (検査結果は 0 件)。

## 初回読了 viewpoint

- FR/SC: 本 round で直接検証したのは FR-003 / FR-005 / FR-007 / FR-008 / FR-010 / FR-011 / FR-019 / FR-021 / FR-024 / FR-025 / FR-035 / FR-036 / FR-037 / FR-041 と SC-004 / SC-005 / SC-008 / SC-009 / SC-013 / SC-016 / SC-017
- touched files に該当する charter / Confirmation:
  - `docs/domains/runtime/charter.md` 「業務ルール / 不変条件」— `capabilities` を正直に表明する / 検出は停止中のディストロを起動しない / パス操作は domain のパス API 経由
  - `docs/domains/isolation/charter.md` 「業務ルール / 不変条件」— `isAutoModeAllowed` 単一判定 (R-1 は暫定所有)
  - AD-003 Decision Outcome (複数インスタンス / 検出結果から生成される値)、AD-004 Consequences (多段変換)、AD-012 Consequences (2 ホップ / endpoint)
  - Constitution Principle I / II / III / VI / VII の Verification 節 (正本が `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/` に移っている)
- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の owner。`isTrustedSender` / token の senderId 束縛は読んだが指摘は出さない
- B. 入力検証 / injection / 暗号: 該当なし: 同上。`validate.ts` は名前空間の**型**の面だけ見た (M-002)
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:1 Low:0 — `runtime` charter の「capabilities を正直に表明する」と「停止中のディストロを起動しない」に当たる経路 (H-002 / H-003)、`reverse` の二重実装 (M-001)
- D. Constitution / ADR drift: Critical:0 High:2 Medium:1 Low:1 — Principle VI の検証スコープ (H-004)、AD-025 §2 経由の AD-004 パス型モデル (M-002 を High として計上)、Principle II の注記形 (M-004)、`wsl.exe` 引数許可リストの広さ (L-003)
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` / `ux-reviewer` の owner
- F. 命名 / module / lint hookup: Critical:1 High:0 Medium:0 Low:2 — ルール自体の網羅性 (PB-7) のみ。C-001 / L-001 / L-002。命名と module 配置は `convention-reviewer`
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 各 optional reviewer の owner
- H. テスト / coverage / observability / regression: 該当なし: `test-agent` / `po-reviewer` の owner。ただし C-001 は「テストの網羅性」ではなく**ルール強制機構そのものの穴**として F で扱う

## スコープ要約

本 round は「ESLint と tsc が構造的に見られない領域」に絞った。(1) `PathDTO` の JSON / IPC 往復、(2) 複数ディストロの同時扱いとキャッシュ、(3) `capabilities` の表明、(4) `isAutoModeAllowed` を通らない経路、(5) 多段変換、(6) ディストロ内スクリプトの残留、(7) 許可リストと除外の網羅性 — の 7 観点。

**design-gate の 2 件はどちらも解消**と判定した (根拠は末尾「design-gate 指摘の解消判定」)。code-gate iteration 1 の MUST_FIX 7 件の箇所は再指摘していない。

新規の中心は **「ルールが発火したこと」を確かめる機構そのものが発火を確かめられていない** (C-001) と、**非同期の read-modify-write が `capabilities` の表明と SC-005 の発行行為を壊しうる** (H-001 〜 H-003) の 2 系統である。前者は PB-7、後者は PB-2 / PB-3 に対応する。

## Findings

### [Critical] `test:rules` の期待表照合が「意図した検出器が発火したか」を判定できず、`#N` 形式の期待は**構造的に常に真**である (C-001) (scope: feature)

- **観察**: `scripts/rules/run.mjs:140-190` の `verify()` は、検出器が発火したかを **出力テキストにサンプルのファイル名が現れるか**だけで決め (`output.includes(name)`)、期待規則名は **どの検出器の出力でもよい全体一致**で照合する (`Object.values(outputs).some((output) => output.includes(rule))`)。すなわち **「どの規則が、どのサンプルに対して発火したか」という対応を一切検査していない**。
  そのうえで `scripts/constitution/check.mjs:539-545` は **全 11 項目の見出しを状態に関わらず必ず印字する** (`[ok     ] #1 特権コマンド文字列の不在 ...`)。実測で確認した (`node scripts/constitution/check.mjs` の出力に `#1` 〜 `#11` が全件現れる)。したがって `rules: ['#1']` のような期待は **check.mjs が起動しさえすれば必ず満たされる**。
  実害が成立している具体例: `tests/rule-fixtures/expected.mjs:144-150` の `wsl-args-array` は `rules: ['#1', '#3']` を期待するが、サンプル (`tests/rule-fixtures/b-equivalent/wsl-args-array.ts.fixture`) の文字列リテラルは `'node:child_process'` / `'wsl.exe'` / `'--import'` / `'NewDistro'` / `'D:/wsl'` / `'D:/rootfs.tar'` であり、**`allowlists.mjs` の `PRIVILEGED_COMMANDS_ALWAYS` / `_IN_SPAWN_CONTEXT` のいずれにも `--import` は無い**。項目 1 はこのサンプルに対して 1 件も発火しない。にもかかわらず `test:rules` は「期待表と全件一致 (20/20)」を報告する。この報告が **Constitution `## Existing violations summary` の「`pnpm test:rules` が…期待した検出器が実際に発火することを毎回確かめる」という主張の唯一の根拠**である。
  `run.mjs:99-116` が `no-orphans` を除外しているのは、まさにこの「無関係な規則が hit を作る」問題を 1 件だけ手当てした痕跡である。構造は直していない。
- **同種事象探索**:
  - `grep -n "rules: \[" tests/rule-fixtures/expected.mjs` → **15 件**。うち `#N` 形式を含むのは **7 件 / 8 トークン**で、**すべて構造的に常に真**: `expected.mjs:73` (`#8`) / `:81` (`#4`) / `:133` (`#8`) / `:141` (`#8`) / `:149` (`#1`, `#3`) / `:157` (`#7`) / `:209` (`#6`)。
  - 残る 8 件は eslint / depcruise の規則名で、**複数サンプルが同じ名前を要求しているため相互に充足する**: `no-restricted-imports` が 3 件 (`:65` / `:133` / `:157`)、`path-module-only-from-path-api` が 2 件 (`:65` / `:117`)、`domain-not-to-io` が 2 件 (`:47` / `:125`)、`no-circular` が 2 件 (`:96` / `:104`)。20 サンプルを**同時に**展開して 1 回だけ検証を回す設計 (`run.mjs:203-215`) なので、1 件でも発火すれば他が死んでいても通る。
  - `detectors` に規則名を持たないサンプル **3 件** (`namespace-mixup` / `forge-verified` / `dto-namespace-swap`) は `typecheck` 出力にファイル名が現れるだけで合格する。意図した型エラー (brand 偽造・名前空間取り違え) でなくても、**そのファイルに出た任意の型エラー**で満たされる。
  - **1 件あたりの検証を分離して回している箇所は 0 件** (`grep -n "for (const fixture" scripts/rules/run.mjs` → 展開 / 後始末 / 照合の 3 箇所すべてが全件一括)。
- **リスク/影響**: R-1 の機械強制の主張は 3 段構えになっている — (1) lint / depcruise / check.mjs が違反 0、(2) 「違反 0 はルールが死んでいる状態と区別できない」(AD-025 の実測 5 件)、(3) だから `test:rules` が発火を確かめる。**(3) が (2) を解消していない。** 出力は「20/20 一致」と読めるため、**項目 1 が完全に壊れても、`no-restricted-imports` が `src/main/app/**` に適用されなくなっても、`test:rules` は緑のまま**である。これは AD-025 の結論「ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」に対する drift であり、同時に Constitution v1.2.x の `existing_violations: 0` の根拠を弱める。Principle VI (項目 1 / 3 / 4 / 6 / 7) と Principle II (項目 8) の Automated 正本が、自分が効いていることを示せない状態にある。
- **推奨アクション**:
  1. `check.mjs` に **機械可読な出力**を足す (`--json` で `{id, state, findings: [{file, line}]}` を出す)。`run.mjs` は見出しテキストではなく **「項目 N の findings に当該サンプルの target が含まれるか」** で照合する。これで `#N` の真偽が構造的に定まる。
  2. eslint / depcruise も **サンプル単位で規則名と file:line の対応**を取る (`eslint --format json` / `depcruise --output-type json`)。`rules` の照合を「全出力に文字列が現れる」から「**そのサンプルの報告に現れる**」へ変える。
  3. `wsl-args-array` の期待を実態に合わせる — 項目 1 は `--import` を見ていないので、`rules: ['#3']` に直す**か**、`WSL_ALLOWED_ARGS` の裏返しを見る項目 (許可外引数) を許可モジュール外でも走らせて `#2` を期待にする。**期待表を直すだけで済ませず、なぜ誤ったまま 20/20 だったのかを (1)(2) で塞ぐこと。**
  4. `no-orphans` の個別除外 (`run.mjs:110-116`) は、上記で対応が取れるようになれば不要になる。除外リストを増やす方向へ進めない。
  5. `detectors` が `typecheck` のみの 3 件には、期待するエラーコード (`TS2345` / `TS2739` など) を `rules` に書けるようにする。
- **根拠**: AD-025 「結論として、ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」および同 §Consequences の実測表 (a)〜(e)。Constitution Principle VI Verification (正本は `scripts/constitution/check.mjs`) / Principle II Verification (項目 8) / `## Existing violations summary` の `pnpm test:rules` 行。SC-008 / SC-009 / SC-017。
- **scope 根拠**: `scripts/rules/run.mjs` / `scripts/constitution/check.mjs` / `tests/rule-fixtures/expected.mjs` はいずれも本 PR の touched files (199 件) に含まれ、本 PR 内で修正可能。

### [High] FR-010 の「同時実行を 1 本に束ねる」が実装されておらず、起動時に検出が二重に走る (H-001) (scope: feature)

- **観察**: FR-010 (spec.md:293) は「**再検出・判定・ブラウズ開始は同時実行を 1 本に束ね、追加要求は既存結果へ合流させる**。これは**境界で強制する制約**であり、UI の作り方に委ねてはならない」と定める。実装に合流 (in-flight coalescing) は **1 箇所も無い**。
  - `src/main/app/runtime-store.ts:113` の `list()` は `detected` フラグを見るが、`detected = true` は `detect()` の **`await` 完了後** (`:92`) に立つ。
  - `src/main/index.ts:83` が起動直後に `composition.runtimes.list()` を発行し、同時に renderer の `src/renderer/src/features/runtime-list/useRuntimes.ts:46-50` の mount effect が IPC 経由で `runtimes.list()` を呼ぶ。plan の実測値では列挙が約 1.6 秒かかるため、**この窓で `detected` は false のまま**であり、`detect()` が 2 回走る = `wsl.exe` の起動が **3 回 → 6 回**になる。C-1 (contracts/runtime-detection.md) が `list()` を「3 (並列)」に固定しているのはこの回数である。
  - `src/main/app/folder-service.ts:120-124` の `ensureVerified()` は `if (now() - verifiedAt <= TTL && verifiedCache.size > 0) return` という条件で、**空の結果を一切キャッシュしない**。実行中ディストロが 0 台のとき (全停止・WSL 未搭載・`listRunning` 失敗) は TTL が効かず、`list()` / `register()` / `unregister()` の**呼び出しごとに** `wsl.exe -l -q --running` を発行する。FR-010 の「確認の回数を…**利用者の操作回数に比例させてはならない**」に真正面から当たる。AD-015 の固定コスト (R-1 実機計測で 1.2〜1.4 秒) がそのまま操作回数分積み上がる。
- **同種事象探索**: `grep -n "await \|replace(\|folders = \|byId = \|verifiedCache = \|loaded = \|detected = " src/main/app/runtime-store.ts src/main/app/folder-service.ts` で、**`await` を挟んで共有状態を読み書きする箇所が 7 件** (合流も排他も無い):
  - `runtime-store.ts:85-92` `detect()` — `byId` 全置換
  - `runtime-store.ts:154-167` `probeAll()` 内側 — `current` を await 前に読み `replace` を await 後に書く (H-002)
  - `runtime-store.ts:195-209` `probeOne()` — 同型
  - `folder-service.ts:106-112` `ensureLoaded()` — `loaded` が await 後に立つ。並行呼び出しで `store.load()` が二重に走り、**復元不能レコードがある場合は `.bak` が 2 本生まれる** (`folder-store.ts:148`)
  - `folder-service.ts:120-124` `ensureVerified()` — 上記の負のキャッシュ穴
  - `folder-service.ts:338-360` `register()` — `folders` を await 前に読み `folders = [...folders, candidate]` を await 後に書く。**二重クリックで片方の登録が黙って消える**
  - `folder-service.ts:378-382` `unregister()` — 同型
  - 合流機構の探索: `grep -rn "inflight\|inFlight\|pending\b\|Promise<.*> | null" src/main/app/` → **0 件**。
- **リスク/影響**: (a) 起動時に `wsl.exe` が 6 回立ち上がり、SC-004 の「一覧の初回描画 3 秒」予算 (実測 1.6 秒 + 固定コスト) を直撃する。charter の Open Question が「判定バッチの実測は 3,593〜3,910 ms で予算 4,000 ms に対し余裕が薄い」と認めている箇所と同じ余裕の無さに乗る。(b) 全停止環境ではフォルダ一覧の操作ごとに 1.2〜1.4 秒の固定コストが乗り、FR-010 の境界強制が成立しない。(c) `register` の lost update は**利用者が登録したはずのフォルダが存在しない**という形で現れ、SC-013 の永続化往復を壊す。
- **推奨アクション**: `runtime-store` / `folder-service` に **in-flight Promise を保持する 1 つの補助関数**を置き、`detect` / `probeAll` / `ensureLoaded` / `ensureVerified` / `beginBrowse` の 5 経路を通す (`let inflight: Promise<T> | null` を返して共有し、`finally` で null に戻す形)。`ensureVerified` の条件から `verifiedCache.size > 0` を外し、**空の結果も TTL の対象にする** (「0 台だった」という確認結果も確認結果である)。`register` / `unregister` は `folders` の読みと書きを同一 tick に閉じる (await の前に次状態を確定させる) か、直列化キューを通す。FR-010 の「境界で強制」を満たしたことを `runtime-store.test.ts` で **並行 2 呼び出しに対する `cli` 呼び出し回数**として固定する。
- **根拠**: FR-010 (spec.md:293-297)、SC-004 (spec.md:472)、`contracts/runtime-detection.md` C-1、`docs/domains/runtime/charter.md` KPI (検出の所要時間)、AD-015 (固定コスト 1.5 秒)。
- **scope 根拠**: `src/main/app/runtime-store.ts` / `folder-service.ts` / `src/main/index.ts` はすべて本 PR の touched files。

### [High] 判定結果の書き戻しが再検出後の descriptor を上書きし、消えた/停止したディストロが `autoModeSafe: true` で復活しうる (H-002) (scope: feature)

- **観察**: `src/main/app/runtime-store.ts:154-167`:
  ```ts
  const current = byId.get(target.id)          // ← await の前に読む
  if (current === undefined || current.kind !== 'wsl') return
  const outcome = await detector.probe(current, token)   // 実測 3.2 秒 / timeout 20 秒
  replace(target.id, withCapabilities(current, outcome.capabilities, outcome.pathMapping))
  ```
  `replace()` (`:80-82`) は `byId.set(id, next)` である。`detect()` (`:86`) は `byId` を**新しい Map に全置換**する。したがって判定の `await` 中に `refresh()` が走ると、**判定完了後の `replace` が古い `current` を新しい Map に書き戻す**。
  結果は 2 通り。(a) 再検出でディストロが消えていた場合 → **一覧に存在しないディストロが復活する** (`byId.set` は新規キーを作る)。(b) 再検出で `state: 'stopped'` になっていた場合 → `current` は `state: 'running'` を持つので**停止中のディストロが「実行中」かつ判定済みとして表示される**。`sandbox: 'bubblewrap'` が取れる環境 (charter が「socat 導入後に `sandbox: 'bubblewrap'` へ変わり隔離の実動作も確認済み」と記録している計測ホストがこれ) では、**`autoModeSafe: true` / `probedAt` 新鮮という表明が、実体が存在しない/停止しているランタイムに付く**。
  到達経路は R-1 が利用者に案内している操作そのものである — `ResolutionScreen` の解消手順は `start-distro` → `rescan-runtimes` (`src/domain/workspace/folder.ts:22` の `ResolutionStep`) であり、`composition-root.ts:76-84` の `refreshRuntimes` は `refresh()` の直後に `void runtimes.probeAll()` を投げる。**起動時の `probeAll` (`index.ts:83`) が走っている最中に利用者が再検出を押す**のが正規の流れである。
- **同種事象探索**: `grep -n "replace(" src/main/app/runtime-store.ts` → **5 件** (`:150` / `:163` / `:198` / `:204` / `:209`)。うち **await をまたいで書き戻すのは 2 件**: `:163` (`probeAll`、`current` は `:160` で読む)、`:209` (`probeOne`、`probing` は `:203` で確定)。`probeOne` は `:195` の `verifyRunning` を毎回取り直すので窓は短いが同型である。`byId` を全置換する箇所は `:86` の 1 件。`AgentRuntime` / descriptor を module スコープやグローバルに置いた箇所は **0 件** (`grep -rn "^let \|^const .*Runtime =" src/main --include=*.ts` の module スコープに該当なし。AD-003 の「シングルトンではない」は守られている)。
- **リスク/影響**: `runtime` charter の不変条件「ランタイムは `capabilities` を**正直に表明する**。能力がないものを『ある』と言ってはならない」に反する。R-1 には権限ゲートが無い (I-3) ので**現時点の実害は表示の誤りとファントムエントリ**に留まるが、`isAutoModeAllowed()` は I-3 のゲート入力として指定されており、この書き戻しはゲートの入力を汚す経路である。あわせて AD-003 の「検出結果から生成される値」という扱いも破れる — 検出結果に無い値が store に残る。
- **推奨アクション**: `detect()` に**世代番号**を持たせ、`replace()` を「同一世代でのみ書き込む」形にする (`let generation = 0` を `detect()` で進め、`probeAll` / `probeOne` は開始時の世代を捕らえて `replace` の前に照合する)。あわせて `replace` を「**既存キーが存在するときだけ上書きする**」に変える (`if (!byId.has(id)) return`) — 消えたインスタンスの復活はこれ 1 行で塞がる。`runtime-store.test.ts` に「判定の await 中に `refresh()` でディストロを消す → 判定完了後も一覧に現れない」「停止に変わったら `state: 'running'` に戻らない」の 2 ケースを足す。
- **根拠**: `docs/domains/runtime/charter.md` 業務ルール (capabilities を正直に表明する)、AD-003 Decision Outcome (複数インスタンス / 検出結果から生成される値)、FR-003 / FR-008、data-model §3 の不変条件。
- **Critical にしない理由**: 権限ゲート (`isAutoModeAllowed` をゲート入力にする) は I-3 であり、現時点の実害は誤表示に留まる。reviewer-base の「将来の経路は High 上限」に従う。

### [High] 停止を観測した後も実行中確認済みの値が無効化されず、SC-005 の「発行行為 0 件」が破れる経路が残る (H-003) (scope: feature)

- **観察**: `src/main/app/folder-service.ts:101-102` の `verifiedCache` / `verifiedAt` は `ensureVerified()` (`:120-124`) でしか書き換わらず、**`runtime-store` の `refresh()` / `probeOne()` が「停止」を観測しても無効化されない**。`checkExistence` (`:132-144`) は `verifiedCache.get(...)` があれば `fs.exists(folder.path, verified, now())` を発行し、`wsl-fs.ts:115-127` は UNC 経路 (`\\wsl.localhost\<D>\...`) に `stat` する。
  `data-model` §5 と `src/domain/runtime/verified-running.ts:50-54` は「有効期間内に実体が停止する窓は残る…**残余として受け入れ、SC-005 はアプリ側の発行行為で測る**」と定めており、spec.md:551 の `[ASSUMED]` もこれを承認している。**本指摘はその残余ではない。** 残余が許されているのは「アプリが停止を知る手段が無い区間」であり、ここは `probeOne()` が `{ state: 'stopped', capabilities: probeFailed() }` を書き込み (`runtime-store.ts:198`)、`refresh()` が `state: 'stopped'` を得た**後**でも、`folder-service` 側の確認済みの値が最長 30 秒 (`BROWSE_SESSION_TTL_MS`) 生き残る。`buildList` は `runtimes()` のスナップショットを既に手に持っている (`folder-service.ts:170`) のに、`checkExistence` はそれを参照しない。**追加のプロセス起動なしに停止を知れる状態で、停止中ディストロへ起動を伴う操作を発行する。**
- **同種事象探索**: `grep -rn "verifiedCache" src/main/app/folder-service.ts` → **4 件** (`:101` 宣言 / `:121` TTL 判定 / `:122` 代入 / `:141` 参照)。**無効化 (クリア) を行う箇所 0 件**。同型の「確認済みの値を保持し続ける」箇所: `folder-service.ts:98` の `sessions` Map — こちらは `browseDirectory` が `checkNotExpired` を**ファイルアクセスの前に**検査して `sessions.delete` する (`:286-289`) ため、design-gate H-001 の勧告どおり閉じている。差は「期限」は見るのに「アプリ自身の停止観測」を見ないこと。`runtime-store` から `folder-service` へ状態変化を伝える経路の探索: `grep -n "onChanged" src/main/app/*.ts src/main/index.ts` → `runtimes.onChanged` の購読者は `index.ts:66` の renderer 中継のみで、**`folder-service` は購読していない (0 件)**。
- **リスク/影響**: SC-005 は「検出・一覧表示・フォルダ選択・組み合わせ解決のいずれにおいても、**アプリが停止中のディストロに対して起動を伴う操作を発行することが 0 件**」と定める。計測経路は「検証前後の `wsl -l -v` の比較」であり、この経路は**その比較で検出されうる** (停止させた直後にフォルダ一覧を開くと `Running` に戻る)。quickstart V-2 の手順が「停止 → 一覧」の順に並んでいれば実機で再現する。
- **推奨アクション**: `folder-service` に `verifiedCache` の無効化点を作る。最小案は `checkExistence` で **`runtimes()` スナップショットの `state` を先に見る** — 対象ディストロの descriptor が `state !== 'running'` なら確認済みの値を使わず `'unknown'` を返す (`unknown` は既に「解除を勧めない」側に倒れる設計なので下流の変更は不要)。恒久案は `runtimes.onChanged` を購読して `verifiedCache` を破棄する。あわせて quickstart の SC-005 手順に「一覧表示中に対象ディストロを `wsl --terminate` し、30 秒以内にフォルダ一覧を再取得 → `wsl -l -v` が変化しない」を追加する。
- **根拠**: SC-005 (spec.md:477-482)、FR-007 / FR-015、`docs/domains/runtime/charter.md` 業務ルール (検出は停止中のディストロを起動しない)、data-model §5、`verified-running.ts:50-54` の残余の定義。
- **Critical にしない理由**: 起動は環境の**永続的な**変更ではなく Principle VI の直接違反ではない。SC 違反であり High とする。

### [High] Principle VI の検証スコープに CI 定義が含まれておらず、`tests/` が事実上のディレクトリ除外になっている (H-004) (scope: feature)

- **観察**: Constitution Principle VI の Verification は「**検証スコープは `src/` に限らない** (AD-024 #5)。`scripts/` とビルド構成 (`package.json` の scripts / **CI 定義** / パッケージング設定) を含める。**除外はファイル単位の明示リスト**とし、ディレクトリ単位で除外してはならない」と定める。実装 (`scripts/constitution/allowlists.mjs:12-24`) は `SCAN_ROOTS = ['src','scripts']` と `SCAN_FILES = ['package.json','electron.vite.config.ts','electron-builder.yml','eslint.config.mjs','.dependency-cruiser.js']` である。
  - **CI 定義が入っていない**。`.github/workflows/verify.yml` は走査対象外である (`node scripts/constitution/check.mjs` の「対象 104 ファイル」に含まれない。`scan.mjs:50-65` は `SCAN_ROOTS` を walk し `SCAN_FILES` を足すだけ)。CI ワークフローは `sudo apt-get install` / `wsl --install` / `docker build` を書ける第一級の実行コードであり、Principle VI が名指しでスコープに入れた対象である。現在の `verify.yml` 自体は特権操作を含まない (全文確認済み) ため既存違反は 0 だが、**検証が構造的に届いていない**。
  - `vitest.config.ts` も入っていない。`tsconfig.node.json:2-11` が `vitest.config.*` を型検査対象に含めているのに、Principle VI の走査からは外れている。
  - `tests/` が `SCAN_ROOTS` に無いため、`tests/setup/renderer.ts` / `tests/setup/harness.test.*` / `tests/docs/dependency-anchors.test.ts` は **項目 1 / 7 / 8 / 9 のいずれも掛からない**。`allowlists.mjs:48-56` は「除外はファイル単位の明示リストとする」と書き、`EXCLUDED_FILES = []` を誇示しているが、**ルートを列挙する方式そのものが裏口のディレクトリ除外になっている**。`RULE_FIXTURES_DIR` は意図的な例外として文書化されているが、`tests/` の残りは文書化もされていない。
- **同種事象探索**: `SCAN_ROOTS` / `SCAN_FILES` の参照箇所 `grep -rn "SCAN_ROOTS\|SCAN_FILES" scripts/` → **4 件** (`allowlists.mjs:12` / `:18`、`scan.mjs:18-19` / `:52-53`)。走査から外れる**実行可能ファイル**の実測: `.github/workflows/verify.yml` (1)、`vitest.config.ts` (1)、`tests/**/*.ts(x)` (5: `tests/setup/renderer.ts` / `tests/setup/harness.test.ts` / `tests/setup/harness.test.tsx` / `tests/docs/dependency-anchors.test.ts` / `tests/rule-fixtures/expected.mjs`) = **7 件**。うち `tests/rule-fixtures/` 配下は文書化済みの例外。
- **リスク/影響**: Principle VI は NON-NEGOTIABLE であり、その Automated の正本が宣言されたスコープを実装していない。CI は「環境を作る」操作が最も自然に書かれる場所 (ランナーへの依存導入) であり、ここが盲点になっている限り「アプリは永続環境を構築しない」の検証は不完全である。**`check:constitution` が緑であることは CI 定義について何も示さない** — Principle VIII の Verification が同じ形の注意書きを持っているのに、VI には書かれていない。
- **推奨アクション**: `SCAN_FILES` に `.github/workflows/verify.yml` と `vitest.config.ts` を足す。`SCAN_EXTENSIONS` は既に `.yml` / `.yaml` を持つので追加実装は不要。`SCAN_ROOTS` に `tests` を足し、`RULE_FIXTURES_DIR` の除外は既存のまま残す (`scan.mjs:62` が既に効く)。`.github/` をルートに加えるなら将来のワークフロー追加が自動で入るため望ましい。スコープを広げた時点で項目 1 の `PRIVILEGED_COMMANDS_IN_SPAWN_CONTEXT` の誤検出が CI 定義で出るかを一度回して確認すること (YAML の `run:` 行は文字列リテラルとして切り出されないため、`stringLiterals` ベースの項目 1 は YAML に対してほぼ無効である点も併せて設計する — **拡張子を足すだけでは項目 1 は YAML を見られない**)。
- **根拠**: Constitution Principle VI Verification (AD-024 #5)、FR-037、AD-024 #3 / #4 / #5。
- **Critical にしない理由**: 現在の `verify.yml` に違反は無い (全文確認)。検証の穴であり実害は未成立のため High 上限。

### [High] `NamespaceId` の内部構造に触れる実装が宣言された単一箇所の外に 2 件ある (M-002 / High として計上) (scope: feature)

- **観察**: `src/domain/runtime/namespace.ts:60-72` は `distroOf()` について「**本モジュールが `NamespaceId` の内部構造に触れてよい唯一の場所である。** 他のモジュールは `isSameDistro()` を使い、文字列操作で接頭辞を剥がさない。剥がす実装は round 3 / 4 / 5 の gate が繰り返し塞いだ『境界での再 branding』と同じ形になる」と明記する。AD-025 §2 も「**`NamespaceId` からディストロ成分を取り出してよいのは `isSameDistro(a, b)` 1 箇所に限る**」と定める。
  実装は 2 箇所でこれを外している。
  - `src/main/app/validate.ts:70-75` — `p.namespace.startsWith('wsl:')` で種別を判定し、**`p.namespace.slice(4)` でディストロ名を取り出す**。マジックナンバー `4` が `'wsl:'` の長さに暗黙に依存している。
  - `src/main/infra/settings/folder-record.ts:130` — `makeRuntimePath(\`wsl:${location.distroName}\`, ...)` と**テンプレートリテラルで名前空間識別子を組み立てる**。同ファイルは `wslNamespace()` を import していない (import しているのは `isValidDistroName` / `makeHostPath` / `makeRuntimePath` / `isNamespaceConsistent`)。同じレコードの直前の検査 (`:109`) は `isNamespaceConsistent()` 経由で `wslNamespace()` を使っているため、**1 つのレコードの処理中に構成方法が 2 通り混在している**。
- **同種事象探索**: `grep -rn "'wsl:\|\`wsl:\|\"wsl:" src/ | grep -v namespace.ts` → コメント・テスト・型注釈を除いた**実行コードは 2 件** (`validate.ts:70`、`folder-record.ts:130`)。`grep -rn "namespace\.\(slice\|startsWith\|split\|replace\|substring\)" src/` → **2 件** (`validate.ts:70` / `:74`)。`unc:` を実行コードで組み立てる箇所は `namespace.ts:52` の `uncNamespace()` のみ (**外部 0 件**)。`namespaceDistroName()` の呼び出し元は `path-api.ts:139` / `:161`、`path-types.ts:107` / `:130`、`folder.ts:95` の **5 件**で、すべて `domain` 内。
- **リスク/影響**: 現時点では 3 者の結果が一致するため実害は無い。しかし `namespace.ts:9` が「**I-1 で `container:*`、OPT-mac で `direct:*` が増える**」と予告している。`validate.ts:74` の `slice(4)` は `container:` / `direct:` の追加で**静かに誤った文字列を返す** (型は `string` なので tsc は何も言わない)、`folder-record.ts:130` は新しい所在種別に追随し忘れる形になる。これは design-gate round 3 / 4 が 2 度塞いだ「境界での再 branding」の再発形であり、**JSON 往復と IPC 境界という brand が退化する 2 点にちょうど残っている**。
- **推奨アクション**: `validate.ts` は `isValidPathDTO` の `wsl:` 分岐を `namespaceDistroName(p.namespace as NamespaceId)` + `isSameNamespace` 相当に置き換える (種別判定が要るなら `namespace.ts` に `isWslNamespace(id)` を足して**そこに寄せる**)。`folder-record.ts:130` は `wslNamespace(location.distroName)` に置き換える (import 1 行)。`tests/rule-fixtures/` に「`NamespaceId` を文字列操作で分解する」サンプルを 1 件足し、C-001 の修正後に**どの検出器も捕まえないこと**を `UNDETECTED_NOTES` として明示するか、`src/renderer/` 以外にも効く lint ルールで塞ぐ。
- **根拠**: AD-025 §2 (AD-004 の読み替え根拠)、`src/domain/runtime/namespace.ts:60-72` の宣言、Principle I (パス API 経由)、FR-021。
- **scope 根拠**: 2 ファイルとも本 PR の touched files。**ADR の文言そのものの解釈 (「1 箇所に限る」に `namespaceDistroName()` の export が含まれるか) は `architecture-reviewer` の owner** であり、本指摘は「宣言された単一箇所の外に実装がある」という観察に限る。

### [Medium] `reverse(mapping)` が 2 箇所に重複実装されており、capability の表明と越境判定が別々の実装に依存している (M-001) (scope: feature)

- **観察**: 逆向きマッピングの構成が同一内容で 2 箇所にある。
  - `src/main/infra/runtime/wsl-detector.ts:301-311` — `deriveWsl2Capabilities` が `isUnderAnyPrefix(reverse(mapping), resolved)` で **必須依存 (`bwrap` / `socat`) が Windows マウント配下に解決されたか**を判定する。これが `sandbox: 'bubblewrap'` すなわち `autoModeSafe` の表明を左右する (FR-005)。
  - `src/domain/workspace/resolution.ts:202-212` — `stage3` が `isUnderAnyPrefix(reverse(mapping), path.value)` で **越境 (`cross` / `native`) を判定**する (FR-024 / SC-006)。
  どちらも `entries` の `fromPrefix` / `toPrefix` を入れ替え `from` / `to` を交換する同一実装で、`path-mapping.ts` にも `path-api.ts` にも共有の `reverse` は無い。
- **同種事象探索**: `grep -rn "function reverse" src/` → **2 件** (`wsl-detector.ts:301` / `resolution.ts:202`)。`grep -rn "isUnderAnyPrefix" src/` → **3 件** (定義 `prefix-match.ts:77`、上記 2 箇所の呼び出し)。両実装の等価性を固定するテストの探索: `grep -rln "reverse" src/**/*.test.ts` → **0 件**。
- **リスク/影響**: 片方だけを直した瞬間に、「Windows マウント配下か」の判定が capability 側と越境側で食い違う。食い違いの一方は **`sandbox` を実際より安全側に誤る (`autoModeSafe` が開く)** 方向であり、`runtime` charter の「能力がないものを『ある』と言ってはならない」に直結する。`path-mapping.ts:90-114` に `compose()` という拡張点が用意されているのに、逆向き変換だけが型の外に散っている点も非対称である。
- **推奨アクション**: `src/domain/runtime/path-mapping.ts` に `export function reverse(mapping: PathMapping): PathMapping` を置き、2 箇所から import する (`domain → domain` / `infra → domain` はいずれも許可行列内)。`path-api.test.ts` に `reverse(reverse(m)) === m` と「逆向きで最長一致の結果が変わらない」の 2 ケースを足す。
- **根拠**: FR-005 / FR-024、`docs/domains/runtime/charter.md` 業務ルール、data-model §2。

### [Medium] マウント位置が `/` のときセグメント境界照合が無条件に真になり、経路上のどこもこれを拒否しない (M-003) (scope: feature)

- **観察**: `src/domain/workspace/prefix-match.ts:37-39` は `stripTrailing(prefix, separator)` の結果が空文字列のとき **`return true`** する。逆向きマッピング (M-001 の `reverse`) では `fromPrefix` がランタイム側のマウント位置になるため、マウント位置が `/` のとき `stripTrailing('/','/') === ''` で **すべての値が一致する**。
  この値が経路を通ることを拒否する検査が無い: `src/main/infra/runtime/wsl-output.ts:213` は `mountPoint.length > 1 ? ... : mountPoint` として **`/` をそのまま通し**、`src/domain/runtime/path-mapping.ts:55` の `isValidPosixPrefix` は **`prefix === '/'` を明示的に許す**。したがって `path=C:\` を持つ行が `/` にマウントされていれば、`makePathMapping` は成功し、以後 `isUnderAnyPrefix` は常に真を返す。
- **同種事象探索**: `grep -rn "normalized.length === 0\|prefix === '/'" src/domain/` → **2 件** (`prefix-match.ts:38` / `path-mapping.ts:55`)。空接頭辞を拒否する検査の探索: `grep -rn "fromPrefix.length\|toPrefix.length" src/` → **0 件**。`matchesAtSegmentBoundary` の呼び出し元は `prefix-match.ts:52` (`findLongestMatch`) の **1 件**で、そこから `convertWithMapping` (`path-api.ts:224`) と `isUnderAnyPrefix` の 2 系統に効く。
- **リスク/影響**: 現実の `/proc/mounts` で `path=C:\` が `/` に来る構成は想定しにくく、**現時点の実害は未成立**。影響の向きは 2 つで、capability 側は「必須依存が常にマウント配下 → `sandbox: 'none'`」= **安全側**、越境判定側は「所在 `wsl:<D>` のすべてが `cross`」= **常時越境警告**で FR-029 / SC-006 の信頼性を下げる。逆に `applyEntry` (`prefix-match.ts:59-69`) は `fromPrefix` が空のとき `toPrefix + 変換後の全体` を返すため、**変換結果が字面と無関係な位置を指す**。「接頭辞が空なら全一致」という規則はセグメント境界照合の趣旨 (`/mnt/cdrom` を `/mnt/c` に当てない) と噛み合っていない。
- **推奨アクション**: `matchesAtSegmentBoundary` の `normalized.length === 0` を `return false` にする (「空の接頭辞は何にも一致しない」)。あわせて `makePathMapping` で `fromPrefix` / `toPrefix` がセパレータのみの要素を `malformed-entry` として拒否する。`path-api.test.ts` に「マウント位置 `/` のマッピングは `makePathMapping` が拒否する」を 1 ケース足す。
- **根拠**: FR-024 (特定のマウント位置を決め打ちしない)、data-model §2、`prefix-match.ts:26-31` の設計意図。

### [Medium] `platform-ok` 注記の形が 2 箇所で不揃いで、片方は Constitution が明示的に避けよと書いた位置にある (M-004) (scope: feature)

- **観察**: Constitution Principle II 「例外の書き方」は「**判定をいったん変数に受け、その行に注記を置く。** `if` の条件式に直接書くと prettier が注記を次の行へ送り、『同じ行』という条件を満たさなくなる (R-1 実装時に実測。AD-024)」と、コード例つきで形を指定している。
  - `src/main/index.ts:95` — `const isMac = process.platform === 'darwin' // platform-ok: ...` **指定形どおり**。直前の `:93-94` に理由のコメントまである。
  - `src/main/app/window.ts:31` — `...(process.platform === 'linux' ? { icon } : {}), // platform-ok: ...` **判定を変数に受けず、オブジェクトリテラル内の三項に直接書いている**。
  注記内容の正直さは両方とも確認した — `window.ts` の「Linux だけが `BrowserWindow` に `icon` を要する (Electron の規約)」はホスト OS のアプリ規約であり、ランタイム選択の分岐を隠していない。`index.ts` も同様。**PB-2 の「注記が正直か」の観点では違反なし。**
- **同種事象探索**: `grep -rn "platform-ok" src/ scripts/ tests/` → **4 件** (`window.ts:31` / `index.ts:95` / `allowlists.mjs:282-283` は定義)。プラットフォーム判定の実行コードは `grep -rn "process\.platform\|os\.platform\|os\.type\|navigator\.\(platform\|userAgent\)" src/` で **2 件のみ** (上記 2 箇所。`src/main/infra/runtime/` 内の判定は 0 件、renderer 側の `navigator` 経由も 0 件)。
- **リスク/影響**: 現在は prettier が注記を動かしておらず (`pnpm lint` 0 件)、項目 8 は `ok` を返す。しかし `window.ts:31` の行は、`webPreferences` の並びが変わる / `icon` 以外のプロパティが増える / `printWidth` を縮める、のいずれでも整形の対象になる位置にある。整形器が注記を次行へ送った瞬間に **Principle II の違反として検出される** — 「除去不能な Electron 規約」なので、そのとき取れる手は形を直すことだけである。**先に指定形へ揃えておけば、この再発経路が消える。**
- **あわせて (PB-7)**: `PLATFORM_BRANCH_PATTERNS` (`allowlists.mjs:265-280`) は `process.platform` / ブラケット / 分割代入 / `os.platform()` / `os.type()` / `process.getSystemVersion()` / `process.arch` / `process.env.OS|OSTYPE` を見るが、**renderer で最も自然な等価経路である `navigator.platform` / `navigator.userAgent` / `navigator.userAgentData.platform` を見ていない**。現在の使用は 0 件 (上記 grep) なので違反は無いが、Principle II が守りたいのは「UI やサービス層に漏れないこと」であり、UI 側の等価経路がパターンに無いのは網羅性の穴である。`window.electron.process.platform` 形は `\bprocess\s*\.\s*platform\b` が `.` を語境界として拾うため捕捉できる (確認済み)。
- **推奨アクション**: `window.ts:31` を `const needsIcon = process.platform === 'linux' // platform-ok: ...` に分け、`...(needsIcon ? { icon } : {})` にする。`PLATFORM_BRANCH_PATTERNS` に `/\bnavigator\s*\.\s*(platform|userAgent|userAgentData)\b/` を足し、`tests/rule-fixtures/b-equivalent/` に renderer 置きのサンプルを 1 件足す (C-001 の修正後なら発火を確認できる)。
- **根拠**: Constitution Principle II 「例外の書き方」/ Verification (項目 8 と `PLATFORM_BRANCH_PATTERNS`)、AD-024 #8、Amendment trail v1.1.0。

### [Low] `CSP_DECLARATION_EXEMPT_SUFFIXES` の接尾辞免除は境界上の穴ではない (L-001) (scope: feature)

- **観察**: `scripts/constitution/allowlists.mjs:327` の `CSP_DECLARATION_EXEMPT_SUFFIXES = ['.test.ts', '.test.tsx']` は `check.mjs:470` で項目 10 の (e) (「`CSP_FILES` 以外に CSP 宣言が無いこと」) にのみ効く。`convention-reviewer` の C-002 が「他の許可リストが実名なのに不揃い」と指摘しているが、**境界の観点では穴になっていない**と判定した。理由は 3 つ。(a) 免除の対象は「宣言の重複検査」のみで、(a)〜(d) の directive 検査・禁止形検査には影響しない。(b) 走査ルートは `src` / `scripts` に限られるため、対象になりうるのは `src/**/*.test.ts(x)` だけである (現在 `src/main/app/protocol.test.ts` の 1 件)。(c) electron-vite のバンドルは `src/main/index.ts` / `src/preload/index.ts` / `src/renderer/index.html` から到達するモジュールだけを含むため、**`*.test.ts` の CSP 文字列が出荷物に載る経路が無い**。
- **同種事象探索**: `grep -rn "default-src" src/ scripts/` → **3 件** (`protocol.ts` の組み立て / `protocol.test.ts` の assert / `allowlists.mjs:314` の定義)。`src/renderer/index.html` に `default-src` は **0 件** (MF-004 で撤去済みを確認)。免除接尾辞に一致する `src/` 配下のファイルは **7 件**あるが、うち `default-src` を含むのは `protocol.test.ts` の 1 件のみ。
- **リスク/影響**: 実名化は望ましい (将来 `*.test.ts` が増えたとき、そこに書かれた 2 つ目の CSP が無条件に免除される) が、出荷物へ漏れる経路が無いため境界侵食ではない。`convention-reviewer` C-002 の推奨 (`CSP_DECLARATION_EXEMPT_FILES = ['src/main/app/protocol.test.ts']`) に **同意する**。severity のみ Low と判定する。
- **根拠**: FR-040 / SC-016、AD-025 §7、`allowlists.mjs:48-56` (除外はファイル単位)。

### [Low] `GENERATED_FILES` のグロブ除外は Principle I / VII の穴ではない (独立判定) + 2 つの除外集合に機械照合が無い (L-002) (scope: feature)

- **観察**: `convention-reviewer` の M-001 (High) が指摘する `src/renderer/src/components/assistant-ui/elements/error-state.tsx` の手編集 (`:28-29` / `:37-38` の `retryLabel` / `retryingLabel`) について、**境界の観点から独立に判定した**。
  - `eslint.config.mjs:403-414` の `GENERATED_FILES` ブロックが off にする 7 規則は `prettier/prettier` / `explicit-function-return-type` / `react/prop-types` / `react-hooks/refs` / `react-hooks/exhaustive-deps` / `react-refresh/only-export-components` / `no-empty` で、**すべて体裁・React 系**である。
  - レイヤ規則 (`boundaries/dependencies` / `boundaries/no-unknown-files` / `boundaries/no-unknown-dependencies`、`:162-352`) と禁止 import (`no-restricted-imports`、`:355-358`) は `files: ['src/**/*.{ts,tsx}']` で掛かり、**GENERATED_FILES ブロックでは解除されていない** (同ブロックに該当規則名は無い)。`.dependency-cruiser.js` にも生成物の除外は無い (`options.exclude` は `[?](asset|asarUnpack)$` のみ)。
  - したがって **Principle I (パス操作) / Principle VII (agents → electron) / FR-035 (ui → core) の強制は生成物にも及んでいる**。コメント (`:66-72`) の「レイヤ規則と禁止 import は掛け続ける」という主張は実装と一致する。**境界の穴ではない**と判定する。convention M-001 の「再生成で FR-047 対応の prop が消える」という懸念は妥当だが、platform boundary の指摘としては出さない。
- **残余として 1 点**: 除外集合が `eslint.config.mjs:73-77` (glob 3 本) と `.prettierignore` (ディレクトリ 3 行) に**二重に**定義され、**形が一致していない** (前者は `**/*.{ts,tsx}` 限定、後者はディレクトリ全体なので `.css` / `.json` も含む)。`eslint.config.mjs:71` が「整形の除外は `.prettierignore` に同じ集合で書いてある」と主張しているが、**同じ集合であることを確かめる機械検査は 0 件** (`grep -rn "prettierignore" scripts/ tests/` → 0 件)。
- **同種事象探索**: `GENERATED_FILES` の参照箇所 → **2 件** (`:73` 定義 / `:404` 使用)。生成物ディレクトリ配下で `no-restricted-imports` の対象モジュールを import している箇所 → **0 件** (穴が実際に使われていないことの確認)。
- **推奨アクション**: `.prettierignore` を `eslint.config.mjs` から生成するか、`tests/docs/dependency-anchors.test.ts` と同じ形で「2 つの集合が一致すること」を 1 ケース固定する。error-state.tsx 自体の扱いは convention M-001 の推奨 (自前ラッパへ切り出す) に同意する。
- **根拠**: Constitution Principle VI の「除外はファイル単位の明示リストとし、ディレクトリ単位で除外してはならない」(検証スクリプトのスコープ規定であり lint 設定には直接掛からない点に留意)、Principle I / VII Verification。

### [Low] `WSL_ALLOWED_ARGS` が実際に使う引数より広く、`-u` / `--user` / `--cd` を許している (L-003) (scope: feature)

- **観察**: `allowlists.mjs:163-181` は 14 個の引数を許可するが、`wsl-cli.ts:143-168` が実際に渡すのは `-l` / `-q` / `--running` / `-v` / `-d` / `--` の **6 個**である。許可されている `-u` / `--user` は「ディストロ内でどの利用者として実行するか」を指定でき、`--user root` の形なら項目 1 の特権コマンド一覧 (`root` は含まれない) にも掛からずに**ディストロ内で root として実行**できる。`--cd` も同様に未使用である。
- **同種事象探索**: `grep -n "invoke(\[" src/main/infra/runtime/wsl-cli.ts` → **4 件** (`:144` / `:148` / `:152` / `:164`)。使用されている引数リテラルは 6 種。`WSL_ALLOWED_ARGS` に入っていて未使用のものは **8 種** (`--list` / `--quiet` / `--verbose` / `--all` / `-u` / `--user` / `--exec` / `--cd`)。
- **リスク/影響**: 現時点で実害なし。root 実行が成立しても、ディストロ内で走るスクリプトは項目 6 の 3 点検査で `PROBE_SCRIPT` 1 本に固定され、`DISTRO_SCRIPT_FORBIDDEN_FORMS` (`>` / `>>` / `tee` / `mkdir` / `touch` ...) がリダイレクトと書き込みを封じているため、**永続的な変更は依然できない** (`probe-script.ts` を読んで確認: `command -v` / `test -r` / `cat /proc/` / `unshare` / `printf` のみ、リダイレクト 0 件、標準入力の読み取り 0 件 — **PB-6 の観点では違反なし**)。項目 2 と項目 6 が噛み合って塞がっている形であり、許可リストの広さは「もう 1 枚の防御の薄さ」に留まる。
- **推奨アクション**: 使っていない 8 種を落とす (許可リストは「許してよいものの列挙」であり、`allowlists.mjs:8` が「禁止側を列挙しない」と書いている趣旨からも、使わないものを載せる理由が無い)。落とすとき **`-u` / `--user` の再追加には ADR を要する**ことを同ファイルのコメントに明記する。

### [Low] 復元失敗時の退避ファイルが無制限に増え、削除経路が無い (L-004) (scope: feature)

- **観察**: `src/main/infra/settings/folder-store.ts:67-81` / `:148` は、1 件でも復元できないレコードがあると **`load()` のたびに** `workspace-folders.json.<timestamp>.bak` を新規作成する。復元不能なレコードは次回起動時も復元不能なので、**起動ごとに 1 本増える**。削除・保持期限・上限の実装は無い。
- **同種事象探索**: `grep -rn "\.bak\|backup" src/main/infra/settings/` → **5 件** (生成側のみ)。削除経路 `grep -rn "unlink\|rm(" src/` → **0 件** (`scripts/rules/run.mjs:82` の後始末を除く)。
- **リスク/影響**: 書き込み先は `app.getPath('userData')` 配下でアプリ自身の設定領域なので **Principle VI の「永続環境を構築・変更しない」には当たらない** (PB-6 の観点では違反なし)。ただし `~/.closta` 相当の領域にファイルが単調増加し、内容は登録パスと表示名 (秘密値は無い。`fromFolderRecord` の allow-list を確認済み) である。FR-019 は退避を要求するが保持方針を定めていない。
- **推奨アクション**: 「同一内容の退避が既に存在すればスキップ」または「直近 N 本を残す」のいずれかを実装するか、保持方針を spec の `## Assumptions` に `[ASSUMED]` として明記して I-1 以降へ送る。Constitution `## 未解決の Principle 候補` #1 (transcript ミラーの保持期限) と同じ族の問題であり、そちらに合流させてもよい。

## design-gate 指摘の解消判定

| ID | design-gate での指摘 | 判定 | 根拠 |
|---|---|---|---|
| C-001 | `browseDirectory` が返す `PathDTO` の名前空間が未定義で `unc:<D>` → `wsl:<D>` の変換ホップが欠落 | **解消** | `wsl-fs.ts:99-112` が子・親・cwd をすべて `wsl:<D>` の `RuntimePath` として返し (`:102` に「`unc:<D>` を IPC 境界へ出さない」)、UNC 変換は `toUncValue` (`:67-70`) 経由で `runtimePathOps.toUnc` に閉じている。`validate.ts:77-78` が `unc:` を境界で無条件に拒否し、`isValidBrowseTarget` (`:141-162`) は `t.of.namespace === sessionNamespace` の**種別まで完全一致**で照合する (勧告どおり強化された)。`namespace.ts:95-98` に `isSameNamespace` が追加され、`isSameDistro` との使い分けが `verified-running.ts:65-76` / `wsl-fs.ts:36-42` に明記されている。違反サンプル `dto-namespace-swap.ts.fixture` が「境界で `PathDTO.namespace` を付け替える」を typecheck 対象として追加済み (勧告の最終項)。**残る派生は M-002 の 2 箇所のみで、これは名前空間の再 branding ではなく構成/分解の重複である。** |
| H-001 | 実行中確認済みの値の有効期間に上限が無く、SC-005 が検証不能 | **解消 (残余の扱いを明示したうえで)** | (a) 上限値が `verified-running.ts:25` に `BROWSE_SESSION_TTL_MS = 30_000` として数値で入り、`wsl-detector.ts:61` の `PROBE_VERIFICATION_TTL_MS` も同値。(b) 復旧規則が「失敗したら再確認」から「**アクセス前に期限を検査**」へ変わった (`folder-service.ts:276-289` が `browse-session-expired` を返してセッションを破棄、`wsl-fs.ts:43-53` が `checkNotExpired` を `isSameDistro` より先に置く。勧告 (b) の形と一致)。(d) 残余が `verified-running.ts:50-54` と spec.md:551 の `[ASSUMED]` に「SC-005 はアプリ側の発行行為で測る」として明記された。(c) の quickstart 手順は `quickstart.md` を確認した範囲では時間経過ケースが手順化されていないが、残余として承認された範囲に収まる。**ただし H-003 は「アプリが停止を観測した後」の経路であり、この残余の外にある。** |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `grep -n "rules: \[" tests/rule-fixtures/expected.mjs` | 15 (うち `#N` 形式で**構造的に常に真** 7 件 / 8 トークン、規則名の相互充足 8 件、`rules` 無し 3 件) | `expected.mjs:73,81,133,141,149,157,209` (#N) / `:47,57,65,96,104,117,125,172` (規則名) / `:88,164,179` (rules 無し) |
| C-001 | `console.log` が項目見出しを常に印字する箇所 | 1 | `scripts/constitution/check.mjs:539-545` (実測: `node scripts/constitution/check.mjs` の出力に `#1`〜`#11` が全件現れる) |
| C-001 | サンプル単位に検証を分離している箇所 / in-flight 分離 | **0** | `scripts/rules/run.mjs:203-215` が全件一括展開・一括実行 |
| H-001 | 合流機構 `grep -rn "inflight\|inFlight\|pending\b" src/main/app/` | **0** | — |
| H-001 | `await` をまたぐ共有状態の read-modify-write | 7 | `runtime-store.ts:85-92,154-167,195-209` / `folder-service.ts:106-112,120-124,338-360,378-382` |
| H-002 | `grep -n "replace(" src/main/app/runtime-store.ts` | 5 (うち await をまたぐ書き戻し **2**) | `runtime-store.ts:150,163,198,204,209` (await 跨ぎ: `:163`, `:209`) |
| H-002 | module スコープ / グローバルにランタイムを保持する箇所 | **0** | AD-003「シングルトンではない」は守られている |
| H-003 | `grep -rn "verifiedCache" src/main/app/folder-service.ts` | 4 (**無効化 0 件**) | `folder-service.ts:101,121,122,141` |
| H-003 | `folder-service` が `runtimes.onChanged` を購読する箇所 | **0** | 購読者は `src/main/index.ts:66` の renderer 中継のみ |
| H-004 | 走査スコープ外の実行可能ファイル | 7 (うち文書化済み例外 1) | `.github/workflows/verify.yml` / `vitest.config.ts` / `tests/setup/renderer.ts` / `tests/setup/harness.test.ts` / `tests/setup/harness.test.tsx` / `tests/docs/dependency-anchors.test.ts` / `tests/rule-fixtures/expected.mjs` (例外) |
| M-002 | `grep -rn "'wsl:\|\`wsl:" src/ \| grep -v namespace.ts` (実行コードのみ) | 2 | `src/main/app/validate.ts:70` / `src/main/infra/settings/folder-record.ts:130` |
| M-002 | `grep -rn "namespace\.\(slice\|startsWith\|split\|replace\)" src/` | 2 | `validate.ts:70,74` |
| M-002 | `unc:` を実行コードで組み立てる箇所 (namespace.ts 外) | **0** | — |
| M-001 | `grep -rn "function reverse" src/` | 2 | `wsl-detector.ts:301` / `resolution.ts:202` |
| M-001 | 両実装の等価性を固定するテスト | **0** | — |
| M-003 | `grep -rn "normalized.length === 0\|prefix === '/'" src/domain/` | 2 | `prefix-match.ts:38` / `path-mapping.ts:55` |
| M-004 | `grep -rn "process\.platform\|os\.platform\|os\.type\|navigator\.\(platform\|userAgent\)" src/` | 2 (どちらも `platform-ok` 注記あり) | `window.ts:31` (指定形でない) / `index.ts:95` (指定形) |
| M-004 | `PLATFORM_BRANCH_PATTERNS` が `navigator` 系を見る箇所 | **0** | `allowlists.mjs:265-280` |
| L-001 | `grep -rn "default-src" src/ scripts/` | 3 | `protocol.ts` / `protocol.test.ts` / `allowlists.mjs:314`。`src/renderer/index.html` は **0** |
| L-002 | 生成物ディレクトリでの禁止モジュール import | **0** | 境界の穴が実使用されていないことの確認 |
| L-003 | `WSL_ALLOWED_ARGS` のうち未使用 | 8 / 14 | `allowlists.mjs:163-181` vs `wsl-cli.ts:144,148,152,164` |
| L-004 | 退避ファイルの削除経路 `grep -rn "unlink\|rm("` src/ | **0** | 生成のみ `folder-store.ts:148` |

## 観点別の「該当なし」明示 (固有観点 PB-1 〜 PB-7)

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: `folder-record.ts` の JSON 往復は **保たれている**。`fromFolderRecord:136-153` が `{namespace, value}` の形で保存し (素の文字列で保存しない)、`toFolderRecord:68-133` がキー allow-list → 値検証 → `isNamespaceConsistent` → **所在に応じた型の再構成** (`makeHostPath` / `makeRuntimePath`) の順に通す。`app/validate.ts` と `infra/settings/folder-record.ts` が **同じ `isNamespaceConsistent` と同じ `@domain/validation` の上限**を使う点も確認した (片方だけ通る粒度ずれが無い)。残る指摘は名前空間識別子の構成方法の重複 (M-002) のみ。
- **PB-2 (単一インスタンス仮定)**: グローバル / module スコープに「現在のランタイム」を置く実装は **0 件**。キャッシュキーは `NamespaceId` (ディストロ名を含む) で FR-011 を満たす (`runtime-store.ts:48`、`folder-service.ts:101`)。単数形の型 (`theRuntime` 等) は無い。**消えたインスタンスへの参照が残る経路が H-002**。
- **PB-3 (`capabilities` の虚偽表明)**: WSL1 は `fixedCapabilities` (`wsl-detector.ts:206-208`) で `sandbox: 'none'` を表明し、バージョン不明・マッピング欠落・未知の依存名・出力不完全のいずれも `probeFailed()` に倒れる (`:173,179,183,186,198,213`)。`SAFE_SANDBOX_KINDS` は allowlist (`capabilities.ts:72`)、`deriveAutoModeSafe` は `isProbed` を要求 (`:75-90`)。docker endpoint は R-1 に実装が無く `DOCKER_CALLER_MODULES = []` (項目 4 / 5 と整合)。**楽観側に倒れる経路は H-002 の書き戻しのみ**。
- **PB-4 (権限ゲートの迂回)**: R-1 に権限モードの選択 UI / 設定 / CLI 引数は **存在しない** (関連する識別子を `src/` 全体で grep して 0 件)。判定は `isAutoModeAllowed` (`capabilities.ts:160-162`) の `=== true` 1 箇所に集約され、IPC へは `autoModeAllowed` (真偽) と `autoModeStatus` (3 値) を分けて渡し、生の `autoModeSafe` を渡していない (`dto-mapper.ts:15-31`)。renderer は表示に `autoModeStatus` のみ使用 (`RuntimeListScreen.tsx:144`)、`sandboxKind` からの再導出は **0 件**。**該当なし (迂回経路なし)**。プリセット / `forkSession` / セッション再開はいずれも R-1 に無い。
- **PB-5 (多段パス変換の欠落)**: R-1 は 1 ホップ (`host ↔ wsl:<D>`) のみで、`wsl:<D> ↔ unc:<D>` は同一ディストロ内の表現変換である。2 ホップの拡張点は `path-mapping.ts:97-114` の `compose()` として型で表現され、`path-api.test.ts:284` に `host → wsl:Ubuntu → wsl:Debian` の 2 ホップケースがある。往路 `toUnc` (`path-api.ts:137-157`) と復路 `fromUnc` (`:159-170`) は対称で、往路側に share 配下への封じ込め検証 (`outside-share`) が追加されている。**変換段数の欠落は該当なし。** 逆向きマッピングの重複が M-001、境界照合の縮退が M-003。
- **PB-6 (実質的な永続環境の構築)**: `probe-script.ts:38-47` は `command -v` / `test -r` / `cat /proc/*` / `unshare --user --map-root-user true` / `printf` のみで、**リダイレクト 0 件・標準入力の読み取り 0 件・パッケージ導入 0 件・`~/.bashrc` / `/etc` への書き込み 0 件**。`docker volume create` / `--restart` / `commit` / `tag` は実行コード 0 件。ホーム配下への書き込みは `app.getPath('userData')` 配下のみ (`folder-store.ts`)。**該当なし (Principle VI 違反なし)**。検証スコープの穴が H-004、退避ファイルの単調増加が L-004。
- **PB-7 (lint ルール自体の網羅性)**: AD-025 が実測した 5 つの穴はすべて閉じていることを個別に確認した — `checkAllOrigins: true` (`eslint.config.mjs:237`)、解決器が参照先 project を直接指定 (`:180`)、`flagAsExternal.unresolvableAlias: false` (`:214`)、`npmRe` による `node_modules/` 接頭辞 (`.dependency-cruiser.js:65`)、`builtinModules` を正本にした `coreRe` (`:26-29`)。`no-unknown-files` / `no-unknown-dependencies` / `not-to-unresolvable` も error で置かれている。**新規の穴は C-001 (発火確認機構そのもの) / H-004 (走査スコープ) / M-004 後段 (`navigator` 系) / L-001 / L-003**。あわせて 1 点記録: `.dependency-cruiser.js:264` の `doNotFollow: { path: ['node_modules'] }` により、**推移的到達は第一者モジュール内に限られ、第三者パッケージを経由した到達 (`agents → pkg → electron`) は評価されない**。Principle VII の「推移的な到達」の主張はこの範囲に限ることを Verification 側に書き足す価値がある (現在の依存構成では該当 0 件のため findings にはしない)。

## 意図的に報告しなかったもの

- code-gate iteration 1 の MUST_FIX 7 件 (MF-001 〜 MF-007) の箇所。`resolved` とされた箇所を再読して差分の有無だけ確認し、いずれも本 round の観点では新規の穴を作っていない。
- `convention-reviewer` の M-001 (`error-state.tsx` の手編集) — 独立判定の結果、**境界規則は生成物にも掛かり続けており Principle I / VII の穴ではない**と結論した (L-002 に記録)。再生成で prop が消える問題自体は convention の owner。
- `convention-reviewer` の C-002 (`CSP_DECLARATION_EXEMPT_SUFFIXES`) — 実名化に同意するが、境界上の穴ではないため Low とした (L-001)。
- `security-reviewer` owner: `isTrustedSender` / origin 許可集合 / token の senderId 束縛 / `run.mjs` の `shell: true` / CSP の directive 内容。
- `ux-reviewer` / `a11y-reviewer` owner: `useFolders` の reject 受け皿、フォーカス、`ChatScreen` の composer 封鎖。
- `architecture-reviewer` owner: AD-025 §2 の「1 箇所に限る」に `namespaceDistroName()` の export が含まれるかという**文言解釈**、AD-023 §7 の `services` 行 (AD-025 §9 で対象なしと決着済み)、`check:constitution` 項目 5 の `pending` (docker を名指せるモジュールが 0 件 = R-1 の設計どおり。`pending` を `ok` と読み違えていないことを確認した)。
- `SAFE_SANDBOX_KINDS` の `container` 追加条件 (endpoint の到達性検証) — R-1 に該当インスタンスが無く、条件は `capabilities.ts:68-70` に既記載。
- `seccompFilter` が常に `'unknown'` である点 — FR-006 が R-1 の仕様として明記しており、`false` に丸めていないことを確認した (虚偽表明ではない)。

## Verdict

- Critical: **1** (C-001)
- High: **5** (H-001 / H-002 / H-003 / H-004 / M-002)
- Medium: **3** (M-001 / M-003 / M-004)
- Low: **4** (L-001 / L-002 / L-003 / L-004)
- design-gate 指摘の継承: resolved **2** (C-001 / H-001 の両件) / unresolved **0** / new **13**
- **最小修正セット (優先順)**: (1) C-001 の照合を機械可読出力ベースにする + `wsl-args-array` の期待を実態に合わせる、(2) H-001 の in-flight 合流 1 本 + `ensureVerified` の空結果キャッシュ、(3) H-002 の `replace` を「既存キーのみ上書き」+ 世代照合、(4) H-003 の `checkExistence` で `state` を先に見る、(5) H-004 の `SCAN_FILES` / `SCAN_ROOTS` 追加、(6) M-002 の 2 行置換、(7) M-001 の `reverse` 集約。(1)(3)(4)(6) はいずれも数行で、(2) だけが構造変更を伴う。
