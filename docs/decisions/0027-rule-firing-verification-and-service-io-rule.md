---
status: accepted
date: 2026-09-16
id: AD-027
deciders: ukitomato
tags: [convention, enforcement, governance]
supersedes: []
superseded-by: []
---

# AD-027: ルールの発火確認を 1 件ずつに分け、調停クラスの I/O 直接依存を禁じる規則を定義する

## Context

pr-gate Round 1 が Critical 2 件を出した。どちらも **R-1 の機械強制の主張そのもの**に当たる。

R-1 の主張は 3 段構えで立っている。

1. lint / depcruise / `check.mjs` が違反 0 件である
2. しかし「違反 0 件」は**ルールが死んでいる状態と区別できない** — AD-025 が実測で 5 件挙げた
   (1 件も一致しない正規表現、評価されない設定、「未知」に落ちて判定を免れる依存)
3. だから `pnpm test:rules` が違反サンプルで**発火を確かめる**

**3 段目が機能していなかった** (Round 1 C-001)。`scripts/rules/run.mjs` は
20 件の違反サンプルを**同時に**展開して検証を 1 回だけ回し、
期待する規則名を「全検出器の出力のどこかに現れるか」で照合していた。
つまり**どの規則がどのサンプルに対して発火したかを一切検査していない**。
1 件でも発火すれば他が死んでいても通る。

加えて `check.mjs` は**全 11 項目の見出しを状態に関わらず必ず印字する**
(`[ok     ] #1 ...` / `[VIOLATE] #1 ...` / `[pending] #5 ...`)。
したがって `rules: ['#1']` のような期待は **`check.mjs` が起動しさえすれば必ず満たされる**。
実害が成立していた例が 1 件ある — `wsl-args-array` は `--import` を捕まえる意図で
`#1` を期待していたが、項目 1 は特権コマンド**文字列**の検査であり `--import` は
`PRIVILEGED_COMMANDS_ALWAYS` / `_IN_SPAWN_CONTEXT` のどちらにも無い
(`allowlists.mjs` が「`--import` のような環境を変える引数は含めない」と書いているのは
項目 2 の `WSL_ALLOWED_ARGS` の話である)。それでも「20/20 一致」が報告されていた。

もう 1 件 (Round 1 C-002) は、**要求された規則が 1 本存在しない**というものである。
[AD-025](0025-workspace-folder-carries-location.md) §9 は
「対象が無いルールを書いて『強制した』とは言えない」として、
**「最初の調停クラス (状態を持ち I/O をインタフェース経由で扱うクラス) を作る feature で、
`from` セレクタを実名で定義する」**と定めた。その feature は R-1 である。

HEAD には調停クラスが 2 つある。`src/main/app/runtime-store.ts` は自身の docstring で
「状態を持つ調停は結線層が担う」と宣言し、[AD-023](0023-application-architecture.md) §5 が
`RuntimeRegistry` として実名で挙げたものである。`src/main/app/folder-service.ts` は
`folders` / `sessions` / `verifiedCache` / `listeners` を保持し、I/O を
`store` / `fs` / `hostFs` / `detector` のインタフェースで注入されている。
**それでも `services ✗→ I/O モジュール直接` の規則は 1 行も無く、違反形が既に 1 件入っていた** —
`folder-service.ts` の `import { randomUUID } from 'node:crypto'` である。
同ファイルは `hostFs` について「**`app` が `node:fs` を直接触らないために注入する**」と
書いており、同一ファイル内で方針が割れていた。`node:crypto` を I/O と見なすのは
このリポジトリ自身の語彙である (`src/domain/workspace/registry.ts` が
「`domain` は I/O を持たないため `crypto` を import できない」として乱数源を引数で受け取る)。

2 件は独立した指摘だが**同じ穴の裏表**である。C-001 は「ルールが生きているか確かめられない」、
C-002 は「要求された規則が無い」。どちらも AD-024 が名指した反パターン
「違反が 0 件なのではなく検査が 0 件になる。これは『合格』と見分けがつかない」の実例である。

