# architecture-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-14 | **Round**: 4

## 初回読了 viewpoint

- A / B: 該当なし: `security-reviewer` の Owner 範囲 (IPC 検証表も security 側)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:0
- D. Constitution / ADR drift / layering: Critical:0 High:0 Medium:1 Low:0
- E: 該当なし: `po-reviewer` / F: 該当なし: `convention-reviewer` / G: 該当なし (DB / HTTP API 無し)
- H: 該当なし: 自 owner 範囲の検証経路は SC-008 / SC-009 / SH-023 で塞がれている

> **Owner 境界**: `platform-boundary-reviewer` が Principle I / II / III / VI / VII と AD-003 / AD-004 / AD-012、および `runtime` / `isolation` charter の Out of scope 侵犯を占有する。本 reviewer はそれ以外 (Principle XI〜XV / Governance、AD-015 / AD-016 / AD-023、`ui` / `session` charter、`_overview.md`) を扱う。

## Findings

### [Medium] `ui` charter が In scope に掲げる「Electron 特有の配線 (preload / IPC)」を本 feature が確定させるが、SSoT 追随表に `ui/charter.md` の行が無い (M-001) `[residual from round 2 H-003 (b)]`

- **観察**: `docs/domains/ui/charter.md:41` は In scope に「Electron 特有の配線 (preload / IPC 越しのストリーミングブリッジ)」を挙げる。本 feature は BE-008〜BE-011 で **preload と IPC プロトコルの形を以後の全 feature ぶん固定する** (DTO の置き場所まで)。plan の「上流 SSoT の追随」表に `ui/charter.md` の行が無い。round 2 H-003 は同じ問題の (a) 面 (`runtime` charter) を指摘して修正されたが、**(b) 面「3 画面が `ui` charter の管理外に置かれる」は残っている**。
- **同種事象探索**: `preload|IPC` を `docs/domains/` で **2 件**。charter 更新タスクは **3 本** (SH-042 / SH-043 / SH-049)。**`ui` / `provider` charter を更新するタスクは 0 件**。
- **リスク/影響**: (a) 完了時点で `ui` charter は「preload / IPC 配線は `ui` domain の In scope」と宣言し続ける一方、実体は `runtime` feature が `app` レイヤで確定させている。X-1 が MessagePort ブリッジを足すとき**どちらの domain の spec で切るかを charter から判断できない**。(b) AD-024 #15 で Principle XI Exceptions が改まると **Constitution 側で R-1 を非 UI feature と位置づける記述が消える**。plan の Constitution Check は XII を「N/A — 対象は UI 系 feature」と判定しているが、その「UI 系 feature」の定義は Constitution にも charter にも無く、`_overview.md:40` は「各 domain に表示責務を散らすと Principle XII の持ち主がいなくなる」と警告している。
- **推奨アクション**: 追随表に `ui/charter.md` を追加し SH-050 を立てる — (1) In scope の「Electron 特有の配線」を「ストリーミングブリッジ (MessagePort) の設計」に限定し preload / IPC 基盤は `app` レイヤの責務 (AD-023 §1) と明記、(2) Out of scope に「他 domain の操作 UI → 各 domain」を追加。plan の XII 判定根拠を「対象は Claude Code が emit する情報を表示する feature。本 feature は emit 情報を表示しない」に置き換える。
- **根拠**: `ui/charter.md:41` / `_overview.md:35-40` / Principle XII / AD-023 §1

### [Medium] 所在 WSL × `Win32Runtime` の「到達不可」が未検証の仮定のまま判定表に固定され、X-1 への申し送りが 0 件 (M-002) `[new]`

