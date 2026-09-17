---
status: accepted
date: 2026-09-17
id: AD-028
deciders: ukitomato
tags: [session, architecture, enforcement, governance]
supersedes: []
superseded-by: []
---

# AD-028: セッション列挙の実行単位を「要求 1 回の短命プロセス」とし、UNC の受け渡しを実名リストで縛る

## Context

R-2 (セッション列挙) の設計で 4 点が未決だった。いずれも accepted な上流と
字義どおりには食い違うため、**実装より先に**決着させる必要がある
(design-gate round 1 が Critical として指摘した順序である)。

1. [AD-021](0021-session-store-and-enumeration.md) §3 は「Provider ごとの短命 child process が本線」と
   決めたが、**そのプロセスをどこで動かすか**を決めていない。ディストロ内で動かすなら
   Node と SDK の導入が要り Principle VI に反する
2. [AD-023](0023-application-architecture.md) §1 / §6 は `agents` の寿命を
   **「セッション開始〜終了」**と定めている。列挙はセッションに紐づかない
3. [AD-025](0025-workspace-folder-carries-location.md) Consequences は
   **「UNC 形式は `infra` の内側に閉じる」**と定めている。列挙プロセスは
   `agents` にあり、config ディレクトリを UNC 形式で受け取る必要がある
4. [AD-024](0024-constitution-verification-paths.md) #18 と Constitution v1.2.2 の
   Principle VIII は、Automated 検証の延期先を**「R-2 の E2E 基盤」**と書いている。
   R-2 は読み取り専用であり、E2E 基盤を作らない (人間判断)

## 実測 (R-2 の Phase 0)

`specs/002-session-cross-folder-session-enumeration/research.md` に全文。要点のみ。

