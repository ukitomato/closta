---
name: cl-add-reviewer
description: 新規 reviewer subagent を後付け追加する。同梱の optional reviewer (api-performance / openapi-contract) の有効化、または project 固有 reviewer の新規起草を行い、reviewers.yml と agent registry に編入する。
argument-hint: <reviewer-name>
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-add-reviewer

新規 reviewer subagent を後付けで追加する wrapper。

## 2 modes

### Mode A: 同梱 optional reviewer を有効化

`--from-template <name>` で選択する。**body が同梱されているのは以下 2 種だけ** (`.specify/extensions/spec-gate/reviewers-optional/` の実体がそれ):

- `api-performance-reviewer` (latency / caching / N+1 / pagination / rate limit)
- `openapi-contract-reviewer` (OpenAPI 契約 drift / breaking change)

`database-reviewer` / `a11y-reviewer` / `ux-reviewer` / `platform-boundary-reviewer` は **既に `.claude/agents/` へ展開済み**であり、本 skill の対象ではない。発火条件を変えたいだけなら `.specify/spec-gate/reviewers.yml` を直接編集する。

`.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` から body を copy し、`.claude/agents/<name>.md` として展開。

### Mode B: project 固有 reviewer を新規作成

`<name>` のみで起動。LLM が AskUserQuestion で観点 / scope / severity 判定基準を elicit し、`reviewer-base.md` を base とした body を draft。

## When to invoke

- 既存 reviewer (security / architecture / po / convention / platform-boundary + optional 3) では足りないと判明した時
- 特定 tech stack や regulatory 要件で project 固有の観点を追加したい時

## Inputs

- `<name>`: reviewer 名 (kebab-case)。例: `compliance-reviewer`, `performance-reviewer`
- `--from-template <name>` (optional): Mode A で起動
- `--gates <csv>` (default: `code-gate,pr-gate`): どの gate で起動するか
- `--patterns <csv>` (optional): `auto_invoke_patterns`。**これが実際の発火条件である**

## Steps

### Phase 0: Preconditions + Mode 判定

1. `<name>` が valid kebab-case (`^[a-z][a-z0-9-]*$`) であること
2. `.claude/agents/<name>.md` が既存でないこと (既存なら `--force` 必須)
3. `--from-template` 指定 → Mode A、なし → Mode B

### Phase 1A (Mode A): built-in テンプレートから展開

1. `.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` を Read
2. 不存在なら "<name> は built-in にない、Mode B (新規起草) で再実行してください" で halt
3. body の冒頭を読み、tech stack 適合性を AskUserQuestion で確認 (例: `openapi-contract-reviewer` なら "対象の contract ファイルはどこか / `oasdiff` は使えるか")

### Phase 1B (Mode B): 新規 reviewer を draft

LLM (本 skill のメインスレッド) が以下を AskUserQuestion で elicit:

1. **責任観点**: この reviewer は何を検出する? (最低 5 件の viewpoint)
2. **scope**: feature / system / both
3. **severity 判定**:
   - 何を Critical とする?
   - 何を High とする?
   - **Severity 禁則** (将来的攻撃経路や defensive coding を Critical 扱いしない) は適用するか?
4. **Tier-0 必読ファイル**: spec.md 以外で必ず Read すべきものは?
5. **使用ツール**: Bash が必要か? (lint コマンド実行等)
6. **owner matrix**: 他 reviewer と重複する観点は? (重複は禁止)

エリシト完了後、以下の形で body を draft する。

**`A.` 〜 `H.` の 1 文字見出しを使ってはならない。** それは `reviewer-base.md` の viewpoint カテゴリの予約語であり、同じ文書内で 2 つの相反する A–H を扱わせることになる。固有観点の見出しは **reviewer 名から取った prefix + 連番** (`SEC-1` / `PB-1` のように) にする。

