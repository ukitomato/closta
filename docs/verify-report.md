---
generated_by: /spec-gate verify
generated_at: 2026-09-12T13:46:02Z
prefix: cl
strict_mode: false
overall_status: fail
---

# Verify Report: Closta

## Summary

| Phase | Verdict | Issues |
|---|---|---|
| 1. Structure | **fail** | 2 fail / 2 warning |
| 2. Consistency | warning | 2 warning（fail 1 件は本 run 中に修正済） |
| 3. Gap Analysis | warning | 4 warning |
| 4. Dev Ready | warning | 3 warning |

**Overall status: fail**

fail は **greenfield ゆえの未整備 2 件のみ**である。`docs/domains/` と `docs/glossary.md` が
未作成であり、これは bootstrap の次に人間が作る成果物にあたる。

本 run では別途 **Windows 環境での実動作不良（`registry_assert_agent` が常に失敗する）** を
検出し、`.specify/scripts/gate-common.sh` を修正して解消した。詳細は Phase 2.5b を参照。

---

## Phase 1: Structure

| 項目 | 状態 | パス |
|---|---|---|
| Constitution (draft) | pass (warning) | `.specify/memory/constitution.draft.md` — `status: draft`、active 未昇格 |
| Constitution (active) | **warning** | `.specify/memory/constitution.md` — **placeholder のまま**（`# [PROJECT_NAME] Constitution`） |
| templates/spec-gate | pass | `.specify/templates/spec-gate/` |
| spec-resolve.sh | pass | 実行可能 |
| status-transition.sh | pass | 実行可能 |
| gate-common.sh | pass | 実行可能、`version` = 1 |
| agents-registry | pass | `.specify/.agents-registry.yaml`（18 entry） |
| id-registry | pass | `.specify/.id-registry.json`（bf_next: 1） |
| discovery | pass (warning) | `docs/discovery.md` — `status: needs-human-review` |
| **domains dir** | **fail** | `docs/domains/` が存在しない |
| **glossary** | **fail** | `docs/glossary.md` が存在しない |
| wrappers | pass | `cl-{spec,plan,tasks,design-gate,implement,code-gate,pr-gate,done,add-reviewer}` 9/9 |
| generic reviewer | pass | reviewer-base / security / architecture / po / convention 5/5 |
| actor | pass | implementer / lint-agent / test-agent 3/3 |

`docs/domains/` と `docs/glossary.md` の不在により、`/cl-spec` の Phase 0（domain charter が
1 件以上存在すること）が通らない。**最初の feature に着手する前に必須。**

---

## Phase 2: Consistency

### 2.1〜2.3 spec frontmatter / bf_ids / charter 対応

**N/A** — `specs/` が存在しない（feature 未着手）。

### 2.4 reviewers.yml ↔ `.claude/agents/`

| reviewer | 状態 |
|---|---|
| a11y-reviewer | pass |
| ux-reviewer | pass |
| database-reviewer | pass |

broken registry なし。

### 2.5 `.specify/.agents-registry.yaml` ↔ `.claude/agents/`

- registry entry: 18
- agent file: 12
- **registered but absent: 6**

| 未配置 agent | 理由 | 判定 |
|---|---|---|
| charter-drafter | `/spec-gate migrate` が配置する | 設計どおり |
| spec-reverser | 同上 | 設計どおり |
| constitution-drafter | 同上 | 設計どおり |
| glossary-extractor | 同上 | 設計どおり |
| api-performance-reviewer | bootstrap で不採用 | 設計どおり |
| openapi-contract-reviewer | bootstrap で不採用 | 設計どおり |

6 件すべてが設計どおりの不在である。したがって本項は **warning** とする。
ただし **registry テンプレートが bootstrap の配置内容より多くを宣言している**点は
skill 側の構造的な不整合であり、verify の仕様（「registered だが不在 → fail」）とも噛み合わない。

present but unregistered: **0 件**。

### 2.5b `registry_assert_agent` の実動作 — **検出時 fail（blocker） / 本 run で修正済**

registry と agent file の対応は上記のとおり健全であるにもかかわらず、
**`registry_assert_agent` は実在する agent に対しても失敗する。**

```
$ bash .specify/scripts/gate-common.sh registry-assert implementer
gate-common[err]: agent 'implementer' not in registry (.specify/.agents-registry.yaml)
exit=2

$ bash .specify/scripts/gate-common.sh registry-assert security-reviewer
exit=2
```

**原因**: `gate_common::registry_load` は `python3` で agent 名を `print()` する。
Windows の Python はテキストモードで `\n` を `\r\n` に変換するため、出力が CRLF になる。

```
$ bash .specify/scripts/gate-common.sh registry-load | head -1 | xxd
00000000: 7265 7669 6577 6572 2d62 6173 650d 0a    reviewer-base..
                                          ^^^^ CR + LF
```

