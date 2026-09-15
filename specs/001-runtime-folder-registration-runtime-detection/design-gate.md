# Design Gate: フォルダ登録とランタイム検出 (R-1) — round 5

**Run**: 2026-09-14 | **Spec**: [spec.md](spec.md) | **Status**: `tasking` (据え置き)

**Verdict**: **FIX_REQUIRED** (Critical 2)。指摘 25 件はすべて本 round で修正済み。

## トラック

| Track | reviewer | 出力 | C / H / M / L |
|---|---|---|---|
| A | analyze | [analyze.md](analyze.md) | 0 / 2 / 3 / 3 |
| B | po-reviewer | [po-reviewer.md](po-reviewer.md) | 0 / 1 / 3 / 0 |
| C | architecture-reviewer | [architecture-reviewer.md](architecture-reviewer.md) | 0 / 1 / 1 / 1 |
| D | platform-boundary-reviewer | [platform-boundary-reviewer.md](platform-boundary-reviewer.md) | 2 / 2 / 1 / 0 |
| E | security-reviewer (2 回目) | [security-reviewer.md](security-reviewer.md) | 0 / 4 / 4 / 1 |

dedup 後: **Critical 2 / High 7 / Medium 10 / Low 6 = 25 件。全件 accepted / 修正済み。**

## 推移 — 正直な評価

| | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Critical | 7 | 5 | 3 | 3 | **2** |
| High | 21 | 19 | 7 | 10 | **7** |
| Medium | — | 25 | 7 | 7 | **10** |
| Low | — | 13 | 3 | 3 | **6** |
| 合計 | — | 62 | 20 | 23 | **25** |

**Critical は収束している** (7 → 5 → 3 → 3 → 2)。**合計は round 3 以降ほぼ横ばいで、今回は増えた。**

理由は明確で、**round 4 が追加した内容そのものが round 5 の指摘の母体になっている** —
25 件中 14 件が round-4 の追加分 (送信元検証 / CSP / ブラウズ入口制約 / 30 秒上限 /
`distroName` 文字種 / 列挙不能 / FR-017 の 2 層 / 名前空間の境界規則) に起因する。
修正がテキストを増やし、増えたテキストが次の伝播漏れを生む循環に入っている。

一方で**指摘の性質は変わった**。round 1〜3 は「設計に穴がある」だった。
round 4〜5 は「**規則はあるが誰も測っていない**」「**値はあるが運ぶ器が無い**」
「**正当化が事実と違う**」が中心である。

## 本 round の Critical 2 件 — いずれも私の round 3 / 4 の修正が原因

### C-001 「境界を渡るパスは常に所在の名前空間」を全称で書き、`runtimePath` と矛盾した

round 4 で `unc:<D>` の境界越えを塞ぐために書いた規則にスコープ限定句が無かった。
しかし `FolderRuntimeResolutionDTO.runtimePath` は**ランタイムの `id`** を運ぶ必要があり
(data-model §8 不変条件)、所在 `windows` × `WslRuntime` — **US-3 AC-1 と charter Journey 2 の
中核セル** — では `{ namespace: 'wsl:<D>', value: '/mnt/c/...' }` を返す。

規則どおりに境界検査を書けば越境セルの解決が必ず落ち、落とさないために `runtimePath` を
所在の名前空間へ「正規化」すれば、**round 3 と round 4 で 2 度塞いだ再 branding** が
今度は規則に従ったつもりで作られる。

**修正**: 規則を「所在配下を列挙・登録・永続化する経路」にスコープし、`runtimePath` が
対象外であること・所在と一致しないのが越境セルの正常な結果であることを明記。
`backupPath` は `host` 固定。FR-015 の全称句も同じスコープに直した。

### C-002 固定値経路で `probedAt` を落とし、`Win32Runtime` が `autoModeSafe: false` を表明できない

round 3 で導出式を不変条件に揃えたとき `probedAt !== null` を「判定済み」の条件に含めた。
一方 `probedAt` は「判定完了時刻」と定義され、**実地判定を行わない `Win32Runtime` と
実行中 WSL1 にこれを設定する規則がどこにも無かった**。式を実装すると両者は `unknown` を返す。

帰結は 3 つ — AD-003 の Decision Outcome (「`Win32Runtime` は `autoModeSafe: false` として
表明する」) を満たさない、`runtime` charter の KPI を満たさない、そして表示は `autoModeStatus`
が担うため **`Win32Runtime` が永久に「判定中」と表示される**。FR-003 の裏面
(判定を要しないと決めたものを「未判定」と表明する) に落ちる。

**修正**: `probedAt` を「capabilities を**確定させた**時刻」と定義し直し、固定値経路も確定時に
設定することを §3 / §4 / BE-024 / BE-025 に明記。

## High 7 件

