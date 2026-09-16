# Track A: speckit-analyze (round 4)

**Run**: 2026-09-14 | **Track**: A (機械的 consistency 検査)

`speckit-analyze` の artifact load → semantic model → 検出パス A–F → severity assignment に従い、上流 SSoT (constitution v1.1.0 / charter 4 本 / glossary / accepted ADR の frontmatter・Title・Decision Outcome・Confirmation) を照合した。

## 初回読了 viewpoint

| | 観点 | 通過 | 備考 |
|---|---|---|---|
| A | 状態・値の網羅性 (enum / 判定表の直積) | ⚠ | §3 判定規則表 × §8 第 2 段で 1 行乖離 → F-001 |
| B | 識別子と名前空間の粒度 (`host` / `unc:<D>` / `wsl:<D>`) | ⚠ | browse 経路の `PathDTO` の種別が未確定 → F-002 |
| C | 境界の一貫性 (IPC / 永続化 / DTO) | ⚠ | 同上。null 可能性 1 件未定義 → F-005 |
| D | 参照解決 (FR / SC / AC / § / タスク ID / ファイル) | ✅ | US-2・US-3 の採番変更後も全参照が解決 |
| E | 上流 SSoT の引用一致 | ⚠ | 本文引用は全件一致。帰属主張が 1 件不一致 → F-006 |
| F | FR↔task 被覆 / SC↔計測経路 | ✅ | 欠落 0 件 |
| G | 検証ステップを拘束する件数の整合 | ⚠ | 15 箇所中 1 件不一致 → F-003 |
| H | 順序・依存 | ✅ | 第 1〜3 段の順序固定、SH-023 > SH-017、SH-043 / SH-049 の前提条件すべて整合 |

## Findings

### [High] F-001 実行中の WSL1 が「変換材料あり」と判定され、全 Windows フォルダが誤って「到達不可」になる

- **Where**: `data-model.md` §3 判定規則表 / §4 `pathMapping` 行 / §8 第 2 段 / `spec.md` FR-004 / `contracts/runtime-detection.md` C-1 / `tasks.md` BE-025
- **観察**:
  - §8 第 2 段は `state` と `probeState` だけで分岐し、`running` + `done` を無条件に第 3 段へ送る。第 3 段は `WslRuntime` について `pathMapping` の接頭辞照合を要求する。
  - §3 判定規則表は WSL1 に `probeState: done` を与える。一方 FR-004 と BE-025 は WSL1 を「実地テストを行わず固定値を導出する」と定め probe を発行しない。§2 と §4 は `pathMapping` を「**probe が完了するまで未取得**」と定義する。
  - したがって「実行中の WSL1」は `probeState: done` かつ `pathMapping` 不在で第 3 段に入り、所在 `windows` のフォルダはすべて `path-not-mapped` → **unreachable** になる。FR-028 により選択肢から消え、利用者には「このドライブは選んだランタイムから見えない」と**誤った理由**が提示される。
  - 逆に C-1 は「`verifyRunning()` の後、**実行中のもの**に `probe` を並列発行する」と書いており、字義どおりなら実行中 WSL1 にも probe が飛ぶ。これは FR-004 / BE-025 と衝突する。**どちらに倒しても文書間で要求が割れる。**
  - 参考: C-5 の「バージョン列挙だけが失敗」行は `probeState: failed` に倒して同じ穴を塞いでいる (round 3 で追加)。**WSL1 だけがその扱いを受けていない。** §4 の状態遷移図も `done` への到達を `probing` 経由でしか描いておらず、Win32 / WSL1 の直接 `done` を含まない。
- **同種事象探索**: §3 判定規則表の全 7 行を §8 第 2 段の分岐と §4 の `pathMapping` 保有条件に突き合わせ、さらに C-5 の失敗 4 行と §4 状態遷移図の 5 状態を照合 — **7 行中 1 行が乖離 (WSL1)、他 6 行と失敗 4 行は整合**。`kind === 'win32'` は §8 第 2 段で明示免除されており乖離なし。
- **リスク**: WSL1 ディストロを 1 つでも持つホストで、Windows 側フォルダ × その WSL ランタイムの組み合わせが**理由を偽ったまま**選択肢から消える。US-1 AC-4 が WSL1 を正規の検出対象に含めているため例外経路ではない。SC-007 の網羅テスト (BE-051) は §8 の全セルを回すが、§3 の行と §8 のセルの対応が定義されていないためこの穴を検出しない。
- **推奨アクション**: §8 第 2 段の分岐鍵を `probeState` から「**`pathMapping` の有無**」に改める (Win32 の免除は維持)、または §3 の WSL1 行を「`probeState: done` かつ `pathMapping` 取得のためだけに probe を 1 回発行する」と明記して C-1 の「実行中のもの」の意味を確定させる。どちらでも BE-021 / BE-051 に WSL1 の行を 1 本足す。

### [High] F-002 browse が返すパスの名前空間の**種別**が未確定で、`unc:<D>` を返すと WSL フォルダの登録が全件はねられる