```markdown
---
name: <name>
description: <elicited description>
tools: Read, Grep, Glob<, Bash>
---

# <name>

<本 reviewer の役割 説明>。viewpoint カテゴリ **<cat>** の owner。

**invoke 直後に `.claude/agents/reviewer-base.md` を Read する**。続けて以下を読む:

1. <elicited Tier-0 files>

## <他 reviewer> との境界

<重複させない観点を 1-2 行で>

## 固有観点

### <PREFIX>-1. <viewpoint 1>
...
### <PREFIX>-2. <viewpoint 2>
...
(5 件以上)

## 出力

`reviewer-base.md` の最終出力フォーマットに従う。`## 初回読了 viewpoint` には A-H 全カテゴリを記入し、owner 外は `該当なし: <理由>` とする。
```

ユーザに draft を AskUserQuestion で見せて承認 / 編集 / 拒否を選択。

### Phase 2: ファイル展開

`.claude/agents/<name>.md` を Write する。**これが唯一の正本である。**

body を別の場所へ複製してはならない (`.agents/` / `.cursor/` 等)。複製すると「原本コピー」が生まれ、以後どちらか一方だけが直る。`.agents/` は `.gitignore` 済みであり追跡もされない。

### Phase 3: gate skill の reviewer リストへ自動編入

ユーザが `<name>` を毎 gate で必須にするか、特定条件で encore するかを AskUserQuestion で確認:

- "常駐 (毎 code-gate / pr-gate で必ず起動)"
- "system scope のみ (file pattern にマッチする時のみ起動)" + pattern 入力
- "manual only (`--scope <name>` で明示起動した時のみ)"

選択に応じて `.specify/spec-gate/reviewers.yml` に entry を追加:

```yaml
reviewers:
  - name: <name>
    enabled: true
    scope: feature | system | both
    auto_invoke_patterns: ["**/*.sql", ...]  # system scope 時のみ
    gates: [code-gate, pr-gate]              # どの gate で起動するか
```

**reviewers.yml への登録だけでは起動しない。4 箇所すべてを直す。**
`gate_common::reviewers_filter` は **引数で渡された候補しか絞らない** ので、候補リストに名前が無い reviewer は yml に載っていても永久に起動しない。

1. `.specify/spec-gate/reviewers.yml` — **code-gate / pr-gate の**発火条件の正本
2. `.specify/.agents-registry.yaml` の entry — `registry_assert_agent` / `registry_filter_agents` が参照する。無いと存在しない扱いになる
3. **`gates` に挙げた各 gate skill の候補リスト** — `cl-code-gate` の Phase 2、`cl-pr-gate` の Phase 3 の `reviewers_filter` 呼び出し
4. **design-gate でも走らせたいなら `.agents-registry.yaml` の `invoked_by` に `design-gate` を足す** — design-gate は `reviewers.yml` を読まない (diff が無く `auto_invoke_patterns` が効かないため)。`gates: [design-gate]` と書いても効果はない

3 を忘れると「yml は正しいのに 1 度も起動しない」状態になり、`skipped_reviewers[]` にも出ないため気付けない。4 を忘れると code-gate / pr-gate では動くのに design-gate だけ黙って起動しない。

registry entry の形:

```yaml
  - name: <name>
    status: optional
    role: generic
    placement: .claude/agents/<name>.md
    purpose: "<1 行>"
    managed_by: user
    invoked_by: [code-gate, pr-gate]   # design-gate を入れるかはここで決まる
```

### Phase 4: 動作確認 (任意)

AskUserQuestion で「即座に dry-run しますか?」を提示し、yes なら最新 spec_dir に対し新 reviewer を 1 回だけ起動して出力サンプルを表示。

### Phase 5: 完了通知

```
✓ /cl-add-reviewer 完了
  - name: <name>
  - mode: <A 同梱 | B 新規>
  - 配置: .claude/agents/<name>.md
  - 登録: reviewers.yml / .agents-registry.yaml / <gate> skill の候補リスト (3/3)
  - 次のアクション: /cl-code-gate または /cl-pr-gate を実行して動作確認
```

## Idempotency

- 既存 `<name>` reviewer がある場合は `--force` 必須
- registry への登録は同名 entry があれば上書き

## Failure modes

- name validation 失敗 → AskUserQuestion で再入力
- Mode A で `.specify/extensions/spec-gate/reviewers-optional/<name>-body.md` 不存在 → Mode B に switch を提案
- Mode B で 5 viewpoint 未満を elicit → AskUserQuestion で追加観点を要求 (5 件未満は受け付けない)
- registry file 不存在 → 新規作成

## Acceptance criteria

1. `.claude/agents/<name>.md` が存在し、body の複製がどこにも無い
2. body に `.claude/agents/reviewer-base.md` を Read する指示が含まれる
3. 固有観点が 5 件以上あり、見出しに `A.`〜`H.` の 1 文字を使っていない
4. 担当スライスが他 reviewer と重複していない
5. `reviewers.yml` / `.agents-registry.yaml` の entry / 対象 gate skill の候補リスト の **3 箇所すべて**に名前が入っている (design-gate でも走らせるなら `invoked_by` も直して 4 箇所)
6. `claude plugin validate .claude/agents/` が通る
