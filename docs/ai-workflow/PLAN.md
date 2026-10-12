# Claude Code の進め方の見直しと導入計画 (closta)

## 0. 冒頭

### 結論

**あるべき姿**（§1）: 機能を 1 本ずつ「spec → 実装 → gate → merge」まで閉じてから次に進む。品質は「機械の検査」と「Critical で止める gate」で保証し、そこは変えない。コストは「main の文脈」と「gate の round」と「作り直し」を減らして下げる。

そのために変えるのは次の 5 つ（§6）。

1. **main は実装しない。** 実装は implementer（Sonnet 5.5）に任せ、段ごとに `/clear` する
2. **gate の round を減らす。** Critical で止める規則は変えない。High はその round の中で直す。Medium / Low は直さず、マイルストーンの終わりの整理に回す。round は 3 回まで
3. **spec は次の 1 本だけ設計する。** 依存先が main に入るまで、次の design を起こさない
4. **プロンプトは短くする。** 範囲と義務の正本は roadmap の行にし、`/cl-spec` がそこから読む
5. **マイルストーンの終わりに整理する。** Medium / Low と、持ち主の決まっていない申し送りは、そこで 1 回だけ扱う

### 改訂の経緯

- 初版では、軽い入口（`/cl-quick`）と 3 段階の優先度を提案した。0 からの開発では使う場面がないと指摘を受け、取り下げた
- 第 2 版では、今までの spec の扱い、プロンプト、品質が保たれる根拠、今後の進め方を決めないまま、段階 1・2 を作業ツリーに入れた
- 本版（第 3 版）では、先にあるべき姿を定義し、入れた変更をそれに照らして見直した。§6 の「状態」の列に、入れたもの・直したもの・これから入れるものを示す。**AD-050 は proposed に戻した**（パイロットの結果を見てから accepted にする）

### 基点と作業場所

| 項目 | 値 |
|---|---|
| 基点コミット | `946c47d8f8630dc931b2f1ce36c906d81f0350e4` (`docs(ui): record O-5 Q1-Q3 approval ...`) [確認済] |
| ブランチ | `015-ui-mcp-elicitation-commands` [確認済] |
| commit | していない。作業ツリーには 015 の未コミット変更と、本計画の変更（§6）が混ざっている。分け方は §5.1 |
| 調査日 | 2026-10-12 |

---

## 1. あるべき姿

| 観点 | あるべき姿 | 今 | 差 |
|---|---|---|---|
| **進め方** | 機能を 1 本ずつ「spec → 実装 → gate → merge」まで閉じてから、次の design に進む。段ごとに文脈を切り、受け渡しはファイルで行う | 夜間に 4 本の design を前倒しで起こした。1 本の会話で全段をつないでいた（平均 6.8 時間） | 前倒しの design と、閉じない会話 |
| **役割** | main は人との対話と段の切り替えだけ。設計は designer（Opus）、実装は implementer（Sonnet）、判断は reviewer（中核は Opus）、機械の実行は Haiku | main が `src/` の編集の 6 割を行っていた。全 agent が Opus | main の実装と、モデルの一律 Opus |
| **spec** | 1 つの spec は単体で確かめられる 1 つの機能。依存先が main に入ってから書く。完了した spec は変更の記録として残し、さかのぼって直さない。機能をまたぐ正本は charter / ADR / glossary / ui-coverage が持つ | 前倒しの 3 本を作り直した。FR の上限に合わせて切り出した spec がある | 書く時点と切り方の規則 |
| **プロンプト** | `/cl-design "[domain] <ID>: <1〜3 文>"`。範囲と義務の正本は roadmap の行で、`/cl-spec` がそこから読む | O-3 / O-10 のプロンプトに義務の一覧が直接書かれている（docs/prompts.md の「1〜3 文」の規則と食い違う） | 義務の運び方 |
| **品質** | 機械の検査（型・lint・depcruise・Constitution の 21 項目・vitest・ルール検証・CI の E2E）と、Critical で止める gate と、人の承認で保証する。reviewer は正しさと要件に関わる指摘に絞る | 機械の検査と Critical の扱いは機能している。PASS の後も Medium / Low を直して round が増えていた | 指摘の扱い |
| **残課題** | Medium / Low と、持ち主の決まっていない申し送りは、マイルストーンの終わりに 1 回だけ棚卸しし、直すものを 1 本の整理の spec にまとめる | roadmap の申し送りは 42 件。そのうち約 10 件は「次に X を触る feature」のように持ち主の feature が決まっていない。design のたびに拾い直している | 扱う時点 |
| **コスト** | 1 人あたり週 $250 以内（Enterprise の枠） | Opus 5.5 換算で週約 $770 | −68% |

