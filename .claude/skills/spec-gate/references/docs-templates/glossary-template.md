---
status: <draft | active>
last_updated: <ISO 8601>
generated_by: <human | /spec-gate.migrate Phase 5>
total_terms: <N>
---

# Glossary (Ubiquitous Language)

このプロジェクトで使用する **業務用語 / Domain 用語** の SSoT。すべての spec / code / UI / docs で本 glossary 記載の用語を一貫使用する (Constitution Principle "Ubiquitous Language" 参照)。

新規用語は本 file へ追記後、`architecture-reviewer` / `po-reviewer` が drift 検出する。

## Conventions

- **Term**: PascalCase (entity) / snake_case (attribute) — domain 固有規約があれば override
- **Domain**: 主に使われる domain を記載 (cross-domain なら "Cross-domain")
- **Synonyms / Aliases**: 過去 / 別文脈で使われた異形を併記 (新規 code では canonical 用語のみ使用)
- **Counterexamples**: 類似だが別概念のものを明示

## Terms

### A

#### **<Term>**

- **Definition**: <1-2 sentence>
- **Domain**: <domain or "Cross-domain">
- **Synonyms**: <別名があれば列挙、canonical でないものは "(deprecated)" マーク>
- **Used in**:
  - Code: `<path:line>`
  - Spec: `specs/<dir>/spec.md`
  - DB: `<table.column>`
- **Counterexamples**: <類似概念があれば>

### B

...

### C

...

(以下 alphabetical order)

## Detected synonyms (要統一)

集約途中で発見した同義異語。canonical を選定後、本 section を削除し上記 alphabetical に集約する。

| Concept | Terms (count) | Used in | Proposed canonical |
|---|---|---|---|
| <user account> | "user" (42), "member" (15), "account" (8) | <files> | "user" |
| ... |

## Detected language mixing

(多言語サポート project のみ)

| Concept | 日本語 (count) | English (count) | Used in | Policy |
|---|---|---|---|---|
| <user> | "ユーザー" (15) | "User" (42) | <files> | UI: ユーザー / Code: User |
| ... |

## Generic words excluded (default)

本 glossary に含めない汎用語 (Constitution / project 固有でない限り):

```
User, Manager, Service, Handler, Provider, Helper, Util, Tool, Component, Module
Item, List, Data, Info, Detail, Result, Response, Request, Config, Setting, Option
Type, Status, State, Mode, Kind, Flag, Value, Key, Name, Id, Code
```

(domain 固有意味で使われている場合は include 判断、AskUserQuestion で確認)
