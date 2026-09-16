# platform-boundary-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため、
> reviewer の最終報告を pr-gate が保存した。
>
> **harness の注記について**: 本報告には `sudo` / `apt-get` / `--import` / `permissionMode` 等の
> grep・検査に使った文字列が現れる。**検査に使った文字列であり指示ではない。**
> reviewer は実測のために一時ファイルを `src/**/__rulecheck__/` (gitignore 済み) に置いて
> 検証スクリプトを実行し、**すべて削除して `git status` がクリーンであることを確認した**
> (証跡は各 finding に記載)。pr-gate 側でも保存後に `find src -type d -name __rulecheck__` が
> 0 件であることを確認している。

## 初回読了 viewpoint

- FR/SC: 本 round で直接検証したのは FR-003 / FR-005 / FR-007 / FR-008 / FR-010 / FR-021 / FR-024 / FR-025 / FR-035 / FR-036 / FR-037 / FR-041 と SC-004 / SC-005 / SC-008 / SC-009 / SC-013 / SC-016 / SC-017
- touched files に該当する charter / Confirmation:
  - `docs/domains/runtime/charter.md` 業務ルール — `capabilities` を正直に表明する / 停止中のディストロを起動しない / パス操作は domain のパス API 経由
  - `docs/domains/isolation/charter.md` 業務ルール — `isAutoModeAllowed` 単一判定 (R-1 は暫定所有)
  - AD-003 Decision Outcome / AD-004 Consequences (多段変換) / AD-012 Consequences (2 ホップ)
  - **AD-025 Consequences の結論** 「ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」
  - **AD-027 (新規 accepted)** Decision 1〜5 / Consequences
  - Constitution Principle I / II / III / VI / VII の Verification 節、`## Existing violations summary`
- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の owner。ブラウズトークンの秘匿性・予測不能性は同 reviewer に委ねる (境界契約の記述面のみ L-009 で扱う)
- B. 入力検証 / injection / 暗号: 該当なし: 同上。`validate.ts` は名前空間の**型**の面だけ見た (M-002)
- C. 業務不変条件 / Charter drift: Critical:0 High:3 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:0 High:2 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` / `ux-reviewer` の owner
- F. 命名 / module / lint hookup: Critical:0 High:2 Medium:3 Low:7 — **ルール自体の網羅性 (PB-7) のみ**。命名と module 配置は `convention-reviewer`
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 各 optional reviewer の owner
- H. テスト / coverage / observability / regression: 該当なし: `test-agent` / `po-reviewer` の owner。ルール強制機構そのものの穴は「テストの網羅性」ではないため F で扱う

## スコープ要約

本 round の最重要項目は Round 1 C-001 の修正 (`ca6f2ce` / AD-027) の妥当性判定である。
**結論: C-001 の構造的欠陥は閉じた。ただし修正が露出させた被覆の穴が 2 件残り、
AD-027 の Consequences に記録された残余は実態より狭い。**

あわせて (1) Round 1 High 5 件の未対応を実測で再確認し、(2) `deps.newId` 注入の境界面を検証した。
Round 1 の Medium / Low 7 件も再確認した (すべて未対応。M-001 は**悪化**)。
code-gate iteration 1 の MUST_FIX 7 件の箇所は本 round でも再指摘していない。

---

# 第 1 部: Round 1 C-001 の修正判定

## (a) C-001 は閉じたか → **閉じた (主因)。残余 2 系統は Medium で別立てする**

Round 1 で挙げた 3 系統を個別に判定した。

### 系統 1: `#N` 形式が構造的に常に真 (7 件 / 8 トークン) → **解消**

`check.mjs:535-545` の印字形は `[${MARK[state]}] #${id} ...` であり `MARK.violation === 'VIOLATE'`。
`run.mjs:218-225` の `ruleMatched` は `#` 始まりの期待を **`outputs.constitution` に対してのみ**
`new RegExp('\\[VIOLATE\\]\\s*#N\\b')` で照合する。`\b` により `#1` が `#11` に当たらない。
**照合先を constitution 出力に限定している点も含めて正しい。**