`registry_assert_agent` は `while IFS= read -r registered` で読むため CR が残り、
`[ "$registered" = "$name" ]` が全件不一致になる。

`.specify/.agents-registry.yaml` 自体は LF であり、ファイル側の問題ではない。
`PYTHONUTF8=1` は符号化のみを制御し、改行変換には効かない。

**影響範囲**:

| 呼び出し元 | 症状 |
|---|---|
| `/cl-code-gate` Phase 0 | `registry_assert_agent implementer / lint-agent / test-agent / convention-reviewer` が halt。**gate が起動できない** |
| `/cl-pr-gate` Phase 0 | `registry_assert_agent security-reviewer / architecture-reviewer / po-reviewer` が halt。同上 |
| `/cl-code-gate` Phase 2 | `registry_filter_agents` が `grep -Fxq` で照合するため全 reviewer が脱落。**halt せず静かに 0 件になる**（より危険） |
| `/cl-pr-gate` Phase 4 | 同上 |

command substitution 経由の subcommand（`slugify` / `cascade-enforce` / `truncate-subject` 等）は
MSYS2 bash が末尾 CRLF を除去するため実害がない。**行単位で読む `registry_load` だけが壊れる。**

#### 適用した修正

`.specify/scripts/gate-common.sh` の `gate_common::registry_load` 内の Python に 1 行追加し、
改行変換を抑止した。

```python
sys.stdout.reconfigure(newline="")
```

`tr -d` によるシェル側の除去ではなく Python 側で止めたのは、出所で直すほうが
他の消費経路にも効くためである。

#### 修正後の検証

```
registry-load 先頭行の末尾バイト : 0a（CRLF 解消）
registry-assert 実在 12 agent    : pass=12 fail=0
registry-assert charter-drafter  : exit=2（未配置を正しく拒否）
registry-assert bogus-agent      : exit=2（未登録を正しく拒否）
registry_filter_agents           : 実在 6 件を返し bogus-one のみ脱落
skill 同梱 bash テスト           : 5 passed / 0 failed
```

**残る懸念**: この修正は vendored copy（`.specify/scripts/`）への局所パッチであり、
`/spec-gate bootstrap` の再実行で巻き戻る。上流（`ukitomato/spec-driven-gating-workflow`）への
反映が本筋である。

---

## Phase 3: Gap Analysis

### 3.1 Constitution Principle ↔ Reviewer Coverage

| Principle | 要求する観点 | 担当 reviewer | 判定 |
|---|---|---|---|
| V（長期資格情報を永続化しない） | secrets | security-reviewer, database-reviewer | pass |
| VIII（日本語環境で破綻しない） | IME / レイアウト | ux-reviewer, a11y-reviewer | pass |
| X（正本はアプリ外） | キャッシュ整合 | architecture-reviewer, database-reviewer | pass |
| XI（垂直スライス） | 受け入れ条件 | po-reviewer | pass |
| XIII（element 優先） | 自作抑制 | convention-reviewer, ux-reviewer | pass |
| **XII（未表示情報を残さない）** | `docs/ui-coverage.md` の網羅 | **`ui-coverage-reviewer` 未配置** | **warning** |
| **I / II / III / VI / VII** | パス抽象・分岐封じ込め・capability・環境非干渉・supervisor 非依存 | **`platform-boundary-reviewer` 未配置** | **warning** |

いずれも PLAN.md §12 が「カスタム reviewer」として要求しているもので、bootstrap の
optional テンプレートには存在しない。`/cl-add-reviewer` で作成する必要がある。
特に `platform-boundary-reviewer` は **`WslRuntime` が F-001 に含まれるため早期から必要**
と PLAN.md が明記している。

### 3.2 Charter scope ↔ Constitution Principle

**評価不能** — `docs/domains/` が存在しない（Phase 1 fail）。

### 3.3 Glossary Usage

**評価不能** — `docs/glossary.md` が存在しない（Phase 1 fail）。
用語の一次素材は PLAN.md 付録A に 10 語（Closta / セッション / Provider / ランタイム /
capabilities / SessionLaunchConfig / Element / Tier A-C / HostPath / RuntimePath）。

### 3.4 Reverse spec confidence 分布

**N/A** — `specs/rev-*/` が存在しない（greenfield）。

### 3.5 NON-NEGOTIABLE Principle の existing_violations

`.specify/memory/constitution.draft.md` の NON-NEGOTIABLE 8 件について
`bad_pattern_grep` を実行した。

| Principle | 内容 | existing_violations | threshold | verdict |
|---|---|---|---|---|
| I | `node:path` 直 import | 0 | 0 | pass |
| II | `process.platform` が runtime 外 | 0 | 0 | pass |
| III | 権限モードと capability | (grep 不可、E2E 検証) | 0 | pass (未検証) |
| IV | stream-json 自前パース | 0 | 0 | pass |
| V | 秘密値カラム / ログ混入 | 0 | 0 | pass |
| VI | sudo / apt / wsl --import / docker build | 0 | 0 | pass |
| VII | supervisor の electron import | 0 | 0 | pass |
| VIII | IME ガード漏れ | (CI 未構築、検証不能) | 0 | pass (未検証) |
| **Total fail** | **0 Principle** | — | — | — |