- **観察**: 第 1 段は所在 `wsl:<D>` × `Win32Runtime` を `unreachable` (`unc-cwd-unsupported`) と定め、文言を「**WSL の中にあるため、Windows のランタイムからは開けない**」と**事実として断定**する。根拠は `spec.md` の `[ASSUMED]`「UNC パスを cwd とするネイティブ Windows プロセス起動は **AD-015 で検証されていない**」であり、「不可能である」ではなく「未検証である」。一方 AD-016 は逆方向について `wsl.localhost` 単一ファイル読みを 32 ms と記録し、**同じく未測定のケース (コンテナ bind mount) は「選択可能にしたうえで明示する」**扱いにしている。R-1 の判定表は X-4 / I-1 / X-1 が拡張する SSoT であるため、この 1 セルは**起動契約を持つ `session` domain が再検討する機会を持たないまま固定される**。
- **同種事象探索**: `unc-cwd-unsupported` で **3 件** + 派生 2。`X-1` で **5 件**、全件スケジュール記述で **UNC cwd の検証を X-1 に送る行は 0 件**。`research.md` の「意図的に扱わない調査項目」表 **12 行に該当行は 0 件**。AD-025 記録項目 6 件にも無し。
- **リスク/影響**: (a) 仮定が誤りなら利用者は `wsl.localhost` 配下を `Win32Runtime` で開く選択肢を**理由の提示すらなく**失う。断定文言のため再検討の契機が残らない。(b) AD-016 §2 の「選択不可にしない」姿勢と非対称。(c) `session` charter Journey 2 は R-1 の到達可能性表を入力にするため、X-1 の設計者は仮定の存在を知らずに継承する。round 3 M-003 と**同一形の残り 1 件**。
- **推奨アクション**: (1) `research.md` の申し送り表に 1 行 —「ネイティブ Windows プロセスの cwd に UNC パスを与えられるか | X-1 | R-1 は未検証のまま到達不可に倒している。X-1 で検証し、可能なら当該セルを `reachable` / `cross` に改める」。(2) AD-025 の記録項目にも同じ申し送り。(3) 文言を「開けない**扱いにしている**」相当に改め断定を避ける。**判定表そのものの変更は要求しない** — 安全側の既定として妥当であり、変えるべきは「再検討の宛先が無いこと」。
- **根拠**: AD-016 Decision §2 / Open Questions 4 / `session` charter Journey 2 / `spec.md` の `[ASSUMED]`

### [Medium] AD-024 #13 / #1 が改める旧表記を `.claude/agents/platform-boundary-reviewer.md` が本文に固定しており、追随表にもタスクにも無い (M-003) `[new]`

- **観察**: AD-024 #13 は Principle III の「`autoModeSafe === false` を前提」を「`!== true`」に、#1 / #2 は Principle VII の検査対象を `src/supervisor/` から `src/agents/` に改める。plan はこの改定が**伝播しないと事故になる**と自ら認識し、`isolation` charter の 2 箇所に「I-3 のゲートが素通りするため着手前に必須」と注記して SH-043 を立てている。同じ表記は **gate を実行する reviewer 定義にも固定されている** — `platform-boundary-reviewer.md:72` (`autoModeSafe === false`)、`:109` (`supervisor/`)。plan の追随表と SH-019 が対象にしているのは `.specify/spec-gate/reviewers.yml` **のみ**。
- **同種事象探索**: `.claude/agents/` を `supervisor|=== false|src/isolation|exclude-dir` で **3 件** (影響あり 2)。plan 追随表 + `tasks.md` で `.claude/agents` は **0 件**。比較: `reviewers.yml` は SH-019、`plan-template.md` は round 3 で SH-047 にカバー済み。**未カバーは `.claude/agents/` の 2 行のみ**。
- **リスク/影響**: AD-024 accepted 後も、Principle III / VII を owner として検査する reviewer の観点本文が旧条件を述べる。`platform-boundary-reviewer` は PB-4「権限ゲートの迂回」を `=== false` で定義しているため、**I-3 が `unknown` を `false` 側に落として素通りさせる実装を出しても、観点本文どおりに読めば指摘根拠を持たない**。plan 自身が SH-043 を必須とした理由と同一の経路。緩和材料として `reviewer-base.md:26`「project 固有情報を hardcode せず Constitution から動的に読む」があるため Medium 止まり。
- **推奨アクション**: 追随表に `.claude/agents/platform-boundary-reviewer.md` を追加し、SH-019 の対象を「`reviewers.yml` と `.claude/agents/` 配下で Principle の条件式・ディレクトリ名を本文に持つ箇所」に広げる。
- **根拠**: Constitution 改定手順 / Principle III / VII / `reviewer-base.md` Owner Matrix

