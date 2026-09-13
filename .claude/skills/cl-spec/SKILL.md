---
name: cl-spec
description: feature spec.md を起案する wrapper。`/speckit.specify` + `/speckit.clarify` を内部委譲しつつ、spec_id 採番 (連番 or タイムスタンプ)・domain 確定・frontmatter 注入 (spec_id / domain / status: drafting / targets) を一連で実施する。手動起動のみ。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# cl-spec

feature spec.md を起案する。`/speckit.specify` (spec 起草) と `/speckit.clarify` (曖昧さの対話的解消) を内部委譲しつつ、本 wrapper は以下を担当する:

- **`spec_id` 採番** — リポジトリ設定に応じて連番 `NNN-<domain>-<slug>` (`--spec-id-format seq`) または時刻ベース `YYYY-MM-DD-HHMM-<DOMSHORT>-<slug>` (`--spec-id-format ts`)
- **`domain` 確定** — description プレフィックス or 既存 Domain Charter 一覧から AskUserQuestion で選択
- **frontmatter 注入** — `spec_id`, `domain`, `status: drafting`, `targets`, `bf_ids: []`, `sf_ids: []`
- **`/speckit.clarify` auto chain** — `[NEEDS CLARIFICATION]` を LLM が assumption で埋めることは禁止

## When to invoke

- 新規 feature の spec.md 起案時 (毎 feature 1 回)
- Brownfield の reverse spec 用途には使わない (それは `/spec-gate migrate` の責務)

## Inputs

- `<description>`: 自然言語の feature 説明 (1-3 文推奨)。`[<domain>] <feature>` プレフィックスがあれば domain 抽出のヒントになる
- `--linear <PRJID>-NNN` (optional): チケットツール連携。Issue title から domain と feature を抽出
- `--domain <name>` (optional): domain 確定 elicitation を skip
- `--targets frontend|backend|both` (optional): targets elicitation を skip

`<description>` と `--linear` の同時指定は禁止 (halt)。

### Required state

- cwd が repository root (`.specify/` が存在)
- `specs/` ディレクトリ (なければ自動作成)
- `docs/domains/` で domain charter が確認できること (1 domain 以上)

## Steps

### Phase 0: Preconditions (gate-common.sh 委譲)

```bash
source .specify/scripts/gate-common.sh
gate_common::phase0_check_repo || { echo "Run /spec-gate bootstrap first"; exit 1; }
```

1. `.specify/` ディレクトリ + git repo 確認 (phase0_check_repo)
2. `docs/domains/*/charter.md` が 1 件以上存在を確認。なければ "先に `/spec-gate migrate` で domain を確立してください (Brownfield) or `docs/domains/<name>/charter.md` を手動作成してください (Greenfield)" と案内
3. `specs/` がなければ `mkdir -p specs`

### Phase 1: Parse arguments

`$ARGUMENTS` を解析:

- description text (自由文字列、`<description>` パターン)
- `--linear <PRJID>-NNN` flag
- `--domain <name>` flag
- `--targets <enum>` flag

両 description / `--linear` が空なら halt + 使い方を提示。

### Phase 2: External ticket fetch (`--linear` 指定時のみ)

1. `mcp__linear-server__get_issue identifier=<PRJID>-NNN` (MCP 利用可能時)
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

`.specify/memory/constitution.md` または `.specify/config.yaml` で spec-id-format を確認 (デフォルト: `seq`)。**atomic 採番** は `gate_common::spec_id_allocate_*` に委譲する (flock or mkdir-lock fallback、並列起動時の衝突回避、resolves C-3-d):

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

**注意**: 旧 inline NEXT_NUM 計算 (`ls specs/ | grep -E '^[0-9]{3}-' | wc -l`) は **撤廃**。並列起動時の race condition を回避するため、必ず gate-common 経由で採番する。

### Phase 6: `/speckit.specify` delegation

1. `/speckit.specify` を bash 経由で起動し、description を input として渡す
2. SpecKit が `specs/<SPEC_ID>/spec.md` を自動生成する
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

注入後 `head -20 spec.md` で確認 (frontmatter が壊れていないか)。

### Phase 8: `/speckit.clarify` auto chain

`/speckit.clarify specs/<SPEC_ID>/` を起動し、各 `[NEEDS CLARIFICATION]` 項目を以下の基準で処理する:

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

- domain charter が存在しない → "/spec-gate migrate で domain を確立してから再実行" を案内
- SPEC_ID atomic 採番の lock 取得 timeout (gate_common::spec_id_allocate_* が exit 75) → 自動リトライ 3 回 → 3 回失敗で AskUserQuestion
- SPEC_ID 衝突 (ts モード、60 分超 +N 失敗) → AskUserQuestion で手動 slot 指定
- `/speckit.specify` の delegation 失敗 → エラーメッセージを表示、frontmatter 注入は skip して halt
- `/speckit.clarify` でユーザが完全 skip → `status: drafting` のままで完了 (`[NEEDS CLARIFICATION]` が残ることをユーザに警告)

## Acceptance criteria (LLM が自己検証する項目)

1. `specs/<SPEC_ID>/spec.md` が存在
2. spec.md の frontmatter に `spec_id`, `domain`, `targets`, `status: drafting`, `bf_ids: []`, `sf_ids: []` がすべて含まれる
3. `domain` 値が `docs/domains/<domain>/charter.md` で実在する
4. `/speckit.clarify` が起動された (ユーザ対話の有無は問わない)
5. body 部分に `[NEEDS CLARIFICATION]` が残っていれば warning として表示
6. seq モード並列起動時に SPEC_ID 衝突が発生しない (gate_common::spec_id_allocate_seq の flock 保護による)