### 変えないもの

- `/cl-design` → `/cl-implement` → `/cl-code-gate` → `/cl-pr-gate` → `/cl-done` の流れ
- Critical が残っていれば次の段に進まない規則（pr-gate は pure hard gate）
- 機械の検査の範囲（tsc / ESLint / dependency-cruiser / Constitution 検証 / vitest / `test:rules` / CI）
- reviewer の発火条件（reviewers.yml と registry の `invoked_by`）
- 人の承認が要る判断（domain の分解、Constitution Principle の採否、spec の U 項目）
- 中核の reviewer（architecture / security / platform-boundary）、po-reviewer、designer のモデル（Opus）

---

## 2. 品質は保たれるか

変更ごとに、どの品質に影響するか、何がそれを守るか、劣化をどう検知するか、いつ戻すかを示す。

| 変更 | 影響しうる品質 | 守る仕組み（変えないもの） | 劣化の検知 | 戻す条件 |
|---|---|---|---|---|
| implementer を Sonnet 5.5 に | 実装の正しさ | 機械の検査すべてと code-gate、pr-gate の中核 reviewer（Opus） | code-gate の iteration 数、テストの失敗率（基準 22%）、pr-gate で実装に起因する Critical / High の数 | 013 / 014（Opus の implementer）の実績を上回ったら Opus に戻す。SDK の境界・権限ゲートの section だけを Opus にする中間案もある |
| 補助の reviewer（ux / a11y / database / ui-coverage / convention）を Sonnet に。po は Opus のまま | UX・a11y・永続化・対応表・命名の判断 | ui-coverage は Constitution の項目 21 で機械照合。命名は lint。a11y の一部は E2E。中核の reviewer と po は Opus のまま | merge の後に人や CI が見つけた、補助の reviewer の観点の Critical / High | 1 件でも出たら、その reviewer を Opus に戻す |
| Medium / Low を直さない | 保守性（負債の蓄積） | 指摘は各 spec の gate の出力に残る（git で追跡される最終版）。マイルストーンの終わりに棚卸しする（§5.3） | 棚卸しで、同じファイル・同じ観点の Medium が複数の spec で繰り返されているか | 繰り返しが 3 件を超えたら、その観点を High に格上げする規則を reviewer-base に足す |
| round を 3 回までにする | なし（止まるだけ） | Critical が残れば次に進まない。人が範囲の調整か ADR を決める | 3 round で止まった回数 | — |
| pr-gate の round 2 以降の reviewer を絞る | 修正の副作用の見落とし | 修正差分に当たる reviewer は必ず起動する。ルール検証は規則が変われば再実行。CI | 次の round や CI で初めて見つかった Critical | 1 件でも出たら絞り込みをやめる |
| 段ごとの `/clear`、`autoCompactWindow` | 段をまたぐ判断の引き継ぎ | 受け渡しはすべてファイル（spec / plan / tasks / gate の出力 / verdict JSON） | compaction や `/clear` の後に、利用者が同じ指示を繰り返した回数 | 繰り返しが目立ったら `autoCompactWindow` を 500K に |
| main が実装しない | なし（向上） | — | `/cl-implement` の段で main が `src/` を編集した回数 | — |
| 次の 1 本だけ設計する | なし（向上。実際のコードを前提に設計できる） | — | design-gate をやり直した spec の数 | — |
| プロンプトを短くし、義務を roadmap から読む | 義務の取りこぼし | `/cl-spec` が roadmap の行を読み、spec に「義務の扱い」を書く。po-reviewer / architecture-reviewer が design-gate で照合する | design-gate で「義務の取りこぼし」の指摘が出た数 | 取りこぼしが出たら、cl-spec の読み方を直す |