- **Where**: `contracts/ipc-capability.md` 作業フォルダ節 / DTO 節 / 検証表 / `contracts/runtime-detection.md` ファイル列挙節 / `data-model.md` §1 / §6 不変条件
- **観察**: round 3 で `DirEntryDTO` は `{ name, isDirectory, path: PathDTO }` に、`browseDirectory` は `{ cwd, parent, entries }` に変わった。`NamespaceId` は同じ round で 3 種別になった。列挙の実体は UNC である (「UNC 値の名前空間識別子 (`unc:<distro>`) の一致を検証する」「子・親のパスは呼び出し元に完成した値として返す」)。一方、登録は `isNamespaceConsistent()` を通す必要があり、§6 は所在 `wsl:<D>` に対して **`wsl:<D>` の `RuntimePath`** を要求する。**`cwd` / `parent` / `DirEntryDTO.path` / `target.of` のどの種別で IPC を渡るのかは、どの文書にも書かれていない。** 検証表の `target` の行も「ディストロ名まで」としか書いておらず `unc:` と `wsl:` のどちらでも通る。素直に実装すると `unc:<D>` が返り、その `cwd` から作った draft は `registerFolder` で全件 `namespace-mismatch` になる。逆に `wsl:<D>` を返すなら UNC → `RuntimePath` の変換点が契約のどこにも置かれていない。§1 は「1 つの型に 2 つを同居させない」「3 つの型は相互に代入できない」と定めており、種別の未確定は名前空間モデルの前提そのものに掛かる。
- **同種事象探索**: `PathDTO` を運ぶフィールドを全数列挙し名前空間**種別**の確定状況を照合 — **9 フィールド中 4 件が確定、5 件が未確定**。確定: `WorkspaceFolderDTO.path` / `WorkspaceFolderDraftDTO.path` / `FolderRuntimeResolutionDTO.runtimePath` / オンディスクの `folders[].path`。未確定: `DirEntryDTO.path` / `cwd` / `parent` / `target.of` / `RestoreIssuesDTO.backupPath` (最後はホスト以外ありえず実害なし)。**実害のある未確定は browse 経路の 4 件**で同一原因。
- **リスク**: US-2 AC-3 (P1 の主経路) が実装で成立しないか、成立させるために `unc:` と `wsl:` を境界上で同一視する実装になる。後者は round 3 C-003 が「別ディストロのパスを取り違える唯一の防御」として `unc` をディストロ粒度に分けた判断を、粒度ではなく**種別**の側から無効化する。
- **推奨アクション**: browse 節に「`cwd` / `parent` / `DirEntryDTO.path` / `target.of` はすべて所在の名前空間 (`wsl:<D>`) の `PathDTO` とし、UNC 形式は `infra/fs` の内側に閉じる」を加える。検証表の `target` を「ディストロ名まで一致」に加えて「**種別が所在の名前空間と一致**」に拡張する。BE-043 / BE-046 も合わせる。

### [Medium] F-003 glossary への追加語が §10 では 7 語、タスクと quickstart では「6 語」

- **Where**: `data-model.md` §10 / `tasks.md` SH-033 / `quickstart.md` V-7
- **観察**: §10 の追加は 7 語 (round 3 の L-003 で `WslUncPath` が追加された)。SH-033 と V-7 は「**追加 6 語**」と書く。実物の `docs/glossary.md` には 7 語とも未登録 (既存 4 項目は存在)。V-7 は FR-046 の**受け入れ検証手順**であり、件数がそのまま合否条件になっている。**6 語で満たしたと判定され `WslUncPath` が未登録のまま R-1 が完了しうる。** round 3 の L-003 の修正が §10 だけに入り、参照側 2 箇所に伝播していない。
- **同種事象探索**: 検証ステップが件数でリストを拘束している箇所を全数照合 — **15 箇所中 1 件が不一致**。AD-024 17 項目 ✓ / R-08 9 項目 ✓ / SC-001 11 ケース ✓ / 既存 4 項目 ✓ / Detected synonyms 2 行 ✓ / FR-037 の 6 つ ✓ / 実地判定 4 項目 ✓ / README 3 節 ✓ / 違反サンプル 2 群 ✓ / 列挙 3 系統 ✓ / `wsl.exe` 4 形態 ✓ / 判定 3 段 ✓ / 画面 3 つ ✓ / 到達可能性 3 値 ✓ / **追加 6 語 ✗**。
- **推奨アクション**: SH-033 と V-7 を「追加 7 語」に改めるか、双方を件数を持たない表現にする。

### [Low] F-005 `browseDirectory` の境界状態 (ルート位置の `parent`) の値が未定義

- **観察**: 出力は `{ cwd, parent, entries }`、`target` は `{ root } | { child; of; name } | { parent; of }` と定義されるが、**ルートを表示している状態での `parent` の値** (null かルート自身か) と、ルートに対する `{ kind: 'parent' }` の扱いが定義されていない。同ファイル内の他の DTO は null 可能性を明示している。ルート表示はフォルダブラウザを開いた直後に必ず通る状態である。
- **同種事象探索**: null を取りうる境界フィールドを全数照合 — **8 件中 7 件が明示、1 件 (`parent`) が未定義**。
- **推奨アクション**: `parent: PathDTO | null` と明記し、ルートに対する `{ kind: 'parent' }` は現在地を返す、と 1 行加える。

