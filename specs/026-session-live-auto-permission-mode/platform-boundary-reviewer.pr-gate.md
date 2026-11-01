# platform-boundary-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Reviewer**: platform-boundary-reviewer (pr-gate Round 1, system scope。`scripts/constitution/**` の変更で起動)
**Spec**: specs/026-session-live-auto-permission-mode/spec.md

## 初回読了 viewpoint

- FR/SC: FR-003, FR-004, FR-005/006, FR-007, FR-010, FR-012 / SC-002, SC-003
- charter / Confirmation: Constitution Principle III v1.6.0, AD-066 Decision 2 / 3 と Confirmation, isolation charter「権限モードのゲート」, session charter の Out of scope, AD-003, AD-024 #13
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer (IPC の `args[2] === true` は確認済み)
- C. 業務不変条件 / Charter drift: 該当なし: 判定を X-10 では session に暫定で置くことが isolation / session charter の両方に書かれ、実装の置き場所 (`src/domain/session/launch-config.ts:78`, `src/main/app/session-launch-service.ts:510`) と一致する
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0 (PB-7 の穴は D の H-001 にまとめた)
- G. optional reviewer 範囲: 該当なし: 範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

項目 16 の包みを `assertSafePermissionMode` から `assertSelectablePermissionMode` に替えた (`scripts/constitution/allowlists.mjs:674`)。`PERMISSION_MODE_ESCALATION_VALUES` は `auto` を含む 3 値のまま (`allowlists.mjs:665`)。rule fixture 1 本追加、4 本差し替え。

PB-4 (ゲート迂回): main の入口 3 つはいずれも `autoUnconfirmed` を通る (`session-launch-service.ts:575`, `:591`, `:655`)。IPC は `args[2] === true` だけを承諾 (`session-ipc.ts:203`, `:246`, `:414`)。LaunchDialog の `send` は `launch()` と `acceptAuto()` の 2 つだけで、`autoAckRuntimeId` はプリセット適用・ランタイム変更・権限モード変更で消える (`LaunchDialog.tsx:518`, `:520`, `:546`)。再開の初期値は `resumeInitialPermissionMode` が安全 3 値に戻す。

PB-2 / PB-3 / PB-1 / PB-5 / PB-6: 該当なし。

## Findings

### [High] `auto` を agents が自分で書く経路は実行時の assert で止まらなくなった。残る backstop の項目 16 のリテラル検査はテンプレートリテラルを見ない (H-001) (scope: feature)

- **観察**: 026 で包みが `assertSelectablePermissionMode` になり `auto` を通す (`src/domain/session/launch-config.ts:57-60`)。agents が `auto` を作らないことを担うのは AD-066 Decision 3 のとおり項目 16 のリテラル検査だけ。その検査 `scripts/constitution/check.mjs:919` は `'${value}'` と `"${value}"` しか見ず、バッククォートを照合しない (`scan.mjs:104-116` の `splitCode` は文字列の中身を code に残す)。`src/agents/` に ``q.setPermissionMode(assertSelectablePermissionMode(`auto`))`` を書くと、包みの検査 (`:942-947`, `:992-996`)・リテラル検査 (`:919`)・実行時 assert (`launch-config.ts:57`) をすべて素通りし、隔離の無いランタイムでも main の印なしで `auto` になる。さらに `tests/rule-fixtures/expected.mjs:938-942` の `UNDETECTED_NOTES['sdk-permission-mode-reflective'].mitigatedBy` は「`assertSelectablePermissionMode` の実行時 assert が load-bearing」と書き直されたが、`auto` については事実に合わない。定数の添字や連結で `auto` を組む形も未記録。
- **同種事象探索**: `PERMISSION_MODE_ESCALATION_VALUES` の照合は `check.mjs:918-919` の 1 件。rule-fixtures のテンプレートリテラルの昇格の値 0 件。「実行時 assert が load-bearing」は `expected.mjs:940` の 1 件。現時点の `src/agents/` にバッククォートの `auto` は 0 件 (実害は未成立)。
- **リスク/影響**: Principle III v1.6.0 と AD-066 Decision 3 の担保が、`auto` については 1 行で塞げる穴のある grep だけになっている。`acceptEdits` / `bypassPermissions` は今も実行時の assert で止まる。defense-in-depth の上限として High。
- **推奨アクション**: (1) `check.mjs:919` にバッククォートの形を足す。(2) `tests/rule-fixtures/b-equivalent/` に ``assertSelectablePermissionMode(`auto`)`` の fixture を足し `expected.mjs` に `rules: ['#16']` で登録。(3) `expected.mjs:938-942` の `mitigatedBy` を書き直し、データフローで `auto` を作る形を `UNDETECTED_NOTES` に `nextFeature: 'I-3'` で記録。
- **根拠**: Constitution Principle III v1.6.0 Statement / Verification、AD-066 Decision 3、FR-004、AD-024 #2
- **scope 根拠**: `scripts/constitution/check.mjs` と `tests/rule-fixtures/expected.mjs` は touched files

### [Medium] main の印の検査が消えたとき機械的に気づけるのは単体テストだけで、項目 16 との対応が記録されていない (M-001) (scope: feature)

- **観察**: `session-launch-service.ts:575` / `:591` / `:655` を守るのは `session-launch-service.test.ts` だけで、Constitution 検証にも rule fixture にも対応項目が無い。
- **同種事象探索**: `autoUnconfirmed\(` 3 件。`scripts/constitution` で `autoUnconfirmed|auto-mode-unconfirmed` 0 件。
- **推奨アクション**: `UNDETECTED_NOTES` に「main の印の検査は単体テストだけで守る」と記録し、I-3 に申し送る。
- **根拠**: Principle III Verification、AD-066 Confirmation

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `PERMISSION_MODE_ESCALATION_VALUES` の照合 (check.mjs) | 1 | scripts/constitution/check.mjs:919 |
| H-001 | rule-fixtures のテンプレートリテラルの昇格の値 | 0 | - |
| H-001 | UNDETECTED_NOTES の「実行時 assert が load-bearing」 | 1 | tests/rule-fixtures/expected.mjs:940 |
| M-001 | `autoUnconfirmed\(` (src) | 3 | src/main/app/session-launch-service.ts:575, :591, :655 |
| M-001 | `autoUnconfirmed\|auto-mode-unconfirmed` (scripts/constitution) | 0 | - |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 0