**hard gate は通過**。ただし `src/` が存在しない greenfield であるため、
これは「違反がない」ではなく「検証対象が 0 行」である。最初の実装 feature（F-001）完了後に
再計測が必要。

**warning: Principle VI の検証条件に穴がある。**
`grep -rn "docker run" src/` はリテラル一致を前提とするが、AD-012 の `wsl:<distro>` endpoint では
コマンドが `['wsl.exe','-d',distro,'--','docker','run',...]` のような配列で構成されるため、
文字列 `docker run` が現れずに grep をすり抜ける。Constitution を active に昇格させる前に
検証条件を書き直すこと。

---

## Phase 4: Dev Ready

### 4.1 Build / Test / Lint コマンド

`docs/discovery.md` の 3 セクションが `detected: none` を報告している（greenfield のため想定内）。

| ツール | 要件 (PLAN.md §13.1) | 実測 | 判定 |
|---|---|---|---|
| Node.js | 24 (Active LTS) | v24.15.0 | pass |
| git | — | 2.54.0.windows.1 | pass |
| gh CLI | 2.90.0 以上 | 2.92.0 | pass |
| uv | 必要 | 0.11.13 | pass |
| **pnpm** | **必須** | **未インストール** | **warning** |
| python3 | （§13.1 に追記済） | 3.14.5 (uv), `PYTHONUTF8=1` 設定済 | pass |
| Git Bash | （§13.1 に追記済） | 2.54.0 同梱 | pass |

**pnpm が未インストール。** F-001 着手前に必要。

### 4.2 Lint dry-run

**skip** — lint 設定もソースも存在しない。

### 4.3 Entry point

`package.json` 不在 → **warning**（greenfield のため想定内。F-001 で作成される）。

### 4.4 `.specify/scripts/` の実行可能性

| スクリプト | 実行可能 | smoke |
|---|---|---|
| spec-resolve.sh | pass | — |
| status-transition.sh | pass | — |
| gate-common.sh | pass | `version` = 1 pass |

skill 同梱の bash テストは **5 passed / 0 failed**（`PYTHONUTF8=1` 設定下）。

### 4.5 Environment / secrets

- `.env.example` 不在 → warning（ソース未着手のため想定内）
- API キーの hardcode スキャン（`sk-[a-zA-Z0-9]{32,}`）: **0 件** → pass

### 4.5b Orchestration runtime

**N/A** — `Taskfile.yml` / `nx.json` / `turbo.json` / `lerna.json` いずれも不在。monorepo ではない。

### 4.6 Static file 404 check

**N/A** — 外部 service の redirect URL を含むコードが存在しない。

---

## Recommended actions

### 本 run で対応済

- [x] **`registry_load` の CRLF 混入を解消した。** `sys.stdout.reconfigure(newline="")` を
      `.specify/scripts/gate-common.sh` に追加。`/cl-code-gate` と `/cl-pr-gate` の Phase 0 が
      通るようになった。**bootstrap 再実行で巻き戻る点に注意**

### 最初の feature 着手前に必須

- [ ] `docs/domains/<name>/charter.md` を作成する
      （テンプレート: `.specify/templates/spec-gate/domain-charter-template.md`）。
      PLAN.md §10 の feature バックログから想定される domain 候補は
      `runtime` / `session` / `provider` / `ui` / `container`
- [ ] `docs/glossary.md` を作成する（一次素材: PLAN.md 付録A の 10 語）
- [ ] `pnpm` をインストールする
- [ ] Constitution を active に昇格させる。**その前に Principle VI の検証条件を
      `wsl.exe ... docker run` 形式にも当たるよう書き直すこと**

### bootstrap の積み残し

- [ ] `/cl-add-reviewer ui-coverage-reviewer` — Principle XII の機械検証担当
- [ ] `/cl-add-reviewer platform-boundary-reviewer` — Principle I / II / III / VI / VII 担当。
      `WslRuntime` が F-001 に含まれるため早期に必要
- [ ] `docs/discovery.md` を人間レビューし `status: active` に更新

### 上流（spec-gate skill）への報告候補

- [ ] `registry_load` が Windows で CRLF を出す（本 report Phase 2.5b）
- [ ] `truncate_subject` が日本語ロケール Windows で `…` を cp932 出力する
      （`PYTHONUTF8=1` で回避済、closta では `.claude/settings.json` に設定）
- [ ] `status-transition.sh:154` の `{{prefix}}` が未置換のまま
- [ ] `.agents-registry.yaml` テンプレートが bootstrap の配置内容より多く宣言しており、
      verify Phase 2.5 の「registered だが不在 → fail」と構造的に噛み合わない
