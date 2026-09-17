# Quickstart 実行結果: セッション列挙 (R-2)

**Spec**: [spec.md](spec.md) | **Quickstart**: [quickstart.md](quickstart.md) | **Tasks**: SH-089

**status**: 進行中 (US-1 の BE 経路まで)

---

## V-0: 列挙プロセスの単独起動 (SH-094 / Principle VII / AD-010)

**日付**: 2026-09-17
**手段**: `electron-vite build` の出力 `out/main/enumerate-sessions-*.js` を
**Electron を介さず `node` で直接起動**し、標準出力の 1 行を読む。

```
node out/main/enumerate-sessions-<hash>.js \
  --target-key=<key> --scope=page --limit=50 --offset=0
```

環境変数は **`CLAUDE_CONFIG_DIR` / `SystemRoot` / `TEMP` の 3 つだけ**を与えた
(`ENUMERATION_ENV_ALLOWLIST` + config ディレクトリ。FR-050 / SC-016)。

| 確認項目 | 結果 |
| --- | --- |
| バンドルが `electron` を require するか | **0 件**。`require("@anthropic-ai/claude-agent-sdk")` の 1 件のみ |
| 終了コード | `0` |
| 標準出力 | 行区切り JSON 1 行。`kind` / `version` / `targetKey` が期待どおり |
| 標準エラー | **空** |
| ホストの config ディレクトリ | 成立 |
| **WSL の config ディレクトリ (UNC 経路)** | **成立** |

**`process.parentPort` を使わずに成立している。** Principle VII Statement 後半
(「単独起動でき、標準入出力経由でプロトコルを話せる形を保つ」) を、
機械検証ではなく**実際の起動**で確認した — `parentPort` は import を伴わないため
ESLint にも依存グラフにも現れず、**機械検証が緑でも守れていない形になりうる**
([AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) Consequences)。

---

## 実装時の再測定 (H-021 の履行)

design-gate の H-021 は「SC-008 の予算が research 内部で 3 倍ぶれる。
**実装中に実測し直す**」を残していた。その再測定である。

**条件**: 実バンドル + 実 config ディレクトリ。1 回の列挙ごとに**冷えた子プロセス**を起こす
(AD-028 §1 の「要求 1 回」の寿命。**プロセス再利用による短縮を含まない**)。

| 対象 | scope | 所要 | 件数 | programmatic | worktree を含む `cwd` |
| --- | --- | --- | --- | --- | --- |
| ホスト既定 | 全件 | 1,330 ms | 51 | 8 | 3 |
| ホスト既定 | 先頭 50 | 1,262 ms | 50 | 8 | 3 |
| WSL (Ubuntu-26.04) | 全件 | **3,309 ms** | **276** | **40** | 7 |
| WSL (Ubuntu-26.04) | 先頭 50 | **1,823 ms** | 50 | 0 | 1 |

### 読み取れること

**1. `programmatic` の 2 回列挙は正しく効いている。**
WSL 全件の 40 件は [research.md](research.md) R-09 の実測 (269 件中 40 件) と一致する。
`SDKSessionInfo` にこの項目は無く、`includeProgrammatic` は**フィルタであって区別子ではない**
(design-gate L-002) ため、既定の結果と除外した結果の**差集合**で決めている。

**先頭 50 件で 0 件なのは誤りではない。** 2 つの結果は同じ順序で並び、
除外側は既定側の部分列であるため、既定側の先頭 N 件の所属は除外側の先頭 N 件で決まる。
この config ディレクトリでは programmatic なセッションが古い側に寄っていた。

**2. 支配的な費用は子プロセスの起動と SDK の import である。**
research R-01 は「冷えた子プロセスで import + 1 回の列挙 = 2,171 ms」を測っていた。
本測定の WSL 先頭 50 件が 1,823 ms であり、**2 回列挙を含めてなお当時の単発測定より速い**。
つまり 2 回列挙の追加費用は、起動費用に比べて小さい。

**3. SC-008 の予算に対する余裕は小さい。**

| SC-008 の要求 | 実測 | 判定 |
| --- | --- | --- |
| 先頭 50 件の**描画**が 2 秒以内 | 列挙だけで 1,823 ms (WSL) | **余裕が約 180 ms しかない** |
| 1 所在あたり 700 件規模の全件が 10 秒以内 | 276 件で 3,309 ms | 外挿で約 8.4 秒。**予算内だが余裕は小さい** |

**[RISK]** 先頭 50 件の予算は、列挙が終わってから描画するなら満たせない可能性がある。
**FE-040 以降で「列挙の完了を待たずに枠を描く」形にする**必要がある
(R-1 が capability 未判定の descriptor を先に返したのと同じ扱い)。
満たせないと判明した場合は、予算の見直しではなく**描画の開始点の見直し**を先に検討する
— 予算は SC-008 として人間が承認した値である。

**[ASSUMED]** いずれも開発ホスト 1 台の実測である (spec の `## Assumptions` と同じ限界)。

---

## SH-083: 依存グラフが `src/agents/` の実コードに対して発火するか

**日付**: 2026-09-18

| 確認 | 結果 |
| --- | --- |
| `depcruise src` (実コードあり) | **違反 0 件** (159 modules / 634 dependencies) |
| `agents-electron-transitive` の違反サンプル | **発火する** (`test:rules` 26 件一致に含まれる) |
| `agents → electron` の直接・`src` 内推移 | **0 件** |

**限界を明記する (design-gate H-023)。**
`.dependency-cruiser.js` は `doNotFollow: node_modules` を設定しており、
**npm パッケージの内部は辿らない**。R-2 で `agents` が Agent SDK を import したため、
`agents → SDK → (何か)` の経路はこの規則では見えない。
**「ルールが実コードに効いた」と言えるのは `src` 内の到達についてだけである。**

**代わりの証拠はビルド出力**であり、こちらのほうが直接的である。

| 証拠 | 結果 |
| --- | --- |
| `out/main/enumerate-sessions-*.js` の `require` 一覧 | `@anthropic-ai/claude-agent-sdk` の **1 件だけ** |
| 同バンドル内の `electron` 参照 | **0 件** |
| Electron 抜きの `node` での列挙 | **成立** (上記 V-0) |

---

## 未実施

| 項目 | 待っているもの |
| --- | --- |
| V-1 〜 V-5 (画面からの通し確認) | FE-040 以降 |
| SC-001 の突き合わせ (SDK 直接呼び出しとの識別子集合の一致) | 一覧画面 |
| SC-004 の前後比較 (config ディレクトリの差分 0) | 画面経由の列挙 |
| SC-003 (`wsl.exe` 0 件) | SH-082 |