| 測定 | 結果 |
| --- | --- |
| `CLAUDE_CONFIG_DIR` に UNC 経路を与えた Windows 側プロセスからの `listSessions()` | **成立する。** 269 件を 915 ms (先頭 50 件 384 ms) |
| 3 綴り (`\\wsl.localhost\` / `\\wsl$\` / `//wsl.localhost/`) | **いずれも成立** |
| 冷えた子プロセスで `import` + 1 回の列挙 | 2,171 ms |
| 列挙前後の config ディレクトリ (8,487 ファイル) | **差分 0** (読み取り専用) |
| ホーム配下の浅い列挙 | 69 ms。`/root` は UNC 経由で Access denied |

**`listSessions()` は `claude` 実行ファイルを起動せず、`fs/promises` でローカルを読むだけである。**
したがってディストロ内で何も動かさずに、Windows 側から UNC 経路で読める。

## Decision

### 1. 列挙の実行単位は「列挙対象ごと・要求 1 回の短命 `utilityProcess`」とする

`src/agents/` に置き、`CLAUDE_CONFIG_DIR` をプロセス生成時の環境変数で与える。

次の 5 つを同時に満たす形はこれ以外に無い。

| 制約 | 根拠 |
| --- | --- |
| 同一プロセス内で環境変数を書き換えない | AD-021 §3 (並行列挙のレース) |
| main process をブロックしない | Principle IX |
| `electron` とネイティブモジュールに依存しない | AD-010 / Principle VII |
| Agent SDK を呼ぶコードは `agents` に置く | AD-023 §2 |
| ディストロ内に何も導入しない | Principle VI |

### 2. AD-023 §1 / §6 の「寿命」を読み替える

AD-023 は `agents` の寿命を「セッション開始〜終了」と定めている。本 ADR は
**3 つ目の寿命「要求 1 回」を追加する**ものとして、AD-023 §1 の寿命表と §6 を読み替える。

**AD-023 を in-place 改変しない。** accepted な ADR は immutable として扱い、
読み替えの根拠を後続 ADR に置く — [AD-025](0025-workspace-folder-carries-location.md) §2 が
[AD-004](0004-branded-path-types.md) に対して確立した形式に従う。
`superseded-by` は変更しない (supersede ではなく補足である)。

AD-023 §6 が 1 プロセス 1 セッションとした理由は
「1 プロセスで全セッションを捌くと数 MB のパースが他を止める」であり、
**列挙にも同じ理由が当てはまる**。要求ごとに分ける方針は AD-023 と同じ判断の延長である。

### 3. UNC の受け渡しは 4 規則 + 2 本の実名リストで縛る

AD-025 の「UNC 形式は `infra` の内側に閉じる」に対し、本 ADR は
**「UNC の文字列リテラルを持てる場所」で線を引く**形に読み替える。

#### 4 規則

1. UNC の文字列リテラルを持てるモジュールを**実名で列挙する** (下記リスト 1)
2. 列挙プロセスは受け取った値を**そのまま SDK に渡すだけ**とする。結合・分解・正規化をしない
3. 列挙プロセスは**パス値に一切触らない**。作業ディレクトリは記録されていた生の文字列のまま返す
4. UNC 形式を **IPC 境界と永続化境界に出さない** (FR-042。AD-025 の元の規則そのまま)

#### リスト 1: `UNC_LITERAL_MODULES` — UNC 接頭辞リテラルを持ってよい

| モジュール | 理由 |
| --- | --- |
| `src/domain/runtime/path-types.ts` | `UNC_PREFIX` の定義と `makeWslUncPath` の検証 |
| `src/domain/runtime/path-api.ts` | `toUnc` / `fromUnc` / `parseWslUncPath` の実装 |

#### リスト 2: `UNC_FORBIDDEN_IN` — リテラルと UNC API 呼び出しの**両方**を禁じる

| 場所 | 理由 |
| --- | --- |
| `src/agents/**` | 規則 2 の機械強制。受け渡しだけを行う層が UNC を扱い始めるのを止める |

#### 訂正 (2026-09-17 / 採択当日)

**規則 3 の初版は「作業ディレクトリは所在の名前空間へ変換して返す」と書いていた。**
これは実装不能である。変換には `parseWslUncPath()` が必要で、
本 ADR の**リスト 2 がその呼び出しを `src/agents/` 配下で禁じている**
(`check.mjs` 項目 13 として実装済み)。規則 3 とリスト 2 が同じ節の中で矛盾していた。

正しい線引きは [AD-029](0029-session-cwd-origin-classification.md) が定めたとおり、
**出自の判定は `domain` の純粋関数が値の形から行う**である。列挙プロセスは
生の文字列を素通しし、UNC 形式が IPC 境界へ出ないことは
`SessionSummaryDTO` が生値を持たないこと (規則 4) で担保される。

**変換用のディストロ名を起動引数に含める必要も無くなった。** C-2 の
「所在の識別子を起動引数で渡す」行は、その唯一の理由が変換だったため差し替える。

#### 「materialize してよいモジュール」の許可リストは作らない

design-gate round 2 の途中まで 3 本目のリストを想定していたが、**採らない。**

実体を洗い出すと `src/main/infra/fs/wsl-fs.ts` が `runtimePathOps.toUnc()` を呼んでおり、
**`toUnc()` を呼ぶこと自体が正規の経路**である。ここを許可リストで縛ると
「正しい API を使うのに ADR が要る」形になり、X-1 / I-1 で UNC 利用箇所が増えるたびに
ADR を起こすことになる。**それで塞がる脅威が無い。**

塞ぐべきは (a) API を迂回した手組み = **リテラル**、(b) `agents` での取り扱い、の 2 つであり、
上の 2 本のリストがどちらも覆う。

### 4. プロセス起動モジュールの許可リストに `session-enumerator.ts` を追加する

`scripts/constitution/allowlists.mjs` の `PROCESS_SPAWN_MODULES` に
**`src/main/app/enumerator-spawner.ts`** を追加する (項目 7)。

**訂正 (2026-09-17 / 実装時)**: 初版は `src/main/app/session-enumerator.ts` を挙げていた。
実装で **Electron 境界を `enumerator-spawner.ts` に分離した**ため実名を差し替える。
分離の理由は、timeout / 同時数上限 / 束ね / クールダウン / ゲートという**方針**を
**Electron を立てずに検証する**ためである — `electron` を import したモジュールは
Vitest の node 環境で読み込めず、スタブを置けば
「モックゼロで書ける」(AD-023 §1 / `vitest.config.ts`) が崩れる。
AD-023 が `window.ts` / `protocol.ts` を Electron 境界として切り出したのと同じ形である。
**下表の項目 3 の議論は、そのまま `enumerator-spawner.ts` に移る。**

**追加によって新たに掛かる検証項目を明記する** (これを書かずに追加すると、
後で別の項目に引っかかって 2 本目の ADR が必要になる)。

| 項目 | 掛かるか | 対応 |
| --- | --- | --- |
| 項目 1 (特権コマンド文字列) | 掛かる | 特権コマンドを書かない。列挙は SDK 呼び出しだけである |
| **項目 3 (裸の `wsl`)** | **掛かる** | 下記 |
| 項目 4 (裸の `docker`) | 掛かる | 書かない |
| 項目 5 (docker のイメージ構築) | 掛かる | 書かない |

**項目 3 の発火条件は「プロセス起動 API を持つファイルに裸の `wsl` が現れること」**であり、
`check.mjs` の `SPAWN_CALL_PATTERNS` は `utilityProcess` を含む。
つまり**トリガは許可リストへの追加ではなく、`session-enumerator.ts` が
`utilityProcess` と書いた瞬間**である。`WSL_CALLER_MODULES` は別のリストなので、
項目 7 で許可しても項目 3 は掛かり続ける。

**回避策を設計として決める**: `enumerator-spawner.ts` に `'wsl'` の文字列リテラルを書かない。
**同ファイルはそもそも所在を見ない** — 引数と環境変数を受け取って起こすだけである。
所在の判別は `session-enumerator.ts` が `Location` の値で行い、
文字列は `domain` と `src/main/infra/session/config-dir.ts` の側に置く。`WSL_CALLER_MODULES` は広げない — 列挙プロセスは `wsl.exe` を起動しないからである。

### 5. Principle VIII の Automated 検証の延期先を R-2 から外す

AD-024 #18 と Constitution v1.2.2 の Principle VIII は
「(A) composer の IME テスト / (B) 日本語スクリーンショット比較は **R-2 の E2E 基盤**に相乗りする」
と書いている。**R-2 はこれを満たさない** (人間判断: CI / E2E は M4 完了後に再検討)。

判断の筋は AD-024 自身の延期条件に照らして成立している。

- **(A) の発動条件は「`ChatScreen` から `isDisabled: true` を外す変更」**である。
  R-2 は読み取り専用であり composer の送信経路を開けないので、発動しない
- **(B) の延期条件は「目標レイアウト ADR が accepted」かつ「E2E 基盤が存在」の両方**である。
  前者が未充足のため、R-2 で撮っても採択時に全数撮り直しになる

AD-024 は immutable なので、本 ADR を #18 の**読み替えの根拠**とする。
Constitution 側は改定可能なので **v1.2.3 (PATCH)** で本文を直す
(Principle VIII の Verification と Existing violations summary の 2 箇所)。

**延期先を空にしない。** 「M4 完了後に再検討する」と書き、
`docs/roadmap.md` に E2E 基盤の持ち主 feature を登録する。
持ち主のいない延期は、次に Principle VIII を見る人 (X-2 の設計者) が
「R-2 で載ったはず」と誤読する形で残る。

## Consequences

- **`src/agents/` がプロジェクト初の実体を持つ。** R-1 は `.gitkeep` と依存規則だけを用意した。
  R-2 で `agents → electron / ネイティブ` の推移的到達禁止が**実コードに対して**効く
- **`agents` はコアモジュールを import できない** (`eslint.config.mjs` の policy 3)。
  stdio はグローバルの `process` で書く。外部パッケージは既定で許可なので SDK は使える
- **列挙プロセスは stdio でプロトコルを話し、`node <entry>` で単独起動できる形を保つ**
  (Principle VII Statement 後半)。`process.parentPort` は import を伴わないため
  ESLint にも依存グラフにも現れない — **機械検証が緑でも守れていない形になりうる**ので、
  Electron 抜きの `node` で 1 件の列挙が成立することをテストで確かめる
- 実行中確認済みの値のゲートは**ファイルアクセスだけでなくプロセス起動にも掛かる**。
  プロセスの起動自体が UNC アクセスを引き起こすため、
  起動に掛けないと停止中の所在へ子プロセスが飛び SC-002 が成立しない
- リスト 1 / 2 の機械検証は `scripts/constitution/check.mjs` の項目として実装し、
  **違反サンプルで発火を確かめる** (AD-027 §1)。書いただけでは規則ではない
- 列挙プロセスに与える環境変数は**許可リストのみ**とし、親環境を継承させない。
  X-3 で Provider の資格情報が main の環境に入ったときに流れ込む経路を最初から作らない

## Open Questions

- [ ] 同時プロセス数の上限と逐次連打のクールダウンの具体値。実測で決める
- [ ] 列挙プロセスの stderr に出してよい値の線引き。現時点は
      `targetKey` (不透明) / `reasonKey` / 経過時間に限ると決めたが、
      SDK の例外メッセージを落とす実装の形は未定
- [ ] E2E 基盤の持ち主 feature。M4 完了後に決める

## References

- [AD-021](0021-session-store-and-enumeration.md) — 短命 child process 方式 (本 ADR がその置き場を決める)
- [AD-023](0023-application-architecture.md) §1 / §6 — `agents` の寿命 (本 ADR が読み替える)
- [AD-024](0024-constitution-verification-paths.md) #18 — Principle VIII の延期先 (本 ADR が読み替える)
- [AD-025](0025-workspace-folder-carries-location.md) — UNC は `infra` の内側 / §2 の読み替え形式の先例
- [AD-027](0027-rule-firing-verification-and-service-io-rule.md) — ルールは発火で確認する
- [AD-010](0010-supervisor-runs-standalone.md) — supervisor は単独起動可能
- [AD-015](0015-wsl-access-strategy.md) — UNC 直読みが主経路 / `wsl.exe` の固定費
- `specs/002-session-cross-folder-session-enumeration/research.md` — 本 ADR の実測の出所