| ID | 指摘 | 出所 | 修正 |
|---|---|---|---|
| H-001 | 一覧側の到達可能性に**導出規則が無い**。§8 は (フォルダ × ランタイム) の対に対する関数で、一覧にはランタイム軸が無い。`folder-missing` / `distro-absent` はどのセルからも produce されない。実在確認の I/O も未割当で、**アプリ起動だけで停止中ディストロが起動しうる** | A F-001 + D H-002 | §6 に**第 0 段 + 畳み込み規則**を新設。所在 `wsl` の実在確認は `infra/fs` 経由・確認済みの値を持つときだけ・**持たないとき `folder-missing` を出してはならない**。BE-047 に反映 |
| H-002 | 30 秒上限は**自分が名指した窓を塞いでいない**。期限検査は期限**後**にしか発火せず、期限内に実体が停止する窓は残る。SC-005 の「起動 0 件」は絶対値で書かれており両立しない | A F-002 | 窓が消せないことを §5 に明記し、**SC-005 を「アプリが起動を伴う操作を発行することが 0 件」に**改めて残余を記録。保証できないものを保証すると書かない |
| H-003 | `data-model` §6 だけが round 3 の 1 層版「`blocked` には解除の導線を出してはならない」のまま。FR-017 の 2 層化と正面から食い違う | B H-001 | §6 を 2 層に。quickstart V-2 に `blocked` の解除操作の確認を追加 |
| H-004 | 「一致」を種別まで厳密にした結果、**型跨ぎでしか成立しない検査が 1 つ取り残された** (`wsl:<D>` vs `unc:<D>`)。字面どおり書くと常に偽 → WSL ブラウズ全滅。接頭辞を剥がして比較すると `Ubuntu` が `Ubuntu-26.04` に当たる | D H-001 | `domain` に **`isSameDistro()`** を定義し、**`NamespaceId` から成分を取り出してよい唯一の場所**とする。境界を渡る値どうしは種別まで完全一致、`infra/fs` の入口だけがこの関数を使う |
| H-005 | FR-039 / FR-040 / SC-016 が**環境スコープを持たない**。quickstart は V-1〜V-5 を `pnpm dev` で走らせるが、dev サーバ origin は登録済みカスタムプロトコル origin ではない。厳密な送信元検査なら**全 IPC が破棄され MVP の完了判定経路が閉じる** | C H-001 + E H-004 | 送信元を「**配信元 origin**」に改め、許可集合を 1 定数に集約して検証スクリプトの対象に。**環境で無効化する分岐を作らない**。開発時 CSP も走査対象から外さない |
| H-006 | `beginBrowse(windows)` を塞いだ**正当化が証明しすぎている**。同じ能力は所在 `wsl` から `/mnt/c` を辿れば残っており、それは US-3 が越境として明示的に認める経路。`registerFolder` も renderer 主張のホストパスを受理する | E H-001 + E H-002 | 正当化を**経路の一本化**に訂正し、「ホスト FS への到達を塞ぐものではない」と明記。`registerFolder` のホストパスは renderer の主張を受理すると Assumptions に記録し、**実在確認を登録済みエントリに限る** |
| H-007 | IPC 検証表 14 行に**計測経路が無い** (計測を持つのは 1 行)。round 4 で security C-002 の推奨 (d) を落とした。送信元検証も token 束縛も種別一致も、実装されなくてもどのテストも落ちない | E H-003 | **SC-018** を新設 (「検証表の**各行**」= class rule。3 つ列挙する形にしない) + **BE-048** |

## Medium / Low

