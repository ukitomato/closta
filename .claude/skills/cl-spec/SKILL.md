---
name: cl-spec
description: feature spec.md を起案する。spec_id の採番・domain 確定・frontmatter 注入を行い、`/speckit-specify` と `/speckit-clarify` を内部委譲する。
argument-hint: <description>
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# cl-spec

feature spec.md を起案する。`/speckit-specify` (spec 起草) と `/speckit-clarify` (曖昧さの対話的解消) を内部委譲しつつ、本 wrapper は以下を担当する:

- **`spec_id` 採番** — リポジトリ設定に応じて連番 `NNN-<domain>-<slug>` (`--spec-id-format seq`) または時刻ベース `YYYY-MM-DD-HHMM-<DOMSHORT>-<slug>` (`--spec-id-format ts`)
- **`domain` 確定** — description プレフィックス or 既存 Domain Charter 一覧から AskUserQuestion で選択
- **frontmatter 注入** — `spec_id`, `domain`, `status: drafting`, `targets`, `bf_ids: []`, `sf_ids: []`
- **`/speckit-clarify` auto chain** — `[NEEDS CLARIFICATION]` を LLM が assumption で埋めることは禁止

## When to invoke

- 新規 feature の spec.md 起案時 (毎 feature 1 回)

## Inputs

- `<description>`: 自然言語の feature 説明 (1-3 文推奨)。`[<domain>] <feature>` プレフィックスがあれば domain 抽出のヒントになる
- `--linear <PRJID>-NNN` (optional): チケットツール連携。Issue title から domain と feature を抽出
- `--domain <name>` (optional): domain 確定 elicitation を skip
- `--targets frontend|backend|both` (optional): targets elicitation を skip
- `--night` (optional): 夜間の自走から呼ばれたとき。本 skill の AskUserQuestion の分岐はすべて推奨案 (domain なら最上位の候補、roadmap の行の追加なら yes、`/speckit-clarify` の質問なら推奨の選択肢) を採り、台帳の「判断」に 1 行ずつ書く。規則の正本は `docs/ai-workflow/night-run.md`

`<description>` と `--linear` の同時指定は禁止 (halt)。

### Required state