### [Low] F-006 checklist の「SC-005 / SC-011 は charter KPI を引いている」が charter の実体と一致しない

- **観察**: checklist の Notes は「SC-001 / SC-002 / SC-003 / SC-005 / SC-011 は `runtime` charter の KPI を引いており計測経路が charter 側で定義されている」として technology-agnostic のチェックを正当化している。charter の KPI は 4 件であり **SC-005 / SC-011 に対応する KPI は存在しない**。停止中ディストロの扱いは charter では Open Question として残っている項目である。SC-001 / SC-002 / SC-003 の帰属は正しい。
- **同種事象探索**: checklist Notes の上流帰属主張を全数照合 — **3 件中 1 件が不一致**。本体側の引用は全件一致を確認した (Constitution の Principle I Statement / XI Exceptions / XIV 本文 / 未解決候補 #2 / III / VII / IX / VI / II / XIII / XV / Governance、AD-016 の 800 倍・1,180 倍、AD-023 §7 §8 と Open Question と公開 ID、isolation charter 2 箇所、AD-020、session charter KPI、`_overview.md`)。
- **リスク**: SC-005 / SC-011 の計測経路は spec 本文に直接書かれているため計測不能にはならない。影響は checklist の根拠文だけ。
- **推奨アクション**: 当該行を「SC-001 / SC-002 / SC-003 は charter KPI を引く。SC-005 / SC-011 は計測経路を spec 本文に持つ」に分ける。

## 同種事象探索 cascade summary

| ID | 探索軸 | 対象数 | 該当 | 残余の所在 |
|---|---|---|---|---|
| F-001 | §3 判定規則表の全行 × §8 第 2 段の分岐 × §4 の mapping 保有条件 (+ C-5 失敗 4 行、§4 状態遷移 5 状態) | 7 行 | **1** | WSL1 行のみ |
| F-002 | `PathDTO` を運ぶ全フィールドの名前空間**種別**の確定状況 | 9 | **5** (実害 4) | browse 経路 4 件が同一原因 |
| F-003 | 検証ステップが件数でリストを拘束している箇所 | 15 | **1** | 「追加 6 語」のみ |
| F-005 | null を取りうる境界フィールドの明示状況 | 8 | **1** | `parent` のみ |
| F-006 | checklist Notes の上流帰属主張 | 3 | **1** | charter KPI 帰属のみ |
| — | FR / SC / AC / § / タスク ID / ファイルパスの参照解決 | 全参照 | **0** | US-2 (1–14) / US-3 (1–17) 採番変更後も全参照が正しい本文を指す |
| — | 新規値の到達可能性 (`UnreachableReason` 5 / `BlockedReason` 3 / `ResolutionStep` 3 / `RestoreIssueReason` 4 / `BrowseError` 6 / `CrossBoundaryStep` 3) | 24 値 | **0** | 全値に produce 箇所と利用者向け意味が割り当たっている |

## FR / SC coverage verdict

- **FR-001〜FR-048: 被覆 48/48 (100%)**。ID が tasks.md に直接現れるもの 40 件、内容一致で対応するもの 8 件。**ゼロ被覆の FR は 0 件**
- **SC-001〜SC-017: 計測経路 17/17**。すべてが tasks.md と quickstart.md の双方から参照される。SC-008 の拘束は SH-013 / SH-014 が実装対象として引き受けており SC-017 は明示的にその 3 経路を除外している — **round 3 の H-004 は完全に閉じている**
- 上流 SSoT 追随タスクの被覆: plan「上流 SSoT の追随」表の 8 行すべてに担当タスクがある

## Verdict

**Critical 0 / High 2 / Medium 1 / Low 2**

**round 継承**: round 3 の 20 件は **20 件すべて解消済み**を確認 — 未解消 0 件。本 round の 5 件はすべて新規で、うち **2 件が round 3 の修正の残余** (F-002 は `browseDirectory` / `DirEntryDTO` 改形が名前空間種別を未確定のまま残したもの、F-003 は §10 の追加が参照側 2 箇所に伝播しなかったもの)。F-001 は §8 3 段化そのものの欠陥ではなく、**3 段化によって既存の WSL1 の扱いの穴が第 2 段の分岐鍵として露出した**もの。F-005 / F-006 は独立。

**Track A としては Critical 0 のため gate 通過を妨げない。** ただし F-001 / F-002 はいずれも P1 User Story の主経路で誤った利用者体験を生む経路であり、implementing へ進む前の修正を推奨する。

> 参考・報告対象外: 前 round の記録 `design-gate.md.20260914-round3` は M-001 の修正を `sandboxKey` と記録しているが bundle 側は `sandboxKind` で統一されている。bundle 内部は自己整合しており差異は archive された gate 記録側のみ。