| ID | 指摘 | 出所 |
|---|---|---|
| M-001 | 「列挙不能」に DTO / 理由キー / UI / 検証の 4 点セットが無い。SC-002 の 1 対 1 とも衝突 → `enumerationIssues` + `EnumerationIssueReason` を新設 | B M-001 + A F-004 |
| M-002 | 30 秒上限が spec に降りておらず、期限切れ後に利用者が戻る位置が未定義。SC-004 の 300ms と衝突 → `{ kind: 'current' }` を追加し SC-004 に除外句 | B M-002 |
| M-003 | 登録フォルダ 0 件 × 組み合わせ画面に AC もタスク条件も検証行も無い (初回起動で必ず通る) | B M-003 |
| M-004 | SC-016 の「CSP が directive を満たす」に計測が無い。項目 10 は**禁止形の不在しか見ない** → directive 集合の検査に拡張 | A F-003 |
| M-005 | CSP 基線が `ui` domain (R-3 / R-4) を CI レベルで拘束するのに申し送りが 0 件。FR-041 と C-3 には ADR 手続きがあるのにここだけ無い | C M-001 |
| M-006 | `distroName` の文字種制約が列挙経路にしか無く、永続化読み戻しに適用されない (`displayName` には付いているのに非対称) | E M-001 |
| M-007 | renderer が `refreshRuntimes` 等を任意回数呼べ、FR-010 が UI の作り方にしか実装されていない。`browseDirectory` の件数上限も無い → 同時実行の束ねと `too-many-entries` | E M-002 |
| M-008 | `setWindowOpenHandler` / 外部ナビゲーションが bundle に **0 件**。AD-023 のチェックリスト項目であり CSP は覆わない | E M-003 |
| M-009 | `PathMapping.entries` に形式検証が無い。**唯一「ランタイム内部の出力がホスト側のパス計算の材料になる入力**」で、FR-005 の sandbox 判定の基準でもある | E M-004 |
| M-010 | `probing` からの脱出辺に「応答が返らない」が無い。SC-004 の計測は完了したバッチしか値を出さないため**この失敗を構造的に見ない** | D M-001 |
| L-001 | `data-model` §1 の `US-3 AC-14` が、round 4 の AC 挿入により別の AC を指すようになった → AC-15 に訂正 | A F-005 |
| L-002 | SH-014 の「R-08 の 9 項目」が実体 (10 項目) と不一致 → 「検証項目すべて」に | A F-006 |
| L-003 | **plan と SH-050 の `ui` charter 引用が切り詰められていた。** 実体は「preload / IPC **越しの**ストリーミングブリッジ」で既に限定済みであり、提案した In scope の修正は**前提が成り立たない** → In scope は触らず Out of scope の追加のみに | A F-007 |
| L-004 | 「`ui` から `resolve()` を呼べる」が、`PathMapping` を境界外に出さない決定と両立せず実体を持たない → 根拠を訂正 | A F-008 |
| L-005 | 「ブラウズセッション」が canonical term「セッション」(Claude Code の 1 会話) と同音異義。`browse-session-expired` は renderer が訳出する参照キーで UI 文言になる | C L-001 |
| L-006 | `missingDependencies[].name` が閉じた集合と規定されていない (`docAnchor` には付いている) | E L-001 |

## 私の側の誤り 2 件

**L-003 は指摘の前提を私が壊していた。** round 4 で `ui` charter を plan と SH-050 に写すとき、
「Electron 特有の配線（preload / IPC **越しの**ストリーミングブリッジ）」から
「越しのストリーミングブリッジ」を落として引用し、**その切り詰めた引用を前提に修正タスクを立てた**。
reviewer 側 (round 4 Track C) は正しく全文を引いていた。SH-050 の前半を撤回した。

**H-007 は round 4 で推奨の一部を落とした。** security C-002 の推奨は (a)〜(d) で、
(d) が計測経路だった。(a)(b)(c) だけ入れて (d) を落としたため、追加した防御が
「書いてあるだけ」の状態で 1 round 通過した。

## security-reviewer からの確認

round 4 で私が降格した判断 (「UNC の `..` は share ルートで止まるため別ディストロに到達しない」)
について、**異議なし**との回答。加えて `\\?\UNC\` 形式が正規化を迂回する点も、
round 4 で入れた「合成後に再正規化して share 配下への封じ込めを検証」が
**形式を問わず閉じている**と確認された。

## Next

`/cl-design --spec-dir specs/001-runtime-folder-registration-runtime-detection --from gate` で round 6。
status は `tasking` のまま。

**ただし、次 round を回す前に判断が要る** — 本文の「推移」節のとおり、
Critical は収束している一方で合計は横ばい、かつ指摘の母体は前 round の追加テキストに移っている。
bundle は 10 文書・約 2,900 行あり、コードは 0 行である。
「設計のさらなる精緻化」と「実装して code-gate で詰める」のどちらが速いかは、
gate の verdict ではなく人間が決めるべき判断である。

---

## 人間判断による override (2026-09-14)

**gate の verdict は `FIX_REQUIRED` のままである。** 本 round で修正した 25 件は
**再レビューを経ていない**。そのうえで `tasking → implementing` へ進める判断が人間から出た。

status 遷移は `--gate-transition` (verdict=PASS を要求する) ではなく `--legacy` 経路で行った。
**これは gate の PASS ではない。**

判断の根拠は本文「推移」節のとおり — Critical は収束する一方で合計は横ばいであり、
指摘の母体が前 round の追加テキストへ移っていたこと。

### code-gate へ引き継ぐ確認事項

round 5 で修正したが再レビューを経ていない項目のうち、実装で守られたかを code-gate が見るべきもの:

| ID | 確認すべきこと |
|---|---|
| C-001 | 境界の名前空間規則のスコープが守られ、`runtimePath` が例外として扱われているか |
| C-002 | 固定値経路 (`Win32Runtime` / 実行中 WSL1) で `probedAt` が設定されているか |
| H-001 | 一覧側の実在確認が、確認済みの値を持たないまま発行されていないか (SC-005) |
| H-004 | `isSameDistro()` が `NamespaceId` の成分を取り出す唯一の場所になっているか |
| H-005 | 送信元の許可 origin が 1 つの定数に集約され、環境分岐で無効化されていないか |
| H-007 | SC-018 のとおり IPC 検証表の**各行**にテストがあるか |
