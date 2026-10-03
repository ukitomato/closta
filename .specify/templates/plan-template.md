# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` v1.0.0 に基づくゲート。該当しない項目は「N/A: <理由>」と明記する。

**NON-NEGOTIABLE (違反は Critical。1 件でも残れば design-gate を通さない)**

- [ ] **I. パス操作は `domain` のパス API 経由** — 標準モジュール (`node:path` / `path`) を直接 import してよいのは実装ファイル 1 つ (`src/domain/runtime/path-api.ts`) だけ
- [ ] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 外に漏れる場合は**同じ行**に `platform-ok:` 注記
- [ ] **III. 権限モードは capability に従う** — `autoModeSafe !== true` で Auto / bypass を選ばせない (3 値。`=== false` では `unknown` が素通りする)
- [ ] **IV. 通信は Agent SDK 経由** — stream-json / JSONL の自前パースをしない
- [ ] **V. 長期資格情報を永続化しない** — 秘密は `safeStorage`、保持するのは参照キーのみ。ログに `env` を出さない
- [ ] **VI. 永続環境を構築・変更しない** — 使い捨てコンテナの起動・破棄のみ例外
- [ ] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — 推移的到達も禁止
- [ ] **VIII. 日本語環境で破綻しない** — IME 変換確定の Enter で送信しない

**Standard (違反は High / Medium。`Exceptions` 該当時は理由を Complexity Tracking に記載)**

- [ ] **IX. main process をブロックしない** — stream の逐次パースは supervisor 側
- [ ] **X. セッションの正本はアプリ外** — ストアはキャッシュ / インデックス
- [ ] **XI. 垂直スライス** — 観測可能な振る舞いが受け入れ条件に 1 つ以上ある
- [ ] **XII. 未表示情報を残さない** — 新しいメッセージ型・tool・ブロックの表示を足すなら `docs/ui-coverage.md` の行を同じ PR で直す。割当は `実装済み` / `後続: <未完了の feature ID>` / `表示不要` の 3 種類 (AD-044)。項目 21 が ok
- [ ] **XIII. assistant-ui の element と design system を優先** — 自作時は理由を PR に記載
- [ ] **XIV. Ubiquitous Language** — `docs/glossary.md` の canonical 用語を使う
- [ ] **XV. 多言語規約** — code は英語、UI / docs は日本語、commit は英語 1 行

**Domain charter の整合**

- [ ] 本 feature の domain が `docs/domains/<name>/charter.md` の In scope に収まっている
- [ ] Out of scope に踏み込んでいない（踏み込むなら charter の改定が先）

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