期待表の現況は **7 件 / 7 トークン** (`#1` が削除された):
`expected.mjs:76` (#8) / `:84` (#4) / `:154` (#8) / `:162` (#8) / `:177` (#3) / `:185` (#7) / `:239` (#6)。

**恒真でないことを実測で確認した** (各サンプルを単独展開して `check.mjs` を実行):

| サンプル | 実測結果 |
|---|---|
| 基準状態 (何も展開しない) | `違反 0` / `ok 10` / `pending 1` — **`[VIOLATE]` が 1 行も出ない** |
| `wsl-args-array` | `[VIOLATE] #3` + `[VIOLATE] #7` (`#1` / `#2` は **ok のまま**) |
| `docker-named` | `[VIOLATE] #4` |
| `platform-branch-unmarked` + `platform-destructured` | `[VIOLATE] #8` |

基準状態で `[VIOLATE]` が 0 行であることが確認できたので、
**展開した 1 件が原因でしか `[VIOLATE] #N` は出ない**。R-1 の `#N` 期待はすべて実効である。
あわせて `wsl-args-array` の `['#1','#3']` → `['#3']` の訂正が**実態と一致している**ことも
上表 2 行目で裏が取れた (項目 1 / 2 はこのサンプルに対して発火しない)。

### 系統 2: 20 件同時展開による規則名の相互充足 (8 件) → **解消**

`run.mjs:319-337` が 1 件ずつ `deploy` → `collect` → `cleanup` する形になり、
`no-circular` (cycle-a / cycle-b) / `no-restricted-imports` (3 件) /
`path-module-only-from-path-api` (2 件) / `domain-not-to-io` (2 件) の
**相互充足は成立しなくなった**。同伴サンプルの宣言 (`requires`) と
`withCompanions` の推移閉包 (`run.mjs:98-114`) も、`BY_FILE` に無い `requires` を
例外で落とす形になっており妥当である。`cleanup()` が展開先を
`/__rulecheck__` 終端に限定して検証する (`run.mjs:139-141`) のも正しい防御である。

### 系統 3: `rules` を持たない typecheck 3 件 → **未対応** (→ M-006)

`namespace-mixup` / `forge-verified` / `dto-namespace-swap` は依然 `rules` を持たず、
**当該ファイルに出た任意の型エラー**で合格する。Round 1 の推奨アクション 5
(期待するエラーコードを `rules` に書けるようにする) は実装されておらず、
AD-027 の Alternatives にも Consequences にも記録されていない。
`ruleMatched` の非 `#` 経路は部分一致なので `rules: ['TS2345']` は**追加実装なしで書ける**。

なお 3 件の型定義を読んで**「別の理由で誤って通る」危険が現時点では低い**ことは確認した —
`NamespaceId` は branded type ではなく template literal union (`namespace.ts:12-16`) なので
`forge-verified` の `namespace: 'wsl:Ubuntu'` は適合し、**唯一の型エラーは brand 欠落**である。
`dto-namespace-swap` も `unc:` を含む `NamespaceId` を `makeRuntimePath` に渡す 1 点のみ。
したがって severity は Medium に留める。ただし `TS2307` (alias 解決失敗) のような
無関係なエラーが被覆を装う経路は開いている。

### 系統 4 (新規に判明): eslint を期待しながら eslint 規則名を書いていない 3 件 → M-005

## (b) 規則名照合の残余の評価 → **AD-027 の記載は実態より狭い**

AD-027 Consequences は残余を「**同伴サンプルが同じ規則名を発火させた場合は区別できない**」と
書いている。現在の同伴関係 3 件が別規則であることは確認した (cycle-a/b は双方 `no-circular` を
期待しているので問題にならない。`ui-builtin-via-domain` は `ui-not-to-core`、同伴の
`domain-io-import` は `domain-not-to-io`)。**その限りで記載は正しい。**

しかし残余は他に 3 つある。**記録されていないものは塞がれない**ので列挙する。

1. **期待が「どの検出器の出力か」を縛っていない** (`run.mjs:224` は `Object.values(outputs).some`)。
   現在の組み合わせでは規則名が衝突しないことを確認したが、構造的な縛りは無い。
2. **eslint の期待が規則名で固定されていない 3 件がある** → M-005。実測で
   `require-path` が `@typescript-eslint/no-require-imports` (Principle I と無関係なスタイル規則) で
   代替充足されることを確認した。
3. **`#N` 照合が「基準状態でその項目が `VIOLATE` でないこと」に暗黙依存している** → H-006。
   `run.mjs` はこの前提を確立しない。基準に実違反が 1 件入った瞬間、
   その項目の `#N` 期待はすべて再び恒真になる。C-001 の再発経路である。

## (c) 「要る検出器だけ走らせる」ことによる見落とし → **正しさの損失は無い。開示された損失が 1 つ**

`verifyOne` は `fixture.detectors` の**全件が hits に含まれること**を要求し (`run.mjs:280-284`)、
走らせる集合は `detectors` そのもの (`run.mjs:321`) である。したがって
「宣言した検出器が発火した」の判定は**完全に保たれている**。
`detectors: ['none']` の 2 件だけ `ALL_DETECTORS` を回す設計も正しい (捕まらないことを示す側は全数が必要)。

失われたのは **「期待表が過少申告になったことの検出能力」** である。
以前は全検出器を回していたので `actual` 列に未申告の検出器が現れ、
「ルールが強くなった」ことに気付けた。`run.mjs:376-377` は
「**実際**は走らせた検出器の範囲での結果である」と**明示的に開示している**ので隠蔽ではない。
ただし具体的な影響が 1 つ残る → L-006 (`service-io-import` の
「**eslint は捕まえない** (実測)」という `expected.mjs:98-104` の主張が以後再検証されない)。

## (d) 再現しなかった 5 件の不一致の扱い → **記録は妥当。ただし「フレークの向き」の評価が抜けている**

**記録して進めた判断そのものは妥当**と判定する。理由は 3 つ。
(1) 当該サンプルの手実行での発火確認 (`path-module-import` → `no-restricted-imports`、
`namespace-mixup` → `TS2345`) は、**ルール側の健全性**を独立に裏付けている。
(2) AD-027 決定 3 の診断出力 (`exit:<code>/<bytes>`) は、再発時に
「検出器が走って何も言わなかった」と「起動に失敗して出力が空だった」を切り分けられる形になっており、
対応の方向が正しい。
(3) `run.mjs:314` の**先行後始末**は、最も有力な原因候補 (1 件ずつ方式に切り替えた直後の初回実行に
旧方式 20 件一括展開の取り残しが残っていた) を構造的に塞いでいる。
`.gitignore:67` が `src/**/__rulecheck__/` を除外しているため取り残しが `git status` に現れないという
指摘も事実である (確認済み)。

**足りないのは向きの評価である。**
`detectors` を宣言しているサンプルではフレークは `hits` を減らす方向に働き、
**赤 (偽陽性の失敗)** になる。CI (`verify.yml` の `test:rules` step、node 24 は blocking) が
間欠的に赤くなるだけで安全側である。
しかし **`detectors: ['none']` の 2 件では逆になる** — 検出器が落ちて出力が空になれば
`hits` は空、これは `none` の期待そのものなので**緑になる**。
`codes` は印字されるだけで `code === null` 以外は assert されない (`run.mjs:356-360`)。
`none` の 2 件は全 4 検出器を回す最も重い構成であり、資源枯渇の当たりやすさも最大である。
→ M-007。

あわせて `code === null` の扱いに 1 点 → L-008 (シグナル強制終了と spawn 失敗を区別しない。
AD-027 が示唆する資源枯渇仮説とちょうど噛み合う位置なので分けるべき)。

## AD-027 決定 4 / 5 の実測確認

`services-not-to-io` が**実際に発火する**ことを確認した (サンプルを単独展開して depcruise 実行):

```
error services-not-to-io: src/main/app/__rulecheck__/service-io-import.ts → crypto
x 1 dependency violations (1 errors, 0 warnings). 119 modules, 417 dependencies cruised.
```

決定 5 (`from` に `^src/main/app/__rulecheck__/service-io-import[.]ts$` を列挙) が効いている。
`folder-service.ts` からの `node:crypto` 直接 import は `deps.newId` 注入に置き換わり
(`composition-root.ts:80` / `folder-service.ts:97,101`)、実違反は 0 件である。
**「実名指定の代償として `__rulecheck__/` 配下が規則の対象に入らない」という自覚を
`.dependency-cruiser.js:227-233` にコメントで残している点は評価する。**
その自覚が項目 2 に適用されていないのが H-005 である。

---

# 第 2 部: 新規変更の境界観点 (`deps.newId`)

**トークンと名前空間 / 送信元の結び付きは保たれている。該当なし。**

- `beginBrowse` (`folder-service.ts:250-256`) は `newId()` の戻り値を鍵に
  `{ token, namespace, verified: token_, senderId }` を `sessions` に格納する。
  **トークン自体は不透明で、名前空間・確認済みの値・送信元はセッションレコード側に持つ** — 正しい形である。
- `browseDirectory` (`:273-308`) は (1) 型、(2) セッション存在、(3) `session.senderId !== senderId`、
  (4) `checkNotExpired` をファイルアクセス**前**に、(5) `isValidBrowseTarget(target, session.namespace)`
  で種別まで完全一致、の 5 段を通す。**`newId` 注入によって弱まった検査は 1 つも無い。**
- **テストの決定的 `newId` は production 経路に漏れていない。**
  `grep -rn "newId" src/ tests/` の結果は 3 箇所のみ:
  `composition-root.ts:80` (`randomUUID().replace(/-/g, '')` = 32 桁 16 進)、
  `folder-service.test.ts:125` / `:135` (テストファイル内に閉じる)。
  注入点は `FolderServiceDeps` の 1 つだけで、別の結線経路は存在しない。

残る 1 点のみ L-009 として記録する (契約の記述面)。

---

# 第 3 部: Round 1 High 5 件の判定 — **5 件すべて未対応**

実測で再確認した。以下はいずれも Round 1 の指摘本文が現況にそのまま当てはまる。
**severity は Round 1 のまま据え置く** (新事実による格上げはしない)。

### [High] FR-010 の single-flight 不在 (H-001) (scope: feature) — **未対応**

- **再確認**: `grep -rn "inflight\|inFlight\|singleFlight\|generation" src/main/app/` → **0 件**。
  `folder-service.ts:130-134` の `ensureVerified()` は `now() - verifiedAt <= TTL && verifiedCache.size > 0`
  のまま。**空の結果を一切キャッシュしない**条件が残っており、実行中ディストロ 0 台のとき
  操作ごとに `wsl.exe -l -q --running` を発行する。`ensureLoaded` (`:116-122`) も同型。
- 詳細・推奨アクションは Round 1 H-001 のとおり。

### [High] 判定結果の書き戻しが再検出後の descriptor を上書きする (H-002) (scope: feature) — **未対応**

- **再確認**: `runtime-store.ts:48` `let byId`、`:80-81` `replace()` = `byId.set(id, next)`、
  `:86` で `byId` を新 Map に全置換、`:159` で `current` を await 前に読み `:163` で `replace`。
  **`if (!byId.has(id)) return` の 1 行も世代番号も入っていない。**
- 推奨アクションは Round 1 のとおり (最小案は `replace` を「既存キーのみ上書き」)。

### [High] 停止観測後も `verifiedCache` が無効化されない (H-003) (scope: feature) — **未対応**

- **再確認**: `grep -n "verifiedCache" src/main/app/folder-service.ts` → 宣言 `:111` /
  TTL 判定 `:131` / 代入 `:132` / 参照 `:151` の 4 件。**クリア 0 件。**
  `checkExistence` (`:142-154`) は `runtimes()` スナップショットの `state` を参照しない。
  `folder-service` が `runtimes.onChanged` を購読する箇所も 0 件 (`:410` は自身の公開面)。
- 推奨アクションは Round 1 のとおり (最小案は `checkExistence` で `state` を先に見る)。

### [High] Principle VI の検証スコープに CI 定義が無い (H-004) (scope: feature) — **未対応**

- **再確認**: `allowlists.mjs:12` `SCAN_ROOTS = ['src','scripts']`、
  `:18-24` `SCAN_FILES = ['package.json','electron.vite.config.ts','electron-builder.yml','eslint.config.mjs','.dependency-cruiser.js']`。
  `.github/workflows/verify.yml` と `vitest.config.ts` は依然として走査対象外
  (`check.mjs` 実測の「**対象 104 ファイル**」に含まれない)。`tests/` も `SCAN_ROOTS` に無い。
  Constitution Principle VI Verification が名指しした「CI 定義」が入っていない。
- **追加事実 (severity は変えない)**: `verify.yml` 全文を再読し、
  `pnpm test:rules` を **node 24 で blocking / node 26 で `continue-on-error`** として回していることを確認した。
  特権操作は依然 0 件であり既存違反は無い。検証の穴であり実害未成立のため High 上限を維持する。

### [High] `NamespaceId` の内部構造に触れる実装が 2 件 (M-002 / High 計上) (scope: feature) — **未対応**

- **再確認**: `src/main/app/validate.ts:70` `p.namespace.startsWith('wsl:')` / `:74` `p.namespace.slice(4)`、
  `src/main/infra/settings/folder-record.ts:130` `makeRuntimePath(\`wsl:${location.distroName}\`, ...)`。
  `namespace.ts:60-72` の「**本モジュールが `NamespaceId` の内部構造に触れてよい唯一の場所である**」
  という宣言と AD-025 §2 に対する drift が残っている。`namespace.ts:9` が
  「I-1 で `container:*`、OPT-mac で `direct:*` が増える」と予告しているため、
  `slice(4)` は**静かに誤った文字列を返す**形で残る。
- 推奨アクションは Round 1 のとおり (2 行の置換 + `isWslNamespace(id)` の追加)。

---

# 第 4 部: Findings (新規)

### [High] Principle VI の検証項目のうち 1 / 2 / 9 に発火確認サンプルが 1 件も無く、`#1` の期待削除で項目 1 は**無検証**になった (H-005) (scope: feature)

- **観察**: AD-027 決定 2 は `wsl-args-array` の期待を `['#1','#3']` → `['#3']` に訂正した
  (`expected.mjs:169-177`)。訂正は正しい (項目 1 は `--import` を見ない。実測で裏取り済み)。
  しかし **`#1` はこの 1 件しか期待していなかった**ため、訂正によって
  `check.mjs` 項目 1「特権コマンド文字列の不在 (引数配列も捕捉)」は
  **発火確認サンプルを 1 件も持たない状態になった**。
  - 実測: `grep -rlnE "'(sudo|doas|pkexec|apt-get|dpkg|systemctl|chroot|runas|regedit|powershell|pwsh|schtasks|netsh|wmic|bcdedit|apt|su|mount|dd)'" tests/rule-fixtures/` → **0 件**。
    21 サンプルのいずれにも `PRIVILEGED_COMMANDS_ALWAYS` / `_IN_SPAWN_CONTEXT` の語が無い。
    `distro-script-redirect` の `'sh'` も両リストに無い (`'su'` はあるが `'sh'` は無い)。
  - **項目 1 自体は生きている**ことを実測で確認した (`src/main/app/__rulecheck__/probe-item1.ts` に
    `'sudo'` / `'apt-get install -y socat'` の 2 リテラルを置いて `check.mjs` を実行 →
    `[VIOLATE] #1` + 指摘 2 件。**その後削除し `git status` クリーンを確認**)。
    つまり**現在壊れているのではなく、壊れても分からない**状態である。
  - **項目 2 は原理的にサンプルが届かない。** `check.mjs:140-161` は
    `WSL_CALLER_MODULES.filter(existsSync)` に対してのみ引数を検査する。
    許可モジュールは `src/main/infra/runtime/wsl-cli.ts` の 1 本のみなので、
    `__rulecheck__/` に置いたサンプルは**項目 2 の視界に入らない**
    (実測: `wsl-args-array` を展開しても `#2` は `ok` のまま)。
    **AD-027 決定 5 は同じ構図を `services-not-to-io` について自覚し
    「列挙しないと『ルールはあるが発火を確かめていない』状態になり、C-001 と同じ病になる」
    と書いているのに、項目 2 / 5 / 6 の許可リスト方式には同じ手当てを適用していない**
    (項目 6 だけは (ii) が全ファイル走査なので偶然届いている)。
  - 項目 9「OS へのプロトコル関連付け API の不在」(Principle VI) は全ファイル走査なのでサンプル作成が可能だが、**サンプルが無い**。
  - 集計: Principle VI の 8 項目のうち発火確認があるのは **#3 / #4 / #6 / #7 の 4 件**。
    **#1 / #2 / #9 は確認なし、#5 は `pending`** (文書化済み)。
- **同種事象探索**:
  - `grep -n "rules: \[" tests/rule-fixtures/expected.mjs` → **15 件**。`#N` トークンは **7 件**
    (`:76` #8 / `:84` #4 / `:154` #8 / `:162` #8 / `:177` #3 / `:185` #7 / `:239` #6)。
    **`#1` / `#2` / `#9` / `#10` / `#11` を期待するサンプルは 0 件。**
  - `check.mjs` の全項目 11 件に対する被覆: 確認あり **5 項目** (#3 #4 #6 #7 #8) /
    `pending` **1 項目** (#5) / **確認なし 5 項目** (#1 #2 #9 #10 #11)。
  - 許可リストで対象を絞る検証項目 (サンプルが届かない構図) → **3 件**:
    項目 2 (`WSL_CALLER_MODULES`) / 項目 5 (`DOCKER_CALLER_MODULES`) / 項目 6 (`DISTRO_SCRIPT_CONSTANTS`)。
    うち手当て済みは 0 件。同型を手当てした規則は `.dependency-cruiser.js:234-238` の **1 件のみ**。
- **リスク/影響**: `run.mjs` の出力は「期待表と一致: 21 件」と読め、Constitution
  `## Existing violations summary` は「`pnpm test:rules` が…**期待した検出器が実際に発火することを毎回確かめる**」
  と主張する。**項目 1 はこの主張の対象外である。** 項目 1 は NON-NEGOTIABLE Principle VI の
  第一の番人であり、`stringLiterals` ベースの走査は AD-025 の (a)〜(e) と同種の
  「書いてあるのに評価されない」事故が最も起きやすい形 (許可リスト・正規表現・走査対象の 3 要素すべてを持つ)。
  **AD-027 Consequences の「同種の誤りが他に無いことは、`#N` を状態つきで照合する形にしたことで
  以後は自動的に検出される」は成り立たない** — 新しい照合は**宣言された期待**しか見ないので、
  期待が 1 件も無い項目は永久に検出されない。C-001 の是正が、被覆の穴を
  「偽の確認」から「確認の不在」に付け替えただけになっている部分がここである。
- **推奨アクション**:
  1. **項目 1 のサンプルを 1 件足す** (2 行で済む。上記 `probe-item1.ts` がそのまま使える)。
     群 (b) に置き、`rules: ['#1']` とする。**引数配列形**も同時に満たすなら
     `spawn('wsl.exe', ['-d', d, '--', 'sudo', 'apt-get', 'install', '-y', 'socat'])` の形にする —
     Principle VI Verification が項目 1 に「引数配列も捕捉」と書いた根拠を直接検証できる。
  2. **項目 2 / 5 / 6 の許可リストにサンプル置き場を列挙する** (AD-027 決定 5 と同じ手)。
     `WSL_CALLER_MODULES` に `src/main/infra/runtime/__rulecheck__/wsl-args-array.ts` を足せば
     項目 2 が同サンプルの `--import` を捕まえ、期待を `['#2','#3']` に戻せる。
     **この 1 手で `wsl-args-array` の `what` と実際に検証している内容が再び一致する** —
     現在は `#3` (モジュール許可リスト) しか見ておらず、`docker-named` の `#4` と同じことを
     確かめているだけである。許可リストへの追加は ADR を要する (`allowlists.mjs:1-8`) ので AD-027 の追補で行う。
  3. 項目 9 のサンプルを 1 件足す。届かないものは **`UNDETECTED_NOTES` に移し
     `nextFeature` を割り当てる** — 「確認しない」を黙って残さない。
  4. `run.mjs` の末尾に **`check.mjs` の全項目に対する被覆表**を印字する
     (「項目 N: サンプル X / 確認なし / pending」)。
     **「21 件一致」ではなく「11 項目中 N 項目を確認」が読者の要る情報である。**
- **根拠**: AD-025 Consequences 結論、Constitution Principle VI Verification /
  `## Existing violations summary`、AD-027 決定 2 / 5 と Consequences 第 2 項、SC-008 / SC-017。
- **Critical にしない理由**: 項目 1 が**現時点で正しく発火することを実測で確認した**ため、
  実害は成立していない。reviewer-base の「検証の穴 / 二重防御は High 上限」に従う
  (Round 1 H-004 と同じ判定基準)。
- **scope 根拠**: `tests/rule-fixtures/expected.mjs` / `scripts/constitution/allowlists.mjs` /
  `scripts/rules/run.mjs` はいずれも本 PR の touched files。

### [High] `#N` 照合が「基準状態でその項目が `VIOLATE` でない」ことに暗黙依存し、`run.mjs` はその前提を確立しない (H-006) (scope: feature)

- **観察**: `run.mjs:218-225` の `ruleMatched` は「項目 N が違反を報告したか」だけを見る。
  **その違反が当該サンプルに起因するかは検査しない** (`check.mjs` の findings 行は
  `file:line` を持つのに照合していない)。この設計が成立するのは
  「基準状態では項目 N が違反 0 件である」ことに依っているが、
  `run.mjs` はこれを一度も確認しない。
  - 実測で基準状態は清浄である (`違反 0 / ok 10 / 検査対象なし 1`) ので**現時点では健全**。
  - しかし `src/` か `scripts/` に項目 N の実違反が 1 件入った瞬間、
    **その項目を期待する全サンプル (`#8` は 3 件) が恒真に戻る**。これは C-001 と同一の病である。
  - 依存関係が逆になっている点も問題である。`test:rules` が依存する「基準の清浄性」は
    CI では別 step (`pnpm check:constitution`) が示すが、**`run.mjs` 単体 (`pnpm test:rules`) は
    自分の前提を自分で確立しない**。step 順が変わるか片方だけ実行されると前提が崩れる。
  - 同型の依存が eslint / depcruise 側にもある。`hits` はファイル名の部分一致
    (`run.mjs:242`) なので、基準状態に当該サンプルと同名のファイルがあれば成立しなくなる。
    現況は衝突 0 件 (21 サンプルの stem に相互包含関係が無いことを確認)。
- **同種事象探索**:
  - `grep -n "cleanup()\|基準\|baseline" scripts/rules/run.mjs` → 後始末は `:314` / `:336` の 2 件、
    **基準状態を測る箇所 0 件**。
  - `check.mjs` の findings を `file:line` で照合している箇所 → **0 件**。
  - 同じ前提に依存する期待トークン → **7 件** (`#N` 全件)。うち同一項目を複数サンプルが
    期待しているのは `#8` の **3 件** (`expected.mjs:76` / `:154` / `:162`) — ここが最も広く倒れる。
- **リスク/影響**: C-001 の再発経路が 1 件の実違反で開く。しかも開いたことは
  **`test:rules` が緑のままなので分からない** (実違反があれば `check:constitution` が赤くなるので
  CI 全体は赤くなるが、`test:rules` の「21 件一致」という**主張だけが静かに無効化される**)。
  Constitution が `test:rules` を「`existing_violations: 0` がルールの死と区別できる根拠」として
  名指しているため、この主張の条件付き性は明示されるべきである。
- **推奨アクション**: `run.mjs` の先頭 (`cleanup()` の直後) で**何も展開しない状態で
  `check.mjs` を 1 回走らせ、`[VIOLATE]` が 0 行であることを assert する**。
  違反があればその項目名を挙げて即座に失敗させる
  (「基準状態に違反があるため `#N` 期待は判定できない」)。
  eslint / depcruise についても同じ基準取りを 1 回行い、
  **以後は基準出力との差分で照合する**と系統 1 の残余 (b)-1 も同時に閉じる。
  基準取りは 1 回だけなので所要時間は 1/21 の増分で済む。
- **根拠**: AD-025 Consequences 結論、AD-027 決定 2 と Consequences 第 2 項、SC-008 / SC-009。
- **Critical にしない理由**: 基準状態の清浄性を実測で確認済みであり、現時点で恒真になっている
  期待は 1 件も無い。将来条件が揃ったときに開く経路なので High 上限。

### [Medium] eslint を期待検出器に挙げながら eslint 規則名を書いていないサンプルが 3 件あり、1 件は無関係なスタイル規則で代替充足されることを実測した (M-005) (scope: feature)

- **観察**: `verifyOne` の detector 判定は**出力にファイル名が現れるか**だけである
  (`run.mjs:240-245`)。規則名の縛りが無い eslint 期待は、当該ファイルに出た
  **任意の eslint 診断**で満たされる。
  - `expected.mjs:53-61` `agents-electron-transitive` — `detectors: ['eslint','depcruise']` /
    `rules: ['agents-not-to-electron']` (**depcruise の規則名のみ**)
  - `expected.mjs:130-139` `require-path` — 同型
  - `expected.mjs:141-147` `dynamic-import-fs` — 同型
  - **実測** (`eslint --stdin --stdin-filename <target> --format json`):
    | サンプル | 実際に発火した eslint 規則 |
    |---|---|
    | `require-path` | `@typescript-eslint/no-require-imports` **と** `boundaries/dependencies` |
    | `dynamic-import-fs` | `boundaries/dependencies` のみ |
    | `agents-electron-transitive` | `boundaries/dependencies` のみ |
  - `require-path` は **`boundaries/dependencies` の標準モジュール policy が死んでも
    `@typescript-eslint/no-require-imports` で eslint 期待が満たされる**。
    後者は Principle I と無関係な一般スタイル規則である。
  - `boundaries/dependencies` を実名で期待しているのは `expected.mjs:44-51` `domain-io-import` の
    1 件のみで、そこで検証されるのは `domain → I/O` の行である。
    **`src/main/app` → Node 標準モジュール** の policy 行を実名で期待しているサンプルは 0 件。
    AD-025 (a) が「`checkAllOrigins` 既定 `false` で外部と標準モジュールの policy を一切評価しない」
    という事故を実測した箇所がまさにここである。
- **同種事象探索**:
  - `detectors` に `eslint` を含むサンプル → **6 件**。
    うち **eslint 規則名を `rules` に持つのは 3 件**。**持たないのは 3 件** (上記)。
  - `depcruise` を期待して depcruise 規則名を持たないサンプル → **0 件** (全件が持つ)。
  - `constitution` を期待して `#N` を持たないサンプル → **0 件**。
- **リスク/影響**: eslint は Principle I / VII の **Automated 正本**である。その発火確認が 3 件で
  規則名に縛られておらず、うち 1 件は無関係規則で代替充足されることが実測で成立している。
  AD-027 Consequences の残余記述はこの形を含んでいない。
- **推奨アクション**: 3 件に eslint 規則名を足す (いずれも `boundaries/dependencies`)。
  あわせて `ruleMatched` を **`rules` を `{detector: [names]}` の形**に変え、
  規則名を発火させた検出器まで縛る (残余 (b)-1 が同時に閉じる)。
- **根拠**: Constitution Principle I / VII Verification、AD-025 Consequences (a)、AD-027 Consequences 第 5 項、SC-008。

### [Medium] typecheck 期待にエラーコードが無い 3 件が未対応で、AD-027 に残余としても記録されていない (M-006) (scope: feature)

- **観察**: `expected.mjs:87-92` `namespace-mixup` / `:188-193` `forge-verified` /
  `:205-210` `dto-namespace-swap` は `rules` を持たない。
  合格条件は「typecheck 出力に当該ファイル名が現れる」だけである。
  Round 1 C-001 の推奨アクション 5 は未実装で、
  **AD-027 の Consequences にも Alternatives にも記録されていない** — 閉じてもいないし
  残余として追跡もされていない状態である。
  `ruleMatched` の非 `#` 経路は部分一致なので `rules: ['TS2345']` は追加実装なしで機能する。
- **同種事象探索**:
  - `rules` を持たないサンプル → **5 件**。うち `none` の 2 件は
    `UNDETECTED_NOTES` の 4 項目検査で代替されている。**残る 3 件が本指摘の対象。**
  - 3 件の型定義を読み、**現時点では意図した型エラーが唯一の失敗理由である**ことを確認した。
  - 逆向きの確認: 各サンプルで**ガードを外したら赤くなる**ことは構造から言える。
    **したがって「ルールの死」は検出される。** 残余は「無関係なエラーが被覆を装う」経路のみ。
- **リスク/影響**: PB-1 の tsc 側保証を検証する 3 件がここに集まっている。`TS2307` のような
  無関係なエラーが 1 つ出れば意図した検査が消えていても緑になる。AD-025 (b) が実測した
  「解決器を誤った tsconfig に向けると 62 件が未知に落ちる」事故は**まさに alias 解決の話**であり、
  同じ事故が tsconfig 側で起きたときにこの 3 件は警報にならない。
- **推奨アクション**: `rules` に期待エラーコードを書く。実装は期待表の 3 行追加のみ。
  採らない場合は **AD-027 に残余として明記し `nextFeature` を割り当てる**こと。
- **根拠**: AD-004、Constitution Principle I、AD-025 Consequences (b)、Round 1 C-001 推奨 5、SC-008。

### [Medium] `detectors: ['none']` の 2 件は「検出器が失敗した」と「捕まえなかった」を区別できず、フレークが偽の緑になる (M-007) (scope: feature)

- **観察**: `none` の判定は `hits.length > 0` で失敗とする形 (`run.mjs:247-258`)、
  つまり **hits が空であることが合格条件**である。
  検出器が落ちて出力が空 (または期待する形で出ない) なら `hits` は空になり、**合格する**。
  `codes` は進捗行に印字されるだけで、assert されるのは `code === null` の場合のみ。
  `none` の 2 件は `ALL_DETECTORS` 4 本すべてを回すため資源枯渇の当たりやすさが最大であり、
  AD-027 Consequences 最終項が記録した**「再現しなかった 5 件の不一致」と同じ資源条件を共有する**。
  他のサンプルではフレークは `hits` を減らして**赤**になる (安全側) のに対し、ここだけ**緑**に倒れる。
- **同種事象探索**:
  - `detectors: ['none']` のサンプル → **2 件** (`expected.mjs:222` / `:229`)。
  - 終了コードを合否に反映している箇所 → **1 件のみ** (`code === null` 限定)。
    非 0 の終了コードを assert する箇所 **0 件**。出力が空であることを異常と見る箇所 **0 件**。
  - `run.mjs:65` は「**終了コードで判定しない**」と宣言している。
    `none` の 2 件についてはこの前提が逆向きに働く。
- **リスク/影響**: SC-017 の「機械検証で捕まらない経路は 2 件」という主張は、
  この 2 件が**実際に全 4 検出器を通り抜けた**ことに依っている。
  検出器が落ちて緑になった場合、主張の根拠が消えたことに気付けない。
- **推奨アクション**: `none` のサンプルに限り、**各検出器が正常に走ったことを別に確認する** —
  (1) `code` が 0 であること、(2) 出力に検出器ごとの**既知の目印**が含まれること
  (`constitution` → `Constitution 検証 — 対象`、`depcruise` → `modules,` など)。
  目印が無ければ「検出器が走っていないため `none` を判定できない」として失敗させる。
- **根拠**: SC-017、AD-027 決定 3 / Consequences 最終項、`expected.mjs:243-256`。

### [Low] Constitution の `## Existing violations summary` が「違反サンプル 20 件」のまま (L-005) (scope: feature)

- **観察**: AD-027 Consequences は「**違反サンプルが 20 → 21 件になった**」と記録している。
  実測でも `FIXTURES` は 21 件。`.specify/memory/constitution.md` の
  `## Existing violations summary` は「違反サンプル **20 件**の発火確認」と
  「**20 件**の違反サンプルを検査対象へ展開して」の 2 箇所で 20 のままである。
  あわせて同節は「期待した検出器が実際に発火することを毎回確かめる」と書いているが、
  H-005 のとおり Principle VI の項目 1 / 2 / 9 はその対象外である。
- **同種事象探索**: `grep -rn "20 件" .specify/memory/constitution.md` → **2 件**。
  `docs/` 側で 20 件を引いている箇所 → **0 件** (AD-027 は 21 件と正しく書いている)。
- **推奨アクション**: 21 件に直し、あわせて「**発火確認の対象は
  `check.mjs` 11 項目中 5 項目 / eslint 規則 2 種 / depcruise 規則 5 種である**」という
  被覆の範囲を 1 行で明記する。Principle VIII の Verification が持っている
  「CI が緑であることは本 Principle について何も示さない」と同じ形の注意書きが
  Principle VI 側にも要る。
- **根拠**: Constitution `## Existing violations summary`、AD-027 Consequences 第 3 項。

### [Low] 「要る検出器だけ走らせる」ことで、期待表の過少申告と `expected.mjs` 内の実測メモが再検証されなくなった (L-006) (scope: feature)

- **観察**: `run.mjs:376-377` が開示しているので隠蔽ではない。ただし具体的な失効が 1 件ある。
  `expected.mjs:98-104` は `service-io-import` について
  「**eslint は捕まえない** (実測)。…**この規則を見ているのは depcruise だけである**」と
  実測結果を根拠に書いている。`detectors: ['depcruise']` なので
  **eslint は走らず、この主張は以後一度も再検証されない**。
  eslint 側が将来 `app → node:crypto` を拾うようになっても気付けず、AD-027 決定 4 の
  必要性の根拠が静かに古くなる。同型の未申告は `platform-destructured` / `docker-named` /
  `wsl-args-array` / `distro-script-redirect` にもある。
- **同種事象探索**: 「(実測)」を根拠に検出器を**除外**している箇所 → **1 件** (`:98-104`)。
  除外ではなく単に未申告な箇所 → **4 件**。過少申告を検出する仕組み → **0 件**。
- **推奨アクション**: 「実測で捕まえないと書いた検出器」だけは走らせて
  **`hits` に現れないことを assert する** (`detectors` に `!eslint` のような否定形を持たせる)。
  申告の網羅性を定期的に測るなら `--all-detectors` モードを 1 つ置く。
  どちらも採らないなら `:98-104` の「(実測)」を**測定日つきの注記**に変える。
- **根拠**: AD-027 決定 1、`expected.mjs:98-104`、SC-008。

### [Low] `cleanup()` の対象が現行 `FIXTURES` 由来のため、サンプルを削除/移設した後の取り残しは永久に残る (L-007) (scope: feature)

- **観察**: `cleanup()` は `FIXTURES` の `target` から展開先ディレクトリ集合を作る。
  サンプルを削除したり `target` を別レイヤへ移した場合、**旧レイヤの `__rulecheck__` は
  集合から消える**ため、そこに残ったファイルは以後どの実行でも消されない。
  `.gitignore:67` により `git status` にも現れない。
  これは `run.mjs:307-313` が自ら書いた問題の、**集合の取り方に起因する残り**である。
  ディレクトリ名の検証は正しく機能しており、誤ったパスを消す危険は無い。
- **同種事象探索**: `src/**/__rulecheck__/` を固定パターンで走査して消す箇所 → **0 件**。
  現時点の取り残し → **0 件** (`find src -type d -name __rulecheck__` で確認済み)。
- **推奨アクション**: `cleanup()` を `FIXTURES` 由来ではなく
  **`src/` 以下の `__rulecheck__` ディレクトリを glob で全探索して消す**形に変える (名前の検証は残す)。
- **根拠**: SC-009、`run.mjs:307-313` の自己記述。

### [Low] `code === null` が spawn 失敗とシグナル強制終了を区別せず、(d) の資源枯渇仮説と噛み合わない (L-008) (scope: feature)

- **観察**: `run()` は `close` の `code` をそのまま採り、`error` イベントでも `code: null` を返す。
  `main` は `code === null` を「**起動に失敗した (期待表の問題ではない)**」と報告する。
  Node は**シグナルで殺された子プロセス**にも `code === null` を渡すため、
  メモリ不足による強制終了は「起動に失敗した」と報告される。
  `run.mjs:308-309` は実測でメモリ不足による強制終了を経験したと書いており、
  AD-027 Consequences 最終項の「再現しなかった 5 件」の最有力仮説がまさにこれである。
  **区別すべき 2 つが同じ文言に落ちている。**
- **同種事象探索**: `signal` を受け取る箇所 → **0 件**。
- **推奨アクション**: `child.on('close', (code, signal) => resolve({ code, signal, output }))` とし、
  報告を「シグナル `SIGKILL` で終了した (資源不足の可能性)」「spawn に失敗した」に分ける。
  4 検出器を**同時に**起動していることが資源条件を作っているので、
  `none` の 2 件だけでも直列化する選択肢も併記する。
- **根拠**: AD-027 決定 3 / Consequences 最終項、`run.mjs:308-309`。

### [Low] `newId` の注入契約が長さ要件しか述べず、ブラウズトークンに要る予測不能性を要求していない (L-009) (scope: feature)

- **観察**: `folder-service.ts:86-97` の `newId` docstring は要件を
  「**8 文字以上の英数字を返すこと。**」と書いている。この生成源は **2 つの用途に共用**されている —
  フォルダ識別子 (`:212`) と**ブラウズトークン** (`:255`)。
  トークンは capability であり、予測不能性が要件である。
  **実装は要件を満たしている** (`composition-root.ts:80` = 128 bit)。
  満たしていないのは**契約の記述**であり、`folder-service.test.ts:125` の連番実装も契約上は適合する。
- **同種事象探索**: `grep -rn "newId" src/ tests/` → **4 件**。
  **テスト実装が production 経路へ漏れる経路は 0 件** — 注入点は `FolderServiceDeps` の 1 つのみ。
  トークン発行箇所 → **1 件**。名前空間 / 送信元との束縛 → `:256` で保持、`:282` / `:305` で検証。
  **PB-1 / PB-4 の観点では侵食なし。**
- **推奨アクション**: docstring に「**ブラウズトークンにも使うため、推測不能であること
  (暗号論的乱数由来。連番・時刻由来を使わない)**」を 1 行足す。
  もしくは用途を `newFolderId` / `newBrowseToken` の 2 つに分ける。
  **トークンの秘匿性・強度そのものの判断は `security-reviewer` の owner** であり、
  本指摘は「注入境界の契約記述が用途の強い側を述べていない」点に限る。
- **根拠**: AD-027 決定 4、`contracts/ipc-capability.md` の `token` 行、FR-025。

---

# 第 5 部: Round 1 の Medium / Low の再確認 (すべて未対応)

| ID | Round 1 の指摘 | 再確認結果 |
|---|---|---|
| M-001 | `reverse(mapping)` が 2 箇所に重複実装 | **未対応かつ悪化。3 箇所になった** — `grep -rn "function reverse" src/` → `wsl-detector.ts:301` / `resolution.ts:202` / **`path-api.test.ts:36` (新規)**。テスト側が 3 本目の独立実装を持ったため、**照合の基準になるべきテストが 3 本目の別実装になっている** |
| M-003 | マウント位置 `/` でセグメント境界照合が無条件に真 | **未対応**。`prefix-match.ts:38` / `path-mapping.ts:55` のまま |
| M-004 | `platform-ok` 注記の形が不揃い + `PLATFORM_BRANCH_PATTERNS` が `navigator` 系を見ない | **未対応**。`window.ts:31` は依然オブジェクトリテラル内の三項に注記。`index.ts:95` は指定形。`grep -n "navigator" allowlists.mjs` → **0 件** |
| L-001 | `CSP_DECLARATION_EXEMPT_SUFFIXES` の接尾辞免除 | 未対応。境界上の穴ではないとの判定は変わらない |
| L-002 | `GENERATED_FILES` と `.prettierignore` の 2 集合に機械照合が無い | 未対応。**レイヤ規則と禁止 import が生成物にも掛かり続けていることは再確認した** |
| L-003 | `WSL_ALLOWED_ARGS` が未使用引数 8 種を許している | 未対応。**H-005 の推奨 2 と同じ ADR 追補で一緒に整理できる** |
| L-004 | 復元失敗時の退避ファイルが無制限に増える | 未対応。削除経路 0 件 |

---

# 観点別の該当なし明示 (固有観点 PB-1 〜 PB-7)

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 新規変更 (`deps.newId`) は
  `PathDTO` / `HostPath` / `RuntimePath` の往復に一切触れていない。
  `folder-record.ts` の JSON 往復は Round 1 の判定どおり保たれている。
  ブラウズトークンは名前空間・確認済みの値・送信元をセッションレコード側に保持する形が保たれている。
  **残る指摘は名前空間識別子の構成/分解の重複 (M-002、未対応) のみ。新規の消失は該当なし。**
- **PB-2 (単一インスタンス仮定)**: グローバル / module スコープに「現在のランタイム」を置く実装は
  **0 件** (再確認)。`newId` の注入はインスタンス性に影響しない。
  **消えたインスタンスへの参照が残る経路は H-002 (未対応)。**
- **PB-3 (`capabilities` の虚偽表明)**: 新規変更に `capabilities` の導出経路の変更は無い。
  項目 5 が `pending` であることを **`ok` と読み違えていないことを再確認した**。
  **楽観側に倒れる経路は H-002 のみ。新規は該当なし。**
- **PB-4 (権限ゲートの迂回)**: R-1 に権限モードの選択 UI / プリセット / CLI 引数は **存在しない**
  (再確認: 関連識別子を `src/` 全体で grep して 0 件)。`newId` 注入は権限判定に触れない。
  **該当なし (迂回経路なし)。**
- **PB-5 (多段パス変換の欠落)**: 新規変更に変換の追加・変更は無い。**該当なし。**
  逆向きマッピングの重複が M-001 (3 箇所に悪化)、境界照合の縮退が M-003。
- **PB-6 (実質的な永続環境の構築)**: 新規変更にパッケージ導入 / `~/.bashrc` / `/etc` への書き込みは **0 件**。
  **実測で基準状態の `check:constitution` が `違反 0 / ok 10 / pending 1` であることを確認した。**
  **該当なし (Principle VI 違反なし)。** 検証スコープの穴が H-004、被覆の穴が H-005。
- **PB-7 (lint ルール自体の網羅性)**: 本 round の主戦場。AD-025 が実測した 5 つの穴は
  いずれも閉じたままであることを再確認した。新規の `services-not-to-io` は**実測で発火を確認**した。
  **新規の穴は H-005 / H-006 / M-005 / M-006 / M-007 / L-006 / L-007 / L-008。**
  あわせて 2 点記録 (findings にはしない): (i) `from` は実名 2 件なので X-1 / X-3 / I-2 の
  Service は追随が必要 — AD-027 Consequences が明記しているので追跡されている。
  (ii) `doNotFollow: { path: ['node_modules'] }` により推移的到達は第一者モジュール内に限られる。

---

## 同種事象探索 cascade summary

| 指摘 ID | Grep query / 実測 | 該当件数 | path:line |
|---|---|---|---|
| (a) 判定 | 基準状態の `node scripts/constitution/check.mjs` | `[VIOLATE]` **0 行** | — (恒真でないことの前提が成立) |
| (a) 判定 | `wsl-args-array` 単独展開 → `check.mjs` | `[VIOLATE] #3` + `#7`。**`#1` / `#2` は ok** | `expected.mjs:177` の `['#3']` は実態と一致 |
| (a) 判定 | `docker-named` / `platform-*` 展開 → `check.mjs` | `[VIOLATE] #4` / `[VIOLATE] #8` | `expected.mjs:84` / `:76,154,162` |
| (a) 判定 | `service-io-import` 展開 → `depcruise src` | `error services-not-to-io: ... → crypto` (1 violation) | `.dependency-cruiser.js:215-247` |
| H-005 | `grep -rlnE "'(sudo\|doas\|pkexec\|apt-get\|...)'" tests/rule-fixtures/` | **0 件** | 項目 1 に発火確認サンプルが無い |
| H-005 | 項目 1 の生存確認 (一時配置) | `[VIOLATE] #1` + 指摘 2 件 | **項目 1 は現時点で正しく発火する** (→ High 上限の根拠) |
| H-005 | `check.mjs` 11 項目に対する発火確認の被覆 | 確認あり **5** / `pending` **1** / **確認なし 5** | `expected.mjs` の `#N` トークン 7 件 |
| H-005 | 許可リストで対象を絞るためサンプルが届かない検証項目 | **3** (項目 2 / 5 / 6)。手当て済み **0** | `check.mjs:140-161` 他 |
| H-006 | `run.mjs` 内で基準状態を測る箇所 | **0 件** | 後始末は `:314` / `:336` のみ |
| H-006 | `check.mjs` findings を `file:line` で照合する箇所 | **0 件** | `run.mjs` 全体 |
| H-006 | 同一項目を複数サンプルが期待している最大件数 | **3** (`#8`) | `expected.mjs:76,154,162` |
| M-005 | `detectors` に `eslint` を含み eslint 規則名を持たないサンプル | **3 件** | `expected.mjs:53-61` / `:130-139` / `:141-147` |
| M-005 | `require-path` の実測 eslint 規則 | **2 件** | 前者は Principle I と無関係 |
| M-006 | `rules` を持たないサンプル | **5 件** → **対象 3 件** | `expected.mjs:87-92` / `:188-193` / `:205-210` |
| M-007 | `detectors: ['none']` のサンプル | **2 件** | `expected.mjs:222` / `:229` |
| M-007 | 非 0 の終了コードを合否に反映 / 空出力を異常と見る箇所 | **0 件 / 0 件** | `code === null` 限定 |
| H-001 | `grep -rn "inflight\|inFlight\|singleFlight\|generation" src/main/app/` | **0 件** | 未対応 |
| H-002 | `replace(` / `byId` の読み書き | await 跨ぎ **2 件**、`byId.has` ガード **0 件** | `runtime-store.ts:80-81,86,159,163` |
| H-003 | `grep -n "verifiedCache" folder-service.ts` | **4 件**。**無効化 0 件** | `:111,131,132,151` |
| H-004 | `SCAN_ROOTS` / `SCAN_FILES` の内容 | **CI 定義・`vitest.config.ts`・`tests/` すべて不在** | `allowlists.mjs:12,18-24` |
| M-002 | `grep -n "wsl:" validate.ts folder-record.ts` | 実行コード **2 件** | `validate.ts:70,74` / `folder-record.ts:130` |
| M-001 | `grep -rn "function reverse" src/` | **3 件** (Round 1 は 2 件) | `wsl-detector.ts:301` / `resolution.ts:202` / `path-api.test.ts:36` |
| L-005 | `grep -rn "20 件" constitution.md` | **2 件** (実数は 21 件) | `## Existing violations summary` |
| L-007 | `find src -type d -name __rulecheck__` | **0 件** (現時点の取り残しなし) | 集合の取り方が残余 |
| L-009 | `grep -rn "newId" src/ tests/` | **4 件**。production 経路への漏れ **0 件** | `composition-root.ts:80` / `folder-service.test.ts:125,135` |

**実測時の副作用について**: 一時配置したファイルはすべて削除し、
`git status --porcelain` と `find src -type d -name __rulecheck__` を各実測の直後に確認した。

---

## 意図的に報告しなかったもの

- code-gate iteration 1 の MUST_FIX 7 件の箇所。`resolved` 箇所を再読して本 round の観点で
  新規の穴を作っていないことだけ確認した。
- `security-reviewer` owner: ブラウズトークンの強度・秘匿性そのもの、`isTrustedSender`、
  origin 許可集合、`run.mjs:74` の `shell: true` (引数がファイル内リテラルのみであることは確認した)、CSP の directive 内容。
- `architecture-reviewer` owner: AD-027 決定 4 の「`from` を実名 2 件に限る」という判断の妥当性、
  AD-025 §2 の「1 箇所に限る」の文言解釈。
- `convention-reviewer` owner: `expected.mjs` / `run.mjs` の命名と配置。
- `po-reviewer` / `test-agent` owner: `test:rules` の所要時間が 20 倍になったことの CI 予算への影響。
- `ux-reviewer` / `a11y-reviewer` owner: renderer 側の受け皿とフォーカス。

---

## Verdict

- **Critical: 0**
- **High: 7** — 新規 2 (H-005 / H-006) + Round 1 継承・未対応 5 (H-001 / H-002 / H-003 / H-004 / M-002)
- **Medium: 6** — 新規 3 (M-005 / M-006 / M-007) + Round 1 継承・未対応 3 (M-001 / M-003 / M-004)
- **Low: 9** — 新規 5 (L-005 / L-006 / L-007 / L-008 / L-009) + Round 1 継承・未対応 4 (L-001 / L-002 / L-003 / L-004)
- **Round inheritance**: resolved from 1: **1** (C-001) / unresolved: **12** / new: **10**

### 依頼された 4 点への回答 (要約)

- **(a) C-001 は閉じたか → 閉じた。** `#N` を `[VIOLATE] #N` で照合する形と 1 件ずつの分離により、
  Round 1 で挙げた **7 件 / 8 トークンの `#N` 恒真**と **8 トークンの規則名相互充足**は両方とも解消した。
  基準状態で `[VIOLATE]` が 0 行であること、各 `#N` 期待が実際に発火することを実測で確認した。
  `wsl-args-array` の訂正も実態と一致している。
  **残余 2 系統は Medium で別立てした** — typecheck 3 件のエラーコード不在 (M-006)、
  eslint 規則名の不固定 3 件 (M-005、新規に判明)。
- **(b) 規則名照合の残余 → AD-027 の記載は正しいが狭い。** 記録されていない残余が 3 つある —
  規則名が検出器に縛られていない、eslint 期待が規則名で固定されていない 3 件、
  そして **`#N` 照合が基準状態の清浄性に暗黙依存している (H-006)**。
  最後の 1 つは C-001 の再発経路であり、AD-027 に追記すべきである。
- **(c) 要る検出器だけ走らせる → 正しさの損失は無い。** 宣言した検出器の全件発火は保たれており、
  `none` の 2 件は全検出器を回している。失われたのは「期待表の過少申告の検出能力」で、
  `run.mjs:376-377` が開示している。具体的な失効は `expected.mjs:98-104` の実測メモ 1 件 (L-006)。
- **(d) 原因不明の 1 件の扱い → 妥当。ただし向きの評価が抜けている。**
  記録 + 診断出力 + 先行後始末という対応は正しく、最有力候補 (旧方式の取り残し) は構造的に塞がれている。
  不足は「フレークの向き」の明示である。宣言ありのサンプルでは**赤**に倒れる (安全側) が、
  **`detectors: ['none']` の 2 件だけは緑に倒れる** (M-007)。
  あわせて `code === null` がシグナル強制終了と spawn 失敗を区別しない点 (L-008) は、
  この仮説の切り分けに直接効く。

### 最小修正セット (優先順)

1. **H-005**: 項目 1 のサンプル 1 件追加 (2 行) + `WSL_CALLER_MODULES` にサンプル置き場を列挙して
   項目 2 の期待を復活 + 項目 9 のサンプル追加か `UNDETECTED_NOTES` への移送。
   `run.mjs` の末尾に**項目別の被覆表**を印字。
2. **H-006**: `run.mjs` 冒頭で基準状態を 1 回測り `[VIOLATE]` 0 行を assert (増分は 1/21)。
3. **M-005 / M-006**: 期待表に規則名 3 件とエラーコード 3 件を追記 (**実装変更不要。6 行**)。
4. **M-007**: `none` の 2 件について各検出器が正常終了したことを assert。
5. **L-005**: Constitution の 20 → 21 と被覆範囲の 1 行追記。
6. Round 1 継承分: **H-002 の `replace` を「既存キーのみ上書き」(1 行)** →
   **H-003 の `checkExistence` で `state` を先に見る (数行)** → **M-002 の 2 行置換** →
   **H-004 の `SCAN_FILES` / `SCAN_ROOTS` 追加** → **M-001 の `reverse` 集約** →
   **H-001 の in-flight 合流 (唯一の構造変更)**。

1〜5 と 6 の前半はいずれも数行〜数十行で、構造変更を伴うのは H-001 のみである。