- cwd が repository root (`.specify/` が存在)
- `specs/` ディレクトリ (なければ自動作成)
- `docs/domains/` で domain charter が確認できること (1 domain 以上)

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || { echo ".specify/ が見つかりません。repository root で実行してください"; exit 1; }
```

1. `.specify/` ディレクトリ + git repo 確認 (phase0_check_repo)
2. `docs/domains/*/charter.md` が 1 件以上存在を確認。なければ "`docs/domains/<name>/charter.md` を作成してから再実行してください" と案内
3. `specs/` がなければ `mkdir -p specs`

### Phase 1: Parse arguments

`$ARGUMENTS` を解析:

- description text (自由文字列、`<description>` パターン)
- `--linear <PRJID>-NNN` flag
- `--domain <name>` flag
- `--targets <enum>` flag

両 description / `--linear` が空なら halt + 使い方を提示。

### Phase 1.5: 新しい spec を切るかを確かめる

description と `docs/roadmap.md` を照らし、次のどれかに当たったら spec を切らずに halt し、利用者に報告する。

| 確かめること | 当たったら |
|---|---|
| 既存の spec の FR の範囲内 | その spec の tasks.md に追記するか、FR を参照した修正 PR にする |
| 依存先の feature (roadmap の「依存」列) が main に入っていない | 依存先を先に進める (前倒しの design は依存先の実装に合わせて作り直しになる) |
| 差分を 1 文で説明できる、ツール・CI・ワークフローの修正 | spec を切らない。通常のセッションで直し、`/code-review` を 1 回通す |
| roadmap にその feature の行がない | roadmap に行を足してよいかを AskUserQuestion で確かめる |

spec は「単体で確かめられる機能」で切る。

**範囲と義務は roadmap の行から読む。** description の `<ID>` (例: `O-10`) で `docs/roadmap.md` の行を引き、範囲・義務・依存・前提 SPIKE を `/speckit-specify` への入力に足す。spec の「義務の扱い」の節には、各義務を「この spec で扱う / 扱わない (理由)」で 1 行ずつ書く。プロンプトに義務が書かれていても、正本は roadmap の行である (食い違えば roadmap に合わせ、食い違いを利用者に報告する)。

### Phase 2: External ticket fetch (`--linear` 指定時のみ)

1. Linear の MCP (`linear`) の issue 取得 tool で `<PRJID>-NNN` を引く (MCP 利用可能時)
2. 失敗時: `gh issue view` / `glab issue show` 等の CLI (リポジトリの remote 種別から判定)
3. 失敗時: ユーザに Issue 本文をコピー貼り付けを依頼
4. fetch した title / description / labels を以降の Phase で使用

### Phase 3: Domain resolution

1. description / Issue title が `^\[(?<domain>[a-z-]+)\]\s+(?<feature>.+)$` パターンならば domain を抽出
2. `--domain` 指定があればそちらを優先
3. 上記いずれでもなければ、各 `docs/domains/*/charter.md` の Mission/Scope を Read し、description との意味的一致度をスコアリング:
   - **最高スコアが 2 位以上に比べて明確に高い (差 >= 0.2)** → 自動選択しログに記録 (`[auto-domain: <name>]`)
   - **同点 or 僅差 (差 < 0.2) で複数ドメインが並ぶ** → **AskUserQuestion** で候補を提示して選択
4. 選択 domain の `docs/domains/<domain>/charter.md` が存在することを最終 validate (存在しないなら halt)

### Phase 4: Targets resolution

1. `--targets` 指定があれば即決定
2. description / charter scope から推論 (frontend のみ? backend のみ? both?)
3. 推論結果を **自動採用** し、完了通知に `[auto-targets: <value>]` として記録する。ユーザ確認は行わない

### Phase 5: Allocate `spec_id` (atomic via gate-common.sh)

spec-id-format は `.specify/init-options.json` の `feature_numbering` で決まる (`sequential` → `seq` / `timestamp` → `ts`。既定は `seq`)。**採番は必ず `gate_common::spec_id_allocate_*` に委譲する** — 自前で `ls specs/` を数えると並列起動時に衝突する:

```bash
source .specify/scripts/gate-common.sh
SLUG=$(gate_common::slugify "$feature_text")
```

**seq モード:**

```bash
SPEC_ID=$(gate_common::spec_id_allocate_seq "$domain" "$SLUG")
rc=$?
# rc=75 (EX_TEMPFAIL): lock 取得 timeout → 自動リトライ 3 回 (各 2 秒 sleep) → 3 回失敗で AskUserQuestion
```

**ts モード:**

```bash
SPEC_ID=$(gate_common::spec_id_allocate_ts "$domain" "$SLUG")
rc=$?
# 衝突時は +1 分繰り上げ (自動)、60 分超で AskUserQuestion で手動 slot 指定
```

**採番は `specs/<SPEC_ID>/` を作成して番号を予約する。** 以降の Phase が失敗しても空ディレクトリが残るので、中断したときは手で消すこと (残っていると次の採番がその番号を使用済みとして飛ばす)。

### Phase 6: `/speckit-specify` delegation

1. `/speckit-specify` を bash 経由で起動し、description を input として渡す
2. SpecKit が `specs/<SPEC_ID>/spec.md` を自動生成する (ディレクトリは Phase 5 で予約済み)
3. 生成完了を待機

### Phase 7: Frontmatter injection

`specs/<SPEC_ID>/spec.md` の frontmatter (`---` で挟まれた YAML) に以下を **Edit** で挿入 (既存があれば上書き):

```yaml
---
spec_id: <SPEC_ID>
domain: <domain>
domain_selected_by: <auto|user>
targets: <frontend|backend|both>
targets_selected_by: <auto|user>
status: drafting
bf_ids: []
sf_ids: []
linear: <"<PRJID>-NNN" or null>
---
```

注入後、spec.md の先頭 20 行を Read ツール (`limit: 20`) で確かめる (frontmatter が壊れていないか)。

### Phase 8: `/speckit-clarify` auto chain

`/speckit-clarify specs/<SPEC_ID>/` を起動し、各 `[NEEDS CLARIFICATION]` 項目を以下の基準で処理する:

**AskUserQuestion を使う条件 (どちらかを満たす場合)**:
- アーキテクチャ選択・ドメイン境界・コア価値提案に直接影響する
- 複数の実現方式があり、選択によって実装コストや成果物が **大きく変わる** (目安: 設計・実装の差分が 1 日超)

**AI が assumption で自動解決できるポジティブリスト** (以下に明示した項目のみ):
- UI ラベル・ボタン文言・エラーメッセージ・プレースホルダーテキスト
- 画面遷移の順序・アニメーション方向・デフォルト表示状態
- キャッシュ TTL・リトライ回数・タイムアウト秒数などの数値デフォルト値
- ページネーションのデフォルトページサイズ
- ログレベル・ログフォーマットの詳細
- ソート順のデフォルト (昇順/降順)
- 入力フォームのバリデーションメッセージ文言

上記ポジティブリスト外で AskUserQuestion 条件にも該当しない項目は **AskUserQuestion で確認する**。

仮定内容は `[ASSUMED: <内容>]` としてその場に記録し、完了通知に列挙する。LLM が `[NEEDS CLARIFICATION]` を **無根拠に空白のまま埋める**ことは禁止。

### Phase 8.5: 粒度の抑制 (レビューコストの制御)

**spec の量が design-gate のコストをほぼ決める。** reviewer は文書量に比例して指摘を出し、
同じ規則が複数の成果物に重複して書かれているほど「1 箇所だけ古い」系の drift 指摘が増える。

生成した spec.md に対して次を確認し、超過していれば**削ってから** Phase 9 に進む。

**上限は「重くなった」という合図であって、feature を分ける理由ではない。** 超えたら、まず下の削り方と参照形で重複を消す。それでも超えるなら、単体で確かめられる機能が 2 つ以上入っていないかを見る。入っていれば分割を検討し、入っていなければ上限を超えたまま進めて `## 本 feature の位置づけ` に理由を 1 行書く (2026-10-12 に利用者が決定)。