## round 3 指摘の閉鎖確認

| round 3 ID | 閉鎖の実証 | 判定 |
|---|---|---|
| H-001 Principle I Statement | #14 / Constitution Check I を ⚠ + #14 参照 / 追随表に `plan-template.md` / `PLAN.md` / re-check に I 行 / SH-047 が両ファイルを対象化。`runtime.path` 全 8 件のうち**未計画は 0 件**に | **閉** |
| M-001 XI / XIV / 未解決候補 #2 | #15 / #16 / #17 / re-check を Principle 別に分解 / SH-017 が「17 項目」と明記 | **閉** |
| M-002 `sandboxLabel` | `sandboxKind` に変更、閉じた参照キーと再導出禁止の担保を明記 | **閉** |
| M-003 `session` 申し送り | 追随表に session charter / SH-049 / 「R-2 着手前に必須」/ AD-025 の申し送り 2 件 / research 表 | **閉** |
| L-001 `autoModeSafe` 矛盾 | 導出式が `!判定済み ? 'unknown'` に変わり不変条件と一致 | **閉** |

### 検査したが指摘に至らなかったもの

- **AD-024 の網羅性**: Constitution 全文を対象に洗い出した結果、**Principle I〜XV・未解決候補・Existing violations summary のすべてが 17 項目または既存タスク (SH-022 / SH-023) に割り当たっている**。残余は M-001 の XII の適用判断のみ
- **version bump**: **MINOR (v1.2.0) を維持して差し支えない**。#14 / #15 は禁止範囲を**狭める**改定であり v1.1.0 適合物は v1.2.0 でも適合する。唯一の強化 #13 は改定手順 step 5 が「NON-NEGOTIABLE 強化時は既存違反 enumeration」として MAJOR ではなく enumeration 経路に割り当てており、plan と SH-023 がそれを踏んでいる
- **data-model §8 と AD-016 / AD-003 / AD-004 / AD-015**: 第 3 段は `windows` × `WslRuntime` と Windows マウント配下をいずれも `reachable` / `cross` として選択肢に残すため AD-016 §2 と整合。`blocked` は選択肢に出す。第 2 段は `Win32Runtime` を常に素通しさせるため AD-003 と衝突しない。M-002 の 1 セルを除き drift なし
- **`unc:<distro>` と AD-004 / AD-012 / I-1 拡張点**: `compose(a,b)` を `a.to === b.from` で定義したことで AD-012 の 2 ホップが同一機構で表現できる。`NamespaceId` は `container:*` / `direct:*` の追加を明示、`RuntimeDescriptor.id` は endpoint を含める規約を保持。新たな整合不良は検出されず
- **charter の In/Out of scope 侵犯**: 残るのは M-001 の `ui` charter のみ

## Verdict

- **Critical: 0 / High: 0 / Medium: 3 / Low: 0**
- Round inheritance: resolved from round 3: **5** (全件実文で閉鎖を確認) / unresolved: **0** / new: **3** (M-001 は round 2 H-003(b) の残余、M-002 は round 3 M-003 と同型の最後の 1 件)

> Critical / High が 0 なのは、**この設計のまま実装して accepted な決定に正面から反する経路が観察されなかった**ことを意味する。残る 3 件はすべて「本 feature が確定させる事実に追随すべき上流 SSoT のうち追随表から漏れている行」であり、いずれも Polish フェーズのタスク 1〜2 行で閉じる。

## 意図的に報告しなかったもの

`sandboxKey` / `sandboxKind` の語句不一致 / AD-024 の項目数表記 / `constitution.md:473`「`docs/domains/` は未作成」(本 feature が偽にした記述ではなく既存 drift。AD-024 #16 と同型なので起票時に同梱すれば追加コストは無い、という助言に留める) / 改定手順 step 2 の人間レビューが tasks に無いこと / Principle I の見出しと Good 例の文言 / パス API 実装と AD-023 §7 の関係 / 命名・module 配置・User Story / SC の文言・実装手段の不記載