## Decision

### 1. 違反サンプルを 1 件ずつ展開して検証する

`run.mjs` を「20 件一括展開 → 1 回検証」から
「**1 件展開 → 検証 → 後始末**」を 20 回繰り返す形に変える。
置いたのがその 1 件だけなので、**出力に現れた規則名はそのサンプルの話だと確定する**。

**同伴サンプルの宣言を導入する。** 単独では違反が成立しない形があるため、
期待表に `requires` を足して同時展開が必要なサンプルを宣言する。R-1 時点で 3 件ある。

| サンプル | 同伴が要る理由 |
|---|---|
| `cycle-a` | 相手側 (`cycle-b`) が無いと循環にならない |
| `cycle-b` | 同上 (`cycle-a`) |
| `ui-builtin-via-domain` | 経由する `domain-io-import` が無いと推移的到達が成立しない |

**要る検出器だけを走らせる。** 検証回数が 20 倍になるため、
`detectors` に挙がっていない検出器は起動しない。
`detectors: ['none']` のサンプルだけは「どれも捕まえない」を示す必要があるので全部走らせる。

### 2. `#N` は状態つきの形で照合する

Constitution 検証の項目番号は `[VIOLATE] #N` の形で照合する。
素の `#N` を部分一致で探すと、見出しが常に出るため
**検査が何も見つけなくても満たされる**。

あわせて `wsl-args-array` の期待を `['#1', '#3']` から `['#3']` に訂正した。

### 3. 各検出器の終了コードと出力量を記録する

「検出器は走ったが何も言わなかった」と「検出器の起動に失敗して出力が空だった」は
**どちらも `hits` が空になり、期待表の誤りと見分けがつかない**。
実測でこの曖昧さに 1 度当たったので、進捗行に `exit:<code>/<bytes>` を出す。
`code === null` (spawn 自体の失敗) は期待表の不一致ではなく専用の失敗として報告する。

### 4. `services-not-to-io` を実名 2 件で定義する

`.dependency-cruiser.js` に規則を追加し、`from` を
`src/main/app/folder-service.ts` / `src/main/app/runtime-store.ts` の実名 2 件に限る
(AD-025 §9 が「`from` セレクタを実名で定義する」と書いた形そのまま)。

結線層 (`composition-root.ts`) と Electron 境界 (`window.ts` / `protocol.ts` / `index.ts`) は
**含めない** — そちらは I/O を解決して渡すのが役割である。
`assert` / `util` / `events` は純粋な補助として除外する
(`domain-not-to-io` が `DOMAIN_PURE_CORE` を除いているのと同じ考え方)。

**違反形を注入に変えた。** `folder-service.ts` の `randomUUID` 2 箇所
(フォルダ識別子とブラウズトークン) を `deps.newId: () => string` に置き換え、
`composition-root.ts` で解決して渡す。`domain` の `makeFolderId(random)` と同型である。
副産物としてテストから識別子を決定的に固定できるようになった。

### 5. 違反サンプルの置き場を選択子に明示する

実名指定の代償として、`__rulecheck__/` 配下のサンプルが規則の対象に入らない
(他の規則は `from` がディレクトリ指定なので自然に拾う)。
`from` に `^src/main/app/__rulecheck__/service-io-import[.]ts$` を列挙する。

**列挙しないと「ルールはあるが発火を確かめていない」状態になり、C-001 と同じ病になる。**
規則を検証可能に保つほうを採った。

## Consequences

- **`pnpm test:rules` の所要時間が伸びる。** 検証回数が 20 倍になる。
  要る検出器だけに絞ることで緩和しているが、CI の所要時間に直接乗る。
  構造的に速く保つには検出器の機械可読出力 (JSON) が要る — 採らなかった理由は下記