| 目安 | 上限 | 超過時の削り方 |
|---|---|---|
| Functional Requirements | **20 件** | 「先行 feature の規則をそのまま継ぐ」ものを FR にしない。`## Dependencies` に「R-N の FR-xxx を継承する」と 1 行書く |
| Success Criteria | **10 件** | 1 つの SC に複数の計測対象をまとめる。**計測経路を持たない SC は作らない** |
| Acceptance Scenarios (1 User Story あたり) | **8 件** | Edge Cases 節に移す。AC は「この Story が成立したと言える最小の観測」に絞る |
| User Story | **4 本** | 超えたら、単体で確かめられる機能が 2 つ以上入っていないかを見る。入っていれば分割を検討し、`docs/domains/_overview.md` の Feature 帰属表に諮る |

**例外**: プロジェクトの初期化を兼ねる feature (最初の 1 本) と、
Constitution / ADR の改定を主目的とする feature はこの限りでない。
超過する場合は `## 本 feature の位置づけ` に**理由を 1 行**書く。

**「書けば安全」ではない。** 1 つの規則を spec / data-model / contracts / tasks の
4 箇所に書くと、4 箇所が同期している保証が無いまま「詳しく書いた」状態になる。
**規則の正本を 1 箇所に決め、他は参照する** (例: SC は「contracts C-4 の表の各行」と参照形で書く)。

### Phase 9: 完了通知

```
✓ /cl-spec 完了
  - spec dir: specs/<SPEC_ID>/
  - domain: <domain> [auto-domain: <name> | user-selected]
  - targets: <targets> [auto-targets: <value> | user-selected]
  - linear: <value>
  - assumed clarifications: <N> 件 (詳細は spec.md の [ASSUMED: ...] を参照)
  - user clarifications: <M> 件
  - 次のアクション: /cl-plan specs/<SPEC_ID>/
```

## Idempotency

- 同じ description で再実行した場合: 新規 spec_id が採番される (重複検出はしない、ユーザ判断に委ねる)
- `--linear` 指定で同じ Issue から再起動した場合: 既存 spec dir があれば Edit でフロントマター更新のみ実施 (再生成はしない)

## Failure modes

- domain charter が存在しない → "`docs/domains/<name>/charter.md` を作成してから再実行" を案内
- SPEC_ID atomic 採番の lock 取得 timeout (gate_common::spec_id_allocate_* が exit 75) → 自動リトライ 3 回 → 3 回失敗で AskUserQuestion
- SPEC_ID 衝突 (ts モード、60 分超 +N 失敗) → AskUserQuestion で手動 slot 指定
- `/speckit-specify` の delegation 失敗 → エラーメッセージを表示、frontmatter 注入は skip して halt
- `/speckit-clarify` でユーザが完全 skip → `status: drafting` のままで完了 (`[NEEDS CLARIFICATION]` が残ることをユーザに警告)

## Acceptance criteria (LLM が自己検証する項目)

1. `specs/<SPEC_ID>/spec.md` が存在
2. spec.md の frontmatter に `spec_id`, `domain`, `targets`, `status: drafting`, `bf_ids: []`, `sf_ids: []` がすべて含まれる
3. `domain` 値が `docs/domains/<domain>/charter.md` で実在する
4. `/speckit-clarify` が起動された (ユーザ対話の有無は問わない)
5. body 部分に `[NEEDS CLARIFICATION]` が残っていれば warning として表示
6. seq モード並列起動時に SPEC_ID 衝突が発生しない。**保証の実体は lock ではなく「critical section 内で `specs/<SPEC_ID>/` を作って番号を予約する」こと** — 番号を返すだけなら lock があっても全員が同じ番号を得る