**結論**: 機械の検査と Critical で止める仕組みは変えないので、正しさとセキュリティの下限は保たれる。下がりうるのは「判断の厚み」（補助の reviewer のモデル）と「保守性の細部」（Medium / Low）の 2 つで、前者は merge 後の発見で、後者はマイルストーンの棚卸しで検知する。どちらも agent の frontmatter や規則の 1 行で戻せる。

---

## 3. 今までの spec の扱い

| spec | 状態 | 扱い |
|---|---|---|
| 001〜014 | completed | 変更の記録として残す。さかのぼって直さない。gate の出力の Medium / Low は、M3 の棚卸し（§5.3）で M3 の分（010〜014）だけを見る。M1・M2 の分は見ない（その後の feature が同じ箇所を作り替えている） |
| 015 (O-5) | reviewing。pr-gate R1 は PASS 済み。US-3 の BE-032 / FE-031 の実装の途中 | そのまま進める。**残りは新しい規則で進める**: 実装は implementer（Sonnet）、pr-gate R2 では Critical / High だけを直す。R1 の分で直し済みの Medium は戻さない。R1 は `head` を記録していないので、R2 では reviewer を絞らない |
| 016 (O-6) | 古いブランチの上で design-gate R2 まで | 015 が main に入ってから載せ直す（O-3〜O-5 と同じやり方。新規の `/cl-design` はしない）。O-5 の実装と roadmap の義務に合わせて直し、`--from plan` で再開する。design-gate は新しい規則で回す。**前倒しの design の載せ直しは、これを最後にする** |
| O-8 / O-9 / O-10 | roadmap の行とプロンプトだけがある。spec はない | 別の feature のまま残す。どれも単体で確かめられる機能（実機計測 / 時間と活動の可視化 / 回答の UI）なので、統合しない。依存先（O-7 / O-3 / O-5）が main に入ってから、1 本ずつ design する |
| M4（I-1〜I-3）・M5（D-1） | roadmap の行とプロンプトだけ | 変えない。M3 の棚卸しの後に、順に design する |
| ブランチ `012-*-old`、`014-*-old`、`014-*-v2`、`015-*-old`、`origin/012-*-v2` | 載せ直しの前の履歴 | 012 / 014 は main に入ったので消してよい。015 は main に入ってから消す。016 は載せ直しが終わってから消す。**消すのは利用者の確認の後** |

---

## 4. プロンプトの扱い

### あるべき形

```
/cl-design "[<domain>] <ID>: <何ができるようになるかを 1〜3 文>" --targets <frontend|backend|both>
```

- 範囲・義務・依存の正本は **roadmap の `<ID>` の行**。プロンプトには書かない
- `/cl-spec` が roadmap の `<ID>` の行を読み、spec の「義務の扱い」の節に、各義務を「この spec で扱う / 扱わない（理由）」の形で書く
- design の前に起こす ADR があるときは、roadmap の行に書く（プロンプトには書かない）

### 今のプロンプト集（docs/prompts.md）の扱い

| 部分 | 扱い |
|---|---|
| 使い方の節 | 上の形に書き換える |
| M1〜M3 の使用済みのプロンプト | 「実際に使った入力」の記録として残す。直さない |
| O-8 / O-9 / O-10 と M4 / M5 の未使用のプロンプト | 着手するときに上の形に書き直す。義務の文は roadmap の行に移っていることを確かめてから削る（今は roadmap とプロンプトの両方にある） |

---

## 5. 今後の進め方

### 5.1 当面の順序