- **期待表の誤りが 1 件見つかった** (`wsl-args-array` の `#1`)。
  訂正した。同種の誤りが他に無いことは、`#N` を状態つきで照合する形にしたことで
  以後は自動的に検出される
- **違反サンプルが 20 → 21 件になった。** `services-not-to-io` の発火を確かめる 1 件
- **AD-025 §9 の Open Question「`services` に当たる調停クラスをどのレイヤに置くか」を閉じる。**
  調停は `app` に置き、I/O はインタフェース経由で注入される。
  X-1 の `SessionService` / X-3 の `ProviderService` / I-2 の `ContainerService` を作るときは
  `services-not-to-io` の `from` に実名を足すこと
- **規則名 (eslint / depcruise) の照合には残余がある。** そのイテレーションの出力に対する
  部分一致であり、**同伴サンプルが同じ規則名を発火させた場合は区別できない**。
  現在の同伴関係 3 件はいずれも別の規則を発火させるため実害はないが、
  同伴サンプルを増やすときは確認すること
- **原因を特定できなかった事象が 1 件ある。** 1 件ずつに分けた直後の初回実行で
  5 件の不一致が出たが、再実行では 21 件すべて一致し**再現しなかった**。
  当該サンプルは単独の手実行では期待どおり発火することを確認している
  (`path-module-import` は `no-restricted-imports`、`namespace-mixup` は `TS2345`)。
  初回実行時は診断出力が無かったため事後に切り分けられない。
  決定 3 の診断出力はこの事象への対応である

## Alternatives considered

- **検出器の機械可読出力 (JSON) に変える。** `check.mjs --json` を新設し、
  eslint は `--format json`、depcruise は `--output-type json` にして
  「項目 N の findings に当該サンプルの target が含まれるか」で照合する案。
  pr-gate の reviewer 推奨案であり、**一括実行のままなので速い**。
  採らなかったのは実装量 — `check.mjs` に出力経路 1 本と 3 検出器分のパーサが要る。
  **1 件ずつに分けるほうが差分が小さく、出力形式に依存しない。**
  所要時間が問題になった時点でこちらへ移る
- **`services-not-to-io` を `app` レイヤ全体に掛けて例外を実名で抜く。**
  X-1 / X-3 / I-2 の Service が自動で対象に入るので追随漏れが起きない。
  採らなかったのは、AD-025 §9 が「`from` セレクタを実名で定義する」と明記しており、
  かつ例外リストの初期メンバが 4〜6 件になるため。
  **対象が増えた時点で再検討する余地はある**
- **規則を書かず ADR で定義を変えて逃げる。** AD-025 §9 の Open Question を閉じる ADR を起こし、
  「R-1 の 2 件は Service ではない」と定義し直す案。
  採らなかったのは `folder-service.ts` が自身の docstring で調停を宣言しており、
  `node:crypto` の直接 import も既に入っていたため — **定義変更で逃げる形になる**
- **`wsl-args-array` の期待だけ訂正して終わる。** 構造を変えない最小案。
  採らなかったのは、残る 7 件 / 8 トークンの `#N` 期待が引き続き常に真のままであり、
  **Critical が解消したと言えない**ため

## References

- [AD-023](0023-application-architecture.md) §5 / §7 — `services ✗→ I/O モジュール直接` と 5 レイヤの依存行列
- [AD-024](0024-constitution-verification-paths.md) — 「違反が 0 件なのではなく検査が 0 件になる」
- [AD-025](0025-workspace-folder-carries-location.md) §9 — 履行条件と Open Question
- `specs/001-runtime-folder-registration-runtime-detection/pr-gate.md` — Round 1 の C-001 / C-002
- `specs/001-runtime-folder-registration-runtime-detection/platform-boundary-reviewer.md` — C-001 の全文
- `specs/001-runtime-folder-registration-runtime-detection/architecture-reviewer.md` — C-002 の全文
- Constitution Principle VI / VII / II の Verification 節