| 順 | 作業 | 備考 |
|---|---|---|
| 1 | 本計画の変更（§6）を 015 から分ける | main から `docs/ai-workflow` で始まるブランチを切り、§6 のファイルだけを commit して PR にする。015 の作業ツリーには同じ変更を残してパイロットに使う。015 の `/cl-done` では §6 のファイルを commit に含めない |
| 2 | 015 の実装の残り → code-gate → pr-gate R2 → `/cl-done` | パイロット 1（§7） |
| 3 | 016 を main に載せ直し、design-gate → 実装 → gate → `/cl-done` | パイロット 2 |
| 4 | O-8 / O-9 / O-10 を依存の順に 1 本ずつ | 依存: O-8 は O-7（済）、O-9 は O-3（済）、O-10 は O-5（015） |
| 5 | M3 の完了の確認と棚卸し（§5.3） | Constitution の項目 21 の M3 の残り = 0 |
| 6 | M4（I-1 → I-2 → I-3） → M5（D-1） | マイルストーンごとに棚卸し |

### 5.2 1 本の feature のサイクル

| 段 | 入口 | 動く場所 | 終わったら |
|---|---|---|---|
| 着手の確認 | — | main | 依存先が main に入っているか（roadmap の「依存」列） |
| 設計 | `/cl-design "[domain] <ID>: ..."` | main（spec）+ designer（plan / tasks）+ design-gate（fork） | `/clear` |
| 実装 | `/cl-implement <spec_dir>` | implementer（section ごとに直列）→ code-gate（fork）へ自動で連鎖 | `/clear` |
| レビュー | `/cl-pr-gate <spec_dir>` | fork + reviewer（並列） | Critical があれば implementer の fix モード → code-gate → 次の round。3 round まで |
| 提出 | `/clear` → `/cl-done <spec_dir>` | main | merge の後に main で completed の commit |

- 途中で気づいたこと: spec の範囲内なら tasks.md に追記して implementer に任せる。範囲外なら Out of Scope に 1 行書き、roadmap に載せる
- ツール・CI・ワークフローの修正: spec を切らない。通常のセッションで直し、`/code-review` を 1 回
- 夜間の自律作業: 上のサイクルの中だけで動く。依存先が main に入っていない feature の design は起こさない [要判断: §8 #4]

### 5.3 マイルストーンの終わりの棚卸し

1. そのマイルストーンの spec の gate の出力から、Medium / Low の一覧を作る（Haiku の subagent に件数と見出しだけを集めさせる）
2. roadmap の「持ち主 = 次に X を触る feature」のような、持ち主の決まっていない申し送りを一覧にする
3. 利用者が「直す / 次のマイルストーンの特定の feature に付ける / 捨てる」を決める
4. 直すものを 1 本の整理の spec にまとめ、通常のサイクルで進める

---

## 6. 変更の中身

| # | 変更 | ファイル | 状態 |
|---|---|---|---|
| 6.1 | `autoCompactWindow: 300000` | `.claude/settings.json` | 入れた [要検証: 新しいセッションの `/status` で効いているか] |
| 6.2 | 完了通知に「`/clear` してから次の段へ」 | `cl-code-gate` / `cl-pr-gate` / `cl-implement`（`cl-design` は元からある） | 入れた |
| 6.3 | agent のモデル: implementer → `sonnet` / `medium`、lint-agent・test-agent → `haiku` / `low`、補助の reviewer 5 件（ux / a11y / database / ui-coverage / convention）→ `sonnet` / `high`。po-reviewer は Opus | `.claude/agents/*.md` | 入れた。**本版で po を Opus に戻した**（§8 #2） |
| 6.4 | main は `src/`・`tests/`・`e2e/` を編集しない。範囲内の追加は tasks.md に追記して implementer へ | `cl-implement` Phase 2 | 入れた |
| 6.5 | gate の指摘の扱い（Medium / Low は直さない、round は 3 まで） | `AGENTS.md` の gate の原則、`reviewer-base.md` | 入れた。**本版で直した**: 「転記しない」を「マイルストーンの終わりの棚卸しで扱う」に |
| 6.6 | pr-gate の round 2 以降の reviewer の絞り込み、Round 4 以降は明示が要る、`round_history[]` に `head` | `cl-pr-gate` | 入れた |
| 6.7 | AD-050（6.5 と 6.6 の ADR） | `docs/decisions/0050-*.md` | 入れた。**本版で proposed に戻した** |
| 6.8 | design は次の 1 本だけ | `docs/roadmap.md` の原則 | 入れた |
| 6.9 | `/cl-spec` の Phase 1.5（新しい spec を切るか） | `cl-spec` | 入れた。**本版で足す**: roadmap の `<ID>` の行の範囲と義務を spec の入力にする |
| 6.10 | プロンプトの形 | `docs/prompts.md` の使い方の節 | **本版で入れる** |
| 6.11 | マイルストーンの終わりの棚卸し | `docs/roadmap.md` の原則 | **本版で入れる** |
| 6.12 | npm-audit hook の修正 | 出所不明 [要検証: `/hooks`] | 未着手。Bash のたびに `jq not found` の blocking error を出している |
| 6.13 | codegraph の hook と MCP、serena の扱い | `.claude/settings.json`、`.mcp.json` | 未着手。015 の後の別 PR（memory の手順）で、subagent の `tools:` への追加と合わせて判断する |

取り下げたもの: `/cl-quick`、3 段階の優先度（`.claude/rules/tier-*.md`、spec の `priority:`、`tier_resolve`）。

---

## 7. パイロットと指標

| パイロット | 対象 | 指標 | 目標 |
|---|---|---|---|
| 1 | 015 の残り（実装 → code-gate → pr-gate R2 → done） | main の 1 リクエストあたりの平均キャッシュ読み取り | 461K → 200K 以下 |
| | | `/cl-implement` の段で main が `src/` を編集した回数 | 0 |
| | | implementer（Sonnet）の手戻り（code-gate の iteration、テストの失敗率、実装に起因する pr-gate の Critical / High） | 013 / 014 の実績を上回らない |
| | | test-agent / lint-agent（Haiku）の JSON の崩れ | 0 件 |
| 2 | 016 の載せ直しから done まで | 各 gate の round 数 | 3 以下 |
| | | PASS の後に Medium / Low を直した commit | 0 |
| | | pr-gate 1 回あたりの概算額 | $47 → $25 以下 |
| | | round 2 以降に見落とした Critical | 0 |
| | | design-gate で「義務の取りこぼし」の指摘 | 0 |
| 両方 | | 1 feature あたりの概算額 | ≈ $307 → $150 以下 |

- **測り方**: 本調査と同じ集計（モデル・段階・agent 別の usage、main の平均キャッシュ読み取り、誰が `src/` を編集したか）を feature ごとに取り直す。`/usage` の 7 日の内訳も記録する
- **AD-050 を accepted にする条件**: パイロット 2 の指標をすべて満たす
- **週 $250 の見通し**: パイロット 1・2 で Opus 5.5 換算の週約 $770 から −50〜60%（週 $310〜390）と見込む [推測]。$250 に届くかは、main の平均キャッシュ読み取りがどこまで下がるかで決まる。届かなければ、main を Sonnet 5.5 にするかを判断する

---

## 8. 利用者の判断

| # | 事項 | 決定（2026-10-12） | 反映先 |
|---|---|---|---|
| 1 | FR が 20 を超えたら spec を分けるか | **合図として残す。** 分けるのは、単体で確かめられる機能が 2 つ以上入っているときだけ | cl-spec Phase 8.5、memory |
| 2 | 補助の reviewer を Sonnet にするか | **po-reviewer は Opus に残し、他の 5 件（ux / a11y / database / ui-coverage / convention）を Sonnet に** | agent の frontmatter |
| 3 | マイルストーンの終わりの棚卸し | **扱う。** M3 の完了のときに 1 回目 | roadmap の原則、AGENTS.md、AD-050 |
| 4 | 夜間に、依存先が main に入っていない feature の design を禁じるか | **禁じる** | memory（夜間の方針） |
| 5 | 古いブランチの削除（§3） | 未決。既定案は「012 / 014 の分は消す。015 / 016 の分はそれぞれ main に入ってから」 | — |

---

## 付録 A. 設定の棚卸し

| 区分 | 場所 | 内容 | 判定 |
|---|---|---|---|
| CLAUDE.md (project) | `CLAUDE.md` | `@AGENTS.md` の import と、Windows でプロセスを起こさない規則 | 常時読み込み [確認済] |
| AGENTS.md | `AGENTS.md` | gate のワークフロー、実行モデル、gate の原則 | 常時読み込み（import による）[確認済] |
| CLAUDE.md (.claude) | `.claude/CLAUDE.md` | CodeGraph の使い方 | 常時読み込み [確認済] |
| auto memory | `~/.claude/projects/c--dev-closta/memory/MEMORY.md` | 18 行 | 常時読み込み [確認済] |
| skill (project) | `.claude/skills/` 37 件 | `cl-*` 10 件、`speckit-*` 10 件、assistant-ui 系 17 件 | description が常時読み込み [確認済] |
| skill (user) | `~/.claude/skills/` 4 件 | acnpptx、mainframe-docs など | description が常時読み込み |
| subagent | `.claude/agents/` 14 件 | reviewer 9 件、reviewer-base、implementer、designer、lint-agent、test-agent。調査の時点では、どれも `model` / `effort` を指定していなかった（全件 inherit）[確認済] | description が常時読み込み |
| hook (project) | `.claude/settings.json` | `UserPromptSubmit` → `codegraph.cmd prompt-hook`（プロンプトごとにプロセスを起こす）[確認済] | 要見直し（6.13） |
| hook (出所不明) | 不明 | `PostToolUse` の npm-audit hook。jq がなく、Bash のたびに blocking error [確認済] | 要修正（6.12） |
| MCP | `.mcp.json` / `~/.claude.json` | `codegraph`（`alwaysLoad: true`）、`serena`（user スコープ。本セッションでは接続がタイムアウト）。期間内の使用は 0 回 [確認済] | 要見直し（6.13） |
| model / effort | user settings | `model: claude-opus-5-5`、opus-5-5 は `medium` | — |
| statusLine | user settings | `ccusage statusline` | 維持 |
| env (project) | `.claude/settings.json` | `PYTHONUTF8` / `LANG` / `WINELOADERNOEXEC`（Git Bash の起動を短絡させる。消さない） | 維持 |

常に読み込まれる部分は約 18,000 トークンで、main の 1 リクエストあたりの平均キャッシュ読み取り（約 461,000）の約 4%。主因ではない。

## 付録 B. コストの内訳（2026-09-12〜10-12）

### 集計の範囲と方法

- main の JSONL 113 本と subagent の JSONL 679 本（計 918MB）。assistant のリクエストは重複を除いて 29,175 件
- 使い捨ての Node スクリプトで集計した（scratchpad に置いた）。JSONL とプロンプトの本文は文脈に読み込んでいない
- 金額は **API の定価での概算**で、Enterprise の実際の消費とは一致しない

### 合計と要因

| 指標 | 値 |
|---|---:|
| 概算額（31 日） | $4,918 |
| Opus 5.5 の単価で換算した額 | ≈ $3,394（週約 $770）。**今後の基準** [推測] |
| 料金の要素別 | キャッシュ読み取り 58% / キャッシュ書き込み 28% / 出力 14% |
| main | $3,349（68%）。1 リクエストあたりの平均キャッシュ読み取り 461K |
| gate 合計 | $1,995（41%）。pr-gate は 1 回あたり約 $47、PR 1 本で 2〜3 round |
| reviewer 9 種 | $1,110（23%）。529 回の起動がすべて Opus |
| implementer | $169（3.4%） |

### 誰が実装していたか

| 期間 | `src/` を編集した主体 |
|---|---|
| 09-12〜09-25 | main だけ（543 回）。implementer はまだない |
| 09-26〜10-02 | main 988 回 / implementer 328 回（implementer の初回は 09-30） |
| 10-03〜10-10 | implementer 848 回 / main 379 回 / general-purpose 164 回 |

`/cl-implement` の段の中でも、main が `src/` を 938 回編集していた。main の文脈の大きな部分は、実装そのものの Read / Edit である。

### 作り直しになった spec

| spec | 経緯 |
|---|---|
| O-3 (012)、O-4 (014)、O-5 (015) | 2026-10-04 の夜間に O-7 の design の上にまとめて起こし、design-gate を通した。O-7 の実装で設計がずれ、main に載せ直して O-7 に合わせて直し、design-gate をもう一度回した |
| O-6 (016) | 同じ夜に起こした。古いブランチのまま止まっている |
| O-8 / O-9 / O-10 | O-3 と O-5 の design の中で「FR 20 を超えるため」に切り出した。結果としては、どれも単体で確かめられる機能になっている |

### その他

- main では `/model` を 91 回切り替えた。キャッシュはモデルごとに分かれるので、切り替えるたびに書き直している（概算 $200〜300）[推測]
- Bash の cat・grep・sed・ls が約 1,580 回あった。Read / Grep に置き換えられた分で、所要時間に効く（1 回 15〜23 秒）

## 付録 C. 候補の採否

| 候補 | 判定 | 理由 |
|---|---|---|
| 段ごとの `/clear`、`autoCompactWindow` | 採用 | main の文脈に直接効く。受け渡しは既にファイルで行っている |
| subagent の `model` / `effort` の frontmatter | 採用 | agent ごとに戻せる |
| gate の指摘の扱いと round の上限、round 2 以降の絞り込み | 採用（AD-050、proposed） | gate の round を減らす。Critical の扱いは変えない |
| main で `src/` を編集させない PreToolUse hook | 保留 | hook の入力で main と subagent を区別できるかを確かめていない [要検証]。まず cl-implement の文言で守り、パイロットで回数を数える |
| `/cl-quick`、3 段階の優先度 | 取り下げ | 0 からの開発では使う場面がない |
| OpenSpec | 保留 | 出来上がった機能を直す段階に向く（変更を delta で記録し、統合 spec に戻す）。M5 の後に検討 |
| Spec Kit の `spec-kit-archive` / `spec-kit-reconcile` | 保留 | 統合 spec を作る仕組み。今は charter と ADR が正本を担っている |
| Superpowers | 不採用 | cl-* の implementer と gate と役割が重なる |
| cc-sdd | 不採用 | Spec Kit と同じくらい重く、置き換える利点がない |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 保留 | 一律の既定値になり、agent ごとの意図が見えなくなる |
| `opusplan` | 不採用 | plan / 実行の境界が gate の段と一致しない |
| main を Sonnet 5.5 にする | 保留 | 実装を implementer に移した後の main で足りるかを見てから |
| dynamic workflows / agent teams | 不採用 | 直列に動かす規則と衝突する |
| fast mode | 不採用 | 単価が 2 倍。遅さの原因はプロセスの起動 |

## 付録 D. 出典

- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — 探索 → 計画 → 実装、「差分を 1 文で説明できるなら計画は飛ばす」、adversarial review の注意（指摘を全部追うと過剰設計になる）
- [Subagents](https://code.claude.com/docs/en/sub-agents) — model の解決の順、新しい subagent は文脈を一から集める
- [Manage costs effectively](https://code.claude.com/docs/en/costs) — Sonnet / Opus / Haiku の使い分けの目安
- [Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl (Birgitta Böckeler)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) — spec-first と spec-anchored、小さな機能には過剰
- [addyosmani/agent-skills: spec-driven-development](https://github.com/addyosmani/agent-skills/blob/main/skills/spec-driven-development/SKILL.md) — spec を使わない場面、1 つの spec に単体で確かめられる機能が複数入っている危険信号
- [github/spec-kit Discussion #152: Evolving specs](https://github.com/github/spec-kit/discussions/152) — spec の連鎖の問題、統合 spec
- [github/spec-kit Discussion #1784](https://github.com/github/spec-kit/discussions/1784)、[Issue #1191](https://github.com/github/spec-kit/issues/1191)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)、[obra/superpowers](https://github.com/obra/superpowers)
